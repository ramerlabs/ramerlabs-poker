import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number | string, currency = "USD") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function toNumber(value: { toString(): string } | number | string | null | undefined) {
  if (value == null) return 0;
  return Number(value.toString());
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
