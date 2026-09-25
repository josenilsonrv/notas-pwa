# Problemas encontrados na suíte e mitigações (por fase)

> **Regra**: sempre que a suíte (`node tests/run-all.cjs --baseline`) acusar **falha nova**
> ou **flakiness** durante uma fase, o sintoma, a causa e a correção ficam registrados aqui.
> Objetivo: não repetir o mesmo erro nas fases/seções seguintes.
> Comandos de referência: `docs/COMO-RODAR-TESTES.md`.

---

## F0 — Fundação e isolamento (área “Mapa Mental”)

### P1 — Aba do seletor inclicável (clique interceptado pelo modal)
- **Sintoma**: `tests/mapa_area.cjs` falhava com `TimeoutError`:
  `<div id="notesModalBackdrop" class="notes-drawer active"> intercepts pointer events` ao clicar em “Mapa Mental”.
- **Causa**: `theme-origem.css` define `#notesModalBackdrop.active { z-index: 2300; }`; o seletor estava em `z-index: 1100`.
- **Correção**: `.app-areas { z-index: 2400; }`.
- **Mitigação p/ novas fases**: qualquer elemento clicável da área do mapa precisa de
  **`z-index > 2300`** para ficar acima do modal de notas ativo. Preferir `position: fixed`
  para não entrar no fluxo do modal (preserva `parity_visual`).

### P2 — `parity_visual.cjs` “flaky” sob carga (altura do toolbar)
- **Sintoma**: `run-all --baseline` marcou `REGRESSAO (parity_visual.cjs)` com divergência real
  `#notesToolbar height 103px vs 61px`.
- **Investigação**: isolado passa (`divergências reais: 0`) e, na suíte reexecutada, também passa.
  O helper `tests/helpers/parity.cjs` espera **250 ms fixos** antes de ler os estilos — com a CPU
  carregada o toolbar ainda não assentou.
- **Causa**: flakiness pré-existente de sincronização (o harness de paridade nem carrega `mapa/*`).
- **Mitigação**: rodar a suíte com **`--retry=1`** e com a máquina limpa
  (`Get-Process msedge,node | Stop-Process -Force` antes). Antes de “corrigir” uma divergência de
  `#notesToolbar height`, **rodar `parity_visual.cjs` isolado** para confirmar que é real.

### P3 — Service Worker servindo asset obsoleto
- **Sintoma (prevenido)**: o SW é offline-first; sem trocar o `CACHE_NAME`, quem já instalou
  continua com o `mapa.js` antigo (área do mapa desatualizada/offline quebrado).
- **Mitigação**: **sempre** que assets cacheados mudarem, **incrementar `CACHE_NAME`** e incluir
  os novos caminhos em `ESSENCIAIS`. Histórico: v19 → **v20** (F0) → **v21** (F1).

---

## F1 — Gestão de mapas

**Suíte**: `node tests/run-all.cjs --baseline --retry=1` → `PASSOU 31 / FALHOU 12 (conhecidas) /
N/A 1 / TOTAL 44` → **SEM REGRESSÕES** (0 falhas novas). `parity_visual` e `shortcuts` verdes.

### P4 — Formulário inline não disparava `submit`
- **Sintoma (durante o desenvolvimento)**: clicar em “Confirmar” não criava/renomeava nada; nenhum erro no console.
- **Causa**: o contêiner do formulário era um `<div>` com um `<button type="submit">` — botão `submit`
  dentro de `<div>` **não** dispara o evento `submit`.
- **Correção**: `#mapaForm` agora é um `<form>` real (`mapa/mapa-render.js`), e a delegação usa
  `secao.addEventListener('submit', …)` (o evento `submit` borbulha).
- **Mitigação p/ novas fases**: qualquer formulário inline novo (F3 terá edição de nó) deve ser um
  `<form>` de verdade; `change`/`input` também borbulham e podem usar a mesma delegação na seção.

### P5 — Pré-preenchimento usava o mapa ABERTO, não o ALVO da ação
- **Sintoma (durante o desenvolvimento)**: “Renomear” abria o campo vazio quando o mapa estava na lista.
- **Causa**: `renderForm` recebia `dados.mapaAberto`, que é `null` na visão de lista (a lista é a
  visão padrão), embora a ação tenha um `data-mapa-id` específico.
- **Correção**: em `renderArea()` o alvo é resolvido por `acao.id` (`MapaMentalStore.obterResumo(acao.id)`),
  com `dados.mapaAberto` apenas como fallback.
- **Mitigação p/ novas fases**: ações que operam sobre um item sempre devem resolver o alvo por **ID**
  (o estado da tela pode não ser o do item), nunca presumir que o item está aberto.

---

## F2 — Canvas infinito

**Suíte**: `node tests/run-all.cjs --baseline --retry=1` → **SEM REGRESSÕES** (0 falhas novas);
`parity_structure`, `parity_visual` e `shortcuts` verdes; `mapa_area`, `mapa_gestao` e `mapa_canvas` verdes.

### P6 — Asserção errada de zoom: “manter o ponto sob o ponteiro” ≠ “x/y inalterado”
- **Sintoma**: `mapa_canvas.cjs` falhava em `Ctrl+scroll mantém o foco perto do ponteiro`
  (`assert.ok(perto(depoisRoda.x, antesRoda.x, 40))`).
- **Causa**: o zoom é ancorado no ponteiro (`zoomEmPonto`), então `x`/`y` **mudam de propósito**
  para manter fixo o ponto do mundo sob o cursor. Com `zoom` distante de 1, o deslocamento de `x`
  passa fácil de 40 px.
- **Correção**: a asserção passou a comparar o **ponto do mundo** sob o cursor
  (`(cx - vp.x) / vp.zoom`) antes/depois.
- **Mitigação p/ novas fases**: ao testar zoom/pan, valide **invariantes geométricos**
  (ponto do mundo fixo, limites visíveis), não valores absolutos de `x`/`y`.

### P7 — Ações do canvas NÃO podem re-renderizar a área
- **Sintoma (prevenido pelo desenho)**: se `zoom/fit/centralizar/minimapa` passassem pelo
  `renderArea()`, o `#mapaCanvas` seria recriado a cada clique e o pan/zoom perderia o estado.
- **Correção**: `ACOES_CANVAS` é tratado por `tratarAcaoCanvas()` que atualiza só o DOM
  (`definirViewport` → transform) e **retorna sem re-renderizar**.
- **Mitigação p/ novas fases**: ao adicionar novas ações de canvas (F3: seleção, drag), mantenha-as
  fora do fluxo de re-render; redesenhe apenas o que mudou.

### P8 — Minimapa/controles capturavam o ponteiro do canvas
- **Sintoma (prevenido pelo desenho)**: arrastar sobre o minimapa ou sobre a barra de controles
  movia o mundo (pan indesejado).
- **Correção**: `alvoInterativo()` ignora `pointerdown`/`wheel` quando o alvo está em
  `#mapaMinimapa`, `.mapa-canvas-controles`, `button/input/select/a` ou `.mapa-chip`.
- **Mitigação p/ novas fases**: todo controle sobreposto ao canvas precisa estar na lista de
  `alvoInterativo` (ou chamar `stopPropagation` de forma consciente).

---

## F3 — Nós / tópicos

**Suíte**: `node tests/run-all.cjs --baseline --retry=1` → **SEM REGRESSÕES** (0 falhas novas);
`mapa_area`, `mapa_gestao`, `mapa_canvas`, `mapa_nos`, `parity_*` e `shortcuts` verdes.

