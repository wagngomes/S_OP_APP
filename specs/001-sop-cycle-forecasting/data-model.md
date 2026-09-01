# Phase 1 — Data Model: SOP_APP

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-31 (atualizado 2026-09-01)

Modelo lógico persistido em PostgreSQL e acessado exclusivamente pela camada Node via Prisma.
O motor Python não conhece este schema (Princípio III).

## Convenções

- **Identificadores**: UUID v7 em todas as entidades, gerado na aplicação.
- **Precisão numérica** (D13 em [research.md](./research.md)):
  - quantidade e previsão → `Decimal(18,6)`
  - percentual e métrica → `Decimal(12,6)`
  - arredondamento `ROUND_HALF_UP` em todo o sistema
  - nunca `Float`/`Double` para grandeza de negócio
- **Tempo**: `timestamptz`, sempre em UTC; a granularidade de planejamento é mensal, expressa
  pelo par `(year, month)`.
- **Auditoria**: toda escrita em dado de planejamento grava `AuditEvent` na **mesma transação**.

---

## Identidade e acesso

### User
Conta de acesso, gerenciada por BetterAuth.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `email` | string | único, obrigatório (FR-003) |
| `name` | string | opcional |
| `emailVerifiedAt` | timestamptz? | |
| `createdAt` / `updatedAt` | timestamptz | |

Tabelas `Session`, `Account` e `Verification` seguem o schema do BetterAuth e não são
detalhadas aqui.

---

## Cenário e equipe

### Scenario
Unidade que contém um ciclo completo de S&OP.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK — identificador único do cenário (FR-007) |
| `name` | string | obrigatório |
| `phase` | enum `ScenarioPhase` | fase atual (FR-008) |
| `createdById` | UUID | FK → User |
| `finalSayRole` | enum `CREATOR \| APPROVER` | default `CREATOR` (FR-011, FR-012) |
| `teamClosedAt` | timestamptz? | não nulo trava a equipe (FR-013, FR-014) |
| `forecastHorizonMonths` | int | default 12 |
| `consensusToleranceValue` | Decimal(12,6)? | faixa aceitável (FR-067) |
| `consensusToleranceKind` | enum `ABSOLUTE \| PERCENT`? | |
| `publishedAt` | timestamptz? | não nulo torna a previsão imutável (FR-076) |

**`ScenarioPhase`**: `TEAM_SETUP → IMPORT_SETUP → CALCULATION → APPROVAL → COLLABORATION →
CONSENSUS → PUBLICATION → ACCURACY`.

Transições permitidas — nenhuma outra é aceita (FR-016):

| De | Para | Quem | Guarda |
|----|------|------|--------|
| `TEAM_SETUP` | `IMPORT_SETUP` | criador | equipe fechada, ≥ 1 aprovador (FR-015) |
| `IMPORT_SETUP` | `CALCULATION` | criador | ingestão `completed` sem issues bloqueantes, parametrização completa |
| `CALCULATION` | `APPROVAL` | sistema | job de forecast `completed` |
| `APPROVAL` | `COLLABORATION` | aprovador | aprovação registrada (FR-055) |
| `APPROVAL` | `IMPORT_SETUP` | aprovador | devolução com motivo (FR-056) |
| `COLLABORATION` | `CONSENSUS` | sistema ou criador | todos concluíram (FR-064) ou encerramento pelo criador (FR-065) |
| `CONSENSUS` | `PUBLICATION` | responsável | nenhum item sem decisão (FR-073) |
| `PUBLICATION` | `ACCURACY` | sistema | publicação efetivada |

### ScenarioMember
Vínculo entre usuário e cenário.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario |
| `userId` | UUID? | nulo enquanto o convidado não tem conta (FR-018) |
| `invitedEmail` | string | usado para vincular na criação da conta |
| `role` | enum `CREATOR \| APPROVER \| COLLABORATOR` | (FR-010) |
| `collaborationDoneAt` | timestamptz? | conclusão da participação (FR-063) |

