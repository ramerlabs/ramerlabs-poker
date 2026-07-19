import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { toNumber } from "@/lib/utils";

const genCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 10);

const createSchema = z.object({
  kind: z.enum(["CREDITS", "CASH"]),
  amount: z.number().positive().max(1_000_000),
  currency: z.string().min(3).max(8).optional(),
  maxClaims: z.number().int().min(1).max(100_000).default(1),
  code: z
    .string()
    .min(4)
    .max(32)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  expiresAt: z.string().min(1).nullable().optional(),
  note: z.string().max(200).optional(),
});

const patchSchema = z.object({
  id: z.string().min(1),
  active: z.boolean().optional(),
  note: z.string().max(200).nullable().optional(),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const coupons = await prisma.coupon.findMany({
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      _count: { select: { claims: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    coupons: coupons.map((c) => ({
      id: c.id,
      code: c.code,
      kind: c.kind,
      amount: toNumber(c.amount),
      currency: c.currency,
      maxClaims: c.maxClaims,
      claimCount: c.claimCount,
      claimsRecorded: c._count.claims,
      expiresAt: c.expiresAt,
      active: c.active,
      note: c.note,
      createdBy: c.createdBy,
      createdAt: c.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid coupon payload" }, { status: 400 });
  }

  const data = parsed.data;
  if (data.kind === "CASH") {
    const { getGlobalCurrency } = await import("@/lib/currency");
    const currency = await getGlobalCurrency();
    const config = await prisma.currencyConfig.findUnique({ where: { code: currency } });
    if (!config?.enabled) {
      return NextResponse.json(
        { error: `Platform currency ${currency} is not enabled` },
        { status: 400 },
      );
    }
  }

  const code = (data.code || genCode()).toUpperCase();
  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json({ error: "Coupon code already exists" }, { status: 400 });
  }

  let cashCurrency: string | null = null;
  if (data.kind === "CASH") {
    const { getGlobalCurrency } = await import("@/lib/currency");
    cashCurrency = await getGlobalCurrency();
  }

  let expiresAt: Date | null = null;
  if (data.expiresAt) {
    const parsedDate = new Date(data.expiresAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Invalid expiry date" }, { status: 400 });
    }
    expiresAt = parsedDate;
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      kind: data.kind,
      amount: new Prisma.Decimal(data.amount),
      currency: cashCurrency,
      maxClaims: data.maxClaims,
      expiresAt,
      note: data.note?.trim() || null,
      createdById: authResult.userId,
    },
  });

  return NextResponse.json({
    coupon: {
      id: coupon.id,
      code: coupon.code,
      kind: coupon.kind,
      amount: toNumber(coupon.amount),
      currency: coupon.currency,
      maxClaims: coupon.maxClaims,
      claimCount: coupon.claimCount,
      expiresAt: coupon.expiresAt,
      active: coupon.active,
      note: coupon.note,
      createdAt: coupon.createdAt,
    },
    message: `Coupon ${coupon.code} created`,
  });
}

export async function PATCH(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  const { id, ...patch } = parsed.data;
  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    },
  });

  return NextResponse.json({
    coupon: {
      id: coupon.id,
      code: coupon.code,
      active: coupon.active,
      note: coupon.note,
    },
  });
}
