import Ably from "ably";
import { prisma } from "@/lib/prisma";

/** Env kill-switch — unset means allow DB/admin settings. */
function isEnvAblyAllowed() {
  const raw = process.env.ABLY_ENABLED?.trim().toLowerCase();
  if (raw == null || raw === "") return true;
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

type AblyConfig = {
  enabled: boolean;
  apiKey: string | null;
  source: "admin" | "env" | "off";
  hasKey: boolean;
  adminEnabled: boolean;
};

export async function getAblyConfig(): Promise<AblyConfig> {
  if (!isEnvAblyAllowed()) {
    return {
      enabled: false,
      apiKey: null,
      source: "off",
      hasKey: false,
      adminEnabled: false,
    };
  }

  const settings = await prisma.platformSettings
    .findUnique({ where: { id: "default" } })
    .catch(() => null);

  const envKey = process.env.ABLY_API_KEY?.trim() || null;
  const dbKey = settings?.ablyApiKey?.trim() || null;
  const apiKey = dbKey || envKey;
  const hasKey = Boolean(apiKey);

  // Admin toggle defaults to true when column missing / new install
  const adminEnabled = settings?.ablyEnabled ?? true;
  const enabled = adminEnabled && hasKey;

  return {
    enabled,
    apiKey,
    source: !adminEnabled ? "off" : dbKey ? "admin" : envKey ? "env" : "off",
    hasKey,
    adminEnabled,
  };
}

export async function getAblyRest() {
  const cfg = await getAblyConfig();
  if (!cfg.enabled || !cfg.apiKey) return null;
  return new Ably.Rest({ key: cfg.apiKey });
}

export async function isAblyEnabled() {
  const cfg = await getAblyConfig();
  return cfg.enabled;
}

export async function publishRoomEvent(roomId: string, name: string, data: unknown) {
  const rest = await getAblyRest();
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

/** Mask key for admin UI: show app id + last 4 chars */
export function maskAblyKey(key: string | null | undefined) {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length < 12) return "••••••••";
  const [appPart] = trimmed.split(":");
  const tail = trimmed.slice(-4);
  return `${appPart}:••••••••${tail}`;
}
