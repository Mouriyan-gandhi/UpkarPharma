const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'database.sqlite');
const jsonPath = path.resolve(process.cwd(), 'data.json');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Connect to SQLite
const db = new Database(dbPath, { verbose: console.log });

// Enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    store_name TEXT NOT NULL,
    is_approved BOOLEAN DEFAULT 0,
    role TEXT DEFAULT 'client',
    password_hash TEXT,
    credit_balance REAL DEFAULT 0,
    credit_limit REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
    category TEXT NOT NULL,
    body_system TEXT,
    price REAL NOT NULL,
    stock INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_phone TEXT NOT NULL,
    store_name TEXT NOT NULL,
    status TEXT DEFAULT 'Placed',
    total REAL NOT NULL,
    date TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_phone) REFERENCES users(phone)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price_at_time REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`);

console.log('Schema initialized successfully.');

// Read data.json
if (!fs.existsSync(jsonPath)) {
  console.log('data.json not found, skipping migration.');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// Prepare statements
const insertUser = db.prepare(`
  INSERT INTO users (phone, store_name, is_approved, credit_balance, credit_limit, role, password_hash)
  VALUES (@phone, @store_name, @is_approved, @credit_balance, @credit_limit, @role, @password_hash)
`);

const insertProduct = db.prepare(`
  INSERT INTO products (id, name, company, category, price, stock)
  VALUES (@id, @name, @company, @category, @price, @stock)
`);

const insertOrder = db.prepare(`
  INSERT INTO orders (id, user_phone, store_name, status, total, date)
  VALUES (@id, @user_phone, @store_name, @status, @total, @date)
`);

const insertOrderItem = db.prepare(`
  INSERT INTO order_items (order_id, product_id, quantity, price_at_time)
  VALUES (@order_id, @product_id, @quantity, @price_at_time)
`);

// Execute transaction
const migrate = db.transaction((data) => {
  // 1. Migrate Users
  if (data.users) {
    for (const user of data.users) {
      // Check if user exists
      const existing = db.prepare('SELECT 1 FROM users WHERE phone = ?').get(user.phone);
      if (!existing) {
        insertUser.run({
          phone: user.phone,
          store_name: user.store_name,
          is_approved: user.is_approved ? 1 : 0,
          credit_balance: user.credit_balance || 0,
          credit_limit: user.credit_limit || 0,
          role: user.phone === '6383945610' ? 'admin' : 'client', // Make first user admin
          // Create default password '123456' for existing users during migration
          password_hash: bcrypt.hashSync('123456', 10) 
        });
      }
    }
    console.log(`Migrated ${data.users.length} users.`);
  }

  // 2. Migrate Products
  if (data.products) {
    for (const prod of data.products) {
      const existing = db.prepare('SELECT 1 FROM products WHERE id = ?').get(prod.id);
      if (!existing) {
        insertProduct.run({
          id: prod.id,
          name: prod.name,
          company: prod.company,
          category: prod.category,
          price: prod.price,
          stock: prod.stock
        });
      }
    }
    console.log(`Migrated ${data.products.length} products.`);
  }

  // 3. Migrate Orders
  if (data.orders) {
    // Ensure UNKNOWN user exists for old orders
    const unknownExists = db.prepare('SELECT 1 FROM users WHERE phone = ?').get('UNKNOWN');
    if (!unknownExists) {
      insertUser.run({
        phone: 'UNKNOWN',
        store_name: 'Unknown Store',
        is_approved: 0,
        credit_balance: 0,
        credit_limit: 0,
        role: 'client',
        password_hash: bcrypt.hashSync('123456', 10)
      });
    }

    for (const order of data.orders) {
      const existing = db.prepare('SELECT 1 FROM orders WHERE id = ?').get(order.id);
      if (!existing) {
        // Handle potentially missing fields from prototype data
        let phone = order.phone;
        let store = order.store;
        
        if (!phone && data.users) {
           // try to find phone by store name
           const user = data.users.find(u => u.store_name === store);
           if (user) phone = user.phone;
           else phone = "UNKNOWN"; // Fallback for old corrupt data
        } else if (!store && data.users) {
           // try to find store by phone
           const user = data.users.find(u => u.phone === phone);
           if (user) store = user.store_name;
           else store = "Unknown Store";
        }

        insertOrder.run({
          id: order.id,
          user_phone: phone || "UNKNOWN",
          store_name: store || "Unknown Store",
          status: order.status || 'Placed',
          total: order.total || 0,
          date: order.date
        });

        // Migrate Order Items
        if (order.items) {
          for (const item of order.items) {
            insertOrderItem.run({
              order_id: order.id,
              product_id: item.id,
              quantity: item.quantity,
              price_at_time: item.price
            });
          }
        }
      }
    }
    console.log(`Migrated ${data.orders.length} orders.`);
  }
});

try {
  migrate(data);
  console.log('Migration completed successfully.');
} catch (error) {
  console.error('Migration failed:', error);
} finally {
  db.close();
}
