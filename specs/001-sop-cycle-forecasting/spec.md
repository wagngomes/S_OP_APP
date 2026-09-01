# Feature Specification: SOP_APP — Ciclo de S&OP com Previsão Estatística

**Feature Branch**: `001-sop-cycle-forecasting` (diretório da feature; nenhum branch git foi criado — não há hook de git configurado)

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "Construa o SOP_APP, uma aplicação web que gerencia o ciclo de S&OP do usuário, funcionando ao mesmo tempo como (a) um agendador/acompanhamento das etapas do ciclo e (b) uma ferramenta estatística de previsão de demanda a partir de histórico de vendas. O usuário gerencia todo o ciclo dentro de 'cenários': sobe um histórico de vendas em CSV, o sistema calcula a previsão para os meses seguintes, e uma equipe percorre as fases de aprovação, colaboração, consenso e publicação, até a apuração de acuracidade no fim do período."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Da conta à previsão estatística (Priority: P1)

Uma pessoa cria sua conta, entra no sistema e cria um cenário. Sem depender de mais ninguém,
ela importa um CSV com o histórico de vendas, descreve como a Estrutura Comercial está
organizada, escolhe em qual nível ou combinação de níveis quer rodar a previsão, quantos meses
de histórico se usam para o rateio e qual métrica de erro decide o melhor modelo. O sistema valida o arquivo,
agrega o histórico, calcula a previsão para os meses seguintes, escolhe o melhor modelo por
item e devolve o resultado rateado de volta na mesma estrutura do arquivo enviado, mostrando
qual modelo venceu e qual foi o erro de cada item.

**Why this priority**: É o núcleo de valor do produto e a única parte que funciona sozinha.
Sem previsão calculada, não existe o que aprovar, colaborar, consensar, publicar ou apurar —
todas as demais fases operam sobre este resultado. Entregue isolada, esta história já
substitui a planilha de previsão que o usuário usa hoje.

**Independent Test**: Um único usuário, sem equipe, percorre conta → cenário → importação →
parametrização → cálculo e obtém um arquivo de previsão consistente com o histórico enviado.
Verificável de ponta a ponta sem nenhuma das outras histórias.

**Acceptance Scenarios**:

1. **Given** um visitante sem conta, **When** ele se cadastra com e-mail e senha válidos e
   faz login, **Then** ele acessa a área autenticada e pode criar um cenário.
2. **Given** um usuário autenticado com um cenário criado e equipe fechada, **When** ele
   importa um CSV cujas linhas têm todas o mesmo número de segmentos declarado em
   `BU;Setor;CD`, **Then** o sistema aceita o arquivo e informa quantas linhas, itens e meses
   foram reconhecidos.
3. **Given** um CSV em que ao menos uma linha tem número de segmentos diferente dos rótulos
   declarados, **When** o usuário tenta importar, **Then** o sistema recusa o cálculo, lista
   as linhas divergentes com o número da linha e o conteúdo encontrado, e nenhum cálculo é
   executado sobre o arquivo.
4. **Given** um histórico importado e válido, **When** o usuário arrasta um ou mais níveis para
   o campo de agrupamento, informa o número de meses de histórico para rateio e seleciona uma
   métrica de acurácia do catálogo, **Then** o sistema habilita o cálculo.
8. **Given** um histórico importado, **When** o usuário arrasta uma combinação de níveis (por
   exemplo, BU + Setor), **Then** o sistema trata cada combinação distinta de valores desses
   níveis como uma série independente e calcula a previsão sobre ela.
5. **Given** a parametrização completa, **When** o usuário dispara o cálculo, **Then** o
   sistema devolve, para cada item na granularidade original do arquivo (Produto + nível mais
   granular), a previsão de cada mês do horizonte, o modelo estatístico vencedor da sua série
   e o erro desse modelo na métrica escolhida.
6. **Given** o resultado calculado, **When** o usuário soma a previsão rateada de todos os
   itens filhos de uma série agregada, **Then** o total é igual à previsão daquela série
   agregada, dentro da precisão numérica definida.
7. **Given** que o usuário não selecionou a métrica de acurácia, **When** ele tenta disparar o
   cálculo, **Then** o sistema impede o cálculo e indica que a métrica é obrigatória.

---

### User Story 2 - Equipe, papéis e aprovação da previsão (Priority: P2)

O criador do cenário monta a equipe convidando outros usuários e atribuindo papéis
(colaboradores e aprovador), define quem terá a palavra final no consenso e fecha a equipe
para poder avançar. Depois que a previsão é calculada, o aprovador é avisado por e-mail,
revisa os números e aprova — e só a partir daí a colaboração é liberada.

**Why this priority**: É o que transforma a ferramenta de previsão em um processo de S&OP com
responsabilidade definida. Sem papéis e sem o portão de aprovação, a colaboração aconteceria
sobre números que ninguém validou.

**Independent Test**: Com uma previsão já calculada (US1), convidar dois usuários, atribuir
papéis, fechar a equipe, e verificar que o aprovador recebe o aviso, consegue aprovar e que a
colaboração só fica disponível depois da aprovação.

**Acceptance Scenarios**:

1. **Given** um cenário em criação, **When** o criador convida usuários e atribui os papéis de
   colaborador e aprovador, **Then** cada convidado passa a ver o cenário na sua lista com o
   papel atribuído.
2. **Given** um cenário em criação, **When** o criador não indica quem tem a palavra final no
   consenso, **Then** o sistema assume o próprio criador como responsável.
3. **Given** uma equipe montada, **When** o criador fecha a equipe, **Then** o cenário avança
   para a fase de importação e a composição da equipe deixa de ser editável.
4. **Given** um cálculo concluído, **When** o sistema finaliza a previsão, **Then** o aprovador
   recebe um e-mail informando que a previsão está pronta para revisão.
