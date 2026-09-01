---

description: "Task list for 001-sop-cycle-forecasting"
---

# Tasks: SOP_APP — Ciclo de S&OP com Previsão Estatística

**Input**: Design documents from `/specs/001-sop-cycle-forecasting/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **OBRIGATÓRIOS**, não opcionais. A constituição do projeto exige teste unitário para
toda função de cálculo (Princípio V) e teste automatizado para toda funcionalidade, com pelo
menos um caminho de falha (Princípio VIII). Tarefas de teste precedem a implementação
correspondente e devem falhar antes dela.

**Organization**: agrupadas por história de usuário, para permitir implementação e validação
independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: US1..US7, conforme [spec.md](./spec.md)
- Todo caminho de arquivo é relativo à raiz do repositório

## Path Conventions

Monorepo pnpm com serviço Python irmão, conforme a seção *Project Structure* do
[plan.md](./plan.md):

- `packages/contracts/`, `packages/domain/` — compartilhados
- `apps/api/`, `apps/ingestion-worker/`, `apps/email-worker/`, `apps/web/`
- `services/forecast-engine/` — motor Python
- `infra/` — Prometheus, Grafana, Loki

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: estrutura do monorepo e ferramental

- [X] T001 Criar a estrutura de diretórios do monorepo e `pnpm-workspace.yaml` na raiz, conforme a seção Project Structure de specs/001-sop-cycle-forecasting/plan.md
- [X] T002 [P] Inicializar `packages/contracts` com package.json, tsconfig.json e vitest.config.ts
- [X] T003 [P] Inicializar `packages/domain` com package.json, tsconfig.json e vitest.config.ts
- [X] T004 [P] Inicializar `apps/api` com package.json, tsconfig.json e vitest.config.ts
- [X] T005 [P] Inicializar `apps/ingestion-worker` com package.json, tsconfig.json e vitest.config.ts
- [X] T006 [P] Inicializar `apps/email-worker` com package.json, tsconfig.json e vitest.config.ts
- [ ] T007 [P] Inicializar `apps/web` com Next.js 15 App Router e Tailwind CSS em apps/web/package.json
- [X] T008 [P] Configurar a paleta como tokens semânticos (turquesa, petroleo, branco, grafite, verde, cinza) em apps/web/tailwind.config.ts, conforme D19 de research.md
- [X] T009 [P] Inicializar `services/forecast-engine` com pyproject.toml, dependências StatsForecast/pandas/pika/boto3/pydantic e configuração do pytest
- [X] T010 [P] Configurar ESLint e Prettier na raiz em eslint.config.js e .prettierrc
- [X] T011 [P] Configurar Ruff em services/forecast-engine/pyproject.toml
- [X] T012 [P] Criar .env.example na raiz com todas as variáveis por serviço, sem segredos reais
- [X] T013 Configurar dependency-cruiser em .dependency-cruiser.js proibindo que `packages/domain` importe Fastify, Prisma, amqplib, pino ou prom-client (Princípios I e IX)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestrutura que TODAS as histórias exigem

**⚠️ CRÍTICO**: nenhuma história pode começar antes desta fase terminar

### Codec decimal e contratos — a fundação do Princípio V

- [X] T014 [P] Escrever os vetores dourados em packages/contracts/src/golden/decimal.json com os casos da tabela de contracts/decimal-codec.md
- [X] T015 [P] Escrever teste unitário do codec decimal (canonicalização, meio-para-cima, rejeição de científico e de excesso de casas) em packages/contracts/tests/decimal-string.test.ts — DEVE FALHAR antes de T017
- [X] T016 [P] Escrever teste pytest do codec espelhado lendo os mesmos vetores em services/forecast-engine/tests/contract/test_decimal_codec.py — DEVE FALHAR antes de T018
- [X] T017 Implementar `DecimalString` (Zod) e helpers de quantização em packages/contracts/src/decimal/decimal-string.ts
- [X] T018 Implementar o codec decimal espelhado em services/forecast-engine/src/forecast_engine/domain/decimal_codec.py
- [X] T019 Implementar teste de guarda que varre packages/contracts e falha se `z.number()` aparecer em campo de grandeza sensível, em packages/contracts/tests/no-float-guard.test.ts
- [X] T020 [P] Definir o envelope de mensagem (messageId, correlationId, occurredAt, version, type, payload) em packages/contracts/src/messaging/envelope.ts
- [X] T021 [P] Definir o envelope espelhado em Pydantic em services/forecast-engine/src/forecast_engine/messaging/envelope.py
- [X] T022 [P] Definir schemas HTTP comuns (paginação offset-based limit 100, formato de erro) em packages/contracts/src/http/common.ts
- [X] T023 Escrever teste de contrato bilateral do envelope (rejeita mensagem sem correlationId; rejeita número JSON em campo sensível) em packages/contracts/tests/envelope.contract.test.ts e services/forecast-engine/tests/contract/test_envelope.py

### Persistência

- [X] T024 Implementar o schema Prisma completo com as 20 entidades de data-model.md em apps/api/prisma/schema.prisma, usando `Decimal(18,6)` para quantidade e `Decimal(12,6)` para métrica
- [X] T025 Declarar `binaryTargets` incluindo `linux-musl-openssl-3.0.x` em apps/api/prisma/schema.prisma
- [X] T026 Gerar a migração inicial em apps/api/prisma/migrations/
- [X] T027 Criar índice parcial único garantindo no máximo um ForecastJob ativo por cenário, em apps/api/prisma/migrations/ (FR-051)
- [X] T028 Criar trigger de imutabilidade sobre PublishedForecast e AuditEvent em apps/api/prisma/migrations/ (FR-076, FR-100)
- [X] T029 [P] Criar apps/api/docker-entrypoint.sh executando `prisma migrate deploy` antes do boot

### Contêineres e orquestração

- [ ] T030 [P] Criar apps/api/Dockerfile multi-stage Alpine, com `--max-old-space-size=1536` (valor em MB, sem sufixo)
- [ ] T031 [P] Criar apps/ingestion-worker/Dockerfile multi-stage Alpine
- [ ] T032 [P] Criar apps/email-worker/Dockerfile multi-stage Alpine
- [ ] T033 [P] Criar apps/web/Dockerfile multi-stage Alpine com build standalone do Next.js
- [ ] T034 [P] Criar services/forecast-engine/Dockerfile multi-stage sobre `python:3.12-slim` com `NUMBA_CACHE_DIR` persistido (D4, D18)
- [ ] T035 Criar docker-compose.yml na raiz com Postgres, RabbitMQ, MinIO, Prometheus, Grafana, Loki e os cinco serviços da aplicação, com healthchecks e `depends_on: service_healthy`, e `mem_limit` coerente com a flag do Node
- [ ] T036 [P] Configurar o scrape dos quatro processos de longa duração em infra/prometheus/prometheus.yml
- [ ] T037 [P] Provisionar datasources e painéis iniciais em infra/grafana/provisioning/
- [ ] T038 [P] Configurar agregação de logs em infra/loki/

### Observabilidade e bordas

- [ ] T039 Implementar geração e propagação de `correlationId` e logger pino JSON em apps/api/src/observability/correlation.ts e logger.ts (Princípio IX)
- [ ] T040 [P] Expor `/metrics` com prom-client em apps/api/src/observability/metrics.ts
- [ ] T041 [P] Expor `/metrics` e structlog JSON em services/forecast-engine/src/forecast_engine/adapters/observability.py
- [ ] T042 [P] Expor `/metrics` e logs JSON em apps/ingestion-worker/src/observability/ e apps/email-worker/src/observability/
- [X] T043 Escrever teste que executa `packages/domain` sem banco, sem rede e sem servidor, provando o isolamento do domínio, em packages/domain/tests/isolation.test.ts

### Mensageria e armazenamento

- [ ] T044 Declarar exchanges, filas e DLX conforme a topologia de contracts/messaging.md em apps/api/src/adapters/rabbitmq/topology.ts
- [ ] T045 Escrever teste de integração da topologia com RabbitMQ real via Testcontainers em apps/api/tests/integration/rabbitmq-topology.test.ts
- [ ] T046 Implementar helper de consumidor idempotente (unicidade por jobId, transição de status condicional, ack em entrega duplicada) em apps/api/src/adapters/rabbitmq/idempotent-consumer.ts (D6)
- [ ] T047 Escrever teste de integração provando que a reentrega da mesma mensagem não duplica resultado, em apps/api/tests/integration/idempotency.test.ts
- [ ] T048 [P] Implementar adaptador MinIO em streaming, com escrita do marcador `_SUCCESS`, em apps/api/src/adapters/minio/object-store.ts (D18)
- [ ] T049 [P] Implementar adaptador MinIO do motor em services/forecast-engine/src/forecast_engine/adapters/object_store.py
- [ ] T050 [P] Implementar retentativa com backoff exponencial e roteamento para DLQ em apps/api/src/adapters/rabbitmq/retry.ts

### Aplicação base

- [ ] T051 Implementar o bootstrap do Fastify com plugin de versão `/api/v1` e OpenAPI derivada dos schemas Zod em apps/api/src/app.ts (D9)
- [ ] T052 Implementar middlewares de rate limiting, paginação e tratamento de erro em apps/api/src/middleware/
- [ ] T053 Implementar `/api/health` (liveness + Postgres) e `/api/health/ready` (+ RabbitMQ + MinIO) em apps/api/src/routes/health.ts
- [ ] T054 Configurar BetterAuth com adaptador Prisma e provedor e-mail/senha em apps/api/src/adapters/auth/better-auth.ts (D8)
- [ ] T055 Implementar o escritor de AuditEvent que grava na MESMA transação da alteração, em apps/api/src/services/audit/audit-writer.ts (FR-099, FR-100)
- [ ] T056 Escrever teste provando que uma alteração sem AuditEvent na mesma transação é rejeitada, em apps/api/tests/integration/audit-transaction.test.ts
- [ ] T057 Implementar o container de composição e as portas (`ForecastJobPublisher`, `DatasetStore`, `ScenarioRepository`, `Mailer`) em apps/api/src/composition/ (Princípio IV)
- [ ] T058 Implementar o esqueleto em camadas do motor (`messaging → application → domain`) em services/forecast-engine/src/forecast_engine/, sem lógica de cálculo ainda
- [ ] T059 Implementar warm-up do numba no boot do motor em services/forecast-engine/src/forecast_engine/application/warmup.py (D18)
- [ ] T060 Implementar limitação de `n_jobs` pelo limite de CPU do contêiner em services/forecast-engine/src/forecast_engine/application/parallelism.py (D18)

**Checkpoint**: fundação pronta — as histórias podem começar

---

## Phase 3: User Story 1 - Da conta à previsão estatística (Priority: P1) 🎯 MVP

**Goal**: um usuário sozinho cria conta, cria cenário, importa o CSV, parametriza e obtém a
previsão rateada com o modelo vencedor e o erro de cada item.

**Independent Test**: percorrer conta → cenário → importação → parametrização → cálculo e obter
previsão consistente, sem nenhuma das outras histórias.

### Tests for User Story 1

- [ ] T061 [P] [US1] Teste de contrato das rotas de autenticação em apps/api/tests/contract/auth.contract.test.ts
- [X] T062 [P] [US1] Teste unitário da validação de contagem de segmentos contra os rótulos declarados em packages/domain/tests/ingestion/segment-validation.test.ts (FR-023, FR-024)
- [X] T063 [P] [US1] Teste unitário do preenchimento de lacunas internas e do corte do prefixo anterior à primeira venda em services/forecast-engine/tests/unit/test_gap_filling.py (FR-040d, D15)
- [X] T064 [P] [US1] Teste unitário da agregação do histórico por combinação de níveis em services/forecast-engine/tests/unit/test_aggregation.py
- [X] T065 [P] [US1] Teste unitário do piso zero aplicado à série agregada antes do rateio em services/forecast-engine/tests/unit/test_zero_floor.py (FR-040a, FR-040b, D16)
- [X] T066 [P] [US1] Teste de propriedade provando `soma(filhos) == pai` em rateios aleatórios em services/forecast-engine/tests/unit/test_proration_conservation.py (FR-046)
- [X] T067 [P] [US1] Teste unitário de cada métrica do catálogo, incluindo denominador zero, em services/forecast-engine/tests/unit/test_metrics.py (FR-036, FR-086)
- [X] T068 [P] [US1] Teste unitário da seleção do modelo vencedor por métrica e da exclusão de candidatos por histórico insuficiente em services/forecast-engine/tests/unit/test_model_selection.py (FR-042, FR-043b, D14)
- [ ] T069 [P] [US1] Teste de contrato de `forecast.request` e `forecast.result` nos dois lados em packages/contracts/tests/forecast.contract.test.ts e services/forecast-engine/tests/contract/test_forecast_messages.py
- [ ] T070 [P] [US1] Teste de integração do upload respondendo 202 sem parsear conteúdo em apps/api/tests/integration/upload-202.test.ts (D7)
- [ ] T071 [P] [US1] Teste de integração do worker de ingestão acumulando o relatório de linhas inválidas em vez de abortar na primeira, em apps/ingestion-worker/tests/integration/issue-report.test.ts (FR-024)
- [ ] T072 [P] [US1] Teste de integração do fluxo completo conta → cenário → upload → parametrização → cálculo → resultado em apps/api/tests/integration/us1-end-to-end.test.ts
- [ ] T073 [P] [US1] Teste de caminho de falha: cálculo disparado sem métrica, com nível repetido, com combinação vazia e com job já ativo, em apps/api/tests/integration/us1-failures.test.ts (FR-032b, FR-032c, FR-035, FR-051)

### Domínio compartilhado (TypeScript)

- [X] T074 [P] [US1] Implementar a máquina de fases do cenário com as transições permitidas em packages/domain/src/scenario/phase-machine.ts (FR-008, FR-016)
- [X] T075 [P] [US1] Implementar a validação de layout e contagem de segmentos em packages/domain/src/ingestion/segment-validation.ts (FR-023)
- [X] T076 [P] [US1] Implementar a consolidação de linhas duplicadas por soma em packages/domain/src/ingestion/deduplicate.ts (FR-028)
- [X] T077 [P] [US1] Implementar a validação da parametrização (combinação não vazia, sem repetição, meses dentro do histórico, pacote obrigatório) em packages/domain/src/scenario/parameters.ts (FR-032b, FR-032c, FR-034, FR-034b)

### Motor de cálculo (Python)

- [ ] T078 [P] [US1] Implementar a leitura do dataset Parquet com colunas numéricas em string decimal em services/forecast-engine/src/forecast_engine/application/dataset_reader.py (D5)
- [X] T079 [US1] Implementar a agregação do histórico até a combinação de níveis em services/forecast-engine/src/forecast_engine/domain/aggregation.py (FR-039)
- [X] T080 [US1] Implementar o preenchimento de lacunas internas e o corte do prefixo pré-primeira-venda em services/forecast-engine/src/forecast_engine/domain/series_preparation.py (FR-040d, D15)
- [X] T081 [P] [US1] Implementar o catálogo de modelos nos três pacotes Rápido/Standard/Completo em services/forecast-engine/src/forecast_engine/domain/model_catalog.py (D1, FR-043d)
- [X] T082 [P] [US1] Implementar a configuração de backtest por pacote e os mínimos de histórico por modelo em services/forecast-engine/src/forecast_engine/domain/backtest_config.py (D14, FR-043e)
- [X] T083 [P] [US1] Implementar o catálogo de métricas WMAPE, MAPE e viés, com comportamento explícito para denominador zero, em services/forecast-engine/src/forecast_engine/domain/metrics.py (FR-036, FR-086)
- [X] T084 [US1] Implementar o backtest por `cross_validation` e a seleção do vencedor pela métrica escolhida em services/forecast-engine/src/forecast_engine/domain/model_selection.py (FR-041, FR-042)
- [X] T085 [US1] Implementar a restrição do espaço de modelos por sinal dos dados e o registro em `excludedModels` em services/forecast-engine/src/forecast_engine/domain/model_selection.py (D16)
- [X] T086 [US1] Implementar o piso zero sobre a previsão da série agregada em services/forecast-engine/src/forecast_engine/domain/zero_floor.py (FR-040a, FR-040b)
- [X] T087 [US1] Implementar o rateio por representatividade com fechamento por maior resto em services/forecast-engine/src/forecast_engine/domain/proration.py (FR-045, FR-046)
- [X] T088 [US1] Implementar o comportamento para representatividade zero no período de rateio em services/forecast-engine/src/forecast_engine/domain/proration.py (FR-047)
- [ ] T089 [US1] Implementar a orquestração do job (ler, preparar, calcular, ratear, quantizar, gravar) em services/forecast-engine/src/forecast_engine/application/forecast_job.py
- [ ] T090 [US1] Implementar a escrita de output.parquet, series.parquet e do marcador `_SUCCESS` em services/forecast-engine/src/forecast_engine/application/result_writer.py (D18)
- [ ] T091 [US1] Implementar o consumidor de `sop.forecast.request.v1` e o publicador de `sop.forecast.result.v1` em services/forecast-engine/src/forecast_engine/messaging/forecast_consumer.py
- [ ] T092 [US1] Implementar o processamento em lotes para respeitar o limite de memória em services/forecast-engine/src/forecast_engine/application/batching.py
- [ ] T093 [US1] Implementar a republicação do resultado quando o `_SUCCESS` já existe, em vez de recalcular, em services/forecast-engine/src/forecast_engine/messaging/forecast_consumer.py (D6)

### API de orquestração

- [ ] T094 [P] [US1] Implementar as rotas de cadastro, login, logout, recuperação e sessão em apps/api/src/routes/v1/auth.routes.ts (FR-001 a FR-004)
- [ ] T095 [P] [US1] Implementar controller e service de criação e leitura de cenário em apps/api/src/controllers/scenario.controller.ts e apps/api/src/services/scenario.service.ts (FR-006, FR-007)
- [ ] T096 [US1] Implementar a rota de upload multipart em streaming direto para o MinIO, validando apenas o envelope e respondendo 202, em apps/api/src/routes/v1/upload.routes.ts (D7)
- [ ] T097 [US1] Implementar a criação do IngestionJob e a publicação em `sop.ingestion.request.v1` em apps/api/src/services/ingestion.service.ts
- [ ] T098 [US1] Implementar as rotas de status e de relatório paginado de issues em apps/api/src/routes/v1/ingestion.routes.ts (FR-024, FR-027)
- [ ] T099 [P] [US1] Implementar a rota de níveis declarados em apps/api/src/routes/v1/levels.routes.ts (FR-031)
- [ ] T100 [US1] Implementar a rota de parametrização com todas as validações e o aviso `zeroHeavyWarning` em apps/api/src/routes/v1/parameters.routes.ts (FR-032 a FR-036a)
- [ ] T101 [US1] Implementar a rota `series-preview` com `COUNT(DISTINCT)` e estimativa de tempo em apps/api/src/routes/v1/series-preview.routes.ts (FR-034a, FR-034d, D1a)
- [ ] T102 [P] [US1] Implementar a rota de catálogo de pacotes de modelos em apps/api/src/routes/v1/model-packages.routes.ts (FR-034c)
- [ ] T103 [US1] Implementar o disparo do cálculo com exportação do dataset para o MinIO e publicação da referência, recusando com 409 quando já houver job ativo, em apps/api/src/services/forecast.service.ts (FR-051)
- [ ] T104 [US1] Implementar o consumidor de `sop.forecast.result.v1` que persiste ForecastItem e ForecastSeriesResult e avança a fase, em apps/api/src/adapters/rabbitmq/forecast-result.consumer.ts
- [ ] T105 [US1] Implementar as rotas de leitura de forecast-items e forecast-series, recusando com 409 enquanto o job não concluir, em apps/api/src/routes/v1/forecast.routes.ts (FR-048, FR-052)

### Worker de ingestão

- [ ] T106 [US1] Implementar o consumidor de `sop.ingestion.request.v1` em apps/ingestion-worker/src/messaging/ingestion.consumer.ts
- [ ] T107 [US1] Implementar a leitura em streaming do MinIO e o parse incremental do CSV em apps/ingestion-worker/src/application/csv-stream-parser.ts
- [ ] T108 [US1] Implementar a validação linha a linha com acumulação do relatório e teto de issues em apps/ingestion-worker/src/application/validation-report.ts (FR-024, D7)
- [ ] T109 [US1] Implementar a persistência de SalesRecord e IngestionIssue via Prisma, com transição idempotente de status, em apps/ingestion-worker/src/application/persist-history.ts

### Frontend

- [ ] T110 [P] [US1] Implementar as telas de cadastro e login em apps/web/src/app/(auth)/
- [ ] T111 [P] [US1] Implementar a tela de criação e listagem de cenários em apps/web/src/app/scenarios/
- [ ] T112 [US1] Implementar a tela de upload com acompanhamento por polling e exibição do relatório de linhas inválidas em apps/web/src/app/scenarios/[id]/upload/
- [ ] T113 [US1] Implementar o campo de arrastar níveis, o seletor de pacote e a exibição de `seriesCount` e tempo estimado em apps/web/src/app/scenarios/[id]/parameters/ (FR-032, FR-034a)
- [ ] T114 [US1] Implementar a tela de resultado com previsão por item, modelo vencedor e erro, formatando strings decimais sem recalcular nada em apps/web/src/app/scenarios/[id]/forecast/ (Princípio II)

**Checkpoint**: US1 funcional e testável isoladamente — este é o MVP

---

## Phase 4: User Story 2 - Equipe, papéis e aprovação (Priority: P2)

**Goal**: montar equipe com papéis, fechar a equipe e submeter a previsão à aprovação, que
libera a colaboração.

**Independent Test**: com previsão calculada, convidar dois usuários, atribuir papéis, fechar a
equipe, verificar o aviso ao aprovador e que a colaboração só abre após a aprovação.

### Tests for User Story 2

- [ ] T115 [P] [US2] Teste unitário da matriz papel × fase × ação em packages/domain/tests/scenario/authorization.test.ts (D8)
- [ ] T116 [P] [US2] Teste de integração do fechamento de equipe sem aprovador respondendo 409 em apps/api/tests/integration/close-team-failures.test.ts (FR-015)
- [ ] T117 [P] [US2] Teste de integração provando que colaborador não altera número antes da aprovação em apps/api/tests/integration/approval-gate.test.ts
- [ ] T118 [P] [US2] Teste de contrato das rotas de membros e aprovação em apps/api/tests/contract/team-approval.contract.test.ts

### Implementation for User Story 2

- [ ] T119 [P] [US2] Implementar as regras de papel e a autorização por fase como funções puras em packages/domain/src/scenario/authorization.ts (D8)
- [ ] T120 [P] [US2] Implementar a regra de palavra final com default no criador em packages/domain/src/scenario/final-say.ts (FR-011, FR-012)
- [ ] T121 [US2] Implementar convite de membros com vínculo por e-mail ainda sem conta em apps/api/src/services/membership.service.ts (FR-009, FR-018)
- [ ] T122 [US2] Implementar as rotas de membros em apps/api/src/routes/v1/members.routes.ts
- [ ] T123 [US2] Implementar o fechamento de equipe exigindo aprovador e travando a composição em apps/api/src/services/team.service.ts (FR-013, FR-014, FR-015)
- [ ] T124 [US2] Implementar a rota de aprovação com decisão APPROVE e RETURN com motivo em apps/api/src/routes/v1/approval.routes.ts (FR-055, FR-056)
- [ ] T125 [US2] Implementar a publicação do e-mail de previsão pronta ao aprovador ao concluir o cálculo em apps/api/src/services/forecast.service.ts (FR-053)
- [ ] T126 [P] [US2] Implementar a tela de montagem de equipe e atribuição de papéis em apps/web/src/app/scenarios/[id]/team/
- [ ] T127 [P] [US2] Implementar a tela de revisão e aprovação da previsão em apps/web/src/app/scenarios/[id]/approval/

**Checkpoint**: US1 e US2 funcionam independentemente

---

## Phase 5: User Story 3 - Colaboração com justificativa (Priority: P2)

**Goal**: colaboradores ajustam números com motivo obrigatório, pela tela ou por planilha, e
concluem sua participação.

**Independent Test**: com previsão aprovada, um colaborador ajusta pela tela e outro pela
planilha; ambos concluem e a fase encerra com as duas contribuições registradas.

### Tests for User Story 3

- [ ] T128 [P] [US3] Teste unitário da recusa de ajuste sem motivo em packages/domain/tests/collaboration/adjustment.test.ts (FR-058)
- [ ] T129 [P] [US3] Teste unitário do encadeamento de versões na edição concorrente em packages/domain/tests/collaboration/concurrency.test.ts (FR-066a)
- [ ] T130 [P] [US3] Teste de integração da planilha devolvida com estrutura alterada sendo recusada integralmente, sem aplicação parcial, em apps/api/tests/integration/sheet-rejection.test.ts (FR-062)
- [ ] T131 [P] [US3] Teste de integração da planilha antiga sinalizando itens já alterados por terceiros em apps/api/tests/integration/sheet-stale.test.ts (FR-066c)
- [ ] T132 [P] [US3] Teste de integração do encerramento automático quando todos concluem em apps/api/tests/integration/collaboration-close.test.ts (FR-064)

### Implementation for User Story 3

- [ ] T133 [P] [US3] Implementar as regras de ajuste com motivo obrigatório e preservação do calculado em packages/domain/src/collaboration/adjustment.ts (FR-057, FR-058, FR-059)
- [ ] T134 [P] [US3] Implementar a resolução determinística de edição concorrente via `supersededById` em packages/domain/src/collaboration/concurrency.ts (FR-066a)
- [ ] T135 [US3] Implementar o service de colaboração gravando ajuste e AuditEvent na mesma transação em apps/api/src/services/collaboration.service.ts (FR-099)
- [ ] T136 [US3] Implementar as rotas de colaboração, incluindo `expectedVersion` e resposta 409 `ITEM_CHANGED`, em apps/api/src/routes/v1/collaboration.routes.ts (FR-066b)
- [ ] T137 [US3] Implementar a geração da planilha do cenário e a URL assinada do MinIO em apps/api/src/services/collaboration-sheet.service.ts (FR-060)
- [ ] T138 [US3] Implementar a ingestão da planilha devolvida como job assíncrono, reusando o worker de ingestão, em apps/ingestion-worker/src/application/persist-collaboration-sheet.ts (FR-061, FR-062)
- [ ] T139 [US3] Implementar o registro do "ok" sem alteração e o encerramento automático da fase em apps/api/src/services/collaboration.service.ts (FR-063, FR-064)
- [ ] T140 [US3] Implementar o encerramento pelo criador com registro de quem não concluiu em apps/api/src/services/collaboration.service.ts (FR-065)
- [ ] T141 [P] [US3] Implementar a tela de colaboração com calculado e colaborado lado a lado e motivo obrigatório em apps/web/src/app/scenarios/[id]/collaboration/
- [ ] T142 [P] [US3] Implementar o download e o upload da planilha na tela de colaboração em apps/web/src/app/scenarios/[id]/collaboration/

**Checkpoint**: US1, US2 e US3 funcionam independentemente

---

## Phase 6: User Story 4 - Consenso e publicação (Priority: P3)

**Goal**: o responsável define a faixa aceitável, revisa pelas maiores divergências, decide item
a item e publica o número oficial.

**Independent Test**: com colaboração encerrada, definir a faixa, ordenar por divergência,
decidir alguns itens pelo calculado e outros pelo colaborado, publicar e conferir que o
publicado é o consensado.

### Tests for User Story 4

- [ ] T143 [P] [US4] Teste unitário do cálculo de divergência e da classificação dentro/fora da faixa em packages/domain/tests/consensus/divergence.test.ts (FR-067, FR-068)
- [ ] T144 [P] [US4] Teste de integração recusando decisão de quem não é o responsável em apps/api/tests/integration/consensus-authorization.test.ts (FR-071)
- [ ] T145 [P] [US4] Teste de integração recusando publicação com item sem decisão em apps/api/tests/integration/publish-gate.test.ts (FR-073)
- [ ] T146 [P] [US4] Teste de integração provando a imutabilidade do publicado em apps/api/tests/integration/published-immutability.test.ts (FR-076)

### Implementation for User Story 4

- [ ] T147 [P] [US4] Implementar divergência, faixa absoluta e percentual em packages/domain/src/consensus/divergence.ts (FR-067, FR-068)
- [ ] T148 [P] [US4] Implementar a regra de quem decide em packages/domain/src/consensus/decision-rules.ts (FR-071)
- [ ] T149 [US4] Implementar o service de consenso com registro de autor, origem e deltas em apps/api/src/services/consensus.service.ts (FR-070, FR-072)
- [ ] T150 [US4] Implementar as rotas de tolerância, listagem ordenável por `delta_desc` e decisão em apps/api/src/routes/v1/consensus.routes.ts (FR-069)
- [ ] T151 [US4] Implementar a publicação copiando o consensado para PublishedForecast e avançando a fase em apps/api/src/services/publication.service.ts (FR-074, FR-075)
- [ ] T152 [US4] Implementar a rota de leitura da previsão publicada, somente leitura, em apps/api/src/routes/v1/published.routes.ts (FR-076, FR-077)
- [ ] T153 [P] [US4] Implementar a tela de consenso com ordenação por divergência e decisão item a item em apps/web/src/app/scenarios/[id]/consensus/
- [ ] T154 [P] [US4] Implementar a tela de publicação e visualização do número oficial em apps/web/src/app/scenarios/[id]/published/

**Checkpoint**: ciclo completo até a publicação funcionando

---

## Phase 7: User Story 5 - Acompanhamento de fase e notificações (Priority: P3)

**Goal**: todo participante vê a fase de cada cenário e recebe e-mail a cada avanço.

**Independent Test**: percorrer as fases e verificar que a fase exibida muda para todos e que o
e-mail correspondente sai aos envolvidos.

### Tests for User Story 5

- [ ] T155 [P] [US5] Teste de integração provando que a falha de envio de e-mail NÃO desfaz o avanço de fase em apps/api/tests/integration/email-failure-isolation.test.ts (FR-096)
- [ ] T156 [P] [US5] Teste de integração da retentativa e do roteamento para DLQ em apps/email-worker/tests/integration/retry-dlq.test.ts
- [ ] T157 [P] [US5] Teste de contrato de `email.request` em packages/contracts/tests/email.contract.test.ts

### Implementation for User Story 5

- [ ] T158 [US5] Implementar a publicação de EmailNotification em transação separada da transição de fase em apps/api/src/services/notification.service.ts (FR-093, FR-096)
- [ ] T159 [US5] Implementar o consumidor de `sop.email.request.v1` em apps/email-worker/src/messaging/email.consumer.ts
- [ ] T160 [US5] Implementar o adaptador Resend com API key por variável de ambiente em apps/email-worker/src/adapters/resend.ts (D12)
- [ ] T161 [P] [US5] Implementar os templates FORECAST_READY, PHASE_ADVANCED e COLLABORATION_OPENED em apps/email-worker/src/application/templates/ (FR-094)
- [ ] T162 [US5] Implementar a atualização de status, tentativas e último erro da notificação em apps/email-worker/src/application/notification-status.ts
- [ ] T163 [P] [US5] Implementar a exibição da fase atual na listagem de cenários em apps/web/src/app/scenarios/ (FR-095)
- [ ] T164 [P] [US5] Implementar a indicação do que se espera do usuário na fase atual e o bloqueio visual das ações indisponíveis em apps/web/src/components/phase/ (FR-016, FR-097)

**Checkpoint**: o ciclo é acompanhável e notificado ponta a ponta

---

## Phase 8: User Story 6 - Apuração de acuracidade realizada (Priority: P4)

**Goal**: comparar previsão publicada com vendas reais na dimensão escolhida, sempre agregando.

**Independent Test**: com previsão publicada, subir vendas reais e conferir que a acuracidade
muda por dimensão e é reproduzível.

### Tests for User Story 6

- [ ] T165 [P] [US6] Teste unitário provando que a apuração AGREGA e nunca rateia em services/forecast-engine/tests/unit/test_accuracy_aggregation.py (FR-083)
- [ ] T166 [P] [US6] Teste unitário da cobertura BOTH, FORECAST_ONLY e ACTUAL_ONLY em services/forecast-engine/tests/unit/test_accuracy_coverage.py (FR-085)
- [ ] T167 [P] [US6] Teste de contrato de `accuracy.request` e `accuracy.result` nos dois lados em packages/contracts/tests/accuracy.contract.test.ts e services/forecast-engine/tests/contract/test_accuracy_messages.py
- [ ] T168 [P] [US6] Teste de integração da reprodutibilidade: mesma base, dimensão e métrica devolvem o mesmo número em apps/api/tests/integration/accuracy-reproducibility.test.ts (FR-087, SC-010)
- [ ] T169 [P] [US6] Teste de integração provando que a combinação já apurada é lida, não recalculada em apps/api/tests/integration/accuracy-cache.test.ts (SC-014)

### Implementation for User Story 6

- [ ] T170 [US6] Implementar a ingestão de vendas reais reusando o worker, com substituição do mês reenviado, em apps/ingestion-worker/src/application/persist-actuals.ts (FR-079, FR-088)
- [ ] T171 [US6] Implementar a agregação por dimensão e a aplicação da métrica em services/forecast-engine/src/forecast_engine/domain/accuracy.py (FR-080, FR-083, FR-084)
- [ ] T172 [US6] Implementar o tratamento de itens sem previsão e sem realizado em services/forecast-engine/src/forecast_engine/domain/accuracy.py (FR-085)
- [ ] T173 [US6] Implementar o job de apuração e o consumidor de `sop.accuracy.request.v1` em services/forecast-engine/src/forecast_engine/messaging/accuracy_consumer.py (D3)
- [ ] T174 [US6] Implementar a exportação de previsão publicada e vendas reais para o MinIO e a publicação da referência em apps/api/src/services/accuracy.service.ts
- [ ] T175 [US6] Implementar o consumidor de `sop.accuracy.result.v1` persistindo AccuracyRun e AccuracyResult em apps/api/src/adapters/rabbitmq/accuracy-result.consumer.ts
- [ ] T176 [US6] Implementar as rotas de apuração, devolvendo o run existente quando a combinação já foi apurada, em apps/api/src/routes/v1/accuracy.routes.ts (SC-014)
- [ ] T177 [P] [US6] Implementar a tela de apuração com seleção de dimensão e métrica em apps/web/src/app/scenarios/[id]/accuracy/
- [ ] T178 [P] [US6] Apresentar acurácia do modelo e acuracidade realizada como grandezas distintas e rotuladas em apps/web/src/app/scenarios/[id]/accuracy/ (FR-049, FR-081)

**Checkpoint**: ciclo completo, da importação à apuração

---

## Phase 9: User Story 7 - Dashboards do cenário (Priority: P5)

**Goal**: ver a estatística do histórico antes de calcular e a visão unindo passado e futuro
depois.

**Independent Test**: conferir os totais do dashboard contra o arquivo de origem e, após o
cálculo, ver histórico e previsão na mesma escala temporal.

### Tests for User Story 7

- [ ] T179 [P] [US7] Teste de reconciliação provando que as somas do dashboard batem com o total do dataset importado em apps/api/tests/integration/dashboard-reconciliation.test.ts
- [ ] T180 [P] [US7] Teste de contrato das rotas de dashboard em apps/api/tests/contract/dashboards.contract.test.ts

### Implementation for User Story 7

- [ ] T181 [US7] Implementar as consultas agregadas de histórico (total por mês, itens únicos, contagem de CDs) em apps/api/src/services/dashboard.service.ts (FR-090)
- [ ] T182 [US7] Implementar a consulta que une histórico e previsão na mesma escala temporal em apps/api/src/services/dashboard.service.ts (FR-091)
- [ ] T183 [US7] Implementar as rotas de dashboard em apps/api/src/routes/v1/dashboards.routes.ts
- [ ] T184 [P] [US7] Implementar a visão do histórico importado em apps/web/src/app/scenarios/[id]/dashboards/history/
- [ ] T185 [P] [US7] Implementar a visão combinada de passado e futuro, distinguindo visualmente os dois, em apps/web/src/app/scenarios/[id]/dashboards/combined/

**Checkpoint**: todas as histórias entregues

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: fechamento, endurecimento e validação final

- [ ] T186 [P] Implementar a rota de leitura paginada da trilha de auditoria em apps/api/src/routes/v1/audit.routes.ts (FR-099)
- [ ] T187 [P] Implementar a tela de consulta da trilha de auditoria em apps/web/src/app/scenarios/[id]/audit/
- [ ] T188 Implementar a estratégia de introdução de `/api/v2` sem quebrar a v1, documentada em specs/001-sop-cycle-forecasting/contracts/README.md e refletida em apps/api/src/routes/
- [ ] T189 [P] Publicar os painéis de Grafana com duração de job, profundidade de fila, linhas por segundo e latência HTTP em infra/grafana/provisioning/dashboards/
- [ ] T190 [P] Calibrar por medição a constante de custo por ajuste usada na estimativa de tempo em apps/api/src/services/forecast-estimate.ts (D1a)
- [ ] T191 Executar teste de carga com 2.000 séries no pacote Standard e confirmar o SC-004 em apps/api/tests/performance/
- [ ] T192 [P] Auditar cada service de apps/api/src/services/ e acrescentar o teste de caminho de falha faltante em apps/api/tests/integration/, garantindo ao menos um por caso de uso (Princípio VIII)
- [ ] T193 [P] Endurecer segurança: cookies httpOnly/SameSite/Secure, teto de upload, limites de rate por rota em apps/api/src/middleware/
- [ ] T194 Verificar que o motor não possui credencial de banco, conforme o passo 7 de quickstart.md (Princípio III)
- [ ] T195 Verificar o `correlationId` atravessando API, worker de ingestão e motor nos logs, conforme quickstart.md (Princípio IX)
- [ ] T196 [P] Escrever README.md em apps/api/, apps/ingestion-worker/, apps/email-worker/, apps/web/, services/forecast-engine/, packages/contracts/ e packages/domain/ com propósito, variáveis de ambiente e como rodar os testes
- [ ] T197 Executar o roteiro completo de quickstart.md contra a stack subida com `docker compose up`
- [ ] T198 Revisar todos os requisitos FR-001 a FR-104 contra o implementado e registrar as lacunas em specs/001-sop-cycle-forecasting/checklists/

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sem dependências
- **Foundational (Fase 2)**: depende da Fase 1 — **BLOQUEIA todas as histórias**
- **US1 (Fase 3)**: depende da Fase 2. É o MVP
- **US2 (Fase 4)**: depende da Fase 2; usa a previsão de US1 para exercitar a aprovação
- **US3 (Fase 5)**: depende de US2, porque a colaboração só abre após a aprovação
- **US4 (Fase 6)**: depende de US3, porque o consenso opera sobre o par calculado × colaborado
- **US5 (Fase 7)**: depende da Fase 2; pode ser desenvolvida em paralelo a US2/US3/US4
- **US6 (Fase 8)**: depende de US4, porque apura sobre a previsão publicada
- **US7 (Fase 9)**: depende de US1 para o histórico e da conclusão do cálculo para a visão combinada
- **Polish (Fase 10)**: depende das histórias desejadas

### Ordem crítica dentro da Fase 2

O codec decimal (T014–T019) é pré-requisito de tudo que trafega número. Implementá-lo depois
significa reescrever contrato, schema e motor.

### Within Each User Story

- Testes primeiro, e devem falhar antes da implementação
- Domínio antes de service; service antes de rota
- Motor: preparo da série antes da modelagem; modelagem antes do rateio; rateio antes da
  quantização
- Backend completo antes da tela correspondente

### Parallel Opportunities

- Fase 1: T002–T012 em paralelo após T001
- Fase 2: os cinco Dockerfiles (T030–T034), os adaptadores de observabilidade (T040–T042) e os
  adaptadores MinIO (T048, T049) em paralelo
- Fase 3: todos os testes T061–T073 em paralelo; o motor (T078–T093) e a API (T094–T105) podem
  ser tocados por pessoas diferentes após os contratos estarem fechados
- US5 pode correr em paralelo a US2, US3 e US4
- Telas marcadas [P] dentro de cada história são independentes entre si

---

## Parallel Example: User Story 1

```bash
# Testes da US1 juntos (todos devem falhar antes da implementação):
Task: "Teste unitário da validação de segmentos em packages/domain/tests/ingestion/segment-validation.test.ts"
Task: "Teste unitário do preenchimento de lacunas em services/forecast-engine/tests/unit/test_gap_filling.py"
Task: "Teste de propriedade da conservação do rateio em services/forecast-engine/tests/unit/test_proration_conservation.py"
Task: "Teste de contrato forecast.request/result em packages/contracts/tests/forecast.contract.test.ts"

