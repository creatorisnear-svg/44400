# ☢️ AVIV — Clover Points Auto-Claimer

A multi-account Discord self-bot that automatically detects and claims Nuclear Fallout events on KA0SBOT/Clover servers, then transfers points to a master account.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/blackjack-bot run dev` — run the frontend dashboard (port 8081 → preview at /)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Discord: discord.js-selfbot-v13 (user token self-bot)
- Frontend: React + Vite + Tailwind + shadcn/ui

## Where things live

- `lib/db/src/schema/` — DB tables: `accounts`, `botSettings`, `nukeEvents`, `claims`, `transfers`
- `artifacts/api-server/src/bot/nukeBot.ts` — Discord self-bot engine (multi-account, nuke claiming, transfers)
- `artifacts/api-server/src/routes/bot.ts` — All API routes
- `artifacts/blackjack-bot/src/pages/dashboard.tsx` — Main dashboard (stats, logs, accounts, transfer, events)
- `artifacts/blackjack-bot/src/pages/config.tsx` — Bot settings + account management
- `artifacts/blackjack-bot/src/pages/sessions.tsx` — Nuke event history + transfer log

## How it works

### Nuke Claiming
1. Bot monitors specified Discord channel for "Nuclear Fallout" keyword messages from KA0SBOT
2. When detected, ALL enabled accounts simultaneously claim the nuke reward
3. Bot tries to click the claim button; falls back to sending `%claim` text command
4. Scrap/points gained are tracked per account in the DB

### Transfers
Transfer command format: `/transfer recipient:@USERNAME amount: AMOUNT server: N`
- `giveCommand` setting = `/transfer`
- `transferServer` setting = which server to receive on (1, 2, or 3)
- Full command built as: `{giveCommand} recipient:@{username} amount: {amount} server: {transferServer}`

## Product

- **Dashboard**: Live stats (claims today, scrap today, accounts online, uptime), Start/Stop bot
- **Live Logs**: Real-time bot activity with color-coded nuke events
- **Accounts**: View status, balance, and totals for each connected account
- **Transfer**: Send clover points from all accounts to any recipient in one click
- **Events**: Nuke event history with per-account claim breakdown
- **Config**: Full settings — Server ID, Channel ID, KA0SBOT ID, keywords, transfer command, server selection, claim delays

## How to use

1. Go to **Config** tab
2. Set **Server ID** and **Channel ID** of the nuke channel
3. Set **Clover Bot ID** (right-click KA0SBOT → Copy ID)
4. Choose your **Transfer Server** (1, 2, or 3)
5. Go to **Config → Accounts** and add your Discord user tokens
6. Click **Start Bot** on the dashboard
7. When a nuke drops, all accounts auto-claim!
8. Use the **Transfer** tab to send accumulated points to a recipient

## User preferences

- Multi-account nuke auto-claimer for KA0SBOT / Clover on Discord
- Transfer format: `/transfer recipient:@USERNAME amount: AMOUNT server: N`
- Claims rewards on configurable server (1/2/3)

## Gotchas

- Self-bots violate Discord's ToS — use at your own risk
- Run `pnpm install` before first start if node_modules are missing
- Run `pnpm --filter @workspace/db run push` after schema changes
- `ffmpeg-static` and `prism-media` are externalized in esbuild (discord.js voice deps not needed)
