/** Daily free system credits for active players (not real money). */
export const DAILY_REWARD_CREDITS = 2000;

/** Calendar day in Asia/Manila (YYYY-MM-DD). */
export function manilaDayKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Midnight Asia/Manila for the given instant, as a UTC Date. */
export function manilaDayStartUtc(date = new Date()): Date {
  const key = manilaDayKey(date);
  return new Date(`${key}T00:00:00+08:00`);
}

export function alreadyClaimedDailyReward(lastDailyRewardAt: Date | null | undefined): boolean {
  if (!lastDailyRewardAt) return false;
  return manilaDayKey(lastDailyRewardAt) === manilaDayKey();
}
