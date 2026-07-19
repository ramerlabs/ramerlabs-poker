import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const schema = z.object({
  clubId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  note: z.string().max(120).optional(),
  /** FREE → creditsBalance → club.balance; REAL → realMoneyBalance → club.realBalance */
  balanceKind: z.enum(["FREE", "REAL"]).optional().default("FREE"),
});

/**
 * Club member returns credits to the club float.
 */
export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Club and positive amount required" }, { status: 400 });
  }

  const { clubId, amount, note, balanceKind } = parsed.data;
  const userId = authResult.userId;
  const isReal = balanceKind === "REAL";

  const membership = await prisma.clubClient.findUnique({
    where: { clubId_userId: { clubId, userId } },
    include: {
      club: {
        select: {
          id: true,
          name: true,
          active: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!membership || !membership.club.active) {
    return NextResponse.json(
      { error: "You are not a member of this club" },
      { status: 403 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditsBalance: true, realMoneyBalance: true, email: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const wallet = isReal ? toNumber(user.realMoneyBalance) : toNumber(user.creditsBalance);
  if (wallet < amount) {
    return NextResponse.json(
      {
        error: `Insufficient ${isReal ? "real credits" : "free credits"} (have ${wallet.toLocaleString()})`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: {
          id: userId,
          ...(isReal
            ? { realMoneyBalance: { gte: new Prisma.Decimal(amount) } }
            : { creditsBalance: { gte: new Prisma.Decimal(amount) } }),
        },
        data: isReal
          ? { realMoneyBalance: { decrement: new Prisma.Decimal(amount) } }
          : { creditsBalance: { decrement: new Prisma.Decimal(amount) } },
      });
      if (debited.count !== 1) {
        throw new Error("INSUFFICIENT");
      }

      await tx.club.update({
        where: { id: clubId },
        data: isReal
          ? { realBalance: { increment: new Prisma.Decimal(amount) } }
          : { balance: { increment: new Prisma.Decimal(amount) } },
      });

      await tx.clubTransfer.create({
        data: {
          clubId,
          toUserId: userId,
          actorId: userId,
          amount: new Prisma.Decimal(amount),
          kind: "RETURN",
          note:
            note?.trim() ||
            (isReal ? "Returned real credits" : "Returned free credits"),
        },
      });

      const [updatedUser, club] = await Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          select: { creditsBalance: true, realMoneyBalance: true },
        }),
        tx.club.findUnique({
          where: { id: clubId },
          select: { balance: true, realBalance: true, name: true },
        }),
      ]);

      return {
        creditsBalance: toNumber(updatedUser?.creditsBalance ?? 0),
        realMoneyBalance: toNumber(updatedUser?.realMoneyBalance ?? 0),
        clubBalance: toNumber(club?.balance ?? 0),
        clubRealBalance: toNumber(club?.realBalance ?? 0),
        clubName: club?.name ?? membership.club.name,
        amount,
        balanceKind,
        owner: membership.club.owner,
      };
    });

    const label = isReal ? "real credits" : "free credits";
    return NextResponse.json({
      success: true,
      ...result,
      message: `Cashed out ${amount.toLocaleString()} ${label} to ${result.clubName}`,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") {
      return NextResponse.json(
        { error: `Insufficient ${isReal ? "real credits" : "free credits"}` },
        { status: 400 },
      );
    }
    console.error("club return failed", e);
    return NextResponse.json({ error: "Could not cash out to club" }, { status: 500 });
  }
}

/** Clubs the signed-in user belongs to as a client (for cashout / return forms). */
export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const memberships = await prisma.clubClient.findMany({
    where: { userId: authResult.userId, club: { active: true } },
    include: {
      club: {
        select: {
          id: true,
          name: true,
          balance: true,
          realBalance: true,
          owner: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const user = await prisma.user.findUnique({
    where: { id: authResult.userId },
    select: { creditsBalance: true, realMoneyBalance: true },
  });

  return NextResponse.json({
    memberships: memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      clubBalance: toNumber(m.club.balance),
      clubRealBalance: toNumber(m.club.realBalance),
      owner: m.club.owner,
    })),
    creditsBalance: toNumber(user?.creditsBalance ?? 0),
    realMoneyBalance: toNumber(user?.realMoneyBalance ?? 0),
  });
}
