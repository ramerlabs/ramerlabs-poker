import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(32, "Name must be at most 32 characters")
    .regex(/^[a-zA-Z0-9 _.\-]+$/, "Use letters, numbers, spaces, . _ or - only"),
});

export async function PATCH(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult && authResult.error) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid name" },
      { status: 400 },
    );
  }

  const user = await prisma.user.update({
    where: { id: authResult.userId },
    data: { name: parsed.data.name },
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json({ user });
}
