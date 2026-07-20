import Database from 'better-sqlite3';
import path from 'path';

// Path to the SQLite database file
const dbPath = path.resolve(process.cwd(), 'database.sqlite');

// Initialize the database connection.
// Verbose query logging in development only — keeps production logs clean and
// avoids leaking query/data details.
const db = new Database(
  dbPath,
  process.env.NODE_ENV === 'production' ? {} : { verbose: console.log }
);

// Enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Function to initialize the schema
export function initDB() {
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
      expo_push_token TEXT,
      drug_license TEXT,
      gst_number TEXT,
      registration_number TEXT,
      address TEXT,
      email TEXT,
      user_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      company TEXT NOT NULL,
      category TEXT NOT NULL,
      body_system TEXT,
      price REAL NOT NULL,
      price_ptr REAL,
      mrp REAL,
      packing TEXT,
      description TEXT,
      composition TEXT,
      stock INTEGER DEFAULT 0,
      image_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_phone TEXT NOT NULL,
      device_info TEXT,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_phone) REFERENCES users(phone)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      user_phone TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'Unpaid',
      due_date DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(user_phone) REFERENCES users(phone)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_phone TEXT NOT NULL,
      store_name TEXT NOT NULL,
      status TEXT DEFAULT 'Placed',
      total REAL NOT NULL,
      date TEXT NOT NULL,
      courier_name TEXT,
      tracking_id TEXT,
      scheme_code TEXT,
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

    CREATE TABLE IF NOT EXISTS schemes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      code TEXT UNIQUE NOT NULL,
      scheme_type TEXT NOT NULL DEFAULT 'Discount',
      discount_percent REAL,
      flat_discount REAL,
      min_order_value REAL DEFAULT 0,
      max_discount REAL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      usage_limit INTEGER DEFAULT 0,
      per_user_limit INTEGER DEFAULT 1,
      times_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Add image_url column if it doesn't exist (for existing databases)
  try {
    db.prepare("SELECT image_url FROM products LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE products ADD COLUMN image_url TEXT");
  }

  // Migration: Add zone and city columns to users
  try {
    db.prepare("SELECT zone FROM users LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE users ADD COLUMN zone TEXT");
  }
  try {
    db.prepare("SELECT city FROM users LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE users ADD COLUMN city TEXT");
  }

  // Migration: Add scheme_code to orders
  try {
    db.prepare("SELECT scheme_code FROM orders LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE orders ADD COLUMN scheme_code TEXT");
  }

  // Migration: Add per_user_limit to schemes
  try {
    db.prepare("SELECT per_user_limit FROM schemes LIMIT 1").get();
  } catch {
    try {
      db.exec("ALTER TABLE schemes ADD COLUMN per_user_limit INTEGER DEFAULT 1");
    } catch(e) {}
  }
}

// Ensure db is initialized
initDB();

export default db;
