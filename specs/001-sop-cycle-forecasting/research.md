# Phase 0 — Research: SOP_APP

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-31 (atualizado 2026-09-01)

Cada decisão abaixo fecha um ponto que a especificação deixava em aberto ou que o enunciado da
stack não determinava. Nenhum `NEEDS CLARIFICATION` permanece.

---

## D1. Catálogo de modelos em três pacotes

**Decision**: catálogo do StatsForecast organizado em três pacotes **cumulativos**, escolhidos
pelo usuário na parametrização (FR-034b, FR-043d). Cada pacote define, junto, o conjunto de
modelos **e** a profundidade do backtest — porque as duas coisas são o mesmo eixo: mais análise,
mais tempo.

| Pacote | Modelos acrescentados | Total | Janelas de backtest |
|--------|----------------------|-------|---------------------|
| **Rápido** | `Naive`, `SeasonalNaive`, `HistoricAverage`, `WindowAverage` | 4 | 1 |
| **Standard** | + `AutoETS`, `AutoTheta`, `CrostonOptimized` | 7 | 3 |
| **Completo** | + `AutoARIMA` | 8 | 4 |

Papel de cada modelo:

| Modelo | Papel |
|--------|-------|
| `Naive` | Piso de comparação; régua do SC-011. Presente em todos os pacotes |
| `SeasonalNaive` | Piso para sazonalidade anual (m=12) |
| `HistoricAverage` | Série estável sem tendência |
| `WindowAverage` | Média móvel de janela curta |
| `AutoETS` | Suavização exponencial com seleção automática de erro/tendência/sazonalidade |
| `AutoTheta` | Bom desempenho em série mensal curta |
| `CrostonOptimized` | Demanda intermitente — giro baixo com muitos meses zerados |
| `AutoARIMA` | Estrutura autorregressiva sazonal; o mais caro do catálogo, isolado no Completo |

**Rationale**: o custo do cálculo é `séries × modelos × janelas × custo do ajuste`, e o número de
séries é escolhido pelo usuário ao arrastar a combinação de níveis. Um catálogo único
transformaria uma escolha inocente de agrupamento — `BU` versus `BU+Setor+CD` — em minutos
versus horas, sem que ninguém percebesse antes de disparar. Os pacotes devolvem esse controle ao
usuário de forma legível: ele decide quanto quer gastar por quanta análise.

`AutoARIMA` ficou sozinho no Completo porque é, de longe, o mais caro: busca stepwise refeita a
cada janela de validação. Isolá-lo é o que torna o Standard utilizável em cenário grande.

**Alternatives considered**: catálogo único fixo (rejeitado — é a origem do risco de SC-004);
seleção livre de modelos pelo usuário (torna resultados não comparáveis entre cenários e exige
do planejador um conhecimento estatístico que ele não tem que ter); escolher o pacote
automaticamente pelo número de séries (tira do usuário uma decisão de custo que é dele, e
surpreende quando o mesmo cenário muda de comportamento ao crescer).

**Regras de guarda** (FR-043b): série com menos pontos que o mínimo de um modelo é excluída
daquele candidato, não do resultado. Se nenhum candidato for aplicável, o item sai com `Naive` e
`fallbackApplied = true`.

---

## D1a. Estimativa de custo antes do disparo

**Decision**: ao mudar a combinação de níveis ou o pacote, o frontend consulta um endpoint que
devolve o número de séries distintas — `COUNT(DISTINCT)` sobre `SalesRecord`, barato — e uma
estimativa de tempo em ordem de grandeza, calculada como
`séries × modelos(pacote) × janelas(pacote) × custo médio por ajuste`, com o custo médio
calibrado por medição e guardado como constante versionada (FR-034a, FR-034d, SC-004a).

**Rationale**: a estimativa não precisa ser precisa, precisa ser honesta na ordem de grandeza —
o que separa "dois minutos" de "duas horas". É o que impede o usuário de descobrir o custo da
sua escolha depois de esperar.

