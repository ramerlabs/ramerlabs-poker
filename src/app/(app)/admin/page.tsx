"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  categoryLabel,
  priorityLabel,
  statusLabel,
} from "@/lib/support";
import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";

type Currency = {
  id: string;
  code: string;
  name: string;
  enabled: boolean;
  usdtAddress: string | null;
  gcashMerchantId: string | null;
  minDeposit: number;
  minWithdrawal: number;
};

type RakeSettings = {
  defaultRakePercent: number;
  defaultRakeCap: number;
  houseBalances: Record<string, number>;
};

type RakeRow = {
  id: string;
  roomName: string;
  handNumber: number;
  amount: number;
  currency: string;
  createdAt: string;
};

type AdminRoom = {
  id: string;
  name: string;
  type: "FREE" | "REAL";
  currency: string;
  buyIn: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  targetBots: number;
  botSkillPercent: number;
  chatEnabled: boolean;
  isPrivate: boolean;
  inviteCode: string | null;
  status: string;
  playerCount: number;
  club: { id: string; name: string } | null;
};

type AdminTicket = {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  messageCount: number;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
};

type AblySettings = {
  ablyEnabled: boolean;
  hasAdminKey: boolean;
  adminKeyMasked: string;
  envKeyConfigured: boolean;
  active: boolean;
  mode: "ably" | "polling";
  keySource: string;
};

type AdminCoupon = {
  id: string;
  code: string;
  kind: "CREDITS" | "CASH";
  amount: number;
  currency: string | null;
  maxClaims: number;
  claimCount: number;
  expiresAt: string | null;
  active: boolean;
  note: string | null;
  createdAt: string;
};

type AdminClub = {
  id: string;
  name: string;
  active: boolean;
  roomCount: number;
  owner: { id: string; name: string | null; email: string };
  createdAt: string;
};

