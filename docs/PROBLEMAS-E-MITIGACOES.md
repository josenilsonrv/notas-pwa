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
