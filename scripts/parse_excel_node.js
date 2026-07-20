const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const upkarMasterPath = path.join('public', 'Product_Master_14072026130716.xls');
const swasthikMasterPath = path.join('public', 'Product_Master_14072026140700.xls');
const upkarCatPath = path.join('public', 'Product_Category_14072026130742.xls');
const swasthikCatPath = path.join('public', 'Product_Category_14072026140715.xls');

function parseExcelSheet(filePath, headerIndex = 6) {
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  if (rawRows.length <= headerIndex) return [];
  
  const headers = rawRows[headerIndex].map(h => (h ? String(h).trim() : ''));
  const dataRows = rawRows.slice(headerIndex + 1);
  
  const result = [];
  dataRows.forEach((row, idx) => {
    if (!row || row.length === 0) return;
    const obj = {};
    let hasData = false;
    headers.forEach((h, colIdx) => {
      if (h) {
        let val = row[colIdx];
        if (val !== undefined && val !== null) {
          if (typeof val === 'string') val = val.trim();
          obj[h] = val;
          hasData = true;
        } else {
          obj[h] = null;
        }
      }
    });
    if (hasData && obj['Product Name']) {
      result.push(obj);
    }
  });
  return result;
}

console.log('--- Reading Upkar Master ---');
const upkarProducts = parseExcelSheet(upkarMasterPath, 6);
console.log(`Upkar product items count: ${upkarProducts.length}`);

console.log('--- Reading Swasthik Master ---');
const swasthikProducts = parseExcelSheet(swasthikMasterPath, 6);
console.log(`Swasthik product items count: ${swasthikProducts.length}`);

console.log('--- Reading Categories ---');
const upkarCats = parseExcelSheet(upkarCatPath, 6);
const swasthikCats = parseExcelSheet(swasthikCatPath, 6);
console.log(`Upkar categories: ${upkarCats.length}, Swasthik categories: ${swasthikCats.length}`);

// Combine and map
const allProductsMap = new Map();

function cleanProduct(p, dist) {
  const name = String(p['Product Name'] || '').trim();
  const code = p['Code'];
  const drugName = p['Drug Name'] ? String(p['Drug Name']).trim() : '';
  const packing = p['Packing'] ? String(p['Packing']).trim() : '';
  const mfr = p['MFR'] ? String(p['MFR']).trim() : '';
  const supplier = p['Supplier'] ? String(p['Supplier']).trim() : '';
  const mrp = Number(p['Recent MRP']) || 0;
  const purRate = Number(p['Recent PurRate']) || 0;
  const salRate = Number(p['Recent SalRate']) || 0;
  const ptr = Number(p['Recent PTR']) || 0;
  const pts = Number(p['Recent PTS']) || 0;
  const hsn = p['HSN'] ? String(p['HSN']).trim() : '';
  const gst = Number(p['GST Tax%']) || 0;
  const stockStatus = p['Stock Status'] ? String(p['Stock Status']).trim() : 'Not Available';

  return {
    distributor: dist,
    code: code,
    name: name,
    drug_name: drugName,
    packing: packing,
    manufacturer: mfr,
    supplier: supplier,
    mrp: mrp,
    pur_rate: purRate,
    sal_rate: salRate,
    ptr: ptr,
    pts: pts,
    hsn: hsn,
    gst_percent: gst,
    stock_status: stockStatus
  };
}

const cleanedUpkar = upkarProducts.map(p => cleanProduct(p, 'Upkar Pharma'));
const cleanedSwasthik = swasthikProducts.map(p => cleanProduct(p, 'Swasthik Pharma'));

const combinedList = [];
const nameSeen = new Set();

[...cleanedUpkar, ...cleanedSwasthik].forEach(p => {
  const normName = p.name.toUpperCase();
  if (!nameSeen.has(normName)) {
    nameSeen.add(normName);
    combinedList.push(p);
  }
});

console.log(`\n================ SUMMARY ================`);
console.log(`Upkar Master Products Count: ${cleanedUpkar.length}`);
console.log(`Swasthik Master Products Count: ${cleanedSwasthik.length}`);
console.log(`Total Products Across Both Excel Files: ${cleanedUpkar.length + cleanedSwasthik.length}`);
console.log(`Unique Product Names Combined: ${combinedList.length}`);
console.log(`=========================================\n`);

const outputData = {
  upkar_total: cleanedUpkar.length,
  swasthik_total: cleanedSwasthik.length,
  combined_total: cleanedUpkar.length + cleanedSwasthik.length,
  unique_combined_total: combinedList.length,
  upkar_categories: upkarCats,
  swasthik_categories: swasthikCats,
  upkar_products: cleanedUpkar,
  swasthik_products: cleanedSwasthik,
  unique_products: combinedList
};

const outputPath = path.join('public', 'excel_parsed_data.json');
fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
console.log(`Saved detailed parsed data to ${outputPath}`);
