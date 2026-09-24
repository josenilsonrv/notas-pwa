# Prompt — Mapa Mental como área separada (área “Mapa Mental” ao lado de “Notas”)

> Documento pronto para entregar a um agente de código. Implementa o **Mapa Mental**
> como uma **área independente** do editor de texto, com arquitetura em camadas,
> persistência local e **checklist de implementação** faseada.
> Objetivo: paridade de robustez com a área de Notas (autosave, undo/redo, atalhos,
> toolbar, temas, acessibilidade) sem tocar no motor de notas.

---

## 0. Contexto e restrições (valem para tudo)

- Stack: **vanilla JS**, PWA 100% offline, **sem backend**. Nada de frameworks/bibliotecas
  externas (nem CDN): o app precisa continuar offline-friendly.
- **NÃO editar**: `notes/editor.js`, `notes/extras.js`, `notes/tables.js`,
  `notes/table-math.js` (motor do original, byte-a-byte) nem o bloco do modal
  `#notesModal` em `index.html`.
- Editável: `index.html`, `styles.css`, `theme-origem.css`, `app.js`, `sw.js`,
  `manifest.json` e a **nova pasta `mapa/`**.
- Ordem de carregamento atual (não quebrar): `styles.css` → `theme-origem.css` →
  `notes/*.css` → scripts `notes/*.js` → `app.js`. O mapa entra **depois**
  (`mapa/mapa.css` e `mapa/*.js`).
- Tema: usar os tokens de `styles.css` (`--color-bg-*`, `--color-text-*`,
  `--color-border`, `--color-neon-*`) e o atributo `html[data-theme="dark"]`.
  Escutar o evento `themechange`.
- Persistência: `localStorage` **sempre com `try/catch`** (iOS/privado pode lançar).
  Convenção de chaves: prefixo `notas-pwa-`.
- Comentários e nomes de função em **pt-BR**, seguindo o estilo do `app.js`
  (blocos marcados com `// 🔄 [INÍCIO: ...]` / `// 🔄 [FIM: ...]`).
- A suíte precisa continuar verde nos testes afetados:
  ```bash
  node tests/parity_structure.cjs && node tests/parity_visual.cjs && node tests/shortcuts.cjs
  node tests/run-all.cjs --baseline
  ```
- Ao publicar: **bump do `CACHE_NAME`** em `sw.js` (v19 → **v20**) e incluir os novos
  assets em `ESSENCIAIS`.

---

## 1. Arquitetura de “áreas” (Notas | Mapa Mental)

Hoje o `#notesModal` é a app inteira. O mapa será uma **segunda área** trocável, sem
alterar o modal.

- **Contêiner de áreas**: adicionar no `<main>` um seletor de área logo **acima** do
  `#notesModalBackdrop` (fora do bloco do modal, para não afetar `parity_*`):
  ```html
  <nav id="appAreas" class="app-areas" role="tablist" aria-label="Áreas do aplicativo">
    <button type="button" role="tab" data-app-area="notas" aria-selected="true">Notas</button>
    <button type="button" role="tab" data-app-area="mapa"  aria-selected="false">Mapa Mental</button>
  </nav>
  <section id="mapaArea" class="mapa-area" role="tabpanel" aria-label="Mapa Mental" hidden>…</section>
  ```
- **Troca de área** (`aplicarArea(nome)`): persiste em `notas-pwa-area-ativa`; ao sair de
  Notas, chamar `persistNow()`; ao voltar, reabrir a nota ativa (`openNotesModal`).
- O mapa monta **lazy** (só inicializa na primeira entrada na área) para não pesar o boot.
- **Pasta e arquivos novos** (espelha a organização de `notes/`):
  ```
  mapa/mapa.css          # estilos da área (tokens do tema, dark mode)
  mapa/mapa-modelo.js    # MapaMentalModelo: entidades, validação, IDs, migrações
  mapa/mapa-store.js     # persistência local (CRUD de mapas + versões + viewport)
  mapa/mapa-layout.js    # algoritmos de layout + medição de nós
  mapa/mapa-render.js    # canvas, nós DOM, conexões SVG, minimapa, culling
  mapa/mapa-interacao.js # seleção, drag&drop, reparenting, atalhos, menus
  mapa/mapa-painel.js    # propriedades do nó, filtros, pesquisa, backlinks
  mapa/mapa-io.js        # import/export (JSON/MD/OPML/PNG/SVG/PDF/print)
  mapa/mapa-tarefas.js   # tarefas + progresso hierárquico
  mapa/mapa.js           # instala tudo em NotesPWA (installMapaMental)
  ```
