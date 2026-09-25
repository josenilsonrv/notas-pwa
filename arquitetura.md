# Bússola de Arquitetura — notas-pwa

> **Como ler:** cada seção `# Nome do Arquivo` lista os blocos por **fluxo lógico** (não pela ordem física). Use `[Linhas XX-YY ~]` para localizar, a **âncora** (1º comentário real) para confirmar e a **assinatura** para pedir o trecho exato.
> **Manutenção:** ao alterar código, atualize as linhas `~` e as assinaturas afetadas.
> **⚠️ Regras obrigatórias:** antes de editar, leia **`.clinerules/regras-de-edicao.md`** (padrão de marcação + Regra de Ouro de atualizar esta bússola).

**Partes:** `1) Boot/Shell` ✅ · `2) Motor Notas` ✅ · `3) Tabelas` ✅ · `4) Mapa Mental` ✅ · `5) Testes/Ferramentas` ✅
**Ordem de carga (`index.html`):** `notes/editor.js` → `notes/table-math.js` → `notes/extras.js` → `notes/tables.js` → `app.js` → `mapa/*.js`.
**Marcadores de código:** todo `.js` de app tem `// 🔄 [INÍCIO: PREFIXO - NOME]` … `// 🔄 [FIM: ...]`; blocos grandes usam `- PARTE 1` / `- PARTE 2` no `FIM`.

---

# Nome do Arquivo: index.html
**Propósito:** Casca do PWA. Define o tema antes do 1º paint, os contêineres das duas áreas (Notas | Mapa Mental), a toolbar/modal de notas, e carrega todos os módulos JS + registra o Service Worker.

## Implementação: Boot sem flash e auto-recuperação (watchdog)
- **[Linhas 22-39 ~]** `<!-- 🚀 [INÍCIO: PWA - BOOT SEM FLASH (TEMA ANTES DO CSS E WATCHDOG)] -->` -> `// Resolve o tema antes do CSS carregar para evitar flash visual no primeiro paint.` (script inline)
- **[Linhas 40-47 ~]** `<!-- Auto-recuperação: aparece só se o app não iniciar (cache/Service Worker antigo).` -> `<div id="bootGuard" class="app-boot-guard" hidden role="alert">`
- **[Linhas 48-85 ~]** `/* Watchdog de inicialização: se o app não ficar pronto em 6 s (ou der erro),` -> `(function () { var guard = ...; window.setTimeout(mostrar, 6000); ... })();`

## Implementação: Estrutura das áreas (Notas | Mapa Mental)
- **[Linhas 86-95 ~]** `<!-- 🎨 [INÍCIO: PWA - SHELL (HEADER, ÁREAS E MODAL DE NOTAS)] -->` -> `<header class="app-header border-b border-border pt-4 pb-4 px-4">`
- **[Linhas 96-109 ~]** `<!-- Main Editor Container -->` -> `<main>` + `<nav id="appAreas" role="tablist" hidden>` (Notas | Mapa Mental + `#appVoltarPastas` "‹ Pastas" + `#appAbrirMapa` "Abrir mapa"; escondida na tela raiz de Pastas) + `<section id="pastasArea" hidden>` + `<section id="mapaArea" hidden>`

## Implementação: Modal de Notas (cabeçalho → chips → toolbar → editor)
- **[Linhas 108-199 ~]** `<!-- Notes Modal (Always visible in this PWA) -->` -> `<div class="notes-drawer active" id="notesModalBackdrop">`
  - **[Linhas 111-136 ~]** (cabeçalho) -> `<div class="notes-modal-header">` · `#themeToggle`, `#notesHeaderCollapseBtn`, `#notesFullscreenBtn`, `#notesModalClose`
  - **[Linhas 138 ~]** (sem comentário) -> `<nav class="notes-context-nav" id="notesContextNav">`
  - **[Linhas 140-188 ~]** (toolbar) -> `<div class="notes-toolbar" id="notesToolbar">` (botões `data-command`, `data-notes-color`)
  - **[Linhas 190-192 ~]** (editor) -> `<div class="notes-editor" id="notesEditor" contenteditable="true">`
  - **[Linhas 194-196 ~]** (rodapé/status) -> `<button id="notesSaveStatus" role="status">`
- **[Linhas 200 ~]** `(sem comentário de ancoragem)` -> `<div id="appToastRegion" class="app-toast-region">`

## Implementação: Carga de módulos e registro do Service Worker
- **[Linhas 204-209 ~]** `<!-- 🚀 [INÍCIO: PWA - CARGA DE MÓDULOS E SERVICE WORKER] -->` -> `<script src="./notes/editor.js"> … <script src="./app.js">`
- **[Linhas 210-217 ~]** `(sem comentário de ancoragem)` -> `<script src="./mapa/mapa-modelo.js"> … <script src="./mapa/mapa.js">` (inclui `mapa-cores.js`)
- **[Linhas 217-273 ~]** `/* Service Worker.` -> `(function () { var SW_URL = new URL('sw.js', ...); … })();` (registro com `updateViaCache: 'none'`; `controllerchange` recarrega 1× — plano B do update notification do `app.js`)

---

# Nome do Arquivo: app.js
**Propósito:** Aplicação principal (`NotesPWA` + `ThemeManager`). Instala o motor de notas no protótipo, faz a persistência local (LocalStorage), a UI de múltiplas notas (chips), a toolbar PWA (ordem + teclado), os ajustes para notas grandes e a ATUALIZAÇÃO do app (update notification).

## Implementação: Boot, tema e limites de nota grande
- **[Linhas 1-5 ~]** `// NOTAS PWA - Aplicação Principal (100% no dispositivo)` -> cabeçalho do módulo
- **[Linhas 12-17 ~]** `// 🔄 [INÍCIO: PWA - CONSTANTES DE NOTA GRANDE]` -> `const LIMITE_NOTA_GRANDE = 120000;` · `const LIMITE_RASCUNHO = 800000;`
- **[Linhas 19-83 ~]** `// 🔄 [INÍCIO: PWA - TEMA (ThemeManager)]` -> `class ThemeManager` (`getStoredTheme` / `getSystemTheme` / `bindEvents` / `applyTheme(theme, animate = true)`)
- **[Linhas 85-97 ~]** `// 🔄 [INÍCIO: PWA - APLICAÇÃO (NotesPWA boot/instalação)]` -> `class NotesPWA {` + constantes `FOLGA_BARRA_TECLADO`/`MARGEM_CURSOR_BARRA`
- **[Linhas 98-135 ~]** `(constructor)` -> `constructor()` (estado do editor, histórico, toolbar; `this.themeManager = new ThemeManager()` → `this.init()`)
- **[Linhas 136-163 ~]** `// 🔄 [INÍCIO: ESTADO - MIGRAÇÃO/ABERTURA DA ÚLTIMA NOTA]` -> `init()` (migra nota única → lista; aplica área salva; `window.__notasPronto`; liga `verificarAtualizacaoSW()`)
- **[Linhas 165-180 ~]** `/** Instala o mesmo motor de notas do sistema sobre este protótipo. */` -> `installNotesFeatures()` (+ `installAtualizacaoPWA`)
- **[Linhas 1459-1542 ~]** `// 🚀 [INÍCIO: PWA - ATUALIZAÇÃO DO APP (UPDATE NOTIFICATION)]` -> `installAtualizacaoPWA(App)` (`recarregarParaNovaVersao` · `avisarNovaVersao` · `verificarAtualizacaoSW`: `updatefound`/`statechange` + `controllerchange` + mensagem `SW_ATIVADO` + `setInterval` 60 s)
- **[Linhas 1544-1549 ~]** `// 🚀 [INÍCIO: PWA - BOOT (DOMContentLoaded)]` -> `document.addEventListener('DOMContentLoaded', () => { window.notesApp = new NotesPWA(); });`

## Implementação: Persistência local (sem backend)
- **[Linhas 184-306 ~]** `// 🔄 [INÍCIO: ESTADO - PERSISTÊNCIA LOCAL (SEM BACKEND)]` -> `loadContentFromStorage()` · `saveContentToStorage(html)`
- **[Linhas 210-276 ~]** `// 🔄 [INÍCIO: ESTADO - MÚLTIPLAS NOTAS LOCAIS]` -> `lerNotasLocais()` (migra notas antigas com `pastaId: null`)
- **[Linhas 239-247 ~]** `/** Seam de persistência das notas.` -> `notasBackend()` (`listar` / `obter` / `salvar`)
- **[Linhas 248-271 ~]** `/** Grava a lista de notas e o id da nota ativa no dispositivo. */` -> `gravarNotasLocais(lista)` · `salvarNotasLocais()` · `marcarNotaAtiva(id)` · `lerNotaAtiva()`
- **[Linhas 275-306 ~]** `/** Substitui o cliente HTTP do sistema: qualquer gravação fica no dispositivo. */` -> `async apiCall(endpoint, options = {})` · `persistNow()`

