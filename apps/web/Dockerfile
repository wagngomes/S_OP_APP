# syntax=docker/dockerfile:1
# ================================================================
# apps/web — multi-stage Alpine, Next.js 15 standalone
# Build context: repo root
# T033 — output standalone elimina node_modules completo da imagem final
# ================================================================

ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.9

FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
RUN corepack enable pnpm && corepack prepare pnpm@${PNPM_VERSION} --activate

FROM base AS deps
WORKDIR /workspace

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json    packages/domain/
COPY apps/api/package.json           apps/api/
COPY apps/ingestion-worker/package.json apps/ingestion-worker/
COPY apps/email-worker/package.json  apps/email-worker/
COPY apps/web/package.json           apps/web/

RUN pnpm install --frozen-lockfile

FROM deps AS builder

COPY packages/contracts/src           packages/contracts/src
COPY packages/contracts/tsconfig.json packages/contracts/
COPY packages/domain/src              packages/domain/src
COPY packages/domain/tsconfig.json    packages/domain/
COPY apps/web                         apps/web/

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

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @sop/web build

# ─── runner: standalone output é autossuficiente ─────────────────
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 --ingroup nodejs nodejs

# O standalone já embute o servidor e um node_modules mínimo
COPY --from=builder --chown=nodejs:nodejs \
     /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs \
     /workspace/apps/web/.next/static     ./.next/static
# public/ pode não existir ainda — ignorar falha
COPY --from=builder --chown=nodejs:nodejs \
     /workspace/apps/web/public           ./public

USER nodejs

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["node", "server.js"]
