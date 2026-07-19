import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({
  currency: z.string().min(3).max(8),
});

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  }

  const config = await prisma.currencyConfig.findUnique({
    where: { code: parsed.data.currency.toUpperCase() },
  });
  if (!config?.enabled) {
    return NextResponse.json({ error: "Currency not available" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: authResult.userId },
    data: { currentCurrency: config.code },
    select: { currentCurrency: true },
  });

  return NextResponse.json({ currentCurrency: user.currentCurrency });
}
