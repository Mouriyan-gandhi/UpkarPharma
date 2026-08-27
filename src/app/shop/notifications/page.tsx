"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, FileText, Package, Truck, XCircle, CheckCircle, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Notification = {
  id: number;
  user_id?: string | null;
  for_admin: boolean;
  type: string;
  title: string;
  body?: string | null;
  meta?: any;
  read: boolean;
  created_at: string;
};

function iconFor(type: string) {
  if (type === "invoice_ready") return { Icon: FileText, color: "text-brand-700 bg-brand-100" };
  if (type === "order_packaged") return { Icon: Package, color: "text-amber-700 bg-amber-100" };
  if (type === "order_dispatched") return { Icon: Truck, color: "text-brand-700 bg-brand-100" };
  if (type === "order_rejected") return { Icon: XCircle, color: "text-rose-700 bg-rose-100" };
  if (type === "profile_change_approved") return { Icon: CheckCircle, color: "text-brand-700 bg-brand-100" };
  if (type === "profile_change_rejected") return { Icon: XCircle, color: "text-rose-700 bg-rose-100" };
  if (type === "account_approved") return { Icon: CheckCircle, color: "text-brand-700 bg-brand-100" };
  if (type === "credit_updated") return { Icon: User, color: "text-slate-700 bg-slate-100" };
  return { Icon: Bell, color: "text-slate-700 bg-slate-100" };
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setItems(data.notifications || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } finally {
      setMarkingAll(false);
    }
  };

  const markOne = async (id: number) => {
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch { /* ignore */ }
  };

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Notifications</h1>
          <p className="text-sm text-slate-500 mt-1">{unread > 0 ? `${unread} unread` : "All caught up"}</p>
        </div>
        {unread > 0 && (
          <Button size="sm" variant="outline" onClick={markAll} disabled={markingAll} className="text-xs">
            {markingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Mark all as read"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center text-slate-500">
          <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center text-slate-500">
          <Bell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-bold">No notifications yet</p>
          <p className="text-sm mt-1">Order updates and profile-change approvals will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {items.map((n) => {
            const { Icon, color } = iconFor(n.type);
            const orderHref = n.meta?.order_id ? `/shop/orders/${n.meta.order_id}` : null;
            const content = (
              <div
                onClick={() => !n.read && markOne(n.id)}
                className={`flex gap-3 p-4 border-b border-slate-100 last:border-b-0 cursor-pointer transition-colors ${
                  n.read ? "hover:bg-slate-50" : "bg-brand-50/50 hover:bg-brand-50"
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm text-slate-900 flex-1 min-w-0 truncate ${n.read ? "font-bold" : "font-black"}`}>{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />}
                  </div>
                  {n.body && <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.body}</p>}
                  <p className="text-[10px] font-bold text-slate-400 mt-1.5 uppercase tracking-wider">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            );
            return orderHref ? (
              <Link key={n.id} href={orderHref}>{content}</Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
