# Quickstart — SOP_APP

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-31

Guia de subida e validação de ponta a ponta. Não contém implementação — as tarefas ficam em
`tasks.md`, geradas por `/speckit-tasks`.

## Pré-requisitos

- Docker Engine 25+ com Compose v2
- Node.js 22 LTS e pnpm 9 (apenas para rodar testes fora dos contêineres)
- Python 3.12 e `uv` ou `pip` (idem, para o motor)
- 6 GB de RAM livres — a stack sobe 9 contêineres

## Subida da stack

```bash
cp .env.example .env          # ajuste RESEND_API_KEY se for testar e-mail real
docker compose up             # única linha, como exige o plano
```

A ordem é garantida por healthcheck: Postgres, RabbitMQ e MinIO ficam saudáveis antes da API; o
entrypoint da API roda `prisma migrate deploy` antes de servir a primeira requisição.

| Serviço | URL |
|---------|-----|
| Frontend (Next.js) | http://localhost:3000 |
| API (Fastify) | http://localhost:3001/api/v1 |
| OpenAPI | http://localhost:3001/api/v1/docs |
| RabbitMQ (console) | http://localhost:15672 |
| MinIO (console) | http://localhost:9001 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3002 |

Verificação mínima de que subiu:

```bash
curl -fsS http://localhost:3001/api/health        # liveness + Postgres
curl -fsS http://localhost:3001/api/health/ready  # + RabbitMQ + MinIO
curl -fsS http://localhost:3001/metrics | head    # exposição Prometheus
```

## Cenário de validação ponta a ponta

Prova a User Story 1 e as travessias que a constituição exige. Cada passo tem um resultado
observável.

### 1. Conta e cenário

```bash
curl -X POST localhost:3001/api/v1/auth/sign-up \
  -H 'content-type: application/json' \
  -d '{"email":"planejador@empresa.com","password":"senha-forte-123","name":"Planejador"}'
```

Depois `sign-in`, guardando o cookie, e `POST /api/v1/scenarios`. **Esperado**: cenário criado
em fase `TEAM_SETUP`.

### 2. Equipe e fechamento

Convide um aprovador e feche a equipe. **Esperado**: `close-team` sem aprovador responde `409`
`APPROVER_REQUIRED` (FR-015); com aprovador, a fase vira `IMPORT_SETUP` e a equipe fica travada.

### 3. Upload assíncrono do histórico

```bash
curl -X POST localhost:3001/api/v1/scenarios/$SCENARIO/uploads \
  -F 'kind=SALES_HISTORY' -F 'declaredLabels=BU;Setor;CD' \
  -F 'file=@fixtures/historico.csv'
```

**Esperado**: resposta **202** imediata com `jobId`, sem parse no request. O
`ingestion-worker` processa e o status vai de `PENDING` a `COMPLETED` no polling de
`/api/v1/ingestion-jobs/$JOB`.

### 4. Relatório de linhas inválidas

Suba `fixtures/historico-com-erros.csv`, que tem linhas com 2 e com 4 segmentos contra
`BU;Setor;CD`.

**Esperado**: job `COMPLETED` com `invalidRows > 0`; `/issues` lista **todas** as linhas ruins
com número e motivo — não apenas a primeira (FR-024, D7); nenhum cálculo é possível enquanto
houver issue bloqueante.

### 5. Parametrização com combinação de níveis e pacote de modelos

Antes de parametrizar, veja o custo da sua escolha:

```bash
curl "localhost:3001/api/v1/scenarios/$SCENARIO/series-preview?levelIds=$BU&package=STANDARD"
curl "localhost:3001/api/v1/scenarios/$SCENARIO/series-preview?levelIds=$BU,$SETOR,$CD&package=COMPLETE"
```

**Esperado**: a segunda chamada devolve `seriesCount` muito maior e uma
`estimatedDurationSeconds` de outra ordem de grandeza — que é exatamente o ponto do FR-034a: o
usuário descobre isso **antes** de disparar, não depois de esperar.

