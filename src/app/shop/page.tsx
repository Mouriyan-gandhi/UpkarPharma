import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Package, Receipt, ShoppingCart, User, ArrowRight, TrendingUp, AlertCircle, Pill } from "lucide-react";

// Feature flag mirroring the catalog page. When enabled, the home-page
// "Top products" carousel only surfaces Derma SKUs so a customer's first
// impression matches the launch scope.
const CATALOG_MODE = process.env.NEXT_PUBLIC_CATALOG_MODE || "derma";
const DERMA_ONLY = CATALOG_MODE === "derma";
const LOCKED_CATEGORY = "Derma";

// Server component — fetches this user's data via service_role. In Derma
// mode we bias the featured carousel toward OTC SKUs (Sunscreen, Moisturizer,
// Face Wash, Serum) so the first thing a retailer sees is browsable and
// friendly, not a wall of Rx dermatology drugs.
const FEATURED_OTC_SUBS = [
  "Sunscreen", "Moisturizer & Skin Care", "Face Wash & Cleanser",
  "Serum", "Fairness & Depigmentation", "Hair Care",
];

async function loadHomeData(userId: string) {
  const sb = supabaseAdmin();
  const productsQ = DERMA_ONLY
    ? sb.from("products")
        .select("id, name, company, packing, price, price_ptr, mrp, images, image_url, category, body_system")
        .eq("category", LOCKED_CATEGORY)
        .in("body_system", FEATURED_OTC_SUBS)
        .order("id", { ascending: false })   // newer entries first
        .limit(8)
    : sb.from("products")
        .select("id, name, company, packing, price, price_ptr, mrp, images, image_url, category, body_system")
        .order("id", { ascending: true })
        .limit(8);

  const [{ data: products }, { data: orders }] = await Promise.all([
    productsQ,
    sb.from("orders").select("id, status, total, date, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(5),
  ]);
  return { products: products || [], orders: orders || [] };
}

async function getUser() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("users")
    .select("id, phone, store_name, credit_balance, credit_limit, user_type, city")
    .eq("id", user.id)
    .maybeSingle();
  return data;
}

function fmt(n: number) {
  return (n || 0).toLocaleString("en-IN");
}

export default async function ShopHome() {
  const user = await getUser();
  if (!user) return null;   // layout will redirect

  const { products, orders } = await loadHomeData(user.id);
  const available = Math.max(0, (user.credit_limit || 0) - (user.credit_balance || 0));
  const utilization = user.credit_limit > 0 ? Math.min(100, (user.credit_balance / user.credit_limit) * 100) : 0;
  const creditWarn = utilization > 75;
  const lastOrder = orders[0];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  return (
    <div className="space-y-6">
      {/* Hero card — greeting only. Full credit + order stats live in /shop/profile
          so the home page stays focused on browse-and-order (the primary action). */}
      <div className="bg-brand-900 text-white rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff'%3E%3Ccircle cx='7' cy='7' r='2'/%3E%3Ccircle cx='37' cy='37' r='2'/%3E%3C/g%3E%3C/svg%3E")`
        }} />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-brand-100/80 text-sm font-semibold">Good {greeting},</p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight mt-1">{user.store_name}</h1>
            <p className="text-brand-100/70 text-sm mt-1">{user.user_type || "Pharmacy"}{user.city ? ` · ${user.city}` : ""}</p>
          </div>
          <Link href="/shop/profile" className="text-xs font-bold text-brand-100 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg backdrop-blur">
            Credit ₹{fmt(available)} <span className="opacity-60">/ ₹{fmt(user.credit_limit)}</span>
          </Link>
        </div>
      </div>

      {creditWarn && (
        <div className={`rounded-xl p-4 border flex items-center gap-3 ${
          utilization > 90 ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1 text-sm font-semibold">
            You've used {Math.round(utilization)}% of your credit limit. {utilization > 90 ? "Settle invoices soon to keep ordering." : "Consider settling recent invoices."} <Link href="/shop/profile" className="underline font-bold">View credit →</Link>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/shop/catalog", label: "Browse Catalog", icon: Package, hint: `${products.length}+ products` },
          { href: "/shop/cart", label: "View Cart", icon: ShoppingCart, hint: "Continue checkout" },
          { href: "/shop/orders", label: "My Orders", icon: Receipt, hint: `${orders.length} placed` },
          { href: "/shop/profile", label: "Profile", icon: User, hint: "Update details" },
        ].map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="bg-white rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:shadow-md transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-800 flex items-center justify-center mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <p className="font-bold text-slate-900 text-sm">{a.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{a.hint}</p>
            </Link>
          );
        })}
      </div>

      {/* Last order — repeat CTA */}
      {lastOrder && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900">Last order</h3>
              <p className="text-xs text-slate-500 mt-0.5">{lastOrder.date} · <span className="font-mono">{lastOrder.id}</span></p>
            </div>
            <Link href={`/shop/orders/${lastOrder.id}`} className="text-xs font-bold text-brand-800 hover:underline flex items-center gap-1">
              View <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</p>
              <p className="text-xl font-black text-slate-900 tabular-nums mt-1">₹{fmt(lastOrder.total)}</p>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded ${
              lastOrder.status === "Invoicing" ? "bg-slate-100 text-slate-700"
              : lastOrder.status === "Packaging" ? "bg-amber-100 text-amber-800"
              : lastOrder.status === "Dispatch" ? "bg-brand-100 text-brand-800"
              : "bg-rose-100 text-rose-800"
            }`}>
              {lastOrder.status?.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* Featured products */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-700" />
              {DERMA_ONLY ? "Popular in Derma" : "Top products"}
            </h3>
            {DERMA_ONLY && (
              <p className="text-[11px] text-slate-500 mt-0.5">Sunscreens · Serums · Moisturizers · Face care</p>
            )}
          </div>
          <Link href="/shop/catalog" className="text-xs font-bold text-brand-800 hover:underline flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
          {products.map((p) => {
            const image = (p.images && p.images[0]) || p.image_url;
            const ptr = Number(p.price_ptr) || 0;
            const price = ptr > 0 ? ptr : Number(p.price) || 0;
            const mrp = Number(p.mrp) || 0;
            const isRx = !!p.body_system && p.body_system.includes("(Rx)");
            return (
              <Link
                key={p.id}
                href={`/shop/catalog?id=${p.id}`}
                className="border border-slate-100 rounded-lg p-3 hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5 transition-all bg-white"
              >
                <div className="aspect-square rounded bg-slate-50 mb-2 flex items-center justify-center overflow-hidden relative">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Pill className="w-8 h-8 text-slate-300" />
                  )}
                  {isRx && (
                    <span className="absolute top-1.5 left-1.5 bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm">
                      Rx
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug">{p.name}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 truncate">{p.company || p.category}</p>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-sm font-black text-brand-800 tabular-nums">₹{fmt(price)}</span>
                  {mrp > price && (
                    <span className="text-[10px] text-slate-400 line-through">₹{fmt(mrp)}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
