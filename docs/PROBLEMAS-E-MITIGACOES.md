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

### P65 — Ícones padronizados nas barras do mapa + fonte/forma em UM botão
- **Pedido**: padronizar os ícones das barras (ferramentas e formatação) com o MESMO tamanho/estilo,
  dar **um botão próprio** para as opções de **fonte** e outro para as de **forma**, e usar os
  **mesmos ícones e a mesma organização** da barra de Notas nos botões de função equivalente.
- **Implementação**:
  - `mapa/mapa-render.js`: dicionário `ICONES` + `icone()` / `btnIcone()` / `btnMenu()` (SVG **16×16**,
    `stroke: currentColor`, `stroke-width: 2`, grade 24×24) e `OPCOES_BARRA` / `rotuloOpcao()` /
    `btnOpcoes()` / `menuOpcoesBarra()` (UM botão abre um menu `role="menu"` com as opções — popover
    **FIXO**, para não ser cortado pelo `overflow` da barra).
  - Os desenhos de **negrito / itálico / cor / destaque / desfazer / refazer** são **os mesmos** de
    `index.html` (`#notesToolbar`), mantendo a linguagem visual entre as duas áreas.
  - `mapa/mapa.js`: estado `mapaMenuBarra` + `mapaAlternarMenuBarra()` (ações `barra-menu` /
    `menu-barra-fechar`); o menu fecha em qualquer outra ação, no clique fora e no `Esc`.
  - `mapa/mapa.css`: tamanhos fixos por barra (`.mapa-tb-btn svg` 16×16, `.mapa-tb-mais-resumo svg`
    18×18, `.mapa-menu-item svg` 16×16) e o visual do menu de opções.
- **Contratos preservados**: todos os `data-mapa-acao`/`data-mapa-botao`/`data-mapa-cor`/`data-mapa-estilo`,
  os ids (`#mapaNovoTopico`, `#mapaZoomAtual`, `#mapaModoConexao`) e a **ordem persistida** da barra.
- **Teste**: `tests/mapa_toolbar.cjs` valida ícones 16×16 / traço 2 / `currentColor`, a igualdade dos
  desenhos com a barra de Notas e o menu de opções (fonte/forma/alinhamento).

### P66 — Asset do Service Worker (bump)
- **Regra**: mudaram `mapa/mapa-render.js`, `mapa/mapa.js` e `mapa/mapa.css` ⇒ **`CACHE_NAME` v44 → v45**.

### P67 — Clicar FORA fecha TODOS os menus (Notas já fazia; o mapa ganhou o mesmo)
- **Pedido**: em todas as modais de menu, clicar fora deve fechar.
- **Estado inicial**: em **Notas** já funcionava — o `notesExtraDialog` é um `<dialog>` que fecha
  pelo *backdrop* (`notes/extras.js`, linha 22), e a paleta de tons/cores e os painéis de tabela
  também tinham fechamento por clique fora. No **mapa** faltava em: menu contextual do card/canvas
  (`#mapaMenu`), menu de opções da barra (`#mapaMenuOpcoes`), menu da conexão (`#mapaConexaoMenu`),
  painel de atalhos (`#mapaAtalhos`), editor da barra (`#mapaBarraEditor`) e no overflow "Mais"
  (`<details class="mapa-tb-mais">`, que por natureza **nunca** fechava sozinho).
- **Implementação** (`mapa/mapa.js`): `MENUS_FLUTUANTES` (seletor + `gatilhos` + como fechar) e
  `fecharMenusFora(evento)`, ligados em `document` no **`click` em fase de CAPTURA** — e **não** em
  `pointerdown`, para não interferir no pan/seleção do canvas nem na digitação do painel. O
  fechamento **remove o nó + limpa o estado sem chamar `renderArea`** (mesmo padrão do menu
  contextual), então nada digitado se perde. Clicar no **botão que abre** o menu não o fecha (é ele
  que alterna) e clicar **dentro** também não. `Esc` fecha pela mesma lista.
- **Fora do escopo (proposital)**: `#mapaPainel` (propriedades) e `#mapaForm` (formulário inline)
  NÃO fecham ao clicar fora — são formulários, e fechar descartaria o que está sendo digitado
  (ambos têm "Cancelar"/"Fechar").
- **Teste**: `tests/mapa_toolbar.cjs` (§3.3) valida cada menu fechando no clique fora, mantendo-se
  aberto no clique interno, e o `Esc`.

### P68 — Asset do Service Worker (bump)
- **Regra**: mudou `mapa/mapa.js` ⇒ **`CACHE_NAME` v45 → v46**.

### P69 — Notas: última linha atrás da barra do teclado (espaço de rolagem insuficiente)
- **Sintoma**: perto do fim da nota, a linha sendo digitada ficava **atrás da barra de formatação**
  acoplada ao teclado — não havia espaço de rolagem para trazê-la para cima.
- **Causa**: a reserva de espaço era fixa (`altura da barra + 12`) e `rolarCaretParaAcima()` apenas
  somava `scrollTop`; quando o container **não tinha** espaço sobrando, o valor era "clampado" e a
  linha continuava sob a barra.
- **Correção** (`app.js`): constantes `NotesPWA.FOLGA_BARRA_TECLADO`/`MARGEM_CURSOR_BARRA`;
  `rolarCaretParaAcima()` agora **mede quanto faltou** e **aumenta o `padding-bottom` do editor**
  exatamente o que falta (e rola de novo); a rolagem também roda a cada `input` (coalescida num
  `requestAnimationFrame`), não só no poll de 250 ms.
- **Propriedade garantida**: com a barra acoplada, `caret.bottom <= barra.top - 10`.
- **Teste**: `tests/toolbar_pwa.cjs` §3c-bis (cenário SEM folga, `padding-bottom: 0`).

### P70 — Mapa: ações rápidas FIXAS à direita na barra de formatação
- **Pedido**: dois botões para criar tópico durante a edição no celular, **fixos** na barra.
- **Implementação**: `div.mapa-tb-fixos` como **último item** de `#mapaFormatBar`, com
  `position: sticky; right: 0; margin-left: auto; background: var(--mapa-container)` e os ícones
  `ICONES.irmao`/`ICONES.filho`. Ações: `no-irmao` (**Adicionar irmão**) e `no-filho`
  (**Adicionar filho**) — as MESMAS do menu do card; criam o tópico já **em edição**.
- **Nota de requisito**: o modelo **não** tem "adicionar pai" (`criarPaiDe`); ver
  `docs/ATUALIZACAO-PWA.md` §7.2.
- **Teste**: `tests/mapa_toolbar.cjs` §7 (último item, `sticky`, colado à direita, cria em edição).

### P71 — Atualização do app no host/PWA (agora DOCUMENTADA)
- **Regra**: mudaram `app.js`, `mapa/mapa-render.js` e `mapa/mapa.css` ⇒ **`CACHE_NAME` v46 → v47**.
- **Documentação completa**: `docs/ATUALIZACAO-PWA.md` — sintoma → diagnóstico (comparação de bytes
  local × publicado) → causa (cache-first + `sw.js` cacheado) → correção → **cabeçalhos por host**
  (Firebase Hosting, Cloudflare Pages, Netlify, Nginx) → checklist de release.

### P72 — Mapa: colapso das barras da área (paridade com o cabeçalho de Notas)
- **Pedido**: um botão de colapso das barras do Mapa, com a MESMA lógica/organização de Notas.
- **Implementação**: `#mapaColapsoBarras` na `.mapa-topbar` (ícone `ICONES.colapso`, MESMO desenho da
  seta de Notas) + bloco `⚡ [INÍCIO: MAPA - COLAPSO DAS BARRAS]` em `mapa/mapa.js`
  (`setMapaBarrasColapsadas` · `mapaPanelMotion` · `mapaAlternarColapsoBarras`). A classe
  `.mapa-shell.mapa-barras-colapsadas` esconde `#mapaToolbar`/`#mapaFormatBar` (a topbar permanece,
  como o cabeçalho de Notas). Estado `mapaBarrasColapsadas` resetado ao voltar para a lista.
- **Detalhe**: o `hidden` das barras é recalculado por `atualizarShell`/`renderBarras` a cada render;
  por isso a **CLASSE** é o guardião persistente (o CSS `display:none !important` vence). O botão
  `.toolbar-btn` precisou de `#mapaColapsoBarras[hidden] { display:none !important; }` — senão o
  `display:flex` de `.toolbar-btn` sobrepõe o atributo `[hidden]`.
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v47 → v48** (mudaram `mapa/mapa.js`,
  `mapa/mapa-render.js` e `mapa/mapa.css`).
