import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import type { PrismaClient } from '@prisma/client';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Authenticator } from '../../composition/ports.js';

/**
 * Instância BetterAuth com adaptador Prisma e provedor e-mail/senha (D8).
 *
 * Sessão por cookie httpOnly, SameSite=Lax, Secure fora de desenvolvimento.
 * A autorização de processo (quem pode fazer o quê em cada fase) é do domínio —
 * este adaptador só responde "quem é" o requisitante.
 */
export function createAuth(prisma: PrismaClient) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    secret: process.env.AUTH_SECRET ?? 'dev-secret-change-in-production',
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
    trustedOrigins: process.env.TRUSTED_ORIGINS?.split(',') ?? [],
    emailAndPassword: { enabled: true },
    advanced: {
      cookiePrefix: 'sop',
      useSecureCookies: process.env.NODE_ENV !== 'development',
    },
  });
}

export type BetterAuthInstance = ReturnType<typeof createAuth>;

/**
 * Adapta a instância BetterAuth para a porta `Authenticator`.
 *
 * Converte os cabeçalhos do Fastify (Node.js) para Web API Headers, chama
 * `auth.api.getSession` e retorna `{ id }` ou `null`.
 */
export function createAuthenticator(auth: BetterAuthInstance): Authenticator {
  return {
    async currentUser(headers) {
      const webHeaders = fromNodeHeaders(headers as Record<string, string | string[]>);
      const session = await auth.api.getSession({ headers: webHeaders });
      return session ? { id: session.user.id } : null;
    },
  };
}

/**
 * Handler Node.js para montar o BetterAuth no Fastify via `addContentTypeParser`.
 *
 * Uso no app.ts:
 *   app.addContentTypeParser('application/json', {}, (_, payload, done) => done(null, payload));
 *   app.all('/api/auth/*', (req, res) => authHandler(req.raw, res.raw));
 */
export function createAuthHandler(
  auth: BetterAuthInstance,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return toNodeHandler(auth);
}
