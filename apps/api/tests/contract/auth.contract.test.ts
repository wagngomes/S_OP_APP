import { describe, expect, it } from 'vitest';
import {
  AuthResponse,
  AuthUser,
  ForgotPasswordBody,
  SessionResponse,
  SignInBody,
  SignUpBody,
} from '@sop/contracts';

/**
 * T061 — Contrato das rotas de autenticação.
 *
 * Valida as formas de request e response dos endpoints de auth contra os schemas
 * Zod de packages/contracts/src/http/auth.ts. Não faz chamadas HTTP — apenas
 * garante que os schemas estão bem definidos e rejeitam entradas inválidas.
 *
 * As rotas HTTP concretas são testadas no fluxo end-to-end (T072).
 * Ver: specs/001-sop-cycle-forecasting/contracts/http-api-v1.md — Autenticação
 */

describe('SignUpBody — POST /api/v1/auth/sign-up', () => {
  it('aceita corpo válido', () => {
    expect(() =>
      SignUpBody.parse({ name: 'Maria Silva', email: 'maria@example.com', password: 'Senha@123' }),
    ).not.toThrow();
  });

  it('recusa e-mail mal-formado', () => {
    expect(() =>
      SignUpBody.parse({ name: 'X', email: 'nao-e-email', password: 'Senha@123' }),
    ).toThrow();
  });

  it('recusa senha curta (menos de 8 caracteres)', () => {
    expect(() =>
      SignUpBody.parse({ name: 'X', email: 'x@example.com', password: '1234567' }),
    ).toThrow();
  });

  it('recusa nome vazio', () => {
    expect(() =>
      SignUpBody.parse({ name: '', email: 'x@example.com', password: 'Senha@123' }),
    ).toThrow();
  });

  it('recusa body sem campos obrigatórios', () => {
    expect(() => SignUpBody.parse({})).toThrow();
  });
});

describe('SignInBody — POST /api/v1/auth/sign-in', () => {
  it('aceita corpo válido', () => {
    expect(() =>
      SignInBody.parse({ email: 'maria@example.com', password: 'Senha@123' }),
    ).not.toThrow();
  });

  it('recusa e-mail mal-formado', () => {
    expect(() => SignInBody.parse({ email: 'nao-e-email', password: 'qualquer' })).toThrow();
  });

  it('recusa senha ausente', () => {
    expect(() => SignInBody.parse({ email: 'x@example.com' })).toThrow();
  });
});

describe('ForgotPasswordBody — POST /api/v1/auth/forgot-password', () => {
  it('aceita e-mail válido', () => {
    expect(() => ForgotPasswordBody.parse({ email: 'x@example.com' })).not.toThrow();
  });

  it('recusa e-mail mal-formado', () => {
    expect(() => ForgotPasswordBody.parse({ email: 'nao-e-email' })).toThrow();
  });
});

describe('AuthUser — forma do usuário devolvido', () => {
  it('aceita usuário completo', () => {
    expect(() =>
      AuthUser.parse({ id: 'uuid-qualquer', email: 'x@example.com', name: 'X' }),
    ).not.toThrow();
  });

  it('recusa usuário sem id', () => {
    expect(() => AuthUser.parse({ email: 'x@example.com', name: 'X' })).toThrow();
  });
});

describe('AuthResponse — sign-up e sign-in bem-sucedidos', () => {
  it('aceita resposta com user', () => {
    expect(() =>
      AuthResponse.parse({ user: { id: 'abc', email: 'x@example.com', name: 'X' } }),
    ).not.toThrow();
  });

  it('recusa user null (deve sempre retornar o usuário criado)', () => {
    expect(() => AuthResponse.parse({ user: null })).toThrow();
  });
});

describe('SessionResponse — GET /api/v1/auth/session', () => {
  it('aceita sessão ativa', () => {
    expect(() =>
      SessionResponse.parse({ user: { id: 'abc', email: 'x@example.com', name: 'X' } }),
    ).not.toThrow();
  });

  it('aceita ausência de sessão (user nulo)', () => {
    expect(() => SessionResponse.parse({ user: null })).not.toThrow();
  });

  it('recusa user com e-mail inválido', () => {
    expect(() =>
      SessionResponse.parse({ user: { id: 'abc', email: 'invalido', name: 'X' } }),
    ).toThrow();
  });
});
