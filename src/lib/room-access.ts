import { prisma } from "@/lib/prisma";

type RoomAccess = {
  userId: string;
  role: "USER" | "ADMIN";
};

export type RoomAccessOptions = {
  /** Invite code from query string (private rooms). */
  invite?: string | null;
};

type RoomAccessResult = {
  allowed: boolean;
  seated: boolean;
  waiting: boolean;
  isCreator: boolean;
  validInvite: boolean;
  isClubMember: boolean;
};

/** Shared gate for private/club tables — used by GET polls and mutating routes. */
export async function resolveRoomAccess(
  roomId: string,
  auth: RoomAccess,
  opts: RoomAccessOptions = {},
): Promise<RoomAccessResult> {
  if (auth.role === "ADMIN") {
    return {
      allowed: true,
      seated: false,
      waiting: false,
      isCreator: false,
      validInvite: false,
      isClubMember: false,
    };
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { creatorId: true, isPrivate: true, inviteCode: true, clubId: true },
  });
  if (!room) {
    return {
      allowed: false,
      seated: false,
      waiting: false,
      isCreator: false,
      validInvite: false,
      isClubMember: false,
    };
  }

  const isCreator = room.creatorId === auth.userId;
  const invite = opts.invite?.trim().toUpperCase() ?? "";
  const validInvite = Boolean(
    invite &&
      room.inviteCode &&
      invite === room.inviteCode.trim().toUpperCase(),
  );

  const [seatedRow, waitingRow, clubMember] = await Promise.all([
    prisma.roomPlayer.findUnique({
      where: { roomId_userId: { roomId, userId: auth.userId } },
      select: { id: true },
    }),
    prisma.roomWaitlist.findUnique({
      where: { roomId_userId: { roomId, userId: auth.userId } },
      select: { id: true },
    }),
    room.clubId
      ? prisma.clubClient.findUnique({
          where: { clubId_userId: { clubId: room.clubId, userId: auth.userId } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const seated = Boolean(seatedRow);
  const waiting = Boolean(waitingRow);
  const isClubMember = Boolean(clubMember);

  const allowed =
    !room.isPrivate ||
    seated ||
    waiting ||
    isCreator ||
    validInvite ||
    isClubMember;

  return { allowed, seated, waiting, isCreator, validInvite, isClubMember };
}

/** User may interact with a room if they pass the shared access gate. */
export async function assertRoomAccess(
  roomId: string,
  auth: RoomAccess,
  opts: RoomAccessOptions = {},
): Promise<void> {
  const access = await resolveRoomAccess(roomId, auth, opts);
  if (!access.allowed) {
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
