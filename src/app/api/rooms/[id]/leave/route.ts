import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { disconnectPlayer } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  try {
    const result = await disconnectPlayer(id, authResult.userId);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not leave table";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
