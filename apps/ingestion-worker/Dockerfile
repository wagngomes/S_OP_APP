# syntax=docker/dockerfile:1
# ================================================================
# apps/ingestion-worker — multi-stage Alpine
# Build context: repo root
# T031
# ================================================================

ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.9

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN corepack enable pnpm && corepack prepare pnpm@${PNPM_VERSION} --activate

FROM base AS deps
WORKDIR /workspace

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json    packages/contracts/
COPY packages/domain/package.json       packages/domain/
COPY apps/api/package.json              apps/api/
COPY apps/ingestion-worker/package.json apps/ingestion-worker/
COPY apps/email-worker/package.json     apps/email-worker/
COPY apps/web/package.json              apps/web/
# Prisma schema — prisma client é dep do ingestion-worker
COPY apps/api/prisma                    apps/api/prisma

RUN pnpm install --frozen-lockfile

FROM deps AS builder

COPY packages/contracts/src              packages/contracts/src
COPY packages/contracts/tsconfig.json    packages/contracts/
COPY packages/domain/src                 packages/domain/src
COPY packages/domain/tsconfig.json       packages/domain/
COPY apps/ingestion-worker/src           apps/ingestion-worker/src
COPY apps/ingestion-worker/tsconfig.json apps/ingestion-worker/

RUN pnpm --filter @sop/contracts build \
 && pnpm --filter @sop/domain     build

RUN node - <<'PATCH'
const fs = require('fs');
for (const p of ['packages/contracts', 'packages/domain']) {
  const pkg = JSON.parse(fs.readFileSync(p + '/package.json', 'utf8'));
  pkg.main = './dist/index.js';
  pkg.exports = { '.': './dist/index.js' };
  fs.writeFileSync(p + '/package.json', JSON.stringify(pkg));
}
PATCH

RUN pnpm --filter @sop/ingestion-worker build

FROM builder AS pruner
RUN pnpm --filter @sop/ingestion-worker deploy --prod /deploy

FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nodejs

COPY --from=pruner --chown=nodejs:nodejs /deploy ./

USER nodejs

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=1536"

EXPOSE 9100

CMD ["node", "dist/main.js"]
