-- Restrições que o Prisma não expressa no schema e que, por isso, precisam
-- viver aqui. Todas implementam requisitos da especificação NO BANCO em vez de
-- na aplicação: uma regra garantida por constraint não depende de disciplina de
-- quem escreve o próximo service.

-- ---------------------------------------------------------------------------
-- FR-051 — no máximo um job de cálculo ativo por cenário.
--
-- Índice PARCIAL: só vale para jobs em andamento. Sem isso, dois cliques no
-- botão de calcular disparam dois jobs concorrentes sobre o mesmo cenário, e a
-- corrida só aparece quando os dois resultados tentam persistir.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "forecast_jobs_one_active_per_scenario"
  ON "forecast_jobs" ("scenarioId")
  WHERE "status" IN ('PENDING', 'PROCESSING');

-- Mesma proteção para a ingestão: um upload por vez por cenário e tipo.
CREATE UNIQUE INDEX "ingestion_jobs_one_active_per_scenario_kind"
  ON "ingestion_jobs" ("scenarioId", "kind")
  WHERE "status" IN ('PENDING', 'PROCESSING');

-- ---------------------------------------------------------------------------
-- FR-076 — a previsão publicada é imutável.
--
-- A aplicação não expõe rota de update; o gatilho garante que nem um script
-- avulso nem um bug futuro consigam alterar o número oficial.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sop_block_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'registro imutavel: % nao aceita % (constituicao, Principio VI)',
    TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "published_forecasts_immutable"
  BEFORE UPDATE OR DELETE ON "published_forecasts"
  FOR EACH ROW EXECUTE FUNCTION sop_block_mutation();

-- ---------------------------------------------------------------------------
-- FR-100 — a trilha de auditoria não é editável pelo fluxo normal.
--
-- Log é operacional e descartável; a trilha é registro de negócio e permanente.
-- Permitir update aqui apagaria a única prova de quem decidiu o quê.
-- ---------------------------------------------------------------------------
CREATE TRIGGER "audit_events_immutable"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION sop_block_mutation();

-- ---------------------------------------------------------------------------
-- FR-058 — todo ajuste de colaboração tem motivo.
--
-- A validação também existe no domínio; aqui é a rede de segurança para
-- qualquer caminho de escrita que venha a existir depois.
-- ---------------------------------------------------------------------------
ALTER TABLE "collaboration_adjustments"
  ADD CONSTRAINT "collaboration_adjustments_reason_not_blank"
  CHECK (length(btrim("reason")) > 0);

-- FR-071/FR-070 — decisão MANUAL exige motivo declarado.
ALTER TABLE "consensus_decisions"
  ADD CONSTRAINT "consensus_decisions_manual_requires_reason"
  CHECK ("source" <> 'MANUAL' OR (("reason" IS NOT NULL) AND length(btrim("reason")) > 0));

-- ---------------------------------------------------------------------------
-- FR-040a — a previsão de venda nunca é negativa.
-- O piso zero é aplicado no motor, antes do rateio; aqui é a verificação de que
-- ele realmente foi aplicado.
-- ---------------------------------------------------------------------------
ALTER TABLE "forecast_items"
  ADD CONSTRAINT "forecast_items_non_negative"
  CHECK ("calculatedQuantity" >= 0);

ALTER TABLE "published_forecasts"
  ADD CONSTRAINT "published_forecasts_non_negative"
  CHECK ("quantity" >= 0);

-- Mês válido em toda série temporal do sistema.
ALTER TABLE "sales_records"
  ADD CONSTRAINT "sales_records_month_range" CHECK ("month" BETWEEN 1 AND 12);

ALTER TABLE "actual_sales_records"
  ADD CONSTRAINT "actual_sales_records_month_range" CHECK ("month" BETWEEN 1 AND 12);

ALTER TABLE "forecast_items"
  ADD CONSTRAINT "forecast_items_month_range" CHECK ("month" BETWEEN 1 AND 12);

ALTER TABLE "accuracy_runs"
  ADD CONSTRAINT "accuracy_runs_month_range" CHECK ("periodMonth" BETWEEN 1 AND 12);
