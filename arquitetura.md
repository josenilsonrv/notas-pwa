# Bússola de Arquitetura — notas-pwa

> **Como ler:** cada seção `# Nome do Arquivo` lista os blocos por **fluxo lógico** (não pela ordem física). Use `[Linhas XX-YY ~]` para localizar, a **âncora** (1º comentário real) para confirmar e a **assinatura** para pedir o trecho exato.
> **Manutenção:** ao alterar código, atualize as linhas `~` e as assinaturas afetadas.

**Partes:** `1) Boot/Shell` ✅ · `2) Motor Notas` ✅ · `3) Tabelas` ✅ · `4) Mapa Mental` ✅ · `5) Testes/Ferramentas` ✅
**Ordem de carga (`index.html`):** `notes/editor.js` → `notes/table-math.js` → `notes/extras.js` → `notes/tables.js` → `app.js` → `mapa/*.js`.
**Marcadores de código:** todo `.js` de app tem `// 🔄 [INÍCIO: PREFIXO - NOME]` … `// 🔄 [FIM: ...]`; blocos grandes usam `- PARTE 1` / `- PARTE 2` no `FIM`.

---

# Nome do Arquivo: index.html
**Propósito:** Casca do PWA. Define o tema antes do 1º paint, os contêineres das duas áreas (Notas | Mapa Mental), a toolbar/modal de notas, e carrega todos os módulos JS + registra o Service Worker.

## Implementação: Boot sem flash e auto-recuperação (watchdog)
- **[Linhas 22-34 ~]** `// Resolve o tema antes do CSS carregar para evitar flash visual no primeiro paint.` -> `(() => { ... document.documentElement.dataset.theme = ... })();`
- **[Linhas 37-44 ~]** `<!-- Auto-recuperação: aparece só se o app não iniciar (cache/Service Worker antigo).` -> `<div id="bootGuard" class="app-boot-guard" hidden role="alert">`
- **[Linhas 45-82 ~]** `/* Watchdog de inicialização: se o app não ficar pronto em 6 s (ou der erro),` -> `(function () { var guard = ...; window.setTimeout(mostrar, 6000); ... })();`

## Implementação: Estrutura das áreas (Notas | Mapa Mental)
- **[Linhas 83-91 ~]** `<!-- Header Mobile -->` -> `<header class="app-header border-b border-border pt-4 pb-4 px-4">`
- **[Linhas 93-102 ~]** `<!-- Main Editor Container -->` -> `<main>` + `<nav id="appAreas" role="tablist">` + `<section id="mapaArea" hidden>`

## Implementação: Modal de Notas (cabeçalho → chips → toolbar → editor)
- **[Linhas 103-194 ~]** `<!-- Notes Modal (Always visible in this PWA) -->` -> `<div class="notes-drawer active" id="notesModalBackdrop">`
  - **[Linhas 106-131 ~]** (cabeçalho) -> `<div class="notes-modal-header">` · `#themeToggle`, `#notesHeaderCollapseBtn`, `#notesFullscreenBtn`, `#notesModalClose`
  - **[Linhas 133 ~]** (sem comentário) -> `<nav class="notes-context-nav" id="notesContextNav">`
  - **[Linhas 135-183 ~]** (toolbar) -> `<div class="notes-toolbar" id="notesToolbar">` (botões `data-command`, `data-notes-color`)
  - **[Linhas 185-187 ~]** (editor) -> `<div class="notes-editor" id="notesEditor" contenteditable="true">`
  - **[Linhas 189-191 ~]** (rodapé/status) -> `<button id="notesSaveStatus" role="status">`
- **[Linhas 196 ~]** `(sem comentário de ancoragem)` -> `<div id="appToastRegion" class="app-toast-region">`

## Implementação: Carga de módulos e registro do Service Worker
- **[Linhas 198-202 ~]** `(sem comentário de ancoragem)` -> `<script src="./notes/editor.js"> … <script src="./app.js">`
- **[Linhas 203-209 ~]** `(sem comentário de ancoragem)` -> `<script src="./mapa/mapa-modelo.js"> … <script src="./mapa/mapa.js">`
- **[Linhas 210-265 ~]** `/* Service Worker.` -> `(function () { var SW_URL = new URL('sw.js', ...); … })();`

---

# Nome do Arquivo: app.js
**Propósito:** Aplicação principal (`NotesPWA` + `ThemeManager`). Instala o motor de notas no protótipo, faz a persistência local (LocalStorage), a UI de múltiplas notas (chips), a toolbar PWA (ordem + teclado) e os ajustes para notas grandes.

