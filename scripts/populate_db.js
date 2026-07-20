const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const catalogPath = path.resolve(process.cwd(), 'public', 'matched_catalog.json');
const jsonPath = path.resolve(process.cwd(), 'data.json');

console.log('Connecting to database...');
const db = new Database(dbPath, { verbose: console.log });

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Additional columns required for full catalog support
const columnsToAdd = [
  'code TEXT',
  'supplier TEXT',
  'distributor TEXT',
  'drug_name TEXT',
  'composition TEXT',
  'packing TEXT',
  'mrp REAL',
  'price_ptr REAL',
  'pts REAL',
  'pur_rate REAL',
  'sal_rate REAL',
  'hsn TEXT',
  'gst_percent REAL',
  'stock_status TEXT',
  'image_url TEXT',
  'matched_brochure_page INTEGER',
  'segregation TEXT'
];

columnsToAdd.forEach(colDef => {
  try {
    db.exec(`ALTER TABLE products ADD COLUMN ${colDef};`);
    console.log(`Added column: ${colDef.split(' ')[0]}`);
  } catch (e) {
    if (!e.message.includes('duplicate column name')) {
      console.warn(`Column warning for ${colDef}:`, e.message);
    }
  }
});

// Create Indexes for high performance query & search
try {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_company ON products(company);
    CREATE INDEX IF NOT EXISTS idx_products_distributor ON products(distributor);
    CREATE INDEX IF NOT EXISTS idx_products_segregation ON products(segregation);
  `);
  console.log('Created database indexes successfully.');
} catch (e) {
  console.error('Error creating indexes:', e.message);
}

// Load matched catalog JSON
if (!fs.existsSync(catalogPath)) {
  console.error('Catalog JSON not found at:', catalogPath);
  process.exit(1);
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
console.log(`Loaded ${catalog.length} items from matched catalog.`);

// Helper to determine dosage form / category
function deriveCategory(name, drugName) {
  const n = (name + " " + (drugName || "")).toUpperCase();
  if (n.includes('TAB') || n.includes('TABLET')) return 'Tablets';
  if (n.includes('CAP') || n.includes('CAPSULE')) return 'Capsules';
  if (n.includes('INJ') || n.includes('INJECTION')) return 'Injections';
  if (n.includes('SYP') || n.includes('SYRUP') || n.includes('SUSP')) return 'Syrups & Liquids';
  if (n.includes('GEL') || n.includes('CREAM') || n.includes('OINTMENT')) return 'Topicals & Ointments';
  if (n.includes('DROP') || n.includes('DROPS')) return 'Eye/Ear Drops';
  if (n.includes('MASK') || n.includes('THERMOMETER') || n.includes('STICK') || n.includes('DEVICE')) return 'Medical Devices';
  return 'General Pharma';
}

const insertOrReplaceProduct = db.prepare(`
  INSERT INTO products (
    id, name, code, company, supplier, distributor, category, drug_name, composition,
    packing, price, mrp, price_ptr, pts, pur_rate, sal_rate, hsn, gst_percent,
    stock, stock_status, image_url, matched_brochure_page, segregation
  ) VALUES (
    @id, @name, @code, @company, @supplier, @distributor, @category, @drug_name, @composition,
    @packing, @price, @mrp, @price_ptr, @pts, @pur_rate, @sal_rate, @hsn, @gst_percent,
    @stock, @stock_status, @image_url, @matched_brochure_page, @segregation
  ) ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    code = excluded.code,
    company = excluded.company,
    supplier = excluded.supplier,
    distributor = excluded.distributor,
    category = excluded.category,
    drug_name = excluded.drug_name,
    composition = excluded.composition,
    packing = excluded.packing,
    price = excluded.price,
    mrp = excluded.mrp,
    price_ptr = excluded.price_ptr,
    pts = excluded.pts,
    pur_rate = excluded.pur_rate,
    sal_rate = excluded.sal_rate,
    hsn = excluded.hsn,
    gst_percent = excluded.gst_percent,
    stock_status = excluded.stock_status,
    image_url = excluded.image_url,
    matched_brochure_page = excluded.matched_brochure_page,
    segregation = excluded.segregation
`);

const populateTransaction = db.transaction((items) => {
  let count = 0;
  items.forEach(item => {
    const category = item.category || deriveCategory(item.name, item.drug_name);
    const price = item.sal_rate > 0 ? item.sal_rate : (item.mrp > 0 ? item.mrp : 100);
    
    insertOrReplaceProduct.run({
      id: item.id,
      name: item.name,
      code: String(item.code || ''),
      company: item.manufacturer || item.company || 'Vakul Lifescience',
      supplier: item.supplier || '',
      distributor: item.distributor || 'Upkar Pharma',
      category: category,
      drug_name: item.drug_name || '',
      composition: item.drug_name || '',
      packing: item.packing || '',
      price: price,
      mrp: item.mrp || 0,
      price_ptr: item.ptr || 0,
      pts: item.pts || 0,
      pur_rate: item.pur_rate || 0,
      sal_rate: item.sal_rate || 0,
      hsn: String(item.hsn || ''),
      gst_percent: item.gst_percent || 5,
      stock: item.stock_status === 'Not Available' ? 0 : 50,
      stock_status: item.stock_status || 'Available',
      image_url: item.image_url || '/pharma_logo.jpeg',
      matched_brochure_page: item.matched_brochure_page || null,
      segregation: item.segregation || 'Excel Only'
    });
    count++;
  });
  return count;
});

try {
  const insertedCount = populateTransaction(catalog);
  console.log(`Successfully populated/updated ${insertedCount} products in SQLite database!`);
  
  // Also sync data.json
  if (fs.existsSync(jsonPath)) {
    const dataJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    dataJson.products = catalog.map(item => ({
      id: item.id,
      name: item.name,
      company: item.manufacturer || item.company || 'Vakul Lifescience',
      category: deriveCategory(item.name, item.drug_name),
      price: item.sal_rate > 0 ? item.sal_rate : (item.mrp > 0 ? item.mrp : 100),
      stock: item.stock_status === 'Not Available' ? 0 : 50,
      image_url: item.image_url || '/pharma_logo.jpeg',
      segregation: item.segregation || 'Excel Only'
    }));
    fs.writeFileSync(jsonPath, JSON.stringify(dataJson, null, 2));
    console.log('Synced data.json with updated products array.');
  }

} catch (error) {
  console.error('Database population failed:', error);
} finally {
  db.close();
}
