"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import * as Ably from "ably";
import { PlayingCard } from "@/components/playing-card";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge, Button, Input, Label } from "@/components/ui";
import type { PublicTableState } from "@/lib/poker/types";
import { DEFAULT_TURN_SECONDS } from "@/lib/poker/types";
import {
  armAudioUnlock,
  isAudioUnlocked,
  isMuted,
  loadMutePreference,
  onAudioUnlock,
  playSfx,
  setMuted,
  unlockAudio,
} from "@/lib/sounds";
import { getHandHints } from "@/lib/poker/hand-hints";
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

/** Pot chips flying toward a winner's seat / stack. */
type WinFx = {
  id: string;
  amount: number;
  label: string;
  toX: string;
  toY: string;
  delay: number;
};

type DealThrow = {
  id: string;
  toX: string;
  toY: string;
  delay: number;
};

type TableChatBubble = {
  id: string;
  userId: string;
  seat: number;
  text: string;
  name: string;
  createdAt: string;
};

type ConnLevel = "good" | "fair" | "poor" | "offline";

function connectionLevel(online: boolean, fails: number, latencyMs: number | null): ConnLevel {
  if (!online || fails >= 3) return "offline";
  if (fails > 0) return "poor";
  if (latencyMs == null) return "fair";
  if (latencyMs > 2500) return "poor";
  if (latencyMs > 600) return "fair";
  return "good";
}

function ConnectionMeter({
  level,
  latencyMs,
  className,
}: {
  level: ConnLevel;
  latencyMs: number | null;
  className?: string;
}) {
  const label =
    level === "good"
      ? "Good"
      : level === "fair"
        ? "Fair"
        : level === "poor"
          ? "Weak"
          : "Offline";
  const bars = level === "good" ? 3 : level === "fair" ? 2 : level === "poor" ? 1 : 0;
  const detail =
    level === "offline"
      ? "No connection"
      : latencyMs != null
        ? `${latencyMs} ms`
        : "Checking…";

  return (
    <div
      className={cn("conn-meter", `is-${level}`, className)}
      title={`Your connection: ${label} · ${detail}`}
      role="status"
      aria-live="polite"
    >
      <span className="conn-meter-bars" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("conn-bar", n <= bars && "is-on")} />
        ))}
      </span>
      <span className="conn-meter-text">
        <span className="conn-meter-label">Net {label}</span>
        <span className="conn-meter-ms">{detail}</span>
      </span>
    </div>
  );
}

const DEALER_X = "50%";
const DEALER_Y = "40%";
/** Fallback when pot DOM hasn't measured yet (left of center dealer). */
const POT_FALLBACK = { x: "38%", y: "40%" };

type SeatLayout = Record<number, { left: string; top: string }>;

/** Seats on the rail — tucked closer to the felt edge without covering the board. */
const SEAT_LAYOUT: SeatLayout = {
  0: { left: "50%", top: "3%" },
  1: { left: "83%", top: "11%" },
  2: { left: "93%", top: "46%" },
  3: { left: "83%", top: "85%" },
  4: { left: "50%", top: "97%" },
  5: { left: "17%", top: "85%" },
  6: { left: "7%", top: "46%" },
  7: { left: "17%", top: "11%" },
  8: { left: "68%", top: "3%" },
};

/** Phone / fullscreen — seats pulled inward so nodes stay on-screen. */
const SEAT_LAYOUT_MOBILE: SeatLayout = {
  0: { left: "50%", top: "7%" },
  1: { left: "78%", top: "16%" },
  2: { left: "88%", top: "46%" },
  3: { left: "78%", top: "78%" },
  4: { left: "50%", top: "90%" },
  5: { left: "22%", top: "78%" },
  6: { left: "12%", top: "46%" },
  7: { left: "22%", top: "16%" },
  8: { left: "66%", top: "7%" },
};

function isBot(userId: string) {
  return userId.startsWith("bot_");
}

function seatOrigin(seat: number, layout: SeatLayout = SEAT_LAYOUT): { x: string; y: string } {
  const pos = layout[seat] ?? layout[0]!;
  return { x: pos.left, y: pos.top };
}

