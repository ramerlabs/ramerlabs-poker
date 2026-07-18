import Ably from "ably";

export function getAblyRest() {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  return new Ably.Rest({ key });
}

export function isAblyEnabled() {
  return Boolean(process.env.ABLY_API_KEY);
}

export async function publishRoomEvent(roomId: string, name: string, data: unknown) {
  const rest = getAblyRest();
  if (!rest) return false;
  const channel = rest.channels.get(`room:${roomId}`);
  await channel.publish(name, data);
  return true;
}

export function roomChannelName(roomId: string) {
  return `room:${roomId}`;
}