5. **Given** uma previsão pendente de aprovação, **When** um colaborador tenta alterar números,
   **Then** o sistema recusa a ação porque a fase de colaboração ainda não foi liberada.
6. **Given** uma previsão pendente de aprovação, **When** o aprovador aprova, **Then** o
   cenário avança para colaboração e os colaboradores são notificados.
7. **Given** uma previsão pendente de aprovação, **When** o aprovador devolve a previsão com
   um motivo, **Then** o cenário retorna à parametrização e o motivo fica registrado.

---

### User Story 3 - Colaboração com justificativa (Priority: P2)

Liberados pela aprovação, os colaboradores revisam a previsão calculada e, onde discordam,
alteram o número — sempre justificando o motivo. Quem não tem nada a mudar apenas registra seu
"ok". A colaboração pode ser feita dentro da ferramenta ou baixando a planilha do cenário,
preenchendo fora e subindo de volta. Quando todos concluem, a fase é encerrada.

**Why this priority**: É onde entra o conhecimento de mercado que a estatística não captura, e
é a fase que gera o par calculado × colaborado sobre o qual o consenso opera.

**Independent Test**: Com uma previsão aprovada, um colaborador altera itens com motivo pela
tela e outro colaborador faz o mesmo pelo caminho da planilha; ambos concluem e a fase é
encerrada com as duas contribuições registradas.

**Acceptance Scenarios**:

1. **Given** um cenário em colaboração, **When** um colaborador altera o número de um item e
   informa o motivo, **Then** o sistema registra o novo número, o motivo, o autor, a data/hora
   e a origem da alteração, preservando o número calculado original.
2. **Given** um cenário em colaboração, **When** um colaborador tenta alterar um número sem
   informar o motivo, **Then** o sistema recusa a alteração.
3. **Given** um cenário em colaboração, **When** um colaborador baixa a planilha do cenário,
   preenche números e motivos e faz o upload de volta, **Then** o sistema aplica as alterações
   com o mesmo registro de autoria e origem, identificando a origem como planilha.
4. **Given** uma planilha devolvida com estrutura alterada ou itens que não pertencem ao
   cenário, **When** o colaborador faz o upload, **Then** o sistema recusa o arquivo e aponta
   as divergências, sem aplicar nenhuma alteração parcial.
5. **Given** um colaborador que concorda com tudo, **When** ele registra seu "ok" sem alterar
   nada, **Then** sua participação é marcada como concluída.
6. **Given** que todos os colaboradores concluíram, **When** a última conclusão é registrada,
   **Then** a colaboração é encerrada e o cenário avança para consenso.

---

### User Story 4 - Consenso e publicação (Priority: P3)

O responsável definido na criação do cenário define o range de diferença aceitável entre o
número calculado e o número colaborado, ordena os itens pelas maiores divergências para
revisar o que importa primeiro, e decide item a item com qual número seguir. Encerrado o
consenso, a previsão é publicada oficialmente com os números consensados.

**Why this priority**: Fecha o ciclo de decisão e produz o número oficial — o insumo de toda a
apuração posterior. Depende de existir colaboração, por isso vem depois de US3.

**Independent Test**: Com uma colaboração encerrada, definir o range, conferir que a lista
ordena pelas maiores diferenças, decidir alguns itens pelo calculado e outros pelo colaborado,
publicar e verificar que o número publicado é exatamente o consensado.

**Acceptance Scenarios**:

1. **Given** um cenário em consenso, **When** o responsável define o range de diferença
   aceitável, **Then** o sistema destaca os itens cuja diferença entre calculado e colaborado
   está fora do range.
2. **Given** um cenário em consenso, **When** o usuário ordena a lista pela maior diferença,
   **Then** os itens aparecem do maior para o menor desvio entre calculado e colaborado.
3. **Given** um item em consenso, **When** o responsável escolhe seguir com o número calculado,
   com o colaborado ou com um terceiro número justificado, **Then** a decisão fica registrada
   com autor, data/hora e origem.
4. **Given** um usuário que não é o responsável pela palavra final, **When** ele tenta fechar
   uma decisão de consenso, **Then** o sistema recusa a ação.
5. **Given** todos os itens decididos, **When** o responsável publica, **Then** a previsão
   publicada de cada item é igual ao número consensado e o cenário avança para a fase de
   apuração.
6. **Given** uma previsão publicada, **When** qualquer usuário tenta alterar o número
   publicado, **Then** o sistema recusa a alteração.

---

### User Story 5 - Acompanhamento de fase e notificações (Priority: P3)

Todo participante enxerga, a qualquer momento, em que fase cada um dos seus cenários está e o
que se espera dele agora. A cada avanço de fase, os envolvidos recebem um e-mail.

**Why this priority**: É o lado "agendador/acompanhamento" do produto, prometido junto com a
previsão. Sem ele, o ciclo existe no banco mas não na cabeça das pessoas, e o processo para
por falta de aviso.

**Independent Test**: Percorrer as fases de um cenário e verificar, a cada avanço, que a fase
exibida muda para todos os participantes e que o e-mail correspondente é enviado aos
envolvidos.

**Acceptance Scenarios**:

1. **Given** um usuário com vários cenários, **When** ele abre sua lista de cenários, **Then**
   vê a fase atual de cada um sem precisar abrir o cenário.
2. **Given** um cenário que avança de fase, **When** o avanço se efetiva, **Then** os
   participantes envolvidos naquela transição recebem um e-mail identificando o cenário, a
   nova fase e a ação esperada.
3. **Given** uma falha no envio do e-mail, **When** a notificação não pode ser entregue,
   **Then** o avanço de fase permanece válido, a falha é registrada e o sistema tenta
   reenviar.
