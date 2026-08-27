import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Receipt, Package, Truck, CheckCircle2, XCircle, FileText, ChevronLeft, User, Clock } from "lucide-react";

function fmt(n: number) {
  return (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function mapStage(status: string): "Invoicing" | "Packaging" | "Dispatch" | "Rejected" {
  const s = String(status || "").toLowerCase();
  if (s.includes("reject")) return "Rejected";
  if (s.includes("dispatch") || s.includes("ship")) return "Dispatch";
  if (s.includes("pack")) return "Packaging";
  return "Invoicing";
}

const STAGES = [
  { key: "Invoicing", label: "Invoicing", desc: "Admin is preparing your invoice", Icon: Receipt },
  { key: "Packaging", label: "Packaging", desc: "Your order is being packed",     Icon: Package },
  { key: "Dispatch",  label: "Dispatch",  desc: "Order is out for delivery",      Icon: Truck },
] as const;

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ just_placed?: string }>;
}) {
  const { id } = await params;
  const { just_placed } = await searchParams;

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/customer-login");

  const sb = supabaseAdmin();
  const { data: order } = await sb
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) notFound();

  const { data: items } = await sb
    .from("order_items")
    .select("*")
    .eq("order_id", id)
    .order("id");

  const { data: invoice } = await sb
    .from("invoices")
    .select("invoice_no, status, net_amount, invoice_date")
    .eq("order_id", id)
    .maybeSingle();

  const stage = mapStage(order.status);
  const stageIdx = STAGES.findIndex((s) => s.key === stage);
  const isRejected = stage === "Rejected";

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <Link href="/shop/orders" className="text-xs font-bold text-brand-700 hover:underline flex items-center gap-1 mb-3">
          <ChevronLeft className="w-3.5 h-3.5" /> All orders
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-black text-slate-900 font-mono">{order.id}</h1>
            <p className="text-sm text-slate-500">{order.date || new Date(order.created_at).toLocaleDateString("en-IN")}</p>
          </div>
          <p className="text-2xl font-black text-brand-800 tabular-nums">₹{fmt(order.total)}</p>
        </div>
      </div>

      {/* Just-placed hero */}
      {just_placed && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-6 h-6 text-brand-700 shrink-0" />
          <div>
            <p className="font-black text-brand-900">Order placed successfully!</p>
            <p className="text-xs text-brand-700 mt-0.5">Admin will review and approve your invoice shortly. You'll get a notification.</p>
          </div>
        </div>
      )}

      {/* Status banner */}
      {isRejected ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-6 h-6 text-rose-700 shrink-0" />
          <div>
            <p className="font-black text-rose-900">Order Rejected</p>
            <p className="text-xs text-rose-800 mt-0.5">Credit has been refunded to your account.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-brand-800 text-white flex items-center justify-center shrink-0">
            {(() => {
              const S = STAGES[stageIdx]?.Icon || Clock;
              return <S className="w-5 h-5" />;
            })()}
          </div>
          <div>
            <p className="font-black text-brand-900">{STAGES[stageIdx]?.label || order.status}</p>
            <p className="text-xs text-slate-600 mt-0.5">{STAGES[stageIdx]?.desc || "Awaiting update"}</p>
          </div>
        </div>
      )}

      {/* Invoice card */}
      {!isRejected && (
        <a
          href={invoice ? `/api/invoices/${order.id}/html` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-brand-300 hover:shadow-sm transition-all block"
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            stageIdx > 0 ? "bg-brand-800 text-white" : "bg-amber-100 text-amber-800"
          }`}>
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="font-black text-slate-900 text-sm">
              {stageIdx > 0 ? `Invoice ${invoice?.invoice_no || "ready"}` : "Invoice pending approval"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {stageIdx > 0
                ? "Tap to view · print · save as PDF"
                : "Admin is reviewing. You can view the draft."}
            </p>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-400 rotate-180" />
        </a>
      )}

      {/* 3-stage stepper */}
      {!isRejected && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-4">Progress</p>
          <div className="flex items-center justify-between">
            {STAGES.map((s, i) => {
              const done = i < stageIdx;
              const active = i === stageIdx;
              const isLast = i === STAGES.length - 1;
              const S = s.Icon;
              return (
                <div key={s.key} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center border-2 ${
                      done || active ? "bg-brand-800 text-white border-brand-800" : "bg-slate-100 text-slate-400 border-slate-200"
                    }`}>
                      {done ? <CheckCircle2 className="w-5 h-5" /> : <S className="w-5 h-5" />}
                    </div>
                    <p className={`mt-2 text-xs font-black text-center ${done || active ? "text-brand-800" : "text-slate-400"}`}>
                      {s.label}
                    </p>
                  </div>
                  {!isLast && (
                    <div className={`flex-1 h-1 mx-2 rounded ${done ? "bg-brand-800" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delivery info */}
      {stage === "Dispatch" && order.courier_name && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-brand-50 text-brand-800 flex items-center justify-center shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Delivery Assigned To</p>
            <p className="font-black text-slate-900 text-base mt-0.5">{order.courier_name}</p>
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Order items · {items?.length || 0}</p>
        </div>
        <div className="divide-y divide-slate-100">
          {(items || []).map((it: any, idx: number) => (
            <div key={it.id} className="p-4 flex items-center gap-3">
              <div className="w-8 text-center text-slate-400 text-xs font-black">{idx + 1}</div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm">{it.product_name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[it.packing, `HSN ${it.hsn || "—"}`, `GST ${it.gst_percent ?? 12}%`].filter(Boolean).join(" · ")}
                  {it.batch_no && <> · Batch {it.batch_no}{it.expiry_date ? ` (exp ${it.expiry_date})` : ""}</>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-black text-slate-900 tabular-nums">₹{fmt(it.line_total ?? it.price_at_time * it.quantity)}</p>
                <p className="text-[10px] text-slate-500">{it.quantity} × ₹{fmt(it.price_at_time)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-1 text-sm">
          <Row label="Subtotal" value={`₹${fmt(order.subtotal)}`} />
          {order.discount_value > 0 && <Row label="Discount" value={`− ₹${fmt(order.discount_value)}`} valueClass="text-brand-700" />}
          <Row label="GST (12%)" value={`₹${fmt(order.gst)}`} />
          <div className="flex justify-between pt-2 mt-2 border-t border-slate-200 items-baseline">
            <span className="font-black text-slate-900">Total</span>
            <span className="text-xl font-black text-brand-800 tabular-nums">₹{fmt(order.total)}</span>
          </div>
        </div>
      </div>

      <Link href="/shop/catalog" className="block text-center text-sm font-bold text-brand-700 hover:underline">
        Continue shopping →
      </Link>
    </div>
  );
}

function Row({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold tabular-nums ${valueClass || "text-slate-900"}`}>{value}</span>
    </div>
  );
}
