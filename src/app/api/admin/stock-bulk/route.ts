import { NextResponse } from 'next/server';
import { getAnyAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import * as XLSX from 'xlsx';

// POST /api/admin/stock-bulk
//   Multipart form-data: file=<.xlsx or .csv>, commit=true|false
//
// Preview mode (commit=false, the default):
//   Parse the sheet, match rows to existing products (by id, then by exact
//   name), and return a diff-preview response WITHOUT touching the DB.
//   The admin UI shows this preview and requires an explicit "Apply" tap.
//
// Commit mode (commit=true):
//   Same match, but writes the new stock values in a single UPDATE-per-row
//   loop wrapped in a Promise.all. Realtime broadcasts on products push the
//   changes to every admin device instantly.
//
// Accepted column headers (case-insensitive, whitespace-trimmed):
//   id / product_id / sku       — matches by numeric id first (strongest key)
//   name / product / product_name — case-insensitive exact match fallback
//   stock / quantity / qty / units — new stock value (integer >= 0)
//
// Rows missing both id and name are counted as "skipped_no_key".
// Rows where id+name resolve to no product become "unmatched".
// Rows where the new value equals current stock become "unchanged".
// Rows where new value < 0 or non-integer become "invalid".

const MAX_BYTES = 5 * 1024 * 1024;
type Row = { rowIndex: number; id?: number; name?: string; stock: number };
type MatchResult = {
  matched: Array<{ rowIndex: number; product_id: number; product_name: string; old_stock: number; new_stock: number }>;
  unchanged: Array<{ rowIndex: number; product_id: number; product_name: string; stock: number }>;
  unmatched: Array<{ rowIndex: number; id?: number; name?: string; stock: number }>;
  invalid: Array<{ rowIndex: number; reason: string }>;
  skipped_no_key: number;
};

function normalizeHeader(h: string): string {
  return String(h || '').toLowerCase().replace(/[\s_-]+/g, '');
}

function pickColumns(headerRow: string[]) {
  const norm = headerRow.map(normalizeHeader);
  const findAny = (candidates: string[]) => {
    for (const c of candidates) {
      const i = norm.indexOf(c);
      if (i !== -1) return i;
    }
    return -1;
  };
  return {
    idCol: findAny(['id', 'productid', 'sku']),
    nameCol: findAny(['name', 'product', 'productname', 'sku_name']),
    stockCol: findAny(['stock', 'quantity', 'qty', 'units', 'availablestock', 'currentstock']),
  };
}

export async function POST(request: Request) {
  const gate = checkRateLimit(request, 'stock-bulk', { max: 20, windowMs: 60_000 });
  if (!gate.ok) {
    return NextResponse.json({ error: 'Too many uploads. Wait a minute.' }, { status: 429 });
  }

  const admin = await getAnyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const commit = String(form?.get('commit') || '').toLowerCase() === 'true';
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required (multipart form-data)' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File too large. Max ${MAX_BYTES / 1024 / 1024} MB.` }, { status: 413 });
  }

  // Parse the sheet. Accepts .xlsx / .xls / .csv — xlsx handles all three.
  const buf = Buffer.from(await file.arrayBuffer());
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: 'buffer' });
  } catch {
    return NextResponse.json({ error: 'Could not parse the file — is it a valid Excel/CSV?' }, { status: 400 });
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return NextResponse.json({ error: 'Empty workbook' }, { status: 400 });
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  if (rows.length < 2) return NextResponse.json({ error: 'Sheet has no data rows' }, { status: 400 });

  const headerRow = rows[0].map((c: any) => String(c ?? ''));
  const { idCol, nameCol, stockCol } = pickColumns(headerRow);
  if (stockCol === -1) {
    return NextResponse.json({
      error: `No stock column found. Include a column named one of: stock / quantity / qty / units. Got headers: ${headerRow.join(', ')}`,
    }, { status: 400 });
  }
  if (idCol === -1 && nameCol === -1) {
    return NextResponse.json({
      error: `Need at least an "id" or "name" column to match products. Got headers: ${headerRow.join(', ')}`,
    }, { status: 400 });
  }

  // Prefetch products once (mobile/pilot scale is ≤ a few thousand rows, and
  // pagination through the 1000-row cap keeps this cheap).
  const sb = supabaseAdmin();
  async function fetchAllProducts() {
    const all: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from('products')
        .select('id, name, stock').order('id', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      if (!data?.length) break;
      all.push(...data);
      if (data.length < 1000) break;
    }
    return all;
  }
  let products;
  try { products = await fetchAllProducts(); }
  catch (err: any) { return NextResponse.json({ error: err.message }, { status: 500 }); }

  const byId = new Map(products.map((p: any) => [p.id, p]));
  const byName = new Map(products.map((p: any) => [String(p.name || '').trim().toLowerCase(), p]));

  const result: MatchResult = { matched: [], unchanged: [], unmatched: [], invalid: [], skipped_no_key: 0 };

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rawId = idCol !== -1 ? row[idCol] : '';
    const rawName = nameCol !== -1 ? row[nameCol] : '';
    const rawStock = row[stockCol];

    const id = (typeof rawId === 'number' ? rawId : parseInt(String(rawId).trim(), 10));
    const name = String(rawName || '').trim();
    const stock = (typeof rawStock === 'number' ? rawStock : parseInt(String(rawStock).trim(), 10));

    if (!Number.isFinite(id) && !name) { result.skipped_no_key++; continue; }
    if (!Number.isFinite(stock) || stock < 0) {
      result.invalid.push({ rowIndex: r + 1, reason: `Bad stock value "${rawStock}"` });
      continue;
    }

    let product: any = null;
    if (Number.isFinite(id) && byId.has(id)) product = byId.get(id);
    else if (name) product = byName.get(name.toLowerCase());
    if (!product) {
      result.unmatched.push({ rowIndex: r + 1, id: Number.isFinite(id) ? id : undefined, name: name || undefined, stock });
      continue;
    }
    if ((product.stock ?? 0) === stock) {
      result.unchanged.push({ rowIndex: r + 1, product_id: product.id, product_name: product.name, stock });
      continue;
    }
    result.matched.push({
      rowIndex: r + 1,
      product_id: product.id,
      product_name: product.name,
      old_stock: product.stock ?? 0,
      new_stock: stock,
    });
  }

  // Preview response.
  if (!commit) {
    return NextResponse.json({
      preview: true,
      summary: {
        totalRows: rows.length - 1,
        will_update: result.matched.length,
        unchanged: result.unchanged.length,
        unmatched: result.unmatched.length,
        invalid: result.invalid.length,
        skipped_no_key: result.skipped_no_key,
      },
      matched: result.matched.slice(0, 500),   // cap large lists in JSON
      unmatched: result.unmatched.slice(0, 200),
      invalid: result.invalid.slice(0, 100),
    });
  }

  // Commit mode — apply the update rows.
  const updates = result.matched.map((m) =>
    sb.from('products').update({ stock: m.new_stock }).eq('id', m.product_id),
  );
  const settled = await Promise.allSettled(updates);
  const failed = settled.filter((s) => s.status === 'rejected').length;

  return NextResponse.json({
    committed: true,
    summary: {
      updated: result.matched.length - failed,
      failed,
      unchanged: result.unchanged.length,
      unmatched: result.unmatched.length,
      invalid: result.invalid.length,
    },
  });
}
