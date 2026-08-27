import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Package, Receipt, ShoppingCart, User, ArrowRight, TrendingUp, AlertCircle, Pill } from "lucide-react";

// Server component — fetches this user's data via service_role (RLS would need
// user-scoped Supabase client; keeping server-side + explicit user filter for
// simplicity in Phase 1).
async function loadHomeData(userId: string) {
  const sb = supabaseAdmin();
  const [{ data: products }, { data: orders }] = await Promise.all([
    sb.from("products").select("id, name, company, packing, price, price_ptr, mrp, images, image_url, category").order("id", { ascending: true }).limit(8),
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
      {/* Hero card */}
      <div className="bg-brand-900 text-white rounded-2xl p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23fff'%3E%3Ccircle cx='7' cy='7' r='2'/%3E%3Ccircle cx='37' cy='37' r='2'/%3E%3C/g%3E%3C/svg%3E")`
        }} />
        <div className="relative">
          <p className="text-brand-100/80 text-sm font-semibold">Good {greeting},</p>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight mt-1">{user.store_name}</h1>
          <p className="text-brand-100/70 text-sm mt-1">{user.user_type || "Pharmacy"}{user.city ? ` · ${user.city}` : ""}</p>

          {/* Credit summary */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
              <p className="text-[10px] font-bold text-brand-100/80 uppercase tracking-wider">Available Credit</p>
              <p className="text-lg md:text-xl font-black text-white mt-1 tabular-nums">₹{fmt(available)}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
              <p className="text-[10px] font-bold text-brand-100/80 uppercase tracking-wider">Credit Used</p>
              <p className="text-lg md:text-xl font-black text-white mt-1 tabular-nums">₹{fmt(user.credit_balance)}</p>
              <div className="w-full h-1 bg-white/20 rounded-full mt-2">
                <div className={`h-1 rounded-full ${utilization > 90 ? "bg-rose-400" : utilization > 60 ? "bg-amber-300" : "bg-brand-300"}`} style={{ width: `${utilization}%` }} />
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
              <p className="text-[10px] font-bold text-brand-100/80 uppercase tracking-wider">Total Orders</p>
              <p className="text-lg md:text-xl font-black text-white mt-1 tabular-nums">{orders.length}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
              <p className="text-[10px] font-bold text-brand-100/80 uppercase tracking-wider">Payment Terms</p>
              <p className="text-lg md:text-xl font-black text-white mt-1">60 days</p>
            </div>
          </div>
        </div>
      </div>

      {creditWarn && (
        <div className={`rounded-xl p-4 border flex items-center gap-3 ${
          utilization > 90 ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1 text-sm font-semibold">
            You've used {Math.round(utilization)}% of your credit limit. {utilization > 90 ? "Settle invoices soon to keep ordering." : "Consider settling recent invoices."}
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
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-700" /> Top products
          </h3>
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
            return (
              <Link
                key={p.id}
                href={`/shop/catalog?id=${p.id}`}
                className="border border-slate-100 rounded-lg p-3 hover:border-brand-300 hover:shadow-sm transition-all bg-white"
              >
                <div className="aspect-square rounded bg-slate-50 mb-2 flex items-center justify-center overflow-hidden">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Pill className="w-8 h-8 text-slate-300" />
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
