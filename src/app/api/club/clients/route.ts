import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireClubOwner } from "@/lib/club";
import { getGlobalCurrency } from "@/lib/currency";
import { toNumber } from "@/lib/utils";

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
  name: z.string().min(1).max(64).optional(),
  note: z.string().max(120).optional(),
  /** Optional initial free credits from club.balance. */
  initialCredits: z.number().min(0).max(1_000_000).optional(),
  /** Optional initial real credits from club.realBalance. */
  initialRealCredits: z.number().min(0).max(1_000_000).optional(),
});

export async function GET() {
  const authResult = await requireClubOwner();
  if ("error" in authResult) return authResult.error;

  const clients = await prisma.clubClient.findMany({
    where: { clubId: authResult.club.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          creditsBalance: true,
          realMoneyBalance: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    clients: clients.map((c) => ({
      id: c.id,
      note: c.note,
      createdAt: c.createdAt,
      user: {
        id: c.user.id,
        name: c.user.name,
        email: c.user.email,
        creditsBalance: toNumber(c.user.creditsBalance),
        realMoneyBalance: toNumber(c.user.realMoneyBalance),
        createdAt: c.user.createdAt,
      },
    })),
    clubBalance: authResult.club.balance,
    clubRealBalance: authResult.club.realBalance,
  });
}

/** Create a new player account and attach them as a club client. */
export async function POST(req: Request) {
  const authResult = await requireClubOwner();
  if ("error" in authResult) return authResult.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Email and password (min 6) required" },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const initialFree = parsed.data.initialCredits ?? 0;
  const initialReal = parsed.data.initialRealCredits ?? 0;

  if (initialFree > 0 && authResult.club.balance < initialFree) {
    return NextResponse.json(
      {
        error: `Insufficient club free credits (have ${authResult.club.balance.toLocaleString()})`,
      },
      { status: 400 },
    );
  }
  if (initialReal > 0 && authResult.club.realBalance < initialReal) {
    return NextResponse.json(
      {
        error: `Insufficient club real credits (have ${authResult.club.realBalance.toLocaleString()})`,
      },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const currentCurrency = await getGlobalCurrency();

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (initialFree > 0) {
        const funded = await tx.club.updateMany({
          where: {
            id: authResult.club.id,
            balance: { gte: new Prisma.Decimal(initialFree) },
          },
          data: { balance: { decrement: new Prisma.Decimal(initialFree) } },
        });
        if (funded.count !== 1) throw new Error("INSUFFICIENT_FREE");
      }
      if (initialReal > 0) {
        const funded = await tx.club.updateMany({
          where: {
            id: authResult.club.id,
            realBalance: { gte: new Prisma.Decimal(initialReal) },
          },
          data: { realBalance: { decrement: new Prisma.Decimal(initialReal) } },
        });
        if (funded.count !== 1) throw new Error("INSUFFICIENT_REAL");
      }

      const user = await tx.user.create({
        data: {
          email,
          name: parsed.data.name?.trim() || email.split("@")[0],
          passwordHash,
          role: "USER",
          creditsBalance: new Prisma.Decimal(initialFree),
          realMoneyBalance: new Prisma.Decimal(initialReal),
          currentCurrency,
        },
        select: {
          id: true,
          email: true,
          name: true,
          creditsBalance: true,
          realMoneyBalance: true,
        },
      });

      const client = await tx.clubClient.create({
        data: {
          clubId: authResult.club.id,
          userId: user.id,
          note: parsed.data.note?.trim() || null,
        },
      });

      if (initialFree > 0) {
        await tx.clubTransfer.create({
          data: {
            clubId: authResult.club.id,
            toUserId: user.id,
            actorId: authResult.userId,
            amount: new Prisma.Decimal(initialFree),
            kind: "ASSIGN",
            note: "Initial free credits on account create",
          },
        });
      }
      if (initialReal > 0) {
        await tx.clubTransfer.create({
          data: {
            clubId: authResult.club.id,
            toUserId: user.id,
            actorId: authResult.userId,
            amount: new Prisma.Decimal(initialReal),
            kind: "ASSIGN",
            note: "Initial real credits on account create",
          },
        });
      }

      const club = await tx.club.findUnique({
        where: { id: authResult.club.id },
        select: { balance: true, realBalance: true },
      });

      return {
        user,
        client,
        clubBalance: toNumber(club?.balance ?? 0),
        clubRealBalance: toNumber(club?.realBalance ?? 0),
      };
    });

    const parts: string[] = [];
    if (initialFree > 0) parts.push(`${initialFree.toLocaleString()} free`);
    if (initialReal > 0) parts.push(`${initialReal.toLocaleString()} real`);
    const funded = parts.length ? ` with ${parts.join(" + ")} credits` : "";

    return NextResponse.json(
      {
        client: {
          id: result.client.id,
          user: {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            creditsBalance: toNumber(result.user.creditsBalance),
            realMoneyBalance: toNumber(result.user.realMoneyBalance),
          },
        },
        clubBalance: result.clubBalance,
        clubRealBalance: result.clubRealBalance,
        message: `Client ${result.user.email} created${funded}`,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_FREE") {
      return NextResponse.json({ error: "Insufficient club free credits" }, { status: 400 });
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_REAL") {
      return NextResponse.json({ error: "Insufficient club real credits" }, { status: 400 });
    }
    console.error("create club client failed", e);
    return NextResponse.json({ error: "Could not create client" }, { status: 500 });
  }
}
