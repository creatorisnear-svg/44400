#!/bin/sh
set -e

echo "==> Running database migrations..."
cd /app
pnpm --filter @workspace/db run push-force 2>&1 || {
  echo "WARNING: DB migration failed — database may not be reachable yet, retrying in 5s..."
  sleep 5
  pnpm --filter @workspace/db run push-force 2>&1 || echo "WARNING: Migration still failed, proceeding anyway."
}

echo "==> Starting server..."
exec node --enable-source-maps ./artifacts/api-server/dist/index.mjs
