import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EmailRequestPayload, EmailTemplate } from '../src/messaging/email.js';

/**
 * T157 — contrato de `email.request`.
 *
 * Valida que o schema aceita payloads bem-formados e recusa os malformados.
 * Um payload por destinatário: a falha em um endereço não bloqueia os demais.
 */

const validPayload = {
  notificationId: randomUUID(),
  scenarioId: randomUUID(),
  template: 'PHASE_ADVANCED' as const,
  to: 'usuario@empresa.com',
  variables: { scenarioName: 'Ciclo Set/26', phase: 'PUBLICATION' },
};

describe('EmailTemplate — enum', () => {
  it('aceita os três templates definidos', () => {
    expect(() => EmailTemplate.parse('FORECAST_READY')).not.toThrow();
    expect(() => EmailTemplate.parse('PHASE_ADVANCED')).not.toThrow();
    expect(() => EmailTemplate.parse('COLLABORATION_OPENED')).not.toThrow();
  });

  it('recusa template desconhecido', () => {
    expect(() => EmailTemplate.parse('UNKNOWN_TEMPLATE')).toThrow();
  });
});

describe('EmailRequestPayload — aceita', () => {
  it('payload completo válido', () => {
    const result = EmailRequestPayload.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('variables pode ser objeto vazio', () => {
    const result = EmailRequestPayload.safeParse({ ...validPayload, variables: {} });
    expect(result.success).toBe(true);
  });

  for (const template of ['FORECAST_READY', 'PHASE_ADVANCED', 'COLLABORATION_OPENED'] as const) {
    it(`aceita template ${template}`, () => {
      const result = EmailRequestPayload.safeParse({ ...validPayload, template });
      expect(result.success).toBe(true);
    });
  }
});

describe('EmailRequestPayload — recusa', () => {
  it('notificationId inválido (não é UUID)', () => {
    const result = EmailRequestPayload.safeParse({ ...validPayload, notificationId: 'nao-uuid' });
    expect(result.success).toBe(false);
  });

  it('scenarioId inválido (não é UUID)', () => {
    const result = EmailRequestPayload.safeParse({ ...validPayload, scenarioId: 'nao-uuid' });
    expect(result.success).toBe(false);
  });

  it('template desconhecido', () => {
    const result = EmailRequestPayload.safeParse({ ...validPayload, template: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });

  it('endereço de e-mail inválido', () => {
    const result = EmailRequestPayload.safeParse({ ...validPayload, to: 'nao-email' });
    expect(result.success).toBe(false);
  });

  it('variables ausente', () => {
    const { variables: _, ...rest } = validPayload;
    const result = EmailRequestPayload.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('variables com valor não-string', () => {
    const result = EmailRequestPayload.safeParse({
      ...validPayload,
      variables: { count: 42 },
    });
    expect(result.success).toBe(false);
  });
});
