# API image. Build context = repository root.
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @prodlike/shared build \
 && pnpm --filter @prodlike/api prisma:generate \
 && pnpm --filter @prodlike/api build

ENV NODE_ENV=production
EXPOSE 4000
# Apply pending migrations, seed (admin account + badges, idempotent), then start.
CMD ["sh", "-c", "pnpm --filter @prodlike/api prisma:deploy && pnpm --filter @prodlike/api db:seed && node apps/api/dist/main.js"]