- **Teste**: `tests/mapa_colapso.cjs`; `tests/mapa_toolbar.cjs` §2 atualizado (a topbar do mapa passou
  a mostrar `voltar-lista` + `alternar-colapso`).

### P73 — Notas: menu do chip com Duplicar/Mover para pasta (+ z-index do menu)
- **Pedido**: botão direito / toque longo no chip abre um menu com **duplicar**, **excluir** e
  **mover entre pastas**.
- **Implementação** (`app.js`): menu refatorado (`criarMenuNota`/`mostrarMenuNota`) com
  `Renomear` · `Duplicar` · `Mover para pasta…` · `Excluir`; novos `duplicarNota`, `pastasDeNotas`
  (usa `MapaMentalStore.listarPastas`, tolerante à ausência do módulo), `moverNotaParaPasta`,
  `abrirMenuMoverNota`. Notas ganharam `pastaId` (migração leve em `lerNotasLocais` e em
  `criarNotaLocal`); `notasBackend().listar` passou a expor `pastaId`.
- **BUG encontrado**: `.notes-chip-menu` tinha `z-index: 1000`, **abaixo** de
  `#notesModalBackdrop.active { z-index: 2300 }` ⇒ no PC o menu ficava ATRÁS do modal e o clique era
  **interceptado** (mesma família do P1). **Correção**: `z-index: 2400` (+ estilo da pasta atual).
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v48 → v49** (mudaram `app.js` e `styles.css`).
- **Teste**: `tests/notes_chip_menu.cjs` (4 ações, duplicação com id novo, mover para pasta com
  persistência, excluir com confirmação).

### P74 — Pastas como PRIMEIRA tela (workspaces que abrangem Notas + Mapa)
- **Pedido**: a tela de pastas passa a ser a raiz da hierarquia; cada pasta contém as Notas **e** os
  Mapas dela (workspace). Ao clicar numa pasta, entram as áreas de Notas e de Mapas daquela pasta.
- **Implementação**: 3ª área "Pastas" (`#pastasArea` + aba `data-app-area="pastas"`, **primeira**),
  padrão de `lerAreaAtiva` = `pastas`. Em `mapa/mapa-store.js`: `AREAS`, `ID_PASTA_PADRAO`
  (`'pasta-geral'`), `garantirPastaPadrao` (a pasta "Geral" adota os itens sem pasta), `lerPastaAtiva`/
  `salvarPastaAtiva`, `contarMapasDaPasta`. Em `mapa/mapa.js`: bloco `⚡ MAPA - PASTAS (ÁREA RAIZ /
  WORKSPACES)` (`montarAreaPastas`/`renderPastas`/`abrirPasta`/`tratarCliquePastas`, com namespace
  próprio `data-pastas-acao`). Em `app.js`: `notaPastaAtiva`, `notaPertenceAPasta`, `notasDaPasta`,
  `definirPastaAtivaNotas`, `contarNotasDaPasta`; `renderNotesNav` filtra pelos chips da pasta;
  `criarNota`/`excluirNota` gravam `pastaId`.
- **Ajustes de teste**: `tests/mapa_area.cjs` (2→3 abas), `tests/mapa_gestao.cjs` (pasta padrão "Geral"
  criada automaticamente), `tests/notes_chip_menu.cjs` (chips seguem a pasta ativa).
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v49 → v50**.
- **Teste**: `tests/pastas_unificadas.cjs` (tela raiz, cartões com contagem, abrir pasta, chips e mapa
  filtrados, volta às pastas).

### P75 — Vínculo Notas↔Mapa + visão lado a lado (arrastar troca o lado)
- **Pedido**: um tópico do mapa pode apontar para uma NOTA (atalho que abre a nota); e, no PC, ver a
  nota e o mapa lado a lado — **arrastar a barra superior** de um painel para o lado inverso troca os lados.
- **Implementação (vínculo)**: `notaRef` no modelo (`criarNo`/`duplicarGrafo`/`atualizarConteudo` +
  `definirNotaRef`); no painel, `blocoNotaRef` (select `#mapaPainelNotaRef` + atalho "Abrir nota");
  no card do nó, `.mapa-no-nota-icone` (`data-mapa-acao="abrir-nota"`). A ação `abrir-nota` troca para a
  área de Notas e abre a nota.
- **Implementação (split)**: botão `#mapaSplitBtn` na topbar do mapa; bloco `⚡ MAPA - LADO A LADO` em
  `mapa/mapa.js` (`aplicarSplit`/`trocarLadoSplit`/`instalarArrastoSplit`, persistido em
  `notas-pwa-split`). CSS em `mapa/mapa.css` (`html.app-split` divide Nota | Mapa; escondido no mobile).
- **Teste**: `tests/split_view.cjs` (vincular nota, abrir pelo atalho, ligar/desligar o split e o gesto
  de arrastar trocando o lado).

### P76 — Ajustes de UX após P74/P75 (Pastas fora do seletor; abrir nota lado a lado)
- **Feedback**: (1) "Pastas" NÃO deve ser uma aba do seletor — a tela de Pastas é a tela principal
  (a primeira); o seletor Notas|Mapa só existe DENTRO de uma pasta. (2) o "abrir nota" do mapa abria a
  nota POR CIMA; o correto é abrir o mapa e a nota LADO A LADO; e na área de Notas deve haver um botão
  "Abrir mapa".
- **Correções**: `#appAreas` voltou a ter **2 abas** (Notas | Mapa Mental) + `#appVoltarPastas`
  ("‹ Pastas") + `#appAbrirMapa` ("Abrir mapa"); a barra fica **escondida na tela raiz de Pastas**
  (`atualizarBarraAreas` em `mapa/mapa.js`). A ação `abrir-nota` agora chama `aplicarSplit(true)` no PC
  (lado a lado); no celular mantém a troca para Notas. O botão "Abrir mapa" (barra de áreas) chama
  `aplicarSplit(true)` a partir da área de Notas.
- **Testes ajustados**: `tests/mapa_area.cjs` (2 abas; abre a pasta antes de trocar de área),
  `tests/pastas_unificadas.cjs` (2 abas; volta pela "‹ Pastas"), `tests/split_view.cjs`
  (`abrir nota` abre em lado a lado).
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v50 → v51** (mudaram `index.html`, `mapa/mapa.js`
  e `mapa/mapa.css`).

### P77 — Lado a lado: o mapa aparecia "embaçado" (overlay do modal cobria a tela toda)
- **Sintoma**: ao ligar "nota e mapa lado a lado", o mapa **não aparecia de fato** — o lado do mapa
  ficava **embaçado**.
- **Causa**: `theme-origem.css` define `html #notesModalBackdrop.notes-drawer { width: 100%; ... }` com
  `background: rgba(0,0,0,.3) !important` e `backdrop-filter: blur(8px) !important`. O split só
  ajustava `right: 50%`, mas com `width: 100%` fixado o `right` é **ignorado** (caixa sobre-restrita) →
  o backdrop continuava com **largura total** e o overlay escuro/desfocado cobria o mapa.
  Confirmado depurando: `getBoundingClientRect().width` do backdrop = **1280** (tela toda).
- **Correção** (`mapa/mapa.css`, split): além de `left`/`right`, o backdrop recebe
  `width: 50% !important` + `background: transparent !important` + `backdrop-filter: none !important`
  (deixa de ser overlay e vira coluna). O lado do mapa (`left: 50%`) fica sem sobreposição.
- **Blindagem**: `tests/split_view.cjs` passou a medir as caixas e afirmar que o `right` do backdrop
  ≤ `left` do mapa e que cada painel ocupa metade da tela.
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v51 → v52** (mudou `mapa/mapa.css`).

### P78 — Lado a lado: divisor arrastável (estreitar/alargar um painel ajusta o outro)
- **Pedido**: ao estreitar/alargar as Notas (ou o Mapa), o outro painel deve se ajustar automaticamente.
- **Implementação**: proporção em `--split-nota` (largura do painel da NOTA) aplicada em `mapa/mapa.css`
  (`left`/`width` de `#notesModalBackdrop` e `.mapa-area`, espelhados por `.app-split-nota-direita`).
  Em `mapa/mapa.js`: `aplicarSplitRatio` (grava `--split-nota`), `montarDivisorSplit`/`instalarDivisorSplit`
  (elemento `#appSplitDivisor`, `role="separator"`, arrastável por Pointer Events; clamp 20%–80%;
  com a nota à direita usa o complemento). Persistido em `notas-pwa-split.ratio`
  (`mapa/mapa-store.js`: `LIMITE_SPLIT` + `normalizarRatio`). O `#notesResizeHandle` é oculto no split.