## Implementação: Boot, tema e limites de nota grande
- **[Linhas 1-5 ~]** `// NOTAS PWA - Aplicação Principal (100% no dispositivo)` -> cabeçalho do módulo
- **[Linhas 12-17 ~]** `// 🔄 [INÍCIO: PWA - CONSTANTES DE NOTA GRANDE]` -> `const LIMITE_NOTA_GRANDE = 120000;` · `const LIMITE_RASCUNHO = 800000;`
- **[Linhas 19-83 ~]** `// 🔄 [INÍCIO: PWA - TEMA (ThemeManager)]` -> `class ThemeManager` (`getStoredTheme` / `getSystemTheme` / `bindEvents` / `applyTheme(theme, animate = true)`)
- **[Linhas 85-91 ~]** `// 🔄 [INÍCIO: PWA - APLICAÇÃO (NotesPWA boot/instalação)]` -> `class NotesPWA {`
- **[Linhas 92-129 ~]** `(constructor)` -> `constructor()` (estado do editor, histórico, toolbar; `this.themeManager = new ThemeManager()` → `this.init()`)
- **[Linhas 130-157 ~]** `// 🔄 [INÍCIO: ESTADO - MIGRAÇÃO/ABERTURA DA ÚLTIMA NOTA]` -> `init()` (migra nota única → lista; aplica área salva; `window.__notasPronto`)
- **[Linhas 158-170 ~]** `/** Instala o mesmo motor de notas do sistema sobre este protótipo. */` -> `installNotesFeatures()`
- **[Linhas 1423-1428 ~]** `// 🔄 [INÍCIO: PWA - BOOT (DOMContentLoaded)]` -> `document.addEventListener('DOMContentLoaded', () => { window.notesApp = new NotesPWA(); });`

## Implementação: Persistência local (sem backend)
- **[Linhas 173-198 ~]** `// 🔄 [INÍCIO: ESTADO - PERSISTÊNCIA LOCAL (SEM BACKEND)]` -> `loadContentFromStorage()` · `saveContentToStorage(html)`
- **[Linhas 199-227 ~]** `// 🔄 [INÍCIO: ESTADO - MÚLTIPLAS NOTAS LOCAIS]` -> `lerNotasLocais()`
- **[Linhas 228-236 ~]** `/** Seam de persistência das notas.` -> `notasBackend()` (`listar` / `obter` / `salvar`)
- **[Linhas 237-260 ~]** `/** Grava a lista de notas e o id da nota ativa no dispositivo. */` -> `gravarNotasLocais(lista)` · `salvarNotasLocais()` · `marcarNotaAtiva(id)` · `lerNotaAtiva()`
- **[Linhas 264-295 ~]** `/** Substitui o cliente HTTP do sistema: qualquer gravação fica no dispositivo. */` -> `async apiCall(endpoint, options = {})` · `persistNow()`

## Implementação: Abrir/editar nota no modal
- **[Linhas 297-339 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - ABRIR NOTAS]` -> `openNotesModal(id)`
- **[Linhas 340-343 ~]** `(sem comentário de ancoragem)` -> `openStageNotesModal(stageId)`
- **[Linhas 525-539 ~]** `// Placeholders chamados pelo motor antes de serem substituídos pelo install.` -> `closeNotesModal()` · `setupModalListeners()` · `toggleNotesFullscreen()` · `toggleNotesHeaderCollapse()`
- **[Linhas 541-563 ~]** `/**` (doc de `placeNotesCursorAtEnd`) -> `placeNotesCursorAtEnd(editor)`
- **[Linhas 564-592 ~]** `/**` (doc de `focusNotesEditorFromEmptyArea`) -> `focusNotesEditorFromEmptyArea(event)`
- **[Linhas 593-619 ~]** `/**` (doc de `rolarCaretParaAcima`) -> `rolarCaretParaAcima()`
- **[Linhas 620-643 ~]** `/**` (doc de `quebrarLinhaDeEmergencia`) -> `quebrarLinhaDeEmergencia()`
## Implementação: Múltiplas notas (chips + botão "+")
- **[Linhas 344-393 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - MÚLTIPLAS NOTAS (CHIPS + BOTÃO "+")]` -> `renderNotesNav()`
- **[Linhas 394-413 ~]** `/**` (doc de `accentDaNota`) -> `accentDaNota(nota)` · `invalidarAccentDaNota(id)`
- **[Linhas 414-447 ~]** `/** Cria uma nota nova em branco e abre em seguida (o motor salva a anterior). */` -> `criarNota()` · `criarNotaLocal(nome = 'Nova nota')` · `renomearNota(id)`
- **[Linhas 448-474 ~]** `/** Exclui a nota, sempre com confirmação; se for a última, cria uma vazia. */` -> `async excluirNota(id)`
- **[Linhas 475-524 ~]** `/** Pequeno menu de ações da nota (renomear/excluir), aberto pelo chip. */` -> `abrirMenuNota(nota, chip)` · `fecharMenuNota()` · `setupChipLongPress(chip, nota)`

## Implementação: Seleção, avisos e listeners gerais
- **[Linhas 644-664 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - SELEÇÃO DE NOTAS]` -> `rememberNotesSelection()`
- **[Linhas 658-665 ~]** `(sem comentário de ancoragem)` -> `updateNotesHistoryButtons()`
- **[Linhas 666-685 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - AVISOS]` -> `showToast(message, type = 'success')` · `updateSaveStatus(text, isError = false)`
- **[Linhas 687-740 ~]** `// Comandos da toolbar (undo/redo, headings, listas, cores, etc.)` -> `setupEventListeners()` (keydown/atalhos + blindagem do Enter)
- **[Linhas 741-747 ~]** `(sem comentário de ancoragem)` -> `setupResize()`

