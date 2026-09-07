import type { DatasetExporter } from '../../composition/ports.js';

/**
 * Stub: exportação de histórico para Parquet requer biblioteca nativa (DuckDB
 * ou parquetjs). Implemente este adaptador quando adicionar a dependência ao
 * package.json. O ForecastService falha com 501 ao tentar disparar o cálculo
 * enquanto este stub estiver ativo.
 */
export class StubDatasetExporter implements DatasetExporter {
  async exportHistory(_scenarioId: string, _outputUri: string): Promise<void> {
    throw Object.assign(
      new Error(
        'exportação de Parquet não implementada neste ambiente: adicione uma biblioteca Parquet ao package.json',
      ),
      { statusCode: 501, code: 'NOT_IMPLEMENTED' },
    );
  }
}