/** Place bet/call chips between the seat and the pot. */
function seatBetToward(
  seat: number,
  layout: SeatLayout = SEAT_LAYOUT,
): "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw" {
  const pos = layout[seat] ?? layout[0]!;
  const left = Number.parseFloat(pos.left);
  const top = Number.parseFloat(pos.top);
  const dx = 50 - left;
  const dy = 50 - top;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = east toward center from left
  // From seat toward center:
  if (angle >= -22.5 && angle < 22.5) return "e";
  if (angle >= 22.5 && angle < 67.5) return "se";
  if (angle >= 67.5 && angle < 112.5) return "s";
  if (angle >= 112.5 && angle < 157.5) return "sw";
  if (angle >= 157.5 || angle < -157.5) return "w";
  if (angle >= -157.5 && angle < -112.5) return "nw";
  if (angle >= -112.5 && angle < -67.5) return "n";
  return "ne";
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

function ChipPile({
  amount,
  toward = "s",
}: {
  amount: number;
  toward?: ReturnType<typeof seatBetToward>;
}) {
  const count = Math.min(4, Math.max(1, Math.ceil(amount / 15)));
  const tone = chipTone(amount);
  return (
    <div className={cn("seat-bet-stack", `toward-${toward}`)}>
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
  viewerUserId,
  viewerSeat = null,
  preferredSeat = null,
  inviteCode,
  fullscreen = false,
  minBuyIn = 0,
  currency = "CREDITS",
  walletBalance = 0,
  chatEnabled = true,
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
  /** Server-confirmed viewer id (more reliable than waiting on client session) */
  viewerUserId?: string;
  viewerSeat?: number | null;
  preferredSeat?: number | null;
  inviteCode?: string;
  /** Immersive phone / fullscreen play layout */
  fullscreen?: boolean;
  /** Minimum buy-in required to sit (room.buyIn) */
  minBuyIn?: number;
  currency?: string;
  /** Viewer's wallet balance for this room's currency */
  walletBalance?: number;
  /** Whether table chat is enabled (admin toggle) */
  chatEnabled?: boolean;
  onPlayersChanged?: () => void;
  onSitResult?: (msg: string) => void;
}) {
  const { data: session } = useSession();
  const myUserId = viewerUserId || session?.user?.id;
  const [narrow, setNarrow] = useState(false);
  const [state, setState] = useState(initialState);
  const [players, setPlayers] = useState(initialPlayers);

  // Sync state when the parent re-fetches and passes new props (e.g. after leave/sit)
  useEffect(() => {
    setState(initialState);
    setPlayers(initialPlayers);
  }, [initialState, initialPlayers]);

  useEffect(() => {
    setChatOn(chatEnabled);
  }, [chatEnabled]);
  const [raiseTo, setRaiseTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [connFails, setConnFails] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_TURN_SECONDS);
  const [betFx, setBetFx] = useState<BetFx[]>([]);
  const [winFx, setWinFx] = useState<WinFx[]>([]);
  const [potTarget, setPotTarget] = useState(POT_FALLBACK);
  const feltRef = useRef<HTMLDivElement>(null);
  const potAnchorRef = useRef<HTMLDivElement>(null);
  const [dealThrows, setDealThrows] = useState<DealThrow[]>([]);
  const [dealerDealing, setDealerDealing] = useState(false);
  const [holeCardsVisible, setHoleCardsVisible] = useState(true);
  const [muted, setMutedState] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [winnerVisible, setWinnerVisible] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [attentionAcked, setAttentionAcked] = useState(false);
  const [attentionLeaving, setAttentionLeaving] = useState(false);
  const [timeoutNotice, setTimeoutNotice] = useState(false);
  const [chatBubbles, setChatBubbles] = useState<TableChatBubble[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatOn, setChatOn] = useState(chatEnabled);
  const [buyInSeat, setBuyInSeat] = useState<number | null>(null);
  const [buyInAmount, setBuyInAmount] = useState("");
  const [walletLeft, setWalletLeft] = useState(walletBalance);
  const seenChatIds = useRef(new Set<string>());
  const lastActionKey = useRef<string>("");
  const lastHandRef = useRef(0);
  const lastStreetRef = useRef(state.street);
  const lastDealAnimRef = useRef(0);
  const lastWinKey = useRef("");
  const lastTickRef = useRef<number | null>(null);
  const lastTurnKey = useRef<string>("");
  const autoFolding = useRef(false);
  const actingRef = useRef(false);
  const [autoFoldNonce, setAutoFoldNonce] = useState(0);
  /** Full turn clock from when OUR popup opens — not from server turnStartedAt (latency ate that). */
  const localTurnEndsAtRef = useRef<number | null>(null);
  const attentionLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadActableTurn = useRef(false);
  const voluntaryActRef = useRef(false);
  const popupOpenedAtRef = useRef(0);
  const actedAtRef = useRef(0);
  const timeoutNoticeHand = useRef<number | null>(null);

  useEffect(() => {
    // Prefer sound ON; only respect an explicit mute preference
    const wasMuted = loadMutePreference();
    setMutedState(wasMuted);
    if (!wasMuted) setMuted(false);
    setAudioUnlocked(isAudioUnlocked());
    const stopUnlock = armAudioUnlock();
    const stopListen = onAudioUnlock(() => setAudioUnlocked(true));
    return () => {
      stopUnlock();
      stopListen();
    };
  }, []);

  useEffect(() => {
    setWalletLeft(walletBalance);
  }, [walletBalance]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const compact = fullscreen || narrow;
  const seatLayout = compact ? SEAT_LAYOUT_MOBILE : SEAT_LAYOUT;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
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
      const pos = seatOrigin(seat.seat, seatLayout);
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

  // Table ambience for seated players AND spectators watching the room
  useEffect(() => {
    if (state.handNumber > lastHandRef.current && state.street === "preflop" && state.handNumber > 0) {
      playSfx("deal");
      setTimeout(() => playSfx("deal"), 100);
      setTimeout(() => playSfx("deal"), 200);
    }
    lastHandRef.current = state.handNumber;
  }, [state.handNumber, state.street]);

  // Board cards (flop / turn / river)
  useEffect(() => {
    const prev = lastStreetRef.current;
    lastStreetRef.current = state.street;
    if (prev === state.street) return;
    if (state.street === "flop") {
      playSfx("deal");
      setTimeout(() => playSfx("deal"), 90);
    } else if (state.street === "turn" || state.street === "river") {
      playSfx("deal");
    }
  }, [state.street]);

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
    if (key === lastWinKey.current) {
      const hide = setTimeout(() => setWinnerVisible(false), 4800);
      return () => clearTimeout(hide);
    }
    lastWinKey.current = key;
    playSfx("win");
    setWinnerVisible(true);

    // Pot chips fly to each winner's seat with chip clinks.
    const stamp = Date.now();
    const chips: WinFx[] = [];
    const layout = seatLayout;
    state.winners.forEach((w, wi) => {
      const seat = state.seats.find((s) => s.userId === w.userId);
      if (!seat) return;
      const dest = seatOrigin(seat.seat, layout);
      for (let i = 0; i < 5; i++) {
        chips.push({
          id: `win-${key}-${stamp}-${wi}-${i}`,
          amount: w.amount,
          label: i === 0 ? `+${w.amount.toLocaleString()}` : "",
          toX: dest.x,
          toY: dest.y,
          delay: wi * 160 + i * 70,
        });
      }
    });
    if (chips.length) {
      setWinFx((prev) => [...prev, ...chips]);
      [40, 160, 280, 420, 560].forEach((ms) => {
        window.setTimeout(() => playSfx("chip"), ms);
      });
      window.setTimeout(() => {
        setWinFx((prev) => prev.filter((b) => !b.id.includes(`${key}-${stamp}`)));
      }, 1700);
    }

    const hide = setTimeout(() => setWinnerVisible(false), 4800);
    return () => clearTimeout(hide);
  }, [state.winners, state.street, state.handNumber, state.seats, seatLayout]);

  const refreshInflight = useRef<Promise<void> | null>(null);

  const ingestChat = useCallback((msg: TableChatBubble) => {
    if (!msg?.id || seenChatIds.current.has(msg.id)) return;
    const age = Date.now() - new Date(msg.createdAt).getTime();
    if (Number.isFinite(age) && age > 5_500) return;
    seenChatIds.current.add(msg.id);
    setChatBubbles((prev) => [...prev, msg]);
    const remain = Number.isFinite(age) ? Math.max(900, 5_000 - age) : 5_000;
    window.setTimeout(() => {
      setChatBubbles((prev) => prev.filter((b) => b.id !== msg.id));
    }, remain);
  }, []);

  const refresh = useCallback(async (opts?: { tick?: boolean; force?: boolean }) => {
    if (refreshInflight.current && !opts?.force) {
      return refreshInflight.current;
    }

    // Default: light payload + tick (keeps bots/timeouts moving without heavy room loads)
    const doTick = opts?.tick !== false;
    const started = performance.now();
    const run = (async () => {
      try {
        const qs = doTick ? "?light=1" : "?light=1&tick=0";
        const res = await fetch(`/api/rooms/${roomId}${qs}`, { cache: "no-store" });
        const ms = Math.round(performance.now() - started);
        if (!res.ok) {
          setConnFails((n) => n + 1);
          return;
        }
        const json = await readJson<{
          game?: { state?: PublicTableState };
          room?: { players?: RoomPlayer[]; chatEnabled?: boolean };
          chats?: TableChatBubble[];
        }>(res);
        setLatencyMs(Math.min(ms, 9999));
        setConnFails(0);
        if (json.game?.state) setState(json.game.state);
        if (json.room?.players) setPlayers(json.room.players);
        if (typeof json.room?.chatEnabled === "boolean") setChatOn(json.room.chatEnabled);
        if (json.chats?.length) {
          for (const chat of json.chats) ingestChat(chat);
        }
      } catch {
        setConnFails((n) => n + 1);
      }
    })();

    refreshInflight.current = run.finally(() => {
      if (refreshInflight.current === run) refreshInflight.current = null;
    });
    return refreshInflight.current;
  }, [roomId, ingestChat]);

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
          client = new Ably.Realtime({
            authCallback: (_, cb) => cb(null, tokenJson.tokenRequest as Ably.TokenRequest),
          });
          const channel = client.channels.get(`room:${roomId}`);
          // Ably = state already saved — load only, no re-tick (avoids echo storms)
          channel.subscribe("state", () => {
            void refresh({ tick: false });
          });
          channel.subscribe("chat", (message) => {
            const data = message.data as TableChatBubble;
            if (data?.id) ingestChat(data);
          });
          poll = setInterval(() => {
            void refresh({ tick: true });
          }, 700);
          return;
        }
      } catch {
        // Fall through to polling
      }
      if (cancelled) return;
      poll = setInterval(() => {
        void refresh({ tick: true });
      }, 750);
    }

    void setup();
    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      client?.close();
    };
  }, [roomId, refresh, ingestChat]);

  const mySeat = useMemo(() => {
    if (!myUserId) return undefined;
    return state.seats.find((s) => s.userId === myUserId);
  }, [state.seats, myUserId]);

  const mySeatIndex =
    mySeat?.seat ??
    viewerSeat ??
    players.find((p) => p.userId === myUserId)?.seat;

  const tipAmount = Math.max(1, state.smallBlind || 1);
  const callAmount = Math.max(0, (state.currentBet || 0) - (mySeat?.bet || 0));
  const canCheck = callAmount <= 0;

  const isMyTurn = mySeat != null && state.actionSeat === mySeat.seat;
  const seatedCount = Math.max(state.seats.length, players.length);
  const waiting = state.street === "waiting" || state.street === "complete";
  const turnSeconds = state.turnSeconds || DEFAULT_TURN_SECONDS;
  const [holdNow, setHoldNow] = useState(() => Date.now());
  useEffect(() => {
    if (state.streetHoldUntil == null) return;
    if (Date.now() >= state.streetHoldUntil) {
      setHoldNow(Date.now());
      return;
    }
    const id = window.setInterval(() => setHoldNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [state.streetHoldUntil]);
  const dealingHold =
    state.streetHoldUntil != null && holdNow < state.streetHoldUntil;
  const canActNow = isMyTurn && !waiting && !dealingHold && state.turnStartedAt != null;
  const turnKey =
    isMyTurn && !waiting && state.turnStartedAt && !dealingHold
      ? `${state.handNumber}-${state.street}-${state.actionSeat}-${state.turnStartedAt}`
      : "";
  const attentionUrgent = canActNow && secondsLeft <= 5;

  const livePot = useMemo(
    () => state.pot + state.seats.reduce((sum, s) => sum + (s.bet || 0), 0),
    [state.pot, state.seats],
  );

  const measurePotTarget = useCallback(() => {
    const felt = feltRef.current;
    const anchor = potAnchorRef.current;
    if (!felt || !anchor) return;
    const fr = felt.getBoundingClientRect();
    const pr = anchor.getBoundingClientRect();
    if (fr.width < 8 || fr.height < 8) return;
    const x = ((pr.left + pr.width / 2 - fr.left) / fr.width) * 100;
    const y = ((pr.top + pr.height / 2 - fr.top) / fr.height) * 100;
    setPotTarget({
      x: `${Math.min(95, Math.max(5, x)).toFixed(2)}%`,
      y: `${Math.min(95, Math.max(5, y)).toFixed(2)}%`,
    });
  }, []);

  useLayoutEffect(() => {
    measurePotTarget();
  }, [measurePotTarget, livePot, dealerDealing, state.street, state.handNumber]);

  useEffect(() => {
    const onResize = () => measurePotTarget();
    window.addEventListener("resize", onResize);
    const id = window.setInterval(measurePotTarget, 800);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearInterval(id);
    };
  }, [measurePotTarget]);

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

  // Countdown: for OUR turn use a local deadline started when the popup opens
  // (server turnStartedAt is often already half-spent by the time UI learns it's our turn).
  // For everyone else, still show the server clock.
  useEffect(() => {
    if (waiting || state.actionSeat == null) {
      setSecondsLeft(turnSeconds);
      return;
    }

    const tick = () => {
      // If we already acted, freeze the timer display at the value when we clicked
      if (actingRef.current && actedAtRef.current > 0) {
        setSecondsLeft(actedAtRef.current);
        return;
      }
      if (canActNow && localTurnEndsAtRef.current != null) {
        setSecondsLeft(Math.max(0, Math.ceil((localTurnEndsAtRef.current - Date.now()) / 1000)));
        return;
      }
      if (!state.turnStartedAt) {
        setSecondsLeft(turnSeconds);
        return;
      }
      const elapsed = Math.floor((Date.now() - state.turnStartedAt) / 1000);
      setSecondsLeft(Math.max(0, turnSeconds - elapsed));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [state.actionSeat, state.turnStartedAt, state.handNumber, turnSeconds, waiting, canActNow]);

  // Fade away status hints so floating felt text doesn’t linger
  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => setHint(null), 4500);
    return () => window.clearTimeout(id);
  }, [hint]);

  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(id);
  }, [error]);

  // Timer stuck at 0 — force server ticks so turn timeouts / bots keep moving.
  // Also runs on our own turn (safety net if client auto-fold fails).
  useEffect(() => {
    if (waiting || secondsLeft > 0 || state.actionSeat == null) return;
    const id = setInterval(() => {
      void refresh({ tick: true, force: true });
    }, 500);
    void refresh({ tick: true, force: true });
    return () => clearInterval(id);
  }, [secondsLeft, waiting, state.actionSeat, refresh]);

  // Force server ticks when the hand is complete (winner shown) but next hand
  // hasn't dealt yet — the stuck-timer effect above doesn't fire when waiting.
  useEffect(() => {
    if (!waiting || seatedCount < 2) return;
    const id = setInterval(() => {
      void refresh({ tick: true, force: true });
    }, 800);
    void refresh({ tick: true, force: true });
    return () => clearInterval(id);
  }, [waiting, seatedCount, refresh]);

  // Chips fly + action SFX for everyone watching (seated or spectator)
  useEffect(() => {
    const action = state.lastAction;
    if (!action) return;
    const key = `${state.handNumber}-${action.userId}-${action.action}-${action.amount ?? 0}-${state.street}`;
    if (key === lastActionKey.current) return;
    lastActionKey.current = key;

    if (action.action === "fold") playSfx("fold");
    else if (action.action === "check") playSfx("check");
    else if (["bet", "raise", "call", "allin"].includes(action.action)) playSfx("chip");

    const moneyActions = new Set(["bet", "raise", "call", "allin"]);
    if (!moneyActions.has(action.action) || !(action.amount && action.amount > 0)) return;

    const seat = state.seats.find((s) => s.userId === action.userId);
    if (!seat) return;
    const origin = seatOrigin(seat.seat, seatLayout);
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
      setAttentionOpen(true);
      attentionLeaveTimer.current = setTimeout(() => {
        setAttentionOpen(false);
        setAttentionLeaving(false);
        setTimeoutNotice(false);
        setAttentionAcked(false);
      }, 2200);
      return;
    }
    setAttentionOpen(false);
    setAttentionLeaving(false);
    setTimeoutNotice(false);
  }

  function acknowledgeAttention() {
    void unlockAudio();
    playSfx("click");
    setAttentionAcked(true);
    // Keep popup open — only stops the repeating alert
  }

  async function act(action: string, amount?: number, fromSystem = false) {
    void unlockAudio();
    if (!fromSystem && dealingHold) {
      setError("Wait — cards are still being dealt");
      return;
    }
    if (!fromSystem) actingRef.current = true;
    setBusy(true);
    // Freeze the timer at its current value — the click already went through
    setSecondsLeft((prev) => {
      actedAtRef.current = prev;
      return prev;
    });
    setError(null);
    setHint(null);
    if (!fromSystem) voluntaryActRef.current = true;
    try {
      const res = await fetch(`/api/rooms/${roomId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amount }),
      });
      const json = await readJson<{ error?: string; state?: PublicTableState }>(res);
      if (!res.ok) {
        const msg = json.error || "Action failed";
        if (!fromSystem && /still dealing/i.test(msg)) {
          actingRef.current = false;
          await new Promise((r) => setTimeout(r, 400));
          const retry = await fetch(`/api/rooms/${roomId}/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, amount }),
          });
          const retryJson = await readJson<{ error?: string; state?: PublicTableState }>(retry);
          if (!retry.ok) throw new Error(retryJson.error || msg);
          if (retryJson.state) setState(retryJson.state);
          dismissAttention();
          setAttentionAcked(false);
          return;
        }
        if (!fromSystem) voluntaryActRef.current = false;
        throw new Error(msg);
      }
      if (json.state) setState(json.state);
      if (fromSystem && action === "fold") {
        setHint("Time’s up — you were folded by the system.");
        dismissAttention({ timeout: true });
      } else {
        dismissAttention();
        setAttentionAcked(false);
      }
      void refresh({ tick: false });
    } catch (e) {
      if (fromSystem) {
        // Don't lock the UI on "Timed out" if the fold request failed —
        // force a server tick so enforceTurnTimeout can finish the turn.
        setTimeoutNotice(false);
        setHint("Time’s up — syncing with table…");
        void refresh({ tick: true, force: true });
        // Re-trigger the auto-fold effect after a short delay (max ~3 attempts)
        if (autoFoldNonce < 3) {
          window.setTimeout(() => setAutoFoldNonce((n) => n + 1), 700);
        }
      } else {
        setError(e instanceof Error ? e.message : "Action failed");
      }
    } finally {
      setBusy(false);
      autoFolding.current = false;
      actingRef.current = false;
    }
  }

  async function tipTheDealer() {
    if (!mySeat || busy) return;
    void unlockAudio();
    playSfx("chip");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: tipAmount }),
      });
      const json = await readJson<{ error?: string; tip?: number; state?: PublicTableState }>(
        res,
      );
      if (!res.ok) throw new Error(json.error || "Tip failed");
      if (json.state) setState(json.state);
      playSfx("win");
      setHint(`Thanks! Dealer tip +${json.tip ?? tipAmount}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tip failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleMute() {
    void unlockAudio();
    const next = !isMuted();
    setMuted(next);
    setMutedState(next);
    if (!next) {
      playSfx("click");
      setTimeout(() => playSfx("chip"), 80);
    }
  }

  async function enableTableSound() {
    setMuted(false);
    setMutedState(false);
    await unlockAudio();
    setAudioUnlocked(isAudioUnlocked());
    playSfx("click");
    setTimeout(() => playSfx("chip"), 80);
  }

  async function sendChat(e?: FormEvent) {
    e?.preventDefault();
    if (!mySeat || chatBusy) return;
    const text = chatText.trim();
    if (!text) return;
    setChatBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await readJson<{ error?: string; message?: TableChatBubble }>(res);
      if (!res.ok) throw new Error(json.error || "Chat failed");
      if (json.message) ingestChat(json.message);
      setChatText("");
      playSfx("click");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setChatBusy(false);
    }
  }

  // Your turn: always open action popup + alert
  useEffect(() => {
    if (timeoutNotice || attentionLeaving) return;
    if (canActNow) {
      hadActableTurn.current = true;
      if (turnKey && turnKey !== lastTurnKey.current) {
        lastTurnKey.current = turnKey;
        voluntaryActRef.current = false;
        setAutoFoldNonce(0);
        setAttentionAcked(false);
        setAttentionOpen(true);
        popupOpenedAtRef.current = Date.now();
        // Always grant a full turn from the moment the player can see the buttons
        localTurnEndsAtRef.current = Date.now() + turnSeconds * 1000;
        setSecondsLeft(turnSeconds);
        void unlockAudio();
        playSfx("alert");
      } else if (!attentionOpen) {
        setAttentionOpen(true);
        popupOpenedAtRef.current = Date.now();
        if (localTurnEndsAtRef.current == null) {
          localTurnEndsAtRef.current = Date.now() + turnSeconds * 1000;
          setSecondsLeft(turnSeconds);
        }
        void unlockAudio();
        playSfx("alert");
      }
      return;
    }

    if (!isMyTurn) {
      localTurnEndsAtRef.current = null;
    }

    // Server/client folded you after an actable turn — show timeout popup
    if (
      hadActableTurn.current &&
      !voluntaryActRef.current &&
      mySeat?.folded &&
      timeoutNoticeHand.current !== state.handNumber
    ) {
      timeoutNoticeHand.current = state.handNumber;
      hadActableTurn.current = false;
      playSfx("timeout");
      setHint("Time’s up — you were folded by the system.");
      dismissAttention({ timeout: true });
      return;
    }

    if (hadActableTurn.current && !isMyTurn) {
      hadActableTurn.current = false;
    }
    if (!timeoutNotice && !attentionLeaving) {
      setAttentionOpen(false);
      setAttentionAcked(false);
    }
  }, [
    canActNow,
    isMyTurn,
    turnKey,
    attentionOpen,
    timeoutNotice,
    attentionLeaving,
    mySeat?.folded,
    state.handNumber,
  ]);

  // Auto-fold only after the LOCAL full turn expires (started when popup opened).
  // Never fold from a near-zero server clock the moment the popup appears.
  useEffect(() => {
    if (!canActNow || secondsLeft > 0 || busy || autoFolding.current || actingRef.current) {
      return;
    }
    // Require the popup to have been open for nearly a full turn
    const openedFor = attentionOpen ? Date.now() - popupOpenedAtRef.current : 0;
    const minOpenMs = Math.max(3000, turnSeconds * 1000 - 500);
    if (openedFor < minOpenMs) {
      const id = window.setTimeout(() => setAutoFoldNonce((n) => n + 1), minOpenMs - openedFor);
      return () => clearTimeout(id);
    }

    autoFolding.current = true;
    setTimeoutNotice(true);
    setAttentionLeaving(false);
    setAttentionOpen(true);
    setHint("Time’s up — auto-folding…");
    playSfx("timeout");
    void act("fold", undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, canActNow, busy, attentionOpen, autoFoldNonce, turnSeconds]);

  // Repeat alert until muted or turn ends / timed out
  useEffect(() => {
    if (!canActNow || attentionAcked || !attentionOpen || timeoutNotice) return;
    const id = setInterval(() => {
      playSfx("alert");
    }, attentionUrgent ? 1800 : 3200);
    return () => clearInterval(id);
  }, [canActNow, attentionAcked, attentionOpen, timeoutNotice, attentionUrgent]);

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
      if (!res.ok) throw new Error(json.error || "Could not add opponent");
      setHint(`${json.bot?.name ?? "Player"} sat down.`);
      await refresh();
      onPlayersChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add opponent");
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

  function openBuyIn(seatIndex: number) {
    if (!canSit || busy) return;
    unlockAudio();
    playSfx("click");
    const floor = Math.max(0, minBuyIn);
    setBuyInSeat(seatIndex);
    setBuyInAmount(String(floor));
    setError(null);
  }

  async function confirmBuyIn(e?: FormEvent) {
    e?.preventDefault();
    if (buyInSeat == null || busy) return;
    const floor = Math.max(0, minBuyIn);
    const amount = Math.round(Number(buyInAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < floor) {
      setError(`Buy-in must be at least ${floor} ${currency}`);
      return;
    }
    if (amount > walletLeft) {
      setError(`Insufficient balance (have ${walletLeft})`);
      return;
    }
    const seatIndex = buyInSeat;
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
          buyInAmount: amount,
        }),
      });
      const json = await readJson<{
        error?: string;
        seated?: boolean;
        message?: string;
      }>(res);
      if (!res.ok) throw new Error(json.error || "Could not sit");
      const msg = json.seated
        ? `You sat at seat ${seatIndex + 1} with ${amount} ${currency}.`
        : json.message ||
          `Seat ${seatIndex + 1} reserved — you join when this hand ends.`;
      // Close modal immediately — don't wait on table refresh / room reload
      setBuyInSeat(null);
      setBusy(false);
      setHint(msg);
      onSitResult?.(msg);
      setWalletLeft((w) => Math.max(0, w - amount));
      void refresh({ tick: false, force: true }).then(() => {
        onPlayersChanged?.();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sit");
      setBusy(false);
    }
  }

  const nameFor = (userId: string) => {
    if (myUserId && userId === myUserId) {
      return (
        session?.user?.name ||
        players.find((p) => p.userId === userId)?.user.name ||
        players.find((p) => p.userId === userId)?.user.email ||
        "You"
      );
    }
    return (
      players.find((p) => p.userId === userId)?.user.name ||
      players.find((p) => p.userId === userId)?.user.email ||
      (isBot(userId) ? "Player" : userId.slice(0, 6))
    );
  };

  const occupiedSeats = useMemo(() => {
    const map = new Map<number, PublicTableState["seats"][number]>();
    const seenUsers = new Set<string>();

    for (const s of state.seats) {
      map.set(s.seat, s);
      seenUsers.add(s.userId);
    }

    // Room roster is source of truth for who belongs at the table
    for (const p of players) {
      if (seenUsers.has(p.userId)) {
        // Keep live seat but ensure seat index matches roster
        const live = [...map.values()].find((s) => s.userId === p.userId);
        if (live && live.seat !== p.seat) {
          map.delete(live.seat);
          map.set(p.seat, { ...live, seat: p.seat });
        }
        continue;
      }
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
      seenUsers.add(p.userId);
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
  const showPot = (!showWinner || winFx.length > 0) && livePot > 0;
  const connLevel = connectionLevel(online, connFails, latencyMs);

  const myHoleCards = useMemo(() => {
    if (!mySeat || !holeCardsVisible) return [] as string[];
    const cards = mySeat.holeCards as string[];
    if (!cards?.length) return [];
    if (cards.every((c) => c === "hidden")) return [];
    return cards.filter((c) => c !== "hidden");
  }, [mySeat, holeCardsVisible]);

  const handHints = useMemo(
    () => (myHoleCards.length >= 2 ? getHandHints(myHoleCards, state.community) : null),
    [myHoleCards, state.community],
  );

  return (
    <div
      className={cn(
        "poker-shell space-y-3",
        compact && "is-compact",
        fullscreen && "is-fullscreen",
      )}
    >
      <div className="poker-chrome flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge>{state.street.toUpperCase()}</Badge>
          <Badge tone="muted">Hand #{state.handNumber}</Badge>
          {!compact && <Badge tone="muted">{seatedCount} seated</Badge>}
          {!compact && state.rakePercent > 0 && (
            <Badge tone="gold">Rake {state.rakePercent}%</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && !compact && (
            <>
              <Button
                disabled={busy || seatedCount >= maxPlayers}
                onClick={addBot}
                variant="ghost"
                className="!px-3 !py-2 text-xs"
                title={
                  waiting
                    ? "Add a bot to an open seat"
                    : "Add a bot (joins when this hand ends if mid-hand)"
                }
              >
                Fill empty seat
              </Button>
              {waiting && seatedCount >= 2 && (
                <Button
                  disabled={busy}
                  onClick={() => void act("start")}
                  variant="ghost"
                  className="!px-3 !py-2 text-xs"
                >
                  Deal now
                </Button>
              )}
            </>
          )}
          <Button
            variant={muted ? "ghost" : "felt"}
            className="!px-3 !py-2 text-xs"
            onClick={() => {
              if (muted) {
                void enableTableSound();
              } else {
                void unlockAudio();
                toggleMute();
              }
            }}
            title={
              muted
                ? "Unmute table sounds"
                : audioUnlocked
                  ? "Mute table sounds"
                  : "Sound is on — tap once if your browser blocked audio"
            }
          >
            {muted ? "🔇" : "🔊"}
            {!compact && (muted ? " Sound off" : " Sound on")}
          </Button>
          {!waiting && state.actionSeat != null && (
            <>
              <span className="text-sm text-[var(--muted)]">
                {dealingHold
                  ? "Dealing…"
                  : isMyTurn
                    ? "Your turn"
                    : `${actorName}'s turn`}
              </span>
              {!dealingHold && state.turnStartedAt != null && (
                <TurnTimer secondsLeft={secondsLeft} total={turnSeconds} />
              )}
            </>
          )}
        </div>
      </div>

      {waiting && seatedCount < 2 && !compact && (
        <div className="rounded-xl border border-[rgba(212,168,83,0.35)] bg-[rgba(212,168,83,0.08)] px-4 py-3 text-sm">
          Texas Hold&apos;em needs <strong>2+ players</strong>. The table auto-deals when ready.
        </div>
      )}

      {canActNow ? (
        <div
          className={cn(
            "table-action-dock is-your-turn",
            compact && "is-mobile-sticky",
            attentionUrgent && "is-urgent",
          )}
          role="region"
          aria-label="Your turn actions"
        >
          <div className="action-dock-head">
            <div className="action-dock-meta">
              <span className="action-dock-eyebrow">
                {attentionUrgent ? "Hurry" : "Your turn"}
              </span>
              <span className="action-dock-title">
                {canCheck ? "Check or bet" : `Call ${callAmount}`}
              </span>
              <span className="action-dock-timer-label">{secondsLeft}s left</span>
            </div>
            <TurnTimer secondsLeft={secondsLeft} total={turnSeconds} />
          </div>
          <div className="action-bar">
            <Button disabled={busy} variant="danger" onClick={() => void act("fold")}>
              Fold
            </Button>
            {canCheck ? (
              <Button disabled={busy} variant="ghost" onClick={() => void act("check")}>
                Check
              </Button>
            ) : (
              <Button disabled={busy} variant="felt" onClick={() => void act("call")}>
                Call {callAmount}
              </Button>
            )}
            <Button disabled={busy} variant="ghost" onClick={() => void act("allin")}>
              All-in
            </Button>
            <div className="raise-row">
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
              {!attentionAcked && (
                <Button disabled={busy} variant="ghost" onClick={acknowledgeAttention}>
                  Mute alerts
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {timeoutNotice && (
        <div className={cn("action-toast", attentionLeaving && "is-leaving")} role="status">
          <strong>Timed out</strong>
          <span>Time ran out — you were folded.</span>
        </div>
      )}

      <div className="table-stage relative mx-auto w-full max-w-7xl">
        <ConnectionMeter
          level={connLevel}
          latencyMs={latencyMs}
          className="conn-meter-on-table"
        />
        <div className="table-stage-row">
        <div className="table-felt-wrap relative mx-auto w-full max-w-4xl">
          <div ref={feltRef} className="felt-table absolute inset-0 overflow-hidden rounded-[999px]">
        {/* Center stack: lady + brand + board share one axis; pot/tip float beside lady */}
        <div className="felt-center-stack">
          <div className="dealer-anchor pointer-events-auto">
            <div ref={potAnchorRef} className="pot-fly-target" aria-hidden />
            {(showPot || livePot > 0 || winFx.length > 0) && (
              <div
                key={`pot-${state.handNumber}`}
                className={cn("pot-beside animate-pot", winFx.length > 0 && "is-collecting")}
              >
                <div className="chip-stack chip-stack-sm">
                  {Array.from({
                    length: Math.min(4, Math.max(1, Math.ceil(livePot / 25))),
                  }).map((_, i) => (
                    <div
                      key={i}
                      className={cn("poker-chip", `is-${chipTone(livePot)}`)}
                      style={{ marginLeft: i % 2 === 0 ? 0 : 4 }}
                    >
                      <span>{livePot >= 100 ? "100" : livePot >= 25 ? "25" : "10"}</span>
                    </div>
                  ))}
                </div>
                <div className="pot-beside-meta">
                  <span className="pot-beside-label">Pot</span>
                  <span className="pot-beside-value">{livePot.toLocaleString()}</span>
                </div>
              </div>
            )}

            <div className={cn("dealer-figure", dealerDealing && "is-dealing")}>
              <div className="dealer-avatar" title="Dealer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/dealer-lady.png"
                  alt="Dealer"
                  className="dealer-lady-img"
                  draggable={false}
                />
                {dealerDealing && <span className="dealer-deck" aria-hidden />}
              </div>
              {dealerDealing && <div className="dealer-status">Dealing…</div>}
            </div>

            <button
              type="button"
              className="tip-dealer-btn"
              disabled={busy || !mySeat || (mySeat.stack ?? 0) < tipAmount}
              title={
                mySeat
                  ? `Tip the dealer ${tipAmount} from your stack`
                  : "Sit at the table to tip the dealer"
              }
              onClick={() => void tipTheDealer()}
            >
              <span className="tip-dealer-eyebrow">Tip the dealer</span>
              <span className="tip-dealer-amount">+{tipAmount}</span>
            </button>
          </div>

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

          {(error ||
            hint ||
            dealingHold ||
            (waiting && seatedCount < 2) ||
            (waiting && seatedCount >= 2) ||
            (!isMyTurn && !waiting && mySeat && !dealingHold) ||
            (isMyTurn && !dealingHold && !state.turnStartedAt)) && (
            <div className="felt-status" role="status" aria-live="polite">
              {(error || hint) && (
                <div className={cn("felt-status-line is-primary", error && "is-error")}>
                  {error || hint}
                </div>
              )}
              {dealingHold && mySeat ? (
                <div className="felt-status-line">Dealing cards…</div>
              ) : isMyTurn && !dealingHold && !state.turnStartedAt ? (
                <div className="felt-status-line">Your turn starts when dealing finishes…</div>
              ) : !isMyTurn && !waiting && mySeat ? (
                <div className="felt-status-line">
                  Waiting for {actorName}… ({secondsLeft}s)
                </div>
              ) : waiting && seatedCount < 2 ? (
                <div className="felt-status-line">Waiting for 2+ players…</div>
              ) : waiting && seatedCount >= 2 ? (
                <div className="felt-status-line">Auto-dealing when ready…</div>
              ) : null}
            </div>
          )}
        </div>

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
                "--to-x": potTarget.x,
                "--to-y": potTarget.y,
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

        {/* Pot chips flying to winner seats */}
        {winFx.map((fx) => (
          <div
            key={fx.id}
            className="pot-to-winner"
            style={
              {
                "--from-x": potTarget.x,
                "--from-y": potTarget.y,
                "--to-x": fx.toX,
                "--to-y": fx.toY,
                animationDelay: `${fx.delay}ms`,
              } as React.CSSProperties
            }
          >
            {fx.label ? (
              <div className="rounded-full border border-[rgba(212,168,83,0.7)] bg-gradient-to-b from-[#5a4018] to-[#1a1208] px-3 py-1.5 text-center shadow-[0_10px_24px_rgba(0,0,0,0.5)]">
                <div className="text-[9px] uppercase tracking-wider text-[var(--muted)]">Win</div>
                <div className="text-sm font-bold text-[var(--gold-soft)]">{fx.label}</div>
              </div>
            ) : (
              <div className="h-5 w-5 rounded-full border border-[rgba(212,168,83,0.65)] bg-[radial-gradient(circle_at_35%_30%,#f0d59a,#b8892d_55%,#6a4a14)] shadow-md" />
            )}
          </div>
        ))}

        {/* Seats overlay matches felt size; overflow visible so chips are not clipped */}
        </div>
        <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
        {seatSlots.map((seatIndex) => {
          const seat = occupiedSeats.get(seatIndex);
          const pos = seatLayout[seatIndex] ?? seatLayout[seatIndex % 9]!;
          const reservedHere = preferredSeat === seatIndex;
          const isMe = Boolean(seat && myUserId && seat.userId === myUserId);

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
                  onClick={() => openBuyIn(seatIndex)}
                  className={cn("seat-empty-classic", reservedHere && "is-reserved")}
                  title={
                    canSit
                      ? reservedHere
                        ? "Your reserved seat"
                        : !waiting
                          ? "Join here — sits when this hand ends"
                          : "Sit at this open seat"
                      : mySeatIndex != null
                        ? `You are already at seat ${mySeatIndex + 1}`
                        : "You are already seated"
                  }
                >
                  <span className="seat-empty-icon" aria-hidden>
                    ♣
                  </span>
                  <span className="seat-empty-label">
                    {reservedHere ? "Yours" : "Open"}
                  </span>
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
          const seatChat = chatBubbles.filter((b) => b.userId === seat.userId).slice(-1)[0];
          const bubbleSide =
            Number.parseFloat(pos.left) >= 50 ? "right" : "left";

          return (
            <div
              key={seat.userId}
              className={cn(
                "seat-on-rail seat-node absolute -translate-x-1/2 -translate-y-1/2",
                active && !showWinner && "is-active",
                isWinner && "is-winner",
                seat.folded && "is-folded",
                isMe && "is-me",
              )}
              style={{ left: pos.left, top: pos.top }}
            >
              {isMe && !seat.folded && <div className="seat-you-badge">You</div>}
              {isMe && seat.folded && state.street !== "waiting" && !showWinner && (
                <div className="seat-you-badge seat-you-badge-fold">Folded</div>
              )}
              {(seat.lastAction || seat.folded || seat.allIn) &&
                !showWinner &&
                state.street !== "waiting" &&
                !(isMe && seat.folded) && (
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
                {seatChat && (
                  <div
                    className={cn("seat-chat-bubble", `is-${bubbleSide}`)}
                    key={seatChat.id}
                    role="status"
                  >
                    {seatChat.text}
                  </div>
                )}
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
                  {isMe ? "You" : displayName}
                </div>
                <div className="seat-nameplate-stack">{seat.stack.toLocaleString()}</div>
                {seat.folded && state.street !== "waiting" && !showWinner && (
                  <div className="seat-fold-tag">Folded</div>
                )}
              </div>

              {active && !waiting && !showWinner && (
                <span className="seat-timer-slot">
                  <TurnTimer secondsLeft={secondsLeft} total={turnSeconds} />
                </span>
              )}

              {seat.bet > 0 && !(seat.lastAction === "check" || seat.lastAction === "fold") && (
                <ChipPile amount={seat.bet} toward={seatBetToward(seat.seat, seatLayout)} />
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

        {myHoleCards.length >= 2 && handHints ? (
          <div className="hero-hand-slot">
            <aside className="hero-hand-panel" aria-label="Your hand">
              <div className="hero-hand-cards">
                {myHoleCards.map((card, i) => (
                  <PlayingCard
                    key={`hero-${state.handNumber}-${i}-${card}`}
                    card={card}
                    delayMs={i * 80}
                    className="hero-hole-card"
                  />
                ))}
              </div>
              <div className="hero-hand-copy">
                <div className="hero-hand-eyebrow">Your hand</div>
                <div className="hero-hand-current">{handHints.current}</div>
                {handHints.possibles.length > 0 && (
                  <ul className="hero-hand-possibles">
                    {handHints.possibles.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        ) : (
          <div className="hero-hand-slot" aria-hidden />
        )}
        </div>
      </div>

      {mySeat && chatOn ? (
        <form className="table-chat-dock" onSubmit={(e) => void sendChat(e)}>
          <Input
            value={chatText}
            maxLength={80}
            placeholder="Table chat…"
            className="table-chat-input"
            onChange={(e) => setChatText(e.target.value)}
            disabled={chatBusy}
            aria-label="Table chat message"
          />
          <Button type="submit" disabled={chatBusy || !chatText.trim()} className="!px-3 !py-2 text-xs">
            Send
          </Button>
        </form>
      ) : null}

      {buyInSeat != null && (
        <div className="buyin-overlay" role="presentation" onClick={() => !busy && setBuyInSeat(null)}>
          <form
            className="buyin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="buyin-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void confirmBuyIn(e)}
          >
            <div className="buyin-eyebrow">Seat {buyInSeat + 1}</div>
            <h2 id="buyin-title" className="buyin-title">
              Choose buy-in
            </h2>
            <p className="buyin-copy">
              Minimum {minBuyIn.toLocaleString()} {currency}. Balance{" "}
              {walletLeft.toLocaleString()} {currency}.
            </p>
            <div className="buyin-presets">
              <button
                type="button"
                className="buyin-preset"
                onClick={() => setBuyInAmount(String(minBuyIn))}
              >
                Min
              </button>
              <button
                type="button"
                className="buyin-preset"
                onClick={() =>
                  setBuyInAmount(
                    String(
                      Math.max(
                        minBuyIn,
                        Math.floor(Math.min(walletLeft, minBuyIn * 2) * 100) / 100,
                      ),
                    ),
                  )
                }
              >
                2× min
              </button>
              <button
                type="button"
                className="buyin-preset"
                onClick={() =>
                  setBuyInAmount(String(Math.max(minBuyIn, Math.floor(walletLeft * 100) / 100)))
                }
              >
                Max
              </button>
            </div>
            <Label htmlFor="buyin-amount">Amount</Label>
            <Input
              id="buyin-amount"
              inputMode="decimal"
              value={buyInAmount}
              onChange={(e) => setBuyInAmount(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <div className="buyin-actions">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setBuyInSeat(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || walletLeft < minBuyIn}>
                {busy ? "…" : "Sit down"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
