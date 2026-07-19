import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

export type OwnedClub = {
  id: string;
  name: string;
  active: boolean;
  ownerId: string;
  balance: number;
};

/** Active club owned by this user, if any. */
export async function getOwnedClub(userId: string): Promise<OwnedClub | null> {
  const club = await prisma.club.findUnique({
    where: { ownerId: userId },
    select: { id: true, name: true, active: true, ownerId: true, balance: true },
  });
  if (!club || !club.active) return null;
  return {
    id: club.id,
    name: club.name,
    active: club.active,
    ownerId: club.ownerId,
    balance: toNumber(club.balance),
  };
}

export async function isClubOwner(userId: string): Promise<boolean> {
  return Boolean(await getOwnedClub(userId));
}

type Authed = { userId: string; role: "USER" | "ADMIN" };
type AuthError = { error: NextResponse };

/** Require signed-in user who owns an active club. */
export async function requireClubOwner(): Promise<
  (Authed & { club: OwnedClub }) | AuthError
> {
  const result = await requireUser();
  if ("error" in result) return result;
  const club = await getOwnedClub(result.userId);
  if (!club) {
    return {
      error: NextResponse.json(
        { error: "Club owner access required" },
        { status: 403 },
      ),
    };
  }
  return { ...result, club };
}
