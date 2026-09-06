import { ForecastResultPayload } from '@sop/contracts';
import type {
  ForecastItemRepository,
  ForecastRepository,
  ParquetReader,
  ScenarioRepository,
} from '../../composition/ports.js';

/**
 * Consumidor de `sop.forecast.result.v1` (T104).
 *
 * Ao receber o resultado do motor:
 *  - COMPLETED → lê os Parquets, persiste ForecastItem e ForecastSeriesResult,
 *    avança a fase do cenário para APPROVAL.
 *  - FAILED → registra o motivo e mantém a fase (o usuário pode reparametrizar).
 *
 * A lógica de deduplicação (D6) fica por conta do idempotent-consumer que
 * envolve este handler: se o jobId já foi processado o ack é emitido sem
 * chamar `process` de novo.
 */
export class ForecastResultConsumer {
  constructor(
    private readonly forecast: ForecastRepository,
    private readonly items: ForecastItemRepository,
    private readonly parquet: ParquetReader,
    private readonly scenarios: ScenarioRepository,
  ) {}

  async process(rawPayload: unknown): Promise<void> {
    const payload = ForecastResultPayload.parse(rawPayload);
    const job = await this.forecast.findById(payload.jobId);

    if (!job) {
      throw new Error(`ForecastJob não encontrado: ${payload.jobId}`);
    }

    if (payload.status === 'completed') {
      const [forecastItems, forecastSeries] = await Promise.all([
        this.parquet.readItems(payload.outputUri),
        this.parquet.readSeries(payload.seriesUri),
      ]);

      await this.items.bulkCreateItems(payload.jobId, job.scenarioId, forecastItems);
      await this.items.bulkCreateSeries(payload.jobId, forecastSeries);

      await this.forecast.updateResult(payload.jobId, {
        status: 'COMPLETED',
        resultOutputUri: payload.outputUri,
        resultSeriesUri: payload.seriesUri,
      });

      // Avança a fase: CALCULATION → APPROVAL
      await this.scenarios.transitionPhase(job.scenarioId, 'CALCULATION', 'APPROVAL');
    } else {
      await this.forecast.updateResult(payload.jobId, {
        status: 'FAILED',
        failureReason: payload.failure.message,
      });
    }
  }
}
