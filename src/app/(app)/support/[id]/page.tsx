"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Badge, Button, Label, Panel } from "@/components/ui";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  categoryLabel,
  priorityLabel,
  statusLabel,
  userCanReply,
} from "@/lib/support";
import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";

type Message = {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
  author: { id: string; name: string | null; email: string };
};

type TicketDetail = {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  userId: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string | null; email: string };
  messages: Message[];
};

export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<TicketStatus>("OPEN");
  const [priority, setPriority] = useState<TicketPriority>("NORMAL");

  async function load() {
    const res = await fetch(`/api/support/tickets/${params.id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Ticket not found");
      setTicket(null);
      return;
    }
    setTicket(json.ticket);
    setIsAdmin(Boolean(json.isAdmin));
    setStatus(json.ticket.status);
    setPriority(json.ticket.priority);
    setError(null);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function sendReply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/support/tickets/${params.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: String(form.get("body") || "") }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not send reply");
      return;
    }
    e.currentTarget.reset();
    setMessage("Reply sent");
    await load();
  }

  async function saveAdminMeta(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/support/tickets/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, priority }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not update ticket");
      return;
    }
    setMessage("Ticket updated");
    await load();
  }

  async function closeTicket() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/support/tickets/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CLOSED" }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not close ticket");
      return;
    }
    setMessage("Ticket closed");
    await load();
  }

  if (!ticket && !error) {
    return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  }

  if (!ticket) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--crimson)]">{error}</p>
        <Link href="/support" className="text-sm text-[var(--gold-soft)]">
          ← Back to support
        </Link>
      </div>
    );
  }

  const canReply =
    (isAdmin && ticket.status !== "CLOSED") ||
    (!isAdmin && userCanReply(ticket.status));
  const canClose =
    !isAdmin && ticket.status === "RESOLVED" && session?.user?.id === ticket.userId;

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/support" className="text-xs text-[var(--muted)] hover:text-[var(--gold-soft)]">
            ← Support
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-[var(--gold-soft)] md:text-3xl">
            {ticket.subject}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {categoryLabel(ticket.category)} · opened{" "}
            {new Date(ticket.createdAt).toLocaleString()}
            {isAdmin ? ` · ${ticket.user.name || ticket.user.email}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="muted">{priorityLabel(ticket.priority)}</Badge>
          <Badge tone={ticket.status === "CLOSED" || ticket.status === "RESOLVED" ? "green" : "gold"}>
            {statusLabel(ticket.status)}
          </Badge>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[rgba(179,58,74,0.4)] bg-[rgba(179,58,74,0.12)] px-3 py-2 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-[rgba(62,207,142,0.35)] bg-[rgba(62,207,142,0.08)] px-3 py-2 text-sm">
          {message}
        </div>
      )}

      {isAdmin && (
        <Panel className="p-4 md:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
            Staff controls
          </h2>
          <form onSubmit={saveAdminMeta} className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TicketStatus)}
                className="mt-1 rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
              >
                {TICKET_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className="mt-1 rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm"
              >
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy} variant="ghost">
              Save
            </Button>
          </form>
        </Panel>
      )}

      <Panel className="p-4 md:p-5">
        <div className="space-y-4">
          {ticket.messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl border px-4 py-3 ${
                m.isStaff
                  ? "border-[rgba(212,168,83,0.35)] bg-[rgba(212,168,83,0.08)]"
                  : "border-white/5 bg-black/20"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <span>
                  {m.isStaff ? "Support" : m.author.name || m.author.email}
                </span>
                <span>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text)]">{m.body}</p>
            </div>
          ))}
        </div>
      </Panel>

      {canReply && (
        <Panel className="p-4 md:p-5">
          <form onSubmit={sendReply} className="space-y-3">
            <Label htmlFor="body">Reply</Label>
            <textarea
              id="body"
              name="body"
              required
              rows={4}
              maxLength={5000}
              className="w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm outline-none focus:border-[var(--gold)]"
              placeholder="Write your reply…"
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send reply"}
            </Button>
          </form>
        </Panel>
      )}

      {canClose && (
        <Button disabled={busy} variant="ghost" onClick={() => void closeTicket()}>
          Close ticket
        </Button>
      )}
    </div>
  );
}
