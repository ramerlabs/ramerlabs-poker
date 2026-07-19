import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(72),
});

/**
 * Password check before NextAuth sign-in.
 * Returns { requires2fa: true } when the account has TOTP enabled.
 */
export async function POST(req: Request) {
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true, totpEnabled: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      requires2fa: Boolean(user.totpEnabled),
    });
  } catch (e) {
    console.error("prelogin failed", e);
    const poolBusy =
      e instanceof Error &&
      (/connection pool|P2024|Timed out fetching a new connection/i.test(e.message) ||
        (e as { code?: string }).code === "P2024");
    return NextResponse.json(
      {
        error: poolBusy
          ? "Server is busy — wait a moment and try again"
          : "Could not verify credentials",
      },
      { status: 500 },
    );
  }
}
