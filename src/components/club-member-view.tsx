"use client";

import Link from "next/link";
import { Badge, Panel } from "@/components/ui";
import { ClubCashoutPanel } from "@/components/club-cashout-panel";
import { ClubTablesPanel, type ClubTable } from "@/components/club-tables-panel";
import { formatMoney } from "@/lib/utils";

export type MemberClub = {
  clubId: string;
  clubName: string;
  owner: { name: string | null; email: string };
  memberCreditsBalance: number;
  memberRealMoneyBalance: number;
  tables: ClubTable[];
};

export function ClubMemberView({
  memberships,
  cashCurrency = "USD",
}: {
  memberships: MemberClub[];
  cashCurrency?: string;
}) {
  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">Your club</h1>
        <p className="mt-2 text-[var(--muted)]">
          Play on your club&apos;s private tables with club credits. Contact your club owner for
          top-ups.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {memberships.map((m) => (
          <Panel key={m.clubId} className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-xl font-semibold">{m.clubName}</h2>
              <Badge tone="gold">Member</Badge>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Owner:{" "}
              <a
                href={`mailto:${m.owner.email}?subject=${encodeURIComponent(`Top-up request — ${m.clubName}`)}`}
                className="text-[var(--gold-soft)] underline hover:text-[var(--gold)]"
              >
                {m.owner.name || m.owner.email}
              </a>
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-3">
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  Club free credits
                </div>
                <div className="mt-1 text-2xl font-semibold text-[var(--gold-soft)]">
                  {m.memberCreditsBalance.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-3">
                <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  Club real credits
                </div>
                <div className="mt-1 text-2xl font-semibold text-[var(--success)]">
                  {formatMoney(m.memberRealMoneyBalance, cashCurrency)}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--muted)]">
              {m.tables.length} table{m.tables.length === 1 ? "" : "s"} available
            </p>
          </Panel>
        ))}
      </div>

      <ClubCashoutPanel cashCurrency={cashCurrency} />

      {memberships.map((m) => (
        <ClubTablesPanel
          key={`tables-${m.clubId}`}
          rooms={m.tables}
          readOnly
          title={`${m.clubName} tables`}
          subtitle="Join a club table — buy-ins use your club wallet, not system credits."
        />
      ))}

      <Panel className="p-6">
        <h2 className="text-lg font-semibold">Need more credits?</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Club credits are separate from your main wallet. Message your club owner to request a
          top-up, or browse{" "}
          <Link href="/rooms" className="text-[var(--gold-soft)] underline hover:text-[var(--gold)]">
            all rooms
          </Link>
          .
        </p>
      </Panel>
    </div>
  );
}
