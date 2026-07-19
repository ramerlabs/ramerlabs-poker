import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const schema = z.object({
  inviteCode: z.string().min(4).max(16),
});

/**
 * Look up a private table by invite code (no auto-join).
 * Client shows the table on Rooms, then opens `/rooms/[id]?invite=…`.
 */
export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid invite code" }, { status: 400 });
  }

  const code = parsed.data.inviteCode.trim().toUpperCase();

  const room = await prisma.room.findFirst({
    where: {
      status: { not: "CLOSED" },
      inviteCode: { equals: code, mode: "insensitive" },
    },
    include: {
      players: { select: { id: true } },
      club: {
        select: {
          id: true,
          name: true,
          owner: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!room || !room.inviteCode) {
    return NextResponse.json(
      { error: "No open table found for that invite code" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: `Found “${room.name}”`,
    room: {
      id: room.id,
      name: room.name,
      type: room.type,
      currency: room.currency,
      buyIn: toNumber(room.buyIn),
      smallBlind: toNumber(room.smallBlind),
      bigBlind: toNumber(room.bigBlind),
      maxPlayers: room.maxPlayers,
      isPrivate: Boolean(room.isPrivate),
      inviteCode: room.inviteCode.toUpperCase(),
      players: room.players,
      club: room.club,
    },
    path: `/rooms/${room.id}?invite=${encodeURIComponent(room.inviteCode.toUpperCase())}`,
  });
}
