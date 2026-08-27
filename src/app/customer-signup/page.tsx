"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Building2, Store, Stethoscope, HeartPulse, ChevronRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const BUSINESS_TYPES = [
  { key: "Retailer",              label: "Retailer / Pharmacy",  icon: Store,        hint: "GST required later" },
  { key: "Clinic",                label: "Clinic / Hospital",    icon: Building2,    hint: "Registration later" },
  { key: "Doctor",                label: "Doctor",               icon: Stethoscope,  hint: "DMC number later" },
  { key: "Doctor with Pharmacy",  label: "Doctor + Pharmacy",    icon: HeartPulse,   hint: "DL + GST later" },
];

export default function CustomerSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ phone: "", store_name: "", user_type: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const canSubmit =
    form.phone.length === 10 &&
    form.store_name.trim().length > 0 &&
    form.user_type !== "" &&
    password.length >= 6 &&
    password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!canSubmit) return;
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      // Step 1: Create the profile (signup endpoint creates auth.users + public.users, marked NOT approved).
      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: form.phone,
          store_name: form.store_name.trim(),
          user_type: form.user_type,
        }),
      });
      const signupData = await signupRes.json();
      if (!signupRes.ok) {
        setError(signupData.error || "Signup failed. Please try again.");
        setLoading(false);
        return;
      }

      // Step 2: Set a password for the fresh auth user via admin endpoint.
      // (Password OTP flow will replace this once phone provider is enabled.)
      const setPwRes = await fetch("/api/auth/set-signup-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: form.phone, password }),
      });
      if (!setPwRes.ok) {
        // Not fatal — user record exists, admin can set/reset password. Show success anyway.
        console.warn("Set password failed (user was still created)");
      }
      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#F0F5F3] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 upkem-header-gradient" />
        <div className="max-w-md w-full relative z-10 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-lg shadow-brand-800/30">
            <CheckCircle2 className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black text-brand-900">Request received</h1>
          <p className="text-brand-800/70 mt-2 max-w-xs mx-auto text-sm">
            Your firm has been submitted for admin approval. You'll be able to sign in once we've verified your details.
          </p>
          <div className="bg-white rounded-xl border border-brand-200 p-5 mt-6 text-left">
            <p className="text-[10px] font-black text-brand-700 uppercase tracking-wider mb-2">What happens next</p>
            <ol className="space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><span className="text-brand-700 font-black">1.</span> Admin reviews your registration (typically within 1 business day)</li>
              <li className="flex gap-2"><span className="text-brand-700 font-black">2.</span> You'll get an SMS + email notification once approved</li>
              <li className="flex gap-2"><span className="text-brand-700 font-black">3.</span> Sign in with your phone + password to start ordering</li>
            </ol>
          </div>
          <Button asChild className="mt-6 h-11 px-6 bg-brand-800 hover:bg-brand-900 text-white font-bold">
            <Link href="/customer-login">Back to Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F5F3] flex items-center justify-center p-4 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%231B4332' fill-opacity='1'%3E%3Ccircle cx='7' cy='7' r='1.5'/%3E%3Ccircle cx='37' cy='37' r='1.5'/%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-1 upkem-header-gradient" />

      <div className="max-w-md w-full relative z-10 my-8">
        {/* Brand */}
        <div className="text-center mb-5">
          <div className="w-14 h-14 mx-auto mb-3 relative">
            <div className="absolute inset-0 bg-brand-800/10 rounded-2xl rotate-6" />
            <div className="relative bg-white rounded-2xl p-2 shadow-lg shadow-brand-800/10 border border-brand-200/50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pharma_logo.jpeg" alt="Upkem Labs" className="w-full h-full object-contain rounded-lg" />
            </div>
          </div>
          <h1 className="text-lg font-black tracking-tight text-brand-900">Register your pharmacy</h1>
          <p className="text-brand-600 mt-1 text-xs">3 quick details · full profile after approval</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl shadow-brand-800/10 border border-brand-200/40 overflow-hidden">
          <div className="h-1 upkem-header-gradient" />
          <div className="p-6 space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm font-semibold flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
                {error}
              </div>
            )}

            {/* Firm name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-800 tracking-wide flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" /> Firm / Clinic Name
              </label>
              <Input
                placeholder="e.g. City Pharma"
                value={form.store_name}
                onChange={(e) => setForm({ ...form, store_name: e.target.value })}
                className="h-11 border-brand-200 bg-brand-50/30 text-base font-medium rounded-lg focus-visible:ring-brand-500"
                required
                autoFocus
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-800 tracking-wide">Phone Number</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-600 font-bold text-sm select-none">+91</span>
                <Input
                  type="tel"
                  placeholder="9999999999"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                  className="h-11 pl-11 border-brand-200 bg-brand-50/30 text-base font-medium rounded-lg focus-visible:ring-brand-500 tabular-nums"
                  required
                />
              </div>
            </div>

            {/* Business type */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-brand-800 tracking-wide">Business Type</label>
              <div className="grid grid-cols-2 gap-2">
                {BUSINESS_TYPES.map((bt) => {
                  const Icon = bt.icon;
                  const sel = form.user_type === bt.key;
                  return (
                    <button
                      key={bt.key}
                      type="button"
                      onClick={() => setForm({ ...form, user_type: bt.key })}
                      className={`relative text-left p-3 rounded-lg border-2 transition-all ${
                        sel
                          ? "bg-brand-800 border-brand-800 text-white shadow-md shadow-brand-800/20"
                          : "bg-brand-50/30 border-brand-100 text-slate-700 hover:border-brand-300"
                      }`}
                    >
                      <Icon className={`w-5 h-5 mb-2 ${sel ? "text-white" : "text-brand-700"}`} />
                      <p className={`text-xs font-black leading-tight ${sel ? "text-white" : "text-brand-900"}`}>{bt.label}</p>
                      <p className={`text-[10px] font-semibold mt-0.5 ${sel ? "text-brand-100" : "text-slate-500"}`}>{bt.hint}</p>
                      {sel && (
                        <CheckCircle2 className="w-4 h-4 absolute top-2 right-2 text-white" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Password */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-brand-800 tracking-wide">Password</label>
                <Input
                  type="password"
                  placeholder="At least 6 chars"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 border-brand-200 bg-brand-50/30 text-sm font-medium rounded-lg focus-visible:ring-brand-500"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-brand-800 tracking-wide">Confirm</label>
                <Input
                  type="password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`h-11 text-sm font-medium rounded-lg focus-visible:ring-brand-500 ${
                    confirmPassword && password !== confirmPassword
                      ? "border-rose-300 bg-rose-50"
                      : "border-brand-200 bg-brand-50/30"
                  }`}
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-brand-800 hover:bg-brand-900 text-white rounded-lg font-bold text-sm shadow-md shadow-brand-800/20 disabled:opacity-60"
              disabled={loading || !canSubmit}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting…</> : (
                <>Submit for approval <ChevronRight className="w-4 h-4 ml-1" /></>
              )}
            </Button>
          </div>

          <div className="px-6 py-3 border-t border-brand-100/60 bg-brand-50/40 flex items-center justify-between">
            <p className="text-xs text-brand-800/80">Already registered?</p>
            <Link href="/customer-login" className="text-xs font-black text-brand-800 hover:text-brand-900 hover:underline">
              Sign in →
            </Link>
          </div>
        </form>

        <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-bold text-brand-800/60 uppercase tracking-wider">
          <ShieldCheck className="w-3 h-3" />
          Data secured · Verified partners only
        </div>
      </div>
    </div>
  );
}
