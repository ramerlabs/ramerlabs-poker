"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { Toast, type ToastTone } from "@/components/toast";

type ClubSummary = {
  id: string;
  name: string;
  balance: number;
  clientCount: number;
  roomCount: number;
};

type ClientRow = {
  id: string;
  note: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    creditsBalance: number;
    realMoneyBalance: number;
  };
};

type TransferRow = {
  id: string;
  amount: number;
  kind: "ASSIGN" | "RETURN";
  note: string | null;
  createdAt: string;
  toUser: { id: string; name: string | null; email: string };
};

export default function ClubPage() {
  const [club, setClub] = useState<ClubSummary | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: ToastTone } | null>(null);
  const [assignUserId, setAssignUserId] = useState("");
  const clearToast = useCallback(() => setToast(null), []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [mineRes, clientsRes] = await Promise.all([
        fetch("/api/club/mine"),
        fetch("/api/club/clients"),
      ]);
      const mineJson = await mineRes.json();
      const clientsJson = await clientsRes.json();
      if (!mineRes.ok) {
        setError(mineJson.error || "Club owner access required");
        setClub(null);
        setClients([]);
        setTransfers([]);
        return;
      }
      setClub(mineJson.club);
      setTransfers(mineJson.transfers ?? []);
      if (clientsRes.ok) {
        setClients(clientsJson.clients ?? []);
        if (!assignUserId && clientsJson.clients?.[0]) {
          setAssignUserId(clientsJson.clients[0].user.id);
        }
      }
    } catch {
      setError("Could not load club");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createClient(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/club/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email")),
        password: String(form.get("password")),
        name: String(form.get("name") || "").trim() || undefined,
        note: String(form.get("note") || "").trim() || undefined,
        initialCredits: Number(form.get("initialCredits") || 0) || 0,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setToast({ text: json.error || "Could not create client", tone: "error" });
      return;
    }
    setToast({ text: json.message, tone: "success" });
    e.currentTarget.reset();
    await load();
  }

  async function assignCredits(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/club/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: String(form.get("userId")),
        amount: Number(form.get("amount")),
        note: String(form.get("note") || "").trim() || undefined,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setToast({ text: json.error || "Could not assign credits", tone: "error" });
      return;
    }
    setToast({ text: json.message, tone: "success" });
    e.currentTarget.reset();
    if (assignUserId) {
      // keep selected client
    }
    await load();
  }

  if (loading) {
    return <div className="text-[var(--muted)]">Loading club…</div>;
  }

  if (error || !club) {
    return (
      <Panel className="p-6">
        <h1 className="text-2xl font-semibold text-[var(--gold-soft)]">Club</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {error || "You are not a club owner. Ask a platform admin to assign you."}
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <Toast message={toast?.text ?? null} tone={toast?.tone} onClose={clearToast} />

      <div>
        <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">{club.name}</h1>
        <p className="mt-2 text-[var(--muted)]">
          Manage clients and assign credits from your club balance. Ask admin to top up your
          balance when needed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Panel className="p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Club balance
          </div>
          <div className="mt-2 text-4xl font-semibold text-[var(--gold-soft)]">
            {club.balance.toLocaleString()}
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">Credits available to assign</p>
        </Panel>
        <Panel className="p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Clients</div>
          <div className="mt-2 text-4xl font-semibold">{club.clientCount}</div>
        </Panel>
        <Panel className="p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Tables</div>
          <div className="mt-2 text-4xl font-semibold">{club.roomCount}</div>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-6">
          <h2 className="text-xl font-semibold">Create client account</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Creates a login for your player. Optional starting credits come from your club balance.
          </p>
          <form onSubmit={createClient} className="mt-4 space-y-3">
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" required placeholder="player@email.com" />
            </div>
            <div>
              <Label>Password</Label>
              <Input name="password" type="password" required minLength={6} />
            </div>
            <div>
              <Label>Display name</Label>
              <Input name="name" maxLength={64} placeholder="Optional" />
            </div>
            <div>
              <Label>Initial credits</Label>
              <Input name="initialCredits" type="number" min={0} step="1" defaultValue={0} />
            </div>
            <div>
              <Label>Note</Label>
              <Input name="note" maxLength={120} placeholder="VIP, table 3, etc." />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create client"}
            </Button>
          </form>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-xl font-semibold">Assign credits</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Deducts from club balance and adds to the client’s credits wallet.
          </p>
          {clients.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Create a client first.</p>
          ) : (
            <form onSubmit={assignCredits} className="mt-4 space-y-3">
              <div>
                <Label>Client</Label>
                <select
                  name="userId"
                  value={assignUserId}
                  onChange={(e) => setAssignUserId(e.target.value)}
                  required
                  className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
                >
                  {clients.map((c) => (
                    <option key={c.user.id} value={c.user.id}>
                      {c.user.name || c.user.email} — {c.user.creditsBalance.toLocaleString()}{" "}
                      credits
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Amount</Label>
                <Input name="amount" type="number" min={1} step="1" required />
              </div>
              <div>
                <Label>Note</Label>
                <Input name="note" maxLength={120} placeholder="Optional" />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Assigning…" : "Assign credits"}
              </Button>
            </form>
          )}
        </Panel>
      </div>

      <Panel className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-semibold">Clients</h2>
          <Badge tone="gold">{clients.length}</Badge>
        </div>
        <div className="mt-4 space-y-2">
          {clients.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No clients yet.</p>
          )}
          {clients.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-3"
            >
              <div>
                <div className="font-medium">{c.user.name || c.user.email}</div>
                <div className="text-xs text-[var(--muted)]">
                  {c.user.email}
                  {c.note ? ` · ${c.note}` : ""}
                </div>
              </div>
              <div className="text-sm text-[var(--gold-soft)]">
                {c.user.creditsBalance.toLocaleString()} credits
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="text-xl font-semibold">Recent transfers</h2>
        <div className="mt-4 space-y-2">
          {transfers.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No transfers yet.</p>
          )}
          {transfers.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-sm"
            >
              <span>
                {t.kind === "RETURN" ? (
                  <>
                    <Badge tone="green">Return</Badge>{" "}
                    {t.toUser.name || t.toUser.email} → club +{t.amount.toLocaleString()}
                  </>
                ) : (
                  <>
                    <Badge tone="gold">Assign</Badge> +{t.amount.toLocaleString()} →{" "}
                    {t.toUser.name || t.toUser.email}
                  </>
                )}
                {t.note ? ` · ${t.note}` : ""}
              </span>
              <span className="text-xs text-[var(--muted)]">
                {new Date(t.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
