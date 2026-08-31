<!--
Sync Impact Report
==================
Version change: 1.0.0 → 1.1.0
Bump rationale: MINOR. Dois princípios novos adicionados (VIII. Toda Funcionalidade é Testada;
IX. Observabilidade desde o Primeiro Momento). Nenhum princípio existente foi removido nem
redefinido de forma incompatível; o Princípio V permanece inalterado e VIII o estende para
além das funções de cálculo.

Modified principles:
- I a VII: inalterados.
- (novo) → VIII. Toda Funcionalidade é Testada (NÃO NEGOCIÁVEL)
- (novo) → IX. Observabilidade desde o Primeiro Momento

Added sections:
- Restrições Arquiteturais: nova restrição "Instrumentação nas bordas".
- Fluxo de Desenvolvimento e Portões de Qualidade: novos portões de funcionalidade e de
  observabilidade.

Removed sections: nenhuma.

Follow-up TODOs: nenhum. Nenhum token entre colchetes permanece no documento.

Histórico
---------
1.0.0 (2026-08-31) — Ratificação inicial. Placeholders do template substituídos por governança
concreta do SOP_APP: 7 princípios, Restrições Arquiteturais, Portões de Qualidade e Governance.
-->

# SOP_APP Constitution

SOP_APP é um sistema de apoio ao ciclo de S&OP (Sales & Operations Planning). Esta
constituição é agnóstica de tecnologia: ela não define linguagem, framework, ORM, banco,
protocolo de transporte ou mecanismo de fila. Essas escolhas pertencem ao plano de
implementação e devem ser justificadas lá, sempre em conformidade com os princípios abaixo.

A arquitetura é multi-serviço. No mínimo existem dois serviços de backend: um **serviço de
orquestração**, responsável pelo processo e pelas decisões do ciclo de S&OP, e um **motor de
cálculo**, responsável pelos cálculos de negócio. Eles se comunicam exclusivamente por um
contrato bem definido.

## Core Principles

### I. Separação de Responsabilidades em Camadas (NÃO NEGOCIÁVEL)

Todo serviço do sistema MUST ser organizado em camadas com responsabilidades disjuntas:

- **Controller**: cuida apenas de entrada e saída — recebe a requisição, valida formato e
  tipo, delega e devolve a resposta. MUST NOT conter regra de negócio, cálculo ou decisão de
  processo.
- **Service**: orquestra os casos de uso — coordena chamadas ao domínio, à persistência e a
  outros serviços, e controla a transação e o fluxo do caso de uso. MUST NOT conter a regra
  de negócio em si.
- **Domínio**: contém as regras e cálculos de S&OP como funções puras e testáveis. MUST NOT
  depender de framework, de transporte, de banco de dados ou de qualquer detalhe de
  infraestrutura. Recebe dados, aplica regra, devolve resultado.
- **utils**: guarda somente helpers técnicos sem significado de negócio — formatação de data,
  número e string, e semelhantes. MUST NOT conter conhecimento de S&OP.

Qualquer cálculo com sentido de S&OP é domínio, nunca util. Se uma função precisa saber o que
é previsão, demanda, estoque, capacidade, plano ou ajuste, ela pertence ao domínio.

Esta separação vale para **todos** os serviços, incluindo o motor de cálculo. Nenhum serviço
pode virar um script monolítico, por menor ou mais "técnico" que pareça.

**Justificativa**: camadas com responsabilidade única permitem testar a regra sem subir
infraestrutura, trocar transporte ou persistência sem tocar na regra, e localizar qualquer
mudança em um lugar previsível. A erosão dessa fronteira é a causa mais comum de sistemas de
planejamento que se tornam impossíveis de manter.

### II. Regra de Negócio no Servidor

Todo cálculo, validação e decisão de S&OP MUST acontecer nos serviços de backend. O serviço de
orquestração e o motor de cálculo são, coletivamente, a fonte única de verdade do
comportamento de negócio.

O frontend MUST se limitar a exibir dados e coletar entrada do usuário. Ele MUST NOT calcular
números de negócio — nem para exibição imediata, nem para "prévia", nem para evitar uma
chamada ao servidor. Validação no frontend é permitida apenas como conveniência de
usabilidade e MUST ser sempre repetida no servidor, que é a validação que vale.