**Alternatives considered**: não estimar (mantém o problema); benchmark real de amostra antes do
job (mais preciso, mas paga um cálculo para saber se vale a pena calcular).

---

## D2. Fronteira float × decimal

**Decision**: três zonas com conversão explícita nas bordas.

1. **Persistência e contrato** — `Decimal` no Postgres, `decimal.js` no Node, string decimal no
   JSON. Nunca `Number`, nunca `z.number()` para grandeza sensível.
2. **Domínio do motor** — na entrada, `Decimal → float64` para alimentar numpy/pandas; a
   modelagem roda em float.
3. **Saída do motor** — `float64 → Decimal` com `quantize(ROUND_HALF_UP)` na escala definida em
   [data-model.md](./data-model.md), antes de qualquer serialização.

O rateio é fechado por **maior resto**: distribui-se pela representatividade, quantiza-se cada
filho, e a diferença residual em relação ao pai é atribuída ao filho de maior resto fracionário.
Isso faz a soma dos filhos bater exatamente com o pai, como exige FR-046.

**Rationale**: o Princípio V proíbe float para quantidade e valor, mas ajuste de ARIMA/ETS em
decimal não existe na prática. Negar a tensão produziria um plano que a implementação violaria
em silêncio. Fixar a fronteira torna a violação impossível fora de uma região pequena, definida
e testada.

**Alternatives considered**: decimal ponta a ponta (inviável com a biblioteca escolhida);
float até a persistência com arredondamento só na exibição (rejeitado — é exatamente o erro
silencioso e acumulativo que o Princípio V descreve); inteiros escalados em vez de decimal
(funciona, mas espalha o fator de escala por todo o código e piora a legibilidade, contra o
Princípio VII).

---

## D3. Onde vive a apuração de acuracidade realizada

**Decision**: job assíncrono do motor Python, na fila `sop.accuracy.request`. A API exporta
previsão publicada e vendas reais para o MinIO, o motor agrega até a dimensão escolhida, aplica
a métrica e devolve a referência do resultado.

**Rationale**: o catálogo de métricas já existe no motor para o backtest. Recalculá-lo em
TypeScript seria a duplicação que o Princípio III proíbe nominalmente, com a consequência
prevista: duas implementações da mesma métrica divergindo com o tempo. Como bônus, a garantia
da spec de que acurácia do modelo e acuracidade realizada usam o mesmo catálogo (FR-037) passa
a ser estrutural em vez de depender de disciplina.

**Alternatives considered**: calcular na API (mais simples e síncrono, mas duplica o catálogo);
expor o motor por HTTP síncrono para a apuração (quebraria o padrão assíncrono do restante e
tornaria o SC-014 refém do tempo de resposta do motor); manter uma biblioteca de métricas
espelhada nas duas linguagens (duplicação com outro nome).

**Consequência para o SC-014** (< 5 s ao trocar a dimensão): resultados de apuração são
persistidos por `(cenário, dimensão, métrica)`; a troca de dimensão já apurada é leitura. Só a
primeira combinação paga o job.

---

## D4. Sistema operacional das imagens

**Decision**: Alpine para `api`, `ingestion-worker`, `email-worker` e `web`;
`python:3.12-slim` (Debian) para `forecast-engine`. Todos multi-stage.

**Rationale**: StatsForecast depende de numba/llvmlite, cuja cobertura de wheels musllinux é
incompleta. Em Alpine, `pip install` cai em build a partir do fonte com exigência de LLVM na
versão exata — build longo, frágil a cada bump e sem ganho de tamanho frente à Debian slim.

**Alternatives considered**: Alpine em tudo (pedido do enunciado, rejeitado pelo custo acima);
Debian slim em tudo (perderia o ganho real de tamanho nas imagens Node); imagem Alpine com
wheels pré-compiladas em registry próprio (resolve, mas cria infraestrutura de build para
manter, desproporcional ao problema).

**Reavaliar quando**: numba publicar wheels musllinux estáveis para a versão em uso.

