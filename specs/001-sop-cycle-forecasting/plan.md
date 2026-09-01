# Implementation Plan: SOP_APP — Ciclo de S&OP com Previsão Estatística

**Branch**: `001-sop-cycle-forecasting` | **Date**: 2026-08-31 (atualizado 2026-09-01) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-sop-cycle-forecasting/spec.md`

## Summary

Aplicação web multi-serviço que conduz o ciclo de S&OP dentro de cenários e calcula previsão
estatística de demanda a partir de histórico de vendas em CSV.

A abordagem técnica é uma API de orquestração em TypeScript/Fastify que detém o processo, a
persistência e a autenticação, e um motor de cálculo em Python/StatsForecast que detém toda a
matemática de S&OP. Os dois nunca trocam datasets por mensagem: a API grava o dataset no MinIO,
publica no RabbitMQ apenas a referência do job, e o motor lê, calcula, grava o resultado no
MinIO e devolve a referência. Uploads seguem o mesmo padrão assíncrono, com um worker de
ingestão em Node que parseia, valida linha a linha e persiste — o motor Python jamais toca o
banco. Todo valor numérico sensível atravessa qualquer fronteira como **string decimal**,
nunca como ponto flutuante.

Quatro decisões deste plano não estavam no enunciado e alteram a arquitetura proposta. Estão
justificadas em [Complexity Tracking](#complexity-tracking) e em
[research.md](./research.md): a apuração de acuracidade passa a ser um job do motor Python; a
imagem do motor é Debian slim em vez de Alpine; o monorepo ganha dois pacotes compartilhados
além de `api` e `web`; e a fronteira float/decimal é fixada na saída do motor.

O catálogo de modelos é organizado em três **pacotes** — Rápido, Standard e Completo —
escolhidos pelo usuário na parametrização. Cada pacote define, junto, o conjunto de modelos e a
profundidade do backtest, porque as duas coisas são o mesmo eixo de custo. O usuário vê quantas
séries sua combinação de níveis produz e a ordem de grandeza do tempo antes de disparar: sem
isso, uma escolha inocente de agrupamento vira a diferença entre minutos e horas sem aviso
(D1, D1a, D14 em [research.md](./research.md)).

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node.js 22 LTS (API, workers de ingestão e e-mail,
frontend); Python 3.12 (motor de cálculo)

**Primary Dependencies**: Fastify 5, BetterAuth, Prisma 6, Zod 4,
`fastify-type-provider-zod` + `@fastify/swagger` (OpenAPI derivada dos schemas),
`@fastify/rate-limit`, `amqplib`, AWS SDK v3 S3 client (MinIO), `decimal.js`,
`resend`, `pino`, `prom-client`; Next.js 15 (App Router) + Tailwind CSS + TanStack Query no
frontend; Nixtla StatsForecast + `utilsforecast`, pandas, `pika`, `boto3`, `pydantic` e
`prometheus-client` no motor

**Storage**: PostgreSQL 17 (única fonte persistente, acessada apenas pela camada Node via
Prisma); MinIO (S3-compatível) para CSVs de entrada, planilhas de colaboração e datasets/
resultados trocados entre serviços

**Testing**: Vitest (TypeScript, unitário e integração), pytest (Python), Testcontainers para
Postgres/RabbitMQ/MinIO nos testes de integração, e vetores dourados compartilhados para os
testes de contrato entre Node e Python

**Target Platform**: Linux x86-64 em contêineres Docker; a stack completa sobe com
`docker compose up`

**Project Type**: Aplicação web multi-serviço (monorepo pnpm com serviço Python irmão)

**Performance Goals**: previsão de cenário com até 2.000 séries no pacote Standard concluída em
≤ 10 min (SC-004 — o custo é medido em **séries**, não em linhas, porque o trabalho é
`séries × modelos × janelas × custo do ajuste`); contagem de séries e estimativa de tempo
exibidas antes do disparo (SC-004a); troca de dimensão na apuração respondendo em < 5 s
(SC-014); ingestão de CSV em streaming sem carregar o arquivo inteiro em memória

**Constraints**: Node limitado a `--max-old-space-size=1536` coerente com `mem_limit` do
compose; motor Python processa em lotes para não estourar memória; precisão numérica exata em
persistência e em contrato (nunca `z.number()` para grandeza sensível); regra de negócio
exclusivamente no servidor

**Scale/Scope**: 8 fases de ciclo, 125 requisitos funcionais, 7 histórias de usuário; volume de
referência por cenário na casa de centenas de milhares de linhas de histórico

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Avaliado contra [constitution.md](../../.specify/memory/constitution.md) v1.1.0.

| # | Princípio | Veredito | Como o plano atende |
|---|-----------|----------|---------------------|
| I | Separação em camadas | **PASS** | API: `routes → controllers → services → domain`, com `packages/domain` sem nenhuma dependência de Fastify, Prisma ou amqplib. Motor Python: `messaging → application → domain`, sem script monolítico. `utils` restrito a formatação, sem termo de S&OP |
| II | Regra de negócio no servidor | **PASS** | Next.js apenas exibe e coleta; nenhum cálculo de negócio no cliente. Números chegam prontos da API como string decimal e são formatados só na renderização |
| III | Fronteira entre serviços | **PASS com decisão** | Toda matemática de S&OP (modelagem, backtest, rateio, catálogo de métricas, apuração realizada) vive no motor. A API não reimplementa métrica alguma — por isso a apuração virou job do motor. Ver [Complexity Tracking](#complexity-tracking) |
| IV | SOLID e baixo acoplamento | **PASS** | Services dependem de portas (`ForecastJobPublisher`, `DatasetStore`, `ScenarioRepository`, `Mailer`), com adaptadores concretos injetados na composição. Domínio não conhece nenhum adaptador |
| V | Correção numérica | **PASS com fronteira explícita** | `Decimal` no Postgres, `decimal.js` no Node, `Decimal` do Python na borda do motor; string decimal em todo contrato; `z.number()` proibido para grandeza sensível. A modelagem estatística roda em float64 por natureza — a fronteira de quantização está fixada e testada. Ver [Complexity Tracking](#complexity-tracking) |
| VI | Auditabilidade | **PASS** | Tabela `AuditEvent` gravada na **mesma transação** Prisma que efetiva a alteração, com autor, data/hora e origem (`UI`, `SPREADSHEET`, `INGESTION`, `ENGINE`, `SYSTEM`). Sem rota de escrita ou update sobre ela |
| VII | Manutenibilidade e clareza | **PASS** | Padrões fixados uma vez neste plano: nomes de camadas, formato de mensagem, codec decimal, layout de pastas. ESLint + Prettier + Ruff aplicados em CI |
| VIII | Toda funcionalidade testada | **PASS** | Vitest e pytest; todo caso de uso com ao menos um caminho de falha; testes de contrato dos dois lados sobre os mesmos vetores dourados; regressão obrigatória por defeito corrigido |
| IX | Observabilidade desde o início | **PASS** | Logs JSON via `pino`/`structlog`, `/metrics` em **todos** os processos de longa duração (API, worker de ingestão, worker de e-mail, motor), `correlationId` gerado na borda HTTP e propagado nas mensagens. Instrumentação só em controller/service — o domínio não loga |

**Restrições arquiteturais da constituição**

- *Instrumentação nas bordas*: `packages/domain` e `domain/` do Python não importam `pino`,
  `structlog` nem `prom-client`. Garantido por regra de lint de dependência (`depcruise`) e por
  teste que roda o domínio sem nenhuma infraestrutura.
- *Correlação atravessa a fronteira*: `correlationId` é campo obrigatório do envelope de toda
  mensagem desde a v1 do contrato.
- *Domínio isolado*: os testes de `packages/domain` e de `engine/domain` rodam sem Docker, sem
  rede e sem banco.

**Portões de qualidade aplicados a este plano**: nenhum requisito de cálculo entra sem teste
unitário; nenhuma mudança de contrato entra sem teste de contrato dos dois lados; toda revisão
verifica camada, fronteira, precisão e auditoria.

## Project Structure

### Documentation (this feature)

```text
specs/001-sop-cycle-forecasting/
├── plan.md              # Este arquivo
├── research.md          # Fase 0 — decisões técnicas com alternativas
├── data-model.md        # Fase 1 — entidades, precisão, transições de estado
├── quickstart.md        # Fase 1 — como subir e validar de ponta a ponta
├── contracts/           # Fase 1 — contratos HTTP, mensageria e codec decimal
│   ├── README.md
│   ├── http-api-v1.md
│   ├── messaging.md
│   └── decimal-codec.md
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Fase 2 (/speckit-tasks — NÃO criado aqui)
```

### Source Code (repository root)

```text
package.json                      # workspace raiz (pnpm)
pnpm-workspace.yaml
docker-compose.yml
.env.example

