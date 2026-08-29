"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Filter, Plus, Minus, Pill, ChevronLeft, ChevronRight, X, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCart } from "../_lib/cart";

type Product = {
  id: number;
  name: string;
  code?: string | null;
  company?: string | null;
  category?: string | null;
  packing?: string | null;
  hsn?: string | null;
  gst_percent?: number | null;
  price: number;
  price_ptr?: number | null;
  mrp?: number | null;
  stock: number;
  description?: string | null;
  composition?: string | null;
  drug_name?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  short_expiry?: boolean;
  discount_percent?: number | null;
  expiry_date?: string | null;
};

const PER_PAGE = 48;
const MIN_ORDER = 2500;

function firstImage(p: Product): string | null {
  if (p.images && p.images.length > 0) return p.images[0];
  return p.image_url || null;
}

function unitPrice(p: Product): number {
  const ptr = Number(p.price_ptr) || 0;
  if (ptr > 0) return ptr;
  return Number(p.price) || 0;
}

export default function CatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cart = useCart();

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [shortExpiry, setShortExpiry] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);

  // Load categories once. Cached in sessionStorage so tab-navigation
  // doesn't refetch — categories almost never change during a session.
  useEffect(() => {
    const cached = typeof window !== 'undefined' ? sessionStorage.getItem('shop:categories') : null;
    if (cached) {
      try { setCategories(JSON.parse(cached)); } catch { /* ignore */ }
    }
    fetch("/api/shop/categories")
      .then((r) => r.json())
      .then((d) => {
        const cats = d.categories || [];
        setCategories(cats);
        try { sessionStorage.setItem('shop:categories', JSON.stringify(cats)); } catch { /* ignore quota */ }
      })
      .catch(() => { });
  }, []);

  // Sync detail id from URL
  useEffect(() => {
    const id = searchParams.get("id");
    setDetailId(id ? Number(id) : null);
  }, [searchParams]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debounced, category, shortExpiry]);

  // Fetch products. Ignore stale responses when the user has already
  // typed a new query — cuts perceived latency and flickering.
  const load = useCallback(async () => {
    setLoading(true);
    const controller = new AbortController();
    try {
      const params = new URLSearchParams({ page: String(page), perPage: String(PER_PAGE) });
      if (debounced) params.set("q", debounced);
      if (category) params.set("category", category);
      if (shortExpiry) params.set("short_expiry", "1");
      const res = await fetch(`/api/shop/products?${params.toString()}`, { signal: controller.signal });
      const data = await res.json();
      setProducts(data.products || []);
      // API only returns `total` on page 1 now. Keep the previous value on
      // subsequent pages so the header count doesn't flicker to 0.
      if (typeof data.total === 'number') setTotal(data.total);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'AbortError') throw err;
    } finally {
      setLoading(false);
    }
    return () => controller.abort();
  }, [debounced, category, shortExpiry, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sticky top-16 md:top-16 z-30 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_260px_auto] gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search products, drug names, brands…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 h-11 border-slate-200"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-11 px-3 rounded-md border border-slate-200 bg-white text-sm font-medium focus:ring-2 focus:ring-brand-700 focus:outline-none"
          >
            <option value="">All categories ({categories.length})</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={() => setShortExpiry((s) => !s)}
            className={`h-11 px-4 rounded-md border font-bold text-sm flex items-center gap-2 transition-colors ${
              shortExpiry ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Short-expiry offers
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500">
            {loading ? "Loading…" : `${total.toLocaleString("en-IN")} products`}
            {(debounced || category || shortExpiry) && (
              <button
                onClick={() => { setQuery(""); setCategory(""); setShortExpiry(false); }}
                className="ml-2 text-brand-700 hover:underline font-bold"
              >
                Clear filters
              </button>
            )}
          </p>
          {cart.totalQty > 0 && (
            <Link href="/shop/cart" className="text-xs font-bold text-brand-800 hover:underline">
              Cart · {cart.totalQty} items · ₹{cart.subtotal.toLocaleString("en-IN")}
            </Link>
          )}
        </div>
      </div>

      {/* Grid */}
      {products.length === 0 && !loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center text-slate-500">
          <Package className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-bold">No products match your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {products.map((p) => {
            const img = firstImage(p);
            const price = unitPrice(p);
            const inCart = cart.items.find((c) => c.id === p.id)?.quantity || 0;
            return (
              <div key={p.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                <button
                  onClick={() => router.push(`/shop/catalog?id=${p.id}`)}
                  className="aspect-square bg-slate-50 relative flex items-center justify-center overflow-hidden"
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <Pill className="w-10 h-10 text-slate-300" />
                  )}
                  {p.short_expiry && (
                    <span className="absolute top-1.5 left-1.5 bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded">
                      Offer {p.discount_percent ? `${p.discount_percent}%` : ""}
                    </span>
                  )}
                </button>
                <div className="p-3 flex-1 flex flex-col">
                  <button
                    onClick={() => router.push(`/shop/catalog?id=${p.id}`)}
                    className="text-left text-xs font-bold text-slate-900 line-clamp-2 leading-snug hover:text-brand-800"
                  >
                    {p.name}
                  </button>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {[p.company, p.packing].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-sm font-black text-brand-800 tabular-nums">₹{price.toLocaleString("en-IN")}</span>
                    {p.mrp && p.mrp > price && (
                      <span className="text-[10px] text-slate-400 line-through">₹{p.mrp.toLocaleString("en-IN")}</span>
                    )}
                  </div>

                  {/* Add / qty control */}
                  <div className="mt-2">
                    {inCart === 0 ? (
                      <Button
                        size="sm"
                        onClick={() => cart.addItem({
                          id: p.id, name: p.name, company: p.company, packing: p.packing,
                          hsn: p.hsn, gst_percent: p.gst_percent, mrp: p.mrp,
                          price, image: img,
                        }, 1)}
                        className="w-full h-8 bg-brand-800 hover:bg-brand-900 text-white font-bold text-xs"
                        disabled={p.stock === 0}
                      >
                        {p.stock === 0 ? "Out of stock" : "Add to cart"}
                      </Button>
                    ) : (
                      <div className="flex items-center justify-between bg-brand-50 border border-brand-200 rounded-md h-8 px-1">
                        <button onClick={() => cart.setQty(p.id, inCart - 1)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-brand-100">
                          <Minus className="w-3.5 h-3.5 text-brand-800" />
                        </button>
                        <input
                          type="number"
                          value={inCart}
                          onChange={(e) => cart.setQty(p.id, parseInt(e.target.value) || 0)}
                          className="w-10 text-center text-xs font-black text-brand-800 bg-transparent border-0 focus:outline-none tabular-nums"
                        />
                        <button onClick={() => cart.setQty(p.id, inCart + 1)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-brand-100">
                          <Plus className="w-3.5 h-3.5 text-brand-800" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PER_PAGE && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 p-3">
          <span className="text-xs font-semibold text-slate-600">
            Page {page} / {totalPages} · {total.toLocaleString("en-IN")} products
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailId !== null && (
        <ProductDetailModal
          id={detailId}
          onClose={() => router.push("/shop/catalog")}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function ProductDetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const cart = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/shop/products?ids=${id}`)
      .then((r) => r.json())
      .then((d) => setProduct(d.products?.[0] || null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8 text-slate-500">Loading…</div>
      </div>
    );
  }
  if (!product) return null;

  const images = (product.images && product.images.length > 0)
    ? product.images
    : product.image_url ? [product.image_url] : [];
  const price = unitPrice(product);
  const inCart = cart.items.find((c) => c.id === product.id)?.quantity || 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-slate-900">{product.name}</h2>
            <p className="text-xs text-slate-500">{[product.company, product.packing].filter(Boolean).join(" · ")}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Left: image carousel */}
          <div className="bg-slate-50 flex flex-col">
            <div className="aspect-square relative flex items-center justify-center overflow-hidden">
              {images.length > 0 ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={images[imgIdx]} alt={product.name} className="w-full h-full object-cover" />
                  {images.length > 1 && (
                    <>
                      <button onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button onClick={() => setImgIdx((i) => (i + 1) % images.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center hover:bg-white">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                        {images.map((_, i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === imgIdx ? "bg-brand-800" : "bg-white/70"}`} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <Pill className="w-16 h-16 text-slate-300" />
              )}
            </div>
          </div>

          {/* Right: details */}
          <div className="p-5 flex flex-col">
            {product.short_expiry && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-700" />
                <div>
                  <p className="text-xs font-black text-amber-900">Short expiry offer</p>
                  <p className="text-[11px] text-amber-800">{product.discount_percent || 0}% off · Expiry {product.expiry_date || "soon"}</p>
                </div>
              </div>
            )}

            {product.drug_name && (
              <div className="mb-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">Composition</p>
                <p className="text-sm font-bold text-slate-800">{product.drug_name}</p>
              </div>
            )}
            {product.description && (
              <div className="mb-3">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">About</p>
                <p className="text-xs text-slate-600 leading-relaxed">{product.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              {product.hsn && <Detail label="HSN" value={product.hsn} />}
              {product.gst_percent != null && <Detail label="GST" value={`${product.gst_percent}%`} />}
              {product.code && <Detail label="Code" value={product.code} />}
              {product.category && <Detail label="Category" value={product.category} />}
            </div>

            <div className="mt-auto">
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-2xl font-black text-brand-800 tabular-nums">₹{price.toLocaleString("en-IN")}</span>
                {product.mrp && product.mrp > price && (
                  <span className="text-sm text-slate-400 line-through">MRP ₹{product.mrp.toLocaleString("en-IN")}</span>
                )}
              </div>
              {inCart === 0 ? (
                <Button
                  onClick={() => cart.addItem({
                    id: product.id, name: product.name, company: product.company, packing: product.packing,
                    hsn: product.hsn, gst_percent: product.gst_percent, mrp: product.mrp,
                    price, image: images[0] || null,
                  }, 1)}
                  className="w-full h-11 bg-brand-800 hover:bg-brand-900 text-white font-bold"
                  disabled={product.stock === 0}
                >
                  {product.stock === 0 ? "Out of stock" : "Add to cart"}
                </Button>
              ) : (
                <div className="flex items-center justify-between bg-brand-50 border-2 border-brand-200 rounded-lg h-11 px-2">
                  <button onClick={() => cart.setQty(product.id, inCart - 1)} className="w-9 h-9 flex items-center justify-center rounded hover:bg-brand-100">
                    <Minus className="w-4 h-4 text-brand-800" />
                  </button>
                  <input
                    type="number"
                    value={inCart}
                    onChange={(e) => cart.setQty(product.id, parseInt(e.target.value) || 0)}
                    className="w-16 text-center text-lg font-black text-brand-800 bg-transparent border-0 focus:outline-none tabular-nums"
                  />
                  <button onClick={() => cart.setQty(product.id, inCart + 1)} className="w-9 h-9 flex items-center justify-center rounded hover:bg-brand-100">
                    <Plus className="w-4 h-4 text-brand-800" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider">{label}</p>
      <p className="text-slate-800 font-semibold">{value}</p>
    </div>
  );
}
