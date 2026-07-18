import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import { getPublicGameState } from "@/lib/game-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const invite = new URL(req.url).searchParams.get("invite");

  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      players: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { seat: "asc" },
      },
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  if (room.isPrivate) {
    const seated = room.players.some((p) => p.userId === authResult.userId);
    const isCreator = room.creatorId === authResult.userId;
    const validInvite = Boolean(invite && invite === room.inviteCode);
    if (!seated && !isCreator && authResult.role !== "ADMIN" && !validInvite) {
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

  const game = await getPublicGameState(id, authResult.userId);

  return NextResponse.json({
    room: {
      ...room,
      buyIn: toNumber(room.buyIn),
      smallBlind: toNumber(room.smallBlind),
      bigBlind: toNumber(room.bigBlind),
      players: room.players.map((p) => ({
        ...p,
        stack: toNumber(p.stack),
      })),
    },
    game,
  });
}