---

## D5. Transporte de dados entre serviços

**Decision**: mensagem carrega **apenas referência**; dataset trafega por MinIO em Parquet.
A API grava `datasets/{scenarioId}/{jobId}/input.parquet`, publica `{jobId, scenarioId,
params, inputUri, correlationId}`, e o motor grava
`datasets/{scenarioId}/{jobId}/output.parquet`.

**Rationale**: o enunciado já exige referência em vez de payload. Parquet em vez de CSV para o
trecho interno porque preserva tipagem por coluna, comprime bem e é lido em lotes pelo pandas —
o que sustenta o processamento em lotes exigido pelo limite de memória. As colunas numéricas do
Parquet são gravadas como **string decimal**, mantendo a regra de precisão também no arquivo.

**Alternatives considered**: CSV interno (simples, mas perde tipo e infla o tamanho); dataset
dentro da mensagem (proibido pelo enunciado e inviável no limite de tamanho do RabbitMQ);
motor lendo direto do Postgres (proibido pelo Princípio III — o motor não conhece o schema).

---

## D6. Idempotência e ciclo de vida dos jobs

**Decision**: idempotência garantida pelo banco, não pela memória do worker.

- Toda mensagem tem `messageId` e `jobId` no envelope.
- O resultado tem **unicidade em `jobId`**; segunda gravação viola a constraint e é tratada como
  entrega duplicada, sem erro para o operador.
- Transições de status são condicionais (`UPDATE ... WHERE status = 'processing'`), de modo que
  a reentrega não reabre um job concluído.
- Falha de processamento manda a mensagem para `*.dlq` após o limite de tentativas, com o motivo
  registrado no job.

**Rationale**: RabbitMQ entrega ao menos uma vez; qualquer controle apenas em memória do
consumidor se perde no restart, que é justamente quando a reentrega acontece.

**Alternatives considered**: cache de `messageId` em memória (perde no restart); Redis para
deduplicação (mais um serviço para um problema que o Postgres já resolve com uma constraint).

---

## D7. Ingestão assíncrona de uploads

**Decision**: `POST` multipart em streaming direto para o MinIO; a API valida só o envelope
(extensão, tamanho, MIME), cria `IngestionJob` com status `pending`, publica na fila
`sop.ingestion.request` e responde **202 Accepted** com o `jobId`. O `ingestion-worker` lê em
streaming, parseia, valida linha a linha e persiste via Prisma.

O relatório de linhas inválidas é **acumulado**, não interrompido no primeiro erro: cada
entrada registra número da linha, coluna e motivo, gravada em `IngestionIssue` e paginada para
o frontend. Um teto de issues registradas evita relatório sem fim em arquivo totalmente
inconsistente; o teto é reportado ao usuário quando atingido.

**Rationale**: é o pedido do enunciado, e é o que permite honrar FR-024 — avisar o usuário sobre
todas as linhas divergentes sem calcular nada — sem prender o request HTTP.

**Alternatives considered**: parse dentro do request (bloqueia o worker HTTP e estoura memória
em arquivo grande); abortar no primeiro erro (contraria FR-024 e obriga o usuário a corrigir o
arquivo uma linha por vez).

---

## D8. Autenticação e autorização

**Decision**: BetterAuth montado na API Fastify como fonte de verdade, com adaptador Prisma e
provedor e-mail/senha. Sessão por cookie `httpOnly`, `SameSite=Lax`, `Secure` fora de
desenvolvimento. O Next.js consome a API e nunca decide autorização.

Autorização de cenário é **do domínio**, não do BetterAuth: `packages/domain/scenario` expõe
funções puras que respondem se um papel pode executar uma ação em uma fase. O controller apenas
aplica a resposta. Isso mantém o Princípio I e torna a matriz papel × fase × ação testável sem
subir servidor.

**Rationale**: separa autenticação (quem é) de autorização de processo (o que esse papel pode
nesta fase), que é regra de negócio de S&OP e por isso pertence ao domínio.

