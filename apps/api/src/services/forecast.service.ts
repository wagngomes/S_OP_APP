import { randomUUID } from 'node:crypto';
import { ForecastRequestPayload, MESSAGING_VERSION } from '@sop/contracts';
import { AppError } from '../middleware/error-handler.js';
import type {
  DatasetExporter,
  ForecastJobRecord,
  ForecastRepository,
  JobPublisher,
  ScenarioRecord,
  ScenarioRepository,
} from '../composition/ports.js';

/**
 * Serviço de disparo do cálculo de previsão (T103, FR-051).
 *
 * Recusa com 409 quando já há job ativo (PENDING ou PROCESSING).
 * Exporta o histórico como Parquet para o MinIO antes de publicar — o motor
 * recebe referência ao arquivo, nunca os dados diretamente (D5).
 */
export class ForecastService {
  constructor(
    private readonly forecast: ForecastRepository,
    private readonly scenarios: ScenarioRepository,
    private readonly publisher: JobPublisher,
    private readonly exporter: DatasetExporter,
  ) {}

  async trigger(
    scenario: ScenarioRecord,
    userId: string,
    correlationId: string,
  ): Promise<ForecastJobRecord> {
    // FR-051 — um único job ativo por cenário
    const active = await this.forecast.findActiveByScenario(scenario.id);
    if (active) {
      throw new AppError(
        409,
        'JOB_ALREADY_ACTIVE',
        `já existe um job de cálculo ativo (${active.status}) para este cenário`,
      );
    }

    const params = await this.scenarios.getParameters(scenario.id);
    if (!params) {
      throw new AppError(
        400,
        'PARAMETERS_MISSING',
        'salve a parametrização antes de disparar o cálculo',
      );
    }

    const jobId = randomUUID();
    const objectUri = `s3://sop/forecasts/${scenario.id}/${jobId}/input.parquet`;

    // D5 — exporta o histórico como Parquet; o motor recebe a referência
    await this.exporter.exportHistory(scenario.id, objectUri);

    const job = await this.forecast.create({
      scenarioId: scenario.id,
      objectUri,
      horizonMonths: params.horizonMonths,
      accuracyMetric: params.accuracyMetric,
      modelPackage: params.modelPackage,
      correlationId,
      requestedById: userId,
    });

    const levels = await this.scenarios.listLevels(scenario.id);
    const groupingLabels = params.groupingLevelIds
      .map((id) => levels.find((l) => l.id === id)?.label)
      .filter((l): l is string => l !== undefined);
    const granularLabels = levels
      .filter((l) => !params.groupingLevelIds.includes(l.id))
      .map((l) => l.label);

    const envelope = {
      messageId: randomUUID(),
      correlationId,
      occurredAt: new Date().toISOString(),
      version: MESSAGING_VERSION,
      type: 'forecast.request' as const,
      payload: {
        jobId: job.id,
        scenarioId: scenario.id,
        objectUri,
        uploadedById: userId,
        groupingLabels,
        granularLabels,
        prorationMonths: params.prorationMonths,
        horizonMonths: params.horizonMonths,
        accuracyMetric: params.accuracyMetric,
        modelPackage: params.modelPackage,
        decimalScale: 6,
        nonNegativeForecast: true,
      },
    };

    await this.publisher.publish('sop.forecast.request.v1', envelope, correlationId);

    // Avança a fase para CALCULATION (o motor está agora processando).
    await this.scenarios.transitionPhase(scenario.id, 'IMPORT_SETUP', 'CALCULATION');

    return job;
  }
}
