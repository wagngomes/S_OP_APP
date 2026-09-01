# Contract — HTTP API v1

**Base**: `/api/v1` | **OpenAPI**: `/api/v1/docs`, derivada dos schemas Zod
(`packages/contracts/src/http`)

## Convenções

- **Auth**: sessão por cookie `httpOnly` (BetterAuth). Rotas de cenário exigem participação.
- **Paginação**: offset-based em toda listagem — `?limit=100&offset=0`, `limit` padrão 100,
  máximo 500. Resposta: `{ "data": [...], "total": 1234, "limit": 100, "offset": 0 }`.
- **Correlação**: aceita `x-correlation-id`; gera um quando ausente e devolve no header.
- **Rate limit**: middleware global, com teto menor nas rotas de upload.
- **Erros**: `{ "error": { "code", "message", "details" } }` com `code` estável.
- **Grandeza sensível**: sempre string decimal, conforme [decimal-codec.md](./decimal-codec.md).

## Saúde

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/health` | Liveness + conexão com o Postgres (`SELECT 1`) |
| `GET` | `/api/health/ready` | Readiness: Postgres, RabbitMQ e MinIO |
| `GET` | `/metrics` | Exposição Prometheus |

`/api/health` é o alvo do healthcheck do Docker. A separação existe porque uma falha temporária
do RabbitMQ não deve derrubar o contêiner da API, apenas tirá-lo do balanceamento.

## Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/v1/auth/sign-up` | Cria conta com e-mail e senha (FR-001) |
| `POST` | `/api/v1/auth/sign-in` | Login (FR-002) |
| `POST` | `/api/v1/auth/sign-out` | Encerra sessão |
| `POST` | `/api/v1/auth/forgot-password` | Recuperação (FR-004) |
| `GET` | `/api/v1/auth/session` | Sessão corrente |

## Cenários e equipe

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/v1/scenarios` | Lista os cenários do usuário **com a fase atual** (FR-095) |
| `POST` | `/api/v1/scenarios` | Cria cenário; aceita `finalSayRole` (FR-006, FR-011) |
| `GET` | `/api/v1/scenarios/:id` | Detalhe, fase atual e ações disponíveis (FR-097) |
| `POST` | `/api/v1/scenarios/:id/members` | Convida com papel (FR-009, FR-018) |
| `DELETE` | `/api/v1/scenarios/:id/members/:memberId` | Remove antes do fechamento |
| `POST` | `/api/v1/scenarios/:id/close-team` | Fecha a equipe (FR-013); exige aprovador (FR-015) |

Ação fora da fase responde `409` com `code: "PHASE_NOT_ALLOWED"` e a razão do bloqueio
(FR-016).

## Ingestão de arquivos

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/v1/scenarios/:id/uploads` | Multipart em streaming para o MinIO. Valida só o envelope. Responde **202** com `jobId` |
| `GET` | `/api/v1/ingestion-jobs/:jobId` | Status e contadores (FR-027) |
| `GET` | `/api/v1/ingestion-jobs/:jobId/issues` | Relatório paginado de linhas inválidas (FR-024) |

Corpo do upload: `file`, `kind` (`SALES_HISTORY`, `COLLABORATION_SHEET`, `ACTUAL_SALES`) e
`declaredLabels` (ex.: `"BU;Setor;CD"`, FR-021).

O request **não** parseia conteúdo. Toda validação de linha acontece no worker.

