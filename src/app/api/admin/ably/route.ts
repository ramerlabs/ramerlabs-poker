import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { getAblyConfig, maskAblyKey } from "@/lib/ably";

const schema = z.object({
  ablyEnabled: z.boolean().optional(),
  ablyApiKey: z.string().max(200).optional().nullable(),
  clearApiKey: z.boolean().optional(),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const settings = await prisma.platformSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      defaultRakePercent: 5,
      defaultRakeCap: 3,
      houseBalances: {},
      ablyEnabled: true,
    },
  });

  const cfg = await getAblyConfig();
  const envHasKey = Boolean(process.env.ABLY_API_KEY?.trim());

  return NextResponse.json({
    settings: {
      ablyEnabled: settings.ablyEnabled,
      hasAdminKey: Boolean(settings.ablyApiKey?.trim()),
      adminKeyMasked: maskAblyKey(settings.ablyApiKey),
      envKeyConfigured: envHasKey,
      active: cfg.enabled,
      mode: cfg.enabled ? "ably" : "polling",
      keySource: cfg.source,
    },
  });
}

export async function PUT(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Ably settings" }, { status: 400 });
  }

  const data: { ablyEnabled?: boolean; ablyApiKey?: string | null } = {};
  if (parsed.data.ablyEnabled != null) data.ablyEnabled = parsed.data.ablyEnabled;
  if (parsed.data.clearApiKey) data.ablyApiKey = null;
  else if (parsed.data.ablyApiKey != null) {
    const key = parsed.data.ablyApiKey.trim();
    // Ignore masked placeholder submissions
    if (key && !key.includes("••••")) data.ablyApiKey = key;
  }

  const settings = await prisma.platformSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultRakePercent: 5,
      defaultRakeCap: 3,
      houseBalances: {},
      ablyEnabled: data.ablyEnabled ?? true,
      ablyApiKey: data.ablyApiKey ?? null,
    },
    update: data,
  });

  const cfg = await getAblyConfig();

  return NextResponse.json({
    settings: {
      ablyEnabled: settings.ablyEnabled,
      hasAdminKey: Boolean(settings.ablyApiKey?.trim()),
      adminKeyMasked: maskAblyKey(settings.ablyApiKey),
      envKeyConfigured: Boolean(process.env.ABLY_API_KEY?.trim()),
      active: cfg.enabled,
      mode: cfg.enabled ? "ably" : "polling",
      keySource: cfg.source,
    },
  });
}
