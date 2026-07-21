import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/game-service";
import { invalidateBrandingCache } from "@/lib/branding";
import { requireAdmin } from "@/lib/session";

const schema = z.object({
  siteName: z.string().min(1).max(80).optional(),
  tableFooter: z.string().min(1).max(80).optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const settings = await getPlatformSettings();
  return NextResponse.json({
    branding: {
      siteName: settings.siteName ?? "RamerLabs",
      tableFooter: settings.tableFooter ?? "RamerLabs Poker",
      logoUrl: settings.logoUrl ?? null,
    },
  });
}

export async function PUT(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid branding settings" }, { status: 400 });
  }

  const settings = await prisma.platformSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultRakePercent: 5,
      defaultRakeCap: 3,
      houseBalances: {},
      globalCurrency: "USD",
      ablyEnabled: true,
      siteName: parsed.data.siteName ?? "RamerLabs",
      tableFooter: parsed.data.tableFooter ?? "RamerLabs Poker",
      logoUrl: parsed.data.logoUrl ?? null,
    },
    update: {
      ...(parsed.data.siteName != null ? { siteName: parsed.data.siteName } : {}),
      ...(parsed.data.tableFooter != null ? { tableFooter: parsed.data.tableFooter } : {}),
      ...("logoUrl" in parsed.data ? { logoUrl: parsed.data.logoUrl } : {}),
    },
  });

  invalidateBrandingCache();

  return NextResponse.json({
    branding: {
      siteName: settings.siteName ?? "RamerLabs",
      tableFooter: settings.tableFooter ?? "RamerLabs Poker",
      logoUrl: settings.logoUrl ?? null,
    },
    message: "Branding saved",
  });
}