## Implementação: Toolbar PWA (ordem persistida + edição por arraste)
- **[Linhas 748-764 ~]** `// ⚡ [INÍCIO: PWA - BARRA DE FERRAMENTAS INLINE, ORDEM E TECLADO]` -> `filhosToolbar()` · `chavesToolbar()`
- **[Linhas 774-789 ~]** `(sem comentário de ancoragem)` -> `lerOrdemToolbar()` · `salvarOrdemToolbar(ordem)`
- **[Linhas 790-849 ~]** `/**` (doc de `aplicarOrdemToolbar`) -> `aplicarOrdemToolbar(ordem = null, opcoes = {})` (trava de reentrância)
- **[Linhas 850-864 ~]** `/** (Re)liga o observer da barra (ele fica desligado enquanto aplicamos a ordem). */` -> `agendarOrdemToolbar()`
- **[Linhas 865-901 ~]** `/** Ativa a barra em uma linha com rolagem + botão de edição + ordem salva. */` -> `configurarToolbarPWA()` · `criarBotaoEditarToolbar(toolbar)` · `rotuloBotaoToolbar(el)`
- **[Linhas 902-917 ~]** `/** Move um botão uma posição e persiste a nova ordem. */` -> `moverBotaoToolbar(el, delta)`
- **[Linhas 918-1067 ~]** `/** Diálogo "Editar barra de ferramentas": reordena arrastando (ou pelo teclado) e persiste. */` -> `abrirEditorToolbar()`
- **[Linhas 1068-1074 ~]** `(sem comentário de ancoragem)` -> `restaurarOrdemToolbar()`

## Implementação: Toolbar acoplada ao teclado virtual
- **[Linhas 1075-1142 ~]** `/** Mantém a barra logo acima do teclado virtual (visualViewport). */` -> `ativarToolbarTeclado()`
- **[Linhas 1143-1194 ~]** `/**` (doc de `aplicarToolbarTeclado`) -> `aplicarToolbarTeclado(insetForcado)`

## Implementação: Modo mobile e módulos instaladores
- **[Linhas 1203-1252 ~]** `// 🔄 [INÍCIO: PWA - MODO MOBILE (installModoMobileNotas)]` -> `function installModoMobileNotas(App)`
- **[Linhas 1258-1370 ~]** `// 🔄 [INÍCIO: PWA - CAMADA LOCAL DE EXTRAS/TABELAS (installLocalNotesStorage)]` -> `function installLocalNotesStorage(App)`
- **[Linhas 1380-1421 ~]** `// 🔄 [INÍCIO: PWA - AJUSTES DE NOTA GRANDE (installAjustesNotaGrande)]` -> `function installAjustesNotaGrande(App)`

---

# Nome do Arquivo: sw.js
**Propósito:** Service Worker offline-first. Serve o cache na hora e revalida na rede com timeout, garantindo que o app nunca fique preso carregando.

## Implementação: Constantes e fallback offline
- **[Linhas 1-12 ~]** `/** * Service Worker PWA - Cache e Offline` -> cabeçalho (estratégia offline-first)
- **[Linhas 14-19 ~]** `// SERVICE WORKER PARA PWA` -> `const CACHE_NAME = 'notas-pwa-v36';` · `const TIMEOUT_MS = 3000;`
- **[Linhas 21-25 ~]** `(sem comentário de ancoragem)` -> `const OFFLINE_HTML = '<!DOCTYPE html>...'`
- **[Linhas 27-55 ~]** `/** * Assets ESSENCIAIS: sem eles o app não funciona ...` -> `const ESSENCIAIS = [ './', './index.html', ..., './icon.svg' ]`

## Implementação: Instalação e ativação (cache completo ou falha)
- **[Linhas 57-74 ~]** `/** fetch + timeout + cache.put (evita travar a instalação com rede lenta/instável). */` -> `const adicionarComRetry = async (cache, asset, tentativas = 3) => {...}`
- **[Linhas 104-122 ~]** `// INSTALLATION` -> `self.addEventListener('install', (event) => {...})` (aborta se algum essencial faltar)
- **[Linhas 124-136 ~]** `// ACTIVATION` -> `self.addEventListener('activate', (event) => {...})` (limpa caches antigos + `clients.claim()`)

