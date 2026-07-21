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
  // USDT: submitted tx hash; GCash: mobile number
  reference: z.string().min(4).max(128),
  mobileNumber: z.string().min(8).max(20).optional(),
});

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "wallet-deposit", 12, 60 * 60_000);
  if (limited) return limited;

  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deposit payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: authResult.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const config = await getGlobalCurrencyConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "Currency unavailable" }, { status: 400 });
  }
  const currency = config.code;

  if (parsed.data.amount < config.minDeposit) {
    return NextResponse.json(
      { error: `Minimum deposit is ${config.minDeposit} ${currency}` },
      { status: 400 },
    );
  }

  if (parsed.data.gateway === "GCASH" && !parsed.data.mobileNumber) {
    return NextResponse.json({ error: "GCash mobile number required" }, { status: 400 });
  }

  const mockRef =
    parsed.data.gateway === "USDT"
      ? parsed.data.reference
      : `GCASH-${nanoid(10).toUpperCase()}`;

  const mock = paymentsMockEnabled();
  const metadata = {
    mock,
    submittedReference: parsed.data.reference,
    mobileNumber: parsed.data.mobileNumber ?? null,
    usdtAddress: config.usdtAddress,
    gcashMerchantId: config.gcashMerchantId,
  };

  if (!mock) {
    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        amount: new Prisma.Decimal(parsed.data.amount),
        currency,
        gateway: parsed.data.gateway,
        type: "DEPOSIT",
        status: "PENDING",
        reference: mockRef,
        metadata,
      },
    });

    return NextResponse.json({
      transaction: { ...tx, amount: toNumber(tx.amount) },
      message: `Deposit submitted for review (${currency}). Funds will appear after admin approval.`,
    });
  }

  const [tx] = await prisma.$transaction([
    prisma.transaction.create({
      data: {
        userId: user.id,
        amount: new Prisma.Decimal(parsed.data.amount),
        currency,
        gateway: parsed.data.gateway,
        type: "DEPOSIT",
        status: "COMPLETED",
        reference: mockRef,
        metadata,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        realMoneyBalance: {
          increment: new Prisma.Decimal(parsed.data.amount),
        },
        currentCurrency: currency,
      },
    }),
  ]);

  return NextResponse.json({
    transaction: { ...tx, amount: toNumber(tx.amount) },
    message:
      parsed.data.gateway === "USDT"
        ? `USDT deposit credited (${currency})`
        : `GCash deposit credited (${currency})`,
  });
}