- **Contrato de instalação** (igual ao motor de notas): `installMapaMental(NotesPWA)`
  estende o protótipo. Chamar dentro de `NotesPWA.installNotesFeatures()` **sem** alterar
  as funções do motor.
- **IDs/classe CSS prefixados** (`mapa-*`, `#mapaArea`, `#mapaCanvas`) para nunca colidir
  com o modal.

---

## 2. Modelo de dados (localStorage)

Chaves:

- `notas-pwa-maps` → índice de mapas:
  `[{ id, nome, pastaId, favorito, arquivado, raiz(paiId), dtCriado, dtAlterado }]`
- `notas-pwa-mapa-<id>` → grafo do mapa:
  `{ id, nome, schemaVersion, temaId, nos:[...], conexoes:[...], viewport:{x,y,zoom},
  layout:'bilateral', espacamento:{nos,niveis}, atualizadoEm }`
- `notas-pwa-mapa-pastas` → `[{ id, nome, paiId }]` (pastas/workspaces)
- `notas-pwa-mapa-templates` → mapas salvos pelo usuário como template
- `notas-pwa-mapa-recentes` → `[{ idMapa, idNo?, quando }]`
- `notas-pwa-mapa-historico-<id>` → snapshots/versões (cap configurável, ex. 30)
- `notas-pwa-mapa-ativo`, `notas-pwa-area-ativa`

`No`:
`{ id, mapaId, paiId|null, ordem, titulo, descricao, notas, links[], imagens[], icone,
emoji, tags[], anexos[], tarefa:bool, concluido, prioridade, status, prazo, responsavel,
progresso, refs[], mapaRef|null, posicao:{x,y}|null, estilo:{...}, colapsado, bloqueado,
largura }`

`Conexao`:
`{ id, de, para, direcionada:bool, texto, tipoLinha, cor, espessura, estiloSeta }`

Regras: IDs por contador monotônico (`'n1'`, `'n2'`…), nunca reutilizar; toda mutação passa
por um **comando** (para undo/redo e autosave); migração versionada (`schemaVersion` no grafo).

---

## 3. CHECKLIST DE IMPLEMENTAÇÃO (por fases)

### Organização em seções (entregáveis)

Recomendação: **6 seções**, cada uma com **4 a 5 fases**, entregando um incremento utilizável.

| Seção | Fases | Nº de fases | Entrega |
|---|---|---|---|
| **A — Fundação (MVP navegável)** | F0–F3 | 4 | Trocar entre Notas/Mapa + criar mapa + canvas + nós editáveis |
| **B — Estrutura e relações** | F4–F7 | 4 | Conteúdo dos nós, hierarquia, conexões, drag & drop |
| **C — Apresentação e produtividade** | F8–F11 | 4 | Layouts automáticos, editor visual, atalhos, undo/redo |
| **D — Descoberta e organização** | F12–F15 | 4 | Menus, pesquisa, filtros, navegação/foco |
| **E — Dados e conhecimento** | F16–F20 | 5 | Tarefas/progresso, backlinks, histórico/autosave, I/O, templates |
| **F — Escala e futuro** | F21–F25 | 5 | Performance, integração, colaboração, IA, acessibilidade/testes |

**Regra de dimensionamento:** 4–5 fases por seção. Se uma fase crescer demais, quebre-a em
subfases (`F8a`, `F8b`, …) em vez de aumentar a seção. Cada seção fecha com **testes verdes +
demo manual** antes de começar a próxima.

> ⚠️ Cada fase traz um bloco **Pontos de atenção** logo abaixo do título. Os riscos
> transversais (que valem para todas as fases) estão na **seção 5**.

### FASE 0 — Fundação e isolamento
> ⚠️ **Pontos de atenção**
> - Não colocar o seletor de áreas **dentro** de `#notesModalBackdrop`: `parity_visual.cjs` compara o modal de notas.
> - Ordem de carga: `mapa/*.js` **depois** de `app.js`; `mapa/mapa.css` **depois** de `notes/*.css`.
> - Montagem lazy: nada de observers/listeners no boot antes de `window.__notasPronto = true`.
> - Asset novo fora de `ESSENCIAIS` do `sw.js` = a área do mapa some no offline (a instalação exige todos).
- [x] Seletor de áreas (`#appAreas`) + `<section id="mapaArea" hidden>` no HTML, **fora** do modal
- [x] `mapa/mapa.css` linkado em `index.html` (após `notes/*.css`); scripts de `mapa/` após `notes/*.js`
- [x] `installMapaMental(NotesPWA)` + montagem lazy; `aplicarArea()` + `notas-pwa-area-ativa`
- [x] Aplicar/observar `html[data-theme]` e o evento `themechange` na área do mapa
- [x] `sw.js`: novos assets em `ESSENCIAIS` + `CACHE_NAME = 'notas-pwa-v20'`
- [x] `parity_structure.cjs` / `parity_visual.cjs` / `shortcuts.cjs` seguem **verdes**

