"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/toast-provider";
import { manilaDayKey } from "@/lib/daily-reward";

const SESSION_KEY = "rl-daily-reward-checked";

/**
 * After login / app load: claim today's free system credits once and toast the player.
 */
export function DailyRewardClaimer() {
  const { status } = useSession();
  const toast = useToast();
  const ran = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || ran.current) return;
    ran.current = true;

    const day = manilaDayKey();
    try {
      if (sessionStorage.getItem(SESSION_KEY) === day) return;
    } catch {
      // ignore
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/wallet/daily-reward", {
          method: "POST",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as {
          granted?: boolean;
          message?: string;
          error?: string;
        };
        if (cancelled) return;
        try {
          sessionStorage.setItem(SESSION_KEY, day);
        } catch {
          // ignore
        }
        if (json.granted && json.message) {
          toast.success(json.message, 7000);
          window.dispatchEvent(new Event("rl-wallet-refresh"));
        }
      } catch {
        // silent — don't block the lobby
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, toast]);

  return null;
}