**Justificativa**: número de planejamento calculado em dois lugares diverge; quando diverge,
não há como saber qual está certo, e a confiança no sistema inteiro cai. Uma única fonte de
verdade elimina a classe inteira de defeitos de divergência cliente/servidor.

### III. Fronteira Explícita Entre Serviços

O motor de cálculo MUST ser um serviço isolado, exposto por um contrato bem definido,
versionado e documentado. Ele recebe dados, calcula e devolve o resultado. MUST NOT conhecer
workflow, etapas do ciclo, aprovações ou qualquer outro aspecto do processo de S&OP.

O serviço de orquestração MUST cuidar do processo e das decisões do ciclo. Ele MUST NOT
reimplementar um cálculo que pertence ao motor. É proibido duplicar lógica de cálculo do outro
lado da fronteira por conveniência, por desempenho percebido ou por urgência de prazo; se o
motor não oferece o cálculo necessário, a correção é estender o contrato do motor, não recriar
a regra fora dele.

Cada serviço MUST ser testável de forma independente, sem exigir que o outro esteja no ar.

**Justificativa**: a fronteira só protege enquanto for respeitada. Cálculo duplicado dos dois
lados envelhece de forma desigual e produz resultados diferentes para a mesma pergunta —
exatamente o que a separação existia para impedir.

### IV. SOLID e Baixo Acoplamento

Dependências entre camadas e entre serviços MUST se dar por interface ou contrato, nunca por
implementação concreta. Um service depende de uma abstração, não de outro service concreto.

Cada unidade MUST ter uma única razão para mudar. Extensões de comportamento MUST ser feitas
por novas implementações do contrato, não por cadeias de condicionais dentro do código
existente. Consumidores MUST depender apenas do que efetivamente usam.

**Justificativa**: acoplamento a implementação concreta transforma qualquer troca — de banco,
de transporte, de estratégia de cálculo — em uma refatoração de escopo aberto, e torna o teste
unitário impossível sem infraestrutura real.

### V. Correção Numérica (NÃO NEGOCIÁVEL)

Toda função de cálculo de S&OP MUST nascer com teste unitário. Nenhuma entra em uso sem um
teste que prove seu resultado para casos representativos, incluindo bordas (zero, negativo,
ausência de dado, divisão por zero, arredondamento).

O tipo numérico de quantidade e de valor MUST ser definido uma vez e usado de forma
consistente em todo o sistema. Grandezas monetárias e de estoque MUST usar precisão exata
(decimal), com escala e política de arredondamento explícitas. Ponto flutuante binário MUST
NOT ser usado para essas grandezas.

Essa precisão MUST ser preservada também no contrato entre serviços. Valores numéricos
sensíveis MUST trafegar de forma que não sofram conversão para ponto flutuante na
serialização — por exemplo, como string de decimal. É proibido qualquer formato de contrato
que reintroduza, na fronteira, o erro que este princípio proíbe dentro dos serviços.

**Justificativa**: um sistema de S&OP existe para produzir números em que a operação confia.
Erro de ponto flutuante em valor e estoque é silencioso, acumulativo e só aparece na
conciliação — quando já custou uma decisão. Uma serialização descuidada anula toda a precisão
mantida internamente.

### VI. Auditabilidade do Dado de Planejamento

Toda alteração em dado de planejamento — previsão, parâmetro, ajuste manual e equivalentes —
MUST registrar autor, data/hora e origem da alteração. "Origem" identifica o caminho pelo qual
a mudança entrou no sistema (ação de usuário, carga automática, recálculo do motor, integração
externa).

O registro de auditoria MUST ser gravado na mesma operação que efetiva a alteração; alteração
sem trilha é um defeito, não uma pendência. A trilha MUST NOT ser editável pelo fluxo normal
da aplicação.

**Justificativa**: o ciclo de S&OP é um processo de decisão colegiado. Sem saber quem mudou o
quê, quando e por qual caminho, não é possível reconciliar versões do plano, explicar um
desvio nem sustentar uma decisão diante de quem a questiona.

### VII. Manutenibilidade e Clareza

Código legível e explícito MUST ter prioridade sobre código esperto. Nomes MUST revelar
intenção — de variável, função, módulo e serviço. Funções MUST fazer uma coisa só.