### FASE 1 — Gestão de mapas
> ⚠️ **Pontos de atenção**
> - Índice (`notas-pwa-maps`) deve ser **leve**: não duplicar o grafo nele (cota do localStorage).
> - Excluir mapa → apagar também `notas-pwa-mapa-<id>`, histórico, recentes e backlinks que o citam.
> - Duplicar/template → **IDs novos** e remapear `paiId`/conexões (nunca compartilhar objetos).
> - Nó-ponte para mapa excluído → tratar "referência quebrada" (avisar), sem quebrar o render.
- [x] Criar mapa (nome + pasta) · abrir · renomear · duplicar · excluir (com confirmação)
- [x] Arquivar/desarquivar · favoritar/desfavoritar (estrela)
- [x] Organização por **pastas/workspaces** (criar, renomear, mover mapa entre pastas, excluir)
- [x] **Mapa raiz** (mapa `Home` que concentra os demais) e navegação por ele
- [x] **Mapas conectados entre si**: um mapa pode ter um nó-ponte para outro mapa (link bidirecional)
- [x] **Templates**: aplicar template pronto e "Salvar este mapa como template"
- [x] **Lista de recentes** (`notas-pwa-mapa-recentes`), com atalho para abrir
- [x] Busca/ordenação da lista de mapas (nome, recente, favorito)

### FASE 2 — Canvas infinito
> ⚠️ **Pontos de atenção**
> - Usar **Pointer Events** (mouse+toque de uma vez); o motor de notas já usa `pointerdown/move/up`.
> - Um único container com `transform` (evitar `position:fixed` por nó).
> - Persistir viewport com **debounce** (não gravar a cada frame de pan/zoom).
> - Minimapa/handles **não** podem capturar os pointer events do canvas (`stopPropagation` consciente).
- [x] Área de trabalho expansível (mundo ilimitado; transform `translate/scale`)
- [x] **Zoom in / out** (botões, `Ctrl + scroll`, pinça no toque) com limites min/max
- [x] **Pan/arrastar tela** (pointer events: mouse/toque; sem selecionar texto)
- [x] **Centralizar mapa** · **ajustar mapa à tela** (fit) · **voltar ao nó central/raiz**
- [x] **Minimapa** (retângulo da viewport + clique para navegar)
- [x] **Restauração da última posição/zoom** (`viewport` no grafo, por mapa)

### FASE 3 — Nós / tópicos
> ⚠️ **Pontos de atenção**
> - `contenteditable` no celular: o teclado não pode reflowar/quebrar o canvas.
> - Definir a regra `Enter` = quebra de linha **versus** criar irmão (e `Tab` em edição = filho).
> - Editar texto **não** pode gerar undo por caractere (coalescência — ver F11).
> - Copiar/colar: `navigator.clipboard` pode falhar (sem permissão) → manter fallback interno.
- [x] Criar **nó raiz**, **tópico filho**, **tópico irmão**, **nó independente**
- [x] **Editar texto diretamente** no nó (duplo clique / F2 / toque longo; `contenteditable`)
- [x] **Excluir**, **duplicar**, **copiar/colar**, **recortar** (com undo)
- [x] **Mover** e **reordenar** (irmãos: subir/descer; ordem persistida em `ordem`)
- [x] **Trocar nó de pai** (reparenting via menu e via drag)
- [x] **Selecionar** um ou **vários** nós (Ctrl/Shift+clique, marquee/laço de seleção)
- [x] **Expandir/recolher ramificações** (por nó; "recolher tudo"/"expandir tudo")
- [x] **Bloquear nó** (impede edição/movimento; indicador de cadeado)
- [x] **Definir largura/tamanho** do nó (handle de resize; múltiplo de 8px)