## Implementação: Abrir/editar nota no modal
- **[Linhas 312-354 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - ABRIR NOTAS]` -> `openNotesModal(id)`
- **[Linhas 355-358 ~]** `(sem comentário de ancoragem)` -> `openStageNotesModal(stageId)`
- **[Linhas 609-623 ~]** `// Placeholders chamados pelo motor antes de serem substituídos pelo install.` -> `closeNotesModal()` · `setupModalListeners()` · `toggleNotesFullscreen()` · `toggleNotesHeaderCollapse()`
- **[Linhas 626-648 ~]** `/**` (doc de `placeNotesCursorAtEnd`) -> `placeNotesCursorAtEnd(editor)`
- **[Linhas 649-681 ~]** `/**` (doc de `focusNotesEditorFromEmptyArea`) -> `focusNotesEditorFromEmptyArea(event)`
- **[Linhas 682-720 ~]** `/**` (doc de `rolarCaretParaAcima`) -> `rolarCaretParaAcima()` (**ADAPTATIVO**: cresce o `padding-bottom` do editor quando falta rolagem — a linha do cursor nunca fica sob a barra)
- **[Linhas 721-744 ~]** `/**` (doc de `quebrarLinhaDeEmergencia`) -> `quebrarLinhaDeEmergencia()`
## Implementação: Múltiplas notas (chips + botão "+")
- **[Linhas 359-451 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - MÚLTIPLAS NOTAS (CHIPS + BOTÃO "+")]` -> `pastaPadraoId` (getter) · `notaPertenceAPasta(nota, pastaId)` · `notasDaPasta(pastaId)` · `contarNotasDaPasta(pastaId)` · `definirPastaAtivaNotas(pastaId)` · `renderNotesNav()` (chips filtrados pela pasta ativa)
- **[Linhas 452-471 ~]** `/**` (doc de `accentDaNota`) -> `accentDaNota(nota)` · `invalidarAccentDaNota(id)`
- **[Linhas 472-505 ~]** `/** Cria uma nota nova em branco e abre em seguida (o motor salva a anterior). */` -> `criarNota()` (grava `pastaId` da pasta ativa) · `criarNotaLocal(nome = 'Nova nota')` (`pastaId: null`) · `renomearNota(id)`
- **[Linhas 506-537 ~]** `/** Exclui a nota, sempre com confirmação; se for a última, cria uma vazia. */` -> `async excluirNota(id)`
- **[Linhas 538-690 ~]** `/** Duplica a nota (novo id, mesmo conteúdo/pasta), logo depois do original. */` -> `duplicarNota(id)` · `pastasDeNotas()` · `moverNotaParaPasta(id, pastaId)` · `criarMenuNota(rotulo)` · `mostrarMenuNota(menu, chip)` · `abrirMenuNota(nota, chip)` (Renomear/Duplicar/Mover para pasta/Excluir) · `abrirMenuMoverNota(nota, chip)` · `fecharMenuNota()` · `setupChipLongPress(chip, nota)`

## Implementação: Seleção, avisos e listeners gerais
- **[Linhas 745-765 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - SELEÇÃO DE NOTAS]` -> `rememberNotesSelection()`
- **[Linhas 685-692 ~]** `(sem comentário de ancoragem)` -> `updateNotesHistoryButtons()`
- **[Linhas 693-712 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - AVISOS]` -> `showToast(message, type = 'success')` · `updateSaveStatus(text, isError = false)`
- **[Linhas 714-767 ~]** `// Comandos da toolbar (undo/redo, headings, listas, cores, etc.)` -> `setupEventListeners()` (keydown/atalhos + blindagem do Enter)
- **[Linhas 768-774 ~]** `(sem comentário de ancoragem)` -> `setupResize()`

## Implementação: Toolbar PWA (ordem persistida + edição por arraste)
- **[Linhas 775-791 ~]** `// ⚡ [INÍCIO: PWA - BARRA DE FERRAMENTAS INLINE, ORDEM E TECLADO]` -> `filhosToolbar()` · `chavesToolbar()`
- **[Linhas 801-816 ~]** `(sem comentário de ancoragem)` -> `lerOrdemToolbar()` · `salvarOrdemToolbar(ordem)`
- **[Linhas 817-876 ~]** `/**` (doc de `aplicarOrdemToolbar`) -> `aplicarOrdemToolbar(ordem = null, opcoes = {})` (trava de reentrância)
- **[Linhas 877-891 ~]** `/** (Re)liga o observer da barra (ele fica desligado enquanto aplicamos a ordem). */` -> `agendarOrdemToolbar()`
- **[Linhas 892-928 ~]** `/** Ativa a barra em uma linha com rolagem + botão de edição + ordem salva. */` -> `configurarToolbarPWA()` · `criarBotaoEditarToolbar(toolbar)` · `rotuloBotaoToolbar(el)`
- **[Linhas 929-944 ~]** `/** Move um botão uma posição e persiste a nova ordem. */` -> `moverBotaoToolbar(el, delta)`
- **[Linhas 945-1094 ~]** `/** Diálogo "Editar barra de ferramentas": reordena arrastando (ou pelo teclado) e persiste. */` -> `abrirEditorToolbar()`
- **[Linhas 1095-1101 ~]** `(sem comentário de ancoragem)` -> `restaurarOrdemToolbar()`

## Implementação: Toolbar acoplada ao teclado virtual
- **[Linhas 1102-1177 ~]** `/** Mantém a barra logo acima do teclado virtual (visualViewport). */` -> `ativarToolbarTeclado()` (inclui a rolagem do caret a cada `input`, coalescida num `requestAnimationFrame`)
- **[Linhas 1173-1224 ~]** `/**` (doc de `aplicarToolbarTeclado`) -> `aplicarToolbarTeclado(insetForcado)` (reserva `altura da barra + FOLGA_BARRA_TECLADO` no editor)

## Implementação: Modo mobile e módulos instaladores
- **[Linhas 1239-1288 ~]** `// 🔄 [INÍCIO: PWA - MODO MOBILE (installModoMobileNotas)]` -> `function installModoMobileNotas(App)`
- **[Linhas 1294-1406 ~]** `// 🔄 [INÍCIO: PWA - CAMADA LOCAL DE EXTRAS/TABELAS (installLocalNotesStorage)]` -> `function installLocalNotesStorage(App)`
- **[Linhas 1416-1457 ~]** `// 🔄 [INÍCIO: PWA - AJUSTES DE NOTA GRANDE (installAjustesNotaGrande)]` -> `function installAjustesNotaGrande(App)`

---

# Nome do Arquivo: sw.js
**Propósito:** Service Worker offline-first. Serve o cache na hora e revalida na rede com timeout, garantindo que o app nunca fique preso carregando.

## Implementação: Constantes, helpers e ciclo de vida
- **[Linhas 14-60 ~]** `// 🚀 [INÍCIO: PWA - CONSTANTES DE CACHE E ASSETS ESSENCIAIS]` -> `const CACHE_NAME = 'notas-pwa-v52';` · `const TIMEOUT_MS = 3000;` · `const OFFLINE_HTML` · `const ESSENCIAIS = [...]` (inclui `./mapa/mapa-cores.js`)
- **[Linhas 19-20 ~]** `(sem comentário de ancoragem)` -> `const CACHE_NAME` · `const TIMEOUT_MS`
- **[Linhas 22-32 ~]** `(sem comentário de ancoragem)` -> `const OFFLINE_HTML = '<!DOCTYPE html>...'`
- **[Linhas 33-59 ~]** `/** Assets ESSENCIAIS: sem eles o app não funciona ...` -> `const ESSENCIAIS = [ './', './index.html', ..., './icon.svg' ]`
- **[Linhas 60-109 ~]** `// 💾 [INÍCIO: PWA - HELPERS DE CACHE/FETCH (retry/timeout/revalidar)]` -> `adicionarComRetry` · `buscarComTimeout` · `guardarNoCache` · `revalidar`
- **[Linhas 110-132 ~]** `// 🚀 [INÍCIO: PWA - INSTALL (CACHE INICIAL)]` -> `self.addEventListener('install', (event) => {...})` (aborta se algum essencial faltar)
- **[Linhas 134-153 ~]** `// 🚀 [INÍCIO: PWA - ACTIVATE (LIMPEZA DE CACHES ANTIGOS)]` -> `self.addEventListener('activate', ...)` (limpa caches + `clients.claim()` + avisa as abas com `postMessage({ type: 'SW_ATIVADO' })` — base do update notification)

## Implementação: Estratégia de rede/cache em runtime
- **[Linhas 62-80 ~]** `/** fetch + timeout + cache.put (evita travar a instalação com rede lenta/instável). */` -> `const adicionarComRetry = async (cache, asset, tentativas = 3) => {...}`
- **[Linhas 81-92 ~]** `/** Busca na rede com limite de tempo (nunca deixa o carregamento pendurado). */` -> `const buscarComTimeout = (request, ms) => new Promise(...)`
- **[Linhas 93-101 ~]** `/** Guarda a resposta no cache sem bloquear quem está esperando. */` -> `const guardarNoCache = (request, response) => {...}`
- **[Linhas 102-108 ~]** `/** Revalida em segundo plano (stale-while-revalidate) sem bloquear a resposta. */` -> `const revalidar = (request) => {...}`
- **[Linhas 155-193 ~]** `// 🚨 [INÍCIO: CRÍTICO - FETCH STRATEGY (CACHE-FIRST + TIMEOUT)]` -> `self.addEventListener('fetch', ...)` (cache → rede com timeout → fallback `index.html`/`OFFLINE_HTML`)

