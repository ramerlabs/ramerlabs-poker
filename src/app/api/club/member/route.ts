import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOwnedClub } from "@/lib/club";
import { requireUser } from "@/lib/session";
import { toNumber } from "@/lib/utils";

/** Club member dashboard: memberships and joinable club tables. */
export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const owned = await getOwnedClub(authResult.userId);
  if (owned) {
    return NextResponse.json({ error: "Use the club owner dashboard" }, { status: 403 });
  }

  const memberships = await prisma.clubClient.findMany({
    where: { userId: authResult.userId, club: { active: true } },
    include: {
      club: {
        select: {
          id: true,
          name: true,
          owner: { select: { name: true, email: true } },
          rooms: {
            where: { status: { not: "CLOSED" } },
            include: { players: { select: { id: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (memberships.length === 0) {
    return NextResponse.json({ error: "You are not a club member" }, { status: 403 });
  }

  return NextResponse.json({
    memberships: memberships.map((m) => ({
      clubId: m.club.id,
      clubName: m.club.name,
      owner: m.club.owner,
      memberCreditsBalance: toNumber(m.creditsBalance),
      memberRealMoneyBalance: toNumber(m.realMoneyBalance),
      tables: m.club.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        type: room.type,
        currency: room.currency,
        buyIn: toNumber(room.buyIn),
        smallBlind: toNumber(room.smallBlind),
        bigBlind: toNumber(room.bigBlind),
        maxPlayers: room.maxPlayers,
        targetBots: room.targetBots,
        botSkillPercent: room.botSkillPercent,
        chatEnabled: room.chatEnabled,
        isPrivate: room.isPrivate,
        inviteCode: room.isPrivate ? room.inviteCode : null,
        status: room.status,
        playerCount: room.players.length,
      })),
    })),
  });
}
