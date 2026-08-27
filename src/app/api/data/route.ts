import { NextResponse } from 'next/server';
import { getAdmin, getMobileUser, getWebUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { createDraftInvoiceForOrder } from '@/lib/invoice';

const MIN_ORDER_VALUE = 2500;

// Best-effort Expo push (won't crash on error).
async function sendPushNotification(token: string | null | undefined, title: string, body: string) {
  if (!token) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, sound: 'default', title, body }),
    });
  } catch (err) {
    console.error('Push error:', err);
  }
}

// Populate order_items rows onto each order for the client.
async function attachItemsToOrders(orders: any[]) {
  if (orders.length === 0) return orders;
  const ids = orders.map(o => o.id);
  const sb = supabaseAdmin();
  const { data: items } = await sb
    .from('order_items')
    .select('*')
    .in('order_id', ids);
  const byOrder = new Map<string, any[]>();
  for (const it of items || []) {
    const arr = byOrder.get(it.order_id) || [];
    arr.push({
      id: it.product_id,
      name: it.product_name,
      packing: it.packing,
      hsn: it.hsn,
      gst_percent: it.gst_percent,
      mrp: it.mrp,
      mfr: it.mfr,
      batch_no: it.batch_no,
      expiry_date: it.expiry_date,
      quantity: it.quantity,
      free_quantity: it.free_quantity,
      price: Number(it.price_at_time),
    });
    byOrder.set(it.order_id, arr);
  }
  return orders.map(o => ({ ...o, items: byOrder.get(o.id) || [] }));
}