### P9 — Duplicar/excluir operam sobre a RAMIFICAÇÃO (expectativa de teste)
- **Sintoma**: `mapa_nos.cjs` falhou em `duplicar antes de desfazer` (`11 !== 10`).
- **Causa**: `duplicar`/`excluir`/`copiar` trabalham na **subárvore**; o nó testado tinha um filho
  (reparentado antes por arrasto), então a cópia criou 2 nós.
- **Correção**: a asserção passou a checar “aumentou” e, no `desfazer`, a contagem exata anterior.
- **Mitigação p/ novas fases**: ao testar comandos em nós, conte a **subárvore** (use
  `MapaMentalModelo.listarDescendentes`), nunca presuma `+1`.

### P10 — Regras de gesto no canvas (definidas e documentadas)
- `pointerdown` no **nó** → seleciona (+Ctrl/Shift) e inicia **arrasto**; soltar sobre outro nó = **reparent**.
- `pointerdown` no **vazio** → **pan**; com **Shift** → **laço de seleção**.
- `pointerdown` na **alça** (`.mapa-no-resize`) → redimensiona; em **botões/controles/minimapa** → ignorado.
- **Mitigação p/ novas fases**: qualquer gesto novo precisa entrar nessa ordem de precedência
  (alça → interativo → nó → laço → pan), senão um rouba o outro.

### P11 — Teclado: foco do canvas e regra do `contenteditable`
- **Sintoma (prevenido)**: o canvas chamava `preventDefault()` no `pointerdown`, o que impedia o foco
  e deixava os atalhos (F2/Enter/Tab) sem destino.
- **Correção**: `canvas.focus({ preventScroll: true })` explícito no `pointerdown` (fora da edição).
- **Regra documentada**: **editando** → `Enter` confirma, `Shift+Enter` quebra linha, `Tab` cria filho,
  `Esc` cancela; **fora da edição** → `Enter` cria irmão, `Tab` cria filho, `F2`/duplo clique edita,
  `Delete` exclui, `Ctrl+C/X/V` copiar/recortar/colar, `Ctrl+Z` desfaz, `Alt+↑/↓` reordena.
- **Mitigação p/ novas fases**: nunca bloquear o foco do canvas; testar atalhos com `page.keyboard`
  após um clique no nó (o foco é o próprio canvas).
- **Atualização (F12)**: o **toque longo** deixou de abrir a edição inline — agora abre o **menu
  contextual do card** (ver **P58**). A edição inline continua no duplo clique, `F2` e no item
  “Editar texto” do menu.

### P12 — Edição por caractere não gera histórico
- **Regra**: `registrarHistorico()` roda **uma vez por comando** (criar/excluir/mover/etc.) e ao
  **confirmar** a edição — nunca a cada tecla. Isso evita undo por caractere (a coalescência fina é F11).
- **Mitigação p/ novas fases**: comandos contínuos (arrastar, redimensionar) atualizam só o DOM e
  registram histórico no **fim** do gesto (`mapaFinalizarArrastoNo`/`mapaFinalizarRedimensionarNo`).

### P13 — Reordenar × layout automático
- **Regra**: com `grafo.posicionamento !== 'manual'`, todo comando estrutural reaplica o layout em
  árvore (`reposicionarAuto`), então reordenar/criar **move** os nós. Ao arrastar livremente, o mapa
  vira `'manual'` e as posições passam a ser respeitadas (layout automático/manual completo é F8).
- **Mitigação p/ novas fases**: qualquer novo comando que mude a estrutura deve passar por
  `aposComandoNo()` para manter a regra (reposicionar → persistir → histórico → redesenhar).

## Seção B — Fases 4 a 7 (conteúdo, hierarquia, conexões e drag & drop)

### P14 — XSS ao renderizar conteúdo do nó (F4)
- **Sintoma (evitado por desenho)**: título/descrição/notas poderiam carregar `<script>` de importação.
- **Correção**: `htmlSeguro()` escapa todo o HTML e só reinsere `<a>` gerado por nós; `sanitizarTexto()`
  remove tags de título/tags; `urlSegura()` aceita apenas `http(s)/mailto/tel`. Nada é injetado com `innerHTML`.
- **Mitigação p/ novas fases**: renderizar sempre via `textContent`/`createElement`; nunca `innerHTML` com dado do usuário.

### P15 — Anexos estouram a cota do localStorage (F4)
- **Regra**: `adicionarAnexo()` recusa dados vazios ou acima de `LIMITE_ANEXO` (~1 MB) **antes** de gravar.
- **Mitigação p/ novas fases**: para arquivos grandes, migrar para Blob/IndexedDB (backlog de I/O).

### P16 — Layout “bilateral/direita-esquerda” nascia fora da viewport (F5)
- **Sintoma**: filhos à esquerda da raiz ficavam com `x` negativo — cortados pelo `overflow:hidden`
  e inalcançáveis (quebrava clique/arrasto nos testes).
- **Correção**: `calcularPosicoes()` normaliza o mundo para o quadrante positivo ao final.
- **Mitigação p/ novas fases**: qualquer layout novo deve manter `minX/minY >= 0` (ou chamar `fit` ao abrir).

### P17 — Recolher escondia o nó selecionado/em edição (F5)
- **Regra**: `ajustarSelecaoAposRecolher()` move a seleção para o nó recolhido e encerra a edição inline
  quando o foco ficaria invisível; `recolher tudo` também encerra a edição.
- **Mitigação p/ novas fases**: ao esconder ramos, nunca deixar `mapaEditandoId`/seleção em nó oculto.

### P18 — Conexões livres são overlay (F6)
- **Regra**: arestas vivem em `#mapaConexoesSvg` e são vinculadas **por ID** (sobrevivem a relayout/reparent);
  **não** entram no cálculo do layout em árvore. O SVG é redesenhado no arrasto/resize sem recalcular o layout.
- **Mitigação p/ novas fases**: manter a geometria derivada de `dimensoesNos()` (posição + medição), nunca fixar coordenadas.

### P19 — Bloqueio visual de ciclo no arrasto (F7)
- **Regra**: a ramificação arrastada recebe `.mapa-no-arrastando` (`pointer-events:none`), então o
  `elementFromPoint` não alcança descendentes — a classe `.mapa-alvo-bloqueado` fica como guarda
  defensiva. A **detecção de ciclo é lógica**: descendentes ficam fora dos alvos válidos e
  `contemCiclo()` revalida no `mapaFinalizarArrastoNo`.
- **Mitigação p/ novas fases**: manter as duas camadas (exclusão de alvos + `contemCiclo`) ao mudar o hit-test.

### P20 — Carga do Service Worker precisa do novo asset (F4–F7)
- **Regra**: `mapa/mapa-painel.js` entrou em `ESSENCIAIS` e o `CACHE_NAME` sobe a **cada** mudança de
  asset cacheado (atualmente `notas-pwa-v29`; histórico: v24 = estado vazio do mapa, v25→v26 = atalhos
  de teclado, v27→v29 = ramificações pai→filho + layout/arrasto).
- **Mitigação p/ novas fases**: asset novo em `mapa/` ⇒ atualizar `index.html` **e** `sw.js` + bump do cache
  **sempre que** um asset cacheado mudar (senão o Service Worker continua servindo a cópia antiga).

