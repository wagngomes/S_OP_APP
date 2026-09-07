# Instruções para o Claude neste projeto

Este arquivo viaja com o repositório e é lido no início de cada sessão, em
qualquer máquina. Leia-o antes de propor qualquer trabalho.

## Onde estamos

Projeto conduzido pelo fluxo Spec Kit. As quatro etapas de planejamento estão
**concluídas**: constituição, spec, plano e tasks. Estamos na implementação.

**Fonte da verdade do progresso**: [tasks.md](specs/001-sop-cycle-forecasting/tasks.md).
Tarefas concluídas estão marcadas `[X]`. Ao retomar, leia esse arquivo primeiro e
continue pela primeira tarefa não marcada que faça sentido na ordem de fases.

Estado no último commit desta máquina: **154 de 198 tarefas, ~562 testes passando.**

## Ordem de leitura ao retomar

1. [tasks.md](specs/001-sop-cycle-forecasting/tasks.md) — o que falta
2. [plan.md](specs/001-sop-cycle-forecasting/plan.md) — arquitetura, Constitution
   Check e os quatro desvios registrados em Complexity Tracking
3. [.specify/memory/constitution.md](.specify/memory/constitution.md) — as nove
   regras inegociáveis
4. [research.md](specs/001-sop-cycle-forecasting/research.md) — 20 decisões
   técnicas com as alternativas que foram rejeitadas e por quê

Não refaça decisões já registradas em `research.md` sem motivo novo. Se precisar
mudar uma, incremente o que ela versiona e diga isso explicitamente.

## Como trabalhar aqui

- **Testes primeiro, sempre.** A constituição exige teste unitário para toda
  função de cálculo (Princípio V) e teste automatizado para toda funcionalidade,
  com ao menos um caminho de falha (Princípio VIII). Escreva o teste, veja-o
  falhar, então implemente.
- **Marque a tarefa `[X]` em `tasks.md`** ao concluí-la — e só quando ela estiver
  de fato verificada. Não marque o que não foi executado.
- **Commite direto na `main`.** O autor trabalha sozinho: não crie branch por
  feature nem proponha pull request. Confirme antes de push, force ou delete.
- **Mensagem de commit registra o porquê**, não só o quê. As decisões desta base
  estão documentadas nas mensagens; mantenha esse padrão.

## Regras verificadas por teste, não por convenção

Quebrar qualquer uma destas falha o build:

1. **Precisão numérica** — quantidade e valor trafegam como *string decimal*,
   nunca como número JSON. `packages/contracts/tests/no-float-guard.test.ts` varre
   os schemas e falha se `z.number()` aparecer em campo de grandeza sensível.
2. **Domínio puro** — `packages/domain` não importa Fastify, Prisma, amqplib,
   pino nem prom-client. Garantido por `.dependency-cruiser.js` e por
   `packages/domain/tests/isolation.test.ts`.
3. **Fronteira entre serviços** — toda a matemática de S&OP vive no motor Python.
   A API **não** reimplementa métrica alguma; se precisar de uma, estenda o
   contrato do motor. Ver a tabela "Fronteira de cálculo" em `plan.md`.
4. **Conservação de soma** — a soma da previsão rateada é exatamente igual à
   previsão da série agregada, sem tolerância. Testado por propriedade.
5. **Correlação** — todo log carrega o `correlationId`, que atravessa API, worker
   e motor. Ele é o `reqId` do Fastify de propósito: um hook chegaria tarde
   demais para a primeira linha de log de cada requisição.

## Fronteira float × decimal

A única região do sistema onde ponto flutuante existe é a modelagem estatística,
dentro de `services/forecast-engine/src/forecast_engine/domain/model_selection.py`.
Entrada em `Decimal`, modelagem em `float64`, saída **quantizada** de volta antes
de qualquer serialização. Não amplie essa região.

A ordem das operações do cálculo é fixa e não é negociável:

```
agregar → preparar série → prever → PISO ZERO → ratear → quantizar
```

Aplicar o piso zero depois do rateio quebra a conservação de soma.

## Ambiente

- **pnpm, não npm.** Workspace pnpm; o `package.json` da raiz não tem campo
  `workspaces` e as dependências internas usam `workspace:*`.
- **Python do motor instala à parte**: `pip install -e ".[dev]"` em
  `services/forecast-engine`.
- Rodar testes: `pnpm -r test` e, no motor, `PYTHONPATH=src pytest -q`.

