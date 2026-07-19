import { prisma } from "@/lib/prisma";

export type OwnedClub = {
  id: string;
  name: string;
  active: boolean;
  ownerId: string;
};

/** Active club owned by this user, if any. */
export async function getOwnedClub(userId: string): Promise<OwnedClub | null> {
  const club = await prisma.club.findUnique({
    where: { ownerId: userId },
    select: { id: true, name: true, active: true, ownerId: true },
  });
  if (!club || !club.active) return null;
  return club;
}

export async function isClubOwner(userId: string): Promise<boolean> {
  return Boolean(await getOwnedClub(userId));
}
