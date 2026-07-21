import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Known ISO 4217 currency codes used by the platform. */
const ISO_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "PHP", "CAD", "AUD", "INR", "SGD", "MYR",
]);

export function formatMoney(amount: number | string, currency = "USD") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  const safe = Number.isFinite(value) ? value : 0;
  if (!ISO_CURRENCIES.has(currency)) {
    // Custom labels (e.g. "TIPS" for FREE-room tips) — format as plain number with label
    return `${currency} ${safe.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function toNumber(value: { toString(): string } | number | string | null | undefined) {
  if (value == null) return 0;
  return Number(value.toString());
}

/** Round chip/money values to avoid float artifacts like 0.030000000000000002. */
export function roundMoney(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Display chips with fixed decimal places (default 2). */
export function formatChips(amount: number | string, decimals = 2): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return roundMoney(Number.isFinite(n) ? n : 0, decimals).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Plain chip string for inputs (no thousands separators). */
export function chipAmountString(amount: number, decimals = 2): string {
  return roundMoney(amount, decimals).toFixed(decimals);
}

/** Parse a fetch Response as JSON; avoid cryptic errors when the server returns HTML. */
export async function readJson<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 80);
    throw new Error(
      res.ok
        ? `Invalid server response (${snippet})`
        : `Request failed (${res.status}). ${snippet.startsWith("<!") ? "Server returned a page instead of JSON." : snippet}`,
    );
  }
}
