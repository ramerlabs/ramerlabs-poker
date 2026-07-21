import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { assertRoomAccess } from "@/lib/room-access";
import { touchPresence } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    await assertRoomAccess(id, authResult);
    await touchPresence(id, authResult.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
