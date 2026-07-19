import { NextResponse } from "next/server";
import { getPublicLicenseStatus, validateStored } from "@/lib/license";

export async function GET() {
  // Prefer cached DB status for the page gate. Revalidate in the background so a
  // slow/flaky license server cannot leave the UI on "Checking license…".
  const status = await getPublicLicenseStatus();
  void validateStored(false).catch(() => {});
  return NextResponse.json(status);
}
