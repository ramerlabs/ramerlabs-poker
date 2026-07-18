"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import * as Ably from "ably";
import { PlayingCard } from "@/components/playing-card";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge, Button, Input } from "@/components/ui";
import type { PublicTableState } from "@/lib/poker/types";
import { DEFAULT_TURN_SECONDS } from "@/lib/poker/types";
import {
  isMuted,
  loadMutePreference,
  playSfx,
  setMuted,
  unlockAudio,
} from "@/lib/sounds";
import { cn, readJson } from "@/lib/utils";

type RoomPlayer = {
  userId: string;
  seat: number;
  stack: number;
  user: { id: string; name: string | null; email: string };
};

type BetFx = {
  id: string;
  amount: number;
  label: string;
  fromX: string;
  fromY: string;
  delay: number;
};

type DealThrow = {
  id: string;
  toX: string;
  toY: string;
  delay: number;
};

const POT_X = "50%";
const POT_Y = "58%";
const DEALER_X = "50%";
const DEALER_Y = "18%";

/** Seats on the oval rim — kept inward so chips are not clipped. */
const SEAT_LAYOUT: Record<number, { left: string; top: string }> = {
  0: { left: "50%", top: "8%" },
  1: { left: "78%", top: "18%" },
  2: { left: "90%", top: "45%" },
  3: { left: "78%", top: "75%" },
  4: { left: "50%", top: "88%" },
  5: { left: "22%", top: "75%" },
  6: { left: "10%", top: "45%" },
  7: { left: "22%", top: "18%" },
  8: { left: "65%", top: "10%" },
};

function isBot(userId: string) {
  return userId.startsWith("bot_");
}

function seatOrigin(seat: number): { x: string; y: string } {
  const pos = SEAT_LAYOUT[seat] ?? SEAT_LAYOUT[0]!;
  return { x: pos.left, y: pos.top };
}

function seatActionLabel(
  action: PublicTableState["seats"][number]["lastAction"],
  amount?: number,
): string {
  if (!action) return "";
  const labels: Record<string, string> = {
    allin: "ALL-IN",
    fold: "FOLD",
    check: "CHECK",
    call: "CALL",
    bet: "BET",
    raise: "RAISE",
  };
  const label = labels[action] ?? action.toUpperCase();
  if (
    amount != null &&
    amount > 0 &&
    (action === "call" || action === "bet" || action === "raise" || action === "allin")
  ) {
    return `${label} ${amount}`;
  }
  return label;
}

function chipTone(amount: number): "green" | "blue" | "red" | "black" {
  if (amount >= 100) return "black";
  if (amount >= 25) return "blue";
  if (amount >= 10) return "green";
  return "red";
}

function ChipPile({ amount }: { amount: number }) {
  const count = Math.min(4, Math.max(1, Math.ceil(amount / 15)));
  const tone = chipTone(amount);
  return (
    <div className="seat-bet-stack">
      <div className="chip-stack">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={cn("poker-chip", `is-${tone}`)}>
            <span>{amount >= 100 ? "100" : amount >= 25 ? "25" : amount >= 10 ? "10" : "5"}</span>
          </div>
        ))}
      </div>
      <div className="chip-amount-tag">{amount}</div>
    </div>
  );
}

function TurnTimer({
  secondsLeft,
  total,
}: {
  secondsLeft: number;
  total: number;
}) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, secondsLeft / total));
  const urgent = secondsLeft <= 5;

  return (
    <div className={cn("turn-timer relative", urgent && "urgent")} title="Turn timer">
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke={urgent ? "var(--crimson)" : "var(--gold)"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 grid place-items-center text-xs font-bold tabular-nums",
          urgent ? "text-[var(--crimson)]" : "text-[var(--gold-soft)]",
        )}
      >
        {secondsLeft}
      </span>
    </div>
  );
}

