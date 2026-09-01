import { describe, expect, it } from 'vitest';
import {
  parseDeclaredLabels,
  parseSegments,
  validateDeclaredLabels,
  validateRowSegments,
} from '../../src/ingestion/segment-validation.js';

describe('rótulos declarados (FR-021, FR-022)', () => {
  it('separa por ponto e vírgula, preservando a ordem da hierarquia', () => {
    expect(parseDeclaredLabels('BU;Setor;CD')).toEqual(['BU', 'Setor', 'CD']);
  });

  it('remove espaços em volta de cada rótulo', () => {
    expect(parseDeclaredLabels(' BU ; Setor ;CD ')).toEqual(['BU', 'Setor', 'CD']);
  });

  it('aceita uma declaração válida', () => {
    expect(validateDeclaredLabels(['BU', 'Setor', 'CD'])).toEqual([]);
  });

  it('recusa declaração vazia', () => {
    const issues = validateDeclaredLabels([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('MISSING_COLUMN');
  });

  it('recusa rótulo repetido — a hierarquia ficaria ambígua', () => {
    const issues = validateDeclaredLabels(['BU', 'CD', 'CD']);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('STRUCTURE_CHANGED');
    expect(issues[0]?.detail).toContain('CD');
  });

  it('recusa rótulo em branco', () => {
    expect(validateDeclaredLabels(['BU', '', 'CD'])).not.toEqual([]);
  });
});

describe('segmentos de uma linha (FR-020)', () => {
  it('separa a Estrutura Comercial por ponto e vírgula', () => {
    expect(parseSegments('ESP;Delivery;1029')).toEqual(['ESP', 'Delivery', '1029']);
  });

  it('preserva segmento numérico como texto — 1029 é um código, não um número', () => {
    expect(parseSegments('ESP;Delivery;1029')[2]).toBe('1029');
  });
});

describe('contagem de segmentos contra os rótulos (FR-023, FR-024)', () => {
  const labels = ['BU', 'Setor', 'CD'];

  it('aceita a linha com a contagem exata', () => {
    expect(validateRowSegments('ESP;Delivery;1029', labels, 42)).toBeNull();
  });

  it('recusa a linha com segmentos a menos', () => {
    const issue = validateRowSegments('ESP;Delivery', labels, 42);
    expect(issue).not.toBeNull();
    expect(issue?.code).toBe('SEGMENT_COUNT_MISMATCH');
    expect(issue?.lineNumber).toBe(42);
  });

  it('recusa a linha com segmentos a mais', () => {
    const issue = validateRowSegments('ESP;Delivery;1029;extra', labels, 7);
    expect(issue?.code).toBe('SEGMENT_COUNT_MISMATCH');
    expect(issue?.lineNumber).toBe(7);
  });

  it('reporta o esperado e o encontrado, para o usuário saber o que corrigir', () => {
    const issue = validateRowSegments('ESP;Delivery', labels, 42);
    expect(issue?.detail).toContain('3');
    expect(issue?.detail).toContain('2');
    expect(issue?.detail).toContain('ESP;Delivery');
  });

  it('recusa Estrutura Comercial vazia', () => {
    expect(validateRowSegments('', labels, 1)?.code).toBe('SEGMENT_COUNT_MISMATCH');
  });

  it('trata segmento vazio no meio como segmento presente e vazio', () => {
    // 'ESP;;1029' tem 3 posições — a do meio está em branco. A contagem está
    // certa; o conteúdo é problema de outra validação, não desta.
    expect(validateRowSegments('ESP;;1029', labels, 1)).toBeNull();
  });
});
