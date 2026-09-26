# Bússola de Arquitetura — notas-pwa

> **Como ler:** cada seção `# Nome do Arquivo` lista os blocos por **fluxo lógico** (não pela ordem física). Use `[Linhas XX-YY ~]` para localizar, a **âncora** (1º comentário real) para confirmar e a **assinatura** para pedir o trecho exato.
> **Manutenção:** ao alterar código, atualize as linhas `~` e as assinaturas afetadas.
> **⚠️ Regras obrigatórias:** antes de editar, leia **`.clinerules/regras-de-edicao.md`** (padrão de marcação + Regra de Ouro de atualizar esta bússola).

**Partes:** `1) Boot/Shell` ✅ · `2) Motor Notas` ✅ · `3) Tabelas` ✅ · `4) Mapa Mental` ✅ · `5) Testes/Ferramentas` ✅ · `6) Backend Python (login/sync)` ✅ bloco I · `7) Conta do usuário (login opcional)` ✅ bloco II · `8) Sincronização (fila + snapshot/push)` ✅ bloco II · `9) Tempo real (WebSocket)` ✅ bloco III · `10) Anexos + fechamento` ✅ bloco IV
**Ordem de carga (`index.html`):** `notes/editor.js` → `notes/table-math.js` → `notes/extras.js` → `notes/tables.js` → `app.js` → `mapa/*.js`.
**Marcadores de código:** todo `.js` de app tem `// 🔄 [INÍCIO: PREFIXO - NOME]` … `// 🔄 [FIM: ...]`; blocos grandes usam `- PARTE 1` / `- PARTE 2` no `FIM`.
**Mapa do arquivo (obrigatório):** todo arquivo de código começa com `🗺️ COMPONENTE` / `🎯 OBJETIVO` / `🔗 QUEM DEPENDE DELE` (bloco `/** … */` em JS/CSS, docstring `"""…"""` em Python) — ver **`.clinerules/regras-de-edicao.md` §1.1**. O Python do backend usa comentários `#` com o prefixo `BACKEND - ` (ex.: `# 💾 [INÍCIO: BACKEND - REPOSITÓRIO]`).

---

# Nome do Arquivo: index.html
**Propósito:** Casca do PWA. Define o tema antes do 1º paint, os contêineres das duas áreas (Notas | Mapa Mental), a toolbar/modal de notas, e carrega todos os módulos JS + registra o Service Worker.

## Implementação: Boot sem flash e auto-recuperação (watchdog)
- **[Linhas 22-39 ~]** `<!-- 🚀 [INÍCIO: PWA - BOOT SEM FLASH (TEMA ANTES DO CSS E WATCHDOG)] -->` -> `// Resolve o tema antes do CSS carregar para evitar flash visual no primeiro paint.` (script inline)
- **[Linhas 40-47 ~]** `<!-- Auto-recuperação: aparece só se o app não iniciar (cache/Service Worker antigo).` -> `<div id="bootGuard" class="app-boot-guard" hidden role="alert">`
- **[Linhas 48-85 ~]** `/* Watchdog de inicialização: se o app não ficar pronto em 6 s (ou der erro),` -> `(function () { var guard = ...; window.setTimeout(mostrar, 6000); ... })();`

## Implementação: Estrutura das áreas (Notas | Mapa Mental)
- **[Linhas 86-95 ~]** `<!-- 🎨 [INÍCIO: PWA - SHELL (HEADER, ÁREAS E MODAL DE NOTAS)] -->` -> `<header class="app-header border-b border-border pt-4 pb-4 px-4">` (**SÓ o título "Notas"** — o header é **coberto pelas áreas** (`position: fixed; z-index: 900`) e pelo modal (2300), então NÃO recebe controles; o `padding-left: 4.5rem` saiu junto com a seta ‹)
- **[Linhas 96-124 ~]** `<!-- Main Editor Container -->` -> `<main>` + **`<nav id="appAreas" class="app-areas" aria-label="Conta" hidden>` = a MOLDURA FIXA do topo** (`z-index: 2400`, acima das áreas E do modal) que agora carrega o **BOTÃO DE CONTA `#contaBtn`** (bloco `CONTA - BOTÃO DA MOLDURA FIXA`; `data-logado`) — **substituiu a seta ‹**, cuja função ("voltar às Pastas") é exercida pelos botões Fechar de Notas (`#notesModalClose`) e do Mapa (`#mapaFechar`) + `.app-tema-fixo` (`#themeToggle`, canto INFERIOR DIREITO, só na tela de Pastas) + `<section id="pastasArea" hidden>` + `<section id="mapaArea" hidden>`

## Implementação: Modal de Notas (cabeçalho → chips → toolbar → editor)
- **[Linhas 128-231 ~]** `<!-- Notes Modal (Always visible in this PWA) -->` -> `<div class="notes-drawer active" id="notesModalBackdrop">`
  - **[Linhas 131-151 ~]** (cabeçalho) -> `<div class="notes-modal-header">` · `#notesHeaderCollapseBtn`, `#notesFullscreenBtn`, `#notesAbrirMapa` (`data-app-split="1"`, "Ver mapa ao lado"), `#notesModalClose`
  - **[Linhas 153 ~]** (chips) -> `<nav class="notes-context-nav app-rolagem" id="notesContextNav">`
  - **[Linhas 155-203 ~]** (toolbar) -> `<div class="notes-toolbar app-barra app-rolagem" id="notesToolbar">` (botões `data-command`, `data-notes-color`) — inclui **alinhamento por linha** (`alignLeft/alignCenter/alignRight/alignJustify`) e o botão **Fonte** (`#notesFontBtn`, `data-pwa="fonte"`)
  - **[Linhas 222 ~]** (editor) -> `<div class="notes-editor-container focus-shell app-rolagem" id="notesEditorContainer">` · `<div class="notes-editor" id="notesEditor" contenteditable="true">`
  - **[Linhas 226-230 ~]** (rodapé/status) -> `<div class="notes-modal-footer app-rodape">` · `#notesLastEdit` (última edição) | `#notesTopicCount` (tópicos, CENTRO) | `<button id="notesSaveStatus" class="app-rodape-meta">` — MESMAS classes do rodapé do Mapa
- **[Linhas 235 ~]** `(sem comentário de ancoragem)` -> `<div id="appToastRegion" class="app-toast-region">`

## Implementação: Carga de módulos e registro do Service Worker
- **[Linhas 239-250 ~]** `<!-- 🚀 [INÍCIO: PWA - CARGA DE MÓDULOS E SERVICE WORKER] -->` -> `<script src="./notes/editor.js"> … <script src="./fontes.js">` (`NotasFontes`) `… <script src="./app.js">` **+ `<script src="./conta.js">`** (conta) **+ `<script src="./sync/chaves.js">` e `<script src="./sync/sync-cliente.js">`** (sync)
- **[Linhas 239-246 ~]** `(sem comentário de ancoragem)` -> `<script src="./mapa/mapa-modelo.js"> … <script src="./mapa/mapa.js">` (inclui `mapa-cores.js`)
- **[Linhas 247-304 ~]** `/* Service Worker.` -> `(function () { var SW_URL = new URL('sw.js', ...); … })();` (registro com `updateViaCache: 'none'`; `controllerchange` recarrega 1× — plano B do update notification do `app.js`)

---

# Nome do Arquivo: app.js
**Propósito:** Aplicação principal (`NotesPWA` + `ThemeManager`). Instala o motor de notas no protótipo, faz a persistência local (LocalStorage), a UI de múltiplas notas (chips), a toolbar PWA (ordem + teclado), os ajustes para notas grandes e a ATUALIZAÇÃO do app (update notification).

## Implementação: Expandir/contrair (classe ÚNICA das duas áreas)
- **[Linhas 85-224 ~]** `// ⚡ [INÍCIO: PWA - EXPANDIR/CONTRAR (AppExpandir — CLASSE ÚNICA DAS DUAS ÁREAS)]` -> `class AppExpandir` — config por área (`alvo`/`classeArea`/`barras`/`botao`/`rotulos`/`expandido`/`versao`/`ladoALadoAtivo`/`aplicarLadoALado`/`antesDaTroca`/`aoAplicar`/`aoFinalizar`); **`static motion` = animação ÚNICA de painel** (220 ms, respeita `prefers-reduced-motion`); `aplicar` (classe compartilhada `.app-tela-cheia` + classe da área + botão); `aplicarBarras` recolhe/mostra UMA POR VEZ (ordem inversa ao sair) e preserva o que já estava recolhido; `alternar` fecha o lado a lado ao expandir e o REABRE ao contrair. **A MESMA classe serve Notas (`#notesModal`) e Mapa (`.mapa-shell`)**, no espírito das classes compartilhadas de CSS

## Implementação: Boot, tema e limites de nota grande
- **[Linhas 1-5 ~]** `// NOTAS PWA - Aplicação Principal (100% no dispositivo)` -> cabeçalho do módulo
- **[Linhas 12-17 ~]** `// 🔄 [INÍCIO: PWA - CONSTANTES DE NOTA GRANDE]` -> `const LIMITE_NOTA_GRANDE = 120000;` · `const LIMITE_RASCUNHO = 800000;`
- **[Linhas 19-83 ~]** `// 🔄 [INÍCIO: PWA - TEMA (ThemeManager)]` -> `class ThemeManager` (`getStoredTheme` / `getSystemTheme` / `bindEvents` / `applyTheme(theme, animate = true)`)
- **[Linhas 226-325 ~]** `// 🔄 [INÍCIO: PWA - APLICAÇÃO (NotesPWA boot/instalação)]` -> `class NotesPWA {` + constantes `FOLGA_BARRA_TECLADO`/`MARGEM_CURSOR_BARRA`
- **[Linhas 239-278 ~]** `(constructor)` -> `constructor()` (estado do editor, histórico, toolbar; `this.themeManager = new ThemeManager()` → `this.init()`)
- **[Linhas 279-305 ~]** `// 🔄 [INÍCIO: ESTADO - MIGRAÇÃO/ABERTURA DA ÚLTIMA NOTA]` -> `init()` (migra nota única → lista; aplica área salva; `window.__notasPronto`; liga `verificarAtualizacaoSW()`)
- **[Linhas 309-327 ~]** `/** Instala o mesmo motor de notas do sistema sobre este protótipo. */` -> `installNotesFeatures()` (+ `installAtualizacaoPWA` + **`installConta(NotesPWA)`** + **`installSync(NotesPWA)`** — conta e sync entram por instalação no protótipo, sem tocar no motor)
- **[Linhas 1842-1925 ~]** `// 🚀 [INÍCIO: PWA - ATUALIZAÇÃO DO APP (UPDATE NOTIFICATION)]` -> `installAtualizacaoPWA(App)` (`recarregarParaNovaVersao` · `avisarNovaVersao` · `verificarAtualizacaoSW`: `updatefound`/`statechange` + `controllerchange` + mensagem `SW_ATIVADO` + `setInterval` 60 s)
- **[Linhas 1927-1932 ~]** `// 🚀 [INÍCIO: PWA - BOOT (DOMContentLoaded)]` -> `document.addEventListener('DOMContentLoaded', () => { window.notesApp = new NotesPWA(); });`

## Implementação: Persistência local (sem backend)
- **[Linhas 327-453 ~]** `// 🔄 [INÍCIO: ESTADO - PERSISTÊNCIA LOCAL (SEM BACKEND)]` -> `loadContentFromStorage()` · `saveContentToStorage(html)`
- **[Linhas 353-419 ~]** `// 🔄 [INÍCIO: ESTADO - MÚLTIPLAS NOTAS LOCAIS]` -> `lerNotasLocais()` (migra notas antigas com `pastaId: null`)
- **[Linhas 386-394 ~]** `/** Seam de persistência das notas.` -> `notasBackend()` (`listar` / `obter` / `salvar`)
- **[Linhas 395-444 ~]** `/** Grava a lista de notas e o id da nota ativa no dispositivo. */` -> `gravarNotasLocais(lista)` · `salvarNotasLocais()` · `marcarNotaAtiva(id)` · `lerNotaAtiva()`
- **[Linhas 445-452 ~]** `/** Substitui o cliente HTTP do sistema: qualquer gravação fica no dispositivo. */` -> `async apiCall(endpoint, options = {})` · `persistNow()`

## Implementação: Abrir/editar nota no modal
- **[Linhas 455-824 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - ABRIR NOTAS]` -> `openNotesModal(id)` (também preenche o rodapé: `notesUltimaEdicao = atualizadaEm/criadaEm` → `updateNotesLastEdit()`)
- **[Linhas 503-508 ~]** `(sem comentário de ancoragem)` -> `openStageNotesModal(stageId)`
- **[Linhas 810-824 ~]** `// Placeholders chamados pelo motor antes de serem substituídos pelo install.` -> `closeNotesModal()` · `setupModalListeners()` · `toggleNotesFullscreen()` · `toggleNotesHeaderCollapse()` (**os dois últimos são substituídos pelo `install` de `notes/editor.js`**)
- **[Linhas 826-848 ~]** `/**` (doc de `placeNotesCursorAtEnd`) -> `placeNotesCursorAtEnd(editor)`
- **[Linhas 849-881 ~]** `/**` (doc de `focusNotesEditorFromEmptyArea`) -> `focusNotesEditorFromEmptyArea(event)`
- **[Linhas 882-920 ~]** `/**` (doc de `rolarCaretParaAcima`) -> `rolarCaretParaAcima()` (**ADAPTATIVO**: cresce o `padding-bottom` do editor quando falta rolagem — a linha do cursor nunca fica sob a barra)
- **[Linhas 921-944 ~]** `/**` (doc de `quebrarLinhaDeEmergencia`) -> `quebrarLinhaDeEmergencia()`
## Implementação: Múltiplas notas (chips + botão "+")
- **[Linhas 507-807 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - MÚLTIPLAS NOTAS (CHIPS + BOTÃO "+")]` -> `pastaPadraoId` (getter, `[509]`) · `notaPertenceAPasta(nota, pastaId)` · `notasDaPasta(pastaId)` · `contarNotasDaPasta(pastaId)` · `definirPastaAtivaNotas(pastaId)` · `renderNotesNav()` (`[555]` — chips da pasta ativa SÓ no `#notesContextNav`; a área de mapas tem a SUA faixa `#mapaChipsNav`, com os MAPAS, via `renderMapasNav()` em `mapa/mapa.js`) · **`definirPastaAtivaNotas(pastaId)` é o equivalente, nas Notas, de `garantirMapaSelecionado` (mapa/mapa.js)** e é chamada ao ENTRAR na área (por `aplicarArea('notas')`): mantém a nota aberta se ela pertencer à pasta ativa; senão abre a 1ª da pasta (pasta vazia cria "Nova nota")
- **[Linhas 604-623 ~]** `/**` (doc de `accentDaNota`) -> `accentDaNota(nota)` · `invalidarAccentDaNota(id)`
- **[Linhas 624-658 ~]** `/** Cria uma nota nova em branco e abre em seguida (o motor salva a anterior). */` -> `criarNota()` (grava `pastaId` da pasta ativa) · `criarNotaLocal(nome = 'Nova nota')` (`pastaId: null`) · `renomearNota(id)`
- **[Linhas 659-689 ~]** `/** Exclui a nota, sempre com confirmação; se for a última, cria uma vazia. */` -> `async excluirNota(id)`
- **[Linhas 690-807 ~]** `/** Duplica a nota (novo id, mesmo conteúdo/pasta), logo depois do original. */` -> `duplicarNota(id)` · `pastasDeNotas()` · `moverNotaParaPasta(id, pastaId)` · `criarMenuNota(rotulo)` · `mostrarMenuNota(menu, chip)` · `abrirMenuNota(nota, chip)` (Renomear/Duplicar/Mover para pasta/Excluir) · `abrirMenuMoverNota(nota, chip)` · `fecharMenuNota()` · `setupChipLongPress(chip, nota)`

