import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { decryptTotpSecret, verifyTotpCode } from "@/lib/totp";

const schema = z.object({
  password: z.string().min(6).max(72),
  code: z.string().min(6).max(8),
});

/** Disable 2FA — requires password + current authenticator code. */
export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Password and authenticator code required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: authResult.userId },
    select: { passwordHash: true, totpSecret: true, totpEnabled: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!user.totpEnabled || !user.totpSecret) {
    return NextResponse.json({ error: "Two-factor authentication is not enabled" }, { status: 400 });
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Password is incorrect" }, { status: 400 });
  }

  let secret: string;
  try {
    secret = decryptTotpSecret(user.totpSecret);
  } catch {
    return NextResponse.json({ error: "Could not verify authenticator" }, { status: 400 });
  }

  if (!verifyTotpCode(secret, parsed.data.code)) {
    return NextResponse.json({ error: "Invalid authenticator code" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: authResult.userId },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpTempSecret: null,
    },
  });

  return NextResponse.json({ success: true, message: "Two-factor authentication disabled." });
}
