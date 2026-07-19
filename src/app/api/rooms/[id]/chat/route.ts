import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { CHAT_MAX_LEN, postTableChat } from "@/lib/table-chat";
import { touchPresence } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  text: z.string().min(1).max(CHAT_MAX_LEN + 20),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  try {
    await touchPresence(id, authResult.userId);
    const message = await postTableChat(id, authResult.userId, parsed.data.text);
    return NextResponse.json({ message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
