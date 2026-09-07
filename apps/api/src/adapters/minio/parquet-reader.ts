import type { ForecastItemInput, ForecastSeriesInput, ParquetReader } from '../../composition/ports.js';

/**
 * Stub: leitura de Parquet do MinIO requer biblioteca nativa.
 * O ForecastResultConsumer nunca chama este adaptador com dados reais
 * enquanto o motor Python não escrever os Parquets — mas o stub garante
 * que o servidor inicializa sem erro.
 */
export class StubParquetReader implements ParquetReader {
  async readItems(_uri: string): Promise<ForecastItemInput[]> {
    throw Object.assign(
      new Error('leitura de Parquet não implementada neste ambiente'),
      { statusCode: 501, code: 'NOT_IMPLEMENTED' },
    );
  }

  async readSeries(_uri: string): Promise<ForecastSeriesInput[]> {
    throw Object.assign(
      new Error('leitura de Parquet não implementada neste ambiente'),
      { statusCode: 501, code: 'NOT_IMPLEMENTED' },
    );
  }
}
