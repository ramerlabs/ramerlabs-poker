import { prisma } from "@/lib/prisma";
import { isBotUserId } from "@/lib/poker/bot";
import { generateBotDisplayName, isLegacyBotName } from "@/lib/bot-names";
import {
  ensureGameState,
  forceFoldPlayer,
  rebuildSeatsFromDb,
  saveTableState,
} from "@/lib/game-service";
import { toNumber } from "@/lib/utils";
import { creditPlayWallet, debitPlayWallet, resolvePlayWallet } from "@/lib/club-wallet";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { customAlphabet } from "nanoid";

/** Humans with no presence refresh for this long are disconnected (frees the seat). */
export const PRESENCE_STALE_MS = 5 * 60_000;

const botSuffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

async function nextOpenSeat(
  roomId: string,
  maxPlayers: number,
  prefer?: number | null,
  reserved: Set<number> = new Set(),
) {
  const players = await prisma.roomPlayer.findMany({
    where: { roomId },
    select: { seat: true },
  });
  const taken = new Set(players.map((p) => p.seat));

  if (
    prefer != null &&
    prefer >= 0 &&
    prefer < maxPlayers &&
    !taken.has(prefer) &&
    !reserved.has(prefer)
  ) {
    return prefer;
  }

  for (let seat = 0; seat < maxPlayers; seat += 1) {
    if (!taken.has(seat) && !reserved.has(seat)) return seat;
  }
  // Last resort: ignore reserved (except prefer already tried)
  for (let seat = 0; seat < maxPlayers; seat += 1) {
    if (!taken.has(seat)) return seat;
  }
  return null;
}

export async function addBotOpponent(roomId: string, reservedSeats: Set<number> = new Set()) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: true },
  });
  if (!room) throw new Error("Room not found");
  if (room.status === "CLOSED") throw new Error("Room is closed");
  if (room.players.length >= room.maxPlayers) throw new Error("Room is full");

  const botId = `bot_${roomId.slice(0, 8)}_${botSuffix()}`;
  const email = `${botId}@bots.ramerlabs.local`;
  const name = generateBotDisplayName(botId);

  const passwordHash = await bcrypt.hash(`bot-${botId}`, 10);
  await prisma.user.upsert({
    where: { email },
    update: { name },
    create: {
      id: botId,
      email,
      name,
      passwordHash,
      creditsBalance: 100000,
      realMoneyBalance: 0,
      currentCurrency: room.currency === "CREDITS" ? "USD" : room.currency,
    },
  });

  const seat = await nextOpenSeat(roomId, room.maxPlayers, null, reservedSeats);
  if (seat == null) throw new Error("Room is full");

  const buyIn = toNumber(room.buyIn);
  await prisma.roomPlayer.create({
    data: {
      roomId: room.id,
      userId: botId,
      seat,
      stack: new Prisma.Decimal(buyIn),
    },
  });

  let state = await ensureGameState(roomId);
  state = await rebuildSeatsFromDb(roomId, state);
  await saveTableState(roomId, state);

  return { botId, seat, name };
}

export async function seedBots(roomId: string, count: number) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: true },
  });
  if (!room) throw new Error("Room not found");

  const seatsLeft = room.maxPlayers - room.players.length;
  const toAdd = Math.max(0, Math.min(count, seatsLeft));
  const added = [];
  for (let i = 0; i < toAdd; i += 1) {
    added.push(await addBotOpponent(roomId));
  }
  return added;
}

async function removeBot(roomId: string, botUserId: string) {
  await prisma.roomPlayer.deleteMany({ where: { roomId, userId: botUserId } });
  let state = await ensureGameState(roomId);
  state = await rebuildSeatsFromDb(roomId, state);
  await saveTableState(roomId, state);
}

/** Admin kick: remove a bot and lower targetBots so it is not auto-refilled. */
export async function kickBot(roomId: string, botUserId: string) {
  if (!isBotUserId(botUserId)) throw new Error("Only bots can be kicked this way");

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: true },
  });
  if (!room || room.status === "CLOSED") throw new Error("Room not found");
  if (!room.players.some((p) => p.userId === botUserId)) {
    throw new Error("Bot is not at this table");
  }

  const state = await ensureGameState(roomId);
  if (state.street !== "waiting" && state.street !== "complete") {
    throw new Error("Kick bots between hands");
  }

  await removeBot(roomId, botUserId);

  if (room.targetBots > 0) {
    await prisma.room.update({
      where: { id: roomId },
      data: { targetBots: Math.max(0, room.targetBots - 1) },
    });
  }

  return { kicked: botUserId };
}

