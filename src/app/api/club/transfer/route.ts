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
  /** FREE → club.balance → creditsBalance; REAL → club.realBalance → realMoneyBalance */
  balanceKind: z.enum(["FREE", "REAL"]).optional().default("FREE"),
});

/** Assign free or real credits from club float → client wallet. */
export async function POST(req: Request) {
  const authResult = await requireClubOwner();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Client and positive amount required" }, { status: 400 });
  }

  const { userId, amount, note, balanceKind } = parsed.data;
  const isReal = balanceKind === "REAL";

  const membership = await prisma.clubClient.findUnique({
    where: {
      clubId_userId: { clubId: authResult.club.id, userId },
    },
  });
  if (!membership) {
    return NextResponse.json({ error: "User is not a client of your club" }, { status: 404 });
  }

  const available = isReal ? authResult.club.realBalance : authResult.club.balance;
  if (available < amount) {
    return NextResponse.json(
      {
        error: `Insufficient club ${isReal ? "real" : "free"} credits (have ${available.toLocaleString()})`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const funded = await tx.club.updateMany({
        where: {
          id: authResult.club.id,
          ...(isReal
            ? { realBalance: { gte: new Prisma.Decimal(amount) } }
            : { balance: { gte: new Prisma.Decimal(amount) } }),
        },
        data: isReal
          ? { realBalance: { decrement: new Prisma.Decimal(amount) } }
          : { balance: { decrement: new Prisma.Decimal(amount) } },
      });
      if (funded.count !== 1) {
        throw new Error("INSUFFICIENT");
      }

      const user = await tx.user.update({
        where: { id: userId },
        data: isReal
          ? { realMoneyBalance: { increment: new Prisma.Decimal(amount) } }
          : { creditsBalance: { increment: new Prisma.Decimal(amount) } },
        select: {
          id: true,
          email: true,
          name: true,
          creditsBalance: true,
          realMoneyBalance: true,
        },
      });

      await tx.clubTransfer.create({
        data: {
          clubId: authResult.club.id,
          toUserId: userId,
          actorId: authResult.userId,
          amount: new Prisma.Decimal(amount),
          kind: "ASSIGN",
          note:
            note?.trim() ||
            (isReal ? "Assigned real credits" : "Assigned free credits"),
        },
      });

      const club = await tx.club.findUnique({
        where: { id: authResult.club.id },
        select: { balance: true, realBalance: true },
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          creditsBalance: toNumber(user.creditsBalance),
          realMoneyBalance: toNumber(user.realMoneyBalance),
        },
        clubBalance: toNumber(club?.balance ?? 0),
        clubRealBalance: toNumber(club?.realBalance ?? 0),
        amount,
        balanceKind,
      };
    });

    const label = isReal ? "real credits" : "free credits";
    return NextResponse.json({
      success: true,
      ...result,
      message: `Assigned ${amount.toLocaleString()} ${label} to ${result.user.email}`,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") {
      return NextResponse.json(
        { error: `Insufficient club ${isReal ? "real" : "free"} credits` },
        { status: 400 },
      );
    }
    console.error("club transfer failed", e);
    return NextResponse.json({ error: "Could not assign credits" }, { status: 500 });
  }
}
