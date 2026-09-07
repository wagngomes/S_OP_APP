-- AlterTable: adiciona URI separada para o Parquet de séries (ForecastSeriesResult)
-- O outputUri existente armazena o Parquet de itens; seriesOutputUri armazena o de séries.
ALTER TABLE "forecast_jobs" ADD COLUMN "seriesOutputUri" TEXT;
