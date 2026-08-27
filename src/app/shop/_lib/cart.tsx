"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// Cart line item — keeps product snapshot so cart persists even if catalog changes.
export type CartItem = {
  id: number;
  name: string;
  company?: string | null;
  packing?: string | null;
  hsn?: string | null;
  gst_percent?: number | null;
  mrp?: number | null;
  price: number;         // unit price (PTR)
  quantity: number;
  image?: string | null;
};

type CartCtx = {
  items: CartItem[];
  totalQty: number;
  subtotal: number;
  addItem: (p: Omit<CartItem, "quantity">, qty?: number) => void;
  setQty: (id: number, qty: number) => void;
  remove: (id: number) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const STORAGE_KEY = "upkem_shop_cart_v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  // Persist on change
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch { /* ignore */ }
  }, [items, ready]);

  const addItem: CartCtx["addItem"] = (p, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((x) => x.id === p.id);
      if (existing) {
        return prev.map((x) => x.id === p.id ? { ...x, quantity: x.quantity + qty } : x);
      }
      return [...prev, { ...p, quantity: qty }];
    });
  };

  const setQty: CartCtx["setQty"] = (id, qty) => {
    setItems((prev) => {
      if (qty <= 0) return prev.filter((x) => x.id !== id);
      return prev.map((x) => x.id === id ? { ...x, quantity: qty } : x);
    });
  };

  const remove: CartCtx["remove"] = (id) => setItems((prev) => prev.filter((x) => x.id !== id));
  const clear = () => setItems([]);

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <Ctx.Provider value={{ items, totalQty, subtotal, addItem, setQty, remove, clear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used within CartProvider");
  return c;
}
