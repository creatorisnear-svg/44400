FROM node:20-slim

RUN npm install -g pnpm@10.26.1

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

RUN BASE_PATH=/ PORT=3000 NODE_ENV=production pnpm --filter @workspace/blackjack-bot run build

RUN pnpm --filter @workspace/api-server run build

ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
