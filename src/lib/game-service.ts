import { prisma } from "@/lib/prisma";
import { publishRoomEvent } from "@/lib/ably";
import {
  applyAction,
  createWaitingState,
  continueCommunityDealIfReady,
  continueRunoutIfReady,
  forceFold,
  startHand,
  toPublicState,
} from "@/lib/poker/engine";
import { decideBotAction, isBotUserId, botThinkMs } from "@/lib/poker/bot";
import type { PlayerAction, PokerTableState } from "@/lib/poker/types";
import { DEFAULT_TURN_SECONDS } from "@/lib/poker/types";
import { toNumber } from "@/lib/utils";
import { Prisma } from "@prisma/client";

async function afterHandRoster(roomId: string, prev: PokerTableState, next: PokerTableState) {
  if (prev.street !== "complete" && next.street === "complete") {
    const { reconcileTableRoster } = await import("@/lib/table-roster");
    await reconcileTableRoster(roomId);
  }
}

export async function getPlatformSettings() {
  return prisma.platformSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      defaultRakePercent: 5,
      defaultRakeCap: 3,
      houseBalances: {},
    },
  });
}

export async function loadTableState(roomId: string): Promise<PokerTableState | null> {
  const row = await prisma.gameState.findUnique({ where: { roomId } });
  if (!row) return null;
  const state = row.state as unknown as PokerTableState;
  // Backfill fields for older saved states
  if (state.rakePercent == null) state.rakePercent = 0;
  if (state.rakeCap == null) state.rakeCap = 0;
  if (state.rakeTaken == null) state.rakeTaken = 0;
  if (state.turnSeconds == null) state.turnSeconds = DEFAULT_TURN_SECONDS;
  if (state.turnStartedAt === undefined) state.turnStartedAt = null;
  if (state.streetHoldUntil === undefined) state.streetHoldUntil = null;
  if (state.pendingCommunityDeals == null) state.pendingCommunityDeals = 0;
  if (state.botSkillPercent == null) state.botSkillPercent = 50;
  for (const seat of state.seats ?? []) {
    if (seat.lastAction === undefined) {
      seat.lastAction = seat.folded ? "fold" : seat.allIn ? "allin" : null;
    }
  }
  // Resume clock if an older state has an actor but no timestamp
  if (state.actionSeat != null && state.turnStartedAt == null) {
    state.turnStartedAt = Date.now();
  }
  return state;
}

export async function saveTableState(roomId: string, state: PokerTableState) {
  const saved = await prisma.gameState.upsert({
    where: { roomId },
    create: {
      roomId,
      state: state as unknown as Prisma.InputJsonValue,
      version: 1,
    },
    update: {
      state: state as unknown as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });

  await syncStacksToDb(roomId, state);
  await publishRoomEvent(roomId, "state", {
    version: saved.version,
    updatedAt: saved.updatedAt.toISOString(),
  });

  return saved;
}

async function syncStacksToDb(roomId: string, state: PokerTableState) {
  await Promise.all(
    state.seats.map((seat) =>
      prisma.roomPlayer.updateMany({
        where: { roomId, userId: seat.userId },
        data: {
          stack: new Prisma.Decimal(seat.stack),
          status: seat.folded
            ? "FOLDED"
            : seat.allIn
              ? "ALL_IN"
              : seat.sittingOut
                ? "SITTING_OUT"
                : "SEATED",
        },
      }),
    ),
  );
}

async function recordRakeIfNeeded(roomId: string, prev: PokerTableState, next: PokerTableState) {
  if (!(prev.street !== "complete" && next.street === "complete" && next.rakeTaken > 0)) {
    return;
  }

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.type !== "REAL") return;

  const settings = await getPlatformSettings();
  const balances = (settings.houseBalances ?? {}) as Record<string, number>;
  const currency = room.currency;
  balances[currency] = Number(((balances[currency] ?? 0) + next.rakeTaken).toFixed(2));

  await prisma.$transaction([
    prisma.rakeEvent.create({
      data: {
        roomId,
        handNumber: next.handNumber,
        amount: new Prisma.Decimal(next.rakeTaken),
        currency,
      },
    }),
    prisma.platformSettings.update({
      where: { id: "default" },
      data: { houseBalances: balances },
    }),
  ]);
}

export async function ensureGameState(roomId: string) {
  const existing = await loadTableState(roomId);
  if (existing) return existing;

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: { orderBy: { seat: "asc" } } },
  });
  if (!room) throw new Error("Room not found");

  const state = createWaitingState(
    roomId,
    room.players.map((p) => ({
      userId: p.userId,
      seat: p.seat,
      stack: toNumber(p.stack),
    })),
    toNumber(room.smallBlind),
    toNumber(room.bigBlind),
    {
      percent: room.type === "REAL" ? toNumber(room.rakePercent) : 0,
      cap: room.type === "REAL" ? toNumber(room.rakeCap) : 0,
    },
  );
  state.botSkillPercent = room.botSkillPercent ?? 50;

  await saveTableState(roomId, state);
  return state;
}

