import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { postTableReaction, THROWABLE_ITEMS } from "@/lib/table-reactions";
import { touchPresence } from "@/lib/table-roster";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  toUserId: z.string().min(1),
  item: z.enum(THROWABLE_ITEMS),
});

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  }

  try {
    await touchPresence(id, authResult.userId);
    const reaction = await postTableReaction(
      id,
      authResult.userId,
      parsed.data.toUserId,
      parsed.data.item,
    );
    return NextResponse.json({ reaction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reaction failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
