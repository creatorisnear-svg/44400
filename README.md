# Halo

Halo runs several Discord accounts at once. When the Clover game bot (KA0SBOT) drops a Nuclear Fallout, every account claims it, and the points can be sent to one person on a timer or on demand. Everything is run from a web dashboard.

Self-bots are against Discord's rules. Any account you add can get banned.

## Set it up

You need one thing besides this repo: a Postgres database. Halo creates its own tables the first time it starts.

1. **Make a database.** Koyeb Databases, Neon or Supabase all work. Copy its connection string (it starts with `postgres://`).
2. **Deploy.** On Koyeb, create a service from this GitHub repo with the Dockerfile builder, and add one environment variable: `DATABASE_URL` = the connection string. The app listens on port 8000.
3. **Create your password.** Open the app's URL. The server log shows a line like `Halo setup code: K7QM-2XPA`. Type that code on the page and pick a password.
   Prefer env vars? Set `DASHBOARD_PASSWORD` instead and the page just asks for that.
4. **Follow the checklist on the Overview page.** Paste an account token, pick the server and nuke channel from the lists (the game bot is found for you), then press Start.

Add more accounts later on the Accounts page. "Several at once" takes a whole list of tokens, one per line (`name:token` to name them).

## Settings worth knowing

| Where | What it does |
|---|---|
| Settings, Payouts | Who gets the points, and auto-transfer every N minutes |
| Settings, Auto-join servers | Invite links new accounts join and link their in-game name in |
| Settings, Advanced | Nuke keywords, command names, claim delays, human mode, skip rate |
| Transfer page | Send a set total to someone, one account after another |

Most settings apply after a restart. The Settings page offers a Restart button after you save.

## Environment variables

| Name | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `DASHBOARD_PASSWORD` | no | Dashboard password. When set, it replaces the one made in the browser |
| `SESSION_SECRET` | no | Extra key for signing sign-ins |
| `PORT` | no | Defaults to 8080 (the Docker image uses 8000) |
| `DISCORD_ACCOUNTS` | no | Accounts as `Label1:TOKEN1,Label2:TOKEN2`, synced at every start |

## Run it on your own computer

Needs Node 22+, pnpm 10 and a Postgres database.

```bash
pnpm install
DATABASE_URL=postgres://... pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/blackjack-bot run dev
```

The API runs on port 8080 and the dashboard on http://localhost:5173 (it forwards `/api` to the API).

## Layout

```
artifacts/api-server/     Express API + the bot engine (src/bot/nukeBot.ts)
artifacts/blackjack-bot/  The dashboard (React, Vite, Tailwind)
lib/db/                   Database tables (Drizzle) and the self-setup in ensureSchema.ts
```