Único em `(scenarioId, invitedEmail, role)`. Um usuário pode acumular papéis.

---

## Layout de segmentação

### SegmentationLevel
Rótulos declarados na importação, que definem os níveis do cenário (FR-021, FR-022).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario |
| `position` | int | 0-based; a ordem é a hierarquia, do mais abrangente ao mais granular |
| `label` | string | ex.: `BU`, `Setor`, `CD` |

Único em `(scenarioId, position)` e em `(scenarioId, label)` — rótulo repetido é rejeitado.

---

## Ingestão

### IngestionJob
Ciclo interno do upload, distinto das fases do cenário.

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK — devolvido no 202 Accepted |
| `scenarioId` | UUID | FK → Scenario |
| `kind` | enum `SALES_HISTORY \| COLLABORATION_SHEET \| ACTUAL_SALES` | |
| `status` | enum `PENDING \| PROCESSING \| COMPLETED \| FAILED` | |
| `objectUri` | string | caminho no MinIO |
| `declaredLabels` | string[] | rótulos declarados nesta importação |
| `totalRows` / `validRows` / `invalidRows` | int | |
| `issueCount` / `issueCapReached` | int / bool | teto de issues atingido (D7) |
| `uploadedById` | UUID | FK → User |
| `startedAt` / `finishedAt` / `failureReason` | | |

Único em `id`; a transição de status é condicional, garantindo idempotência (D6).

### IngestionIssue
Relatório acumulado de linhas inválidas (FR-024).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `jobId` | UUID | FK → IngestionJob |
| `lineNumber` | int | linha do arquivo original |
| `column` | string? | coluna envolvida |
| `code` | enum | `SEGMENT_COUNT_MISMATCH`, `MISSING_COLUMN`, `INVALID_NUMBER`, `INVALID_PERIOD`, `UNKNOWN_ITEM`, `ALIEN_ITEM`, `STRUCTURE_CHANGED` |
| `detail` | string | conteúdo encontrado |

Índice em `(jobId, lineNumber)` para paginação do relatório.

---

## Histórico e realizado

### SalesRecord
Linha consolidada do histórico importado (FR-019, FR-028).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario |
| `productCode` | string | |
| `segments` | string[] | valores da Estrutura Comercial, na ordem dos `SegmentationLevel` |
| `year` / `month` | int | `month` 1..12 |
| `quantity` | Decimal(18,6) | aceita negativo (devolução) |
| `sourceJobId` | UUID | FK → IngestionJob — rastreabilidade (FR-029) |

Único em `(scenarioId, productCode, segments, year, month)`: a segunda ocorrência é somada na
consolidação, e a contagem de duplicidades é reportada ao usuário.

### ActualSalesRecord
Vendas reais para a apuração (FR-078). Mesma forma de `SalesRecord`, com `scenarioId`,
`productCode`, `segments`, `year`, `month`, `quantity` e `sourceJobId`.

Único em `(scenarioId, productCode, segments, year, month)`; o reenvio do mesmo mês
**substitui** o conjunto anterior daquele mês, e a substituição é informada (FR-088).

---

## Parametrização e cálculo

### ForecastParameters
Parametrização vigente do cenário (FR-031 a FR-038).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario, único |
| `groupingLevelIds` | UUID[] | um ou mais níveis — combinação (FR-032); sem repetição (FR-032b); não vazio (FR-032c) |
| `prorationMonths` | int | ≤ meses disponíveis no histórico (FR-034) |
| `accuracyMetric` | enum `AccuracyMetric` | obrigatório (FR-035), default `WMAPE` (FR-036a) |
| `modelPackage` | enum `FAST \| STANDARD \| COMPLETE` | obrigatório (FR-034b) |
| `horizonMonths` | int | default 12 |

**`AccuracyMetric`**: `WMAPE`, `MAPE`, `BIAS` (FR-036), extensível.

