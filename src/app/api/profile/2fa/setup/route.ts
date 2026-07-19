import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  encryptTotpSecret,
  generateTotpSecret,
  totpQrDataUrl,
} from "@/lib/totp";

/** Start 2FA setup — returns QR + pending secret (not enabled until verified). */
export async function POST() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const user = await prisma.user.findUnique({
    where: { id: authResult.userId },
    select: { email: true, totpEnabled: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (user.totpEnabled) {
    return NextResponse.json({ error: "Two-factor authentication is already enabled" }, { status: 400 });
  }

  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret);
  await prisma.user.update({
    where: { id: authResult.userId },
    data: { totpTempSecret: encrypted },
  });

  const { uri, qrDataUrl } = await totpQrDataUrl(secret, user.email);
  return NextResponse.json({
    qrDataUrl,
    otpauthUrl: uri,
    secret,
    message: "Scan the QR code with your authenticator app, then enter a 6-digit code to confirm.",
  });
}

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const user = await prisma.user.findUnique({
    where: { id: authResult.userId },
    select: { totpEnabled: true, email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    enabled: user.totpEnabled,
    email: user.email,
  });
}