export default function AdminPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [rake, setRake] = useState<RakeSettings | null>(null);
  const [recentRake, setRecentRake] = useState<RakeRow[]>([]);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [ticketStatus, setTicketStatus] = useState("");
  const [ticketPriority, setTicketPriority] = useState("");
  const [ticketCategory, setTicketCategory] = useState("");
  const [ably, setAbly] = useState<AblySettings | null>(null);
  const [ablyKeyInput, setAblyKeyInput] = useState("");
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [clubs, setClubs] = useState<AdminClub[]>([]);
  const [couponKind, setCouponKind] = useState<"CREDITS" | "CASH">("CREDITS");
  const [globalCurrency, setGlobalCurrency] = useState("USD");
  const [currencyOptions, setCurrencyOptions] = useState<{ code: string; name: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingCoupon, setCreatingCoupon] = useState(false);
  const [creatingClub, setCreatingClub] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState(false);

  async function loadTickets(filters?: {
    status?: string;
    priority?: string;
    category?: string;
  }) {
    const qs = new URLSearchParams();
    if (filters?.status) qs.set("status", filters.status);
    if (filters?.priority) qs.set("priority", filters.priority);
    if (filters?.category) qs.set("category", filters.category);
    const res = await fetch(`/api/admin/tickets?${qs.toString()}`);
    const json = await res.json();
    if (res.ok) setTickets(json.tickets ?? []);
  }

  async function load() {
    try {
      const [curRes, rakeRes, roomsRes, ablyRes, couponRes, globalCurRes, clubsRes] =
        await Promise.all([
          fetch("/api/admin/currencies"),
          fetch("/api/admin/rake"),
          fetch("/api/admin/rooms"),
          fetch("/api/admin/ably"),
          fetch("/api/admin/coupons"),
          fetch("/api/admin/currency"),
          fetch("/api/admin/clubs"),
        ]);
      const [curJson, rakeJson, roomsJson, ablyJson, couponJson, globalCurJson, clubsJson] =
        await Promise.all([
          curRes.json().catch(() => ({})),
          rakeRes.json().catch(() => ({})),
          roomsRes.json().catch(() => ({})),
          ablyRes.json().catch(() => ({})),
          couponRes.json().catch(() => ({})),
          globalCurRes.json().catch(() => ({})),
          clubsRes.json().catch(() => ({})),
        ]);
      if (!curRes.ok && !roomsRes.ok) {
        setError(curJson.error || roomsJson.error || "Admin access required");
        return;
      }
      setError(null);
      if (curRes.ok) setCurrencies(curJson.currencies ?? []);
      if (rakeRes.ok) {
        setRake(rakeJson.settings);
        setRecentRake(rakeJson.recent ?? []);
      }
      if (roomsRes.ok) setRooms(roomsJson.rooms ?? []);
      if (ablyRes.ok) {
        setAbly(ablyJson.settings);
        setAblyKeyInput("");
      }
      if (couponRes.ok) setCoupons(couponJson.coupons ?? []);
      if (globalCurRes.ok) {
        setGlobalCurrency(globalCurJson.globalCurrency ?? "USD");
        setCurrencyOptions(globalCurJson.options ?? []);
      }
      if (clubsRes.ok) setClubs(clubsJson.clubs ?? []);
      await loadTickets({
        status: ticketStatus,
        priority: ticketPriority,
        category: ticketCategory,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createTable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    const clubId = String(form.get("clubId") || "");
    if (!clubId) {
      setCreating(false);
      setError("Select a club for this table");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const res = await fetch("/api/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name")),
        type: String(form.get("type")),
        clubId,
        buyIn: Number(form.get("buyIn")),
        smallBlind: Number(form.get("smallBlind")),
        bigBlind: Number(form.get("bigBlind")),
        maxPlayers: Number(form.get("maxPlayers")),
        targetBots: Number(form.get("targetBots")),
        botSkillPercent: Number(form.get("botSkillPercent")),
        isPrivate: form.get("isPrivate") === "on",
      }),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(json.error || "Could not create table");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setMessage(
      `Table “${json.room.name}” created successfully` +
        (json.room.club ? ` for ${json.room.club.name}` : "") +
        (json.room.botsSeeded ? ` with ${json.room.botsSeeded} bot(s)` : "") +
        (json.room.inviteCode ? ` · invite ${json.room.inviteCode}` : ""),
    );
    e.currentTarget.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
    await load();
  }

  async function createClub(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreatingClub(true);
    setMessage(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/clubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name")),
        ownerEmail: String(form.get("ownerEmail")),
      }),
    });
    const json = await res.json();
    setCreatingClub(false);
    if (!res.ok) {
      setError(json.error || "Could not create club");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setMessage(json.message);
    e.currentTarget.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
    await load();
  }

  async function reassignClubOwner(id: string, currentEmail: string) {
    const ownerEmail = window.prompt("New owner email", currentEmail);
    if (!ownerEmail || ownerEmail.trim().toLowerCase() === currentEmail.toLowerCase()) return;
    const res = await fetch("/api/admin/clubs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ownerEmail: ownerEmail.trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not reassign owner");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setMessage(json.message);
    window.scrollTo({ top: 0, behavior: "smooth" });
    await load();
  }

  async function toggleClub(id: string, active: boolean) {
    const res = await fetch("/api/admin/clubs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    if (res.ok) {
      setMessage(`Club ${!active ? "activated" : "deactivated"}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      await load();
    }
  }

  async function saveGlobalCurrency(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingCurrency(true);
    setMessage(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/currency", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: String(form.get("currency")) }),
    });
    const json = await res.json();
    setSavingCurrency(false);
    if (!res.ok) {
      setError(json.error || "Could not set platform currency");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setGlobalCurrency(json.globalCurrency);
    setMessage(json.message);
    window.scrollTo({ top: 0, behavior: "smooth" });
    await load();
  }

  async function renameTable(id: string, current: string) {
    const name = window.prompt("New table name", current);
    if (!name || name.trim() === current) return;
    const res = await fetch("/api/admin/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: name.trim() }),
    });
    if (res.ok) await load();
  }

  async function setBotSkill(id: string, current: number) {
    const raw = window.prompt(
      "Bot accuracy (0–100). 0 = random, 100 = perfect play.",
      String(current),
    );
    if (raw == null) return;
    const botSkillPercent = Number(raw);
    if (!Number.isFinite(botSkillPercent) || botSkillPercent < 0 || botSkillPercent > 100) {
      setError("Bot accuracy must be 0–100");
      return;
    }
    const res = await fetch("/api/admin/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, botSkillPercent }),
    });
    if (res.ok) {
      setMessage(`Bot accuracy set to ${botSkillPercent}%`);
      await load();
    }
  }

  async function closeTable(id: string) {
    const res = await fetch("/api/admin/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "CLOSED" }),
    });
    if (res.ok) {
      setMessage("Table closed");
      await load();
    }
  }

  async function toggleChat(id: string, enabled: boolean) {
    const res = await fetch("/api/admin/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, chatEnabled: !enabled }),
    });
    if (res.ok) {
      setMessage(`Table chat ${!enabled ? "enabled" : "disabled"}`);
      await load();
    }
  }

  async function saveCurrency(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/currencies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: String(form.get("code")),
        name: String(form.get("name")),
        enabled: form.get("enabled") === "on",
        usdtAddress: String(form.get("usdtAddress") || "") || null,
        gcashMerchantId: String(form.get("gcashMerchantId") || "") || null,
        minDeposit: Number(form.get("minDeposit")),
        minWithdrawal: Number(form.get("minWithdrawal")),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Update failed");
      return;
    }
    setMessage(`Saved ${json.currency.code}`);
    await load();
  }

  async function toggle(code: string, enabled: boolean) {
    const res = await fetch("/api/admin/currencies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, enabled }),
    });
    if (res.ok) await load();
  }

  async function saveRake(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/rake", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultRakePercent: Number(form.get("defaultRakePercent")),
        defaultRakeCap: Number(form.get("defaultRakeCap")),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Rake update failed");
      return;
    }
    setRake(json.settings);
    setMessage("Rake settings saved — applies to new REAL rooms");
  }

  async function createCoupon(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreatingCoupon(true);
    setMessage(null);
    setError(null);
    const form = new FormData(e.currentTarget);
    const customCode = String(form.get("code") || "").trim();
    const expiresRaw = String(form.get("expiresAt") || "").trim();
    const res = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: String(form.get("kind")),
        amount: Number(form.get("amount")),
        maxClaims: Number(form.get("maxClaims") || 1),
        code: customCode || undefined,
        expiresAt: expiresRaw ? new Date(expiresRaw).toISOString() : null,
        note: String(form.get("note") || "").trim() || undefined,
      }),
    });
    const json = await res.json();
    setCreatingCoupon(false);
    if (!res.ok) {
      setError(json.error || "Could not create coupon");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setMessage(`Coupon ${json.coupon.code} created`);
    e.currentTarget.reset();
    setCouponKind("CREDITS");
    window.scrollTo({ top: 0, behavior: "smooth" });
    await load();
  }

  async function toggleCoupon(id: string, active: boolean) {
    const res = await fetch("/api/admin/coupons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    if (res.ok) {
      setMessage(`Coupon ${!active ? "activated" : "deactivated"}`);
      await load();
    }
  }

  async function copyCouponCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setMessage(`Copied ${code}`);
    } catch {
      setMessage(code);
    }
  }

  async function saveAbly(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const enabled = form.get("ablyEnabled") === "on";
    const clearKey = form.get("clearApiKey") === "on";
    const res = await fetch("/api/admin/ably", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ablyEnabled: enabled,
        clearApiKey: clearKey,
        ablyApiKey: clearKey ? null : ablyKeyInput.trim() || undefined,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Ably update failed");
      return;
    }
    setAbly(json.settings);
    setAblyKeyInput("");
    setMessage(
      json.settings.active
        ? "Ably realtime is ON"
        : "Ably is OFF — tables will use polling",
    );
  }

  const openRooms = rooms.filter((r) => r.status !== "CLOSED");

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">Admin</h1>
        <p className="mt-2 text-[var(--muted)]">
          Create branded tables, manage currencies, and track house rake.
        </p>
      </div>

      {(message || error) && (
        <div
          role="status"
          className={`sticky top-2 z-20 rounded-xl px-4 py-3 text-sm shadow-lg ${
            error
              ? "border border-[rgba(179,58,74,0.4)] bg-[rgba(179,58,74,0.18)]"
              : "border border-[rgba(62,207,142,0.45)] bg-[rgba(62,207,142,0.14)]"
          }`}
        >
          {error || message}
        </div>
      )}

      <Panel className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Platform currency</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Global cash currency for deposits, withdrawals, cash coupons, and REAL tables.
              Currently <span className="text-[var(--gold-soft)]">{globalCurrency}</span>.
            </p>
          </div>
          <Badge tone="gold">{globalCurrency}</Badge>
        </div>
        <form onSubmit={saveGlobalCurrency} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Label>Currency</Label>
            <select
              name="currency"
              defaultValue={globalCurrency}
              key={globalCurrency}
              className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
            >
              {(currencyOptions.length
                ? currencyOptions
                : currencies.filter((c) => c.enabled).map((c) => ({ code: c.code, name: c.name }))
              ).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={savingCurrency}>
            {savingCurrency ? "Saving…" : "Set platform currency"}
          </Button>
        </form>
      </Panel>

      <Panel className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Clubs</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Only admins can make a player a club owner. Only club owners can create tables.
            </p>
          </div>
          <Badge tone="gold">{clubs.length} clubs</Badge>
        </div>

        <form
          onSubmit={createClub}
          className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <div>
            <Label>Club name</Label>
            <Input name="name" required placeholder="RamerLabs Manila Club" maxLength={64} />
          </div>
          <div>
            <Label>Owner email</Label>
            <Input
              name="ownerEmail"
              type="email"
              required
              placeholder="player@example.com"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={creatingClub}>
              {creatingClub ? "Creating…" : "Create club & assign owner"}
            </Button>
          </div>
        </form>

        <div className="mt-6 space-y-2">
          {clubs.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              No clubs yet — create one and assign a registered player as owner.
            </p>
          )}
          {clubs.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <Badge tone={c.active ? "green" : "muted"}>
                    {c.active ? "Active" : "Off"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  Owner: {c.owner.name || c.owner.email} ({c.owner.email}) · {c.roomCount}{" "}
                  table(s)
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void reassignClubOwner(c.id, c.owner.email)}
                >
                  Change owner
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void toggleClub(c.id, c.active)}
                >
                  {c.active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Ably realtime</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Live table sync. When off (or no key), clients poll instead.
            </p>
          </div>
          {ably && (
            <Badge tone={ably.active ? "green" : "muted"}>
              {ably.active ? "Live (Ably)" : "Polling"}
            </Badge>
          )}
        </div>

        {ably && (
          <form
            key={`ably-${ably.ablyEnabled}-${ably.hasAdminKey}-${ably.mode}`}
            onSubmit={saveAbly}
            className="mt-5 space-y-4"
          >
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input
                type="checkbox"
                name="ablyEnabled"
                defaultChecked={ably.ablyEnabled}
                className="h-4 w-4 rounded border-[var(--line)]"
              />
              Enable Ably realtime
            </label>

            <div>
              <Label htmlFor="ablyApiKey">API key</Label>
              <Input
                id="ablyApiKey"
                value={ablyKeyInput}
                onChange={(e) => setAblyKeyInput(e.target.value)}
                placeholder={
                  ably.hasAdminKey
                    ? ably.adminKeyMasked || "Key saved — paste a new key to replace"
                    : ably.envKeyConfigured
                      ? "Using env ABLY_API_KEY — paste here to override"
                      : "Paste Ably API key (appId.keyId:secret)"
                }
                autoComplete="off"
              />
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Source: {ably.keySource}
                {ably.envKeyConfigured ? " · env key present" : ""}
                {ably.hasAdminKey ? " · admin key saved" : ""}
              </p>
            </div>

            {ably.hasAdminKey && (
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <input type="checkbox" name="clearApiKey" className="h-4 w-4 rounded border-[var(--line)]" />
                Clear saved admin key (fall back to env)
              </label>
            )}

            <Button type="submit">Save Ably settings</Button>
          </form>
        )}
      </Panel>

      <Panel className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Coupons</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Generate free-credit or real-cash codes for players to claim in Wallet.
            </p>
          </div>
          <Badge tone="gold">{coupons.length} codes</Badge>
        </div>

        <form
          onSubmit={createCoupon}
          className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <div>
            <Label>Reward type</Label>
            <select
              name="kind"
              value={couponKind}
              onChange={(e) => setCouponKind(e.target.value as "CREDITS" | "CASH")}
              className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
            >
              <option value="CREDITS">Free credits</option>
              <option value="CASH">Real cash</option>
            </select>
          </div>
          <div>
            <Label>Amount</Label>
            <Input name="amount" type="number" step="0.01" min={0.01} defaultValue={100} required />
          </div>
          {couponKind === "CASH" ? (
            <div className="flex items-end">
              <p className="rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm text-[var(--muted)]">
                Pays in platform currency:{" "}
                <span className="text-[var(--gold-soft)]">{globalCurrency}</span>
              </p>
            </div>
          ) : null}
          <div>
            <Label>Max claims</Label>
            <Input name="maxClaims" type="number" min={1} defaultValue={1} required />
          </div>
          <div>
            <Label>Custom code (optional)</Label>
            <Input name="code" placeholder="Auto-generated if empty" maxLength={32} />
          </div>
          <div>
            <Label>Expires (optional)</Label>
            <Input name="expiresAt" type="datetime-local" />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <Label>Note (optional)</Label>
            <Input name="note" placeholder="Promo, stream giveaway, etc." maxLength={200} />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <Button type="submit" disabled={creatingCoupon}>
              {creatingCoupon ? "Creating…" : "Generate coupon"}
            </Button>
          </div>
        </form>

        <div className="mt-6 space-y-2">
          {coupons.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No coupons yet.</p>
          )}
          {coupons.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void copyCouponCode(c.code)}
                    className="font-mono text-sm font-semibold text-[var(--gold-soft)] hover:underline"
                    title="Copy code"
                  >
                    {c.code}
                  </button>
                  <Badge tone={c.kind === "CREDITS" ? "gold" : "green"}>
                    {c.kind === "CREDITS" ? "Credits" : "Cash"}
                  </Badge>
                  <Badge tone={c.active ? "green" : "muted"}>
                    {c.active ? "Active" : "Off"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {c.kind === "CREDITS"
                    ? `${c.amount.toLocaleString()} credits`
                    : `${c.amount} ${c.currency}`}{" "}
                  · {c.claimCount}/{c.maxClaims} claimed
                  {c.expiresAt
                    ? ` · expires ${new Date(c.expiresAt).toLocaleString()}`
                    : ""}
                  {c.note ? ` · ${c.note}` : ""}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void toggleCoupon(c.id, c.active)}
              >
                {c.active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Support tickets</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Inbox for player tickets. Open a thread to reply or change status.
            </p>
          </div>
          <Badge tone="gold">{tickets.length} shown</Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <select
            value={ticketStatus}
            onChange={(e) => setTicketStatus(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[#0a1220] px-3 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          <select
            value={ticketPriority}
            onChange={(e) => setTicketPriority(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[#0a1220] px-3 py-2 text-sm"
          >
            <option value="">All priorities</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {priorityLabel(p)}
              </option>
            ))}
          </select>
          <select
            value={ticketCategory}
            onChange={(e) => setTicketCategory(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[#0a1220] px-3 py-2 text-sm"
          >
            <option value="">All categories</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              void loadTickets({
                status: ticketStatus,
                priority: ticketPriority,
                category: ticketCategory,
              })
            }
          >
            Filter
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {tickets.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No tickets match.</p>
          )}
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/support/${t.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-4 py-3 transition hover:border-[rgba(212,168,83,0.35)]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{t.subject}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {t.user.name || t.user.email} · {categoryLabel(t.category)} ·{" "}
                  {t.messageCount} msg · {new Date(t.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <Badge tone="muted">{priorityLabel(t.priority)}</Badge>
                <Badge
                  tone={
                    t.status === "CLOSED" || t.status === "RESOLVED" ? "green" : "gold"
                  }
                >
                  {statusLabel(t.status)}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Tables</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Create a table for a club (credited to the club owner). Club owners can also create
              tables from Rooms.
            </p>
          </div>
          <Badge tone="gold">{openRooms.length} open</Badge>
        </div>

        <form onSubmit={createTable} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-3">
            <Label>Club</Label>
            <select
              name="clubId"
              required
              defaultValue=""
              className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
            >
              <option value="" disabled>
                Select club…
              </option>
              {clubs
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.owner.email}
                  </option>
                ))}
            </select>
            {clubs.filter((c) => c.active).length === 0 && (
              <p className="mt-1 text-xs text-[var(--crimson)]">
                Create an active club above before adding tables.
              </p>
            )}
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <Label>Table name</Label>
            <Input name="name" required placeholder="RamerLabs VIP Lounge" maxLength={64} />
          </div>
          <div>
            <Label>Type</Label>
            <select
              name="type"
              defaultValue="FREE"
              className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
            >
              <option value="FREE">FREE (Credits)</option>
              <option value="REAL">REAL (Cash — {globalCurrency})</option>
            </select>
          </div>
          <div>
            <Label>Max players</Label>
            <Input name="maxPlayers" type="number" min={2} max={9} defaultValue={8} required />
          </div>
          <div>
            <Label>Bots to seat</Label>
            <Input
              name="targetBots"
              type="number"
              min={0}
              max={9}
              defaultValue={4}
              required
            />
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Kept filled. Broke bots rebuy unless a real player is waiting.
            </p>
          </div>
          <div>
            <Label>Bot accuracy (0–100)</Label>
            <Input
              name="botSkillPercent"
              type="number"
              min={0}
              max={100}
              defaultValue={100}
              required
            />
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              0 = plays randomly, 100 = perfect play. All bots on this table use this value.
            </p>
          </div>
          <div>
            <Label>Buy-in</Label>
            <Input name="buyIn" type="number" step="0.01" defaultValue={100} required />
          </div>
          <div>
            <Label>Small blind</Label>
            <Input name="smallBlind" type="number" step="0.01" defaultValue={1} required />
          </div>
          <div>
            <Label>Big blind</Label>
            <Input name="bigBlind" type="number" step="0.01" defaultValue={2} required />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)] md:col-span-2 xl:col-span-3">
            <input type="checkbox" name="isPrivate" className="accent-[var(--gold)]" />
            Private REAL table (invite code)
          </label>
          <div className="md:col-span-2 xl:col-span-3">
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create table"}
            </Button>
          </div>
        </form>

        <div className="mt-6 space-y-2">
          {rooms.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No tables yet — create your first one above.</p>
          )}
          {rooms.map((room) => (
            <div
              key={room.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-3"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{room.name}</span>
                  <Badge tone={room.type === "FREE" ? "green" : "gold"}>{room.type}</Badge>
                  <Badge tone={room.status === "CLOSED" ? "muted" : "green"}>{room.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {room.club ? `${room.club.name} · ` : ""}
                  {room.smallBlind}/{room.bigBlind} · Buy-in {room.buyIn} {room.currency} ·{" "}
                  {room.playerCount}/{room.maxPlayers} seated · Target bots {room.targetBots} ·
                  Bot accuracy {room.botSkillPercent ?? 50}% · Chat {room.chatEnabled ? "ON" : "OFF"}
                  {room.inviteCode ? ` · Invite ${room.inviteCode}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/rooms/${room.id}`}>
                  <Button variant="felt">Open</Button>
                </Link>
                <Button variant="ghost" onClick={() => renameTable(room.id, room.name)}>
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setBotSkill(room.id, room.botSkillPercent ?? 50)}
                >
                  Accuracy
                </Button>
                <Button
                  variant={room.chatEnabled ? "felt" : "danger"}
                  onClick={() => void toggleChat(room.id, room.chatEnabled)}
                  title={
                    room.chatEnabled
                      ? "Disable table chat for this room"
                      : "Enable table chat for this room"
                  }
                >
                  Chat {room.chatEnabled ? "ON" : "OFF"}
                </Button>
                {room.status !== "CLOSED" && (
                  <Button variant="danger" onClick={() => closeTable(room.id)}>
                    Close
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="text-xl font-semibold">House earnings (rake)</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          On REAL tables, a percentage of each pot is taken before winners are paid.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {rake &&
            Object.entries(rake.houseBalances).map(([code, amount]) => (
              <div
                key={code}
                className="rounded-xl border border-[var(--line)] bg-black/20 px-4 py-3"
              >
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">{code}</div>
                <div className="text-2xl font-semibold text-[var(--success)]">
                  {formatMoney(amount, code)}
                </div>
              </div>
            ))}
          {rake && Object.keys(rake.houseBalances).length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              No rake collected yet — play a REAL-money hand to see house earnings.
            </p>
          )}
        </div>

        {rake && (
          <form onSubmit={saveRake} className="mt-5 grid gap-3 md:grid-cols-3">
            <div>
              <Label>Default rake %</Label>
              <Input
                name="defaultRakePercent"
                type="number"
                step="0.1"
                defaultValue={rake.defaultRakePercent}
                required
              />
            </div>
            <div>
              <Label>Default rake cap</Label>
              <Input
                name="defaultRakeCap"
                type="number"
                step="0.01"
                defaultValue={rake.defaultRakeCap}
                required
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">
                Save rake defaults
              </Button>
            </div>
          </form>
        )}

        {recentRake.length > 0 && (
          <div className="mt-5 space-y-2">
            <h3 className="text-sm uppercase tracking-wider text-[var(--muted)]">Recent rake</h3>
            {recentRake.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap justify-between gap-2 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-sm"
              >
                <span>
                  {row.roomName} · hand #{row.handNumber}
                </span>
                <span className="text-[var(--gold-soft)]">
                  +{row.amount} {row.currency}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4">
        {currencies.map((c) => (
          <Panel key={c.id} className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-semibold">
                    {c.code} — {c.name}
                  </h2>
                  <Badge tone={c.enabled ? "green" : "muted"}>
                    {c.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  USDT: {c.usdtAddress || "—"} · GCash: {c.gcashMerchantId || "—"}
                </p>
              </div>
              <Button variant="ghost" onClick={() => toggle(c.code, !c.enabled)}>
                {c.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="p-6">
        <h2 className="text-xl font-semibold">Upsert currency</h2>
        <form onSubmit={saveCurrency} className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <Label>Code</Label>
            <Input name="code" required placeholder="USD" />
          </div>
          <div>
            <Label>Name</Label>
            <Input name="name" required placeholder="US Dollar" />
          </div>
          <div>
            <Label>USDT address</Label>
            <Input name="usdtAddress" placeholder="T…" />
          </div>
          <div>
            <Label>GCash merchant ID</Label>
            <Input name="gcashMerchantId" placeholder="GCASH-…" />
          </div>
          <div>
            <Label>Min deposit</Label>
            <Input name="minDeposit" type="number" defaultValue={10} required />
          </div>
          <div>
            <Label>Min withdrawal</Label>
            <Input name="minWithdrawal" type="number" defaultValue={10} required />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)] md:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked className="accent-[var(--gold)]" />
            Enabled for players
          </label>
          <div className="md:col-span-2">
            <Button type="submit">Save currency</Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
