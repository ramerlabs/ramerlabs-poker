import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { TOTP, Secret } from "otpauth";
import QRCode from "qrcode";
import { getAuthSecret } from "@/lib/env";

const ISSUER = "RamerLabs Poker";

function encryptionKey(): Buffer {
  return createHash("sha256").update(getAuthSecret()).digest();
}

/** Encrypt a TOTP secret for DB storage. */
export function encryptTotpSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptTotpSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function createTotp(secretBase32: string, label: string) {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function verifyTotpCode(secretBase32: string, token: string): boolean {
  const code = String(token || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const totp = createTotp(secretBase32, "verify");
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export async function totpQrDataUrl(secretBase32: string, email: string): Promise<{
  uri: string;
  qrDataUrl: string;
}> {
  const totp = createTotp(secretBase32, email);
  const uri = totp.toString();
  const qrDataUrl = await QRCode.toDataURL(uri, {
    margin: 1,
    width: 220,
    color: { dark: "#1a1205", light: "#f5f0e6" },
  });
  return { uri, qrDataUrl };
}