4. **Given** um cenário em qualquer fase, **When** o usuário o abre, **Then** as ações
   indisponíveis naquela fase aparecem bloqueadas com a razão do bloqueio.

---

### User Story 6 - Apuração de acuracidade realizada (Priority: P4)

Ao fim do período, o usuário sobe as vendas reais na mesma estrutura do histórico. O sistema
compara a previsão publicada com o realizado e apura a acuracidade na dimensão que o usuário
escolher — visão Cia, por BU, por CD, por Produto ou qualquer combinação dos níveis
disponíveis — sempre agregando os dois lados até a dimensão escolhida antes de aplicar a
métrica.

**Why this priority**: É o fechamento do ciclo e a prova de valor do processo, mas só produz
resultado depois de existir previsão publicada e realizado, o que a torna a última a entregar
valor observável.

**Independent Test**: Com uma previsão publicada, subir um arquivo de vendas reais e conferir
que a acuracidade muda conforme a dimensão escolhida, e que o número de cada dimensão é
reproduzível a partir da soma de previsão e realizado naquela dimensão.

**Acceptance Scenarios**:

1. **Given** um cenário publicado, **When** o usuário sobe as vendas reais na mesma estrutura
   do histórico, **Then** o sistema valida o arquivo com o mesmo rigor da importação de
   histórico antes de apurar.
2. **Given** vendas reais carregadas, **When** o usuário escolhe a dimensão de análise e a
   métrica, **Then** o sistema soma previsão publicada e vendas reais até aquela dimensão e só
   então aplica a métrica.
3. **Given** uma mesma base de previsão e realizado, **When** o usuário troca a dimensão de
   análise de Produto para Cia, **Then** o resultado muda e permanece reproduzível: refazer a
   mesma escolha devolve o mesmo número.
4. **Given** itens com venda real sem previsão publicada, ou com previsão sem venda real,
   **When** a apuração é executada, **Then** ambos os casos entram no cálculo conforme a
   definição da métrica e são visíveis ao usuário.
5. **Given** um resultado de apuração, **When** o usuário o compara com o erro de backtest da
   fase de previsão, **Then** o sistema apresenta os dois como grandezas distintas e
   identificadas: acurácia do modelo e acuracidade realizada.

---

### User Story 7 - Dashboards do cenário (Priority: P5)

Depois de importar o histórico e antes de calcular, o usuário abre os dados do cenário e vê a
estatística do que subiu: total de vendas por mês, quantidade de itens únicos, quantidade de
CDs, entre outros. Depois do cálculo, vê passado e futuro na mesma visão — histórico e
previsão juntos.

**Why this priority**: Aumenta muito a confiança no dado antes de calcular e na previsão
depois de calculada, mas nenhuma fase do ciclo depende dela para acontecer. O detalhamento das
visões será refinado depois.

**Independent Test**: Com um histórico importado, abrir o dashboard e conferir os totais contra
o arquivo de origem; depois do cálculo, conferir que a mesma visão passa a exibir a série
histórica seguida da série prevista.

**Acceptance Scenarios**:

1. **Given** um histórico importado, **When** o usuário abre os dados do cenário, **Then** vê
   o total de vendas por mês, a contagem de itens únicos e a contagem de pontos de distribuição
   reconhecidos no arquivo.
2. **Given** um cálculo concluído, **When** o usuário abre a visão consolidada, **Then** vê a
   série histórica e a série prevista na mesma escala temporal, distinguindo passado de futuro.

---

### Edge Cases

**Importação e estrutura**

- Linha do CSV com mais ou menos segmentos que os rótulos declarados: importação bloqueada,
  linhas divergentes listadas, nenhum cálculo executado.
- Rótulos de segmentação declarados em quantidade diferente da encontrada na maioria das
  linhas, ou rótulos repetidos entre si.
- Arquivo cujo delimitador de coluna colide com o separador de segmentos.
- Arquivo vazio, sem cabeçalho, com colunas faltantes ou com colunas em ordem inesperada.
- Linhas duplicadas para a mesma combinação de produto, estrutura, mês e ano.
- Mês ou ano inválidos, fora de faixa ou em formato inesperado.
- Quantidade negativa (devolução) ou não numérica.
- Meses ausentes no meio da série de um item.
- Arquivo muito grande: o usuário precisa saber que a importação está em andamento e o que
  fazer se ela falhar no meio.

**Parametrização e cálculo**

- Combinação de níveis arrastada que já reproduz a granularidade original do arquivo: não há o
  que ratear.
- Combinação de níveis que gera um número muito grande de séries, cada uma com pouquíssimo
  histórico.
- Campo de agrupamento deixado vazio, ou com o mesmo nível arrastado duas vezes.
- Usuário pede mais meses de histórico para rateio do que existem no arquivo.
- Série com histórico curto demais para o backtest de um ou de todos os modelos candidatos.
- Item que aparece no histórico apenas nos meses mais antigos e desapareceu.
- Item novo, presente no arquivo com poucos ou nenhum ponto de história.
- Série cujo total no período de rateio é zero: não há representatividade para ratear.
- Empate entre modelos candidatos na métrica escolhida.
- Métrica indefinida para o item (por exemplo, denominador zero).
- Cálculo disparado duas vezes para o mesmo cenário, ou disparado enquanto outro está em
  andamento.
- Falha no meio do cálculo: o cenário não pode ficar com resultado parcial visível como se
  fosse completo.

**Equipe e fases**

- Convite para um e-mail que ainda não tem conta no sistema.
- Cenário sem aprovador definido no momento em que o cálculo termina.
- Aprovador que também é colaborador.
- Criador que deixa de participar, ou remoção do único aprovador.
- Tentativa de executar uma ação de uma fase que já passou ou que ainda não chegou.
- Tentativa de reabrir a equipe depois de fechada.

