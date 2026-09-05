# Instruções para o Claude neste projeto

Este arquivo viaja com o repositório e é lido no início de cada sessão, em
qualquer máquina. Leia-o antes de propor qualquer trabalho.

## Onde estamos

Projeto conduzido pelo fluxo Spec Kit. As quatro etapas de planejamento estão
**concluídas**: constituição, spec, plano e tasks. Estamos na implementação.

**Fonte da verdade do progresso**: [tasks.md](specs/001-sop-cycle-forecasting/tasks.md).
Tarefas concluídas estão marcadas `[X]`. Ao retomar, leia esse arquivo primeiro e
continue pela primeira tarefa não marcada que faça sentido na ordem de fases.

Estado no último commit desta máquina: **94 de 198 tarefas, 445 testes passando.**

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

Worker de ingestão, worker de e-mail, e as rotas do ciclo (aprovação,
colaboração, consenso, publicação) — cujas **regras de negócio já estão prontas
e testadas** em `packages/domain`; falta a fiação HTTP sobre elas. Frontend tem
scaffold mínimo (homepage).

**Fase 2 concluída** — checkpoint "fundação pronta" atingido (T054-T060, T078, T090-T091).
Próximas tarefas: Phase 3 (US1) — T061 (contrato auth), T069 (contrato mensagens),
T070 (upload 202), T071 (worker issue report), T072 (end-to-end US1), T094 (rotas auth).

**Nota Windows**: spawnSync com process.execPath falha via Bash tool (symlink nvm4w).
Usar `'node'` como comando (PATH) + `shell: false` em testes de integração que precisam
rodar subprocessos. Ver audit-transaction.test.ts como referência.