## Implementação: Seleção, avisos e listeners gerais
- **[Linhas 945-965 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - SELEÇÃO DE NOTAS]` -> `rememberNotesSelection()` (`[947]`)
- **[Linhas 959-966 ~]** `(sem comentário de ancoragem)` -> `updateNotesHistoryButtons()`
- **[Linhas 967-1024 ~]** `// ⚡ [INÍCIO: INTERAÇÃO/JS - AVISOS]` -> `showToast(message, type = 'success')` (`[968]`) · `updateSaveStatus(text, isError = false)`
- **[Linhas 1026-1081 ~]** `// Comandos da toolbar (undo/redo, headings, listas, cores, etc.)` -> `setupEventListeners()` (keydown/atalhos + blindagem do Enter)
- **[Linhas 1082-1088 ~]** `(sem comentário de ancoragem)` -> `setupResize()`

## Implementação: Toolbar PWA (ordem persistida + edição por arraste)
- **[Linhas 1089-1613 ~]** `// ⚡ [INÍCIO: PWA - BARRA DE FERRAMENTAS INLINE, ORDEM E TECLADO]` -> `filhosToolbar()` (`[1091]`) · `chavesToolbar()`
- **[Linhas 1115-1130 ~]** `(sem comentário de ancoragem)` -> `lerOrdemToolbar()` · `salvarOrdemToolbar(ordem)`
- **[Linhas 1131-1190 ~]** `/**` (doc de `aplicarOrdemToolbar`) -> `aplicarOrdemToolbar(ordem = null, opcoes = {})` (trava de reentrância)
- **[Linhas 1191-1205 ~]** `/** (Re)liga o observer da barra (ele fica desligado enquanto aplicamos a ordem). */` -> `agendarOrdemToolbar()`
- **[Linhas 1206-1311 ~]** `/** Ativa a barra em uma linha com rolagem + botão de edição + ordem salva. */` -> `configurarToolbarPWA()` · `criarBotaoEditarToolbar(toolbar)` · **`ligarBotaoFonte()`** (`#notesFontBtn`) · **`notesLinhaDoCursor()`** · **`notesFonteDaLinha(linha)`** · **`abrirSeletorFonteNotas()`** / **`aplicarFonteNotas(css, temSelecao)`** (usa `NotasFontes`: sem seleção = TODAS as linhas; com seleção = o trecho) · `rotuloBotaoToolbar(el)`
- **[Linhas 1312-1327 ~]** `/** Move um botão uma posição e persiste a nova ordem. */` -> `moverBotaoToolbar(el, delta)`
- **[Linhas 1328-1477 ~]** `/** Diálogo "Editar barra de ferramentas": reordena arrastando (ou pelo teclado) e persiste. */` -> `abrirEditorToolbar()`
- **[Linhas 1478-1484 ~]** `(sem comentário de ancoragem)` -> `restaurarOrdemToolbar()`

## Implementação: Toolbar acoplada ao teclado virtual
- **[Linhas 1485-1561 ~]** `/** Mantém a barra logo acima do teclado virtual (visualViewport). */` -> `ativarToolbarTeclado()` (inclui a rolagem do caret a cada `input`, coalescida num `requestAnimationFrame`)
- **[Linhas 1562-1613 ~]** `/**` (doc de `aplicarToolbarTeclado`) -> `aplicarToolbarTeclado(insetForcado)` (reserva `altura da barra + FOLGA_BARRA_TECLADO` no editor)

## Implementação: Modo mobile e módulos instaladores
- **[Linhas 1622-1671 ~]** `// 🔄 [INÍCIO: PWA - MODO MOBILE (installModoMobileNotas)]` -> `function installModoMobileNotas(App)`
- **[Linhas 1677-1810 ~]** `// 🔄 [INÍCIO: PWA - CAMADA LOCAL DE EXTRAS/TABELAS (installLocalNotesStorage)]` -> `function installLocalNotesStorage(App)` (`readTemplates`/`writeTemplates`, **`pedirNaRede(userId, alvo, options)`** = fallback de REDE, `notesExtraRequest` (templates LOCAIS + rede para o resto), `readNotesFile`, `notesUpload` (data URL) e `notesFileViewer` local que **cai para a implementação de rede** quando não há anexo `a[data-note-asset]` — P84)
- **[Linhas 1819-1860 ~]** `// 🔄 [INÍCIO: PWA - AJUSTES DE NOTA GRANDE (installAjustesNotaGrande)]` -> `function installAjustesNotaGrande(App)`

---

# Nome do Arquivo: sw.js
**Propósito:** Service Worker offline-first. Serve o cache na hora e revalida na rede com timeout, garantindo que o app nunca fique preso carregando.

## Implementação: Constantes, helpers e ciclo de vida
- **[Linhas 14-60 ~]** `// 🚀 [INÍCIO: PWA - CONSTANTES DE CACHE E ASSETS ESSENCIAIS]` -> `const CACHE_NAME = 'notas-pwa-v72';` · `const TIMEOUT_MS = 3000;` · `const OFFLINE_HTML` · `const ESSENCIAIS = [...]` (inclui `./fontes.js`, `./conta.js`, `./sync/chaves.js`, `./sync/sync-cliente.js` e `./mapa/mapa-cores.js`; **o script do GIS NÃO entra** — é cross-origin, opcional e o `fetch` já sai fora para outra origem)
- **[Linhas 19-20 ~]** `(sem comentário de ancoragem)` -> `const CACHE_NAME` (**v72**) · `const TIMEOUT_MS`
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
- **[Linhas 155-193 ~]** `// 🚨 [INÍCIO: CRÍTICO - FETCH STRATEGY (CACHE-FIRST + TIMEOUT)]` -> `self.addEventListener('fetch', ...)` (cache → rede com timeout → fallback `index.html`/`OFFLINE_HTML`; **sai fora para `/api/*` e `/ws`** — o cache-first serviria snapshot/anexo velho, P99)

## Implementação: Mensagens do cliente
- **[Linhas 195-212 ~]** `// 🔄 [INÍCIO: ESTADO/API - MESSAGE HANDLING]` -> `self.addEventListener('message', ...)` (`SKIP_WAITING`, `CACHE_UPDATED`)

---

# Nome do Arquivo: manifest.json
**Propósito:** Manifesto do PWA (nome, ícones, display standalone, atalhos).
- **[Linhas 1-47 ~]** `(JSON — sem comentários de ancoragem)` -> `{ "name": "Notas PWA - Editor de Notas", "display": "standalone", "icons": [...], "shortcuts": [...] }`

---

# Nome do Arquivo: _redirects / _headers
**Propósito:** Regras de deploy (Cloudflare Pages/Netlify) — impedem que `/sw.js` e `/manifest.json` caiam no fallback de SPA (SW servido como HTML é rejeitado em silêncio) e definem os cabeçalhos de cache/content-type/segurança. **A API e o WebSocket nunca entram em cache**.
- **[Linhas 1-23 ~]** `# Cloudflare Pages / Netlify: regras avaliadas de cima para baixo.` -> `_redirects`: `/sw.js → /sw.js 200` · `/manifest.json → /manifest.json 200` + bloco comentado explicando que o **deploy padrão é de origem única** (o Python serve o PWA e a API; nada a rotear) e como migrar para um proxy (Pages Function) se separar os hosts
- **[Linhas 1-35 ~]** `# Cloudflare Pages - regras de resposta HTTP` -> `_headers`: `/*` com `must-revalidate` + `X-Content-Type-Options: nosniff` · `Referrer-Policy` · `X-Frame-Options: DENY` · `Permissions-Policy`; **`/api/*` e `/ws` com `Cache-Control: no-store`** (P99); `/sw.js` com `no-store, no-cache, must-revalidate`, `Content-Type: application/javascript` e `Service-Worker-Allowed: /` (SW nunca retido em cache)

---

# Nome do Arquivo: styles.css
**Propósito:** CSS base do PWA (tokens de tema, cor da barra de status, base e componentes próprios). Distinto de `theme-origem.css` (tema portado do original).
- **[Linhas 5-36 ~]** `/* 🎨 [INÍCIO: PWA/ESTILO - VARIÁVEIS DE TEMA] */` -> `:root { --color-* }` + tokens da barra de status (claro/escuro)
- **[Linhas 38-727 ~]** `/* 🎨 [INÍCIO: PWA/ESTILO - BASE E COMPONENTES] */` -> `body`, `button` e componentes próprios do app (inclui `.app-toast*`, `.app-theme-switch*`, `.app-tema-fixo` e o seletor de fontes `.notas-seletor-fontes*`)
- **[Linhas 734-841 ~]** `/* 🎨 [INÍCIO: CONTA/ESTILO - BOTÃO E DIÁLOGO DE CONTA] */` -> **bloco da CONTA**: `.conta-btn` (pastilha flutuante do topo: ícone + nome, `max-width: 260px`, `text-align: center`; até **1023px** só o ÍCONE — `padding: 9px` e `.conta-btn-nome { display: none }` — para o título da área ao lado continuar legível) + variante **tema escuro** + diálogo `.conta-dialog`/`.conta-erro`/`.conta-email`/`.conta-sync`/`.conta-aviso`/`.conta-acao`/`.conta-acao-secundaria` (reusa a base `.notes-extra-dialog`) + **login com Google** `.conta-google`/`.conta-google-divisor` (o botão é o iframe do PRÓPRIO Google; os dois ficam `hidden` quando não há Client ID/GIS)
- **[Linhas 842-931 ~]** `(continuação da BASE)` -> componentes próprios do app
- **[Linhas 933-1218 ~]** `/* ============ PADRÕES COMPARTILHADOS (Notas + Mapa + Pastas) — classes ÚNICAS` -> **tokens de VIDRO** (`--app-vidro-fundo/-borda/-blur` = barras; `--app-vidro-campo-*` = campo; `--app-overlay-*` = base das áreas; `--app-vidro-barra-opaca` = cor composta para mascarar a rolagem) + **classes ÚNICAS replicadas nas duas áreas**: `.app-vidro-barra`, `.app-vidro-campo` e as regras de `.notes-context-nav`/`.notes-context-chip` (chips com as MESMAS cores no Mapa) + `.app-rodape`/`.app-rodape-meta` (rodapé em grade `1fr auto 1fr` = esquerda | CENTRO | direita), `.app-rolagem` (rolagem com o polegar só no hover; 2º seletor eleva a especificidade dentro do modal de Notas), `.app-barra` (barra em UMA linha com rolagem horizontal) e **`.app-tela-cheia`** (tela cheia — a MESMA classe aplicada ao `.mapa-shell` e ao `#notesModal`)

---

# Nome do Arquivo: fontes.js
**Propósito:** Catálogo AMPLO de fontes do SISTEMA (offline) com busca + seletor visual. Expõe `window.NotasFontes` (`lista`, `buscar`, `abrir`, `fechar`) — usado pelo botão **Fonte** da barra de Notas e pelo Mapa.
- **[Linhas 1-210 ~]** `// ⚙️ [INÍCIO: FONTES - CATÁLOGO DO SISTEMA (BUSCA + SELETOR)]` -> `FONTES[]` (sans/serif/mono/cursiva/fantasia + grupos genéricos), `chave(texto)` (busca sem acento), `buscar(termo)`, `abrir({ atual, onEscolher, trigger })` (diálogo `role="dialog"` com `.notas-seletor-fontes*`, fecha no Esc/clique fora/✕) · `fechar()` · `global.NotasFontes`