async function rebuyBot(roomId: string, botUserId: string, buyIn: number) {
  await prisma.roomPlayer.updateMany({
    where: { roomId, userId: botUserId },
    data: { stack: new Prisma.Decimal(buyIn), status: "SEATED" },
  });
  let state = await ensureGameState(roomId);
  state = await rebuildSeatsFromDb(roomId, state);
  const seat = state.seats.find((s) => s.userId === botUserId);
  if (seat) {
    seat.stack = buyIn;
    seat.sittingOut = false;
    seat.folded = false;
    seat.allIn = false;
  }
  await saveTableState(roomId, state);
}

function pickOpenSeat(
  maxPlayers: number,
  occupiedSeats: Iterable<number>,
  prefer?: number | null,
) {
  const taken = new Set(occupiedSeats);
  if (
    prefer != null &&
    prefer >= 0 &&
    prefer < maxPlayers &&
    !taken.has(prefer)
  ) {
    return prefer;
  }
  for (let seat = 0; seat < maxPlayers; seat += 1) {
    if (!taken.has(seat)) return seat;
  }
  return null;
}

async function seatWaiter(
  roomId: string,
  userId: string,
  preferredSeat?: number | null,
  buyInAmount?: number | null,
  /** When provided (sit path), skip an extra game-state load + roster rebuild. */
  liveState?: Awaited<ReturnType<typeof ensureGameState>>,
): Promise<{ seated: boolean; reason?: string; seat?: number }> {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: true, waitlist: true },
  });
  if (!room || room.status === "CLOSED") return { seated: false, reason: "Room closed" };
  if (room.players.some((p) => p.userId === userId)) {
    await prisma.roomWaitlist.deleteMany({ where: { roomId, userId } });
    return { seated: true };
  }
  if (room.players.length >= room.maxPlayers) {
    return { seated: false, reason: "Room full" };
  }

  let wallet;
  try {
    wallet = await resolvePlayWallet(room, userId);
  } catch (e) {
    return {
      seated: false,
      reason: e instanceof Error ? e.message : "Could not resolve wallet",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentCurrency: true },
  });
  if (!user) return { seated: false, reason: "User not found" };

  const minBuyIn = toNumber(room.buyIn);
  const balance = wallet.balance;
  if (balance < minBuyIn) {
    await prisma.roomWaitlist.deleteMany({ where: { roomId, userId } });
    const where =
      wallet.source === "club" ? "club wallet" : "system wallet";
    return { seated: false, reason: `Need at least ${minBuyIn} in your ${where}` };
  }
  if (room.type === "REAL" && user.currentCurrency !== room.currency) {
    await prisma.user.update({
      where: { id: userId },
      data: { currentCurrency: room.currency },
    });
  }

  const entry = room.waitlist.find((w) => w.userId === userId);
  const fromWaitlist =
    entry?.buyInAmount != null ? toNumber(entry.buyInAmount) : null;
  const rawAmount = buyInAmount ?? fromWaitlist ?? minBuyIn;
  const amount = Math.round(Number(rawAmount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < minBuyIn) {
    return {
      seated: false,
      reason: `Buy-in must be at least ${minBuyIn}`,
    };
  }
  if (amount > balance) {
    return {
      seated: false,
      reason: `Insufficient ${wallet.source === "club" ? "club" : "system"} balance (have ${balance}, need ${amount})`,
    };
  }

  const prefer = preferredSeat ?? entry?.preferredSeat ?? null;
  const seat = pickOpenSeat(
    room.maxPlayers,
    room.players.map((p) => p.seat),
    prefer,
  );
  if (seat == null) return { seated: false, reason: "No seat" };

  try {
    await prisma.$transaction(async (tx) => {
      await debitPlayWallet(wallet, userId, amount, tx);
      await tx.roomPlayer.create({
        data: {
          roomId,
          userId,
          seat,
          stack: new Prisma.Decimal(amount),
        },
      });
      await tx.roomWaitlist.deleteMany({ where: { roomId, userId } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") {
      return { seated: false, reason: "Insufficient balance" };
    }
    throw e;
  }

  // Fast path: patch seats in memory (sit already loaded state). Avoids
  // ensureGameState + rebuildSeatsFromDb round-trips that made buy-in feel stuck.
  if (liveState) {
    const next = structuredClone(liveState);
    if (!next.seats.some((s) => s.userId === userId)) {
      next.seats.push({
        userId,
        seat,
        stack: amount,
        bet: 0,
        totalBet: 0,
        holeCards: [],
        folded: false,
        allIn: false,
        sittingOut: false,
        lastAction: null,
      });
      next.seats.sort((a, b) => a.seat - b.seat);
    }
    await saveTableState(roomId, next, { syncStacks: false });
    return { seated: true, seat };
  }

  let state = await ensureGameState(roomId);
  state = await rebuildSeatsFromDb(roomId, state);
  await saveTableState(roomId, state, { syncStacks: false });
  return { seated: true, seat };
}

/** Click open seat: sit now between hands, or claim seat for next hand. */
export async function claimSeat(
  roomId: string,
  userId: string,
  seat: number,
  buyInAmount?: number | null,
) {
  const [room, state] = await Promise.all([
    prisma.room.findUnique({
      where: { id: roomId },
      include: { players: true },
    }),
    ensureGameState(roomId),
  ]);
  if (!room || room.status === "CLOSED") throw new Error("Room not found");
  if (seat < 0 || seat >= room.maxPlayers) throw new Error("Invalid seat");
  if (room.players.some((p) => p.userId === userId)) {
    const mine = room.players.find((p) => p.userId === userId)!;
    throw new Error(
      `You are already at seat ${mine.seat + 1}. Click Leave table if you want to move.`,
    );
  }

  const occupied = room.players.find((p) => p.seat === seat);
  if (occupied) throw new Error("That seat is taken");

  const minBuyIn = toNumber(room.buyIn);
  const amount =
    buyInAmount != null && Number.isFinite(buyInAmount)
      ? Math.round(Number(buyInAmount) * 100) / 100
      : minBuyIn;
  if (amount < minBuyIn) {
    throw new Error(`Buy-in must be at least ${minBuyIn}`);
  }

  const betweenHands = state.street === "waiting" || state.street === "complete";

  if (betweenHands) {
    const result = await seatWaiter(roomId, userId, seat, amount, state);
    if (!result.seated) throw new Error(result.reason || "Could not sit");
    return { seated: true as const, seat: result.seat ?? seat, waiting: false };
  }

  // Mid-hand: reserve seat for next hand
  await prisma.roomWaitlist.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: {
      roomId,
      userId,
      preferredSeat: seat,
      buyInAmount: new Prisma.Decimal(amount),
      lastSeenAt: new Date(),
    },
    update: {
      preferredSeat: seat,
      buyInAmount: new Prisma.Decimal(amount),
      lastSeenAt: new Date(),
    },
  });

  return {
    seated: false as const,
    waiting: true,
    preferredSeat: seat,
    message: `Seat ${seat + 1} reserved — you will sit with ${amount} when this hand ends.`,
  };
}

export async function reconcileTableRoster(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      players: true,
      waitlist: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!room || room.status === "CLOSED") return;

  await renameLegacyBots(roomId);

  const buyIn = toNumber(room.buyIn);
  const minStack = Math.max(toNumber(room.bigBlind), 0.01);

  const state = await ensureGameState(roomId);
  if (state.street === "waiting" || state.street === "complete") {
    for (const seat of state.seats) {
      await prisma.roomPlayer.updateMany({
        where: { roomId, userId: seat.userId },
        data: { stack: new Prisma.Decimal(seat.stack) },
      });
    }
  } else {
    return;
  }

  const fresh = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      players: true,
      waitlist: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!fresh) return;

  // Cash out anyone who disconnected mid-hand
  for (const p of fresh.players) {
    if (p.pendingLeave && !isBotUserId(p.userId)) {
      await cashOutSeatedPlayer(roomId, p.userId);
    }
  }

  const afterPending = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      players: true,
      waitlist: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!afterPending) return;

  const brokeBots = afterPending.players.filter(
    (p) => isBotUserId(p.userId) && toNumber(p.stack) < minStack,
  );

  let waiters = [...afterPending.waitlist];

  for (const bot of brokeBots) {
    if (waiters.length > 0) {
      // Free a seat — waiters must click Open to choose where they sit
      await removeBot(roomId, bot.userId);
      waiters.shift();
    } else {
      await rebuyBot(roomId, bot.userId, buyIn);
    }
  }

  const afterBroke = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      players: true,
      waitlist: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!afterBroke) return;

  // Only seat waiters who already picked a preferred seat
  for (const entry of afterBroke.waitlist) {
    if (entry.preferredSeat == null) continue;
    const current = await prisma.roomPlayer.count({ where: { roomId } });
    if (current >= afterBroke.maxPlayers) break;
    await seatWaiter(roomId, entry.userId, entry.preferredSeat);
  }

  await refillBotsToTarget(roomId);
}