### FASE 4 — Conteúdo dentro dos nós
> ⚠️ **Pontos de atenção**
> - **Sanitizar** HTML de título/descrição/import (risco de XSS).
> - Anexos em base64 estouram ~5 MB → limitar o tamanho **antes** de gravar.
> - Guardar as dimensões das imagens para não quebrar o layout.
> - Datas em **ISO** (`YYYY-MM-DD`) para ordenar/filtrar corretamente.
- [x] Título · descrição · **notas** (painel) · **links** (com auto-link) · **imagens**
- [x] **Ícones** · **emojis** (picker) · **tags** · **arquivos/anexos** (base64 ou Blob leve)
- [x] **Checkbox** · **prioridade** · **status** · **datas** (início/prazo) · **referências**
- [x] **Link para outro mapa** (nó-ponte com indicação visual)
- [x] Sanitização de HTML no título/descrição (nada de `<script>`; whitelist de tags)

### FASE 5 — Hierarquia
> ⚠️ **Pontos de atenção**
> - Bloquear reparent que crie **ciclo**; normalizar `ordem` (0..n) a cada reordenação.
> - Recolher ramo não pode esconder nó selecionado/em edição (perder foco).
> - Profundidade ilimitada → travessia **iterativa** (evitar stack overflow).
- [x] Relações pai → filho com **múltiplos níveis ilimitados**
- [x] Alteração de hierarquia por **arrastar e soltar**
- [x] **Ordenação de filhos** (ordem explícita + arraste)
- [x] **Recolhimento de ramos** e **expansão individual ou total**
- [x] **Identificação visual de níveis** (cor/espessura/indentação por profundidade)
- [x] Layout em árvore (pai à esquerda/direita/bilateral) por nó raiz


### FASE 6 — Conexões livres
> ⚠️ **Pontos de atenção**
> - Conexões livres **não** entram no cálculo do layout em árvore (são overlay).
> - Arestas SVG recalculam quando o nó muda de posição/tamanho/zoom.
> - Vincular por **ID**, nunca por coordenada (sobrevive a relayout/reparent).
- [x] Conectar **quaisquer dois nós** independentemente da hierarquia
- [x] **Direcionada** (seta) ou **simples**
- [x] **Texto** na conexão (rótulo editável)
- [x] **Tipos de linha** (reta, curva, ortogonal), espessura e **setas**
- [x] **Editar** e **remover** conexões (menu contextual na linha)
- [x] Nó-ponte para mapa aparece como conexão especial (clique abre o mapa destino)

### FASE 7 — Drag & Drop inteligente
> ⚠️ **Pontos de atenção**
> - Diferenciar "pan do canvas" × "drag do nó" × "seleção" (threshold em px evita cliques-fantasma).
> - Multi-drag mantém **offsets relativos** da seleção.
> - Não usar drag nativo do HTML (quebra no toque) → Pointer Events + auto-scroll nas bordas.
> - Hit-test coerente com o **zoom** atual.
- [x] Mover nós **livremente** (grava `posicao` → "layout livre")
- [x] Alterar **pai ao soltar sobre outro nó** (soltar em "cima/meio" = reparent)
- [x] Reorganizar **irmãos** por arraste (inserção entre nós)
- [x] Mover **ramificações inteiras** (subárvore acompanha)
- [x] **Indicação visual do destino** antes de soltar (highlight + linha-guia + preview)
- [x] Detecção de **ciclo** (não permitir soltar ancestral em descendente)

### FASE 8 — Layout automático
> ⚠️ **Pontos de atenção**
> - Medir o nó **após** renderizar (`offsetWidth/Height`) — a caixa varia com conteúdo/fonte.
> - Layout pesado em `requestIdleCallback`/worker; nunca bloquear um frame > ~50 ms.
> - "Sem sobreposição" exige espaçamento mínimo garantido / collision avoidance.
> - Trocar para layout automático descarta `posicao` manual → **confirmar** antes.
- [ ] Modos: **mapa mental tradicional**, **esquerda→direita**, **direita→esquerda**,
  **bilateral**, **árvore vertical**, **organograma** e **layout livre**
- [ ] Reorganização automática **sem sobreposição** (respeitar largura/altura reais dos nós)
- [ ] **Espaçamento configurável** entre nós e entre níveis (por mapa, com default)
- [ ] Transição suave ao relayout; persistir modo e espaçamento

### FASE 9 — Editor visual
> ⚠️ **Pontos de atenção**
> - Estilo vive no **modelo/dataset do nó** (não inline solto) para sobreviver a export/dup.
> - Não redefinir tokens globais do tema (quebraria `parity_visual`).
> - Precedência clara: **nó > nível > tema do mapa**.
> - "Copiar estilo" copia só o visual (não conteúdo/tarefa).
- [ ] Cores de **nó**, **texto**, **fundo** e **bordas**
- [ ] **Espessura e formato das linhas**; **formas dos nós** (retângulo, pílula, elipse, nota)
- [ ] **Fontes**, **tamanho**, **negrito/itálico**, **alinhamento**
- [ ] **Ícones** por nó; **temas globais** do mapa (paleta); **estilos por nível**
- [ ] **Copiar estilo** (pincel) e **restaurar estilo padrão**
- [ ] Tema claro/escuro respeitado automaticamente