## Implementação: Mensagens do cliente
- **[Linhas 195-212 ~]** `// 🔄 [INÍCIO: ESTADO/API - MESSAGE HANDLING]` -> `self.addEventListener('message', ...)` (`SKIP_WAITING`, `CACHE_UPDATED`)

---

# Nome do Arquivo: manifest.json
**Propósito:** Manifesto do PWA (nome, ícones, display standalone, atalhos).
- **[Linhas 1-47 ~]** `(JSON — sem comentários de ancoragem)` -> `{ "name": "Notas PWA - Editor de Notas", "display": "standalone", "icons": [...], "shortcuts": [...] }`

---

# Nome do Arquivo: _redirects / _headers
**Propósito:** Regras de deploy (Cloudflare Pages/Netlify) — impedem que `/sw.js` e `/manifest.json` caiam no fallback de SPA (SW servido como HTML é rejeitado em silêncio) e definem os cabeçalhos de cache/content-type.
- **[Linhas 1-8 ~]** `# Cloudflare Pages / Netlify: regras avaliadas de cima para baixo.` -> `_redirects`: `/sw.js → /sw.js 200` · `/manifest.json → /manifest.json 200`
- **[Linhas 1-21 ~]** `# Cloudflare Pages - regras de resposta HTTP` -> `_headers`: `Cache-Control: must-revalidate` para `/*` + para `/sw.js` `Cache-Control: no-store, no-cache, must-revalidate`, `Content-Type: application/javascript` e `Service-Worker-Allowed: /` (SW nunca retido em cache)

---

# Nome do Arquivo: styles.css
**Propósito:** CSS base do PWA (tokens de tema, cor da barra de status, base e componentes próprios). Distinto de `theme-origem.css` (tema portado do original).
- **[Linhas 5-36 ~]** `/* 🎨 [INÍCIO: PWA/ESTILO - VARIÁVEIS DE TEMA] */` -> `:root { --color-* }` + tokens da barra de status (claro/escuro)
- **[Linhas 38-818 ~]** `/* 🎨 [INÍCIO: PWA/ESTILO - BASE E COMPONENTES] */` -> `body`, `button` e componentes próprios do app (inclui `.app-toast*` e o aviso de nova versão `.app-toast.is-update`/`.app-toast-action`)

# Nome do Arquivo: theme-origem.css
**Propósito:** Tema portado do CSS COMPILADO do projeto original (tokens + classes do sistema antigo). Regenerado por `tools/extrair-tema.cjs`.
- **[Linhas 1-1428 ~]** `/* 🎨 [INÍCIO: PWA/ESTILO - TEMA PORTADO DO ORIGINAL] */` -> tokens `--*` e classes do compilado

# Nome do Arquivo: notes/editor.css
**Propósito:** Estilos do editor de notas (linhas, cabeçalho, colapso, paleta de tons, código e nota grande).
- **[Linhas 1-137 ~]** `/* 🎨 [INÍCIO: NOTAS/ESTILO - EDITOR (LINHAS, CABEÇALHO, COLAPSO)] */` -> regras `#notesEditor .notes-line*`, `#notesToolbar[hidden]`
- **[Linhas 138-287 ~]** `/* 🎨 [INÍCIO: NOTAS/ESTILO - PALETA DE TONS, CÓDIGO E NOTA GRANDE] */` -> `.notes-tone-*`, `.notes-code*`, `content-visibility` em nota grande

# Nome do Arquivo: notes/extras.css
**Propósito:** Estilos dos diálogos extras (inserir/link/modelos) e do visualizador de arquivo.
- **[Linhas 1-72 ~]** `/* 🎨 [INÍCIO: NOTAS/ESTILO - DIÁLOGOS EXTRAS E VISUALIZADOR DE ARQUIVO] */` -> `.notes-extra-dialog`, `.notes-file-viewer`, `.notes-insert-menu`, `.notes-context-menu`

# Nome do Arquivo: notes/tables.css
**Propósito:** Estilos da barra de ferramentas da tabela, do endereço/formula da célula e dos cursores de resize.
- **[Linhas 1-30 ~]** `/* 🎨 [INÍCIO: NOTAS/ESTILO - BARRA DE FERRAMENTAS DA TABELA + RESIZE] */` -> `.notes-table-*`, `#notesEditor[data-table-resize]`

# Nome do Arquivo: mapa/mapa.css
**Propósito:** Estilos da área do mapa (shell, topbar, chips de gestão, canvas/nós, conexões, minimapa, painel de propriedades e controles do layout automático).
- **[Linhas 1-1067 ~]** `/* 🎨 [INÍCIO: MAPA/ESTILO - ÁREA, CANVAS, NÓS, PAINEL E CONEXÕES] */` -> tokens `--mapa-*` (espelho do tema de Notas: claro = tokens globais; escuro = `#151B23`/`#11161D`/`#0D1218`/`#2A3543`/`#263241`/`#334155`/`#CBD5E1`/`#E2E8F0`/`#F8FAFC`/`#94A3B8`/`#202A36`) + classes `mapa-*` (F8: `#mapaNos.mapa-transicao`, `.mapa-espacamento`, `.mapa-campo-numero`, `.mapa-confirmacao`; F9: `.mapa-no-forma-*`/`-fonte-*`/`-alinha-*`/`-negrito`/`-italico`, `.mapa-estilo-nivel*`, `.mapa-campo-cor`, `.mapa-painel-estilo`; F10: `.mapa-atalhos*`; F11: `.mapa-btn:disabled`; F12: `.mapa-toolbar`/`.mapa-format-bar`/`.mapa-tb-*` (uma linha com rolagem, cores de Notas), **ícones padronizados `.mapa-tb-btn svg` 16×16 / `.mapa-tb-mais-resumo svg` 18×18 / `.mapa-menu-item svg` 16×16**, **`.mapa-tb-fixos`** (ações rápidas irmão/filho `sticky` à DIREITA da barra de formatação), **menu de opções `.mapa-menu-opcoes`/`.mapa-menu-item-ativo`/`.mapa-menu-item-texto`**, `.mapa-menu*`, `.mapa-barra-editor*`, `.mapa-cor-paleta*`; blindagem: `.mapa-falha*` — aviso visível quando a área do mapa não monta)

---

# Nome do Arquivo: notes/editor.js
**Propósito:** Motor do editor de notas (camada de domínio + DOM). Define o modelo versionado (`NotesDocument`) e instala no protótipo todos os comandos do editor: importação/render, formatação, cores, comandos, atalhos, toolbar, sessão e persistência da nota.

## Implementação: Modelo de documento (`NotesDocument`)
- **[Linhas 2-110 ~]** `// 🔄 [INÍCIO: NOTAS - MODELO DE DOCUMENTO (NotesDocument)]` -> `class NotesDocument` (`VERSION` / `MAX_LEVEL` / `id()` / `reindex()` / `snapshot()` / `restore()` / `descendants()` / `setCompletion()` / `indent()` / `move()`)

## Implementação: Motor / Importação (sanitize → walk → render)
- **[Linhas 113-251 ~]** `// 🔄 [INÍCIO: NOTAS - MOTOR/IMPORTAÇÃO (install/sanitize/walk/render)]` -> `function installNotesEditor(App)`
- **[Linhas 128 ~]** `(sem comentário de ancoragem)` -> `function markdownRows(source)`
- **[Linhas 152 ~]** `(sem comentário de ancoragem)` -> `function indentImportedSections(root)`
- **[Linhas 162-171 ~]** `function sanitize(root)` · `function normalize(root)` -> limpeza/normalização do HTML importado
- **[Linhas 176-220 ~]** `function walkChildren(nodes,depth=0,list='')` · `function walk(node, depth = 0, list = '')` · `readNode(node)` · `writeNode(node)` · `captureDocument()`
- **[Linhas 234 ~]** `(sem comentário de ancoragem)` -> `function renderDocument(model,root=editor())`
- **[Linhas 249-250 ~]** `(sem comentário de ancoragem)` -> `p.syncNotesDocument()` · `p.renderNotesDocument()`

## Implementação: Alvo e apresentação (targets / syntax / colapso)
- **[Linhas 253-407 ~]** `// 🔄 [INÍCIO: NOTAS - ALVO E APRESENTAÇÃO (targets/syntax/colapso)]`
- **[Linhas 254 ~]** `(sem comentário de ancoragem)` -> `function targets(line,all=lines(),start=all.indexOf(line),structural=false)`
- **[Linhas 266 ~]** `p.refreshNotesSyntaxHighlight=function()` · **[281 ~]** `p.refreshNotesCodePresentation=function()`
- **[Linhas 314-406 ~]** `(sem comentário de ancoragem)` -> `p.refreshNotesCollapseControls` (marcadores/botão de colapso + `completionLabel`)