**Colaboração e consenso**

- Dois colaboradores alterando o mesmo item ao mesmo tempo.
- Colaborador que nunca conclui, travando o encerramento da fase.
- Planilha devolvida com linhas removidas, adicionadas ou com identificadores alterados.
- Planilha devolvida de uma versão anterior do cenário.
- Alteração colaborada com valor negativo ou absurdamente distante do calculado.
- Range de consenso definido como zero, negativo ou maior que qualquer diferença existente.
- Item sem nenhuma alteração colaborada chegando ao consenso.

**Apuração**

- Vendas reais com produtos ou estruturas que não existiam no histórico.
- Vendas reais de um mês fora do horizonte publicado.
- Apuração disparada antes de existir qualquer venda real carregada.
- Venda real igual a zero em métrica cujo denominador é o realizado.
- Reenvio das vendas reais do mesmo mês: substituição ou acúmulo precisa ser inequívoca.

## Requirements *(mandatory)*

### Functional Requirements

**Conta e acesso**

- **FR-001**: O sistema MUST permitir que um visitante crie uma conta com e-mail e senha.
- **FR-002**: O sistema MUST autenticar o usuário por e-mail e senha antes de dar acesso a
  qualquer cenário.
- **FR-003**: O sistema MUST impedir o cadastro de duas contas com o mesmo e-mail.
- **FR-004**: O sistema MUST permitir que o usuário recupere o acesso em caso de esquecimento
  de senha.
- **FR-005**: O sistema MUST restringir a visualização e a ação em um cenário exclusivamente
  aos seus participantes.

**Cenário, equipe e papéis**

- **FR-006**: Usuários autenticados MUST poder criar cenários.
- **FR-007**: O sistema MUST atribuir a cada cenário um identificador único e estável.
- **FR-008**: Cada cenário MUST contemplar as oito fases do ciclo, na ordem: criação e
  montagem da equipe; importação e parametrização; cálculo; aprovação; colaboração; consenso;
  publicação; apuração de acuracidade.
- **FR-009**: O criador MUST poder convidar outros usuários para o cenário e atribuir a cada um
  o papel de colaborador ou de aprovador.
- **FR-010**: O sistema MUST reconhecer três papéis com direitos distintos: criador (monta a
  equipe, parametriza e conduz o processo), colaborador (participa da fase de colaboração) e
  aprovador (aprova a previsão calculada para liberar a colaboração).
- **FR-011**: Na criação do cenário, o criador MUST poder definir quem terá a palavra final no
  consenso: ele mesmo ou o aprovador.
- **FR-012**: Se a palavra final não for definida, o sistema MUST assumir o criador como
  responsável.
- **FR-013**: O criador MUST poder "fechar a equipe", e o sistema MUST exigir esse fechamento
  antes de liberar a importação do histórico.
- **FR-014**: Após o fechamento da equipe, o sistema MUST impedir alteração da composição da
  equipe e dos papéis no cenário.
- **FR-015**: O sistema MUST exigir ao menos um aprovador definido antes de permitir o
  fechamento da equipe.
- **FR-016**: O sistema MUST impedir qualquer ação que não pertença à fase atual do cenário,
  informando ao usuário a razão do bloqueio.
- **FR-017**: O sistema MUST registrar cada transição de fase com autor, data/hora e origem.
- **FR-018**: O sistema MUST permitir que um convite seja enviado a um e-mail ainda sem conta,
  vinculando a participação assim que a conta for criada.

**Importação do histórico e validação**

- **FR-019**: O criador MUST poder importar um arquivo CSV de histórico de vendas com as
  colunas Código do Produto, Estrutura Comercial, Quantidade faturada, Mês e Ano.
- **FR-020**: O sistema MUST interpretar a Estrutura Comercial como uma lista de segmentações
  separadas por ponto e vírgula, com número variável de posições.
- **FR-021**: Na importação, o usuário MUST declarar o layout da Estrutura Comercial nomeando
  cada posição, separado por ponto e vírgula.
- **FR-022**: Os rótulos declarados MUST definir os níveis de segmentação do cenário, usados
  em todas as fases seguintes.
- **FR-023**: O sistema MUST validar que toda linha do arquivo tem exatamente o mesmo número de
  segmentos que os rótulos declarados.
- **FR-024**: Havendo qualquer linha divergente, o sistema MUST avisar o usuário identificando
  as linhas e MUST NOT executar cálculo sobre o arquivo.
- **FR-025**: O sistema MUST recusar arquivos com colunas obrigatórias ausentes, informando
  quais faltam.
- **FR-026**: O sistema MUST validar que Quantidade, Mês e Ano são numericamente válidos e que
  Mês e Ano formam um período possível.
- **FR-027**: O sistema MUST informar ao usuário, após uma importação aceita, o total de linhas
  reconhecidas, o número de itens únicos e o intervalo de meses coberto.
- **FR-028**: O sistema MUST consolidar linhas duplicadas da mesma combinação de produto,
  estrutura, mês e ano somando as quantidades, e MUST informar ao usuário quantas duplicidades
  foram consolidadas.
- **FR-029**: O sistema MUST preservar o arquivo importado e sua parametrização como o insumo
  rastreável do cálculo.
- **FR-030**: O sistema MUST permitir substituir o histórico importado enquanto o cenário não
  tiver avançado para a fase de cálculo.

**Parametrização**

- **FR-031**: O sistema MUST oferecer, para escolha do agrupamento da previsão,
  exatamente os rótulos declarados pelo usuário na importação.
- **FR-032**: O usuário MUST poder definir o agrupamento arrastando um ou mais níveis
  declarados para o campo de agrupamento, formando uma combinação (por exemplo, BU + Setor).