**Alternatives considered**: autorização em middleware com strings de permissão (espalha a regra
pela camada de transporte e a torna difícil de testar); RBAC genérico em biblioteca (não modela
a dependência de fase, que é o cerne da regra aqui).

---

## D9. Validação, contrato e OpenAPI

**Decision**: `packages/contracts` é a fonte única. Zod define request, response e payload de
fila; `fastify-type-provider-zod` + `@fastify/swagger` derivam a OpenAPI da mesma definição,
servida em `/api/v1/docs`. Grandeza sensível usa o tipo `DecimalString` do pacote — jamais
`z.number()`.

Do lado Python, os mesmos payloads são validados por modelos Pydantic. Node e Python compartilham
`packages/contracts/src/golden/`: vetores JSON usados por Vitest e por pytest, de modo que uma
divergência de interpretação quebra a suíte dos dois lados.

**Rationale**: OpenAPI derivada do código não sai de sincronia, que é a exigência do enunciado.
Os vetores dourados são o teste de contrato bilateral que o Princípio VIII pede.

**Alternatives considered**: OpenAPI escrita à mão (sai de sincronia na primeira semana);
geração de código Python a partir do Zod (ferramental frágil para o ganho); JSON Schema como
intermediário (possível evolução, desnecessário agora).

---

## D10. Observabilidade

**Decision**: `pino` no Node e `structlog` no Python, ambos em JSON, com `correlationId`,
`scenarioId` e `jobId` em todo registro. `correlationId` nasce na borda HTTP (header
`x-correlation-id` ou gerado) e viaja no envelope de toda mensagem.

`/metrics` em **todos** os processos de longa duração — API, worker de ingestão, worker de
e-mail e motor —, não só nos dois citados no enunciado, porque um worker sem métrica é
exatamente onde a fila entope sem ninguém ver. Prometheus raspa; Grafana provisiona os painéis;
Loki agrega os logs.

Métricas mínimas: duração e desfecho de job por tipo, profundidade de fila, linhas ingeridas por
segundo, séries calculadas por job, e-mails enviados e falhos, latência HTTP por rota.

**Rationale**: Princípio IX. A instrumentação fica em controller/service e no adaptador de
mensageria; o domínio permanece puro.

**Alternatives considered**: OpenTelemetry com tracing distribuído completo (mais poderoso e
provável evolução, mas pesado para a primeira entrega — o `correlationId` já responde a pergunta
central de seguir um cálculo ponta a ponta).

---

## D11. Acompanhamento de estado pelo frontend

**Decision**: polling do endpoint de status, com intervalo progressivo (2 s nos primeiros 30 s,
5 s até 5 min, 15 s depois), via TanStack Query. SSE/WebSocket fica registrado como evolução
fora de escopo, conforme o enunciado.

**Rationale**: atende ao pedido e evita conexão persistente por job longo. O intervalo
progressivo mantém a sensação de resposta imediata no começo sem manter carga constante em job
de dez minutos.

---

## D12. E-mail

**Decision**: fila dedicada `sop.email.request` consumida pelo `email-worker`, provedor Resend
com `RESEND_API_KEY` por variável de ambiente. Falha de envio não desfaz a transição de fase
(FR-096): o avanço já está persistido; a notificação tem estado próprio, com retry e DLQ.

**Rationale**: a spec exige explicitamente que o avanço permaneça válido quando o e-mail falha.
Separar as duas coisas em transações distintas é o que torna isso verdadeiro.

---

## D13. Escala decimal e arredondamento

**Decision**: quantidades e previsões em `Decimal(18,6)`; percentuais e métricas em
`Decimal(12,6)`; arredondamento `ROUND_HALF_UP` em todo o sistema. Definido uma vez em
`packages/contracts/src/decimal` e replicado no motor por constante compartilhada, com vetores
dourados provando igualdade de comportamento entre as linguagens.

