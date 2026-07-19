import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/game-service";
import { toNumber } from "@/lib/utils";

/** Site-wide cash currency code set by admin (e.g. USD, PHP). */
export async function getGlobalCurrency(): Promise<string> {
  const settings = await getPlatformSettings();
  return (settings.globalCurrency || "USD").toUpperCase();
}

/** Global currency + its CurrencyConfig (payment details, mins). */
export async function getGlobalCurrencyConfig() {
  const code = await getGlobalCurrency();
  const config = await prisma.currencyConfig.findUnique({ where: { code } });
  if (!config) {
    return {
      code,
      name: code,
      enabled: true,
      usdtAddress: null as string | null,
      gcashMerchantId: null as string | null,
      minDeposit: 10,
      minWithdrawal: 10,
    };
  }
  return {
    code: config.code,
    name: config.name,
    enabled: config.enabled,
    usdtAddress: config.usdtAddress,
    gcashMerchantId: config.gcashMerchantId,
    minDeposit: toNumber(config.minDeposit),
    minWithdrawal: toNumber(config.minWithdrawal),
  };
}

/**
 * Set platform currency and sync open REAL rooms + all users' currentCurrency
 * so legacy checks stay consistent.
 */
export async function setGlobalCurrency(code: string) {
  const upper = code.toUpperCase();
  const config = await prisma.currencyConfig.findUnique({ where: { code: upper } });
  if (!config?.enabled) {
    throw new Error(`Currency ${upper} is not enabled`);
  }

  await prisma.$transaction([
    prisma.platformSettings.upsert({
      where: { id: "default" },
      update: { globalCurrency: upper },
      create: {
        id: "default",
        globalCurrency: upper,
        houseBalances: {},
      },
    }),
    prisma.user.updateMany({ data: { currentCurrency: upper } }),
    prisma.room.updateMany({
      where: { type: "REAL", status: { not: "CLOSED" } },
      data: { currency: upper },
    }),
  ]);

  return upper;
}
