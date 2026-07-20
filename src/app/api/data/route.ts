import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAdmin, getSessionUser } from '@/lib/auth';

const MIN_ORDER_VALUE = 2500;

// Strip sensitive fields before returning a user record to a mobile client.
function sanitizeUser(u: any) {
  if (!u) return u;
  const { password_hash, ...safe } = u;
  return safe;
}

function populateOrders(orders: any[]) {
  return orders.map((order: any) => {
    const items = db.prepare(`
      SELECT oi.*, p.name, p.company, p.category
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `).all(order.id);

    const formattedItems = items.map((item: any) => ({
      id: item.product_id,
      name: item.name,
      company: item.company,
      category: item.category,
      quantity: item.quantity,
      price: item.price_at_time
    }));

    return { ...order, items: formattedItems };
  });
}

async function sendPushNotification(expoPushToken: string, title: string, body: string) {
  if (!expoPushToken) return;
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: { someData: 'goes here' },
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (err) {
    console.error('Push Notification Error:', err);
  }
}

export async function GET(request: Request) {
  try {
    const products = db.prepare('SELECT * FROM products').all() as any[];

    // Admin (same-origin dashboard cookie) gets the full dataset.
    const admin = await getAdmin();
    if (admin) {
      const users = db.prepare('SELECT id, phone, store_name, is_approved, role, credit_balance, credit_limit, address, zone, city, created_at FROM users').all() as any[];
      const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as any[];
      const schemes = db.prepare('SELECT * FROM schemes ORDER BY created_at DESC').all() as any[];
      return NextResponse.json({ users, products, orders: populateOrders(orders), schemes });
    }

    // Mobile client (session bearer token) gets ONLY its own user record and orders.
    const user = getSessionUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orders = db.prepare('SELECT * FROM orders WHERE user_phone = ? ORDER BY created_at DESC').all(user.phone) as any[];
    const today = new Date().toISOString().split('T')[0];
    const schemes = db.prepare(`
      SELECT * FROM schemes
      WHERE is_active = 1 AND start_date <= ? AND end_date >= ?
      ORDER BY created_at DESC
    `).all(today, today) as any[];

    return NextResponse.json({
      users: [sanitizeUser(user)],
      products,
      orders: populateOrders(orders),
      schemes
    });
  } catch (err) {
    console.error('DB Read Error:', err);
    return NextResponse.json({ error: 'Failed to read database' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { collection, item, action } = body;

    // Resolve the caller once. Admin = dashboard cookie; user = mobile bearer token.
    const admin = await getAdmin();
    const sessionUser = admin ? null : getSessionUser(request);

    // Actions only the admin dashboard may perform.
    const adminOnlyActions = ['update_status', 'raw_override', 'add_product', 'update_stock'];
    if (adminOnlyActions.includes(action) && !admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (collection === 'orders' && action === 'create') {
      // A logged-in mobile client must own the order; never trust client-supplied identity.
      if (!sessionUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      item.phone = sessionUser.phone;
      item.store = sessionUser.store_name;

      // Server-side minimum order enforcement (mirrors the mobile guard).
      const subtotal = (item.items || []).reduce(
        (sum: number, i: any) => sum + (i.price || 0) * (i.quantity || 0), 0
      );
      if (subtotal > 0 && subtotal < MIN_ORDER_VALUE) {
        return NextResponse.json(
          { error: `Minimum order value is ₹${MIN_ORDER_VALUE}.` },
          { status: 400 }
        );
      }

      const insertOrder = db.prepare(`
        INSERT INTO orders (id, user_phone, store_name, status, total, date, scheme_code)
        VALUES (@id, @phone, @store, @status, @total, @date, @scheme_code)
      `);
      
      const insertOrderItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, quantity, price_at_time)
        VALUES (@order_id, @product_id, @quantity, @price_at_time)
      `);
      
      const updateUserCredit = db.prepare(`
        UPDATE users SET credit_balance = credit_balance + @total WHERE phone = @phone OR store_name = @store
      `);

      const incrementSchemeUsage = db.prepare(`
        UPDATE schemes SET times_used = times_used + 1 WHERE code = @code
      `);

      const createOrderTransaction = db.transaction((orderData) => {
        if (orderData.scheme_code) {
          const scheme = db.prepare('SELECT per_user_limit FROM schemes WHERE code = ?').get(orderData.scheme_code) as any;
          if (scheme && scheme.per_user_limit > 0) {
            const usage = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_phone = ? AND scheme_code = ?').get(orderData.phone, orderData.scheme_code) as any;
            if (usage.count >= scheme.per_user_limit) {
              throw new Error(`Coupon usage limit reached for this user (${scheme.per_user_limit} max).`);
            }
          }
        }

        insertOrder.run({
          id: orderData.id,
          phone: orderData.phone,
          store: orderData.store,
          status: 'Placed',
          total: orderData.total,
          date: orderData.date,
          scheme_code: orderData.scheme_code || null
        });

        for (const i of orderData.items) {
          insertOrderItem.run({
            order_id: orderData.id,
            product_id: i.id,
            quantity: i.quantity,
            price_at_time: i.price
          });
        }

        updateUserCredit.run({ total: orderData.total, phone: orderData.phone, store: orderData.store });

        if (orderData.scheme_code) {
          incrementSchemeUsage.run({ code: orderData.scheme_code });
        }
      });

      try {
        createOrderTransaction(item);
        return NextResponse.json({ success: true });
      } catch (e: any) {
        return NextResponse.json({ error: e.message || 'Failed to create order.' }, { status: 400 });
      }
    } 
    else if (collection === 'orders' && action === 'update_status') {
      const getOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(item.id) as any;
      if (!getOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

      // Get user's push token
      const user = db.prepare('SELECT expo_push_token FROM users WHERE phone = ?').get(getOrder.user_phone) as any;

      const updateOrder = db.prepare('UPDATE orders SET status = ?, courier_name = ?, tracking_id = ? WHERE id = ?');
      const refundCredit = db.prepare('UPDATE users SET credit_balance = MAX(0, credit_balance - ?) WHERE phone = ? OR store_name = ?');
      const deductStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
      
      const getItems = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(item.id) as any[];

      const updateStatusTransaction = db.transaction(() => {
        // Stock reduction when accepted
        if (item.status === 'Accepted' && getOrder.status === 'Placed') {
          for (const i of getItems) {
            deductStock.run(i.quantity, i.product_id);
          }
        }
        
        // Credit refund when rejected
        if (item.status === 'Rejected' && getOrder.status === 'Placed') {
          refundCredit.run(getOrder.total, getOrder.user_phone, getOrder.store_name);
        }

        updateOrder.run(item.status, item.courier_name || null, item.tracking_id || null, item.id);
      });

      updateStatusTransaction();

      // Send Push Notification
      if (user && user.expo_push_token) {
        let title = 'Order Update';
        let body = `Your order ${item.id} status is now: ${item.status}`;
        
        if (item.status === 'Shipped') {
          title = 'Order Dispatched';
          body = `Your order ${item.id} has been shipped via ${item.courier_name || 'Courier'}.`;
        } else if (item.status === 'Accepted') {
          title = 'Order Accepted';
          body = `Your order ${item.id} has been accepted and is being processed.`;
        } else if (item.status === 'Rejected') {
          title = 'Order Rejected';
          body = `Unfortunately, your order ${item.id} was rejected. Your credit has been refunded.`;
        }

        await sendPushNotification(user.expo_push_token, title, body);
      }

      return NextResponse.json({ success: true });
    }
    else if (action === 'raw_override') {
      // Powerful sync override from dashboard - Re-implementing for SQLite
      // Note: Only users updates are implemented from the old codebase raw_override
      if (body.db && body.db.users) {
        const updateApprove = db.prepare('UPDATE users SET is_approved = ? WHERE phone = ?');
        const overrideTransaction = db.transaction((users) => {
          for (const u of users) {
            updateApprove.run(u.is_approved ? 1 : 0, u.phone);
          }
        });
        overrideTransaction(body.db.users);
        return NextResponse.json({ success: true });
      }
    }
    else if (action === 'add_product') {
      const insertProduct = db.prepare(`
        INSERT INTO products (name, company, category, body_system, price, stock, image_url)
        VALUES (@name, @company, @category, @body_system, @price, @stock, @image_url)
      `);
      insertProduct.run({
        name: item.name,
        company: item.company,
        category: item.category,
        body_system: item.body_system || 'General',
        price: item.price,
        stock: item.stock,
        image_url: item.image_url || null
      });
      return NextResponse.json({ success: true });
    }
    else if (action === 'update_stock') {
      const { productId, changeAmount } = body;
      db.prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?').run(changeAmount, productId);
      return NextResponse.json({ success: true });
    }

    else if (action === 'update_address') {
      // A user may only update their own address; admin may update any.
      const targetPhone = admin ? body.phone : sessionUser?.phone;
      if (!targetPhone) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      db.prepare('UPDATE users SET address = ? WHERE phone = ?').run(body.address, targetPhone);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('DB Write Error:', err);
    return NextResponse.json({ error: 'Failed to save to database' }, { status: 500 });
  }
}