## Implementação: Estratégia de rede/cache em runtime
- **[Linhas 76-86 ~]** `/** Busca na rede com limite de tempo (nunca deixa o carregamento pendurado). */` -> `const buscarComTimeout = (request, ms) => new Promise(...)`
- **[Linhas 88-95 ~]** `/** Guarda a resposta no cache sem bloquear quem está esperando. */` -> `const guardarNoCache = (request, response) => {...}`
- **[Linhas 97-102 ~]** `/** Revalida em segundo plano (stale-while-revalidate) sem bloquear a resposta. */` -> `const revalidar = (request) => {...}`
- **[Linhas 138-173 ~]** `// FETCH STRATEGY` -> `self.addEventListener('fetch', (event) => {...})` (cache → rede com timeout → fallback `index.html`/`OFFLINE_HTML`)

## Implementação: Mensagens do cliente
- **[Linhas 175-190 ~]** `// MESSAGE HANDLING` -> `self.addEventListener('message', (event) => {...})` (`SKIP_WAITING`, `CACHE_UPDATED`)

---

# Nome do Arquivo: manifest.json
**Propósito:** Manifesto do PWA (nome, ícones, display standalone, atalhos).
- **[Linhas 1-47 ~]** `(JSON — sem comentários de ancoragem)` -> `{ "name": "Notas PWA - Editor de Notas", "display": "standalone", "icons": [...], "shortcuts": [...] }`

---

# Nome do Arquivo: _redirects / _headers
**Propósito:** Regras de deploy (Cloudflare Pages/Netlify) — impedem que `/sw.js` e `/manifest.json` caiam no fallback de SPA (SW servido como HTML é rejeitado em silêncio) e definem os cabeçalhos de cache/content-type.
- **[Linhas 1-8 ~]** `# Cloudflare Pages / Netlify: regras avaliadas de cima para baixo.` -> `_redirects`: `/sw.js → /sw.js 200` · `/manifest.json → /manifest.json 200`
- **[Linhas 1-21 ~]** `# Cloudflare Pages - regras de resposta HTTP` -> `_headers`: `Cache-Control: must-revalidate` + `Content-Type: application/javascript` e `Service-Worker-Allowed: /` para `/sw.js`

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
**Propósito:** Modelo do grafo mental (domínio puro, sem DOM): nós, hierarquia, conteúdo/sanitização, templates/interligação, comandos de nó e de conteúdo, conexões livres.

## Implementação: Modelo/grafo e conteúdo/sanitização
- **[Linhas 12-329 ~]** `// 🔄 [INÍCIO: MAPA - MODELO/GRAFO]` -> `global.MapaMentalModelo` (`LARGURA_NO`, `obterNo`/`listarFilhos`/`criarFilhoDe`/`criarIrmaoDe`/`criarNoIndependente`, `excluirSubarvore`/`duplicarSubarvore`/`copiarSubarvore`/`colarSubarvore`)
  - **[Linhas 15-78 ~]** `// 🔄 [INÍCIO: MAPA - CONTEÚDO/SANITIZAÇÃO]` ... `// 🔄 [FIM: ... - PARTE 1]` -> sanitização do HTML do nó
  - **[Linhas 79-141 ~]** (continuação) -> `// 🔄 [FIM: MAPA - CONTEÚDO/SANITIZAÇÃO - PARTE 2]` (`extrairLinks`, normalização de campos)
- **[Linhas 331-372 ~]** `// 🔄 [INÍCIO: MAPA - TEMPLATES/INTERLIGAÇÃO]` -> `TEMPLATES_PRONTOS`, criação a partir de template, nó-ponte/backlinks
- **[Linhas 374-594 ~]** `// 🔄 [INÍCIO: MAPA - COMANDOS DE NÓ]` -> criar/editar/excluir/mover/recolher/estilo do nó
- **[Linhas 596-672 ~]** `// 🔄 [INÍCIO: MAPA - COMANDOS DE CONTEÚDO]` -> anexos, tags, links, refs, emoji/ícone, tarefa
- **[Linhas 674-760 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÕES LIVRES (FASE 6)]` -> conexões manuais entre nós

---

# Nome do Arquivo: mapa/mapa-store.js
**Propósito:** Persistência local (LocalStorage) do índice de mapas, pastas, recentes, templates, mapa ativo e área ativa. Chaves com prefixo `notas-pwa-`.

## Implementação: Chaves e área ativa (Notas | Mapa)
- **[Linhas 9-20 ~]** `(sem marcador de ancoragem)` -> `CHAVES{}`, `TETO_RECENTES`, `chaveGrafo(id)`, `chaveHistorico(id)`, `novoId(prefixo)`
- **[Linhas 35-38 ~]** `// 🔄 [INÍCIO: MAPA - ÁREA ATIVA]` -> `lerAreaAtiva()` · `salvarAreaAtiva(area)` (`notas-pwa-area-ativa`)

## Implementação: Índice / CRUD de mapas
- **[Linhas 40-191 ~]** `// 🔄 [INÍCIO: MAPA - ÍNDICE/CRUD]` -> `listarMapas` / `salvarListaMapas` / `obterResumo` / `obterGrafo` / `criarMapa` / renomear / duplicar / excluir / arquivar

