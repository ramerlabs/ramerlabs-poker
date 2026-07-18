import Link from "next/link";
import { Button } from "@/components/ui";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Full-bleed poker atmosphere */}
      <div
        className="absolute inset-0 scale-105 bg-cover bg-center"
        style={{ backgroundImage: "url(/landing-poker.jpg)" }}
        aria-hidden
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(105deg, rgba(5,8,14,0.92) 0%, rgba(5,8,14,0.78) 42%, rgba(5,10,16,0.55) 70%, rgba(5,10,16,0.4) 100%), linear-gradient(0deg, rgba(5,8,14,0.75) 0%, transparent 45%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
        <div className="animate-fade-up max-w-2xl">
          <p className="mb-3 text-xs uppercase tracking-[0.35em] text-[var(--gold)]">
            RamerLabs Poker
          </p>
          <h1 className="text-5xl font-semibold leading-[1.05] text-[var(--text)] md:text-7xl">
            High-stakes tables.
            <span className="block text-[var(--gold-soft)]">SaaS precision.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-[var(--muted)]">
            Play free credit lobbies or host private real-money rooms with invite codes,
            multi-currency wallets, and Ably-powered live sync.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register">
              <Button className="!px-6 !py-3">Create account</Button>
            </Link>
            <Link href="/login">
              <Button variant="ghost" className="!px-6 !py-3">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
