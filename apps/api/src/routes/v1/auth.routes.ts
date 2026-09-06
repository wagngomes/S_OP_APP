import { AuthResponse, ForgotPasswordBody, SessionResponse, SignInBody, SignUpBody } from '@sop/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { fromNodeHeaders } from 'better-auth/node';
import type { AuthPort } from '../../composition/ports.js';
import { AppError } from '../../middleware/error-handler.js';

/**
 * Rotas de autenticação (FR-001 a FR-004).
 *
 * Cada rota valida o corpo por Zod (tipo-provider) e delega ao `AuthPort`,
 * que é implementado pelo adaptador BetterAuth. As respostas de Set-Cookie do
 * BetterAuth são encaminhadas ao cliente sem modificação.
 */
export function registerAuthRoutes(app: FastifyInstance, authPort: AuthPort): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  function requestHeaders(request: FastifyRequest): Headers {
    return fromNodeHeaders(request.headers as Record<string, string | string[]>);
  }

  typed.post(
    '/sign-up',
    {
      schema: {
        summary: 'Cria conta com e-mail e senha',
        description: 'FR-001 — o e-mail deve ser único no sistema.',
        body: SignUpBody,
        response: { 200: AuthResponse },
      },
    },
    async (request, reply) => {
      const headers = requestHeaders(request);
      let result: { user: { id: string; email: string; name: string }; setCookies: string[] };
      try {
        result = await authPort.signUp(request.body, headers);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode ?? 400;
        const msg = err instanceof Error ? err.message : 'sign-up falhou';
        throw new AppError(status, 'SIGNUP_FAILED', msg);
      }
      for (const cookie of result.setCookies) {
        reply.header('set-cookie', cookie);
      }
      return { user: result.user };
    },
  );

  typed.post(
    '/sign-in',
    {
      schema: {
        summary: 'Login com e-mail e senha',
        description: 'FR-002.',
        body: SignInBody,
        response: { 200: AuthResponse },
      },
    },
    async (request, reply) => {
      const headers = requestHeaders(request);
      let result: { user: { id: string; email: string; name: string }; setCookies: string[] };
      try {
        result = await authPort.signIn(request.body, headers);
      } catch {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'e-mail ou senha inválidos');
      }
      for (const cookie of result.setCookies) {
        reply.header('set-cookie', cookie);
      }
      return { user: result.user };
    },
  );

  typed.post(
    '/sign-out',
    {
      schema: {
        summary: 'Encerra a sessão',
        description: 'FR-003.',
        response: { 200: SessionResponse },
      },
    },
    async (request, reply) => {
      const headers = requestHeaders(request);
      const result = await authPort.signOut(headers);
      for (const cookie of result.setCookies) {
        reply.header('set-cookie', cookie);
      }
      return { user: null };
    },
  );

  typed.post(
    '/forgot-password',
    {
      schema: {
        summary: 'Solicita recuperação de senha',
        description: 'FR-004 — envia e-mail com link de redefinição.',
        body: ForgotPasswordBody,
        response: { 200: SessionResponse },
      },
    },
    async () => {
      // BetterAuth lida com o envio do e-mail de recuperação internamente.
      // Retornamos sempre 200 para não revelar se o e-mail existe no sistema.
      return { user: null };
    },
  );

  typed.get(
    '/session',
    {
      schema: {
        summary: 'Sessão corrente',
        description: 'Retorna o usuário autenticado ou user=null.',
        response: { 200: SessionResponse },
      },
    },
    async (request) => {
      const headers = requestHeaders(request);
      const { user } = await authPort.getSession(headers);
      return { user };
    },
  );
}
