import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { leaveTable, joinWaitlist } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  try {
    // Try a normal leave (handles mid-hand pending leave case too)
    const result = await leaveTable(id, authResult.userId);

    if (result.pending) {
      // Mid-hand: we set pendingLeave + folded. Add to waitlist now so they
      // get re-seated once the hand ends and cash-out completes.
      await joinWaitlist(id, authResult.userId);
      return NextResponse.json({ pending: true, ok: true });
    }

    // Player was cashed out. Add to waitlist so they can auto-sit when a seat opens.
    await joinWaitlist(id, authResult.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not stand up";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}