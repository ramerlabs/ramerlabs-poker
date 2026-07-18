"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";

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
};

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/rooms");
    const json = await res.json();
    setRooms(json.rooms ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name")),
      type: String(form.get("type")),
      buyIn: Number(form.get("buyIn")),
      smallBlind: Number(form.get("smallBlind")),
      bigBlind: Number(form.get("bigBlind")),
      maxPlayers: Number(form.get("maxPlayers")),
      isPrivate: form.get("isPrivate") === "on",
      currency: String(form.get("currency") || ""),
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
    e.currentTarget.reset();
    await load();
    if (json.room?.id) window.location.href = `/rooms/${json.room.id}`;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] animate-fade-up">
      <div className="space-y-4">
        <div>
          <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">Rooms</h1>
          <p className="mt-2 text-[var(--muted)]">
            Public free tables use credits. Private real-money rooms use invite codes.
          </p>
        </div>
        {rooms.map((room) => (
          <Panel key={room.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-semibold">{room.name}</h2>
                  <Badge tone={room.type === "FREE" ? "green" : "gold"}>{room.type}</Badge>
                  {room.isPrivate && <Badge tone="muted">Private</Badge>}
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {room.smallBlind}/{room.bigBlind} · Buy-in {room.buyIn} {room.currency} ·{" "}
                  {room.players.length}/{room.maxPlayers} players
                </p>
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
      </div>

      <Panel className="h-fit p-6">
        <h2 className="text-2xl font-semibold">Create room</h2>
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
              <option value="REAL">REAL (Cash)</option>
            </select>
          </div>
          <div>
            <Label htmlFor="currency">Currency (REAL only)</Label>
            <Input id="currency" name="currency" placeholder="USD or PHP" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="buyIn">Buy-in</Label>
              <Input id="buyIn" name="buyIn" type="number" step="0.01" defaultValue={100} required />
            </div>
            <div>
              <Label htmlFor="maxPlayers">Max players</Label>
              <Input id="maxPlayers" name="maxPlayers" type="number" defaultValue={6} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="smallBlind">Small blind</Label>
              <Input id="smallBlind" name="smallBlind" type="number" step="0.01" defaultValue={1} required />
            </div>
            <div>
              <Label htmlFor="bigBlind">Big blind</Label>
              <Input id="bigBlind" name="bigBlind" type="number" step="0.01" defaultValue={2} required />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <input type="checkbox" name="isPrivate" className="accent-[var(--gold)]" />
            Private (invite code) — recommended for REAL
          </label>
          {error && <p className="text-sm text-[var(--crimson)]">{error}</p>}
          <Button type="submit" disabled={creating} className="w-full">
            {creating ? "Creating…" : "Create room"}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
