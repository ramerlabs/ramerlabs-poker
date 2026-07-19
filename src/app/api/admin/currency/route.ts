import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getGlobalCurrency,
  getGlobalCurrencyConfig,
  setGlobalCurrency,
} from "@/lib/currency";
import { requireAdmin } from "@/lib/session";

const putSchema = z.object({
  currency: z.string().min(3).max(8),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const [globalCurrency, config, currencies] = await Promise.all([
    getGlobalCurrency(),
    getGlobalCurrencyConfig(),
    prisma.currencyConfig.findMany({
      where: { enabled: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
  ]);

  return NextResponse.json({
    globalCurrency,
    config,
    options: currencies,
  });
}

export async function PUT(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }

  try {
    const globalCurrency = await setGlobalCurrency(parsed.data.currency);
    const config = await getGlobalCurrencyConfig();
    return NextResponse.json({
      globalCurrency,
      config,
      message: `Platform currency set to ${globalCurrency}. All real-money transactions and open cash tables now use ${globalCurrency}.`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not set currency" },
      { status: 400 },
    );
  }
}
