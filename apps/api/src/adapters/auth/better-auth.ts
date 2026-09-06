import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { fromNodeHeaders } from 'better-auth/node';
import type { PrismaClient } from '@prisma/client';
import type { AuthPort, AuthedUser, Authenticator } from '../../composition/ports.js';

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

function collectSetCookies(headers: Headers): string[] {
  const raw = headers.getSetCookie?.() ?? [];
  if (raw.length > 0) return raw;
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

function toUser(u: { id: string; email: string; name: string }): AuthedUser {
  return { id: u.id, email: u.email, name: u.name ?? '' };
}

/**
 * Implementa a porta `AuthPort` sobre a instância BetterAuth.
 *
 * Usa a API programática (auth.api.*) para evitar dependência de parsing de
 * corpo HTTP — cada rota Fastify valida o body por Zod e chama este port.
 */
export function createAuthPort(auth: BetterAuthInstance): AuthPort {
  return {
    async signUp({ name, email, password }, requestHeaders) {
      const res = await auth.api.signUpEmail({
        body: { name, email, password },
        headers: requestHeaders,
        asResponse: true,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg = typeof err['message'] === 'string' ? err['message'] : 'sign-up falhou';
        const code: number = typeof err['status'] === 'number' ? err['status'] : res.status;
        throw Object.assign(new Error(msg), { statusCode: code });
      }
      const data = await res.json() as { user: { id: string; email: string; name: string } };
      return { user: toUser(data.user), setCookies: collectSetCookies(res.headers) };
    },

    async signIn({ email, password }, requestHeaders) {
      const res = await auth.api.signInEmail({
        body: { email, password },
        headers: requestHeaders,
        asResponse: true,
      });
      if (!res.ok) {
        throw Object.assign(new Error('credenciais inválidas'), { statusCode: 401 });
      }
      const data = await res.json() as { user: { id: string; email: string; name: string } };
      return { user: toUser(data.user), setCookies: collectSetCookies(res.headers) };
    },

    async signOut(requestHeaders) {
      const res = await auth.api.signOut({ headers: requestHeaders, asResponse: true });
      return { setCookies: collectSetCookies(res.headers) };
    },

    async getSession(requestHeaders) {
      const session = await auth.api.getSession({ headers: requestHeaders });
      if (!session?.user) return { user: null };
      return { user: toUser(session.user) };
    },
  };
}
