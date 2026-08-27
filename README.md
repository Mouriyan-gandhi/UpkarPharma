# UpkarPharma

Full-stack B2B pharmacy platform for Upkar Pharma — a Next.js 16 web app (admin dashboard + customer storefront) and an Expo React Native mobile app, backed by Supabase (Postgres + Auth + Storage).

---

## What's in here

| Path | What it is |
| --- | --- |
| `src/app/admin` | Internal admin dashboard — user approvals, products, schemes, orders, invoices, notifications |
| `src/app/shop` | Customer-facing web storefront — catalog, cart, orders, profile |
| `src/app/customer-login`, `src/app/customer-signup` | Customer web auth pages |
| `src/app/api/*` | Next.js Route Handlers (auth, data, invoices, shop catalog, notifications, uploads, WhatsApp integration) |
| `src/lib/supabase/{admin,browser,server}.ts` | Supabase client factories per runtime context |
| `src/lib/{auth,db,invoice,whatsapp,upkem-company}.ts` | Shared server helpers |
| `mobile/` | Expo React Native app — the same platform for pharmacy staff on Android/iOS |
| `supabase/migrations/` | Postgres schema (`0001_init.sql`, `0002_profile_change_requests.sql`) |
| `scripts/` | Ops + one-shot maintenance scripts (see [Scripts](#scripts)) |

---

## Stack

**Web (`/`)**
- Next.js 16.2 (App Router) on Node ≥ 22
- React 19.2, TypeScript 5
- Tailwind CSS 4 + shadcn-style components (`@base-ui/react`, Lucide icons)
- Supabase JS (`@supabase/supabase-js`, `@supabase/ssr`) for auth + Postgres
- `pg` for direct DB access from ops scripts
- `recharts` for admin analytics, `xlsx` for Excel import/export

**Mobile (`/mobile`)**
- Expo 54, React Native 0.81
- React Navigation 7 (bottom tabs + native stack)
- Zustand for state, AsyncStorage for persistence
- Expo Notifications, Haptics, Print

**Backend**
- Supabase Postgres (schema in `supabase/migrations/`)
- Supabase Auth — email fallback today, phone/OTP once the SMS provider is enabled (see [Known limitations](#known-limitations))
- Supabase Storage for product images
- Optional WhatsApp bot webhook (OpenWA/Baileys) for order notifications

---

## Getting started

### Prerequisites
- Node ≥ 22 (see `.nvmrc`)
- A Supabase project (free tier is fine)
- Optional: WhatsApp bot for notifications, Firebase project (mobile push only)

### 1. Install

```bash
npm install
cd mobile && npm install && cd ..
```

### 2. Configure environment

Copy `.env.example` → `.env.local` and fill in:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # server-only, bypasses RLS
SUPABASE_DB_URL=postgres://...          # session-pooler URL for scripts

# Legacy (still used by a few routes during the migration)
JWT_SECRET=<48+ random bytes, base64url>

# Optional
NEXT_PUBLIC_BASE_URL=https://your-app.example.com
OPENWA_WEBHOOK_URL=https://your-whatsapp-bot.example.com/send
```

### 3. Apply the schema

Point `SUPABASE_DB_URL` at your project (session pooler URL — IPv4-friendly) and run the migrations:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_profile_change_requests.sql
```

Sanity-check the schema and connectivity:

```bash
node scripts/pg-ping.mjs
node scripts/supabase-ping.mjs
node scripts/supabase-verify-schema.mjs
```

### 4. Run

```bash
npm run dev            # web on http://localhost:3000
cd mobile && npm start # Expo dev server
```

Web dev server binds to `0.0.0.0` so the mobile app on a phone on the same LAN can hit it.

---

## Routes

### Admin (`src/app/admin`)
- `/login` → admin sign-in (email fallback; will switch to phone/password once the Supabase phone provider is enabled)
- `/admin` → dashboard: users, products, schemes, orders, invoices, notifications

### Customer web (`src/app/shop`)
- `/customer-signup`, `/customer-login`
- `/shop` → home / catalog entry
- `/shop/catalog`, `/shop/cart`, `/shop/orders`, `/shop/orders/[id]`
- `/shop/notifications`, `/shop/profile`

### API (`src/app/api/*`)
- **Auth**: `auth/route`, `auth/otp`, `auth/verify`, `auth/signup`, `auth/sessions`, `auth/dev-login`, `auth/set-signup-password`, `auth/verify-admin-password`
- **Customer auth**: `customer-auth`
- **Data**: `data` (catalog + orders for the mobile app), `shop/categories`, `shop/products`
- **Invoices**: `invoice` (legacy), `invoices/[orderId]` (get/update/approve/render HTML/edit lines)
- **Schemes** (B2B promos): `schemes`, `schemes/validate`
- **Profile change requests**: `profile-change-requests` (customer-initiated edits pending admin approval)
- **Ops**: `notifications`, `upload`, `product-image`, `user/delete`, `user/token`

---

## Scripts

Under `scripts/`:

| Script | What it does |
| --- | --- |
| `supabase-ping.mjs` | Check Supabase REST connectivity |
| `supabase-verify-schema.mjs` | Diff local migration expectations against remote |
| `supabase-audit.mjs` | Audit users / orders / invoices for consistency |
| `supabase-test-login.mjs` | Verify auth flow end-to-end against remote |
| `pg-ping.mjs` | Check direct `pg` connectivity |
| `migrate-sqlite-to-supabase.mjs` | One-shot migration of the legacy `database.sqlite` into Postgres |
| `backfill-admin-emails.mjs`, `backfill-client-emails.mjs` | Backfill `admin-<phone>@upkem.internal` / customer emails on `auth.users` |
| `seed-admin.js` | Idempotent admin seeder |
| `reset-invoice-counter.mjs`, `reset-test-invoice.mjs`, `test-create-invoice.mjs` | Invoice number reset + smoke tests |
| `check-prices.mjs` | Product price sanity check |

Legacy Python / older JS scripts (`ocr_and_match_catalog.py`, `parse_excel_*`, `migrate*.js`, `populate_db.js`, etc.) come from the initial catalog extraction and SQLite-era migrations — kept for reference.

---

## Deploy

### Web — Vercel

Native fit for the Next.js 16 App Router — Route Handlers deploy as serverless functions, static assets go on the edge, and there's zero config.

1. Import the repo in the Vercel dashboard (Framework preset: **Next.js**, Root Directory: **`/`**, Node version: **22.x**).
2. Add every env var from `.env.example` under **Settings → Environment Variables** (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `JWT_SECRET`, and any optional ones you use).
3. Deploy. Preview URL will be at `https://<project>.vercel.app`.

Post-deploy: set `NEXT_PUBLIC_BASE_URL` to the production URL so invoice/WhatsApp links resolve correctly.

### Mobile — Expo Application Services (EAS)

`mobile/eas.json` holds the build profiles. Build:

```bash
cd mobile
APP_ENV=production \
API_BASE_URL=https://your-app.vercel.app \
eas build --profile production
```

Ship OTA updates via `expo publish`.

---

## Known limitations

- **Supabase Phone Auth is not enabled** in the target project yet — it needs SMS provider credentials (MSG91 / Twilio / Vonage / MessageBird). Until then:
  - Admin login uses an **email fallback** (each admin `auth.users` row has an autogenerated `admin-<phone>@upkem.internal` email)
  - Mobile OTP flow can't be end-to-end tested
  - Once creds are procured, enable Phone in the Supabase dashboard and switch admin login back to `signInWithPassword({phone, password})` in `src/app/api/auth/route.ts`.
- The migration from SQLite → Supabase is done in code, but the `better-sqlite3` and `firebase-admin` packages are still listed as deps while a few legacy code paths finish being ported.
