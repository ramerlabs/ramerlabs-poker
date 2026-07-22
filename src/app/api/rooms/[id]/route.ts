import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import { getPublicGameState } from "@/lib/game-service";
import { getPublicBranding } from "@/lib/branding";
import { isBotUserId } from "@/lib/poker/bot";
import { purgeStalePlayers } from "@/lib/table-roster";
import { getRecentTableChats } from "@/lib/table-chat";
import { resolveRoomAccess } from "@/lib/room-access";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };

const roomInclude = {
  players: {
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { seat: "asc" as const },
  },
  waitlist: {
    orderBy: { createdAt: "asc" as const },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
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

  // Do NOT fire purge in parallel with this handler — it steals pool connections
  // (P2024). Presence heartbeat already purges; only run here when not light.
  const purgeAge = Date.now() - (lastPurgeAt.get(id) ?? 0);
  const shouldPurge = !light && purgeAge >= PURGE_INTERVAL_MS;
  if (shouldPurge) lastPurgeAt.set(id, Date.now());

  const room = await prisma.room.findUnique({
    where: { id },
    include: roomInclude,
  });

  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const access = await resolveRoomAccess(id, authResult, { invite });
  const myPlayer = room.players.find((p) => p.userId === authResult.userId);
  const seated = access.seated;
  const waiting = access.waiting;
  const isCreator = access.isCreator;

  if (!access.allowed) {
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

  const game = await getPublicGameState(id, authResult.userId, { tick: !skipTick });
  if (shouldPurge) {
    await purgeStalePlayers(id).catch(() => {});
  }
  const waitPosition =
    room.waitlist.findIndex((w) => w.userId === authResult.userId) + 1 || null;
  const isAdmin = authResult.role === "ADMIN";
  // Keep recent chats on light polls — Ably alone is not reliable enough for bubbles
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

  const branding = await getPublicBranding();

  let walletBalance = 0;
  let walletSource: "club" | "system" = "system";
  if (!light && meUser) {
    if (room.clubId) {
      const membership = await prisma.clubClient.findUnique({
        where: {
          clubId_userId: { clubId: room.clubId, userId: authResult.userId },
        },
        select: { creditsBalance: true, realMoneyBalance: true },
      });
      if (membership) {
        walletSource = "club";
        walletBalance =
          room.type === "FREE"
            ? toNumber(membership.creditsBalance)
            : toNumber(membership.realMoneyBalance);
      } else {
        walletBalance = 0;
      }
    } else {
      walletBalance =
        room.type === "FREE"
          ? toNumber(meUser.creditsBalance)
          : toNumber(meUser.realMoneyBalance);
    }
  }

  return NextResponse.json({
    serverNow: Date.now(),
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
          // Only creator/admin see invite codes — private club tables stay private
          inviteCode:
            isCreator || isAdmin ? room.inviteCode : null,
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
          walletSource,
          currency: room.currency,
          minBuyIn: toNumber(room.buyIn),
        },
    game,
    chats,
    branding,
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