Consistência vale mais que preferência individual: uma vez adotado um padrão no projeto, ele
MUST ser seguido até que esta constituição, ou a documentação de padrões dela derivada, seja
revista. Divergir de um padrão vigente em uma contribuição isolada MUST NOT ser aceito; o
caminho correto é propor a mudança do padrão.

**Justificativa**: o sistema será mantido por mais tempo do que foi escrito, e por pessoas que
não participaram das decisões originais. Clareza e consistência são o que torna esse custo
previsível.

### VIII. Toda Funcionalidade é Testada (NÃO NEGOCIÁVEL)

Toda funcionalidade entregue MUST ter teste automatizado que prove seu comportamento
observável. O Princípio V cobre a função de cálculo isolada; este princípio estende a
exigência a tudo o mais — casos de uso, regras de processo do ciclo, validações, contratos
entre serviços e caminhos de erro.

- Cada caso de uso MUST ter teste que exercite o fluxo completo do Service, incluindo pelo
  menos um caminho de falha, não apenas o caminho feliz.
- Cada contrato entre serviços MUST ter teste de contrato dos dois lados (Princípio III), de
  forma que uma mudança incompatível quebre a suíte antes de chegar ao ambiente.
- Cada defeito corrigido MUST ganhar um teste de regressão que falhe antes da correção e passe
  depois dela.
- Os testes MUST ser determinísticos e executados automaticamente. Teste que depende de ordem
  de execução, de relógio real, de rede externa ou de estado deixado por outro teste é um
  defeito do teste, não uma característica dele.
- "Testar depois" MUST NOT ser aceito como plano. Funcionalidade sem teste não está pronta,
  independentemente de estar funcionando em ambiente de demonstração.

**Justificativa**: em um sistema de planejamento, o custo de um erro não aparece na hora — ele
aparece na decisão tomada sobre o número errado, semanas depois. A suíte de testes é o que
permite mudar o sistema com confiança ao longo dos ciclos; sem ela, cada alteração vira uma
aposta e o time passa a evitar mexer no que importa.

### IX. Observabilidade desde o Primeiro Momento

Observabilidade MUST ser construída junto com a primeira funcionalidade, nunca adicionada
depois que o sistema já está em produção e já está doendo. Desde o primeiro serviço:

- Todo serviço MUST emitir log estruturado (campos consultáveis, não texto livre) para toda
  operação relevante e todo erro.
- Todo fluxo MUST propagar um identificador de correlação, gerado na borda de entrada e
  repassado através do contrato entre serviços, de modo que orquestração e motor de cálculo
  registrem a mesma operação sob o mesmo identificador.
- Todo erro MUST ser registrado com contexto suficiente para reproduzi-lo — entrada relevante,
  etapa e causa. Segredos, credenciais e dado pessoal MUST NOT ser escritos em log.
- Todo serviço MUST expor sinais mínimos de saúde e de desempenho das suas operações
  principais, incluindo a execução de cálculo do motor.
- Toda execução de cálculo MUST ser rastreável: MUST ser possível determinar quais entradas e
  qual versão da regra produziram um resultado registrado.
- A instrumentação pertence às bordas — Controller e Service. O domínio permanece puro e MUST
  NOT escrever log nem depender de infraestrutura de observabilidade (Princípio I); ele devolve
  resultado ou erro, e quem chamou registra.
- Log MUST NOT ser usado como substituto da trilha de auditoria do Princípio VI: log é
  operacional e descartável; a trilha de auditoria é registro de negócio e permanente.

**Justificativa**: sem observabilidade desde o início, o primeiro incidente sério é
diagnosticado por adivinhação, e a instrumentação acaba sendo enxertada às pressas em código
que não foi feito para recebê-la. Em uma arquitetura multi-serviço, um número errado no plano
só é explicável se for possível seguir a mesma operação atravessando a fronteira entre
orquestração e motor de cálculo.

## Restrições Arquiteturais

Estas restrições complementam os princípios e são igualmente vinculantes.

- **Agnosticismo tecnológico**: esta constituição não escolhe linguagem, framework, ORM,
  banco, protocolo ou fila. O plano de implementação MUST fazer essas escolhas explicitamente
  e demonstrar que elas não violam nenhum princípio.
