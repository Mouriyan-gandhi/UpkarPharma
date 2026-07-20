import { NextResponse } from 'next/server';
import db from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get('id');

  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }

  try {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const items = db.prepare(`
      SELECT oi.*, p.name, p.company, p.category, p.hsn, p.gst_percent, p.packing
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `).all(orderId) as any[];

    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(order.user_phone) as any || {
      store_name: order.store_name,
      phone: order.user_phone,
      address: 'Registered Pharmacy',
      gst_number: '33AAAAA0000A1Z5',
      drug_license: 'DL-2026-TN-98765'
    };

    // Calculate Tax Subtotals
    let subtotal = 0;
    const itemRows = items.map((item: any, idx: number) => {
      const lineTotal = item.quantity * item.price_at_time;
      subtotal += lineTotal;
      const gstAmount = (lineTotal * (item.gst_percent || 5)) / 100;
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; font-size: 12px; text-align: center;">${idx + 1}</td>
          <td style="padding: 10px; font-size: 12px; font-weight: 600;">
            ${item.name}
            <span style="display: block; font-size: 10px; color: #64748b; font-weight: normal;">${item.company} | ${item.packing || ''}</span>
          </td>
          <td style="padding: 10px; font-size: 12px; font-family: monospace;">${item.hsn || '30049099'}</td>
          <td style="padding: 10px; font-size: 12px; text-align: center;">${item.quantity}</td>
          <td style="padding: 10px; font-size: 12px; text-align: right; font-family: monospace;">₹${item.price_at_time.toFixed(2)}</td>
          <td style="padding: 10px; font-size: 12px; text-align: center;">${item.gst_percent || 5}%</td>
          <td style="padding: 10px; font-size: 12px; text-align: right; font-weight: 700; font-family: monospace;">₹${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const gstTotal = (subtotal * 0.05); // Standard 5% GST
    const grandTotal = subtotal + gstTotal;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Tax Invoice - ${order.id}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 40px; background: #fff; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
          .subtitle { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 4px; }
          .badge { background: #059669; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
          .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; font-size: 12px; }
          .box-title { font-weight: 800; text-transform: uppercase; font-size: 10px; color: #64748b; margin-bottom: 8px; letter-spacing: 0.5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { background: #0f172a; color: #fff; font-size: 11px; text-transform: uppercase; padding: 10px; text-align: left; }
          .totals { display: flex; justify-content: flex-end; margin-bottom: 30px; }
          .totals-table { width: 300px; font-size: 12px; }
          .totals-table td { padding: 6px 10px; }
          .footer { border-top: 1px solid #e2e8f0; pt: 20px; text-align: center; font-size: 11px; color: #64748b; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div className="no-print" style="margin-bottom: 20px; text-align: right;">
          <button onclick="window.print()" style="background: #0f172a; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">Print / Save as PDF</button>
        </div>

        <div className="header">
          <div>
            <div className="title">UPKEM PHARMA DISTRIBUTORS</div>
            <div className="subtitle">Wholesale Drug License: DL-2026-CHE-10492 | GSTIN: 33AAACU1234F1Z9</div>
            <div style="font-size: 11px; color: #475569; margin-top: 4px;">No. 47, Ground Floor, 1st Street, Vaidynatha Mudali Street, Sowcarpet, Chennai - 600079</div>
          </div>
          <div style="text-align: right;">
            <span className="badge">OFFICIAL GST INVOICE</span>
            <div style="font-size: 16px; font-weight: 800; margin-top: 8px; font-family: monospace;">INVOICE #${order.id}</div>
            <div style="font-size: 11px; color: #64748b;">Date: ${order.date || new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <div className="grid">
          <div className="box">
            <div className="box-title">Billed To (Retail Pharmacy)</div>
            <div style="font-size: 14px; font-weight: 800; color: #0f172a;">${user.store_name || order.store_name}</div>
            <div>Phone: <strong>${user.phone || order.user_phone}</strong></div>
            <div>Address: ${user.address || 'Registered Business Address'}</div>
            <div>GSTIN: <strong>${user.gst_number || '33AAAAA0000A1Z5'}</strong></div>
            <div>Drug License: <strong>${user.drug_license || 'DL-2026-TN-98765'}</strong></div>
          </div>

          <div className="box">
            <div className="box-title">Order & Credit Terms</div>
            <div>Order Status: <strong style="color: #059669;">${order.status}</strong></div>
            <div>Payment Mode: <strong>60-Day Credit Line</strong></div>
            <div>Payment Due Date: <strong>60 Days from Invoice Date</strong></div>
            <div>Courier / Dispatch: <strong>${order.courier_name || 'Upkar Logistics'}</strong></div>
            <div>Tracking AWB: <strong>${order.tracking_id || 'UPK-' + order.id}</strong></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align: center;">#</th>
              <th>Product Name & Manufacturer</th>
              <th>HSN</th>
              <th style="text-align: center;">Qty</th>
              <th style="text-align: right;">Unit Rate</th>
              <th style="text-align: center;">GST %</th>
              <th style="text-align: right;">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <div className="totals">
          <table className="totals-table">
            <tr>
              <td>Subtotal (Taxable):</td>
              <td style="text-align: right; font-weight: 600; font-family: monospace;">₹${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td>GST (5% Combined):</td>
              <td style="text-align: right; font-weight: 600; font-family: monospace;">₹${gstTotal.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #0f172a; font-size: 14px; font-weight: 900;">
              <td>Grand Total:</td>
              <td style="text-align: right; font-family: monospace; color: #059669;">₹${grandTotal.toFixed(2)}</td>
            </tr>
          </table>
        </div>

        <div className="footer">
          <p>Thank you for your business! This is a computer-generated GST Tax Invoice.</p>
          <p>For support or credit inquiries, contact Upkar Pharma Billing: <strong>+91 6383945610</strong></p>
        </div>
      </body>
      </html>
    `;

    return new Response(htmlContent, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invoice generation error' }, { status: 500 });
  }
}