```bash
curl -X PUT localhost:3001/api/v1/scenarios/$SCENARIO/parameters \
  -H 'content-type: application/json' \
  -d '{"groupingLevelIds":["<BU>","<Setor>"],"prorationMonths":12,"accuracyMetric":"WMAPE","modelPackage":"STANDARD","horizonMonths":12}'
```

**Esperado**: aceito (FR-032). Repetir o mesmo nível responde `409` (FR-032b); lista vazia
responde `400` (FR-032c); `prorationMonths` maior que o histórico responde `400` (FR-034);
omitir `modelPackage` responde `400` (FR-034b). Escolher `MAPE` num cenário com muitos meses
zerados devolve `zeroHeavyWarning: true` (FR-036a).

### 6. Cálculo

`POST /api/v1/scenarios/$SCENARIO/forecast-jobs` → **202**. Um segundo disparo responde `409`
(FR-051).

**Esperado ao concluir**:

- fase avança para `APPROVAL`;
- `/forecast-series` traz modelo vencedor, erro na métrica escolhida, candidatos avaliados,
  `backtestWindowsUsed` e `excludedModels` com o motivo de cada descarte;
- `/forecast-items` traz a previsão rateada na granularidade original;
- **nenhuma previsão negativa** em nenhum item (FR-040a), mesmo com devoluções no histórico;
- item cuja série começa no meio do histórico não sai com previsão próxima de zero por causa de
  meses anteriores à sua primeira venda (FR-040d, D15) — este é o teste que pega o `fillna(0)`
  ingênuo.

### 7. As três provas que a constituição exige

**Precisão** — some as previsões dos itens filhos de uma série e compare com a série:

```bash
# a soma deve bater EXATAMENTE, sem tolerância (FR-046)
```

Confira também que todo campo numérico da resposta é string (`"1234.500000"`), nunca número
JSON.

**Fronteira** — o motor não fala com o banco:

```bash
docker compose exec forecast-engine sh -c 'env | grep -i -E "postgres|database" || echo OK-sem-credencial-de-banco'
```

**Esperado**: `OK-sem-credencial-de-banco`. O motor não tem nem como acessar o Postgres.

**Correlação** — siga um cálculo ponta a ponta:

```bash
docker compose logs api ingestion-worker forecast-engine | grep "$CORRELATION_ID"
```

**Esperado**: registros dos três serviços sob o mesmo `correlationId` (Princípio IX).

### 8. Ciclo até a publicação

Aprovar → colaborar com motivo (a alteração sem `reason` deve ser recusada, FR-058) → concluir →
definir tolerância → ordenar por `delta_desc` → decidir → publicar.

**Esperado**: número publicado idêntico ao consensado (FR-075); qualquer tentativa de alterar o
publicado responde `409` (FR-076); `/audit-events` mostra autor, data/hora e origem de cada
passo (FR-099).

### 9. Apuração

Suba vendas reais e dispare uma `accuracy-run` na visão Cia. Repita por BU.

**Esperado**: números diferentes por dimensão; refazer a mesma combinação devolve o run já
existente, sem recalcular (SC-014); a apuração **agrega**, nunca rateia (FR-083).

## Testes

```bash
pnpm test                      # Vitest — unitário e integração (Testcontainers)
pnpm test:contract             # vetores dourados, lado TypeScript
cd services/forecast-engine && pytest              # unitário e integração
cd services/forecast-engine && pytest -m contract  # mesmos vetores, lado Python
```

Os testes de contrato leem `packages/contracts/src/golden/`. Uma divergência de interpretação
entre Node e Python quebra as duas suítes — que é justamente o ponto.

## Solução de problemas

| Sintoma | Causa provável |
|---------|----------------|
| API sobe e falha na primeira query | `binaryTargets` do Prisma sem `linux-musl-openssl-3.0.x` |
| Node morre por OOM sob carga | flag escrita como `1536MB`; o valor correto é `--max-old-space-size=1536` |
| Build do motor demorando demais | imagem base trocada para Alpine; o motor exige `python:3.12-slim` (D4) |
| Job reprocessado após restart | idempotência buscada em memória em vez da constraint de `jobId` (D6) |
| Fase avançou mas ninguém recebeu e-mail | comportamento correto (FR-096); confira `EmailNotification` e a DLQ |
