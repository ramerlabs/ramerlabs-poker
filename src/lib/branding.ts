import { getPlatformSettings } from "@/lib/game-service";

export type PublicBranding = {
  siteName: string;
  tableFooter: string;
  logoUrl: string | null;
};

const DEFAULTS: PublicBranding = {
  siteName: "RamerLabs",
  tableFooter: "RamerLabs Poker",
  logoUrl: null,
};

let cached: { at: number; value: PublicBranding } | null = null;
const CACHE_MS = 60_000;

export function invalidateBrandingCache() {
  cached = null;
}

/** Cached platform branding for table felt + nav (cheap on light polls). */
export async function getPublicBranding(): Promise<PublicBranding> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const s = await getPlatformSettings();
  const value: PublicBranding = {
    siteName: s.siteName?.trim() || DEFAULTS.siteName,
    tableFooter: s.tableFooter?.trim() || DEFAULTS.tableFooter,
    logoUrl: s.logoUrl?.trim() || null,
  };
  cached = { at: Date.now(), value };
  return value;
}
