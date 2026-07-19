import { prisma } from "@/lib/prisma";
import { publishRoomEvent } from "@/lib/ably";
import { isBotUserId } from "@/lib/poker/bot";

export const CHAT_MAX_LEN = 80;
/** How long bubbles stay visible / returned from the API */
export const CHAT_VISIBLE_MS = 5_000;
const CHAT_COOLDOWN_MS = 1_800;
const CHAT_PRUNE_MS = 60_000;

export type TableChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  seat: number;
  text: string;
  name: string;
  createdAt: string;
};

function sanitizeChatText(raw: string) {
  return raw.replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LEN);
}

export async function getRecentTableChats(roomId: string): Promise<TableChatMessage[]> {
  try {
    if (!prisma.roomChatMessage) return [];
    const since = new Date(Date.now() - CHAT_VISIBLE_MS);
    const rows = await prisma.roomChatMessage.findMany({
      where: { roomId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 24,
      include: { user: { select: { name: true, email: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      roomId: row.roomId,
      userId: row.userId,
      seat: row.seat,
      text: row.text,
      name: row.user.name || row.user.email.split("@")[0] || "Player",
      createdAt: row.createdAt.toISOString(),
    }));
  } catch {
    // Never block room load if chat table/client is unavailable
    return [];
  }
}

export async function postTableChat(
  roomId: string,
  userId: string,
  text: string,
): Promise<TableChatMessage> {
  if (isBotUserId(userId)) throw new Error("Bots cannot chat");
  if (!prisma.roomChatMessage) {
    throw new Error("Chat is temporarily unavailable — restart the server");
  }

  const cleaned = sanitizeChatText(text);
  if (!cleaned) throw new Error("Message is empty");

  const player = await prisma.roomPlayer.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
  if (!player) throw new Error("Sit at the table to chat");

  const recent = await prisma.roomChatMessage.findFirst({
    where: { roomId, userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < CHAT_COOLDOWN_MS) {
    throw new Error("Wait a moment before chatting again");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  if (!user) throw new Error("User not found");

  const row = await prisma.roomChatMessage.create({
    data: {
      roomId,
      userId,
      seat: player.seat,
      text: cleaned,
    },
  });

  // Best-effort prune of old rows so the table stays tiny
  void prisma.roomChatMessage
    .deleteMany({
      where: { roomId, createdAt: { lt: new Date(Date.now() - CHAT_PRUNE_MS) } },
    })
    .catch(() => undefined);

  const message: TableChatMessage = {
    id: row.id,
    roomId,
    userId,
    seat: player.seat,
    text: cleaned,
    name: user.name || user.email.split("@")[0] || "Player",
    createdAt: row.createdAt.toISOString(),
  };

  await publishRoomEvent(roomId, "chat", message);
  return message;
}
