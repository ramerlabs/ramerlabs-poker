"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { Toast, type ToastTone } from "@/components/toast";

type Room = {
  id: string;
  name: string;
  type: "FREE" | "REAL";
  currency: string;
  buyIn: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  isPrivate: boolean;
  inviteCode: string | null;
  players: { id: string }[];
  club: {
    id: string;
    name: string;
    owner: { name: string | null; email: string };
  } | null;
};

type MyClub = { id: string; name: string; active: boolean };

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [myClub, setMyClub] = useState<MyClub | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: ToastTone } | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  async function load() {
    const res = await fetch("/api/rooms");
    const json = await res.json();
    setRooms(json.rooms ?? []);
    setMyClub(json.myClub ?? null);
    setCanCreate(Boolean(json.canCreateTables));
    setIsAdmin(Boolean(json.isAdmin));
  }

  useEffect(() => {
    void load();
  }, []);

  async function joinByInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setJoining(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const inviteCode = String(form.get("inviteCode") || "").trim();
    const res = await fetch("/api/rooms/by-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode, join: true }),
    });
    const json = await res.json();
    setJoining(false);
    if (!res.ok) {
      const err = json.error || "Could not open table";
      setError(err);
      setToast({ text: err, tone: "error" });
      return;
    }
    setToast({ text: json.message || "Opening table…", tone: "success" });
    e.currentTarget.reset();
    if (json.path) {
      window.location.href = json.path;
    }
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name")),
      type: String(form.get("type")),
      buyIn: Number(form.get("buyIn")),
      smallBlind: Number(form.get("smallBlind")),
      bigBlind: Number(form.get("bigBlind")),
      maxPlayers: Number(form.get("maxPlayers")),
      isPrivate: form.get("isPrivate") === "on",
    };

    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setCreating(false);
    if (!res.ok) {
      setError(json.error || "Could not create room");
      return;
    }
    setMessage(
      `Table “${json.room.name}” created` +
        (json.room.club ? ` for ${json.room.club.name}` : isAdmin ? " (admin)" : ""),
    );
    e.currentTarget.reset();
    await load();
    if (json.room?.id) window.location.href = `/rooms/${json.room.id}`;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] animate-fade-up">
      <Toast message={toast?.text ?? null} tone={toast?.tone} onClose={clearToast} />

      <div className="space-y-4">
        <div>
          <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">Rooms</h1>
          <p className="mt-2 text-[var(--muted)]">
            Join open tables with an invite code, or browse the lobby. Admins and club owners can
            create tables.
          </p>
        </div>

        <Panel className="p-5">
          <h2 className="text-xl font-semibold">Enter with invite code</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Have a private table code? Enter it here to open the table.
          </p>
          <form onSubmit={joinByInvite} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="inviteCode">Invite code</Label>
              <Input
                id="inviteCode"
                name="inviteCode"
                required
                minLength={4}
                maxLength={16}
                placeholder="e.g. AB12CD34"
                className="uppercase tracking-wider"
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={joining}>
              {joining ? "Opening…" : "Enter table"}
            </Button>
          </form>
        </Panel>

        {rooms.map((room) => (
          <Panel key={room.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold">{room.name}</h2>
                  <Badge tone={room.type === "FREE" ? "green" : "gold"}>{room.type}</Badge>
                  {room.isPrivate && <Badge tone="muted">Private</Badge>}
                  {room.club && <Badge tone="gold">{room.club.name}</Badge>}
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {room.smallBlind}/{room.bigBlind} · Buy-in {room.buyIn} {room.currency} ·{" "}
                  {room.players.length}/{room.maxPlayers} players
                </p>
                {room.club && (
                  <p className="mt-2 text-sm text-[var(--gold-soft)]">
                    Club table — need credits? Contact the club owner at{" "}
                    <a
                      href={`mailto:${room.club.owner.email}`}
                      className="underline hover:text-[var(--gold)]"
                    >
                      {room.club.owner.email}
                    </a>
                    {room.club.owner.name ? ` (${room.club.owner.name})` : ""} for a top-up.
                  </p>
                )}
                {room.isPrivate && room.inviteCode && (
                  <p className="mt-2 font-mono text-xs text-[var(--gold)]">
                    Invite: {room.inviteCode}
                  </p>
                )}
              </div>
              <Link href={`/rooms/${room.id}`}>
                <Button variant="felt">Open table</Button>
              </Link>
            </div>
          </Panel>
        ))}
        {rooms.length === 0 && (
          <p className="text-sm text-[var(--muted)]">No open rooms yet.</p>
        )}
      </div>

      <Panel className="h-fit p-6">
        <h2 className="text-2xl font-semibold">Create table</h2>
        {myClub ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            Creating for club <span className="text-[var(--gold-soft)]">{myClub.name}</span>
          </p>
        ) : isAdmin ? (
          <p className="mt-1 text-sm text-[var(--muted)]">
            Creating as <span className="text-[var(--gold-soft)]">admin</span> (optional club
            assignment is available in Admin → Tables).
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">
            You are not a club owner. A platform admin must create a club and assign you as owner
            before you can create tables.
          </p>
        )}

        {(message || error) && (
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-sm ${
              error
                ? "border border-[rgba(179,58,74,0.4)] bg-[rgba(179,58,74,0.12)]"
                : "border border-[rgba(62,207,142,0.35)] bg-[rgba(62,207,142,0.08)]"
            }`}
          >
            {error || message}
          </div>
        )}

        {canCreate ? (
          <form onSubmit={onCreate} className="mt-4 space-y-3">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required placeholder="Friday Night" />
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                name="type"
                className="w-full rounded-xl border border-[var(--line)] bg-[#0a1220] px-3.5 py-2.5 text-sm"
                defaultValue="FREE"
              >
                <option value="FREE">FREE (Credits)</option>
                <option value="REAL">REAL (platform cash currency)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="buyIn">Buy-in</Label>
                <Input
                  id="buyIn"
                  name="buyIn"
                  type="number"
                  step="0.01"
                  defaultValue={100}
                  required
                />
              </div>
              <div>
                <Label htmlFor="maxPlayers">Max players</Label>
                <Input id="maxPlayers" name="maxPlayers" type="number" defaultValue={8} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="smallBlind">Small blind</Label>
                <Input
                  id="smallBlind"
                  name="smallBlind"
                  type="number"
                  step="0.01"
                  defaultValue={1}
                  required
                />
              </div>
              <div>
                <Label htmlFor="bigBlind">Big blind</Label>
                <Input
                  id="bigBlind"
                  name="bigBlind"
                  type="number"
                  step="0.01"
                  defaultValue={2}
                  required
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              <input type="checkbox" name="isPrivate" className="accent-[var(--gold)]" />
              Private (invite code) — recommended for REAL
            </label>
            <Button type="submit" disabled={creating} className="w-full">
              {creating ? "Creating…" : "Create table"}
            </Button>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}
