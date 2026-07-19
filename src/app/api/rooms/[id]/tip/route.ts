import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { tipDealer } from "@/lib/game-service";
import { toPublicState } from "@/lib/poker/engine";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  amount: z.number().positive().optional(),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  let amount: number | undefined;
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid tip" }, { status: 400 });
    }
    amount = parsed.data.amount;
  } catch {
    // empty body is fine — default tip amount
  }

  try {
    const result = await tipDealer(id, authResult.userId, amount);
    return NextResponse.json({
      tip: result.tip,
      state: toPublicState(result.state, authResult.userId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tip failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
