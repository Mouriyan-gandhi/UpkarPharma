import { NextResponse } from 'next/server';

// Legacy invoice route — the new server-side GST invoice system is being built
// against the Supabase `invoices` table (with proper UPD numbering, buyer
// snapshot, admin approval flow, etc.). Endpoints will live under /api/invoices/*.
// TODO: implement /api/invoices/[orderId] and /api/invoices/[orderId]/html.
export async function GET() {
  return NextResponse.json(
    { error: 'Invoice endpoint is being rebuilt. Use the new Supabase invoice system (coming next).' },
    { status: 410 }
  );
}
