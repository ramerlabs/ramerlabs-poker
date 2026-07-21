import { prisma } from "@/lib/prisma";

type RoomAccess = {
  userId: string;
  role: "USER" | "ADMIN";
};

/** User may interact with a room if seated, on waitlist, creator, or admin. */
export async function assertRoomAccess(roomId: string, auth: RoomAccess): Promise<void> {
  if (auth.role === "ADMIN") return;

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { creatorId: true },
  });
  if (!room) throw new Error("Room not found");
  if (room.creatorId === auth.userId) return;

  const [seated, waiting] = await Promise.all([
    prisma.roomPlayer.findUnique({
      where: { roomId_userId: { roomId, userId: auth.userId } },
      select: { id: true },
    }),
    prisma.roomWaitlist.findUnique({
      where: { roomId_userId: { roomId, userId: auth.userId } },
      select: { id: true },
    }),
  ]);

  if (!seated && !waiting) {
    throw new Error("You do not have access to this table");
  }
}

/** Only seated players, the room creator, or admins may start a hand. */
export async function assertCanStartHand(roomId: string, auth: RoomAccess): Promise<void> {
  if (auth.role === "ADMIN") return;

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { creatorId: true },
  });
  if (!room) throw new Error("Room not found");
  if (room.creatorId === auth.userId) return;

  const seated = await prisma.roomPlayer.findUnique({
    where: { roomId_userId: { roomId, userId: auth.userId } },
    select: { id: true },
  });
  if (!seated) {
    throw new Error("Must be seated at the table to start a hand");
  }
}
