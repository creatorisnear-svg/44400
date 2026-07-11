# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Copy manifests first — better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json                lib/db/
COPY lib/api-spec/package.json          lib/api-spec/
COPY lib/api-client-react/package.json  lib/api-client-react/
COPY lib/api-zod/package.json           lib/api-zod/
COPY artifacts/api-server/package.json  artifacts/api-server/
COPY artifacts/blackjack-bot/package.json artifacts/blackjack-bot/

RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build frontend
# PORT + BASE_PATH are read by vite.config.ts at config-evaluation time
RUN PORT=3000 BASE_PATH=/ pnpm --filter @workspace/blackjack-bot run build

# Build API server (esbuild bundles everything into dist/)
RUN pnpm --filter @workspace/api-server run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:22-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Install only production dependencies (for external runtime packages like discord.js-selfbot-v13)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json                lib/db/
COPY lib/api-spec/package.json          lib/api-spec/
COPY lib/api-client-react/package.json  lib/api-client-react/
COPY lib/api-zod/package.json           lib/api-zod/
COPY artifacts/api-server/package.json  artifacts/api-server/
COPY artifacts/blackjack-bot/package.json artifacts/blackjack-bot/

RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /app/artifacts/api-server/dist        ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/blackjack-bot/dist/public ./artifacts/blackjack-bot/dist/public

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
