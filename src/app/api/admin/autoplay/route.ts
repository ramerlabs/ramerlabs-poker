import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { getAutoPlayConfig, invalidateAutoPlayCache } from "@/lib/autoplay";

const schema = z.object({
  enabled: z.boolean().optional(),
  skillPercent: z.number().int().min(0).max(100).optional(),
});

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const config = await getAutoPlayConfig();
  return NextResponse.json({ settings: config });
}

export async function PUT(req: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Autoplay settings" }, { status: 400 });
  }

  const data: { autoPlayEnabled?: boolean; autoPlaySkillPercent?: number } = {};
  if (parsed.data.enabled != null) data.autoPlayEnabled = parsed.data.enabled;
  if (parsed.data.skillPercent != null) data.autoPlaySkillPercent = parsed.data.skillPercent;

  await prisma.platformSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultRakePercent: 5,
      defaultRakeCap: 3,
      houseBalances: {},
      autoPlayEnabled: data.autoPlayEnabled ?? true,
      autoPlaySkillPercent: data.autoPlaySkillPercent ?? 80,
    },
    update: data,
  });

  invalidateAutoPlayCache();
  const config = await getAutoPlayConfig();
  return NextResponse.json({ settings: config });
}
