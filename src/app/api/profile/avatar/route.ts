import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateAvatarDataUrl } from "@/lib/avatar";
import { requireUser } from "@/lib/session";

const uploadSchema = z.object({
  avatarUrl: z.string().min(32).max(220_000),
});

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = uploadSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid avatar upload" }, { status: 400 });
  }

  const check = validateAvatarDataUrl(parsed.data.avatarUrl);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: authResult.userId },
    data: { avatarUrl: parsed.data.avatarUrl },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });

  return NextResponse.json({
    user,
    message: "Avatar updated",
  });
}

export async function DELETE() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  await prisma.user.update({
    where: { id: authResult.userId },
    data: { avatarUrl: null },
  });

  return NextResponse.json({ success: true, message: "Avatar removed" });
}
