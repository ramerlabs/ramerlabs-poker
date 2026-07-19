import { NextResponse } from "next/server";
import { getPublicLicenseStatus, validateStored } from "@/lib/license";

export async function GET() {
  await validateStored(false);
  const status = await getPublicLicenseStatus();
  return NextResponse.json(status);
}
