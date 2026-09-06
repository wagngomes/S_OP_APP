import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { parseCsvStream } from '../../src/application/csv-stream-parser.js';
import { ISSUE_CAP, buildValidationReport } from '../../src/application/validation-report.js';

/**
 * T071 — Worker acumula relatório de linhas inválidas (FR-024).
 *
 * O worker NÃO aborta na primeira linha ruim: lê o arquivo inteiro e acumula
 * o relatório completo. Isso permite que o usuário corrija todos os erros de
 * uma vez em vez de fazer n ciclos de upload.
 */

function makeStream(csv: string): NodeJS.ReadableStream {
  return Readable.from([Buffer.from(csv)]);
}

const LABELS = ['BU', 'CD'];

// CSV válido — 3 linhas de dados corretas
const VALID_CSV = [
  'product_code;BU;CD;year;month;quantity',
  'P001;SP;CEN;2024;1;100.000000',
  'P002;SP;GRU;2024;1;200.000000',
  'P003;RJ;CEN;2024;2;50.000000',
].join('\n') + '\n';

// CSV misto — 2 válidas + 3 inválidas espalhadas
const MIXED_CSV = [
  'product_code;BU;CD;year;month;quantity',
  'P001;SP;CEN;2024;1;100.000000',   // válida (linha 2)
  'P002;SP;GRU;2024;13;200.000000',  // inválida: mês 13 (linha 3)
  'P003;RJ;CEN;2024;2;50.000000',    // válida (linha 4)
  'P004;RJ;CEN;abc;1;30.000000',     // inválida: ano não-numérico (linha 5)
  'P005;SP;2024;1;99.000000',        // inválida: colunas faltando (linha 6)
].join('\n') + '\n';

// CSV com muitas linhas inválidas para testar o teto de issues
function makeLargeInvalidCsv(count: number): string {
  const header = 'product_code;BU;CD;year;month;quantity';
  const lines = [header];
  for (let i = 0; i < count; i++) {
    // todas com mês inválido (13)
    lines.push(`P${String(i).padStart(4, '0')};SP;CEN;2024;13;100.000000`);
  }
  return lines.join('\n') + '\n';
}

describe('parseCsvStream', () => {
  it('analisa CSV válido sem erros', async () => {
    const result = await parseCsvStream(makeStream(VALID_CSV), LABELS);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(3);

    const first = result.rows[0];
    expect(first.productCode).toBe('P001');
    expect(first.segments).toEqual(['SP', 'CEN']);
    expect(first.year).toBe(2024);
    expect(first.month).toBe(1);
    expect(first.quantity).toBe('100.000000');
  });

  it('retorna erros para linhas inválidas sem interromper o parse', async () => {
    const result = await parseCsvStream(makeStream(MIXED_CSV), LABELS);

    // Deve ter parseado as duas linhas válidas
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    // E coletado erros das três inválidas
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('atribui número de linha correto a cada erro', async () => {
    const result = await parseCsvStream(makeStream(MIXED_CSV), LABELS);

    const lineNumbers = result.errors.map((e) => e.lineNumber);
    // As linhas inválidas são 3, 5 e 6 (1-indexed após o header)
    expect(lineNumbers).toContain(3);
    expect(lineNumbers).toContain(5);
    expect(lineNumbers).toContain(6);
  });
});

describe('buildValidationReport', () => {
  it('agrega validRows, invalidRows e issueCount corretos', async () => {
    const parsed = await parseCsvStream(makeStream(MIXED_CSV), LABELS);
    const report = buildValidationReport(parsed, LABELS);

    // 2 válidas, 3 inválidas
    expect(report.totalRows).toBe(5);
    expect(report.validRows).toBe(2);
    expect(report.invalidRows).toBe(3);
    expect(report.issues.length).toBe(3);
    expect(report.issueCapReached).toBe(false);
  });

  it('CSV totalmente válido tem invalidRows = 0', async () => {
    const parsed = await parseCsvStream(makeStream(VALID_CSV), LABELS);
    const report = buildValidationReport(parsed, LABELS);

    expect(report.totalRows).toBe(3);
    expect(report.validRows).toBe(3);
    expect(report.invalidRows).toBe(0);
    expect(report.issues).toHaveLength(0);
    expect(report.issueCapReached).toBe(false);
  });

  it(`trava o relatório em ${ISSUE_CAP} issues e sinaliza issueCapReached`, async () => {
    const count = ISSUE_CAP + 50;
    const csv = makeLargeInvalidCsv(count);
    const parsed = await parseCsvStream(makeStream(csv), LABELS);
    const report = buildValidationReport(parsed, LABELS);

    expect(report.issues.length).toBe(ISSUE_CAP);
    expect(report.issueCapReached).toBe(true);
    // totalRows ainda conta tudo
    expect(report.totalRows).toBe(count);
    expect(report.invalidRows).toBe(count);
  });

  it('acumula TODOS os issues — não aborta no primeiro (FR-024)', async () => {
    // Garante que nenhum mecanismo de "fail-fast" interrompa a acumulação
    const parsed = await parseCsvStream(makeStream(MIXED_CSV), LABELS);
    const report = buildValidationReport(parsed, LABELS);

    const codes = report.issues.map((i) => i.code);
    // Os três tipos diferentes de erro devem estar presentes
    expect(new Set(codes).size).toBeGreaterThanOrEqual(2);
  });
});
