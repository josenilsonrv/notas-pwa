// ============================================
// NOTAS PWA - Aplicação Principal (100% no dispositivo)
// Reaproveita o mesmo motor de notas do sistema
// (editor.js + extras.js + tables.js), sem backend.
// ============================================

/**
 * Gerenciador de Tema
 */
class ThemeManager {
    static STORAGE_KEY = 'notas-pwa-theme';

    constructor() {
        this.root = document.documentElement;
        this.toggle = document.getElementById('themeToggle');
        this.systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
        this.hasManualPreference = this.getStoredTheme() !== null;
        this.applyTheme(this.getStoredTheme() || this.getSystemTheme(), false);
        this.bindEvents();
    }

    getStoredTheme() {
        try {
            const theme = localStorage.getItem(ThemeManager.STORAGE_KEY);
            return ['light', 'dark'].includes(theme) ? theme : null;
        } catch (_) {
            return null;
        }
    }

    getSystemTheme() {
        return this.systemPreference.matches ? 'dark' : 'light';
    }

    bindEvents() {
        this.toggle?.addEventListener('click', () => {
            const nextTheme = this.root.dataset.theme === 'dark' ? 'light' : 'dark';
            this.hasManualPreference = true;
            try { localStorage.setItem(ThemeManager.STORAGE_KEY, nextTheme); } catch (_) { /* persiste quando disponível */ }
            this.applyTheme(nextTheme);
        });

        // A preferência do SO só prevalece enquanto o utilizador não escolher manualmente.
        this.systemPreference.addEventListener?.('change', event => {
            if (!this.hasManualPreference) this.applyTheme(event.matches ? 'dark' : 'light');
        });
    }

    applyTheme(theme, animate = true) {
        if (animate) {
            this.root.classList.add('theme-transitioning');
            clearTimeout(this.transitionTimer);
            this.transitionTimer = setTimeout(() => this.root.classList.remove('theme-transitioning'), 400);
        }

        this.root.dataset.theme = theme;
        const isDark = theme === 'dark';
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#000000' : '#F5F5F7');
        if (this.toggle) {
            this.toggle.setAttribute('aria-checked', String(isDark));
            this.toggle.setAttribute('title', isDark ? 'Tema escuro ativo — toque para o claro' : 'Tema claro ativo — toque para o escuro');
        }
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    }
}

/**
 * Aplicação Principal de Notas (standalone, tudo no dispositivo).
 * O editor, as ferramentas extras e as tabelas são instalados no
 * protótipo desta classe, exatamente como o sistema faz com NeuralCommandApp.
 */
class NotesPWA {
    constructor() {
        this.userId = 'local';
        this.notesHistory = [];
        this.notesHistoryIndex = -1;
        this.isRestoringNotesHistory = false;
        this.notesDocument = null;
        this.notesSelectionRange = null;
        this.notesActiveItem = null;
        this.notesEditingReady = false;
        this.notesSaveTimer = null;
        this.notesSession = null;
        this.notesRecovering = false;
        this.notesDraftTimer = null;
        this.notesContent = '';
        this.projectsData = [];
        this.focusStagesData = [];
        this.currentNotesProjectId = null;
        this.currentNotesStageId = null;
        this.notesChipMenu = null;
        this.notesToolbarConfigurada = false;
        this.notesToolbarObserver = null;
        this.notesToolbarTecladoAtivo = false;
        this.notesToolbarTecladoPoll = null;
        this.notesToolbarTecladoTimeouts = [];
        this.notesToolbarTecladoAplicado = null;
        this.notesViewportBase = 0;
        this.ordemToolbarOriginal = null;
        this.notesToolbarEditorRedraw = null;

        this.themeManager = new ThemeManager();
        this.init();
    }

    init() {
        this.installNotesFeatures();
        // 🔄 [INÍCIO: ESTADO - MIGRAÇÃO/ABERTURA DA ÚLTIMA NOTA]
        // `lerNotasLocais` migra a nota única antiga ('notas-pwa-content') para a
        // lista 'notas-pwa-notes' na primeira execução, sem perder o conteúdo.
        this.projectsData = this.lerNotasLocais();
        this.notesContent = this.loadContentFromStorage();
        this.setupEventListeners();
        this.setupResize();
        this.salvarNotasLocais();
        const ativa = this.lerNotaAtiva();
        this.openNotesModal(ativa || this.projectsData[0]?.id);
        // ⚡ [INÍCIO: PWA - BARRA DE FERRAMENTAS INLINE/EDIÇÃO + TECLADO]
        // Só no boot real (`init`): os harnesses de teste/paridade não chamam init,
        // então o comportamento do motor de notas permanece o mesmo para eles.
        this.configurarToolbarPWA();
        this.ativarToolbarTeclado();
        // ⚡ [FIM: PWA - BARRA DE FERRAMENTAS INLINE/EDIÇÃO + TECLADO]
        // 🔄 [FIM: ESTADO - MIGRAÇÃO/ABERTURA DA ÚLTIMA NOTA]
    }

    /** Instala o mesmo motor de notas do sistema sobre este protótipo. */
    installNotesFeatures() {
        installNotesEditor(NotesPWA);
        if (typeof installNotesExtras === 'function') installNotesExtras(NotesPWA);
        if (typeof installNotesTables === 'function') installNotesTables(NotesPWA);
        installLocalNotesStorage(NotesPWA);
    }

