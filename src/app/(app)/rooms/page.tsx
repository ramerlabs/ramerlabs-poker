"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { useToast } from "@/components/toast-provider";

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

function RoomCard({ room }: { room: Room }) {
  const openHref = room.inviteCode
    ? `/rooms/${room.id}?invite=${encodeURIComponent(room.inviteCode)}`
    : `/rooms/${room.id}`;

  return (
    <Panel className="p-5">
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
          {room.inviteCode && (
            <p className="mt-2 font-mono text-xs tracking-wider text-[var(--gold)]">
              Invite: {room.inviteCode}
            </p>
          )}
        </div>
        <Link href={openHref}>
          <Button variant="felt">Open table</Button>
        </Link>
      </div>
    </Panel>
  );
}

export default function RoomsPage() {
  const toast = useToast();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [myClub, setMyClub] = useState<MyClub | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [inviteInput, setInviteInput] = useState("");
  const [foundRoom, setFoundRoom] = useState<Room | null>(null);

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

  async function searchByInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const inviteCode = inviteInput.trim().toUpperCase();
    if (inviteCode.length < 4) {
      toast.error("Enter a valid invite code");
      return;
    }
    setSearching(true);
    setFoundRoom(null);
    try {
      const res = await fetch("/api/rooms/by-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });
      const json = await res.json();
      if (!res.ok || !json.room?.id) {
        toast.error(json.error || "No table found for that invite code");
        return;
      }
      const room: Room = {
        id: json.room.id,
        name: json.room.name,
        type: json.room.type,
        currency: json.room.currency,
        buyIn: json.room.buyIn,
        smallBlind: json.room.smallBlind,
        bigBlind: json.room.bigBlind,
        maxPlayers: json.room.maxPlayers,
        isPrivate: Boolean(json.room.isPrivate),
        inviteCode: json.room.inviteCode,
        players: Array.isArray(json.room.players)
          ? json.room.players
          : Array.from({ length: json.room.playerCount ?? 0 }, (_, i) => ({ id: String(i) })),
        club: json.room.club ?? null,
      };
      setFoundRoom(room);
      toast.success(json.message || `Found “${room.name}”`);
    } catch {
      toast.error("Could not look up invite code");
    } finally {
      setSearching(false);
    }
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
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
      toast.error(json.error || "Could not create room");
      return;
    }
    toast.success(
      `Table “${json.room.name}” created` +
        (json.room.club ? ` for ${json.room.club.name}` : isAdmin ? " (admin)" : ""),
    );
    e.currentTarget.reset();
    await load();
    if (json.room?.id) {
      const invite = json.room.inviteCode as string | null | undefined;
      window.location.href = invite
        ? `/rooms/${json.room.id}?invite=${encodeURIComponent(invite)}`
        : `/rooms/${json.room.id}`;
    }
  }

  const lobbyRooms = foundRoom
    ? rooms.filter((r) => r.id !== foundRoom.id)
    : rooms;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] animate-fade-up">
      <div className="space-y-4">
        <div>
          <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">Rooms</h1>
          <p className="mt-2 text-[var(--muted)]">
            Search a private table by invite code, or browse the lobby. Admins and club owners can
            create tables.
          </p>
        </div>

        <Panel className="p-5">
          <h2 className="text-xl font-semibold">Find table by invite code</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Enter the code to show the table here, then click Open table.
          </p>
          <form onSubmit={searchByInvite} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Label htmlFor="inviteCode">Invite code</Label>
              <Input
                id="inviteCode"
                name="inviteCode"
                required
                minLength={4}
                maxLength={16}
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                placeholder="e.g. AB12CD34"
                className="uppercase tracking-wider"
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={searching}>
              {searching ? "Searching…" : "Find table"}
            </Button>
            {foundRoom && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFoundRoom(null);
                  setInviteInput("");
                }}
              >
                Clear
              </Button>
            )}
          </form>
        </Panel>

        {foundRoom && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--gold-soft)]">Invite match</p>
            <RoomCard room={foundRoom} />
          </div>
        )}

        {lobbyRooms.map((room) => (
          <RoomCard key={room.id} room={room} />
        ))}
        {lobbyRooms.length === 0 && !foundRoom && (
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
              Private (invite code required to join)
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