## Implementação: Pastas, recentes, templates e ativo
- **[Linhas 193-261 ~]** `// 🔄 [INÍCIO: MAPA - PASTAS/RECENTES/TEMPLATES/ATIVO]` -> pastas (CRUD), `listarRecentes`, `salvarTemplate`, `obterMapaRaiz`, histórico do grafo

---

# Nome do Arquivo: mapa/mapa-layout.js
**Propósito:** Layout e medição do canvas (fase 2/5): posições em árvore por raiz, limites do mundo, geometria do minimapa e medição de nó.

## Implementação: Constantes/dimensões, layout e API
- **[Linhas 9-20 ~]** `// 🔄 [INÍCIO: MAPA - CONSTANTES/DIMENSÕES]` -> `LARGURA_PADRAO`/`ALTURA_PADRAO`/`FOLGA`/`LAYOUTS[]`/`dimensoesNo(no)`
- **[Linhas 31-115 ~]** `// 🔄 [INÍCIO: MAPA - LAYOUT EM ÁRVORE (calcularPosicoes)]` -> `function calcularPosicoes(grafo, opcoes)` (bilateral/tradicional/esquerda-direita/arvore-vertical/organograma/livre; travessia iterativa)
- **[Linhas 117-135 ~]** `// 🔄 [INÍCIO: MAPA - POSIÇÕES GARANTIDAS (garantirPosicoes)]` -> `function garantirPosicoes(grafo)`
- **[Linhas 137-163 ~]** `// 🔄 [INÍCIO: MAPA - LIMITES/FIT (limites)]` -> `function limites(grafo, lista)`
- **[Linhas 165-202 ~]** `// 🔄 [INÍCIO: MAPA - MINIMAPA (minimapa/pontoDoMinimapa/medirNo)]` -> `minimapa(estado)` · `pontoDoMinimapa(estado,mx,my)` · `medirNo(elemento)`
- **[Linhas 204-209 ~]** `// 🔄 [INÍCIO: MAPA - API PÚBLICA]` -> `global.MapaMentalLayout = {...}`

---

# Nome do Arquivo: mapa/mapa-painel.js
**Propósito:** Painel de propriedades do nó (fase 4). Monta o formulário de conteúdo (título/descrição/notas/links/tags/emoji/ícone/tarefa/prioridade/status/datas/anexos/ponte). Só monta quando aberto.

## Implementação: Helpers de DOM/rótulos, blocos, meta e formulário
- **[Linhas 10-43 ~]** `// 🔄 [INÍCIO: MAPA - HELPERS DE DOM / RÓTULOS]` -> `EMOJIS[]` · `criar(...)` · `campo(...)` · `botao(...)` · `ROTULO_PRIORIDADE`/`ROTULO_STATUS`
- **[Linhas 45-102 ~]** `// 🔄 [INÍCIO: MAPA - BLOCOS DE CONTEÚDO (links/anexos/ponte)]` -> `blocoLinksDetectados(no)` · `blocoAnexos(no)` · `blocoPonte(no, contexto)`
- **[Linhas 104-147 ~]** `// 🔄 [INÍCIO: MAPA - LINHAS META (prioridade/status/datas)]` -> `linhaMeta(no)` · `linhaDatas(no)`
- **[Linhas 149-248 ~]** `// 🔄 [INÍCIO: MAPA - FORMULÁRIO DO PAINEL (montarPainel)]` -> `function montarPainel(no, contexto)` (`#mapaPainelForm`, `data-mapa-form="no-conteudo"`)
- **[Linhas 250-255 ~]** `// 🔄 [INÍCIO: MAPA - API PÚBLICA]` -> `global.MapaMentalPainel = {...}`

---

# Nome do Arquivo: mapa/mapa-render.js
**Propósito:** Renderização da área do mapa (HTML puro): shell, topbar/formulários da gestão, mapa aberto (canvas/nós/minimapa), lista de gestão, recentes/templates e conexões.

## Implementação: Shell, topbar e gestão
- **[Linhas 32-91 ~]** `// 🔄 [INÍCIO: MAPA - SHELL DA ÁREA]` -> estrutura base da `#mapaArea`
- **[Linhas 93-229 ~]** `// 🔄 [INÍCIO: MAPA - TOPBAR/FORMULÁRIO]` -> busca/ordenação e formulários inline (`form[data-mapa-form]`)
- **[Linhas 482-522 ~]** `// 🔄 [INÍCIO: MAPA - GESTÃO (LISTA)]` -> lista de mapas (abrir/renomear/duplicar/excluir/estrela/arquivar)
- **[Linhas 524-581 ~]** `// 🔄 [INÍCIO: MAPA - RECENTES/TEMPLATES/LISTA]` -> recentes, templates prontos/salvos, pastas

