# RamerLabs Poker

![RamerLabs Poker live table](docs/poker-table.png)

Most “poker platforms” online fall into two camps: noisy free sites you would never put your brand on, or bloated white-label stacks that need a consultant just to open the lobby. **RamerLabs Poker** sits in the middle — a licensed Texas Hold’em SaaS you can run as your own tables product, with the polish of a casino UI and the practicality of a modern web stack.

**Live demo:** [poker.ramerlabs.com](https://poker.ramerlabs.com)  
**Buy lifetime license:** [ramerlabs.com/product/ramerlabs-poker](https://ramerlabs.com/product/ramerlabs-poker/)  
**Support:** [support@ramerlabs.com](mailto:support@ramerlabs.com)

---

## Why this exists

Anyone who has tried to host a serious private game online knows the friction: weak public lobbies, missing invite codes, wallets that live in spreadsheets, and tools that forget timed turns, rake, bots, or chat controls.

Operators do not need another novelty. They need a room that looks intentional, keeps players in sync, and stays under their control.

RamerLabs Poker is built for that gap — free **credit** lobbies for casual play, private **real-money** rooms with invite codes, split wallets, configurable bots, table chat, and an admin panel for tables, currencies, rake, realtime, and support tickets.

---

## Try the demo first

Before you commit budget, open the live demo and play a few hands:

### [poker.ramerlabs.com](https://poker.ramerlabs.com)

Suggested smoke test:

1. Create an account (or sign in on the demo)
2. Join a FREE credit room and play through a street or two
3. Watch seats, timers, pot, and hand status
4. Notice pot chips flying to the winner when a hand completes

The demo exists so you can judge the product on the felt — not only on a feature list.

---

## What you get

- Public **FREE** rooms (credits) and private **REAL** rooms (invite codes)
- Full Texas Hold’em engine: shuffle, deal, blinds, streets, showdown, timed auto-fold
- Split wallets: Credits vs Real Cash + multi-currency support
- USDT / GCash-style deposit & withdrawal gateways (admin-configured)
- Bot opponents with per-table accuracy (0–100%)
- Table chat with admin enable/disable per room
- Admin panel: tables, currencies, rake, Ably, support tickets
- Polished table UX — dark felt, gold accents, pot-to-winner chip animation
- Site-wide **lifetime license** gate (activate with your RamerLabs key)

---

## Stack

- **Next.js 16** + TypeScript + Tailwind CSS
- **Prisma** + Neon PostgreSQL
- **NextAuth (Auth.js)** credentials auth
- **Ably** realtime (optional) — or solid polling with `ABLY_ENABLED=false`
- Vercel-ready serverless API routes
- RamerLabs License Manager activation (server-side; buy URL only in the UI)

---

## License & purchase

This product is **license-gated**. After deploy, the app shows an activation screen until a valid key unlocks the instance.

1. Buy a lifetime key: [ramerlabs.com/product/ramerlabs-poker](https://ramerlabs.com/product/ramerlabs-poker/)
2. Deploy your instance and set `NEXTAUTH_URL` / `LICENSE_SITE_URL` to your public URL
3. Paste the key on the lock screen and tap **Activate**

One activation unlocks the whole site for your configured site URL. Need to move hosts later? Use **Replace license**, then activate again on the new URL.

Local development only: `LICENSE_SKIP=true` in `.env.local` (never in production).

---

## Quick start

```bash
npm install
cp .env.example .env.local
# set DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Seed accounts

| Email | Password | Role |
| --- | --- | --- |
| admin@ramerlabs.com | password123 | ADMIN |
| player@ramerlabs.com | password123 | USER |

New registrations receive **1,000 credits**.

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `AUTH_SECRET` | NextAuth secret |
| `NEXTAUTH_URL` | App URL (also used for license site identity) |
| `ABLY_API_KEY` | Optional Ably key fallback (Admin can override) |
| `ABLY_ENABLED` | Optional kill-switch (`false` forces polling) |
| `LICENSE_SITE_URL` | Site URL for license activate/validate |
| `LICENSE_BUY_URL` | Store CTA (defaults to the product page above) |
| `LICENSE_SKIP` | `true` bypasses the gate — local/dev only |

Never commit `.env` / `.env.local`.

---

## Deploy (Vercel)

1. Import this repo in Vercel
2. Set the env vars above (`LICENSE_SITE_URL` should match your production domain, e.g. `https://poker.ramerlabs.com`)
3. Build runs `prisma generate && next build`
4. Run `prisma db push` against Neon before first launch

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm run db:push` | Sync Prisma schema to the database |
| `npm run db:seed` | Seed admin, currencies, and sample rooms |

---

## A note on real-money features

Real-money rooms and payment gateways are tools for operators who already understand their local rules. RamerLabs provides software licensing and product support — compliance for cash games, KYC, and payment rails remains on the operator. Use FREE credit rooms when you want gameplay without cash complexity.

---

## Links

- **Demo:** [poker.ramerlabs.com](https://poker.ramerlabs.com)
- **Store:** [Buy RamerLabs Poker](https://ramerlabs.com/product/ramerlabs-poker/)
- **Company:** [ramerlabs.com](https://ramerlabs.com)
- **Support:** [support@ramerlabs.com](mailto:support@ramerlabs.com)

---

*RamerLabs Poker — Premium tables. SaaS precision.*

A product by [RamerLabs](https://ramerlabs.com). All rights reserved.