## Implementação: Exportação, seleção e histórico
- **[Linhas 409-459 ~]** `// 🔄 [INÍCIO: NOTAS - EXPORTAÇÃO, SELEÇÃO E HISTÓRICO]`
- **[Linhas 410-413 ~]** `(sem comentário de ancoragem)` -> `p.getCleanNotesHtml = function()`
- **[Linhas 414-432 ~]** `(sem comentário de ancoragem)` -> `bookmark()` · `point(node,offset)` · `caret(line,offset=0,range=null,end=false)` · `selected()` · `deleteSelection()`
- **[Linhas 443-458 ~]** `(sem comentário de ancoragem)` -> `p.restoreNotesSelection()` · `p.resetNotesHistory()` · `p.flushNotesTyping()` · `p.recordNotesHistory(typingOnly=false)` · `p.undoNotes()` / `p.redoNotes()` / `p.restoreNotesHistory(index)`

## Implementação: Formatação e cores
- **[Linhas 461-624 ~]** `// 🔄 [INÍCIO: NOTAS - FORMATAÇÃO E CORES]`
- **[Linhas 462-476 ~]** `(sem comentário de ancoragem)` -> `function selectedHeading()` · `function formatSelectionHeading(value,mark,chosen)`
- **[Linhas 477-533 ~]** `(sem comentário de ancoragem)` -> `function formatWholeLine(line,command,enabled)`
- **[Linhas 534-623 ~]** `// 🔄 [INÍCIO: NOTAS - PALETA DE CORES (setupNotesColors)]` -> `p.setupNotesColors=function()` (paleta, cor personalizada, recentes, `pendingColor`)

## Implementação: Comandos e atalhos
- **[Linhas 626-677 ~]** `// 🔄 [INÍCIO: NOTAS - COMANDOS (executeNotesCommand)]` -> `p.executeNotesCommand=function(command)`
- **[Linhas 679-831 ~]** `// 🔄 [INÍCIO: NOTAS - ATALHOS (handleNotesEditorShortcut)]` -> `p.handleNotesEditorShortcut=function(event)` (Ctrl+A, Alt+setas, Ctrl+Alt+1..7, Ctrl+B/I/U/S/Z/Y, Tab, Enter)

## Implementação: Estado da toolbar, checklist e setup
- **[Linhas 833-869 ~]** `// 🔄 [INÍCIO: NOTAS - ESTADO DA TOOLBAR E CHECKLIST]`
- **[Linhas 834-858 ~]** `p.updateNotesToolbarState=function()` · `p.updateNotesChecklistOrder=function(check)` · `p.animateNotesMovement=function(positions)`
- **[Linhas 871-1002 ~]** `// 🔄 [INÍCIO: NOTAS - SETUP/EDIÇÃO (setupNotesEditing)]` -> `p.setupNotesEditing=function()` (liga keydown/Enter, paste, colapso, etc.)

## Implementação: Sessão / modal (status → autosave → open/close)
- **[Linhas 1004-1044 ~]** `// 🔄 [INÍCIO: NOTAS - SESSÃO/MODAL (status/autosave/open/close)]`
- **[Linhas 1006-1040 ~]** `p.notesStatus=function()` · `p.storeNotesDraft=function()` · `p.queueNotesSave=function()` · `p.saveNotes=async function()` · `p.applyNotesOutlineDefaults=function()` · `p.beginNotesSession=function()`
- **[Linhas 1041-1043 ~]** `p.openNotesModal=async function(id)` · `p.openStageNotesModal=async function(id)` · `p.closeNotesModal=async function()`

## Implementação: Cabeçalho, colapso geral, motion e fullscreen
- **[Linhas 1046-1105 ~]** `// 🔄 [INÍCIO: NOTAS - CABEÇALHO, COLAPSO, MOTION E FULLSCREEN]`
- **[Linhas 1047-1048 ~]** `p.setNotesHeaderCollapsed=function(collapsed)` · `p.toggleNotesHeaderCollapse=async function()`
- **[Linhas 1058-1089 ~]** `p.toggleAllNotesCollapse=function()` · `p.animateNotesLineCollapse=async function(line)` · `p.notesPanelMotion=async function(element,hide,version)`
- **[Linhas 1090 ~]** `p.toggleNotesFullscreen=async function(force)`

## Implementação: Resize do modal
- **[Linhas 1107-1124 ~]** `// 🔄 [INÍCIO: NOTAS - RESIZE (setupNotesResize)]` -> `p.setupNotesResize=function()` (handle `#notesResizeHandle`, teclado e fullscreen)

---

# Nome do Arquivo: notes/extras.js
**Propósito:** Ferramentas extras da nota (sem backend): janela/diálogo base, inserção de nós/divisores/links/mídia, visualizador de arquivo e a barra com o menu "Mais".

## Implementação: Instalação e helpers
- **[Linhas 2-10 ~]** `// 🔄 [INÍCIO: NOTAS/EXTRAS - INSTALAÇÃO E HELPERS]` -> `function installNotesExtras(App)` (`p`=protótipo, `editor()` / `body(row)` / `rowAt(node)` / `safeURL` / `youtube` / `button(...)`)

## Implementação: Janela/diálogo base (âncora + posicionamento)
- **[Linhas 12-30 ~]** `// 🔄 [INÍCIO: NOTAS/EXTRAS - JANELA/DIÁLOGO BASE (notesExtraDialog)]`
- **[Linhas 13-16 ~]** `p.notesExtraRequest` · `p.notesCaptureInsertion()` · `p.notesRestoreInsertion(saved)`
- **[Linhas 17-29 ~]** `p.notesExtraDialog=function(title,build,trigger)` (`place()` / `position()` / fechar restaura a inserção)

## Implementação: Inserção de conteúdo (nó/divisor/link/mídia/upload)
- **[Linhas 32-96 ~]** `// 🔄 [INÍCIO: NOTAS/EXTRAS - INSERÇÃO DE CONTEÚDO (nó/divisor/link/mídia)]`
- **[Linhas 33-45 ~]** `p.notesRevealInsertion(row)` · `p.notesInsertNode(node)` · `p.notesDivider()`
- **[Linhas 52-64 ~]** `p.notesLinkDialog()` · `p.notesAutoLinks(row,commit=true)`
- **[Linhas 65-79 ~]** `p.notesFocusMedia(media)` · `p.notesBackspaceMedia()` · `p.notesMedia(kind,value,name)`
- **[Linhas 80-95 ~]** `p.notesVideoDialog(initial='')` · `p.notesUpload(image=false)` · `p.notesInsertMenu()` · `p.notesTableDialog()` · `p.notesDateDialog()` · `p.notesTemplates()`

## Implementação: Visualizador de arquivo (páginas/anotações)
- **[Linhas 98-116 ~]** `// 🔄 [INÍCIO: NOTAS/EXTRAS - VISUALIZADOR DE ARQUIVO (notesFileViewer)]` -> `p.notesFileViewer=async function(id)` (`render()` / `paint()` / `point(offset)` / abas de planilha)

## Implementação: Barra e menu "Mais" + delegações
- **[Linhas 118-147 ~]** `// 🔄 [INÍCIO: NOTAS/EXTRAS - BARRA E MENU MAIS (setupNotesEditing)]` -> `p.setupNotesEditing=function()` (botões extras, teclado em células, overflow `…` com `layout()`)
- **[Linhas 149-152 ~]** `// 🔄 [INÍCIO: NOTAS/EXTRAS - DELEGAÇÕES (refresh/clean)]` -> `p.refreshNotesCollapseControls()` (atalhos em título) · `p.getCleanNotesHtml()` (remove `<iframe>`)

---

# Nome do Arquivo: notes/tables.js
**Propósito:** Ferramentas contextuais de tabela (estilo planilha). Só recalcula a tabela em edição e integra-se ao histórico/motor de notas.

## Implementação: Instalação e helpers
- **[Linhas 2-13 ~]** `// 🔄 [INÍCIO: NOTAS/TABELA - INSTALAÇÃO E HELPERS]` -> `function installNotesTables(App)` (`cellAt` / `tableOf` / `cells` / `label` / `source` / `functions[]` / `messages{}`)

## Implementação: Recálculo e formatos da tabela
- **[Linhas 15-38 ~]** `// 🔄 [INÍCIO: NOTAS/TABELA - RECÁLCULO (notesRecalculateTable)]` -> `p.notesRecalculateTable=function(table,skip=null)` (grade → `NotesTableMath.calculate` → formato auto/número/moeda/porcentagem → `data-formula-error`)

## Implementação: Histórico (integração com o motor)
- **[Linhas 40-45 ~]** `// 🔄 [INÍCIO: NOTAS/TABELA - HISTÓRICO]` -> `p.recordNotesHistory=function(...args)` (flush de `notesDirtyTables` antes do snapshot)

