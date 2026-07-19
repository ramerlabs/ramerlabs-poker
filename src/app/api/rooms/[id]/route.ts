import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import { getPublicGameState } from "@/lib/game-service";
import { isBotUserId } from "@/lib/poker/bot";
import { purgeStalePlayers } from "@/lib/table-roster";

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
};

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const invite = new URL(req.url).searchParams.get("invite");
  const light = new URL(req.url).searchParams.get("light") === "1";
  // Only Ably echo should skip ticks — light polls still advance bots/timeouts
  const skipTick = new URL(req.url).searchParams.get("tick") === "0";

  // Free idle seats; presence is refreshed only via /presence heartbeat + sit/actions
  await purgeStalePlayers(id);

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

  return NextResponse.json({
    room: light
      ? {
          id: room.id,
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
      ? undefined
      : {
          userId: authResult.userId,
          seated,
          seat: myPlayer?.seat ?? null,
          waiting,
          waitPosition: waiting ? waitPosition : null,
          preferredSeat: waiting
            ? (room.waitlist.find((w) => w.userId === authResult.userId)?.preferredSeat ?? null)
            : null,
        },
    game,
  });
}
