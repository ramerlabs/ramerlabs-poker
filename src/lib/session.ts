import { auth } from "@/lib/auth";
import { requireLicense } from "@/lib/license";
import { NextResponse } from "next/server";

export async function requireUser() {
  const license = await requireLicense();
  if ("error" in license) return license;

  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session, userId: session.user.id, role: session.user.role };
}

/** License required; signed-in user optional (e.g. lobby list). */
export async function requireLicenseOptionalUser() {
  const license = await requireLicense();
  if ("error" in license) return license;

  const session = await auth();
  return {
    session,
    userId: session?.user?.id ?? null,
    role: session?.user?.role ?? null,
  };
}

export async function requireAdmin() {
  const result = await requireUser();
  if ("error" in result && result.error) return result;
  if (result.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}
