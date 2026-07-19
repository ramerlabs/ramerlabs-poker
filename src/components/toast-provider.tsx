"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Toast, type ToastTone } from "@/components/toast";

type ToastState = { text: string; tone: ToastTone; id: number; durationMs?: number };

type ToastApi = {
  show: (text: string, tone?: ToastTone, durationMs?: number) => void;
  success: (text: string, durationMs?: number) => void;
  error: (text: string, durationMs?: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const clear = useCallback(() => setToast(null), []);

  const show = useCallback((text: string, tone: ToastTone = "success", durationMs?: number) => {
    setToast({ text, tone, id: Date.now(), durationMs });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (text: string, durationMs?: number) => show(text, "success", durationMs),
      error: (text: string, durationMs?: number) => show(text, "error", durationMs),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toast
        key={toast?.id ?? "empty"}
        message={toast?.text ?? null}
        tone={toast?.tone}
        durationMs={toast?.durationMs}
        onClose={clear}
      />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