**Docker**: todos os Dockerfiles e o `docker-compose.yml` (T030–T038) estão prontos
e verificados (`docker compose build` passou, exit 0). As cinco imagens:
- `sop-app-api` 771 MB — Alpine 4-stage, pnpm deploy --prod, Prisma migrate no boot
- `sop-app-ingestion-worker` 334 MB — Alpine 4-stage
- `sop-app-email-worker` 343 MB — Alpine 4-stage
- `sop-app-web` 243 MB — Alpine 4-stage, Next.js 15 standalone
- `sop-app-forecast-engine` 694 MB — python:3.12-slim 2-stage, venv isolado

**Atenção**: `**/node_modules/` no `.dockerignore` é crítico — sem o `**` os
junctions do Windows sobrescrevem os symlinks do pnpm no container Alpine.

## O que ainda não existe

Worker de e-mail e a acuracidade (US5, US6). O ciclo S&OP completo (auth →
cenário → equipe → aprovação → colaboração → consenso → publicação) está
implementado de ponta a ponta.

**Fase 6 (US4) concluída** — consenso e publicação implementados (T143-T154).
Próximas tarefas: Phase 7 (US5) — worker de e-mail e notificações (T155-T164).

Componentes implementados em US4:
- `packages/contracts/src/http/consensus.ts` — contratos de tolerância, decisão, item e publicado
- `packages/contracts/src/decimal/decimal-string.ts` — `DecimalStringOut()` sem transform para response schemas (Zod v4 requer schemas sem transform no encode)
- `apps/api/src/services/`: ConsensusService, PublicationService
- `apps/api/src/routes/v1/consensus.routes.ts` — tolerância, itens (sort delta_desc), decisão, publicação, publicado
- `apps/api/src/adapters/prisma/consensus.repository.ts` — listItemsForConsensus, createDecision (upsert), allItemsDecided, publishForecast, listPublished
- `apps/web/src/app/scenarios/[id]/consensus/` e `/published/`
- Roteamento: CONSENSUS→/consensus, PUBLICATION+ACCURACY→/published em scenarios/[id]/page.tsx

Componentes implementados em US3 (T128-T142):
- `packages/contracts/src/http/collaboration.ts` — contratos de ajuste, item, planilha
- `apps/api/src/services/collaboration.service.ts`
- `apps/api/src/routes/v1/collaboration.routes.ts`
- `apps/ingestion-worker/src/application/persist-collaboration-sheet.ts`
- `apps/web/src/app/scenarios/[id]/collaboration/`

Componentes implementados em US2:
- `packages/contracts/src/http/members.ts` — contratos InviteMember, ScenarioMember, ApprovalDecision
- `apps/api/src/services/`: MembershipService, TeamService, ApprovalService
- `apps/api/src/routes/v1/`: members.routes, approval.routes
- `apps/api/src/adapters/rabbitmq/forecast-result.consumer.ts` — T125: notifica aprovadores
- `apps/web/src/app/scenarios/[id]/team/` e `/approval/`
- Portas: MembershipRepository, NotificationPort em ports.ts; setTeamClosed em ScenarioRepository

Componentes implementados em US1:
- `apps/api/src/routes/v1/`: auth, upload, ingestion, forecast, scenarios
- `apps/api/src/services/`: ForecastService, IngestionService
- `apps/ingestion-worker/src/application/`: csv-stream-parser, validation-report, persist-history
- `apps/ingestion-worker/src/messaging/ingestion.consumer.ts`
- `apps/web/src/app/(auth)/`: sign-in, sign-up
- `apps/web/src/app/scenarios/page.tsx`
- Contratos bilaterais em `packages/contracts/src/messaging/` e `src/http/`

**Adaptadores concretos implementados** (sessão docker compose):
- `apps/api/src/adapters/prisma/`: ScenarioRepository, MembershipRepository, IngestionRepository, ForecastRepository, ForecastItemRepository
- `apps/api/src/adapters/minio/`: dataset-exporter (stub 501), parquet-reader (stub 501)
- `apps/api/src/adapters/rabbitmq/`: publisher, notification
- `apps/api/src/server.ts` — wiring completo: Prisma + BetterAuth + MinIO + RabbitMQ + consumers
- `apps/api/src/app.ts` — CORS hooks (preflight OPTIONS + headers)
- `docker-compose.yml` — NEXT_PUBLIC_API_URL corrigido; TRUSTED_ORIGINS adicionado
- `apps/web/Dockerfile` — ARG/ENV NEXT_PUBLIC_API_URL no builder stage

DatasetExporter e ParquetReader são stubs (501) — Parquet requer biblioteca externa não instalada.
`docker compose up` deve subir auth, cenários, equipe e aprovação end-to-end.

**Nota Windows**: spawnSync com process.execPath falha via Bash tool (symlink nvm4w).
Usar `'node'` como comando (PATH) + `shell: false` em testes de integração que precisam
rodar subprocessos. Ver audit-transaction.test.ts como referência.
