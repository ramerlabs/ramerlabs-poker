import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/game-service";
import { requireAdmin } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const schema = z.object({
  defaultRakePercent: z.number().min(0).max(20).optional(),
  defaultRakeCap: z.number().min(0).optional(),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const settings = await getPlatformSettings();
  const recent = await prisma.rakeEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { room: { select: { name: true, type: true } } },
  });

  return NextResponse.json({
    settings: {
      defaultRakePercent: toNumber(settings.defaultRakePercent),
      defaultRakeCap: toNumber(settings.defaultRakeCap),
      houseBalances: settings.houseBalances ?? {},
    },
    recent: recent.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      roomName: r.room.name,
      handNumber: r.handNumber,
      amount: toNumber(r.amount),
      currency: r.currency,
      createdAt: r.createdAt,
    })),
  });
}

export async function PUT(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid rake settings" }, { status: 400 });
  }

  const settings = await prisma.platformSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultRakePercent: new Prisma.Decimal(parsed.data.defaultRakePercent ?? 5),
      defaultRakeCap: new Prisma.Decimal(parsed.data.defaultRakeCap ?? 3),
      houseBalances: {},
    },
    update: {
      ...(parsed.data.defaultRakePercent != null
        ? { defaultRakePercent: new Prisma.Decimal(parsed.data.defaultRakePercent) }
        : {}),
      ...(parsed.data.defaultRakeCap != null
        ? { defaultRakeCap: new Prisma.Decimal(parsed.data.defaultRakeCap) }
        : {}),
    },
  });

  return NextResponse.json({
    settings: {
      defaultRakePercent: toNumber(settings.defaultRakePercent),
      defaultRakeCap: toNumber(settings.defaultRakeCap),
      houseBalances: settings.houseBalances ?? {},
    },
  });
}