    // 🔄 [INÍCIO: ESTADO - PERSISTÊNCIA LOCAL (SEM BACKEND)]
    loadContentFromStorage() {
        try {
            return localStorage.getItem('notas-pwa-content') || '';
        } catch (error) {
            console.error('Erro ao carregar notas do LocalStorage:', error);
            return '';
        }
    }

    saveContentToStorage(html) {
        try {
            localStorage.setItem('notas-pwa-content', html);
            this.notesContent = html;
            return true;
        } catch (error) {
            console.error('Erro ao salvar notas no LocalStorage:', error);
            this.notesStatus('Falha ao salvar — tentar novamente', true);
            return false;
        }
    }

    // 🔄 [INÍCIO: ESTADO - MÚLTIPLAS NOTAS LOCAIS]
    /**
     * Lê a lista de notas do dispositivo. Na primeira execução (ou quando a lista
     * ainda não existe), migra a nota única antiga de 'notas-pwa-content' para
     * uma nota `id: 'local'` — assim quem já usava o app não perde nada.
     */
    lerNotasLocais() {
        try {
            const bruto = localStorage.getItem('notas-pwa-notes');
            if (bruto) {
                const lista = JSON.parse(bruto);
                if (Array.isArray(lista) && lista.length) return lista;
            }
        } catch (error) {
            console.error('Erro ao ler as notas locais:', error);
        }
        return [{ id: 'local', nome: 'Minhas notas', notas: this.loadContentFromStorage() }];
    }

    /** Grava a lista de notas e o id da nota ativa no dispositivo. */
    gravarNotasLocais(lista) {
        try {
            localStorage.setItem('notas-pwa-notes', JSON.stringify(lista));
            if (this.currentNotesProjectId) {
                localStorage.setItem('notas-pwa-nota-ativa', String(this.currentNotesProjectId));
            }
        } catch (error) {
            console.error('Erro ao salvar as notas locais:', error);
        }
        this.projectsData = lista;
    }

    salvarNotasLocais() {
        this.gravarNotasLocais(this.projectsData || []);
    }

    lerNotaAtiva() {
        try { return localStorage.getItem('notas-pwa-nota-ativa') || ''; } catch (_) { return ''; }
    }
    // 🔄 [FIM: ESTADO - MÚLTIPLAS NOTAS LOCAIS]

    /** Substitui o cliente HTTP do sistema: qualquer gravação fica no dispositivo. */
    async apiCall(endpoint, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        if (method !== 'GET' && options.body) {
            try {
                const payload = JSON.parse(options.body);
                if (typeof payload.notas === 'string') {
                    this.saveContentToStorage(payload.notas); // espelho (compatibilidade)
                    const lista = this.lerNotasLocais();
                    const nota = lista.find(item => item.id === this.currentNotesProjectId) || lista[0];
                    if (nota) {
                        nota.notas = payload.notas;
                        nota.atualizadaEm = new Date().toISOString();
                        this.gravarNotasLocais(lista);
                    }
                }
            } catch (_) { /* corpo não-JSON é ignorado */ }
        }
        return {};
    }

    persistNow() {
        const html = this.getCleanNotesHtml();
        if (html !== this.notesContent) this.saveContentToStorage(html);
    }
    // 🔄 [FIM: ESTADO - PERSISTÊNCIA LOCAL (SEM BACKEND)]

    // ⚡ [INÍCIO: INTERAÇÃO/JS - ABRIR NOTAS]
    /** Abre a nota local. O motor do editor chama esta versão original
     *  e, em seguida, inicia a sessão de notas (beginNotesSession). */
    openNotesModal(id) {
        const project = (this.projectsData || []).find(item => item.id === id) || this.projectsData[0];
        if (!project) return;
        this.currentNotesProjectId = project.id;
        this.currentNotesStageId = null;
        this.notesContent = project.notas || '';

        const title = document.getElementById('notesModalTitle');
        if (title) title.textContent = project.nome || 'Notas';

        const editor = document.getElementById('notesEditor');
        editor.innerHTML = project.notas || '<div class="notes-line" data-level="0"><div class="notes-line-text"><br></div></div>';
        this.resetNotesHistory();
        this.refreshNotesCollapseControls();

        // Largura do modal: o motor usa var(--notes-width, 50vw) e calcula a largura
        // a partir de notesSavedWidth (undefined na abertura, como no original).
        document.getElementById('notesModalBackdrop')?.classList.add('active');

        this.renderNotesNav();
        this.salvarNotasLocais();

        setTimeout(() => this.placeNotesCursorAtEnd(editor), 100);
    }

    openStageNotesModal(stageId) {
        return this.openNotesModal(this.currentNotesProjectId);
    }

