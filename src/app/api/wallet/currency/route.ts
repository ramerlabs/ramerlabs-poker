import { NextResponse } from "next/server";
import { getGlobalCurrency } from "@/lib/currency";
import { requireUser } from "@/lib/session";

/** Currency is platform-wide — users cannot switch it. */
export async function POST() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const currentCurrency = await getGlobalCurrency();
  return NextResponse.json({
    currentCurrency,
    message: "Currency is set by the platform admin and cannot be changed per account.",
  });
}
