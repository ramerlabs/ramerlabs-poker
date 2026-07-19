import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { licenseServerUrl } from "@/lib/rlm-internal";

export const PRODUCT_SLUG = "ramerlabs-poker";
export const SITE_NAME = process.env.LICENSE_SITE_NAME || "RamerLabs Poker";
export const BUY_URL =
  process.env.LICENSE_BUY_URL || "https://ramerlabs.com/product/ramerlabs-poker/";

const LICENSE_SETTING_KEY = "rlm_license";
/** How often background revalidation may contact the license server. */
const REVALIDATE_MS = 24 * 60 * 60 * 1000; // 24 hours
/** In-memory cache so room polls (1–2s) do not hit Prisma for license every time. */
const MEMORY_TTL_MS = 60_000;

type LicenseState = {
  license_key: string;
  valid: boolean;
  activated_at?: string;
  last_validated_at?: string;
  last_error?: string;
};

type MemoryCache = {
  at: number;
  state: LicenseState | null;
};

let memoryCache: MemoryCache | null = null;

function siteUrl(): string {
  // Always prefer the public production domain so activate/validate match
  // the domain already licensed on ramerlabs.com (preview URLs used to desync).
  const raw =
    process.env.LICENSE_SITE_URL?.trim() ||
    (process.env.VERCEL || process.env.NODE_ENV === "production"
      ? "https://poker.ramerlabs.com"
      : "") ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "";
  const cleaned = raw.replace(/\/$/, "");
  if (cleaned) {
    if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) return cleaned;
    return `https://${cleaned}`;
  }
  return "http://localhost:3000";
}

function licenseSkip(): boolean {
  const v = (process.env.LICENSE_SKIP || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function bumpMemory(state: LicenseState | null) {
  memoryCache = { at: Date.now(), state };
}

async function readState(): Promise<LicenseState | null> {
  if (memoryCache && Date.now() - memoryCache.at < MEMORY_TTL_MS) {
    return memoryCache.state;
  }
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: LICENSE_SETTING_KEY } });
    if (!row?.value || typeof row.value !== "object") {
      bumpMemory(null);
      return null;
    }
    const state = row.value as LicenseState;
    bumpMemory(state);
    return state;
  } catch {
    return memoryCache?.state ?? null;
  }
}

async function writeState(state: LicenseState): Promise<void> {
  bumpMemory(state);
  await prisma.appSetting.upsert({
    where: { key: LICENSE_SETTING_KEY },
    create: { key: LICENSE_SETTING_KEY, value: state },
    update: { value: state },
  });
}

async function clearState(): Promise<void> {
  bumpMemory(null);
  try {
    await prisma.appSetting.delete({ where: { key: LICENSE_SETTING_KEY } });
  } catch {
    // ignore missing
  }
}

