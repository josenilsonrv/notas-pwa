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
