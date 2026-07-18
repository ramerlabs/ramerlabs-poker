import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { joinWaitlist, leaveWaitlist } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  inviteCode: z.string().optional(),
  preferredSeat: z.number().int().min(0).max(20).optional(),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room || room.status === "CLOSED") {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (room.isPrivate) {
    if (!parsed.success || !parsed.data.inviteCode || parsed.data.inviteCode !== room.inviteCode) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
    }
  }

  try {
    const preferredSeat = parsed.success ? parsed.data.preferredSeat : undefined;
    const result = await joinWaitlist(id, authResult.userId, preferredSeat);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not join waitlist";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  await leaveWaitlist(id, authResult.userId);
  return NextResponse.json({ ok: true });
}
