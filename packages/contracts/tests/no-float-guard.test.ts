import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guarda automatizada do Princípio V.
 *
 * A revisão humana esquece; esta varredura não. Se alguém declarar uma grandeza
 * sensível como `z.number()`, o valor vira double no parse do JSON — antes de
 * qualquer validação rodar — e o erro de ponto flutuante entra no sistema sem
 * deixar rastro. Este teste falha o build nesse caso.
 */

const SRC = join(fileURLToPath(new URL('../src', import.meta.url)));

/** Nomes de campo que carregam grandeza monetária, de estoque ou de métrica. */
const SENSITIVE_FIELD = new RegExp(
  [
    'quantity',
    'amount',
    'value',
    'forecast',
    'calculated',
    'collaborated',
    'consensus',
    'published',
    'actual',
    'metric',
    'error',
    'delta',
    'tolerance',
    'weight',
  ].join('|'),
  'i',
);

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('guarda: nenhuma grandeza sensível declarada como z.number()', () => {
  const files = collectTsFiles(SRC);

  it('encontra arquivos de schema para varrer', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file.replace(SRC, 'src')} não usa z.number() em campo sensível`, () => {
      const violations: string[] = [];
      const lines = readFileSync(file, 'utf8').split('\n');

      lines.forEach((line, index) => {
        if (!line.includes('z.number(')) return;
        // A linha da própria definição do codec não é uma declaração de campo.
        if (line.trimStart().startsWith('*') || line.trimStart().startsWith('//')) return;
        if (SENSITIVE_FIELD.test(line)) {
          violations.push(`linha ${index + 1}: ${line.trim()}`);
        }
      });

      expect(violations, `use DecimalString() no lugar de z.number()`).toEqual([]);
    });
  }
});
