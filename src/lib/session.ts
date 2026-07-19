import { auth } from "@/lib/auth";
import { requireLicense } from "@/lib/license";
import { NextResponse } from "next/server";

type Authed = {
  userId: string;
  role: "USER" | "ADMIN";
};

type AuthError = { error: NextResponse };

export async function requireUser(): Promise<Authed | AuthError> {
  const license = await requireLicense();
  if (!license.ok) return { error: license.error };

  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return {
    userId: session.user.id,
    role: session.user.role as "USER" | "ADMIN",
  };
}

/** License required; signed-in user optional (e.g. lobby list). */
export async function requireLicenseOptionalUser(): Promise<
  AuthError | { userId: string | null; role: "USER" | "ADMIN" | null }
> {
  const license = await requireLicense();
  if (!license.ok) return { error: license.error };

  const session = await auth();
  const role = session?.user?.role;
  return {
    userId: session?.user?.id ?? null,
    role: role === "ADMIN" || role === "USER" ? role : null,
  };
}

export async function requireAdmin(): Promise<Authed | AuthError> {
  const result = await requireUser();
  if ("error" in result) return result;
  if (result.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}
