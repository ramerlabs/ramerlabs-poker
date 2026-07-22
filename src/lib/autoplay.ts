import { prisma } from "@/lib/prisma";

export type AutoPlayConfig = {
  enabled: boolean;
  skillPercent: number;
};

const DEFAULTS: AutoPlayConfig = {
  enabled: true,
  skillPercent: 80,
};

let cached: { at: number; value: AutoPlayConfig } | null = null;
const CACHE_MS = 30_000;

export function invalidateAutoPlayCache() {
  cached = null;
}

/** Cached platform Autoplay gate + skill (used by room ticks + table UI). */
export async function getAutoPlayConfig(): Promise<AutoPlayConfig> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const s = await prisma.platformSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      defaultRakePercent: 5,
      defaultRakeCap: 3,
      houseBalances: {},
      autoPlayEnabled: true,
      autoPlaySkillPercent: 80,
    },
  });
  const skill = Number(s.autoPlaySkillPercent ?? DEFAULTS.skillPercent);
  const value: AutoPlayConfig = {
    enabled: s.autoPlayEnabled !== false,
    skillPercent: Number.isFinite(skill)
      ? Math.max(0, Math.min(100, Math.round(skill)))
      : DEFAULTS.skillPercent,
  };
  cached = { at: Date.now(), value };
  return value;
}
