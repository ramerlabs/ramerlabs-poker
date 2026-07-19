"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error";

type ToastProps = {
  message: string | null;
  tone?: ToastTone;
  durationMs?: number;
  onClose: () => void;
};

/** Fixed popup confirmation that auto-dismisses. */
export function Toast({
  message,
  tone = "success",
  durationMs = 3200,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs, onClose]);

  if (!message) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-5 z-[200] flex justify-center px-4"
      aria-live="polite"
    >
      <div
        role="status"
        className={cn(
          "pointer-events-auto max-w-md rounded-2xl border px-5 py-3.5 text-sm font-medium shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-md animate-toast-in",
          tone === "success"
            ? "border-[rgba(62,207,142,0.55)] bg-[rgba(14,40,28,0.95)] text-[var(--success)]"
            : "border-[rgba(179,58,74,0.55)] bg-[rgba(40,14,18,0.95)] text-[#f0a8b0]",
        )}
      >
        {message}
      </div>
    </div>
  );
}
