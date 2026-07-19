import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { joinWaitlist } from "@/lib/table-roster";
import { toNumber } from "@/lib/utils";

const schema = z.object({
  inviteCode: z.string().min(4).max(16),
  /** If true, also join the waitlist after resolving the room. */
  join: z.boolean().optional().default(true),
});

/**
 * Enter a private table by invite code only.
 * Returns room id + invite so the client can open `/rooms/[id]?invite=…`.
 */
export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid invite code" }, { status: 400 });
  }

  const code = parsed.data.inviteCode.trim().toUpperCase();
  const room = await prisma.room.findFirst({
    where: {
      inviteCode: code,
      status: { not: "CLOSED" },
    },
    include: {
      players: { select: { id: true, userId: true } },
      club: {
        select: {
          id: true,
          name: true,
          owner: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!room || !room.isPrivate || !room.inviteCode) {
    return NextResponse.json({ error: "No open table found for that invite code" }, { status: 404 });
  }

  const path = `/rooms/${room.id}?invite=${encodeURIComponent(room.inviteCode)}`;

  let waitlist: {
    waiting: boolean;
    seated?: boolean;
    position?: number | null;
    message?: string;
  } | null = null;
  let waitlistWarning: string | null = null;
  if (parsed.data.join) {
    const alreadySeated = room.players.some((p) => p.userId === authResult.userId);
    if (!alreadySeated) {
      try {
        const result = await joinWaitlist(room.id, authResult.userId);
        waitlist = {
          waiting: result.waiting,
          seated: result.seated,
          position: result.position,
          message: result.message,
        };
      } catch (error) {
        // Still open the table — user can join/sit from the room page.
        waitlistWarning =
          error instanceof Error ? error.message : "Could not auto-join waitlist";
      }
    } else {
      waitlist = { waiting: false, seated: true };
    }
  }

  return NextResponse.json({
    ok: true,
    room: {
      id: room.id,
      name: room.name,
      type: room.type,
      currency: room.currency,
      buyIn: toNumber(room.buyIn),
      smallBlind: toNumber(room.smallBlind),
      bigBlind: toNumber(room.bigBlind),
      maxPlayers: room.maxPlayers,
      playerCount: room.players.length,
      inviteCode: room.inviteCode,
      club: room.club,
    },
    waitlist,
    waitlistWarning,
    path,
    message: waitlistWarning
      ? `Opening “${room.name}”… (${waitlistWarning})`
      : `Opening “${room.name}”…`,
  });
}