- **FR-032a**: O sistema MUST agregar o histórico pela combinação escolhida, tratando cada
  combinação distinta de valores dos níveis selecionados como uma série independente.
- **FR-032b**: O sistema MUST impedir que o mesmo nível seja arrastado mais de uma vez para o
  campo de agrupamento.
- **FR-032c**: O sistema MUST exigir ao menos um nível no campo de agrupamento antes de
  permitir o cálculo.
- **FR-032d**: Quando a combinação escolhida já corresponder à granularidade original do
  arquivo, o sistema MUST calcular sem ratear e MUST informar isso ao usuário.
- **FR-033**: O sistema MUST permitir que o usuário informe quantos meses de histórico serão
  considerados no rateio.
- **FR-034**: O sistema MUST validar que o número de meses informado para rateio não excede o
  histórico disponível.
- **FR-034a**: Antes do disparo do cálculo, o sistema MUST informar ao usuário quantas séries
  distintas a combinação de níveis escolhida produz, porque é esse número — e não o número de
  linhas — que determina o custo do cálculo.
- **FR-034b**: O usuário MUST selecionar um pacote de modelos entre Rápido, Standard e Completo.
- **FR-034c**: O sistema MUST apresentar, para cada pacote, a contrapartida entre profundidade
  de análise e tempo de cálculo, de modo que a escolha seja informada.
- **FR-034d**: O sistema MUST estimar e exibir a ordem de grandeza do tempo de cálculo para a
  combinação de níveis e o pacote escolhidos, antes do disparo.
- **FR-035**: O sistema MUST exigir que o usuário selecione uma métrica de acurácia do catálogo
  antes de permitir o cálculo.
- **FR-036**: O sistema MUST manter um catálogo de métricas de acuracidade que inclua ao menos
  WMAPE, MAPE e viés.
- **FR-036a**: O sistema MUST adotar WMAPE como métrica padrão e MUST avisar o usuário quando
  ele escolher uma métrica indefinida para parte relevante das séries do cenário — em especial
  MAPE em cenário com alta proporção de meses zerados.
- **FR-037**: O sistema MUST usar o mesmo catálogo de métricas na fase de previsão e na
  apuração de acuracidade final.
- **FR-038**: O sistema MUST permitir alterar a parametrização e recalcular enquanto o cenário
  não tiver sido aprovado.

**Cálculo da previsão**

- **FR-039**: O sistema MUST agregar o histórico até a combinação de níveis escolhida antes de
  calcular.
- **FR-040**: O sistema MUST calcular a previsão para os meses seguintes ao último mês do
  histórico, cobrindo o horizonte definido para o cenário.
- **FR-040a**: A previsão de venda MUST NOT ser negativa: o piso de qualquer número previsto é
  zero.
- **FR-040b**: O piso zero MUST ser aplicado à série agregada antes do rateio, para não quebrar
  a conservação de soma exigida por FR-046.
- **FR-040c**: Quantidades negativas no histórico (devolução) MUST continuar sendo aceitas e
  consideradas na agregação; o piso zero se aplica ao resultado previsto, não à entrada.
- **FR-040d**: O sistema MUST preencher com zero os meses ausentes no interior da série de um
  item e MUST NOT preencher os meses anteriores à sua primeira venda, para não ensinar ao modelo
  uma demanda zero que nunca existiu.
- **FR-041**: Para cada série da combinação de agrupamento, o sistema MUST avaliar os modelos
  candidatos por backtest sobre o histórico.
- **FR-042**: O sistema MUST selecionar, para cada série, o modelo com melhor desempenho na
  métrica escolhida pelo usuário.
- **FR-043**: O catálogo de modelos candidatos MUST ser definido no plano de implementação, a
  partir da capacidade da biblioteca de previsão escolhida, e MUST ser documentado de forma
  explícita antes do primeiro cálculo em produção.
- **FR-043d**: O catálogo MUST ser organizado em três pacotes cumulativos — Rápido, Standard e
  Completo — em que cada pacote acrescenta modelos e profundidade de validação ao anterior, ao
  custo de tempo de cálculo.
- **FR-043e**: A profundidade de validação de cada pacote (número de janelas de backtest e
  horizonte por janela) MUST ser fixa, documentada e versionada junto com o catálogo, porque é
  ela que determina qual modelo vence cada série.
- **FR-043a**: O sistema MUST registrar, para cada série calculada, quais modelos do catálogo
  foram avaliados e qual venceu, de modo que o resultado seja explicável sem reexecutar o
  cálculo.
- **FR-043b**: O sistema MUST tratar de forma explícita as séries em que nenhum modelo do
  catálogo é aplicável — por exemplo, por histórico insuficiente para o backtest — informando o
  usuário em vez de omitir o item do resultado.
- **FR-043c**: A troca ou a ampliação do catálogo de modelos MUST NOT alterar retroativamente o
  resultado de uma execução de previsão já registrada.
- **FR-044**: O sistema MUST devolver o resultado na mesma estrutura do arquivo importado,
  rateando a previsão de cada série agregada até a granularidade original (Produto + nível mais
  granular).
- **FR-045**: O rateio MUST usar a representatividade histórica de cada item filho dentro do
  número de meses escolhido pelo usuário.
- **FR-046**: A soma das previsões rateadas dos filhos de uma série MUST ser igual à previsão
  daquela série, dentro da precisão numérica definida para o sistema.
- **FR-047**: O sistema MUST definir e aplicar um comportamento explícito para séries cuja
  representatividade no período de rateio é zero.
- **FR-048**: O resultado MUST informar, por item, o modelo vencedor e o erro desse modelo na
  métrica escolhida.
