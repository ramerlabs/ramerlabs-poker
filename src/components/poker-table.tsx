"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import * as Ably from "ably";
import { PlayingCard } from "@/components/playing-card";
import { Badge, Button, Input } from "@/components/ui";
import type { PublicTableState } from "@/lib/poker/types";
import { cn } from "@/lib/utils";

type RoomPlayer = {
  userId: string;
  seat: number;
  stack: number;
  user: { id: string; name: string | null; email: string };
};

export function PokerTable({
  roomId,
  initialState,
  players,
  canStart,
}: {
  roomId: string;
  initialState: PublicTableState;
  players: RoomPlayer[];
  canStart: boolean;
}) {
  const { data: session } = useSession();
  const [state, setState] = useState(initialState);
  const [raiseTo, setRaiseTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<"ably" | "polling">("polling");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomId}`);
    if (!res.ok) return;
    const json = await res.json();
    if (json.game?.state) setState(json.game.state);
  }, [roomId]);

  useEffect(() => {
    let client: Ably.Realtime | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function setup() {
      const tokenRes = await fetch("/api/ably/token");
      const tokenJson = await tokenRes.json();
      if (cancelled) return;

      if (tokenJson.enabled && tokenJson.tokenRequest) {
        setSyncMode("ably");
        client = new Ably.Realtime({ authCallback: (_, cb) => cb(null, tokenJson.tokenRequest) });
        const channel = client.channels.get(`room:${roomId}`);
        channel.subscribe("state", () => {
          void refresh();
        });
      } else {
        setSyncMode("polling");
        poll = setInterval(() => void refresh(), 2000);
      }
    }

    void setup();
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      client?.close();
    };
  }, [roomId, refresh]);

  const mySeat = useMemo(
    () => state.seats.find((s) => s.userId === session?.user?.id),
    [state.seats, session?.user?.id],
  );

  const isMyTurn = mySeat != null && state.actionSeat === mySeat.seat;

  async function act(action: string, amount?: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Action failed");
      setState(json.state);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const nameFor = (userId: string) =>
    players.find((p) => p.userId === userId)?.user.name ||
    players.find((p) => p.userId === userId)?.user.email ||
    userId.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge>{state.street.toUpperCase()}</Badge>
          <Badge tone="muted">Hand #{state.handNumber}</Badge>
          <Badge tone="green">Sync: {syncMode}</Badge>
        </div>
        <div className="text-sm text-[var(--muted)]">
          Pot <span className="font-semibold text-[var(--gold-soft)]">{state.pot}</span>
        </div>
      </div>

      <div className="felt-table relative mx-auto aspect-[16/10] w-full max-w-4xl rounded-[999px] p-6 md:p-10">
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
          <div className="flex gap-2">
            {state.community.length
              ? state.community.map((c, i) => <PlayingCard key={`${c}-${i}`} card={c} />)
              : Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[78px] w-[54px] rounded-lg border border-dashed border-white/15"
                  />
                ))}
          </div>
          <div className="rounded-full border border-[rgba(212,168,83,0.35)] bg-black/30 px-4 py-1 text-xs tracking-widest text-[var(--gold-soft)]">
            COMMUNITY
          </div>
        </div>

        <div className="grid h-full grid-cols-3 grid-rows-3 place-items-center">
          {state.seats.map((seat) => {
            const active = state.actionSeat === seat.seat;
            return (
              <div
                key={seat.userId}
                className={cn(
                  "rounded-2xl border px-3 py-2 text-center backdrop-blur-sm",
                  active
                    ? "animate-pulse-gold border-[var(--gold)] bg-black/45"
                    : "border-white/10 bg-black/30",
                  seat.seat === 0 && "col-start-2 row-start-1",
                  seat.seat === 1 && "col-start-3 row-start-2",
                  seat.seat === 2 && "col-start-2 row-start-3",
                  seat.seat === 3 && "col-start-1 row-start-2",
                  seat.seat >= 4 && "col-start-2 row-start-2",
                )}
              >
                <div className="text-xs text-[var(--muted)]">Seat {seat.seat + 1}</div>
                <div className="text-sm font-semibold">{nameFor(seat.userId)}</div>
                <div className="text-xs text-[var(--gold-soft)]">Stack {seat.stack}</div>
                {seat.bet > 0 && <div className="text-[11px] text-[var(--success)]">Bet {seat.bet}</div>}
                <div className="mt-2 flex justify-center gap-1">
                  {seat.holeCards.map((c, idx) => (
                    <PlayingCard key={`${seat.userId}-${idx}`} card={c} className="!h-14 !w-10 !text-[10px]" />
                  ))}
                </div>
                {seat.folded && <div className="mt-1 text-[10px] uppercase text-[var(--crimson)]">Folded</div>}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[rgba(179,58,74,0.4)] bg-[rgba(179,58,74,0.12)] px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canStart && (state.street === "waiting" || state.street === "complete") && (
          <Button disabled={busy} onClick={() => act("start")} variant="felt">
            Deal next hand
          </Button>
        )}
        {isMyTurn && (
          <>
            <Button disabled={busy} variant="danger" onClick={() => act("fold")}>
              Fold
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => act("check")}>
              Check
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => act("call")}>
              Call
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => act("allin")}>
              All-in
            </Button>
            <div className="flex items-center gap-2">
              <Input
                className="w-28"
                placeholder="Raise to"
                value={raiseTo}
                onChange={(e) => setRaiseTo(e.target.value)}
              />
              <Button
                disabled={busy || !raiseTo}
                onClick={() => act("raise", Number(raiseTo))}
              >
                Raise
              </Button>
            </div>
          </>
        )}
      </div>

      {state.winners.length > 0 && (
        <div className="rounded-xl border border-[rgba(62,207,142,0.35)] bg-[rgba(62,207,142,0.08)] px-4 py-3 text-sm">
          {state.winners.map((w) => (
            <div key={w.userId}>
              {nameFor(w.userId)} wins {w.amount} with {w.handName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
