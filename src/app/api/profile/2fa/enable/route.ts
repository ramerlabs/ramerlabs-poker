import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";

const schema = z.object({
  code: z.string().min(6).max(8),
});

/** Confirm setup code — enables 2FA. */
export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the 6-digit authenticator code" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: authResult.userId },
    select: { totpTempSecret: true, totpEnabled: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.totpEnabled) {
    return NextResponse.json({ error: "Two-factor authentication is already enabled" }, { status: 400 });
  }
  if (!user.totpTempSecret) {
    return NextResponse.json({ error: "Start 2FA setup first" }, { status: 400 });
  }

  let secret: string;
  try {
    secret = decryptTotpSecret(user.totpTempSecret);
  } catch {
    return NextResponse.json({ error: "Invalid setup secret — start again" }, { status: 400 });
  }

  if (!verifyTotpCode(secret, parsed.data.code)) {
    return NextResponse.json({ error: "Invalid authenticator code" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: authResult.userId },
    data: {
      totpSecret: user.totpTempSecret,
      totpTempSecret: null,
      totpEnabled: true,
    },
  });

  return NextResponse.json({ success: true, message: "Two-factor authentication enabled." });
}
