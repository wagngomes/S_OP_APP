import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import golden from '../src/golden/envelope.json' with { type: 'json' };
import { AnyEnvelope, Envelope, JobReference, MESSAGING_VERSION, ObjectUri } from '../src/messaging/envelope.js';
import { DecimalString } from '../src/decimal/decimal-string.js';

describe('envelope — versão do contrato', () => {
  it('bate com os vetores dourados', () => {
    expect(MESSAGING_VERSION).toBe(golden.version);
  });
});

describe('envelope — mensagens aceitas', () => {
  for (const { name, message } of golden.accept) {
    it(`aceita ${name}`, () => {
      expect(() => Envelope(JobReference).parse(message)).not.toThrow();
    });
  }
});

describe('envelope — mensagens recusadas', () => {
  for (const { name, message } of golden.reject) {
    it(`recusa ${name}`, () => {
      expect(() => AnyEnvelope.parse(message)).toThrow();
    });
  }
});

describe('ObjectUri — referência, nunca o dado', () => {
  for (const uri of golden.objectUri.accept) {
    it(`aceita ${uri}`, () => {
      expect(() => ObjectUri.parse(uri)).not.toThrow();
    });
  }

  for (const uri of golden.objectUri.reject) {
    it(`recusa ${JSON.stringify(uri)}`, () => {
      expect(() => ObjectUri.parse(uri)).toThrow();
    });
  }
});

describe('grandeza sensível no payload de fila', () => {
  const Payload = z.object({ quantity: DecimalString() });

  it('recusa número JSON, que viraria double antes de qualquer validação', () => {
    expect(() => Payload.parse(golden.sensitiveNumberInPayload.reject)).toThrow();
  });

  it('aceita string decimal e canonicaliza', () => {
    const parsed = Payload.parse(golden.sensitiveNumberInPayload.accept);
    expect(parsed.quantity).toBe('1234.500000');
  });
});