## Implementação: Painel/edição (setupNotesEditing)
- **[Linhas 47-144 ~]** `// 🔄 [INÍCIO: NOTAS/TABELA - PAINEL/EDIÇÃO (setupNotesEditing)]` -> `p.setupNotesEditing=function()`
- **[Linhas 55-76 ~]** `const fill=` · `const commit=` · `confirm` · `functionsMenu` (ƒx) · `help` · `formats` (`numberFormat`/`currency`/`decimals`)
- **[Linhas 77-88 ~]** `const markSelection=` · `function select(cell,extend=false)` · `coordinates(cell)` · `widths(table)` · `setWidths(table,values)`
- **[Linhas 89-110 ~]** `// 🔄 [INÍCIO: NOTAS/TABELA - AJUSTES (openSettings)]` -> `function openSettings()` (largura/altura, fundo/borda, aplicar a seleção/linha/coluna/tabela)
- **[Linhas 111-142 ~]** listeners: `selectionchange` · `input` · `keydown` ( `=`/`Enter`/`Tab`/Backspace) · `dblclick` · `pointerdown` (arraste de coluna/linha + referência) · `pointermove` · `pointerup/cancel`

---

# Nome do Arquivo: notes/table-math.js
**Propósito:** Avaliador numérico de fórmulas (parser próprio, nunca executa JS). Expõe `NotesTableMath` (ou `module.exports`) com `evaluate`, `calculate`, `numeric`, `address`, `coordinates`.

## Implementação: Funções de célula (`call` + aliases PT/EN)
- **[Linhas 7-37 ~]** `// 🔄 [INÍCIO: TABELA - FUNÇÕES (call)]` -> `function call(name,args)` (`SOMA`/`MEDIA`/`MINIMO`/`MAXIMO`/`CONTAR`/`PRODUTO`, `POTENCIA`/`RAIZ`/`RESTO`/`ARRED`/trig/`PISO`/`TETO`/`FATORIAL`)

## Implementação: Referências de célula
- **[Linhas 39-43 ~]** `// 🔄 [INÍCIO: TABELA - REFERÊNCIAS (address/coordinates/numeric)]` -> `function address(row,col)` · `function coordinates(ref)` · `function numeric(raw)`

## Implementação: Parser / avaliador
- **[Linhas 45-72 ~]** `// 🔄 [INÍCIO: TABELA - PARSER/AVALIADOR (evaluate)]` -> `function evaluate(expression,read)` (`add`/`multiply`/`unary`/`power`/`atom`, `#FORMULA!`/`#LIMITE!`)

## Implementação: Grade e dependências
- **[Linhas 74-80 ~]** `// 🔄 [INÍCIO: TABELA - GRADE/DEPENDÊNCIAS (calculate)]` -> `function calculate(grid)` (`cache`, `visiting`, `#CICLO!`)

## Implementação: API pública
- **[Linhas 82-84 ~]** `// 🔄 [INÍCIO: TABELA - API PÚBLICA]` -> `const api={evaluate,calculate,numeric,address,coordinates}`

---

# Nome do Arquivo: mapa/mapa-modelo.js
**Propósito:** Modelo do grafo mental (domínio puro, sem DOM): nós, hierarquia, conteúdo/sanitização, templates/interligação, comandos de nó e de conteúdo, estilo visual/temas (F9), conexões livres e normalização do layout/espaçamento/tema (F8/F9).

## Implementação: Modelo/grafo e conteúdo/sanitização
- **[Linhas 30-358 ~]** `// 🔄 [INÍCIO: MAPA - MODELO/GRAFO]` -> `global.MapaMentalModelo` (`LARGURA_NO`, `obterNo`/`listarFilhos`/`criarFilhoDe`/`criarIrmaoDe`/`criarNoIndependente`, `excluirSubarvore`/`duplicarSubarvore`/`copiarSubarvore`/`colarSubarvore`; F8: `ESPACO_NO_PADRAO`/`ESPACO_NIVEL_PADRAO`/`ESPACO_MAX`/`normalizarEspacamento`; F9: `estilosNivel`/`temaId` em `criarGrafo`/`migrarGrafo`/`normalizarGrafo`/`duplicarGrafo`)
  - **[Linhas 33-96 ~]** `// 🔄 [INÍCIO: MAPA - CONTEÚDO/SANITIZAÇÃO]` ... `// 🔄 [FIM: ... - PARTE 1]` -> sanitização do HTML do nó
  - **[Linhas 97-159 ~]** (continuação) -> `// 🔄 [FIM: MAPA - CONTEÚDO/SANITIZAÇÃO - PARTE 2]` (`extrairLinks`, normalização de campos)
- **[Linhas 360-401 ~]** `// 🔄 [INÍCIO: MAPA - TEMPLATES/INTERLIGAÇÃO]` -> `TEMPLATES_PRONTOS`, criação a partir de template, nó-ponte/backlinks
- **[Linhas 403-623 ~]** `// 🔄 [INÍCIO: MAPA - COMANDOS DE NÓ]` -> criar/editar/excluir/mover/recolher/largura do nó
- **[Linhas 626-712 ~]** `// 🔄 [INÍCIO: MAPA - COMANDOS DE CONTEÚDO]` -> anexos, tags, links, refs, emoji/ícone, tarefa, **vínculo Notas↔Mapa** (`notaRef` em `criarNo`/`atualizarConteudo`/`definirNotaRef`)
- **[Linhas 703-836 ~]** `// 🔄 [INÍCIO: MAPA - ESTILO (FASE 9)]` -> `FORMAS_NO`/`ALINHAMENTOS_NO`/`FONTES_NO`/`TAMANHOS_NO`/`ESPESSURAS_BORDA`/`TEMAS_MAPA`, `normalizarEstilo`, `normalizarEstilosNivel`, `temaDoMapa`, `nivelDoNo`, `estiloEfetivo` (nó > nível > tema), `copiarEstiloNo`, `atualizarEstiloNo`, `limparEstiloNo`, `definirEstiloNivel`, `removerEstiloNivel`, `definirTemaMapa`
- **[Linhas 838-924 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÕES LIVRES (FASE 6)]` -> conexões manuais entre nós

---

# Nome do Arquivo: mapa/mapa-store.js
**Propósito:** Persistência local (LocalStorage) do índice de mapas, pastas, recentes, templates, mapa ativo, área ativa e atalhos do mapa. Chaves com prefixo `notas-pwa-`.

## Implementação: Chaves, área ativa, atalhos e barra
- **[Linhas 9-23 ~]** `(sem marcador de ancoragem)` -> `CHAVES{}` (`pastas`, `area`, `pastaAtiva`, `split`, `atalhos`, `barra`), `TETO_RECENTES`, `chaveGrafo(id)`, `chaveHistorico(id)`, `novoId(prefixo)`
- **[Linhas 39-44 ~]** `// 🔄 [INÍCIO: MAPA - ÁREA ATIVA]` -> `AREAS` (`pastas`/`notas`/`mapa`), `lerAreaAtiva()` (padrão `pastas`) · `salvarAreaAtiva(area)` (`notas-pwa-area-ativa`)
- **[Linhas 42-58 ~]** `// 🔄 [INÍCIO: MAPA - ATALHOS (FASE 10)]` -> `lerAtalhos`/`salvarAtalhos`/`limparAtalhos` (`notas-pwa-mapa-atalhos`) + `lerOrdemBarra`/`salvarOrdemBarra`/`limparOrdemBarra` (`notas-pwa-mapa-toolbar-order`, F12)

## Implementação: Índice / CRUD de mapas
- **[Linhas 60-211 ~]** `// 🔄 [INÍCIO: MAPA - ÍNDICE/CRUD]` -> `listarMapas` / `salvarListaMapas` / `obterResumo` / `obterGrafo` / `criarMapa` / renomear / duplicar / excluir / arquivar

## Implementação: Pastas, recentes, templates e ativo
- **[Linhas 217-322 ~]** `// 🔄 [INÍCIO: MAPA - PASTAS/RECENTES/TEMPLATES/ATIVO]` -> pastas (CRUD) + `ID_PASTA_PADRAO`/`garantirPastaPadrao` (pasta "Geral"), `lerPastaAtiva`/`salvarPastaAtiva`, `contarMapasDaPasta`, `lerSplit`/`salvarSplit` (lado a lado), `listarRecentes`, `salvarTemplate`, `obterMapaRaiz`, histórico do grafo

---

# Nome do Arquivo: mapa/mapa-layout.js
**Propósito:** Layout e medição do canvas (fases 2/5/8): posições em árvore por raiz SEM SOBREPOSIÇÃO (dimensões reais), espaçamento normalizado, limites do mundo, geometria do minimapa e medição dos nós no DOM.

