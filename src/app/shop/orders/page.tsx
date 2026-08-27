import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { FileText, Package, Truck, Receipt, ChevronRight, CheckCircle2, XCircle, Clock } from "lucide-react";

function fmt(n: number) {
  return (n || 0).toLocaleString("en-IN");
}

function mapStage(status: string): "Invoicing" | "Packaging" | "Dispatch" | "Rejected" {
  const s = String(status || "").toLowerCase();
  if (s.includes("reject")) return "Rejected";
  if (s.includes("dispatch") || s.includes("ship")) return "Dispatch";
  if (s.includes("pack")) return "Packaging";
  return "Invoicing";
}

function StageBadge({ status }: { status: string }) {
  const stage = mapStage(status);
  const cfg = {
    Invoicing: { label: "Invoicing", cls: "bg-slate-100 text-slate-700 border-slate-200", Icon: Receipt },
    Packaging: { label: "Packaging", cls: "bg-amber-100 text-amber-800 border-amber-200", Icon: Package },
    Dispatch:  { label: "Dispatch",  cls: "bg-brand-100 text-brand-800 border-brand-200", Icon: Truck },
    Rejected:  { label: "Rejected",  cls: "bg-rose-100 text-rose-800 border-rose-200",   Icon: XCircle },
  }[stage];
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider border ${cfg.cls}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

export default async function OrdersPage() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const sb = supabaseAdmin();
  const { data: orders } = await sb
    .from("orders")
    .select("id, status, total, date, created_at, courier_name")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">My Orders</h1>
          <p className="text-sm text-slate-500 mt-1">{orders?.length ?? 0} orders placed</p>
        </div>
        <Link
          href="/shop/catalog"
          className="text-xs font-bold text-brand-800 hover:underline"
        >
          Browse catalog →
        </Link>
      </div>

      {(!orders || orders.length === 0) ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Receipt className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <p className="font-bold text-slate-900">No orders yet</p>
          <p className="text-sm text-slate-500 mt-1">Your placed orders will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {orders.map((o) => {
            const stage = mapStage(o.status);
            const hasInvoice = stage === "Packaging" || stage === "Dispatch";
            return (
              <Link
                key={o.id}
                href={`/shop/orders/${o.id}`}
                className="flex items-center gap-4 p-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-sm text-slate-900">{o.id}</span>
                    <StageBadge status={o.status} />
                    {hasInvoice && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-800 bg-brand-50 border border-brand-200 px-1.5 py-0.5 rounded">
                        <FileText className="w-2.5 h-2.5" /> Invoice ready
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                    <Clock className="w-3 h-3" /> {o.date || new Date(o.created_at).toLocaleDateString("en-IN")}
                    {stage === "Dispatch" && o.courier_name && (
                      <span className="text-brand-700 font-semibold">· Delivery: {o.courier_name}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-black text-slate-900 tabular-nums">₹{fmt(o.total)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
