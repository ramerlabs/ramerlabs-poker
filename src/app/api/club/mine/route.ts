import { NextResponse } from "next/server";
import { getOwnedClub } from "@/lib/club";
import { requireUser } from "@/lib/session";

/** Current user's club (if admin made them an owner). */
export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const club = await getOwnedClub(authResult.userId);
  return NextResponse.json({
    club,
    canCreateTables: Boolean(club),
  });
}
