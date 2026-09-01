# SOP_APP

Sistema de apoio ao ciclo de S&OP: agendador das etapas do ciclo e ferramenta
estatística de previsão de demanda a partir de histórico de vendas.

- **Especificação e plano**: [specs/001-sop-cycle-forecasting/](specs/001-sop-cycle-forecasting/)
- **Constituição do projeto**: [.specify/memory/constitution.md](.specify/memory/constitution.md)
- **Progresso**: [tasks.md](specs/001-sop-cycle-forecasting/tasks.md)

## Estado atual

72 de 198 tarefas concluídas. **432 testes passando.**

| Módulo | O que já existe | Testes |
|--------|-----------------|--------|
| `packages/contracts` | Codec decimal, envelope de mensageria, schemas HTTP | 61 |
| `packages/domain` | Fases, ingestão, parametrização, autorização, colaboração, consenso | 120 |
| `apps/api` | Esqueleto Fastify, health, rotas de cenário e parametrização | 51 |
| `services/forecast-engine` | Motor completo: agregação, backtest, seleção, piso, rateio | 200 |

**Ainda não existe**: worker de ingestão, worker de e-mail, frontend,
adaptadores de Prisma/RabbitMQ/MinIO, Dockerfiles e `docker-compose.yml`.

> ⚠️ **A stack ainda NÃO sobe com `docker compose up`.** Os Dockerfiles e o
> compose são as tarefas T030–T038 e ainda não foram escritos — foram deixados
> para o momento em que houvesse Docker disponível para validá-los.

## Pré-requisitos

| Ferramenta | Versão | Observação |
|------------|--------|------------|
| Node.js | 22 LTS | |
| pnpm | 9 | **Obrigatório** — não use npm, veja abaixo |
| Python | 3.12 ou 3.13 | O motor usa StatsForecast/numba |
| Docker | 25+ com Compose v2 | Só será necessário quando o compose existir |

### Por que pnpm e não npm

Este é um workspace **pnpm**. O `package.json` da raiz não declara o campo
`workspaces` do npm, e as dependências internas usam o protocolo `workspace:*`.
Com `npm install`, os pacotes `@sop/contracts` e `@sop/domain` não são resolvidos
e a instalação falha.

```bash
corepack enable pnpm        # caminho preferido, já vem com o Node 22
# se o corepack falhar por permissão:
npm install -g pnpm@9
# ou, sem instalar nada:
npx pnpm@9 install
```

## Instalação

```bash
git clone https://github.com/wagngomes/S_OP_APP.git
cd S_OP_APP

# 1. Dependências TypeScript (raiz do monorepo)
pnpm install

# 2. Dependências Python do motor de cálculo
cd services/forecast-engine
pip install -e ".[dev]"
cd ../..

# 3. Variáveis de ambiente
cp .env.example .env         # ajuste RESEND_API_KEY e as senhas
```

## Rodando os testes

Tudo abaixo roda **sem Docker e sem banco** — o domínio é puro e as portas da API
são exercitadas com implementações em memória.

```bash
# TypeScript — contracts, domain e api
pnpm -r test

# Python — motor de cálculo
cd services/forecast-engine
PYTHONPATH=src pytest -q
```

No Windows com PowerShell, o equivalente do último comando:

```powershell
$env:PYTHONPATH = "src"; pytest -q
```

## Estrutura

```text
packages/contracts/       Schemas Zod, codec decimal, vetores dourados
packages/domain/          Regras de S&OP puras, sem framework nem banco
apps/api/                 Fastify — orquestração, auth, persistência
apps/ingestion-worker/    (a implementar) parse e validação de uploads
apps/email-worker/        (a implementar) envio assíncrono via Resend
apps/web/                 (a implementar) Next.js + Tailwind
services/forecast-engine/ Python — motor puro de cálculo
infra/                    (a implementar) Prometheus, Grafana, Loki
```

## Regras que o código precisa respeitar

Vêm da [constituição](.specify/memory/constitution.md) e são verificadas por
teste, não por convenção:

1. **Precisão numérica** — quantidade e valor trafegam como *string decimal*,
   nunca como número JSON. Há um teste que falha o build se `z.number()` aparecer
   em campo de grandeza sensível.
2. **Domínio puro** — `packages/domain` não importa Fastify, Prisma, amqplib,
   pino nem prom-client. Garantido por `dependency-cruiser` e por teste de
   isolamento.
3. **Fronteira entre serviços** — toda a matemática de S&OP vive no motor Python.
   A API não reimplementa métrica alguma.
4. **Conservação de soma** — a soma da previsão rateada dos itens é exatamente
   igual à previsão da série agregada. Testado por propriedade, sem tolerância.
5. **Correlação** — todo log carrega o `correlationId`, que atravessa API, worker
   e motor.
