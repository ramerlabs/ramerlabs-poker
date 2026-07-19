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

let ablyConfigCache: { at: number; value: AblyConfig } | null = null;
const ABLY_CONFIG_TTL_MS = 15_000;

export async function getAblyConfig(): Promise<AblyConfig> {
  if (ablyConfigCache && Date.now() - ablyConfigCache.at < ABLY_CONFIG_TTL_MS) {
    return ablyConfigCache.value;
  }

  if (!isEnvAblyAllowed()) {
    const off: AblyConfig = {
      enabled: false,
      apiKey: null,
      source: "off",
      hasKey: false,
      adminEnabled: false,
    };
    ablyConfigCache = { at: Date.now(), value: off };
    return off;
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

  const value: AblyConfig = {
    enabled,
    apiKey,
    source: !adminEnabled ? "off" : dbKey ? "admin" : envKey ? "env" : "off",
    hasKey,
    adminEnabled,
  };
  ablyConfigCache = { at: Date.now(), value };
  return value;
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
    // Don't let Ably latency block game/seat API responses
    await Promise.race([
      channel.publish(name, data),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("ably publish timeout")), 1200),
      ),
    ]);
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
