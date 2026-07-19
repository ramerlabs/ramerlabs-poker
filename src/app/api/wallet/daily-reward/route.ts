import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";
import {
  DAILY_REWARD_CREDITS,
  alreadyClaimedDailyReward,
  manilaDayKey,
  manilaDayStartUtc,
} from "@/lib/daily-reward";

export const dynamic = "force-dynamic";

/**
 * Claim once-per-calendar-day system CREDITS for active players.
 * Idempotent — safe to call on every app load after login.
 */
export async function POST() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const userId = authResult.userId;
  const dayKey = manilaDayKey();
  const dayStart = manilaDayStartUtc();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          creditsBalance: true,
          realMoneyBalance: true,
          currentCurrency: true,
          lastDailyRewardAt: true,
        },
      });
      if (!user) {
        return { granted: false as const, reason: "not_found" as const };
      }

      if (alreadyClaimedDailyReward(user.lastDailyRewardAt)) {
        return {
          granted: false as const,
          reason: "already_claimed" as const,
          wallet: {
            creditsBalance: toNumber(user.creditsBalance),
            realMoneyBalance: toNumber(user.realMoneyBalance),
            currentCurrency: user.currentCurrency,
          },
        };
      }

      // Race-safe: only one claim wins if two tabs hit at once
      const updated = await tx.user.updateMany({
        where: {
          id: userId,
          OR: [{ lastDailyRewardAt: null }, { lastDailyRewardAt: { lt: dayStart } }],
        },
        data: {
          creditsBalance: { increment: DAILY_REWARD_CREDITS },
          lastDailyRewardAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        const fresh = await tx.user.findUnique({
          where: { id: userId },
          select: {
            creditsBalance: true,
            realMoneyBalance: true,
            currentCurrency: true,
          },
        });
        return {
          granted: false as const,
          reason: "already_claimed" as const,
          wallet: fresh
            ? {
                creditsBalance: toNumber(fresh.creditsBalance),
                realMoneyBalance: toNumber(fresh.realMoneyBalance),
                currentCurrency: fresh.currentCurrency,
              }
            : null,
        };
      }

      await tx.transaction.create({
        data: {
          userId,
          amount: DAILY_REWARD_CREDITS,
          currency: "CREDITS",
          gateway: "COUPON",
          type: "BONUS",
          status: "COMPLETED",
          reference: `DAILY-${dayKey}`,
          metadata: {
            kind: "DAILY_LOGIN",
            amount: DAILY_REWARD_CREDITS,
            dayKey,
          },
        },
      });

      const after = await tx.user.findUnique({
        where: { id: userId },
        select: {
          creditsBalance: true,
          realMoneyBalance: true,
          currentCurrency: true,
        },
      });

      return {
        granted: true as const,
        amount: DAILY_REWARD_CREDITS,
        dayKey,
        wallet: after
          ? {
              creditsBalance: toNumber(after.creditsBalance),
              realMoneyBalance: toNumber(after.realMoneyBalance),
              currentCurrency: after.currentCurrency,
            }
          : null,
      };
    });

    if (!result.granted) {
      return NextResponse.json({
        granted: false,
        reason: result.reason,
        wallet: "wallet" in result ? result.wallet : null,
      });
    }

    return NextResponse.json({
      granted: true,
      amount: result.amount,
      dayKey: result.dayKey,
      wallet: result.wallet,
      message: `Daily reward claimed! +${result.amount.toLocaleString()} free system credits added to your wallet. Come back tomorrow to claim again.`,
    });
  } catch (e) {
    console.error("daily reward failed", e);
    return NextResponse.json({ error: "Could not claim daily reward" }, { status: 500 });
  }
}
