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

type ToastState = { text: string; tone: ToastTone; id: number };

type ToastApi = {
  show: (text: string, tone?: ToastTone) => void;
  success: (text: string) => void;
  error: (text: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const clear = useCallback(() => setToast(null), []);

  const show = useCallback((text: string, tone: ToastTone = "success") => {
    setToast({ text, tone, id: Date.now() });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (text: string) => show(text, "success"),
      error: (text: string) => show(text, "error"),
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