### FASE 10 — Atalhos de teclado
> ⚠️ **Pontos de atenção**
> - **Conflito com o motor de notas**: só interceptar com o foco na área do mapa (senão `Tab` indentaria o texto).
> - `preventDefault` consciente em `Tab`/`Enter`/setas (teclas com comportamento nativo).
> - Guardar atalhos por `event.key` (layout de teclado), não por `keyCode`.
- [ ] `Tab` = filho · `Enter` = irmão · `Delete/Backspace` = excluir
- [ ] **Setas** para navegar entre nós (pai/filho/irmãos) · `F2` editar · `Esc` cancelar
- [ ] `Ctrl+C` / `Ctrl+V` / `Ctrl+X` · `Ctrl+D` duplicar
- [ ] `Ctrl+Z` / `Ctrl+Shift+Z` (e `Ctrl+Y`) desfazer/refazer
- [ ] **Seleção múltipla** (`Ctrl`/`Shift` + clique, `Ctrl+A`)
- [ ] Atalhos **configuráveis** (mapa de teclas persistido; conflito com o modal de notas
  evitado: só ativo quando o foco está na área do mapa)

### FASE 11 — Undo/Redo
> ⚠️ **Pontos de atenção**
> - A pilha **não** guarda referências vivas → snapshots/diffs serializáveis.
> - Coalescer digitação e arraste (1 undo por gesto, não por evento).
> - Com anexos base64, snapshot inteiro é caro → versionar por **patch/diff** + cap de memória.
> - Undo precisa **re-agendar o autosave** (não deixar o mapa "sujo" sem salvar).
- [ ] Pilha de comandos cobrindo: criação, exclusão, movimentação, edição de texto,
  mudança de estilo, alteração de hierarquia, conexões, layout
- [ ] Coalescência de digitação (debounce) e limites de memória (ex. 100 passos)
- [ ] `Ctrl+Z`/`Ctrl+Shift+Z` + botões na toolbar; estado dos botões refletindo a pilha

### FASE 12 — Menus de interação
> ⚠️ **Pontos de atenção**
> - `contextmenu` + toque longo; fechar com `Esc`/clique fora (o motor já escuta `contextmenu` — só agir na área ativa).
> - Acessibilidade: `role="menu"`, `aria-haspopup` e foco preso no menu enquanto aberto.
> - No mobile o painel lateral vira **bottom sheet** (não cobrir o canvas inteiro).
- [ ] **Barra de ferramentas** do mapa (zoom, layout, adicionar, undo/redo, exportar…)
- [ ] **Menu contextual** (botão direito / toque longo) no nó, na linha e no canvas
- [ ] **Menu rápido** ao selecionar nó (flutuante com ações mais usadas)
- [ ] **Painel lateral de propriedades** (conteúdo, estilo, tarefa, relações)
- [ ] **Comandos rápidos**: adicionar filho, adicionar irmão, criar conexão a partir do nó


### FASE 13 — Pesquisa
> ⚠️ **Pontos de atenção**
> - Índice de busca **incremental** + debounce (não varrer tudo a cada tecla).
> - "Todos os mapas" lê várias chaves `notas-pwa-mapa-*` → cachear índice leve (título/tags).
> - Para centralizar, **expandir ancestrais** e garantir o nó renderizado (senão cai fora do culling).
- [ ] Pesquisar **texto, tags, notas e conteúdo** dos nós
- [ ] Escopo: **mapa atual** ou **todos os mapas**
- [ ] **Destacar resultados** · **navegar entre ocorrências** (próximo/anterior)
- [ ] Abrir o **mapa correto** e **centralizar automaticamente** o nó encontrado

### FASE 14 — Filtros
> ⚠️ **Pontos de atenção**
> - Filtro **só** altera visibilidade (nunca reescreve a estrutura — "limpar filtros" não pode perder dados).
> - Nó com ancestral filtrado não pode "soltar" visualmente do mapa.
> - Persistir filtro por **sessão**, com indicador visível (evitar "sumiu tudo" misterioso).
- [ ] Filtrar por **tags**, **prioridades**, **status**, **tipos de nó**, **tarefas**, **nível da árvore**
- [ ] Esconder/atenuar nós não correspondentes (sem perder a estrutura)
- [ ] **Limpar filtros** e voltar à visualização completa; indicador de filtro ativo

