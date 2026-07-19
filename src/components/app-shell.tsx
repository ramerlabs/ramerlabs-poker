"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { KeyRound, LayoutDashboard, LifeBuoy, LogOut, Shield, Spade, Wallet } from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

const links = [
  { href: "/dashboard", label: "Lobby", icon: LayoutDashboard },
  { href: "/rooms", label: "Rooms", icon: Spade },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/settings", label: "Settings", icon: KeyRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useSession();
  const [wallet, setWallet] = useState<{ credits: number; cash: number; currency: string } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((json) => {
        if (!active || !json.wallet) return;
        setWallet({
          credits: json.wallet.creditsBalance,
          cash: json.wallet.realMoneyBalance,
          currency: json.wallet.currentCurrency,
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(7,11,18,0.82)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#b8892d] to-[#d4a853] text-[#1a1205] shadow-[0_8px_24px_rgba(212,168,83,0.35)]">
              <Spade className="h-4 w-4" />
            </span>
            <div>
              <div className="text-sm font-bold tracking-[0.18em] text-[var(--gold-soft)]">
                RAMERLABS
              </div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
                Poker
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
              const Icon = link.icon;
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                    active
                      ? "bg-white/8 text-[var(--gold-soft)]"
                      : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
            {data?.user?.role === "ADMIN" && (
              <Link
                href="/admin"
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                  pathname.startsWith("/admin")
                    ? "bg-white/8 text-[var(--gold-soft)]"
                    : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]",
                )}
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-3">
            {wallet && (
              <div className="hidden items-center gap-2 sm:flex">
                <div className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-1.5 text-xs">
                  <span className="text-[var(--muted)]">Credits </span>
                  <span className="font-semibold text-[var(--gold-soft)]">
                    {wallet.credits.toLocaleString()}
                  </span>
                </div>
                <div className="rounded-xl border border-[var(--line)] bg-black/20 px-3 py-1.5 text-xs">
                  <span className="text-[var(--muted)]">Cash </span>
                  <span className="font-semibold text-[var(--success)]">
                    {formatMoney(wallet.cash, wallet.currency)}
                  </span>
                </div>
              </div>
            )}
            <Button
              variant="ghost"
              className="!px-3 !py-2"
              onClick={() => signOut({ callbackUrl: "/" })}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</main>

      <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-2xl border border-[var(--line)] bg-[rgba(7,11,18,0.9)] p-2 shadow-2xl backdrop-blur md:hidden app-mobile-nav">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-xl p-2.5",
                pathname.startsWith(link.href) ? "bg-white/10 text-[var(--gold)]" : "text-[var(--muted)]",
              )}
              title={link.label}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
