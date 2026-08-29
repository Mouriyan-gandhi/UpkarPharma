"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, Pill, ShoppingCart, ArrowRight, AlertCircle, Loader2, Tag, Check } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useCart } from "../_lib/cart";

const MIN_ORDER_VALUE = 2500;
const GST_RATE = 0.12;

function fmt(n: number) {
  return (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// Generate a customer-facing order id. Format: UPK-<random>
function newOrderId(): string {
  return "UPK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function CartPage() {
  const cart = useCart();
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState("");

  // Load user profile for credit check
  useEffect(() => {
    fetch("/api/data")
      .then((r) => r.json())
      .then((d) => {
        const u = (d.users || []).find((x: any) => !x.role || x.role === 'client') || d.users?.[0];
        setUser(u);
      })
      .catch(() => { });
  }, []);

  const subtotal = cart.subtotal;
  const discount = appliedCoupon
    ? appliedCoupon.scheme_type === "Discount"
      ? Math.min((subtotal * (appliedCoupon.discount_percent || 0)) / 100, appliedCoupon.max_discount ?? Infinity)
      : Math.min(appliedCoupon.flat_discount || 0, subtotal)
    : 0;
  const taxable = Math.max(0, subtotal - discount);
  const gst = Math.round(taxable * GST_RATE * 100) / 100;
  const total = Math.round((taxable + gst) * 100) / 100;

  const availableCredit = user ? Math.max(0, (user.credit_limit || 0) - (user.credit_balance || 0)) : 0;
  const overCredit = user && total > availableCredit;
  const belowMinimum = subtotal > 0 && subtotal < MIN_ORDER_VALUE;

  const applyCoupon = async () => {
    if (!coupon.trim()) return;
    setValidatingCoupon(true);
    setCouponError("");
    try {
      const res = await fetch("/api/schemes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: coupon.trim(), order_subtotal: subtotal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error || "Invalid coupon");
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon(data.scheme);
        setCoupon(data.scheme.code);
      }
    } finally {
      setValidatingCoupon(false);
    }
  };

  const placeOrder = async () => {
    if (cart.items.length === 0) return;
    if (belowMinimum) return;   // min order is still hard-enforced
    // over-credit is now a soft warning only — admin allows overrun
    setPlacing(true);
    setPlaceError("");

    const id = newOrderId();
    const payload = {
      collection: "orders",
      action: "create",
      item: {
        id,
        date: new Date().toLocaleDateString("en-GB"),
        items: cart.items.map((i) => ({ id: i.id, quantity: i.quantity })),
        scheme_code: appliedCoupon?.code || null,
      },
    };
    try {
      const res = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setPlaceError(data.error || "Order failed. Please try again.");
        setPlacing(false);
        return;
      }
      cart.clear();
      router.push(`/shop/orders/${id}?just_placed=1`);
    } catch {
      setPlaceError("Network error. Please try again.");
      setPlacing(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
        <ShoppingCart className="w-14 h-14 mx-auto mb-4 text-slate-300" />
        <h2 className="text-xl font-black text-slate-900">Your cart is empty</h2>
        <p className="text-slate-500 mt-2">Browse the catalog to add products.</p>
        <Link
          href="/shop/catalog"
          className={cn(buttonVariants({ variant: "default" }), "mt-6 bg-brand-800 hover:bg-brand-900 text-white")}
        >
          Browse Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
      {/* Line items */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-black text-slate-900">Cart · {cart.totalQty} items</h2>
          <button onClick={() => cart.clear()} className="text-xs font-bold text-rose-600 hover:underline">
            Clear all
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {cart.items.map((item) => (
            <div key={item.id} className="p-4 flex items-center gap-4">
              <div className="w-16 h-16 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <Pill className="w-6 h-6 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-900 text-sm leading-tight">{item.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {[item.company, item.packing].filter(Boolean).join(" · ")} · ₹{fmt(item.price)}/unit
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg h-9">
                  <button onClick={() => cart.setQty(item.id, item.quantity - 1)} className="w-8 h-9 flex items-center justify-center hover:bg-slate-100 rounded-l-lg">
                    <Minus className="w-3.5 h-3.5 text-slate-700" />
                  </button>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => cart.setQty(item.id, parseInt(e.target.value) || 0)}
                    className="w-12 text-center text-sm font-black text-slate-800 bg-transparent border-0 focus:outline-none tabular-nums"
                  />
                  <button onClick={() => cart.setQty(item.id, item.quantity + 1)} className="w-8 h-9 flex items-center justify-center hover:bg-slate-100 rounded-r-lg">
                    <Plus className="w-3.5 h-3.5 text-slate-700" />
                  </button>
                </div>
                <div className="w-24 text-right">
                  <p className="text-sm font-black text-slate-900 tabular-nums">₹{fmt(item.price * item.quantity)}</p>
                </div>
                <button onClick={() => cart.remove(item.id)} className="w-8 h-8 flex items-center justify-center text-rose-500 hover:bg-rose-50 rounded">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary panel */}
      <div className="lg:sticky lg:top-24 h-fit space-y-4">
        {/* Coupon */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" /> Coupon code
          </p>
          {appliedCoupon ? (
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-brand-900 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {appliedCoupon.code}
                </p>
                <p className="text-[11px] text-brand-700 font-semibold mt-0.5">
                  {appliedCoupon.scheme_type === "Discount"
                    ? `${appliedCoupon.discount_percent}% off`
                    : `₹${appliedCoupon.flat_discount} off`}
                </p>
              </div>
              <button onClick={() => { setAppliedCoupon(null); setCoupon(""); }} className="text-xs text-rose-600 font-bold hover:underline">
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                placeholder="Enter code"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                className="h-10 uppercase font-mono"
              />
              <Button onClick={applyCoupon} disabled={!coupon.trim() || validatingCoupon} className="h-10 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold">
                {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
          )}
          {couponError && (
            <p className="text-xs text-rose-600 font-semibold mt-2">{couponError}</p>
          )}
        </div>

        {/* Totals */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Order summary</h3>
          <div className="space-y-2 text-sm">
            <Row label={`Subtotal (${cart.totalQty} items)`} value={`₹${fmt(subtotal)}`} />
            {discount > 0 && <Row label="Discount" value={`− ₹${fmt(discount)}`} valueClass="text-brand-700" />}
            <Row label="GST (12%)" value={`₹${fmt(gst)}`} />
            <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between items-baseline">
              <span className="font-black text-slate-900">Total</span>
              <span className="text-xl font-black text-brand-800 tabular-nums">₹{fmt(total)}</span>
            </div>
          </div>

          {/* Warnings */}
          {belowMinimum && (
            <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>Minimum order is ₹{MIN_ORDER_VALUE.toLocaleString("en-IN")}. Add ₹{fmt(MIN_ORDER_VALUE - subtotal)} more to check out.</div>
            </div>
          )}
          {overCredit && (
            <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                Heads up — this order (₹{fmt(total)}) will push you ₹{fmt(total - availableCredit)} over your available credit of ₹{fmt(availableCredit)}. You can still place it; please settle previous invoices soon.
              </div>
            </div>
          )}
          {placeError && (
            <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>{placeError}</div>
            </div>
          )}

          <Button
            onClick={placeOrder}
            className="w-full mt-4 h-12 bg-brand-800 hover:bg-brand-900 text-white font-black text-base"
            disabled={placing || belowMinimum}
          >
            {placing ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Placing order…</>
            ) : (
              <>Place Order · ₹{fmt(total)} <ArrowRight className="w-4 h-4 ml-2" /></>
            )}
          </Button>

          {user && (
            <p className="text-[11px] text-slate-500 text-center mt-3">
              Available credit: <span className="font-bold text-slate-700">₹{fmt(availableCredit)}</span> · 60-day terms
            </p>
          )}
        </div>
      </div>
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