// ═══════════════════════════════════════════════════════════════════════════
// GET — read-side. Admin gets full dataset; mobile client gets own scoped data.
// ═══════════════════════════════════════════════════════════════════════════
export async function GET(request: Request) {
  const sb = supabaseAdmin();

  // Admin path (dashboard cookie)
  const admin = await getAdmin();
  if (admin) {
    // Products exceed the PostgREST 1000-row cap — page through in batches.
    async function fetchAllProducts() {
      const all: any[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await sb
          .from('products').select('*')
          .order('id', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data?.length) break;
        all.push(...data);
        if (data.length < pageSize) break;
      }
      return all;
    }

    const [usersRes, allProducts, ordersRes, schemesRes] = await Promise.all([
      sb.from('users').select('*').order('created_at', { ascending: false }),
      fetchAllProducts(),
      sb.from('orders').select('*').order('created_at', { ascending: false }),
      sb.from('schemes').select('*').order('created_at', { ascending: false }),
    ]);
    const productsRes = { data: allProducts, error: null };

    if (usersRes.error || productsRes.error || ordersRes.error || schemesRes.error) {
      const err = usersRes.error || productsRes.error || ordersRes.error || schemesRes.error;
      console.error('Admin GET error:', err);
      return NextResponse.json({ error: err?.message || 'Read failed' }, { status: 500 });
    }
    const orders = await attachItemsToOrders(ordersRes.data || []);
    return NextResponse.json({
      users: usersRes.data,
      products: productsRes.data,
      orders,
      schemes: schemesRes.data,
    });
  }

  // Customer path — accepts EITHER a mobile Bearer token OR a web cookie session.
  const user = (await getMobileUser(request)) || (await getWebUser());
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const today = new Date().toISOString().split('T')[0];
  async function fetchAllProducts() {
    const all: any[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await sb
        .from('products').select('*')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data?.length) break;
      all.push(...data);
      if (data.length < pageSize) break;
    }
    return all;
  }

  const [allProducts, ordersRes, schemesRes] = await Promise.all([
    fetchAllProducts(),
    sb.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    sb.from('schemes').select('*')
      .eq('is_active', true)
      .lte('start_date', today).gte('end_date', today),
  ]);
  const productsRes = { data: allProducts };

  const orders = await attachItemsToOrders(ordersRes.data || []);
  return NextResponse.json({
    users: [user],
    products: productsRes.data || [],
    orders,
    schemes: schemesRes.data || [],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// POST — mutation actions.
// ═══════════════════════════════════════════════════════════════════════════
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { collection, item, action } = body;
    const sb = supabaseAdmin();

    const admin = await getAdmin();
    // "mobileUser" identifies any authenticated customer regardless of channel:
    // native mobile app (Bearer token) OR web /shop (cookie). Kept the name to
    // minimize diff churn — semantically it's "current customer".
    const mobileUser = admin
      ? null
      : (await getMobileUser(request)) || (await getWebUser());
    const actor = admin || mobileUser;

    // ── Actions restricted to admin ─────────────────────────────────────────
    const adminOnly = new Set([
      'update_status', 'raw_override', 'add_product', 'update_stock',
      'update_product', 'delete_product', 'update_credit',
      'update_user_profile', 'block_user', 'unblock_user',
    ]);
    if (adminOnly.has(action) && !admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── orders.create (mobile places an order) ──────────────────────────────
    if (collection === 'orders' && action === 'create') {
      if (!mobileUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

      const orderItems: any[] = item.items || [];
      if (orderItems.length === 0) {
        return NextResponse.json({ error: 'Order must contain at least one item.' }, { status: 400 });
      }

      // Fetch all products in one round-trip.
      const ids = orderItems.map((i: any) => Number(i.id)).filter(Boolean);
      const { data: products } = await sb
        .from('products')
        .select('id, name, packing, hsn, gst_percent, mrp, company, price, price_ptr')
        .in('id', ids);
      const productMap = new Map((products || []).map(p => [p.id, p]));

      let subtotal = 0;
      const priced = [];
      for (const i of orderItems) {
        const p = productMap.get(Number(i.id));
        if (!p) continue;
        const unit = Number(p.price_ptr) || Number(p.price) || 0;
        const qty = Number(i.quantity) || 0;
        subtotal += unit * qty;
        priced.push({
          product_id: p.id,
          product_name: p.name,
          packing: p.packing,
          hsn: p.hsn,
          gst_percent: p.gst_percent,
          mrp: p.mrp,
          mfr: p.company,
          quantity: qty,
          price_at_time: unit,
        });
      }

      if (subtotal > 0 && subtotal < MIN_ORDER_VALUE) {
        return NextResponse.json(
          { error: `Minimum order value is ₹${MIN_ORDER_VALUE}.` }, { status: 400 }
        );
      }

      // Server-side scheme discount
      let discount = 0;
      let schemeCode: string | null = item.scheme_code || null;
      if (schemeCode) {
        const today = new Date().toISOString().split('T')[0];
        const { data: scheme } = await sb
          .from('schemes')
          .select('*')
          .eq('code', schemeCode)
          .eq('is_active', true)
          .lte('start_date', today).gte('end_date', today)
          .maybeSingle();
        if (!scheme) {
          schemeCode = null;
        } else if (scheme.min_order_value > 0 && subtotal < scheme.min_order_value) {
          schemeCode = null;
        } else if (scheme.per_user_limit > 0) {
          const { count: used } = await sb.from('orders').select('*', { head: true, count: 'exact' })
            .eq('user_id', mobileUser.id).eq('scheme_code', schemeCode);
          if ((used || 0) >= scheme.per_user_limit) {
            return NextResponse.json(
              { error: `Coupon usage limit reached (${scheme.per_user_limit} max).` }, { status: 400 }
            );
          }
          if (scheme.scheme_type === 'Discount' && scheme.discount_percent) {
            discount = (subtotal * scheme.discount_percent) / 100;
            if (scheme.max_discount) discount = Math.min(discount, scheme.max_discount);
          } else if (scheme.scheme_type === 'Flat' && scheme.flat_discount) {
            discount = Math.min(scheme.flat_discount, subtotal);
          }
        }
      }

      const taxable = subtotal - discount;
      const gst = Math.round(taxable * 0.12 * 100) / 100;
      const total = Math.round((taxable + gst) * 100) / 100;

      // Insert order
      const { error: orderErr } = await sb.from('orders').insert({
        id: item.id,
        user_id: mobileUser.id,
        user_phone: mobileUser.phone,
        store_name: mobileUser.store_name || 'Partner',
        status: 'Invoicing',
        subtotal,
        discount_value: discount,
        gst,
        total,
        scheme_code: schemeCode,
        date: item.date || new Date().toLocaleDateString('en-GB'),
      });
      if (orderErr) {
        return NextResponse.json({ error: orderErr.message }, { status: 400 });
      }

      // Insert order_items
      const { error: itemsErr } = await sb.from('order_items').insert(
        priced.map(p => ({ ...p, order_id: item.id }))
      );
      if (itemsErr) {
        // rollback: delete the order we just created
        await sb.from('orders').delete().eq('id', item.id);
        return NextResponse.json({ error: itemsErr.message }, { status: 400 });
      }

      // Update user credit balance
      await sb.from('users')
        .update({ credit_balance: Number(mobileUser['credit_balance'] || 0) + total })
        .eq('id', mobileUser.id);

      // Snapshot buyer info onto the invoice (so old invoices stay stable if
      // the pharmacy later edits their address/GST).
      const { data: fullBuyer } = await sb.from('users')
        .select('store_name, phone, address, city, drug_license, gst_number')
        .eq('id', mobileUser.id).maybeSingle();

      // Auto-create the Draft invoice with an atomic UPD number.
      try {
        await createDraftInvoiceForOrder(sb, {
          order_id: item.id,
          user_id: mobileUser.id,
          buyer: {
            store_name: fullBuyer?.store_name || mobileUser.store_name || 'Partner',
            phone: fullBuyer?.phone || mobileUser.phone,
            address: fullBuyer?.address ?? null,
            city: fullBuyer?.city ?? null,
            drug_license: fullBuyer?.drug_license ?? null,
            gst_number: fullBuyer?.gst_number ?? null,
          },
          subtotal,
          discount,
        });
      } catch (e: any) {
        console.error('Draft invoice create failed:', e.message);
        // Order stays; admin can regenerate the invoice manually.
      }

      // Increment scheme usage (fetch-then-update; race-tolerant for MVP scale)
      if (schemeCode) {
        const { data: s } = await sb.from('schemes').select('times_used').eq('code', schemeCode).maybeSingle();
        await sb.from('schemes')
          .update({ times_used: (s?.times_used ?? 0) + 1 })
          .eq('code', schemeCode);
      }

      // Notify admins in real-time
      await sb.from('notifications').insert({
        for_admin: true,
        type: 'order_placed',
        title: 'New order placed',
        body: `${mobileUser.store_name} placed order ${item.id} for ₹${total}`,
        meta: { order_id: item.id, user_id: mobileUser.id, amount: total },
      });

      return NextResponse.json({ success: true });
    }

    // ── orders.update_status (admin) ────────────────────────────────────────
    if (collection === 'orders' && action === 'update_status') {
      const { data: order } = await sb.from('orders').select('*').eq('id', item.id).maybeSingle();
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

      // Forward-only lifecycle: Invoicing → Packaging → Dispatch (terminal).
      // Rejection allowed only from Invoicing or Packaging. Dispatch and
      // Rejected are terminal — nothing further.
      const stageOf = (s: string) =>
        /reject/i.test(s) ? 'Rejected'
        : /ship|dispatch/i.test(s) ? 'Dispatch'
        : /pack/i.test(s) ? 'Packaging'
        : 'Invoicing';
      const current = stageOf(order.status);
      const target  = stageOf(item.status);
      const allowedFrom: Record<string, string[]> = {
        Invoicing: ['Packaging', 'Rejected'],
        Packaging: ['Dispatch', 'Rejected'],
        Dispatch:  [],
        Rejected:  [],
      };
      if (!allowedFrom[current]?.includes(target)) {
        return NextResponse.json({
          error: `Cannot move order from ${current} to ${target}. Lifecycle is forward-only.`,
        }, { status: 400 });
      }

      const patch: any = { status: item.status };
      if (item.courier_name) patch.courier_name = item.courier_name;
      if (item.tracking_id) patch.tracking_id = item.tracking_id;

      const { error } = await sb.from('orders').update(patch).eq('id', item.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      // Push notification to owner
      const { data: ownerRow } = await sb.from('users').select('expo_push_token').eq('id', order.user_id).maybeSingle();
      const title = item.status === 'Dispatch' ? 'Order dispatched'
        : item.status === 'Packaging' ? 'Order being packed'
        : item.status === 'Rejected' ? 'Order rejected'
        : 'Order update';
      const bodyMsg = `Your order ${item.id} is now ${item.status}`;
      await sendPushNotification(ownerRow?.expo_push_token, title, bodyMsg);

      // In-app notification
      await sb.from('notifications').insert({
        user_id: order.user_id,
        for_admin: false,
        type: item.status === 'Dispatch' ? 'order_dispatched'
          : item.status === 'Packaging' ? 'order_packaged'
          : item.status === 'Rejected' ? 'order_rejected'
          : 'order_updated',
        title,
        body: bodyMsg,
        meta: { order_id: item.id, ...(item.courier_name ? { courier: item.courier_name, tracking: item.tracking_id } : {}) },
      });

      return NextResponse.json({ success: true });
    }

    // ── raw_override — used by admin panel for approve toggle ───────────────
    if (action === 'raw_override' && admin && body.db?.users) {
      for (const u of body.db.users) {
        await sb.from('users').update({ is_approved: !!u.is_approved }).eq('phone', u.phone);
      }
      return NextResponse.json({ success: true });
    }

    // ── add_product ─────────────────────────────────────────────────────────
    if (action === 'add_product' && admin) {
      const { error } = await sb.from('products').insert({
        name: item.name,
        company: item.company,
        category: item.category,
        body_system: item.body_system || 'General',
        price: item.price,
        stock: item.stock,
        image_url: item.image_url || null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // ── update_stock ────────────────────────────────────────────────────────
    if (action === 'update_stock' && admin) {
      const { productId, changeAmount } = body;
      const { data: p } = await sb.from('products').select('stock').eq('id', productId).maybeSingle();
      const newStock = Math.max(0, (p?.stock ?? 0) + Number(changeAmount || 0));
      const { error } = await sb.from('products').update({ stock: newStock }).eq('id', productId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // ── update_address (self OR admin on any) ──────────────────────────────
    if (action === 'update_address') {
      const targetId = admin ? null : mobileUser?.id;
      const targetPhone = admin ? body.phone : null;
      let updater = sb.from('users').update({ address: body.address });
      updater = targetId ? updater.eq('id', targetId) : updater.eq('phone', targetPhone!);
      const { error } = await updater;
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // ── update_own_profile — customer edits their own free-edit fields ──
    // Only email/address/city/zone are allowed here. Identity fields (GST,
    // drug_license, store_name, user_type) must go through
    // /api/profile-change-requests for admin approval.
    if (action === 'update_own_profile' && mobileUser) {
      const patch: any = {};
      for (const k of ['email', 'address', 'city', 'zone']) {
        if (body[k] !== undefined) patch[k] = body[k] || null;
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
      }
      const { error } = await sb.from('users').update(patch).eq('id', mobileUser.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // ── update_credit ───────────────────────────────────────────────────────
    if (action === 'update_credit' && admin) {
      const { phone, credit_limit, credit_balance } = body;
      if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });
      const patch: any = {};
      if (credit_limit !== undefined && credit_limit !== null) patch.credit_limit = credit_limit;
      if (credit_balance !== undefined && credit_balance !== null) patch.credit_balance = credit_balance;
      const { error } = await sb.from('users').update(patch).eq('phone', phone);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // ── update_product ──────────────────────────────────────────────────────
    if (action === 'update_product' && admin) {
      if (!item.id) return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
      const patch: any = {};
      for (const k of ['name','company','category','packing','price','price_ptr','mrp','stock','description','composition','images','short_expiry','discount_percent','expiry_date','hsn','gst_percent']) {
        if (item[k] !== undefined) patch[k] = item[k];
      }
      const { error } = await sb.from('products').update(patch).eq('id', item.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // ── delete_product ──────────────────────────────────────────────────────
    if (action === 'delete_product' && admin) {
      const { error } = await sb.from('products').delete().eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // ── update_user_profile (admin edits partner details) ───────────────────
    if (action === 'update_user_profile' && admin) {
      const { phone } = body;
      if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });
      const patch: any = {};
      for (const k of ['store_name','drug_license','gst_number','registration_number','address','email','user_type','zone','city']) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      const { error } = await sb.from('users').update(patch).eq('phone', phone);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // ── block_user / unblock_user ───────────────────────────────────────────
    if ((action === 'block_user' || action === 'unblock_user') && admin) {
      const { phone, reason } = body;
      if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });
      if (phone === admin.phone) {
        return NextResponse.json({ error: 'You cannot block your own admin account.' }, { status: 400 });
      }
      const { data: target } = await sb.from('users').select('id, role').eq('phone', phone).maybeSingle();
      if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      if (target.role === 'admin') {
        return NextResponse.json({ error: 'Admin accounts cannot be blocked.' }, { status: 400 });
      }

      if (action === 'block_user') {
        await sb.from('users').update({ is_blocked: true, blocked_reason: reason || null }).eq('phone', phone);
        // Revoke all Supabase Auth sessions immediately.
        await sb.auth.admin.signOut(target.id, 'global').catch(() => {});
      } else {
        await sb.from('users').update({ is_blocked: false, blocked_reason: null }).eq('phone', phone);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('DB Write Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to save' }, { status: 500 });
  }
}
