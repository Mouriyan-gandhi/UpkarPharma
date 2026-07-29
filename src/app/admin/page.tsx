"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bell, Package, Activity, Plus, Search, RefreshCcw, LogOut, Upload,
  Loader2, Tag, Calendar, Trash2, ToggleLeft, ToggleRight, Gift, Copy,
  Building2, Pill, Clock, ChevronLeft, ChevronRight, Truck, Check, X,
  Sparkles, Edit2, TrendingUp, ChevronDown, ChevronUp, Shield, MapPin,
  CreditCard, FileText, BarChart2, ShieldCheck
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from "recharts";

// ─── Utility ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n?.toLocaleString("en-IN") ?? "—";
}

function getStatusBadge(status: string) {
  const map: Record<string, { bg: string; icon: React.ReactNode }> = {
    Placed:     { bg: "bg-amber-50 border-amber-200 text-amber-800",    icon: <Clock className="w-3 h-3 mr-1 text-amber-600" /> },
    Accepted:   { bg: "bg-blue-50 border-blue-200 text-blue-800",       icon: <Check className="w-3 h-3 mr-1 text-blue-600" /> },
    Processing: { bg: "bg-purple-50 border-purple-200 text-purple-800", icon: <RefreshCcw className="w-3 h-3 mr-1 text-purple-600 animate-spin" /> },
    Shipped:    { bg: "bg-emerald-50 border-emerald-200 text-emerald-800", icon: <Truck className="w-3 h-3 mr-1 text-emerald-600" /> },
    Delivered:  { bg: "bg-teal-50 border-teal-200 text-teal-800",       icon: <ShieldCheck className="w-3 h-3 mr-1 text-teal-600" /> },
    Rejected:   { bg: "bg-rose-50 border-rose-200 text-rose-800",       icon: <X className="w-3 h-3 mr-1 text-rose-600" /> },
  };
  const s = map[status];
  if (!s) return <Badge variant="outline" className="text-slate-600 text-xs">{status}</Badge>;
  return (
    <Badge className={`${s.bg} border font-semibold px-2.5 py-0.5 rounded-md text-xs flex items-center w-fit`}>
      {s.icon}{status}
    </Badge>
  );
}

const ORDER_STATUSES = ["All", "Placed", "Accepted", "Processing", "Shipped", "Delivered", "Rejected"];

