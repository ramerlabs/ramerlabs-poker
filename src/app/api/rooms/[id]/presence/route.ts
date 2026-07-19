import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { purgeStalePlayers, touchPresence } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  await touchPresence(id, authResult.userId);
  await purgeStalePlayers(id);
  return NextResponse.json({ ok: true });
}
