"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Pill, ShieldCheck, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function CustomerLoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  // Read ?pending=1 / ?blocked=1 from the URL client-side. Avoids the
  // useSearchParams() hook which requires a Suspense boundary during SSG
  // in Next 16 and would otherwise fail the prod build.
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    setPending(p.get("pending") === "1");
    setBlocked(p.get("blocked") === "1");
  }, []);

  const canSubmit = phone.length >= 10 && password.length >= 4;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/customer-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push("/shop");
        router.refresh();
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F5F3] flex items-center justify-center p-4 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%231B4332' fill-opacity='1'%3E%3Ccircle cx='7' cy='7' r='1.5'/%3E%3Ccircle cx='37' cy='37' r='1.5'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-1 upkem-header-gradient" />

      <div className="max-w-sm w-full relative z-10">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-4 relative">
            <div className="absolute inset-0 bg-brand-800/10 rounded-2xl rotate-6" />
            <div className="relative bg-white rounded-2xl p-2.5 shadow-lg shadow-brand-800/10 border border-brand-200/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pharma_logo.jpeg" alt="Upkem Labs" className="w-full h-full object-contain rounded-lg" />
            </div>
          </div>
          <h1 className="text-xl font-black tracking-tight text-brand-900">UPKEM LABS</h1>
          <p className="text-brand-600 font-bold mt-1 text-[10px] tracking-[0.15em] uppercase">Pharmacy Partner Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-brand-800/10 border border-brand-200/40 overflow-hidden">
          <div className="h-1 upkem-header-gradient" />
          <div className="px-6 pt-6 pb-3">
            <h2 className="text-lg font-black text-brand-900 flex items-center gap-2">
              <div className="p-1.5 bg-brand-50 rounded-md">
                <Pill className="w-4 h-4 text-brand-700" />
              </div>
              Sign in to your shop
            </h2>
            <p className="text-brand-600/70 text-sm mt-1">
              Access your catalog, place orders, and download invoices.
            </p>
          </div>

          <form onSubmit={handleLogin} className="px-6 pb-6 space-y-3.5">
            {(error || pending || blocked) && (
              <div className={`p-3 rounded-lg text-sm font-semibold flex items-start gap-2 ${
                blocked ? "bg-rose-50 border border-rose-100 text-rose-700"
                : pending ? "bg-amber-50 border border-amber-100 text-amber-800"
                : "bg-red-50 border border-red-100 text-red-600"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${
                  blocked ? "bg-rose-500" : pending ? "bg-amber-500" : "bg-red-500"
                }`} />
                {error || (blocked ? "This account has been blocked. Contact UPKEM support." : "Account pending admin approval.")}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-800 tracking-wide">Phone Number</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-600 font-bold text-sm select-none">+91</span>
                <Input
                  type="tel"
                  placeholder="9999999999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  className="h-11 pl-11 border-brand-200 bg-brand-50/30 text-base font-medium rounded-lg focus-visible:ring-brand-500 focus-visible:border-brand-400 tabular-nums"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-800 tracking-wide">Password</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 border-brand-200 bg-brand-50/30 text-base font-medium rounded-lg focus-visible:ring-brand-500 focus-visible:border-brand-400"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-brand-800 hover:bg-brand-900 text-white rounded-lg font-bold text-sm shadow-md shadow-brand-800/20 disabled:opacity-60"
              disabled={loading || !canSubmit}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Signing in…</> : "Sign in"}
            </Button>
          </form>

          <div className="px-6 py-4 border-t border-brand-100/60 bg-brand-50/40 flex items-center justify-between">
            <p className="text-xs text-brand-800/80">New pharmacy?</p>
            <Link href="/customer-signup" className="text-xs font-black text-brand-800 hover:text-brand-900 hover:underline flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              Register your firm
            </Link>
          </div>
        </div>

        {/* Trust bar */}
        <div className="mt-5 flex items-center justify-center gap-4 text-[10px] font-bold text-brand-800/60 uppercase tracking-wider">
          <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Verified partners only</span>
          <span>·</span>
          <span>60-day credit</span>
        </div>
      </div>
    </div>
  );
}