export async function rebuildSeatsFromDb(roomId: string, state: PokerTableState) {
  const players = await prisma.roomPlayer.findMany({
    where: { roomId },
    orderBy: { seat: "asc" },
  });

  const existingByUser = new Map(state.seats.map((s) => [s.userId, s]));
  state.seats = players.map((p) => {
    const prev = existingByUser.get(p.userId);
    if (prev && state.street !== "waiting" && state.street !== "complete") {
      return prev;
    }
    return {
      userId: p.userId,
      seat: p.seat,
      stack: toNumber(p.stack),
      bet: 0,
      totalBet: 0,
      holeCards: [],
      folded: false,
      allIn: false,
      sittingOut: false,
      lastAction: null,
    };
  });
  return state;
}

/** Auto-fold human seats that exceed the turn clock. */
export async function enforceTurnTimeout(roomId: string): Promise<PokerTableState> {
  let state = await ensureGameState(roomId);
  let guard = 0;

  while (
    guard < 8 &&
    state.actionSeat != null &&
    state.turnStartedAt != null &&
    state.street !== "waiting" &&
    state.street !== "complete" &&
    state.street !== "showdown"
  ) {
    const limitMs = (state.turnSeconds || DEFAULT_TURN_SECONDS) * 1000;
    if (Date.now() - state.turnStartedAt < limitMs) break;

    const actor = state.seats.find((s) => s.seat === state.actionSeat);
    if (!actor || isBotUserId(actor.userId)) break;

    const prev = state;
    try {
      state = applyAction(state, actor.userId, "fold");
      await saveTableState(roomId, state);
      await recordRakeIfNeeded(roomId, prev, state);
      await afterHandRoster(roomId, prev, state);
      state = await ensureGameState(roomId);
      // Next actor (maybe bot) waits for their own think / clock on later ticks
    } catch {
      break;
    }
    guard += 1;
  }

  return state;
}

/**
 * Advance at most one bot action, and only after a human-like think delay.
 * Streets progress naturally: preflop → flop → turn → river across ticks.
 */
async function advanceOneBotIfReady(state: PokerTableState): Promise<{
  state: PokerTableState;
  acted: boolean;
}> {
  if (
    state.street === "waiting" ||
    state.street === "complete" ||
    state.street === "showdown" ||
    state.actionSeat == null
  ) {
    return { state, acted: false };
  }

  const actor = state.seats.find((s) => s.seat === state.actionSeat);
  if (!actor || !isBotUserId(actor.userId)) {
    return { state, acted: false };
  }

  // Still in card-reveal pause or staggered flop deal
  if (state.streetHoldUntil && Date.now() < state.streetHoldUntil) {
    return { state, acted: false };
  }
  if (state.pendingCommunityDeals && state.pendingCommunityDeals > 0) {
    return { state, acted: false };
  }

  const elapsedStart = Math.max(
    state.turnStartedAt ?? 0,
    state.streetHoldUntil ?? 0,
  );
  if (Date.now() < elapsedStart + botThinkMs(state, actor.userId)) {
    return { state, acted: false };
  }

  const decision = decideBotAction(state, actor.userId);
  let next = state;
  try {
    next = applyAction(next, actor.userId, decision.action, decision.amount ?? 0);
  } catch {
    try {
      next = applyAction(next, actor.userId, "check");
    } catch {
      try {
        next = applyAction(next, actor.userId, "fold");
      } catch {
        return { state, acted: false };
      }
    }
  }
  return { state: next, acted: true };
}

function liveSeatCount(state: PokerTableState) {
  return state.seats.filter((s) => !s.sittingOut && s.stack > 0).length;
}

/**
 * Keep tables automatic: one bot action per tick (with think time), then
 * auto-deal the next hand when 2+ players are seated.
 */