async function postLicense(endpoint: string, body: Record<string, unknown>) {
  const url = `${licenseServerUrl()}/wp-json/ramerlabs-license/v1/${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export function publicStatus(extra: Record<string, unknown> = {}) {
  return {
    buy_url: BUY_URL,
    site_name: SITE_NAME,
    ...extra,
  };
}

/** Fast local check only — used by every gameplay API. Never calls remote server. */
export async function getCachedLicenseValid(): Promise<boolean> {
  if (licenseSkip()) return true;
  const state = await readState();
  return Boolean(state?.valid && state?.license_key);
}

export async function getPublicLicenseStatus() {
  try {
    if (licenseSkip()) {
      return publicStatus({
        valid: true,
        skipped: true,
        message: "License check skipped (dev).",
      });
    }

    const state = await readState();
    const valid = Boolean(state?.valid && state?.license_key);
    return publicStatus({
      valid,
      message: valid
        ? "License active."
        : "A valid license is required to use RamerLabs Poker. Buy a license at ramerlabs.com.",
    });
  } catch {
    // Never 500 the gate — DB blips must not kick licensed domains offline
    return publicStatus({
      valid: true,
      message: "License check deferred.",
    });
  }
}

export async function activate(licenseKey: string) {
  if (licenseSkip()) {
    return { success: true, message: "License check skipped (dev).", buy_url: BUY_URL };
  }

  const key = String(licenseKey || "").trim();
  if (!key) {
    return { success: false, message: "Enter a license key.", buy_url: BUY_URL };
  }

  const { ok, data } = await postLicense("activate", {
    license_key: key,
    product_slug: PRODUCT_SLUG,
    site_url: siteUrl(),
    site_name: SITE_NAME,
  });

  const success = Boolean(ok && (data.success === true || data.valid === true));
  if (!success) {
    const message =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error) ||
      "Invalid license key. Buy a license at ramerlabs.com.";
    // Domain already bound on the license server — treat as activated locally
    const alreadyBound =
      /\b(already\s+(activated|active|registered|licensed)|this\s+site\s+is\s+already|domain\s+already)\b/i.test(
        message,
      );
    if (!alreadyBound) {
      return {
        success: false,
        message,
        buy_url: BUY_URL,
      };
    }
  }

  const now = new Date().toISOString();
  await writeState({
    license_key: key,
    valid: true,
    activated_at: now,
    last_validated_at: now,
  });

  return {
    success: true,
    message:
      (typeof data.message === "string" && data.message) ||
      "License activated.",
    buy_url: BUY_URL,
  };
}

/**
 * Background / status-page revalidation only.
 * Never used on room polls — those use getCachedLicenseValid / requireLicense.
 */
export async function validateStored(force = false): Promise<{
  valid: boolean;
  buy_url: string;
  message?: string;
}> {
  if (licenseSkip()) {
    return { valid: true, buy_url: BUY_URL };
  }

  const state = await readState();
  if (!state?.license_key) {
    return { valid: false, buy_url: BUY_URL };
  }

  const age = Date.now() - new Date(state.last_validated_at || 0).getTime();
  if (!force && state.valid && age >= 0 && age < REVALIDATE_MS) {
    return { valid: true, buy_url: BUY_URL };
  }

  try {
    const { ok, data } = await postLicense("validate", {
      license_key: state.license_key,
      product_slug: PRODUCT_SLUG,
      site_url: siteUrl(),
    });

    const valid = Boolean(ok && (data.success === true || data.valid === true));
    if (valid) {
      await writeState({
        ...state,
        valid: true,
        last_validated_at: new Date().toISOString(),
        last_error: undefined,
      });
      return { valid: true, buy_url: BUY_URL };
    }

    const message =
      (typeof data.message === "string" && data.message) || "License is not valid.";
    const detail = `${message} ${typeof data.error === "string" ? data.error : ""}`.toLowerCase();
    const hardRevoke =
      /\b(revoked|expired|disabled|suspended|invalid key|not found|no license)\b/.test(detail);

    // Keep tables playable: never clear a previously-valid activation from a soft reject.
    if (state.valid && (!ok || !hardRevoke)) {
      await writeState({
        ...state,
        valid: true,
        last_error: message,
      });
      return {
        valid: true,
        buy_url: BUY_URL,
        message: "License server soft-failure — cached activation kept.",
      };
    }

    // Hard revoke only (rare). Still prefer keeping play until admin re-activates
    // unless force=true from an explicit admin/status refresh.
    if (state.valid && !force) {
      await writeState({
        ...state,
        valid: true,
        last_error: message,
      });
      return {
        valid: true,
        buy_url: BUY_URL,
        message: "License may need renewal — cached activation kept for active tables.",
      };
    }

    await writeState({
      ...state,
      valid: false,
      last_validated_at: new Date().toISOString(),
      last_error: message,
    });
    return { valid: false, buy_url: BUY_URL, message };
  } catch {
    if (state.valid) {
      return { valid: true, buy_url: BUY_URL };
    }
    return {
      valid: false,
      buy_url: BUY_URL,
      message: "Could not verify license. Buy a license at ramerlabs.com.",
    };
  }
}

export async function deactivate() {
  const state = await readState();
  if (!state?.license_key) {
    await clearState();
    return { success: true, message: "No license stored.", buy_url: BUY_URL };
  }

  try {
    await postLicense("deactivate", {
      license_key: state.license_key,
      product_slug: PRODUCT_SLUG,
      site_url: siteUrl(),
    });
  } catch {
    // Still clear local state
  }
  await clearState();
  return { success: true, message: "License deactivated.", buy_url: BUY_URL };
}

/**
 * Gameplay / API gate: local DB (+ memory) only.
 * Remote license server is NEVER contacted here — that was freezing tables mid-hand.
 */
export async function requireLicense(): Promise<
  { ok: true } | { ok: false; error: NextResponse }
> {
  const valid = await getCachedLicenseValid();
  if (valid) return { ok: true };
  return {
    ok: false,
    error: NextResponse.json(
      {
        error: "License required",
        detail: "A valid license is required. Buy a license at ramerlabs.com.",
        buy_url: BUY_URL,
      },
      { status: 403 },
    ),
  };
}
