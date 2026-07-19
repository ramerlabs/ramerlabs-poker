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
  /** FREE → ClubClient.creditsBalance → club.balance; REAL → ClubClient.realMoneyBalance → club.realBalance */
  balanceKind: z.enum(["FREE", "REAL"]).optional().default("FREE"),
});

/**
 * Club member returns credits from their club wallet back to the club float.
 * Does not touch the system (User) wallet.
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

  const memberWallet = isReal
    ? toNumber(membership.realMoneyBalance)
    : toNumber(membership.creditsBalance);
  if (memberWallet < amount) {
    return NextResponse.json(
      {
        error: `Insufficient club ${isReal ? "real" : "free"} credits (have ${memberWallet.toLocaleString()})`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const debited = await tx.clubClient.updateMany({
        where: {
          id: membership.id,
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
            (isReal ? "Returned real club credits" : "Returned free club credits"),
        },
      });

      const [updatedClient, club] = await Promise.all([
        tx.clubClient.findUnique({
          where: { id: membership.id },
          select: { creditsBalance: true, realMoneyBalance: true },
        }),
        tx.club.findUnique({
          where: { id: clubId },
          select: { name: true },
        }),
      ]);

      return {
        memberCreditsBalance: toNumber(updatedClient?.creditsBalance ?? 0),
        memberRealMoneyBalance: toNumber(updatedClient?.realMoneyBalance ?? 0),
        clubName: club?.name ?? membership.club.name,
        amount,
        balanceKind,
        owner: membership.club.owner,
      };
    });

    const label = isReal ? "real club credits" : "free club credits";
    return NextResponse.json({
      success: true,
      ...result,
      message: `Cashed out ${amount.toLocaleString()} ${label} to ${result.clubName}`,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") {
      return NextResponse.json(
        { error: `Insufficient club ${isReal ? "real" : "free"} credits` },
        { status: 400 },
      );
    }
    console.error("club return failed", e);
    return NextResponse.json({ error: "Could not cash out to club" }, { status: 500 });
  }
}

/** Clubs the signed-in user belongs to (member wallets only — never club float). */
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
          owner: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    memberships: memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      owner: m.club.owner,
      /** Member club wallets — not the club float. */
      memberCreditsBalance: toNumber(m.creditsBalance),
      memberRealMoneyBalance: toNumber(m.realMoneyBalance),
    })),
  });
}
