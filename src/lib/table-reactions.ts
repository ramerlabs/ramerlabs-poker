import { prisma } from "@/lib/prisma";
import { publishRoomEvent } from "@/lib/ably";
import { isBotUserId } from "@/lib/poker/bot";

export const THROWABLE_ITEMS = [
  "ice",
  "water",
  "fireworks",
  "tomato",
  "beer",
  "crown",
  "rocket",
  "egg",
  "lightning",
  "kiss",
  "bomb",
] as const;
export type ThrowableItem = (typeof THROWABLE_ITEMS)[number];

export const THROWABLE_CATALOG: Record<
  ThrowableItem,
  { emoji: string; label: string; className: string }
> = {
  ice: { emoji: "🧊", label: "Ice bucket", className: "is-ice" },
  water: { emoji: "💦", label: "Water splash", className: "is-water" },
  fireworks: { emoji: "🎆", label: "Fireworks", className: "is-fireworks" },
  tomato: { emoji: "🍅", label: "Tomato", className: "is-tomato" },
  beer: { emoji: "🍺", label: "Cold beer", className: "is-beer" },
  crown: { emoji: "👑", label: "Crown", className: "is-crown" },
  rocket: { emoji: "🚀", label: "Rocket", className: "is-rocket" },
  egg: { emoji: "🥚", label: "Egg", className: "is-egg" },
  lightning: { emoji: "⚡", label: "Lightning", className: "is-lightning" },
  kiss: { emoji: "💋", label: "Kiss", className: "is-kiss" },
  bomb: { emoji: "💣", label: "Bomb", className: "is-bomb" },
};

export const REACTION_COOLDOWN_MS = 3_500;
export const REACTION_VISIBLE_MS = 4_200;

export type TableReactionEvent = {
  id: string;
  roomId: string;
  fromUserId: string;
  fromSeat: number;
  toUserId: string;
  toSeat: number;
  item: ThrowableItem;
  fromName: string;
  toName: string;
  createdAt: string;
};

const lastReactionAt = new Map<string, number>();

function displayName(name: string | null, email: string) {
  return name || email.split("@")[0] || "Player";
}

export async function postTableReaction(
  roomId: string,
  fromUserId: string,
  toUserId: string,
  item: ThrowableItem,
): Promise<TableReactionEvent> {
  if (isBotUserId(fromUserId)) throw new Error("Bots cannot throw items");
  if (fromUserId === toUserId) throw new Error("Pick another player");

  const cooldownKey = `${roomId}:${fromUserId}`;
  const lastAt = lastReactionAt.get(cooldownKey) ?? 0;
  if (Date.now() - lastAt < REACTION_COOLDOWN_MS) {
    throw new Error("Wait a moment before throwing again");
  }

  const [fromPlayer, toPlayer] = await Promise.all([
    prisma.roomPlayer.findUnique({
      where: { roomId_userId: { roomId, userId: fromUserId } },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.roomPlayer.findUnique({
      where: { roomId_userId: { roomId, userId: toUserId } },
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  if (!fromPlayer) throw new Error("Sit at the table to throw items");
  if (!toPlayer) throw new Error("That player is not seated");

  const event: TableReactionEvent = {
    id: `rx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    roomId,
    fromUserId,
    fromSeat: fromPlayer.seat,
    toUserId,
    toSeat: toPlayer.seat,
    item,
    fromName: displayName(fromPlayer.user.name, fromPlayer.user.email),
    toName: displayName(toPlayer.user.name, toPlayer.user.email),
    createdAt: new Date().toISOString(),
  };

  lastReactionAt.set(cooldownKey, Date.now());
  await publishRoomEvent(roomId, "reaction", event);
  return event;
}
