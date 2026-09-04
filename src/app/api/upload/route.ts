import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import crypto from 'node:crypto';
import { getAnyAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';

function normalizeKey(key: string): string {
  if (!key) return '';
  return key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const columnMap: Record<string, string[]> = {
  name: ['product', 'item', 'drugname', 'name', 'productname'],
  company: ['company', 'mfr', 'manufacturer', 'brand', 'division'],
  packing: ['pack', 'packing', 'size'],
  price_ptr: ['ptr', 'rate', 'priceptr', 'price', 'nrv'],
  mrp: ['mrp', 'maxretailprice'],
  category: ['category', 'type', 'group'],
  stock: ['stock', 'qty', 'quantity', 'available'],
  description: ['description', 'details', 'info'],
  composition: ['composition', 'salt', 'formula', 'ingredients'],
  image_url: ['image', 'photo', 'picture', 'imageurl', 'url'],
  hsn: ['hsn', 'hsncode'],
  gst_percent: ['gst', 'gstpercent', 'gsttax'],
};

function identifyColumns(headerRow: any[]) {
  const mapping: Record<string, number> = {};
  headerRow.forEach((colName, index) => {
    const normalized = normalizeKey(colName);
    for (const [standardKey, possibleNames] of Object.entries(columnMap)) {
      if (possibleNames.includes(normalized) && mapping[standardKey] === undefined) {
        mapping[standardKey] = index;
        break;
      }
    }
  });
  return mapping;
}

const categoryMapping: Record<string, string> = {
  'telmisartan': 'Heart', 'metformin': 'Diabetes', 'glimepiride': 'Diabetes',
  'amlodipine': 'Heart', 'atorvastatin': 'Heart', 'rosuvastatin': 'Heart',
  'paracetamol': 'General', 'amoxicillin': 'Antibiotic', 'azithromycin': 'Antibiotic',
  'pantoprazole': 'Gastro', 'rabeprazole': 'Gastro',
  'cetirizine': 'Allergy', 'levocetirizine': 'Allergy',
};

function autoCategorize(name: string): string {
  if (!name) return 'General';
  const lowerName = name.toLowerCase();
  for (const [key, category] of Object.entries(categoryMapping)) {
    if (lowerName.includes(key)) return category;
  }
  return 'General';
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;   // 10 MB — big enough for a full product catalog Excel
const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',   // .xlsx
  'application/vnd.ms-excel',                                             // .xls
  'text/csv',                                                             // .csv (rare, but xlsx lib handles it)
  'application/octet-stream',                                             // some browsers report this — allow but still enforce size
]);

export async function POST(request: Request) {
  try {
    if (!(await getAnyAdmin(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    if (!file || !type) return NextResponse.json({ error: 'File and type are required' }, { status: 400 });

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. Max ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
        { status: 413 },
      );
    }
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type "${file.type}". Upload an Excel or CSV file.` },
        { status: 415 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length === 0) return NextResponse.json({ error: 'Excel file is empty' }, { status: 400 });

    const sb = supabaseAdmin();
    let added = 0;

    if (type === 'products') {
      // Detect header row
      let headerRowIndex = 0;
      let bestMapping: Record<string, number> = {};
      let maxMatches = 0;
      for (let i = 0; i < Math.min(20, rawData.length); i++) {
        const row = rawData[i] as any[];
        if (!row || row.length === 0) continue;
        const mapping = identifyColumns(row);
        const matchCount = Object.keys(mapping).length;
        if (matchCount > maxMatches) {
          maxMatches = matchCount;
          bestMapping = mapping;
          headerRowIndex = i;
        }
      }
      if (maxMatches < 2 || bestMapping['name'] === undefined) {
        return NextResponse.json({ error: 'Could not detect product names in Excel headers.' }, { status: 400 });
      }

      const productsMap = new Map<string, any>();
      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i] as any[];
        if (!row || row.length === 0) continue;
        const name = row[bestMapping['name']];
        if (!name || typeof name !== 'string' || name.trim() === '') continue;

        const ptr = parseFloat(row[bestMapping['price_ptr']]) || 0;
        const mrp = parseFloat(row[bestMapping['mrp']]) || 0;
        const company = row[bestMapping['company']] || 'Unknown';
        const packing = row[bestMapping['packing']] || '';
        const category = row[bestMapping['category']] || autoCategorize(name);
        const stock = parseInt(row[bestMapping['stock']]) || 100;
        const hsn = row[bestMapping['hsn']] || null;
        const gst = parseFloat(row[bestMapping['gst_percent']]) || null;

        const cleanName = name.trim();
        const key = cleanName.toLowerCase();
        if (productsMap.has(key)) {
          const existing = productsMap.get(key);
          if (ptr > 0 && (existing.price_ptr === 0 || ptr < existing.price_ptr)) {
            existing.price_ptr = ptr;
            existing.mrp = Math.max(existing.mrp || 0, mrp);
          }
        } else {
          productsMap.set(key, {
            name: cleanName, company, category, body_system: category,
            price_ptr: ptr, mrp, packing, stock,
            price: ptr, hsn, gst_percent: gst,
          });
        }
      }

      const productsToInsert = Array.from(productsMap.values());
      // Bulk insert in batches of 500
      for (let i = 0; i < productsToInsert.length; i += 500) {
        const batch = productsToInsert.slice(i, i + 500);
        const { error } = await sb.from('products').insert(batch);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        added += batch.length;
      }
    } else if (type === 'users') {
      // Bulk users import — creates auth.users via admin API + profile via trigger.
      // Each user gets a fresh random one-time password. The `credentials`
      // array is returned to the admin so they can distribute securely
      // (WhatsApp/email); the admin should treat this response as sensitive
      // and hand each password over via a private channel.
      const data = XLSX.utils.sheet_to_json(sheet) as any[];
      const credentials: Array<{ phone: string; store_name: string; password: string }> = [];
      // Fetch once — listUsers is expensive.
      const { data: existing } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existingPhones = new Set(existing?.users.map(u => u.phone).filter(Boolean));

      for (const item of data) {
        const rawPhone = item.phone ? String(item.phone) : null;
        if (!rawPhone) continue;
        const phoneE164 = '+' + (rawPhone.startsWith('91') ? rawPhone : '91' + rawPhone);
        const phoneDigits = phoneE164.replace(/^\+/, '');

        if (existingPhones.has(phoneDigits)) continue;

        const tempPassword = crypto.randomBytes(9).toString('base64url');
        const { data: created, error: createErr } = await sb.auth.admin.createUser({
          phone: phoneE164,
          phone_confirm: true,
          password: tempPassword,
          user_metadata: { store_name: item.store_name || 'Unknown Store' },
        });
        if (createErr || !created?.user) continue;

        await sb.from('users').update({
          store_name: item.store_name || 'Unknown Store',
          is_approved: String(item.is_approved).toLowerCase() === 'true',
          credit_balance: Number(item.credit_balance) || 0,
          credit_limit: Number(item.credit_limit) || 0,
          role: item.role || 'client',
        }).eq('id', created.user.id);

        credentials.push({
          phone: phoneDigits,
          store_name: item.store_name || 'Unknown Store',
          password: tempPassword,
        });
        added++;
      }

      return NextResponse.json({
        success: true,
        added,
        credentials,
        notice:
          'Each imported user has a one-time random password above. Distribute securely to each user; the passwords are not stored anywhere else.',
      });
    } else {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 });
    }

    return NextResponse.json({ success: true, added });
  } catch (err: any) {
    console.error('Upload Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to process Excel upload' }, { status: 500 });
  }
}
