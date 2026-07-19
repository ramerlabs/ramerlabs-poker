import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGlobalCurrency } from "@/lib/currency";
import { formatMoney, toNumber } from "@/lib/utils";
import { Badge, Button, Panel } from "@/components/ui";

export default async function DashboardPage() {
  const session = await auth();
  const [user, rooms, cashCurrency] = await Promise.all([
    prisma.user.findUnique({ where: { id: session!.user!.id } }),
    prisma.room.findMany({
      where: { status: { not: "CLOSED" } },
      include: { players: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    getGlobalCurrency(),
  ]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-4xl font-semibold text-[var(--gold-soft)]">
          Good evening, {user?.name ?? "Player"}
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Your balances and open tables. Credits for free play — cash for private real-money rooms.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">Credits</div>
          <div className="mt-2 text-4xl font-semibold text-[var(--gold-soft)]">
            {toNumber(user?.creditsBalance).toLocaleString()}
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">Playable in public FREE rooms</p>
        </Panel>
        <Panel className="p-6">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
            Real cash ({cashCurrency})
          </div>
          <div className="mt-2 text-4xl font-semibold text-[var(--success)]">
            {formatMoney(toNumber(user?.realMoneyBalance), cashCurrency)}
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">Funded via USDT / GCash gateways</p>
        </Panel>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Open rooms</h2>
        <Link href="/rooms">
          <Button variant="ghost">Browse all</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((room) => (
          <Panel key={room.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xl font-semibold">{room.name}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Blinds {toNumber(room.smallBlind)}/{toNumber(room.bigBlind)} · Buy-in{" "}
                  {toNumber(room.buyIn)} {room.currency}
                </p>
              </div>
              <Badge tone={room.type === "FREE" ? "green" : "gold"}>{room.type}</Badge>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-[var(--muted)]">
                {room.players.length}/{room.maxPlayers} seated
              </span>
              <Link href={`/rooms/${room.id}`}>
                <Button variant="felt">Enter</Button>
              </Link>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
