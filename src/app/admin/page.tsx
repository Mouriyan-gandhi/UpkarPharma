"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ConfirmModal from "@/components/ConfirmModal";
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

// 3-stage lifecycle. Old backend statuses map into these stages.
type StageKey = "Invoicing" | "Packaging" | "Dispatch";

function mapStatusToStage(status: string): StageKey | "Rejected" | null {
  const s = (status || "").toLowerCase();
  if (["rejected", "cancelled"].includes(s)) return "Rejected";
  if (["invoicing", "placed", "accepted", "confirmed"].includes(s)) return "Invoicing";
  if (["packaging", "processing", "packed"].includes(s)) return "Packaging";
  if (["dispatch", "dispatched", "shipped", "out for delivery", "delivered", "completed"].includes(s)) return "Dispatch";
  return null;
}

function getStatusBadge(status: string) {
  const stage = mapStatusToStage(status);
  const map: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
    Invoicing: { bg: "bg-blue-50 border-blue-200 text-blue-800",             icon: <Clock className="w-3 h-3 mr-1 text-blue-600" />,       label: "Invoicing" },
    Packaging: { bg: "bg-amber-50 border-amber-200 text-amber-800",          icon: <RefreshCcw className="w-3 h-3 mr-1 text-amber-600" />, label: "Packaging" },
    Dispatch:  { bg: "bg-emerald-50 border-emerald-200 text-emerald-800",    icon: <Truck className="w-3 h-3 mr-1 text-emerald-600" />,    label: "Dispatch"  },
    Rejected:  { bg: "bg-rose-50 border-rose-200 text-rose-800",             icon: <X className="w-3 h-3 mr-1 text-rose-600" />,           label: "Rejected"  },
  };
  const s = stage ? map[stage] : null;
  if (!s) return <Badge variant="outline" className="text-slate-600 text-xs">{status}</Badge>;
  return (
    <Badge className={`${s.bg} border font-semibold px-2.5 py-0.5 rounded-md text-xs flex items-center w-fit`}>
      {s.icon}{s.label}
    </Badge>
  );
}

const ORDER_STATUSES = ["All", "Invoicing", "Packaging", "Dispatch", "Rejected"];
const STATUS_ACTIONS: { value: string; label: string }[] = [
  { value: "Packaging", label: "Move to Packaging" },
  { value: "Dispatch",  label: "Dispatch (needs courier)" },
  { value: "Rejected",  label: "Reject Order" },
];