### P21 — Atalhos de teclado do mapa exigiam foco no canvas (F7/atalhos)
- **Sintoma**: após trocar para a área do mapa, o foco podia permanecer no editor de notas
  (oculto); como o listener estava na seção e exigia `target.closest('#mapaCanvas')`, os
  atalhos não respondiam. Também era impossível criar o 1º tópico por teclado (sem seleção).
- **Correção**: escutar `keydown` no **document**, agindo só com `mapaAreaAtiva === 'mapa'` e a
  seção visível; ignorar campos de texto **desta** área (exceto `.mapa-no-editor`, que tem regras
  próprias) e devolver o foco ao canvas (`focarCanvas`) ao terminar a edição.
- **Armadilha**: manter listener na seção **e** no document executa o atalho **duas vezes**
  (cria nó em dobro). Escolha **um** ponto de escuta.
- **Mitigação p/ novas fases**: ao mexer em atalhos, teste com o foco “sujo” (editor de notas
  oculto) e garanta um único handler por tecla (`tests/mapa_vazio.cjs`).

### P22 — Filho novo parecia “solto” (sem ligação com o pai) e fora de ordem
- **Sintoma**: ao criar filho (Tab/Enter) a ligação pai→filho não existia visualmente (só as
  conexões livres tinham linha) e o layout `bilateral` alternava os filhos 1 a 1
  (1º direita, 2º esquerda…), parecendo aleatório. Em layout **manual**, o nó novo podia nascer
  longe da árvore.
- **Correção**: (1) **ramificações pai→filho** agora são desenhadas no SVG (`.mapa-ramo`,
  curvas que saem da borda do pai mais próxima do filho); (2) `bilateral` passou a dividir os
  filhos em **metades contíguas** (1ª metade à direita, resto à esquerda), preservando a `ordem`;
  (3) em modo manual, `posicionarNovoNo()` ancora o nó novo na coluna do irmão anterior e logo
  abaixo dele; (4) `garantirNoVisivel()` paneja a viewport se o nó nascer fora da tela.
- **Mitigação p/ novas fases**: layout novo deve manter a ordem dos irmãos e o desenho das
  ramificações (`tests/mapa_layout.cjs` valida `ramos = nós com pai`; `tests/mapa_dragdrop.cjs`
  valida o alinhamento do nó novo em modo manual).

---

## Revisão do bloco de notas (16 itens)

### P23 — "Desmarcar um check não voltava à posição original"
- **Sintoma**: `tests/notes_checklist_order.cjs` (e `notes_checklist_numbers.cjs`) falhavam:
  depois de marcar A e B, desmarcar A deixava `['A','C','B']` em vez de `['C','A','B']`.
  O mesmo bug existe no projeto original (o teste falha lá também).
- **Causa**: em `NotesDocument.setCompletion` o bloco de `completionOrder` procurava o primeiro
  irmão *na ordem atual* (`this.blocks.find(...)`), ignorando a ordem original; ele sobrescrevia
  o `returnPosition` já correto.
- **Correção**: olhar o **primeiro irmão na ORDEM ORIGINAL** (`completionOrder`): se ele ainda
  estiver pendente, o item volta para logo antes dele; se já estiver concluído, o item vai para
  o topo da pilha de concluídos. Assim "desmarcar em qualquer ordem restaura a ordem original"
  e o uncheck parcial voltam a funcionar juntos.
- **Mitigação p/ novas fases**: ao mexer em `completionOrder`/`completionPosition`, rodar
  `notes_document_model.cjs` (casos de desfazer tudo) **e** `notes_checklist_order.cjs`.

### P24 — Enter em título/lista recolhida perdia a formatação e duplicava filho
- **Sintoma**: `tests/notes_enter_child.cjs` (falhava) e `test_notes_editor_ui.cjs` linha 45: com o
  cursor no fim de um pai recolhido, o Enter criava um **irmão** (nível 0) em vez de reutilizar o
  filho vazio / seguir o fluxo da lista.
- **Causa**: o bloco do "recolhido + cursor no fim" rodava antes da reutilização do filho vazio e
  criava a linha sem copiar `list`/`check`, sempre no mesmo nível.
- **Correção**: (1) reutilizar o filho vazio existente passou a ser avaliado antes; (2) em
  lista/checklist recolhida, a nova linha entra como **primeiro filho** (o pai é expandido) e herda
  `list`/`check` + numeração; (3) em título recolhido, herda `heading`/`bold`/`italic` e o
  `outlineBreak`.
- **Mitigação p/ novas fases**: ao mexer no Enter, rodar `notes_enter_child.cjs`,
  `notes_last_line_enter.cjs`, `notes_indent_child.cjs` e `notes_renumber_structure.cjs`.

### P25 — Ícones da toolbar divergiam do original (tamanho/desenho)
- **Sintoma**: a toolbar do PWA usava ícones 20×20 e desenhos diferentes (tachado, listas,
  indentar, undo/redo) do projeto `produtividade-ferrramenta` (16×16).
- **Correção**: `index.html` passou a usar os mesmos desenhos 16×16 do original (mantendo a
  **ordem atual** do PWA) e foi adicionado o **sublinhado** (botão + `Ctrl+U`), que não existe no
  original.
- **Mitigação**: `parity_structure.cjs` ganhou a allowlist `COMANDOS_EXTRAS_PWA` com motivo
  escrito para comandos exclusivos do PWA (`underline`). Novos comandos só entram ali com
  justificativa.

### P26 — Reduzir o recuo esquerdo do editor quebra `parity_visual`
- **Sintoma**: ao reduzir o `padding-left` do container do editor, `parity_visual.cjs` acusou 6
  divergências de `width` (editor/linha/área de texto) contra o original.
- **Correção**: exceções **documentadas** em `parity_visual.cjs` para `padding` e `width` — é o
  efeito pedido (aproximar o conteúdo da borda), não um estilo divergente.
- **Mitigação p/ novas fases**: qualquer ajuste de espaçamento do editor precisa de exceção
  documentada; rodar `node tests/parity_visual.cjs` isolado antes de "consertar".

### P27 — Modo mobile × `toolbar_pwa.cjs` (janela estreita ≠ celular)
- **Sintoma**: `toolbar_pwa.cjs` passou a falhar ("barra rola na horizontal") porque o novo modo
  mobile escondia a toolbar num viewport de 390px.
- **Causa**: a primeira detecção (`largura ≤ 767px`) tratava uma janela estreita de desktop como
  celular; o teste usa 390px justamente para provar a rolagem horizontal.
- **Correção**: `ehMobile()` agora exige **toque** (`pointer: coarse`) **E** largura ≤ 767px; o
  teste passou a exercitar a rolagem em 820px (desktop estreito) e ganhou o caso 2b (celular:
  toolbar escondida + colapso só dos chips).
- **Mitigação p/ novas fases**: ao mexer no CSS do modo mobile, rodar `toolbar_pwa.cjs`; esperar
  a **transição** (`max-height .32s`) antes de medir visibilidade (usar ≥ 450ms).

