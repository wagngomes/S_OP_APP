# syntax=docker/dockerfile:1
# ================================================================
# apps/api — multi-stage Alpine
# Build context: repo root
# T030 — mem_limit coerente com NODE_OPTIONS --max-old-space-size=1536
# ================================================================

ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.9

# ─── base: Node + pnpm ───────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN corepack enable pnpm && corepack prepare pnpm@${PNPM_VERSION} --activate

# ─── deps: instalar workspace completo ───────────────────────────
FROM base AS deps
WORKDIR /workspace

# Manifests primeiro — invalida cache só quando dependências mudam
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json   packages/contracts/
COPY packages/domain/package.json      packages/domain/
COPY apps/api/package.json             apps/api/
COPY apps/ingestion-worker/package.json apps/ingestion-worker/
COPY apps/email-worker/package.json    apps/email-worker/
COPY apps/web/package.json             apps/web/
# Prisma schema — obrigatório antes do postinstall (geração do client)
COPY apps/api/prisma                   apps/api/prisma

RUN pnpm install --frozen-lockfile

# ─── builder: compilar TypeScript ────────────────────────────────
FROM deps AS builder

COPY packages/contracts/src            packages/contracts/src
COPY packages/contracts/tsconfig.json  packages/contracts/
COPY packages/domain/src               packages/domain/src
COPY packages/domain/tsconfig.json     packages/domain/
COPY apps/api/src                      apps/api/src
COPY apps/api/tsconfig.json            apps/api/

# 1. Compilar pacotes compartilhados
RUN pnpm --filter @sop/contracts build \
 && pnpm --filter @sop/domain     build

# 2. Redirecionar exports para dist/ — em dev o main aponta para src/ porque
#    o vitest transforma TypeScript diretamente; em prod o Node.js precisa de JS.
RUN node - <<'PATCH'
const fs = require('fs');
for (const p of ['packages/contracts', 'packages/domain']) {
  const pkg = JSON.parse(fs.readFileSync(p + '/package.json', 'utf8'));
  pkg.main = './dist/index.js';
  pkg.exports = { '.': './dist/index.js' };
  fs.writeFileSync(p + '/package.json', JSON.stringify(pkg));
}
PATCH

# 3. Compilar a API
RUN pnpm --filter @sop/api build

# ─── pruner: deployment autossuficiente ──────────────────────────
FROM builder AS pruner
RUN pnpm --filter @sop/api deploy --prod /deploy

# ─── runner: imagem final mínima ─────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nodejs

COPY --from=pruner --chown=nodejs:nodejs /deploy              ./
COPY                                     apps/api/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER nodejs

ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=1536"

EXPOSE 3001

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server.js"]
