import { NextResponse } from 'next/server';
import { getAnyAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import * as XLSX from 'xlsx';

// GET /api/admin/stock-bulk/template
//
// Generates an Excel workbook seeded with every current product (id, name,
// current stock) so the admin can edit stock values inline and upload back
// without hunting for SKU ids. This closes the loop on "give me a template"
// without hardcoding the SKU list into the mobile bundle.
export async function GET(request: Request) {
  const admin = await getAnyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sb = supabaseAdmin();
  const all: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('products')
      .select('id, name, category, body_system, stock')
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) break;
    all.push(...data);
    if (data.length < 1000) break;
  }

  const rows = [
    ['id', 'name', 'category', 'sub_category', 'stock'],
    ...all.map((p) => [p.id, p.name, p.category || '', p.body_system || '', p.stock ?? 0]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Column widths so the sheet is readable when opened in Excel.
  ws['!cols'] = [{ wch: 6 }, { wch: 40 }, { wch: 14 }, { wch: 20 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  const filename = `upkem-stock-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