### P28 — `test_notes_editor_ui.cjs` linha 47 depende de tempo (pré-existente)
- **Sintoma**: depois de corrigir a linha 45, o teste para na linha 47 ("linha 1 visível após
  clicar no colapso") — ele espera 250ms, mas a animação de colapso dura 320ms.
- **Situação**: falha **pré-existente** (o teste já estava no baseline de falhas); a correção
  avançou o ponto de falha da linha 45 para a 47.
- **Mitigação p/ novas fases**: ao investigar colapso, medir com `hidden=true` (estado
  persistente) em vez de `isVisible()` no meio da animação.

### P29 — Título recolhido não replicava a formatação quando o H1 era INLINE
- **Sintoma**: com o conteúdo recolhido e o cursor no fim da linha, o Enter criava
  uma linha de baixo **sem formatação** (texto normal) mesmo a linha de cima sendo
  um título azul/negrito/grande.
- **Causa**: o comando `heading` aplicado a uma **seleção** cria um título **inline**
  (`span [data-inline-heading]`) em vez de `data-heading` na linha (ver
  `formatSelectionHeading`). O bloco do Enter só copiava `line.dataset.heading`.
- **Correção**: o bloco do Enter (recolhido + cursor no fim) agora deriva o título
  também do `span [data-inline-heading]` que cobre o texto, e a linha criada recebe
  `data-heading` + `outlineBreak` (mesma aparência).
- **Mitigação p/ novas fases**: qualquer formatação "de linha" pode estar inline
  (título/bold/italic aplicados a seleção). Ao replicar formatação, checar os dois
  formatos. Teste: `tests/notes_collapsed_heading.cjs`.

### P30 — Contêiner branco atrás dos chips e dark que não era o inverso do claro
- **Sintoma**: havia uma "faixa"/painel branco atrás dos chips e, no tema escuro, o
  texto dos chips continuava **escuro** (`#172033`) sobre fundo escuro (ilegível).
- **Causa**: o painel vem de `notes/editor.css:179,186,192-201` (`background` do nav
  + `::before`); o texto do chip é definido **uma vez** em
  `notes/editor.css:180` (`color:var(--color-text-main)` = escuro) e vencia a regra
  escura do `theme-origem.css` (id+atributo não basta).
- **Armadilha de cascata**: o fundo do nav está dentro de `@layer components` com
  `!important`. Pela cascata, **`!important` dentro de camada vence `!important`
  fora de camada**, independentemente da especificidade — por isso as tentativas de
  sobrescrever no `styles.css` (fora de camada) não pegavam.
- **Correção**: a sobrescrita foi colocada **dentro de `@layer components`** no
  `styles.css` (com `body` a mais para ganhar na especificidade dentro da camada):
  nav transparente/sem borda/sem `::before`; e o texto do chip vira claro
  (`#F5F5F7`) no tema escuro.
- **Mitigação p/ novas fases**: para sobrescrever regra `!important` que esteja em
  `@layer`, a sobrescrita também precisa estar em camada. Ajuste do nav exige
  exceção em `parity_visual.cjs` (`#notesContextNav` `backgroundColor`).

### P31 — Enter que "não pegava" (cursor fora de uma linha)
- **Sintoma**: às vezes apertar Enter não dava a quebra (intermitente).
- **Causa**: quando o cursor não está dentro de um `.notes-line` (clique depois do
  último bloco, foco dado por `editor.focus()` sem range, nó solto, editor vazio), o
  `keydown` saía **antes** do `preventDefault`; aí o `beforeinput` (insertParagraph)
  cancelava a inserção e o `handleNotesEditorShortcut` era chamado de novo, também
  sem linha → **nada acontecia**. O caso especial existente cobria só
  `range.startContainer === editor()`.
- **Correção**: no Enter com o cursor fora de linha, o motor leva o cursor para a
  linha mais próxima (pela posição visual) / primeira / última e, se não houver
  nenhuma, cria uma linha — então a quebra sempre acontece. Teste:
  `tests/notes_enter_robust.cjs`.
- **Mitigação p/ novas fases**: ao investigar Enter "morto", verificar primeiro se o
  cursor está dentro de um `.notes-line` (`lineAt(range.startContainer)`).

### P32 — Enter em linha com botão de colapso: irmão × filho (semântica final)
- **Regra pedida pelo usuário** (cursor no FIM da linha + Enter):
  - **Recolhido** (botão de colapso FECHADO) → a linha de baixo é **IRMÃ** (mesmo nível,
    **não** é filho) e **HERDA a formatação** da linha de cima (título/lista/check) +
    a numeração;
  - **Sem botão de colapso OU aberto** → a linha de baixo é **FILHA** (nível do pai + 1)
    e **NÃO** herda a formatação (vira uma linha simples/indentada).
- **Causa das idas e voltas**: `targets()` considera "filhos" de um TÍTULO também as
  linhas seguintes por **hierarquia de outline** (mesmo sem indentação), então o título
  mostra botão de colapso sem ter filho indentado — o que confundia o comportamento.
- **Implementação**: em `editor.js`, o bloco "recolhido + cursor no fim" cria um
  **IRMÃO** (`level` do pai) herdando `heading`/`list`/`check`/`checkNumber` (+
  `outlineBreak` quando título); o caminho normal (aberto/sem botão) mantém o
  `child ? nível+1 : nível` e só copia `heading/bold/italic` quando o cursor está no
  INÍCIO da linha (no fim, o filho nasce sem formatação).
- **Consequência conhecida**: `test_notes_editor_ui.cjs` linha 45 esperava FILHO para um
  pai de lista **recolhido** (comportamento antigo); com a nova regra ele falha nesse
  ponto (o teste já era falho e continua contando como falha conhecida).
- **Teste**: `tests/notes_collapsed_heading.cjs` cobre (a) título de linha recolhido,
  (b) título inline recolhido, (c) pai de lista recolhido, (d) aberto → filho sem
  formatação e (e) sem botão → irmão simples.

### P33 — "Apagar todo o conteúdo" deixava conteúdo oculto e o botão de colapso preso
- **Sintoma**: depois de apagar tudo, a primeira linha continuava com o botão de
  colapso (parecia que o botão "não apagava").
- **Causa**: as linhas-filhas ESCONDIDAS por um colapso não são alcançáveis pela
  seleção nativa do navegador — o `Ctrl+A`/Delete apagava só o texto visível, então
  as linhas ocultas (com conteúdo) permaneciam e o pai continuava sendo "pai".
- **Correção** (em `notes/editor.js`):
  1. `Ctrl/Cmd+A` no editor passa a selecionar **todo o conteúdo do editor**
     (`selectNodeContents(editor())`), incluindo as linhas ocultas;
  2. no `beforeinput`, quando a seleção cobre **todas** as linhas e a ação é de
     apagar (`/^delete/`), a nota é zerada de fato: sobra uma linha vazia, sem
     `data-collapsed` (o botão de colapso desaparece).
- **Cuidado p/ novas fases**: tentar "reduzir linhas vazias" no
  `refreshNotesCollapseControls` é **errado** — `notes_last_line_enter` exige poder
  ter várias linhas em branco. Além disso, nunca remover a linha do CURSOR (a
  digitação iria para o vazio). Um guard de "nunca esconder a linha do cursor"
  também foi descartado: ele desfazia o colapso quando o cursor estava dentro da
  seção.
- **Teste**: `tests/notes_clear_all.cjs`.

### P34 — Enter "travado" no PC: blindagem contra exceção no motor
- **Sintoma (relatado)**: com o título recolhido e o cursor no fim, teclar Enter dava
  "sensação de travamento" e a quebra não acontecia (no **PC**).
- **Investigação**: NÃO reproduzido — nem no harness, nem no **boot real em viewport de
  celular**, nem no PC headless. Em todos os cenários a linha-irmã é criada com a
  formatação herdada (`heading`/`outlineBreak`) e o cursor vai para ela. O keydown do
  Mapa Mental foi descartado (`tratarTeclaMapa` sai cedo quando a área é `notas`).
- **Correção (defensiva)**: o `keydown` do editor (em `app.js`) agora envolve
  `handleNotesEditorShortcut` em `try/catch`. Se o motor lançar exceção:
  1. o erro vai para o **console** (`[notas] erro ao tratar a tecla …`) para diagnóstico;
  2. no **Enter**, `quebrarLinhaDeEmergencia()` cria a linha nova (mesma estrutura do
     editor) e coloca o cursor nela — o app nunca fica "travado".
- **Mitigação p/ novas fases**: ao investigar "tecla não faz nada", pedir o erro do
  console — a blindagem registra a causa original. Teste:
  `tests/notes_enter_robust.cjs` (caso da falha simulada do motor).
- **Desfecho**: era **cache do Service Worker** (o app publicado rodava a versão
  antiga do `editor.js`). Depois de recarregar, o Enter funcionou normalmente.
  **Toda vez que um asset cacheado mudar, incrementar o `CACHE_NAME`** (P3/P20) —
  e, ao testar logo após um deploy, recarregar 1× (o SW novo assume e a página
  recarrega no `controllerchange`). Uma boa prática é conferir em
  DevTools → Application → Service Workers qual `notas-pwa-vNN` está ativo.

### Mapa Mental "não alternava a área" (deploy)
- **Sintoma**: no site publicado, clicar em "Mapa Mental" continuava em Notas.
- **Causa**: os arquivos de `mapa/` estavam **fora do controle de versão** (não
  existiam no servidor) → `installMapaMental`/`inicializarAreasMapa` não existiam e
  o seletor não recebia handler. Agora estão versionados (commit da área do Mapa).
- **Mitigação**: o Service Worker é offline-first; depois do deploy de assets, a
  primeira navegação ainda pode servir o cache antigo. Recarregar 1x (o SW novo
  assume o controle e a página recarrega no `controllerchange`) resolve.

### Cores (pré-existentes, fora dos 16 itens)
- `notes_cascade_defaults.cjs` (`#1122aa` vs `#aa1122`) e `notes_navigation_completion.cjs`
  (histórico de accent) continuam falhando: o helper de cor do PWA mantém a ordem dos canais
  invertida em relação ao original. Registrado como pendência separada.

---

## Seção C — Fases 8 a 11 (apresentação e produtividade)

### F8 — Layout automático

**Suíte (parte de mapa)**: `mapa_area`, `mapa_gestao`, `mapa_canvas`, `mapa_nos`, `mapa_conteudo`,
`mapa_conexoes`, `mapa_dragdrop`, `mapa_vazio`, `mapa_layout`, `parity_structure`, `parity_visual`
e `shortcuts` **verdes**.

**Suíte completa** (`node tests/run-all.cjs --baseline`): `PASSOU 46 / FALHOU 11 / N/A 1 / TOTAL 58`.
As 11 falhas são as conhecidas do motor de notas (baseline) e as 2 “regressões” apontadas
(`parity_visual`, `tema_vidro`) foram investigadas e **não** são do F8 — ver **P41**.

### P35 — Medição real sem perder o determinismo (decisão de arquitetura)
- **Regra**: `MapaMentalLayout.calcularPosicoes` continua sendo uma função **pura/determinística**
  (testável sem navegador). As dimensões REAIS entram por **injeção** (`cfg.medidas`: Map
  `id → {largura,altura}`), lidas do DOM por `medidasDoDom()`.
- **No app**, o refino roda em **duas etapas**: `reposicionarAuto()` estima (altura por nº de
  linhas) e, **depois do render**, `refinarLayoutPorMedicao()` mede `offsetWidth/offsetHeight`
  e recalcula. Sem DOM (Node/vm), o cálculo cai na estimativa — nada quebra.
- **Mitigação p/ novas fases**: nunca medir antes de renderizar (a caixa só existe depois do
  DOM); manter a estimativa como fallback.

### P36 — Refino não pode “piscar” nem entrar em loop
- **Sintoma (prevenido)**: o refino chama `renderArea()` de novo; sem guarda, um nó cujo
  conteúdo/fonte muda entre renders poderia oscilar posições indefinidamente.
- **Correção**: flag `this.mapaRefinandoLayout` — a passada de refino roda **uma vez** por render
  (`if (… || this.mapaRefinandoLayout) return;`) e só re-renderiza **se** as posições mudaram.
- **Mitigação p/ novas fases**: qualquer “re-render por medição” precisa de guarda de reentrância.

### P37 — Transição suave NÃO pode ser global (quebraria o arrasto)
- **Sintoma (prevenido)**: uma `transition: left/top` fixa em `.mapa-no` faria o nó “perseguir”
  o ponteiro no arrasto e atrasaria o redimensionamento.
- **Correção**: transição **opt-in** — `#mapaNos.mapa-transicao .mapa-no { transition: … }`,
  ativada só durante o relayout (`reposicionarSuave`) e removida após 320 ms.
- **Extra**: `reposicionarSuave()` atualiza `left/top`/ramos/minimapa **sem** `renderArea()`
  (preserva pan/zoom/seleção e evita recriar o canvas — ver P7).
- **Mitigação p/ novas fases**: nunca animar propriedades que o gesto escreve por frame
  (`left/top` durante drag/resize).

### P38 — Layout “sem sobreposição” exige folga garantida (não só espaçamento médio)
- **Regra**: folhas acumulam pela **altura/ largura real + espaçamento**; nós internos ficam
  **centrados** nos filhos; a coluna de cada nível usa a **maior dimensão do nível**. Uma passada
  final (`desobrepor`) empurra os nós da mesma coluna até a folga mínima.
- **Teste**: `mapa_layout.cjs` compara **retângulos** (posição do modelo + `offsetWidth/Height`)
  de todos os nós e exige **zero interseção** em `bilateral`, `esquerda-direita`,
  `arvore-vertical` e `organograma`, com um título longo forçando caixa alta.
- **Cuidado**: medir posição pelo **modelo** (não por `getBoundingClientRect`) — a transição
  CSS poderia devolver valores intermediários e tornar o teste flaky.

### P39 — Trocar para automático descarta posições manuais → confirmação em duas etapas
- **Regra**: `mapaDefinirLayout` só troca direto se o mapa **não** está `'manual'` com posições
  gravadas; senão abre a barra `.mapa-confirmacao` (ações `layout-confirmar` / `layout-cancelar`).
- **Estilo**: dois passos inline (como `excluir` → `excluir-confirmar`), **sem** `window.confirm`.
- **Persistência**: `grafo.layout` e `grafo.espacamento` são normalizados no modelo
  (`normalizarEspacamento`, teto 400) ao carregar — mapas antigos ganham default válido.

### P40 — Asset do Service Worker (bump)
- **Regra**: assets cacheados mudaram (`mapa/mapa-layout.js`, `mapa-modelo.js`, `mapa-render.js`,
  `mapa/mapa.js`, `mapa/mapa.css`) ⇒ **`CACHE_NAME` v36 → v37**. Nenhum asset NOVO foi criado,
  então `ESSENCIAIS` permanece igual.

### P41 — “Regressões” do `--baseline` que NÃO eram do F8 (baseline desatualizado)
- **Sintoma**: `node tests/run-all.cjs --baseline` terminou
  `PASSOU 46 / FALHOU 11 / N/A 1 / TOTAL 58` e marcou
  `REGRESSAO (parity_visual.cjs, tema_vidro.cjs)`.
- **Investigação**:
  1. `parity_visual.cjs` **passa isolado** (`node tests/parity_visual.cjs` → OK) — é a flakiness
     de sincronização já registrada em **P2** (250 ms fixos + CPU carregada na suíte).
  2. `tema_vidro.cjs` **falha também com `git stash` das mudanças do F8** → é divergência
     **pré-existente**: em `#notesContextNav`, o PWA está transparente (`backdrop-filter:none`)
     e o original tem vidro (`blur(18px)`) — efeito do ajuste documentado em **P30**. O
     `docs/relatorio-testes.json` usado como baseline era de um estado ANTERIOR a esse ajuste.
- **Mitigação p/ novas fases**: se o `--baseline` acusar “regressão” num teste que **não** toca a
  área alterada: (a) rodar o teste **isolado**; (b) se ainda falhar, `git stash` as mudanças e
  rodar de novo — falhar sem as mudanças = baseline desatualizado, **não** regressão nova.
  Depois de confirmar, o próprio `--baseline` reescreve o baseline (próxima rodada fica correta).

### F9 — Editor visual

**Suíte (mapa)**: `mapa_area`, `mapa_gestao`, `mapa_canvas`, `mapa_nos`, `mapa_conteudo`,
`mapa_conexoes`, `mapa_dragdrop`, `mapa_vazio`, `mapa_layout`, `mapa_estilo`,
`parity_structure`, `parity_visual` e `shortcuts` **verdes**.

### P42 — Estilo vive no MODELO e a precedência é resolvida num único lugar
- **Regra**: `no.estilo` (e `grafo.estilosNivel` / `grafo.temaId`) guardam só o VISUAL e passam por
  `normalizarEstilo` (cores `#rrggbb`, enums e limites). Nada de estilo inline solto.
- **Precedência**: `MapaMentalModelo.estiloEfetivo(grafo, no)` = **tema → nível → nó** (merge).
  O render só lê o resultado e aplica **classes + CSS vars** (`--mapa-no-cor/-fundo/-borda/…`).
- **Mitigação p/ novas fases**: nunca redefinir tokens globais do tema no `mapa.css` (quebraria
  `parity_visual`); usar sempre o par `var(--mapa-…, var(--color-…))`.

### P43 — Dark mode sobrescrevia o estilo do nó (var com fallback)
- **Sintoma (prevenido pelo desenho)**: `html[data-theme="dark"] .mapa-no` fixava
  `background/border/color` e venceria as CSS vars do estilo.
- **Correção**: a regra escura também usa as vars com fallback escuro
  (`background: var(--mapa-no-fundo, #11161D)`), então o estilo do nó vale nos DOIS temas.
- **Teste**: `mapa_estilo.cjs` confere `rgb(17, 22, 29)` para nó sem estilo no escuro e
  `rgb(18, 52, 86)` para o nó estilizado.

### P44 — Mutação direta no modelo NÃO persiste (armadilha ao testar o mapa)
- **Sintoma**: ao setar `estilo`/`estilosNivel` direto em `window.app.mapaCanvasGrafo` e chamar
  `renderArea()`, o estilo "sumia".
- **Causa**: `renderArea()` faz `store().obterGrafo(id)`, que **recarrega do localStorage**
  (`normalizarGrafo`) — a mutação em memória não salva é descartada.
- **Correção no teste**: `MapaMentalStore.salvarGrafo(grafo)` antes de re-renderizar; o ideal é
  usar as funções do app (que passam por `aposComandoNo`, que persiste).
- **Mitigação p/ novas fases**: em testes, toda mutação de modelo precisa ser salva (ou use as
  ações `mapa*`); o mesmo vale para níveis/tema.

### P45 — Asset do Service Worker (bump)
- **Regra**: mudaram `mapa/mapa-modelo.js`, `mapa-render.js`, `mapa-painel.js`, `mapa/mapa.js` e
  `mapa/mapa.css` ⇒ **`CACHE_NAME` v37 → v38**. Nenhum asset NOVO foi criado (`ESSENCIAIS` igual),
  mas o teste novo `tests/mapa_estilo.cjs` entra na suíte (não é asset do app).

### F10 — Atalhos de teclado

**Suíte (mapa)**: `mapa_area`, `mapa_gestao`, `mapa_canvas`, `mapa_nos`, `mapa_conteudo`,
`mapa_conexoes`, `mapa_dragdrop`, `mapa_vazio`, `mapa_layout`, `mapa_estilo`, `mapa_atalhos`,
`parity_structure`, `parity_visual` e `shortcuts` **verdes**.

### P46 — Keymap por ASSINATURA canônica (nunca por `keyCode`)
- **Regra**: `assinaturaTecla(evento)` monta `ctrl+alt+shift+<tecla>` (letras em minúsculo) — cobre
  `Ctrl+Shift+Z`, `Ctrl+Y`, `Alt+Setas` e layouts de teclado sem depender de `keyCode` (a doc proíbe).
- **Catálogo**: `ACOES_ATALHO` guarda os PADRÕES; as preferências do usuário
  (`notas-pwa-mapa-atalhos`) só sobrescrevem a ação remapeada — o resto continua no padrão.
- **Mitigação p/ novas fases**: ao adicionar ação, declare o padrão em `ACOES_ATALHO` (o painel e a
  detecção de conflito passam a incluí-la automaticamente).

### P47 — Edição inline BLOQUEIA os atalhos globais (regra descoberta ao testar)
- **Sintoma**: no teste, `Ctrl+Z` logo após `Enter` "não fazia nada" e o `F4` recém-configurado
  também não duplicava.
- **Causa**: `Enter`/`Tab` **criam o nó e abrem a edição inline** (`mapaCriarIrmaoDeNo(id, true)`);
  com `mapaEditandoId` ativo, `atalho()` trata só `Esc`/`Enter`/`Tab` e **retorna** para o resto —
  comportamento correto (a edição tem regras próprias).
- **Correção**: o teste sai da edição (`Esc`) antes de usar um atalho global; a suíte ganhou o caso
  e **espera o editor aparecer** (`#mapaNos .mapa-no-editor`) — `iniciarEdicaoDepois` abre a edição
  de forma **assíncrona** (`setTimeout 0`), então mandar `Esc` cedo demais deixava o atalho "morto"
  (flakiness detectada ao rodar 2×).
- **Mitigação p/ novas fases**: qualquer teste que use atalhos depois de criar nó precisa
  **confirmar/cancelar a edição** antes (e aguardar o editor), senão o atalho é ignorado por design.

### P48 — Painel/captura rodam ANTES do guard de campos (listener único)
- **Regra**: `tratarTeclaMapa` (listener **único** no `document`, ver P21) trata primeiro
  **captura de atalho** e depois **`Esc` fecha o painel**; só então aplica o guard de
  `input/textarea/select/contenteditable`. Sem essa ordem, a captura não funcionaria com o foco no
  botão "Alterar" (e o `Esc` fecharia a área em vez do painel).
- **Mitigação**: manter a ordem captura → painel → campos → keymap; nunca duplicar o listener.

### P49 — Conflito ao remapear: `ctrl+d` fica LIVRE quando "duplicar" vira `F4`
- **Sintoma**: o teste de conflito falhou porque tentava registrar `ctrl+d` em "editar" e não havia
  conflito (o padrão de "duplicar" foi substituído por `F4`).
- **Regra**: a detecção de conflito usa o mapa EFETIVO (preferências + padrões restantes). Remapear
  uma ação libera as teclas antigas dela.
- **Mitigação**: ao testar conflito, use uma tecla **em uso no momento** (ex.: a própria `F4`).

### P50 — Asset do Service Worker (bump)
- **Regra**: mudaram `mapa/mapa-store.js`, `mapa-interacao.js`, `mapa-render.js`, `mapa/mapa.js` e
  `mapa/mapa.css` ⇒ **`CACHE_NAME` v38 → v39** (`ESSENCIAIS` inalterado). Entra o teste
  `tests/mapa_atalhos.cjs`.

### F11 — Undo/Redo

**Suíte (mapa)**: `mapa_area`, `mapa_gestao`, `mapa_canvas`, `mapa_nos`, `mapa_conteudo`,
`mapa_conexoes`, `mapa_dragdrop`, `mapa_vazio`, `mapa_layout`, `mapa_estilo`, `mapa_atalhos`,
`mapa_undo`, `parity_structure`, `parity_visual` e `shortcuts` **verdes**.

### P51 — Snapshot PRECISA incluir os campos de nível do grafo
- **Regra**: `instantaneoGrafo` passou a guardar `layout`, `posicionamento`, `espacamento`, `temaId`
  e `estilosNivel` (além de `nos`/`conexoes`/seqs) — sem isso, `Ctrl+Z` **não** voltava layout nem
  tema (eles ficavam fora do undo). `aplicarInstantaneo` restaura todos.
- **Mitigação p/ novas fases**: qualquer campo NOVO no grafo que seja editável precisa entrar no
  `instantaneoGrafo` **e** no `aplicarInstantaneo`.

### P52 — Comando que NÃO re-renderiza deixava os botões desatualizados (bug real)
- **Sintoma**: depois de `mapaDefinirLayout`, o clique em **Desfazer** não fazia nada (o layout
  continuava igual); o teste falhou em "Desfazer volta o layout".
- **Causa**: ações como layout/tema/estilo usam `reposicionarSuave` + `registrarHistorico` **sem**
  `renderArea`, então `atualizarBotoesHistorico` não rodava e o botão permanecia `disabled` do
  render anterior — e `element.click()` em botão `disabled` **não dispara** evento.
- **Correção**: `registrarHistorico` (ponto único de todas as ações) agora chama
  `atualizarBotoesHistorico` nos dois ramos (empilhar e coalescer).
- **Mitigação p/ novas fases**: estado de botão ligado à pilha deve ser atualizado **no**
  `registrarHistorico`, nunca só no render.

### P53 — Coalescência × ramo de redo (truncar muda o tamanho da pilha)
- **Sintoma**: a asserção "a rajada vira UM passo" (`len + 1`) falhou.
- **Causa**: se havia **ramo de redo**, o primeiro commit da rajada **trunca** a pilha antes de
  empilhar — então o tamanho pode não crescer.
- **Correção no teste**: assertar `len <= antes + 1` + "topo = atual" + o comportamento funcional
  (**um único undo** volta ao título original).
- **Mitigação**: ao testar coalescência, valide o EFEITO (1 undo por gesto) e não o tamanho exato,
  ou garanta que a pilha está no topo antes da rajada.

### P54 — Cap de 100 exige comando BARATO no teste
- **Sintoma**: o laço de 110 comandos estourou o tempo (cada comando re-renderiza e refina layout).
- **Correção**: no trecho do cap, o teste fixa `posicionamento = 'manual'` (pula layout + refino) —
  o teste caiu de >30 s para **6 s**.
- **Mitigação p/ novas fases**: testes de pilha/cap devem evitar recálculo de layout.

### P55 — Asset do Service Worker (bump)
- **Regra**: mudaram `mapa/mapa.js`, `mapa-render.js` e `mapa.css` ⇒ **`CACHE_NAME` v39 → v40**.
  Entra o teste `tests/mapa_undo.cjs`.

### P56 — Dark da área do mapa ESPELHA o dark de Notas (tokens `--mapa-*`)
- **Pedido**: o modo escuro do mapa deve usar as **mesmas cores** do dark de Notas.
- **Problema**: o mapa tinha valores próprios (`#0B0F14` para a área/área de trabalho,
  `#3A4657` para o ramo) que **não** existem no tema de Notas — ficava mais escuro/azulado que o
  modal.
- **Correção**: criado o bloco de **tokens `--mapa-*`** no topo do `mapa.css`:
  claro = tokens globais (`--color-*`); escuro = **exatamente** os valores do compilado do modal
  (`theme-origem.css`): superfície de barra `#151B23` (header/nav/toolbar/footer), container
  `#11161D`, área de trabalho `#0D1218` (`notesEditorContainer`), bordas `#2A3543`/`#263241`,
  divisor `#334155`, textos `#CBD5E1`/`#E2E8F0`/`#F8FAFC`/`#94A3B8`, hover `#202A36`.
  Todas as regras dark do mapa passaram a usar as variáveis (`#0B0F14` → `#0D1218`,
  ramo `#3A4657` → `#334155`, topbar/painel/menus → `#151B23`, hover de botões/chips → `#202A36`).
- **Ganho**: qualquer ajuste futuro no dark de Notas pode ser propagado só mexendo nesse bloco.
- **Cuidado**: o **nó** continua com fallback `#11161D` (o mesmo do container de Notas) — o
  `mapa_estilo.cjs` valida `rgb(17, 22, 29)` no escuro; **não** trocar por `#151B23`.
- **Bump**: `mapa.css` mudou ⇒ **`CACHE_NAME` v40 → v41**.

### F12 — Menus de interação + barras padronizadas

**Suíte (mapa)**: `mapa_area`, `mapa_gestao`, `mapa_canvas`, `mapa_nos`, `mapa_conteudo`,
`mapa_conexoes`, `mapa_dragdrop`, `mapa_vazio`, `mapa_layout`, `mapa_estilo`, `mapa_atalhos`,
`mapa_undo`, `mapa_toolbar`, `parity_structure`, `parity_visual` e `shortcuts` **verdes**.

### P57 — Duas barras (ferramentas fixa + formatação contextual), sem botão solto
- **Regra**: `#mapaToolbar` (fixa, `role="toolbar"`, uma linha com rolagem, grupos + divisores,
  `.toolbar-btn` = cores de Notas) concentra **ferramentas/visão/estrutura**; `#mapaFormatBar`
  (contextual ao nó selecionado) espelha a `#notesToolbar` (texto/tamanho/fonte/cores/forma/
  alinhamento/linhas/pincel). Saíram daqui: `controlesCanvas` e `acoesNo` (removidos).
- **Contratos preservados**: `#mapaArea .mapa-shell`, `#mapaCanvas`, `.mapa-canvas-vazio button`,
  todos os `data-mapa-acao` e os ids (`#mapaLayout`, `#mapaTema`, `#mapaEspacoNos`,
  `#mapaEspacoNivel*`, `#mapaNovoTopico`, `#mapaZoomAtual`).
- **Topbar**: no mapa aberto mostra **só** “‹ Mapas” (`#mapaNovaPasta` passou a ter id e é ocultada
  na visão de mapa); “Conectar a mapa…” e “Salvar como template” foram para o grupo **Mais**.
- **Teste**: `mapa_toolbar.cjs` valida `flex-wrap: nowrap`, `overflow-x`, grupos/divisores e
  **zero botão solto** (excluindo afinidades do card, chips de mapa conectado, minimapa e estado vazio).

### P58 — Ações de CARD foram para o MENU CONTEXTUAL (botão direito / toque longo)
- **Pedido**: o que é específico de um card (duplicar, colar, excluir, bloquear, largura, mover…)
  fica num **menu**, aberto por **botão direito** (PC) ou **toque longo** — nada de botão solto.
- **Implementação**: `contextMenu()` na interação (delegado no `#mapaArea`) + `mapaAbrirMenuNo`/
  `mapaAbrirMenuCanvas`/`mapaFecharMenus`; o menu (`role="menu"`, itens com `role="menuitem"`) usa os
  **mesmos `data-mapa-acao`** (as ações e os testes continuam funcionando) e fecha em **qualquer ação**.
- **Mudança de gesto**: o **toque longo não abre mais a edição inline** — agora abre o menu. A edição
  continua no **duplo clique/F2** e pelo item “Editar texto”. Atualizado em `P11` (nota).
- **Impacto nos testes**: adicionado nos helpers `[data-mapa-acao]` um *fallback* que **abre o menu**
  no nó selecionado quando o botão não está visível (`mapa_nos`, `mapa_layout`, `mapa_canvas`,
  `mapa_conteudo`, `mapa_conexoes`, `mapa_undo`).

### P59 — `page.click` NÃO acha botão dentro de `<details>` fechado (flakiness de 30 s)
- **Sintoma**: `mapa_atalhos.cjs` passou a **estourar o tempo** depois da F12.
- **Causa**: o botão “Atalhos” foi para o overflow (`<details class="mapa-tb-mais">`, fechado) e o
  `page.click` do Playwright espera o elemento ficar visível — timeout infinito.
- **Correção**: o teste passou a clicar via **JS** (`el.click()` em `page.evaluate`), que funciona em
  elemento oculto; o mesmo cuidado vale para qualquer botão do overflow.
- **Mitigação p/ novas fases**: testes devem clicar via JS em itens de overflow/menus fechados.

### P60 — Paleta de cores REPLICADA de Notas + integração com o canvas
- **Regra**: `mapa/mapa-cores.js` implementa o **mesmo padrão** de `setupNotesColors` (grade 8x10,
  recentes máx. 12, “+”, conta-gotas, “Sem cor”, “Aplicar”, popover preso ao `visualViewport`,
  `Esc`/clique fora, foco preso) sem tocar em `notes/*.js` (paridade byte-a-byte).
- **Recentes por mapa**: `grafo.coresRecentes = { cor|fundo|borda: [...] }` (máx. 12) — persistido no
  grafo (não no dataset, como em Notas).
- **Integração**: `#mapaCoresPaleta` entrou em `alvoInterativo` (P8 — não inicia pan/seleção) e usa
  `z-index: 2500` (> 2300 do modal de Notas, P1).

### P61 — Asset NOVO no Service Worker (bump)
- **Regra**: `./mapa/mapa-cores.js` é **asset novo** ⇒ entrou em `ESSENCIAIS` e o **`CACHE_NAME`
  v41 → v42**. Sem isso, a instalação do SW falharia/ficaria incompleta (P3/P20).

### P62 — Área do mapa VAZIA no celular (cache do SW) + blindagem visível
- **Sintoma**: no PWA instalado no celular, a área "Mapa Mental" abria **vazia** — sem a topbar
  ("Novo mapa", "Templates"…), sem `#mapaToolbar` e sem `#mapaFormatBar`. No PC (servidor local)
  aparecia tudo; o site publicado servia os **mesmos bytes** do repositório (`index.html` e
  `mapa/mapa-render.js` idênticos, `sw.js` com o mesmo `CACHE_NAME`).
- **Causa**: **cache do Service Worker** no aparelho (combinação de versões, ex.: `mapa.js` novo +
  `mapa-render.js` antigo). Sem `MapaMentalRender.montarShell` válido, `montarAreaMapa()` não montava
  nada e a área ficava vazia **em silêncio** (nenhum aviso).
- **Correção**: (1) **`CACHE_NAME` v42 → v43** (P3/P20/P61) para o aparelho descartar o cache antigo;
  (2) **blindagem** em `mapa/mapa.js`: `diagnosticoModulosMapa()` + `mostrarFalhaMapa()` mostram um
  aviso VISÍVEL (`.mapa-falha`) com "Recarregar" e "Reparar (limpar cache)" quando falta um módulo ou
  o mount falha; `montarAreaMapa()` roda em `try/catch`, liga os ouvintes **uma vez**
  (`mapaAreaOuvintesLigados`) e só marca `mapaAreaMontada` após sucesso — a área pode se recuperar.
- **Mitigação p/ novas fases**: toda mudança de asset cacheado sobe `CACHE_NAME` no MESMO commit
  (P3/P20/P61) e, ao testar logo após o deploy, abrir `/reparar.html` no aparelho para limpar o cache;
  falha de módulo NUNCA pode deixar a área vazia (aviso visível obrigatório).
- **Teste**: `tests/mapa_area.cjs` cobre a blindagem (falha visível + recuperação ao religar a área).

### P63 — Atualização do app em produção (update notification + sw.js sem cache)
- **Sintoma**: mudanças no PWA apareciam no `localhost` mas **não** no site publicado (celular/PWA).
- **Causa**: Service Worker offline-first com **cache-first**; sem um fluxo explícito de atualização,
  o cliente fica preso na versão antiga (P3). O `sw.js` também nunca pode vir do cache HTTP.
- **Correção**:
  - `sw.js`: `skipWaiting()` no install + `clients.claim()` no activate e, no `activate`,
    `postMessage({ type: 'SW_ATIVADO' })` para as abas (novo).
  - `app.js`: `installAtualizacaoPWA`/`verificarAtualizacaoSW` — deteta `updatefound`/`statechange`,
    `controllerchange` e a mensagem `SW_ATIVADO`, mostra o aviso `.app-toast.is-update`
    ("Nova versão disponível" + **Atualizar agora**) e **recarrega UMA vez**
    (`window.__notasRecarregando`); verifica atualização a cada 60 s (sessões longas).
  - `styles.css`: `.app-toast.is-update` + `.app-toast-action`.
  - `index.html`: o reload de `controllerchange` respeita `window.__notasRecarregando` (sem reload duplo).
  - `_headers`: `/sw.js` com **`Cache-Control: no-store, no-cache, must-revalidate`** (nunca retido em cache).
- **Mitigação p/ novas fases**: todo asset cacheado que muda exige **bump do `CACHE_NAME`**
  (P3/P20/P61/P62) e o `sw.js` nunca pode ser cacheado pelo host/CDN.
- **Teste**: `tests/pwa_service_worker.cjs` cobre `SW_ATIVADO`, o header `no-store` e o aviso visível.

### P64 — Asset do Service Worker (bump)
- **Regra**: mudaram `sw.js`, `app.js`, `styles.css` e `index.html` ⇒ **`CACHE_NAME` v43 → v44**.