async function renameLegacyBots(roomId: string) {
  const players = await prisma.roomPlayer.findMany({
    where: { roomId },
    include: { user: { select: { id: true, name: true } } },
  });
  for (const p of players) {
    if (!isBotUserId(p.userId)) continue;
    if (!isLegacyBotName(p.user.name)) continue;
    await prisma.user.update({
      where: { id: p.userId },
      data: { name: generateBotDisplayName(p.userId) },
    });
  }
}

export async function refillBotsToTarget(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      players: true,
      waitlist: true,
    },
  });
  if (!room || room.status === "CLOSED") return;

  await renameLegacyBots(roomId);

  if (room.targetBots <= 0) return;

  const reserved = new Set(
    room.waitlist
      .map((w) => w.preferredSeat)
      .filter((s): s is number => s != null && s >= 0),
  );
  // Also reserve one open seat per waiter without preference
  const openSeats = room.maxPlayers - room.players.length;
  const reservedForWaiters = Math.max(reserved.size, room.waitlist.length);
  const botCount = room.players.filter((p) => isBotUserId(p.userId)).length;
  const usableSeats = Math.max(0, openSeats - reservedForWaiters);
  const need = Math.max(0, room.targetBots - botCount);
  const toAdd = Math.min(need, usableSeats);

  for (let i = 0; i < toAdd; i += 1) {
    await addBotOpponent(roomId, reserved);
  }
}