# Domínio TypeScript da US1 junto:
Task: "Máquina de fases em packages/domain/src/scenario/phase-machine.ts"
Task: "Validação de segmentos em packages/domain/src/ingestion/segment-validation.ts"
Task: "Consolidação de duplicadas em packages/domain/src/ingestion/deduplicate.ts"
Task: "Validação da parametrização em packages/domain/src/scenario/parameters.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Fase 1: Setup
2. Fase 2: Foundational — **crítica**, com o codec decimal antes de tudo
3. Fase 3: US1
4. **PARAR e VALIDAR**: um usuário sozinho vai do CSV à previsão rateada, a soma dos filhos bate
   com o pai, e nenhum número de negócio é calculado fora do servidor
5. Demonstrar

### Incremental Delivery

1. Setup + Foundational → fundação pronta
2. US1 → validar → **MVP**: substitui a planilha de previsão
3. US2 → validar → o processo ganha papéis e portão de aprovação
4. US3 → validar → entra o conhecimento de mercado
5. US4 → validar → número oficial publicado
6. US5 → validar → o ciclo passa a se conduzir sozinho
7. US6 → validar → o ciclo fecha com acuracidade
8. US7 → validar → leitura visual do dado

### Parallel Team Strategy

Depois da Fase 2, com três frentes:

- **Frente A** (Python): motor — T078 a T093, depois T171 a T173 da US6
- **Frente B** (Node/API): T094 a T109, depois US2, US3 e US4
- **Frente C** (Frontend + notificações): telas de US1, depois US5 inteira

O contrato de `packages/contracts` é o ponto de sincronia entre as frentes: fechá-lo cedo é o
que permite trabalhar em paralelo sem colisão.

---

## Notes

- Tarefas [P] tocam arquivos diferentes e não têm dependência pendente
- Todo teste deve falhar antes da implementação correspondente
- Todo defeito corrigido ganha teste de regressão (Princípio VIII)
- Toda alteração em dado de planejamento grava AuditEvent na mesma transação (Princípio VI)
- Nenhum campo de grandeza sensível usa `z.number()` (Princípio V)
- Commitar por tarefa ou grupo lógico; parar em cada checkpoint para validar a história
