import { NextResponse } from "next/server";
import { deactivate } from "@/lib/license";
import { requireAdmin } from "@/lib/session";

export async function POST() {
  const admin = await requireAdmin();
  if ("error" in admin) return admin.error;

  try {
    const result = await deactivate();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { success: false, message: "Could not deactivate license." },
      { status: 500 },
    );
  }
}