**Rationale**: o Princípio V exige escala e política de arredondamento explícitas. Seis casas
cobrem rateio de itens de baixo giro sem perda perceptível; `HALF_UP` é o comportamento que o
usuário de planejamento espera ao conferir na planilha.

**Alternatives considered**: escala 2 (perde precisão no rateio de item pequeno, e o erro
reaparece na soma); `ROUND_HALF_EVEN` (melhor estatisticamente, mas diverge do que o usuário vê
no Excel, gerando dúvida recorrente sobre "o número errado").

---

## D14. Configuração do backtest

**Decision**: validação cruzada com janelas deslizantes **não sobrepostas**, horizonte de
avaliação `h = 3` meses e passo igual a `h`, com o número de janelas definido pelo pacote (D1):
Rápido 1, Standard 3, Completo 4.

O mínimo de histórico é declarado **por modelo**, não pelo pacote:

| Modelo | Meses mínimos de treino |
|--------|-------------------------|
| `Naive`, `HistoricAverage`, `WindowAverage` | 6 |
| `AutoETS`, `AutoTheta`, `CrostonOptimized` | 12 |
| `SeasonalNaive`, `AutoARIMA` (componente sazonal m=12) | 24 |

Um modelo é excluído de uma série quando a série não sustenta seu mínimo na primeira janela.
Quando a série não sustenta nem o número de janelas do pacote, ela cai para a maior configuração
viável e é sinalizada — nunca fica de fora do resultado.

Esta configuração é versionada junto com o catálogo, num único `modelCatalogVersion`
(FR-043e, FR-043c).

**Rationale**: esta decisão ficou em aberto na conversa e foi tomada por padrão explícito, e não
por omissão. Ela merece atenção porque **determina qual modelo vence cada série**: dois valores
diferentes de janela produzem dois vencedores diferentes para os mesmos dados.

`h = 3` porque é o horizonte que o consenso de S&OP realmente discute — os meses próximos, onde
a decisão de suprimento é tomada. Avaliar em `h = 12` alinharia melhor a régua ao horizonte
publicado, mas exigiria histórias longas demais: com 3 janelas seriam 36 meses só de teste, e a
maioria das séries reais seria descartada por falta de dado.

**Trade-off assumido e como reverter**: a seleção otimiza acurácia de curto prazo. Se a operação
concluir que o que importa é o horizonte inteiro, muda-se `h` para 6 ou 12, incrementa-se o
`modelCatalogVersion` e os resultados antigos permanecem explicáveis — nada é reescrito
retroativamente.

**Alternatives considered**: janelas sobrepostas com `step = 1` (mais pontos de avaliação, custo
multiplicado por 3 sem ganho claro de seleção); `h` igual ao horizonte de publicação (correto em
teoria, inviável com histórico real); backtest configurável pelo usuário (mais um parâmetro
estatístico para quem não tem que dominar estatística, e resultados incomparáveis entre
cenários).

---

## D15. Lacunas na série e início de vida

**Decision**: preencher com zero os meses ausentes **no interior** da série de cada item, e
**não** preencher os meses anteriores à sua primeira venda. A série de cada item começa no seu
primeiro mês com movimento (FR-040d).

Implementado como função pura no domínio do motor, testada isoladamente, antes de qualquer
chamada ao StatsForecast.

**Rationale**: StatsForecast exige frequência regular — buraco no meio distorce ou quebra o
ajuste. Mas os dois tipos de buraco têm significados opostos: no meio da vida de um item ativo,
mês sem venda é venda zero; antes da primeira venda, não é zero, é ausência de vida. Preencher o
prefixo ensina ao modelo uma demanda zero que nunca existiu, e ele projeta perto de zero para
sempre — exatamente o erro que mata a previsão de item novo.

**Alternatives considered**: `fillna(0)` uniforme (simples e errado para item novo);
interpolação (inventa demanda que não houve); descartar séries com lacuna (perde justamente os
itens intermitentes, que são o caso de uso do `CrostonOptimized`).

---

