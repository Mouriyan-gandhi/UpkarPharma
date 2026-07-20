import { NextResponse } from 'next/server';
import db from '@/lib/db';
import * as XLSX from 'xlsx';
import bcrypt from 'bcrypt';
import { getAdmin } from '@/lib/auth';

// Helper for fuzzy column matching
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
  image_url: ['image', 'photo', 'picture', 'imageurl', 'url']
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

// Basic auto-categorization based on active ingredients
const categoryMapping: Record<string, string> = {
  'telmisartan': 'Heart',
  'metformin': 'Diabetes',
  'glimepiride': 'Diabetes',
  'amlodipine': 'Heart',
  'atorvastatin': 'Heart',
  'rosuvastatin': 'Heart',
  'paracetamol': 'General',
  'amoxicillin': 'Antibiotic',
  'azithromycin': 'Antibiotic',
  'pantoprazole': 'Gastro',
  'rabeprazole': 'Gastro',
  'cetirizine': 'Allergy',
  'levocetirizine': 'Allergy'
};

function autoCategorize(name: string): string {
  if (!name) return 'General';
  const lowerName = name.toLowerCase();
  for (const [key, category] of Object.entries(categoryMapping)) {
    if (lowerName.includes(key)) {
      return category;
    }
  }
  return 'General';
}

function getDefaultImage(category: string): string {
  const images: Record<string, string> = {
    'Heart': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=400',
    'Diabetes': 'https://images.unsplash.com/photo-1563213126-a4273aed2016?auto=format&fit=crop&q=80&w=400',
    'Antibiotic': 'https://images.unsplash.com/photo-1471864190281-a93a3070b6de?auto=format&fit=crop&q=80&w=400',
    'Gastro': 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&q=80&w=400',
    'Allergy': 'https://images.unsplash.com/photo-1550572017-0fdbcd99352c?auto=format&fit=crop&q=80&w=400',
    'General': 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?auto=format&fit=crop&q=80&w=400',
  };
  return images[category] || images['General'];
}

function getDefaultDescription(category: string): string {
  return `High-quality pharmaceutical formulation for ${category.toLowerCase()} treatments. Clinically tested for efficacy and safety.`;
}

export async function POST(request: Request) {
  try {
    if (!(await getAdmin())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'products' or 'users'

    if (!file || !type) {
      return NextResponse.json({ error: 'File and type are required' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Read as 2D array to find headers dynamically
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length === 0) {
      return NextResponse.json({ error: 'Excel file is empty' }, { status: 400 });
    }

    let added = 0;

    if (type === 'products') {
      // 1. Detect Header Row
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

      // 2. Data Cleaning & Normalization
      const productsMap = new Map<string, any>(); // key: lowercase name to merge duplicates

      for (let i = headerRowIndex + 1; i < rawData.length; i++) {
        const row = rawData[i] as any[];
        if (!row || row.length === 0) continue;

        const name = row[bestMapping['name']];
        if (!name || typeof name !== 'string' || name.trim() === '') continue; // Ignore empty names or category labels
        
        const rawPtr = bestMapping['price_ptr'] !== undefined ? row[bestMapping['price_ptr']] : 0;
        const ptr = parseFloat(rawPtr) || 0;
        
        const rawMrp = bestMapping['mrp'] !== undefined ? row[bestMapping['mrp']] : 0;
        const mrp = parseFloat(rawMrp) || 0;

        const company = bestMapping['company'] !== undefined ? row[bestMapping['company']] : 'Unknown';
        const packing = bestMapping['packing'] !== undefined ? row[bestMapping['packing']] : '';
        const category = bestMapping['category'] !== undefined ? row[bestMapping['category']] : autoCategorize(name);
        const stock = bestMapping['stock'] !== undefined ? parseInt(row[bestMapping['stock']]) : 100; // Default stock if missing

        const descRaw = bestMapping['description'] !== undefined ? row[bestMapping['description']] : '';
        const compRaw = bestMapping['composition'] !== undefined ? row[bestMapping['composition']] : '';
        const imgRaw = bestMapping['image_url'] !== undefined ? row[bestMapping['image_url']] : '';

        const cleanName = name.trim();
        const key = cleanName.toLowerCase();

        const finalDesc = descRaw || getDefaultDescription(category);
        const finalComp = compRaw || 'Standard Active Pharmaceutical Ingredient';
        const finalImg = imgRaw || getDefaultImage(category);

        // Duplicate merging (Prioritize lowest PTR)
        if (productsMap.has(key)) {
          const existing = productsMap.get(key);
          if (ptr > 0 && (existing.price_ptr === 0 || ptr < existing.price_ptr)) {
            existing.price_ptr = ptr;
            existing.mrp = Math.max(existing.mrp, mrp); // Keep highest MRP
            if(!existing.image_url || existing.image_url.includes('unsplash')) existing.image_url = finalImg;
          }
        } else {
          productsMap.set(key, {
            name: cleanName,
            company: company,
            category: category,
            body_system: category,
            price_ptr: ptr,
            mrp: mrp,
            packing: packing,
            stock: Number.isNaN(stock) ? 100 : stock,
            price: ptr, // legacy
            description: finalDesc,
            composition: finalComp,
            image_url: finalImg
          });
        }
      }

      const productsToInsert = Array.from(productsMap.values());

      const insertProduct = db.prepare(`
        INSERT INTO products (name, company, category, body_system, price, price_ptr, mrp, packing, stock, description, composition, image_url)
        VALUES (@name, @company, @category, @body_system, @price, @price_ptr, @mrp, @packing, @stock, @description, @composition, @image_url)
      `);
      
      const bulkInsert = db.transaction((items) => {
        for (const item of items) {
          insertProduct.run(item);
          added++;
        }
      });
      
      bulkInsert(productsToInsert);
    } 
    else if (type === 'users') {
      // Keep existing simple user import for now
      const data = XLSX.utils.sheet_to_json(sheet);
      const insertUser = db.prepare(`
        INSERT INTO users (phone, store_name, is_approved, credit_balance, credit_limit, role, password_hash)
        VALUES (@phone, @store_name, @is_approved, @credit_balance, @credit_limit, @role, @password_hash)
      `);

      const defaultPassword = bcrypt.hashSync('123456', 10);

      const bulkInsert = db.transaction((items: any[]) => {
        for (const item of items) {
          const phone = item.phone ? item.phone.toString() : null;
          if (!phone) continue;

          const existing = db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone);
          if (!existing) {
             insertUser.run({
              phone: phone,
              store_name: item.store_name || 'Unknown Store',
              is_approved: String(item.is_approved).toLowerCase() === 'true' ? 1 : 0,
              credit_balance: Number(item.credit_balance) || 0,
              credit_limit: Number(item.credit_limit) || 0,
              role: item.role || 'client',
              password_hash: defaultPassword
            });
            added++;
          }
        }
      });
      bulkInsert(data);
    } else {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 });
    }

    return NextResponse.json({ success: true, added });
  } catch (err) {
    console.error('Upload Error:', err);
    return NextResponse.json({ error: 'Failed to process Excel upload' }, { status: 500 });
  }
}
