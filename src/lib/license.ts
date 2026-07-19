import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { licenseServerUrl } from "@/lib/rlm-internal";

export const PRODUCT_SLUG = "ramerlabs-poker";
export const SITE_NAME = process.env.LICENSE_SITE_NAME || "RamerLabs Poker";
export const BUY_URL =
  process.env.LICENSE_BUY_URL || "https://ramerlabs.com/product/ramerlabs-poker/";

const LICENSE_SETTING_KEY = "rlm_license";
const REVALIDATE_MS = 6 * 60 * 60 * 1000; // 6 hours

type LicenseState = {
  license_key: string;
  valid: boolean;
  activated_at?: string;
  last_validated_at?: string;
  last_error?: string;
};

function siteUrl(): string {
  const raw =
    process.env.LICENSE_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

function licenseSkip(): boolean {
  const v = (process.env.LICENSE_SKIP || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

async function readState(): Promise<LicenseState | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: LICENSE_SETTING_KEY } });
    if (!row?.value || typeof row.value !== "object") return null;
    return row.value as LicenseState;
  } catch {
    return null;
  }
}

async function writeState(state: LicenseState): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: LICENSE_SETTING_KEY },
    create: { key: LICENSE_SETTING_KEY, value: state },
    update: { value: state },
  });
}

async function clearState(): Promise<void> {
  try {
    await prisma.appSetting.delete({ where: { key: LICENSE_SETTING_KEY } });
  } catch {
    // ignore missing
  }
}

async function postLicense(endpoint: string, body: Record<string, unknown>) {
  const url = `${licenseServerUrl()}/wp-json/ramerlabs-license/v1/${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
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

export async function getPublicLicenseStatus() {
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
    return {
      success: false,
      message:
        (typeof data.message === "string" && data.message) ||
        (typeof data.error === "string" && data.error) ||
        "Invalid license key. Buy a license at ramerlabs.com.",
      buy_url: BUY_URL,
    };
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
    message: (typeof data.message === "string" && data.message) || "License activated.",
    buy_url: BUY_URL,
  };
}

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
    // Only invalidate on an explicit rejection from the license server.
    // HTTP/network ambiguity must not lock production tables.
    if (!ok && state.valid) {
      return {
        valid: true,
        buy_url: BUY_URL,
        message: "License server unreachable — using cached activation.",
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
    // Network blip: keep prior valid state so a temporary outage does not lock the table.
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

export async function requireLicense(): Promise<
  { ok: true } | { ok: false; error: NextResponse }
> {
  const result = await validateStored(false);
  if (result.valid) return { ok: true };
  return {
    ok: false,
    error: NextResponse.json(
      {
        error: "License required",
        detail:
          result.message ||
          "A valid license is required. Buy a license at ramerlabs.com.",
        buy_url: result.buy_url || BUY_URL,
      },
      { status: 403 },
    ),
  };
}
