import { NextResponse } from "next/server";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { Prisma, RoomType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/game-service";
import { seedBots } from "@/lib/table-roster";
import { requireAdmin } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const inviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

const createSchema = z.object({
  name: z.string().min(2).max(64),
  type: z.enum(["FREE", "REAL"]),
  currency: z.string().min(3).max(8).optional(),
  buyIn: z.number().positive(),
  smallBlind: z.number().positive(),
  bigBlind: z.number().positive(),
  maxPlayers: z.number().int().min(2).max(9).default(8),
  targetBots: z.number().int().min(0).max(9).default(0),
  botSkillPercent: z.number().int().min(0).max(100).default(50),
  isPrivate: z.boolean().default(false),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const rooms = await prisma.room.findMany({
    include: {
      players: { select: { id: true } },
      creator: { select: { id: true, name: true, email: true } },
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
      creator: room.creator,
      createdAt: room.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid table payload" }, { status: 400 });
  }

  const data = parsed.data;
  if (data.bigBlind <= data.smallBlind) {
    return NextResponse.json({ error: "Big blind must exceed small blind" }, { status: 400 });
  }
  if (data.targetBots > data.maxPlayers) {
    return NextResponse.json({ error: "Bots cannot exceed max players" }, { status: 400 });
  }

  let currency = data.type === "FREE" ? "CREDITS" : data.currency ?? "USD";
  if (data.type === "REAL") {
    const config = await prisma.currencyConfig.findUnique({
      where: { code: currency.toUpperCase() },
    });
    if (!config?.enabled) {
      return NextResponse.json({ error: `Currency ${currency} is not enabled` }, { status: 400 });
    }
    currency = config.code;
  }

  const settings = await getPlatformSettings();
  const isPrivate = data.type === "REAL" ? data.isPrivate : false;

  const room = await prisma.room.create({
    data: {
      name: data.name.trim(),
      type: data.type as RoomType,
      currency,
      buyIn: new Prisma.Decimal(data.buyIn),
      smallBlind: new Prisma.Decimal(data.smallBlind),
      bigBlind: new Prisma.Decimal(data.bigBlind),
      rakePercent:
        data.type === "REAL"
          ? new Prisma.Decimal(toNumber(settings.defaultRakePercent))
          : new Prisma.Decimal(0),
      rakeCap:
        data.type === "REAL"
          ? new Prisma.Decimal(toNumber(settings.defaultRakeCap))
          : new Prisma.Decimal(0),
      maxPlayers: data.maxPlayers,
      targetBots: data.targetBots,
      botSkillPercent: data.botSkillPercent,
      isPrivate,
      inviteCode: isPrivate ? inviteCode() : null,
      creatorId: authResult.userId,
    },
  });

  const bots = data.targetBots > 0 ? await seedBots(room.id, data.targetBots) : [];

  return NextResponse.json(
    {
      room: {
        id: room.id,
        name: room.name,
        type: room.type,
        inviteCode: room.inviteCode,
        targetBots: room.targetBots,
        botsSeeded: bots.length,
      },
    },
    { status: 201 },
  );
}

export async function PATCH(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const body = z
    .object({
      id: z.string().min(1),
      status: z.enum(["CLOSED", "WAITING"]).optional(),
      name: z.string().min(2).max(64).optional(),
      botSkillPercent: z.number().int().min(0).max(100).optional(),
      targetBots: z.number().int().min(0).max(9).optional(),
      chatEnabled: z.boolean().optional(),
    })
    .safeParse(await req.json());

  if (!body.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  const room = await prisma.room.update({
    where: { id: body.data.id },
    data: {
      ...(body.data.status ? { status: body.data.status } : {}),
      ...(body.data.name ? { name: body.data.name.trim() } : {}),
      ...(body.data.botSkillPercent != null
        ? { botSkillPercent: body.data.botSkillPercent }
        : {}),
      ...(body.data.targetBots != null ? { targetBots: body.data.targetBots } : {}),
      ...(body.data.chatEnabled != null ? { chatEnabled: body.data.chatEnabled } : {}),
    },
  });

  return NextResponse.json({
    room: {
      id: room.id,
      name: room.name,
      status: room.status,
      botSkillPercent: room.botSkillPercent,
      targetBots: room.targetBots,
      chatEnabled: room.chatEnabled,
    },
  });
}