**`modelPackage`**: define conjuntamente os modelos candidatos e o número de janelas de
backtest (D1, D14). Cumulativo: `FAST` ⊂ `STANDARD` ⊂ `COMPLETE`.

### ForecastJob
Execução de previsão (FR-051, FR-052).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario |
| `status` | enum `PENDING \| PROCESSING \| COMPLETED \| FAILED` | |
| `parametersSnapshot` | jsonb | parametrização congelada no disparo, incluindo `modelPackage` (FR-104) |
| `modelCatalogVersion` | string | fixa catálogo **e** configuração de backtest desta execução (FR-043c, FR-043e) |
| `seriesCount` | int | séries distintas da combinação — base da estimativa e do diagnóstico (FR-034a) |
| `inputUri` / `outputUri` | string | MinIO |
| `requestedById` | UUID | FK → User |
| `startedAt` / `finishedAt` / `failureReason` | | |

Índice parcial único garantindo **no máximo um job ativo por cenário** (`status IN
('PENDING','PROCESSING')`), o que implementa FR-051 no banco e não na aplicação.

### ForecastItem
Previsão por item na granularidade original, por mês (FR-044).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `jobId` | UUID | FK → ForecastJob |
| `scenarioId` | UUID | FK → Scenario |
| `productCode` | string | |
| `segments` | string[] | granularidade original |
| `seriesKey` | string | chave da série agregada de origem |
| `year` / `month` | int | mês do horizonte |
| `calculatedQuantity` | Decimal(18,6) | valor rateado e quantizado |

Único em `(jobId, productCode, segments, year, month)`.

### ForecastSeriesResult
Resultado por série agregada (FR-048, FR-049, FR-043a).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `jobId` | UUID | FK → ForecastJob |
| `seriesKey` | string | combinação de níveis que define a série |
| `winningModel` | string | modelo vencedor |
| `evaluatedModels` | jsonb | candidatos avaliados e seus erros (FR-043a) |
| `metricValue` | Decimal(12,6) | erro do vencedor na métrica escolhida — **acurácia do modelo** |
| `otherMetrics` | jsonb | demais métricas, exibidas para transparência (FR-050) |
| `fallbackApplied` | bool | nenhum candidato aplicável (FR-043b) |
| `backtestWindowsUsed` | int | janelas efetivamente usadas; menor que o pacote quando a série é curta (D14) |
| `excludedModels` | jsonb | modelos descartados na série e o motivo — histórico insuficiente ou valor não positivo (D14, D16) |

Único em `(jobId, seriesKey)`.

---

## Colaboração, consenso e publicação

### CollaborationAdjustment
Ajuste feito por colaborador (FR-057 a FR-062).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario |
| `forecastItemId` | UUID | FK → ForecastItem |
| `authorId` | UUID | FK → User |
| `quantity` | Decimal(18,6) | número colaborado |
| `reason` | string | **obrigatório** (FR-058) |
| `origin` | enum `UI \| SPREADSHEET` | (FR-061) |
| `supersededById` | UUID? | encadeia versões na edição concorrente (FR-066a) |
| `createdAt` | timestamptz | |

Nunca sofre update: uma nova alteração cria nova linha e marca a anterior como superada. O
número calculado permanece em `ForecastItem` (FR-059) e o histórico completo fica preservado.

### ConsensusDecision
Decisão item a item (FR-070 a FR-072).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `forecastItemId` | UUID | FK → ForecastItem, único |
| `decidedById` | UUID | FK → User — só o responsável (FR-071) |
| `source` | enum `CALCULATED \| COLLABORATED \| MANUAL` | |
| `quantity` | Decimal(18,6) | número consensado |
| `reason` | string? | obrigatório quando `MANUAL` |
| `deltaToCalculated` / `deltaToCollaborated` | Decimal(18,6) | divergência registrada |