- **FR-049**: O sistema MUST identificar esse erro como acurácia do MODELO, medida por backtest
  sobre o histórico, distinguindo-a explicitamente da acuracidade realizada.
- **FR-050**: O sistema MAY exibir as demais métricas por item para transparência, sem que
  isso altere a escolha do modelo, que MUST ser decidida pela métrica selecionada.
- **FR-051**: O sistema MUST impedir dois cálculos simultâneos para o mesmo cenário.
- **FR-052**: Em caso de falha no cálculo, o sistema MUST NOT apresentar resultado parcial como
  concluído, e MUST informar a falha ao usuário.

**Aprovação**

- **FR-053**: Ao concluir o cálculo, o sistema MUST enviar e-mail ao aprovador avisando que a
  previsão está pronta.
- **FR-054**: O aprovador MUST poder revisar a previsão calculada antes de decidir.
- **FR-055**: Ao aprovar, o sistema MUST avançar o cenário para colaboração e liberar os
  colaboradores.
- **FR-056**: O aprovador MUST poder devolver a previsão com um motivo registrado, retornando o
  cenário à parametrização.

**Colaboração**

- **FR-057**: Colaboradores MUST poder alterar o número calculado de um item durante a fase de
  colaboração.
- **FR-058**: O sistema MUST exigir um motivo para cada alteração e MUST recusar alterações sem
  motivo.
- **FR-059**: O sistema MUST preservar o número calculado original ao lado do número colaborado.
- **FR-060**: O sistema MUST oferecer a colaboração dentro da ferramenta e também pelo caminho
  de baixar a planilha do cenário, preencher e fazer upload de volta.
- **FR-061**: O sistema MUST aplicar as alterações vindas da planilha com o mesmo registro de
  autor, data/hora e motivo, identificando a origem como planilha.
- **FR-062**: O sistema MUST validar a planilha devolvida contra o cenário e MUST recusar
  integralmente arquivos com estrutura alterada ou itens estranhos ao cenário, sem aplicação
  parcial.
- **FR-063**: Um colaborador MUST poder concluir sua participação sem alterar nenhum número.
- **FR-064**: O sistema MUST encerrar a colaboração quando todos os colaboradores tiverem
  concluído.
- **FR-065**: O criador MUST poder encerrar a colaboração mesmo com participações pendentes,
  registrando quem não concluiu.
- **FR-066**: Todo colaborador MUST enxergar e poder editar o cenário inteiro; não há recorte
  da estrutura comercial por colaborador.
- **FR-066a**: O sistema MUST resolver de forma determinística a edição concorrente do mesmo
  item por dois colaboradores, preservando ambas as contribuições no histórico de alterações e
  deixando inequívoco qual número está valendo e quem o definiu.
- **FR-066b**: O sistema MUST avisar o colaborador quando o item que ele está editando tiver
  sido alterado por outra pessoa depois que ele abriu a tela.
- **FR-066c**: Quando uma planilha devolvida contiver itens já alterados por outro colaborador
  após a geração daquela planilha, o sistema MUST sinalizar esses itens ao autor do upload
  antes de aplicar as alterações.

**Consenso**

- **FR-067**: O responsável definido na criação MUST poder definir o range de diferença
  aceitável entre o número calculado e o número colaborado.
- **FR-068**: O sistema MUST sinalizar os itens cuja diferença está fora do range definido.
- **FR-069**: A tela de consenso MUST permitir classificar os itens pelas maiores diferenças
  entre calculado e colaborado.
- **FR-070**: O sistema MUST permitir decidir, item a item, com qual número seguir.
- **FR-071**: A decisão final de cada item MUST ser exclusiva do responsável definido na
  criação do cenário.
- **FR-072**: O sistema MUST registrar cada decisão de consenso com autor, data/hora, origem e
  o número escolhido.
- **FR-073**: O sistema MUST impedir o avanço para publicação enquanto houver item sem decisão.

**Publicação**

- **FR-074**: Com o consenso finalizado, o responsável MUST poder publicar oficialmente a
  previsão.
- **FR-075**: O número publicado de cada item MUST ser exatamente o número consensado final.
- **FR-076**: O sistema MUST tornar a previsão publicada imutável.
- **FR-077**: O sistema MUST preservar, após a publicação, o número calculado, o colaborado e o
  consensado de cada item para consulta posterior.

**Apuração de acuracidade**

- **FR-078**: O usuário MUST poder subir as vendas reais do período na mesma estrutura do
  histórico: Código do Produto, Estrutura Comercial, Quantidade, Mês e Ano.
- **FR-079**: O sistema MUST validar o arquivo de vendas reais com o mesmo rigor da importação
  de histórico, incluindo a conferência do número de segmentos.
- **FR-080**: O sistema MUST calcular a acuracidade realizada comparando a previsão publicada
  com as vendas reais.
- **FR-081**: O sistema MUST apresentar a acuracidade realizada como grandeza distinta da
  acurácia do modelo apurada na fase de previsão.
- **FR-082**: O usuário MUST poder escolher a dimensão de análise da apuração: visão Cia sem
  segmentação, por qualquer nível declarado, por Produto, ou qualquer combinação dos níveis
  disponíveis.
- **FR-083**: A apuração MUST sempre agregar e MUST NUNCA ratear: previsão publicada e vendas
  reais são somadas até a dimensão escolhida antes de a métrica ser aplicada.
- **FR-084**: O usuário MUST poder escolher qual métrica do catálogo usar na apuração.
- **FR-085**: O sistema MUST tratar de forma explícita e visível os itens com venda real sem
  previsão e com previsão sem venda real.
- **FR-086**: O sistema MUST definir o comportamento da métrica quando o denominador é zero.
- **FR-087**: A apuração MUST ser reproduzível: a mesma base, dimensão e métrica devolvem
  sempre o mesmo resultado.
