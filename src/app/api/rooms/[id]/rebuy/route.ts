import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { rebuySeatedPlayer, touchPresence } from "@/lib/table-roster";
import { publishRoomEvent } from "@/lib/ably";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  buyInAmount: z.number().positive(),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  try {
    const result = await rebuySeatedPlayer(
      id,
      authResult.userId,
      parsed.data.buyInAmount,
    );
    void touchPresence(id, authResult.userId);
    void publishRoomEvent(id, "state", {
      reason: "rebuy",
      userId: authResult.userId,
    });
    return NextResponse.json({
      ok: true,
      amount: result.amount,
      newStack: result.newStack,
      currency: result.currency,
      walletSource: result.walletSource,
      walletBalance: result.walletBalance,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add chips";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