## Implementação: Constantes/dimensões, layout e API
- **[Linhas 9-60 ~]** `// 🔄 [INÍCIO: MAPA - CONSTANTES/DIMENSÕES]` -> `LARGURA_PADRAO`/`ALTURA_PADRAO`/`ALTURA_LINHA`/`PADDING_VERTICAL`/`FOLGA`/`ESPACO_MIN`/`ESPACO_MAX`/`LAYOUTS[]` + `normalizarEspacamento(espacamento)` + `estimarAltura(no, largura)` + `dimensoesNo(no, medidas)`
- **[Linhas 77-233 ~]** `// 🔄 [INÍCIO: MAPA - LAYOUT EM ÁRVORE (calcularPosicoes)]` -> `function calcularPosicoes(grafo, opcoes)` (bilateral/tradicional/esquerda-direita/arvore-vertical/organograma/livre; travessia iterativa; F8: altura/largura reais via `cfg.medidas`, coluna por profundidade e `desobrepor` para folga mínima)
- **[Linhas 235-253 ~]** `// 🔄 [INÍCIO: MAPA - POSIÇÕES GARANTIDAS (garantirPosicoes)]` -> `function garantirPosicoes(grafo)`
- **[Linhas 255-281 ~]** `// 🔄 [INÍCIO: MAPA - LIMITES/FIT (limites)]` -> `function limites(grafo, lista)`
- **[Linhas 283-320 ~]** `// 🔄 [INÍCIO: MAPA - MINIMAPA (minimapa/pontoDoMinimapa/medirNo)]` -> `minimapa(estado)` · `pontoDoMinimapa(estado,mx,my)` · `medirNo(elemento)`
- **[Linhas 322-342 ~]** `// 🔄 [INÍCIO: MAPA - MEDIÇÃO DO DOM (medidasDoDom)]` -> `function medidasDoDom(grafo, raiz)` (`offsetWidth/offsetHeight` dos nós renderizados — F8)
- **[Linhas 344-350 ~]** `// 🔄 [INÍCIO: MAPA - API PÚBLICA]` -> `global.MapaMentalLayout = {...}`

---

# Nome do Arquivo: mapa/mapa-painel.js
**Propósito:** Painel de propriedades do nó (fases 4/9). Monta o formulário de conteúdo (título/descrição/notas/links/tags/emoji/ícone/tarefa/prioridade/status/datas/anexos/ponte) e a seção **Estilo** (cores/forma/fonte/tamanho/alinhamento + pincel). Só monta quando aberto.

## Implementação: Helpers de DOM/rótulos, blocos, meta e formulário
- **[Linhas 10-75 ~]** `// 🔄 [INÍCIO: MAPA - HELPERS DE DOM / RÓTULOS]` -> `EMOJIS[]` · `criar(...)` · `campo(...)` · `botao(...)` · `ROTULO_PRIORIDADE`/`ROTULO_STATUS` · `campoCorComHerda(...)` · `selectEstilo(...)`
- **[Linhas 77-134 ~]** `// 🔄 [INÍCIO: MAPA - BLOCOS DE CONTEÚDO (links/anexos/ponte)]` -> `blocoLinksDetectados(no)` · `blocoAnexos(no)` · `blocoPonte(no, contexto)`
- **[Linhas 136-200 ~]** `// 🔄 [INÍCIO: MAPA - SEÇÃO ESTILO (FASE 9)]` -> `function blocoEstilo(no, contexto)` (cores com "usar", forma/fonte/tamanho/negrito/itálico/alinhamento/espessuras + copiar/aplicar/restaurar)
- **[Linhas 202-245 ~]** `// 🔄 [INÍCIO: MAPA - LINHAS META (prioridade/status/datas)]` -> `linhaMeta(no)` · `linhaDatas(no)`
- **[Linhas 252-362 ~]** `// 🔄 [INÍCIO: MAPA - FORMULÁRIO DO PAINEL (montarPainel)]` -> `function montarPainel(no, contexto)` (`#mapaPainelForm`, `data-mapa-form="no-conteudo"`, + `blocoEstilo` + `blocoNotaRef`) · `blocoNotaRef(no, contexto)` (select `#mapaPainelNotaRef` + atalho "Abrir nota")
- **[Linhas 350-355 ~]** `// 🔄 [INÍCIO: MAPA - API PÚBLICA]` -> `global.MapaMentalPainel = {...}`

---

# Nome do Arquivo: mapa/mapa-render.js
**Propósito:** Renderização da área do mapa (HTML puro): shell, topbar de gestão, mapa aberto (canvas/nós/minimapa), **barras padronizadas (F12: `#mapaToolbar` fixa + `#mapaFormatBar` contextual, com ÍCONES PADRONIZADOS de 16×16 e os mesmos desenhos da barra de Notas onde a função coincide)**, menu contextual do card, painéis de atalhos/edição de barra, lista de gestão, recentes/templates e conexões.

## Implementação: Shell, topbar e gestão
- **[Linhas 61-146 ~]** `// 🔄 [INÍCIO: MAPA - SHELL DA ÁREA]` -> estrutura base da `#mapaArea` + contêineres `#mapaToolbar`/`#mapaFormatBar` + botões `#mapaSplitBtn` (lado a lado) e `#mapaColapsoBarras` na topbar (helpers `campoNumero`/`campoCor` acima do bloco)
- **[Linhas 141-280 ~]** `// 🔄 [INÍCIO: MAPA - TOPBAR/FORMULÁRIO]` -> busca/ordenação e formulários inline (`form[data-mapa-form]`); `atualizarShell` esconde as barras/colapso na lista e os controles de lista no mapa
- **[Linhas 1072-1112 ~]** `// 🔄 [INÍCIO: MAPA - GESTÃO (LISTA)]` -> lista de mapas (abrir/renomear/duplicar/excluir/estrela/arquivar)
- **[Linhas 1114-1171 ~]** `// 🔄 [INÍCIO: MAPA - RECENTES/TEMPLATES/LISTA]` -> recentes, templates prontos/salvos, pastas

## Implementação: Mapa aberto, barras, menus e conexões
- **[Linhas 275-1070 ~]** `// 🔄 [INÍCIO: MAPA - MAPA ABERTO]` -> `#mapaCanvasWrap`, nós, minimapa, backlinks, confirmação de layout (F8), painel de atalhos (F10), `editorBarra` (F12)
  - **[Linhas 368-898 ~]** `// 🔄 [INÍCIO: MAPA - BARRAS PADRONIZADAS (FASE 12)]` -> **ícones padronizados** (`ICONES`/`icone()`/`btnIcone()`/`btnMenu()` — 16×16, `stroke: currentColor`, e os MESMOS desenhos da barra de Notas em negrito/itálico/cor/destaque/desfazer/refazer; `irmao`/`filho` para as ações rápidas), `btnBarra`/`grupoBarra`/`divisorBarra`/`aplicarOrdemBarra`, `renderBarras`, `grupoExibir`, `grupoMais`, `comEstado`, `renderFormatBar` (inclui o grupo **`.mapa-tb-fixos`** — ações rápidas **irmão/filho fixas à direita**), **`OPCOES_BARRA`/`rotuloOpcao`/`btnOpcoes`/`menuOpcoesBarra`** (fonte/forma/alinhamento em UM botão com menu), `menuContextual`, `editorBarra`; último: `noCanvas` ganha o atalho `.mapa-no-nota-icone` (`abrir-nota`) quando o nó tem `notaRef`)
- **[Linhas 1202-1467 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÕES (FASE 6)]` -> camada de conexões livres (F9: `stroke-width` do ramo pelo estilo efetivo) + `menuConexao`

---

# Nome do Arquivo: mapa/mapa-interacao.js
**Propósito:** Interação direta no canvas (Pointer Events): seleção, edição inline do nó, arrasto/redimensionar/laço, conexão por arrasto, pan/zoom, atalhos (com keymap configurável — F10).

## Implementação: Seleção, edição inline, arrasto, conexão e atalhos
- **[Linhas 54-72 ~]** `// 🔄 [INÍCIO: MAPA - SELEÇÃO]` -> `selecionar` / `idPrincipal` / `idsSelecionados`
- **[Linhas 74-130 ~]** `// 🔄 [INÍCIO: MAPA - EDIÇÃO INLINE]` -> editar título no próprio nó (duplo clique/F2)
- **[Linhas 132-314 ~]** `// 🔄 [INÍCIO: MAPA - ARRASTO/REDIMENSIONAR/LAÇO]` -> mover nó(s), alça de resize, laço, **toque longo → menu do card (F12)**
- **[Linhas 316-367 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÃO POR ARRASTO (FASE 6)]` -> criar conexão arrastando da porta do nó
- **[Linhas 369-576 ~]** `// 🔄 [INÍCIO: MAPA - PONTEIRO/RODA]` -> pan (arrastar), `Ctrl+scroll`/pinça (zoom), clique no minimapa
- **[Linhas 578-655 ~]** `// 🔄 [INÍCIO: MAPA - MAPA DE ATALHOS (FASE 10)]` -> `ACOES_ATALHO`, `assinaturaTecla`, `normalizarPreferenciasAtalho`, `mapaDeAtalhos`, `conflitoDeAtalho`, `teclasDaAcao`
- **[Linhas 657-792 ~]** `// 🔄 [INÍCIO: MAPA - ATALHOS]` -> `atalho(evento)` (keymap), `selecionarTodos` (Ctrl+A), `navegar(idNo, direção)`, `contextMenu(evento)` (botão direito → menu), `duploClique`

---

# Nome do Arquivo: mapa/mapa.js
**Propósito:** Orquestrador da área Mapa Mental. Instala `installMapaMental(NotesPWA)`, monta lazy e liga store/render/modelo/layout/interação: gestão de mapas, canvas/viewport, CRUD de nós, hierarquia, layout automático (F8), estilo visual (F9), atalhos (F10), undo/redo (F11), barras/menu contextual/cores (F12), conteúdo, conexões e isolamento das áreas.