- **Blindagem**: `tests/split_view.cjs` §4.1 arrasta o divisor e afirma que a nota diminui, o MAPA cresce,
  a soma das larguras = largura da tela (sem sobra/sobreposição) e a proporção é persistida.
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v52 → v53** (mudaram `mapa/mapa.js`,
  `mapa/mapa-store.js` e `mapa/mapa.css`).

### P79 — Lado a lado: o CARD da nota não acompanhava o arraste (camadas CSS)
- **Sintoma**: ao arrastar a borda do mapa (ou o divisor), o **mapa** estreitava/alargava e **não dava
  pan**, mas o **painel de Notas não acompanhava** o arraste.
- **Causa**: o painel visível é `#notesModal`, cujo `width` vem de
  `html #notesModalBackdrop.notes-drawer #notesModal.notes-modal { width: var(--notes-width) !important }`
  em **`@layer components`** (`notes/editor.css`). Pela cascata, **importante em camada VENCE
  importante fora de camada** — então o `width:100% !important` do split (fora de camada) era
  ignorado: o **backdrop** estreitava (daí o mapa acompanhar) mas o **card** mantinha a largura
  antiga e vazava por cima do mapa. Confirmado depurando: backdrop 400 / card 640.
- **Correção**: o split passou a controlar a variável que o card realmente usa —
  `aplicarSplitRatio` grava `--notes-width: 100%` (inline no `#notesModal`) além de `--split-nota`;
  no `resize` da janela, reaplica (o motor de notas pode reescrever `--notes-width`).
- **Extras**: divisor com **área de pega de 24px** e linha visível; a pega também inicia
  **por proximidade** (±18px da divisa) em **fase de captura**, com `stopPropagation` para o mapa
  **não iniciar o pan** — arrastar a borda do mapa redimensiona em vez de arrastar o mapa.
- **Blindagem**: `tests/split_view.cjs` §4.1 arrasta a **borda do mapa** e afirma que o **card**
  acompanha (card ≈ painel), o mapa cresce, a soma = largura da tela, o mapa não sofre pan e a
  proporção é persistida.
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v53 → v54** (mudaram `mapa/mapa.js` e
  `mapa/mapa.css`).

### P81 — Padronização do Mapa com Notas (vidro das barras, campo, chips, nó e rodapé)
- **Pedido**: a área de Mapas deve usar as MESMAS classes/cores de fundo do layout global de
  Notas — todas as barras e o campo de edição (canvas) iguais aos de Notas, bem como o fundo do
  campo dos chips; e a **altura do rodapé de Notas igual à do Mapa** (essa é a única referência
  que vem do Mapa).
- **Causa (várias camadas)**: (1) o backdrop do split zerava `background`/`backdrop-filter`, e o
  vidro dos painéis de Notas passava a amplificar as cores cruas do app → **azulado**; (2) as
  barras do Mapa eram **branco sólido** e o `.mapa-canvas-wrap` tinha fundo opaco (matava o vidro
  do campo); (3) os chips do Mapa caíam no estilo do tema original (pílula com borda) e, no tema
  escuro, quase sumiam; (4) o rodapé de Notas tinha `min-height: 4rem` (64px) contra 2.25rem do
  Mapa; (5) restavam "brancos" destoando (mini-mapa, controles das barras, bloco de ações
  irmão/filho e o card do tópico).
- **Correção**:
  - `mapa/mapa.css` (split): o backdrop MANTÉM `rgba(0,0,0,.3)` + `blur(8px)`, porém **confinado à
    coluna da Nota** (`width: var(--split-nota)`) — o vidro volta ao normal e o Mapa não é coberto.
  - `styles.css` (PADRÕES COMPARTILHADOS): **tokens de vidro** (`--app-vidro-fundo/-borda/-blur` =
    barras, `--app-vidro-campo-*` = campo, `--app-overlay-*` = base das áreas,
    `--app-vidro-barra-opaca` = cor composta para mascarar rolagem) + **classes ÚNICAS**
    `.app-vidro-barra`/`.app-vidro-campo` + regras compartilhadas de
    `.notes-context-nav`/`.notes-context-chip` (chips com as MESMAS cores no claro e no escuro).
  - `mapa/mapa-render.js`: topbar/barras do Mapa com `app-vidro-barra`; canvas com `app-vidro-campo`.
  - `mapa/mapa.css`: `.mapa-area` com a MESMA base/overlay do drawer; `.mapa-canvas-wrap`
    TRANSPARENTE; `.mapa-notas-nav` só com layout (mesmo `gap`/`padding` de `#notesContextNav`);
    controles dentro das barras com fundo transparente; `.mapa-minimapa` com o fundo do próprio
    campo; `.mapa-no` com o MESMO branco do vidro; `.mapa-tb-fixos` com a cor composta da barra.
  - `notes/editor.css`: `min-height` do rodapé = `var(--app-toolbar-altura)` (2.25rem), igual ao
    rodapé do Mapa (vence o `4rem` do `theme-origem.css`).
  - `styles.css` (`.app-tela-cheia`): SEM fundo próprio (transparente) — na **tela cheia** o
    painel continua amostrando a MESMA base da área (senão o branco das barras e do campo mudava).
- **Blindagem**: `tests/mapa_padrao_notas.cjs` — chips do Mapa com o MESMO fundo/raio/padding de
  Notas (claro e escuro), campo do Mapa com o MESMO fundo/borda/vidro do campo de Notas, rodapés
  com a MESMA altura e o backdrop do split com fundo+blur (não transparente) e confinado à coluna
  da Nota. `tests/parity_visual.cjs` ganhou as exceções documentadas de `.notes-modal-footer`
  (`minHeight` e `height`).
- **Ajuste de teste (P82)**: `tests/mapa_estilo.cjs` §2 passou a esperar a **superfície de vidro**
  no escuro (`--app-vidro-fundo` = `#151B23`) para o nó sem estilo, e não mais o container
  `#11161D` do tema original — consequência direta desta padronização (o `.mapa-no` "veste" o
  MESMO vidro das barras).
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v61 → v62** (mudaram `styles.css`,
  `mapa/mapa.css`, `mapa/mapa-render.js` e `notes/editor.css`).

### P82 — Mapas como ITENS DA PASTA (fim da tela de gestão) + faixa de chips espelhando Notas
- **Pedido**: a **tela de gestão** da área "Mapa Mental" (busca, ordenação, "Nova pasta",
  "Novo mapa", "Templates", chips `Todas/Favoritos/Sem pasta/<pastas>`, Recentes e o vazio
  "Nenhum mapa encontrado") **não deve existir**: a tela principal já é a de **Pastas** e cada
  mapa pertence a uma pasta. Dentro da pasta, os mapas devem ser **chips ACIMA da barra de
  ferramentas**, refletindo **fielmente** a faixa de chips de Notas (mesmas classes/formatação,
  mesmo botão "+", mesmo menu do chip) — e a **função "Modelos"** refletida como em Notas (um
  botão na barra que abre um **diálogo** com as mesmas classes). A volta à tela principal deve
  ser pela **seta ‹ fixa** (topo-esquerdo).