    // ⚡ [INÍCIO: INTERAÇÃO/JS - MÚLTIPLAS NOTAS (CHIPS + BOTÃO "+")]
    /**
     * Renderiza os chips das notas no `#notesContextNav` + o botão "+".
     * Cada chip recebe `--notes-accent` lido do conteúdo da sua nota, então
     * cada nota (e cada chip) segue a sua própria cor padrão — como no original.
     */
    renderNotesNav() {
        const nav = document.getElementById('notesContextNav');
        if (!nav) return;
        const ativa = this.currentNotesProjectId;
        nav.replaceChildren();

        for (const nota of this.projectsData || []) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'notes-context-chip' + (nota.id === ativa ? ' is-active' : '');
            chip.dataset.noteId = String(nota.id);
            chip.textContent = nota.nome || 'Nota';
            chip.title = 'Abrir esta nota (duplo clique renomeia)';
            chip.setAttribute('aria-label', 'Abrir nota ' + (nota.nome || 'Nota'));
            chip.style.setProperty('--notes-accent', this.accentDaNota(nota) || '#0071e3');
            chip.addEventListener('click', () => {
                if (chip.dataset.menuAberto === 'true') { delete chip.dataset.menuAberto; return; }
                if (nota.id !== ativa) this.openNotesModal(nota.id);
            });
            chip.addEventListener('dblclick', () => this.renomearNota(nota.id));
            chip.addEventListener('contextmenu', event => {
                event.preventDefault();
                this.abrirMenuNota(nota, chip);
            });
            this.setupChipLongPress(chip, nota);
            nav.append(chip);
        }