### FASE 15 — Navegação estrutural, modo foco e breadcrumbs
> ⚠️ **Pontos de atenção**
> - Modo foco precisa **lembrar** o que foi escondido para restaurar exatamente.
> - Breadcrumb longo: truncar o visual sem perder o caminho (`title`/`aria`).
> - A pilha "voltar ao mapa/nó anterior" (F17) é **uma só** — não duplicar.
- [ ] **Breadcrumbs / caminho do nó** (ex.: `Empresa > Marketing > Conteúdo > Instagram`)
- [ ] **Ir para pai / filho / irmão** (botões + atalhos)
- [ ] **Focar apenas uma ramificação** (esconde o resto)
- [ ] **Voltar ao mapa completo**
- [ ] **Modo foco**: trabalhar só naquela estrutura, com "sair do foco" evidente
- [ ] Duplo clique no breadcrumb centraliza/zoom no nível escolhido

### FASE 16 — Tarefas dentro do mapa + progresso hierárquico
> ⚠️ **Pontos de atenção**
> - Definir a fórmula do rollup: nó não-tarefa com filhos-tarefa × tarefa com `progresso` manual (precedência).
> - Documentar a média (por contagem × ponderada) e como tratar nós "não contados".
> - Sincronizar com o módulo de produtividade é **contrato** (F22), não cópia de dados.
- [ ] Transformar nó em **tarefa** (checkbox concluído)
- [ ] Campos: **status**, **prioridade**, **prazo**, **progresso**, **responsável**
- [ ] **Progresso hierárquico**: calcular `%` do pai a partir das tarefas filhas
  (ex.: `Projeto 68%`) e **propagar pela árvore** (rollup), exibido no nó e no breadcrumb
- [ ] **Sincronização com o módulo de produtividade** do sistema: contrato de ponte
  (ver FASE 22) — sem duplicar dados

### FASE 17 — Notas complementares, relacionamento entre mapas e backlinks
> ⚠️ **Pontos de atenção**
> - Backlinks exigem **índice reverso** gravado no save (senão "todos os mapas" vira O(n) lento).
> - Alvo excluído → mostrar "referência quebrada", não sumir silenciosamente.
> - Decidir e documentar: o painel de notas do nó **reusa** o motor de notas ou é um campo simples?
- [ ] **Painel associado ao nó** para textos maiores (sem poluir o visual do mapa)
- [ ] Nó **aponta para outro mapa**: abrir mapa relacionado e **voltar ao anterior**
  (histórico de navegação)
- [ ] **Indicação visual** de que o nó contém/aponta para outro mapa
- [ ] **Backlinks**: listar quais **mapas/nós apontam** para um nó/mapa
- [ ] Painel de backlinks navegável (clicar leva ao mapa+nó de origem)

### FASE 18 — Histórico, versões e autosave
> ⚠️ **Pontos de atenção**
> - Snapshot inteiro com anexos é caro → versionar por **diff**, com cap e poda.
> - Autosave com debounce + flush em `visibilitychange`/`beforeunload` (iOS corta `beforeunload`).
> - Reusar o padrão de `notesStatus` ("Salvando…/Salvo") para não duplicar lógica/visual.
> - Restaurar versão **entra** no undo/redo e gera snapshot de segurança antes.
- [ ] **Registrar alterações** (log compacto: tipo, alvo, quando)
- [ ] **Versões/snapshots** manuais e automáticas (cap por mapa)
- [ ] **Visualizar versões anteriores** (lista com data) e **restaurar uma versão**
- [ ] **Autosave** sem botão Salvar + indicador **"Salvando…" / "Salvo"**
- [ ] **Recuperação** de alterações em caso de fechamento inesperado (rascunho + `beforeunload`)

### FASE 19 — Importação / Exportação / Impressão
> ⚠️ **Pontos de atenção**
> - Import: **sanitizar + validar** (não confiar no arquivo) e sempre pré-visualizar.
> - PNG/SVG: render offscreen pela **bounding box do mapa**, não pelo viewport atual.
> - Markdown/OPML são **lossy** (sem estilo/conexões) → avisar o que se perde.
> - PDF via `window.print()`: `@page` (margens/orientação) + paginação por "divisão em páginas".
- [ ] Importar **JSON**, **Markdown**, **OPML** (+ formatos futuros) com **pré-visualização**
- [ ] **Tratamento de conflitos** na importação (mesclar / substituir / novo mapa)
- [ ] Exportar **PNG, SVG, PDF, JSON, Markdown, OPML**
- [ ] Exportar **mapa inteiro** ou **apenas uma ramificação**
- [ ] Configurar **resolução** e **área exportada**
- [ ] **Impressão**: escala, orientação, margens, tamanho de página e **divisão em páginas**

