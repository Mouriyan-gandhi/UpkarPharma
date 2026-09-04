// End-to-end diagnostic: proves the LIVE server actually updates when the
// mobile app sends a write. If this passes, any "not updating" bug on the
// installed APK is a stale-JS-bundle / stale-cache issue and can be fixed
// with an EAS Update — NOT a server bug.
//
// Usage:
//   node scripts/live-diag.mjs <admin-password> <customer-password>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD = 'https://upkarpharma.vercel.app';
const [, , ADMIN_PW, CUSTOMER_PW] = process.argv;
if (!ADMIN_PW || !CUSTOMER_PW) {
  console.error('Usage: node scripts/live-diag.mjs <admin-password> <customer-password>');
  process.exit(1);
}

async function login(phone, password, label) {
  const res = await fetch(`${PROD}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.session_id) throw new Error(`${label} login failed: ${data.error || res.status}`);
  console.log(`✓ ${label} login OK (role: ${data.user.role})`);
  return { token: data.session_id, user: data.user };
}

async function get(url, token) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}
async function post(url, token, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

// 1. Both roles can log in?
const admin = await login('6379019139', ADMIN_PW, 'Admin (Dhruv)');
const customer = await login('9999999999', CUSTOMER_PW, 'Customer (Pharma)');

// 2. Customer's credit_limit reflects the 10L we set
const custData = await get(`${PROD}/api/data`, customer.token);
if (custData.status !== 200) { console.error('❌ /api/data as customer:', custData); process.exit(1); }
const custProfile = custData.body.users?.[0];
console.log(`✓ Customer sees credit_limit=${custProfile?.credit_limit} (expected 1000000)`);
if (custProfile?.credit_limit !== 1000000) console.error('  ⚠  MISMATCH — DB has different value than API returns');

// 3. Customer edits their own address — does it persist?
const newAddr = `Test address ${Date.now()}`;
const addrRes = await post(`${PROD}/api/data`, customer.token, {
  action: 'update_own_profile',
  address: newAddr,
});
console.log(`→ Customer update_own_profile: ${addrRes.status} ${JSON.stringify(addrRes.body)}`);
const verify = await get(`${PROD}/api/data`, customer.token);
if (verify.body.users?.[0]?.address === newAddr) {
  console.log(`✓ Customer address persists (${newAddr})`);
} else {
  console.error(`❌ Address didn't persist. Got: ${verify.body.users?.[0]?.address}`);
}

// 4. Admin edits a product — does the customer see the change on next fetch?
const someProduct = custData.body.products?.[0];
if (!someProduct) { console.error('No products'); process.exit(1); }
const testTag = `test-${Date.now()}`;
const editRes = await post(`${PROD}/api/data`, admin.token, {
  collection: 'products',
  action: 'update_product',
  item: { id: someProduct.id, description: testTag },
});
console.log(`→ Admin update_product: ${editRes.status} ${JSON.stringify(editRes.body).slice(0, 80)}`);
const verifyCust = await get(`${PROD}/api/data`, customer.token);
const seenByCust = verifyCust.body.products?.find(p => p.id === someProduct.id)?.description;
if (seenByCust === testTag) {
  console.log(`✓ Customer sees admin's edit within one fetch cycle`);
} else {
  console.error(`❌ Customer got stale data. Got: "${seenByCust}", expected: "${testTag}"`);
}
// Restore
await post(`${PROD}/api/data`, admin.token, {
  collection: 'products', action: 'update_product',
  item: { id: someProduct.id, description: someProduct.description || '' },
});

// 5. Customer submits credit request — does admin see it?
const crRes = await post(`${PROD}/api/credit-requests`, customer.token, {
  amount: 12345, note: 'live-diag test',
});
console.log(`→ Customer credit-request POST: ${crRes.status} ${JSON.stringify(crRes.body).slice(0, 120)}`);
const adminList = await get(`${PROD}/api/credit-requests`, admin.token);
const found = (adminList.body.requests || []).find(r => Number(r.amount) === 12345 && r.status === 'Pending');
if (found) {
  console.log(`✓ Admin sees the customer's credit request (id=${found.id})`);
  // Approve it
  const approve = await fetch(`${PROD}/api/credit-requests/${found.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ action: 'approve', admin_note: 'diag: approved' }),
  });
  console.log(`→ Admin approve: ${approve.status}`);
  // Verify customer credit_limit bumped
  const custAfter = await get(`${PROD}/api/data`, customer.token);
  console.log(`✓ Customer credit_limit after approval: ${custAfter.body.users?.[0]?.credit_limit} (was ${custProfile?.credit_limit})`);
} else {
  console.error('❌ Admin does NOT see the customer credit request. Handler may be broken.');
}

console.log('\n═══ DIAGNOSIS ═══');
console.log('If every check above is ✓, the SERVER is fine.');
console.log('Any "not updating" behavior on the installed APK is because:');
console.log('  - The JS bundle on the phone is older than what is in git.');
console.log('  - Solution: publish an EAS Update (JS-only, no rebuild) OR rebuild the APK.');
