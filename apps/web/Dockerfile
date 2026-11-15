# Web image. Build context = repository root.
FROM node:20-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @prodlike/shared build \
 && pnpm --filter @prodlike/web build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