        const mais = document.createElement('button');
        mais.type = 'button';
        mais.className = 'notes-context-chip notes-context-chip-add';
        mais.textContent = '+';
        mais.title = 'Nova nota';
        mais.setAttribute('aria-label', 'Criar nova nota');
        mais.addEventListener('click', () => this.criarNota());
        nav.append(mais);
    }

    /** Lê a cor padrão (accent) direto do HTML da nota, como o original faz. */
    accentDaNota(nota) {
        const template = document.createElement('template');
        template.innerHTML = nota?.notas || '';
        return template.content.querySelector('[data-note-accent]')?.dataset.noteAccent || '';
    }

    /** Cria uma nota nova em branco e abre em seguida (o motor salva a anterior). */
    criarNota() {
        this.persistNow();
        const nota = this.criarNotaLocal();
        this.projectsData = this.projectsData || [];
        this.projectsData.push(nota);
        this.salvarNotasLocais();
        return this.openNotesModal(nota.id);
    }

    criarNotaLocal(nome = 'Nova nota') {
        const id = 'nota-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const agora = new Date().toISOString();
        return { id, nome, notas: '', criadaEm: agora, atualizadaEm: agora };
    }

    /** Renomeia a nota (duplo clique no chip ou opção do menu). */
    renomearNota(id) {
        const nota = (this.projectsData || []).find(item => item.id === id);
        if (!nota) return;
        let nome = null;
        try { nome = window.prompt('Nome da nota', nota.nome || 'Nota'); } catch (_) { nome = null; }
        if (nome === null) return;
        nome = String(nome).trim().slice(0, 60);
        if (!nome || nome === nota.nome) return;
        nota.nome = nome;
        this.salvarNotasLocais();
        if (id === this.currentNotesProjectId) {
            const title = document.getElementById('notesModalTitle');
            if (title) title.textContent = nome;
        }
        this.renderNotesNav();
    }

    /** Exclui a nota, sempre com confirmação; se for a última, cria uma vazia. */
    async excluirNota(id) {
        const lista = this.projectsData || [];
        const nota = lista.find(item => item.id === id);
        if (!nota) return;
        let confirmado = false;
        try { confirmado = window.confirm('Excluir a nota "' + (nota.nome || 'Nota') + '"?'); } catch (_) { confirmado = false; }
        if (!confirmado) return;

        const indice = lista.indexOf(nota);
        lista.splice(indice, 1);
        if (!lista.length) lista.push(this.criarNotaLocal());

        if (id === this.currentNotesProjectId) {
            // Descarta a sessão atual antes de trocar: sem isso o motor salvaria
            // a nota excluída por cima de outra (closeNotesModal -> saveNotes).
            this.notesSession = null;
            clearTimeout(this.notesSaveTimer);
            this.salvarNotasLocais();
            const proxima = lista[Math.min(indice, lista.length - 1)];
            await this.openNotesModal(proxima.id);
        } else {
            this.salvarNotasLocais();
            this.renderNotesNav();
        }
    }

    /** Pequeno menu de ações da nota (renomear/excluir), aberto pelo chip. */
    abrirMenuNota(nota, chip) {
        this.fecharMenuNota();
        const menu = document.createElement('div');
        menu.id = 'notesChipMenu';
        menu.className = 'notes-chip-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Ações da nota');
        const acoes = [
            ['Renomear', () => this.renomearNota(nota.id)],
            ['Excluir', () => this.excluirNota(nota.id)]
        ];
        for (const [texto, acao] of acoes) {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.setAttribute('role', 'menuitem');
            botao.textContent = texto;
            botao.addEventListener('click', () => { this.fecharMenuNota(); acao(); });
            menu.append(botao);
        }
        document.body.append(menu);
        const caixa = chip.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(caixa.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
        menu.style.top = Math.min(caixa.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + 'px';
        menu.querySelector('button')?.focus();
        this.notesChipMenu = menu;
    }

    fecharMenuNota() {
        this.notesChipMenu?.remove();
        this.notesChipMenu = null;
    }

    /** Toque longo no chip (celular) abre o menu, sem abrir a nota. */
    setupChipLongPress(chip, nota) {
        let timer = null;
        const cancelar = () => { clearTimeout(timer); timer = null; };
        chip.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse') return;
            cancelar();
            timer = setTimeout(() => {
                timer = null;
                chip.dataset.menuAberto = 'true';
                this.abrirMenuNota(nota, chip);
            }, 550);
        });
        ['pointerup', 'pointerleave', 'pointercancel', 'click'].forEach(tipo => chip.addEventListener(tipo, cancelar));
    }
    // ⚡ [FIM: INTERAÇÃO/JS - MÚLTIPLAS NOTAS (CHIPS + BOTÃO "+")]

    // Placeholders chamados pelo motor antes de serem substituídos pelo install.
    closeNotesModal() { return true; }
    setupModalListeners() { this.setupNotesEditing(); }
    toggleNotesFullscreen() { return true; }

    /**
     * Recolhe/expande o cabecalho do modal (header + toolbar + nav).
     * Replica o metodo do app original (frontend/app.js, toggleNotesHeaderCollapse).
     * O setNotesHeaderCollapsed vem do motor de notas (notes/editor.js).
     */
    toggleNotesHeaderCollapse() {
        const backdrop = document.getElementById('notesModalBackdrop');
        if (!backdrop?.classList.contains('active')) return;
        this.setNotesHeaderCollapsed(!backdrop.classList.contains('notes-header-collapsed'));
    }
    // ⚡ [FIM: INTERAÇÃO/JS - ABRIR NOTAS]

    placeNotesCursorAtEnd(editor) {
        if (!editor) return;
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        this.rememberNotesSelection();
        this.updateNotesToolbarState();
    }

    /**
     * Permite digitar em TODO o campo abaixo da barra de ferramentas, não apenas
     * sobre as linhas existentes.
     *
     * O editor cobre a área inteira, mas uma linha vazia é comprimida para 8px
     * (notes/editor.css), então o toque/clique numa área vazia não posiciona o
     * cursor — e no celular/Safari o teclado nem abre. Aqui a linha mais próxima
     * do ponto tocado recebe o cursor, o que deixa qualquer ponto do campo
     * digitável e previsível.
     */
    focusNotesEditorFromEmptyArea(event) {
        const editor = document.getElementById('notesEditor');
        if (!editor) return;
        event?.preventDefault();
        const lines = [...editor.children].filter(element => element.classList.contains('notes-line'));
        let target = lines.at(-1);
        if (Number.isFinite(event?.clientY) && lines.length) {
            target = lines.reduce((proxima, linha) => {
                const distancia = Math.abs(linha.getBoundingClientRect().top - event.clientY);
                return distancia < proxima.distancia ? { linha, distancia } : proxima;
            }, { linha: lines[0], distancia: Infinity }).linha;
        }
        const box = target?.querySelector('.notes-line-text') || editor;
        const range = document.createRange();
        range.selectNodeContents(box);
        range.collapse(false);
        editor.focus();
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        this.rememberNotesSelection();
        this.updateNotesToolbarState();
    }

    // ⚡ [INÍCIO: INTERAÇÃO/JS - SELEÇÃO DE NOTAS]
    /** Necessário para os comandos de formatação, cores e inserções. */
    rememberNotesSelection() {
        const editor = document.getElementById('notesEditor');
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (editor.contains(range.commonAncestorContainer)) {
            this.notesSelectionRange = range.cloneRange();
            const node = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : range.startContainer;
            this.notesActiveItem = node?.closest?.('li, .checklist-item') || null;
        }
    }

    updateNotesHistoryButtons() {
        const undoButton = document.querySelector('#notesToolbar [data-command="undo"]');
        const redoButton = document.querySelector('#notesToolbar [data-command="redo"]');
        if (undoButton) undoButton.disabled = this.notesHistoryIndex <= 0;
        if (redoButton) redoButton.disabled = this.notesHistoryIndex >= this.notesHistory.length - 1;
    }
    // ⚡ [FIM: INTERAÇÃO/JS - SELEÇÃO DE NOTAS]

    // ⚡ [INÍCIO: INTERAÇÃO/JS - AVISOS]
    showToast(message, type = 'success') {
        const region = document.getElementById('appToastRegion');
        if (!region) return;
        const toast = document.createElement('div');
        toast.className = 'app-toast' + (type === 'error' ? ' is-error' : '');
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.textContent = message;
        region.appendChild(toast);
        window.setTimeout(() => toast.remove(), 4200);
    }

    updateSaveStatus(text, isError = false) {
        const status = document.getElementById('notesSaveStatus');
        if (!status) return;
        status.textContent = text;
        status.disabled = !isError;
        status.classList.toggle('is-error', isError);
    }
    // ⚡ [FIM: INTERAÇÃO/JS - AVISOS]

    setupEventListeners() {
        // Comandos da toolbar (undo/redo, headings, listas, cores, etc.)
        document.querySelectorAll('#notesToolbar [data-command]').forEach(button => {
            button.addEventListener('click', () => this.executeNotesCommand(button.dataset.command));
        });

        document.getElementById('notesFullscreenBtn')?.addEventListener('click', () => this.toggleNotesFullscreen());
        document.getElementById('notesHeaderCollapseBtn')?.addEventListener('click', () => this.toggleNotesHeaderCollapse());
        document.getElementById('notesModalClose')?.addEventListener('click', () => this.closeNotesModal());

        // Atalhos do editor: mesma ligacao do app original (frontend/app.js, "notesEditor.addEventListener('keydown', ...)").
        // Sem esta linha os atalhos (Ctrl+Alt+1..0, Alt+setas, Tab/Shift+Tab, Ctrl+B/I/S/Z/Y) nao funcionam.
        document.getElementById('notesEditor')?.addEventListener('keydown', event => this.handleNotesEditorShortcut(event));

        // Mantém a seleção ao acionar botões da toolbar.
        document.getElementById('notesToolbar')?.addEventListener('pointerdown', event => {
            if (event.target.closest('.toolbar-btn')) this.rememberNotesSelection();
        });

        // Tocar/clicar na área vazia do container deve focar o editor e posicionar
        // o cursor no fim da nota (essencial no celular, onde a linha vazia tem 8px).
        document.getElementById('notesEditorContainer')?.addEventListener('pointerdown', event => {
            if (event.target.closest('.notes-line, button, a, input, select, textarea, figure, table, img')) return;
            this.focusNotesEditorFromEmptyArea(event);
        });

        // Fecha o menu de ações do chip ao toque/clique fora dele.
        document.addEventListener('pointerdown', event => {
            if (this.notesChipMenu && !event.target.closest('#notesChipMenu')) this.fecharMenuNota();
        });

        // Garante a gravação ao sair.
        window.addEventListener('beforeunload', () => this.persistNow());
    }

    setupResize() {
        window.addEventListener('resize', () => this.refreshNotesCollapseControls());
    }

    // ⚡ [INÍCIO: PWA - BARRA DE FERRAMENTAS INLINE, ORDEM E TECLADO]
    /** Chaves estáveis dos botões da toolbar (o motor reordena "items" no resize). */
    filhosToolbar() {
        const toolbar = document.getElementById('notesToolbar');
        if (!toolbar) return [];
        const gaveta = toolbar.querySelector('.notes-toolbar-overflow');
        return [...toolbar.children, ...(gaveta ? [...gaveta.children] : [])]
            .filter(el => !el.classList.contains('notes-toolbar-more')
                && !el.classList.contains('notes-toolbar-overflow')
                && el.dataset.pwa !== 'editar-toolbar');
    }

    chavesToolbar() {
        const mapa = new Map();
        let separador = 0;
        for (const el of this.filhosToolbar()) {
            if (el.dataset.command) mapa.set(el, 'cmd:' + el.dataset.command);
            else if (el.dataset.notesColor) mapa.set(el, 'color:' + el.dataset.notesColor);
            else if (el.dataset.extra) mapa.set(el, 'extra:' + el.dataset.extra);
            else if (el.dataset.pwa) mapa.set(el, 'pwa:' + el.dataset.pwa);
            else if (el.id) mapa.set(el, 'id:' + el.id);
            else mapa.set(el, 'sep:' + (separador++));
        }
        return mapa;
    }

    lerOrdemToolbar() {
        try {
            const lista = JSON.parse(localStorage.getItem('notas-pwa-toolbar-order') || '[]');
            return Array.isArray(lista) ? lista.filter(item => typeof item === 'string') : [];
        } catch (_) { return []; }
    }

    salvarOrdemToolbar(ordem) {
        try { localStorage.setItem('notas-pwa-toolbar-order', JSON.stringify(ordem)); } catch (_) { /* storage opcional */ }
    }

    /**
     * Aplica a ordem (salva ou explícita) e traz todos os botões de volta para a
     * barra, escondendo o menu "…"/gaveta do motor. É idempotente: só mexe no DOM
     * quando algo está fora do lugar (evita loop com o ResizeObserver do motor).
     */
    aplicarOrdemToolbar(ordem = null) {
        const toolbar = document.getElementById('notesToolbar');
        if (!toolbar) return;
        const mais = toolbar.querySelector('.notes-toolbar-more');
        const gaveta = toolbar.querySelector('.notes-toolbar-overflow');
        const lista = ordem || this.lerOrdemToolbar();
        const mapa = this.chavesToolbar();
        const itens = [...mapa.keys()];
        const posicao = new Map();
        lista.forEach((chave, indice) => { if (!posicao.has(chave)) posicao.set(chave, indice); });
        itens.sort((a, b) => {
            const pa = posicao.has(mapa.get(a)) ? posicao.get(mapa.get(a)) : Number.MAX_SAFE_INTEGER;
            const pb = posicao.has(mapa.get(b)) ? posicao.get(mapa.get(b)) : Number.MAX_SAFE_INTEGER;
            return pa - pb;
        });
        const referencia = mais || gaveta || null;
        const editar = toolbar.querySelector('[data-pwa="editar-toolbar"]');
        const atuais = [...toolbar.children].filter(el => el !== mais && el !== gaveta && el !== editar);
        const jaEsta = atuais.length === itens.length
            && atuais.every((el, indice) => el === itens[indice])
            && (!gaveta || !gaveta.children.length);
        if (!jaEsta) itens.forEach(el => toolbar.insertBefore(el, referencia));
        if (editar && toolbar.lastElementChild !== editar) toolbar.append(editar);
        if (mais && !mais.hidden) mais.hidden = true;
        if (gaveta && !gaveta.hidden) gaveta.hidden = true;
    }

    /** Ativa a barra em uma linha com rolagem + botão de edição + ordem salva. */
    configurarToolbarPWA() {
        const toolbar = document.getElementById('notesToolbar');
        if (!toolbar || this.notesToolbarConfigurada) return;
        this.notesToolbarConfigurada = true;
        toolbar.classList.add('notes-toolbar-inline');
        this.criarBotaoEditarToolbar(toolbar);
        // Ordem de fábrica = ordem atual do motor, capturada ANTES da ordem salva.
        this.ordemToolbarOriginal = [...this.chavesToolbar().values()];
        this.aplicarOrdemToolbar();
        this.notesToolbarObserver?.disconnect();
        this.notesToolbarObserver = new MutationObserver(() => this.aplicarOrdemToolbar());
        this.notesToolbarObserver.observe(toolbar, { childList: true, subtree: true });
    }

    criarBotaoEditarToolbar(toolbar) {
        if (toolbar.querySelector('[data-pwa="editar-toolbar"]')) return;
        const botao = document.createElement('button');
        botao.type = 'button';
        botao.className = 'toolbar-btn app-toolbar-edit-btn';
        botao.dataset.pwa = 'editar-toolbar';
        botao.title = 'Editar barra de ferramentas';
        botao.setAttribute('aria-label', 'Editar barra de ferramentas');
        botao.setAttribute('aria-haspopup', 'dialog');
        botao.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/><circle cx="3.5" cy="18" r="1.5"/></svg>';
        botao.addEventListener('mousedown', event => event.preventDefault());
        botao.addEventListener('click', () => this.abrirEditorToolbar());
        toolbar.append(botao);
    }

    rotuloBotaoToolbar(el) {
        const bruto = el.getAttribute('aria-label') || el.title || el.textContent.trim() || 'Botão';
        return bruto.replace(/\s*\((?:(?:Ctrl|Cmd|Alt|Shift|Tab|Esc)[^)]*)\)\s*$/i, '').trim() || 'Botão';
    }

    /** Move um botão uma posição e persiste a nova ordem. */
    moverBotaoToolbar(el, delta) {
        const mapa = this.chavesToolbar();
        const itens = [...mapa.keys()];
        const indice = itens.indexOf(el);
        const destino = indice + delta;
        if (indice < 0 || destino < 0 || destino >= itens.length) return;
        itens.splice(indice, 1);
        itens.splice(destino, 0, el);
        const ordem = itens.map(item => mapa.get(item));
        this.salvarOrdemToolbar(ordem);
        this.aplicarOrdemToolbar(ordem);
        this.notesToolbarEditorRedraw?.();
    }
    /** Diálogo "Editar barra de ferramentas": reordena com setas e persiste. */
    abrirEditorToolbar() {
        const gatilho = document.querySelector('#notesToolbar [data-pwa="editar-toolbar"]');
        this.notesExtraDialog('Editar barra de ferramentas', dialog => {
            dialog.classList.add('app-toolbar-editor');
            const ajuda = document.createElement('p');
            ajuda.className = 'app-toolbar-editor-help';
            ajuda.textContent = 'Use as setas para reposicionar os botões. A ordem fica guardada neste dispositivo.';
            const lista = document.createElement('div');
            lista.className = 'app-toolbar-editor-list';
            dialog.append(ajuda, lista);

            const desenhar = () => {
                const mapa = this.chavesToolbar();
                const itens = [...mapa.keys()];
                lista.replaceChildren();
                itens.forEach((el, indice) => {
                    const linha = document.createElement('div');
                    linha.className = 'app-toolbar-editor-row';
                    const nome = document.createElement('span');
                    nome.className = 'app-toolbar-editor-name';
                    nome.textContent = this.rotuloBotaoToolbar(el);
                    const esquerda = document.createElement('button');
                    esquerda.type = 'button';
                    esquerda.textContent = '←';
                    esquerda.setAttribute('aria-label', 'Mover ' + nome.textContent + ' para a esquerda');
                    esquerda.disabled = indice === 0;
                    esquerda.addEventListener('click', () => this.moverBotaoToolbar(el, -1));
                    const direita = document.createElement('button');
                    direita.type = 'button';
                    direita.textContent = '→';
                    direita.setAttribute('aria-label', 'Mover ' + nome.textContent + ' para a direita');
                    direita.disabled = indice === itens.length - 1;
                    direita.addEventListener('click', () => this.moverBotaoToolbar(el, 1));
                    linha.append(nome, esquerda, direita);
                    lista.append(linha);
                });
            };
            this.notesToolbarEditorRedraw = desenhar;
            desenhar();

            const restaurar = document.createElement('button');
            restaurar.type = 'button';
            restaurar.className = 'app-toolbar-editor-restore';
            restaurar.textContent = 'Restaurar padrão';
            restaurar.addEventListener('click', () => this.restaurarOrdemToolbar());
            dialog.append(restaurar);

            dialog.addEventListener('close', () => { this.notesToolbarEditorRedraw = null; });
        }, gatilho);
    }

    restaurarOrdemToolbar() {
        try { localStorage.removeItem('notas-pwa-toolbar-order'); } catch (_) { /* ignora */ }
        this.aplicarOrdemToolbar(this.ordemToolbarOriginal || []);
        this.notesToolbarEditorRedraw?.();
    }

    /** Mantém a barra logo acima do teclado virtual (visualViewport). */
    ativarToolbarTeclado() {
        if (this.notesToolbarTecladoAtivo) return;
        this.notesToolbarTecladoAtivo = true;
        const editorDeNotas = () => document.getElementById('notesEditor');
        const temFocoNoEditor = () => {
            const editor = editorDeNotas();
            return Boolean(editor && editor.contains(document.activeElement));
        };
        // Para o poll do teclado e os reajustes agendados. Sem isto o telemóvel
        // continuava a re-renderizar a barra para sempre: o `focusout` nem sempre
        // chega com `target = #notesEditor` (toque em checkbox/link dentro da nota).
        const pararAjustes = () => {
            clearInterval(this.notesToolbarTecladoPoll);
            this.notesToolbarTecladoPoll = null;
            (this.notesToolbarTecladoTimeouts || []).forEach(clearTimeout);
            this.notesToolbarTecladoTimeouts = [];
            this.notesToolbarTecladoAplicado = null;
        };
        const atualizar = () => {
            // Autoproteção: se o foco saiu do editor, o poll deixa de fazer sentido.
            if (this.notesToolbarTecladoPoll && !temFocoNoEditor()) pararAjustes();
            this.aplicarToolbarTeclado();
        };
        const reagirAoFoco = () => {
            pararAjustes();
            // O teclado anima: reavalia algumas vezes além de acompanhar os eventos.
            this.notesToolbarTecladoTimeouts = [0, 80, 180, 320, 520, 800].map(atraso => setTimeout(atualizar, atraso));
            this.notesToolbarTecladoPoll = setInterval(atualizar, 250);
        };
        // Altura do layout SEM teclado (baseline): necessária porque no iOS o
        // `innerHeight` encolhe junto com o teclado e a comparação simples dá 0.
        const layout = document.documentElement.clientHeight || window.innerHeight;
        this.notesViewportBase = Math.max(layout, window.innerHeight || 0, window.visualViewport?.height || 0);
        const vv = window.visualViewport;
        vv?.addEventListener('resize', atualizar);
        vv?.addEventListener('scroll', atualizar);
        window.addEventListener('resize', atualizar);
        window.addEventListener('orientationchange', atualizar);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') { pararAjustes(); return; }
            if (temFocoNoEditor()) reagirAoFoco(); else atualizar();
        });
        window.addEventListener('pagehide', pararAjustes);
        editorDeNotas()?.addEventListener('focusin', reagirAoFoco);
        document.addEventListener('focusout', event => {
            const editor = editorDeNotas();
            if (!editor || !editor.contains(event.target)) return;
            // O foco pode apenas trocar dentro do editor; confirma depois do evento.
            setTimeout(() => {
                if (!temFocoNoEditor()) { pararAjustes(); atualizar(); }
            }, 0);
        });
    }

    /**
     * Doca a barra acima do teclado. `insetForcado` (px) permite testar sem teclado real.
     *
     * O `#notesToolbar` tem o `#notesModal` como containing block (o modal recebe
     * `transform`/`backdrop-filter` no CSS do original), então a posição é calculada
     * medindo o referencial real em vez de assumir a viewport.
     *
     * O resultado é memorizado em `notesToolbarTecladoAplicado`: com o poll do
     * teclado ativo, reaplicar os mesmos valores a cada 250 ms forçava reflow
     * contínuo e deixava a interface presa no smartphone.
     */
    aplicarToolbarTeclado(insetForcado) {
        const toolbar = document.getElementById('notesToolbar');
        if (!toolbar) return;
        const editor = document.getElementById('notesEditor');
        const vv = window.visualViewport;
        // `clientHeight` = layout viewport: NÃO encolhe com o teclado no iOS.
        const layout = document.documentElement.clientHeight || window.innerHeight;
        const alturaVisual = vv ? vv.height : layout;
        const deslocamento = vv ? vv.offsetTop : 0;
        const estaDockada = toolbar.classList.contains('notes-toolbar-docked');

        let teclado;
        let inset;
        if (typeof insetForcado === 'number') {
            teclado = Math.max(0, Math.round(insetForcado));
            inset = teclado;
        } else {
            if (!estaDockada) this.notesViewportBase = Math.max(layout, window.innerHeight || 0, alturaVisual);
            const base = this.notesViewportBase || layout;
            teclado = Math.max(0, Math.round(base - alturaVisual));
            inset = Math.max(0, Math.round(layout - alturaVisual - deslocamento));
        }

        const backdropAtivo = document.getElementById('notesModalBackdrop')?.classList.contains('active');
        const deveDockar = teclado > 120 && backdropAtivo && !toolbar.hidden;
        if (!deveDockar) {
            if (estaDockada) {
                toolbar.classList.remove('notes-toolbar-docked');
                ['--notes-toolbar-dock-bottom', '--notes-toolbar-dock-left', '--notes-toolbar-dock-width'].forEach(nome => toolbar.style.removeProperty(nome));
                editor?.style.removeProperty('padding-bottom');
            }
            this.notesToolbarTecladoAplicado = 'livre';
            return;
        }

        const modal = document.getElementById('notesModal');
        const caixa = modal ? modal.getBoundingClientRect() : { left: 0, width: window.innerWidth, bottom: layout };
        const chave = [teclado, inset, Math.round(layout), Math.round(caixa.left), Math.round(caixa.width)].join('|');
        if (estaDockada && chave === this.notesToolbarTecladoAplicado) return;
        this.notesToolbarTecladoAplicado = chave;

        toolbar.classList.add('notes-toolbar-docked');
        toolbar.style.setProperty('--notes-toolbar-dock-width', Math.round(Math.max(0, Math.min(caixa.width, window.innerWidth - Math.max(0, caixa.left)))) + 'px');
        // Mede o referencial (comporta-se igual com containing block = modal ou viewport).
        toolbar.style.setProperty('--notes-toolbar-dock-left', '0px');
        toolbar.style.setProperty('--notes-toolbar-dock-bottom', '0px');
        const zerado = toolbar.getBoundingClientRect();
        toolbar.style.setProperty('--notes-toolbar-dock-left', Math.round(Math.max(0, caixa.left) - zerado.left) + 'px');
        toolbar.style.setProperty('--notes-toolbar-dock-bottom', Math.round(zerado.bottom - (layout - inset)) + 'px');
        if (editor) editor.style.paddingBottom = (toolbar.offsetHeight + 12) + 'px';
    }
    // ⚡ [FIM: PWA - BARRA DE FERRAMENTAS INLINE, ORDEM E TECLADO]
}

