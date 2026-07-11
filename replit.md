# AVIV — Nuke Bot Dashboard

Multi-account Discord self-bot that auto-detects and claims "Nuclear Fallout" events from KA0SBOT/Clover, then transfers collected points to a master account. Includes a full-stack web dashboard to manage accounts, configure the bot, and view history.

## Architecture

| Layer | Technology |
|---|---|
| Backend / Bot | Node.js · Express · `discord.js-selfbot-v13` |
| Database | PostgreSQL · Drizzle ORM |
| Frontend | React · Vite · Tailwind CSS v4 · shadcn/ui |
| API spec | OpenAPI 3.1 · Orval codegen |

## Monorepo layout

```
artifacts/
  api-server/       # Express API + NukeBot engine
  blackjack-bot/    # React dashboard (serves at /)
lib/
  db/               # Drizzle schema + client (@workspace/db)
  api-spec/         # openapi.yaml + generated client (@workspace/api-client-react)
```

## Environment variables / secrets

| Key | Description |
|---|---|
| `DATABASE_URL` | Runtime-managed by Replit — do not set manually |
| `DASHBOARD_PASSWORD` | Secret — password to log in to the web dashboard |
| `SESSION_SECRET` | Secret — used for session signing |

## Running locally

Both workflows start automatically in Replit:

- **API Server** — `pnpm --filter @workspace/api-server run dev`
- **Dashboard (web)** — `pnpm --filter @workspace/blackjack-bot run dev`

## Database

Push schema changes:
```
pnpm --filter @workspace/db run push
```

Regenerate API client after editing `lib/api-spec/openapi.yaml`:
```
pnpm --filter @workspace/api-spec run codegen
```

## User preferences

- Dark theme throughout — background `#09090b`, yellow/amber accent
- Keep bot logic and frontend in their respective artifact directories
