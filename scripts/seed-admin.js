// Idempotent admin seeder. Usage on Railway console:
//   node scripts/seed-admin.js <phone> <password> [store_name]
// Re-running with the same phone updates the password (safe to run repeatedly).

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const [, , phone, password, storeName = 'Admin'] = process.argv;

if (!phone || !password) {
  console.error('Usage: node scripts/seed-admin.js <phone> <password> [store_name]');
  process.exit(1);
}

const dbPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), 'database.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

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
`);

const hash = bcrypt.hashSync(password, 10);
const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);

if (existing) {
  db.prepare(
    "UPDATE users SET password_hash = ?, role = 'admin', is_approved = 1, store_name = ? WHERE phone = ?"
  ).run(hash, storeName, phone);
  console.log(`Updated existing user ${phone} -> role=admin, is_approved=1`);
} else {
  db.prepare(
    "INSERT INTO users (phone, store_name, is_approved, role, password_hash) VALUES (?, ?, 1, 'admin', ?)"
  ).run(phone, storeName, hash);
  console.log(`Created admin user ${phone}`);
}

console.log(`DB path: ${dbPath}`);
console.log('Done. You can now log in at /login with this phone and password.');
