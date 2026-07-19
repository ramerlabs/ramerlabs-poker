import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const user = await prisma.user.findUnique({
    where: { id: authResult.userId },
    select: {
      id: true,
      email: true,
      name: true,
      creditsBalance: true,
      realMoneyBalance: true,
      currentCurrency: true,
      role: true,
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const transactions = await prisma.transaction.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const currencies = await prisma.currencyConfig.findMany({
    where: { enabled: true },
    orderBy: { code: "asc" },
  });

  return NextResponse.json({
    wallet: {
      creditsBalance: toNumber(user.creditsBalance),
      realMoneyBalance: toNumber(user.realMoneyBalance),
      currentCurrency: user.currentCurrency,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    currencies: currencies.map((c) => ({
      code: c.code,
      name: c.name,
      usdtAddress: c.usdtAddress,
      gcashMerchantId: c.gcashMerchantId,
      minDeposit: toNumber(c.minDeposit),
      minWithdrawal: toNumber(c.minWithdrawal),
    })),
    transactions: transactions.map((t) => ({
      ...t,
      amount: toNumber(t.amount),
    })),
  });
}
