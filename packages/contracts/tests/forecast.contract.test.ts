import { describe, expect, it } from 'vitest';
import golden from '../src/golden/forecast.json' with { type: 'json' };
import { ForecastRequestPayload, ForecastResultPayload } from '../src/messaging/forecast.js';
import { IngestionRequestPayload } from '../src/messaging/ingestion.js';

/**
 * T069 — Teste de contrato de forecast.request, forecast.result e ingestion.request.
 *
 * Os MESMOS vetores dourados são lidos pelo lado Python (test_forecast_messages.py).
 * Uma divergência de interpretação entre as linguagens quebra as duas suítes.
 */

describe('ForecastRequestPayload — payloads aceitos', () => {
  for (const { name, payload } of golden.forecastRequest.accept) {
    it(`aceita ${name}`, () => {
      expect(() => ForecastRequestPayload.parse(payload)).not.toThrow();
    });
  }
});

describe('ForecastRequestPayload — payloads recusados', () => {
  for (const { name, payload } of golden.forecastRequest.reject) {
    it(`recusa ${name}`, () => {
      expect(() => ForecastRequestPayload.parse(payload)).toThrow();
    });
  }
});

describe('ForecastResultPayload — payloads aceitos', () => {
  for (const { name, payload } of golden.forecastResult.accept) {
    it(`aceita ${name}`, () => {
      expect(() => ForecastResultPayload.parse(payload)).not.toThrow();
    });
  }
});

describe('ForecastResultPayload — payloads recusados', () => {
  for (const { name, payload } of golden.forecastResult.reject) {
    it(`recusa ${name}`, () => {
      expect(() => ForecastResultPayload.parse(payload)).toThrow();
    });
  }
});

describe('IngestionRequestPayload — payloads aceitos', () => {
  for (const { name, payload } of golden.ingestionRequest.accept) {
    it(`aceita ${name}`, () => {
      expect(() => IngestionRequestPayload.parse(payload)).not.toThrow();
    });
  }
});

describe('IngestionRequestPayload — payloads recusados', () => {
  for (const { name, payload } of golden.ingestionRequest.reject) {
    it(`recusa ${name}`, () => {
      expect(() => IngestionRequestPayload.parse(payload)).toThrow();
    });
  }
});

describe('ForecastResultPayload — discriminação por status', () => {
  it('completed exige outputUri e seriesUri não-nulos', () => {
    const completedCase = golden.forecastResult.accept.find((c) => c.name === 'result-concluido')!;
    const parsed = ForecastResultPayload.parse(completedCase.payload);
    expect(parsed.status).toBe('completed');
    if (parsed.status === 'completed') {
      expect(parsed.outputUri).toMatch(/^s3:\/\//);
      expect(parsed.failure).toBeNull();
    }
  });

  it('failed exige failure não-nulo e URIs nulos', () => {
    const failedCase = golden.forecastResult.accept.find((c) => c.name === 'result-falhou')!;
    const parsed = ForecastResultPayload.parse(failedCase.payload);
    expect(parsed.status).toBe('failed');
    if (parsed.status === 'failed') {
      expect(parsed.failure.code).toBeTruthy();
      expect(parsed.outputUri).toBeNull();
    }
  });
});
