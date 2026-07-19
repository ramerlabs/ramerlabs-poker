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
  // USDT: submitted tx hash; GCash: mobile number
  reference: z.string().min(4).max(128),
  mobileNumber: z.string().min(8).max(20).optional(),
});

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deposit payload" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: authResult.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const currency = user.currentCurrency;
  const config = await prisma.currencyConfig.findUnique({ where: { code: currency } });
  if (!config?.enabled) {
    return NextResponse.json({ error: "Currency unavailable" }, { status: 400 });
  }

  if (parsed.data.amount < toNumber(config.minDeposit)) {
    return NextResponse.json(
      { error: `Minimum deposit is ${toNumber(config.minDeposit)} ${currency}` },
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

  // Mock gateway: auto-complete and credit real-money balance
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
        metadata: {
          mock: true,
          submittedReference: parsed.data.reference,
          mobileNumber: parsed.data.mobileNumber ?? null,
          usdtAddress: config.usdtAddress,
          gcashMerchantId: config.gcashMerchantId,
        },
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        realMoneyBalance: {
          increment: new Prisma.Decimal(parsed.data.amount),
        },
      },
    }),
  ]);

  return NextResponse.json({
    transaction: { ...tx, amount: toNumber(tx.amount) },
    message:
      parsed.data.gateway === "USDT"
        ? "USDT deposit credited after hash submission"
        : "GCash deposit credited with reference confirmation",
  });
}
