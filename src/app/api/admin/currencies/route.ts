import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const updateSchema = z.object({
  code: z.string().min(3).max(8),
  enabled: z.boolean().optional(),
  usdtAddress: z.string().min(8).max(128).nullable().optional(),
  gcashMerchantId: z.string().min(3).max(64).nullable().optional(),
  minDeposit: z.number().positive().optional(),
  minWithdrawal: z.number().positive().optional(),
  name: z.string().min(2).max(48).optional(),
  paymentParams: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const currencies = await prisma.currencyConfig.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json({
    currencies: currencies.map((c) => ({
      ...c,
      minDeposit: toNumber(c.minDeposit),
      minWithdrawal: toNumber(c.minWithdrawal),
    })),
  });
}

export async function PUT(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid currency update" }, { status: 400 });
  }

  const { code, ...rest } = parsed.data;
  const currency = await prisma.currencyConfig.upsert({
    where: { code: code.toUpperCase() },
    create: {
      code: code.toUpperCase(),
      name: rest.name ?? code.toUpperCase(),
      enabled: rest.enabled ?? true,
      usdtAddress: rest.usdtAddress ?? null,
      gcashMerchantId: rest.gcashMerchantId ?? null,
      minDeposit: new Prisma.Decimal(rest.minDeposit ?? 10),
      minWithdrawal: new Prisma.Decimal(rest.minWithdrawal ?? 10),
      paymentParams: (rest.paymentParams ?? {}) as Prisma.InputJsonValue,
    },
    update: {
      ...(rest.name != null ? { name: rest.name } : {}),
      ...(rest.enabled != null ? { enabled: rest.enabled } : {}),
      ...(rest.usdtAddress !== undefined ? { usdtAddress: rest.usdtAddress } : {}),
      ...(rest.gcashMerchantId !== undefined ? { gcashMerchantId: rest.gcashMerchantId } : {}),
      ...(rest.minDeposit != null ? { minDeposit: new Prisma.Decimal(rest.minDeposit) } : {}),
      ...(rest.minWithdrawal != null
        ? { minWithdrawal: new Prisma.Decimal(rest.minWithdrawal) }
        : {}),
      ...(rest.paymentParams != null
        ? { paymentParams: rest.paymentParams as Prisma.InputJsonValue }
        : {}),
    },
  });

  return NextResponse.json({
    currency: {
      ...currency,
      minDeposit: toNumber(currency.minDeposit),
      minWithdrawal: toNumber(currency.minWithdrawal),
    },
  });
}