export async function tickRoom(roomId: string): Promise<PokerTableState> {
  let state = await enforceTurnTimeout(roomId);

  // Staggered flop cards (3rd board card dealt one-by-one), then turn/river runout
  {
    const communityStep = continueCommunityDealIfReady(state);
    if (communityStep) {
      const before = state;
      state = communityStep;
      await saveTableState(roomId, state);
      await recordRakeIfNeeded(roomId, before, state);
      await afterHandRoster(roomId, before, state);
      state = await ensureGameState(roomId);
    }
  }

  {
    const runout = continueRunoutIfReady(state);
    if (runout) {
      const before = state;
      state = runout;
      await saveTableState(roomId, state);
      await recordRakeIfNeeded(roomId, before, state);
      await afterHandRoster(roomId, before, state);
      state = await ensureGameState(roomId);
    }
  }

  const prev = state;
  const result = await advanceOneBotIfReady(state);
  if (result.acted) {
    state = result.state;
    await saveTableState(roomId, state);
    await recordRakeIfNeeded(roomId, prev, state);
    await afterHandRoster(roomId, prev, state);
    state = await ensureGameState(roomId);
  }

  if (state.street === "waiting" || state.street === "complete") {
    // Pause after a finished hand so the winner banner can show
    if (state.street === "complete" && state.winners?.length) {
      const row = await prisma.gameState.findUnique({ where: { roomId } });
      const age = row ? Date.now() - row.updatedAt.getTime() : 9999;
      if (age < 5000) return state;
    }

    if (liveSeatCount(state) >= 2) {
      try {
        state = await startRoomHand(roomId);
      } catch {
        // Not enough stacks / room closed — leave waiting
      }
    } else {
      const { reconcileTableRoster } = await import("@/lib/table-roster");
      await reconcileTableRoster(roomId);
      state = await ensureGameState(roomId);
      if (liveSeatCount(state) >= 2) {
        try {
          state = await startRoomHand(roomId);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return state;
}

/** Nudge every open room so bot-only tables keep dealing without a seated human. */
export async function tickOpenRooms(limit = 8) {
  const rooms = await prisma.room.findMany({
    where: { status: { not: "CLOSED" } },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  for (const room of rooms) {
    try {
      await tickRoom(room.id);
    } catch {
      /* ignore per-room */
    }
  }
}

export async function startRoomHand(roomId: string) {
  // Swap broke bots / seat waiters / refill before dealing
  const { reconcileTableRoster } = await import("@/lib/table-roster");
  await reconcileTableRoster(roomId);

  let state = await ensureGameState(roomId);
  state = await rebuildSeatsFromDb(roomId, state);

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (room) {
    state.rakePercent = room.type === "REAL" ? toNumber(room.rakePercent) : 0;
    state.rakeCap = room.type === "REAL" ? toNumber(room.rakeCap) : 0;
    state.botSkillPercent = room.botSkillPercent ?? 50;
  }

  const live = state.seats.filter((s) => !s.sittingOut && s.stack > 0);
  if (live.length < 2) {
    throw new Error("Need at least 2 players to deal. Add a bot opponent or invite a friend.");
  }

  // Already in a hand — don't re-deal
  if (
    state.street !== "waiting" &&
    state.street !== "complete" &&
    state.street !== "showdown"
  ) {
    return state;
  }

  const prev = state;
  state = startHand(state);
  // Do not rush bots — tickRoom advances one action at a time with think delay
  await prisma.room.update({ where: { id: roomId }, data: { status: "ACTIVE" } });
  await saveTableState(roomId, state);
  await recordRakeIfNeeded(roomId, prev, state);
  await afterHandRoster(roomId, prev, state);
  return (await ensureGameState(roomId)) ?? state;
}

export async function performAction(
  roomId: string,
  userId: string,
  action: PlayerAction,
  amount?: number,
) {
  await enforceTurnTimeout(roomId);
  const prev = await ensureGameState(roomId);
  let next = applyAction(prev, userId, action, amount ?? 0);
  await saveTableState(roomId, next);
  await recordRakeIfNeeded(roomId, prev, next);
  await afterHandRoster(roomId, prev, next);
  // Bots act on later ticks with human-like delays
  return (await ensureGameState(roomId)) ?? next;
}

/** Fold a disconnected human mid-hand (works even off-turn). */
export async function forceFoldPlayer(roomId: string, userId: string) {
  const prev = await ensureGameState(roomId);
  let next = forceFold(prev, userId);
  await saveTableState(roomId, next);
  await recordRakeIfNeeded(roomId, prev, next);
  await afterHandRoster(roomId, prev, next);
  return (await ensureGameState(roomId)) ?? next;
}

export async function tipDealer(roomId: string, userId: string, amount?: number) {
  const state = await ensureGameState(roomId);
  const seat = state.seats.find((s) => s.userId === userId && !s.sittingOut);
  if (!seat) throw new Error("Sit at the table to tip the dealer");
  if (seat.allIn) throw new Error("Can't tip while all-in");

  const tip = Math.max(1, Math.floor(amount ?? Math.max(1, state.smallBlind)));
  if (seat.stack < tip) throw new Error("Not enough chips to tip");

  // Keep enough for blinds next hand when between hands
  if (
    (state.street === "waiting" || state.street === "complete") &&
    seat.stack - tip < state.bigBlind
  ) {
    throw new Error("Keep at least one big blind for the next hand");
  }

  const next = structuredClone(state) as PokerTableState;
  const nextSeat = next.seats.find((s) => s.userId === userId);
  if (!nextSeat) throw new Error("Seat not found");
  nextSeat.stack -= tip;

  await saveTableState(roomId, next);

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (room) {
    const settings = await getPlatformSettings();
    const balances = (settings.houseBalances ?? {}) as Record<string, number>;
    const currency = room.type === "REAL" ? room.currency : "TIPS";
    balances[currency] = Number(((balances[currency] ?? 0) + tip).toFixed(2));
    await prisma.platformSettings.update({
      where: { id: "default" },
      data: { houseBalances: balances },
    });
  }

  return { state: next, tip };
}

export async function getPublicGameState(roomId: string, viewerId?: string) {
  const state = await tickRoom(roomId);
  const row = await prisma.gameState.findUnique({ where: { roomId } });
  return {
    version: row?.version ?? 1,
    state: toPublicState(state, viewerId),
  };
}