export function PokerTable({
  roomId,
  tableName = "Table",
  brandName = "RamerLabs",
  initialState,
  players: initialPlayers,
  maxPlayers = 8,
  canStart: _canStart = false,
  canSit = false,
  preferredSeat = null,
  inviteCode,
  onPlayersChanged,
  onSitResult,
}: {
  roomId: string;
  tableName?: string;
  brandName?: string;
  initialState: PublicTableState;
  players: RoomPlayer[];
  maxPlayers?: number;
  canStart: boolean;
  /** Spectator / waiter can click an open seat */
  canSit?: boolean;
  preferredSeat?: number | null;
  inviteCode?: string;
  onPlayersChanged?: () => void;
  onSitResult?: (msg: string) => void;
}) {
  const { data: session } = useSession();
  const [state, setState] = useState(initialState);
  const [players, setPlayers] = useState(initialPlayers);
  const [raiseTo, setRaiseTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [syncMode, setSyncMode] = useState<"ably" | "polling">("polling");
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_TURN_SECONDS);
  const [betFx, setBetFx] = useState<BetFx[]>([]);
  const [dealThrows, setDealThrows] = useState<DealThrow[]>([]);
  const [dealerDealing, setDealerDealing] = useState(false);
  const [holeCardsVisible, setHoleCardsVisible] = useState(true);
  const [muted, setMutedState] = useState(false);
  const [winnerVisible, setWinnerVisible] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [attentionAcked, setAttentionAcked] = useState(false);
  const [attentionLeaving, setAttentionLeaving] = useState(false);
  const [timeoutNotice, setTimeoutNotice] = useState(false);
  const lastActionKey = useRef<string>("");
  const lastHandRef = useRef(0);
  const lastDealAnimRef = useRef(0);
  const lastWinKey = useRef("");
  const lastTickRef = useRef<number | null>(null);
  const lastTurnKey = useRef<string>("");
  const autoFolding = useRef(false);
  const attentionLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMutedState(loadMutePreference());
  }, []);

  useEffect(() => {
    setPlayers(initialPlayers);
  }, [initialPlayers]);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  // Dealer drops 2 hole cards to each seat before betting
  useEffect(() => {
    if (state.street !== "preflop" || state.handNumber <= 0) return;
    if (state.handNumber === lastDealAnimRef.current) return;

    // Mid-hand join / remount after deal hold — don't re-hide cards
    if (state.streetHoldUntil && Date.now() >= state.streetHoldUntil) {
      lastDealAnimRef.current = state.handNumber;
      setHoleCardsVisible(true);
      setDealerDealing(false);
      return;
    }
    if (
      state.seats.some((s) => s.lastAction) ||
      (state.actionSeat != null &&
        state.seats.some((s) => s.bet > (state.bigBlind || 0)))
    ) {
      lastDealAnimRef.current = state.handNumber;
      setHoleCardsVisible(true);
      setDealerDealing(false);
      return;
    }

    lastDealAnimRef.current = state.handNumber;

    const seatsInHand = state.seats.filter(
      (s) => !s.sittingOut && (s.cardCount > 0 || s.holeCards.length > 0),
    );
    if (!seatsInHand.length) {
      setHoleCardsVisible(true);
      return;
    }

    setHoleCardsVisible(false);
    setDealerDealing(true);

    const throws: DealThrow[] = [];
    seatsInHand.forEach((seat, seatIdx) => {
      const pos = seatOrigin(seat.seat);
      for (let card = 0; card < 2; card += 1) {
        throws.push({
          id: `deal-${state.handNumber}-${seat.seat}-${card}`,
          toX: pos.x,
          toY: pos.y,
          delay: seatIdx * 480 + card * 220,
        });
      }
    });
    setDealThrows(throws);

    const lastDelay = throws.length ? throws[throws.length - 1]!.delay : 0;
    const clearAt = lastDelay + 850;
    const t = setTimeout(() => {
      setDealThrows([]);
      setDealerDealing(false);
      setHoleCardsVisible(true);
    }, clearAt);
    return () => clearTimeout(t);
  }, [state.handNumber, state.street, state.seats, state.streetHoldUntil, state.actionSeat, state.bigBlind]);

  // If we join mid-hand (not a fresh deal), show hole cards immediately
  useEffect(() => {
    if (state.street !== "preflop" && state.street !== "waiting") {
      setHoleCardsVisible(true);
      setDealerDealing(false);
    }
  }, [state.street]);

  // Safety: never leave seats stuck on "Waiting deal…" once betting is live
  useEffect(() => {
    if (!holeCardsVisible && state.street === "preflop") {
      if (
        (state.streetHoldUntil != null && Date.now() >= state.streetHoldUntil) ||
        state.seats.some((s) => Boolean(s.lastAction))
      ) {
        setHoleCardsVisible(true);
        setDealerDealing(false);
        setDealThrows([]);
      }
    }
  }, [holeCardsVisible, state.street, state.streetHoldUntil, state.seats, state.lastAction]);

  // Deal / win sounds — only for the human player at this table
  useEffect(() => {
    const me = session?.user?.id;
    const seatedHere = Boolean(me && state.seats.some((s) => s.userId === me));
    if (
      seatedHere &&
      state.handNumber > lastHandRef.current &&
      state.street === "preflop"
    ) {
      playSfx("deal");
      setTimeout(() => playSfx("deal"), 90);
      setTimeout(() => playSfx("deal"), 180);
    }
    lastHandRef.current = state.handNumber;
  }, [state.handNumber, state.street, state.seats, session?.user?.id]);

  useEffect(() => {
    if (!state.winners?.length) {
      setWinnerVisible(false);
      return;
    }
    if (!(state.street === "complete" || state.street === "showdown")) {
      setWinnerVisible(false);
      return;
    }
    const key = `${state.handNumber}-${state.winners.map((w) => w.userId).join(",")}`;
    if (key !== lastWinKey.current) {
      lastWinKey.current = key;
      const me = session?.user?.id;
      if (me && state.winners.some((w) => w.userId === me)) {
        playSfx("win");
      }
      setWinnerVisible(true);
    }
    const hide = setTimeout(() => setWinnerVisible(false), 4800);
    return () => clearTimeout(hide);
  }, [state.winners, state.street, state.handNumber, session?.user?.id]);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/rooms/${roomId}`, { cache: "no-store" });
    if (!res.ok) return;
    const json = await readJson<{
      game?: { state?: PublicTableState };
      room?: { players?: RoomPlayer[] };
    }>(res);
    if (json.game?.state) setState(json.game.state);
    if (json.room?.players) setPlayers(json.room.players);
  }, [roomId]);

  useEffect(() => {
    let client: Ably.Realtime | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    async function setup() {
      try {
        const tokenRes = await fetch("/api/ably/token");
        const tokenJson = await readJson<{
          enabled?: boolean;
          tokenRequest?: unknown;
        }>(tokenRes);
        if (cancelled) return;

        if (tokenJson.enabled && tokenJson.tokenRequest) {
          setSyncMode("ably");
          client = new Ably.Realtime({
            authCallback: (_, cb) => cb(null, tokenJson.tokenRequest as Ably.TokenRequest),
          });
          const channel = client.channels.get(`room:${roomId}`);
          channel.subscribe("state", () => {
            void refresh();
          });
          return;
        }
      } catch {
        // Fall through to polling
      }
      if (cancelled) return;
      setSyncMode("polling");
      poll = setInterval(() => void refresh(), 600);
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
  const seatedCount = Math.max(state.seats.length, players.length);
  const waiting = state.street === "waiting" || state.street === "complete";
  const turnSeconds = state.turnSeconds || DEFAULT_TURN_SECONDS;
  const turnKey =
    isMyTurn && !waiting && state.turnStartedAt
      ? `${state.handNumber}-${state.street}-${state.actionSeat}-${state.turnStartedAt}`
      : "";
  const attentionUrgent = isMyTurn && secondsLeft <= 5;

  const livePot = useMemo(
    () => state.pot + state.seats.reduce((sum, s) => sum + (s.bet || 0), 0),
    [state.pot, state.seats],
  );

  const showWinnerOverlay =
    (state.winners?.length ?? 0) > 0 &&
    (state.street === "complete" || state.street === "showdown");

  const fireworks = useMemo(() => {
    if (!winnerVisible) return [];
    const colors = ["#f0d59a", "#3ecf8e", "#e8eef7", "#d4a853", "#7ec8e3", "#e8b4b8"];
    return Array.from({ length: 28 }, (_, i) => {
      const angle = (i / 28) * Math.PI * 2 + (i % 3) * 0.2;
      const dist = 70 + (i % 5) * 22;
      return {
        id: `fw-${state.handNumber}-${i}`,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - 20,
        delay: (i % 8) * 45,
        color: colors[i % colors.length]!,
      };
    });
  }, [winnerVisible, state.handNumber]);

  // Countdown from server turnStartedAt
  useEffect(() => {
    if (waiting || state.actionSeat == null || !state.turnStartedAt) {
      setSecondsLeft(turnSeconds);
      return;
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - (state.turnStartedAt ?? Date.now())) / 1000);
      setSecondsLeft(Math.max(0, turnSeconds - elapsed));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [state.actionSeat, state.turnStartedAt, state.handNumber, turnSeconds, waiting]);

  // Chips fly from the acting seat into the pot; SFX only for your own actions
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    const key = `${state.handNumber}-${action.userId}-${action.action}-${action.amount ?? 0}-${state.street}`;
    if (key === lastActionKey.current) return;
    lastActionKey.current = key;

    const isMine = action.userId === session?.user?.id;
    if (isMine) {
      if (action.action === "fold") playSfx("fold");
      else if (action.action === "check") playSfx("check");
      else if (["bet", "raise", "call", "allin"].includes(action.action)) playSfx("chip");
    }

    const moneyActions = new Set(["bet", "raise", "call", "allin"]);
    if (!moneyActions.has(action.action) || !(action.amount && action.amount > 0)) return;

    const seat = state.seats.find((s) => s.userId === action.userId);
    if (!seat) return;
    const origin = seatOrigin(seat.seat);
    const stamp = Date.now();
    const chips: BetFx[] = [0, 1, 2].map((i) => ({
      id: `${key}-${stamp}-${i}`,
      amount: action.amount!,
      label: i === 0 ? action.action.toUpperCase() : "",
      fromX: origin.x,
      fromY: origin.y,
      delay: i * 70,
    }));
    setBetFx((prev) => [...prev, ...chips]);
    const t = setTimeout(() => {
      setBetFx((prev) => prev.filter((b) => !b.id.startsWith(`${key}-${stamp}`)));
    }, 1100);
    return () => clearTimeout(t);
  }, [state.lastAction, state.handNumber, state.street, state.seats, session?.user?.id]);

  // Timer tick SFX — only on your turn
  useEffect(() => {
    if (!isMyTurn || waiting || state.actionSeat == null) return;
    if (secondsLeft > 0 && secondsLeft <= 5 && lastTickRef.current !== secondsLeft) {
      lastTickRef.current = secondsLeft;
      playSfx(secondsLeft <= 2 ? "urgent" : "tick");
    }
  }, [secondsLeft, waiting, state.actionSeat, isMyTurn]);

  function dismissAttention(opts?: { timeout?: boolean }) {
    if (attentionLeaveTimer.current) clearTimeout(attentionLeaveTimer.current);
    if (opts?.timeout) {
      setTimeoutNotice(true);
      setAttentionLeaving(true);
      attentionLeaveTimer.current = setTimeout(() => {
        setAttentionOpen(false);
        setAttentionLeaving(false);
        setTimeoutNotice(false);
        setAttentionAcked(false);
      }, 900);
      return;
    }
    setAttentionOpen(false);
    setAttentionLeaving(false);
    setTimeoutNotice(false);
  }

  async function act(action: string, amount?: number, fromSystem = false) {
    unlockAudio();
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amount }),
      });
      const json = await readJson<{ error?: string; state?: PublicTableState }>(res);
      if (!res.ok) throw new Error(json.error || "Action failed");
      if (json.state) setState(json.state);
      if (fromSystem && action === "fold") {
        setHint("Time’s up — you were folded by the system.");
        dismissAttention({ timeout: true });
      } else {
        dismissAttention();
        setAttentionAcked(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      if (fromSystem) {
        setHint("Time’s up — you were folded by the system.");
        dismissAttention({ timeout: true });
      }
    } finally {
      setBusy(false);
      autoFolding.current = false;
    }
  }

  function toggleMute() {
    unlockAudio();
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
    if (!next) playSfx("click");
  }

  function acknowledgeAttention() {
    unlockAudio();
    playSfx("click");
    setAttentionAcked(true);
    setAttentionOpen(false);
    setAttentionLeaving(false);
    setTimeoutNotice(false);
  }

  // Your turn: confirmation box + alert sound
  useEffect(() => {
    if (!turnKey) {
      if (!timeoutNotice && !attentionLeaving) {
        setAttentionOpen(false);
        setAttentionAcked(false);
      }
      return;
    }
    if (turnKey === lastTurnKey.current) return;
    lastTurnKey.current = turnKey;
    setAttentionAcked(false);
    setTimeoutNotice(false);
    setAttentionLeaving(false);
    setAttentionOpen(true);
    unlockAudio();
    playSfx("alert");
  }, [turnKey, timeoutNotice, attentionLeaving]);

  // Repeat alert until acknowledged or turn ends
  useEffect(() => {
    if (!isMyTurn || waiting || attentionAcked || !attentionOpen || timeoutNotice) return;
    const id = setInterval(() => {
      playSfx("alert");
    }, attentionUrgent ? 2200 : 3500);
    return () => clearInterval(id);
  }, [isMyTurn, waiting, attentionAcked, attentionOpen, timeoutNotice, attentionUrgent]);

  // Auto-fold when timer hits 0 on your turn — box fades out after system fold
  useEffect(() => {
    if (!isMyTurn || waiting || busy || secondsLeft > 0 || autoFolding.current) return;
    autoFolding.current = true;
    setTimeoutNotice(true);
    setAttentionLeaving(true);
    setAttentionOpen(true);
    setHint("Time’s up — auto-folding…");
    playSfx("timeout");
    void act("fold", undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, isMyTurn, waiting, busy]);

  useEffect(() => {
    return () => {
      if (attentionLeaveTimer.current) clearTimeout(attentionLeaveTimer.current);
    };
  }, []);

  async function addBot() {
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/bots`, { method: "POST" });
      const json = await readJson<{ error?: string; bot?: { name: string } }>(res);
      if (!res.ok) throw new Error(json.error || "Could not add bot");
      setHint(`${json.bot?.name ?? "Bot"} sat down. Press Deal hand to play.`);
      await refresh();
      onPlayersChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add bot");
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = session?.user?.role === "ADMIN";

  async function kickBotSeat(botUserId: string, botName: string) {
    if (!isAdmin || busy) return;
    unlockAudio();
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/bots`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: botUserId }),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error || "Could not kick bot");
      playSfx("click");
      setHint(`Kicked ${botName}. Seat is open for a waiter.`);
      await refresh();
      onPlayersChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not kick bot");
    } finally {
      setBusy(false);
    }
  }

  async function sitAt(seatIndex: number) {
    if (!canSit || busy) return;
    unlockAudio();
    playSfx("click");
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/sit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seat: seatIndex,
          inviteCode: inviteCode || undefined,
        }),
      });
      const json = await readJson<{
        error?: string;
        seated?: boolean;
        message?: string;
      }>(res);
      if (!res.ok) throw new Error(json.error || "Could not sit");
      const msg = json.seated
        ? `You sat at seat ${seatIndex + 1}.`
        : json.message ||
          `Seat ${seatIndex + 1} reserved — you join when this hand ends.`;
      setHint(msg);
      onSitResult?.(msg);
      await refresh();
      onPlayersChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sit");
    } finally {
      setBusy(false);
    }
  }

  const nameFor = (userId: string) =>
    players.find((p) => p.userId === userId)?.user.name ||
    players.find((p) => p.userId === userId)?.user.email ||
    (isBot(userId) ? "Player" : userId.slice(0, 6));

  const occupiedSeats = useMemo(() => {
    const map = new Map<number, PublicTableState["seats"][number]>();
    for (const s of state.seats) map.set(s.seat, s);
    for (const p of players) {
      if (!map.has(p.seat)) {
        map.set(p.seat, {
          seat: p.seat,
          userId: p.userId,
          stack: p.stack,
          bet: 0,
          totalBet: 0,
          folded: false,
          allIn: false,
          sittingOut: false,
          lastAction: null,
          holeCards: [],
          cardCount: 0,
        });
      }
    }
    return map;
  }, [state.seats, players]);

  const seatSlots = useMemo(
    () => Array.from({ length: Math.min(maxPlayers, 9) }, (_, i) => i),
    [maxPlayers],
  );

  const actorName =
    state.actionSeat != null
      ? nameFor(state.seats.find((s) => s.seat === state.actionSeat)?.userId ?? "")
      : null;

  const winners = state.winners ?? [];
  const showWinner = winnerVisible && showWinnerOverlay;
  const primaryWinner = winners[0];
  const winnerIds = new Set(winners.map((w) => w.userId));
  const showPot = !showWinner && livePot > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge>{state.street.toUpperCase()}</Badge>
          <Badge tone="muted">Hand #{state.handNumber}</Badge>
          <Badge tone="green">Sync: {syncMode}</Badge>
          <Badge tone="muted">{seatedCount} seated</Badge>
          {state.rakePercent > 0 && <Badge tone="gold">Rake {state.rakePercent}%</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" className="!px-3 !py-2 text-xs" onClick={toggleMute}>
            {muted ? "Sound off" : "Sound on"}
          </Button>
          {!waiting && state.actionSeat != null && (
            <>
              <span className="text-sm text-[var(--muted)]">
                {isMyTurn ? "Your turn" : `${actorName}'s turn`}
              </span>
              <TurnTimer secondsLeft={secondsLeft} total={turnSeconds} />
            </>
          )}
        </div>
      </div>

      {waiting && seatedCount < 2 && (
        <div className="rounded-xl border border-[rgba(212,168,83,0.35)] bg-[rgba(212,168,83,0.08)] px-4 py-3 text-sm">
          Texas Hold&apos;em needs <strong>2+ players</strong>. Bots refill automatically; the table
          auto-deals when ready.
        </div>
      )}

      <div className="table-stage relative mx-auto w-full max-w-5xl">
        <div className="table-felt-wrap relative mx-auto aspect-[16/10] w-full max-w-4xl">
          <div className="felt-table absolute inset-0 overflow-hidden rounded-[999px]">
        {/* Center: brand + community cards + pot */}
        <div className="pointer-events-none absolute left-1/2 top-[54%] z-10 flex w-[min(90%,400px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2.5">
          <div className="felt-brand-center">
            <div className="brand-name">{brandName}</div>
            <div className="brand-table">{tableName}</div>
          </div>

          <div className="board-row pointer-events-auto">
            {Array.from({ length: 5 }).map((_, i) => {
              const c = state.community[i];
              if (!c) {
                return <div key={`slot-${i}`} className="board-slot" />;
              }
              return (
                <PlayingCard
                  key={`${state.handNumber}-board-${i}-${c}`}
                  card={c}
                  delayMs={120}
                  className="board-card"
                />
              );
            })}
          </div>

          {showPot && (
            <div
              key={`pot-${livePot}-${state.handNumber}`}
              className="pointer-events-auto pot-classic animate-pot"
            >
              <div className="chip-stack">
                {Array.from({ length: Math.min(5, Math.max(2, Math.ceil(livePot / 20))) }).map(
                  (_, i) => (
                    <div
                      key={i}
                      className={cn("poker-chip", `is-${chipTone(livePot)}`)}
                      style={{ marginLeft: i % 2 === 0 ? 0 : 6 }}
                    >
                      <span>{livePot >= 100 ? "100" : livePot >= 25 ? "25" : "10"}</span>
                    </div>
                  ),
                )}
              </div>
              <div className="pot-value">{livePot.toLocaleString()}</div>
            </div>
          )}
        </div>

        {/* Compact dealer — deck only while dealing (avoids floating card over brand) */}
        {!waiting && (
          <div className={cn("dealer-figure", dealerDealing && "is-dealing")}>
            <div className="dealer-avatar">
              D
              {dealerDealing && <span className="dealer-deck" aria-hidden />}
            </div>
            {dealerDealing && <div className="dealer-status">Dealing…</div>}
          </div>
        )}

        {dealThrows.map((fx) => (
          <div
            key={fx.id}
            className="deal-throw"
            style={
              {
                "--from-x": DEALER_X,
                "--from-y": DEALER_Y,
                "--to-x": fx.toX,
                "--to-y": fx.toY,
                animationDelay: `${fx.delay}ms`,
              } as React.CSSProperties
            }
          />
        ))}

        {/* Winner celebration: fireworks then auto-fade */}
        {showWinner && primaryWinner && (
          <>
            {fireworks.map((fw) => (
              <span
                key={fw.id}
                className="firework"
                style={
                  {
                    "--fw-x": `${fw.x}px`,
                    "--fw-y": `${fw.y}px`,
                    "--fw-color": fw.color,
                    animationDelay: `${fw.delay}ms`,
                  } as React.CSSProperties
                }
              />
            ))}
            <div
              className="winner-banner"
              key={`win-${state.handNumber}-${primaryWinner.userId}`}
            >
              <div className="mb-2 flex justify-center">
                <PlayerAvatar
                  userId={primaryWinner.userId}
                  name={nameFor(primaryWinner.userId)}
                  size="lg"
                />
              </div>
              <div className="winner-eyebrow">Winner</div>
              <div className="winner-name">{nameFor(primaryWinner.userId)}</div>
              <div className="winner-amount">+{primaryWinner.amount.toLocaleString()}</div>
              <div className="winner-combo">
                <div className="winner-combo-label">Won with</div>
                <div className="winner-hand">
                  {primaryWinner.handName || "Best hand"}
                </div>
              </div>
              {winners.length > 1 && (
                <div className="mt-2 text-xs text-[var(--muted)]">
                  Split with{" "}
                  {winners
                    .slice(1)
                    .map((w) => `${nameFor(w.userId)} (${w.handName})`)
                    .join(", ")}
                </div>
              )}
              {state.rakeTaken > 0 && (
                <div className="mt-1 text-[11px] text-[var(--gold)]">Rake {state.rakeTaken}</div>
              )}
            </div>
          </>
        )}

        {/* Chips flying seat → pot */}
        {betFx.map((fx) => (
          <div
            key={fx.id}
            className="chip-to-pot"
            style={
              {
                "--from-x": fx.fromX,
                "--from-y": fx.fromY,
                "--to-x": POT_X,
                "--to-y": POT_Y,
                animationDelay: `${fx.delay}ms`,
              } as React.CSSProperties
            }
          >
            {fx.label ? (
              <div className="rounded-full border border-[rgba(212,168,83,0.6)] bg-gradient-to-b from-[#4a3414] to-[#1a1208] px-3 py-1.5 text-center shadow-[0_8px_20px_rgba(0,0,0,0.45)]">
                <div className="text-[9px] uppercase tracking-wider text-[var(--muted)]">
                  {fx.label}
                </div>
                <div className="text-sm font-bold text-[var(--gold-soft)]">+{fx.amount}</div>
              </div>
            ) : (
              <div className="h-5 w-5 rounded-full border border-[rgba(212,168,83,0.55)] bg-[radial-gradient(circle_at_35%_30%,#f0d59a,#b8892d_55%,#6a4a14)] shadow-md" />
            )}
          </div>
        ))}

        {/* Seats overlay matches felt size; overflow visible so chips are not clipped */}
        </div>
        <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
        {seatSlots.map((seatIndex) => {
          const seat = occupiedSeats.get(seatIndex);
          const pos = SEAT_LAYOUT[seatIndex] ?? SEAT_LAYOUT[seatIndex % 9]!;
          const reservedHere = preferredSeat === seatIndex;

          if (!seat) {
            return (
              <div
                key={`open-${seatIndex}`}
                className="seat-on-rail pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: pos.left, top: pos.top }}
              >
                <button
                  type="button"
                  disabled={!canSit || busy}
                  onClick={() => void sitAt(seatIndex)}
                  className={cn("seat-empty-classic", reservedHere && "is-reserved")}
                  title={
                    canSit
                      ? reservedHere
                        ? "Your reserved seat"
                        : !waiting
                          ? "Join here — sits when this hand ends"
                          : "Sit at this open seat"
                      : "You are already seated"
                  }
                >
                  ♣
                </button>
              </div>
            );
          }

          const active = state.actionSeat === seat.seat;
          const isDealer = state.dealerSeat === seat.seat && state.handNumber > 0;
          const isWinner = showWinner && winnerIds.has(seat.userId);
          const displayName = nameFor(seat.userId);
          const showCards =
            holeCardsVisible && (seat.holeCards.length > 0 || seat.cardCount > 0);
          const hole =
            seat.holeCards.length > 0
              ? seat.holeCards
              : Array.from({ length: seat.cardCount || 2 }, () => "hidden");

          return (
            <div
              key={seat.userId}
              className={cn(
                "seat-on-rail seat-node absolute -translate-x-1/2 -translate-y-1/2",
                active && !showWinner && "is-active",
                isWinner && "is-winner",
                seat.folded && "is-folded",
              )}
              style={{ left: pos.left, top: pos.top }}
            >
              {(seat.lastAction || seat.folded || seat.allIn) &&
                !showWinner &&
                state.street !== "waiting" && (
                  <div
                    className={cn(
                      "seat-action-badge",
                      `is-${seat.lastAction ?? (seat.folded ? "fold" : "allin")}`,
                    )}
                  >
                    {seatActionLabel(
                      seat.lastAction ?? (seat.folded ? "fold" : seat.allIn ? "allin" : null),
                      seat.lastActionAmount,
                    )}
                  </div>
                )}

              {showCards && (
                <div className="seat-hole-cards">
                  {hole.map((c, idx) => (
                    <PlayingCard
                      key={`${seat.userId}-${state.handNumber}-${idx}`}
                      card={c}
                      delayMs={idx * 70}
                    />
                  ))}
                </div>
              )}

              <div className="seat-avatar-wrap">
                <PlayerAvatar userId={seat.userId} name={displayName} size="md" />
                {isDealer && (
                  <span
                    className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--gold)] text-[10px] font-bold text-[#1a1205] shadow"
                    title="Dealer button"
                  >
                    D
                  </span>
                )}
                {isWinner && (
                  <span className="absolute -left-1 -top-1 rounded-full bg-[var(--gold)] px-1.5 py-0.5 text-[8px] font-bold text-[#1a1205]">
                    WIN
                  </span>
                )}
              </div>

              <div className="seat-nameplate">
                <div className="seat-nameplate-name" title={displayName}>
                  {displayName}
                </div>
                <div className="seat-nameplate-stack">{seat.stack.toLocaleString()}</div>
              </div>

              {active && !waiting && !showWinner && (
                <span className="seat-timer-slot">
                  <TurnTimer secondsLeft={secondsLeft} total={turnSeconds} />
                </span>
              )}

              {seat.bet > 0 && !(seat.lastAction === "check" || seat.lastAction === "fold") && (
                <ChipPile amount={seat.bet} />
              )}

              {isAdmin && isBot(seat.userId) && waiting && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void kickBotSeat(seat.userId, displayName)}
                  className="mt-1 rounded-full border border-[rgba(179,58,74,0.45)] bg-[rgba(179,58,74,0.15)] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--crimson)] hover:bg-[rgba(179,58,74,0.3)] disabled:opacity-50"
                  title="Admin: kick this bot"
                >
                  Kick
                </button>
              )}
            </div>
          );
        })}
        </div>
      </div>
      </div>

      {(attentionOpen || attentionLeaving || timeoutNotice) && (
        <div
          className={cn(
            "attention-banner",
            attentionUrgent && !timeoutNotice && "is-urgent",
            timeoutNotice && "is-timeout",
            attentionLeaving && "is-leaving",
          )}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="attention-title"
        >
          <div className="attention-eyebrow">
            {timeoutNotice ? "Timed out" : attentionUrgent ? "Hurry" : "Action needed"}
          </div>
          <div id="attention-title" className="attention-title">
            {timeoutNotice ? "Folded by system" : "Your turn"}
          </div>
          <p className="attention-copy">
            {timeoutNotice
              ? "You didn’t act in time — this hand is folded for you."
              : "Confirm you’re here, or play now before the timer runs out."}
          </p>
          {!timeoutNotice && <div className="attention-timer">{secondsLeft}s</div>}
          {!timeoutNotice && (
            <div className="attention-actions">
              <Button disabled={busy} variant="felt" onClick={acknowledgeAttention}>
                I’m here
              </Button>
              <Button disabled={busy} variant="ghost" onClick={() => void act("check")}>
                Check
              </Button>
              <Button disabled={busy} variant="ghost" onClick={() => void act("call")}>
                Call
              </Button>
              <Button disabled={busy} variant="danger" onClick={() => void act("fold")}>
                Fold
              </Button>
            </div>
          )}
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

      <div className="flex flex-wrap items-center gap-2">
        {waiting && (
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Button disabled={busy} onClick={addBot} variant="ghost">
                Add bot opponent
              </Button>
            )}
            {isAdmin && seatedCount >= 2 && (
              <Button disabled={busy} onClick={() => void act("start")} variant="ghost">
                Deal now
              </Button>
            )}
            {seatedCount >= 2 ? (
              <p className="text-sm text-[var(--gold-soft)]">Auto-dealing when ready…</p>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                Waiting for 2+ players — bots keep this table going.
              </p>
            )}
          </div>
        )}
        {isMyTurn && (
          <>
            {!attentionOpen && attentionAcked && (
              <span className="mr-1 animate-pulse text-sm font-semibold text-[var(--gold-soft)]">
                Your turn — {secondsLeft}s
              </span>
            )}
            <Button disabled={busy} variant="danger" onClick={() => void act("fold")}>
              Fold
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => void act("check")}>
              Check
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => void act("call")}>
              Call
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => void act("allin")}>
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
                onClick={() => void act("raise", Number(raiseTo))}
              >
                Raise
              </Button>
            </div>
          </>
        )}
        {!isMyTurn && !waiting && mySeat && (
          <p className="text-sm text-[var(--muted)]">
            Waiting for {actorName}… ({secondsLeft}s)
          </p>
        )}
      </div>

    </div>
  );
}
