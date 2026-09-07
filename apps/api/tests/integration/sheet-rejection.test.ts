import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { persistCollaborationSheet } from '../../../ingestion-worker/src/application/persist-collaboration-sheet.js';
import type { CollaborationPort, CollaborationSheetItem, IssuePort, IssueRow, JobPort } from '../../../ingestion-worker/src/composition/ports.js';

/**
 * T130 — FR-062: planilha com estrutura alterada é recusada integralmente.
 *
 * Nenhum ajuste deve ser criado quando a planilha tem colunas obrigatórias ausentes.
 */

// --- Fakes mínimas -----------------------------------------------------------

class TrackingJobPort implements JobPort {
  started = false;
  completed = false;
  failed = false;
  failureReason = '';

  async startJob(): Promise<void> { this.started = true; }
  async completeJob(): Promise<void> { this.completed = true; }
  async failJob(_: string, reason: string): Promise<void> { this.failed = true; this.failureReason = reason; }
}

class TrackingCollaborationPort implements CollaborationPort {
  readonly adjustments: unknown[] = [];

  async findItemsByIds(scenarioId: string, ids: string[]): Promise<Map<string, CollaborationSheetItem>> {
    return new Map(ids.map((id) => [id, { id, scenarioId, calculatedQuantity: '100.000000', currentAdjustmentAuthorId: null }]));
  }

  async createAdjustment(input: unknown): Promise<void> {
    this.adjustments.push(input);
  }
}

class FakeIssuePort implements IssuePort {
  readonly rows: IssueRow[] = [];
  async bulkCreateIssues(_: string, issues: IssueRow[]): Promise<void> { this.rows.push(...issues); }
}

function makeStream(content: string): NodeJS.ReadableStream {
  return Readable.from([content]);
}

// --- Testes ------------------------------------------------------------------

describe('persistCollaborationSheet — rejeição por estrutura alterada (FR-062)', () => {
  it('falha o job quando coluna obrigatória está ausente', async () => {
    const job = new TrackingJobPort();
    const collab = new TrackingCollaborationPort();
    const issues = new FakeIssuePort();

    // Planilha sem a coluna 'adjusted_quantity'
    const csv = [
      'forecastItemId,productCode,period,calculated_quantity,reason',
      `${randomUUID()},PROD-001,2025-01,100.000000,ok`,
    ].join('\n');

    await expect(
      persistCollaborationSheet(randomUUID(), randomUUID(), randomUUID(), makeStream(csv), {
        job,
        collaboration: collab,
        issues,
      }),
    ).rejects.toThrow();

    expect(job.failed).toBe(true);
    expect(job.completed).toBe(false);
    expect(collab.adjustments).toHaveLength(0);
  });

  it('falha o job quando coluna forecastItemId está ausente', async () => {
    const job = new TrackingJobPort();
    const collab = new TrackingCollaborationPort();
    const issues = new FakeIssuePort();

    const csv = [
      'productCode,period,calculated_quantity,adjusted_quantity,reason',
      'PROD-001,2025-01,100.000000,110.000000,aumento sazonal',
    ].join('\n');

    await expect(
      persistCollaborationSheet(randomUUID(), randomUUID(), randomUUID(), makeStream(csv), {
        job,
        collaboration: collab,
        issues,
      }),
    ).rejects.toThrow();

    expect(job.failed).toBe(true);
    expect(collab.adjustments).toHaveLength(0);
  });

  it('aplica ajustes normalmente quando estrutura está correta', async () => {
    const job = new TrackingJobPort();
    const collab = new TrackingCollaborationPort();
    const issues = new FakeIssuePort();

    const itemId = randomUUID();
    const csv = [
      'forecastItemId,productCode,period,calculated_quantity,adjusted_quantity,reason',
      `${itemId},PROD-001,2025-01,100.000000,110.000000,aumento de demanda`,
    ].join('\n');

    await persistCollaborationSheet(randomUUID(), randomUUID(), randomUUID(), makeStream(csv), {
      job,
      collaboration: collab,
      issues,
    });

    expect(job.failed).toBe(false);
    expect(job.completed).toBe(true);
    expect(collab.adjustments).toHaveLength(1);
  });
});