## D16. Piso zero e ordem das operações

**Decision**: a previsão nunca é negativa. O piso zero é aplicado **à série agregada, antes do
rateio** (FR-040a, FR-040b).

Ordem normativa no motor:

1. agregar o histórico até a combinação de níveis (negativos de devolução preservados);
2. ajustar e prever;
3. **aplicar o piso zero à previsão da série**;
4. ratear pela representatividade histórica;
5. quantizar com maior resto (D2).

Quantidades negativas do histórico continuam válidas na entrada — o piso vale para a saída
(FR-040c).

**Rationale**: cortar em zero depois do rateio destruiria a conservação de soma do FR-046, já
que os filhos deixariam de somar o pai. Cortar antes mantém a identidade e é o que o planejador
espera ver.

Consequência a conhecer: modelos com componente multiplicativo não aceitam valores não
positivos. O espaço de modelos é restringido por série conforme o sinal dos dados, e a restrição
é registrada em `evaluatedModels`.

**Alternatives considered**: clamp por item após o rateio (quebra FR-046); permitir previsão
negativa e tratar na exibição (contraria a decisão do usuário e empurra regra de negócio para o
frontend, violando o Princípio II).

---

## D17. Métrica padrão e aviso de métrica indefinida

**Decision**: WMAPE é a métrica padrão. Ao selecionar MAPE, o sistema calcula a proporção de
meses com realizado zero no cenário e avisa quando ela ultrapassa um limiar configurado
(FR-036a, FR-086).

**Rationale**: MAPE é indefinido com denominador zero, e demanda intermitente é cheia de meses
zerados — precisamente o caso do `CrostonOptimized`. Sem o aviso, a seleção de modelo passa a
ser dirigida por ruído numérico, e o usuário não tem como saber disso olhando o resultado.

**Alternatives considered**: proibir MAPE (a spec pede o catálogo com MAPE; proibir seria
decidir pelo usuário); substituir silenciosamente por WMAPE (pior — muda o número sem avisar).

---

## D18. Operação do motor

**Decision**: três medidas operacionais no serviço Python.

- **Warm-up do numba no boot**: um ajuste sintético descartável antes de consumir a primeira
  mensagem, com `NUMBA_CACHE_DIR` persistido na imagem. Sem isso, o primeiro job real paga a
  compilação JIT e as métricas do Prometheus registram um outlier que não é do negócio.
- **Paralelismo limitado**: `n_jobs` derivado do limite de CPU do contêiner, nunca `-1`. O
  StatsForecast paraleliza por processos, e a memória multiplica por worker — combinado com
  `mem_limit`, `-1` é a receita conhecida de OOM.
- **Marcador de conclusão no MinIO**: gravar `output.parquet` e `series.parquet` e **só então**
  um objeto `_SUCCESS`. A lógica de idempotência que republica quando o output já existe (D6)
  precisa desse marcador para não ler resultado escrito pela metade.

**Rationale**: são as três formas mais prováveis de o motor falhar em produção sem que o código
de cálculo esteja errado.

---

## D19. Estilização do frontend

**Decision**: Tailwind CSS no `apps/web`, com a paleta do enunciado registrada como tokens de
tema em `tailwind.config`, não como valores literais espalhados pelo código.

```text
turquesa   #7FD9CD   header, CTA, detalhes gráficos
petroleo   #16455C   logo, títulos, texto principal
branco     #FFFFFF   fundo principal
grafite    #2B2B2B   texto de navegação
verde      #2E9B7C   apoio
cinza      #F5F5F5   backgrounds secundários
```

**Rationale**: cor nomeada por papel semântico sobrevive a uma troca de identidade visual; hex
espalhado em classes não. É a aplicação do Princípio VII — consistência acima de preferência
individual — na camada que mais tende a divergir entre telas.

**Consequência para o Princípio II**: Tailwind é estilo, não lógica. O frontend continua
proibido de calcular número de negócio; valores chegam como string decimal e são apenas
formatados para exibição.
