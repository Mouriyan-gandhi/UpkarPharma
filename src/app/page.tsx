"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bell, Package, Users, Activity, CheckCircle2, AlertCircle, Plus, Search, Layers, 
  RefreshCcw, LogOut, Upload, FileSpreadsheet, Loader2, BarChart, Tag, Calendar, 
  Trash2, ToggleLeft, ToggleRight, Gift, Copy, Building2, Pill, Filter, Clock, 
  ShieldCheck, FileText, ChevronLeft, ChevronRight, Truck, Check, X, ArrowUpRight, Sparkles
} from "lucide-react";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart as RechartsBarChart, Bar } from 'recharts';

export default function Dashboard() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [schemes, setSchemes] = useState<any[]>([]);
  const [notifications, setNotifications] = useState(0);
  const [uploadingUsers, setUploadingUsers] = useState(false);
  const [uploadingProducts, setUploadingProducts] = useState(false);
  
  const userFileInput = useRef<HTMLInputElement>(null);
  const productFileInput = useRef<HTMLInputElement>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [distributorFilter, setDistributorFilter] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  // Selected Product Modal State
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  // New Item Form State
  const [newItem, setNewItem] = useState({ name: '', company: '', category: '', packing: '', price: '', mrp: '', stock: '' });

  // Schemes Form State
  const [showSchemeForm, setShowSchemeForm] = useState(false);
  const [schemeForm, setSchemeForm] = useState({
    title: '', description: '', code: '', scheme_type: 'Discount',
    discount_percent: '', flat_discount: '', min_order_value: '',
    max_discount: '', start_date: '', end_date: '', usage_limit: '', per_user_limit: '1'
  });
  const [savingScheme, setSavingScheme] = useState(false);

  const fetchLiveDB = async () => {
    try {
      const res = await fetch('/api/data');
      if (res.ok) {
        const db = await res.json();
        
        setOrders((prevOrders) => {
          if (prevOrders.length > 0 && db.orders.length > prevOrders.length) {
            setNotifications(n => n + (db.orders.length - prevOrders.length));
          }
          return db.orders;
        });

        setUsers(db.users);
        setInventory(db.products);
        if (db.schemes) setSchemes(db.schemes);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLiveDB();
    const interval = setInterval(fetchLiveDB, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  const handleApproveUser = async (phone: string) => {
    const updatedUsers = users.map(u => u.phone === phone ? { ...u, is_approved: true } : u);
    setUsers(updatedUsers);
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'raw_override', db: { users: updatedUsers } })
    });
  };

  const handleUpdateOrderStatus = async (id: string, newStatus: string) => {
    let logistics = { courier_name: '', tracking_id: '' };
    
    if (newStatus === 'Shipped') {
      const courier = window.prompt("Enter Courier Partner Name (e.g., BlueDart, Delhivery):");
      if (courier === null) return;
      const tracking = window.prompt("Enter Tracking AWB Number:");
      if (tracking === null) return;
      logistics.courier_name = courier;
      logistics.tracking_id = tracking;
    }

    setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus, ...logistics } : o));
    
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        collection: 'orders', 
        item: { id, status: newStatus, ...logistics }, 
        action: 'update_status' 
      })
    });
    fetchLiveDB();
  };

  const handleUpdateStock = async (id: number, change: number) => {
    setInventory(inventory.map(p => p.id === id ? { ...p, stock: Math.max(0, p.stock + change) } : p));
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_stock', productId: id, changeAmount: change })
    });
  };

  const handleAddNewProduct = async () => {
    if (!newItem.name || !newItem.price) return;
    const formattedItem = {
      ...newItem,
      company: newItem.company || 'Vakul Lifescience',
      category: newItem.category || 'General Pharma',
      packing: newItem.packing || '',
      price: Number(newItem.price),
      mrp: Number(newItem.mrp) || Number(newItem.price),
      stock: Number(newItem.stock) || 50
    };
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_product', item: formattedItem })
    });
    setNewItem({ name: '', company: '', category: '', packing: '', price: '', mrp: '', stock: '' });
    fetchLiveDB();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'users' | 'products') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'users') setUploadingUsers(true);
    else setUploadingProducts(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Successfully imported ${data.added} ${type}.`);
        fetchLiveDB();
      } else {
        const err = await res.json();
        alert(`Upload failed: ${err.error}`);
      }
    } catch (err) {
      alert('An error occurred during upload.');
    } finally {
      if (type === 'users') setUploadingUsers(false);
      else setUploadingProducts(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSaveScheme = async () => {
    if (!schemeForm.title || !schemeForm.code || !schemeForm.start_date || !schemeForm.end_date) {
      alert('Title, Code, Start Date, and End Date are required.');
      return;
    }
    setSavingScheme(true);
    try {
      const res = await fetch('/api/schemes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...schemeForm,
          discount_percent: schemeForm.discount_percent ? Number(schemeForm.discount_percent) : null,
          flat_discount: schemeForm.flat_discount ? Number(schemeForm.flat_discount) : null,
          min_order_value: schemeForm.min_order_value ? Number(schemeForm.min_order_value) : 0,
          max_discount: schemeForm.max_discount ? Number(schemeForm.max_discount) : null,
          usage_limit: schemeForm.usage_limit ? Number(schemeForm.usage_limit) : 0,
          per_user_limit: schemeForm.per_user_limit ? Number(schemeForm.per_user_limit) : 1,
        })
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed to create scheme'); return; }
      setSchemeForm({ title: '', description: '', code: '', scheme_type: 'Discount', discount_percent: '', flat_discount: '', min_order_value: '', max_discount: '', start_date: '', end_date: '', usage_limit: '', per_user_limit: '1' });
      setShowSchemeForm(false);
      fetchLiveDB();
    } finally {
      setSavingScheme(false);
    }
  };

  const handleDeleteScheme = async (id: number) => {
    if (!confirm('Permanently delete this scheme?')) return;
    await fetch(`/api/schemes?id=${id}`, { method: 'DELETE' });
    fetchLiveDB();
  };

  const handleToggleScheme = async (id: number) => {
    await fetch('/api/schemes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'toggle' })
    });
    fetchLiveDB();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Placed': 
        return <Badge className="bg-amber-50 text-amber-800 border border-amber-200/80 font-semibold px-2.5 py-0.5 rounded-md text-xs"><Clock className="w-3 h-3 mr-1 text-amber-600" /> Placed</Badge>;
      case 'Accepted': 
        return <Badge className="bg-blue-50 text-blue-800 border border-blue-200/80 font-semibold px-2.5 py-0.5 rounded-md text-xs"><Check className="w-3 h-3 mr-1 text-blue-600" /> Accepted</Badge>;
      case 'Processing': 
        return <Badge className="bg-purple-50 text-purple-800 border border-purple-200/80 font-semibold px-2.5 py-0.5 rounded-md text-xs"><RefreshCcw className="w-3 h-3 mr-1 text-purple-600 animate-spin" /> Processing</Badge>;
      case 'Shipped': 
        return <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold px-2.5 py-0.5 rounded-md text-xs"><Truck className="w-3 h-3 mr-1 text-emerald-600" /> Shipped</Badge>;
      case 'Rejected':
        return <Badge className="bg-rose-50 text-rose-800 border border-rose-200/80 font-semibold px-2.5 py-0.5 rounded-md text-xs"><X className="w-3 h-3 mr-1 text-rose-600" /> Rejected</Badge>;
      default: 
        return <Badge variant="outline" className="text-slate-600">{status}</Badge>;
    }
  };

  const filteredInventory = inventory.filter(p => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = p.name?.toLowerCase().includes(q) || 
                          p.company?.toLowerCase().includes(q) ||
                          p.drug_name?.toLowerCase().includes(q) ||
                          p.code?.toLowerCase().includes(q);
    const matchesCat = categoryFilter ? p.category === categoryFilter : true;
    const matchesDistributor = distributorFilter ? p.distributor === distributorFilter : true;
    const matchesStock = stockStatusFilter === 'available' ? p.stock > 0 : (stockStatusFilter === 'out_of_stock' ? p.stock === 0 : true);
    return matchesSearch && matchesCat && matchesDistributor && matchesStock;
  });

  const uniqueCategories = Array.from(new Set(inventory.map(p => p.category))).filter(Boolean);
  const uniqueDistributors = Array.from(new Set(inventory.map(p => p.distributor))).filter(Boolean);

  const totalPages = Math.ceil(filteredInventory.length / ITEMS_PER_PAGE);

  // Analytics
  const totalRevenue = orders.filter(o => o.status !== 'Rejected').reduce((sum, o) => sum + (o.total || 0), 0);
  const pendingUsersCount = users.filter(u => !u.is_approved && u.role !== 'admin').length;

  return (
    <div className="min-h-screen bg-slate-900/5 text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
      {/* PROFESSIONAL B2B NAVBAR */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-50 shadow-md">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center shadow-inner text-slate-950 font-black tracking-tighter">
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

          <div className="flex items-center gap-5">
            <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Sync Active
            </div>

            <div className="relative cursor-pointer" onClick={() => setNotifications(0)}>
              <div className="p-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors border border-slate-700">
                <Bell className="w-4 h-4 text-slate-300" />
              </div>
              {notifications > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-400 text-[10px] font-bold text-slate-950">
                  {notifications}
                </span>
              )}
            </div>

            <div className="h-6 w-px bg-slate-800"></div>

            <Button variant="ghost" onClick={handleLogout} className="text-slate-300 hover:text-white hover:bg-slate-800 gap-2 h-9 px-3 text-xs font-semibold rounded-lg">
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-[1440px] mx-auto px-6 py-8">
        
        {/* EXECUTIVE METRICS DASHBOARD */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Active SKUs</p>
                <h3 className="text-3xl font-extrabold text-slate-900 mt-1 tabular-nums">{inventory.length.toLocaleString()}</h3>
                <p className="text-[11px] text-slate-500 font-medium mt-1">Upkar & Swasthik Catalog</p>
              </div>
              <div className="p-2.5 bg-slate-100 rounded-lg text-slate-700">
                <Package className="w-5 h-5" />
              </div>
            </div>
          </Card>

          <Card className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Retail Pharmacies</p>
                <h3 className="text-3xl font-extrabold text-slate-900 mt-1 tabular-nums">{users.filter(u => u.role !== 'admin').length}</h3>
                <p className="text-[11px] text-emerald-600 font-semibold mt-1">{pendingUsersCount} Pending Approvals</p>
              </div>
              <div className="p-2.5 bg-blue-50 rounded-lg text-blue-700">
                <Building2 className="w-5 h-5" />
              </div>
            </div>
          </Card>

          <Card className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Wholesale Orders</p>
                <h3 className="text-3xl font-extrabold text-slate-900 mt-1 tabular-nums">{orders.length}</h3>
                <p className="text-[11px] text-slate-500 font-medium mt-1">{orders.filter(o => o.status === 'Placed').length} New Orders</p>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-lg text-amber-700">
                <Activity className="w-5 h-5" />
              </div>
            </div>
          </Card>

          <Card className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Sales Volume</p>
                <h3 className="text-3xl font-extrabold text-slate-900 mt-1 tabular-nums">₹{totalRevenue.toLocaleString('en-IN')}</h3>
                <p className="text-[11px] text-emerald-600 font-semibold mt-1">Verified Orders</p>
              </div>
              <div className="p-2.5 bg-emerald-50 rounded-lg text-emerald-700">
                <BarChart className="w-5 h-5" />
              </div>
            </div>
          </Card>
        </div>

        {/* TABS NAVIGATION */}
        <Tabs defaultValue="inventory" className="w-full">
          <TabsList className="h-12 bg-white border border-slate-200 p-1 rounded-xl shadow-sm inline-flex mb-6">
            <TabsTrigger value="inventory" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-5 font-semibold text-xs transition-all flex items-center gap-2">
              <Package className="w-4 h-4" /> B2B Product Master ({inventory.length})
            </TabsTrigger>
            <TabsTrigger value="orders" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-5 font-semibold text-xs transition-all flex items-center gap-2">
              <Activity className="w-4 h-4" /> Live Orders ({orders.length})
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-5 font-semibold text-xs transition-all flex items-center gap-2">
              <Building2 className="w-4 h-4" /> Pharmacy Partners ({users.filter(u => u.role !== 'admin').length})
            </TabsTrigger>
            <TabsTrigger value="schemes" className="data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-lg px-5 font-semibold text-xs transition-all flex items-center gap-2">
              <Tag className="w-4 h-4" /> B2B Schemes
            </TabsTrigger>
          </TabsList>

          {/* INVENTORY MASTER TAB */}
          <TabsContent value="inventory" className="mt-0 outline-none">
            <Card className="border border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Pharmaceutical Product Master</h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Comprehensive SKU database parsed from distributor catalogs</p>
                </div>
                <div className="flex gap-2">
                  <input type="file" accept=".xlsx, .xls" className="hidden" ref={productFileInput} onChange={(e) => handleFileUpload(e, 'products')} />
                  <Button variant="outline" size="sm" className="border-slate-300 text-slate-700 text-xs font-semibold" onClick={() => productFileInput.current?.click()} disabled={uploadingProducts}>
                    {uploadingProducts ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                    Bulk Upload Catalog
                  </Button>
                </div>
              </div>

              {/* FILTER BAR */}
              <div className="p-4 bg-white border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search name, composition, code..." 
                    value={searchTerm} 
                    onChange={e => { setSearchTerm(e.target.value); setInventoryPage(1); }} 
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:bg-white focus:outline-none transition-all"
                  />
                </div>

                <select 
                  value={categoryFilter} 
                  onChange={e => { setCategoryFilter(e.target.value); setInventoryPage(1); }} 
                  className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                >
                  <option value="">All Categories ({uniqueCategories.length})</option>
                  {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select 
                  value={distributorFilter} 
                  onChange={e => { setDistributorFilter(e.target.value); setInventoryPage(1); }} 
                  className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                >
                  <option value="">All Distributors</option>
                  {uniqueDistributors.map(d => <option key={d} value={d}>{d}</option>)}
                </select>

                <select 
                  value={stockStatusFilter} 
                  onChange={e => { setStockStatusFilter(e.target.value); setInventoryPage(1); }} 
                  className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                >
                  <option value="">All Stock Status</option>
                  <option value="available">In Stock Only</option>
                  <option value="out_of_stock">Out of Stock</option>
                </select>
              </div>

              {/* TABLE */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-100/70">
                    <TableRow className="border-slate-200">
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 pl-6">Code / Product Details</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5">Composition / Molecule</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5">Packing</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5">Distributor</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 text-right">Sale Rate / PTR</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 text-right">MRP</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 text-center">Stock</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] tracking-wider py-3.5 pr-6 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.slice((inventoryPage - 1) * ITEMS_PER_PAGE, inventoryPage * ITEMS_PER_PAGE).map((product) => {
                      const discountMargin = product.mrp > 0 && product.price < product.mrp 
                        ? Math.round(((product.mrp - product.price) / product.mrp) * 100) 
                        : 0;

                      return (
                        <TableRow key={product.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                          <TableCell className="py-3 pl-6">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                                <Pill className="w-4 h-4 text-slate-600" />
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-sm tracking-tight block">{product.name}</span>
                                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-0.5">
                                  {product.code && <span className="font-mono text-[11px] text-slate-400">#{product.code}</span>}
                                  <span className="font-semibold text-slate-700">{product.company || product.manufacturer}</span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-slate-500">{product.category}</span>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          
                          <TableCell className="py-3">
                            <span className="text-xs text-slate-600 font-medium block max-w-[220px] truncate" title={product.drug_name || product.composition}>
                              {product.drug_name || product.composition || '—'}
                            </span>
                          </TableCell>

                          <TableCell className="py-3">
                            {product.packing ? (
                              <span className="inline-block bg-slate-100 text-slate-700 text-xs font-semibold px-2 py-0.5 rounded border border-slate-200 font-mono">
                                {product.packing}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </TableCell>

                          <TableCell className="py-3">
                            <span className="text-xs font-semibold text-slate-700">
                              {product.distributor || 'Upkar Pharma'}
                            </span>
                          </TableCell>

                          <TableCell className="py-3 text-right">
                            <span className="font-extrabold text-slate-900 text-sm tabular-nums">
                              ₹{product.price?.toLocaleString('en-IN')}
                            </span>
                          </TableCell>

                          <TableCell className="py-3 text-right">
                            {product.mrp > 0 ? (
                              <div>
                                <span className="text-xs font-semibold text-slate-500 tabular-nums">₹{product.mrp?.toLocaleString('en-IN')}</span>
                                {discountMargin > 0 && (
                                  <span className="block text-[10px] font-bold text-emerald-600">
                                    {discountMargin}% Margin
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </TableCell>

                          <TableCell className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button onClick={() => handleUpdateStock(product.id, -1)} className="w-6 h-6 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold text-xs flex items-center justify-center">-</button>
                              <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${product.stock === 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-800'}`}>
                                {product.stock}
                              </span>
                              <button onClick={() => handleUpdateStock(product.id, 1)} className="w-6 h-6 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold text-xs flex items-center justify-center">+</button>
                            </div>
                          </TableCell>

                          <TableCell className="py-3 pr-6 text-right">
                            <Button variant="ghost" size="sm" className="h-7 text-xs font-semibold text-slate-600 hover:text-slate-900" onClick={() => setSelectedProduct(product)}>
                              Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* PAGINATION */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">
                  Showing {filteredInventory.length > 0 ? (inventoryPage - 1) * ITEMS_PER_PAGE + 1 : 0} to {Math.min(inventoryPage * ITEMS_PER_PAGE, filteredInventory.length)} of {filteredInventory.length.toLocaleString()} SKUs
                </span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={inventoryPage === 1} onClick={() => setInventoryPage(p => Math.max(1, p - 1))} className="h-8 text-xs font-semibold">
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                  </Button>
                  <span className="text-xs font-bold text-slate-700 px-2">Page {inventoryPage} of {totalPages || 1}</span>
                  <Button size="sm" variant="outline" disabled={inventoryPage >= totalPages} onClick={() => setInventoryPage(p => p + 1)} className="h-8 text-xs font-semibold">
                    Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ORDERS TAB */}
          <TabsContent value="orders" className="mt-0 outline-none">
            <Card className="border border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200 bg-slate-50/50">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">Wholesale Order Lifecycle</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">Manage B2B order verification, status progression, and courier dispatch</p>
              </div>
              <Table>
                <TableHeader className="bg-slate-100/70">
                  <TableRow className="border-slate-200">
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 pl-6">Order ID</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5">Pharmacy Store</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5">Date</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5">Item Summary</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 text-right">Total Amount</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 text-center">Status</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 pr-6 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <TableCell className="py-4 pl-6 font-mono font-bold text-xs text-slate-900">{o.id}</TableCell>
                      <TableCell className="py-4 font-semibold text-slate-800 text-xs">{o.store_name || o.store}</TableCell>
                      <TableCell className="py-4 text-xs font-medium text-slate-500">{o.date}</TableCell>
                      <TableCell className="py-4 text-xs text-slate-600">
                        {o.items?.length || 0} Products
                      </TableCell>
                      <TableCell className="py-4 text-right font-extrabold text-slate-900 text-sm tabular-nums">
                        ₹{o.total?.toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="py-4 text-center">
                        {getStatusBadge(o.status)}
                      </TableCell>
                      <TableCell className="py-4 pr-6 text-right">
                        <div className="flex justify-end gap-1.5">
                          {o.status === "Placed" && (
                            <>
                              <Button size="sm" onClick={() => handleUpdateOrderStatus(o.id, 'Accepted')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 px-3 rounded">Accept</Button>
                              <Button size="sm" variant="outline" onClick={() => handleUpdateOrderStatus(o.id, 'Rejected')} className="border-rose-200 text-rose-700 hover:bg-rose-50 font-semibold text-xs h-7 px-3 rounded">Reject</Button>
                            </>
                          )}
                          {o.status === "Accepted" && (
                            <Button size="sm" onClick={() => handleUpdateOrderStatus(o.id, 'Processing')} className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-7 px-3 rounded">Process</Button>
                          )}
                          {o.status === "Processing" && (
                            <Button size="sm" onClick={() => handleUpdateOrderStatus(o.id, 'Shipped')} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 px-3 rounded">Dispatch</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* USERS PARTNERS TAB */}
          <TabsContent value="users" className="mt-0 outline-none">
            <Card className="border border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Pharmacy Partner Accounts</h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Manage B2B buyer approvals and credit limits</p>
                </div>
                <input type="file" accept=".xlsx, .xls" className="hidden" ref={userFileInput} onChange={(e) => handleFileUpload(e, 'users')} />
                <Button size="sm" className="bg-slate-900 text-white font-semibold text-xs" onClick={() => userFileInput.current?.click()} disabled={uploadingUsers}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" /> Bulk Import Partners
                </Button>
              </div>
              <Table>
                <TableHeader className="bg-slate-100/70">
                  <TableRow className="border-slate-200">
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 pl-6">Store Name</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5">Contact Phone</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5">Status</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 text-right">Credit Balance</TableHead>
                    <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 pr-6 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.filter(u => u.role !== 'admin').map((user) => (
                    <TableRow key={user.phone} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                      <TableCell className="py-4 pl-6 font-bold text-slate-900 text-xs">{user.store_name}</TableCell>
                      <TableCell className="py-4 text-xs font-mono text-slate-600">{user.phone}</TableCell>
                      <TableCell className="py-4">
                        {user.is_approved ? (
                          <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">Verified Partner</Badge>
                        ) : (
                          <Badge className="bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold">Pending Approval</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-4 text-right font-mono font-bold text-xs text-slate-900">
                        ₹{(user.credit_balance || 0).toLocaleString('en-IN')} / ₹{(user.credit_limit || 100000).toLocaleString('en-IN')}
                      </TableCell>
                      <TableCell className="py-4 pr-6 text-right">
                        {!user.is_approved && (
                          <Button size="sm" onClick={() => handleApproveUser(user.phone)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-7 px-3 rounded">
                            Approve
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* B2B SCHEMES TAB */}
          <TabsContent value="schemes" className="mt-0 outline-none">
            <Card className="border border-slate-200 shadow-sm bg-white rounded-xl overflow-hidden">
              {/* Header */}
              <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50/50">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">B2B Discount Schemes & Coupons</h2>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">Create and manage promotional codes for pharmacy partners</p>
                </div>
                <Button
                  size="sm"
                  className="bg-slate-900 text-white font-semibold text-xs h-9 px-4 rounded-lg flex items-center gap-2"
                  onClick={() => setShowSchemeForm(v => !v)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {showSchemeForm ? 'Cancel' : 'Create New Scheme'}
                </Button>
              </div>

              {/* Create Scheme Form */}
              {showSchemeForm && (
                <div className="p-6 border-b border-slate-200 bg-slate-50">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Gift className="w-4 h-4 text-emerald-600" /> New Scheme Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Scheme Title *</label>
                      <input
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="e.g. Summer Flash Sale"
                        value={schemeForm.title}
                        onChange={e => setSchemeForm(f => ({ ...f, title: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Coupon Code *</label>
                      <input
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="e.g. SUMMER10"
                        value={schemeForm.code}
                        onChange={e => setSchemeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Type *</label>
                      <select
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        value={schemeForm.scheme_type}
                        onChange={e => setSchemeForm(f => ({ ...f, scheme_type: e.target.value }))}
                      >
                        <option value="Discount">Percentage Discount</option>
                        <option value="Flat">Flat Discount (₹)</option>
                        <option value="FreeShipping">Free Shipping</option>
                      </select>
                    </div>
                    {schemeForm.scheme_type === 'Discount' && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Discount %</label>
                        <input
                          type="number" min="1" max="100"
                          className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                          placeholder="e.g. 10"
                          value={schemeForm.discount_percent}
                          onChange={e => setSchemeForm(f => ({ ...f, discount_percent: e.target.value }))}
                        />
                      </div>
                    )}
                    {schemeForm.scheme_type === 'Flat' && (
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Flat Discount (₹)</label>
                        <input
                          type="number" min="1"
                          className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                          placeholder="e.g. 500"
                          value={schemeForm.flat_discount}
                          onChange={e => setSchemeForm(f => ({ ...f, flat_discount: e.target.value }))}
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Min. Order Value (₹)</label>
                      <input
                        type="number" min="0"
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="e.g. 2500"
                        value={schemeForm.min_order_value}
                        onChange={e => setSchemeForm(f => ({ ...f, min_order_value: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Max Discount Cap (₹)</label>
                      <input
                        type="number" min="0"
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="e.g. 1000 (optional)"
                        value={schemeForm.max_discount}
                        onChange={e => setSchemeForm(f => ({ ...f, max_discount: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Start Date *</label>
                      <input
                        type="date"
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        value={schemeForm.start_date}
                        onChange={e => setSchemeForm(f => ({ ...f, start_date: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">End Date *</label>
                      <input
                        type="date"
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        value={schemeForm.end_date}
                        onChange={e => setSchemeForm(f => ({ ...f, end_date: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Global Usage Limit</label>
                      <input
                        type="number" min="0"
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="0 = unlimited"
                        value={schemeForm.usage_limit}
                        onChange={e => setSchemeForm(f => ({ ...f, usage_limit: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Per-User Limit</label>
                      <input
                        type="number" min="1"
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="1"
                        value={schemeForm.per_user_limit}
                        onChange={e => setSchemeForm(f => ({ ...f, per_user_limit: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                      <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Description (optional)</label>
                      <input
                        className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:ring-2 focus:ring-slate-900 focus:outline-none"
                        placeholder="Short description shown to pharmacy partners in the app"
                        value={schemeForm.description}
                        onChange={e => setSchemeForm(f => ({ ...f, description: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end mt-5">
                    <Button
                      onClick={handleSaveScheme}
                      disabled={savingScheme}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-5 rounded-lg flex items-center gap-2"
                    >
                      {savingScheme ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {savingScheme ? 'Saving…' : 'Publish Scheme'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Schemes Table */}
              {schemes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Gift className="w-10 h-10 mb-3 opacity-30" />
                  <p className="text-sm font-semibold">No schemes yet</p>
                  <p className="text-xs mt-1">Click &quot;Create New Scheme&quot; to add your first discount code.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-100/70">
                    <TableRow className="border-slate-200">
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 pl-6">Title</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5">Code</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5">Type & Value</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5">Min. Order</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5">Validity</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 text-center">Usage</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 text-center">Status</TableHead>
                      <TableHead className="text-slate-600 font-bold uppercase text-[11px] py-3.5 pr-6 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schemes.map((s) => (
                      <TableRow key={s.id} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                        <TableCell className="py-4 pl-6">
                          <p className="font-bold text-xs text-slate-900">{s.title}</p>
                          {s.description && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{s.description}</p>}
                        </TableCell>
                        <TableCell className="py-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-slate-800">{s.code}</span>
                            <button
                              className="text-slate-400 hover:text-slate-700 transition-colors"
                              onClick={() => navigator.clipboard.writeText(s.code)}
                              title="Copy code"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-xs font-semibold text-slate-700">
                          {s.scheme_type === 'Discount' && s.discount_percent && (
                            <span className="text-emerald-700">{s.discount_percent}% off</span>
                          )}
                          {s.scheme_type === 'Flat' && s.flat_discount && (
                            <span className="text-emerald-700">₹{s.flat_discount} flat off</span>
                          )}
                          {s.scheme_type === 'FreeShipping' && (
                            <span className="text-blue-700">Free Shipping</span>
                          )}
                          {s.max_discount && (
                            <span className="text-slate-400 font-normal ml-1">(max ₹{s.max_discount})</span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-xs font-mono font-semibold text-slate-700">
                          {s.min_order_value > 0 ? `₹${Number(s.min_order_value).toLocaleString('en-IN')}` : '—'}
                        </TableCell>
                        <TableCell className="py-4 text-xs text-slate-600 font-medium">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            {s.start_date} → {s.end_date}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-center text-xs font-semibold text-slate-700">
                          {s.times_used}
                          {s.usage_limit > 0 && <span className="text-slate-400 font-normal"> / {s.usage_limit}</span>}
                          {s.usage_limit === 0 && <span className="text-slate-400 font-normal"> / ∞</span>}
                        </TableCell>
                        <TableCell className="py-4 text-center">
                          {s.is_active ? (
                            <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">Active</Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-500 border border-slate-200 text-xs font-semibold">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-4 pr-6 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs font-semibold border-slate-200 text-slate-600 hover:bg-slate-100 rounded"
                              onClick={() => handleToggleScheme(s.id)}
                              title={s.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {s.is_active ? <ToggleRight className="w-3.5 h-3.5 text-emerald-600" /> : <ToggleLeft className="w-3.5 h-3.5 text-slate-400" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs font-semibold border-rose-200 text-rose-600 hover:bg-rose-50 rounded"
                              onClick={() => handleDeleteScheme(s.id)}
                              title="Delete scheme"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* PRODUCT DETAILS MODAL */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-0.5">{selectedProduct.distributor || 'Upkar Pharma'}</span>
                <h3 className="text-lg font-extrabold text-slate-900">{selectedProduct.name}</h3>
                <p className="text-xs font-semibold text-slate-500">{selectedProduct.company || selectedProduct.manufacturer}</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs mb-6">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Composition:</span>
                <span className="font-semibold text-slate-900 text-right">{selectedProduct.drug_name || selectedProduct.composition || 'Standard formulation'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Packaging Spec:</span>
                <span className="font-mono font-bold text-slate-900">{selectedProduct.packing || 'Default'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">WholeSale Sale Rate (PTR):</span>
                <span className="font-extrabold text-slate-900">₹{selectedProduct.price?.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Maximum Retail Price (MRP):</span>
                <span className="font-semibold text-slate-700">₹{selectedProduct.mrp?.toLocaleString('en-IN') || selectedProduct.price}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Stock Level:</span>
                <span className={`font-mono font-bold ${selectedProduct.stock > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{selectedProduct.stock} Units</span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setSelectedProduct(null)} className="bg-slate-900 text-white text-xs font-semibold h-9 px-4 rounded-lg">
                Close Product File
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
