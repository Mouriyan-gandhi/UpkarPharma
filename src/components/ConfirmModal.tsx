"use client";

import { X, Loader2, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ConfirmVariant = "default" | "success" | "warning" | "destructive";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  bodyText?: string;
  bodyNode?: React.ReactNode;
  fromLabel?: string;
  toLabel?: string;
  fromTone?: "slate" | "amber" | "emerald" | "rose";
  toTone?: "slate" | "amber" | "emerald" | "rose";
  variant?: ConfirmVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const TONE_CLASSES: Record<string, string> = {
  slate:   "bg-slate-700 text-white",
  amber:   "bg-amber-600 text-white",
  emerald: "bg-brand-600 text-white",
  rose:    "bg-rose-600 text-white",
};

const VARIANT_BTN: Record<ConfirmVariant, string> = {
  default:     "bg-brand-800 hover:bg-brand-900 text-white",
  success:     "bg-brand-600 hover:bg-brand-700 text-white",
  warning:     "bg-amber-600 hover:bg-amber-700 text-white",
  destructive: "bg-rose-600 hover:bg-rose-700 text-white",
};

const VARIANT_ICON_BG: Record<ConfirmVariant, string> = {
  default:     "bg-brand-100 text-brand-800",
  success:     "bg-brand-100 text-brand-700",
  warning:     "bg-amber-100 text-amber-700",
  destructive: "bg-rose-100 text-rose-700",
};

export default function ConfirmModal({
  open,
  title,
  subtitle,
  bodyText,
  bodyNode,
  fromLabel,
  toLabel,
  fromTone = "slate",
  toTone = "emerald",
  variant = "default",
  confirmLabel = "Confirm & Save",
  cancelLabel = "Cancel",
  saving = false,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;

  const showTransition = !!(fromLabel && toLabel);

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-sm p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-start gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${VARIANT_ICON_BG[variant]}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm leading-tight">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={() => !saving && onCancel()}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
            aria-label="Close"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {(showTransition || bodyText || bodyNode) && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-5 text-xs">
            {bodyText && <p className="text-slate-700 leading-relaxed">{bodyText}</p>}
            {bodyNode}
            {showTransition && (
              <div className={`flex items-center gap-2 ${bodyText || bodyNode ? "mt-3" : ""}`}>
                <span className={`px-2 py-1 rounded-md font-bold ${TONE_CLASSES[fromTone]}`}>{fromLabel}</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
                <span className={`px-2 py-1 rounded-md font-bold ${TONE_CLASSES[toTone]}`}>{toLabel}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 text-xs h-10" disabled={saving} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            className={`flex-1 font-bold text-xs h-10 ${VARIANT_BTN[variant]}`}
            disabled={saving}
            onClick={onConfirm}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {saving ? "Saving…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
