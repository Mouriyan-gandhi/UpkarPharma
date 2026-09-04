"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Mail, MapPin, CreditCard, FileText, Lock, ShieldCheck, Loader2, AlertCircle, Save, Undo2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UpkemLoader } from "@/components/UpkemLoader";

type Profile = {
  id: string;
  phone: string;
  store_name: string;
  role: string;
  is_approved: boolean;
  credit_balance: number;
  credit_limit: number;
  drug_license?: string | null;
  gst_number?: string | null;
  registration_number?: string | null;
  address?: string | null;
  email?: string | null;
  user_type?: string | null;
  zone?: string | null;
  city?: string | null;
};

// Which fields require admin approval when a customer wants to change them
const LOCKED_FIELDS = new Set(["store_name", "gst_number", "drug_license", "registration_number", "user_type"]);
const FREE_FIELDS = ["email", "address", "city", "zone"] as const;
const ALL_EDITABLE = ["store_name", "gst_number", "drug_license", "registration_number", "user_type", "email", "address", "city", "zone"] as const;

const FIELD_LABEL: Record<string, string> = {
  store_name:          "Firm / Store Name",
  gst_number:          "GST Number",
  drug_license:        "Drug License",
  registration_number: "Registration Number",
  user_type:           "Business Type",
  email:               "Email",
  address:             "Delivery Address",
  city:                "City",
  zone:                "Zone / State",
};

const FIELD_PLACEHOLDER: Record<string, string> = {
  store_name:          "e.g. City Pharma",
  gst_number:          "15-character GSTIN",
  drug_license:        "e.g. TN-02-20B-XXXXX",
  registration_number: "Council / firm registration",
  user_type:           "Retailer / Hospital / Doctor with Pharmacy",
  email:               "you@firm.com",
  address:             "Building, street, area, PIN",
  city:                "e.g. Chennai",
  zone:                "e.g. Tamil Nadu",
};

const USER_TYPES = ["Retailer", "Clinic", "Doctor", "Doctor with Pharmacy"];

