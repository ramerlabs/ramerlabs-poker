"use client";

import { SessionProvider } from "next-auth/react";
import { LicenseGate } from "@/components/license-gate";
import { ToastProvider } from "@/components/toast-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <LicenseGate>{children}</LicenseGate>
      </ToastProvider>
    </SessionProvider>
  );
}