## Parametrização

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/v1/scenarios/:id/levels` | Rótulos declarados, para o campo de arrastar (FR-031) |
| `PUT` | `/api/v1/scenarios/:id/parameters` | `groupingLevelIds[]` (combinação, FR-032), `prorationMonths`, `accuracyMetric`, `modelPackage`, `horizonMonths` |
| `GET` | `/api/v1/metrics-catalog` | Catálogo de métricas (FR-036) |
| `GET` | `/api/v1/model-packages` | Os três pacotes, com modelos, janelas de backtest e a contrapartida análise × tempo (FR-034c) |
| `GET` | `/api/v1/scenarios/:id/series-preview` | `?levelIds=a,b&package=STANDARD` → `{ seriesCount, estimatedDurationSeconds, magnitude }` (FR-034a, FR-034d) |

Validações: combinação não vazia (FR-032c), sem repetição (FR-032b), `prorationMonths` dentro do
histórico (FR-034), `modelPackage` obrigatório (FR-034b). A resposta sinaliza
`prorationRequired: false` quando a combinação já é a granularidade original (FR-032d), e
`zeroHeavyWarning: true` quando `MAPE` é escolhido num cenário com alta proporção de meses
zerados (FR-036a).

`series-preview` é a rota que o frontend chama a cada mudança no campo de arrastar. É uma
contagem (`COUNT(DISTINCT)`), não um cálculo estatístico — por isso fica na API e não no motor.

## Cálculo

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/v1/scenarios/:id/forecast-jobs` | Dispara o cálculo. **202** com `jobId`. `409` se já houver job ativo (FR-051) |
| `GET` | `/api/v1/forecast-jobs/:jobId` | Status para polling (D11) |
| `GET` | `/api/v1/scenarios/:id/forecast-items` | Previsão por item, paginada |
| `GET` | `/api/v1/scenarios/:id/forecast-series` | Modelo vencedor, erro e candidatos avaliados (FR-048, FR-043a) |

Enquanto o job não conclui, `forecast-items` responde `409` — resultado parcial nunca é
apresentado como completo (FR-052).

## Aprovação, colaboração, consenso e publicação

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/v1/scenarios/:id/approval` | `{ decision: "APPROVE" \| "RETURN", reason? }` (FR-055, FR-056) |
| `GET` | `/api/v1/scenarios/:id/collaboration` | Itens com calculado e colaborado, paginado |
| `POST` | `/api/v1/scenarios/:id/collaboration/adjustments` | `{ forecastItemId, quantity, reason }`. `reason` obrigatório (FR-058) |
| `POST` | `/api/v1/scenarios/:id/collaboration/done` | Registra o "ok" do colaborador (FR-063) |
| `POST` | `/api/v1/scenarios/:id/collaboration/close` | Encerramento pelo criador (FR-065) |
| `GET` | `/api/v1/scenarios/:id/collaboration/sheet` | URL assinada da planilha (FR-060) |
| `POST` | `/api/v1/scenarios/:id/consensus/tolerance` | Define a faixa aceitável (FR-067) |
| `GET` | `/api/v1/scenarios/:id/consensus` | `?sort=delta_desc` — maiores divergências (FR-069) |
| `POST` | `/api/v1/scenarios/:id/consensus/decisions` | Decisão item a item (FR-070, FR-071) |
| `POST` | `/api/v1/scenarios/:id/publish` | Publica (FR-074); `409` se houver item sem decisão (FR-073) |
| `GET` | `/api/v1/scenarios/:id/published-forecast` | Números oficiais, somente leitura (FR-076) |

Ajuste concorrente: o `POST` de adjustment aceita `expectedVersion`; divergência responde `409`
com `code: "ITEM_CHANGED"` e o estado atual, atendendo FR-066b.

## Apuração

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api/v1/scenarios/:id/accuracy-runs` | `{ dimensionLevelIds[], includeProduct, metric, period }`. **202**; devolve o run existente quando a combinação já foi apurada (SC-014) |
| `GET` | `/api/v1/accuracy-runs/:runId` | Status |
| `GET` | `/api/v1/accuracy-runs/:runId/results` | Resultado por `dimensionKey`, paginado |

## Dashboards

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/v1/scenarios/:id/dashboards/history` | Total por mês, itens únicos, contagem de CDs (FR-090) |
| `GET` | `/api/v1/scenarios/:id/dashboards/combined` | Histórico + previsão na mesma escala (FR-091) |

## Auditoria

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/v1/scenarios/:id/audit-events` | Trilha paginada e filtrável (FR-099) |

Somente leitura. Não existe rota de escrita, update ou delete sobre a trilha (FR-100).
