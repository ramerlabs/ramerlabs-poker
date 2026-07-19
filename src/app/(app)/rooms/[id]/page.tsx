"use client";

import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Spade, X } from "lucide-react";
import { PokerTable } from "@/components/poker-table";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import type { PublicTableState } from "@/lib/poker/types";
import { setMuted, unlockAudio } from "@/lib/sounds";
import { readJson } from "@/lib/utils";

type RoomPayload = {
  room: {
    id: string;
    name: string;
    type: "FREE" | "REAL";
    currency: string;
    buyIn: number;
    smallBlind: number;
    bigBlind: number;
    maxPlayers: number;
    targetBots?: number;
    botCount?: number;
    humanCount?: number;
    isPrivate: boolean;
    inviteCode: string | null;
    creatorId: string;
    players: {
      userId: string;
      seat: number;
      stack: number;
      isBot?: boolean;
      user: { id: string; name: string | null; email: string };
    }[];
    waitlist: {
      userId: string;
      name: string;
      preferredSeat: number | null;
      createdAt: string;
    }[];
  };
  me: {
    userId: string;
    seated: boolean;
    seat: number | null;
    waiting: boolean;
    waitPosition: number | null;
    preferredSeat: number | null;
    walletBalance?: number;
    currency?: string;
    minBuyIn?: number;
  };
  game: { state: PublicTableState };
};

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<RoomPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [browserFs, setBrowserFs] = useState(false);
  const connectedRef = useRef(false);
  const tableRootRef = useRef<HTMLDivElement>(null);
  const autoOpenedRef = useRef(false);

  async function load(code?: string) {
    const invite = code || inviteCode;
    const qs = invite ? `?invite=${encodeURIComponent(invite)}` : "";
    const res = await fetch(`/api/rooms/${params.id}${qs}`);
    try {
      const json = await readJson<RoomPayload & { error?: string }>(res);
      if (!res.ok) {
        setError(json.error || "Unable to load room");
        return;
      }
      setError(null);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load room");
    }
  }

  useEffect(() => {
    const fromQuery =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("invite")
        : null;
    if (fromQuery) setInviteCode(fromQuery.toUpperCase());
    void load(fromQuery?.toUpperCase() || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    connectedRef.current = Boolean(data?.me.seated || data?.me.waiting);
  }, [data?.me.seated, data?.me.waiting]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 768px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Heartbeat while active on this page; idle players stop pinging and are purged after 5 min
  useEffect(() => {
    const roomId = params.id;
    if (!roomId) return;

    let lastActivityAt = Date.now();
    const markActive = () => {
      lastActivityAt = Date.now();
    };

    const ping = () => {
      if (!connectedRef.current) return;
      // Only refresh presence if the user interacted recently (not just an open idle tab)
      if (Date.now() - lastActivityAt > 45_000) return;
      void fetch(`/api/rooms/${roomId}/presence`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    };

    markActive();
    ping();
    const heart = setInterval(ping, 15_000);

    window.addEventListener("pointerdown", markActive);
    window.addEventListener("keydown", markActive);
    window.addEventListener("touchstart", markActive, { passive: true });
    window.addEventListener("focus", markActive);

    const disconnect = () => {
      if (!connectedRef.current) return;
      connectedRef.current = false;
      const url = `/api/rooms/${roomId}/disconnect`;
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        void fetch(url, { method: "POST", credentials: "include", keepalive: true });
      }
    };

    window.addEventListener("pagehide", disconnect);
    window.addEventListener("beforeunload", disconnect);

    return () => {
      clearInterval(heart);
      window.removeEventListener("pointerdown", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("touchstart", markActive);
      window.removeEventListener("focus", markActive);
      window.removeEventListener("pagehide", disconnect);
      window.removeEventListener("beforeunload", disconnect);
      // Navigating away from the room page
      if (connectedRef.current) {
        connectedRef.current = false;
        void fetch(`/api/rooms/${roomId}/disconnect`, {
          method: "POST",
          credentials: "include",
          keepalive: true,
        });
      }
    };
  }, [params.id]);

  const exitBrowserFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const enterBrowserFullscreen = useCallback(async () => {
    const el = tableRootRef.current;
    if (!el || typeof el.requestFullscreen !== "function") return;
    try {
      await el.requestFullscreen();
    } catch {
      // Browser may block without a stronger gesture — app fullscreen still works
    }
  }, []);

  const openTable = useCallback(
    async (opts?: { browserFs?: boolean }) => {
      setTableOpen(true);
      if (opts?.browserFs !== false && isMobile) {
        // Allow layout paint before requesting OS fullscreen
        requestAnimationFrame(() => {
          void enterBrowserFullscreen();
        });
      }
    },
    [enterBrowserFullscreen, isMobile],
  );

  const closeTable = useCallback(() => {
    exitBrowserFullscreen();
    setTableOpen(false);
  }, [exitBrowserFullscreen]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onFs = () => setBrowserFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const play = tableOpen && isMobile;
    document.body.classList.toggle("table-play-mode", play);
    document.body.style.overflow = play ? "hidden" : "";
    return () => {
      document.body.classList.remove("table-play-mode");
      document.body.style.overflow = "";
    };
  }, [tableOpen, isMobile]);

  // Auto-open the immersive table once when the player sits (mobile)
  useEffect(() => {
    if (!isMobile || !data?.me.seated) {
      if (!data?.me.seated) autoOpenedRef.current = false;
      return;
    }
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    void openTable({ browserFs: true });
  }, [isMobile, data?.me.seated, openTable]);

  async function join(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/rooms/${params.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode || undefined }),
      });
      const json = await readJson<{
        error?: string;
        seated?: boolean;
        message?: string;
        position?: number;
      }>(res);
      if (!res.ok) {
        setError(json.error || "Join failed");
        return;
      }
      if (json.seated) {
        setHint("You are seated at the table.");
      } else {
        setHint(
          json.message ||
            `You are on the waitlist (#${json.position ?? "?"}). Click an Open seat to sit.`,
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setBusy(false);
    }
  }

  async function leaveWait() {
    setBusy(true);
    connectedRef.current = false;
    await fetch(`/api/rooms/${params.id}/waitlist`, { method: "DELETE" });
    setBusy(false);
    setHint("Left the waitlist.");
    await load();
  }

  async function leaveTable() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${params.id}/leave`, { method: "POST" });
      const json = await readJson<{ error?: string; mode?: string }>(res);
      if (!res.ok) {
        setError(json.error || "Could not leave");
        return;
      }
      if (json.mode === "pending_leave") {
        setHint("Leaving after this hand — you are folded for now.");
      } else {
        connectedRef.current = false;
        setHint("Left the table. Stack returned to your wallet.");
        if (isMobile) closeTable();
        // Navigate back to lobby so the table is fully cleared
        router.push("/rooms");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave");
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) {
    return <div className="text-[var(--muted)]">Loading table…</div>;
  }

  if (!data) {
    return (
      <Panel className="max-w-lg p-6">
        <h1 className="text-2xl font-semibold text-[var(--gold-soft)]">
          {/private/i.test(error || "") ? "Private room" : "Couldn’t open room"}
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{error}</p>
        <form onSubmit={join} className="mt-4 space-y-3">
          <div>
            <Label htmlFor="invite">Invite code</Label>
            <Input
              id="invite"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="ABCD1234"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "…" : "Join table"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void load()}
            >
              Retry
            </Button>
          </div>
        </form>
      </Panel>
    );
  }

  const seated = data.me.seated;
  const waiting = data.me.waiting;
  const canStart = seated;

  const table = (
    <PokerTable
      roomId={data.room.id}
      tableName={data.room.name}
      brandName="RamerLabs"
      initialState={data.game.state}
      players={data.room.players}
      maxPlayers={data.room.maxPlayers}
      canStart={canStart}
      canSit={!seated}
      viewerUserId={data.me.userId}
      viewerSeat={data.me.seat}
      preferredSeat={data.me.preferredSeat}
      inviteCode={inviteCode || undefined}
      fullscreen={isMobile && tableOpen}
      minBuyIn={data.me.minBuyIn ?? data.room.buyIn}
      currency={data.me.currency ?? data.room.currency}
      walletBalance={data.me.walletBalance ?? 0}
      onPlayersChanged={() => void load()}
      onSitResult={(msg) => {
        setHint(msg);
        if (isMobile && !tableOpen) void openTable();
      }}
    />
  );

  return (
    <div className="space-y-3 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-[var(--gold-soft)] md:text-3xl">
              {data.room.name}
            </h1>
            <Badge tone={data.room.type === "FREE" ? "green" : "gold"}>{data.room.type}</Badge>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)] md:text-sm">
            Blinds {data.room.smallBlind}/{data.room.bigBlind} · Buy-in {data.room.buyIn}{" "}
            {data.room.currency} · {data.room.players.length}/{data.room.maxPlayers} seated
            {data.room.waitlist.length > 0 ? ` · ${data.room.waitlist.length} waiting` : ""}
          </p>
          {data.room.isPrivate && data.room.inviteCode && (
            <p className="mt-1 font-mono text-xs text-[var(--gold)]">
              Invite code: {data.room.inviteCode}
            </p>
          )}
          {waiting && (
            <p className="mt-2 text-sm text-[var(--gold-soft)]">
              {data.me.preferredSeat != null
                ? `Seat ${data.me.preferredSeat + 1} reserved — you sit when this hand ends (queue #${data.me.waitPosition}).`
                : `Waiting — click another Open seat if you want a different spot.`}
            </p>
          )}
          {!seated && !waiting && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              {isMobile ? (
                <>
                  Tap <span className="text-[var(--gold-soft)]">Go to table</span>, pick an open
                  seat, then choose your buy-in (min {data.room.buyIn} {data.room.currency}).
                </>
              ) : (
                <>
                  Click an <span className="text-[var(--gold-soft)]">Open seat</span>, then choose
                  your buy-in (min {data.room.buyIn} {data.room.currency}).
                </>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {data.room.isPrivate && !seated && (
            <div>
              <Label htmlFor="invite2">Invite</Label>
              <Input
                id="invite2"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              />
            </div>
          )}
          {waiting && (
            <Button disabled={busy} variant="ghost" onClick={() => void leaveWait()}>
              Leave waitlist
            </Button>
          )}
          {seated && (
            <Button disabled={busy} variant="danger" onClick={() => void leaveTable()}>
              Leave table
            </Button>
          )}
        </div>
      </div>

      {seated && data.me.seat != null && (
        <div className="rounded-xl border border-[rgba(62,207,142,0.4)] bg-[rgba(62,207,142,0.1)] px-3 py-2 text-sm text-[#c8f0dc]">
          You are seated at seat {data.me.seat + 1}
          {(() => {
            const n = data.room.players.find((p) => p.userId === data.me.userId)?.user.name;
            return n ? ` as ${n}` : "";
          })()}
          . Look for the green <strong>You</strong> badge on the table.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-[rgba(179,58,74,0.4)] bg-[rgba(179,58,74,0.12)] px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {hint && (
        <div className="rounded-xl border border-[rgba(62,207,142,0.35)] bg-[rgba(62,207,142,0.08)] px-3 py-2 text-sm">
          {hint}
        </div>
      )}

      {isMobile && !tableOpen && (
        <Panel className="room-mobile-lobby overflow-hidden p-0">
          <div className="room-mobile-lobby-felt" aria-hidden />
          <div className="relative z-[1] space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#b8892d] to-[#d4a853] text-[#1a1205] shadow-[0_10px_28px_rgba(212,168,83,0.35)]">
                <Spade className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
                  Ready to play
                </div>
                <div className="text-lg font-semibold text-[var(--gold-soft)]">{data.room.name}</div>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-[var(--muted)]">
              Watch or play fullscreen — table sound is on by default, even if you are not seated.
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
              <span className="rounded-full border border-[var(--line)] bg-black/25 px-2.5 py-1">
                {data.room.players.length}/{data.room.maxPlayers} seated
              </span>
              <span className="rounded-full border border-[var(--line)] bg-black/25 px-2.5 py-1">
                {data.room.smallBlind}/{data.room.bigBlind} blinds
              </span>
              {seated && (
                <span className="rounded-full border border-[rgba(62,207,142,0.45)] bg-[rgba(62,207,142,0.12)] px-2.5 py-1 text-[#c8f0dc]">
                  Seat {(data.me.seat ?? 0) + 1}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full !py-3.5 text-base font-semibold"
                onClick={() => {
                  setMuted(false);
                  void unlockAudio();
                  void openTable({ browserFs: true });
                }}
              >
                {seated ? "Go to table" : "Watch table"}
              </Button>
              <p className="text-center text-xs text-[var(--muted)]">
                Table sound is on by default. Tap the table once if your browser blocks audio.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {!isMobile && (
        <Panel className="p-2 md:p-3">
          {table}
        </Panel>
      )}

      {isMobile && (
        <div
          ref={tableRootRef}
          className={tableOpen ? "table-fullscreen-root" : "table-sound-host"}
          hidden={!tableOpen}
          aria-hidden={!tableOpen}
        >
          {tableOpen && (
            <div className="table-fullscreen-bar">
              <button
                type="button"
                className="table-fs-btn"
                onClick={closeTable}
                aria-label="Close table"
              >
                <X className="h-5 w-5" />
                <span>Close</span>
              </button>
              <div className="table-fs-title">{data.room.name}</div>
              <div className="table-fs-actions">
                {seated && (
                  <button
                    type="button"
                    className="table-fs-btn is-danger"
                    disabled={busy}
                    onClick={() => void leaveTable()}
                  >
                    Leave
                  </button>
                )}
                <button
                  type="button"
                  className="table-fs-btn"
                  onClick={() => {
                    if (browserFs) exitBrowserFullscreen();
                    else void enterBrowserFullscreen();
                  }}
                  aria-label={browserFs ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {browserFs ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                  <span>{browserFs ? "Exit" : "Full"}</span>
                </button>
              </div>
            </div>
          )}
          <div className={tableOpen ? "table-fullscreen-body" : undefined}>{table}</div>
        </div>
      )}
    </div>
  );
}
