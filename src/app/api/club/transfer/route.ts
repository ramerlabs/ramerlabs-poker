import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireClubOwner } from "@/lib/club";
import { toNumber } from "@/lib/utils";

const schema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  note: z.string().max(120).optional(),
});

/** Assign credits from club balance → client creditsBalance. */
export async function POST(req: Request) {
  const authResult = await requireClubOwner();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Client and positive amount required" }, { status: 400 });
  }

  const { userId, amount, note } = parsed.data;
  const membership = await prisma.clubClient.findUnique({
    where: {
      clubId_userId: { clubId: authResult.club.id, userId },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "User is not a client of your club" }, { status: 404 });
  }

  if (authResult.club.balance < amount) {
    return NextResponse.json(
      {
        error: `Insufficient club balance (have ${authResult.club.balance.toLocaleString()})`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const funded = await tx.club.updateMany({
        where: {
          id: authResult.club.id,
          balance: { gte: new Prisma.Decimal(amount) },
        },
        data: { balance: { decrement: new Prisma.Decimal(amount) } },
      });
      if (funded.count !== 1) {
        throw new Error("INSUFFICIENT");
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: { creditsBalance: { increment: new Prisma.Decimal(amount) } },
        select: {
          id: true,
          email: true,
          name: true,
          creditsBalance: true,
        },
      });

      await tx.clubTransfer.create({
        data: {
          clubId: authResult.club.id,
          toUserId: userId,
          actorId: authResult.userId,
          amount: new Prisma.Decimal(amount),
          note: note?.trim() || null,
        },
      });

      const club = await tx.club.findUnique({
        where: { id: authResult.club.id },
        select: { balance: true },
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          creditsBalance: toNumber(user.creditsBalance),
        },
        clubBalance: toNumber(club?.balance ?? 0),
        amount,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
      message: `Assigned ${amount.toLocaleString()} credits to ${result.user.email}`,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") {
      return NextResponse.json({ error: "Insufficient club balance" }, { status: 400 });
    }
    console.error("club transfer failed", e);
    return NextResponse.json({ error: "Could not assign credits" }, { status: 500 });
  }
}
