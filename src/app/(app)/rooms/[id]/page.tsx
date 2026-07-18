"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PokerTable } from "@/components/poker-table";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import type { PublicTableState } from "@/lib/poker/types";

type RoomPayload = {
  room: {
    id: string;
    name: string;
    type: "FREE" | "REAL";
    currency: string;
    buyIn: number;
    smallBlind: number;
    bigBlind: number;
    isPrivate: boolean;
    inviteCode: string | null;
    creatorId: string;
    players: {
      userId: string;
      seat: number;
      stack: number;
      user: { id: string; name: string | null; email: string };
    }[];
  };
  game: { state: PublicTableState };
};

export default function RoomDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [data, setData] = useState<RoomPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);

  async function load(code?: string) {
    const invite = code || inviteCode;
    const qs = invite ? `?invite=${encodeURIComponent(invite)}` : "";
    const res = await fetch(`/api/rooms/${params.id}${qs}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Unable to load room");
      return;
    }
    setError(null);
    setData(json);
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

  async function join(e?: FormEvent) {
    e?.preventDefault();
    setJoining(true);
    setError(null);
    const res = await fetch(`/api/rooms/${params.id}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: inviteCode || undefined }),
    });
    const json = await res.json();
    setJoining(false);
    if (!res.ok) {
      setError(json.error || "Join failed");
      return;
    }
    await load();
  }

  if (!data && !error) {
    return <div className="text-[var(--muted)]">Loading table…</div>;
  }

  if (!data) {
    return (
      <Panel className="max-w-lg p-6">
        <h1 className="text-2xl font-semibold text-[var(--gold-soft)]">Private room</h1>
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
          <Button type="submit" disabled={joining}>
            {joining ? "Joining…" : "Join with code"}
          </Button>
        </form>
      </Panel>
    );
  }

  const seated = data.room.players.some((p) => p.userId === session?.user?.id);
  const canStart =
    data.room.creatorId === session?.user?.id || session?.user?.role === "ADMIN";

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">{data.room.name}</h1>
            <Badge tone={data.room.type === "FREE" ? "green" : "gold"}>{data.room.type}</Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Blinds {data.room.smallBlind}/{data.room.bigBlind} · Buy-in {data.room.buyIn}{" "}
            {data.room.currency}
          </p>
          {data.room.isPrivate && data.room.inviteCode && (
            <p className="mt-1 font-mono text-xs text-[var(--gold)]">
              Invite code: {data.room.inviteCode}
            </p>
          )}
        </div>
        {!seated && (
          <form onSubmit={join} className="flex items-end gap-2">
            {data.room.isPrivate && (
              <div>
                <Label htmlFor="invite2">Invite</Label>
                <Input
                  id="invite2"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                />
              </div>
            )}
            <Button type="submit" disabled={joining} variant="felt">
              {joining ? "Joining…" : `Buy in (${data.room.buyIn})`}
            </Button>
          </form>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-[rgba(179,58,74,0.4)] bg-[rgba(179,58,74,0.12)] px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <Panel className="p-4 md:p-6">
        <PokerTable
          roomId={data.room.id}
          initialState={data.game.state}
          players={data.room.players}
          canStart={canStart && seated}
        />
      </Panel>
    </div>
  );
}
