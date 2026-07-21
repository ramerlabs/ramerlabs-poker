import Image from "next/image";
import Link from "next/link";
import { Button, Panel } from "@/components/ui";

const FEATURES = [
  {
    icon: "♠",
    title: "Live Texas Hold'em",
    body: "Real-time tables with Ably-powered sync, turn timers, auto-deal, and smooth chip animations — no page refreshes.",
  },
  {
    icon: "💳",
    title: "Dual-wallet economy",
    body: "Play free with system credits or fund a cash balance for private real-money rooms. Daily login bonus included.",
  },
  {
    icon: "🔒",
    title: "Private invite rooms",
    body: "Host club tables with invite codes, configurable blinds, buy-ins, rake, and seated player management.",
  },
  {
    icon: "📱",
    title: "Portrait one-handed play",
    body: "Mobile-first vertical layout with thumb-zone actions, swipe bet sliders, and auto-check / auto-fold shortcuts.",
  },
  {
    icon: "🎆",
    title: "Table reactions & chat",
    body: "Talk at the table and throw animated ice, water, or fireworks at opponents — broadcast live to every seat.",
  },
  {
    icon: "🛡️",
    title: "Secure accounts",
    body: "Email login with optional authenticator 2FA, wallet deposits, and admin-managed platform settings.",
  },
] as const;

const STEPS = [
  {
    n: "01",
    title: "Create your account",
    body: "Sign up in seconds and receive starter credits. Enable 2FA anytime from settings.",
  },
  {
    n: "02",
    title: "Pick a table",
    body: "Browse public credit lobbies or enter a private room with an invite code from your host.",
  },
  {
    n: "03",
    title: "Sit down & play",
    body: "Buy in from your wallet, take your seat, and act on your turn — desktop or phone.",
  },
] as const;

const FAQ = [
  {
    q: "Is RamerLabs Poker free to play?",
    a: "Yes. Public FREE rooms use system credits. New accounts receive starter credits, plus a daily bonus when you log in.",
  },
  {
    q: "How do private real-money tables work?",
    a: "Hosts create REAL rooms with blinds, buy-in, and rake settings. Players join with an invite code and buy in from their cash wallet.",
  },
  {
    q: "Can I play on my phone?",
    a: "Absolutely. Tables support fullscreen portrait mode with a bottom action dock, swipe betting, and touch-friendly controls.",
  },
  {
    q: "Who operates the platform?",
    a: "RamerLabs Poker is built and maintained by RamerLabs — premium SaaS tooling for clubs and serious home games.",
  },
] as const;

