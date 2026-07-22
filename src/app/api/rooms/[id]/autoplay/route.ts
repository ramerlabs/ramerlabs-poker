import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getAutoPlayConfig } from "@/lib/autoplay";
import { publishRoomEvent } from "@/lib/ably";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  enabled: z.boolean(),
});

/** Toggle Autoplay for the seated player at this table. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const config = await getAutoPlayConfig();
  if (parsed.data.enabled && !config.enabled) {
    return NextResponse.json(
      { error: "Autoplay is disabled by the site admin" },
      { status: 403 },
    );
  }

  const player = await prisma.roomPlayer.findUnique({
    where: { roomId_userId: { roomId: id, userId: authResult.userId } },
  });
  if (!player) {
    return NextResponse.json({ error: "Sit at the table to use Autoplay" }, { status: 400 });
  }

  const updated = await prisma.roomPlayer.update({
    where: { id: player.id },
    data: { autoPlay: parsed.data.enabled },
    select: { autoPlay: true },
  });

  void publishRoomEvent(id, "state", {
    reason: "autoplay",
    userId: authResult.userId,
    enabled: updated.autoPlay,
  });

  return NextResponse.json({
    ok: true,
    enabled: updated.autoPlay,
    skillPercent: config.skillPercent,
    featureEnabled: config.enabled,
  });
}
