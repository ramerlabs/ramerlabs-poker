"use client";

import Link from "next/link";
import { FormEvent } from "react";
import {
  Bot,
  Coins,
  Copy,
  ExternalLink,
  Lock,
  MessageSquare,
  Pencil,
  Spade,
  Users,
  XCircle,
} from "lucide-react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import { cn } from "@/lib/utils";

export type ClubTable = {
  id: string;
  name: string;
  type: "FREE" | "REAL";
  currency: string;
  buyIn: number;
  smallBlind: number;
  bigBlind: number;
  maxPlayers: number;
  targetBots: number;
  botSkillPercent: number;
  chatEnabled: boolean;
  isPrivate: boolean;
  inviteCode: string | null;
  status: string;
  playerCount: number;
};

type ClubTablesPanelProps = {
  rooms: ClubTable[];
  busy?: boolean;
  editingId?: string | null;
  readOnly?: boolean;
  title?: string;
  subtitle?: string;
  onEditToggle?: (roomId: string) => void;
  onSave?: (e: FormEvent<HTMLFormElement>, roomId: string) => void;
  onClose?: (id: string, name: string) => void;
  onReopen?: (id: string) => void;
  onCopyInvite?: (code: string) => void;
};

function statusTone(status: string): "green" | "gold" | "muted" {
  if (status === "CLOSED") return "muted";
  if (status === "PLAYING" || status === "ACTIVE") return "gold";
  return "green";
}

function statusLabel(status: string) {
  if (status === "CLOSED") return "Closed";
  if (status === "PLAYING" || status === "ACTIVE") return "In play";
  return "Open";
}