packages/
├── contracts/                    # Schemas Zod + codec decimal + tipos do contrato
│   ├── src/
│   │   ├── decimal/              # codec string-decimal (fonte única)
│   │   ├── http/                 # schemas de request/response da v1
│   │   ├── messaging/            # envelope e payloads das filas
│   │   └── golden/               # vetores dourados compartilhados com o Python
│   └── tests/
└── domain/                       # Domínio puro da orquestração (sem framework)
    ├── src/
    │   ├── scenario/             # fases, transições, papéis, permissões
    │   ├── ingestion/            # validação de layout e de segmentos
    │   ├── collaboration/        # regras de ajuste, motivo, concorrência
    │   ├── consensus/            # divergência, range, decisão
    │   └── utils/                # helpers técnicos, sem termo de S&OP
    └── tests/

apps/
├── api/                          # Fastify — orquestração, auth, persistência
│   ├── src/
│   │   ├── routes/v1/            # registro de rotas e versionamento
│   │   ├── controllers/          # entrada/saída, sem regra
│   │   ├── services/             # casos de uso
│   │   ├── adapters/             # prisma, rabbitmq, minio, resend, betterauth
│   │   ├── observability/        # pino, prom-client, correlationId
│   │   └── composition/          # injeção de dependências
│   ├── prisma/schema.prisma
│   ├── tests/{unit,integration,contract}/
│   ├── docker-entrypoint.sh      # migrate deploy antes do boot
│   └── Dockerfile
├── ingestion-worker/             # Node — parse, validação e persistência de uploads
│   ├── src/{messaging,application,adapters,observability}/
│   ├── tests/
│   └── Dockerfile
├── email-worker/                 # Node — consumo da fila de e-mail, envio via Resend
│   ├── src/{messaging,application,adapters}/
│   ├── tests/
│   └── Dockerfile
└── web/                          # Next.js — exibe e coleta, nunca calcula
    ├── src/{app,components,lib,styles}/
    ├── tailwind.config.ts        # paleta como tokens semânticos (D19)
    ├── tests/
    └── Dockerfile

