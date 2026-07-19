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
});

/**
 * Club member returns credits to the club float.
 * Deducts from the member's creditsBalance and credits Club.balance.
 */
export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Club and positive amount required" }, { status: 400 });
  }

  const { clubId, amount, note } = parsed.data;
  const userId = authResult.userId;

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
    select: { creditsBalance: true, email: true, name: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (toNumber(user.creditsBalance) < amount) {
    return NextResponse.json(
      {
        error: `Insufficient credits (have ${toNumber(user.creditsBalance).toLocaleString()})`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const debited = await tx.user.updateMany({
        where: {
          id: userId,
          creditsBalance: { gte: new Prisma.Decimal(amount) },
        },
        data: { creditsBalance: { decrement: new Prisma.Decimal(amount) } },
      });
      if (debited.count !== 1) {
        throw new Error("INSUFFICIENT");
      }

      await tx.club.update({
        where: { id: clubId },
        data: { balance: { increment: new Prisma.Decimal(amount) } },
      });

      await tx.clubTransfer.create({
        data: {
          clubId,
          toUserId: userId,
          actorId: userId,
          amount: new Prisma.Decimal(amount),
          kind: "RETURN",
          note: note?.trim() || null,
        },
      });

      const [updatedUser, club] = await Promise.all([
        tx.user.findUnique({
          where: { id: userId },
          select: { creditsBalance: true },
        }),
        tx.club.findUnique({
          where: { id: clubId },
          select: { balance: true, name: true },
        }),
      ]);

      return {
        creditsBalance: toNumber(updatedUser?.creditsBalance ?? 0),
        clubBalance: toNumber(club?.balance ?? 0),
        clubName: club?.name ?? membership.club.name,
        amount,
        owner: membership.club.owner,
      };
    });

    return NextResponse.json({
      success: true,
      ...result,
      message: `Returned ${amount.toLocaleString()} credits to ${result.clubName}`,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT") {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 400 });
    }
    console.error("club return failed", e);
    return NextResponse.json({ error: "Could not return credits" }, { status: 500 });
  }
}

/** Clubs the signed-in user belongs to as a client (for return form). */
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

  const user = await prisma.user.findUnique({
    where: { id: authResult.userId },
    select: { creditsBalance: true },
  });

  return NextResponse.json({
    memberships: memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      owner: m.club.owner,
    })),
    creditsBalance: toNumber(user?.creditsBalance ?? 0),
  });
}
