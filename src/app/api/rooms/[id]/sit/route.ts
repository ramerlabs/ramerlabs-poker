import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { claimSeat, touchPresence } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  seat: z.number().int().min(0).max(20),
  inviteCode: z.string().optional(),
  /** Chosen buy-in; must be >= room minimum. Defaults to minimum if omitted. */
  buyInAmount: z.number().positive().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid seat" }, { status: 400 });
  }

  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      players: { select: { userId: true } },
      waitlist: { select: { userId: true } },
    },
  });
  if (!room || room.status === "CLOSED") {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  const alreadyIn =
    room.players.some((p) => p.userId === authResult.userId) ||
    room.waitlist.some((w) => w.userId === authResult.userId);

  if (room.isPrivate && !alreadyIn) {
    if (!parsed.data.inviteCode || parsed.data.inviteCode !== room.inviteCode) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 403 });
    }
  }

  try {
    const result = await claimSeat(
      id,
      authResult.userId,
      parsed.data.seat,
      parsed.data.buyInAmount,
    );
    // Presence can finish after the client already gets the sit result
    void touchPresence(id, authResult.userId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