# Nome do Arquivo: conta.js
**Propósito:** Conta do usuário — **login OPCIONAL** por e-mail/senha **ou Google**. É o rosto do backend Python: o **botão de conta** na moldura fixa do topo (substituiu a seta ‹) e o **diálogo de conta** (entrar / criar conta / **entrar com Google** / sair). Deslogado, o app é **exatamente o de hoje** (LocalStorage, offline-first); o backend nunca é obrigatório.
- **[Linhas 1-8 ~]** `/**`-equivalente em JS (`/** … */`) + `// 🚨 [INÍCIO: CONTA - ESTADO E CHAMADAS À API]` -> `window.notasConta = { logado, email, csrf, sync: { estado, pendentes } }` (**espelho — nunca guarda token**: a sessão é cookie `HttpOnly`) · `ICONE_PESSOA` (SVG)
- **[Linhas 30-69 ~]** `(continuação) -> API`: `p.contaPedir(caminho, opcoes)` (`fetch('/api/auth'+caminho)`, `credentials: 'same-origin'`, `X-CSRF` em toda escrita, lê `{detail}` e vira `Error` com mensagem pronta; 204 = sem corpo)
- **[Linhas 71-110 ~]** `// 🚨 [INÍCIO: CONTA - SESSÃO ...]` -> `p.contaAplicar(dados)` (espelha, atualiza a UI e **dispara o sync**: `syncAoEntrar()` ao entrar, `syncAoSair()` ao sair — gancho da seção 5) · `p.contaVerificar()` (**SILENCIOSO no boot — P62**: sem backend, sobe deslogado e utilizável) · `p.contaEntrar` · `p.contaRegistrar` · `p.contaSair` (idempotente)
- **[Linhas 112-128 ~]** `// ⚡ [INÍCIO: CONTA - BOTÃO DO CABEÇALHO]` -> `p.contaAtualizarBotao()` (ícone + `.conta-btn-nome` = "Entrar" ou o e-mail; `data-logado`; `title`/`aria-label` completos)
- **[Linhas 130-234 ~]** `// ⚡ [INÍCIO: CONTA - LOGIN COM GOOGLE (GIS)]` -> `GOOGLE_GIS` · **`p.contaGoogleConfig()`** (GET `/api/auth/config`: `google_ativo` + Client ID — **silencioso**, sem backend vira `null`; **só o resultado POSITIVO (e com o formato esperado: `google_ativo` booleano) fica em cache** — um host estático que devolva o `index.html` com 200 em `/api/*` não vira "config" presa) · **`p.contaGoogleScript()`** (injeta `https://accounts.google.com/gsi/client` UMA vez; resolve `null` em offline/CSP/bloqueio) · **`p.contaGoogleMontar()`** (padrão de mercado: só renderiza o botão OFICIAL quando há Client ID **e** o script carregou; `initialize` + `renderButton` em `.conta-google`) · **`p.contaGoogleEntrar()`** (POST `/api/auth/google` com o `credential` → `contaVerificar`; erro inline)
- **[Linhas 236-406 ~]** `// ⚡ [INÍCIO: CONTA - DIÁLOGO (entrar / criar conta / sair)]` -> helpers (`criar`/`paragrafo`/`botao`/`campo`) · `p.montarContaLogado` (e-mail + situação do sync + "Sair") · `p.montarContaDeslogado` (formulário com Entrar/Criar conta + **divisor "ou"** e a caixa `.conta-google`, ambos nascendo `hidden`; erro inline `role="alert"`) · `p.contaMontarDialogo` (redesenha só os `[data-conta]`) · `p.contaAbrirDialog` (reusa **`notesExtraDialog`**, como o "Modelos") · `p.contaAtualizarDialogo` · `p.contaTextoDoSync` (`Sincronizado` / `Enviando N alterações…` / `Offline — N na fila` / `Sessão expirada` / `Só neste aparelho` — sem hora)
- **[Linhas 408-441 ~]** `// 🚀 [INÍCIO: CONTA - INSTALAÇÃO (installConta)]` -> `p.instalarContaUI()` (liga o clique do botão **uma vez**, atualiza o rótulo, recheca a sessão no evento `online` e chama `p.contaVerificar()`) · **`iniciarConta()`** (**P98**: o boot é ADIADO para a INSTÂNCIA `window.notesApp` — rodar `contaVerificar` no PROTÓTIPO espalharia o estado do sync entre protótipo e instância) · `installConta(App)` chamado por `installNotesFeatures()`

# Nome do Arquivo: theme-origem.css
**Propósito:** Tema portado do CSS COMPILADO do projeto original (tokens + classes do sistema antigo). Regenerado por `tools/extrair-tema.cjs`.
- **[Linhas 1-1428 ~]** `/* 🎨 [INÍCIO: PWA/ESTILO - TEMA PORTADO DO ORIGINAL] */` -> tokens `--*` e classes do compilado

# Nome do Arquivo: notes/editor.css
**Propósito:** Estilos do editor de notas (linhas, cabeçalho, colapso, alinhamento/fonte por linha, paleta de tons, código e nota grande).
- **[Linhas 1-156 ~]** `/* 🎨 [INÍCIO: NOTAS/ESTILO - EDITOR (LINHAS, CABEÇALHO, COLAPSO)] */` -> regras `#notesEditor .notes-line*` (inclui **alinhamento por linha** `[data-align=...]` e `.app-toolbar-font-btn`), `#notesToolbar[hidden]` e o **override de tela cheia** (`.app-tela-cheia` vence o `inset: 0 20vw` do `theme-origem.css`)
- **[Linhas 150-298 ~]** `/* 🎨 [INÍCIO: NOTAS/ESTILO - PALETA DE TONS, CÓDIGO E NOTA GRANDE] */` -> `.notes-tone-*`, `.notes-code*`, `content-visibility` em nota grande
- **[Linhas 309-330 ~]** `/* 🎨 [INÍCIO: NOTAS/ESTILO - PADRONIZAÇÃO (ÍCONES, ALTURA DA TOOLBAR, ROLAGEM)] */` -> ícones/altura da barra e rolagem (a rolagem padrão vem de `.app-rolagem`, em `styles.css`) + **altura do RODAPÉ** (`.notes-modal-footer` com `min-height: var(--app-toolbar-altura)` = a MESMA do rodapé do Mapa, vencendo o `4rem` do `theme-origem.css`)

# Nome do Arquivo: notes/extras.css
**Propósito:** Estilos dos diálogos extras (inserir/link/modelos) e do visualizador de arquivo.
- **[Linhas 1-72 ~]** `/* 🎨 [INÍCIO: NOTAS/ESTILO - DIÁLOGOS EXTRAS E VISUALIZADOR DE ARQUIVO] */` -> `.notes-extra-dialog`, `.notes-file-viewer`, `.notes-insert-menu`, `.notes-context-menu`

# Nome do Arquivo: notes/tables.css
**Propósito:** Estilos da barra de ferramentas da tabela, do endereço/formula da célula e dos cursores de resize.
- **[Linhas 1-30 ~]** `/* 🎨 [INÍCIO: NOTAS/ESTILO - BARRA DE FERRAMENTAS DA TABELA + RESIZE] */` -> `.notes-table-*`, `#notesEditor[data-table-resize]`

