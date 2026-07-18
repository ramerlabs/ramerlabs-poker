import { NextResponse } from "next/server";
import { z } from "zod";
import { addBotOpponent, kickBot } from "@/lib/table-roster";
import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  try {
    const bot = await addBotOpponent(id);
    return NextResponse.json({ ok: true, bot }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add bot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const kickSchema = z.object({
  userId: z.string().min(1),
});

export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireAdmin();
  if ("error" in authResult && authResult.error) return authResult.error;

  const body = await req.json().catch(() => ({}));
  const parsed = kickSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const result = await kickBot(id, parsed.data.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not kick bot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
