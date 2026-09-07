import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { persistCollaborationSheet } from '../../../ingestion-worker/src/application/persist-collaboration-sheet.js';
import type { CollaborationPort, CollaborationSheetItem, IssuePort, IssueRow, JobPort } from '../../../ingestion-worker/src/composition/ports.js';

/**
 * T131 — FR-066c: planilha antiga sinaliza itens já alterados por terceiros.
 *
 * O job completa com sucesso mas emite issues STALE_ITEM para linhas cujo
 * item já foi modificado por outro colaborador via UI.
 */

// --- Fakes mínimas -----------------------------------------------------------

class TrackingJobPort implements JobPort {
  completed = false;
  failed = false;
  async startJob(): Promise<void> {}
  async completeJob(): Promise<void> { this.completed = true; }
  async failJob(): Promise<void> { this.failed = true; }
}

class SeedableCollaborationPort implements CollaborationPort {
  readonly adjustments: unknown[] = [];
  private readonly items: Map<string, CollaborationSheetItem>;

  constructor(items: CollaborationSheetItem[]) {
    this.items = new Map(items.map((i) => [i.id, i]));
  }

  async findItemsByIds(_: string, ids: string[]): Promise<Map<string, CollaborationSheetItem>> {
    const result = new Map<string, CollaborationSheetItem>();
    for (const id of ids) {
      const item = this.items.get(id);
      if (item) result.set(id, item);
    }
    return result;
  }

  async createAdjustment(input: unknown): Promise<void> { this.adjustments.push(input); }
}

class TrackingIssuePort implements IssuePort {
  readonly rows: IssueRow[] = [];
  async bulkCreateIssues(_: string, issues: IssueRow[]): Promise<void> { this.rows.push(...issues); }
}

function makeStream(content: string): NodeJS.ReadableStream {
  return Readable.from([content]);
}

// --- Testes ------------------------------------------------------------------

describe('persistCollaborationSheet — itens stale (FR-066c)', () => {
  it('emite STALE_ITEM para item já alterado por terceiro, mas ainda aplica ajuste', async () => {
    const uploaderId = randomUUID();
    const otherUserId = randomUUID();
    const itemId = randomUUID();

    const job = new TrackingJobPort();
    const issues = new TrackingIssuePort();
    const collab = new SeedableCollaborationPort([
      {
        id: itemId,
        scenarioId: randomUUID(),
        calculatedQuantity: '100.000000',
        // Já foi alterado por outro usuário
        currentAdjustmentAuthorId: otherUserId,
      },
    ]);

    const csv = [
      'forecastItemId,productCode,period,calculated_quantity,adjusted_quantity,reason',
      `${itemId},PROD-001,2025-01,100.000000,120.000000,crescimento esperado`,
    ].join('\n');

    await persistCollaborationSheet(randomUUID(), randomUUID(), uploaderId, makeStream(csv), {
      job,
      collaboration: collab,
      issues,
    });

    expect(job.completed).toBe(true);
    expect(job.failed).toBe(false);

    const staleIssues = issues.rows.filter((r) => r.code === 'STALE_ITEM');
    expect(staleIssues).toHaveLength(1);
    expect(staleIssues[0]!.column).toBe('adjusted_quantity');

    // Ajuste ainda deve ser aplicado
    expect(collab.adjustments).toHaveLength(1);
  });

  it('não emite STALE_ITEM quando não há ajuste anterior', async () => {
    const itemId = randomUUID();

    const job = new TrackingJobPort();
    const issues = new TrackingIssuePort();
    const collab = new SeedableCollaborationPort([
      {
        id: itemId,
        scenarioId: randomUUID(),
        calculatedQuantity: '50.000000',
        currentAdjustmentAuthorId: null,
      },
    ]);

    const csv = [
      'forecastItemId,productCode,period,calculated_quantity,adjusted_quantity,reason',
      `${itemId},PROD-002,2025-02,50.000000,60.000000,ajuste de quota`,
    ].join('\n');

    await persistCollaborationSheet(randomUUID(), randomUUID(), randomUUID(), makeStream(csv), {
      job,
      collaboration: collab,
      issues,
    });

    expect(job.completed).toBe(true);
    expect(issues.rows.filter((r) => r.code === 'STALE_ITEM')).toHaveLength(0);
    expect(collab.adjustments).toHaveLength(1);
  });

  it('não emite STALE_ITEM quando o ajuste anterior é do próprio uploader', async () => {
    const uploaderId = randomUUID();
    const itemId = randomUUID();

    const job = new TrackingJobPort();
    const issues = new TrackingIssuePort();
    const collab = new SeedableCollaborationPort([
      {
        id: itemId,
        scenarioId: randomUUID(),
        calculatedQuantity: '80.000000',
        currentAdjustmentAuthorId: uploaderId,
      },
    ]);

    const csv = [
      'forecastItemId,productCode,period,calculated_quantity,adjusted_quantity,reason',
      `${itemId},PROD-003,2025-03,80.000000,90.000000,atualização própria`,
    ].join('\n');

    await persistCollaborationSheet(randomUUID(), randomUUID(), uploaderId, makeStream(csv), {
      job,
      collaboration: collab,
      issues,
    });

    expect(job.completed).toBe(true);
    expect(issues.rows.filter((r) => r.code === 'STALE_ITEM')).toHaveLength(0);
  });
});
