/**
 * Edição concorrente do mesmo item (FR-066a, FR-066b).
 *
 * Como todo colaborador enxerga e edita o cenário inteiro (FR-066), duas pessoas
 * podem mexer no mesmo item ao mesmo tempo. A resposta aqui é deliberada:
 * **nenhuma contribuição é apagada**. Cada alteração cria um registro novo e
 * marca o anterior como superado, de modo que o histórico completo sobrevive e a
 * trilha de auditoria continua fazendo sentido (Princípio VI).
 *
 * Sobrescrever em silêncio seria mais simples e destruiria justamente o dado que
 * o consenso precisa: quem propôs o quê, e por quê.
 */

export type AdjustmentOrigin = 'UI' | 'SPREADSHEET';

export type AdjustmentRecord = {
  id: string;
  authorId: string;
  quantity: string;
  reason: string;
  origin: AdjustmentOrigin;
  createdAt: string;
  /** Nulo no ajuste vigente; preenchido quando outro o substitui. */
  supersededById: string | null;
};

export type VersionCheck =
  | { allowed: true }
  | { allowed: false; code: 'ITEM_CHANGED'; reason: string };

/**
 * Confere se o cliente estava olhando a versão vigente do item.
 *
 * `expectedVersion` ausente é aceito de propósito: o cliente que não declara
 * versão assume o risco de sobrescrever. Exigir sempre quebraria a colaboração
 * por planilha, que é assíncrona por natureza.
 */
export function checkItemVersion(
  currentVersion: number,
  expectedVersion: number | undefined,
): VersionCheck {
  if (expectedVersion === undefined) {
    return { allowed: true };
  }

  if (expectedVersion === currentVersion) {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: 'ITEM_CHANGED',
    reason:
      expectedVersion > currentVersion
        ? `versão informada (${expectedVersion}) é maior que a atual (${currentVersion})`
        : `o item foi alterado por outra pessoa: você via a versão ${expectedVersion}, a atual é ${currentVersion}`,
  };
}

/**
 * Encadeia um novo ajuste, marcando o vigente anterior como superado.
 *
 * Devolve a cadeia inteira: nada é removido.
 */
export function supersede(
  chain: readonly AdjustmentRecord[],
  incoming: AdjustmentRecord,
): AdjustmentRecord[] {
  const updated = chain.map((record) =>
    record.supersededById === null ? { ...record, supersededById: incoming.id } : record,
  );
  return [...updated, { ...incoming, supersededById: null }];
}

/** O ajuste que está valendo — o único sem sucessor. */
export function currentAdjustment(
  chain: readonly AdjustmentRecord[],
): AdjustmentRecord | null {
  return chain.find((record) => record.supersededById === null) ?? null;
}
