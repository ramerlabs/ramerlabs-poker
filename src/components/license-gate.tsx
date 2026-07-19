"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button, Input, Label, Panel } from "@/components/ui";
import { useToast } from "@/components/toast-provider";

type LicenseStatus = {
  valid?: boolean;
  skipped?: boolean;
  message?: string;
  buy_url?: string;
  site_name?: string;
};

const CACHE_KEY = "rl-poker-license-ok";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readLicenseCache(): LicenseStatus | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; status?: LicenseStatus };
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    if (parsed.status?.valid !== true) return null;
    return parsed.status;
  } catch {
    return null;
  }
}

function writeLicenseCache(status: LicenseStatus) {
  try {
    if (status.valid === true) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), status }));
    } else {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    // ignore
  }
}

export function LicenseGate({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");

  const refresh = useCallback(async () => {
    const apply = (data: LicenseStatus) => {
      const next = { ...data, valid: data.valid === true };
      setStatus(next);
      writeLicenseCache(next);
      return next;
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch("/api/license/status", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        // Never lock out on a flaky HTTP error if we already activated this browser
        const cached = readLicenseCache();
        if (cached) {
          setStatus(cached);
          return cached;
        }
        setStatus({
          valid: false,
          message:
            "A valid license is required to use RamerLabs Poker. Buy a license at ramerlabs.com.",
          buy_url: "https://ramerlabs.com/product/ramerlabs-poker/",
        });
        return null;
      }
      const data = (await res.json()) as LicenseStatus;
      return apply(data);
    } catch {
      // Timeout / offline — keep last known good activation (domain already licensed)
      const cached = readLicenseCache();
      if (cached) {
        setStatus({
          ...cached,
          message: cached.message || "License active (cached).",
        });
        return cached;
      }
      // No cache: soft-allow so a transient status blip cannot brick the whole site.
      // Gameplay APIs still enforce requireLicense() against the DB.
      setStatus({
        valid: true,
        message: "License check deferred — reconnecting…",
        buy_url: "https://ramerlabs.com/product/ramerlabs-poker/",
      });
      return null;
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Instant paint from cache while status loads
    const cached = readLicenseCache();
    if (cached) {
      setStatus(cached);
      setLoading(false);
    }
    void refresh();
  }, [refresh]);

  async function onActivate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ license_key: key.trim() }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        buy_url?: string;
      };
      if (!res.ok || !data.success) {
        toast.error(data.message || "Invalid license key. Buy a license at ramerlabs.com.");
        if (data.buy_url) {
          setStatus((prev) => ({ ...prev, buy_url: data.buy_url }));
        }
        return;
      }
      toast.success(data.message || "License activated.");
      setKey("");
      writeLicenseCache({
        valid: true,
        message: data.message || "License active.",
        buy_url: data.buy_url,
      });
      await refresh();
    } catch {
      toast.error("Could not activate license. Buy a license at ramerlabs.com.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !status?.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-[var(--muted)]">
        Checking license…
      </div>
    );
  }

  if (status?.valid) {
    return <>{children}</>;
  }

  const buyUrl = status?.buy_url || "https://ramerlabs.com/product/ramerlabs-poker/";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center"
        style={{ backgroundImage: "url(/landing-poker.jpg)" }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(5,8,14,0.94) 0%, rgba(8,14,24,0.88) 45%, rgba(12,28,22,0.82) 100%)",
        }}
        aria-hidden
      />

      <Panel className="relative z-10 w-full max-w-md p-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--gold)]">RamerLabs</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--gold-soft)]">License required</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          {status?.message ||
            "A valid license is required to use RamerLabs Poker. Paste your key below to activate, or buy a license at ramerlabs.com."}
        </p>

        <form onSubmit={onActivate} className="mt-6 space-y-4" autoComplete="off">
          <div>
            <Label htmlFor="license-key">License key</Label>
            <Input
              id="license-key"
              name="license_key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="RLM-XXXX-XXXX-XXXX"
              required
              autoFocus
            />
          </div>
          <Button type="submit" disabled={busy || !key.trim()} className="w-full">
            {busy ? "Activating…" : "Activate"}
          </Button>
        </form>

        <a
          href={buyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex w-full items-center justify-center rounded-xl border border-[rgba(212,168,83,0.45)] bg-[rgba(212,168,83,0.08)] px-4 py-2.5 text-sm font-semibold text-[var(--gold-soft)] transition hover:bg-[rgba(212,168,83,0.16)]"
        >
          Buy license at ramerlabs.com
        </a>

        <p className="mt-5 text-center text-[11px] text-[var(--muted)]">
          A product by{" "}
          <a href="https://ramerlabs.com" className="text-[var(--gold)] hover:underline">
            RamerLabs
          </a>
        </p>
      </Panel>
    </div>
  );
}
