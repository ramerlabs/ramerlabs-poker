import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLicense } from "@/lib/license";
import { registrationEnabled } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { newPasswordSchema, validateNewPassword } from "@/lib/password";

const schema = z.object({
  email: z.string().email(),
  password: newPasswordSchema,
  name: z.string().min(1).max(64).optional(),
});

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "auth-register", 8, 60 * 60_000);
  if (limited) return limited;

  try {
    if (!registrationEnabled()) {
      return NextResponse.json({ error: "Registration is disabled on this site" }, { status: 403 });
    }

    const license = await requireLicense();
    if (!license.ok) return license.error;

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid registration payload" }, { status: 400 });
    }

    const passwordError = validateNewPassword(parsed.data.password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const { getGlobalCurrency } = await import("@/lib/currency");
    const currentCurrency = await getGlobalCurrency();
    const user = await prisma.user.create({
      data: {
        email,
        name: parsed.data.name ?? email.split("@")[0],
        passwordHash,
        role: "USER",
        creditsBalance: 1000,
        realMoneyBalance: 0,
        currentCurrency,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