- **Contrato entre serviços**: o contrato do motor de cálculo MUST ser versionado, documentado
  e verificado por testes de contrato dos dois lados. Mudanças incompatíveis MUST ser
  versionadas, não aplicadas no lugar.
- **Domínio isolado**: o código de domínio MUST ser executável em teste sem banco, sem rede e
  sem servidor de aplicação. Se um teste de domínio precisa de infraestrutura, a camada foi
  violada.
- **Direção das dependências**: Controller → Service → Domínio. O domínio MUST NOT importar
  Service ou Controller. Nenhuma camada MUST depender de detalhe de infraestrutura a não ser
  através de uma abstração declarada.
- **utils sem negócio**: um helper em utils MUST ser explicável sem citar nenhum termo de
  S&OP. Se a explicação exige o vocabulário do negócio, o código pertence ao domínio.
- **Instrumentação nas bordas**: log, métrica e propagação de correlação MUST ficar em
  Controller e Service. O domínio MUST NOT importar nem depender de biblioteca de
  observabilidade, para permanecer testável como função pura (Princípios I e IX).
- **Correlação atravessa a fronteira**: o contrato entre serviços MUST carregar o identificador
  de correlação junto com os dados, desde a primeira versão do contrato.

## Fluxo de Desenvolvimento e Portões de Qualidade

- **Portão de teste**: nenhuma função de cálculo de S&OP é integrada sem teste unitário que
  prove seu resultado (Princípio V). Nenhum contrato entre serviços muda sem teste de contrato
  correspondente.
- **Portão de funcionalidade**: nenhuma funcionalidade é considerada pronta sem teste
  automatizado do caso de uso, incluindo ao menos um caminho de falha, e sem teste de regressão
  quando se tratar de correção de defeito (Princípio VIII).
- **Portão de observabilidade**: toda revisão que introduza uma operação nova MUST verificar
  log estruturado, propagação do identificador de correlação e registro de erro com contexto —
  e MUST recusar instrumentação colocada dentro do domínio (Princípio IX).
- **Portão de camada**: toda revisão de código MUST verificar em qual camada cada trecho novo
  foi colocado, e recusar regra de negócio em Controller, em utils ou no frontend.
- **Portão de fronteira**: toda revisão MUST verificar que nenhum cálculo do motor foi
  reimplementado no serviço de orquestração, e vice-versa.
- **Portão de precisão**: toda revisão que toque em quantidade ou valor MUST verificar o tipo
  numérico usado e a forma como ele atravessa o contrato entre serviços.
- **Portão de auditoria**: toda revisão que toque em dado de planejamento MUST verificar o
  registro de autor, data/hora e origem.
- **Justificativa de complexidade**: qualquer desvio dos princípios MUST ser justificado por
  escrito na revisão, com a alternativa simples considerada e o motivo de sua rejeição.
  Ausência de justificativa é motivo suficiente para recusa.

## Governance

Esta constituição supersede qualquer outra prática, convenção ou preferência do projeto. Em
caso de conflito entre este documento e qualquer guia, template ou hábito estabelecido, este
documento prevalece.

**Emendas**: uma emenda MUST ser proposta por escrito, com a motivação e o impacto sobre os
artefatos existentes (specs, planos, tarefas e código). MUST ser aprovada pelos mantenedores do
projeto antes de entrar em vigor. Emendas que invalidem código existente MUST vir acompanhadas
de um plano de migração com escopo e prazo declarados.

**Versionamento**: esta constituição segue versionamento semântico.

- **MAJOR**: remoção ou redefinição incompatível de princípio ou de regra de governança.
- **MINOR**: novo princípio ou seção, ou expansão material de orientação existente.
- **PATCH**: esclarecimento, correção de redação ou refinamento não semântico.

**Conformidade**: toda revisão de código e toda revisão de plano MUST verificar conformidade
com estes princípios, usando os portões da seção anterior. Uma violação identificada MUST ser
corrigida, ou explicitamente justificada e registrada, antes da integração. Revisões periódicas
de conformidade MUST ocorrer a cada ciclo de planejamento do próprio projeto, e violações
recorrentes MUST ser levadas como proposta de emenda em vez de serem toleradas em silêncio.

**Version**: 1.1.0 | **Ratified**: 2026-08-31 | **Last Amended**: 2026-08-31
