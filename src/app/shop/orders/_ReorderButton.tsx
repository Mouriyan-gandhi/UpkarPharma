"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";
import { useCart } from "../_lib/cart";

// Reorder — fetches the invoice payload for an order and adds each line
// item to the cart at its historical quantity, then navigates to /shop/cart
// so the buyer can adjust and confirm.
//
// This is the #1 B2B pharma loop (weekly / fortnightly repeat orders),
// so it needs to be one tap. The button is stateful (idle → loading →
// added) so the buyer gets visual feedback without a modal.
export default function ReorderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const cart = useCart();
  const [state, setState] = useState<"idle" | "loading" | "done" | "err">("idle");

  const reorder = async (e: React.MouseEvent) => {
    // Row is wrapped in a Link — stop the click from also navigating to the detail page.
    e.stopPropagation();
    e.preventDefault();
    if (state !== "idle") return;

    setState("loading");
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(orderId)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const items = data.items || [];
      if (items.length === 0) throw new Error("No items on this order");

      for (const it of items) {
        cart.addItem({
          id: it.product_id,
          name: it.product_name,
          company: it.mfr,
          packing: it.packing,
          hsn: it.hsn,
          gst_percent: it.gst_percent,
          mrp: Number(it.mrp) || null,
          price: Number(it.price_at_time) || 0,
          image: null,
        }, Number(it.quantity) || 1);
      }
      setState("done");
      setTimeout(() => router.push("/shop/cart"), 300);
    } catch {
      setState("err");
      setTimeout(() => setState("idle"), 2500);
    }
  };

  return (
    <button
      onClick={reorder}
      disabled={state === "loading" || state === "done"}
      className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-bold border transition-colors ${
        state === "done"  ? "bg-brand-50 text-brand-800 border-brand-200"
      : state === "err"   ? "bg-rose-50 text-rose-700 border-rose-200"
      :                     "bg-white text-slate-700 border-slate-200 hover:border-brand-300 hover:text-brand-800"
      }`}
      title="Add all items from this order to your cart"
    >
      {state === "loading" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
      {state === "loading" ? "Adding…" : state === "done" ? "In cart" : state === "err" ? "Try again" : "Reorder"}
    </button>
  );
}
