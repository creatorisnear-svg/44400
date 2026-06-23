---
name: Nuke Bot balance ephemeral fix
description: Why refreshBalances uses a raw listener instead of sendSlash's return value
---

# Problem
`sendSlash(cloverId, "balance")` resolves with the interaction indicator message ("zoktu used /balance") which has empty content. The actual KA0SBOT ephemeral reply arrives as a separate raw WebSocket packet and never fires `messageCreate` (selfbot-v13 suppresses ephemeral messageCreate events).

**Why:** Discord sends two events: (1) an INTERACTION indicator (empty content) that sendSlash resolves with, and (2) the actual ephemeral reply as a raw packet.

**How to apply:** Any slash command that returns an ephemeral reply must register a `raw` event listener BEFORE calling `sendSlash`, then parse balance from raw packets of type MESSAGE_CREATE / INTERACTION_CREATE / INTERACTION_SUCCESS. The `claimNukeForRuntime` function uses the same pattern for nuke claims — follow that pattern.

# Key details
- Hosted on Koyeb (Docker/start.sh) AND on Replit (pnpm dev workflows)
- Bot: discord.js-selfbot-v13 — user token selfbot for KA0SBOT (Clover) Nuclear Fallout events
- Database: PostgreSQL via Drizzle ORM, `DATABASE_URL` env var
- Monorepo: pnpm workspaces — `artifacts/api-server` (backend), `artifacts/blackjack-bot` (React dashboard), `lib/db` (schema)
- Workflows: API Server on port 8080, Frontend on port 5000