## Implementação: Mapa aberto e conexões
- **[Linhas 231-480 ~]** `// 🔄 [INÍCIO: MAPA - MAPA ABERTO]` -> `#mapaCanvasWrap`, nós, minimapa, backlinks
- **[Linhas 612-873 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÕES (FASE 6)]` -> camada de conexões livres

---

# Nome do Arquivo: mapa/mapa-interacao.js
**Propósito:** Interação direta no canvas (Pointer Events): seleção, edição inline do nó, arrasto/redimensionar/laço, conexão por arrasto, pan/zoom e atalhos.

## Implementação: Seleção, edição inline, arrasto, conexão e atalhos
- **[Linhas 54-72 ~]** `// 🔄 [INÍCIO: MAPA - SELEÇÃO]` -> `selecionar` / `idPrincipal` / `idsSelecionados`
- **[Linhas 74-130 ~]** `// 🔄 [INÍCIO: MAPA - EDIÇÃO INLINE]` -> editar título no próprio nó (duplo clique/F2/toque longo)
- **[Linhas 132-312 ~]** `// 🔄 [INÍCIO: MAPA - ARRASTO/REDIMENSIONAR/LAÇO]` -> mover nó(s), alça de resize, seleção por laço
- **[Linhas 314-365 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÃO POR ARRASTO (FASE 6)]` -> criar conexão arrastando da porta do nó
- **[Linhas 367-574 ~]** `// 🔄 [INÍCIO: MAPA - PONTEIRO/RODA]` -> pan (arrastar), `Ctrl+scroll`/pinça (zoom), clique no minimapa
- **[Linhas 576-636 ~]** `// 🔄 [INÍCIO: MAPA - ATALHOS]` -> teclado do mapa (Enter/Tab/F2/Delete/setas/etc.)

---

# Nome do Arquivo: mapa/mapa.js
**Propósito:** Orquestrador da área Mapa Mental. Instala `installMapaMental(NotesPWA)`, monta lazy e liga store/render/modelo/layout/interação: gestão de mapas, canvas/viewport, CRUD de nós, hierarquia, conteúdo, conexões e isolamento das áreas.

## Implementação: Estado/helpers e render/controle
- **[Linhas 9-78 ~]** `// 🔄 [INÍCIO: MAPA - ESTADO/HELPERS]` -> `store()`/`modelo()`/`render()`, `dadosGestao()`, `abrirMapa(id)`, `definirRaiz(id)`, `conectarMapa(origemId,destinoId)`, `aplicarTemplatePronto`/`aplicarTemplateSalvo`
- **[Linhas 80-290 ~]** `// 🔄 [INÍCIO: MAPA - RENDER/CONTROLE]` -> `renderArea()`, `tratarCliqueMapa` / `tratarSubmitMapa` / `tratarMudancaMapa` / `tratarBuscaMapa`

## Implementação: Canvas, navegação e histórico
- **[Linhas 292-365 ~]** `// 🔄 [INÍCIO: MAPA - CANVAS/VIEWPORT]` -> `caixaDoCanvas()`, viewport por mapa (persistência com debounce)
- **[Linhas 367-451 ~]** `// 🔄 [INÍCIO: MAPA - NAVEGAÇÃO DO CANVAS]` -> zoom (25%–300%), centralizar, fit, ir para a raiz, minimapa
- **[Linhas 453-537 ~]** `// 🔄 [INÍCIO: MAPA - HISTÓRICO/COMANDOS]` -> undo/redo do grafo, `iniciarEdicaoDepois(idNo)`

## Implementação: Comandos de nó, conteúdo, conexões e isolamento
- **[Linhas 539-686 ~]** `// 🔄 [INÍCIO: MAPA - COMANDOS DE NÓ]` -> criar filho/irmão/independente, excluir, duplicar, copiar/recortar/colar
  - **[Linhas 541-590 ~]** `// 🔄 [INÍCIO: MAPA - POSICIONAMENTO DO NÓ NOVO]` -> `posicionarNovoNo(grafo,no,idReferencia)` (`garantirNoVisivel`)
- **[Linhas 688-1047 ~]** `// 🔄 [INÍCIO: MAPA - MOVER/RECOLHER/ESTILO DO NÓ]`
  - **[Linhas 807-935 ~]** `// 🔄 [INÍCIO: MAPA - CONTEÚDO DO NÓ (FASE 4)]` ... `[FIM ... PARTE 1]` / `[PARTE 2]` -> aplicar conteúdo do painel ao nó
  - **[Linhas 937-962 ~]** `// 🔄 [INÍCIO: MAPA - HIERARQUIA/LAYOUT (FASE 5)]` -> re-layout após mudança de hierarquia
  - **[Linhas 964-1037 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÕES LIVRES (FASE 6)]` -> criar/remover conexões manuais
- **[Linhas 1049-1236 ~]** `// 🔄 [INÍCIO: MAPA - ÁREA/ISOLAMENTO]` -> troca de área (Notas | Mapa), montagem lazy, isolamento do motor de notas

---