services/
└── forecast-engine/              # Python — motor puro de cálculo
    ├── src/forecast_engine/
    │   ├── messaging/            # consumo/publicação RabbitMQ, envelope
    │   ├── application/          # orquestração do job: ler, calcular, gravar
    │   ├── domain/               # modelos, backtest, seleção, rateio, métricas
    │   ├── adapters/             # minio, prometheus
    │   └── utils/                # helpers técnicos
    ├── tests/{unit,integration,contract}/
    └── Dockerfile

infra/
├── prometheus/prometheus.yml
├── grafana/provisioning/
└── loki/
```

**Structure Decision**: monorepo pnpm com quatro aplicações TypeScript
(`apps/api`, `apps/ingestion-worker`, `apps/email-worker`, `apps/web`), dois pacotes
compartilhados (`packages/contracts`, `packages/domain`) e o serviço Python isolado em
`services/forecast-engine`, cada um com seu próprio Dockerfile.

O enunciado pedia workspaces para `api` e `web`. Os quatro diretórios adicionais existem por
exigência da constituição, não por preferência: `packages/domain` é o que torna o Princípio I
verificável (o domínio compila e testa sem Fastify e sem Prisma); `packages/contracts` é o que
impede a duplicação de schema entre API e workers, servindo o Princípio IV; e os dois workers
Node são processos separados porque consomem filas distintas com ciclos de vida próprios —
mantê-los dentro do processo da API acoplaria o tempo de resposta HTTP ao processamento pesado
que o enunciado quer justamente tirar do request.

## Fronteira de cálculo — quem calcula o quê

O Princípio III exige que esta divisão seja explícita. Nenhum item da coluna "Motor Python"
pode ser reimplementado em TypeScript, e vice-versa.

| Cálculo | Dono | Justificativa |
|---------|------|---------------|
| Agregação do histórico até a combinação de níveis | Motor Python | Insumo direto da modelagem; feito no mesmo passo do cálculo, sobre o dataset lido do MinIO |
| Backtest e seleção do melhor modelo por série | Motor Python | Núcleo estatístico (StatsForecast `cross_validation`) |
| Rateio da previsão até Produto + CD | Motor Python | Cálculo de S&OP com conservação de soma; exige a mesma aritmética decimal do resultado |
| Catálogo de métricas (WMAPE, MAPE, viés) e sua aplicação | Motor Python | **Implementação única**. É o que impede a duplicação proibida pelo Princípio III |
| Apuração de acuracidade realizada (agregar + aplicar métrica) | Motor Python | Usa o mesmo catálogo de métricas; ver [Complexity Tracking](#complexity-tracking) |
| Validação de layout e contagem de segmentos do CSV | Domínio TS (`packages/domain/ingestion`) | Regra de dado, não estatística; roda no worker de ingestão, que é quem tem o arquivo |
| Fases, transições, papéis e permissões | Domínio TS (`packages/domain/scenario`) | Processo de S&OP — território explícito da orquestração |
| Divergência calculado × colaborado e faixa de consenso | Domínio TS (`packages/domain/consensus`) | Aritmética de processo, não estatística; decidido aqui para evitar ida e volta ao motor por uma subtração |
| Somas dos dashboards | API via SQL | Leitura agregada para exibição, com teste de reconciliação contra os totais do dataset de origem |
| Contagem de séries distintas e estimativa de tempo | API via SQL | `COUNT(DISTINCT)` sobre o histórico já persistido; é contagem, não estatística — não justifica ida ao motor (D1a) |
| Preenchimento de lacunas e corte do prefixo pré-primeira-venda | Motor Python | Faz parte do preparo da série para modelagem; roda imediatamente antes do ajuste (D15) |
| Piso zero da previsão | Motor Python | Aplicado à série agregada antes do rateio, para preservar a conservação de soma (D16) |

## Complexity Tracking

> Desvios do enunciado ou tensões com a constituição que exigem justificativa.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Apuração de acuracidade executada pelo motor Python, não pela API** | O Princípio III proíbe reimplementar do outro lado da fronteira um cálculo que pertence ao motor. WMAPE, MAPE e viés já vivem no motor para o backtest; calculá-los de novo em TypeScript para a apuração criaria exatamente a duplicação proibida — e as duas implementações divergiriam com o tempo, produzindo dois números para a mesma pergunta | Calcular a apuração na API em TypeScript seria mais direto e evitaria um job assíncrono, mas duplicaria o catálogo de métricas em duas linguagens. A alternativa de manter uma "biblioteca de métricas" espelhada nas duas linguagens foi rejeitada: espelho é duplicação com outro nome, e a constituição manda estender o contrato do motor em vez de recriar a regra fora dele |
| **Imagem do motor em `python:3.12-slim` (Debian), não Alpine** | StatsForecast depende de numba/llvmlite, cuja distribuição de wheels para musl é incompleta. Em Alpine o `pip install` cai em compilação a partir do fonte, exigindo toolchain LLVM na versão exata; o resultado é build longo, imagem maior que a Debian slim e quebra a cada bump de versão | Alpine para todos os serviços era o pedido, e vale para os quatro contêineres Node/Next, que permanecem Alpine. Para o motor, insistir em Alpine custaria tempo de build e fragilidade sem ganho de tamanho. Decisão a reavaliar se numba publicar wheels musllinux estáveis |
| **Modelagem estatística em float64 dentro do motor** | StatsForecast opera sobre numpy/pandas em ponto flutuante; não existe caminho realista para ajustar ARIMA/ETS em aritmética decimal. O Princípio V proíbe float para grandeza monetária e de estoque | Rejeitado tentar aritmética decimal ponta a ponta no ajuste dos modelos: inviável com a biblioteca escolhida e sem benefício estatístico. A fronteira é fixada em vez de negada — entrada convertida de string decimal para float apenas dentro do domínio do motor, saída **quantizada** para a escala definida com `ROUND_HALF_UP` e serializada como string decimal, com o rateio corrigido por maior resto para a soma dos filhos bater exatamente com o pai. Testado por FR-046 |
| **Dois pacotes compartilhados e dois workers Node além de `api` e `web`** | `packages/domain` torna o Princípio I verificável; `packages/contracts` evita schema duplicado entre API e workers (Princípio IV); os workers são processos próprios porque a ingestão e o e-mail têm ciclo de vida independente do request HTTP | Manter tudo dentro de `apps/api` era mais simples de configurar, mas o domínio ficaria alcançável por Fastify e Prisma, o schema Zod seria copiado entre processos, e o trabalho pesado voltaria para dentro do request — o oposto do que o enunciado pede |

## Constitution Check — reavaliação pós-design (Fase 1)

Reexecutado após `research.md`, `data-model.md`, `contracts/` e `quickstart.md`.

| # | Princípio | Veredito | Evidência no design |
|---|-----------|----------|---------------------|
| I | Camadas | **PASS** | `packages/domain` sem dependência de infraestrutura; instrumentação restrita a controller/service; regra de lint de dependência prevista |
| II | Regra no servidor | **PASS** | Nenhuma rota devolve dado bruto para o frontend calcular; números chegam prontos como string decimal ([http-api-v1.md](./contracts/http-api-v1.md)) |
| III | Fronteira | **PASS** | Tabela [Fronteira de cálculo](#fronteira-de-cálculo--quem-calcula-o-quê) fecha quem calcula o quê; o motor recebe **rótulos**, não ids, e não tem credencial de banco — verificável pelo passo 7 do [quickstart](./quickstart.md) |
| IV | SOLID | **PASS** | Portas nomeadas e injetadas em `composition/`; `packages/contracts` elimina schema duplicado |
| V | Precisão | **PASS** | [decimal-codec.md](./contracts/decimal-codec.md) define gramática, escala, arredondamento, conservação por maior resto e três testes de guarda |
| VI | Auditoria | **PASS** | `AuditEvent` na mesma transação, sem rota de escrita, com `correlationId` ligando trilha e logs |
| VII | Clareza | **PASS** | Padrões fixados uma vez; nomes de fila, envelope e camadas uniformes entre os quatro serviços |
| VIII | Testes | **PASS** | Vetores dourados executados por Vitest e pytest; caminhos de falha explícitos no quickstart; unicidade de `jobId` testada com RabbitMQ real |
| IX | Observabilidade | **PASS** | `/metrics` nos quatro processos, `correlationId` obrigatório no envelope desde a v1, domínio sem logger |

**Nenhum gate falhou.** Os quatro desvios permanecem os já registrados em
[Complexity Tracking](#complexity-tracking); o design não introduziu novos.

Um ponto que o design mudou em relação à avaliação inicial: a apuração de acuracidade deixou de
ser uma rota síncrona da API e virou job do motor. Sem isso, o Princípio III falharia na primeira
implementação de WMAPE em TypeScript.

## Riscos técnicos acompanhados

Não são violações, mas pontos que o plano assume e que a implementação precisa provar:

- **Prisma em Alpine** exige `binaryTargets` incluindo `linux-musl-openssl-3.0.x`; sem isso a
  imagem sobe e falha na primeira query.
- **`--max-old-space-size` recebe megabytes como número puro**: a flag correta é
  `--max-old-space-size=1536`, não `1536MB`, que é ignorada silenciosamente.
- **Migração automática no entrypoint** é adequada para um único serviço migrador. Se a API
  escalar para mais de uma réplica, `migrate deploy` precisa sair do entrypoint e virar um job
  próprio, sob pena de corrida entre réplicas.
- **Idempotência real depende do banco**, não do worker: garantida por unicidade em
  `(jobId)` no resultado e transição de status condicional, porque RabbitMQ entrega ao menos
  uma vez.
- **Loki** entra como desejável; se o custo de operação incomodar, os logs JSON continuam
  legíveis por `docker logs` sem perda de correlação.
