"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { useToast } from "@/components/toast-provider";
import { formatMoney } from "@/lib/utils";

type WalletData = {
  wallet: {
    creditsBalance: number;
    realMoneyBalance: number;
    currentCurrency: string;
    name: string | null;
    email: string;
  };
  currency: {
    code: string;
    name: string;
    usdtAddress: string | null;
    gcashMerchantId: string | null;
    minDeposit: number;
    minWithdrawal: number;
  };
  transactions: {
    id: string;
    amount: number;
    gateway: string;
    type: string;
    status: string;
    reference: string | null;
    currency: string;
    createdAt: string;
  }[];
};

type ClubMembership = {
  clubId: string;
  clubName: string;
  memberCreditsBalance: number;
  memberRealMoneyBalance: number;
  owner: { name: string | null; email: string };
};

export default function WalletPage() {
  const toast = useToast();
  const { update } = useSession();
  const [data, setData] = useState<WalletData | null>(null);
  const [memberships, setMemberships] = useState<ClubMembership[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);

  async function load() {
    const [walletRes, membershipRes] = await Promise.all([
      fetch("/api/wallet"),
      fetch("/api/club/return"),
    ]);
    const json = await walletRes.json();
    setData(json);
    if (json.wallet?.name) setDisplayName(json.wallet.name);
    if (membershipRes.ok) {
      const m = await membershipRes.json();
      setMemberships(m.memberships ?? []);
    } else {
      setMemberships([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: displayName }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Could not update name");
      return;
    }
    await update({ name: json.user.name });
    toast.success(`Display name set to “${json.user.name}”`);
    await load();
  }

  async function deposit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/wallet/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gateway: String(form.get("gateway")),
        amount: Number(form.get("amount")),
        reference: String(form.get("reference")),
        mobileNumber: String(form.get("mobileNumber") || "") || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Deposit failed");
      return;
    }
    toast.success(json.message);
    e.currentTarget.reset();
    await load();
  }

  async function withdraw(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gateway: String(form.get("gateway")),
        amount: Number(form.get("amount")),
        destination: String(form.get("destination")),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Withdrawal failed");
      return;
    }
    toast.success(json.message);
    e.currentTarget.reset();
    await load();
  }

  async function claimCoupon(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/coupons/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: String(form.get("code") || "").trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Could not claim coupon");
      return;
    }
    toast.success(json.message || "Coupon claimed successfully!");
    e.currentTarget.reset();
    await load();
  }

  async function returnToClub(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setReturnBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/club/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clubId: String(form.get("clubId")),
        amount: Number(form.get("amount")),
        balanceKind: String(form.get("balanceKind") || "FREE"),
        note: String(form.get("note") || "").trim() || undefined,
      }),
    });
    const json = await res.json();
    setReturnBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Could not return credits");
      return;
    }
    toast.success(json.message);
    e.currentTarget.reset();
    await load();
  }

  if (!data) return <div className="text-[var(--muted)]">Loading wallet…</div>;

  const active = data.currency;
  const cashCode = data.wallet.currentCurrency;

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">Wallet</h1>
        <p className="mt-2 text-[var(--muted)]">
          Credits for free play. Real cash is in {cashCode} (set by the platform).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Credits</div>
          <div className="mt-2 text-4xl font-semibold text-[var(--gold-soft)]">
            {data.wallet.creditsBalance.toLocaleString()}
          </div>
        </Panel>
        <Panel className="p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Real cash ({cashCode})
          </div>
          <div className="mt-2 text-4xl font-semibold text-[var(--success)]">
            {formatMoney(data.wallet.realMoneyBalance, cashCode)}
          </div>
        </Panel>
      </div>

      <Panel className="p-6">
        <h2 className="text-xl font-semibold">Display name</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Shown at the table. Email stays {data.wallet.email}.
        </p>
        <form onSubmit={saveName} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="displayName">Name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={32}
              required
              placeholder="Your table name"
            />
          </div>
          <Button type="submit">Save name</Button>
        </form>
      </Panel>

      <Panel className="p-6">
        <h2 className="text-xl font-semibold">Claim coupon</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Enter a promo code to add free credits or real cash to your wallet.
        </p>
        <form onSubmit={claimCoupon} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="coupon-code">Coupon code</Label>
            <Input
              id="coupon-code"
              name="code"
              required
              minLength={4}
              maxLength={32}
              placeholder="e.g. WELCOME100"
              className="uppercase tracking-wider"
              autoComplete="off"
            />
          </div>
          <Button type="submit">Claim</Button>
        </form>
      </Panel>

      {memberships.length > 0 && (
        <Panel className="p-6">
          <h2 className="text-xl font-semibold">Return club wallet to club</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Sends from your club member wallet back to the club float — not from your system
            Credits / Cash.
          </p>
          <form onSubmit={returnToClub} className="mt-4 space-y-3">
            <div>
              <Label>Club</Label>
              <select
                name="clubId"
                required
                className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
                defaultValue={memberships[0]?.clubId}
              >
                {memberships.map((m) => (
                  <option key={m.clubId} value={m.clubId}>
                    {m.clubName} — free {m.memberCreditsBalance.toLocaleString()} · real{" "}
                    {m.memberRealMoneyBalance.toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Credit type</Label>
              <select
                name="balanceKind"
                defaultValue="FREE"
                className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
              >
                <option value="FREE">Free club credits</option>
                <option value="REAL">Real club credits</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Amount</Label>
                <Input name="amount" type="number" min={0.01} step="0.01" required />
              </div>
              <div>
                <Label>Note (optional)</Label>
                <Input name="note" maxLength={120} placeholder="Returning unused club credits" />
              </div>
            </div>
            <Button type="submit" disabled={returnBusy}>
              {returnBusy ? "Sending…" : "Return to club"}
            </Button>
          </form>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-6">
          <h2 className="text-xl font-semibold">Deposit</h2>
          {active && (
            <div className="mt-2 space-y-1 text-xs text-[var(--muted)]">
              <p>USDT address: {active.usdtAddress}</p>
              <p>GCash merchant: {active.gcashMerchantId}</p>
              <p>Min deposit: {active.minDeposit}</p>
            </div>
          )}
          <form onSubmit={deposit} className="mt-4 space-y-3">
            <div>
              <Label>Gateway</Label>
              <select
                name="gateway"
                className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
                defaultValue="USDT"
              >
                <option value="USDT">USDT</option>
                <option value="GCASH">GCash</option>
              </select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input name="amount" type="number" step="0.01" required />
            </div>
            <div>
              <Label>Tx hash / reference</Label>
              <Input name="reference" required placeholder="0x… or payment ref" />
            </div>
            <div>
              <Label>GCash mobile (if GCash)</Label>
              <Input name="mobileNumber" placeholder="09xxxxxxxxx" />
            </div>
            <Button type="submit" className="w-full">
              Submit deposit
            </Button>
          </form>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-xl font-semibold">Withdraw</h2>
          <form onSubmit={withdraw} className="mt-4 space-y-3">
            <div>
              <Label>Gateway</Label>
              <select
                name="gateway"
                className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
                defaultValue="USDT"
              >
                <option value="USDT">USDT</option>
                <option value="GCASH">GCash</option>
              </select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input name="amount" type="number" step="0.01" required />
            </div>
            <div>
              <Label>Destination address / mobile</Label>
              <Input name="destination" required />
            </div>
            <Button type="submit" variant="ghost" className="w-full">
              Request withdrawal
            </Button>
          </form>
        </Panel>
      </div>

      <Panel className="p-6">
        <h2 className="text-xl font-semibold">Recent transactions</h2>
        <div className="mt-4 space-y-2">
          {data.transactions.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No transactions yet.</p>
          )}
          {data.transactions.map((tx) => (
            <div
              key={tx.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    tx.type === "DEPOSIT" || tx.type === "BONUS" ? "green" : "gold"
                  }
                >
                  {tx.type}
                </Badge>
                <span>
                  {tx.amount} {tx.currency} via {tx.gateway}
                </span>
              </div>
              <span className="text-xs text-[var(--muted)]">{tx.reference}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
