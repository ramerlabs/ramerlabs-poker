"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { formatMoney } from "@/lib/utils";

type Membership = {
  clubId: string;
  clubName: string;
  clubBalance: number;
  clubRealBalance: number;
  owner: { name: string | null; email: string };
};

type Props = {
  cashCurrency: string;
};

export function ClubCashoutPanel({ cashCurrency }: Props) {
  const toast = useToast();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [realMoneyBalance, setRealMoneyBalance] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"FREE" | "REAL">("FREE");
  const [amount, setAmount] = useState("");
  const [clubId, setClubId] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/club/return", { cache: "no-store" });
    if (!res.ok) {
      setMemberships([]);
      setLoaded(true);
      return;
    }
    const json = await res.json();
    const list = (json.memberships ?? []) as Membership[];
    setMemberships(list);
    setCreditsBalance(Number(json.creditsBalance) || 0);
    setRealMoneyBalance(Number(json.realMoneyBalance) || 0);
    setClubId((prev) => prev || list[0]?.clubId || "");
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function cashOut(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!clubId) {
      toast.error("Select a club");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    const max = kind === "FREE" ? creditsBalance : realMoneyBalance;
    if (value > max) {
      toast.error(
        kind === "FREE"
          ? `You only have ${creditsBalance.toLocaleString()} free credits`
          : `You only have ${formatMoney(realMoneyBalance, cashCurrency)}`,
      );
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/club/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clubId,
          amount: value,
          balanceKind: kind,
          note: "Dashboard cashout",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Could not cash out");
        return;
      }
      toast.success(json.message || "Cashed out to club successfully");
      setAmount("");
      await load();
    } catch {
      toast.error("Could not cash out");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || memberships.length === 0) return null;

  const selected = memberships.find((m) => m.clubId === clubId) ?? memberships[0];
  const walletMax = kind === "FREE" ? creditsBalance : realMoneyBalance;

  return (
    <Panel className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Your club</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Club float balances and cash out credits back to the club owner.
          </p>
        </div>
        <Badge tone="gold">{selected.clubName}</Badge>
      </div>

      {memberships.length > 1 && (
        <div className="mt-4">
          <Label htmlFor="dash-club">Club</Label>
          <select
            id="dash-club"
            className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
            value={clubId || selected.clubId}
            onChange={(e) => setClubId(e.target.value)}
          >
            {memberships.map((m) => (
              <option key={m.clubId} value={m.clubId}>
                {m.clubName} — {m.owner.email}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            Club free balance
          </div>
          <div className="mt-1 text-2xl font-semibold text-[var(--gold-soft)]">
            {(selected.clubBalance ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            Club real balance
          </div>
          <div className="mt-1 text-2xl font-semibold text-[var(--success)]">
            {(selected.clubRealBalance ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-[var(--muted)]">
        Owner: {selected.owner.name || selected.owner.email} ({selected.owner.email})
      </p>

      <form onSubmit={cashOut} className="mt-5 space-y-4 border-t border-white/5 pt-5">
        <div>
          <Label>Cash out type</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind("FREE")}
              className={
                kind === "FREE"
                  ? "rounded-xl border border-[rgba(212,168,83,0.55)] bg-[rgba(184,137,45,0.18)] px-3 py-2.5 text-sm font-semibold text-[var(--gold-soft)]"
                  : "rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2.5 text-sm text-[var(--muted)] hover:bg-white/5"
              }
            >
              Free credits
              <span className="mt-0.5 block text-xs font-normal opacity-80">
                You have {creditsBalance.toLocaleString()}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setKind("REAL")}
              className={
                kind === "REAL"
                  ? "rounded-xl border border-[rgba(212,168,83,0.55)] bg-[rgba(184,137,45,0.18)] px-3 py-2.5 text-sm font-semibold text-[var(--gold-soft)]"
                  : "rounded-xl border border-[var(--line)] bg-black/20 px-3 py-2.5 text-sm text-[var(--muted)] hover:bg-white/5"
              }
            >
              Real credits
              <span className="mt-0.5 block text-xs font-normal opacity-80">
                You have {formatMoney(realMoneyBalance, cashCurrency)}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <Label htmlFor="cashout-amount">Amount</Label>
            <Input
              id="cashout-amount"
              type="number"
              min={0.01}
              step="0.01"
              required
              max={walletMax}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={walletMax <= 0}
            onClick={() => setAmount(String(walletMax))}
          >
            Max
          </Button>
          <Button type="submit" disabled={busy || walletMax <= 0}>
            {busy ? "Sending…" : "Cash out to club"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
