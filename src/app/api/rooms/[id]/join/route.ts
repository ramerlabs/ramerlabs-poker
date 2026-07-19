import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { joinWaitlist } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  inviteCode: z.string().optional(),
});

/** Join puts the player on the waitlist — they must click an Open seat to sit. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    include: { players: true },
  });
  if (!room || room.status === "CLOSED") {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (room.isPrivate) {
    const given = parsed.data.inviteCode?.trim().toUpperCase() ?? "";
    const expected = room.inviteCode?.trim().toUpperCase() ?? "";
    if (!given || given !== expected) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
    }
  }

  if (room.players.some((p) => p.userId === authResult.userId)) {
    return NextResponse.json({ ok: true, alreadyJoined: true, seated: true });
  }

  try {
    const result = await joinWaitlist(id, authResult.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Join failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
