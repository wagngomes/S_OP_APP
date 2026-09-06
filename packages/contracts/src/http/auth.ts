import { z } from 'zod';

/**
 * Schemas de request/response das rotas de autenticação.
 *
 * Fonte única de verdade: a validação Fastify e o cliente frontend derivam daqui (D9).
 * Ver: specs/001-sop-cycle-forecasting/contracts/http-api-v1.md — seção Autenticação
 */

export const SignUpBody = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8),
});
export type SignUpBody = z.infer<typeof SignUpBody>;

export const SignInBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type SignInBody = z.infer<typeof SignInBody>;

export const ForgotPasswordBody = z.object({
  email: z.string().email(),
});
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBody>;

/** Representação do usuário devolvida pelas rotas de auth. */
export const AuthUser = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** Resposta de sign-up e sign-in bem-sucedidos. */
export const AuthResponse = z.object({
  user: AuthUser,
});
export type AuthResponse = z.infer<typeof AuthResponse>;

/** Resposta de GET /api/v1/auth/session. */
export const SessionResponse = z.object({
  user: AuthUser.nullable(),
});
export type SessionResponse = z.infer<typeof SessionResponse>;
