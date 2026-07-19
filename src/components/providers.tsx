"use client";

import { SessionProvider } from "next-auth/react";
import { LicenseGate } from "@/components/license-gate";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LicenseGate>{children}</LicenseGate>
    </SessionProvider>
  );
}
