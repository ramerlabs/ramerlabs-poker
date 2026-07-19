import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGlobalCurrencyConfig } from "@/lib/currency";
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
      role: true,
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [transactions, globalConfig] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getGlobalCurrencyConfig(),
  ]);

  return NextResponse.json({
    wallet: {
      creditsBalance: toNumber(user.creditsBalance),
      realMoneyBalance: toNumber(user.realMoneyBalance),
      currentCurrency: globalConfig.code,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    currency: {
      code: globalConfig.code,
      name: globalConfig.name,
      usdtAddress: globalConfig.usdtAddress,
      gcashMerchantId: globalConfig.gcashMerchantId,
      minDeposit: globalConfig.minDeposit,
      minWithdrawal: globalConfig.minWithdrawal,
    },
    /** @deprecated use `currency` — kept for older clients */
    currencies: [
      {
        code: globalConfig.code,
        name: globalConfig.name,
        usdtAddress: globalConfig.usdtAddress,
        gcashMerchantId: globalConfig.gcashMerchantId,
        minDeposit: globalConfig.minDeposit,
        minWithdrawal: globalConfig.minWithdrawal,
      },
    ],
    transactions: transactions.map((t) => ({
      ...t,
      amount: toNumber(t.amount),
    })),
  });
}