export function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-brand">
            <span className="landing-brand-mark" aria-hidden>
              ♠
            </span>
            <span>
              RamerLabs
              <strong>Poker</strong>
            </span>
          </Link>
          <nav className="landing-nav-links" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it works</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="landing-nav-actions">
            <Link href="/login">
              <Button variant="ghost" className="!px-4 !py-2 text-xs">
                Sign in
              </Button>
            </Link>
            <Link href="/register">
              <Button className="!px-4 !py-2 text-xs">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero">
        <div
          className="landing-hero-bg"
          style={{ backgroundImage: "url(/landing-poker.jpg)" }}
          aria-hidden
        />
        <div className="landing-hero-overlay" aria-hidden />
        <div className="landing-hero-inner">
          <div className="landing-hero-copy animate-fade-up">
            <p className="landing-eyebrow">Premium Texas Hold&apos;em SaaS</p>
            <h1>
              High-stakes tables.
              <span>SaaS precision.</span>
            </h1>
            <p className="landing-lead">
              Play free credit lobbies, host private real-money rooms, and run club tables with
              live sync, multi-currency wallets, and a mobile-first player experience.
            </p>
            <div className="landing-hero-cta">
              <Link href="/register">
                <Button className="!px-7 !py-3.5 text-sm">Create free account</Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" className="!px-7 !py-3.5 text-sm">
                  Sign in to play
                </Button>
              </Link>
            </div>
            <ul className="landing-hero-perks" aria-label="Highlights">
              <li>1,000 credits on signup</li>
              <li>Daily +2,000 credit bonus</li>
              <li>No download required</li>
            </ul>
          </div>
          <div className="landing-hero-visual animate-fade-up" style={{ animationDelay: "120ms" }}>
            <Panel className="landing-hero-card">
              <div className="landing-hero-card-top">
                <Image
                  src="/dealer-lady.png"
                  alt=""
                  width={120}
                  height={120}
                  className="landing-dealer"
                  priority
                />
                <div>
                  <div className="landing-hero-card-label">Live table preview</div>
                  <div className="landing-hero-card-title">High-Roller Blitz</div>
                  <div className="landing-hero-card-meta">SB 25 · BB 50 · 6-max</div>
                </div>
              </div>
              <div className="landing-mini-board" aria-hidden>
                {["A♠", "K♦", "Q♥", "•", "•"].map((c, i) => (
                  <span key={i} className={cnCard(i, c)}>
                    {c}
                  </span>
                ))}
              </div>
              <div className="landing-hero-card-pot">
                <span>Pot</span>
                <strong>4,850</strong>
              </div>
              <div className="landing-hero-card-tags">
                <span>Ably live</span>
                <span>Chat & reactions</span>
                <span>Mobile portrait</span>
              </div>
            </Panel>
          </div>
        </div>
      </section>

      <section className="landing-stats" aria-label="Platform highlights">
        <div className="landing-stats-inner">
          <div>
            <strong>Hold&apos;em</strong>
            <span>No-limit Texas Hold&apos;em</span>
          </div>
          <div>
            <strong>2–9 seats</strong>
            <span>Configurable table size</span>
          </div>
          <div>
            <strong>Real-time</strong>
            <span>Ably + safety-net polling</span>
          </div>
          <div>
            <strong>Clubs</strong>
            <span>Host & transfer balances</span>
          </div>
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="landing-section-head">
          <p className="landing-eyebrow">Everything you need</p>
          <h2>Built for players and hosts</h2>
          <p>
            From casual credit grinders to private cash games — one platform with the polish of a
            modern SaaS product.
          </p>
        </div>
        <div className="landing-feature-grid">
          {FEATURES.map((f) => (
            <Panel key={f.title} className="landing-feature-card">
              <span className="landing-feature-icon" aria-hidden>
                {f.icon}
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      <section className="landing-section landing-modes">
        <div className="landing-modes-grid">
          <Panel className="landing-mode-card landing-mode-free">
            <p className="landing-eyebrow">Free play</p>
            <h3>Credit lobbies</h3>
            <p>
              Jump into public FREE rooms with system credits. Perfect for practice, bots, and
              learning the interface without risk.
            </p>
            <ul>
              <li>Starter credits on registration</li>
              <li>Daily login reward</li>
              <li>Instant sit & go</li>
            </ul>
          </Panel>
          <Panel className="landing-mode-card landing-mode-real">
            <p className="landing-eyebrow">Private cash</p>
            <h3>Real-money rooms</h3>
            <p>
              Club owners and hosts run invite-only REAL tables with custom blinds, rake, and
              buy-in rules tied to player cash wallets.
            </p>
            <ul>
              <li>Invite-code access</li>
              <li>USDT / GCash funding</li>
              <li>Configurable rake & caps</li>
            </ul>
          </Panel>
        </div>
      </section>

      <section id="how-it-works" className="landing-section">
        <div className="landing-section-head">
          <p className="landing-eyebrow">How it works</p>
          <h2>At the table in three steps</h2>
        </div>
        <div className="landing-steps">
          {STEPS.map((step) => (
            <article key={step.n} className="landing-step">
              <span className="landing-step-n">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-mobile">
        <div className="landing-mobile-grid">
          <div className="landing-mobile-copy">
            <p className="landing-eyebrow">Mobile-first</p>
            <h2>Portrait mode for one-handed play</h2>
            <p>
              Rotate your phone and the table adapts: vertical seat layout, bottom action dock in
              thumb reach, swipe bet sliders, and quick auto-check / auto-fold toggles.
            </p>
            <ul className="landing-mobile-list">
              <li>Bottom-fixed turn panel in portrait</li>
              <li>Touch-friendly raise slider</li>
              <li>Fullscreen immersive table view</li>
              <li>Throw reactions at opponents</li>
            </ul>
          </div>
          <Panel className="landing-phone-mock">
            <div className="landing-phone-notch" aria-hidden />
            <div className="landing-phone-screen">
              <div className="landing-phone-felt" />
              <div className="landing-phone-dock">
                <span>Fold</span>
                <span className="is-primary">Call 50</span>
                <span>All-in</span>
              </div>
              <div className="landing-phone-slider" aria-hidden />
            </div>
          </Panel>
        </div>
      </section>

      <section id="faq" className="landing-section landing-faq-section">
        <div className="landing-section-head">
          <p className="landing-eyebrow">FAQ</p>
          <h2>Common questions</h2>
        </div>
        <div className="landing-faq">
          {FAQ.map((item) => (
            <details key={item.q} className="landing-faq-item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-cta-band">
        <Panel className="landing-cta-panel">
          <div>
            <h2>Ready to shuffle up?</h2>
            <p>Create your account and join the next hand — free credits, live tables, zero install.</p>
          </div>
          <div className="landing-cta-actions">
            <Link href="/register">
              <Button className="!px-7 !py-3">Create account</Button>
            </Link>
            <Link href="/rooms">
              <Button variant="ghost" className="!px-7 !py-3">
                Browse rooms
              </Button>
            </Link>
          </div>
        </Panel>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="landing-brand-mark" aria-hidden>
              ♠
            </span>
            <div>
              <strong>RamerLabs Poker</strong>
              <p>Premium Texas Hold&apos;em for clubs and serious home games.</p>
            </div>
          </div>
          <div className="landing-footer-links">
            <div>
              <h4>Product</h4>
              <Link href="/register">Register</Link>
              <Link href="/login">Sign in</Link>
              <Link href="/rooms">Rooms</Link>
            </div>
            <div>
              <h4>Account</h4>
              <Link href="/wallet">Wallet</Link>
              <Link href="/settings">Settings</Link>
              <Link href="/support">Support</Link>
            </div>
            <div>
              <h4>RamerLabs</h4>
              <a href="https://ramerlabs.com" target="_blank" rel="noopener noreferrer">
                ramerlabs.com
              </a>
              <a href="mailto:support@ramerlabs.com">support@ramerlabs.com</a>
            </div>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>© {new Date().getFullYear()} RamerLabs. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

function cnCard(i: number, c: string) {
  const hidden = c === "•";
  return ["landing-mini-card", hidden && "is-hidden", i < 3 && "is-dealt"]
    .filter(Boolean)
    .join(" ");
}
