import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireClubOwner } from "@/lib/club";
import { toNumber } from "@/lib/utils";

const genInviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(64).optional(),
  buyIn: z.number().positive().optional(),
  smallBlind: z.number().positive().optional(),
  bigBlind: z.number().positive().optional(),
  maxPlayers: z.number().int().min(2).max(9).optional(),
  chatEnabled: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
  status: z.enum(["CLOSED", "WAITING"]).optional(),
  targetBots: z.number().int().min(0).max(9).optional(),
  botSkillPercent: z.number().int().min(0).max(100).optional(),
});

/** List tables belonging to the signed-in owner's club. */
export async function GET() {
  const authResult = await requireClubOwner();
  if ("error" in authResult) return authResult.error;

  const rooms = await prisma.room.findMany({
    where: { clubId: authResult.club.id },
    include: {
      players: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      type: room.type,
      currency: room.currency,
      buyIn: toNumber(room.buyIn),
      smallBlind: toNumber(room.smallBlind),
      bigBlind: toNumber(room.bigBlind),
      maxPlayers: room.maxPlayers,
      targetBots: room.targetBots,
      botSkillPercent: room.botSkillPercent,
      chatEnabled: room.chatEnabled,
      isPrivate: room.isPrivate,
      inviteCode: room.inviteCode,
      status: room.status,
      playerCount: room.players.length,
      createdAt: room.createdAt,
    })),
  });
}

/** Update a club table (must belong to the owner's club). */
export async function PATCH(req: Request) {
  const authResult = await requireClubOwner();
  if ("error" in authResult) return authResult.error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid table update" }, { status: 400 });
  }

  const existing = await prisma.room.findFirst({
    where: { id: parsed.data.id, clubId: authResult.club.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Table not found in your club" }, { status: 404 });
  }

  const nextSmall = parsed.data.smallBlind ?? toNumber(existing.smallBlind);
  const nextBig = parsed.data.bigBlind ?? toNumber(existing.bigBlind);
  if (nextBig <= nextSmall) {
    return NextResponse.json({ error: "Big blind must exceed small blind" }, { status: 400 });
  }

  const nextMax = parsed.data.maxPlayers ?? existing.maxPlayers;
  const nextBots = parsed.data.targetBots ?? existing.targetBots;
  if (nextBots > nextMax) {
    return NextResponse.json({ error: "Bots cannot exceed max players" }, { status: 400 });
  }

  let inviteCode: string | null | undefined = undefined;
  if (parsed.data.isPrivate === true) {
    inviteCode = existing.inviteCode || genInviteCode();
  } else if (parsed.data.isPrivate === false) {
    inviteCode = null;
  }

  const room = await prisma.room.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name != null ? { name: parsed.data.name.trim() } : {}),
      ...(parsed.data.buyIn != null
        ? { buyIn: new Prisma.Decimal(parsed.data.buyIn) }
        : {}),
      ...(parsed.data.smallBlind != null
        ? { smallBlind: new Prisma.Decimal(parsed.data.smallBlind) }
        : {}),
      ...(parsed.data.bigBlind != null
        ? { bigBlind: new Prisma.Decimal(parsed.data.bigBlind) }
        : {}),
      ...(parsed.data.maxPlayers != null ? { maxPlayers: parsed.data.maxPlayers } : {}),
      ...(parsed.data.chatEnabled != null ? { chatEnabled: parsed.data.chatEnabled } : {}),
      ...(parsed.data.isPrivate != null ? { isPrivate: parsed.data.isPrivate } : {}),
      ...(inviteCode !== undefined ? { inviteCode } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.targetBots != null ? { targetBots: parsed.data.targetBots } : {}),
      ...(parsed.data.botSkillPercent != null
        ? { botSkillPercent: parsed.data.botSkillPercent }
        : {}),
    },
  });

  return NextResponse.json({
    room: {
      id: room.id,
      name: room.name,
      type: room.type,
      currency: room.currency,
      buyIn: toNumber(room.buyIn),
      smallBlind: toNumber(room.smallBlind),
      bigBlind: toNumber(room.bigBlind),
      maxPlayers: room.maxPlayers,
      targetBots: room.targetBots,
      botSkillPercent: room.botSkillPercent,
      chatEnabled: room.chatEnabled,
      isPrivate: room.isPrivate,
      inviteCode: room.inviteCode,
      status: room.status,
    },
    message: `Table “${room.name}” updated`,
  });
}