## Implementação: Estado/helpers e render/controle
- **[Linhas 9-78 ~]** `// 🔄 [INÍCIO: MAPA - ESTADO/HELPERS]` -> `store()`/`modelo()`/`render()`, `dadosGestao()`, `abrirMapa(id)`, `definirRaiz(id)`, `conectarMapa(origemId,destinoId)`, `aplicarTemplatePronto`/`aplicarTemplateSalvo`
- **[Linhas 80-391 ~]** `// 🔄 [INÍCIO: MAPA - RENDER/CONTROLE]` -> `renderArea()` (guarda de BLINDAGEM; renderiza `#mapaToolbar`/`#mapaFormatBar` ANTES do mapa; reaplica `setMapaBarrasColapsadas`; nome da nota vinculada), `tratarCliqueMapa` (fecha menus; ações de barra/formatação/cores/colapso/split/`abrir-nota`), `tratarSubmitMapa` / `tratarMudancaMapa` / `tratarBuscaMapa`
- **[Linhas 393-454 ~]** `// ⚡ [INÍCIO: MAPA - COLAPSO DAS BARRAS]` -> `setMapaBarrasColapsadas` · `mapaPanelMotion` · `mapaAlternarColapsoBarras` (botão `#mapaColapsoBarras`; espelha o cabeçalho de Notas)
- **[Linhas 460-587 ~]** `// ⚡ [INÍCIO: MAPA - PASTAS (ÁREA RAIZ / WORKSPACES)]` -> `botaoPastas` (namespace `data-pastas-acao`), `montarAreaPastas`, `renderPastas` (cartões com contagem de notas+mapas), `abrirPasta` (define a pasta ativa e entra em Notas), `tratarCliquePastas`
- **[Linhas 588-683 ~]** `// ⚡ [INÍCIO: MAPA - LADO A LADO (SPLIT NOTA + MAPA)]` -> `atualizarBarraAreas` (esconde a barra na tela raiz; "‹ Pastas" + abas + "Abrir mapa"), `aplicarSplit` (classe `app-split`; `abrir-nota` entra em lado a lado), `trocarLadoSplit`, `instalarArrastoSplit` (arrastar a barra superior troca de lado)

## Implementação: Canvas, navegação e histórico
- **[Linhas 374-447 ~]** `// 🔄 [INÍCIO: MAPA - CANVAS/VIEWPORT]` -> `caixaDoCanvas()`, viewport por mapa (persistência com debounce)
- **[Linhas 449-533 ~]** `// 🔄 [INÍCIO: MAPA - NAVEGAÇÃO DO CANVAS]` -> zoom (25%–300%), centralizar, fit, ir para a raiz, minimapa
- **[Linhas 535-741 ~]** `// 🔄 [INÍCIO: MAPA - HISTÓRICO/COMANDOS]` -> `LIMITE_HISTORICO`(100)/`JANELA_COALESCE`(900ms), `instantaneoGrafo` (inclui layout/posicionamento/espaçamento/tema/estilosNivel), `historicoReset`, `registrarHistorico(opcoes)` (coalescência), `aplicarInstantaneo`, `desfazer`/`refazer`, `atualizarBotoesHistorico`, `iniciarEdicaoDepois(idNo)`, `reposicionarAuto`
  - **[Linhas 672-731 ~]** `// 🔄 [INÍCIO: MAPA - LAYOUT AUTOMÁTICO (FASE 8)]` -> `refinarLayoutPorMedicao()` · `reposicionarSuave()`

## Implementação: Comandos de nó, atalhos, estilo, barras e isolamento
- **[Linhas 743-890 ~]** `// 🔄 [INÍCIO: MAPA - COMANDOS DE NÓ]` -> criar filho/irmão/independente, excluir, duplicar, copiar/recortar/colar
  - **[Linhas 745-794 ~]** `// 🔄 [INÍCIO: MAPA - POSICIONAMENTO DO NÓ NOVO]` -> `posicionarNovoNo(grafo,no,idReferencia)` (`garantirNoVisivel`)
- **[Linhas 892-1682 ~]** `// 🔄 [INÍCIO: MAPA - MOVER/RECOLHER/ESTILO DO NÓ]`
  - **[Linhas 1011-1139 ~]** `// 🔄 [INÍCIO: MAPA - CONTEÚDO DO NÓ (FASE 4)]` ... `[FIM ... PARTE 1]` / `[PARTE 2]` -> aplicar conteúdo do painel ao nó
  - **[Linhas 1141-1220 ~]** `// 🔄 [INÍCIO: MAPA - ATALHOS (FASE 10)]` -> `dadosAtalhos`, `mapaAbrirAtalhos`/`mapaFecharAtalhos`, `mapaCapturarAtalho`, `mapaLigarAtalho` (conflito), `mapaRestaurarAtalhosPadrao`
  - **[Linhas 1222-1351 ~]** `// 🔄 [INÍCIO: MAPA - BARRAS/MENU/CORES (FASE 12)]` -> `mapaAbrirMenuNo`/`mapaAbrirMenuCanvas`/`mapaFecharMenus` (fecha também o menu de opções da barra), `ordemBarraAtual`, `mapaMoverBotaoBarra`, `mapaRestaurarBarra`, `mapaAlternarMenuBarra` (fonte/forma/alinhamento em UM botão), **`MENUS_FLUTUANTES`** + **`fecharMenusAbertos()`** + **`fecharMenusFora(evento)`** (clicar FORA fecha qualquer menu — sem `renderArea`)
  - **[Linhas 1353-1439 ~]** `// 🔄 [INÍCIO: MAPA - FORMATAÇÃO RÁPIDA E CORES (FASE 12)]` -> `mapaAlternarEstiloRapido`, `mapaDefinirEstiloRapido`, `mapaPassoEstiloRapido`, `mapaAbrirCor`, `mapaGravarCorRecente`
  - **[Linhas 1441-1529 ~]** `// 🔄 [INÍCIO: MAPA - ESTILO DO NÓ/MAPA (FASE 9)]` -> `mapaSalvarEstiloNo`, `mapaCopiarEstiloNo`, `mapaAplicarEstiloCopiadoNo`, `mapaRestaurarEstiloNo`, `mapaDefinirTema`, `mapaDefinirEstiloNivel`, `mapaLimparEstiloNivel`
  - **[Linhas 1531-1594 ~]** `// 🔄 [INÍCIO: MAPA - HIERARQUIA/LAYOUT (FASE 5)]` -> `mapaDefinirLayout` (F8: pede confirmação se manual), `mapaConfirmarLayout`, `mapaDefinirEspacamento`
  - **[Linhas 1596-1669 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÕES LIVRES (FASE 6)]` -> criar/remover conexões manuais + `mapaCommitarTituloNo` (F11: coalescência de digitação)
- **[Linhas 1971-2315 ~]** `// 🔄 [INÍCIO: MAPA - ÁREA/ISOLAMENTO]` -> `diagnosticoModulosMapa()`/`mostrarFalhaMapa()` (BLINDAGEM), `montarAreaMapa()` (montagem lazy em `try/catch`, ouvintes ligados UMA vez via `mapaAreaOuvintesLigados`, só marca `mapaAreaMontada` após sucesso), `aplicarArea`, listener único de teclado + `contextmenu` (F12) + **listener de `click` em captura (`fecharMenusFora`)** + `Esc` fecha menus, `installMapaMental` (estado `mapaMenuBarra` + exports `mapaAlternarMenuBarra`/`fecharMenusFora`), isolamento do motor de notas

# Nome do Arquivo: mapa/mapa-cores.js
**Propósito:** Paleta de cores do mapa (F12) — MESMO padrão de lógica/visual dos botões de cor/destaque de Notas (`setupNotesColors`): grade 8x10 (80 cores), cores personalizadas (recentes máx. 12 + "+" + conta-gotas), reset, "Aplicar", popover preso ao `visualViewport`, `Esc`/clique fora e foco preso.
- **[Linhas 1-203 ~]** `// 🔄 [INÍCIO: MAPA - PALETA DE CORES (FASE 12)]` -> `GRADE` (80 cores), `LIMITE_RECENTES`, `abrir(botao, propriedade, contexto)` (toggle por propriedade), `montarExtras`, `posicionar`, `fechar` · `global.MapaMentalCores`

---

# Nome do Arquivo: tests/run-all.cjs
**Propósito:** Runner sequencial da suíte. Executa cada `tests/*.cjs`, grava `docs/relatorio-testes.json` + `docs/RELATORIO-TESTES.md` e aceita `--filter=`, `--baseline`, `--retry=`, `--dir=`, `--prefixo=`, `--timeout=`. Testes inaplicáveis ficam em `NAO_APLICAVEIS` (viram `n/a`, nunca "sucesso silencioso").
- **[Linhas 1-30 ~]** `/**` + `Uso:` -> cabeçalho/doc de uso e `NAO_APLICAVEIS`
- **[Linhas 40-70 ~]** `(sem comentário de ancoragem)` -> `executar(arquivo, argumentos)` (spawn + timeout + captura de motivo)
- **[Linhas 90-171 ~]** `(sem comentário de ancoragem)` -> laço de execução, resumo PASSou/FALHOU/N-A/flaky e escrita dos relatórios