# Nome do Arquivo: mapa/mapa.css
**Propósito:** Estilos da área do mapa (shell, topbar, chips de gestão, canvas/nós, conexões, minimapa, painel de propriedades).
- **[Linhas 1-562 ~]** `(CSS — sem marcadores de ancoragem)` -> classes `mapa-*` (`.mapa-area`, `.mapa-canvas`, `.mapa-no`, `.mapa-painel`, `.mapa-chip`, …)

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
- **[Linhas 1-35 ~]** `/* Portado automaticamente de ... por tools/portar-testes.cjs.` -> `tests/notes_document_model.cjs` (`NotesDocument` no `vm`, sem navegador)
- **[Linhas 1-52 ~]** `(portado)` -> `tests/notes_document_migration.cjs`
- **[Linhas 1-42 ~]** `(portado)` -> `tests/notes_large_document.cjs`
- **[Linhas 1-44 ~]** `(portado)` -> `tests/notes_million.cjs` (~1M de caracteres)
- **[Linhas 1-48 ~]** `(portado)` -> `tests/notes_million_extras.cjs`
- **[Linhas 1-42 ~]** `(portado)` -> `tests/notes_performance.cjs`
- **[Linhas 1-41 ~]** `(portado)` -> `tests/notes_import_spacing.cjs`

## Implementação: Notas — hierarquia, checklist e Enter
- **[Linhas 1-49 ~]** `(portado)` -> `tests/notes_cascade_defaults.cjs`
- **[Linhas 1-59 ~]** `/* Enter em lista com check + numerada: a quebra mantém a continuidade` -> `tests/notes_checklist_enter.cjs`
- **[Linhas 1-7 ~]** `(portado)` -> `tests/notes_checklist_numbers.cjs` · `notes_checklist_order.cjs` (pilha de concluídos)
- **[Linhas 1-7 ~]** `(portado)` -> `tests/notes_indent_child.cjs` · `notes_enter_child.cjs`
- **[Linhas 1-59 ~]** `/* Indentação do bloco de notas:` -> `tests/notes_indent_levels.cjs` (teto de 4 níveis)
- **[Linhas 1-73 ~]** `/* Enter que "nao pega": quando o cursor fica FORA de uma linha` -> `tests/notes_enter_robust.cjs`
- **[Linhas 1-44 ~]** `(portado)` -> `tests/notes_last_line_enter.cjs`
- **[Linhas 1-72 ~]** `/* Título recolhido + cursor no fim + Enter` -> `tests/notes_collapsed_heading.cjs`
- **[Linhas 1-39 ~]** `(portado)` -> `tests/notes_collapse_motion.cjs`
- **[Linhas 1-41 ~]** `(portado)` -> `tests/notes_completion_spacing.cjs`
- **[Linhas 1-44 ~]** `(portado)` -> `tests/notes_navigation_completion.cjs`
- **[Linhas 1-46 ~]** `(portado)` -> `tests/notes_parent_undo.cjs`
- **[Linhas 1-39 ~]** `(portado)` -> `tests/notes_renumber_structure.cjs`
- **[Linhas 1-46 ~]** `/* "Apagar todo o conteúdo" (Ctrl+A + Delete)` -> `tests/notes_clear_all.cjs`

---

## Implementação: Notas — formatação, cores, mídia e tabelas
- **[Linhas 1-55 ~]** `(portado)` -> `tests/notes_markdown.cjs`
- **[Linhas 1-50 ~]** `/* Sublinhado (revisão do bloco de notas): comando novo, atalho Ctrl+U e botão` -> `tests/notes_underline.cjs`
- **[Linhas 1-7 ~]** `(portado)` -> `tests/notes_colors_persistence.cjs`
- **[Linhas 1-7 ~]** `(portado)` -> `tests/notes_tone_picker.cjs` · `notes_tone_picker_mobile.cjs` (seletor de tonalidade)
- **[Linhas 1-41 ~]** `(portado)` -> `tests/notes_cut_background.cjs`
- **[Linhas 1-53 ~]** `(portado)` -> `tests/notes_outline_code.cjs` (títulos + bloco de código)
- **[Linhas 1-72 ~]** `(portado)` -> `tests/notes_paste_blocks.cjs` · `notes_paste_selection.cjs`
- **[Linhas 1-59 ~]** `(portado)` -> `tests/notes_extras.cjs` (divisor/link/inserir/modelos)
- **[Linhas 1-17 ~]** `(portado)` -> `tests/notes_table_math.cjs` (motor de fórmulas, node-only)
- **[Linhas 1-47 ~]** `(portado)` -> `tests/notes_table_media.cjs` · `notes_table_tools.cjs` (barra de tabela)
- **[Linhas 1-45 ~]** `(portado)` -> `tests/notes_regression_audit.cjs`
- **[Linhas 1-136 ~]** `(portado)` -> `tests/test_notes_editor_ui.cjs`
- **[Linhas 1-54 ~]** `(portado — `n/a` no PWA: exigiria telas do dashboard de foco)` -> `tests/notes_requested_fixes.cjs`

