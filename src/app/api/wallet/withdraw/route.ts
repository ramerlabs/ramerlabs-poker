import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const schema = z.object({
  gateway: z.enum(["USDT", "GCASH"]),
  amount: z.number().positive(),
  destination: z.string().min(4).max(128),
});

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid withdrawal payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: authResult.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const currency = user.currentCurrency;
  const config = await prisma.currencyConfig.findUnique({ where: { code: currency } });
  if (!config?.enabled) {
    return NextResponse.json({ error: "Currency unavailable" }, { status: 400 });
  }

  if (parsed.data.amount < toNumber(config.minWithdrawal)) {
    return NextResponse.json(
      { error: `Minimum withdrawal is ${toNumber(config.minWithdrawal)} ${currency}` },
      { status: 400 },
    );
  }

  if (toNumber(user.realMoneyBalance) < parsed.data.amount) {
    return NextResponse.json({ error: "Insufficient real-money balance" }, { status: 400 });
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
        metadata: {
          mock: true,
          destination: parsed.data.destination,
        },
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        realMoneyBalance: {
          decrement: new Prisma.Decimal(parsed.data.amount),
        },
      },
    }),
  ]);

  return NextResponse.json({
    transaction: { ...tx, amount: toNumber(tx.amount) },
    message: "Mock withdrawal completed",
  });
}