### FASE 20 — Templates e duplicação inteligente
> ⚠️ **Pontos de atenção**
> - Template = pipeline de duplicação **+ limpeza** do conteúdo do usuário (IDs novos, estilos mantidos).
> - Duplicar ramificação: manter só conexões **internas** ao ramo (avisar sobre as externas).
> - Guardar templates em chave **separada** (não poluir a lista de mapas).
- [ ] Templates prontos: brainstorming, planejamento, estudos, projetos, **SWOT**,
  organograma, roadmap, empresa
- [ ] **Salvar mapa próprio como template** (e gerenciar/renomear/excluir)
- [ ] **Duplicar inteligente**: nó, ramificação completa ou mapa inteiro,
  preservando estrutura, estilos e **remapeando conexões** (internas válidas, externas
  removidas/avisadas)

### FASE 21 — Performance para mapas grandes
> ⚠️ **Pontos de atenção**
> - Medir **antes/depois** (tempo de layout/render, FPS de pan/zoom) e registrar no doc.
> - Culling/virtualização: **não** desmontar nó em edição/selecionado (tem foco).
> - Web Worker tem custo de `postMessage`/clone — medir o ganho real.
> - Manter dataset de teste com **1.000+ nós** para não otimizar "no escuro".
- [ ] Suportar **centenas/milhares de nós**
- [ ] **Renderizar somente o necessário** (culling por viewport; virtualização de nós fora de tela)
- [ ] Evitar **recalcular o mapa inteiro** a cada alteração (dirty flags + render incremental)
- [ ] **Layout pesado sem travar a UI** (chunking/`requestIdleCallback`; web worker se necessário)
- [ ] Medição de performance documentada (ex.: tempo de layout/render com 1.000 nós)
- [ ] Teste de carga (`tests/mapa_performance.cjs`) com limite de tempo aceitável


### FASE 22 — Integração com o restante do sistema
> ⚠️ **Pontos de atenção**
> - Ponte **falha-segura**: entidade ausente → o nó continua válido (sem erro na tela).
> - Sem duplicação: guardar `{tipo,id}` e cachear só o necessário para exibir.
> - Direção da dependência: **mapa → módulos** (nunca o contrário).
- [ ] Nó pode **representar ou apontar** para **tarefa, projeto, meta, documento, evento**
  já existentes
- [ ] **Sem duplicação de dados**: nó guarda **referência** (`{tipo, id}`) e lê o dado da fonte
- [ ] Ponte com a área de **Notas**: nó pode apontar para uma nota existente
  (`notas-pwa-notes`), com "abrir na área de Notas" e **backlink** recíproco
- [ ] Contrato de ponte documentado (funções `resolverEntidade(tipo,id)` /
  `abrirEntidade(tipo,id)`) para plugar futuros módulos sem reescrever o mapa

### FASE 23 — Colaboração futura (preparar, sem implementar)
> ⚠️ **Pontos de atenção**
> - IDs estáveis + **tombstones** de exclusão desde já (sem eles, sync é inviável depois).
> - Abstrair persistência em `mapa-store.js` (localStorage não é fonte compartilhável).
> - Definir e anotar a estratégia de conflito (LWW × CRDT) **antes** de implementar.
- [ ] Modelo de dados **pronto para sync** (IDs estáveis, `atualizadoEm`, tombstones de exclusão)
- [ ] Camada de persistência **abstraída** (`mapa-store.js`) para trocar localStorage por servidor
- [ ] Definir (não implementar) pontos de: compartilhamento, permissões, edição simultânea,
  cursores, comentários, presença online, resolução de conflitos (CRDT/LWW)
- [ ] Comentários no nó (estrutura de dados já prevista, UI opcional)

