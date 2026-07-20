const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('public').filter(f => f.endsWith('.xls') || f.endsWith('.xlsx'));
console.log('Excel files found:', files);

files.forEach(f => {
  const filePath = path.join('public', f);
  const wb = xlsx.readFile(filePath);
  console.log('\n--- File:', f);
  console.log('Sheet Names:', wb.SheetNames);
  wb.SheetNames.forEach(sheetName => {
    const sheet = wb.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    console.log(`Sheet '${sheetName}' row count: ${data.length}`);
    if (data.length > 0) {
      console.log('Sample keys:', Object.keys(data[0]));
      console.log('Sample row 0:', JSON.stringify(data[0]));
      console.log('Sample row 1:', JSON.stringify(data[1]));
    }
  });
});
