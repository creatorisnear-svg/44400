# Blackjack Bot

A Discord self-bot dashboard that automatically plays blackjack against Kaos Bot on a Discord server to win scrap currency.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/blackjack-bot run dev` — run the frontend (Vite)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Discord: discord.js-selfbot-v13 (user token self-bot)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + Tailwind + shadcn/ui

## Where things live

- `lib/db/src/schema/` — DB tables: `botConfig`, `gameSessions`, `gameHands`
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth for API)
- `artifacts/api-server/src/bot/blackjackBot.ts` — Discord self-bot engine
- `artifacts/api-server/src/bot/strategy.ts` — Basic/aggressive/conservative blackjack strategy
- `artifacts/api-server/src/bot/logger.ts` — In-memory log buffer (exposed via `/api/logs`)
- `artifacts/api-server/src/routes/bot.ts` — All bot/stats/sessions API routes
- `artifacts/blackjack-bot/src/pages/dashboard.tsx` — Main dashboard UI
- `artifacts/blackjack-bot/src/pages/config.tsx` — Bot configuration form
- `artifacts/blackjack-bot/src/pages/sessions.tsx` — Session history with hand details

## Architecture decisions

- Self-bot uses `discord.js-selfbot-v13` with a user token (not a bot token)
- The bot runs as an in-process singleton (`blackjackBot`) managed by the API server — no separate process needed
- Card parsing is flexible regex-based (handles various Kaos Bot embed formats)
- Logs are stored in-memory (ring buffer, 500 entries max) and polled by the frontend every 2s
- esbuild externalizes `prism-media`, `ffmpeg-static`, `bufferutil`, `utf-8-validate` (discord.js voice deps we don't need but are loaded)
- Codegen post-step rewrites `lib/api-zod/src/index.ts` to avoid Zod/TypeScript type name conflict

## Product

- **Dashboard**: Live stats (win rate, net scrap, total hands, session info), Start/Stop bot button, connection status
- **Live Logs**: Real-time scrolling log of every hand, decision, and result
- **Config**: Full settings for Discord token, server/channel ID, Kaos Bot prefix, bet amount, strategy, delays, stop-loss/win limits
- **History**: Expandable session list with per-hand results, card details, and actions taken

## How to use

1. Go to the **Config** tab
2. Enter your Discord **user token** (not a bot token — find it in DevTools > Network > Authorization header)
3. Enter the **Server ID** and **Channel ID** where Kaos Bot's blackjack is played
4. Enter Kaos Bot's **User ID** (right-click Kaos Bot → Copy ID)
5. Set your **bet amount** and **strategy**
6. Click **Save Config**, then **Start Bot** on the main dashboard

## User preferences

- Self-bot that plays blackjack on Kaos Bot using a user account
- Aims to win scrap currency on a specific Discord server

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- `ffmpeg-static` and `prism-media` must be in the `external` list in `build.mjs` AND `prism-media` must be an explicit dependency (not just transitive) so it's found at runtime
- The codegen script in `lib/api-spec/package.json` overwrites `lib/api-zod/src/index.ts` after running orval to avoid the Zod/TS type naming conflict
- Do NOT add leaf workspace packages to the root `tsconfig.json` references

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
