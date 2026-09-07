import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { AppError } from '../middleware/error-handler.js';
import type { CollaborationRepository, DatasetStore, ScenarioRepository } from '../composition/ports.js';

const SHEET_EXPIRY_SECONDS = 3600;

export class CollaborationSheetService {
  constructor(
    private readonly scenarios: ScenarioRepository,
    private readonly collab: CollaborationRepository,
    private readonly datasets: DatasetStore,
  ) {}

  /** FR-060 — gera a planilha de colaboração (CSV) e devolve a URL assinada. */
  async generateSheet(
    scenarioId: string,
    userId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const scenario = await this.scenarios.findById(scenarioId);
    if (!scenario) throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    if (!(await this.scenarios.isMember(scenarioId, userId))) {
      throw new AppError(404, 'NOT_FOUND', 'cenário não encontrado');
    }

    // Carrega todos os itens com ajuste atual
    const all: typeof result.data = [];
    let offset = 0;
    const limit = 500;
    let result = await this.collab.listItemsWithAdjustments(scenarioId, { limit, offset });
    all.push(...result.data);
    while (all.length < result.total) {
      offset += limit;
      result = await this.collab.listItemsWithAdjustments(scenarioId, { limit, offset });
      all.push(...result.data);
    }

    if (all.length === 0) {
      throw new AppError(409, 'NO_FORECAST', 'nenhum item de previsão disponível para este cenário');
    }

    // Número de segmentos do primeiro item
    const nSeg = all[0]?.segments.length ?? 0;
    const segHeaders = Array.from({ length: nSeg }, (_, i) => `segment_${i + 1}`);

    const header = ['forecastItemId', 'productCode', ...segHeaders, 'period', 'calculated_quantity', 'adjusted_quantity', 'reason'];
    const rows = all.map((item) => {
      const period = `${item.year}-${String(item.month).padStart(2, '0')}`;
      const adjusted = item.currentAdjustment?.quantity ?? item.calculatedQuantity;
      const reason = item.currentAdjustment?.reason ?? '';
      return [item.id, item.productCode, ...item.segments, period, item.calculatedQuantity, adjusted, reason];
    });

    const csv = [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');

    const sheetId = randomUUID();
    const objectUri = `s3://sop/collaboration-sheets/${scenarioId}/${sheetId}.csv`;
    const stream = Readable.from([csv]);
    await this.datasets.putStream(objectUri, stream);

    const expiresAt = new Date(Date.now() + SHEET_EXPIRY_SECONDS * 1000).toISOString();
    const url = await this.datasets.presignGet(objectUri, SHEET_EXPIRY_SECONDS);

    return { url, expiresAt };
  }
}

function escapeCell(value: string | number | undefined): string {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