# Nome do Arquivo: mapa/mapa.css
**Propósito:** Estilos da área do mapa (shell, topbar, faixa de chips dos MAPAS, canvas/nós, conexões, minimapa, painel de propriedades e controles do layout automático).
- **[Linhas 1-1311 ~]** `/* 🎨 [INÍCIO: MAPA/ESTILO - ÁREA, CANVAS, NÓS, PAINEL E CONEXÕES] */` -> tokens `--mapa-*` (espelho do tema de Notas) + classes `mapa-*` (F8: `#mapaNos.mapa-transicao`, `.mapa-espacamento`, `.mapa-campo-numero`, `.mapa-confirmacao`; F9: `.mapa-no-forma-*`/`-fonte-*`/`-alinha-*`/`-negrito`/`-italico`, `.mapa-estilo-nivel*`, `.mapa-campo-cor`, `.mapa-painel-estilo`; F10: `.mapa-atalhos*`; F11: `.mapa-btn:disabled`; F12: `.mapa-toolbar`/`.mapa-format-bar`/`.mapa-tb-*`, **ícones `.mapa-tb-btn svg` 18×18**, **`.mapa-tb-fixos`** (fundo = `--app-vidro-barra-opaca`, sem “branco” destoando), **menu de opções `.mapa-menu-opcoes`/`.mapa-menu-item-ativo`**; `.mapa-menu*`, `.mapa-barra-editor*`, `.mapa-cor-paleta*`; blindagem `.mapa-falha*`; **`▸` layout**: **`.app-areas` = MOLDURA FIXA do topo** (`[Linhas 47-80]`: container sem fundo, `pointer-events: none` (só o filho recebe clique); **PC** centraliza na METADE LIVRE — `padding: 0 12px 0 50%`, porque o modal de Notas ocupa a metade esquerda; **até 1023px** vai à esquerda e as barras ganham `padding-left: 3.5rem` para o título ao lado continuar legível); **P81 (padronização com Notas)**: `.mapa-area` com a MESMA base/overlay do drawer (`--app-overlay-*`), `.mapa-shell`/`.mapa-topbar`/barras/canvas/rodapé usando as classes de vidro de `styles.css` (`.app-vidro-barra`/`.app-vidro-campo`), `.mapa-canvas-wrap` TRANSPARENTE (senão mata o vidro), controles dentro das barras com fundo transparente, `.mapa-minimapa` com o fundo do próprio campo (transparente) e `.mapa-no` com o MESMO branco do vidro; **tela cheia** pela classe compartilhada `.app-tela-cheia` (styles.css) aplicada ao shell; `.mapa-shell.mapa-fullscreen` serve só para trocar o ícone `#mapaFullscreenBtn .mapa-expand-icon`/`.mapa-restore-icon`; **`.mapa-chips-nav`** (faixa de chips dos MAPAS acima da barra: MESMAS classes/formatação de `#notesContextNav` — transparente, rolagem vertical a partir de ~2 linhas e o "+" preso/sticky no canto inferior direito); `.mapa-rodape app-rodape`; `.mapa-grade`; `.mapa-form[hidden]`. **As classes compartilhadas `.app-rolagem`/`.app-barra`/`.app-rodape`/`.app-vidro-*` ficam em `styles.css`** e são aplicadas aqui (`.mapa-toolbar`/`.mapa-format-bar app-barra app-rolagem app-vidro-barra`, `.mapa-topbar app-vidro-barra`, `.mapa-canvas app-vidro-campo`, `.mapa-lista app-rolagem`, `.mapa-notas-nav app-rolagem`, `.mapa-rodape app-rodape`).

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
- **[Linhas 626-684 ~]** `// 🔄 [INÍCIO: NOTAS - COMANDOS (executeNotesCommand)]` -> `p.executeNotesCommand=function(command)` (inclui **alinhamento por LINHA**: `command.startsWith('align')` → grava `line.dataset.align` = `left`/`center`/`right`/`justify`; repetir o mesmo limpa)
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
- **[Linhas 1053-1121 ~]** `// 🔄 [INÍCIO: NOTAS - CABEÇALHO, COLAPSO, MOTION E FULLSCREEN]`
- **[Linhas 1054-1055 ~]** `p.setNotesHeaderCollapsed=function(collapsed)` · `p.toggleNotesHeaderCollapse=async function()`
- **[Linhas 1065-1089 ~]** `p.toggleAllNotesCollapse=function()` · `p.animateNotesLineCollapse=async function(line)` · `p.notesPanelMotion=async function(element,hide,version)` (**delega à animação ÚNICA `AppExpandir.motion`, de `app.js`**)
- **[Linhas 1096-1120 ~]** `p.toggleNotesFullscreen=async function(force)` (**config de Notas da classe ÚNICA `AppExpandir` — a MESMA do Mapa**: `alvo`=`#notesModal`, `classeArea`=`fullscreen`, `barras`=`[#notesToolbar, #notesContextNav]`, `botao`=`#notesFullscreenBtn`, `expandido`=classe `fullscreen`, `versao`=`notesMotionVersion`, `ladoALadoAtivo`=`html.app-split`, **`aplicarLadoALado` fecha com `aplicarSplit(false, { manter: 'notas' })`** (só abre com `aplicarSplit(true)`), `antesDaTroca` guarda `notesSavedWidth`, `aoAplicar` cuida do backdrop/`--notes-width`, `aoFinalizar` chama `setNotesHeaderCollapsed`; ao EXPANDIR fecha o lado a lado e recolhe as barras UMA POR VEZ; ao CONTRAIR mostra em ORDEM INVERSA e o lado a lado REAPARECE)

## Implementação: Resize do modal
- **[Linhas 1123-1140 ~]** `// 🔄 [INÍCIO: NOTAS - RESIZE (setupNotesResize)]` -> `p.setupNotesResize=function()` (handle `#notesResizeHandle`, teclado e fullscreen)

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
- **[Linhas 703-836 ~]** `// 🔄 [INÍCIO: MAPA - ESTILO (FASE 9)]` -> `FORMAS_NO`/`ALINHAMENTOS_NO`/`FONTES_NO`/`TAMANHOS_NO`/`ESPESSURAS_BORDA`/`TEMAS_MAPA`, `normalizarEstilo` (aceita `FONTES_NO` **ou** uma família CSS válida do catálogo `NotasFontes`), `normalizarEstilosNivel`, `temaDoMapa`, `nivelDoNo`, `estiloEfetivo` (nó > nível > tema), `copiarEstiloNo`, `atualizarEstiloNo`, `limparEstiloNo`, `definirEstiloNivel`, `removerEstiloNivel`, `definirTemaMapa`
- **[Linhas 838-924 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÕES LIVRES (FASE 6)]` -> conexões manuais entre nós

---

# Nome do Arquivo: mapa/mapa-store.js
**Propósito:** Persistência local (LocalStorage) do índice de mapas, pastas, recentes, templates, mapa ativo, área ativa e atalhos do mapa. Chaves com prefixo `notas-pwa-`.

## Implementação: Chaves, área ativa, grade, atalhos e barra
- **[Linhas 9-21 ~]** `(sem marcador de ancoragem)` -> `CHAVES{}` (`pastas`, `area`, `pastaAtiva`, `split`, `atalhos`, `barra`, `grade`), `TETO_RECENTES`, `chaveGrafo(id)`, `chaveHistorico(id)`, `novoId(prefixo)`
- **[Linhas 39-45 ~]** `// 🔄 [INÍCIO: MAPA - ÁREA ATIVA]` -> `AREAS` (`pastas`/`notas`/`mapa`), `lerAreaAtiva()` (padrão `pastas`) · `salvarAreaAtiva(area)` (`notas-pwa-area-ativa`)
- **[Linhas 47-52 ~]** `// 🔄 [INÍCIO: MAPA - GRADE DA SUPERFÍCIE]` -> `lerGrade()`/`salvarGrade(ligado)` (`notas-pwa-mapa-grade`; grade OPCIONAL, padrão desligada)
- **[Linhas 54-70 ~]** `// 🔄 [INÍCIO: MAPA - ATALHOS (FASE 10)]` -> `lerAtalhos`/`salvarAtalhos`/`limparAtalhos` (`notas-pwa-mapa-atalhos`) + `lerOrdemBarra`/`salvarOrdemBarra`/`limparOrdemBarra` (`notas-pwa-mapa-toolbar-order`, F12)

## Implementação: Índice / CRUD de mapas
- **[Linhas 60-211 ~]** `// 🔄 [INÍCIO: MAPA - ÍNDICE/CRUD]` -> `listarMapas` / `salvarListaMapas` / `obterResumo` / `obterGrafo` / `criarMapa` / renomear / duplicar / excluir / arquivar

## Implementação: Pastas, recentes, templates e ativo
- **[Linhas 225-352 ~]** `// 🔄 [INÍCIO: MAPA - PASTAS/RECENTES/TEMPLATES/ATIVO]` -> pastas (CRUD) + `ID_PASTA_PADRAO`/`garantirPastaPadrao` (pasta "Geral"), `lerPastaAtiva`/`salvarPastaAtiva`, `contarMapasDaPasta`, **`listarMapasDaPasta(pastaId)`** (mapas da pasta ativa, ordenados por nome — alimenta a faixa de chips do mapa), `lerSplit`/`salvarSplit` (lado a lado + `ratio`/`LIMITE_SPLIT`), `listarRecentes`, `salvarTemplate`, `obterMapaRaiz`, histórico do grafo

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
**Propósito:** Renderização da área do mapa (HTML puro): shell, topbar (com **Fechar** `#mapaFechar` e **"Ver nota ao lado"** `#mapaSplitBtn`), a **FAIXA DE CHIPS dos MAPAS da pasta** (`#mapaChipsNav`), o **estado "sem mapa aberto"**, o mapa aberto (canvas/nós/minimapa — **SEM título/metadados acima do canvas**), as **barras padronizadas (F12: `#mapaToolbar` fixa + `#mapaFormatBar` SEMPRE visível, com ÍCONES PADRONIZADOS de 16×16, o MESMO desenho da barra de Notas onde a função coincide e o botão **Modelos**), o menu contextual do card, os painéis de atalhos/edição de barra e as conexões. **NÃO existe mais lista de gestão.**

## Implementação: Shell, topbar e estado vazio
- **[Linhas 61-153 ~]** `// 🔄 [INÍCIO: MAPA - SHELL DA ÁREA]` -> estrutura base da `#mapaArea` + contêineres `#mapaToolbar`/`#mapaFormatBar` (classes `app-barra app-rolagem app-vidro-barra`) + **`#mapaChipsNav`** (`notes-context-nav mapa-chips-nav app-rolagem` — faixa de chips dos MAPAS, ACIMA da barra, mesmas classes/formatação do `#notesContextNav`) + topbar com `app-vidro-barra` (SÓ título/colapso/tela cheia/lado a lado/fechar) + rodapé **`#mapaRodape` (classe `app-rodape`)**/`#mapaStatus` + botões `#mapaSplitBtn` ("Ver nota ao lado"), `#mapaColapsoBarras`, `#mapaFechar` e `#mapaFullscreenBtn` (**`btnTelaCheia()`**: um SVG com os DOIS desenhos expandir/restaurar, trocados por `.mapa-fullscreen`) — **sem o antigo `‹ Mapas`** (o título fica ao lado do botão de conta, na moldura fixa) (helpers `campoNumero`/`campoCor`/`dataAbsoluta`/`tempoRelativo` acima do bloco); o canvas (`canvasInfinito`) recebe `app-vidro-campo` (MESMO vidro do campo de edição de Notas)
- **[Linhas 155-258 ~]** `// 🔄 [INÍCIO: MAPA - TOPBAR/FORMULÁRIO]` -> `atualizarShell(estado)` (a faixa de chips fica SEMPRE visível; barras/rodapé/botões só com mapa aberto) + formulários inline que RESTARAM (`renderForm`: `conectar` mapas, `no-mover-para`, `no-conectar-para`; `selectDestino`/`selectNos`)
- **[Linhas 1121-1138 ~]** `// 🔄 [INÍCIO: MAPA - SEM MAPA ABERTO (ESTADO VAZIO)]` -> `renderSemMapa(wrap, dados)` (dica "Nenhum mapa aberto." + instrução de escolher/criar pelos chips da faixa — **sem lista**)

## Implementação: Mapa aberto, barras, menus e conexões
- **[Linhas 260-1119 ~]** `// 🔄 [INÍCIO: MAPA - MAPA ABERTO]` -> `#mapaCanvasWrap`, nós, minimapa, backlinks, confirmação de layout (F8), painel de atalhos (F10), `editorBarra` (F12); `renderMapaAberto` sem título/metadados acima do canvas e `canvasInfinito` com grade OPCIONAL (classe `.mapa-grade`, desligada por padrão)
  - **[Linhas 344-908 ~]** `// 🔄 [INÍCIO: MAPA - BARRAS PADRONIZADAS (FASE 12)]` -> **ícones padronizados** (`ICONES`/`icone()`/`btnIcone()`/`btnMenu()`/`btnTelaCheia()` — 16×16, `stroke: currentColor`, com os MESMOS desenhos da barra de Notas onde a função coincide; **`templates` = o MESMO desenho do botão "Modelos" de Notas (4 quadrados)**; **ícones DISTINTOS por opção de Alinhamento**: `alinha-esquerda`/`alinha-centro`/`alinha-direita`), `btnBarra`/`grupoBarra`/`divisorBarra`/`aplicarOrdemBarra`, `renderBarras` (grupos: histórico, inserir, exibir, mais), `grupoExibir` (inclui o toggle `#mapaGradeBtn`), `grupoMais`, `comEstado`, `renderFormatBar` (SEMPRE visível com o mapa aberto; **grupo Modelos com `#mapaModelosBtn`** — botão `toolbar-btn` + `aria-haspopup="dialog"`, MESMO ícone de Notas; grupo `.mapa-tb-fixos` — ações rápidas irmão/filho à direita; botão **Fonte** `fonte-abrir` abre o catálogo `NotasFontes`), **`OPCOES_BARRA`/`rotuloOpcao`/`btnOpcoes`/`menuOpcoesBarra`** (forma/alinhamento em UM botão com menu; cada item usa o SEU ícone), `menuContextual`, `editorBarra`; `noCanvas` ganha `.mapa-no-nota-icone` (`abrir-nota`)
- **[Linhas 1170-1435 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÕES (FASE 6)]` -> camada de conexões livres (F9: `stroke-width` do ramo pelo estilo efetivo) + `menuConexao`

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
**Propósito:** Orquestrador da área Mapa Mental. Instala `installMapaMental(NotesPWA)`, monta lazy e liga store/render/modelo/layout/interação: a **faixa de chips dos MAPAS da pasta ativa** (espelho dos chips de Notas) + o **menu do chip**, o diálogo **Modelos**, canvas/viewport, CRUD de nós, hierarquia, layout automático (F8), estilo visual (F9), atalhos (F10), undo/redo (F11), barras/menu contextual/cores (F12), conteúdo, conexões, as **Pastas (tela principal/workspaces)** e o isolamento das áreas. **NÃO existe mais a lista de gestão de mapas.**

## Implementação: Estado/helpers e render/controle
- **[Linhas 9-71 ~]** `// 🔄 [INÍCIO: MAPA - ESTADO/HELPERS]` -> `store()`/`modelo()`/`render()`, `dadosGestao()` (contexto da PASTA ativa: `pastas` + `pastaNome`), `abrirMapa(id)`, `conectarMapa(origemId,destinoId)`, **`mapasDaPasta(pastaId)`** (mapas da pasta ativa — fonte da faixa de chips), `aplicarTemplatePronto`/`aplicarTemplateSalvo` (criam o mapa **na pasta ativa**)
- **[Linhas 73-462 ~]** `// 🔄 [INÍCIO: MAPA - RENDER/CONTROLE]` -> **`garantirMapaSelecionado()`** (ABERTURA PADRÃO da área — espelho de `lerNotaAtiva() || projectsData[0]` das Notas: mantém o mapa JÁ aberto se ele pertencer à pasta ativa; senão usa o último mapa ativo persistido (`lerMapaAtivo`) se for da pasta; senão abre o PRIMEIRO mapa da pasta (1º chip, ordem por nome); pasta vazia → mantém "Nenhum mapa aberto"; retorna `true` se a seleção mudou), `renderArea()` (guarda de BLINDAGEM; renderiza `#mapaToolbar`/`#mapaFormatBar` ANTES do mapa; **`renderMapasNav()`** a cada render; reaplica `setMapaBarrasColapsadas` e, em TELA CHEIA, `aplicarBarrasFullscreen(true)`; fora dela, `expandidorMapa(this).aplicar(false)` limpa classes/botão; nome da nota vinculada), **`mapaVoltarParaPastas()`** (a seta ‹ fixa volta à TELA PRINCIPAL de Pastas — não há mais lista), `tratarCliqueMapa` (ações de barra/formatação/cores/colapso/split/`modelos`/`abrir`/`duplicar`/`fechar-mapa`/`alternar-fullscreen`(→`mapaAlternarFullscreen`)/grade/`abrir-nota`; define `dados.grade`, o estado de tela cheia e o texto do rodapé `#mapaStatus`), `tratarSubmitMapa` (só nós/conexões) / `tratarMudancaMapa` (layout/tema)
- **[Linhas 464-658 ~]** `// ⚡ [INÍCIO: MAPA - FAIXA DE CHIPS E MENU DO MAPA (ESPELHO DOS CHIPS DE NOTA)]` -> `renderMapasNav()` (chips dos mapas da pasta + **"+"**, MESMAS classes de Notas: `.notes-context-nav`/`.notes-context-chip`/`-add`), `criarMapaNoChip()` ("+" cria na pasta ativa e abre), `renomearMapaNoChip(id)` (duplo clique), `duplicarMapaNoChip(id)`, `moverMapaDeChip(id,pastaId)`, `excluirMapaDoChip(id)` (confirmação; se for o ABERTO, seleciona o restante pela MESMA regra `garantirMapaSelecionado`; se for o último, volta às Pastas), `criarMenuMapa`/`mostrarMenuMapa`/`abrirMenuMapa` (Renomear · Duplicar · Mover para pasta… · Excluir) /`abrirMenuMoverMapa`/`fecharMenuMapa` (**menu em `.notes-chip-menu`**) e `setupChipLongPressMapa` (toque longo)
- **[Linhas 635-687 ~]** `// 🔄 [INÍCIO: MAPA - MODELOS (DIÁLOGO — ESPELHO DO "MODELOS DE NOTA")]` -> **`mapaTemplates(trigger)`**: reusa `notesExtraDialog` (`.notes-extra-dialog`/`.notes-template-help`); salva o mapa atual como modelo (`salvarTemplate`), aplica modelo PRONTO/salvo (na pasta ativa) e lista os modelos
- **[Linhas 689-773 ~]** `// ⚡ [INÍCIO: MAPA - COLAPSO DAS BARRAS]` -> `setMapaBarrasColapsadas` · `mapaPanelMotion` (**delega à animação ÚNICA `AppExpandir.motion`**) · `mapaAlternarColapsoBarras` (botão `#mapaColapsoBarras`); **`BARRAS_FULLSCREEN`** (`mapaToolbar`/`mapaFormatBar`/`mapaChipsNav`/`mapaRodape`) · **`expandidorMapa(app)`** = instância ÚNICA da classe compartilhada `AppExpandir` (a MESMA de Notas) · `aplicarBarrasFullscreen(esconder)` (sem animação, p/ o re-render) · **`mapaAlternarFullscreen`** = apenas `expandidorMapa(this).alternar()` (ao EXPANDIR fecha o lado a lado e recolhe as barras UMA POR VEZ; ao CONTRAIR mostra em ORDEM INVERSA e reabre o que estava ao lado, preservando o que já estava recolhido)
- **[Linhas 775-902 ~]** `// ⚡ [INÍCIO: MAPA - PASTAS (ÁREA RAIZ / WORKSPACES)]` -> `botaoPastas` (namespace `data-pastas-acao`), `montarAreaPastas`, `renderPastas` (cartões com contagem de notas+mapas), `abrirPasta` (define a pasta ativa — `pastaAtiva`/`pastaId` das notas/`mapaFiltroPasta` — e entra em Notas; o modal abre POR CIMA dos cartões), `tratarCliquePastas`
- **[Linhas 903-1104 ~]** `// ⚡ [INÍCIO: MAPA - LADO A LADO (SPLIT NOTA + MAPA)]` -> `atualizarBarraAreas` (navegação = **moldura fixa do topo com o botão de CONTA** (`#contaBtn`, `conta.js`); a seta ‹ saiu; botão "Ver mapa ao lado" `#notesAbrirMapa`), `aplicarSplitRatio` (grava `--split-nota` e `--notes-width:100%` no card; o `@layer components` de Notas vence importante fora de camada)/`montarDivisorSplit`/`instalarDivisorSplit` (divisor arrastável `#appSplitDivisor`, c/ pega por proximidade em fase de captura — o mapa não inicia pan), **`aplicarSplit(ligado, opcoes)`** (classe `app-split`; `opcoes.manter = 'notas'` faz o mapa sair de cena ao DESLIGAR **sem trocar de área** — evita que o expandir das Notas entregue a tela ao mapa), `trocarLadoSplit`, `instalarArrastoSplit` (arrastar a barra superior troca de lado)

## Implementação: Canvas, navegação e histórico
- **[Linhas 1109-1182 ~]** `// 🔄 [INÍCIO: MAPA - CANVAS/VIEWPORT]` -> `caixaDoCanvas()`, viewport por mapa (persistência com debounce)
- **[Linhas 1184-1268 ~]** `// 🔄 [INÍCIO: MAPA - NAVEGAÇÃO DO CANVAS]` -> zoom (25%–300%), centralizar, fit, ir para a raiz, minimapa
- **[Linhas 1270-1476 ~]** `// 🔄 [INÍCIO: MAPA - HISTÓRICO/COMANDOS]` -> `LIMITE_HISTORICO`(100)/`JANELA_COALESCE`(900ms), `instantaneoGrafo` (inclui layout/posicionamento/espaçamento/tema/estilosNivel), `historicoReset`, `registrarHistorico(opcoes)` (coalescência), `aplicarInstantaneo`, `desfazer`/`refazer`, `atualizarBotoesHistorico`, `iniciarEdicaoDepois(idNo)`, `reposicionarAuto`
  - **[Linhas 1407-1466 ~]** `// 🔄 [INÍCIO: MAPA - LAYOUT AUTOMÁTICO (FASE 8)]` -> `refinarLayoutPorMedicao()` · `reposicionarSuave()`

## Implementação: Comandos de nó, atalhos, estilo, barras e isolamento
- **[Linhas 1478-1625 ~]** `// 🔄 [INÍCIO: MAPA - COMANDOS DE NÓ]` -> criar filho/irmão/independente, excluir, duplicar, copiar/recortar/colar
  - **[Linhas 1480-1529 ~]** `// 🔄 [INÍCIO: MAPA - POSICIONAMENTO DO NÓ NOVO]` -> `posicionarNovoNo(grafo,no,idReferencia)` (`garantirNoVisivel`)
- **[Linhas 1627-2419 ~]** `// 🔄 [INÍCIO: MAPA - MOVER/RECOLHER/ESTILO DO NÓ]`
  - **[Linhas 1746-1876 ~]** `// 🔄 [INÍCIO: MAPA - CONTEÚDO DO NÓ (FASE 4)]` ... `[FIM ... PARTE 1]` / `[PARTE 2]` -> aplicar conteúdo do painel ao nó
  - **[Linhas 1878-1957 ~]** `// 🔄 [INÍCIO: MAPA - ATALHOS (FASE 10)]` -> `dadosAtalhos`, `mapaAbrirAtalhos`/`mapaFecharAtalhos`, `mapaCapturarAtalho`, `mapaLigarAtalho` (conflito), `mapaRestaurarAtalhosPadrao`
  - **[Linhas 1959-2088 ~]** `// 🔄 [INÍCIO: MAPA - BARRAS/MENU/CORES (FASE 12)]` -> `mapaAbrirMenuNo`/`mapaAbrirMenuCanvas`/`mapaFecharMenus` (fecha também o menu de opções da barra), `ordemBarraAtual`, `mapaMoverBotaoBarra`, `mapaRestaurarBarra`, `mapaAlternarMenuBarra` (fonte/forma/alinhamento em UM botão), **`MENUS_FLUTUANTES`** + **`fecharMenusAbertos()`** + **`fecharMenusFora(evento)`** (clicar FORA fecha qualquer menu — sem `renderArea`)
  - **[Linhas 2090-2176 ~]** `// 🔄 [INÍCIO: MAPA - FORMATAÇÃO RÁPIDA E CORES (FASE 12)]` -> `mapaAlternarEstiloRapido`, `mapaDefinirEstiloRapido`, `mapaPassoEstiloRapido`, `mapaAbrirCor`, `mapaGravarCorRecente`
  - **[Linhas 2178-2266 ~]** `// 🔄 [INÍCIO: MAPA - ESTILO DO NÓ/MAPA (FASE 9)]` -> `mapaSalvarEstiloNo`, `mapaCopiarEstiloNo`, `mapaAplicarEstiloCopiadoNo`, `mapaRestaurarEstiloNo`, `mapaDefinirTema`, `mapaDefinirEstiloNivel`, `mapaLimparEstiloNivel`
  - **[Linhas 2268-2331 ~]** `// 🔄 [INÍCIO: MAPA - HIERARQUIA/LAYOUT (FASE 5)]` -> `mapaDefinirLayout` (F8: pede confirmação se manual), `mapaConfirmarLayout`, `mapaDefinirEspacamento`
  - **[Linhas 2333-2406 ~]** `// 🔄 [INÍCIO: MAPA - CONEXÕES LIVRES (FASE 6)]` -> criar/remover conexões manuais + `mapaCommitarTituloNo` (F11: coalescência de digitação)
- **[Linhas 2446-2821 ~]** `// 🔄 [INÍCIO: MAPA - ÁREA/ISOLAMENTO]` -> `diagnosticoModulosMapa()`/`mostrarFalhaMapa()` (BLINDAGEM), `montarAreaMapa()` (montagem lazy em `try/catch`, **ABERTURA PADRÃO via `garantirMapaSelecionado()`** — o 1º mapa da pasta já fica selecionado/renderizado —, retorna `true` se montou agora; ouvintes ligados UMA vez via `mapaAreaOuvintesLigados`), **`aplicarArea`** (aplica a área salva; ao ENTRAR na área do mapa, RE-RENDERIZA por `garantirMapaSelecionado() || !montouAgora` — cobre reentrada/troca de pasta/pasta vazia; ao ENTRAR nas NOTAS, usa **`definirPastaAtivaNotas(this.notaPastaAtiva)`** — abertura padrão espelhada dos Mapas: mantém a nota se pertencer à pasta, senão a 1ª, pasta vazia cria "Nova nota"; ao SAIR do mapa zera `mapaFullscreen` e limpa o estado da classe `AppExpandir`), listener único de teclado + `contextmenu` (F12) + **listener de `click` em captura (`fecharMenusFora`)** + `Esc` fecha menus + **a seta ‹ (`[data-app-voltar]`) SEMPRE volta às Pastas (`mapaVoltarParaPastas`)**, `installMapaMental` (estado `mapaChipMenu`/`mapaMenuBarra` + exports da faixa de chips/Modelos/`garantirMapaSelecionado`/`fecharMenusFora`), isolamento do motor de notas

# Nome do Arquivo: mapa/mapa-cores.js
**Propósito:** Paleta de cores do mapa (F12) — MESMO padrão de lógica/visual dos botões de cor/destaque de Notas (`setupNotesColors`): grade 8x10 (80 cores), cores personalizadas (recentes máx. 12 + "+" + conta-gotas), reset, "Aplicar", popover preso ao `visualViewport`, `Esc`/clique fora e foco preso.
- **[Linhas 1-203 ~]** `// 🔄 [INÍCIO: MAPA - PALETA DE CORES (FASE 12)]` -> `GRADE` (80 cores), `LIMITE_RECENTES`, `abrir(botao, propriedade, contexto)` (toggle por propriedade), `montarExtras`, `posicionar`, `fechar` · `global.MapaMentalCores`

---

# Nome do Arquivo: sync/chaves.js
**Propósito:** Mapa **único** das chaves locais (`notas-pwa-*` e os rascunhos `notes-draft:*`) para o destino na nuvem — ou `entidade: null` = **fica só no aparelho**, com o motivo escrito. É a fonte de verdade da fila, do 1º login e do **teste-guarda** `sync_chaves.cjs`.
- **[Linhas 1-105 ~]** `// 💾 [INÍCIO: SYNC - MAPA DE CHAVES (local -> nuvem)]` -> `CHAVES{}` (19 chaves exatas: `notas-pwa-notes`→`notas`; `…-maps`→`mapas`; `…-mapa-pastas`→`pastas`; `…-templates`/`…-mapa-templates`→`modelos`; 9 chaves de ajuste→`configuracoes` com o NOME da chave; e as 4 locais com motivo: `…-content` (espelho), `…-sync-conta` (marca), `…-fila-sync` (fila), além dos prefixos) · `PREFIXOS[]` **na ordem**: `…-mapa-historico-` (local: Ctrl+Z é por aparelho), `…-mapa-` (`mapas-grafo`), `notes-draft:` (local) · `LITERAIS_IGNORADOS{}` (prefixos montados com `+ id`) · `destinoDaChave()` · `chavesConhecidas()` · `chavesSincronizadas()` · `global.NotasSyncChaves`

# Nome do Arquivo: sync/sync-cliente.js
**Propósito:** Cliente de sincronização (seções 5–6): **fila persistida** (`notas-pwa-fila-sync`, removida só no `ack`), `push`/`snapshot` por HTTP, aplicação local pelos **mesmos pontos de entrada do app** e a estratégia de cota **C** (o que não couber vira `somenteNuvem` e é baixado ao abrir).
- **[Linhas 1-82 ~]** `// 🔄 [INÍCIO: SYNC - CLIENTE (FILA + SNAPSHOT/PUSH)]` + `// 💾 [INÍCIO: SYNC - FILA DE PENDÊNCIAS (persistida)]` -> `syncLer`/`syncFilaLer`/`syncFilaGravar` · `syncAtivo()` · `syncEstado(estado, pendentes)` (espelho em `window.notasConta.sync` — o diálogo mostra) · `syncEnfileirar(entidade, acao, id, dados, baseRev)` (**grava antes de enviar**; sai cedo enquanto `syncPronto` é falso — antes do 1º snapshot a fila subiria um retrato incompleto, P98) · `syncAgendarDrenagem()` (debounce 700 ms)
- **[Linhas 84-175 ~]** `// 🔄 [INÍCIO: SYNC - ENVIO (push HTTP)]` -> `syncEmpurrar(ops)` (`POST /api/sync/push`, `credentials: 'same-origin'`, `X-CSRF`) · **`syncDrenar()`** (drena em ordem; sai da fila só com `ack`; no conflito decide por LWW e reenvia com o `base_rev` novo — máx. 2 voltas; 401 → `expirada`, rede → `offline`) · `syncConflitoLocalVence()`
- **[Linhas 177-451 ~]** `// 🔄 [INÍCIO: SYNC - RECEBIMENTO ...]` -> `syncSnapshot(desdeRev)` · `syncBaixarEntidade`/`syncBaixarNota` (nota `somenteNuvem`) · `notaLocal()` (nuvem→local) · **`syncAplicarEntidades()`** (marca `syncAplicando` para a aplicação NÃO voltar para a fila; re-renderiza chips/área do mapa) · `syncAplicarNotas` (marca `syncEstale` — o editor aberto ficou desatualizado; **só com o editor ABERTO**: fechado, LIMPA a flag, senão ela fica presa e nada mais sobe — P105) /`syncAplicarConfiguracoes` (guarda o **texto CRU** do ajuste) /`syncAplicarPastas`/`syncAplicarModelos`/`syncAplicarMapas` (índice + `notas-pwa-mapa-<id>`) · `syncAplicarItem(conflito)` · **`syncRefazerEditor()`** (só com a nota ABERTA: neutraliza a sessão e **reabre pelo caminho do app** — sem escrever `innerHTML` cru) · **`gravarNotasLocaisComCota()`** (tenta tudo; o que não couber vira `somenteNuvem`)
- **[Linhas 453-585 ~]** `// 🔄 [INÍCIO: SYNC - COLETA E 1º LOGIN ...]` -> `syncDadosDaNota`/`syncEnfileirarNota` · **`syncColetarOps()`** (varre pastas, índice de mapas + grafos, modelos (2 tipos) e ajustes — o mapa de chaves decide o que entra) · **`syncSubirTudo()`** (lotes de 60, progresso no diálogo) · **`syncAoEntrar()`** (snapshot → **1º login sobe tudo** com a marca `notas-pwa-sync-conta` → drena → liga `syncPronto`) · `syncAoSair()` (a fila é da conta; desliga `syncPronto`)
- **[Linhas 587-666 ~]** `// 🔄 [INÍCIO: SYNC - GANCHOS NO APP ...]` -> `p.apiCall` (a MESMA gravação também entra na fila — **exceto** com `syncAplicando`/`syncEstale`; a blindagem do **P98** ignora apenas o save **VAZIO** do documento velho, nunca a digitação), `p.openNotesModal` (baixa o texto da nota `somenteNuvem` antes de abrir; sem conexão avisa e abre; no fim o app já renderizou → `syncEstale = false`), `p.notasBackend` (driver local + `remoto`) · estado inicial `local` (**`installSync` roda como função simples: aqui `this` NÃO é a instância — usar `p` com `call`**)
- **[Linhas 676-1184 ~]** `// 🔄 [INÍCIO: SYNC - TEMPO REAL (WebSocket)]` (seção 8) -> `EMPURRAR_HTTP`/`SNAPSHOT_HTTP`/`AO_ENTRAR`/`AO_SAIR` (versões originais guardadas) · `p.syncWsAberto`/`syncWsUrl`/`syncWsEnviar`/`syncFecharSocket` · **`p.syncConectar`** (só com sessão; `hello {desde_rev}` no `onopen`; `close` **4401** → `expirada` e **sem** loop de reconexão) · **`p.syncAgendarReconexao`** (backoff 1 s → 30 s + jitter) · **`p.syncWsLigarHeartbeat`** (`ping` 25 s; sem `pong` em 50 s → fecha e reconecta) · **`p.syncReceberWs`** (`bemvindo` → `syncPronto` + dreno; `change` → aplicação; `ack`/`conflito`/`erro` fecham a op pendente pelo `id_local`; `pong`) · **`p.syncAplicarChangeWs`** (um `change` → `syncAplicarEntidades`, os MESMOS pontos de entrada do app, com re-render) · **`p.syncEmpurrarWs`** (resolve quando TODAS as ops do lote respondem; sem resposta em 8 s → **rejeita `status 0`** para o dreno preservar a fila) · **`p.syncEmpurrar`** = transporte (socket aberto → WS; senão `EMPURRAR_HTTP`) · wrappers `syncAoEntrar` (+`syncConectar`), `syncSnapshot` (guarda `rev_global`), `syncAoSair` (fecha o socket, sem reconectar) · **`p.syncLigarTempoReal`** (`online`/`visibilitychange` reconectam **e retomam a fila**; ligado UMA vez; **P98**: o boot é adiado para a INSTÂNCIA via `ligarTempoReal()`)

---

# Nome do Arquivo: backend/ (área) — API Python OPCIONAL (login + sync Supabase)
**Propósito:** Backend **opcional** em Python (FastAPI). O PWA continua **local-first**: sem login e com o backend desligado o comportamento é **idêntico** ao de hoje; só o Python fala com o Supabase (a chave `service_role` **nunca** chega ao front). **Blocos I–IV = seções 1–10** concluídos: fundação + Supabase real + login (I), conta + sync de dados (II), WebSocket/fila (III) e anexos + fechamento (IV).

## Implementação: Configuração e escolha do driver
- **[Linhas 1-171 ~]** `"""🗺️ COMPONENTE: Configuracao…"""` + `# 🔄 [INÍCIO: BACKEND - CONFIG]` -> `RAIZ` · `@dataclass Configuracao` (driver, **`porta` = `PORTA` do `.env` com fallback para o `PORT` dos PaaS (Render/Heroku/Fly)**/host, `supabase_*`, **`google_client_id`** (público — só o Client ID, sem `client_secret`), `sessao_*`/`csrf_header`/`seguro`, `origens_permitidas`, `rate_*`, **`anexo_limite_mb` = 25 e `anexo_cota_mb` = 900** — teto por arquivo e cota da conta, via `ANEXO_LIMITE_MB`/`ANEXO_COTA_MB`) · propriedades `tem_supabase` / **`google_ativo`** / `driver` (`auto` → `supabase` se houver credencial, senão `memory`) / `modo` / `avisos` · `montar()` · `obter_config()` (singleton) · `recarregar()`. Carrega `backend/.env` e (se existir) o `.env` da raiz com `override=False` — **sem** segredo no código.

## Implementação: Repositório (contrato único + driver memory)
- **[Linhas 1-283 ~]** `# 💾 [INÍCIO: BACKEND - REPOSITÓRIO]` -> `ENTIDADES` (`pastas`/`notas`/`mapas`/`configuracoes`/`modelos`/`ativos`/`ativos_anotacoes`) · `agora_iso()` · `normalizar_entidade()` · `class Repositorio` (contrato: `listar`/`obter`/`salvar`/`excluir`/`rev_global` + `salvar_perfil`) · `class RepositorioMemoria` (`_proximo_rev` = espelho do `proximo_rev` atômico, `salvar` com **conflito por `base_rev`** e `forcar`, `excluir` = soft delete, `limpar`) · `criar_repositorio(config)` (**um único `if`**: `supabase` × `memory`) · `repositorio()` (singleton do processo — usado por `auth.py`/scripts sem import circular) · `definir_repositorio()`

## Implementação: Cliente Supabase e driver PostgREST
- **[Linhas 1-136 ~]** `# 🔄 [INÍCIO: BACKEND - CLIENTE SUPABASE]` -> `ErroSupabase(status, detalhe, caminho)` · `class ClienteSupabase` (`base_url = {url}/rest/v1`, headers `apikey` + `Authorization: Bearer service_role`, `selecionar` com filtros PostgREST, `inserir_ou_atualizar` (`on_conflict` + `Prefer: merge-duplicates`), `atualizar` (PATCH), `proximo_rev` (RPC), `rev_global`, `apagar` (**DELETE só para manutenção**), `ping`) · `criar_cliente(config)`. Escolha: **httpx/PostgREST** em vez de `supabase-py` (menos acoplamento + testável com `httpx.MockTransport`) — mitiga o risco **R1**
- **[Linhas 1-176 ~]** `# 💾 [INÍCIO: BACKEND - REPOSITÓRIO SUPABASE]` -> `ESQUEMA` (entidade → tabela/pk/coluna de payload: `configuracoes.chave`+`valor`, `ativos_anotacoes.ativo_id`+`ranges`, o resto `id`+`dados`) · `class RepositorioSupabase` (mesmo contrato; `listar` filtra `user_id` + `deleted_at=is.null` + `rev=gt.N`, `salvar` faz conflito/LWW e upsert, `excluir` = PATCH de soft delete com tombstone se não existir, `salvar_perfil` = upsert em `profiles`, `ping`)

---

# Nome do Arquivo: backend/app/sync/ (regras.py + http.py)
**Propósito:** Sincronização (seção 5): **regras ÚNICAS** de aplicação de operação (`rev` do servidor, **LWW por `updated_at`**, soft delete) e as rotas `GET /api/sync/snapshot` / `POST /api/sync/push`. A seção 7 (WebSocket) reaproveita a MESMA `aplicar_op` — a decisão de conflito não existe em dois lugares.
- **[regras.py 1-165 ~]** `# ⚙️ [INÍCIO: BACKEND - SYNC (REGRAS)]` -> `ACOES`/`CAMPOS_DE_TEMPO` · `momento(valor)` (ISO→epoch) · `instante_do_cliente(dados)` (o mais novo entre `atualizada_em`/`updated_at`) · `_normalizar_op(op)` (entidade/ação/id válidos) · **`aplicar_op(repo, user_id, op)`** → `{"ack": …}` **só quando persiste** (o cliente só então solta a op da fila) ou `{"conflito": …}` com `motivo` `rev_mais_novo` / `apagado_no_servidor`; LWW = cliente vence quando declara instante MAIS NOVO (→ `forcar=True`) · `snapshot_do_usuario()` (carga inicial SEM tombstones; delta COM tombstones)
- **[http.py 1-92 ~]** `# 🔄 [INÍCIO: API - SYNC HTTP]` -> `Operacao`/`Lote` (Pydantic) · `GET /snapshot?desde_rev=` (`exigir_sessao`; devolve `rev_global`, `servidor_em` e as 7 entidades) · **`GET /entidade/{entidade}/{id}`** (uma entidade — usada pela nota `somenteNuvem`) · `POST /push` (`exigir_sessao` + **`exigir_csrf`**; aplica em ORDEM e devolve `{acks, conflitos, rev_global}` — op malformada vira `payload_invalido` **sem derrubar o lote**)

---

# Nome do Arquivo: backend/app/sync/ws.py
**Propósito:** Hub de sincronização em **TEMPO REAL** (seção 7): WebSocket `/ws` autenticado pela sessão em cookie, agrupando as conexões por `user_id`, com o protocolo `hello`/`bemvindo`/`op`/`ack`/`change`/`conflito`/`erro`/`ping`/`pong`. O `op` reusa a **MESMA `aplicar_op`** do push HTTP — a decisão de conflito não existe em dois lugares.
- **[Linhas 1-284 ~]** `# 🔄 [INÍCIO: API - SYNC WS]` -> `CODIGO_SEM_SESSAO = 4401` · `INTERVALO_VIGIA`/`LIMITE_SILENCIO`/`LIMITE_MENSAGEM` · **`class Hub`** (`registrar`/`remover`/`conexoes`/`difundir(user_id, autor, msg)` — `change` só para os OUTROS sockets, limpando os mortos; sem `asyncio.Lock` de propósito: o loop é mono-thread) · `obter_hub()`/`reiniciar_hub()`/`enviar()` · **`_origem_permitida`** (`Origin` ausente OK; explícito em `ORIGENS_PERMITIDAS`; ou **igual ao `Host` do pedido** — o caso normal da origem única) · `_mensagem_erro` · **`_hello`** (`bemvindo` com `rev_global` + um `change` por registro; `desde_rev > 0` inclui os tombstones) · **`_op`** (`user_id` declarado divergente → `erro.acesso_negado`; `aplicar_op` → `ack` **+** `change` lido de volta do repositório para os demais; op inválida → `erro.payload_invalido`) · **`_vigia`** (fecha o socket mudo com 1001) · **`_atender`** (loop de mensagens: `ping`→`pong`, `hello`, `op`, tipo desconhecido → `erro`; remove do hub no `finally`) · **`@router.websocket("/ws")` `ws_sync`** (`accept()` ANTES de fechar: sem isso o ASGI transforma um close precoce em HTTP 403 e o código 4401 se perde)

---

# Nome do Arquivo: backend/app/assets.py
**Propósito:** Anexos da nota na conta (seção 9): `/api/note-assets/*` + armazenamento (Supabase Storage com `service_role`, ou memória quando não há nuvem). Fecha a lacuna do P84 — o anexo deixa de ser um `data:` preso no aparelho e passa a abrir em qualquer dispositivo.
- **[Linhas 1-330 ~]** `# 🔄 [INÍCIO: API - ANEXOS]` -> `TIPOS_PERMITIDOS` (**allowlist de MIME**; `text/html`/`image/svg+xml`/XML são recusados — seriam XSS na própria origem) · `INLINE_SEGURO` (só imagem segura pode ser `inline`) · `CABECALHOS_SEGUROS` (`nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy`, cache privado) · `class Storage`/`StorageMemoria`/`StorageSupabase` + `criar_storage`/`obter_storage`/`definir_storage` (mesmo padrão da fábrica do repositório) · `ModeloTemplate`/`Anotacoes` (Pydantic) · `_sessao_do_pedido` (**sessão manda**; `?user_id=` divergente → 403; sem sessão → 401) · `_kind` (`image`/`pdf`/`sheet`/`word`/`text`/`arquivo`) · `_tamanho_usado` (cota) · **`POST /files`** (stream em pedaços com corte em `ANEXO_LIMITE_MB`, cota da conta, id `<user_id>/<id>` no bucket privado, linha em `ativos` pela MESMA `aplicar_op` do sync) · **`GET /files/{id}`** (binário com os cabeçalhos de segurança) · **`/info`** (NUNCA devolve `storage_path`) · **`/page`** (imagem/texto/CSV; PDF/Word devolvem `download=True` — sem dependência pesada) · **`/page-image`** · **`/annotations` GET/PUT** (`ranges` em `ativos_anotacoes`; PUT exige CSRF) · **`/templates` GET/POST** (modelos de nota na entidade `modelos`)

---

# Nome do Arquivo: backend/supabase/schema.sql
**Propósito:** Schema do Supabase (Postgres): 9 tabelas (profiles, contadores, pastas, notas, mapas, configuracoes, modelos, ativos, ativos_anotacoes), `proximo_rev(user_id)` **atômico**, índices, **RLS ligada** em todas e permissões. Idempotente (pode colar/rodar N vezes).
- **[Linhas 1-265 ~]** `-- 💾 [INÍCIO: BACKEND - SCHEMA SUPABASE]` -> `profiles`; `contadores` + `proximo_rev` (`security definer`, upsert atômico do `rev` — risco **R4**); `pastas`/`notas`/`mapas`/`modelos`/`ativos` com **UMA coluna jsonb de payload** (`dados`) e as colunas nomeadas (`nome`, `pasta_id`, `conteudo_html`, `grafo`, `tipo`, `mime`, `tamanho`, `storage_path`) como **colunas GERADAS** dela; `configuracoes` (`chave` + `valor jsonb`) e `ativos_anotacoes` (`ativo_id` + `ranges jsonb`); índices `(user_id, rev)` / `(user_id, updated_at desc)` / `(user_id, ordem)` / `(user_id, tipo)`; `enable row level security` + policy `user_id = auth.uid()` (profiles: `id = auth.uid()`); `grant` tabela por tabela para `authenticated`; conferência final (`select table_name …`)

---

# Nome do Arquivo: backend/app/google.py
**Propósito:** Validação do **ID token do Google** (login com Google). É a fronteira de confiança: o e-mail só é aceito depois de o JWT passar por assinatura RS256 (JWKS do Google, com cache), `iss`, `aud` (nosso Client ID) e `exp` — e de o próprio Google marcar `email_verified`.
- **[Linhas 1-163 ~]** `"""🗺️ COMPONENTE: Verificacao do ID token…"""` + `# 🚨 [INÍCIO: BACKEND - GOOGLE]` -> `JWKS_URL` (`https://www.googleapis.com/oauth2/v3/certs`) · `EMISSORES` (`accounts.google.com` nas duas formas) · `JANELA_CHAVES` (1 h) · mensagens (`MSG_TOKEN`/`MSG_EMAIL`/`MSG_INDISPONIVEL`) · `class ErroGoogle(status)` · `client_id()`/`configurado()` · **`class VerificadorGoogle`** (`_baixar` = GET do JWKS com cache + `httpx` (aceita `transport` → teste sem rede); `chave(kid)` recarrega uma vez se o Google rotacionar; `verificar(token, publico)` = `jwt.decode` RS256 com `audience`/`issuer`/`require`) · `obter_verificador()`/`definir_verificador()`/`reiniciar_verificador()` (singleton) · **`email_do_token(token, publico)`** (payload → e-mail em minúsculas; **403** se `email_verified` for falso)

---
**Propósito:** Segurança da sessão: cookie **assinado** (`py_session`, HMAC-SHA256 via stdlib), CSRF por token duplo e rate-limit de janela deslizante. **Nenhum token do Supabase vai para o JS.**
- **[Linhas 1-115 ~]** `# 🚨 [INÍCIO: BACKEND - SEGURANÇA]` (bloco dividido: fecha em **`[FIM: BACKEND - SEGURANÇA - PARTE 1]`**) -> `_b64`/`_desb64` · `@dataclass Sessao` (`user_id`/`email`/`csrf`/`criado_em` + `publico()`) · `class Assinador` (`emitir()` = `base64url(payload).hmac_sha256`, payload com `uid`/`email`/`csrf`/`iat`/`exp`; `ler()` valida assinatura com `hmac.compare_digest` e expiração) · `nova_sessao()` · `obter_assinador()` (singleton) · `reiniciar_assinador()`
- **[Linhas 115-221 ~]** `# 🚨 [INÍCIO: BACKEND - SEGURANÇA]` -> `definir_cookie()` (`HttpOnly`, `SameSite=Lax`, `Secure` quando `SESSAO_SEGURA`, `Path=/`, `max_age`) · `remover_cookie()` · `sessao_do_pedido()` · `exigir_sessao()` (**401**) · `exigir_csrf()` (**403**) · `class Limitador` (`permitir`/`liberar`/`zerar`) · `chave_limite(request, email)` = `IP|e-mail` · `obter_limitador()` / `reiniciar_limitador()`

# Nome do Arquivo: backend/app/identidade.py
**Propósito:** Provedor de identidade com **um contrato** (`registrar`/`autenticar`/`usuario`): o GoTrue real quando há Supabase, e um provedor em memória (PBKDF2) quando não há — é o que torna o login testável sem credencial.
- **[Linhas 1-128 ~]** `# 🚨 [INÍCIO: BACKEND - IDENTIDADE]` -> `ErroIdentidade(mensagem, status)` · `ITERACOES` (PBKDF2-SHA256, 120k) · `POR_PAGINA_USUARIOS`/`PAGINAS_USUARIOS` (varredura por e-mail no GoTrue) · `_hash_senha`/`_conferir_senha` · `class IdentidadeMemoria` (`registrar` devolve id novo; `autenticar` compara hash; **`google(email, nome)`** = reusa pelo e-mail ou cria com `senha: None` (a entrada é pelo Google — e o `autenticar` recusa `None` naturalmente); `usuario`; `limpar`) — bloco dividido: fecha em **`[FIM: BACKEND - IDENTIDADE - PARTE 1]`**
- **[Linhas 130-293 ~]** `# 🚨 [INÍCIO: BACKEND - IDENTIDADE]` -> `class IdentidadeGoTrue` (`base_url = {url}/auth/v1`; **cadastro pelo endpoint ADMIN** `/admin/users` com `email_confirm: true`; login em `/token?grant_type=password`; **`_usuario_por_email(email)`** = varredura paginada do admin API (o GoTrue não indexa por e-mail) e **`google(email, nome)`** = reusa o `user_id` quando o e-mail existe, senão cria com senha ALEATÓRIA — assim a conta de Google e a de senha são a MESMA (vínculo por e-mail verificado); `usuario()` em `/admin/users/{id}`; `remover()` só para limpeza do `verificar.py`; erros de rede → `ErroIdentidade(503)`; mensagens **genéricas** para não revelar se o e-mail existe) · `obter_identidade()` (singleton) · `definir_identidade()` / `reiniciar_identidade()`

# Nome do Arquivo: backend/app/auth.py
**Propósito:** Rotas `/api/auth`: `registrar` · `login` · **`config`** (público: `google_ativo` + Client ID) · **`google`** (login pelo ID token do Google) · `logout` · `me`. Erros **sempre** `{"detail": "mensagem"}`; cookie `HttpOnly`; CSRF nas escritas; rate-limit em login/registro/Google.
- **[Linhas 1-161 ~]** `# 🚨 [INÍCIO: BACKEND - AUTH]` -> `router = APIRouter(prefix="/api/auth")` · `Credenciais` (Pydantic com defaults, para **nunca** devolver 422 em lista) · **`CredencialGoogle`** (`credential` = o ID token) · `_validar()` (e-mail/senha; 400) · `_limitar()` (429) · `_abrir_sessao()` · `POST /registrar` (204 + cookie; mensagem genérica "Nao foi possivel criar a conta") · `POST /login` (**401 com a MESMA mensagem** para senha errada e e-mail inexistente; 503 se a identidade cair) · **`GET /config`** (`{google_ativo, google_client_id}` — sem segredo; é o que decide se o front renderiza o botão) · **`POST /google`** (503 se desligado; rate-limit por IP; `email_do_token` → `erro.status` (400/403/503); `obter_identidade().google(email)` (vínculo por e-mail) → `salvar_perfil` → `_abrir_sessao`; **sem** `X-CSRF` por ser pré-sessão, como `login`/`registrar`) · `POST /logout` (**idempotente**; exige CSRF quando há sessão) · `GET /me` (401 sem sessão; devolve `{id, email, criado_em, csrf}`)

# Nome do Arquivo: backend/app/main.py
**Propósito:** App FastAPI: `/health`, as rotas `/api/auth`, `/api/sync`, `/ws` e `/api/note-assets` e o **estático do PWA por allowlist** (o `backend/`, `docs/`, `tests/`, `node_modules/`, `.git/` e qualquer `.env` respondem **404**), com **CSP por hash** e cabeçalhos de segurança.
- **[Linhas 1-87 ~]** `# 🚨 [INÍCIO: BACKEND - SEGURANÇA (CABEÇALHOS)]` -> `_DIRETIVAS_CSP` (`default-src 'self'`, `connect-src 'self' ws: wss:`, `frame-src` = YouTube nocookie **+ `https://accounts.google.com`** (o botão do GIS é um iframe dele), `object-src 'none'`, `frame-ancestors 'none'`; `style-src 'unsafe-inline'` porque o app usa `style` inline) · `_hashes_inline` (`sha256-` de cada `<script>` **inline** — a CSP é cacheável: sem nonce) · `csp_do_html` (cacheado por arquivo; **`script-src` libera `https://accounts.google.com`** — só a origem exata do GIS) · `cabecalhos_de_seguranca` (CSP no HTML + `nosniff`/`Referrer-Policy`/`X-Frame-Options`/**`COOP = same-origin-allow-popups` — NUNCA `same-origin`, que isola o contexto e CORTA o `window.opener` do popup do GIS (P108)**/`Permissions-Policy` sempre; **HSTS só com `SESSAO_SEGURA=true`**)
- **[Linhas 90-140 ~]** `# 🔄 [INÍCIO: BACKEND - APP/ROTAS]` -> `app = FastAPI(...)` · handler de `RequestValidationError` (mantém `detail` como **string**) · `GET /health` (`{ok, driver, modo, supabase, host, porta, avisos}` — **`host`/`porta` tornam o deploy diagnosticável sem shell**: em PaaS a porta vem do `PORT` injetado) · `app.include_router(auth_router)` + `sync_router` + `ws_router` + `assets_router` (**antes** do estático — a ordem importa)
- **[Linhas 145-236 ~]** `(continuação) -> estático`: `TIPOS` (media types) · `ARQUIVOS_RAIZ` + `PASTAS_PWA` (`notes`/`mapa`/`sync`) = **allowlist** · `_normalizar`/`_permitido` (bloqueia `..` e tudo fora do PWA) · `servir()` (404 em JSON; **`cabecalhos_de_seguranca` em TODA resposta**; `sw.js` com `Cache-Control: no-store` + `Service-Worker-Allowed`; `.html` com `no-cache`) · `GET /` e `GET /{caminho:path}`
- **[Linhas 240-256 ~]** `# 🚀 [INÍCIO: BACKEND - BOOT (uvicorn)]` -> `main()` (imprime os avisos e sobe em `HOST:PORTA`) · `if __name__ == "__main__"`

---

# Nome do Arquivo: backend/scripts/migrar.py e backend/scripts/verificar.py
**Propósito:** Operação do backend: aplicar o schema (idempotente) e **checar tudo em um comando** — o "plug and play" de quando o `.env` chega.
- **[migrar.py 1-104 ~]** `# 💾 [INÍCIO: BACKEND - MIGRAR (SCHEMA)]` -> `SCHEMA` (caminho do `schema.sql`) · `TABELAS` (as 9) · `sql_do_schema()` · `aplicar_com_psycopg(dsn)` (quando há `SUPABASE_DB_URL`) · `conferir_via_rest(config)` (GET limitado por tabela **com `ordem=""`** — a tabela `profiles` não tem `rev`, e o `order=rev.asc` padrão faria o PostgREST devolver 400 e reportar a tabela BOA como ausente; sem depender de psycopg) · `instruir_manual()` (passo a passo do SQL Editor) · `main()` (1 = faltou tabela/credencial)
- **[verificar.py 1-238 ~]** `# 🚀 [INÍCIO: BACKEND - VERIFICAR]` -> `SEGREDOS`/`ASSETS_SERVIDOS` · `ok()`/`falha()` · `passo_config` (driver, `.env`, avisos) · `passo_estatico` (PWA serve; `/health` confirma o driver; `backend/.env`, `docs/`, `tests/` = 404; **varre os assets procurando chave/segredo**) · `passo_schema` (supabase) · `passo_dados` (CRUD + **prova de isolamento** + tombstone + limpeza via `apagar`) · `passo_login` (registrar → cookie `HttpOnly`/`Lax` → `me` → senha errada 401 → login → sem `X-CSRF` 403 → logout → `me` 401; remove a conta de verificação do Auth) · `main()` (código de saída 0/1)

# Nome do Arquivo: backend/tests/ (pytest, hermético)
**Propósito:** Testes do backend **sem rede, sem credencial e sem banco**: o `conftest.py` força `DRIVER=memory` e **zera** (`=""`, não `pop`) as variáveis do Supabase — como o `load_dotenv` usa `override=False`, isso impede que um `backend/.env` real no disco ligue a nuvem dentro da suíte; o Supabase é coberto por um **PostgREST emulado** (`httpx.MockTransport`).
- **[conftest.py 1-85 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/CONFTEST]` -> `DRIVER=memory` + `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_DB_URL`/**`GOOGLE_CLIENT_ID`** = `""` **antes** de importar o backend (hermeticidade preservada mesmo com `.env` real: sem Client ID a suíte não liga o Google por acidente); `RAIZ`/`AQUI` no `sys.path`; fixtures `config_memoria`, `repo` e **`repo_qualquer`** (roda o MESMO contrato nos dois drivers)
- **[apoio_supabase.py 1-113 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/APOIO_SUPABASE]` -> `class FakePostgrest` (filtros `eq.`/`gt.`/`is.null`, `order`, `limit`, upsert com `on_conflict`, PATCH, **DELETE só para limpeza**, RPC `proximo_rev` que **espelha `contadores`**) + `repo_falso()` → `(RepositorioSupabase, FakePostgrest)`
- **[test_health.py 1-91 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_HEALTH]` -> `/health` em `memory`; `/` serve o `index.html`; módulos do PWA com MIME certo; `sw.js` com `no-store` + `Service-Worker-Allowed`; **CSP por hash** (`sha256-`, `frame-ancestors 'none'`, `connect-src … ws: wss:`) + `nosniff`/`X-Frame-Options`/`Referrer-Policy` e **HSTS ausente** sem `SESSAO_SEGURA`; `_hashes_inline` acompanha o texto do script; **11 caminhos proibidos = 404** (`.env`, `backend/`, `docs/`, `tests/`, `node_modules/`, travessia de caminho)
- **[test_assets.py 1-180 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_ASSETS]` -> sessão obrigatória (401) e **CSRF** nas escritas (403); upload → `info` (sem `storage_path`) → download com **todos os `CABECALHOS_SEGUROS`** (`nosniff`, CSP sandbox, `inline` só para imagem); `text/csv` vira `attachment` e a `/page` devolve linhas; **allowlist de MIME** (HTML/SVG/XML → 415); **limite por arquivo** (413) e **cota da conta** (413); **isolamento** entre contas (`id` de A com a sessão de B → 404; `?user_id=` de A na sessão de B → **403**; o objeto vive em `<user_id>/<id>`); `?user_id=` igual à sessão funciona; **annotations** GET/PUT (+403 sem CSRF); `templates` GET/POST; e o Storage em memória como padrão
- **[test_repositorio.py 1-122 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_REPOSITORIO]` -> contrato no driver `memory`: rev do servidor, `criado_em` preservado, delta por `since_rev`, soft delete + tombstone, conflito por `base_rev`, `forcar`, isolamento entre contas, **cópia profunda** (não vaza o dict interno), as 7 entidades, fábrica `criar_repositorio`
- **[test_repositorio_supabase.py 1-183 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_REPOSITORIO_SUPABASE]` -> o MESMO contrato contra o PostgREST emulado + **asserções de URL/params** (`rest/v1/...`, `user_id=eq.`, `deleted_at=is.null`, `rev=gt.N`, `on_conflict=user_id,id`, PATCH no soft delete, **nenhum DELETE** pelo APP), `ErroSupabase` em 4xx, headers `apikey`/`Authorization`
- **[test_isolamento.py 1-43 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_ISOLAMENTO]` -> A nunca lê/escreve dado de B, inclusive reusando o **mesmo id** (nos DOIS drivers, via `repo_qualquer`)
- **[test_auth.py 1-248 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_AUTH]` -> fluxo completo; cookie `HttpOnly`/`SameSite=Lax`/`max-age`; **senha errada ≡ e-mail inexistente**; registro repetido genérico; validação; `detail` **string** em corpo inválido; rate-limit (5 → 429 e login certo libera); cookie adulterado/assinado com outro segredo = 401; **GoTrue com transporte emulado** (URLs/corpos, `/admin/users` com `email_confirm`, `grant_type=password`, 503 em falha de rede, nada revelando "already registered")
- **[test_google.py 1-252 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_GOOGLE]` -> login com Google **sem rede**: JWKS emulado (`httpx.MockTransport` + chave RSA gerada no teste); `GET /config` liga/desliga conforme o Client ID; token válido → 204 + cookie + `me`; **2º login = mesmo `user_id`** e **e-mail já existente por senha entra na MESMA conta** (vínculo por e-mail verificado); `email_verified:false` → **403**; `aud` errado/`exp` vencido/token lixo/assinatura de OUTRA chave → **400**; Google fora do ar → **503**; rota desligada → **503**; rate-limit por IP; unitários (`VerificadorGoogle.verificar`, `email_do_token`) e o GoTrue emulado (reusa por e-mail sem criar; cria com senha aleatória + `email_confirm`; rede → **503**)
- **[test_sync_http.py 1-171 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_SYNC_HTTP]` -> `/snapshot` e `/push` **exigem sessão**; `push` exige **`X-CSRF`** (403); ida-e-volta com `ack`/`rev`; `id_local` devolvido; delta por `desde_rev`; delete → **tombstone só no delta**; **LWW** (cliente mais novo vence / mais velho dá `rev_mais_novo` e não sobrescreve); **isolamento** entre contas (mesmo `id`); **op inválida não derruba o lote**; pastas/mapas/configuracoes/modelos (seção 6) pelo MESMO caminho
- **[test_sync_ws.py 1-230 ~]** `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_SYNC_WS]` -> `TestClient.websocket_connect`: **4401** sem sessão e com `Origin` fora da lista; `Origin` igual ao `Host` do pedido é aceito (origem única); `hello` → `bemvindo` (com `rev_global`/`usuario`) + delta (carga inicial SEM tombstones, delta COM); `op` → `ack` **com `id_local`** e `change` no **outro** socket, **sem eco** ao autor; `conflito` com `base_rev` velho; `erro.payload_invalido` (JSON quebrado, `op` sem id, tipo desconhecido) **sem derrubar a conexão**; `erro.acesso_negado` com `user_id` divergente da sessão; `ping`→`pong`; **isolamento** (o socket de outra conta não recebe nada); **vigia** fecha o socket mudo (1001, com constantes monkeypatchadas)

# Nome do Arquivo: backend/requirements.txt · backend/.env.example · backend/README.md
**Propósito:** Ambiente e operação. `requirements.txt` = FastAPI/Uvicorn/Pydantic/dotenv/httpx/**python-multipart** (obrigatório para o upload dos anexos) + **`PyJWT[crypto]`** (validação LOCAL do ID token do Google) + `supabase` e `psycopg[binary]` **opcionais** + pytest (resolvido no Python 3.14.5: FastAPI 0.141.1, pydantic 2.13.5 + pydantic-core 2.46.5, httpx 0.28.1, pytest 9.1.1, supabase 2.31.0, psycopg 3.3.6). `.env.example` = modelo **sem valores** (com `GOOGLE_CLIENT_ID`, `SUPABASE_DB_URL`, `ANEXO_LIMITE_MB=25` e `ANEXO_COTA_MB=900`). `README.md` = como subir, como ligar o Supabase e o Google (`npm run verificar:backend`) e como conferir que nenhuma chave vazou.
- **[requirements.txt 1-45 ~]** `(sem comentário de ancoragem)` -> runtime + **`PyJWT[crypto]`** + opcionais + dev (nota **R1**: se um wheel faltar, o driver cai no caminho httpx) · **[requirements.lock.txt ~]** `pip freeze` do ambiente validado (49 pacotes) para reprodução exata
- **[.env.example 1-59 ~]** `(sem comentário de ancoragem)` -> `SUPABASE_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY`/`BUCKET_ANEXOS`/`DB_URL` (**com a nota do IPv6-only/pooler e do percent-encode da senha**), **`GOOGLE_CLIENT_ID`** (só o Client ID — **não há `client_secret`** neste fluxo; vazio = botão do Google desligado), `SESSAO_*`, `ORIGENS_PERMITIDAS`, `HOST`/`PORTA`, `DRIVER`, `RATE_*`, `ANEXO_LIMITE_MB`/`ANEXO_COTA_MB` (a `ANON_KEY` é lida mas **não usada**: só a `SERVICE_ROLE_KEY` sai do backend)
- **[README.md 1-83 ~]** `(sem comentário de ancoragem)` -> estrutura, como rodar, como ligar o Supabase e a checagem de segredo

# Nome do Arquivo: docs/BACKEND-SYNC.md
**Propósito:** Guia de operação (seção 10): como subir o backend, ligar o Supabase, aplicar o `schema.sql` idempotente, o contrato HTTP/WebSocket resumido, o deploy de **origem única**, os cabeçalhos de segurança (CSP por hash), as regras dos anexos e o **checklist de diagnóstico** de "o sync travou".
- **[Arquivo inteiro ~]** `(sem comentário de ancoragem)` -> 6 seções: rodar · ligar o Supabase · contrato HTTP · contrato WS · deploy + cabeçalhos/anexos · diagnóstico

---

# Nome do Arquivo: tests/backend_python.cjs
**Propósito:** Ponte entre a suíte Node e o pytest. **Nunca quebra a suíte do PWA**: sai com `0` e diz o motivo quando não há `.venv`/`pytest`; com o ambiente pronto roda `pytest backend/tests -q` e propaga o código de saída.
- **[Arquivo inteiro ~]** `// 🧪 [INÍCIO: TESTE - BACKEND PYTHON]` -> `acharPython()` (`.venv\Scripts\python.exe`, `.venv/bin/python`, `PYTHON_BACKEND`) · `PULAR(motivo)` (exit 0 + dica de instalação) · checagem `import pytest, fastapi` · `python -m pytest backend/tests -q --no-header`

# Nome do Arquivo: package.json (scripts do backend)
**Propósito:** Atalhos do backend sem poluir a suíte do PWA.
- **[Linhas 6-17 ~]** `(sem comentário de ancoragem)` -> `dev:backend` (uvicorn `--reload` na porta 8000, servindo o PWA no mesmo origin) · `test:backend` (pytest) · `verificar:backend` (`python -m backend.scripts.verificar`)

---

- **[Linhas 954-1063 ~]** `// 🔄 [INÍCIO: SYNC - ANEXOS NA NUVEM (upload + migração do P84)]` (seção 9) -> wrappers `extraRequestOriginal`/`uploadOriginal`/`visualizadorOriginal` · **`p.notesExtraRequest`** (logado: a SESSÃO identifica o usuário — o `user_id` local não entra na URL; `X-CSRF` nas escritas; `/templates` continua LOCAL) · `p.syncUrlDoAnexo(id)` · **`p.notesUpload`** (logado: manda o arquivo para o Storage e guarda **só o id** no HTML; deslogado: `data:` URL de hoje) · **`p.notesFileViewer`** (anexo da conta: `<img>` para imagem e o visualizador NATIVO do navegador (`<iframe>`) para PDF/outros + download)
- **[Linhas 1065-1168 ~]** `// 🔄 [INÍCIO: SYNC - MIGRAÇÃO DOS ANEXOS ANTIGOS (1º login)]` -> **`p.syncSubirDataUrl`** (`data:` → `Blob` → upload; o nome vem da pista do app: `alt` da imagem ou texto do link `📎 nome`) · **`p.syncMigrarAnotacao`** (converte cada `data:` de UMA nota; o que falhar segue local — nada se perde) · **`p.syncMigrarAnexos`** (lê o **armazenamento** via `lerNotasLocais`, marca `sincronizando` e regrava com cota — P102) · wrapper `syncSubirTudo` (migra ANTES do envio em lote)

# Nome do Arquivo: tests/run-all.cjs
**Propósito:** Runner sequencial da suíte (com modo PARALELO). Executa cada `tests/*.cjs` (via `spawn` assíncrono), grava `docs/relatorio-testes.json` + `docs/RELATORIO-TESTES.md` e aceita `--filter=`, `--jobs=N`, `--estrito`, `--baseline`, `--retry=`, `--dir=`, `--prefixo=`, `--timeout=`. **A suíte completa termina SEM FALHAS**: as falhas **determinísticas** ficam isoladas em `FALHAS_CONHECIDAS` (viram `CONHEC`, não reprovam — P83); testes inaplicáveis ficam em `NAO_APLICAVEIS` (viram `n/a`). Com `--jobs=N>1` roda em paralelo e **reconfirma cada falha em série** (nunca gera falso positivo); qualquer falha fora da lista é `FALHA` e reprova (código 1); com `--estrito` as conhecidas também reprovam (auditoria).
- **[Linhas 1-62 ~]** `/**` + `Uso:` -> cabeçalho/doc de uso (`--jobs=auto` = metade dos núcleos), `NAO_APLICAVEIS` e **`FALHAS_CONHECIDAS`** (arquivo → motivo; as 8 divergências do motor vs. original, registradas no P83)
- **[Linhas 63-105 ~]** `(sem comentário de ancoragem)` -> argumentos (`--jobs`/`--jobs=auto`, `--estrito`, …), **`jobsArg`/`nucleos`/`jobs`** (P88: `auto` = `Math.floor(núcleos/2)`) e cabeçalho da rodada
- **[Linhas 113-133 ~]** `(sem comentário de ancoragem)` -> `executar(arquivo, argumentos)` **assíncrono** (`spawn` + Promise + timeout por SIGKILL)
- **[Linhas 135-199 ~]** `(sem comentário de ancoragem)` -> `argumentosDe`/`anunciar`, fila com N **trabalhadores** (`--jobs`) e `reconfirmarEmSerie` (falhas do paralelo)
- **[Linhas 201-276 ~]** `/** Contadores, resumo de console, relatórios e código de saída. */` -> `relatar()`: contadores (`passaram`/`falharam`/`conhecidas`/`resolvidas`/`flaky`), `RESULTADO: SEM FALHAS`, relatórios JSON/MD (marca `🔶 conhecida`) e código de saída (reprova só em falha real ou regressão do baseline)

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
- **[Arquivo inteiro ~]** `/* Abertura padrão da área de NOTAS — espelho da área de MAPAS` -> `tests/nota_abertura_padrao.cjs` (1ª nota da pasta já ativa/renderizada ao entrar; nota já aberta preservada; troca de pasta abre a 1ª da nova; nota de outra pasta é trocada; pasta vazia cria "Nova nota"; espelho de `garantirMapaSelecionado`)

## Implementação: Mapa Mental (por fase)
- **[Arquivo inteiro ~]** `/* FASE 0 - Fundação e isolamento da área "Mapa Mental".` -> `tests/mapa_area.cjs`
- **[Arquivo inteiro ~]** `/* FASE 1 (revisada) — Mapas como ITENS DA PASTA (fim da tela de gestão).` -> `tests/mapa_gestao.cjs` (criar pelo "+", abrir/renomear/duplicar/mover/excluir pelo chip, conexões, Modelos, referência quebrada, ausência da lista e volta às Pastas)
- **[Arquivo inteiro ~]** `/* Faixa de chips da área de MAPAS — espelho FIEL da faixa de chips de Notas.` -> `tests/mapa_chips.cjs` (mesmas classes/formatação, só os mapas da pasta ativa, menu do chip com as 4 ações, toque longo, "+" e botão Modelos com o ícone de Notas)
- **[Arquivo inteiro ~]** `/* Abertura padrão da área de MAPAS — espelho fiel das Notas` -> `tests/mapa_abertura_padrao.cjs` (1º mapa da pasta já selecionado/renderizado ao entrar; mapa já aberto preservado; troca de pasta abre o 1º da nova pasta; mapa de outra pasta é trocado; pasta vazia → "Nenhum mapa aberto."; restaura o último mapa ativo persistido)
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
- **[Arquivo inteiro ~]** `/* CLASSE ÚNICA do expandir/contrair (AppExpandir, em app.js) usada pelas DUAS áreas.` -> `tests/expandir.cjs` (Notas + Mapa: fecha/reabre o lado a lado, recolhe/mostra as barras UMA POR VEZ na ordem e na ORDEM INVERSA, preserva a barra já recolhida, `aria-pressed` e movimento reduzido)
- **[Arquivo inteiro ~]** `/* Seletor sutil de tema (claro/escuro) no header do PWA:` -> `tests/tema_switch.cjs`
- **[Arquivo inteiro ~]** `/* Conta OPCIONAL (login por e-mail/senha): botão "Entrar" + diálogo.` -> `tests/conta_login.cjs` (boot REAL com os arquivos do repo e `/api/auth/*` interceptada: sem backend o app sobe/edita e o erro é amigável; com backend: entrar, erro genérico inline, criar conta, sair **com `X-CSRF`**; `Esc`/clique fora fecham)
- **[Arquivo inteiro ~]** `/* Conta OPCIONAL — login com GOOGLE (Google Identity Services).` -> `tests/conta_google.cjs` (boot REAL; o script do GIS é **stubado** — nenhum Google real e nenhuma rede: **(A)** com `GET /config` dizendo `google_ativo`, o botão oficial aparece (`.conta-google` + divisor "ou") e o clique no `credential` abre a sessão; **(B)** sem backend (`/api/**` abortado) **nenhum** `<script data-conta-gis>` é injetado, **nenhum** botão aparece e nada quebra)
- **[Arquivo inteiro ~]** `/* INVARIANTE do projeto: SEM login e com o BACKEND DESLIGADO` -> `tests/modo_local_sem_backend.cjs` (boot REAL com `/api/**` ABORTADO: sobe e edita, salva no LocalStorage, **não** cria fila, **nenhum** socket aberto e o reload preserva o texto — prova o §0.5/R7; **e o login com Google não existe**: sem backend não há script do GIS nem botão no diálogo, enquanto o formulário de e-mail/senha segue)
- **[Arquivo inteiro ~]** `/* Guarda do escopo "TUDO" (decisão nº 5): toda chave notas-pwa-*` -> `tests/sync_chaves.cjs` (Node puro, sem navegador: carrega `sync/chaves.js` num `vm`, varre os literais `notas-pwa-*` do código e **FALHA** se aparecer chave sem destino ou destino fantasma; confere as decisões "só no aparelho")
- **[Arquivo inteiro ~]** `/* Sincronização de NOTAS por HTTP (seção 5), contra o backend REAL:` -> `tests/sync_snapshot.cjs` (sobe `uvicorn` com `DRIVER=memory`: offline não cria fila · 1º login sobe tudo · edição → fila → `ack` → nuvem · 2º aparelho vê · sair limpa a fila) — **P98 RESOLVIDO**: o sync rodava no PROTÓTIPO; agora o boot (`conta.js`/`sync-cliente.js`) mira a INSTÂNCIA `window.notesApp`, então memória × `localStorage` × nuvem convergem (saiu de `FALHAS_CONHECIDAS`)
- **[Arquivo inteiro ~]** `/* Escopo "TUDO" (decisão nº 5) + 1º login silencioso` -> `tests/sync_completo.cjs` (pastas, mapa **com grafo**, modelos e ajustes sobem no 1º login; o 2º aparelho recebe o tema **cru** e o grafo; histórico/rascunho/fila NÃO entram na coleta)
- **[Arquivo inteiro ~]** `/* Sincronização em TEMPO REAL por WebSocket (seções 7–8), contra o backend REAL:` -> `tests/sync_websocket.cjs` (backend `uvicorn` com `DRIVER=memory` **vivo o teste inteiro**: dois aparelhos da mesma conta com o socket aberto; editar na 1ª aparece no **editor** da 2ª **sem recarregar**; `setOffline` → fila + `Offline — N na fila`; voltar a rede → drena pelo socket e os dois convergem; **deslogado nenhum socket**)
- **[Arquivo inteiro ~]** `/* Anexos na CONTA (seção 9), contra o backend REAL (Supabase Storage = StorageMemoria):` -> `tests/notes_anexos_nuvem.cjs` (**A**) deslogado o anexo vira `data:` local e não cria fila; (**B**) no 1º login a **migração** troca o `data:` pelo id (nome preservado, `storage_path` nunca devolvido); (**C**) upload novo → `/info` + download com `attachment`/`nosniff` e os 2 anexos na conta; (**D**) `notesFileViewer` abre o anexo da conta)
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

