import { prisma } from "@/lib/prisma";
import { publishRoomEvent } from "@/lib/ably";
import {
  applyAction,
  createWaitingState,
  startHand,
  toPublicState,
} from "@/lib/poker/engine";
import type { PlayerAction, PokerTableState } from "@/lib/poker/types";
import { toNumber } from "@/lib/utils";
import { Prisma } from "@prisma/client";

export async function loadTableState(roomId: string): Promise<PokerTableState | null> {
  const row = await prisma.gameState.findUnique({ where: { roomId } });
  if (!row) return null;
  return row.state as unknown as PokerTableState;
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
  );

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
    };
  });
  return state;
}

export async function startRoomHand(roomId: string) {
  let state = await ensureGameState(roomId);
  state = await rebuildSeatsFromDb(roomId, state);
  state = startHand(state);
  await prisma.room.update({ where: { id: roomId }, data: { status: "ACTIVE" } });
  await saveTableState(roomId, state);
  return state;
}

export async function performAction(
  roomId: string,
  userId: string,
  action: PlayerAction,
  amount?: number,
) {
  const state = await ensureGameState(roomId);
  const next = applyAction(state, userId, action, amount ?? 0);
  await saveTableState(roomId, next);
  return next;
}

export async function getPublicGameState(roomId: string, viewerId?: string) {
  const state = await ensureGameState(roomId);
  const row = await prisma.gameState.findUnique({ where: { roomId } });
  return {
    version: row?.version ?? 1,
    state: toPublicState(state, viewerId),
  };
}
