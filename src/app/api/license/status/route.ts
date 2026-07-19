import { NextResponse } from "next/server";
import { getPublicLicenseStatus } from "@/lib/license";

/**
 * UI gate only. Returns cached DB status immediately.
 * Does not block on remote validate (that was freezing "Checking license…").
 * Background revalidation is optional and never clears an active key mid-play
 * (see validateStored soft-fail rules).
 */
export async function GET() {
  const status = await getPublicLicenseStatus();
  return NextResponse.json(status);
}
