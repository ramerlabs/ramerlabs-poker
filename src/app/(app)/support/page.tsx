"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Badge, Button, Input, Label, Panel } from "@/components/ui";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  categoryLabel,
  priorityLabel,
  statusLabel,
} from "@/lib/support";
import type { TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";

type TicketRow = {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  messageCount: number;
  preview: string;
  updatedAt: string;
  createdAt: string;
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/support/tickets");
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not load tickets");
      return;
    }
    setTickets(json.tickets ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createTicket(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: String(form.get("subject") || ""),
        body: String(form.get("body") || ""),
        category: String(form.get("category") || "OTHER"),
        priority: String(form.get("priority") || "NORMAL"),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not create ticket");
      return;
    }
    setMessage("Ticket submitted — we’ll get back to you.");
    e.currentTarget.reset();
    await load();
  }

  function statusTone(status: TicketStatus): "gold" | "green" | "muted" {
    if (status === "RESOLVED" || status === "CLOSED") return "green";
    if (status === "OPEN" || status === "IN_PROGRESS" || status === "WAITING_ON_USER") {
      return "gold";
    }
    return "muted";
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-3xl font-semibold text-[var(--gold-soft)]">Support</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Open a ticket for account, billing, gameplay, or technical issues.
        </p>
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

      <Panel className="p-5 md:p-6">
        <h2 className="text-lg font-semibold text-[var(--text)]">New ticket</h2>
        <form onSubmit={createTicket} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" name="subject" required maxLength={120} placeholder="Brief summary" />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              name="category"
              defaultValue="OTHER"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm text-[var(--text)]"
            >
              {TICKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="priority">Priority</Label>
            <select
              id="priority"
              name="priority"
              defaultValue="NORMAL"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm text-[var(--text)]"
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="body">Message</Label>
            <textarea
              id="body"
              name="body"
              required
              rows={5}
              maxLength={5000}
              placeholder="Describe what happened…"
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-black/30 px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--gold)]"
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Sending…" : "Submit ticket"}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel className="p-5 md:p-6">
        <h2 className="text-lg font-semibold text-[var(--text)]">My tickets</h2>
        <div className="mt-4 space-y-3">
          {tickets.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No tickets yet.</p>
          )}
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/support/${t.id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/5 bg-black/20 px-4 py-3 transition hover:border-[rgba(212,168,83,0.35)]"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-[var(--text)]">{t.subject}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {categoryLabel(t.category)} · {t.messageCount} message
                  {t.messageCount === 1 ? "" : "s"} · updated{" "}
                  {new Date(t.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="muted">{priorityLabel(t.priority)}</Badge>
                <Badge tone={statusTone(t.status)}>{statusLabel(t.status)}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}