### FASE 24 — IA opcional (arquitetura desacoplada)
> ⚠️ **Pontos de atenção**
> - **Nenhuma** chamada de IA no boot; **sem chave/segredo** no cliente.
> - Timeout/erro → a UI nunca fica presa; sempre há caminho manual.
> - Privacidade: avisar antes de enviar texto para fora; IA **opcional** por padrão.
- [ ] Interface `MapaIA.gerarDeTexto/expandir/resumir/reorganizar/sugerirSubtopicos/converterDocumento`
- [ ] **O mapa funciona 100% sem IA**: nenhuma funcionalidade básica depende dela
- [ ] Sem chaves/segredos no cliente; IA fica atrás de um adaptador plugável e opcional
- [ ] UI de IA só aparece se o adaptador estiver disponível (`mapaIA.disponivel`)

### FASE 25 — Acessibilidade, testes e documentação
> ⚠️ **Pontos de atenção**
> - Novos testes **não** devem depender de `waitForTimeout` fixo (fonte de flakiness — ver `COMO-RODAR-TESTES.md`).
> - Cada teste abre o próprio navegador: manter rápido e determinístico.
> - Não mexer no baseline das 12 falhas conhecidas; usar `--baseline` para ver só o novo.
> - Canvas é ruim de acessibilidade: oferecer **outline textual por teclado** como alternativa.
- [ ] Navegação por teclado completa; `role="tree"`/`treeitem` e `aria-expanded` nos nós
- [ ] `aria-live` para status de autosave e resultados de pesquisa
- [ ] Contraste nos temas claro/escuro; alvos de toque ≥ 44px no mobile
- [ ] Novos testes Playwright (padrão dos existentes `tests/*.cjs`):
  `mapa_gestao.cjs`, `mapa_canvas.cjs`, `mapa_nos.cjs`, `mapa_conexoes.cjs`,
  `mapa_dragdrop.cjs`, `mapa_layout.cjs`, `mapa_atalhos.cjs`, `mapa_undo.cjs`,
  `mapa_pesquisa_filtros.cjs`, `mapa_tarefas_progresso.cjs`, `mapa_io.cjs`,
  `mapa_persistencia.cjs`, `mapa_performance.cjs`
- [ ] `node tests/run-all.cjs --baseline` sem regressão nova
- [ ] `README.md` (seção Mapa Mental) + `docs/` atualizados
- [ ] **Bump `CACHE_NAME`** e conferir deploy (`curl -s .../sw.js | grep notas-pwa-v`)

---

## 4. Testes e validação (comandos)

```bash
# Por arquivo (rápido, durante o desenvolvimento)
node tests/mapa_persistencia.cjs
node tests/parity_structure.cjs
node tests/parity_visual.cjs
node tests/shortcuts.cjs

# Suíte completa (só falha se houver FALHA NOVA) — rodar em segundo plano
node tests/run-all.cjs --baseline
```

Enquanto a área de Notas não for tocada, os 12 testes conhecidos que falham devem continuar
falhando **pelos mesmos motivos** (ver `docs/COMO-RODAR-TESTES.md`).

---

## 5. Armadilhas e pontos de atenção transversais

> Os itens abaixo valem para **todas** as fases. Os riscos específicos de cada fase estão
> no bloco **⚠️ Pontos de atenção** logo abaixo do título de cada FASE.

1. ❌ Não editar `notes/*.js` nem o bloco `#notesModal` do `index.html` — quebra paridade/motor.
2. ❌ Não usar `localStorage` sem `try/catch` (cota/privado).
3. ❌ Não colocar o seletor de área **dentro** do modal de notas (afeta `parity_visual`).
4. ❌ Não recalcular layout/render do mapa inteiro a cada tecla (trava no celular —
   ver `docs/RELATORIO-CORRECAO-TRAVAMENTO-CELULAR.md`).
5. ❌ Não permitir reparent que crie **ciclo**; não reutilizar IDs.
6. ❌ Não quebrar o carregamento offline: asset novo **precisa** entrar em `ESSENCIAIS` do `sw.js`.
7. ❌ Não duplicar dados do sistema: nó **referencia** entidades existentes.
8. ⚠️ Anexos em base64 estouram a cota (~5 MB): limitar tamanho e migrar para Blob/IndexedDB
   se preciso.

---

## 6. Definition of Done

- Área "Mapa Mental" abre/troca com "Notas" sem afetar o editor (paridade e `shortcuts` verdes).
- Todas as seções do checklist acima marcadas **ou** explicitamente registradas como backlog
  com justificativa.
- Autosave + undo/redo + atalhos + busca/filtros funcionando e persistidos entre sessões.
- Exportação (JSON/MD/OPML/SVG/PNG) e importação com pré-visualização funcionando.
- Testes novos passando; `--baseline` sem regressão nova.
- `CACHE_NAME` incrementado e deploy validado.
- `README.md` e `docs/` atualizados.