## Implementação: Múltiplas notas e nota grande
- **[Linhas 1-91 ~]** `/* Múltiplas notas locais (botão "+"), chips de nota e migração da nota única.` -> `tests/multi_notas.cjs`
- **[Linhas 1-66 ~]** `/* Muitas notas (100): a área dos chips precisa rolar na vertical` -> `tests/multi_notas_100.cjs`
- **[Linhas 1-63 ~]** `/* Nota gigante na PWA: uma nota com ~1 milhão de caracteres deve ABRIR` -> `tests/nota_grande_pwa.cjs`

## Implementação: Mapa Mental (por fase)
- **[Linhas 1-116 ~]** `/* FASE 0 - Fundação e isolamento da área "Mapa Mental".` -> `tests/mapa_area.cjs`
- **[Linhas 1-249 ~]** `/* FASE 1 - Gestão de mapas.` -> `tests/mapa_gestao.cjs` (criar/renomear/duplicar/excluir/pastas/raiz/templates)
- **[Linhas 1-240 ~]** `/* FASE 2 - Canvas infinito.` -> `tests/mapa_canvas.cjs` (pan/zoom limites/viewport por mapa)
- **[Linhas 1-304 ~]** `/* FASE 3 - Nós / tópicos.` -> `tests/mapa_nos.cjs` (criar/editar/excluir/copiar/colar/mover)
- **[Linhas 1-225 ~]** `/* FASE 4 - Conteúdo dentro dos nós.` -> `tests/mapa_conteudo.cjs` (painel/anexos/links/tags)
- **[Linhas 1-177 ~]** `/* FASE 5 - Hierarquia e layout em árvore.` -> `tests/mapa_layout.cjs`
- **[Linhas 1-194 ~]** `/* FASE 6 - Conexões livres.` -> `tests/mapa_conexoes.cjs`
- **[Linhas 1-207 ~]** `/* FASE 7 - Drag & Drop inteligente.` -> `tests/mapa_dragdrop.cjs`
- **[Linhas 1-142 ~]** `/* Mapa vazio -> primeiro tópico.` -> `tests/mapa_vazio.cjs`

## Implementação: UI, tema, PWA e paridade
- **[Linhas 1-184 ~]** `/* Cobre as LACUNAS de atalho apontadas por docs/RASTREABILIDADE.md:` -> `tests/shortcuts.cjs`
- **[Linhas 1-229 ~]** `/* Barra de ferramentas do PWA: uma linha com rolagem horizontal` -> `tests/toolbar_pwa.cjs` (ordem persistida + dock no teclado)
- **[Linhas 1-85 ~]** `/* Seletor sutil de tema (claro/escuro) no header do PWA:` -> `tests/tema_switch.cjs`
- **[Linhas 1-72 ~]** `/* Modo claro com efeitos de vidro (réplica do compilado do original).` -> `tests/tema_vidro.cjs`
- **[Linhas 1-70 ~]** `/* Deploy/PWA: o Service Worker precisa ser servido como JavaScript NA RAIZ` -> `tests/pwa_service_worker.cjs` (servidor real com fallback de SPA)
- **[Linhas 1-90 ~]** `/* Paridade ESTRUTURAL: compara o bloco do modal de notas do PWA com o do` -> `tests/parity_structure.cjs` (ids/aria/comandos/cores/roles; sem navegador)
- **[Linhas 1-206 ~]** `/* Paridade visual: carrega a MESMA nota no PWA e no projeto original e compara` -> `tests/parity_visual.cjs` (gera `docs/parity-visual.json`)

---

# Nome do Arquivo: tools/*.cjs
**Propósito:** Scripts de apoio (Node, sem dependências além do `playwright` de teste). Não entram no app.

- **[Linhas 1-80 ~]** `/* Porta a suíte de testes do projeto original (produtividade-ferrramenta/tests)` -> `tools/portar-testes.cjs` (gera os `notes_*.cjs` com o cabeçalho `(portado)`)
- **[Linhas 1-192 ~]** `/* Gera docs/INVENTARIO-REGRAS.md (unidades de comportamento do motor) e` -> `tools/gerar-rastreabilidade.cjs` (matriz de rastreabilidade)
- **[Linhas 1-76 ~]** `/* Inventario de regras do motor de notas + matriz de rastreabilidade.` -> `tools/inventario-regras.cjs`
- **[Linhas 1-121 ~]** `/* Extrai do CSS COMPILADO do projeto original (frontend/styles.css) tudo o que` -> `tools/extrair-tema.cjs` (origem de `theme-origem.css`)
- **[Linhas 1-118 ~]** `/* Compara o resultado da suite rodada no PWA com o resultado da MESMA suite` -> `tools/comparar-suites.cjs` (`docs/comparativo.json` + `RELATORIO-COMPARATIVO.md`)
- **[Linhas 1-137 ~]** `/* Gera os icones PNG do PWA (com dependencias zero, usando apenas o zlib do Node).` -> `tools/gerar-icones.cjs` (`icon-192.png` / `icon-512.png`)

---

Antes de começar qualquer ação me faça perguntas para se sertificar de que de fato entendeu, uma de cada vez e com 3 opções de escolha. Depois que estivermos alinhado me peça para mudo o modo para Act. 