### PublishedForecast
Número oficial e imutável (FR-074 a FR-077).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario |
| `forecastItemId` | UUID | FK → ForecastItem, único |
| `quantity` | Decimal(18,6) | igual ao consensado (FR-075) |
| `publishedAt` | timestamptz | |

Sem rota de update ou delete. Imutabilidade também reforçada por trigger no banco.

---

## Apuração

### AccuracyRun
Execução de apuração, delegada ao motor (D3).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario |
| `status` | enum `PENDING \| PROCESSING \| COMPLETED \| FAILED` | |
| `dimensionLevelIds` | UUID[] | vazio = visão Cia; qualquer combinação (FR-082) |
| `includeProduct` | bool | dimensão por Produto |
| `metric` | enum `AccuracyMetric` | (FR-084) |
| `periodYear` / `periodMonth` | int | período apurado |
| `inputUri` / `outputUri` | string | MinIO |

Único em `(scenarioId, dimensionLevelIds, includeProduct, metric, periodYear, periodMonth)` —
é o que torna a troca de dimensão já apurada uma leitura, sustentando o SC-014.

### AccuracyResult
Resultado por chave da dimensão escolhida (FR-083, FR-085).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `runId` | UUID | FK → AccuracyRun |
| `dimensionKey` | string | valores da dimensão; `TOTAL` na visão Cia |
| `publishedQuantity` | Decimal(18,6) | previsão publicada somada |
| `actualQuantity` | Decimal(18,6) | venda real somada |
| `metricValue` | Decimal(12,6)? | nulo quando indefinida (FR-086) |
| `coverage` | enum `BOTH \| FORECAST_ONLY \| ACTUAL_ONLY` | (FR-085) |

---

## Auditoria e notificação

### AuditEvent
Trilha permanente (FR-099, FR-100, FR-017).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario |
| `entityType` / `entityId` | string / UUID | alvo da alteração |
| `action` | enum | `PHASE_ADVANCED`, `PARAMETERS_CHANGED`, `FORECAST_PERSISTED`, `ADJUSTMENT_MADE`, `CONSENSUS_DECIDED`, `PUBLISHED`, `TEAM_CLOSED`, `APPROVAL_GRANTED`, `APPROVAL_RETURNED` |
| `actorId` | UUID? | nulo apenas quando `origin = SYSTEM` |
| `origin` | enum `UI \| SPREADSHEET \| INGESTION \| ENGINE \| SYSTEM` | |
| `occurredAt` | timestamptz | |
| `correlationId` | string | liga a trilha aos logs (Princípio IX) |
| `payload` | jsonb | antes/depois quando aplicável |

Sem update nem delete pela aplicação; permissão revogada no papel de banco usado pelo runtime.

### EmailNotification
Estado próprio da notificação, independente da transição de fase (FR-096, D12).

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | UUID | PK |
| `scenarioId` | UUID | FK → Scenario |
| `recipientEmail` | string | |
| `template` | enum `FORECAST_READY \| PHASE_ADVANCED \| COLLABORATION_OPENED` | |
| `status` | enum `PENDING \| SENT \| FAILED` | |
| `attempts` | int | |
| `providerMessageId` | string? | id devolvido pelo Resend |
| `lastError` | string? | |

---

## Diagrama de relacionamento

```text
User ──< ScenarioMember >── Scenario ──< SegmentationLevel
                               │
                               ├──< IngestionJob ──< IngestionIssue
                               ├──< SalesRecord
                               ├──< ActualSalesRecord
                               ├──── ForecastParameters (1:1)
                               ├──< ForecastJob ──< ForecastSeriesResult
                               │         └──< ForecastItem ──< CollaborationAdjustment
                               │                   ├──── ConsensusDecision (1:1)
                               │                   └──── PublishedForecast (1:1)
                               ├──< AccuracyRun ──< AccuracyResult
                               ├──< AuditEvent
                               └──< EmailNotification
```