export function ClubTablesPanel({
  rooms,
  busy = false,
  editingId = null,
  readOnly = false,
  title = "Club tables",
  subtitle = "Tables created for your club. Members use club credits to play here.",
  onEditToggle,
  onSave,
  onClose,
  onReopen,
  onCopyInvite,
}: ClubTablesPanelProps) {
  const openCount = rooms.filter((r) => r.status !== "CLOSED").length;

  return (
    <Panel className="club-tables-panel p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="club-tables-panel-icon" aria-hidden>
              <Spade className="h-5 w-5" />
            </span>
            <h2 className="text-xl font-semibold">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">{openCount} open</Badge>
          <Badge tone="gold">{rooms.length} total</Badge>
          {!readOnly && (
            <Link href="/rooms">
              <Button variant="primary">Create table</Button>
            </Link>
          )}
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="club-tables-empty mt-6">
          <div className="club-tables-empty-icon" aria-hidden>
            <Spade className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-[var(--gold-soft)]">No tables yet</h3>
          <p className="mt-2 max-w-md text-sm text-[var(--muted)]">
            {readOnly
              ? "Your club owner has not opened any tables yet. Ask them to create one."
              : "Create a table from Rooms — it will automatically belong to your club and use club credits for buy-ins."}
          </p>
          {!readOnly && (
            <Link href="/rooms" className="mt-4 inline-block">
              <Button variant="felt">Go to Rooms</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            // Members join via club membership (no invite in URL). Owners keep invite for guest links.
            const openHref =
              !readOnly && room.inviteCode
                ? `/rooms/${room.id}?invite=${room.inviteCode}`
                : `/rooms/${room.id}`;
            const isEditing = editingId === room.id;
            const seatsFull = room.playerCount >= room.maxPlayers;

            return (
              <article
                key={room.id}
                className={cn(
                  "club-table-card",
                  room.status === "CLOSED" && "is-closed",
                  isEditing && "is-editing",
                )}
              >
                <div className="club-table-card-head">
                  <div className="club-table-card-icon" aria-hidden>
                    <Spade className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">{room.name}</h3>
                      <Badge tone={room.type === "FREE" ? "green" : "gold"}>{room.type}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(room.status)}>{statusLabel(room.status)}</Badge>
                      {room.isPrivate && (
                        <span className="club-table-meta">
                          <Lock className="h-3 w-3" />
                          Private
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="club-table-stats">
                  <div className="club-table-stat">
                    <Users className="h-4 w-4 shrink-0 text-[var(--gold)]" />
                    <span>
                      <strong>{room.playerCount}</strong>/{room.maxPlayers} seated
                      {seatsFull ? " · Full" : ""}
                    </span>
                  </div>
                  <div className="club-table-stat">
                    <Coins className="h-4 w-4 shrink-0 text-[var(--gold)]" />
                    <span>
                      {room.smallBlind}/{room.bigBlind} blinds · {room.buyIn.toLocaleString()}{" "}
                      {room.currency}
                    </span>
                  </div>
                  <div className="club-table-stat">
                    <Bot className="h-4 w-4 shrink-0 text-[var(--gold)]" />
                    <span>
                      {room.targetBots} bots · {room.botSkillPercent}% skill
                    </span>
                  </div>
                  <div className="club-table-stat">
                    <MessageSquare className="h-4 w-4 shrink-0 text-[var(--gold)]" />
                    <span>Chat {room.chatEnabled ? "on" : "off"}</span>
                  </div>
                </div>

                {/* Members never see invite codes. Owners can copy when managing. */}
                {!readOnly && room.inviteCode ? (
                  <div className="club-table-invite">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      Invite code
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="club-table-invite-code">{room.inviteCode}</code>
                      {onCopyInvite ? (
                        <button
                          type="button"
                          className="club-table-invite-copy"
                          onClick={() => onCopyInvite(room.inviteCode!)}
                          title="Copy invite code"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : room.isPrivate && readOnly ? (
                  <div className="club-table-invite">
                    <span className="club-table-meta">
                      <Lock className="h-3 w-3" />
                      Private — club members only
                    </span>
                  </div>
                ) : null}

                <div className="club-table-actions">
                  <Link href={openHref} className="flex-1 sm:flex-none">
                    <Button variant="felt" className="w-full sm:w-auto">
                      <ExternalLink className="h-4 w-4" />
                      {readOnly ? "Join table" : "Open"}
                    </Button>
                  </Link>
                  {!readOnly && onEditToggle && onClose && onReopen && onSave && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onEditToggle(room.id)}
                      >
                        <Pencil className="h-4 w-4" />
                        {isEditing ? "Cancel" : "Edit"}
                      </Button>
                      {room.status !== "CLOSED" ? (
                        <Button
                          type="button"
                          variant="danger"
                          disabled={busy}
                          onClick={() => onClose(room.id, room.name)}
                        >
                          <XCircle className="h-4 w-4" />
                          Close
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => onReopen(room.id)}
                        >
                          Reopen
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {!readOnly && isEditing && onSave && (
                  <form
                    onSubmit={(e) => onSave(e, room.id)}
                    className="club-table-edit-form"
                  >
                    <div className="md:col-span-2">
                      <Label>Table name</Label>
                      <Input name="name" defaultValue={room.name} required maxLength={64} />
                    </div>
                    <div>
                      <Label>Buy-in</Label>
                      <Input
                        name="buyIn"
                        type="number"
                        step="0.01"
                        min={0.01}
                        defaultValue={room.buyIn}
                        required
                      />
                    </div>
                    <div>
                      <Label>Small blind</Label>
                      <Input
                        name="smallBlind"
                        type="number"
                        step="0.01"
                        min={0.01}
                        defaultValue={room.smallBlind}
                        required
                      />
                    </div>
                    <div>
                      <Label>Big blind</Label>
                      <Input
                        name="bigBlind"
                        type="number"
                        step="0.01"
                        min={0.01}
                        defaultValue={room.bigBlind}
                        required
                      />
                    </div>
                    <div>
                      <Label>Max players</Label>
                      <Input
                        name="maxPlayers"
                        type="number"
                        min={2}
                        max={9}
                        defaultValue={room.maxPlayers}
                        required
                      />
                    </div>
                    <div>
                      <Label>Bots to seat</Label>
                      <Input
                        name="targetBots"
                        type="number"
                        min={0}
                        max={9}
                        defaultValue={room.targetBots}
                        required
                      />
                    </div>
                    <div>
                      <Label>Bot accuracy (0–100)</Label>
                      <Input
                        name="botSkillPercent"
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={room.botSkillPercent}
                        required
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <input
                        type="checkbox"
                        name="chatEnabled"
                        defaultChecked={room.chatEnabled}
                        className="accent-[var(--gold)]"
                      />
                      Table chat enabled
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <input
                        type="checkbox"
                        name="isPrivate"
                        defaultChecked={room.isPrivate}
                        className="accent-[var(--gold)]"
                      />
                      Private (invite code)
                    </label>
                    <div className="md:col-span-2">
                      <Button type="submit" disabled={busy}>
                        {busy ? "Saving…" : "Save table"}
                      </Button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
