# RamerLabs Poker

Premium Texas Hold'em SaaS platform built with Next.js (App Router), Prisma, Neon PostgreSQL, NextAuth, and Ably (with polling fallback).

## Stack

- Next.js 16 + TypeScript + Tailwind CSS
- Prisma + Neon PostgreSQL
- NextAuth (Auth.js) credentials
- Ably realtime (optional) — polls every 2s when `ABLY_API_KEY` is unset
- Vercel-ready serverless API routes

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

## Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `AUTH_SECRET` | NextAuth secret |
| `NEXTAUTH_URL` | App URL |
| `ABLY_API_KEY` | Optional Ably key for live table sync |

Never commit `.env` / `.env.local`. Rotate any credentials that were shared in chat.

## Features

- Public **FREE** rooms (credits) and private **REAL** rooms (invite codes)
- Texas Hold'em engine: shuffle, deal, blinds, streets, hand evaluation
- Split wallet: Credits vs Real Cash + currency switcher (USD/PHP)
- Mock **USDT** / **GCash** deposit & withdrawal gateways
- Admin currency toggle and payment parameter management

## Deploy (Vercel)

1. Push to GitHub and import the project in Vercel
2. Set the same env vars in the Vercel project
3. Build command: `prisma generate && next build` (postinstall already runs generate)
4. Run `prisma db push` / migrate against Neon before first deploy

## Scripts

- `npm run dev` — local server
- `npm run build` — production build
- `npm run db:push` — sync Prisma schema
- `npm run db:seed` — seed admin, currencies, sample rooms
