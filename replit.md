# Halo

Multi-account Discord self-bot that auto-detects and claims "Nuclear Fallout" events from KA0SBOT/Clover, then transfers collected points to a master account. Includes a full-stack web dashboard to manage accounts, configure the bot, and view history. Setup steps for people are in README.md.

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
| `DASHBOARD_PASSWORD` | Optional secret. Without it, the first visit creates a password using the setup code printed in the server log |
| `SESSION_SECRET` | Optional, used for session signing |

## Running locally

Both workflows start automatically in Replit:

- **API Server** — `pnpm --filter @workspace/api-server run dev`
- **Dashboard (web)** — `pnpm --filter @workspace/blackjack-bot run dev`

## Database

Tables and columns are created at startup by `lib/db/src/ensureSchema.ts` (add-only). Keep it in sync with `lib/db/src/schema`. `pnpm --filter @workspace/db run push` still works too.

Regenerate API client after editing `lib/api-spec/openapi.yaml`:
```
pnpm --filter @workspace/api-spec run codegen
```

## User preferences

- Name is Halo. Dark theme throughout: hue-neutral blacks (`#0b0b0b`), white text, one gold accent (`#e6b450`), no blue. Tokens live in `artifacts/blackjack-bot/src/index.css`
- Keep bot logic and frontend in their respective artifact directories
