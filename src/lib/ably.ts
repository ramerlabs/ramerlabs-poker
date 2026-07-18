import Ably from "ably";

/** Master switch — unset means “on when ABLY_API_KEY is present”. */
export function isAblyToggleOn() {
  const raw = process.env.ABLY_ENABLED?.trim().toLowerCase();
  if (raw == null || raw === "") return true;
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

export function getAblyRest() {
  if (!isAblyToggleOn()) return null;
  const key = process.env.ABLY_API_KEY?.trim();
  if (!key) return null;
  return new Ably.Rest({ key });
}

export function isAblyEnabled() {
  return Boolean(getAblyRest());
}

export async function publishRoomEvent(roomId: string, name: string, data: unknown) {
  const rest = getAblyRest();
  if (!rest) return false;
  try {
    const channel = rest.channels.get(`room:${roomId}`);
    await channel.publish(name, data);
    return true;
  } catch {
    return false;
  }
}

export function roomChannelName(roomId: string) {
  return `room:${roomId}`;
}
