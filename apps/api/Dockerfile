# syntax=docker/dockerfile:1
# Build context: repository root  (docker build -f apps/api/Dockerfile .)
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/stub-llm/package.json tools/stub-llm/
RUN npm ci --workspace apps/api --include-workspace-root=false --no-audit --no-fund
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run build -w apps/api

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tools/stub-llm/package.json tools/stub-llm/
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root=false --no-audit --no-fund && npm cache clean --force
COPY packages/core packages/core
COPY apps/api/migrations apps/api/migrations
COPY --from=build /app/apps/api/dist apps/api/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:8080/api/v1/health/live >/dev/null || exit 1
CMD ["node", "apps/api/dist/server.js"]