async function cashOutSeatedPlayer(roomId: string, userId: string) {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) return;

  const player = await prisma.roomPlayer.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!player) return;

  // Prefer live stack from game state when between hands
  const state = await ensureGameState(roomId);
  const live = state.seats.find((s) => s.userId === userId);
  const stack = live ? live.stack : toNumber(player.stack);

  let wallet;
  try {
    wallet = await resolvePlayWallet(room, userId);
  } catch {
    // Fallback: if membership was removed mid-session, return to system wallet
    wallet = {
      source: "system" as const,
      kind: (room.type === "FREE" ? "FREE" : "REAL") as "FREE" | "REAL",
      balance: 0,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.roomPlayer.delete({ where: { id: player.id } });
    if (stack > 0) {
      await creditPlayWallet(wallet, userId, stack, tx);
    }
  });

  let next = await ensureGameState(roomId);
  next = await rebuildSeatsFromDb(roomId, next);
  await saveTableState(roomId, next);
}

/** Add chips from wallet to an already-seated player (between hands only). */
export async function rebuySeatedPlayer(
  roomId: string,
  userId: string,
  buyInAmount: number,
) {
  if (isBotUserId(userId)) throw new Error("Bots rebuy automatically");

  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room || room.status === "CLOSED") throw new Error("Room not found");

  const player = await prisma.roomPlayer.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!player) throw new Error("Sit at the table first");

  const state = await ensureGameState(roomId);
  if (state.street !== "waiting" && state.street !== "complete") {
    throw new Error("Add chips between hands only");
  }

  const wallet = await resolvePlayWallet(room, userId);
  const minBuyIn = toNumber(room.buyIn);
  const amount = Math.round(Number(buyInAmount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < minBuyIn) {
    throw new Error(`Buy-in must be at least ${minBuyIn}`);
  }
  if (amount > wallet.balance) {
    throw new Error(
      `Insufficient ${wallet.source === "club" ? "club" : "system"} balance (have ${wallet.balance})`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await debitPlayWallet(wallet, userId, amount, tx);
    await tx.roomPlayer.update({
      where: { id: player.id },
      data: { stack: { increment: new Prisma.Decimal(amount) } },
    });
  });

  const refreshed = await prisma.roomPlayer.findUnique({
    where: { id: player.id },
    select: { stack: true },
  });
  const newStack = toNumber(refreshed?.stack);

  let next = await ensureGameState(roomId);
  const seat = next.seats.find((s) => s.userId === userId);
  if (seat) {
    seat.stack = newStack;
    seat.sittingOut = false;
  }
  await saveTableState(roomId, next);

  return { amount, newStack, currency: room.currency };
}