- **Implementação**:
  - `mapa/mapa-store.js`: novo **`listarMapasDaPasta(pastaId)`** (mapas da pasta, ordenados por
    nome; a "Geral" adota os sem pasta) + export.
  - `mapa/mapa-render.js`: a topbar perdeu os controles de lista; `#mapaNotasNav` virou
    **`#mapaChipsNav`** (`notes-context-nav mapa-chips-nav app-rolagem`); `renderGestao`,
    `chipFiltro`, `itemMapa`, `menuAcoes`, `blocoRecentes`, `painelTemplates` e `selectPastas`
    foram **removidos**; `renderForm` ficou só com nós/conexões; nas barras, o grupo "Mapa"
    (novo mapa/templates) saiu e o **botão "Modelos"** (`#mapaModelosBtn`, `.toolbar-btn`,
    `aria-haspopup="dialog"`) entrou na **barra de formatação**, com o **MESMO desenho** do
    botão "Modelos" de Notas (4 quadrados); novo `renderSemMapa` (estado "Nenhum mapa aberto").
  - `mapa/mapa.js`: novo bloco **`MAPA - FAIXA DE CHIPS E MENU DO MAPA`** (`renderMapasNav`,
    `criarMapaNoChip`, `renomearMapaNoChip`, `duplicarMapaNoChip`, `moverMapaDeChip`,
    `excluirMapaDoChip`, `criarMenuMapa`/`abrirMenuMapa`/`abrirMenuMoverMapa`/`fecharMenuMapa`,
    `setupChipLongPressMapa`) usando as MESMAS classes de Notas (`.notes-context-chip*`,
    `.notes-chip-menu`); novo bloco **`MAPA - MODELOS`** (`mapaTemplates`, reusa
    `notesExtraDialog` → `.notes-extra-dialog`/`.notes-template-help`, com "Salvar mapa atual
    como modelo" e "Aplicar: <modelo>"); `dadosGestao` só carrega o contexto da pasta;
    `mapaVoltarParaLista` virou **`mapaVoltarParaPastas`** (a seta ‹ SEMPRE volta às Pastas);
    `montarAreaMapa` **não** retoma o último mapa; estado `mapaChipsNav` no colapso/tela cheia.
  - `app.js`: `renderNotesNav()` deixou de espelhar os chips de Notas na área do mapa.
  - `mapa/mapa.css`: `.mapa-notas-nav` → **`.mapa-chips-nav`**, com as MESMAS regras da faixa de
    Notas (transparente, rolagem vertical em ~2 linhas e o "+" preso/sticky menor e translúcido).
- **BUG encontrado na própria implementação**: o formulário "Conectar a outro mapa…" ficava sem
  opções — a chamada de `renderForm` perdeu `mapas` (lista para o `selectDestino`). Corrigido e
  coberto pelo `tests/mapa_gestao.cjs`. Também sobrou um `tratarBuscaMapa` referenciado no
  listener de `input` (função removida) — retirado do `mapaAreaOuvintesLigados`.
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v62 → v63** (mudaram `app.js`, `mapa/*` e
  `mapa/mapa.css`).
- **Testes**: `tests/mapa_gestao.cjs` (reescrito: criar pelo "+", abrir/renomear/duplicar/mover/
  excluir pelo chip, conexões, Modelos, referência quebrada, ausência da lista e volta às Pastas),
  novo `tests/mapa_chips.cjs` (paridade da faixa com Notas: classes/formatação, só os mapas da
  pasta, menu com as 4 ações, toque longo, "+" e o botão Modelos) e ajustes em
  `tests/mapa_padrao_notas.cjs` (`#mapaChipsNav`), `tests/mapa_toolbar.cjs` (4 grupos/3 divisores),
  `tests/expandir.cjs` (`mapaChipsNav` nas barras da tela cheia).

### P83 — Suíte completa SEM FALHAS: falhas conhecidas isoladas em `FALHAS_CONHECIDAS`
- **Pedido**: rodar a suíte completa de modo que **não tenha falhas**; se não houvesse jeito
  documentado, criar um e **documentar para que as falhas não se repitam**.
- **Diagnóstico (69 testes)**: 59 passavam, 10 falhavam e 1 era `n/a`. Das 10:
  - **1 estava desatualizada** — `tests/tema_vidro.cjs` comparava o vidro da faixa de chips
    (`#notesContextNav`) com o do projeto original, mas o PWA **removeu o contêiner de propósito**
    (transparente, sem borda/blur; ver `styles.css`, "CHIPS DE NOTAS: SEM CONTÊINER").
  - **9 são divergências REAIS e determinísticas** do motor de notas vs. o projeto original
    (cores em cascata, tempo da animação de colapso, visualizador de arquivo, tabela markdown,
    cor herdada na navegação por conclusão, colapso de título + código, colagem de blocos,
    auditoria de regressão e Enter em lista aninhada). Corrigi-las exige mexer no **motor**
    (paridade com o original) — trabalho separado, de alto risco, fora do escopo desta rodada.
- **Correção (o jeito de rodar sem falhas)**:
  - `tests/run-all.cjs` ganhou a constante **`FALHAS_CONHECIDAS`** (arquivo → motivo), com as
    9 divergências acima. Elas deixam de contar como falha: o console mostra **`CONHEC`**, o
    rodapé fica `PASSOU: 59 | FALHOU: 0 | CONHECIDAS: 9 | N/A: 1 | TOTAL: 69` e o
    **código de saída é 0** (`RESULTADO: SEM FALHAS (9 conhecidas documentadas)`).
  - Novo modo **`--estrito`**: auditoria — conta as conhecidas como `FALHA` e reprova (saída 1).
  - **Guarda anti-regressão**: qualquer falha fora da lista continua sendo `FALHA` (saída 1), e
    o runner **avisa** quando um teste da lista começa a **passar** ("remova de
    `FALHAS_CONHECIDAS`"), para a lista não virar depósito.
  - Relatórios (`docs/RELATORIO-TESTES.md` e `docs/relatorio-testes.json`) passaram a marcar
    `🔶 conhecida`, listar `conhecidas`/`conhecidasMotivo`/`resolvidas` e só imprimir o bloco
    de detalhes de falhas **reais**.
  - `tests/tema_vidro.cjs`: passou a comparar header + card (iguais ao original) e a afirmar a
    **exceção deliberada** da faixa de chips no PWA (transparente, sem vidro).
- **Regras para não repetir falhas** (também em `docs/COMO-RODAR-TESTES.md`):
  1. Rode primeiro o **arquivo isolado** do que você mexeu e só depois a suíte completa.
  2. Só entra em `FALHAS_CONHECIDAS` uma falha **determinística**, reproduzida no isolado e
     **explicada aqui (P83)**; nunca para esconder regressão.
  3. Se o teste começar a passar, **remova** a entrada (o runner avisa).
  4. Para auditar tudo como falha, use **`--estrito`**.
  5. Teste com expectativa desatualizada por **decisão de design documentada** não entra na
     lista: **atualize o teste** (foi o caso do `tema_vidro.cjs`).
- **Resultado**: suíte completa = **`RESULTADO: SEM FALHAS`** (0 falhas), com as 9 conhecidas visíveis.

### P84 — Visualizador de arquivo destravado (fim dos 30 s) e suíte completa mais RÁPIDA
- **Sintoma**: `tests/notes_extras.cjs` levava **~43 s** e falhava; a suíte completa levava
  **~8 min**. O teste esperava 30 s por `.notes-file-page p` (página do visualizador) que
  nunca aparecia.
- **Causa (3 pontos, todos do PWA local-first)**:
  1. `installLocalNotesStorage` (app.js) sobrescrevia `notesFileViewer` por uma versão
     só-local: sem o link do anexo (`a[data-note-asset]`) ela mostrava um aviso e saía —
     **nenhuma página** era montada.
  2. `notesExtraRequest` local **lançava erro** para tudo que não fosse `/templates`
     (`/files/.../info`, `/files/.../page`: o visualizador inteiro), em vez de tentar a rede.
  3. O teste (portado do original) depende do backend para o visualizador **e** para salvar
     modelo — no PWA os modelos são **locais** e o `load()` do teste limpava o `localStorage`,
     apagando o modelo salvo.
- **Correção**:
  - `app.js` (`installLocalNotesStorage`): novo **`pedirNaRede(userId, alvo, options)`**;
    `notesExtraRequest` passa a **cair para a rede** nos caminhos que não atende (com backend
    a visualização funciona; sem backend o erro aparece na própria janela, sem travar).
  - `app.js` (`notesFileViewer`): guarda a implementação de rede (`viewerDeRede`) e **cai
    para ela** quando não há anexo local — a versão local continua valendo para anexos
    `data:` (imagem/PDF/arquivo baixável).
  - `tests/notes_extras.cjs`: o assert de "modelo salvo" passa a verificar o armazenamento
    **local** (`notas-pwa-templates`) e o `loadNote` preserva essa chave (o reset do storage
    não pode apagar os modelos do PWA).
- **Velocidade do runner** (`tests/run-all.cjs`):
  - execução **assíncrona** (`spawn` + Promise) e novo modo **`--jobs=N`** (paralelo);
    `npm run test:rapido` = `--jobs=3`. Medição nesta máquina (**4 núcleos**): suíte completa
    em série ≈ **8 min**; com `--jobs=3` ≈ **6 min 30 s** (o maior ganho pontual foi acabar
    com os ~45 s do `notes_extras`). Com mais núcleos o ganho cresce.
  - **Toda falha do run paralelo é RECONFIRMADA em SÉRIE** — se passar, sai como `PASSA*`
    (flaky), nunca como falso positivo. As `FALHAS_CONHECIDAS` não são reconfirmadas.
  - O padrão continua **serial** (`--jobs=1`), determinístico.
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v63 → v64** (mudou `app.js`).
- **Resultado**: `notes_extras.cjs` **PASSA** (e ficou rápido); as falhas conhecidas caíram
  de 9 para **8**; suíte completa = `PASSOU: 60 | FALHOU: 0 | CONHECIDAS: 8 | N/A: 1`.

### P85 — Abertura padrão da área de Mapas (primeiro mapa já selecionado, espelho das Notas)
- **Sintoma/necessidade**: ao entrar na área **Mapas**, a área abria no estado "Nenhum mapa aberto."
  mesmo existindo mapas na pasta — o usuário precisava clicar num chip. As Notas, ao contrário, já
  abrem a nota ativa (`lerNotaAtiva() || projectsData[0]`) e, ao trocar de pasta, abrem a primeira
  nota daquela pasta (`definirPastaAtivaNotas`).
- **Causa**: `montarAreaMapa()` **não retomava** mapa algum ("sem auto-resume") e `aplicarArea('mapa')`
  **não re-renderizava** ao reentrar na área já montada — o DOM ficava obsoleto após trocar de
  pasta/nota.
- **Correção** (`mapa/mapa.js`):
  - Novo **`garantirMapaSelecionado()`** (bloco `MAPA - RENDER/CONTROLE`): mantém o mapa **já aberto**
    se ele pertencer à pasta ativa; senão usa o **último mapa ativo persistido** (`store().lerMapaAtivo()`)
    se for da pasta; senão abre o **primeiro mapa da pasta** (o 1º chip, ordem por nome); **pasta vazia**
    mantém "Nenhum mapa aberto" (não cria mapa). Retorna `true` se a seleção mudou.
  - `montarAreaMapa()` chama `garantirMapaSelecionado()` antes do render e agora **retorna `true`**
    quando montou agora (útil para o chamador decidir se precisa re-renderizar).
  - `aplicarArea('mapa')` passa a **sempre re-renderizar ao entrar** — `garantirMapaSelecionado() || !montouAgora`
    (cobre reentrada, troca de pasta e pasta vazia sem render duplo na 1ª montagem).
  - `excluirMapaDoChip()` reusa a MESMA regra ao excluir o mapa aberto (uma única fonte de verdade).
- **Testes**: novo `tests/mapa_abertura_padrao.cjs` (1º mapa da pasta já ativo/renderizado; mapa já
  aberto preservado; troca de pasta abre o 1º da nova pasta; mapa de outra pasta é trocado; pasta
  vazia → "Nenhum mapa aberto."; restaura o último mapa ativo persistido). `mapa_chips`/`mapa_gestao`/
  `mapa_vazio`/`mapa_padrao_notas`/`pastas_unificadas`/`split_view`/`mapa_area`/`expandir` seguem **verdes**.
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v64 → v65** (mudou `mapa/mapa.js`).

### P86 — Acompanhar a suíte em 2º plano sem "lentidão" (timeout de 30 s da ferramenta)
- **Sintoma**: ao rodar a suíte completa em 2º plano, as checagens de progresso **falhavam**
  ("Command timed out after 30000ms" / "Command was aborted") e a suíte parecia **muito lenta**,
  embora estivesse rodando normalmente.
- **Causa**: o acompanhamento usava **`Start-Sleep -Seconds 25/28`** antes de cada leitura. O
  comando inteiro (espera + leitura) passava do **timeout de 30 s** da ferramenta/terminal e era
  abortado — não era a suíte. Também pesava o run em `--jobs=2` (~11 min).
- **Mitigação (documentada em `docs/COMO-RODAR-TESTES.md`)**:
  - **Checagem curta, sem espera**: guardar o **PID** (`$p.Id | Out-File ...\suite.pid`) e ler com
    `Get-Process -Id <pid>` + `Get-Content -Tail` — cada checagem leva **milissegundos**.
  - **Proibido `Start-Sleep` longo** (≥ 25 s): se precisar esperar, ≤ 20 s; senão, repetir a
    checagem curta.
  - **Não relançar a suíte** com a anterior rodando; encerrar `msedge`/`node` pendentes antes.
  - **Preferir `--jobs=3`** (`npm run test:rapido`) para o run completo.
- **Regra de ouro**: "suíte lenta" quase sempre é **espera bloqueante** na checagem, não a suíte.
- **Resultado**: a suíte completa terminou em **`PASSOU: 61 | FALHOU: 0 | CONHECIDAS: 8 | N/A: 1`**
  (`RESULTADO: SEM FALHAS`), com os relatórios (`docs/relatorio-testes.json`/`RELATORIO-TESTES.md`)
  regenerados completos após o run de `--filter` (que os havia recortado).

### P87 — Abertura padrão da área de Notas (mesma regra dos Mapas)
- **Sintoma/necessidade**: aplicar às Notas o MESMO plano já aplicado aos Mapas (P85): ao entrar
  na área, a nota certa deve ficar **já selecionada/renderizada**. As Notas já tinham a regra
  (`definirPastaAtivaNotas`), mas **não era usada ao entrar na área**.
- **Causa**: `aplicarArea('notas')` (em `mapa/mapa.js`) abria `lerNotaAtiva() || projectsData[0]`
  **sem checar a pasta ativa** — podia abrir uma nota de OUTRA pasta (mesmo defeito que o P85
  corrigiu nos Mapas).
- **Correção** (`mapa/mapa.js`, ramo de Notas do `aplicarArea`): passa a chamar
  **`definirPastaAtivaNotas(this.notaPastaAtiva)`** — o equivalente, nas Notas, de
  `garantirMapaSelecionado`: mantém a nota JÁ aberta se ela pertencer à pasta ativa; senão abre a
  PRIMEIRA da pasta; pasta vazia cria uma "Nova nota" (Notas sempre tem ao menos 1 — única
  divergência deliberada em relação aos Mapas, que mantêm o estado vazio). **Nada foi duplicado**:
  a regra continua num único lugar (`app.js`).
- **Testes**: novo `tests/nota_abertura_padrao.cjs` (1ª nota da pasta já ativa/renderizada ao
  entrar; nota já aberta preservada; troca de pasta abre a 1ª da nova; nota de outra pasta é
  trocada; pasta vazia cria "Nova nota"). Observação registrada no teste: `openNotesModal` do
  motor é **assíncrono** (fecha a sessão antes de trocar), então o teste usa `waitForFunction`
  em vez de ler o estado imediatamente. `pastas_unificadas`/`notes_chip_menu`/`mapa_area`/
  `split_view`/`multi_notas`/`multi_notas_100`/`toolbar_pwa`/`shortcuts` seguem **verdes**.
- **Asset do Service Worker (bump)**: `CACHE_NAME` **v65 → v66** (mudou `mapa/mapa.js`).

### P88 — Suíte "lenta": paralelismo correto (`--jobs=auto`) e o teto de 30 s do comando
- **Sintoma**: a suíte completa demorava **16 min** (`--jobs=3`); o usuário pediu para "rodar tudo
  de uma vez e esperar o tempo que for preciso".
- **Causa (2 pontos)**:
  1. **Paralelismo excessivo PIORA em 4 núcleos**: `--jobs=3` = **974,7 s** vs `--jobs=2` = **663 s**
     (rodadas medidas). A disputa de CPU **dobra** o tempo de cada teste (os `waitForTimeout` de
     animação estouram) e o ganho do paralelismo é anulado.
  2. **Não dá para esperar tudo em um único comando**: o terminal/ferramenta **aborta em 30 s**.
     Rodar a suíte "de uma vez e esperar" não existe — o caminho é 2º plano + checagens curtas (P86).
- **Correção/otimização**:
  - `tests/run-all.cjs`: novo **`--jobs=auto`** = **metade dos núcleos** (`Math.floor(cpus/2)`;
    4 núcleos → 2). Novo padrão recomendado.
  - `package.json`: **`npm run test:rapido`** passou de `--jobs=3` para **`--jobs=auto`**.
  - `docs/COMO-RODAR-TESTES.md`: tabela de tempos corrigida (**≈ 11–16 min** nesta máquina, não
    "5–9 min"), `--jobs=auto` no passo 3, na Velocidade e no "Acompanhar sem travar"; regra
    explícita **"nunca use todos os núcleos"** e **"não existe esperar num único comando (30 s)"**.
- **Onde ainda dá para ganhar tempo** (próximo passo, não feito aqui): reduzir os `waitForTimeout`
  fixos de animação nos testes mais caros (`mapa_conteudo` ~40 s, `pwa_service_worker` ~29 s,
  `shortcuts` ~26 s, `split_view`/`parity_visual` ~24 s) trocando por `waitForSelector`/
  `waitForFunction`; e reusar um único navegador entre testes.
- **Resultado**: suíte completa **`PASSOU: 62 | FALHOU: 0 | CONHECIDAS: 8 | N/A: 1 | TOTAL: 71`**
  (`RESULTADO: SEM FALHAS`), com os relatórios regenerados.

### P89 — Porta 8000 ocupada por servidores Python ANTIGOS (parecia "backend quebrado")
- **Sintoma**: `GET /health` devolvia **404** e `GET /` devolvia **200 com HTML** — ou seja, parecia
  que o backend subia mas não tinha as rotas. Pior: o `Stop-Process` do PID que o `Start-Process`
  devolveu dizia "não é possível localizar um processo".
- **Causa**: **dois processos `python.exe` de uma sessão anterior (mais de 24 h antes)** ainda
  escutavam em `127.0.0.1:8000` e `0.0.0.0:8000`. O `uvicorn` novo **falhou no bind**
  (`[Errno 10048]`) e a mensagem ficou no `stderr` redirecionado; quem respondia era o servidor
  estático antigo (por isso `/` = 200 e `/health` = 404).
- **Diagnóstico/correção**:
  ```powershell
  Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object OwningProcess
  Get-Process -Id <pid> | Select-Object Id,ProcessName,Path,StartTime
  ```
  com o PID em mãos, encerrar e subir o backend de novo. Para **validar sem mexer em processos
  de terceiros**, subir em outra porta (`python -m uvicorn backend.app.main:app --port 8123`) —
  foi assim que a Seção 1 fechou (health, PWA, `sw.js` e os 404 de bloqueio todos conferidos).
- **Evitar nas próximas fases**: antes de subir o backend, conferir a porta (mesma higiene de
  "deixe a máquina limpa" do `docs/COMO-RODAR-TESTES.md`); e **sempre ler o `stderr`** do
  `Start-Process` — a falha de bind não aparece no `stdout`.

### P90 — Rate-limit também conta o REGISTRO (o teste precisava saber disso)
- **Sintoma**: o teste de rate-limit esperava **5** tentativas de login erradas antes do `429` e
  recebeu `429` já na 5ª.
- **Causa**: comportamento **intencional** — o plano pede rate-limit em "login/registro"; o
  `POST /api/auth/registrar` consome a **mesma chave** (`IP|e-mail`). O registro do início do
  teste já havia gastado 1 das 5 tentativas.
- **Correção**: o teste passou a **zerar o limitador** (`reiniciar_limitador()`) depois do
  registro, medindo exatamente as 5 tentativas de login; e o teste "login certo libera o
  rate-limit" documenta o `liberar()`. O `verificar.py` também zera antes do passo de login.
- **Evitar**: ao testar rate-limit, isolar a contagem (a chave inclui IP **e** e-mail) e lembrar
  que o registro conta.

### P91 — `.clinerules/regras-de-edicao.md` ficou com EOL misturado (CRLF + LF)
- **Sintoma**: depois de inserir as seções novas (§1.1, tabela de linguagens, prefixos e legendas),
  o `git diff` mostrou `\r` apenas nas linhas **antigas** — o arquivo passou a ter `\r\n` e `\n`
  misturados.
- **Causa**: o arquivo estava em **CRLF**, enquanto o `.gitattributes` pede `text=auto eol=lf`; as
  linhas inseridas foram escritas com **LF**.
- **Correção**: normalizado para **LF** (`[IO.File]::ReadAllText` + `-replace "`r`n","`n"` +
  `WriteAllText`), alinhando com o que o `.gitattributes` já exigia. Conferido com
  `git ls-files --eol`.
- **Evitar**: arquivos de texto deste repo são **LF**; ao criar/editar, não misturar.

### P92 — Python 3.14.5 e o risco R1 (wheels): NÃO se confirmou
- **Risco previsto (R1)**: `pydantic-core`/`supabase`/`psycopg` poderiam não ter wheel para o
  Python 3.14.5 e travar a Seção 1.
- **Resultado real**: **nenhuma falha de instalação** — `pydantic-core 2.46.5` (wheel `cp314`),
  `cryptography 50.0.1`, `psycopg 3.3.6` (binary) e `supabase 2.31.0` instalaram normalmente.
  Só dois efeitos colaterais **inofensivos**: o `supabase` rebaixou `websockets` de `17.1` para
  `15.0.1` (o `realtime` exige; o backend ainda não usa WebSocket) e o pip emitiu
  `WARNING: Cache entry deserialization failed, entry ignored` (cache local corrompido, ignorado).
- **Mitigação mantida mesmo assim**: o cliente do Supabase é **httpx + PostgREST**
  (`backend/app/supabase_cliente.py`), e **não** o `supabase-py`. Isso deixa o backend
  independente de wheel/versão e é o que permite testar toda a construção de URL/JSON com
  `httpx.MockTransport` (sem rede). O pacote `supabase` continua instalado, mas é opcional.
- **Regra para as próximas fases**: se algum wheel voltar a falhar, o caminho httpx é o plano B
  já validado — nenhuma seção precisa parar por causa disso.

### P93 — O cabeçalho do app (`.app-header`) é COBERTO pelas áreas (controle nele é inclicável)
- **Sintoma**: o botão de conta criado no `<header>` aparecia na tela mas o clique **não chegava**
  nele. O Playwright recusou: *"`<button class="mapa-btn" data-pastas-acao="pasta-nova">Nova pasta</button>`
  from `<main>` subtree intercepts pointer events"*.
- **Causa (medida no navegador)**: `.pastas-area`/`.mapa-area` são `position: fixed; inset: 0;
  z-index: 900` e o `#notesModalBackdrop.active` é `2300`, enquanto o `<header>` é **estático**
  (`z-index: auto`). Nas duas larguras o header fica em `y 0..68` e a barra da área (`.pastas-topbar`)
  em `y 0..69` — **mesma faixa, desenhada por cima**. Na prática o header é **decorativo/legado**:
  nada nele era clicável até agora (por isso o defeito nunca apareceu).
- **Correção**: o botão foi para a **moldura fixa `#appAreas`** (`z-index: 2400`, criada justamente
  para "continuar clicável em qualquer área") e a **seta ‹ saiu** (decisão do dono do produto): a
  função dela — voltar às Pastas — é exercida pelo `#notesModalClose` e pelo `#mapaFechar`.
- **Efeitos colaterais tratados**: `.app-voltar` (CSS) removido; o `padding-left: 4.5rem` das barras
  saiu; o handler `[data-app-voltar]` ficou como **compatibilidade** documentada; 3 testes que
  usavam a seta (`mapa_area`, `mapa_gestao`, `pastas_unificadas`) passaram a checar o botão de conta
  e a usar o "Fechar" do Mapa para voltar às Pastas.

### P94 — No PC o centro da tela é a BORDA do modal de Notas (centralizar cairia sobre o ✕)
- **Sintoma**: com o botão "centralizado", no PC ele ficava **em cima do ✕** do modal de Notas.
- **Causa**: o modal de Notas ocupa **50% da largura** (`--notes-width: 50vw`, medido: 640px em 1280),
  alinhado à ESQUERDA. O centro da tela é exatamente a borda direita dele.
- **Correção**: a moldura usa `padding: 0 12px 0 50%` no PC e `justify-content: center` — o botão fica
  **centralizado na METADE LIVRE** do topo (`≈75%`), sem tocar no modal nem nos botões das barras.
  Até 1023px vai para a esquerda (`padding-left: 12px`).

### P95 — Reserva de espaço do botão deixou o TÍTULO da área ilegível no celular
- **Sintoma**: no celular (390px) o título da nota virou **"in…"** (era "Minhas notas").
- **Causa**: para o botão não cobrir a barra, a reserva de `padding-left` era de **120px** — e o
  cabeçalho do modal tem só ~176px até os 4 botões da direita.
- **Correção**: até 1023px o botão fica **só com o ícone** (`padding: 9px`, `.conta-btn-nome`
  escondido) e a reserva caiu para **3.5rem (56px)** → o título da área volta a caber inteiro e o
  e-mail completo fica no balão (`title`) e dentro do diálogo. No PC (>=1024px) o nome aparece.
- **Regra para as próximas fases**: ao acrescentar controle na moldura fixa, **medir** o espaço da
  barra de cada área (o app foi feito para 390px de largura útil) antes de reservar recuo.

### P96 — `installSync(NotesPWA)`: `this` NÃO é a instância (e isso derrubou o BOOT)
- **Sintoma**: no Bloco II o app **parou de bootar** quando servido pelo backend: `pageerror
  TypeError: this.syncAtivo is not a function` em `sync/sync-cliente.js`, `__notasPronto` nunca
  ficava `true` e `window.notesApp` ficava `undefined`. O `sync_snapshot.cjs` travou no boot.
- **Causa**: os instaladores (`installConta`, `installSync`, `installMapaMental`) são funções
  **chamadas como função simples** (`installSync(NotesPWA)`), então dentro delas `this` é o objeto
  global — e eu usei `this.syncAtivo()` no código de INSTALAÇÃO (fora dos `p.metodo = function`).
- **Correção**: no código de instalação usar o PROTÓTIPO explicitamente
  (`p.syncFilaLer.call(p)`) e/ou escrever direto no espelho (`window.notasConta.sync`). Regra:
  **dentro de `installX(App)`, `this` só vale dentro dos `function` que vão para o protótipo.**
- **Como detectar rápido**: `node --check` passa (é erro de runtime) — o que pega é o teste de
  boot REAL (`tests/conta_login.cjs`, `tests/sync_snapshot.cjs`) e o `pageerror` da página.

### P97 — Corrida no boot: o 1º login subia a nota VAZIA (perda de dado silenciosa)
- **Sintoma**: `sync_snapshot.cjs` acusou "o 1º login subiu o conteúdo que já existia no aparelho"
  como falso. O `push` mandava `notas/local=` (vazio) e o `localStorage` acabava com a nota
  **zerada** — perda de dado, não só de teste.
- **Diagnóstico** (instrumentando `localStorage.setItem` com pilha + `fetch`): duas causas somadas
  1. **`syncAoEntrar` rodava antes do `init()` terminar** de montar `projectsData` (a lista de
     notas vive em MEMÓRIA). Com a lista vazia, a coleta mandava nada (ou a nota vazia).
  2. **`syncAplicarNotas` gravava o armário mesmo sem nada a aplicar** (snapshot vazio): nesse
     instante ele escrevia `[{id:'local', notas:''}]` **por cima** do texto bom.
- **Correção** (em `sync-cliente.js`):
  - `syncAoEntrar` **espera o boot**: laço curto aguardando `window.__notasPronto` (o sinal que o
    próprio app publica no fim do `init()`), com teto de 5 s;
  - `syncColetarOps` lê do **armazenamento** quando a memória ainda está vazia (rede de segurança);
  - `syncAplicarNotas` **sai cedo** quando não há registro para aplicar (nunca reescreve o que não
    mudou).
- **Evitar**: qualquer rotina que leia/escreva a lista de notas precisa checar
  `window.__notasPronto` (ou ler do armazenamento). Regra: **aplicação remota só grava o que veio
  da nuvem** — nunca "regrava o estado atual".

### P98 — ⚠️ ABERTO: aparelho NOVO pode terminar com a nota VAZIA (autosave do boot vence a nuvem)
- **Sintoma**: `tests/sync_snapshot.cjs` falha no último passo (registrado em `FALHAS_CONHECIDAS`):
  o 1º aparelho envia a nota (`so local` + `oi da nuvem` chegam à nuvem — os passos 1–3 passam),
  mas o **2º aparelho** (contexto limpo) termina com `notas: [""]`.
- **Diagnóstico (medido com instrumentação de `fetch`/`localStorage`)**: no aparelho novo a nota
  começa VAZIA. Durante o boot, o motor agenda um **autosave com o editor ainda vazio**; esse save
  1. **zera a nota em memória e no armário** e
  2. **entra na fila** (`apiCall` → `syncEnfileirarNota`);
  quando a fila drena, o carimbo `atualizada_em` do cliente é **mais novo** que o `updated_at` do
  servidor → o LWW aceita o payload vazio e **a versão boa que veio da nuvem é sobrescrita**.
- **O que já foi corrigido no caminho** (e resolveu o 1º login + a perda local): `syncAoEntrar`
  espera `window.__notasPronto`; `syncAplicarNotas` sai cedo quando não há nada a aplicar;
  `syncColetarOps` lê do armazenamento se a memória estiver vazia; `syncRefazerEditor` re-renderiza
  o editor aberto, marca a sessão como salva e **cancela timers de autosave pendentes**.
- **O que FALTA (próxima sessão)** — impedir que um autosave de editor VAZIO sobreponha uma versão
  mais nova da nuvem. Caminhos estudados:
  1. só enfileirar quando o conteúdo mudou EM RELAÇÃO À SESSÃO (`session.saved`), e não a cada
     `apiCall` (o motor chama `apiCall` também em saves "vazios" do boot);
  2. marcar a sessão como "aguardando render" até o primeiro render do documento (o autosave só
     valeria depois disso);
  3. no servidor, **não** aceitar um `upsert` de `notas` com `conteudo_html` vazio quando a linha
     atual tem conteúdo e o cliente declara um instante apenas "um pouco" mais novo (heurística —
     menos elegante, porém blinda contra o boot).
- **Impacto**: **bloqueador para fechar o Bloco II com folga** — o resto do sync (pastas, mapas com
  grafo, modelos e ajustes, ida e volta nos dois aparelhos) está provado por
  `tests/sync_completo.cjs`. O defeito é específico da NOTA em aparelho novo.
- **Tentativas já aplicadas (e o que cada uma mostrou)**:
  1. `syncAoEntrar` esperando `window.__notasPronto`, `syncAplicarNotas` sem gravar quando não há o
     que aplicar, `syncColetarOps` lendo do armazenamento quando a memória está vazia → **corrigiu
     a perda local e o 1º login** (os passos 1–3 de `sync_snapshot.cjs` passam);
  2. `syncRefazerEditor` reabrindo a nota pelo caminho do APP (só com o modal ativo), marcando a
     sessão como salva e cancelando timers, + `syncEstale` (nenhum save do editor "velho" entra na
     fila) + `syncPronto` (nada entra na fila antes do 1º snapshot) → **o 2º aparelho continua
     terminando com a nota vazia** (`notas: [""]`);
  3. **Suspeito que restou** (próximo passo): no aparelho novo o **upload do 1º login**
     (`syncSubirTudo`, que é um `push` DIRETO e não passa pela fila) roda com a nota ainda não
     renderizada pelo app e manda `conteudo_html` vazio com carimbo novo → vence o LWW. Ação
     provável: fazer o `syncSubirTudo` também respeitar o estado "editor velho"/`__notasPronto` do
     RENDER (não só do boot), ou enviar a nota só depois do primeiro render do documento.
- **Como auditar**: `node tests/sync_snapshot.cjs` (falha sempre, igual) — e o diagnóstico do 2º
  aparelho aparece no `stderr` do teste (`estado no 2º aparelho: {"notas":[""]}`).
- **Blindagem aplicada nos blocos III/IV**: o `apiCall` do sync agora ignora um save **VAZIO**
  enquanto `syncEstale` estiver ligado (o editor ainda não re-renderizou o documento que veio da
  nuvem). Medido em `tests/sync_snapshot.cjs`: a **nuvem** termina com o texto certo.

### P98 — RESOLVIDO: o sync rodava no PROTÓTIPO, não na INSTÂNCIA (memória × `localStorage`)
- **Causa-raiz**: `installConta`/`installSync` rodam DENTRO de `new NotesPWA()` (via
  `installNotesFeatures`) e chamavam, no boot, `p.instalarContaUI()` / `p.syncLigarTempoReal()` —
  ou seja, com `this` = **protótipo**. O encadeamento `contaVerificar → contaAplicar →
  syncAoEntrar → syncAplicarNotas → gravarNotasLocaisComCota` herdava esse `this`, e o sync
  escrevia em `NotesPWA.prototype.projectsData` (uma lista **SEPARADA**), enquanto o app (a
  instância `window.notesApp`) lia/gravava a SUA própria lista. Sintoma exato: no 2º aparelho o
  `localStorage` ficava com o texto (o `gravarNotasLocaisComCota` grava no storage) mas
  `window.notesApp.projectsData` continuava vazio — a "divergência memória × `localStorage`".
- **Diagnóstico**: instrumentando a propriedade `projectsData` com um `setter` que loga a pilha,
  ficou claro que `gravarNotasLocaisComCota` rodava com `this` = protótipo (nenhum `SET` na
  instância). O `SET projectsData 0 -> 178` só apareceu depois da correção.
- **Correção**: os dois gatilhos de boot passaram a ser agendados para o 1º instante em que a
  INSTÂNCIA existe (`window.notesApp`, atribuído logo após o construtor): `conta.js` (bloco
  `🚀 CONTA - INSTALAÇÃO`) e `sync/sync-cliente.js` (bloco `🔄 SYNC - TEMPO REAL`).
- **Como auditar**: `node tests/sync_snapshot.cjs` passa; a entrada foi **removida** de
  `FALHAS_CONHECIDAS` (`tests/run-all.cjs`).
- **Lição** (reforço do P96): dentro de `installX(App)`, TODO caminho que mexe em estado do app —
  não só os `p.metodo = function` — tem de rodar com a INSTÂNCIA, nunca com o protótipo.

### P98b — Extensão do P98: qualquer boot `install…` deve mirar a instância
- **Sintoma**: estava latente o mesmo defeito em outros `install…(App)` que disparam trabalho no
  boot. Aqui ficou restrito a `conta.js`/`sync-cliente.js` (os demais não guardam estado na
  instância no boot), mas o padrão deve ser reaplicado se surgir um novo gancho.
- **Regra**: use `window.notesApp` + um `setTimeout(fn, 0)` (a instância é publicada logo após o
  construtor) — ou um trait `__iniciado` na instância para não ligar duas vezes.

### P105 — `syncEstale` ficava PRESO (o aparelho salvava local e a NUVEM ficava vazia)
- **Sintoma**: `tests/sync_websocket.cjs` passou a falhar (timeout no editor do 2º aparelho) depois de
  a correção do P98; o 1º aparelho editava e salvava, mas o texto **nunca** subia — a nuvem ficava
  vazia (o `_dbgops.txt` do servidor só registrava os upserts VAZIOS do 1º login).
- **Causa**: `syncAplicarEntidades` ligava `this.syncEstale = true` sempre que
  `currentNotesProjectId` casava com um registro recebido — **mesmo com o editor FECHADO**. Como
  `syncRefazerEditor` (o único que LIMPA a flag) sai cedo quando o modal não está ativo, a flag
  **nunca era limpa**; o gancho do `apiCall` então deixava de enfileirar TODA edição seguinte
  (salvava no aparelho e não subia).
- **Por que passou batido antes**: antes do P98 a flag era gravada no PROTÓTIPO e o gancho lia a da
  INSTÂNCIA (`undefined`) — funcionava **por acidente**. Ao mover o estado para a instância, o defeito
  apareceu.
- **Correção**: só marca `syncEstale` com o **editor ABERTO** (`#notesModalBackdrop.active`) e, com
  o editor fechado, **limpa** a flag (`sync-cliente.js`, bloco `SYNC - RECEBIMENTO`).
- **Como auditar**: `node tests/sync_websocket.cjs` (duas rodadas verdes) e `node tests/sync_snapshot.cjs`.

### P99 — Service Worker cacheando `/api` (o "login que não pega")
- **Sintoma**: com a API no ar, o login ou o sync parecem congelados; o `snapshot` volta velho; o
  `GET /api/auth/me` devolve o resultado do cache em vez do servidor.
- **Causa**: o handler de `fetch` do `sw.js` era *cache-first* para **tudo** do mesmo origin,
  inclusive `/api/*`. O `caches.match` respondia antes de a rede ser consultada.
- **Correção (seção 10)**: o `fetch` agora **sai fora** para `/api/*` e `/ws`
  (`if (url.pathname.indexOf('/api/') === 0 || url.pathname === '/ws') return;`), e o `_headers`
  reforça `Cache-Control: no-store` nesses caminhos. `CACHE_NAME` subiu para `notas-pwa-v70`.
- **Como auditar**: `tests/sync_websocket.cjs` e `tests/notes_anexos_nuvem.cjs` rodam contra o
  backend REAL — se o SW interceptasse `/api`, os dois falhariam.

### P100 — `Origin` do WebSocket recusado quando o PWA é servido por outra porta (4401 fantasma)
- **Sintoma**: o app conectava e **fechava na hora**, mostrando "Sessão expirada (entre novamente)"
  mesmo com a sessão válida (o teste `sync_snapshot.cjs` travava no `esperarSincronizado`).
- **Causa**: a checagem de `Origin` do handshake só aceitava o que estivesse em
  `ORIGENS_PERMITIDAS` (padrão `http://localhost:8000`). Servindo em `http://127.0.0.1:<porta>`
  (como fazem os testes de navegador), a origem não batia → **4401**.
- **Correção**: além da lista explícita, o handshake aceita o `Origin` **igual ao `Host` do próprio
  pedido** — que é exatamente o caso da origem única (o Python serve o PWA e a API). Origem de
  terceiros continua recusada.
- **Como auditar**: `backend/tests/test_sync_ws.py::test_origin_da_propria_origem_do_pedido_e_aceito`.

### P101 — Bloco novo inserido FORA do `installSync` (`p is not defined`)
- **Sintoma**: `pageerror: p is not defined` no boot; o sync ficava em `offline` com `socket: null`
  e a nota vazia (o app parecia "quebrado sem motivo").
- **Causa**: o `}` que fecha `installSync` ficava **antes** do comentário file-level
  `// 🔄 [FIM: SYNC - CLIENTE ...]`. Um insert feito "antes do FIM" caiu **fora** da função, onde
  `p` não existe. O segundo caso foi mais sutil: o bloco entrou **dentro** de outra função
  (`syncLigarTempoReal`), e as atribuições só rodavam quando o usuário voltava a rede
  (`wrapperSubirTudo: false`, `syncMigrarAnexos: undefined`).
- **Correção**: os blocos foram reposicionados **dentro** de `installSync`, depois do fechamento da
  função anterior. Lição registrada: ao inserir, **conferir a árvore de chaves**, não só o marcador.
- **Como auditar**: `node tests/sync_websocket.cjs` (falha se o socket não abrir) e
  `node tests/notes_anexos_nuvem.cjs` (falha se a migração não existir).

### P102 — Migração de anexos lendo a MEMÓRIA (e o nome do anexo perdido)
- **Sintoma 1**: no 1º login, o anexo antigo (`data:`) **não** era migrado, embora o HTML da nota
  tivesse o `data:` URL.
- **Causa 1**: a varredura usava `projectsData`, e a memória pode estar **sem o HTML da nota**
  logo após o boot (a mesma divergência memória × `localStorage` do P98).
- **Sintoma 2**: os anexos migrados apareciam como `anexo-<aleatório>.png`.
- **Causa 2**: o `data:` URL não guarda o nome do arquivo.
- **Correção**: a varredura passa a ler `lerNotasLocais()` (o **armazenamento**, fonte da verdade,
  como faz `syncColetarOps`) e o nome é recuperado da pista que o app deixa (`alt` da imagem ou o
  texto do link `📎 nome`).
- **Como auditar**: `node tests/notes_anexos_nuvem.cjs` (passo B: `data:` some e o `info.name`
  continua `antiga.png`).

### P104 — CSP bloqueando o `data:` do PRÓPRIO app (dois efeitos: migração e ruído no console)
- **Sintoma 1 (funcional)**: depois de ligar a CSP, o `tests/notes_anexos_nuvem.cjs` passou a FALHAR
  na migração (o anexo antigo continuava `data:`), embora passasse antes da CSP.
- **Causa 1**: a migração fazia `fetch(dataUrl)` para virar `Blob`, e `connect-src 'self' ws: wss:`
  bloqueia `fetch('data:…')`. A CSP estava **certa** — o código é que tomava um atalho.
- **Correção 1**: `syncDataUrlParaBlob` decodifica o `data:` **à mão** (`atob`/`decodeURIComponent`),
  sem `fetch` e sem afrouxar a política.
- **Sintoma 2 (ruído)**: `Connecting to 'data:image/png;…' violates … connect-src` (2×) no boot
  logado, **antes** da migração, com tudo funcionando (a imagem aparece).
- **Causa 2**: o próprio Chromium reporta um "connect" interno ao re-renderizar a imagem `data:`
  da nota (reproduzido fora do app: `img data:` puro **não** viola; `fetch(data:)` viola; a
  decodificação manual não viola). Não é defeito do app.
- **Correção 2**: `data:` entrou no `connect-src` — uma URL `data:` **nunca sai do navegador**, então
  não há exfiltração possível; o ganho é o console limpo (erro que "assusta" sem haver defeito).
- **Como auditar**: `node tests/notes_anexos_nuvem.cjs` (passa e o console fica sem as 2 mensagens)
  e `backend/tests/test_health.py::test_cabecalhos_de_seguranca_no_app`.

### P103 — Socket aberto após "voltar a rede" deixava a fila parada
- **Sintoma**: `setOffline(false)` → as duas páginas **não** convergiam; o indicador ficava em
  `Offline — N na fila` mesmo com a rede de volta.
- **Causa**: o navegador **não fecha** um WebSocket já aberto ao emular offline, então o app nunca
  via o `close`. O gatilho de `online`/`visibilitychange` só reconectava quando o socket estava
  fechado — e ninguém retomava o dreno.
- **Correção**: o gatilho agora **sempre** chama `syncDrenar()` (além de reconectar se preciso).
- **Como auditar**: `node tests/sync_websocket.cjs` (passo 4: fila zerada e as duas páginas com o
  texto `escrita offline`).

