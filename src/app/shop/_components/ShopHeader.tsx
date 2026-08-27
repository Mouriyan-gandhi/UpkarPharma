"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Home, Package, ShoppingCart, Receipt, User, LogOut, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "../_lib/cart";

type Props = {
  user: {
    id: string;
    store_name?: string | null;
    phone: string;
    role: string;
    credit_balance: number;
    credit_limit: number;
  };
};

const NAV = [
  { href: "/shop",              label: "Home",     icon: Home },
  { href: "/shop/catalog",      label: "Catalog",  icon: Package },
  { href: "/shop/cart",         label: "Cart",     icon: ShoppingCart },
  { href: "/shop/orders",       label: "Orders",   icon: Receipt },
  { href: "/shop/profile",      label: "Profile",  icon: User },
];

export default function ShopHeader({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const { totalQty } = useCart();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUnread(data.unread || 0);
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const handleLogout = async () => {
    await fetch("/api/customer-auth", { method: "DELETE" });
    router.push("/customer-login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/shop" ? pathname === "/shop" : pathname.startsWith(href);

  const available = Math.max(0, (user.credit_limit || 0) - (user.credit_balance || 0));

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link href="/shop" className="flex items-center gap-2 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-brand-800 flex items-center justify-center">
            <Pill className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block">
            <div className="font-black text-brand-900 text-sm leading-tight tracking-tight">UPKEM LABS</div>
            <div className="text-[10px] text-brand-600 font-semibold uppercase tracking-wider">Pharmacy Portal</div>
          </div>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = isActive(n.href);
            const showCartBadge = n.href === "/shop/cart" && totalQty > 0;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`relative px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${
                  active ? "bg-brand-800 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {n.label}
                {showCartBadge && (
                  <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center ${active ? "bg-white text-brand-800" : "bg-brand-800 text-white"}`}>
                    {totalQty > 99 ? "99+" : totalQty}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Credit indicator */}
          <div className="hidden lg:flex flex-col items-end mr-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Available Credit</span>
            <span className="text-sm font-black text-brand-800 tabular-nums">₹{available.toLocaleString("en-IN")}</span>
          </div>

          <Link href="/shop/notifications" className="relative p-2 rounded-lg hover:bg-slate-100">
            <Bell className={`w-5 h-5 ${unread > 0 ? "text-brand-800" : "text-slate-600"}`} />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center px-1 border-2 border-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>

          <Link href="/shop/profile" className="hidden sm:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50">
            <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-800 font-black text-xs flex items-center justify-center">
              {user.store_name?.[0]?.toUpperCase() || "U"}
            </div>
            <span className="text-xs font-bold text-slate-800 max-w-[120px] truncate">{user.store_name}</span>
          </Link>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-500 hover:text-rose-700 hover:bg-rose-50 h-9 w-9 p-0"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Mobile nav strip */}
      <nav className="md:hidden border-t border-slate-100 flex overflow-x-auto no-scrollbar">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = isActive(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex-1 min-w-[80px] py-2.5 flex flex-col items-center gap-1 text-[11px] font-bold transition-colors ${
                active ? "text-brand-800" : "text-slate-500"
              }`}
            >
              <Icon className="w-4 h-4" />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