- **FR-088**: O sistema MUST deixar inequívoco se um novo upload de vendas reais do mesmo mês
  substitui ou acumula o anterior.

**Dashboards**

- **FR-089**: Após a importação e antes do cálculo, o usuário MUST poder ver um dashboard com a
  estatística do histórico importado.
- **FR-090**: Esse dashboard MUST incluir ao menos o total de vendas por mês, a quantidade de
  itens únicos e a quantidade de pontos de distribuição.
- **FR-091**: Após o cálculo, o usuário MUST poder ver uma visão que une histórico e previsão
  na mesma escala temporal, distinguindo passado de futuro.
- **FR-092**: O detalhamento adicional das visões MUST ser tratado como refinamento posterior,
  sem bloquear as demais fases.

**Notificações e acompanhamento**

- **FR-093**: O sistema MUST enviar e-mail aos envolvidos a cada avanço de fase do cenário.
- **FR-094**: O e-mail MUST identificar o cenário, a nova fase e a ação esperada do
  destinatário.
- **FR-095**: O frontend MUST exibir a fase atual de cada cenário na lista de cenários do
  usuário.
- **FR-096**: O sistema MUST manter o avanço de fase válido mesmo se a notificação falhar, e
  MUST registrar a falha e tentar reenviar.
- **FR-097**: O sistema MUST indicar ao usuário, dentro do cenário, o que se espera dele na
  fase atual.
- **FR-098**: O sistema MUST notificar o aprovador na conclusão do cálculo e os colaboradores
  na aprovação.

**Integridade, auditoria e precisão** *(derivados da constituição do projeto)*

- **FR-099**: Toda alteração em dado de planejamento — previsão, parâmetro e ajuste manual —
  MUST registrar autor, data/hora e origem.
- **FR-100**: O registro de auditoria MUST ser gravado na mesma operação que efetiva a
  alteração e MUST NOT ser editável pelo fluxo normal da aplicação.
- **FR-101**: Quantidades e valores MUST usar precisão exata, com escala e política de
  arredondamento explícitas, sem erro de ponto flutuante.
- **FR-102**: A precisão numérica MUST ser preservada em toda troca de dados interna ao
  sistema, sem conversão que reintroduza erro de ponto flutuante.
- **FR-103**: Todo cálculo, validação e decisão de S&OP MUST ocorrer no lado servidor; o
  frontend MUST NOT calcular números de negócio.
- **FR-104**: Toda execução de previsão MUST ser rastreável até as entradas e a parametrização
  que a produziram.

### Key Entities

- **Usuário**: pessoa com conta identificada por e-mail; cria cenários e participa de cenários
  de outros.
- **Cenário**: unidade que contém um ciclo completo de S&OP; tem identificador único, fase
  atual, equipe, parametrização, responsável pela palavra final e todos os artefatos das fases.
- **Participação**: vínculo entre usuário e cenário com um papel (criador, colaborador,
  aprovador) e o estado da sua contribuição.
- **Layout de segmentação**: os rótulos declarados na importação que nomeiam cada posição da
  Estrutura Comercial e definem os níveis de segmentação do cenário.
- **Registro de histórico**: linha do arquivo importado — produto, estrutura comercial
  segmentada, quantidade, mês e ano.
- **Parametrização**: combinação de níveis de agrupamento escolhida, número de meses de histórico para rateio
  e métrica de acurácia selecionada.
- **Série agregada**: conjunto do histórico somado até a combinação de agrupamento, sobre o qual o
  cálculo é feito.
- **Execução de previsão**: um cálculo completo de um cenário, com suas entradas, sua
  parametrização, seu instante e seu resultado.
- **Previsão por item**: número previsto para um item na granularidade original, por mês, com o
  modelo vencedor e o erro na métrica escolhida.
- **Modelo estatístico**: candidato avaliado por backtest; cada série tem um vencedor.
- **Métrica de acuracidade**: item do catálogo (WMAPE, MAPE, viés e outros), usado tanto no
  backtest quanto na apuração realizada.
- **Ajuste de colaboração**: número colaborado para um item, com motivo, autor, data/hora e
  origem (tela ou planilha).
- **Decisão de consenso**: número escolhido para um item na fase de consenso, com autor e
  registro da diferença em relação ao calculado e ao colaborado.
- **Previsão publicada**: número oficial e imutável de cada item após a publicação.
- **Venda real**: quantidade realizada por produto, estrutura, mês e ano, carregada para a
  apuração.
- **Apuração de acuracidade**: resultado da comparação entre previsão publicada e venda real,
  em uma dimensão de análise e uma métrica escolhidas.
- **Registro de auditoria**: autor, data/hora e origem de cada alteração em dado de
  planejamento e de cada transição de fase.
- **Notificação**: aviso enviado aos envolvidos a cada avanço de fase, com seu estado de
  entrega.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um usuário novo consegue ir do cadastro à primeira previsão calculada em menos de
  15 minutos, sem ajuda externa.
- **SC-002**: 100% das linhas com número de segmentos divergente dos rótulos declarados são
  apontadas ao usuário antes de qualquer cálculo, e nenhum cálculo é executado sobre um arquivo
  com divergência.
- **SC-003**: A soma da previsão rateada dos itens filhos é igual à previsão da série agregada
  em 100% das séries, com diferença zero dentro da precisão definida.
- **SC-004**: A previsão de um cenário com até 2.000 séries no pacote Standard fica pronta em
  até 10 minutos, com o usuário informado do andamento durante todo o processamento. O custo é
  medido em séries, não em linhas, porque é o número de séries — decidido pela combinação de
  níveis escolhida — que multiplica o trabalho de modelagem.
