"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { PokerTable } from "@/components/poker-table";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import type { PublicTableState } from "@/lib/poker/types";
import { readJson } from "@/lib/utils";

type RoomPayload = {
  room: {
    id: string;
    name: string;
    type: "FREE" | "REAL";
    currency: string;
    buyIn: number;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    targetBots?: number;
    botCount?: number;
    humanCount?: number;
    isPrivate: boolean;
    inviteCode: string | null;
    creatorId: string;
    players: {
      userId: string;
      seat: number;
      stack: number;
      isBot?: boolean;
      user: { id: string; name: string | null; email: string };
    }[];
    waitlist: {
      userId: string;
      name: string;
      preferredSeat: number | null;
      createdAt: string;
    }[];
  };
  me: {
    userId: string;
    seated: boolean;
    seat: number | null;
    waiting: boolean;
    waitPosition: number | null;
    preferredSeat: number | null;
  };
  game: { state: PublicTableState };
};

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<RoomPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const connectedRef = useRef(false);

  async function load(code?: string) {
    const invite = code || inviteCode;
    const qs = invite ? `?invite=${encodeURIComponent(invite)}` : "";
    const res = await fetch(`/api/rooms/${params.id}${qs}`);
    try {
      const json = await readJson<RoomPayload & { error?: string }>(res);
      if (!res.ok) {
        setError(json.error || "Unable to load room");
        return;
      }
      setError(null);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load room");
    }
  }

  useEffect(() => {
    const fromQuery =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("invite")
        : null;
    if (fromQuery) setInviteCode(fromQuery.toUpperCase());
    void load(fromQuery?.toUpperCase() || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    connectedRef.current = Boolean(data?.me.seated || data?.me.waiting);
  }, [data?.me.seated, data?.me.waiting]);

  // Heartbeat while on this page; auto-disconnect on close / leave room route
  useEffect(() => {
    const roomId = params.id;
    if (!roomId) return;

    const ping = () => {
      if (!connectedRef.current) return;
      void fetch(`/api/rooms/${roomId}/presence`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    };

    ping();
    const heart = setInterval(ping, 12_000);

    const disconnect = () => {
      if (!connectedRef.current) return;
      connectedRef.current = false;
      const url = `/api/rooms/${roomId}/disconnect`;
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        void fetch(url, { method: "POST", credentials: "include", keepalive: true });
      }
    };

    window.addEventListener("pagehide", disconnect);
    window.addEventListener("beforeunload", disconnect);

    return () => {
      clearInterval(heart);
      window.removeEventListener("pagehide", disconnect);
      window.removeEventListener("beforeunload", disconnect);
      // Navigating away from the room page
      if (connectedRef.current) {
        connectedRef.current = false;
        void fetch(`/api/rooms/${roomId}/disconnect`, {
          method: "POST",
          credentials: "include",
          keepalive: true,
        });
      }
    };
  }, [params.id]);

  async function join(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/rooms/${params.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode || undefined }),
      });
      const json = await readJson<{
        error?: string;
        seated?: boolean;
        message?: string;
        position?: number;
      }>(res);
      if (!res.ok) {
        setError(json.error || "Join failed");
        return;
      }
      if (json.seated) {
        setHint("You are seated at the table.");
      } else {
        setHint(
          json.message ||
            `You are on the waitlist (#${json.position ?? "?"}). Click an Open seat to sit.`,
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setBusy(false);
    }
  }

  async function leaveWait() {
    setBusy(true);
    connectedRef.current = false;
    await fetch(`/api/rooms/${params.id}/waitlist`, { method: "DELETE" });
    setBusy(false);
    setHint("Left the waitlist.");
    await load();
  }

  async function leaveTable() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${params.id}/leave`, { method: "POST" });
      const json = await readJson<{ error?: string; mode?: string }>(res);
      if (!res.ok) {
        setError(json.error || "Could not leave");
        return;
      }
      if (json.mode === "pending_leave") {
        setHint("Leaving after this hand — you are folded for now.");
      } else {
        connectedRef.current = false;
        setHint("Left the table. Stack returned to your wallet.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave");
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) {
    return <div className="text-[var(--muted)]">Loading table…</div>;
  }

  if (!data) {
    return (
      <Panel className="max-w-lg p-6">
        <h1 className="text-2xl font-semibold text-[var(--gold-soft)]">Private room</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
        <form onSubmit={join} className="mt-4 space-y-3">
          <div>
            <Label htmlFor="invite">Invite code</Label>
            <Input
              id="invite"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "…" : "Join table"}
          </Button>
        </form>
      </Panel>
    );
  }

  const seated = data.me.seated;
  const waiting = data.me.waiting;
  const canStart = seated;

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[var(--gold-soft)] md:text-3xl">{data.room.name}</h1>
            <Badge tone={data.room.type === "FREE" ? "green" : "gold"}>{data.room.type}</Badge>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)] md:text-sm">
            Blinds {data.room.smallBlind}/{data.room.bigBlind} · Buy-in {data.room.buyIn}{" "}
            {data.room.currency} · {data.room.players.length}/{data.room.maxPlayers} seated
            {data.room.waitlist.length > 0 ? ` · ${data.room.waitlist.length} waiting` : ""}
          </p>
          {data.room.isPrivate && data.room.inviteCode && (
            <p className="mt-1 font-mono text-xs text-[var(--gold)]">
              Invite code: {data.room.inviteCode}
            </p>
          )}
          {waiting && (
            <p className="mt-2 text-sm text-[var(--gold-soft)]">
              {data.me.preferredSeat != null
                ? `Seat ${data.me.preferredSeat + 1} reserved — you sit when this hand ends (queue #${data.me.waitPosition}).`
                : `Waiting — click another Open seat if you want a different spot.`}
            </p>
          )}
          {!seated && !waiting && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Click any <span className="text-[var(--gold-soft)]">Open seat</span> on the table to
              join (buy-in {data.room.buyIn} {data.room.currency}).
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {data.room.isPrivate && !seated && (
            <div>
              <Label htmlFor="invite2">Invite</Label>
              <Input
                id="invite2"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              />
            </div>
          )}
          {waiting && (
            <Button disabled={busy} variant="ghost" onClick={() => void leaveWait()}>
              Leave waitlist
            </Button>
          )}
          {seated && (
            <Button disabled={busy} variant="danger" onClick={() => void leaveTable()}>
              Leave table
            </Button>
          )}
        </div>
      </div>

      {seated && data.me.seat != null && (
        <div className="rounded-xl border border-[rgba(62,207,142,0.4)] bg-[rgba(62,207,142,0.1)] px-3 py-2 text-sm text-[#c8f0dc]">
          You are seated at seat {data.me.seat + 1}
          {(() => {
            const n = data.room.players.find((p) => p.userId === data.me.userId)?.user.name;
            return n ? ` as ${n}` : "";
          })()}
          . Look for the green <strong>You</strong> badge on the table.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[rgba(179,58,74,0.4)] bg-[rgba(179,58,74,0.12)] px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {hint && (
        <div className="rounded-xl border border-[rgba(62,207,142,0.35)] bg-[rgba(62,207,142,0.08)] px-3 py-2 text-sm">
          {hint}
        </div>
      )}

      <Panel className="p-2 md:p-3">
        <PokerTable
          roomId={data.room.id}
          tableName={data.room.name}
          brandName="RamerLabs"
          initialState={data.game.state}
          players={data.room.players}
          maxPlayers={data.room.maxPlayers}
          canStart={canStart}
          canSit={!seated}
          viewerUserId={data.me.userId}
          viewerSeat={data.me.seat}
          preferredSeat={data.me.preferredSeat}
          inviteCode={inviteCode || undefined}
          onPlayersChanged={() => void load()}
          onSitResult={(msg) => setHint(msg)}
        />
      </Panel>
    </div>
  );
}
