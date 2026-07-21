import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getGlobalCurrencyConfig } from "@/lib/currency";
import { paymentsMockEnabled } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const schema = z.object({
  gateway: z.enum(["USDT", "GCASH"]),
  amount: z.number().positive(),
  destination: z.string().min(4).max(128),
});

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "wallet-withdraw", 8, 60 * 60_000);
  if (limited) return limited;

  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid withdrawal payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: authResult.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const config = await getGlobalCurrencyConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "Currency unavailable" }, { status: 400 });
  }
  const currency = config.code;

  if (parsed.data.amount < config.minWithdrawal) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ${config.minWithdrawal} ${currency}` },
      { status: 400 },
    );
  }

  if (toNumber(user.realMoneyBalance) < parsed.data.amount) {
    return NextResponse.json({ error: "Insufficient real-money balance" }, { status: 400 });
  }

  const mock = paymentsMockEnabled();
  const metadata = {
    mock,
    destination: parsed.data.destination,
  };

  if (!mock) {
    const [tx] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          userId: user.id,
          amount: new Prisma.Decimal(parsed.data.amount),
          currency,
          gateway: parsed.data.gateway,
          type: "WITHDRAWAL",
          status: "PENDING",
          reference: `WD-${nanoid(10).toUpperCase()}`,
          metadata,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          realMoneyBalance: {
            decrement: new Prisma.Decimal(parsed.data.amount),
          },
          currentCurrency: currency,
        },
      }),
    ]);

    return NextResponse.json({
      transaction: { ...tx, amount: toNumber(tx.amount) },
      message: `Withdrawal submitted for processing (${currency}).`,
    });
  }

  const [tx] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId: user.id,
        amount: new Prisma.Decimal(parsed.data.amount),
        currency,
        gateway: parsed.data.gateway,
        type: "WITHDRAWAL",
        status: "COMPLETED",
        reference: `WD-${nanoid(10).toUpperCase()}`,
        metadata,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        realMoneyBalance: {
          decrement: new Prisma.Decimal(parsed.data.amount),
        },
        currentCurrency: currency,
      },
    }),
  ]);

  return NextResponse.json({
    transaction: { ...tx, amount: toNumber(tx.amount) },
    message: `Withdrawal completed (${currency})`,
  });
}
