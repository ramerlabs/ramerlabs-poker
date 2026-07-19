import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireClubOwner } from "@/lib/club";
import { toNumber } from "@/lib/utils";

/** Club dashboard summary for the signed-in owner. */
export async function GET() {
  const authResult = await requireClubOwner();
  if ("error" in authResult) return authResult.error;

  const club = await prisma.club.findUnique({
    where: { id: authResult.club.id },
    include: {
      _count: { select: { clients: true, rooms: true } },
      transfers: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          toUser: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!club) {
    return NextResponse.json({ error: "Club not found" }, { status: 404 });
  }

  return NextResponse.json({
    club: {
      id: club.id,
      name: club.name,
      active: club.active,
      balance: toNumber(club.balance),
      clientCount: club._count.clients,
      roomCount: club._count.rooms,
    },
    transfers: club.transfers.map((t) => ({
      id: t.id,
      amount: toNumber(t.amount),
      kind: t.kind,
      note: t.note,
      createdAt: t.createdAt,
      toUser: t.toUser,
    })),
  });
}