// Forward-only lifecycle. Once an order has advanced, admin cannot roll it back.
// Dispatch + Rejected are terminal. Rejection is only allowed from active stages.
function allowedNextStages(currentStatus: string): string[] {
  const stage = mapStatusToStage(currentStatus);
  if (stage === "Invoicing") return ["Packaging", "Rejected"];
  if (stage === "Packaging") return ["Dispatch", "Rejected"];
  return [];   // Dispatch and Rejected are terminal — no further changes
}

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
  // Tile-based nav — matches the mobile AdminHome layout. Setting from
  // the tile grid instead of a tab bar. Defaults to 'home' which shows
  // the tile grid; picking a tile switches to that section.
  const [activeTab, setActiveTab] = useState<"home" | "orders" | "inventory" | "users" | "schemes" | "analytics">("home");
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

  // Inventory — default to Derma so the launch catalog surfaces first.
  // Admin can flip to a specific category or clear the filter to see all
  // 6106 SKUs (the pre-Derma-launch legacy SQLite migration is also in the DB).
  const [invSearch, setInvSearch]       = useState("");
  const [invCategory, setInvCategory]   = useState("Derma");
  const [invStockFilter, setInvStockFilter] = useState("");
  const [invPage, setInvPage]           = useState(1);
  const ITEMS_PER_PAGE = 50;
  const [editProduct, setEditProduct]   = useState<any>(null);
  const [editProdForm, setEditProdForm] = useState<any>({});
  const [stockInputs, setStockInputs]   = useState<Record<number, string>>({});

  // Orders
  const [orderStatusFilter, setOrderStatusFilter] = useState("All");
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [courierModal, setCourierModal] = useState(false);
  const [courierOrderId, setCourierOrderId] = useState("");
  const [courierForm, setCourierForm] = useState({ courier_name: "", tracking_id: "" });
  const [dispatching, setDispatching] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<
    { orderId: string; storeName: string; currentStage: string; newStatus: string } | null
  >(null);
  const [savingStatus, setSavingStatus] = useState(false);

  // Generic confirm — every action that mutates data flows through this.
  const [genericConfirm, setGenericConfirm] = useState<null | {
    title: string;
    subtitle?: string;
    bodyText?: string;
    variant?: "default" | "success" | "warning" | "destructive";
    confirmLabel?: string;
    onConfirm: () => Promise<void> | void;
  }>(null);
  const [genericSaving, setGenericSaving] = useState(false);

  // Credit management modal (per-user).
  const [creditModal, setCreditModal] = useState<null | {
    phone: string;
    store: string;
    limit: number;
    balance: number;
    addAmount: string;
    newLimit: string;
    newBalance: string;
  }>(null);

  // Partner detail modal (all details in one screen).
  const [partnerModal, setPartnerModal] = useState<any | null>(null);
  const [partnerForm, setPartnerForm] = useState<any>({});
  const [savingPartner, setSavingPartner] = useState(false);

  // Review Invoice modal (Draft invoice review + approve).
  const [reviewInvoice, setReviewInvoice] = useState<null | {
    orderId: string;
    storeName: string;
    invoice: any;
    items: any[];
  }>(null);
  const [savingLines, setSavingLines] = useState(false);
  const [approvingInvoice, setApprovingInvoice] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);  // bumps iframe src to force refresh

  // Admin password step-up (for block action).
  const [passwordPrompt, setPasswordPrompt] = useState<null | {
    title: string;
    subtitle: string;
    onVerified: () => Promise<void> | void;
  }>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);

  // Users
  const [userSearch, setUserSearch]         = useState("");
  const [showPendingOnly, setShowPendingOnly] = useState(false);

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

  // ── Generic confirm runner ────────────────────────────────────────────────

  const runGenericConfirm = async () => {
    if (!genericConfirm) return;
    setGenericSaving(true);
    try {
      await genericConfirm.onConfirm();
      setGenericConfirm(null);
    } finally {
      setGenericSaving(false);
    }
  };

  // ── User Handlers ─────────────────────────────────────────────────────────

  const doApproveUser = async (phone: string) => {
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "raw_override", db: { users: [{ phone, is_approved: true }] } }),
    });
    setUsers((u) => u.map((x) => (x.phone === phone ? { ...x, is_approved: 1 } : x)));
  };

  const requestApproveUser = (u: any) => {
    setGenericConfirm({
      title: "Approve Partner",
      subtitle: u.store_name,
      bodyText: `Verify ${u.store_name} (${u.phone}) as an approved pharmacy partner. They will be able to place orders immediately.`,
      variant: "success",
      confirmLabel: "Approve Partner",
      onConfirm: () => doApproveUser(u.phone),
    });
  };

  // Credit modal
  const openCreditModal = (u: any) => {
    setCreditModal({
      phone: u.phone,
      store: u.store_name || "—",
      limit: Number(u.credit_limit) || 0,
      balance: Number(u.credit_balance) || 0,
      addAmount: "",
      newLimit: String(u.credit_limit ?? 0),
      newBalance: String(u.credit_balance ?? 0),
    });
  };

  const saveCreditToServer = async (phone: string, credit_limit: number, credit_balance: number) => {
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_credit", phone, credit_limit, credit_balance }),
    });
    setUsers((u) => u.map((x) => (x.phone === phone ? { ...x, credit_limit, credit_balance } : x)));
  };

  // ── Review Invoice ─────────────────────────────────────────────────────────
  const openReviewInvoice = async (order: any) => {
    const res = await fetch(`/api/invoices/${order.id}`);
    if (!res.ok) {
      alert(`No invoice yet for this order. It will be created when the customer places a new order.`);
      return;
    }
    const data = await res.json();
    setReviewInvoice({
      orderId: order.id,
      storeName: order.store_name || 'Partner',
      invoice: data.invoice,
      items: data.items || [],
    });
  };

  const updateLineField = (id: number, field: 'batch_no' | 'expiry_date', value: string) => {
    setReviewInvoice((r) => r ? {
      ...r,
      items: r.items.map((it) => it.id === id ? { ...it, [field]: value } : it),
    } : r);
  };

  const saveInvoiceLines = async () => {
    if (!reviewInvoice) return;
    setSavingLines(true);
    try {
      const lines = reviewInvoice.items.map(({ id, batch_no, expiry_date }) => ({
        id, batch_no, expiry_date,
      }));
      const res = await fetch(`/api/invoices/${reviewInvoice.orderId}/lines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to save batch/expiry');
        return;
      }
      setPreviewNonce((n) => n + 1);  // refresh iframe
    } finally {
      setSavingLines(false);
    }
  };

  const approveInvoice = async () => {
    if (!reviewInvoice) return;
    setGenericConfirm({
      title: 'Approve & Send Invoice',
      subtitle: `${reviewInvoice.invoice.invoice_no} · ${reviewInvoice.storeName}`,
      bodyText: 'Save any unsaved batch/expiry edits, mark the invoice as Approved, move the order to Packaging, and notify the customer. This cannot be undone.',
      variant: 'success',
      confirmLabel: 'Approve & Send',
      onConfirm: async () => {
        setApprovingInvoice(true);
        try {
          // First save any pending line changes
          await saveInvoiceLines();
          const res = await fetch(`/api/invoices/${reviewInvoice.orderId}/approve`, { method: 'POST' });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'Failed to approve invoice');
            return;
          }
          setReviewInvoice(null);
          fetchData();
        } finally {
          setApprovingInvoice(false);
        }
      },
    });
  };

  // Partner detail modal
  const openPartnerModal = (u: any) => {
    setPartnerModal(u);
    setPartnerForm({
      phone: u.phone,
      store_name: u.store_name ?? "",
      drug_license: u.drug_license ?? "",
      gst_number: u.gst_number ?? "",
      registration_number: u.registration_number ?? "",
      email: u.email ?? "",
      user_type: u.user_type ?? "",
      address: u.address ?? "",
      city: u.city ?? "",
      zone: u.zone ?? "",
    });
  };

  const doSavePartnerProfile = async () => {
    if (!partnerModal) return;
    setSavingPartner(true);
    try {
      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_user_profile", ...partnerForm }),
      });
      setUsers((u) => u.map((x) => x.phone === partnerForm.phone ? { ...x, ...partnerForm } : x));
      setPartnerModal((m: any) => m ? { ...m, ...partnerForm } : m);
    } finally {
      setSavingPartner(false);
    }
  };

  const requestSavePartnerProfile = () => {
    if (!partnerModal) return;
    setGenericConfirm({
      title: "Save Partner Details",
      subtitle: partnerForm.store_name,
      bodyText: `Update this pharmacy's registration details. Changes are saved immediately.`,
      variant: "default",
      confirmLabel: "Save Details",
      onConfirm: doSavePartnerProfile,
    });
  };

  // Admin-password step-up
  const requestPasswordConfirm = (title: string, subtitle: string, onVerified: () => Promise<void> | void) => {
    setPasswordInput("");
    setPasswordError("");
    setPasswordPrompt({ title, subtitle, onVerified });
  };

  const runPasswordVerify = async () => {
    if (!passwordPrompt) return;
    setPasswordError("");
    setVerifyingPassword(true);
    try {
      const res = await fetch("/api/auth/verify-admin-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPasswordError(data.error || "Incorrect password");
        return;
      }
      const cb = passwordPrompt.onVerified;
      setPasswordPrompt(null);
      setPasswordInput("");
      await cb();
    } finally {
      setVerifyingPassword(false);
    }
  };

  // Block / Unblock flow
  const doBlockPartner = async (phone: string, block: boolean, reason?: string) => {
    const res = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: block ? "block_user" : "unblock_user", phone, reason }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to update block status");
    }
    setUsers((u) => u.map((x) => x.phone === phone ? { ...x, is_blocked: block ? 1 : 0, blocked_reason: block ? reason || null : null } : x));
    setPartnerModal((m: any) => m && m.phone === phone ? { ...m, is_blocked: block ? 1 : 0, blocked_reason: block ? reason || null : null } : m);
  };

  const requestBlockPartner = (u: any, reason: string) => {
    // Step 1: admin password. Step 2: final confirm modal. Step 3: block.
    requestPasswordConfirm(
      "Block Partner — Admin Confirmation",
      `Enter your admin password to block ${u.store_name}. Blocking will sign the pharmacy out of the app immediately.`,
      () => {
        setGenericConfirm({
          title: "Confirm Block Partner",
          subtitle: u.store_name,
          bodyText: reason
            ? `Reason: "${reason}". This partner will be unable to place orders or sign in until unblocked.`
            : `This partner will be unable to place orders or sign in until unblocked.`,
          variant: "destructive",
          confirmLabel: "Block Partner",
          onConfirm: () => doBlockPartner(u.phone, true, reason),
        });
      }
    );
  };

  const requestUnblockPartner = (u: any) => {
    setGenericConfirm({
      title: "Unblock Partner",
      subtitle: u.store_name,
      bodyText: `Restore access for this pharmacy. They will be able to sign in and place orders immediately.`,
      variant: "success",
      confirmLabel: "Unblock Partner",
      onConfirm: () => doBlockPartner(u.phone, false),
    });
  };

  const requestCreditSave = () => {
    if (!creditModal) return;
    const addAmt = Number(creditModal.addAmount) || 0;
    const finalLimit = addAmt > 0 ? creditModal.limit + addAmt : Number(creditModal.newLimit) || 0;
    const finalBalance = Number(creditModal.newBalance) || 0;
    const diffLimit = finalLimit - creditModal.limit;
    const diffBalance = finalBalance - creditModal.balance;
    setGenericConfirm({
      title: addAmt > 0 ? "Add Credit" : "Update Credit Facility",
      subtitle: creditModal.store,
      bodyText:
        addAmt > 0
          ? `Increase credit limit by ₹${fmt(addAmt)} — new limit will be ₹${fmt(finalLimit)}.`
          : `Set credit limit to ₹${fmt(finalLimit)} (${diffLimit >= 0 ? "+" : ""}₹${fmt(diffLimit)}) and used balance to ₹${fmt(finalBalance)} (${diffBalance >= 0 ? "+" : ""}₹${fmt(diffBalance)}).`,
      variant: addAmt > 0 ? "success" : "default",
      confirmLabel: addAmt > 0 ? "Add & Save" : "Save Changes",
      onConfirm: async () => {
        await saveCreditToServer(creditModal.phone, finalLimit, finalBalance);
        setCreditModal(null);
      },
    });
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

  // Route a status change through the confirmation flow.
  // Dispatch always needs courier details, so it opens the courier modal directly.
  const requestStatusChange = (order: any, newStatus: string) => {
    if (newStatus === "Dispatch") {
      openCourierModal(order.id);
      return;
    }
    setPendingStatus({
      orderId: order.id,
      storeName: order.store_name || "—",
      currentStage: mapStatusToStage(order.status) || "—",
      newStatus,
    });
  };

  const confirmPendingStatus = async () => {
    if (!pendingStatus) return;
    setSavingStatus(true);
    try {
      await handleOrderStatus(pendingStatus.orderId, pendingStatus.newStatus);
      setPendingStatus(null);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleDispatch = async () => {
    if (!courierForm.courier_name.trim()) return;
    setDispatching(true);
    try {
      // We reuse the existing courier_name column to store the staff name so
      // no DB migration is needed. Tracking_id stays unused / empty.
      await handleOrderStatus(courierOrderId, "Dispatch", { courier_name: courierForm.courier_name });
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
    const rawImages = Array.isArray(product.images) ? product.images : (product.image ? [product.image] : []);
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
      images: rawImages,
      short_expiry: !!product.short_expiry,
      discount_percent: product.discount_percent ?? "",
      expiry_date: product.expiry_date ?? "",
    });
  };

  const doSaveProduct = async () => {
    if (!editProduct) return;
    const payload = {
      ...editProdForm,
      price: Number(editProdForm.price),
      mrp: Number(editProdForm.mrp),
      stock: Number(editProdForm.stock),
      discount_percent: editProdForm.discount_percent ? Number(editProdForm.discount_percent) : 0,
    };
    await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update_product", item: { id: editProduct.id, ...payload } }),
    });
    setInventory((inv) => inv.map((p) => p.id === editProduct.id ? { ...p, ...payload } : p));
    setEditProduct(null);
  };

  const requestSaveProduct = () => {
    if (!editProduct) return;
    setGenericConfirm({
      title: "Save Product Changes",
      subtitle: editProduct.name,
      bodyText: `Update this product's details across all fields — price, stock, images, and metadata. Changes go live immediately for all pharmacy partners.`,
      variant: "default",
      confirmLabel: "Save Changes",
      onConfirm: doSaveProduct,
    });
  };

  const requestDeleteProduct = (p: any) => {
    setGenericConfirm({
      title: "Delete Product?",
      subtitle: p.name,
      bodyText: "This permanently removes the product from the catalog. This action cannot be undone.",
      variant: "destructive",
      confirmLabel: "Delete Product",
      onConfirm: async () => {
        await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete_product", id: p.id }),
        });
        setInventory((inv) => inv.filter((x) => x.id !== p.id));
      },
    });
  };

  // Read one image file as a data URL (base64). Keeps uploads working without a backend endpoint.
  const readFileAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImageFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const urls = await Promise.all(Array.from(files).slice(0, 8).map(readFileAsDataURL));
    setEditProdForm((f: any) => ({ ...f, images: [...(f.images || []), ...urls] }));
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
    const stage = mapStatusToStage(o.status);
    const matchStatus = orderStatusFilter === "All" || stage === orderStatusFilter;
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
  const nonRejectedOrders = orders.filter((o) => mapStatusToStage(o.status) !== "Rejected");
  const totalRevenue = nonRejectedOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const pendingUsersCount = users.filter((u) => !u.is_approved && u.role !== "admin").length;
  const newOrdersCount = orders.filter((o) => mapStatusToStage(o.status) === "Invoicing").length;

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
      <header className="bg-brand-900 text-white border-b border-brand-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-400 flex items-center justify-center">
              <Pill className="w-5 h-5 text-brand-900" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-lg text-white">UPKEM B2B PHARMA</span>
                <span className="text-xs bg-brand-500/20 text-brand-100 px-2 py-0.5 rounded font-mono font-semibold uppercase tracking-wide border border-brand-400/40">Wholesale Portal</span>
              </div>
              <p className="text-[11px] text-brand-100/80 font-medium">Licensed Pharmaceutical Distributor Command Center</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-brand-100 bg-brand-800/80 px-3 py-1.5 rounded-full border border-brand-700">
              <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
              Live Sync
            </div>

            {/* Sessions */}
            <div className="relative">
              <button
                onClick={() => { setShowSessions((v) => !v); setShowNotif(false); }}
                className="p-2 bg-brand-800 rounded-lg hover:bg-brand-700 border border-brand-700 transition-colors"
                title="Active Sessions"
              >
                <Shield className="w-4 h-4 text-brand-100" />
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
                className="p-2 bg-brand-800 rounded-lg hover:bg-brand-700 border border-brand-700 transition-colors"
              >
                <Bell className="w-4 h-4 text-brand-100" />
              </button>
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-400 text-[10px] font-bold text-brand-900">
                  {notifCount}
                </span>
              )}
            </div>

            <div className="h-6 w-px bg-brand-700" />

            <Button variant="ghost" onClick={handleLogout} className="text-brand-100 hover:text-white hover:bg-brand-800 gap-2 h-9 px-3 text-xs font-semibold rounded-lg">
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

        {/* Home landing — tile grid matching the mobile AdminHome layout.
            KPI snapshot + big tap targets, one screen per section. Section
            tab bodies below only render when activeTab !== 'home'. */}
        {activeTab === "home" ? (
          <>
            {/* Snapshot row — same 3 stats the mobile app shows on AdminHome */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: "Pending", value: pendingUsersCount, icon: <Building2 className="w-4 h-4" />, color: "text-amber-700 bg-amber-50 ring-amber-100" },
                { label: "Products", value: inventory.length, icon: <Package className="w-4 h-4" />, color: "text-brand-800 bg-brand-50 ring-brand-100" },
                { label: "Orders", value: orders.length, icon: <Activity className="w-4 h-4" />, color: "text-blue-700 bg-blue-50 ring-blue-100" },
              ].map((s, i) => (
                <Card key={i} className="bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ring-1 ${s.color}`}>
                    {s.icon}
                  </div>
                  <h3 className="text-3xl font-black text-slate-900 tabular-nums tracking-tight">{s.value}</h3>
                  <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">{s.label}</p>
                </Card>
              ))}
            </div>

            {/* Tile grid — same actions as mobile AdminHome */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { val: "users",     title: "Approvals",   subtitle: pendingUsersCount ? `${pendingUsersCount} pending` : "No pending requests", icon: <Building2 className="w-6 h-6" />, color: "bg-amber-50 text-amber-700", urgent: pendingUsersCount > 0 },
                { val: "orders",    title: "Orders",      subtitle: "Invoicing → Packaging → Dispatch", icon: <Activity className="w-6 h-6" />, color: "bg-blue-50 text-blue-700" },
                { val: "inventory", title: "Products",    subtitle: `${inventory.length} SKUs · add · edit · upload photos`, icon: <Package className="w-6 h-6" />, color: "bg-brand-50 text-brand-800" },
                { val: "users",     title: "Partners",    subtitle: `${users.filter((u) => u.role !== "admin").length} pharmacies · credit · block`, icon: <Building2 className="w-6 h-6" />, color: "bg-sky-50 text-sky-700" },
                { val: "schemes",   title: "Schemes",     subtitle: `${schemes.filter((s) => s.is_active).length} live · B2B coupons`, icon: <Tag className="w-6 h-6" />, color: "bg-emerald-50 text-emerald-700" },
                { val: "analytics", title: "Analytics",   subtitle: "Revenue · pipeline · top SKUs", icon: <BarChart2 className="w-6 h-6" />, color: "bg-orange-50 text-orange-700" },
              ].map((tile, i) => (
                <button
                  key={i}
                  onClick={() => setActiveTab(tile.val as typeof activeTab)}
                  className={`text-left bg-white rounded-2xl border p-5 flex items-center gap-4 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all ${tile.urgent ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200 hover:border-brand-300"}`}
                >
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 ${tile.color}`}>
                    {tile.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-slate-900">{tile.title}</p>
                      {tile.urgent && <span className="text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white px-1.5 py-0.5 rounded">New</span>}
                    </div>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5 line-clamp-1">{tile.subtitle}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Back-to-home strip when a tile is selected */}
            <button
              onClick={() => setActiveTab("home")}
              className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-brand-800"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Home
            </button>
          </>
        )}

        {/* Tabs (controlled) — hidden trigger bar; tiles above drive activeTab */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="hidden">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
            <TabsTrigger value="users">Partners</TabsTrigger>
            <TabsTrigger value="schemes">Schemes</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
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

                {/* Status filter tabs — 3-stage lifecycle */}
                <div className="flex gap-1.5 mt-4 flex-wrap">
                  {ORDER_STATUSES.map((s) => {
                    const count = s === "All" ? orders.length : orders.filter((o) => mapStatusToStage(o.status) === s).length;
                    return (
                      <button
                        key={s}
                        onClick={() => setOrderStatusFilter(s)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${orderStatusFilter === s ? "bg-brand-800 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-brand-50"}`}
                      >
                        {s}{s !== "All" && ` (${count})`}
                      </button>
                    );
                  })}
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
                        <TableCell className="py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(o.status)}
                            {/* Invoice icon appears once the invoice has been approved
                                (order has moved past Invoicing). Opens the invoice HTML in a new tab. */}
                            {["Packaging", "Dispatch"].includes(mapStatusToStage(o.status) || "") && (
                              <a
                                href={`/api/invoices/${o.id}/html`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View invoice"
                                className="inline-flex items-center justify-center w-6 h-6 rounded bg-brand-50 border border-brand-200 text-brand-800 hover:bg-brand-100 transition-colors"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                          {(() => {
                            const stage = mapStatusToStage(o.status);
                            if (stage === "Invoicing") return (
                              <div className="flex items-center justify-end gap-2">
                                <Button size="sm" onClick={() => openReviewInvoice(o)} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs h-8 px-3">
                                  <FileText className="w-3.5 h-3.5 mr-1" /> Review Invoice
                                </Button>
                                <button onClick={() => requestStatusChange(o, "Rejected")} className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline px-1">Reject</button>
                              </div>
                            );
                            if (stage === "Packaging") return (
                              <div className="flex items-center justify-end gap-2">
                                <Button size="sm" onClick={() => openCourierModal(o.id)} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs h-8 px-3">
                                  <Truck className="w-3.5 h-3.5 mr-1" /> Dispatch
                                </Button>
                                <button onClick={() => requestStatusChange(o, "Rejected")} className="text-xs font-semibold text-rose-600 hover:text-rose-800 hover:underline px-1">Reject</button>
                              </div>
                            );
                            return <span className="text-[11px] text-slate-400 italic px-2">Order complete</span>;
                          })()}
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
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-400 hover:text-rose-700 hover:bg-rose-50" onClick={() => requestDeleteProduct(p)} title="Delete">
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
                    <Button size="sm" className="bg-brand-800 hover:bg-brand-900 text-white font-semibold text-xs" onClick={() => userFileInput.current?.click()} disabled={uploadingUsers}>
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
                  const creditUsedPct = u.credit_limit > 0 ? Math.min(100, (u.credit_balance / u.credit_limit) * 100) : 0;
                  const isBlocked = !!u.is_blocked;
                  return (
                    <div
                      key={u.phone}
                      className={`bg-white hover:bg-brand-50/60 transition-colors p-4 flex items-center gap-4 cursor-pointer ${isBlocked ? "opacity-70" : ""}`}
                      onClick={() => openPartnerModal(u)}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isBlocked ? "bg-rose-100" : "bg-brand-100"}`}>
                        <span className={`font-bold text-sm ${isBlocked ? "text-rose-800" : "text-brand-800"}`}>{u.store_name?.[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-slate-900 truncate">{u.store_name}</p>
                          {isBlocked
                            ? <Badge className="bg-rose-50 text-rose-800 border border-rose-200 text-[10px] font-semibold px-1.5">Blocked</Badge>
                            : u.is_approved
                              ? <Badge className="bg-brand-50 text-brand-800 border border-brand-200 text-[10px] font-semibold px-1.5">Verified</Badge>
                              : <Badge className="bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold px-1.5">Pending</Badge>}
                        </div>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{u.phone}{u.city ? ` · ${u.city}` : u.zone ? ` · ${u.zone}` : ""}</p>
                      </div>
                      <div className="hidden md:block text-right mr-4">
                        <p className="text-xs font-bold text-slate-900 tabular-nums">₹{fmt(u.credit_balance)} / ₹{fmt(u.credit_limit)}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Credit Used / Limit</p>
                        <div className="w-28 h-1.5 bg-slate-200 rounded-full mt-1 ml-auto">
                          <div className={`h-1.5 rounded-full ${creditUsedPct > 80 ? "bg-rose-500" : creditUsedPct > 50 ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${creditUsedPct}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!u.is_approved && !isBlocked && (
                          <Button size="sm" onClick={(e) => { e.stopPropagation(); requestApproveUser(u); }} className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs h-7 px-3">Approve</Button>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
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
                <Button size="sm" className="bg-brand-800 hover:bg-brand-900 text-white font-semibold text-xs h-9 px-4 flex items-center gap-2" onClick={() => { setEditingScheme(null); setSchemeForm(BLANK_SCHEME); setShowSchemeForm((v) => !v); }}>
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
                { label: "Fulfillment Rate", value: `${orders.length > 0 ? Math.round((orders.filter((o) => mapStatusToStage(o.status) === "Dispatch").length / orders.length) * 100) : 0}%`, sub: "Dispatched orders" },
                { label: "Rejection Rate", value: `${orders.length > 0 ? Math.round((orders.filter((o) => mapStatusToStage(o.status) === "Rejected").length / orders.length) * 100) : 0}%`, sub: "Of total orders" },
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

              {/* Dispatch info — appointed staff for this delivery */}
              {selectedOrder.courier_name && (
                <div className="bg-brand-50 rounded-lg border border-brand-200 p-4">
                  <h4 className="text-xs font-bold text-brand-800 uppercase tracking-wider mb-2 flex items-center gap-1"><Truck className="w-3.5 h-3.5" /> Delivery Assigned To</h4>
                  <p className="text-sm font-bold text-brand-900">{selectedOrder.courier_name}</p>
                </div>
              )}

              {/* Invoice link — visible once invoice is approved */}
              {["Packaging", "Dispatch"].includes(mapStatusToStage(selectedOrder.status) || "") && (
                <div className="mb-3">
                  <a
                    href={`/api/invoices/${selectedOrder.id}/html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 text-brand-800 rounded-lg text-xs font-bold hover:bg-brand-100"
                  >
                    <FileText className="w-4 h-4" /> View Invoice
                  </a>
                </div>
              )}

              {/* Actions — direct buttons per stage. Forward-only. */}
              {(() => {
                const stage = mapStatusToStage(selectedOrder.status);
                if (!stage || (stage !== "Invoicing" && stage !== "Packaging")) {
                  return (
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Status · <span className="text-brand-800 font-extrabold normal-case">{stage || selectedOrder.status}</span>
                      </h4>
                      <p className="text-xs text-slate-500 italic">Order is {String(stage || selectedOrder.status).toLowerCase()} — no further changes allowed.</p>
                    </div>
                  );
                }
                return (
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Status · <span className="text-brand-800 font-extrabold normal-case">{stage}</span>
                    </h4>
                    <div className="flex items-center gap-2">
                      {stage === "Invoicing" && (
                        <Button size="sm" onClick={() => { openReviewInvoice(selectedOrder); setSelectedOrder(null); }} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs h-9">
                          <FileText className="w-3.5 h-3.5 mr-1" /> Review Invoice
                        </Button>
                      )}
                      {stage === "Packaging" && (
                        <Button size="sm" onClick={() => openCourierModal(selectedOrder.id)} className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs h-9">
                          <Truck className="w-3.5 h-3.5 mr-1" /> Dispatch
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => requestStatusChange(selectedOrder, "Rejected")} className="text-rose-700 border-rose-200 hover:bg-rose-50 font-semibold text-xs h-9 px-4">
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      )}

      {/* ── STATUS CONFIRM MODAL (shared) ──────────────────────────────────────── */}
      <ConfirmModal
        open={!!pendingStatus}
        title="Confirm Status Change"
        subtitle={pendingStatus ? `${pendingStatus.storeName} · ${pendingStatus.orderId.slice(0, 12)}…` : ""}
        fromLabel={pendingStatus?.currentStage}
        toLabel={pendingStatus?.newStatus}
        fromTone="slate"
        toTone={
          pendingStatus?.newStatus === "Rejected" ? "rose"
          : pendingStatus?.newStatus === "Packaging" ? "amber"
          : pendingStatus?.newStatus === "Invoicing" ? "slate"
          : "emerald"
        }
        variant={pendingStatus?.newStatus === "Rejected" ? "destructive" : "default"}
        confirmLabel="Confirm & Save"
        saving={savingStatus}
        onCancel={() => setPendingStatus(null)}
        onConfirm={confirmPendingStatus}
      />

      {/* ── GENERIC CONFIRM MODAL (shared) ─────────────────────────────────────── */}
      <ConfirmModal
        open={!!genericConfirm}
        title={genericConfirm?.title || ""}
        subtitle={genericConfirm?.subtitle}
        bodyText={genericConfirm?.bodyText}
        variant={genericConfirm?.variant || "default"}
        confirmLabel={genericConfirm?.confirmLabel}
        saving={genericSaving}
        onCancel={() => setGenericConfirm(null)}
        onConfirm={runGenericConfirm}
      />

      {/* ── CREDIT MANAGEMENT MODAL ────────────────────────────────────────────── */}
      {creditModal && (
        <div className="fixed inset-0 z-[65] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Manage Credit</h3>
                <p className="text-xs text-slate-500 mt-0.5">{creditModal.store} · <span className="font-mono">{creditModal.phone}</span></p>
              </div>
              <button onClick={() => setCreditModal(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            {/* Current facility */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Limit</p>
                <p className="text-base font-bold text-slate-900 mt-1 tabular-nums">₹{fmt(creditModal.limit)}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Used Balance</p>
                <p className="text-base font-bold text-slate-900 mt-1 tabular-nums">₹{fmt(creditModal.balance)}</p>
              </div>
            </div>

            {/* Quick action: add more credit */}
            <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-4 mb-4">
              <p className="text-xs font-bold text-emerald-900 mb-2 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add Credit (increase limit)</p>
              <div className="flex gap-2">
                <input
                  type="number" min="0" placeholder="Amount (₹)"
                  value={creditModal.addAmount}
                  onChange={(e) => setCreditModal((c) => c && { ...c, addAmount: e.target.value })}
                  className="flex-1 h-9 px-3 rounded-lg border border-emerald-200 bg-white text-xs font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4"
                  disabled={!creditModal.addAmount || Number(creditModal.addAmount) <= 0}
                  onClick={requestCreditSave}
                >
                  Add & Confirm
                </Button>
              </div>
              <p className="text-[10px] text-emerald-800 mt-1.5">Use this when a pharmacy requests more credit — quickest way to top up the limit.</p>
            </div>

            {/* Direct edit: set exact values */}
            <div className="border border-slate-200 rounded-lg p-4">
              <p className="text-xs font-bold text-slate-700 mb-3">Or set exact values</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">New Credit Limit (₹)</label>
                  <input
                    type="number" min="0"
                    value={creditModal.newLimit}
                    onChange={(e) => setCreditModal((c) => c && { ...c, newLimit: e.target.value })}
                    className="w-full mt-1 h-9 px-3 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Used Balance (₹)</label>
                  <input
                    type="number" min="0"
                    value={creditModal.newBalance}
                    onChange={(e) => setCreditModal((c) => c && { ...c, newBalance: e.target.value })}
                    className="w-full mt-1 h-9 px-3 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full text-xs h-9 border-slate-300 font-semibold"
                onClick={() => {
                  // Clear the quick-add so requestCreditSave uses newLimit/newBalance path.
                  setCreditModal((c) => c && { ...c, addAmount: "" });
                  setTimeout(requestCreditSave, 0);
                }}
              >
                <Edit2 className="w-3.5 h-3.5 mr-1" /> Save Exact Values (with confirmation)
              </Button>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1 text-xs h-10" onClick={() => setCreditModal(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── DISPATCH MODAL — just the appointed staff name ─────────────────────── */}
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
            <div>
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Appointed Staff Name</label>
              <input
                type="text"
                placeholder="e.g. Ramesh Kumar"
                value={courierForm.courier_name}
                onChange={(e) => setCourierForm((f) => ({ ...f, courier_name: e.target.value }))}
                className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-brand-700 focus:outline-none"
                autoFocus
              />
              <p className="text-[11px] text-slate-500 mt-1.5">Name of the person handling this delivery.</p>
            </div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1 text-xs h-10" onClick={() => setCourierModal(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs h-10"
                disabled={dispatching || !courierForm.courier_name.trim()}
                onClick={handleDispatch}
              >
                {dispatching ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Truck className="w-4 h-4 mr-1" />}
                {dispatching ? "Dispatching…" : "Confirm Dispatch"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW INVOICE MODAL — fill batch/expiry, preview, approve & send ─── */}
      {reviewInvoice && (
        <div className="fixed inset-0 z-[65] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-[95vw] h-[92vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-brand-900 text-white flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-white text-base">Invoice {reviewInvoice.invoice.invoice_no}</h3>
                  <Badge className="bg-amber-500/20 text-amber-100 border border-amber-400/40 text-[10px] font-semibold px-1.5">DRAFT</Badge>
                </div>
                <p className="text-xs text-brand-100/80 mt-0.5">
                  {reviewInvoice.storeName} · Order <span className="font-mono">{reviewInvoice.orderId}</span> · Net ₹{Number(reviewInvoice.invoice.net_amount).toFixed(2)}
                </p>
              </div>
              <button onClick={() => setReviewInvoice(null)} className="p-1 rounded-lg hover:bg-white/10 text-white/80"><X className="w-5 h-5" /></button>
            </div>

            {/* Body: two-column split */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-0">
              {/* Left: editable lines */}
              <div className="overflow-y-auto border-r border-slate-200 p-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Edit2 className="w-3.5 h-3.5" /> Line Items — fill batch &amp; expiry
                </h4>
                <div className="space-y-3">
                  {reviewInvoice.items.map((it, i) => (
                    <div key={it.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900">{i + 1}. {it.product_name}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {it.packing || '—'} · HSN {it.hsn || '—'} · GST {it.gst_percent || 12}%
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-slate-900 tabular-nums">₹{Number(it.line_total ?? (it.price_at_time * it.quantity)).toFixed(2)}</p>
                          <p className="text-[10px] text-slate-500">{it.quantity} × ₹{Number(it.price_at_time).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Batch No.</label>
                          <input
                            type="text"
                            value={it.batch_no ?? ''}
                            onChange={(e) => updateLineField(it.id, 'batch_no', e.target.value)}
                            placeholder="e.g. B6815"
                            className="w-full mt-1 h-8 px-2 rounded border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-brand-700 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Expiry (MM/YY)</label>
                          <input
                            type="text"
                            value={it.expiry_date ?? ''}
                            onChange={(e) => updateLineField(it.id, 'expiry_date', e.target.value)}
                            placeholder="12/28"
                            className="w-full mt-1 h-8 px-2 rounded border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-brand-700 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm" variant="outline"
                    className="flex-1 text-xs h-9 border-slate-300 font-semibold"
                    disabled={savingLines}
                    onClick={saveInvoiceLines}
                  >
                    {savingLines ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                    Save Batch/Expiry (Draft)
                  </Button>
                </div>
              </div>

              {/* Right: live preview */}
              <div className="overflow-hidden bg-slate-100 flex flex-col">
                <div className="px-4 py-2 bg-slate-200 flex items-center justify-between">
                  <span className="text-slate-700 text-[11px] font-bold uppercase tracking-wider">Live Preview</span>
                  <a
                    href={`/api/invoices/${reviewInvoice.orderId}/html`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-brand-800 hover:text-brand-900 underline decoration-dotted"
                  >
                    Open Full Invoice ↗
                  </a>
                </div>
                <iframe
                  key={previewNonce}
                  src={`/api/invoices/${reviewInvoice.orderId}/html`}
                  className="flex-1 w-full bg-white"
                  title="Invoice preview"
                  style={{ minHeight: '520px' }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center gap-2">
              <p className="text-[11px] text-slate-500">Approving will move the order to <strong>Packaging</strong> and notify the customer.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="text-xs h-10" onClick={() => setReviewInvoice(null)}>Cancel</Button>
                <Button
                  className="bg-brand-800 hover:bg-brand-900 text-white font-bold text-xs h-10 px-5"
                  disabled={approvingInvoice}
                  onClick={approveInvoice}
                >
                  {approvingInvoice ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                  Approve &amp; Send Invoice
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PARTNER DETAIL MODAL — everything about one partner in one screen ──── */}
      {partnerModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 bg-brand-900 text-white flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${partnerModal.is_blocked ? "bg-rose-500/20" : "bg-brand-500/20"}`}>
                  <span className={`font-bold text-lg ${partnerModal.is_blocked ? "text-rose-100" : "text-brand-100"}`}>{partnerModal.store_name?.[0]?.toUpperCase()}</span>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white text-lg">{partnerModal.store_name}</h3>
                    {partnerModal.is_blocked
                      ? <Badge className="bg-rose-500/20 text-rose-100 border border-rose-400/40 text-[10px] font-semibold px-1.5">Blocked</Badge>
                      : partnerModal.is_approved
                        ? <Badge className="bg-brand-500/30 text-brand-100 border border-brand-400/40 text-[10px] font-semibold px-1.5">Verified</Badge>
                        : <Badge className="bg-amber-500/20 text-amber-100 border border-amber-400/40 text-[10px] font-semibold px-1.5">Pending</Badge>}
                  </div>
                  <p className="text-xs text-brand-100/80 font-mono mt-0.5">{partnerModal.phone}</p>
                </div>
              </div>
              <button onClick={() => setPartnerModal(null)} className="p-1 rounded-lg hover:bg-white/10 text-white/80"><X className="w-5 h-5" /></button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto space-y-5">
              {partnerModal.is_blocked && partnerModal.blocked_reason && (
                <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs">
                  <span className="font-bold text-rose-800">Blocked reason: </span>
                  <span className="text-rose-700">{partnerModal.blocked_reason}</span>
                </div>
              )}

              {/* Registration details — all editable */}
              <section>
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Registration Details
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Store / Firm Name", key: "store_name", full: true },
                    { label: "Drug License No.", key: "drug_license" },
                    { label: "GST Number", key: "gst_number" },
                    { label: "Registration Number", key: "registration_number" },
                    { label: "Email", key: "email", type: "email" },
                    { label: "User Type", key: "user_type" },
                    { label: "City", key: "city" },
                    { label: "Zone", key: "zone" },
                    { label: "Address", key: "address", full: true, textarea: true },
                  ].map(({ label, key, type, full, textarea }) => (
                    <div key={key} className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                      {textarea ? (
                        <textarea
                          rows={2}
                          value={partnerForm[key] ?? ""}
                          onChange={(e) => setPartnerForm((f: any) => ({ ...f, [key]: e.target.value }))}
                          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-brand-700 focus:outline-none"
                        />
                      ) : (
                        <input
                          type={type || "text"}
                          value={partnerForm[key] ?? ""}
                          onChange={(e) => setPartnerForm((f: any) => ({ ...f, [key]: e.target.value }))}
                          className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-brand-700 focus:outline-none"
                        />
                      )}
                    </div>
                  ))}
                  {/* Read-only: phone */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phone (locked)</label>
                    <input value={partnerModal.phone} disabled className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono text-slate-500" />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    className="bg-brand-800 hover:bg-brand-900 text-white font-bold text-xs h-8 px-4"
                    disabled={savingPartner}
                    onClick={requestSavePartnerProfile}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> Save Details
                  </Button>
                </div>
              </section>

              {/* Credit facility */}
              <section className="border-t border-slate-200 pt-5">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Credit Facility
                </h4>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Limit</p>
                    <p className="text-base font-bold text-slate-900 mt-1 tabular-nums">₹{fmt(partnerModal.credit_limit)}</p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Used Balance</p>
                    <p className="text-base font-bold text-slate-900 mt-1 tabular-nums">₹{fmt(partnerModal.credit_balance)}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-slate-300 text-slate-700 font-semibold text-xs h-9"
                  onClick={() => { openCreditModal(partnerModal); }}
                >
                  <Edit2 className="w-3.5 h-3.5 mr-1" /> Manage Credit (Add or Set)
                </Button>
              </section>

              {/* Approval */}
              {!partnerModal.is_approved && !partnerModal.is_blocked && (
                <section className="border-t border-slate-200 pt-5">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Pending Approval
                  </h4>
                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 mb-3">
                    This pharmacy is waiting for admin verification. Approve to unlock ordering.
                  </div>
                  <Button
                    size="sm"
                    className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs h-9"
                    onClick={() => requestApproveUser(partnerModal)}
                  >
                    <Check className="w-3.5 h-3.5 mr-1" /> Approve Partner
                  </Button>
                </section>
              )}

              {/* Danger zone — block/unblock */}
              {partnerModal.role !== "admin" && (
                <section className="border-t border-slate-200 pt-5">
                  <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" /> Danger Zone
                  </h4>
                  <div className="p-4 rounded-lg border border-rose-200 bg-rose-50/50">
                    {partnerModal.is_blocked ? (
                      <>
                        <p className="text-xs text-rose-900 font-medium mb-3">This partner is currently blocked and cannot use the app. Unblocking restores full access.</p>
                        <Button
                          size="sm"
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9"
                          onClick={() => requestUnblockPartner(partnerModal)}
                        >
                          <Check className="w-3.5 h-3.5 mr-1" /> Unblock Partner
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-rose-900 font-medium mb-2">Block this pharmacy from using the app. All active sessions will be revoked. Requires your admin password.</p>
                        <label className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block mb-1">Reason (optional)</label>
                        <input
                          id="block-reason"
                          type="text"
                          placeholder="e.g. Fraudulent orders, License expired…"
                          className="w-full h-9 px-3 rounded-lg border border-rose-200 bg-white text-xs font-medium focus:ring-2 focus:ring-rose-600 focus:outline-none mb-3"
                        />
                        <Button
                          size="sm"
                          className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs h-9"
                          onClick={() => {
                            const reason = (document.getElementById('block-reason') as HTMLInputElement | null)?.value?.trim() || "";
                            requestBlockPartner(partnerModal, reason);
                          }}
                        >
                          <Shield className="w-3.5 h-3.5 mr-1" /> Block Partner (requires password)
                        </Button>
                      </>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
              <Button variant="outline" className="text-xs h-9" onClick={() => setPartnerModal(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN PASSWORD STEP-UP MODAL ────────────────────────────────────────── */}
      {passwordPrompt && (
        <div className="fixed inset-0 z-[75] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-sm p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-800 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm leading-tight">{passwordPrompt.title}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{passwordPrompt.subtitle}</p>
                </div>
              </div>
              <button onClick={() => !verifyingPassword && setPasswordPrompt(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Admin Password</label>
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); if (passwordError) setPasswordError(""); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && passwordInput) runPasswordVerify(); }}
              className="w-full h-10 px-3 border border-slate-200 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-700 focus:outline-none"
              placeholder="Enter your password"
            />
            {passwordError && <p className="text-xs text-rose-600 font-semibold mt-2">{passwordError}</p>}
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1 text-xs h-10" disabled={verifyingPassword} onClick={() => setPasswordPrompt(null)}>Cancel</Button>
              <Button
                className="flex-1 bg-brand-800 hover:bg-brand-900 text-white font-bold text-xs h-10"
                disabled={verifyingPassword || !passwordInput}
                onClick={runPasswordVerify}
              >
                {verifyingPassword ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {verifyingPassword ? "Verifying…" : "Verify Password"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT PRODUCT MODAL ──────────────────────────────────────────────────── */}
      {editProduct && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="font-bold text-slate-900">Edit Product</h3>
                <p className="text-xs text-slate-500 mt-0.5">{editProduct.name}</p>
              </div>
              <button onClick={() => setEditProduct(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            {/* Photos — file upload + optional URL fallback */}
            <div className="mb-5">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Photos</label>
              <div className="mt-2 border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                {editProdForm.images && editProdForm.images.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-2 mb-2">
                    {editProdForm.images.map((uri: string, i: number) => (
                      <div key={i} className="relative shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={uri} alt={`Photo ${i + 1}`} className="w-20 h-20 rounded-lg object-cover border border-slate-200 bg-white" />
                        <button
                          onClick={() => setEditProdForm((f: any) => ({ ...f, images: (f.images || []).filter((_: any, idx: number) => idx !== i) }))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center hover:bg-rose-700"
                          type="button"
                          aria-label={`Remove photo ${i + 1}`}
                        >×</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mb-2">No photos yet. Upload from your device or paste an image URL.</p>
                )}

                {/* File upload — hidden input opened by button */}
                <input
                  id="product-image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleImageFilesSelected(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8 px-3 border-slate-300 font-semibold"
                    onClick={() => document.getElementById('product-image-upload')?.click()}
                    type="button"
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" /> Upload from device
                  </Button>
                  <input
                    id="new-image-url"
                    placeholder="…or paste image URL"
                    className="flex-1 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const el = e.currentTarget;
                        const v = el.value.trim();
                        if (v) {
                          setEditProdForm((f: any) => ({ ...f, images: [...(f.images || []), v] }));
                          el.value = '';
                        }
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="bg-brand-800 hover:bg-brand-900 text-white font-bold text-xs h-8 px-3"
                    onClick={() => {
                      const el = document.getElementById('new-image-url') as HTMLInputElement | null;
                      const v = el?.value.trim();
                      if (v) {
                        setEditProdForm((f: any) => ({ ...f, images: [...(f.images || []), v] }));
                        if (el) el.value = '';
                      }
                    }}
                  >Add URL</Button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Up to 8 images per upload. First image is used as the product thumbnail.</p>
              </div>
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
              <div className="col-span-2 flex flex-col gap-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Description</label>
                <textarea rows={3} value={editProdForm.description ?? ""} onChange={(e) => setEditProdForm((f: any) => ({ ...f, description: e.target.value }))} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none" />
              </div>
            </div>

            {/* Short expiry offer */}
            <div className="mt-4 p-3 border border-amber-200 bg-amber-50 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!editProdForm.short_expiry}
                  onChange={(e) => setEditProdForm((f: any) => ({ ...f, short_expiry: e.target.checked }))}
                  className="w-4 h-4 accent-amber-600"
                />
                <div>
                  <div className="text-xs font-bold text-amber-900">Short expiry offer</div>
                  <div className="text-[11px] text-amber-800">Shown in the customer "Short expiry" filter and homepage deals</div>
                </div>
              </label>
              {editProdForm.short_expiry && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Discount %</label>
                    <input type="number" min="0" max="90" value={editProdForm.discount_percent ?? ""} onChange={(e) => setEditProdForm((f: any) => ({ ...f, discount_percent: e.target.value }))} className="h-9 px-3 rounded-lg border border-amber-200 bg-white text-xs font-medium focus:ring-2 focus:ring-amber-600 focus:outline-none" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Expiry date</label>
                    <input type="text" placeholder="MM/YYYY" value={editProdForm.expiry_date ?? ""} onChange={(e) => setEditProdForm((f: any) => ({ ...f, expiry_date: e.target.value }))} className="h-9 px-3 rounded-lg border border-amber-200 bg-white text-xs font-medium focus:ring-2 focus:ring-amber-600 focus:outline-none" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1 text-xs h-10" onClick={() => setEditProduct(null)}>Cancel</Button>
              <Button className="flex-1 bg-brand-800 hover:bg-brand-900 text-white font-bold text-xs h-10" onClick={requestSaveProduct}>
                <Check className="w-4 h-4 mr-1" /> Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
