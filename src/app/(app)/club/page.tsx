"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { useToast } from "@/components/toast-provider";

type ClubSummary = {
  id: string;
  name: string;
  balance: number;
  realBalance: number;
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

type ClubRoom = {
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
};

export default function ClubPage() {
  const toast = useToast();
  const [club, setClub] = useState<ClubSummary | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [rooms, setRooms] = useState<ClubRoom[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [mineRes, clientsRes, roomsRes] = await Promise.all([
        fetch("/api/club/mine"),
        fetch("/api/club/clients"),
        fetch("/api/club/rooms"),
      ]);
      const mineJson = await mineRes.json();
      const clientsJson = await clientsRes.json();
      const roomsJson = await roomsRes.json().catch(() => ({}));
      if (!mineRes.ok) {
        setError(mineJson.error || "Club owner access required");
        setClub(null);
        setClients([]);
        setTransfers([]);
        setRooms([]);
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
      if (roomsRes.ok) setRooms(roomsJson.rooms ?? []);
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
        initialRealCredits: Number(form.get("initialRealCredits") || 0) || 0,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Could not create client");
      return;
    }
    toast.success(json.message);
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
        balanceKind: String(form.get("balanceKind") || "FREE"),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Could not assign credits");
      return;
    }
    toast.success(json.message);
    e.currentTarget.reset();
    await load();
  }

  async function saveRoom(e: FormEvent<HTMLFormElement>, roomId: string) {
    e.preventDefault();
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/club/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: roomId,
        name: String(form.get("name")),
        buyIn: Number(form.get("buyIn")),
        smallBlind: Number(form.get("smallBlind")),
        bigBlind: Number(form.get("bigBlind")),
        maxPlayers: Number(form.get("maxPlayers")),
        targetBots: Number(form.get("targetBots")),
        botSkillPercent: Number(form.get("botSkillPercent")),
        chatEnabled: form.get("chatEnabled") === "on",
        isPrivate: form.get("isPrivate") === "on",
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Could not update table");
      return;
    }
    toast.success(json.message || "Table updated");
    setEditingId(null);
    await load();
  }

  async function closeRoom(id: string, name: string) {
    if (!window.confirm(`Close table “${name}”? Players will no longer be able to join.`)) {
      return;
    }
    setBusy(true);
    const res = await fetch("/api/club/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "CLOSED" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Could not close table");
      return;
    }
    toast.success(`Table “${name}” closed`);
    setEditingId(null);
    await load();
  }

  async function reopenRoom(id: string) {
    setBusy(true);
    const res = await fetch("/api/club/rooms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "WAITING" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error || "Could not reopen table");
      return;
    }
    toast.success("Table reopened");
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
      <div>
        <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">{club.name}</h1>
        <p className="mt-2 text-[var(--muted)]">
          Manage clients and assign credits from your club balance. Ask admin to top up your
          balance when needed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Panel className="p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Free credits
          </div>
          <div className="mt-2 text-4xl font-semibold text-[var(--gold-soft)]">
            {(club.balance ?? 0).toLocaleString()}
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">For FREE table clients</p>
        </Panel>
        <Panel className="p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Real credits
          </div>
          <div className="mt-2 text-4xl font-semibold text-[var(--gold-soft)]">
            {(club.realBalance ?? 0).toLocaleString()}
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">For REAL table clients</p>
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
            Creates a login for your player. Optional starting free/real credits go to their club
            member wallet (from your club float).
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Initial free credits</Label>
                <Input name="initialCredits" type="number" min={0} step="1" defaultValue={0} />
              </div>
              <div>
                <Label>Initial real credits</Label>
                <Input
                  name="initialRealCredits"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={0}
                />
              </div>
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
            Moves from your club float into the client’s club member wallet (not their system
            wallet).
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
                      {c.user.name || c.user.email} — free{" "}
                      {c.user.creditsBalance.toLocaleString()} · real{" "}
                      {(c.user.realMoneyBalance ?? 0).toLocaleString()}
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
                  <option value="FREE">
                    Free credits (club {(club.balance ?? 0).toLocaleString()})
                  </option>
                  <option value="REAL">
                    Real credits (club {(club.realBalance ?? 0).toLocaleString()})
                  </option>
                </select>
              </div>
              <div>
                <Label>Amount</Label>
                <Input name="amount" type="number" min={0.01} step="0.01" required />
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
          <div>
            <h2 className="text-xl font-semibold">Your tables</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Tables created for this club. Edit settings or close a table when you are done.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="gold">{rooms.length}</Badge>
            <Link href="/rooms">
              <Button variant="ghost">Create table</Button>
            </Link>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {rooms.length === 0 && (
            <p className="text-sm text-[var(--muted)]">
              No tables yet — create one from Rooms while signed in as the club owner.
            </p>
          )}
          {rooms.map((room) => (
            <div
              key={room.id}
              className="rounded-xl border border-white/5 bg-black/20 px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{room.name}</span>
                    <Badge tone={room.type === "FREE" ? "green" : "gold"}>{room.type}</Badge>
                    <Badge tone={room.status === "CLOSED" ? "muted" : "green"}>
                      {room.status}
                    </Badge>
                    {room.isPrivate && <Badge tone="muted">Private</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {room.smallBlind}/{room.bigBlind} · Buy-in {room.buyIn} {room.currency} ·{" "}
                    {room.playerCount}/{room.maxPlayers} seated · bots {room.targetBots} · chat{" "}
                    {room.chatEnabled ? "ON" : "OFF"}
                  </p>
                  {room.inviteCode ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
                        Invite code
                      </span>
                      <code className="rounded-lg border border-[rgba(212,175,55,0.35)] bg-black/30 px-2.5 py-1 font-mono text-sm tracking-wider text-[var(--gold)]">
                        {room.inviteCode}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!px-2 !py-1 text-xs"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(room.inviteCode!);
                            toast.success(`Copied ${room.inviteCode}`);
                          } catch {
                            toast.success(room.inviteCode!);
                          }
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  ) : room.isPrivate ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">Private — no invite code yet</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/rooms/${room.id}${room.inviteCode ? `?invite=${room.inviteCode}` : ""}`}>
                    <Button variant="felt">Open</Button>
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setEditingId(editingId === room.id ? null : room.id)
                    }
                  >
                    {editingId === room.id ? "Cancel" : "Edit"}
                  </Button>
                  {room.status !== "CLOSED" ? (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={busy}
                      onClick={() => void closeRoom(room.id, room.name)}
                    >
                      Close
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void reopenRoom(room.id)}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              </div>

              {editingId === room.id && (
                <form
                  onSubmit={(e) => void saveRoom(e, room.id)}
                  className="mt-4 grid gap-3 border-t border-white/5 pt-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  <div className="md:col-span-2 xl:col-span-3">
                    <Label>Table name</Label>
                    <Input name="name" defaultValue={room.name} required maxLength={64} />
                  </div>
                  <div>
                    <Label>Buy-in</Label>
                    <Input
                      name="buyIn"
                      type="number"
                      step="0.01"
                      min={0.01}
                      defaultValue={room.buyIn}
                      required
                    />
                  </div>
                  <div>
                    <Label>Small blind</Label>
                    <Input
                      name="smallBlind"
                      type="number"
                      step="0.01"
                      min={0.01}
                      defaultValue={room.smallBlind}
                      required
                    />
                  </div>
                  <div>
                    <Label>Big blind</Label>
                    <Input
                      name="bigBlind"
                      type="number"
                      step="0.01"
                      min={0.01}
                      defaultValue={room.bigBlind}
                      required
                    />
                  </div>
                  <div>
                    <Label>Max players</Label>
                    <Input
                      name="maxPlayers"
                      type="number"
                      min={2}
                      max={9}
                      defaultValue={room.maxPlayers}
                      required
                    />
                  </div>
                  <div>
                    <Label>Bots to seat</Label>
                    <Input
                      name="targetBots"
                      type="number"
                      min={0}
                      max={9}
                      defaultValue={room.targetBots}
                      required
                    />
                  </div>
                  <div>
                    <Label>Bot accuracy (0–100)</Label>
                    <Input
                      name="botSkillPercent"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={room.botSkillPercent}
                      required
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    <input
                      type="checkbox"
                      name="chatEnabled"
                      defaultChecked={room.chatEnabled}
                      className="accent-[var(--gold)]"
                    />
                    Table chat enabled
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                    <input
                      type="checkbox"
                      name="isPrivate"
                      defaultChecked={room.isPrivate}
                      className="accent-[var(--gold)]"
                    />
                    Private (invite code)
                  </label>
                  <div className="md:col-span-2 xl:col-span-3">
                    <Button type="submit" disabled={busy}>
                      {busy ? "Saving…" : "Save table"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </Panel>

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
              <div className="text-right text-sm">
                <div className="text-[var(--gold-soft)]">
                  Club free {c.user.creditsBalance.toLocaleString()}
                </div>
                <div className="text-[var(--success)]">
                  Club real {(c.user.realMoneyBalance ?? 0).toLocaleString()}
                </div>
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
