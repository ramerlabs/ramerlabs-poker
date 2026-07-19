import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const schema = z.object({
  code: z.string().min(4).max(32),
});

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid coupon code" }, { status: 400 });
  }

  const code = parsed.data.code.trim().toUpperCase();
  const userId = authResult.userId;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.findUnique({ where: { code } });
      if (!coupon || !coupon.active) {
        throw new ClaimError("Invalid or inactive coupon code");
      }
      if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) {
        throw new ClaimError("This coupon has expired");
      }
      if (coupon.claimCount >= coupon.maxClaims) {
        throw new ClaimError("This coupon has reached its claim limit");
      }

      const already = await tx.couponClaim.findUnique({
        where: {
          couponId_userId: { couponId: coupon.id, userId },
        },
      });
      if (already) {
        throw new ClaimError("You already claimed this coupon");
      }

      const amount = coupon.amount;
      let currency: string;
      if (coupon.kind === "CREDITS") {
        currency = "CREDITS";
      } else {
        const { getGlobalCurrency } = await import("@/lib/currency");
        currency = await getGlobalCurrency();
      }

      await tx.couponClaim.create({
        data: {
          couponId: coupon.id,
          userId,
          amount,
          currency,
        },
      });

      const updated = await tx.coupon.updateMany({
        where: {
          id: coupon.id,
          active: true,
          claimCount: { lt: coupon.maxClaims },
        },
        data: { claimCount: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ClaimError("This coupon has reached its claim limit");
      }

      if (coupon.kind === "CREDITS") {
        await tx.user.update({
          where: { id: userId },
          data: { creditsBalance: { increment: amount } },
        });
      } else {
        await tx.user.update({
          where: { id: userId },
          data: { realMoneyBalance: { increment: amount } },
        });
      }

      await tx.transaction.create({
        data: {
          userId,
          amount,
          currency,
          gateway: "COUPON",
          type: "BONUS",
          status: "COMPLETED",
          reference: coupon.code,
          metadata: {
            couponId: coupon.id,
            kind: coupon.kind,
          },
        },
      });

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          creditsBalance: true,
          realMoneyBalance: true,
          currentCurrency: true,
        },
      });

      return {
        kind: coupon.kind,
        amount: toNumber(amount),
        currency,
        code: coupon.code,
        wallet: user
          ? {
              creditsBalance: toNumber(user.creditsBalance),
              realMoneyBalance: toNumber(user.realMoneyBalance),
              currentCurrency: user.currentCurrency,
            }
          : null,
      };
    });

    const label =
      result.kind === "CREDITS"
        ? `${result.amount.toLocaleString()} credits`
        : `${result.amount} ${result.currency}`;

    return NextResponse.json({
      success: true,
      claim: result,
      message: `Coupon claimed — +${label} added to your wallet.`,
    });
  } catch (e) {
    if (e instanceof ClaimError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "You already claimed this coupon" }, { status: 400 });
    }
    console.error("coupon claim failed", e);
    return NextResponse.json({ error: "Could not claim coupon" }, { status: 500 });
  }
}

class ClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaimError";
  }
}