# Nome do Arquivo: tests/helpers/parity.cjs
**Propósito:** Bootstrap compartilhado da **paridade visual** (`montar`, `estilos`, `SELETORES`, `NOTA_EXEMPLO`): monta a mesma nota no PWA e no original.
- **[Linhas 1-139 ~]** `(sem comentário de ancoragem)` -> `module.exports = { montar, estilos, SELETORES, NOTA_EXEMPLO }`

## Implementação: Notas — modelo e documentos grandes
- **[Arquivo inteiro ~]** `/* Portado automaticamente de ... por tools/portar-testes.cjs.` -> `tests/notes_document_model.cjs` (`NotesDocument` no `vm`, sem navegador)
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_document_migration.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_large_document.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_million.cjs` (~1M de caracteres)
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_million_extras.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_performance.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_import_spacing.cjs`

## Implementação: Notas — hierarquia, checklist e Enter
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_cascade_defaults.cjs`
- **[Arquivo inteiro ~]** `/* Enter em lista com check + numerada: a quebra mantém a continuidade` -> `tests/notes_checklist_enter.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_checklist_numbers.cjs` · `notes_checklist_order.cjs` (pilha de concluídos)
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_indent_child.cjs` · `notes_enter_child.cjs`
- **[Arquivo inteiro ~]** `/* Indentação do bloco de notas:` -> `tests/notes_indent_levels.cjs` (teto de 4 níveis)
- **[Arquivo inteiro ~]** `/* Enter que "nao pega": quando o cursor fica FORA de uma linha` -> `tests/notes_enter_robust.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_last_line_enter.cjs`
- **[Arquivo inteiro ~]** `/* Título recolhido + cursor no fim + Enter` -> `tests/notes_collapsed_heading.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_collapse_motion.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_completion_spacing.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_navigation_completion.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_parent_undo.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_renumber_structure.cjs`
- **[Arquivo inteiro ~]** `/* "Apagar todo o conteúdo" (Ctrl+A + Delete)` -> `tests/notes_clear_all.cjs`

---

## Implementação: Notas — formatação, cores, mídia e tabelas
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_markdown.cjs`
- **[Arquivo inteiro ~]** `/* Sublinhado (revisão do bloco de notas): comando novo, atalho Ctrl+U e botão` -> `tests/notes_underline.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_colors_persistence.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_tone_picker.cjs` · `notes_tone_picker_mobile.cjs` (seletor de tonalidade)
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_cut_background.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_outline_code.cjs` (títulos + bloco de código)
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_paste_blocks.cjs` · `notes_paste_selection.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_extras.cjs` (divisor/link/inserir/modelos)
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_table_math.cjs` (motor de fórmulas, node-only)
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_table_media.cjs` · `notes_table_tools.cjs` (barra de tabela)
- **[Arquivo inteiro ~]** `(portado)` -> `tests/notes_regression_audit.cjs`
- **[Arquivo inteiro ~]** `(portado)` -> `tests/test_notes_editor_ui.cjs`
- **[Arquivo inteiro ~]** `(portado — `n/a` no PWA: exigiria telas do dashboard de foco)` -> `tests/notes_requested_fixes.cjs`

## Implementação: Múltiplas notas e nota grande
- **[Arquivo inteiro ~]** `/* Múltiplas notas locais (botão "+"), chips de nota e migração da nota única.` -> `tests/multi_notas.cjs`
- **[Arquivo inteiro ~]** `/* Muitas notas (100): a área dos chips precisa rolar na vertical` -> `tests/multi_notas_100.cjs`
- **[Arquivo inteiro ~]** `/* Nota gigante na PWA: uma nota com ~1 milhão de caracteres deve ABRIR` -> `tests/nota_grande_pwa.cjs`

## Implementação: Mapa Mental (por fase)
- **[Arquivo inteiro ~]** `/* FASE 0 - Fundação e isolamento da área "Mapa Mental".` -> `tests/mapa_area.cjs`
- **[Arquivo inteiro ~]** `/* FASE 1 - Gestão de mapas.` -> `tests/mapa_gestao.cjs` (criar/renomear/duplicar/excluir/pastas/raiz/templates)
- **[Arquivo inteiro ~]** `/* FASE 2 - Canvas infinito.` -> `tests/mapa_canvas.cjs` (pan/zoom limites/viewport por mapa)
- **[Arquivo inteiro ~]** `/* FASE 3 - Nós / tópicos.` -> `tests/mapa_nos.cjs` (criar/editar/excluir/copiar/colar/mover)
- **[Arquivo inteiro ~]** `/* FASE 4 - Conteúdo dentro dos nós.` -> `tests/mapa_conteudo.cjs` (painel/anexos/links/tags)
- **[Arquivo inteiro ~]** `/* FASE 5 - Hierarquia e layout em árvore + FASE 8 - Layout automático (sem sobreposição, espaçamento).` -> `tests/mapa_layout.cjs`
- **[Arquivo inteiro ~]** `/* FASE 9 - Editor visual (cores/forma/fonte, precedência nó>nível>tema, tema, ramo, pincel, claro/escuro).` -> `tests/mapa_estilo.cjs`
- **[Arquivo inteiro ~]** `/* FASE 10 - Atalhos de teclado (setas pai/filho/irmão, Ctrl+A/D/Y, Backspace, keymap configurável).` -> `tests/mapa_atalhos.cjs`
- **[Arquivo inteiro ~]** `/* FASE 11 - Undo/Redo (comandos, coalescência, cap 100, botões, autosave).` -> `tests/mapa_undo.cjs`
- **[Arquivo inteiro ~]** `/* FASE 12 - Barras padronizadas, menu contextual do card, paleta de cores e ordem da barra.` -> `tests/mapa_toolbar.cjs`
- **[Arquivo inteiro ~]** `/* FASE 6 - Conexões livres.` -> `tests/mapa_conexoes.cjs`
- **[Arquivo inteiro ~]** `/* FASE 7 - Drag & Drop inteligente.` -> `tests/mapa_dragdrop.cjs`
- **[Arquivo inteiro ~]** `/* Mapa vazio -> primeiro tópico.` -> `tests/mapa_vazio.cjs`

## Implementação: UI, tema, PWA e paridade
- **[Arquivo inteiro ~]** `/* Cobre as LACUNAS de atalho apontadas por docs/RASTREABILIDADE.md:` -> `tests/shortcuts.cjs`
- **[Arquivo inteiro ~]** `/* Barra de ferramentas do PWA: uma linha com rolagem horizontal` -> `tests/toolbar_pwa.cjs` (ordem persistida + dock no teclado)
- **[Arquivo inteiro ~]** `/* Seletor sutil de tema (claro/escuro) no header do PWA:` -> `tests/tema_switch.cjs`
- **[Arquivo inteiro ~]** `/* Modo claro com efeitos de vidro (réplica do compilado do original).` -> `tests/tema_vidro.cjs`
- **[Arquivo inteiro ~]** `/* Deploy/PWA: o Service Worker precisa ser servido como JavaScript NA RAIZ` -> `tests/pwa_service_worker.cjs` (servidor real com fallback de SPA)
- **[Arquivo inteiro ~]** `/* Paridade ESTRUTURAL: compara o bloco do modal de notas do PWA com o do` -> `tests/parity_structure.cjs` (ids/aria/comandos/cores/roles; sem navegador)
- **[Arquivo inteiro ~]** `/* Paridade visual: carrega a MESMA nota no PWA e no projeto original e compara` -> `tests/parity_visual.cjs` (gera `docs/parity-visual.json`)

---

# Nome do Arquivo: tools/*.cjs
**Propósito:** Scripts de apoio (Node, sem dependências além do `playwright` de teste). Não entram no app.

- **[Arquivo inteiro ~]** `/* Porta a suíte de testes do projeto original (produtividade-ferrramenta/tests)` -> `tools/portar-testes.cjs` (gera os `notes_*.cjs` com o cabeçalho `(portado)`)
- **[Arquivo inteiro ~]** `/* Gera docs/INVENTARIO-REGRAS.md (unidades de comportamento do motor) e` -> `tools/gerar-rastreabilidade.cjs` (matriz de rastreabilidade)
- **[Arquivo inteiro ~]** `/* Inventario de regras do motor de notas + matriz de rastreabilidade.` -> `tools/inventario-regras.cjs`
- **[Arquivo inteiro ~]** `/* Extrai do CSS COMPILADO do projeto original (frontend/styles.css) tudo o que` -> `tools/extrair-tema.cjs` (origem de `theme-origem.css`)
- **[Arquivo inteiro ~]** `/* Compara o resultado da suite rodada no PWA com o resultado da MESMA suite` -> `tools/comparar-suites.cjs` (`docs/comparativo.json` + `RELATORIO-COMPARATIVO.md`)
- **[Arquivo inteiro ~]** `/* Gera os icones PNG do PWA (com dependencias zero, usando apenas o zlib do Node).` -> `tools/gerar-icones.cjs` (`icon-192.png` / `icon-512.png`)

---

Antes de começar qualquer ação me faça perguntas para se sertificar de que de fato entendeu, uma de cada vez e com 3 opções de escolha. Depois que estivermos alinhado me peça para mudo o modo para Act. 

