import { parse } from 'csv-parse';
import type { Readable } from 'node:stream';

/**
 * Parser CSV em streaming (T107).
 *
 * Formato esperado (ponto-e-vírgula como separador):
 *   product_code;{label1};...;{labelN};year;month;quantity
 *
 * Nenhum byte é bufferizado além do que o csv-parse mantém internamente —
 * o arquivo pode ser grande sem estourar a memória do worker (D7).
 *
 * Erros de parse são acumulados linha a linha; o stream é lido até o fim.
 */

export type ParsedRow = {
  lineNumber: number;
  productCode: string;
  /** Um valor por rótulo declarado, na mesma ordem. */
  segments: string[];
  year: number;
  month: number;
  /** String decimal — nunca `number` (Princípio V). */
  quantity: string;
};

export type ParseError = {
  lineNumber: number;
  column?: string;
  code: 'MISSING_COLUMN' | 'COLUMN_COUNT_MISMATCH' | 'INVALID_NUMBER' | 'INVALID_PERIOD';
  detail: string;
};

export type CsvParseResult = {
  rows: ParsedRow[];
  errors: ParseError[];
};

const FIXED_COLUMNS = ['product_code', 'year', 'month', 'quantity'] as const;

/**
 * Lê o stream CSV e devolve linhas válidas + erros acumulados.
 *
 * `declaredLabels` define as colunas de segmentação esperadas (entre
 * `product_code` e `year`). O cabeçalho do CSV deve conter exatamente esses
 * rótulos nessa ordem.
 */
export async function parseCsvStream(
  stream: NodeJS.ReadableStream,
  declaredLabels: string[],
): Promise<CsvParseResult> {
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  const expectedColumns = ['product_code', ...declaredLabels, 'year', 'month', 'quantity'];
  const expectedCount = expectedColumns.length;

  await new Promise<void>((resolve, reject) => {
    const parser = (stream as Readable).pipe(
      parse({
        delimiter: ';',
        relax_column_count: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

    let lineNumber = 0;
    let headerValidated = false;
    let headerError: ParseError | null = null;

    parser.on('data', (record: string[]) => {
      lineNumber++;

      if (lineNumber === 1) {
        // Valida cabeçalho
        const actual = record.map((c) => c.trim());
        if (actual.join(';') !== expectedColumns.join(';')) {
          headerError = {
            lineNumber: 1,
            code: 'MISSING_COLUMN',
            detail: `cabeçalho esperado "${expectedColumns.join(';')}", encontrado "${actual.join(';')}"`,
          };
          errors.push(headerError);
        }
        headerValidated = true;
        return;
      }

      if (headerError) {
        // Se o cabeçalho é inválido, não temos como mapear as colunas
        errors.push({
          lineNumber,
          code: 'MISSING_COLUMN',
          detail: 'cabeçalho inválido impede validação desta linha',
        });
        return;
      }

      // Verifica contagem de colunas
      if (record.length !== expectedCount) {
        errors.push({
          lineNumber,
          code: 'COLUMN_COUNT_MISMATCH',
          detail: `esperadas ${expectedCount} colunas, encontradas ${record.length}`,
        });
        return;
      }

      const productCode = (record[0] ?? '').trim();
      const segments = record.slice(1, 1 + declaredLabels.length).map((s) => s.trim());
      const yearRaw = (record[1 + declaredLabels.length] ?? '').trim();
      const monthRaw = (record[2 + declaredLabels.length] ?? '').trim();
      const quantityRaw = (record[3 + declaredLabels.length] ?? '').trim();

      const rowErrors: ParseError[] = [];

      // Valida ano
      const year = Number.parseInt(yearRaw, 10);
      if (!Number.isInteger(year) || yearRaw === '' || Number.isNaN(year) || year < 1900 || year > 2100) {
        rowErrors.push({
          lineNumber,
          column: 'year',
          code: 'INVALID_PERIOD',
          detail: `ano inválido: "${yearRaw}"`,
        });
      }

      // Valida mês
      const month = Number.parseInt(monthRaw, 10);
      if (!Number.isInteger(month) || monthRaw === '' || Number.isNaN(month) || month < 1 || month > 12) {
        rowErrors.push({
          lineNumber,
          column: 'month',
          code: 'INVALID_PERIOD',
          detail: `mês inválido: "${monthRaw}" (esperado 1-12)`,
        });
      }

      // Valida quantidade (deve ser número decimal válido)
      if (!/^-?\d+(\.\d+)?$/.test(quantityRaw)) {
        rowErrors.push({
          lineNumber,
          column: 'quantity',
          code: 'INVALID_NUMBER',
          detail: `quantidade inválida: "${quantityRaw}"`,
        });
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        return;
      }

      rows.push({
        lineNumber,
        productCode,
        segments,
        year,
        month,
        quantity: quantityRaw,
      });
    });

    parser.on('error', (err) => reject(err));
    parser.on('end', () => resolve());
  });

  return { rows, errors };
}
