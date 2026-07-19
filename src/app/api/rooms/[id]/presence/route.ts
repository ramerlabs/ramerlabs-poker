import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { touchPresence } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  await touchPresence(id, authResult.userId);
  // Purge is throttled inside purgeStalePlayers / roster — keep presence light
  return NextResponse.json({ ok: true });
}