function fmt(n: number) {
  return (n || 0).toLocaleString("en-IN");
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);

  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [dataRes, reqRes] = await Promise.all([
        fetch("/api/data").then((r) => r.json()),
        fetch("/api/profile-change-requests?status=Pending").then((r) => r.json()),
      ]);
      const me = dataRes.users?.[0];
      setProfile(me || null);
      setPendingRequests(reqRes.requests || []);
      // Seed form from server values
      if (me) {
        const seeded: Record<string, string> = {};
        for (const k of ALL_EDITABLE) seeded[k] = me[k] ?? "";
        setForm(seeded);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const pendingKeys = useMemo(() => {
    const s = new Set<string>();
    for (const r of pendingRequests) {
      if (r.status === "Pending" && r.changes) Object.keys(r.changes).forEach((k) => s.add(k));
    }
    return s;
  }, [pendingRequests]);

  // Diff between server profile and form
  const diff = useMemo(() => {
    if (!profile) return { free: {} as Record<string, string>, locked: {} as Record<string, string>, any: false };
    const free: Record<string, string> = {};
    const locked: Record<string, string> = {};
    for (const k of ALL_EDITABLE) {
      const cur = (form[k] ?? "").trim();
      const orig = ((profile as any)[k] ?? "").toString().trim();
      if (cur !== orig) {
        if (LOCKED_FIELDS.has(k)) locked[k] = cur;
        else free[k] = cur;
      }
    }
    return { free, locked, any: Object.keys(free).length + Object.keys(locked).length > 0 };
  }, [profile, form]);

  const dirtyCount = Object.keys(diff.free).length + Object.keys(diff.locked).length;

  const revert = () => {
    if (!profile) return;
    const seeded: Record<string, string> = {};
    for (const k of ALL_EDITABLE) seeded[k] = (profile as any)[k] ?? "";
    setForm(seeded);
    setSaveMsg(null);
  };

  const save = async () => {
    if (!profile || !diff.any) return;
    setSaving(true);
    setSaveMsg(null);

    const results: string[] = [];
    let hadError = false;

    // 1) Direct update for free-edit fields
    if (Object.keys(diff.free).length > 0) {
      try {
        const res = await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_own_profile", ...diff.free }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          hadError = true;
          results.push(`Contact update failed: ${d.error || "unknown"}`);
        } else {
          results.push(`Contact fields saved: ${Object.keys(diff.free).map((k) => FIELD_LABEL[k]).join(", ")}`);
        }
      } catch {
        hadError = true;
        results.push("Contact update: network error");
      }
    }

    // 2) One change request for all locked-field edits (backend allows only one pending per user)
    if (Object.keys(diff.locked).length > 0) {
      try {
        const res = await fetch("/api/profile-change-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: diff.locked }),
        });
        const data = await res.json();
        if (!res.ok) {
          hadError = true;
          results.push(`Change request failed: ${data.error || "unknown"}`);
        } else {
          results.push(`Change request submitted for admin approval: ${Object.keys(diff.locked).map((k) => FIELD_LABEL[k]).join(", ")}`);
        }
      } catch {
        hadError = true;
        results.push("Change request: network error");
      }
    }

    setSaveMsg({ tone: hadError ? "error" : "success", text: results.join(" · ") });
    setSaving(false);
    await load();   // refresh from server so form + pending badges are in sync
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-16">
        <UpkemLoader size={56} label="Loading profile" />
      </div>
    );
  }
  if (!profile) return null;

  const utilization = profile.credit_limit > 0 ? Math.min(100, (profile.credit_balance / profile.credit_limit) * 100) : 0;
  const available = Math.max(0, profile.credit_limit - profile.credit_balance);
  const hasLockedDiff = Object.keys(diff.locked).length > 0;
  const hasPendingConflict = hasLockedDiff && pendingRequests.some((r) => r.status === "Pending");

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24">
      {/* Header card */}
      <div className="bg-brand-900 text-white rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-brand-700 border border-brand-500 flex items-center justify-center text-2xl font-black">
            {profile.store_name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-black text-white">{profile.store_name}</h1>
            <p className="text-brand-100 text-sm mt-1 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> +91 {profile.phone.replace(/^91/, "")}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {profile.is_approved && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-brand-500/20 text-brand-100 text-[10px] font-black uppercase border border-brand-400/40">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              )}
              {profile.user_type && (
                <span className="px-2 py-1 rounded bg-white/10 text-white text-[10px] font-bold uppercase">{profile.user_type}</span>
              )}
              {profile.city && (
                <span className="px-2 py-1 rounded bg-white/10 text-white text-[10px] font-bold uppercase">{profile.city}{profile.zone ? `, ${profile.zone}` : ""}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Credit facility */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-4 h-4 text-brand-700" />
          <h2 className="font-black text-slate-900 text-sm uppercase tracking-wider">Credit Facility</h2>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Metric label="Available" value={`₹${fmt(available)}`} tone="brand" />
          <Metric label="Used" value={`₹${fmt(profile.credit_balance)}`} tone="slate" />
          <Metric label="Limit" value={`₹${fmt(profile.credit_limit)}`} tone="slate" />
        </div>
        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${utilization > 90 ? "bg-rose-500" : utilization > 60 ? "bg-amber-500" : "bg-brand-600"}`}
            style={{ width: `${utilization}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2 text-right font-semibold">{Math.round(utilization)}% utilized · 60-day terms</p>
      </div>

      {/* Existing pending changes banner */}
      {pendingRequests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-black text-amber-900">Change request pending admin approval</p>
            <p className="text-xs text-amber-800 mt-1">
              You've requested changes to: <span className="font-bold">{Array.from(pendingKeys).map((k) => FIELD_LABEL[k] || k).join(", ")}</span>. You'll get a notification once reviewed.
            </p>
          </div>
        </div>
      )}

      {/* Business & Compliance form */}
      <FormSection
        title="Business & Compliance"
        icon={Building2}
        fields={["store_name", "user_type", "gst_number", "drug_license", "registration_number"]}
        form={form}
        setForm={setForm}
        pendingKeys={pendingKeys}
      />

      {/* Contact & Delivery form */}
      <FormSection
        title="Contact & Delivery"
        icon={Mail}
        fields={["email", "address", "city", "zone"]}
        form={form}
        setForm={setForm}
        pendingKeys={pendingKeys}
      />

      {/* Sticky save bar */}
      {diff.any && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 shadow-lg">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-slate-600">
              <span className="text-slate-900 font-black">{dirtyCount} change{dirtyCount === 1 ? "" : "s"}</span>
              {Object.keys(diff.free).length > 0 && (
                <span className="ml-2">· <span className="text-brand-800 font-bold">{Object.keys(diff.free).length} direct</span></span>
              )}
              {Object.keys(diff.locked).length > 0 && (
                <span className="ml-2">· <span className="text-amber-700 font-bold">{Object.keys(diff.locked).length} needs admin approval</span></span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={revert} disabled={saving} className="h-10 text-xs">
                <Undo2 className="w-3.5 h-3.5 mr-1" /> Revert
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={saving || hasPendingConflict}
                className="h-10 bg-brand-800 hover:bg-brand-900 text-white font-bold text-xs px-4"
                title={hasPendingConflict ? "Wait for the pending change request to be reviewed" : ""}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                Save Changes
              </Button>
            </div>
          </div>
          {hasPendingConflict && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-2">
              <p className="text-[11px] text-amber-800 font-semibold">
                A change request is already awaiting admin review. Wait for it to be resolved before submitting another.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Save result toast */}
      {saveMsg && (
        <div className={`fixed top-20 right-4 z-50 rounded-lg shadow-lg px-4 py-3 text-sm font-semibold max-w-md ${
          saveMsg.tone === "success" ? "bg-brand-800 text-white" :
          saveMsg.tone === "error" ? "bg-rose-600 text-white" :
          "bg-slate-800 text-white"
        }`}>
          {saveMsg.text}
          <button onClick={() => setSaveMsg(null)} className="ml-3 underline text-xs opacity-80">Dismiss</button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function Metric({ label, value, tone }: { label: string; value: string; tone: "brand" | "slate" }) {
  const cls = tone === "brand" ? "bg-brand-50 text-brand-800" : "bg-slate-50 text-slate-800";
  return (
    <div className={`rounded-lg p-3 ${cls}`}>
      <p className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg font-black tabular-nums mt-1">{value}</p>
    </div>
  );
}

function FormSection({
  title, icon: Icon, fields, form, setForm, pendingKeys,
}: {
  title: string;
  icon: any;
  fields: string[];
  form: Record<string, string>;
  setForm: (f: (prev: Record<string, string>) => Record<string, string>) => void;
  pendingKeys: Set<string>;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Icon className="w-4 h-4 text-brand-700" />
        <h2 className="font-black text-slate-900 text-sm uppercase tracking-wider">{title}</h2>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map((key) => {
          const isLocked = LOCKED_FIELDS.has(key);
          const isPending = pendingKeys.has(key);
          const isTextarea = key === "address";
          const isSelect = key === "user_type";
          const isFullWidth = isTextarea || isSelect;
          return (
            <div key={key} className={isFullWidth ? "sm:col-span-2" : ""}>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{FIELD_LABEL[key]}</label>
                {isLocked && (
                  <span title="Change requires admin approval" className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500">
                    <Lock className="w-2.5 h-2.5" /> approval
                  </span>
                )}
                {isPending && (
                  <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider border border-amber-200">
                    Pending
                  </span>
                )}
              </div>
              {isTextarea ? (
                <textarea
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={FIELD_PLACEHOLDER[key]}
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-700 ${
                    isLocked ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-white"
                  }`}
                />
              ) : isSelect ? (
                <select
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  className={`w-full h-10 px-3 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-700 ${
                    isLocked ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-white"
                  }`}
                >
                  <option value="">Select business type…</option>
                  {USER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <Input
                  value={form[key] ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={FIELD_PLACEHOLDER[key]}
                  className={`h-10 text-sm font-medium ${
                    isLocked ? "border-amber-200 bg-amber-50/30 focus-visible:ring-amber-500" : "border-slate-200 bg-white"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
