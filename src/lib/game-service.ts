import { prisma } from "@/lib/prisma";
import { publishRoomEvent } from "@/lib/ably";
import {
  applyAction,
  createWaitingState,
  continueCommunityDealIfReady,
  continueRunoutIfReady,
  forceFold,
  releaseStreetHoldIfReady,
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
      globalCurrency: "USD",
      ablyEnabled: true,
    },
  });
}

export async function loadTableState(roomId: string): Promise<PokerTableState | null> {
  const row = await loadGameRow(roomId);
  return row?.state ?? null;
}

/** Load table state with optimistic-concurrency version. */
export async function loadGameRow(
  roomId: string,
): Promise<{ state: PokerTableState; version: number } | null> {
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
  return { state, version: row.version };
}

export type SaveTableResult = { ok: true; version: number } | { ok: false; version: number };

/**
 * Persist table state. When expectedVersion is set, uses compare-and-swap so
 * concurrent ticks/actions cannot overwrite each other with divergent hands.
 */
export async function saveTableState(
  roomId: string,
  state: PokerTableState,
  opts?: { syncStacks?: boolean; expectedVersion?: number },
): Promise<SaveTableResult> {
  const payload = state as unknown as Prisma.InputJsonValue;

  if (opts?.expectedVersion != null) {
    const updated = await prisma.gameState.updateMany({
      where: { roomId, version: opts.expectedVersion },
      data: {
        state: payload,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      const latest = await prisma.gameState.findUnique({
        where: { roomId },
        select: { version: true },
      });
      return { ok: false, version: latest?.version ?? opts.expectedVersion };
    }
    const version = opts.expectedVersion + 1;

    const betweenHands =
      state.street === "waiting" || state.street === "complete" || state.street === "showdown";
    if (opts?.syncStacks === true || (opts?.syncStacks !== false && betweenHands)) {
      await syncStacksToDb(roomId, state);
    }

    void publishRoomEvent(roomId, "state", {
      version,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, version };
  }

  // Create-or-blind-update (legacy callers). Prefer CAS when possible.
  const existing = await prisma.gameState.findUnique({
    where: { roomId },
    select: { version: true },
  });
  if (!existing) {
    const saved = await prisma.gameState.create({
      data: {
        roomId,
        state: payload,
        version: 1,
      },
    });
    const betweenHands =
      state.street === "waiting" || state.street === "complete" || state.street === "showdown";
    if (opts?.syncStacks === true || (opts?.syncStacks !== false && betweenHands)) {
      await syncStacksToDb(roomId, state);
    }
    void publishRoomEvent(roomId, "state", {
      version: saved.version,
      updatedAt: saved.updatedAt.toISOString(),
    });
    return { ok: true, version: saved.version };
  }

  // Re-enter with CAS against the version we just read
  return saveTableState(roomId, state, {
    ...opts,
    expectedVersion: existing.version,
  });
}

class StaleGameStateError extends Error {
  constructor() {
    super("STALE_GAME_STATE");
    this.name = "StaleGameStateError";
  }
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
  const betweenHands = state.street === "waiting" || state.street === "complete";

  state.seats = players.map((p) => {
    const prev = existingByUser.get(p.userId);
    if (prev && !betweenHands) {
      // Keep live hand fields, but always honor roster seat index
      return { ...prev, seat: p.seat, stack: prev.stack };
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

  // Mid-hand: also keep any state seats still playing that were dropped from roster
  // (shouldn't happen for humans; bots may briefly desync — drop orphans not in roster)
  if (!betweenHands) {
    const rosterIds = new Set(players.map((p) => p.userId));
    // Prefer roster as source of truth for who is at the table
    state.seats = state.seats.filter((s) => rosterIds.has(s.userId));
  }

  return state;
}

/** Ensure RoomPlayer rows are present in live state (fixes “seated but invisible”). */
export async function syncRosterToLiveState(roomId: string): Promise<PokerTableState> {
  let state = await ensureGameState(roomId);
  const before = state.seats.map((s) => `${s.userId}:${s.seat}`).join("|");
  state = await rebuildSeatsFromDb(roomId, structuredClone(state) as PokerTableState);
  const after = state.seats.map((s) => `${s.userId}:${s.seat}`).join("|");
  if (before !== after) {
    await saveTableState(roomId, state);
  }
  return state;
}

/** Auto-fold human seats that exceed the turn clock (+ short grace for latency). */
export async function enforceTurnTimeout(roomId: string): Promise<PokerTableState> {
  let state = await ensureGameState(roomId);
  if (releaseStreetHoldIfReady(state)) {
    await saveTableState(roomId, state);
    state = await ensureGameState(roomId);
  }
  let guard = 0;

  while (
    guard < 8 &&
    state.actionSeat != null &&
    state.turnStartedAt != null &&
    !(state.streetHoldUntil && Date.now() < state.streetHoldUntil) &&
    state.street !== "waiting" &&
    state.street !== "complete" &&
    state.street !== "showdown"
  ) {
    const actor = state.seats.find((s) => s.seat === state.actionSeat);
    if (!actor) break;

    // Humans get a large network grace: polls are often 1–3s and the UI may
    // learn about the turn late. Bots use the base clock only as a stuck safety net.
    const graceMs = isBotUserId(actor.userId) ? 0 : 12_000;
    const limitMs = (state.turnSeconds || DEFAULT_TURN_SECONDS) * 1000 + graceMs;
    if (Date.now() - state.turnStartedAt < limitMs) break;

    // Bots are normally advanced by advanceOneBotIfReady; if they still exceed
    // the human turn clock, force them forward so the table cannot freeze at 0s.
    if (isBotUserId(actor.userId)) {
      const botResult = await advanceOneBotIfReady(state);
      if (!botResult.acted) break;
      const prev = state;
      state = botResult.state;
      await saveTableState(roomId, state);
      await recordRakeIfNeeded(roomId, prev, state);
      await afterHandRoster(roomId, prev, state);
      state = await ensureGameState(roomId);
      guard += 1;
      continue;
    }

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

  // Clock starts after deal/reveal — bots only need a brief think, not the full turn timer
  const turnStartedAt = state.turnStartedAt;
  if (turnStartedAt == null) {
    return { state, acted: false };
  }
  const thinkMs = botThinkMs(state, actor.userId);
  const waited = Date.now() - turnStartedAt;
  // Hard cap so a stuck bot can never freeze the table at "0s"
  const botMaxMs = Math.min((state.turnSeconds || DEFAULT_TURN_SECONDS) * 1000, 4_000);
  if (waited < thinkMs) {
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
        // Last resort after hard cap — force-fold even if applyAction path is broken
        if (waited >= botMaxMs) {
          try {
            next = forceFold(next, actor.userId);
          } catch {
            return { state, acted: false };
          }
        } else {
          return { state, acted: false };
        }
      }
    }
  }
  return { state: next, acted: true };
}

function liveSeatCount(state: PokerTableState) {
  return state.seats.filter((s) => !s.sittingOut && s.stack > 0).length;
}

/** Serialize / debounce ticks so Ably+poll refreshes cannot pile up (was causing 30–70s “latency”). */
const tickInflight = new Map<string, Promise<PokerTableState>>();
const lastTickAt = new Map<string, number>();
const lastRosterSyncAt = new Map<string, number>();

/**
 * Start a tick if needed. Never makes callers wait on an in-flight tick —
 * waiting was stacking every light poll into 5–20s "NET WEAK" freezes.
 */
export async function tickRoomDebounced(roomId: string, minIntervalMs = 200): Promise<PokerTableState> {
  const existing = tickInflight.get(roomId);
  if (existing) {
    return ensureGameState(roomId);
  }

  const last = lastTickAt.get(roomId) ?? 0;
  if (Date.now() - last < minIntervalMs) {
    return ensureGameState(roomId);
  }

  const run = tickRoom(roomId)
    .then((state) => {
      lastTickAt.set(roomId, Date.now());
      return state;
    })
    .finally(() => {
      if (tickInflight.get(roomId) === run) tickInflight.delete(roomId);
    });

  tickInflight.set(roomId, run);
  // Return current state immediately; tick continues in background
  void run.catch(() => {});
  return ensureGameState(roomId);
}

/**
 * Keep tables automatic: one bot action per tick (with think time), then
 * auto-deal the next hand when 2+ players are seated.
 *
 * Uses compare-and-swap versions so two players' polls cannot invent different
 * hands/boards on serverless (each instance used to tick independently).
 */
export async function tickRoom(roomId: string): Promise<PokerTableState> {
  const row = await loadGameRow(roomId);
  if (!row) return ensureGameState(roomId);

  // Claim this tick: bump version with unchanged state. Losers exit immediately.
  const claim = await saveTableState(roomId, row.state, {
    expectedVersion: row.version,
    syncStacks: false,
  });
  if (!claim.ok) {
    return (await loadTableState(roomId)) ?? row.state;
  }

  let version = claim.version;
  let state = structuredClone(row.state) as PokerTableState;

  const commit = async (next: PokerTableState, syncStacks?: boolean) => {
    const saved = await saveTableState(roomId, next, {
      expectedVersion: version,
      syncStacks,
    });
    if (!saved.ok) throw new StaleGameStateError();
    version = saved.version;
    state = next;
  };

  try {
    // Roster sync is expensive — only every few seconds
    const rosterAge = Date.now() - (lastRosterSyncAt.get(roomId) ?? 0);
    if (rosterAge > 4000) {
      const before = state.seats.map((s) => `${s.userId}:${s.seat}`).join("|");
      state = await rebuildSeatsFromDb(roomId, state);
      const after = state.seats.map((s) => `${s.userId}:${s.seat}`).join("|");
      if (before !== after) await commit(state);
      lastRosterSyncAt.set(roomId, Date.now());
    }

    if (releaseStreetHoldIfReady(state)) {
      await commit(state);
    }

    // Auto-fold timed-out humans (and stuck bots)
    for (let guard = 0; guard < 8; guard += 1) {
      if (
        state.actionSeat == null ||
        state.turnStartedAt == null ||
        (state.streetHoldUntil && Date.now() < state.streetHoldUntil) ||
        state.street === "waiting" ||
        state.street === "complete" ||
        state.street === "showdown"
      ) {
        break;
      }
      const actor = state.seats.find((s) => s.seat === state.actionSeat);
      if (!actor) break;
      const graceMs = isBotUserId(actor.userId) ? 0 : 12_000;
      const limitMs = (state.turnSeconds || DEFAULT_TURN_SECONDS) * 1000 + graceMs;
      if (Date.now() - state.turnStartedAt < limitMs) break;

      const prev = state;
      if (isBotUserId(actor.userId)) {
        const botResult = await advanceOneBotIfReady(state);
        if (!botResult.acted) break;
        state = botResult.state;
      } else {
        try {
          state = applyAction(state, actor.userId, "fold");
        } catch {
          break;
        }
      }
      await commit(state, false);
      await recordRakeIfNeeded(roomId, prev, state);
      await afterHandRoster(roomId, prev, state);
    }

    // Staggered flop / turn / river
    {
      const communityStep = continueCommunityDealIfReady(state);
      if (communityStep) {
        const before = state;
        state = communityStep;
        await commit(state);
        await recordRakeIfNeeded(roomId, before, state);
        await afterHandRoster(roomId, before, state);
      }
    }
    {
      const runout = continueRunoutIfReady(state);
      if (runout) {
        const before = state;
        state = runout;
        await commit(state);
        await recordRakeIfNeeded(roomId, before, state);
        await afterHandRoster(roomId, before, state);
      }
    }

    // Bot chain
    for (let i = 0; i < 10; i += 1) {
      const prev = state;
      const result = await advanceOneBotIfReady(state);
      if (!result.acted) break;
      state = result.state;
      await commit(state, false);
      await recordRakeIfNeeded(roomId, prev, state);
      await afterHandRoster(roomId, prev, state);
      if (state.street === "complete" || state.street === "waiting") break;
    }

    if (state.street === "waiting" || state.street === "complete") {
      if (state.street === "complete" && state.winners?.length) {
        const ageRow = await prisma.gameState.findUnique({ where: { roomId } });
        const age = ageRow ? Date.now() - ageRow.updatedAt.getTime() : 9999;
        if (age < 3200) return state;
      }

      if (liveSeatCount(state) >= 2) {
        try {
          // startRoomHand does its own load/save — release claim by using it carefully
          state = await startRoomHand(roomId);
        } catch {
          /* not enough stacks */
        }
      } else {
        const { reconcileTableRoster } = await import("@/lib/table-roster");
        await reconcileTableRoster(roomId);
        const refreshed = await loadGameRow(roomId);
        if (refreshed) {
          state = refreshed.state;
          version = refreshed.version;
        }
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
  } catch (e) {
    if (e instanceof StaleGameStateError) {
      return (await loadTableState(roomId)) ?? state;
    }
    throw e;
  }
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

  const row = await loadGameRow(roomId);
  if (!row) throw new Error("Room state missing");
  let state = await rebuildSeatsFromDb(roomId, structuredClone(row.state) as PokerTableState);
  let version = row.version;

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
  await prisma.room.update({ where: { id: roomId }, data: { status: "ACTIVE" } });
  const saved = await saveTableState(roomId, state, { expectedVersion: version });
  if (!saved.ok) {
    // Another writer already dealt or advanced — return their state
    return (await loadTableState(roomId)) ?? state;
  }
  await recordRakeIfNeeded(roomId, prev, state);
  await afterHandRoster(roomId, prev, state);
  return (await loadTableState(roomId)) ?? state;
}

export async function performAction(
  roomId: string,
  userId: string,
  action: PlayerAction,
  amount?: number,
) {
  const row = await loadGameRow(roomId);
  if (!row) throw new Error("Room state missing");
  let prev = structuredClone(row.state) as PokerTableState;
  let version = row.version;

  if (releaseStreetHoldIfReady(prev)) {
    const holdSave = await saveTableState(roomId, prev, { expectedVersion: version });
    if (!holdSave.ok) throw new Error("Table updated — try again");
    version = holdSave.version;
    const fresh = await loadGameRow(roomId);
    if (fresh) {
      prev = fresh.state;
      version = fresh.version;
    }
  }

  const actor = prev.seats.find((s) => s.seat === prev.actionSeat);
  const isCurrentActor = actor?.userId === userId;

  if (!isCurrentActor) {
    prev = await enforceTurnTimeout(roomId);
    const fresh = await loadGameRow(roomId);
    if (fresh) {
      prev = fresh.state;
      version = fresh.version;
    }
  } else if (prev.turnStartedAt != null) {
    const limitMs = (prev.turnSeconds || DEFAULT_TURN_SECONDS) * 1000 + 12_000;
    if (Date.now() - prev.turnStartedAt >= limitMs) {
      prev = await enforceTurnTimeout(roomId);
      const fresh = await loadGameRow(roomId);
      if (fresh) {
        prev = fresh.state;
        version = fresh.version;
      }
    }
  }

  const next = applyAction(prev, userId, action, amount ?? 0);
  const saved = await saveTableState(roomId, next, { expectedVersion: version });
  if (!saved.ok) {
    throw new Error("Table updated — try your action again");
  }
  await recordRakeIfNeeded(roomId, prev, next);
  await afterHandRoster(roomId, prev, next);

  // Advance bots in the background — don't make the player wait on bot think / DB work
  void tickRoomDebounced(roomId, 0).catch(() => {});

  return next;
}

/** Fold a disconnected human mid-hand (works even off-turn). */
export async function forceFoldPlayer(roomId: string, userId: string) {
  const prev = await ensureGameState(roomId);
  let next = forceFold(prev, userId);
  await saveTableState(roomId, next);
  await recordRakeIfNeeded(roomId, prev, next);
  await afterHandRoster(roomId, prev, next);
  return next;
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

export async function getPublicGameState(
  roomId: string,
  viewerId?: string,
  options?: { tick?: boolean },
) {
  // tickRoomDebounced returns current state immediately and runs the tick in
  // the background — awaiting a full tick here caused 5–20s NET WEAK freezes.
  const state =
    options?.tick === false
      ? await ensureGameState(roomId)
      : await tickRoomDebounced(roomId);

  const row = await prisma.gameState.findUnique({
    where: { roomId },
    select: { version: true },
  });
  return {
    version: row?.version ?? 1,
    state: toPublicState(state, viewerId),
  };
}