export async function leaveTable(roomId: string, userId: string) {
  if (isBotUserId(userId)) throw new Error("Bots leave via roster management");

  const player = await prisma.roomPlayer.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!player) throw new Error("You are not seated");

  const state = await ensureGameState(roomId);
  if (state.street !== "waiting" && state.street !== "complete") {
    // Mid-hand leave → fold now, cash out when the hand ends
    await prisma.roomPlayer.update({
      where: { id: player.id },
      data: { pendingLeave: true, lastSeenAt: new Date() },
    });
    await forceFoldPlayer(roomId, userId);
    return { pending: true as const };
  }

  await cashOutSeatedPlayer(roomId, userId);
  await reconcileTableRoster(roomId);
  return { pending: false as const };
}

/**
 * Full disconnect: leave waitlist and leave/cash out of the table.
 * Safe for browser close (beacon) and Leave button.
 */
export async function disconnectPlayer(roomId: string, userId: string) {
  if (isBotUserId(userId)) return { ok: true, mode: "bot" as const };

  await leaveWaitlist(roomId, userId);

  const player = await prisma.roomPlayer.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!player) return { ok: true, mode: "spectator" as const };

  const result = await leaveTable(roomId, userId);
  return {
    ok: true,
    mode: result.pending ? ("pending_leave" as const) : ("left" as const),
  };
}

export async function touchPresence(roomId: string, userId: string) {
  if (isBotUserId(userId)) return;
  const now = new Date();
  await prisma.roomPlayer.updateMany({
    where: { roomId, userId },
    data: { lastSeenAt: now },
  });
  await prisma.roomWaitlist.updateMany({
    where: { roomId, userId },
    data: { lastSeenAt: now },
  });
}

export async function purgeStalePlayers(roomId: string) {
  const cutoff = new Date(Date.now() - PRESENCE_STALE_MS);
  const stale = await prisma.roomPlayer.findMany({
    where: {
      roomId,
      lastSeenAt: { lt: cutoff },
      pendingLeave: false,
    },
    select: { userId: true },
  });

  for (const p of stale) {
    if (isBotUserId(p.userId)) continue;
    try {
      await disconnectPlayer(roomId, p.userId);
    } catch {
      // ignore per-player failures
    }
  }

  await prisma.roomWaitlist.deleteMany({
    where: { roomId, lastSeenAt: { lt: cutoff } },
  });
}

export async function joinWaitlist(
  roomId: string,
  userId: string,
  preferredSeat?: number | null,
) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { players: true },
  });
  if (!room || room.status === "CLOSED") throw new Error("Room not found");
  if (room.players.some((p) => p.userId === userId)) {
    const mine = room.players.find((p) => p.userId === userId)!;
    throw new Error(
      `You are already at seat ${mine.seat + 1}. Click Leave table if you want to move.`,
    );
  }

  await prisma.roomWaitlist.upsert({
    where: { roomId_userId: { roomId, userId } },
    create: {
      roomId,
      userId,
      preferredSeat: preferredSeat ?? null,
      lastSeenAt: new Date(),
    },
    update: {
      lastSeenAt: new Date(),
      ...(preferredSeat != null ? { preferredSeat } : {}),
    },
  });

  // Do not auto-seat — player must click an Open seat
  const entry = await prisma.roomWaitlist.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });

  const queue = await prisma.roomWaitlist.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  const position = queue.findIndex((q) => q.userId === userId) + 1;

  return {
    seated: false,
    waiting: Boolean(entry),
    position: entry ? position : null,
    preferredSeat: entry?.preferredSeat ?? null,
    message:
      "You are on the waitlist — click an Open seat on the table to sit down.",
  };
}

export async function leaveWaitlist(roomId: string, userId: string) {
  await prisma.roomWaitlist.deleteMany({ where: { roomId, userId } });
}
