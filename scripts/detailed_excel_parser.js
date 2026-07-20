const xlsx = require('xlsx');
const path = require('path');

const files = [
  'Product_Category_14072026130742.xls',
  'Product_Category_14072026140715.xls',
  'Product_Master_14072026130716.xls',
  'Product_Master_14072026140700.xls'
];

files.forEach(f => {
  const filePath = path.join('public', f);
  const wb = xlsx.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n========================================`);
  console.log(`File: ${f} (Total raw rows: ${rawData.length})`);
  console.log(`========================================`);
  for (let i = 0; i < Math.min(15, rawData.length); i++) {
    console.log(`Row ${i}:`, JSON.stringify(rawData[i]));
  }
});
