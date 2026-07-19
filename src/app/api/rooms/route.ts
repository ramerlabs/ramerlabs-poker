import { NextResponse } from "next/server";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { Prisma, RoomType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings, tickOpenRooms } from "@/lib/game-service";
import { requireLicenseOptionalUser, requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const inviteCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

const createSchema = z.object({
  name: z.string().min(3).max(48),
  type: z.enum(["FREE", "REAL"]),
  currency: z.string().min(3).max(8).optional(),
  buyIn: z.number().positive(),
  smallBlind: z.number().positive(),
  bigBlind: z.number().positive(),
  maxPlayers: z.number().int().min(2).max(9).default(8),
  isPrivate: z.boolean().default(false),
});

export async function GET() {
  const authResult = await requireLicenseOptionalUser();
  if ("error" in authResult && authResult.error) return authResult.error;
  const viewerId = authResult.userId;
  const isAdmin = authResult.role === "ADMIN";

  // Keep bot-only tables dealing in the background when lobby is open
  await tickOpenRooms(6);

  const rooms = await prisma.room.findMany({
    where: { status: { not: "CLOSED" } },
    include: {
      players: { select: { id: true, userId: true, seat: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    rooms: rooms.map((room) => {
      const canSeeInvite =
        Boolean(viewerId) && (room.creatorId === viewerId || isAdmin);
      return {
        ...room,
        buyIn: toNumber(room.buyIn),
        smallBlind: toNumber(room.smallBlind),
        bigBlind: toNumber(room.bigBlind),
        inviteCode: room.isPrivate && canSeeInvite ? room.inviteCode : null,
      };
    }),
  });
}

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid room payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  if (data.bigBlind <= data.smallBlind) {
    return NextResponse.json({ error: "Big blind must exceed small blind" }, { status: 400 });
  }

  let currency = data.currency ?? (data.type === "FREE" ? "CREDITS" : "USD");

  if (data.type === "REAL") {
    const user = await prisma.user.findUnique({ where: { id: authResult.userId } });
    currency = data.currency ?? user?.currentCurrency ?? "USD";
    const config = await prisma.currencyConfig.findUnique({ where: { code: currency } });
    if (!config?.enabled) {
      return NextResponse.json({ error: `Currency ${currency} is not enabled` }, { status: 400 });
    }
  } else {
    currency = "CREDITS";
  }

  const isPrivate = data.type === "REAL" ? data.isPrivate : false;
  const settings = await getPlatformSettings();
  const rakePercent =
    data.type === "REAL" ? toNumber(settings.defaultRakePercent) : 0;
  const rakeCap = data.type === "REAL" ? toNumber(settings.defaultRakeCap) : 0;

  const room = await prisma.room.create({
    data: {
      name: data.name,
      type: data.type as RoomType,
      currency,
      buyIn: new Prisma.Decimal(data.buyIn),
      smallBlind: new Prisma.Decimal(data.smallBlind),
      bigBlind: new Prisma.Decimal(data.bigBlind),
      rakePercent: new Prisma.Decimal(rakePercent),
      rakeCap: new Prisma.Decimal(rakeCap),
      maxPlayers: data.maxPlayers,
      isPrivate,
      inviteCode: isPrivate ? inviteCode() : null,
      creatorId: authResult.userId,
    },
  });

  return NextResponse.json(
    {
      room: {
        ...room,
        buyIn: toNumber(room.buyIn),
        smallBlind: toNumber(room.smallBlind),
        bigBlind: toNumber(room.bigBlind),
      },
    },
    { status: 201 },
  );
}