// ============================================
// CAMADA LOCAL DAS FERRAMENTAS EXTRAS / TABELAS
// Mantém as mesmas funcionalidades do sistema, mas sem backend:
// anexos e imagens viram data URLs dentro da própria nota e os
// modelos de nota ficam guardados no dispositivo (LocalStorage).
// ============================================
function installLocalNotesStorage(App) {
    const p = App.prototype;

    const readTemplates = () => {
        try { return JSON.parse(localStorage.getItem('notas-pwa-templates') || '[]'); } catch { return []; }
    };
    const writeTemplates = list => {
        try { localStorage.setItem('notas-pwa-templates', JSON.stringify(list)); } catch { /* sem espaço: ignora */ }
    };

    p.notesExtraRequest = async function (path, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        if (path === '/templates' && method === 'POST') {
            const payload = JSON.parse(options.body || '{}');
            const item = {
                id: 'tpl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                name: String(payload.name || 'Modelo').slice(0, 100),
                html: String(payload.html || '')
            };
            const list = readTemplates();
            list.push(item);
            writeTemplates(list);
            return item;
        }
        if (path === '/templates') return readTemplates().map(({ id, name }) => ({ id, name }));
        if (path.startsWith('/templates/')) {
            const id = decodeURIComponent(path.slice('/templates/'.length));
            const item = readTemplates().find(entry => entry.id === id);
            if (!item) throw new Error('Modelo não encontrado.');
            return item;
        }
        throw new Error('Recurso indisponível neste dispositivo.');
    };

    p.readNotesFile = function (file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
            reader.readAsDataURL(file);
        });
    };

    // Mesmo menu/fluxo do sistema, mas o conteúdo é incorporado à nota.
    p.notesUpload = function (image = false) {
        const saved = this.notesCaptureInsertion();
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = image ? 'image/*' : '.pdf,.docx,.xlsx,.csv,.txt,application/pdf,application/octet-stream';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            try {
                this.notesStatus('Carregando arquivo…');
                const dataUrl = await this.readNotesFile(file);
                if (!this.notesRestoreInsertion(saved)) return;
                if (image) {
                    this.notesMedia('image', dataUrl, file.name);
                } else {
                    const link = document.createElement('a');
                    link.href = dataUrl;
                    link.dataset.noteAsset = 'file-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
                    link.textContent = '📎 ' + file.name;
                    this.notesInsertNode(link);
                }
                this.queueNotesSave();
                this.notesStatus('Salvo');
            } catch (error) {
                this.showToast(error.message, 'error');
            }
        };
        input.click();
    };

    // Visualizador local: imagens e PDF usam o próprio navegador; demais tipos podem ser baixados.
    p.notesFileViewer = function (id) {
        const link = document.querySelector('a[data-note-asset="' + id + '"]');
        const url = link?.getAttribute('href') || '';
        const name = (link?.textContent || 'Arquivo').replace(/^\s*📎\s*/, '');
        if (!url.startsWith('data:')) {
            this.showToast('Arquivo indisponível neste dispositivo.', 'error');
            return;
        }
        this.notesExtraDialog('Visualização do arquivo', dialog => {
            dialog.classList.add('notes-file-viewer');
            const heading = dialog.querySelector('h3');
            if (heading) heading.textContent = name;
            const mime = (url.match(/^data:([^;,]+)/) || [])[1] || '';
            if (mime.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = url;
                img.alt = name;
                img.className = 'notes-local-file';
                dialog.append(img);
                return;
            }
            const frame = document.createElement('iframe');
            frame.src = url;
            frame.title = name;
            frame.className = 'notes-local-file';
            dialog.append(frame);
            const download = document.createElement('a');
            download.href = url;
            download.download = name;
            download.textContent = 'Baixar arquivo';
            dialog.append(download);
        }, link);
    };
}

// Inicializar a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.notesApp = new NotesPWA();
});
