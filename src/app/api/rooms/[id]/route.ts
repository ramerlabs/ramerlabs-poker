import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import { getPublicGameState } from "@/lib/game-service";
import { isBotUserId } from "@/lib/poker/bot";
import { purgeStalePlayers } from "@/lib/table-roster";
import { getRecentTableChats } from "@/lib/table-chat";

type Params = { params: Promise<{ id: string }> };

const roomInclude = {
  players: {
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { seat: "asc" as const },
  },
  waitlist: {
    orderBy: { createdAt: "asc" as const },
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  creator: { select: { id: true, name: true, email: true } },
  club: {
    select: {
      id: true,
      name: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  },
};

/** Don't run expensive stale-player purge on every 1–2s light poll */
const lastPurgeAt = new Map<string, number>();
const PURGE_INTERVAL_MS = 60_000;

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const invite = new URL(req.url).searchParams.get("invite");
  const light = new URL(req.url).searchParams.get("light") === "1";
  // Only Ably echo should skip ticks — light polls still advance bots/timeouts
  const skipTick = new URL(req.url).searchParams.get("tick") === "0";

  // Free idle seats (throttled) — presence is via /presence heartbeat + sit/actions
  const purgeAge = Date.now() - (lastPurgeAt.get(id) ?? 0);
  if (purgeAge >= PURGE_INTERVAL_MS) {
    lastPurgeAt.set(id, Date.now());
    void purgeStalePlayers(id).catch(() => {});
  }

  const room = await prisma.room.findUnique({
    where: { id },
    include: roomInclude,
  });

  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const myPlayer = room.players.find((p) => p.userId === authResult.userId);
  const seated = Boolean(myPlayer);
  const waiting = room.waitlist.some((w) => w.userId === authResult.userId);
  const isCreator = room.creatorId === authResult.userId;
  const validInvite = Boolean(invite && invite === room.inviteCode);

  if (room.isPrivate) {
    if (
      !seated &&
      !waiting &&
      !isCreator &&
      authResult.role !== "ADMIN" &&
      !validInvite
    ) {
      return NextResponse.json(
        {
          error: "Private room — join with invite code",
          private: true,
          room: {
            id: room.id,
            name: room.name,
            type: room.type,
            currency: room.currency,
            buyIn: toNumber(room.buyIn),
            isPrivate: true,
          },
        },
        { status: 403 },
      );
    }
  }

  const game = await getPublicGameState(id, authResult.userId, { tick: !skipTick });
  const waitPosition =
    room.waitlist.findIndex((w) => w.userId === authResult.userId) + 1 || null;
  const isAdmin = authResult.role === "ADMIN";
  const chats = await getRecentTableChats(id).catch(() => [] as Awaited<
    ReturnType<typeof getRecentTableChats>
  >);

  const meUser = light
    ? null
    : await prisma.user.findUnique({
        where: { id: authResult.userId },
        select: {
          creditsBalance: true,
          realMoneyBalance: true,
          currentCurrency: true,
        },
      });

  const walletBalance = meUser
    ? room.type === "FREE"
      ? toNumber(meUser.creditsBalance)
      : toNumber(meUser.realMoneyBalance)
    : 0;

  return NextResponse.json({
    room: light
      ? {
          id: room.id,
          chatEnabled: room.chatEnabled,
          players: room.players.map((p) => ({
            ...p,
            stack: toNumber(p.stack),
            ...(isAdmin ? { isBot: isBotUserId(p.userId) } : {}),
          })),
        }
      : {
          ...room,
          buyIn: toNumber(room.buyIn),
          smallBlind: toNumber(room.smallBlind),
          bigBlind: toNumber(room.bigBlind),
          club: room.club
            ? {
                id: room.club.id,
                name: room.club.name,
                owner: {
                  name: room.club.owner.name,
                  email: room.club.owner.email,
                },
              }
            : null,
          // Hide bot roster details from regular players
          targetBots: isAdmin ? room.targetBots : undefined,
          players: room.players.map((p) => ({
            ...p,
            stack: toNumber(p.stack),
            ...(isAdmin ? { isBot: isBotUserId(p.userId) } : {}),
          })),
          waitlist: room.waitlist.map((w) => ({
            userId: w.userId,
            name: w.user.name ?? w.user.email,
            preferredSeat: w.preferredSeat,
            createdAt: w.createdAt,
          })),
          ...(isAdmin
            ? {
                botCount: room.players.filter((p) => isBotUserId(p.userId)).length,
                humanCount: room.players.filter((p) => !isBotUserId(p.userId)).length,
              }
            : {}),
        },
    me: light
      ? {
          // Keep seat identity on light polls so the client never loses "who am I"
          userId: authResult.userId,
          seated,
          seat: myPlayer?.seat ?? null,
          waiting,
          waitPosition: waiting ? waitPosition : null,
          preferredSeat: waiting
            ? (room.waitlist.find((w) => w.userId === authResult.userId)?.preferredSeat ?? null)
            : null,
        }
      : {
          userId: authResult.userId,
          seated,
          seat: myPlayer?.seat ?? null,
          waiting,
          waitPosition: waiting ? waitPosition : null,
          preferredSeat: waiting
            ? (room.waitlist.find((w) => w.userId === authResult.userId)?.preferredSeat ?? null)
            : null,
          walletBalance,
          currency: room.currency,
          minBuyIn: toNumber(room.buyIn),
        },
    game,
    chats,
  });
}
