"use client";

// Branded loader that pulses the UPKEM logo. Use in place of generic
// Loader2/spinner components in high-visibility loading states so users
// spend their wait time looking at the brand, not a neutral spinner.

import Image from "next/image";
import { cn } from "@/lib/utils";

type Props = {
  size?: number;                 // logo diameter in px
  variant?: "light" | "dark";    // light = for use on dark brand-green bg
  label?: string;                // optional caption under the mark
  className?: string;
};

export function UpkemLoader({ size = 72, variant = "dark", label, className }: Props) {
  const halo = variant === "light" ? "bg-emerald-400" : "bg-brand-900";
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative flex items-center justify-center" style={{ width: size * 1.6, height: size * 1.6 }}>
        <span
          className={cn("absolute rounded-full opacity-30 animate-upkem-halo", halo)}
          style={{ width: size, height: size }}
        />
        <span className="relative animate-upkem-pulse" style={{ width: size, height: size }}>
          <Image
            src="/pharma_logo.jpeg"
            alt="Upkem Labs"
            width={size}
            height={size}
            className="rounded-full object-contain"
            priority
          />
        </span>
      </div>
      {label && (
        <p className={cn(
          "text-[11px] font-bold uppercase tracking-[0.2em]",
          variant === "light" ? "text-white/70" : "text-slate-500"
        )}>{label}</p>
      )}
    </div>
  );
}

export function UpkemLoaderFullScreen({ label = "Loading" }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900">
      <UpkemLoader size={96} variant="light" label={label} />
    </div>
  );
}
