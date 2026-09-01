# Contract — Mensageria (RabbitMQ)

**Norma**: `packages/contracts/src/messaging` (Zod) e modelos Pydantic espelhados no motor.

Regra que atravessa tudo: **a mensagem carrega referência, nunca dataset**.

## Topologia

| Exchange | Tipo | Fila | Consumidor |
|----------|------|------|------------|
| `sop.ingestion` | direct | `sop.ingestion.request.v1` | `ingestion-worker` (Node) |
| `sop.forecast` | direct | `sop.forecast.request.v1` | `forecast-engine` (Python) |
| `sop.forecast` | direct | `sop.forecast.result.v1` | `api` (Node) |
| `sop.accuracy` | direct | `sop.accuracy.request.v1` | `forecast-engine` (Python) |
| `sop.accuracy` | direct | `sop.accuracy.result.v1` | `api` (Node) |
| `sop.email` | direct | `sop.email.request.v1` | `email-worker` (Node) |

Cada fila tem `x-dead-letter-exchange` apontando para `sop.dlx`, com fila
`<nome>.dlq`. Filas duráveis, mensagens persistentes, `prefetch = 1` no motor (job longo) e
`prefetch = 10` nos workers Node.

## Envelope comum

Obrigatório em toda mensagem, em todas as filas:

```json
{
  "messageId": "uuid-v7",
  "correlationId": "uuid-v7",
  "occurredAt": "2026-08-31T14:03:22.481Z",
  "version": 1,
  "type": "forecast.request",
  "payload": { }
}
```

`correlationId` nasce na borda HTTP e é propagado sem alteração por toda a cadeia, aparecendo em
cada log dos dois lados (Princípio IX).

## `forecast.request` → motor

```json
{
  "jobId": "uuid",
  "scenarioId": "uuid",
  "inputUri": "s3://sop/datasets/{scenarioId}/{jobId}/input.parquet",
  "outputPrefix": "s3://sop/datasets/{scenarioId}/{jobId}/",
  "modelCatalogVersion": "2026.08",
  "params": {
    "groupingLabels": ["BU", "Setor"],
    "granularLabels": ["BU", "Setor", "CD"],
    "prorationMonths": 12,
    "horizonMonths": 12,
    "accuracyMetric": "WMAPE",
    "modelPackage": "STANDARD",
    "decimalScale": 6,
    "nonNegativeForecast": true
  }
}
```

O motor recebe **rótulos**, não ids do banco: ele não conhece o schema (Princípio III).

`modelPackage` determina, no motor, tanto os modelos candidatos quanto o número de janelas de
backtest (D1, D14). `nonNegativeForecast` é sempre `true` nesta versão — o piso zero é regra de
negócio (FR-040a), e o campo existe para que a regra fique explícita no contrato em vez de
implícita no código do motor.

## `forecast.result` → API

```json
{
  "jobId": "uuid",
  "status": "completed",
  "outputUri": "s3://sop/datasets/{scenarioId}/{jobId}/output.parquet",
  "seriesUri": "s3://sop/datasets/{scenarioId}/{jobId}/series.parquet",
  "modelCatalogVersion": "2026.08",
  "stats": { "seriesCount": 1420, "itemCount": 88123, "durationMs": 412000 },
  "failure": null
}
```

Em falha: `status = "failed"` e `failure = { code, message }`. Nenhum valor numérico de negócio
viaja no envelope — todos estão no Parquet, como string decimal.

## `accuracy.request` / `accuracy.result`

Mesma forma. O request carrega `publishedUri`, `actualsUri`, `dimensionLabels`,
`includeProduct`, `metric` e `period`. O result carrega `outputUri` com uma linha por
`dimensionKey`, contendo `publishedQuantity`, `actualQuantity`, `metricValue` e `coverage`.

A apuração **agrega e nunca rateia** (FR-083); é responsabilidade do motor honrar isso.

## `ingestion.request`

```json
{
  "jobId": "uuid",
  "scenarioId": "uuid",
  "kind": "SALES_HISTORY",
  "objectUri": "s3://sop/uploads/{scenarioId}/{jobId}/original.csv",
  "declaredLabels": ["BU", "Setor", "CD"],
  "uploadedById": "uuid"
}
```

## `email.request`

```json
{
  "notificationId": "uuid",
  "scenarioId": "uuid",
  "template": "FORECAST_READY",
  "to": "aprovador@empresa.com",
  "variables": { "scenarioName": "Ciclo Set/26", "phase": "APPROVAL" }
}
```

## Idempotência (obrigatória — D6)

Consumidor de resultado:

1. Lê `jobId` do payload.
2. Persiste em transação com **unicidade em `jobId`**.
3. Violação de unicidade ⇒ entrega duplicada ⇒ `ack` sem reprocessar, log em nível `info`.
4. Transição de status condicional: `UPDATE ... WHERE status = 'PROCESSING'`. Zero linhas
   afetadas ⇒ já concluído ⇒ `ack`.

O motor, ao receber um `forecast.request` cujo `outputUri` já existe no MinIO com marcador de
conclusão, republica o resultado em vez de recalcular.

**Nunca** confie em cache em memória para deduplicar: ele se perde no restart, que é exatamente
quando a reentrega acontece.

## Retentativa e DLQ

- Até 3 tentativas com backoff exponencial (1s, 8s, 64s).
- Esgotadas, a mensagem vai para `<fila>.dlq` e o job é marcado `FAILED` com `failureReason`.
- Falha de e-mail **não** desfaz a transição de fase (FR-096): `EmailNotification` tem estado
  próprio.

## Testes de contrato exigidos

- Round-trip de cada payload por Zod e por Pydantic sobre os mesmos vetores dourados.
- Reentrega da mesma mensagem não duplica resultado (integração com RabbitMQ real via
  Testcontainers).
- Mensagem sem `correlationId` é rejeitada pelos dois lados.
- Mensagem com número JSON em campo de grandeza sensível é rejeitada.