- **SC-004a**: Antes de disparar o cálculo, o usuário sabe quantas séries sua combinação produz
  e qual a ordem de grandeza do tempo esperado, sem precisar disparar para descobrir.
- **SC-005**: 100% das alterações feitas na colaboração possuem motivo registrado.
- **SC-006**: 100% das alterações em dado de planejamento e das transições de fase possuem
  autor, data/hora e origem recuperáveis.
- **SC-007**: Um participante identifica a fase atual de qualquer um dos seus cenários em uma
  única tela, sem abrir o cenário.
- **SC-008**: 95% dos e-mails de avanço de fase são entregues em até 5 minutos após a transição.
- **SC-009**: Na tela de consenso, o responsável localiza os itens de maior divergência em uma
  única ação de ordenação.
- **SC-010**: A apuração é reproduzível: repetir a mesma dimensão e métrica sobre a mesma base
  devolve exatamente o mesmo resultado em 100% das execuções.
- **SC-011**: O modelo escolhido por item tem erro menor ou igual ao de uma previsão ingênua
  (repetição do último período) em pelo menos 80% das séries com histórico suficiente.
- **SC-012**: Nenhum número de negócio exibido ao usuário é calculado fora do servidor,
  verificável por inspeção da aplicação.
- **SC-013**: 90% dos usuários concluem um ciclo completo, da importação à publicação, sem
  abrir chamado de suporte.
- **SC-014**: A troca da dimensão de análise na apuração devolve resultado em menos de 5
  segundos para o volume típico de um cenário.

## Assumptions

**Escopo e produto**

- O SOP_APP é uma aplicação web acessada por navegador; aplicativo móvel nativo está fora de
  escopo nesta feature.
- Um cenário representa **um** ciclo de S&OP: uma previsão calculada, uma publicação e a
  apuração do período publicado. Um novo ciclo é um novo cenário; a previsão publicada não é
  reaberta para replanejamento.
- O horizonte de previsão (quantos meses à frente) é um parâmetro do cenário definido na
  parametrização, com valor padrão de 12 meses.
- A apuração de acuracidade pode ser executada mais de uma vez ao longo do horizonte
  publicado, à medida que as vendas reais de cada mês vão sendo carregadas.
- A interface é em português.

**Dados e importação**

- A ordem dos rótulos declarados na Estrutura Comercial representa a hierarquia do mais
  abrangente para o mais granular (por exemplo, `BU;Setor;CD`). É essa ordem que define o que é
  um nível "mais alto" ou "mais baixo" no agrupamento e no rateio.
- O delimitador de colunas do CSV é distinto do ponto e vírgula usado dentro da Estrutura
  Comercial; o sistema valida essa distinção na importação.
- O par Mês/Ano identifica o período; a granularidade temporal do sistema é mensal.
- Quantidades negativas são aceitas como devolução e entram na agregação pelo seu valor.
- O nível mais granular do resultado é a combinação do Código do Produto com o nível mais
  granular declarado (por exemplo, Produto + CD).
- O agrupamento da previsão aceita uma combinação de níveis, simétrico à dimensão de análise da
  apuração. Quanto mais níveis na combinação, mais próxima da granularidade original é a série
  e menos rateio ocorre.

**Modelos estatísticos**

- O catálogo de modelos candidatos não é fixado por esta especificação: ele será definido no
  plano, a partir da biblioteca de previsão escolhida. A especificação exige apenas que o
  catálogo seja explícito, documentado, rastreável por execução e estável em relação a
  execuções já registradas (FR-043 a FR-043c), e organizado nos três pacotes de FR-043d.
- A previsão nunca é negativa (FR-040a). O histórico continua aceitando devolução; o piso zero
  é aplicado ao resultado da série agregada, antes do rateio, para preservar a conservação de
  soma.
- Séries com histórico insuficiente para a profundidade de validação do pacote escolhido caem
  automaticamente para a maior configuração viável e são sinalizadas, em vez de ficarem de fora
  do resultado.
- A escolha do modelo vencedor de cada série é sempre decidida pela métrica que o usuário
  selecionou antes do cálculo, qualquer que seja o catálogo.

**Processo**

- O aprovador pode devolver a previsão para nova parametrização; a descrição original previa
  apenas a aprovação, mas um ciclo sem caminho de recusa deixaria o cenário travado quando o
  aprovador discorda.
- O criador pode encerrar a colaboração mesmo com colaboradores pendentes, para que um
  participante ausente não trave o ciclo; quem não concluiu fica registrado.
- Um usuário pode acumular papéis no mesmo cenário (por exemplo, aprovador e colaborador).
- Somente participantes de um cenário enxergam seus dados.
- Não há recorte de colaboração: todo colaborador enxerga e edita o cenário inteiro. Como isso
  torna a edição concorrente do mesmo item possível, a especificação exige tratamento
  determinístico e aviso de alteração concorrente (FR-066a a FR-066c).

**Governança**

- Esta especificação segue a constituição do projeto em
  [.specify/memory/constitution.md](../../.specify/memory/constitution.md) v1.1.0. Dela vêm as
  exigências de precisão numérica exata, auditabilidade, regra de negócio no servidor,
  cobertura de testes e observabilidade — refletidas nos requisitos FR-099 a FR-104.
- A separação entre serviço de orquestração e motor de cálculo é uma decisão de arquitetura já
  fixada pela constituição; a forma concreta dessa separação pertence ao plano, não a esta
  especificação.

**Dependências**

- Entrega de e-mail depende de um serviço de envio disponível ao sistema; a escolha desse
  serviço pertence ao plano.
- O catálogo inicial de métricas de acuracidade contempla ao menos WMAPE, MAPE e viés, com
  definição matemática documentada e comportamento explícito para denominador zero.
