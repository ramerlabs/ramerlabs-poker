# RamerLabs Poker

![RamerLabs Poker live table](docs/poker-table.png)

Most “poker platforms” online fall into two camps: noisy free sites you would never put your brand on, or bloated white-label stacks that need a consultant just to open the lobby. **RamerLabs Poker** sits in the middle — a licensed Texas Hold’em SaaS you can run as your own tables product, with the polish of a casino UI and the practicality of a modern web stack.

Operators get **clubs** (admin-assigned owners who create tables), a single **platform cash currency**, **coupons** for credits or cash, and **account security** (2FA + password change) — without bolting on five separate tools.

**Live demo:** [poker.ramerlabs.com](https://poker.ramerlabs.com)  
**Buy lifetime license:** [ramerlabs.com/product/ramerlabs-poker](https://ramerlabs.com/product/ramerlabs-poker/)  
**Support:** [support@ramerlabs.com](mailto:support@ramerlabs.com)

---

## Product description

RamerLabs Poker is a full-stack **Texas Hold’em multiplayer** product for operators who want branded free-credit lobbies and private real-money rooms under one deploy.

Players join tables, sit with credits or cash, and play timed Hold’em with bots, chat, and live sync. Admins run the house: platform currency, clubs, coupons, rake, payment endpoints, Ably, and support tickets. Club owners — assigned only by admins — create and run their club’s tables.

It ships as a Next.js app with Prisma/Postgres, credentials auth (optional TOTP 2FA), wallet deposits/withdrawals (USDT / GCash-style), promo coupons, and a site-wide RamerLabs lifetime license gate.

---

## Why this exists

Anyone who has tried to host a serious private game online knows the friction: weak public lobbies, missing invite codes, wallets that live in spreadsheets, and tools that forget timed turns, rake, bots, or chat controls.

Operators do not need another novelty. They need rooms that look intentional, keep players in sync, and stay under their control — with clear ownership (clubs), one cash currency for the site, and security players expect.

RamerLabs Poker is built for that gap.

---

## Try the demo first

Before you commit budget, open the live demo and play a few hands:

### [poker.ramerlabs.com](https://poker.ramerlabs.com)

Suggested smoke test:

1. Create an account (or sign in on the demo)
2. Open **Settings** — try change password / enable 2FA if you want
3. Join a FREE credit room and play through a street or two
4. Watch seats, timers, pot, and hand status
5. Notice pot chips flying to the winner when a hand completes
6. (Admin) Create a club, assign an owner, generate a coupon; (Owner) create a table from Rooms

The demo exists so you can judge the product on the felt — not only on a feature list.

---

## What you get

### Gameplay
- Public **FREE** rooms (credits) and private **REAL** rooms (invite codes)
- Full Texas Hold’em engine: shuffle, deal, blinds, streets (through five board cards), showdown, timed auto-fold
- Bot opponents with per-table accuracy (0–100%)
- Table chat with admin enable/disable per room
- Polished table UX — dark felt, gold accents, pot-to-winner chip animation

### Clubs & tables
- **Clubs** with one owner per club
- **Only admins** can create a club and assign / reassign the club owner
- **Only club owners** can create tables for their club (admins can also create a table *for* a selected club)
- Room list shows club name on each table

### Wallet & currency
- Split balances: **Credits** vs **Real cash**
- **Global platform currency** set by admin (e.g. USD or PHP) — all cash deposits, withdrawals, cash coupons, and REAL tables use that currency
- USDT / GCash-style deposit & withdrawal gateways (admin-configured payment details)
- **Coupons**: admin generates free-credits or real-cash codes; players claim them in Wallet

### Account security
- Change password from **Settings**
- **TOTP 2FA** (Google Authenticator, Authy, 1Password, etc.) — enable with QR, require code at login, disable with password + code

### Admin panel
- Platform currency, clubs, coupons, tables (with bots), currencies / payment endpoints, house rake, Ably realtime, support tickets
- Sticky success/error feedback when creating tables and managing settings

### Licensing
- Site-wide **lifetime license** gate (activate with your RamerLabs key)

---

## Stack

- **Next.js 16** + TypeScript + Tailwind CSS
- **Prisma** + Neon PostgreSQL
- **NextAuth (Auth.js)** credentials auth + optional TOTP (`otpauth`)
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

Open [http://localhost:3000](http://localhost:3000) and **create an account** via Register — new players start with **1,000 credits**.

For your own deploy, create the first admin in the database (or promote a registered user) after seed — do not ship shared demo logins on a public instance.

Typical operator flow after go-live:

1. Admin sets **platform currency** (USD / PHP / …)
2. Admin creates a **club** and assigns a player as **club owner**
3. Club owner creates tables from **Rooms** (or admin creates a table for that club)
4. Optional: generate **coupons**; ask players to claim them in **Wallet**
5. Players can enable **2FA** under **Settings**

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `AUTH_SECRET` | NextAuth secret (also used to encrypt TOTP secrets) |
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
4. Run `prisma db push` against Neon before first launch (and after schema updates)

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
