// Test whether the deployed prod API accepts a mobile-admin bearer token
// for update_product. If this passes, the photo save path is unblocked and
// any lingering "old photo" symptom is a mobile-side cache issue, not the API.

const PROD = 'https://upkarpharma.vercel.app';
const ADMIN_PHONE = '6379019139';
const ADMIN_PASSWORD = process.argv[2];

if (!ADMIN_PASSWORD) {
  console.error('Usage: node scripts/test-mobile-admin-save.mjs <dhruv-password>');
  process.exit(1);
}

// 1. Login as Dhruv via dev-login (same path the mobile app uses)
const loginRes = await fetch(`${PROD}/api/auth/dev-login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD }),
});
const loginData = await loginRes.json();
if (!loginRes.ok || !loginData.session_id) {
  console.error('LOGIN FAILED:', loginRes.status, loginData);
  process.exit(1);
}
console.log(`✓ Login OK. Role: ${loginData.user.role}`);
const bearer = loginData.session_id;

// 2. Fetch data to get a real product id
const dataRes = await fetch(`${PROD}/api/data`, {
  headers: { 'Authorization': `Bearer ${bearer}` },
});
const data = await dataRes.json();
if (!dataRes.ok) { console.error('DATA FAILED:', dataRes.status, data); process.exit(1); }
const someProduct = (data.products || [])[0];
if (!someProduct) { console.error('No products in DB'); process.exit(1); }
console.log(`✓ Data OK. Test product: id=${someProduct.id} name=${someProduct.name}`);
console.log(`  current images: ${JSON.stringify(someProduct.images || null)}`);

// 3. Simulate the photo-save call — this is what mobile admin does after upload
const testUrl = 'https://placehold.co/300x300/png?text=TEST';
const saveRes = await fetch(`${PROD}/api/data`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${bearer}`,
  },
  body: JSON.stringify({
    collection: 'products',
    action: 'update_product',
    item: { id: someProduct.id, images: [testUrl] },
  }),
});
const saveData = await saveRes.json();
console.log(`\n→ update_product response: ${saveRes.status}`);
console.log(`  body: ${JSON.stringify(saveData)}`);

if (saveRes.status === 403) {
  console.error('\n❌ STILL 403 — the bearer-admin fix is NOT live in prod yet.');
  process.exit(1);
} else if (saveRes.status === 200) {
  console.log('\n✅ Save accepted! Photo save path is unblocked.');

  // 4. Read back to confirm persistence
  const verifyRes = await fetch(`${PROD}/api/data`, { headers: { 'Authorization': `Bearer ${bearer}` } });
  const verifyData = await verifyRes.json();
  const updated = (verifyData.products || []).find(p => p.id === someProduct.id);
  console.log(`  after save, images: ${JSON.stringify(updated?.images)}`);
  console.log(`  after save, image_url: ${updated?.image_url}`);

  // Restore
  await fetch(`${PROD}/api/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bearer}` },
    body: JSON.stringify({ collection: 'products', action: 'update_product', item: { id: someProduct.id, images: someProduct.images || [] } }),
  });
  console.log('  (restored original images)');
}
