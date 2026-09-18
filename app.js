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

        this.themeManager = new ThemeManager();
        this.init();
    }

    init() {
        this.notesContent = this.loadContentFromStorage();
        this.installNotesFeatures();
        this.projectsData = [{ id: 'local', nome: 'Minhas notas', notas: this.notesContent }];
        this.setupEventListeners();
        this.setupResize();
        this.openNotesModal('local');
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

    /** Substitui o cliente HTTP do sistema: qualquer gravação fica no dispositivo. */
    async apiCall(endpoint, options = {}) {
        const method = (options.method || 'GET').toUpperCase();
        if (method !== 'GET' && options.body) {
            try {
                const payload = JSON.parse(options.body);
                if (typeof payload.notas === 'string') this.saveContentToStorage(payload.notas);
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

        const title = document.getElementById('notesModalTitle');
        if (title) title.textContent = 'Notas';

        const editor = document.getElementById('notesEditor');
        editor.innerHTML = project.notas || '<div class="notes-line" data-level="0"><div class="notes-line-text"><br></div></div>';
        this.resetNotesHistory();
        this.refreshNotesCollapseControls();

        // A modal ocupa a tela inteira no celular (mesma largura que o motor espera).
        this.notesSavedWidth = window.innerWidth;
        document.getElementById('notesModal')?.style.setProperty('--notes-width', window.innerWidth + 'px');
        document.getElementById('notesModalBackdrop')?.classList.add('active');

        setTimeout(() => this.placeNotesCursorAtEnd(editor), 100);
    }

    openStageNotesModal(stageId) {
        return this.openNotesModal(this.currentNotesProjectId);
    }

    // Placeholders chamados pelo motor antes de serem substituídos pelo install.
    closeNotesModal() { return true; }
    setupModalListeners() { this.setupNotesEditing(); }
    toggleNotesFullscreen() { return true; }
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
     * Leva o cursor para o fim da nota quando o toque/clique não atinge nenhuma
     * linha (área vazia abaixo do conteúdo). No celular e no Safari, tocar numa
     * área vazia de um contenteditable não posiciona o cursor; sem isto o teclado
     * não abre e o usuário não consegue escrever.
     */
    focusNotesEditorFromEmptyArea(event) {
        const editor = document.getElementById('notesEditor');
        if (!editor) return;
        event?.preventDefault();
        const lastLine = [...editor.children].reverse().find(element => element.classList.contains('notes-line'));
        const target = lastLine?.querySelector('.notes-line-text') || editor;
        const range = document.createRange();
        range.selectNodeContents(target);
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

        // Garante a gravação ao sair.
        window.addEventListener('beforeunload', () => this.persistNow());
    }

    setupResize() {
        window.addEventListener('resize', () => {
            this.refreshNotesCollapseControls();
            if (this.notesSession) this.notesSavedWidth = window.innerWidth;
        });
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
