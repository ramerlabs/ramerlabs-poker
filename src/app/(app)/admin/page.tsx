"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { formatMoney } from "@/lib/utils";

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
  isPrivate: boolean;
  inviteCode: string | null;
  status: string;
  playerCount: number;
};

export default function AdminPage() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [rake, setRake] = useState<RakeSettings | null>(null);
  const [recentRake, setRecentRake] = useState<RakeRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [curRes, rakeRes, roomsRes] = await Promise.all([
      fetch("/api/admin/currencies"),
      fetch("/api/admin/rake"),
      fetch("/api/admin/rooms"),
    ]);
    const curJson = await curRes.json();
    const rakeJson = await rakeRes.json();
    const roomsJson = await roomsRes.json();
    if (!curRes.ok) {
      setError(curJson.error || "Admin access required");
      return;
    }
    setCurrencies(curJson.currencies ?? []);
    if (rakeRes.ok) {
      setRake(rakeJson.settings);
      setRecentRake(rakeJson.recent ?? []);
    }
    if (roomsRes.ok) setRooms(roomsJson.rooms ?? []);
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
    const res = await fetch("/api/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name")),
        type: String(form.get("type")),
        currency: String(form.get("currency") || "USD"),
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
      return;
    }
    setMessage(
      `Table “${json.room.name}” created with ${json.room.botsSeeded ?? 0} bot(s)`,
    );
    e.currentTarget.reset();
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
      "Table skill hint (0–100). Live bots still use a random 30–50% each.",
      String(current),
    );
    if (raw == null) return;
    const botSkillPercent = Number(raw);
    if (!Number.isFinite(botSkillPercent) || botSkillPercent < 0 || botSkillPercent > 100) {
      setError("Bot skill must be 0–100");
      return;
    }
    const res = await fetch("/api/admin/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, botSkillPercent }),
    });
    if (res.ok) {
      setMessage(`Bot skill set to ${botSkillPercent}%`);
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

  const openRooms = rooms.filter((r) => r.status !== "CLOSED");

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">Admin</h1>
        <p className="mt-2 text-[var(--muted)]">
          Create branded tables, manage currencies, and track house rake.
        </p>
      </div>

      <Panel className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Tables</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Add as many tables as you want. Each shows the RamerLabs brand on the felt.
            </p>
          </div>
          <Badge tone="gold">{openRooms.length} open</Badge>
        </div>

        <form onSubmit={createTable} className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
              <option value="REAL">REAL (Cash)</option>
            </select>
          </div>
          <div>
            <Label>Currency (REAL)</Label>
            <Input name="currency" placeholder="USD or PHP" defaultValue="USD" />
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
            <Label>Bot skill / plan %</Label>
            <Input
              name="botSkillPercent"
              type="number"
              min={30}
              max={50}
              defaultValue={40}
              required
            />
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Table default hint only — each bot rolls a random skill between 30–50%.
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
                  {room.smallBlind}/{room.bigBlind} · Buy-in {room.buyIn} {room.currency} ·{" "}
                  {room.playerCount}/{room.maxPlayers} seated · Target bots {room.targetBots} ·
                  Bot skill {room.botSkillPercent ?? 50}%
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
                  Bot skill
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

      {(message || error) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            error
              ? "border border-[rgba(179,58,74,0.4)] bg-[rgba(179,58,74,0.12)]"
              : "border border-[rgba(62,207,142,0.35)] bg-[rgba(62,207,142,0.08)]"
          }`}
        >
          {error || message}
        </div>
      )}
    </div>
  );
}
