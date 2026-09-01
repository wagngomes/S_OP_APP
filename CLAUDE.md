# Instruções para o Claude neste projeto

Este arquivo viaja com o repositório e é lido no início de cada sessão, em
qualquer máquina. Leia-o antes de propor qualquer trabalho.

## Onde estamos

Projeto conduzido pelo fluxo Spec Kit. As quatro etapas de planejamento estão
**concluídas**: constituição, spec, plano e tasks. Estamos na implementação.

**Fonte da verdade do progresso**: [tasks.md](specs/001-sop-cycle-forecasting/tasks.md).
Tarefas concluídas estão marcadas `[X]`. Ao retomar, leia esse arquivo primeiro e
continue pela primeira tarefa não marcada que faça sentido na ordem de fases.

Estado no último commit desta máquina: **72 de 198 tarefas, 432 testes passando.**

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

**Docker**: a máquina onde a maior parte deste código foi escrita não tinha
Docker, e por isso os Dockerfiles e o `docker-compose.yml` (T030–T038) ainda não
existem. Se a máquina atual tiver Docker, esse é um bom próximo passo — escreva-os
e **construa-os na hora**, em vez de deixá-los sem verificação.

## O que ainda não existe

Worker de ingestão, worker de e-mail, frontend, adaptadores de Prisma/RabbitMQ/
MinIO, Dockerfiles e compose, e as rotas do ciclo (aprovação, colaboração,
consenso, publicação) — cujas **regras de negócio já estão prontas e testadas** em
`packages/domain`; falta a fiação HTTP sobre elas.

Cerca de 25 tarefas dependem de Docker para serem verificadas: integração com
Testcontainers, compose e o roteiro do `quickstart.md`.
