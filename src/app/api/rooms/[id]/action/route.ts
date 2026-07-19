import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { performAction, startRoomHand } from "@/lib/game-service";
import { toPublicState } from "@/lib/poker/engine";
import { touchPresence } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["fold", "check", "call", "bet", "raise", "allin", "start"]),
  amount: z.number().nonnegative().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  try {
    await touchPresence(id, authResult.userId);
    if (parsed.data.action === "start") {
      const state = await startRoomHand(id);
      return NextResponse.json({ state: toPublicState(state, authResult.userId) });
    }

    const state = await performAction(
      id,
      authResult.userId,
      parsed.data.action,
      parsed.data.amount,
    );
    return NextResponse.json({ state: toPublicState(state, authResult.userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
