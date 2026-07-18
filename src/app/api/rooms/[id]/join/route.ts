import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { ensureGameState, rebuildSeatsFromDb, saveTableState } from "@/lib/game-service";
import { toNumber } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  inviteCode: z.string().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    include: { players: true },
  });
  if (!room || room.status === "CLOSED") {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (room.isPrivate) {
    if (!parsed.data.inviteCode || parsed.data.inviteCode !== room.inviteCode) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
    }
  }

  if (room.players.some((p) => p.userId === authResult.userId)) {
    return NextResponse.json({ ok: true, alreadyJoined: true });
  }

  if (room.players.length >= room.maxPlayers) {
    return NextResponse.json({ error: "Room is full" }, { status: 409 });
  }

  const user = await prisma.user.findUnique({ where: { id: authResult.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const buyIn = toNumber(room.buyIn);
  const balanceField = room.type === "FREE" ? "creditsBalance" : "realMoneyBalance";
  const balance = toNumber(user[balanceField]);

  if (balance < buyIn) {
    return NextResponse.json(
      { error: `Insufficient ${room.type === "FREE" ? "credits" : "cash"} for buy-in` },
      { status: 400 },
    );
  }

  if (room.type === "REAL" && user.currentCurrency !== room.currency) {
    return NextResponse.json(
      { error: `Switch your active currency to ${room.currency} before joining` },
      { status: 400 },
    );
  }

  const taken = new Set(room.players.map((p) => p.seat));
  let seat = 0;
  while (taken.has(seat) && seat < room.maxPlayers) seat += 1;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        [balanceField]: new Prisma.Decimal(balance - buyIn),
      },
    }),
    prisma.roomPlayer.create({
      data: {
        roomId: room.id,
        userId: user.id,
        seat,
        stack: new Prisma.Decimal(buyIn),
      },
    }),
  ]);

  let state = await ensureGameState(room.id);
  state = await rebuildSeatsFromDb(room.id, state);
  await saveTableState(room.id, state);

  return NextResponse.json({ ok: true, seat });
}