const BLANK_SCHEME = {
  title: "", description: "", code: "", scheme_type: "Discount",
  discount_percent: "", flat_discount: "", min_order_value: "",
  max_discount: "", start_date: "", end_date: "", usage_limit: "", per_user_limit: "1",
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();

  // Core data
  const [users, setUsers]         = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [orders, setOrders]       = useState<any[]>([]);
  const [schemes, setSchemes]     = useState<any[]>([]);
  const [adminSessions, setAdminSessions] = useState<any[]>([]);
  const prevOrderCount = useRef(0);

  // Notification panel
  const [notifCount, setNotifCount]   = useState(0);
  const [notifOrders, setNotifOrders] = useState<any[]>([]);
  const [showNotif, setShowNotif]     = useState(false);

  // Sessions panel
  const [showSessions, setShowSessions] = useState(false);

  // Uploads
  const [uploadingUsers, setUploadingUsers]       = useState(false);
  const [uploadingProducts, setUploadingProducts] = useState(false);
  const userFileInput    = useRef<HTMLInputElement>(null);
  const productFileInput = useRef<HTMLInputElement>(null);

  // Inventory
  const [invSearch, setInvSearch]       = useState("");
  const [invCategory, setInvCategory]   = useState("");
  const [invStockFilter, setInvStockFilter] = useState("");
  const [invPage, setInvPage]           = useState(1);
  const ITEMS_PER_PAGE = 50;
  const [editProduct, setEditProduct]   = useState<any>(null);
  const [editProdForm, setEditProdForm] = useState<any>({});
  const [savingProduct, setSavingProduct] = useState(false);
  const [stockInputs, setStockInputs]   = useState<Record<number, string>>({});

  // Orders
  const [orderStatusFilter, setOrderStatusFilter] = useState("All");
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [courierModal, setCourierModal] = useState(false);
  const [courierOrderId, setCourierOrderId] = useState("");
  const [courierForm, setCourierForm] = useState({ courier_name: "", tracking_id: "" });
  const [dispatching, setDispatching] = useState(false);

  // Users
  const [userSearch, setUserSearch]         = useState("");
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [expandedUser, setExpandedUser]     = useState<string | null>(null);
  const [editingCredit, setEditingCredit]   = useState<{ phone: string; limit: string; balance: string } | null>(null);
  const [savingCredit, setSavingCredit]     = useState(false);

  // Schemes
  const [showSchemeForm, setShowSchemeForm] = useState(false);
  const [editingScheme, setEditingScheme]   = useState<any>(null);
  const [schemeForm, setSchemeForm]         = useState(BLANK_SCHEME);
  const [savingScheme, setSavingScheme]     = useState(false);

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const fetchData = async () => {
    try {
      const res = await fetch("/api/data");
      if (!res.ok) return;
      const db = await res.json();

      setOrders((prev) => {
        if (prev.length > 0 && db.orders.length > prev.length) {
          const newOnes = db.orders.slice(0, db.orders.length - prev.length);
          setNotifCount((n) => n + newOnes.length);
          setNotifOrders((existing) => [...newOnes, ...existing].slice(0, 20));
        }
        return db.orders;
      });
      setUsers(db.users ?? []);
      setInventory(db.products ?? []);
      if (db.schemes) setSchemes(db.schemes);
    } catch { /* silent */ }
  };

  const fetchSessions = async () => {
    try {
      const res = await fetch("/api/auth/sessions");
      if (res.ok) setAdminSessions(await res.json());
    } catch { /* silent */ }
  };

  useEffect(() => {
    fetchData();
    fetchSessions();
    const t1 = setInterval(fetchData, 5000);
    const t2 = setInterval(fetchSessions, 30000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  // ── Auth ──────────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  };

  // ── User Handlers ─────────────────────────────────────────────────────────

  const handleApproveUser = async (phone: string) => {
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "raw_override", db: { users: [{ phone, is_approved: true }] } }),
    });
    setUsers((u) => u.map((x) => (x.phone === phone ? { ...x, is_approved: 1 } : x)));
  };

  const handleSaveCredit = async () => {
    if (!editingCredit) return;
    setSavingCredit(true);
    try {
      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_credit",
          phone: editingCredit.phone,
          credit_limit: Number(editingCredit.limit) || 0,
          credit_balance: Number(editingCredit.balance) || 0,
        }),
      });
      setUsers((u) =>
        u.map((x) =>
          x.phone === editingCredit.phone
            ? { ...x, credit_limit: Number(editingCredit.limit), credit_balance: Number(editingCredit.balance) }
            : x
        )
      );
      setEditingCredit(null);
    } finally {
      setSavingCredit(false);
    }
  };

  // ── Order Handlers ────────────────────────────────────────────────────────

  const handleOrderStatus = async (id: string, newStatus: string, extra?: any) => {
    setOrders((o) => o.map((x) => (x.id === id ? { ...x, status: newStatus, ...extra } : x)));
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection: "orders", item: { id, status: newStatus, ...(extra ?? {}) }, action: "update_status" }),
    });
    fetchData();
    if (selectedOrder?.id === id) setSelectedOrder((o: any) => ({ ...o, status: newStatus, ...(extra ?? {}) }));
  };

  const openCourierModal = (orderId: string) => {
    setCourierOrderId(orderId);
    setCourierForm({ courier_name: "", tracking_id: "" });
    setCourierModal(true);
  };

  const handleDispatch = async () => {
    if (!courierForm.courier_name.trim() || !courierForm.tracking_id.trim()) return;
    setDispatching(true);
    try {
      await handleOrderStatus(courierOrderId, "Shipped", courierForm);
      setCourierModal(false);
    } finally {
      setDispatching(false);
    }
  };

  // ── Inventory Handlers ────────────────────────────────────────────────────

  const handleSetStock = async (id: number, newStock: number) => {
    const product = inventory.find((p) => p.id === id);
    if (!product) return;
    const change = newStock - (product.stock ?? 0);
    setInventory((inv) => inv.map((p) => (p.id === id ? { ...p, stock: newStock } : p)));
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_stock", productId: id, changeAmount: change }),
    });
  };

  const openEditProduct = (product: any) => {
    setEditProduct(product);
    setEditProdForm({
      name: product.name ?? "",
      company: product.company ?? product.manufacturer ?? "",
      category: product.category ?? "",
      packing: product.packing ?? "",
      price: product.price ?? "",
      mrp: product.mrp ?? "",
      stock: product.stock ?? 0,
      composition: product.composition ?? product.drug_name ?? "",
      description: product.description ?? "",
    });
  };

  const handleSaveProduct = async () => {
    if (!editProduct) return;
    setSavingProduct(true);
    try {
      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_product", item: { id: editProduct.id, ...editProdForm, price: Number(editProdForm.price), mrp: Number(editProdForm.mrp), stock: Number(editProdForm.stock) } }),
      });
      setInventory((inv) => inv.map((p) => p.id === editProduct.id ? { ...p, ...editProdForm, price: Number(editProdForm.price), mrp: Number(editProdForm.mrp), stock: Number(editProdForm.stock) } : p));
      setEditProduct(null);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: number) => {
    if (!confirm("Permanently delete this product? This cannot be undone.")) return;
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_product", id }),
    });
    setInventory((inv) => inv.filter((p) => p.id !== id));
  };

  // ── Scheme Handlers ───────────────────────────────────────────────────────

  const openEditScheme = (s: any) => {
    setEditingScheme(s);
    setSchemeForm({
      title: s.title ?? "",
      description: s.description ?? "",
      code: s.code ?? "",
      scheme_type: s.scheme_type ?? "Discount",
      discount_percent: s.discount_percent ?? "",
      flat_discount: s.flat_discount ?? "",
      min_order_value: s.min_order_value ?? "",
      max_discount: s.max_discount ?? "",
      start_date: s.start_date ?? "",
      end_date: s.end_date ?? "",
      usage_limit: s.usage_limit ?? "",
      per_user_limit: s.per_user_limit ?? "1",
    });
    setShowSchemeForm(true);
  };

  const handleSaveScheme = async () => {
    if (!schemeForm.title || !schemeForm.code || !schemeForm.start_date || !schemeForm.end_date) {
      alert("Title, Code, Start Date and End Date are required.");
      return;
    }
    setSavingScheme(true);
    const payload = {
      ...schemeForm,
      discount_percent: schemeForm.discount_percent ? Number(schemeForm.discount_percent) : null,
      flat_discount: schemeForm.flat_discount ? Number(schemeForm.flat_discount) : null,
      min_order_value: schemeForm.min_order_value ? Number(schemeForm.min_order_value) : 0,
      max_discount: schemeForm.max_discount ? Number(schemeForm.max_discount) : null,
      usage_limit: schemeForm.usage_limit ? Number(schemeForm.usage_limit) : 0,
      per_user_limit: schemeForm.per_user_limit ? Number(schemeForm.per_user_limit) : 1,
    };
    try {
      if (editingScheme) {
        await fetch("/api/schemes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingScheme.id, ...payload }),
        });
      } else {
        const res = await fetch("/api/schemes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || "Failed to create scheme"); return; }
      }
      setShowSchemeForm(false);
      setEditingScheme(null);
      setSchemeForm(BLANK_SCHEME);
      fetchData();
    } finally {
      setSavingScheme(false);
    }
  };

  const handleDeleteScheme = async (id: number) => {
    if (!confirm("Permanently delete this scheme?")) return;
    await fetch(`/api/schemes?id=${id}`, { method: "DELETE" });
    setSchemes((s) => s.filter((x) => x.id !== id));
  };

  const handleToggleScheme = async (id: number) => {
    await fetch("/api/schemes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "toggle" }),
    });
    setSchemes((s) => s.map((x) => (x.id === id ? { ...x, is_active: !x.is_active } : x)));
  };

  // ── Session Handlers ──────────────────────────────────────────────────────

  const handleRevokeSession = async (id: string) => {
    await fetch(`/api/auth/sessions?id=${id}`, { method: "DELETE" });
    setAdminSessions((s) => s.filter((x) => x.id !== id));
  };

  // ── File Upload ───────────────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "users" | "products") => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type === "users") setUploadingUsers(true);
    else setUploadingProducts(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) { alert(`Successfully imported ${data.added} ${type}.`); fetchData(); }
      else alert(`Upload failed: ${data.error}`);
    } catch { alert("Upload error."); }
    finally {
      if (type === "users") setUploadingUsers(false);
      else setUploadingProducts(false);
      if (e.target) e.target.value = "";
    }
  };

  // ── Computed Values ───────────────────────────────────────────────────────

  const uniqueCategories = Array.from(new Set(inventory.map((p) => p.category))).filter(Boolean) as string[];

  const filteredInventory = inventory.filter((p) => {
    const q = invSearch.toLowerCase();
    const matchSearch = !q || p.name?.toLowerCase().includes(q) || p.company?.toLowerCase().includes(q) || p.composition?.toLowerCase().includes(q) || p.drug_name?.toLowerCase().includes(q);
    const matchCat = !invCategory || p.category === invCategory;
    const matchStock = !invStockFilter || (invStockFilter === "in" ? p.stock > 0 : p.stock === 0);
    return matchSearch && matchCat && matchStock;
  });

  const filteredOrders = orders.filter((o) => {
    const matchStatus = orderStatusFilter === "All" || o.status === orderStatusFilter;
    const q = orderSearch.toLowerCase();
    const matchSearch = !q || o.id?.toLowerCase().includes(q) || o.store_name?.toLowerCase().includes(q) || o.user_phone?.includes(q);
    return matchStatus && matchSearch;
  });

  const filteredUsers = users
    .filter((u) => u.role !== "admin")
    .filter((u) => {
      const q = userSearch.toLowerCase();
      const matchSearch = !q || u.store_name?.toLowerCase().includes(q) || u.phone?.includes(q);
      const matchPending = !showPendingOnly || !u.is_approved;
      return matchSearch && matchPending;
    });

  const totalPages = Math.ceil(filteredInventory.length / ITEMS_PER_PAGE);

  // Analytics
  const nonRejectedOrders = orders.filter((o) => o.status !== "Rejected");
  const totalRevenue = nonRejectedOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const pendingUsersCount = users.filter((u) => !u.is_approved && u.role !== "admin").length;
  const newOrdersCount = orders.filter((o) => o.status === "Placed").length;

  const monthlyRevenue: Record<string, number> = {};
  const monthlyOrders: Record<string, number> = {};
  nonRejectedOrders.forEach((o) => {
    const m = (o.date ?? o.created_at ?? "").slice(0, 7);
    if (!m) return;
    monthlyRevenue[m] = (monthlyRevenue[m] ?? 0) + (o.total ?? 0);
    monthlyOrders[m] = (monthlyOrders[m] ?? 0) + 1;
  });
  const chartData = Object.keys(monthlyRevenue)
    .sort()
    .slice(-6)
    .map((m) => ({ month: m.slice(5) + "/" + m.slice(2, 4), revenue: Math.round(monthlyRevenue[m]), orders: monthlyOrders[m] ?? 0 }));

  const productCounts: Record<string, { name: string; qty: number }> = {};
  nonRejectedOrders.forEach((o) => {
    o.items?.forEach((i: any) => {
      if (!productCounts[i.id]) productCounts[i.id] = { name: i.name, qty: 0 };
      productCounts[i.id].qty += i.quantity;
    });
  });
  const topProducts = Object.values(productCounts).sort((a, b) => b.qty - a.qty).slice(0, 10);

  const monthlyPharmacies: Record<string, number> = {};
  users.filter((u) => u.role !== "admin").forEach((u) => {
    const m = (u.created_at ?? "").slice(0, 7);
    if (m) monthlyPharmacies[m] = (monthlyPharmacies[m] ?? 0) + 1;
  });
  const pharmacyChartData = Object.keys(monthlyPharmacies)
    .sort()
    .slice(-6)
    .map((m) => ({ month: m.slice(5) + "/" + m.slice(2, 4), pharmacies: monthlyPharmacies[m] }));

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Pill className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-lg text-white">UPKEM B2B PHARMA</span>
                <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono font-semibold uppercase tracking-wide border border-emerald-500/30">Wholesale Portal</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Licensed Pharmaceutical Distributor Command Center</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Sync
            </div>

            {/* Sessions */}
            <div className="relative">
              <button
                onClick={() => { setShowSessions((v) => !v); setShowNotif(false); }}
                className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 border border-slate-700 transition-colors"
                title="Active Sessions"
              >
                <Shield className="w-4 h-4 text-slate-300" />
              </button>
              {adminSessions.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                  {adminSessions.length}
                </span>
              )}
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => { setShowNotif((v) => !v); setNotifCount(0); setShowSessions(false); }}
                className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 border border-slate-700 transition-colors"
              >
                <Bell className="w-4 h-4 text-slate-300" />
              </button>
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-slate-950">
                  {notifCount}
                </span>
              )}
            </div>

            <div className="h-6 w-px bg-slate-800" />

            <Button variant="ghost" onClick={handleLogout} className="text-slate-300 hover:text-white hover:bg-slate-800 gap-2 h-9 px-3 text-xs font-semibold rounded-lg">
              <LogOut className="w-4 h-4" /> Logout
            </Button>
          </div>
        </div>
      </header>

      {/* ── NOTIFICATION PANEL ───────────────────────────────────────────────── */}
      {showNotif && (
        <div className="fixed top-16 right-4 z-50 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <span className="font-bold text-sm text-slate-900">Recent Orders</span>
            <button onClick={() => setShowNotif(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
          {notifOrders.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">No new orders yet</div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {notifOrders.map((o) => (
                <div key={o.id} className="p-3 hover:bg-slate-50 cursor-pointer" onClick={() => { setSelectedOrder(o); setShowNotif(false); }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-xs text-slate-900">{o.store_name}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">{o.id}</p>
                    </div>
                    <span className="font-bold text-xs text-emerald-700">₹{fmt(o.total)}</span>
                  </div>
                  <div className="mt-1">{getStatusBadge(o.status)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SESSIONS PANEL ───────────────────────────────────────────────────── */}
      {showSessions && (
        <div className="fixed top-16 right-4 z-50 w-96 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <span className="font-bold text-sm text-slate-900">Active Admin Sessions</span>
            <button onClick={() => setShowSessions(false)} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
          </div>
          {adminSessions.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">No active sessions</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {adminSessions.map((s) => (
                <div key={s.id} className="p-3 flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-xs text-slate-900">{s.phone}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{s.ip} · {s.user_agent?.slice(0, 40)}</p>
                    <p className="text-[11px] text-slate-400">{new Date(s.last_active).toLocaleString()}</p>
                  </div>
                  <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs h-7" onClick={() => handleRevokeSession(s.id)}>
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MAIN ─────────────────────────────────────────────────────────────── */}
      <main className="max-w-[1440px] mx-auto px-6 py-8">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total SKUs", value: inventory.length.toLocaleString(), sub: "Upkar & Swasthik Catalog", icon: <Package className="w-5 h-5" />, bg: "bg-slate-50 text-slate-700" },
            { label: "Pharmacy Partners", value: users.filter((u) => u.role !== "admin").length, sub: `${pendingUsersCount} Pending Approvals`, icon: <Building2 className="w-5 h-5" />, bg: "bg-blue-50 text-blue-700" },
            { label: "Wholesale Orders", value: orders.length, sub: `${newOrdersCount} New Orders`, icon: <Activity className="w-5 h-5" />, bg: "bg-amber-50 text-amber-700" },
            { label: "Total Sales", value: `₹${fmt(totalRevenue)}`, sub: "Verified Orders Only", icon: <BarChart2 className="w-5 h-5" />, bg: "bg-emerald-50 text-emerald-700" },
          ].map((kpi, i) => (
            <Card key={i} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                  <h3 className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">{kpi.value}</h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">{kpi.sub}</p>
                </div>
                <div className={`p-2.5 rounded-lg ${kpi.bg}`}>{kpi.icon}</div>
              </div>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="orders" className="w-full">
          <TabsList className="h-12 bg-white border border-slate-200 p-1 rounded-xl shadow-sm inline-flex mb-6 overflow-x-auto">
            {[
              { val: "orders", icon: <Activity className="w-4 h-4" />, label: `Orders (${orders.length})` },
              { val: "inventory", icon: <Package className="w-4 h-4" />, label: `Inventory (${inventory.length})` },
              { val: "users", icon: <Building2 className="w-4 h-4" />, label: `Partners (${users.filter((u) => u.role !== "admin").length})` },
              { val: "schemes", icon: <Tag className="w-4 h-4" />, label: "Schemes" },
              { val: "analytics", icon: <BarChart2 className="w-4 h-4" />, label: "Analytics" },
            ].map((t) => (
              <TabsTrigger key={t.val} value={t.val} className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-4 font-semibold text-xs transition-all flex items-center gap-2 whitespace-nowrap">
                {t.icon} {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── ORDERS TAB ─────────────────────────────────────────────────── */}
          <TabsContent value="orders" className="mt-0 outline-none">
            <Card className="border border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 bg-slate-50/50">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Wholesale Order Lifecycle</h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Manage B2B order verification, status progression, and courier dispatch</p>
                  </div>
                  <div className="relative w-full md:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" placeholder="Search order ID, store name..."
                      value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Status filter tabs */}
                <div className="flex gap-1.5 mt-4 flex-wrap">
                  {ORDER_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setOrderStatusFilter(s)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${orderStatusFilter === s ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {s}{s !== "All" && ` (${orders.filter((o) => o.status === s).length})`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-100/70">
                    <TableRow className="border-slate-200">
                      {["Order ID", "Pharmacy Store", "Date", "Items", "Total", "Status", "Actions"].map((h) => (
                        <TableHead key={h} className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 first:pl-6 last:pr-6 last:text-right">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-slate-400 text-sm">No orders match this filter</TableCell>
                      </TableRow>
                    ) : filteredOrders.map((o) => (
                      <TableRow
                        key={o.id}
                        className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors cursor-pointer"
                        onClick={() => setSelectedOrder(o)}
                      >
                        <TableCell className="py-4 pl-6 font-mono font-bold text-xs text-slate-900">{o.id?.slice(0, 8)}…</TableCell>
                        <TableCell className="py-4 font-semibold text-slate-800 text-xs">{o.store_name}</TableCell>
                        <TableCell className="py-4 text-xs font-medium text-slate-500">{o.date}</TableCell>
                        <TableCell className="py-4 text-xs text-slate-600">{o.items?.length ?? 0} SKUs</TableCell>
                        <TableCell className="py-4 font-extrabold text-slate-900 text-sm tabular-nums">₹{fmt(o.total)}</TableCell>
                        <TableCell className="py-4">{getStatusBadge(o.status)}</TableCell>
                        <TableCell className="py-4 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            {o.status === "Placed" && (
                              <>
                                <Button size="sm" onClick={() => handleOrderStatus(o.id, "Accepted")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 px-3">Accept</Button>
                                <Button size="sm" variant="outline" onClick={() => handleOrderStatus(o.id, "Rejected")} className="border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold text-xs h-7 px-3">Reject</Button>
                              </>
                            )}
                            {o.status === "Accepted" && (
                              <Button size="sm" onClick={() => handleOrderStatus(o.id, "Processing")} className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-7 px-3">Process</Button>
                            )}
                            {o.status === "Processing" && (
                              <Button size="sm" onClick={() => openCourierModal(o.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 px-3">Dispatch</Button>
                            )}
                            {o.status === "Shipped" && (
                              <Button size="sm" onClick={() => handleOrderStatus(o.id, "Delivered")} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs h-7 px-3">Mark Delivered</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* ── INVENTORY TAB ──────────────────────────────────────────────── */}
          <TabsContent value="inventory" className="mt-0 outline-none">
            <Card className="border border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Pharmaceutical Product Master</h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{inventory.length.toLocaleString()} SKUs in catalog</p>
                </div>
                <div className="flex gap-2">
                  <input type="file" accept=".xlsx,.xls" className="hidden" ref={productFileInput} onChange={(e) => handleFileUpload(e, "products")} />
                  <Button variant="outline" size="sm" className="border-slate-300 text-slate-700 text-xs font-semibold" onClick={() => productFileInput.current?.click()} disabled={uploadingProducts}>
                    {uploadingProducts ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                    Bulk Upload
                  </Button>
                </div>
              </div>

              {/* Filters */}
              <div className="p-4 bg-white border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search name, composition…" value={invSearch} onChange={(e) => { setInvSearch(e.target.value); setInvPage(1); }} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" />
                </div>
                <select value={invCategory} onChange={(e) => { setInvCategory(e.target.value); setInvPage(1); }} className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none">
                  <option value="">All Categories ({uniqueCategories.length})</option>
                  {uniqueCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={invStockFilter} onChange={(e) => { setInvStockFilter(e.target.value); setInvPage(1); }} className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none">
                  <option value="">All Stock</option>
                  <option value="in">In Stock Only</option>
                  <option value="out">Out of Stock</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-100/70">
                    <TableRow className="border-slate-200">
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 pl-6">Product</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5">Composition</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5">Packing</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 text-right">PTR</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 text-right">MRP</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 text-center">Stock</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 pr-6 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.slice((invPage - 1) * ITEMS_PER_PAGE, invPage * ITEMS_PER_PAGE).map((p) => {
                      const margin = p.mrp > 0 && p.price < p.mrp ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
                      return (
                        <TableRow key={p.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                          <TableCell className="py-3 pl-6">
                            <div className="flex items-start gap-2">
                              <div className="w-7 h-7 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                                <Pill className="w-3.5 h-3.5 text-slate-500" />
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-xs block">{p.name}</span>
                                <span className="text-[11px] text-slate-500">{p.company || p.manufacturer} · {p.category}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3 text-xs text-slate-600 max-w-[180px] truncate" title={p.drug_name || p.composition}>{p.drug_name || p.composition || "—"}</TableCell>
                          <TableCell className="py-3">
                            {p.packing ? <span className="inline-block bg-slate-100 text-slate-700 text-xs font-semibold px-2 py-0.5 rounded border border-slate-200 font-mono">{p.packing}</span> : <span className="text-slate-400 text-xs">—</span>}
                          </TableCell>
                          <TableCell className="py-3 text-right font-extrabold text-slate-900 text-xs tabular-nums">₹{fmt(p.price)}</TableCell>
                          <TableCell className="py-3 text-right">
                            <span className="text-xs font-semibold text-slate-500 tabular-nums">₹{fmt(p.mrp)}</span>
                            {margin > 0 && <span className="block text-[10px] font-bold text-emerald-600">{margin}% margin</span>}
                          </TableCell>
                          <TableCell className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <input
                                type="number" min="0"
                                value={stockInputs[p.id] ?? p.stock}
                                onChange={(e) => setStockInputs((s) => ({ ...s, [p.id]: e.target.value }))}
                                onBlur={(e) => {
                                  const v = parseInt(e.target.value);
                                  if (!isNaN(v) && v !== p.stock) handleSetStock(p.id, v);
                                }}
                                className={`w-16 text-center font-mono text-xs font-bold px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-slate-900 ${p.stock === 0 ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-slate-100 border-slate-200 text-slate-800"}`}
                              />
                            </div>
                          </TableCell>
                          <TableCell className="py-3 pr-6 text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900" onClick={() => openEditProduct(p)} title="Edit">
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-400 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDeleteProduct(p.id)} title="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  {filteredInventory.length > 0 ? (invPage - 1) * ITEMS_PER_PAGE + 1 : 0}–{Math.min(invPage * ITEMS_PER_PAGE, filteredInventory.length)} of {filteredInventory.length.toLocaleString()} SKUs
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={invPage === 1} onClick={() => setInvPage((p) => p - 1)} className="h-8 text-xs font-semibold">
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Prev
                  </Button>
                  <span className="text-xs font-bold text-slate-700 px-2">Page {invPage} / {totalPages || 1}</span>
                  <Button size="sm" variant="outline" disabled={invPage >= totalPages} onClick={() => setInvPage((p) => p + 1)} className="h-8 text-xs font-semibold">
                    Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ── USERS TAB ──────────────────────────────────────────────────── */}
          <TabsContent value="users" className="mt-0 outline-none">
            <Card className="border border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 bg-slate-50/50">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Pharmacy Partner Accounts</h2>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">Manage B2B buyer approvals and credit facilities</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => setShowPendingOnly((v) => !v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${showPendingOnly ? "bg-amber-600 text-white border-amber-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {showPendingOnly ? "Showing Pending" : "All Partners"}
                    </button>
                    <input type="file" accept=".xlsx,.xls" className="hidden" ref={userFileInput} onChange={(e) => handleFileUpload(e, "users")} />
                    <Button size="sm" className="bg-slate-900 text-white font-semibold text-xs" onClick={() => userFileInput.current?.click()} disabled={uploadingUsers}>
                      <Upload className="w-3.5 h-3.5 mr-1.5" /> Import
                    </Button>
                  </div>
                </div>
                <div className="mt-3 relative w-full md:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Search store name or phone…" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" />
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">No partners match this filter</div>
                ) : filteredUsers.map((u) => {
                  const isExpanded = expandedUser === u.phone;
                  const creditUsedPct = u.credit_limit > 0 ? Math.min(100, (u.credit_balance / u.credit_limit) * 100) : 0;
                  return (
                    <div key={u.phone} className="bg-white hover:bg-slate-50/60 transition-colors">
                      {/* Main row */}
                      <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedUser(isExpanded ? null : u.phone)}>
                        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <span className="font-bold text-emerald-800 text-sm">{u.store_name?.[0]?.toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm text-slate-900 truncate">{u.store_name}</p>
                            {u.is_approved
                              ? <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-semibold px-1.5">Verified</Badge>
                              : <Badge className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-1.5">Pending</Badge>}
                          </div>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">{u.phone}</p>
                        </div>
                        <div className="hidden md:block text-right mr-4">
                          <p className="text-xs font-bold text-slate-900 tabular-nums">₹{fmt(u.credit_balance)} / ₹{fmt(u.credit_limit)}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Credit Used / Limit</p>
                          <div className="w-28 h-1.5 bg-slate-200 rounded-full mt-1 ml-auto">
                            <div className={`h-1.5 rounded-full ${creditUsedPct > 80 ? "bg-rose-500" : creditUsedPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${creditUsedPct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!u.is_approved && (
                            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleApproveUser(u.phone); }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 px-3">Approve</Button>
                          )}
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 bg-slate-50/60 border-t border-slate-100">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                            {/* Info fields */}
                            <div className="space-y-2 text-xs">
                              {[
                                { label: "Drug License", value: u.drug_license, icon: <FileText className="w-3 h-3" /> },
                                { label: "GST Number", value: u.gst_number, icon: <CreditCard className="w-3 h-3" /> },
                                { label: "City", value: u.city || u.zone, icon: <MapPin className="w-3 h-3" /> },
                                { label: "Address", value: u.address, icon: <MapPin className="w-3 h-3" /> },
                                { label: "Email", value: u.email, icon: <FileText className="w-3 h-3" /> },
                                { label: "User Type", value: u.user_type, icon: <Building2 className="w-3 h-3" /> },
                              ].map(({ label, value, icon }) => value ? (
                                <div key={label} className="flex items-start gap-2">
                                  <span className="text-slate-400 mt-0.5">{icon}</span>
                                  <div>
                                    <span className="font-semibold text-slate-500">{label}: </span>
                                    <span className="text-slate-800">{value}</span>
                                  </div>
                                </div>
                              ) : null)}
                            </div>

                            {/* Credit editor */}
                            <div className="bg-white rounded-lg border border-slate-200 p-3">
                              <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> Credit Facility</p>
                              {editingCredit?.phone === u.phone ? (
                                <div className="space-y-2">
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Credit Limit (₹)</label>
                                    <input type="number" value={editingCredit?.limit ?? ""} onChange={(e) => setEditingCredit((c) => c && { ...c, limit: e.target.value })} className="w-full mt-1 h-8 px-2 border border-slate-200 rounded text-xs font-mono focus:ring-1 focus:ring-slate-900 focus:outline-none" />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Credit Used (₹)</label>
                                    <input type="number" value={editingCredit?.balance ?? ""} onChange={(e) => setEditingCredit((c) => c && { ...c, balance: e.target.value })} className="w-full mt-1 h-8 px-2 border border-slate-200 rounded text-xs font-mono focus:ring-1 focus:ring-slate-900 focus:outline-none" />
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <Button size="sm" onClick={handleSaveCredit} disabled={savingCredit} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 flex-1">
                                      {savingCredit ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingCredit(null)} className="text-xs h-7 flex-1">Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="flex justify-between text-xs mb-1">
                                    <span className="text-slate-500">Used: <span className="font-bold text-slate-800">₹{fmt(u.credit_balance)}</span></span>
                                    <span className="text-slate-500">Limit: <span className="font-bold text-slate-800">₹{fmt(u.credit_limit)}</span></span>
                                  </div>
                                  <div className="w-full h-2 bg-slate-200 rounded-full">
                                    <div className={`h-2 rounded-full ${creditUsedPct > 80 ? "bg-rose-500" : creditUsedPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${creditUsedPct}%` }} />
                                  </div>
                                  <Button size="sm" variant="outline" onClick={() => setEditingCredit({ phone: u.phone, limit: String(u.credit_limit ?? 0), balance: String(u.credit_balance ?? 0) })} className="mt-2 w-full text-xs h-7 border-slate-200">
                                    <Edit2 className="w-3 h-3 mr-1" /> Edit Credit
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>

          {/* ── SCHEMES TAB ────────────────────────────────────────────────── */}
          <TabsContent value="schemes" className="mt-0 outline-none">
            <Card className="border border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">B2B Discount Schemes</h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Create and manage promotional codes for pharmacy partners</p>
                </div>
                <Button size="sm" className="bg-slate-900 text-white font-semibold text-xs h-9 px-4 flex items-center gap-2" onClick={() => { setEditingScheme(null); setSchemeForm(BLANK_SCHEME); setShowSchemeForm((v) => !v); }}>
                  <Plus className="w-3.5 h-3.5" /> {showSchemeForm && !editingScheme ? "Cancel" : "Create Scheme"}
                </Button>
              </div>

              {/* Scheme Form */}
              {showSchemeForm && (
                <div className="p-5 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Gift className="w-4 h-4 text-emerald-600" /> {editingScheme ? "Edit Scheme" : "New Scheme"}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { label: "Scheme Title *", key: "title", placeholder: "e.g. Summer Flash Sale" },
                      { label: "Coupon Code *", key: "code", placeholder: "e.g. SUMMER10", mono: true, upper: true },
                    ].map(({ label, key, placeholder, mono, upper }) => (
                      <div key={key} className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                        <input className={`h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none ${mono ? "font-mono font-bold" : ""}`} placeholder={placeholder} value={(schemeForm as any)[key]} onChange={(e) => setSchemeForm((f) => ({ ...f, [key]: upper ? e.target.value.toUpperCase() : e.target.value }))} />
                      </div>
                    ))}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Type *</label>
                      <select className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" value={schemeForm.scheme_type} onChange={(e) => setSchemeForm((f) => ({ ...f, scheme_type: e.target.value }))}>
                        <option value="Discount">% Discount</option>
                        <option value="Flat">Flat ₹ Off</option>
                        <option value="FreeShipping">Free Shipping</option>
                      </select>
                    </div>
                    {schemeForm.scheme_type === "Discount" && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Discount %</label>
                        <input type="number" min="1" max="100" className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" placeholder="e.g. 10" value={schemeForm.discount_percent} onChange={(e) => setSchemeForm((f) => ({ ...f, discount_percent: e.target.value }))} />
                      </div>
                    )}
                    {schemeForm.scheme_type === "Flat" && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Flat Off (₹)</label>
                        <input type="number" min="1" className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" placeholder="e.g. 500" value={schemeForm.flat_discount} onChange={(e) => setSchemeForm((f) => ({ ...f, flat_discount: e.target.value }))} />
                      </div>
                    )}
                    {[
                      { label: "Min. Order (₹)", key: "min_order_value", placeholder: "e.g. 2500" },
                      { label: "Max Discount Cap (₹)", key: "max_discount", placeholder: "optional" },
                      { label: "Start Date *", key: "start_date", type: "date" },
                      { label: "End Date *", key: "end_date", type: "date" },
                      { label: "Global Usage Limit", key: "usage_limit", placeholder: "0 = unlimited", type: "number" },
                      { label: "Per-User Limit", key: "per_user_limit", placeholder: "1", type: "number" },
                    ].map(({ label, key, placeholder, type }) => (
                      <div key={key} className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                        <input type={type || "number"} min="0" className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" placeholder={placeholder} value={(schemeForm as any)[key]} onChange={(e) => setSchemeForm((f) => ({ ...f, [key]: e.target.value }))} />
                      </div>
                    ))}
                    <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Description (optional)</label>
                      <input className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" placeholder="Shown to pharmacy partners in the app" value={schemeForm.description} onChange={(e) => setSchemeForm((f) => ({ ...f, description: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex justify-end mt-5 gap-2">
                    <Button variant="outline" size="sm" className="text-xs h-9" onClick={() => { setShowSchemeForm(false); setEditingScheme(null); setSchemeForm(BLANK_SCHEME); }}>Cancel</Button>
                    <Button onClick={handleSaveScheme} disabled={savingScheme} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-5 flex items-center gap-2">
                      {savingScheme ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {savingScheme ? "Saving…" : editingScheme ? "Update Scheme" : "Publish Scheme"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Schemes Table */}
              {schemes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <Gift className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-semibold">No schemes yet</p>
                  <p className="text-xs mt-1">Click &quot;Create Scheme&quot; to add your first discount code.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-100/70">
                      <TableRow className="border-slate-200">
                        {["Title", "Code", "Value", "Min. Order", "Validity", "Usage", "Status", "Actions"].map((h) => (
                          <TableHead key={h} className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 first:pl-6 last:pr-6 last:text-right">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schemes.map((s) => (
                        <TableRow key={s.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                          <TableCell className="py-4 pl-6">
                            <p className="font-bold text-xs text-slate-900">{s.title}</p>
                            {s.description && <p className="text-[11px] text-slate-400 mt-0.5">{s.description}</p>}
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-800">{s.code}</span>
                              <button className="text-slate-400 hover:text-slate-700" onClick={() => navigator.clipboard.writeText(s.code)} title="Copy"><Copy className="w-3 h-3" /></button>
                            </div>
                          </TableCell>
                          <TableCell className="py-4 text-xs font-semibold">
                            {s.scheme_type === "Discount" && <span className="text-emerald-700">{s.discount_percent}% off</span>}
                            {s.scheme_type === "Flat" && <span className="text-emerald-700">₹{s.flat_discount} flat</span>}
                            {s.scheme_type === "FreeShipping" && <span className="text-blue-700">Free Shipping</span>}
                            {s.max_discount && <span className="text-slate-400 font-normal ml-1">(max ₹{s.max_discount})</span>}
                          </TableCell>
                          <TableCell className="py-4 text-xs font-mono font-semibold text-slate-700">{s.min_order_value > 0 ? `₹${fmt(s.min_order_value)}` : "—"}</TableCell>
                          <TableCell className="py-4 text-xs text-slate-600 font-medium">
                            <div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-400" />{s.start_date} → {s.end_date}</div>
                          </TableCell>
                          <TableCell className="py-4 text-center text-xs font-semibold text-slate-700">
                            {s.times_used}{s.usage_limit > 0 ? <span className="text-slate-400 font-normal"> / {s.usage_limit}</span> : <span className="text-slate-400 font-normal"> / ∞</span>}
                          </TableCell>
                          <TableCell className="py-4 text-center">
                            {s.is_active ? <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">Active</Badge> : <Badge className="bg-slate-100 text-slate-500 border border-slate-200 text-xs font-semibold">Inactive</Badge>}
                          </TableCell>
                          <TableCell className="py-4 pr-6 text-right">
                            <div className="flex justify-end gap-1.5">
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-slate-200 text-slate-600 hover:bg-slate-100" onClick={() => openEditScheme(s)} title="Edit"><Edit2 className="w-3.5 h-3.5" /></Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-slate-200" onClick={() => handleToggleScheme(s.id)} title={s.is_active ? "Deactivate" : "Activate"}>
                                {s.is_active ? <ToggleRight className="w-3.5 h-3.5 text-emerald-600" /> : <ToggleLeft className="w-3.5 h-3.5 text-slate-400" />}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-rose-200 text-rose-600 hover:bg-rose-50" onClick={() => handleDeleteScheme(s.id)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </TabsContent>

          {/* ── ANALYTICS TAB ──────────────────────────────────────────────── */}
          <TabsContent value="analytics" className="mt-0 outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Revenue Chart */}
              <Card className="border border-slate-200 shadow-sm bg-white rounded-xl p-5">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Monthly Revenue</h3>
                <p className="text-xs text-slate-500 mb-4">Last 6 months, verified orders only</p>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip formatter={(v: any) => [`₹${Number(v).toLocaleString("en-IN")}`, "Revenue"]} contentStyle={{ fontSize: 12, fontWeight: 600 }} />
                      <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">No order data yet</div>
                )}
              </Card>

              {/* Orders + Pharmacies Chart */}
              <Card className="border border-slate-200 shadow-sm bg-white rounded-xl p-5">
                <h3 className="text-sm font-bold text-slate-900 mb-1">Orders & New Partners</h3>
                <p className="text-xs text-slate-500 mb-4">Last 6 months</p>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 600, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                      <RechartsTooltip contentStyle={{ fontSize: 12 }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="orders" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} name="Orders" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">No data yet</div>
                )}
              </Card>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[
                { label: "Avg. Order Value", value: `₹${orders.length > 0 ? fmt(Math.round(totalRevenue / Math.max(nonRejectedOrders.length, 1))) : "—"}`, sub: "Non-rejected orders" },
                { label: "Fulfillment Rate", value: `${orders.length > 0 ? Math.round((orders.filter((o) => ["Shipped", "Delivered"].includes(o.status)).length / orders.length) * 100) : 0}%`, sub: "Shipped + Delivered" },
                { label: "Rejection Rate", value: `${orders.length > 0 ? Math.round((orders.filter((o) => o.status === "Rejected").length / orders.length) * 100) : 0}%`, sub: "Of total orders" },
                { label: "Active Schemes", value: schemes.filter((s) => s.is_active).length, sub: `${schemes.length} total` },
              ].map((stat, i) => (
                <Card key={i} className="bg-white border border-slate-200 shadow-sm rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                  <h4 className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">{stat.value}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">{stat.sub}</p>
                </Card>
              ))}
            </div>

            {/* Top Products */}
            {topProducts.length > 0 && (
              <Card className="border border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-200 bg-slate-50/50">
                  <h3 className="text-sm font-bold text-slate-900">Top 10 Products by Quantity Ordered</h3>
                </div>
                <Table>
                  <TableHeader className="bg-slate-100/70">
                    <TableRow>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3 pl-6">Rank</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3">Product</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3 text-right pr-6">Qty Ordered</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((p, i) => (
                      <TableRow key={p.name} className="border-b border-slate-100">
                        <TableCell className="py-3 pl-6 font-mono font-bold text-xs text-slate-500">#{i + 1}</TableCell>
                        <TableCell className="py-3 font-semibold text-sm text-slate-900">{p.name}</TableCell>
                        <TableCell className="py-3 pr-6 text-right font-bold text-sm tabular-nums text-emerald-700">{p.qty.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* ── ORDER DETAIL SIDE PANEL ──────────────────────────────────────────── */}
      {selectedOrder && (
        <>
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedOrder(null)} />
          <div className="fixed top-0 right-0 h-full z-50 w-full max-w-xl bg-white shadow-2xl overflow-y-auto flex flex-col">
            {/* Panel header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-start sticky top-0 z-10">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Order Detail</p>
                <h3 className="font-mono font-bold text-slate-900 text-sm">{selectedOrder.id}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedOrder.store_name} · {selectedOrder.date}</p>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedOrder.status)}
                <button onClick={() => setSelectedOrder(null)} className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 ml-2">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 flex-1 space-y-5">
              {/* Items table */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Order Items</h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-2 px-3 font-bold text-slate-600 uppercase text-[11px]">Product</th>
                        <th className="text-center py-2 px-3 font-bold text-slate-600 uppercase text-[11px]">Qty</th>
                        <th className="text-right py-2 px-3 font-bold text-slate-600 uppercase text-[11px]">PTR</th>
                        <th className="text-right py-2 px-3 font-bold text-slate-600 uppercase text-[11px]">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedOrder.items?.map((item: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <p className="font-semibold text-slate-900">{item.name}</p>
                            <p className="text-[11px] text-slate-400">{item.company}</p>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">{item.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">₹{fmt(item.price)}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">₹{fmt(item.price * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Order financials */}
              <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold">₹{fmt(selectedOrder.items?.reduce((s: number, i: any) => s + i.price * i.quantity, 0))}</span>
                </div>
                {selectedOrder.scheme_code && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Scheme ({selectedOrder.scheme_code})</span>
                    <span className="font-semibold">Applied</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>GST (12%)</span>
                  <span className="font-semibold">Included</span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-1.5">
                  <span>Total</span>
                  <span className="text-base">₹{fmt(selectedOrder.total)}</span>
                </div>
              </div>

              {/* Courier info */}
              {selectedOrder.courier_name && (
                <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
                  <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Courier Info</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-blue-600 font-semibold">Courier: </span><span className="text-blue-900 font-bold">{selectedOrder.courier_name}</span></div>
                    <div><span className="text-blue-600 font-semibold">AWB: </span><span className="font-mono font-bold text-blue-900">{selectedOrder.tracking_id}</span></div>
                  </div>
                </div>
              )}

              {/* Status actions in panel */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedOrder.status === "Placed" && (
                    <>
                      <Button size="sm" onClick={() => handleOrderStatus(selectedOrder.id, "Accepted")} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-4">Accept Order</Button>
                      <Button size="sm" variant="outline" onClick={() => handleOrderStatus(selectedOrder.id, "Rejected")} className="border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold text-xs h-8 px-4">Reject Order</Button>
                    </>
                  )}
                  {selectedOrder.status === "Accepted" && (
                    <Button size="sm" onClick={() => handleOrderStatus(selectedOrder.id, "Processing")} className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-8 px-4">Move to Processing</Button>
                  )}
                  {selectedOrder.status === "Processing" && (
                    <Button size="sm" onClick={() => { openCourierModal(selectedOrder.id); }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 px-4">Dispatch Order</Button>
                  )}
                  {selectedOrder.status === "Shipped" && (
                    <Button size="sm" onClick={() => handleOrderStatus(selectedOrder.id, "Delivered")} className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs h-8 px-4">Mark Delivered</Button>
                  )}
                  {!["Rejected", "Delivered"].includes(selectedOrder.status) && (
                    <Button size="sm" variant="outline" onClick={() => handleOrderStatus(selectedOrder.id, "Rejected")} className="border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold text-xs h-8 px-4">Reject</Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── COURIER MODAL ──────────────────────────────────────────────────────── */}
      {courierModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h3 className="font-bold text-slate-900">Dispatch Order</h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">{courierOrderId.slice(0, 12)}…</p>
              </div>
              <button onClick={() => setCourierModal(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Courier Partner</label>
                <input type="text" placeholder="e.g. BlueDart, Delhivery, DTDC" value={courierForm.courier_name} onChange={(e) => setCourierForm((f) => ({ ...f, courier_name: e.target.value }))} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" autoFocus />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">AWB / Tracking Number</label>
                <input type="text" placeholder="Enter tracking number" value={courierForm.tracking_id} onChange={(e) => setCourierForm((f) => ({ ...f, tracking_id: e.target.value }))} className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm font-mono font-bold focus:ring-2 focus:ring-slate-900 focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1 text-xs h-10" onClick={() => setCourierModal(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-10"
                disabled={dispatching || !courierForm.courier_name.trim() || !courierForm.tracking_id.trim()}
                onClick={handleDispatch}
              >
                {dispatching ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Truck className="w-4 h-4 mr-1" />}
                {dispatching ? "Dispatching…" : "Confirm Dispatch"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT PRODUCT MODAL ──────────────────────────────────────────────────── */}
      {editProduct && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="font-bold text-slate-900">Edit Product</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editProduct.name}</p>
              </div>
              <button onClick={() => setEditProduct(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Product Name", key: "name", full: true },
                { label: "Company / Manufacturer", key: "company" },
                { label: "Category", key: "category" },
                { label: "Packing Spec", key: "packing" },
                { label: "PTR / Wholesale Price (₹)", key: "price", type: "number" },
                { label: "MRP (₹)", key: "mrp", type: "number" },
                { label: "Stock (units)", key: "stock", type: "number" },
              ].map(({ label, key, type, full }) => (
                <div key={key} className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                  <input type={type || "text"} value={editProdForm[key] ?? ""} onChange={(e) => setEditProdForm((f: any) => ({ ...f, [key]: e.target.value }))} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" />
                </div>
              ))}
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Composition</label>
                <input value={editProdForm.composition ?? ""} onChange={(e) => setEditProdForm((f: any) => ({ ...f, composition: e.target.value }))} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1 text-xs h-10" onClick={() => setEditProduct(null)}>Cancel</Button>
              <Button className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs h-10" disabled={savingProduct} onClick={handleSaveProduct}>
                {savingProduct ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                {savingProduct ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
