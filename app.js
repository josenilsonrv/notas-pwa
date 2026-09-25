// ============================================
// NOTAS PWA - Aplicação Principal (100% no dispositivo)
// Reaproveita o mesmo motor de notas do sistema
// (editor.js + extras.js + tables.js), sem backend.
// ============================================

// A partir deste tamanho (caracteres de HTML) a nota é tratada como "grande":
// adia o snapshot do histórico, não grava o espelho legado, não grava rascunho
// duplicado e evita serialização no beforeunload — assim uma nota com ~1 milhão
// de caracteres continua sendo renderizada e salva sem estourar a cota do
// LocalStorage (~5 MB por origem).
// 🔄 [INÍCIO: PWA - CONSTANTES DE NOTA GRANDE]
const LIMITE_NOTA_GRANDE = 120000;
// Rascunho de recuperação: acima disso nem grava (evita pagar o custo do
// getCleanNotesHtml a cada autosave e o risco de cota).
const LIMITE_RASCUNHO = 800000;
// 🔄 [FIM: PWA - CONSTANTES DE NOTA GRANDE]

// 🔄 [INÍCIO: PWA - TEMA (ThemeManager)]
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
        // Barra de status na cor padrão do modo (token --app-status-bar).
        const corBarra = (window.getComputedStyle(this.root).getPropertyValue('--app-status-bar') || '').trim()
            || (isDark ? '#11161D' : '#F8FAFC');
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', corBarra);
        if (this.toggle) {
            this.toggle.setAttribute('aria-checked', String(isDark));
            this.toggle.setAttribute('title', isDark ? 'Tema escuro ativo — toque para o claro' : 'Tema claro ativo — toque para o escuro');
        }
        window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
    }
}

// 🔄 [FIM: PWA - TEMA (ThemeManager)]

// 🔄 [INÍCIO: PWA - APLICAÇÃO (NotesPWA boot/instalação)]
/**
 * Aplicação Principal de Notas (standalone, tudo no dispositivo).
 * O editor, as ferramentas extras e as tabelas são instalados no
 * protótipo desta classe, exatamente como o sistema faz com NeuralCommandApp.
 */
class NotesPWA {
    // Folga EXTRA (px) reservada no fim do editor enquanto a barra está acoplada ao
    // teclado: garante espaço de ROLAGEM para a linha digitada nunca ficar sob a barra.
    static FOLGA_BARRA_TECLADO = 28;
    // Distância mínima (px) entre a linha do cursor e o topo da barra acoplada.
    static MARGEM_CURSOR_BARRA = 10;

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
        // Pasta/workspace ativo das notas (compartilhado com a área de Pastas do Mapa).
        this.notaPastaAtiva = null;
        this.notesToolbarConfigurada = false;
        this.notesToolbarObserver = null;
        this.notesToolbarTecladoAtivo = false;
        this.notesToolbarTecladoPoll = null;
        this.notesToolbarTecladoTimeouts = [];
        this.notesToolbarTecladoAplicado = null;
        this.notesViewportBase = 0;
        this.ordemToolbarOriginal = null;
        this.notesToolbarEditorRedraw = null;

        this.notesToolbarEditorRows = null;
        this.notesToolbarAplicando = false;
        this.notesToolbarOrdemAgendada = false;
        this.notesToolbarOrdemPasses = 0;
        this.notesToolbarOrdemTimer = null;
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
        this.aplicarModoMobile();
        // Sinaliza para a auto-recuperação (index.html) que o app iniciou bem.
        window.__notasPronto = true;
        // Área do app (Notas | Mapa Mental): só agora ligamos o seletor e aplicamos a
        // área salva — o mapa continua em montagem lazy na primeira entrada.
        if (typeof this.inicializarAreasMapa === 'function') this.inicializarAreasMapa();
        // Atualização do app: avisa/recarrega quando o Service Worker publicar versão nova.
        if (typeof this.verificarAtualizacaoSW === 'function') this.verificarAtualizacaoSW();
        // ⚡ [FIM: PWA - BARRA DE FERRAMENTAS INLINE/EDIÇÃO + TECLADO]
        // 🔄 [FIM: ESTADO - MIGRAÇÃO/ABERTURA DA ÚLTIMA NOTA]
    }

    /** Instala o mesmo motor de notas do sistema sobre este protótipo. */
    installNotesFeatures() {
        installNotesEditor(NotesPWA);
        if (typeof installNotesExtras === 'function') installNotesExtras(NotesPWA);
        if (typeof installNotesTables === 'function') installNotesTables(NotesPWA);
        installLocalNotesStorage(NotesPWA);
        installAjustesNotaGrande(NotesPWA);
        // Área do Mapa Mental: instala a troca de áreas (o mapa em si monta lazy).
        // Guardado: os harnesses de paridade/shortcuts não carregam mapa/*.js.
        if (typeof installMapaMental === 'function') installMapaMental(NotesPWA);
        // Atualização do app: deteta uma versão nova do Service Worker e recarrega
        // (update notification) — ver bloco "PWA - ATUALIZAÇÃO DO APP".
        if (typeof installAtualizacaoPWA === 'function') installAtualizacaoPWA(NotesPWA);
        // Modo mobile: toolbar superior oculta por padrao e colapso agindo nos chips.
        installModoMobileNotas(NotesPWA);
    }

    // 🔄 [FIM: PWA - APLICAÇÃO (NotesPWA boot/instalação)]

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
            // 'notas-pwa-content' é o espelho legado (compatibilidade). Em notas
            // grandes ele duplicaria o conteúdo e podia estourar a cota — a lista
            // 'notas-pwa-notes' já é a fonte da verdade.
            if (html.length <= LIMITE_NOTA_GRANDE) localStorage.setItem('notas-pwa-content', html);
            else localStorage.removeItem('notas-pwa-content');
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
                if (Array.isArray(lista) && lista.length) {
                    // Migração leve: notas antigas ganham `pastaId` (ver chip "Mover para pasta").
                    return lista.map(nota => (nota && typeof nota === 'object' && 'pastaId' in nota)
                        ? nota : Object.assign({ pastaId: null }, nota));
                }
            }
        } catch (error) {
            console.error('Erro ao ler as notas locais:', error);
        }
        return [{ id: 'local', nome: 'Minhas notas', notas: this.loadContentFromStorage() }];
    }

    /**
     * Seam de persistência das notas.
     *
     * Hoje a implementação é o LocalStorage (abaixo). Quando o **Supabase** for
     * ligado, basta trocar estes métodos por chamadas remotas assíncronas: a UI
     * dos chips consome apenas METADADOS (id/nome/accent) e o conteúdo é lido por
     * nota, então a lista pode crescer (100+ notas) sem manter tudo em memória.
     * O `accentDaNota` já evita reparsear o HTML e aceita `nota.accent` como
     * metadado — que é o formato natural para vir do backend.
     */
    notasBackend() {
        return {
            listar: () => (this.projectsData || []).map(nota => ({ id: nota.id, nome: nota.nome, accent: this.accentDaNota(nota), pastaId: nota.pastaId ?? null })),
            obter: id => (this.projectsData || []).find(nota => nota.id === id) || null,
            salvar: lista => this.gravarNotasLocais(lista)
        };
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

    /** Grava só o id da nota ativa (evita reescrever a lista inteira). */
    marcarNotaAtiva(id) {
        try { localStorage.setItem('notas-pwa-nota-ativa', String(id)); } catch (_) { /* storage opcional */ }
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
                    // Usa a lista em memória: evita um JSON.parse de todas as notas
                    // a cada gravamento (pesado quando há anexos embutidos).
                    const lista = this.projectsData || [];
                    const nota = lista.find(item => item.id === this.currentNotesProjectId) || lista[0];
                    if (nota) {
                        nota.notas = payload.notas;
                        nota.atualizadaEm = new Date().toISOString();
                        this.invalidarAccentDaNota(nota.id);
                        this.gravarNotasLocais(lista);
                    }
                }
            } catch (_) { /* corpo não-JSON é ignorado */ }
        }
        return {};
    }

    persistNow() {
        // Notas grandes: serializar no `beforeunload` bloqueia a thread e o autosave
        // já grava a nota; aqui saímos cedo para não travar a saída da página.
        const editor = document.getElementById('notesEditor');
        if (editor && editor.textContent.length > LIMITE_NOTA_GRANDE) return;
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
        // Notas grandes: adia o snapshot inicial do histórico (medido em ~580 ms
        // para 2000 linhas) para depois do primeiro paint, para o aparelho não
        // bloquear a thread principal e o Android não acusar "UI do sistema não
        // responde". O baseline é capturado antes da primeira edição (beforeinput).
        this.notesHistoricoAdiado = (project.notas || '').length >= LIMITE_NOTA_GRANDE;
        // O histórico é reiniciado logo depois pelo motor (`beginNotesSession`).
        // Refazer o snapshot completo aqui em cima duplicava o trabalho mais caro
        // da abertura (medido em ~270 ms para 2000 linhas) sem necessidade.
        this.refreshNotesCollapseControls();

        // Largura do modal: o motor usa var(--notes-width, 50vw) e calcula a largura
        // a partir de notesSavedWidth (undefined na abertura, como no original).
        document.getElementById('notesModalBackdrop')?.classList.add('active');

        this.renderNotesNav();
        // Só a nota ativa muda aqui: reescrever a lista inteira (JSON.stringify de
        // todas as notas, com anexos em base64) a cada abertura travava o aparelho
        // em notas grandes.
        this.marcarNotaAtiva(project.id);

        // No mobile, trocar de nota (chip) nao deve abrir o teclado nem acoplar a
        // barra — isso era percebido como "a barra encolhe" ao tocar em um chip.
        // O comportamento de colapso so deve ocorrer pelos botoes proprios.
        if (typeof this.ehMobile !== 'function' || !this.ehMobile()) {
            setTimeout(() => this.placeNotesCursorAtEnd(editor), 100);
        }
    }

    openStageNotesModal(stageId) {
        return this.openNotesModal(this.currentNotesProjectId);
    }

    // ⚡ [INÍCIO: INTERAÇÃO/JS - MÚLTIPLAS NOTAS (CHIPS + BOTÃO "+")]
    /** Id da pasta "Geral" (mesmo valor do MapaMentalStore.ID_PASTA_PADRAO). */
    get pastaPadraoId() { return 'pasta-geral'; }

    /** A nota pertence à pasta informada? (a "Geral" adota as notas sem pasta). */
    notaPertenceAPasta(nota, pastaId) {
        const alvo = pastaId || this.notaPastaAtiva || this.pastaPadraoId;
        return (nota.pastaId || this.pastaPadraoId) === alvo;
    }

    /** Notas da pasta ativa (a tela raiz de Pastas filtra por workspace). */
    notasDaPasta(pastaId) {
        return (this.projectsData || []).filter(nota => this.notaPertenceAPasta(nota, pastaId));
    }

    /** Quantas notas a pasta tem (usado no cartão da pasta). */
    contarNotasDaPasta(pastaId) {
        return this.notasDaPasta(pastaId).length;
    }

    /** Define a pasta ativa das notas: repinta os chips e garante ao menos 1 nota. */
    definirPastaAtivaNotas(pastaId) {
        this.notaPastaAtiva = pastaId || this.pastaPadraoId;
        const daPasta = this.notasDaPasta();
        if (!daPasta.length) {
            const nota = this.criarNotaLocal('Nova nota');
            nota.pastaId = this.notaPastaAtiva;
            this.projectsData = this.projectsData || [];
            this.projectsData.push(nota);
            this.salvarNotasLocais();
            this.renderNotesNav();
            if (typeof this.openNotesModal === 'function') this.openNotesModal(nota.id);
            return;
        }
        const atual = (this.projectsData || []).find(n => n.id === this.currentNotesProjectId);
        if (!atual || !this.notaPertenceAPasta(atual, this.notaPastaAtiva)) {
            if (typeof this.openNotesModal === 'function') this.openNotesModal(daPasta[0].id);
        } else {
            this.renderNotesNav();
        }
    }

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

        for (const nota of this.notasDaPasta()) {
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

    /**
     * Lê a cor padrão (accent) da nota. Em vez de reparsear o HTML inteiro a cada
     * render dos chips (pesado com muitas notas grandes), guarda em cache por id e
     * invalida quando o conteúdo da nota muda. Prepara a persistência remota:
     * quando houver backend, o accent pode vir como metadado da própria nota.
     */
    accentDaNota(nota) {
        if (!nota) return '';
        if (typeof nota.accent === 'string') return nota.accent;
        const cache = this._notasAccentCache || (this._notasAccentCache = new Map());
        const guardado = cache.get(nota.id);
        // Compara o CONTEÚDO guardado: se a nota mudou, o cache é descartado.
        if (guardado && guardado.notas === nota.notas) return guardado.accent;
        const template = document.createElement('template');
        template.innerHTML = nota.notas || '';
        const accent = template.content.querySelector('[data-note-accent]')?.dataset.noteAccent || '';
        cache.set(nota.id, { notas: nota.notas, accent });
        return accent;
    }

    /** Invalida o accent em cache de uma nota (quando o conteúdo muda). */
    invalidarAccentDaNota(id) {
        this._notasAccentCache?.delete(id);
    }

    /** Cria uma nota nova em branco e abre em seguida (o motor salva a anterior). */
    criarNota() {
        this.persistNow();
        const nota = this.criarNotaLocal();
        nota.pastaId = this.notaPastaAtiva || this.pastaPadraoId;
        this.projectsData = this.projectsData || [];
        this.projectsData.push(nota);
        this.salvarNotasLocais();
        return this.openNotesModal(nota.id);
    }

    criarNotaLocal(nome = 'Nova nota') {
        const id = 'nota-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const agora = new Date().toISOString();
        return { id, nome, notas: '', pastaId: null, criadaEm: agora, atualizadaEm: agora };
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
        if (!lista.length) {
            const nova = this.criarNotaLocal();
            nova.pastaId = this.notaPastaAtiva || this.pastaPadraoId;
            lista.push(nova);
        }

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

    /** Duplica a nota (novo id, mesmo conteúdo/pasta), logo depois do original. */
    duplicarNota(id) {
        const lista = this.projectsData || [];
        const indice = lista.findIndex(item => item.id === id);
        if (indice < 0) return null;
        const original = lista[indice];
        const copia = this.criarNotaLocal((original.nome || 'Nota') + ' (cópia)');
        copia.notas = original.notas || '';
        copia.pastaId = original.pastaId ?? null;
        if (typeof original.accent === 'string') copia.accent = original.accent;
        lista.splice(indice + 1, 0, copia);
        this.invalidarAccentDaNota(copia.id);
        this.salvarNotasLocais();
        this.renderNotesNav();
        return copia;
    }

    /** Pastas disponíveis (compartilhadas com o Mapa); opcional, nunca quebra. */
    pastasDeNotas() {
        try {
            const store = (typeof window !== 'undefined' && window.MapaMentalStore)
                || (typeof MapaMentalStore !== 'undefined' ? MapaMentalStore : null);
            if (store && typeof store.listarPastas === 'function') return store.listarPastas() || [];
        } catch (_) { /* pastas são opcionais */ }
        return [];
    }

    /** Move a nota para uma pasta (ou para "Sem pasta" com `null`). */
    moverNotaParaPasta(id, pastaId) {
        const nota = (this.projectsData || []).find(item => item.id === id);
        if (!nota) return false;
        nota.pastaId = pastaId || null;
        this.salvarNotasLocais();
        this.renderNotesNav();
        return true;
    }

    /** Cria um menu de chip vazio já com o papel/estilo padrão. */
    criarMenuNota(rotulo) {
        const menu = document.createElement('div');
        menu.id = 'notesChipMenu';
        menu.className = 'notes-chip-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', rotulo || 'Ações da nota');
        return menu;
    }

    /** Posiciona (preso ao chip, com clamp de viewport) e registra o menu aberto. */
    mostrarMenuNota(menu, chip) {
        document.body.append(menu);
        const caixa = chip.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(caixa.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
        menu.style.top = Math.min(caixa.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + 'px';
        menu.querySelector('button')?.focus();
        this.notesChipMenu = menu;
    }

    /** Menu de ações da nota (renomear/duplicar/mover para pasta/excluir), aberto pelo chip. */
    abrirMenuNota(nota, chip) {
        this.fecharMenuNota();
        const menu = this.criarMenuNota('Ações da nota');
        const acoes = [
            ['Renomear', () => this.renomearNota(nota.id)],
            ['Duplicar', () => this.duplicarNota(nota.id)],
            ['Mover para pasta…', () => this.abrirMenuMoverNota(nota, chip)],
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
        this.mostrarMenuNota(menu, chip);
    }

    /** Submenu "Mover para pasta": lista as pastas (a atual marcada). */
    abrirMenuMoverNota(nota, chip) {
        this.fecharMenuNota();
        const menu = this.criarMenuNota('Mover nota para pasta');
        const opcoes = [['Sem pasta', null]].concat(
            this.pastasDeNotas().map(pasta => [pasta.nome || 'Pasta', pasta.id]));
        for (const [texto, pastaId] of opcoes) {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.setAttribute('role', 'menuitemradio');
            const atual = (nota.pastaId ?? null) === (pastaId ?? null);
            botao.setAttribute('aria-checked', String(atual));
            if (atual) botao.classList.add('is-active');
            botao.textContent = texto;
            botao.addEventListener('click', () => { this.fecharMenuNota(); this.moverNotaParaPasta(nota.id, pastaId); });
            menu.append(botao);
        }
        this.mostrarMenuNota(menu, chip);
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

    /**
     * Com a barra acoplada ao teclado, garante que a linha onde o cursor está
     * continue visível ACIMA da barra (senão as quebras de linha empurram o texto
     * para trás da barra). Rola o container do editor só o necessário.
     *
     * GARANTIA: se o documento não tiver espaço de rolagem suficiente (nota curta/acabou
     * de chegar ao fim), o `padding-bottom` do editor CRESCE só o que falta — assim a linha
     * digitada SEMPRE fica acima da barra do teclado, nunca atrás dela.
     */
    rolarCaretParaAcima() {
        const toolbar = document.getElementById('notesToolbar');
        const container = document.getElementById('notesEditorContainer');
        const editor = document.getElementById('notesEditor');
        if (!toolbar?.classList.contains('notes-toolbar-docked') || !container) return;
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0).cloneRange();
        let rect = range.getClientRects()[0];
        if (!rect) {
            const node = range.startContainer;
            const elemento = node?.nodeType === 3 ? node.parentElement : node;
            rect = elemento?.getBoundingClientRect?.();
        }
        if (!rect || (!rect.height && !rect.top)) return;
        const caixaContainer = container.getBoundingClientRect();
        const limite = toolbar.getBoundingClientRect().top - NotesPWA.MARGEM_CURSOR_BARRA;
        if (rect.bottom > limite) {
            const desejado = rect.bottom - limite;
            const antes = container.scrollTop;
            container.scrollTop = antes + desejado;
            const rolou = container.scrollTop - antes;
            // Não rolou o suficiente? Aumenta a folga reservada no fim do editor e rola de novo.
            if (editor && rolou < desejado - 0.5) {
                const faltou = Math.ceil(desejado - rolou) + 8;
                const atual = parseFloat(editor.style.paddingBottom) || 0;
                editor.style.paddingBottom = (atual + faltou) + 'px';
                container.scrollTop = antes + desejado;
            }
        } else if (rect.top < caixaContainer.top) {
            container.scrollTop -= caixaContainer.top - rect.top;
        }
    }

    /**
     * Fallback do Enter: se o motor de notas falhar ao tratar a tecla, cria uma
     * linha nova depois da linha do cursor (mesma estrutura do editor) para o app
     * nunca parecer "travado". O erro original é registrado no console.
     */
    quebrarLinhaDeEmergencia() {
        const editor = document.getElementById('notesEditor');
        if (!editor) return;
        const selection = window.getSelection();
        const node = selection?.anchorNode;
        const elemento = node?.nodeType === 3 ? node.parentElement : node;
        let linha = elemento?.closest?.('.notes-line') || null;
        if (!linha) linha = [...editor.querySelectorAll('.notes-line')].filter(item => !item.hidden).at(-1) || null;
        const nova = document.createElement('div');
        nova.className = 'notes-line';
        nova.dataset.level = linha?.dataset.level || '0';
        nova.innerHTML = '<div class="notes-line-text"><br></div>';
        if (linha) linha.after(nova); else editor.append(nova);
        const texto = nova.querySelector('.notes-line-text');
        const range = document.createRange();
        range.selectNodeContents(texto);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        editor.focus({ preventScroll: true });
        this.rememberNotesSelection();
        if (typeof this.refreshNotesCollapseControls === 'function') this.refreshNotesCollapseControls();
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
        if (redoButton) redoButton.disabled = !this.notesHistory || this.notesHistoryIndex >= this.notesHistory.length - 1;
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
        document.getElementById('notesEditor')?.addEventListener('keydown', event => {
            try {
                this.handleNotesEditorShortcut(event);
            } catch (erro) {
                // Blindagem: se o motor falhar em qualquer tecla, o app NÃO pode parecer
                // "travado". O erro vai para o console (diagnóstico) e, no Enter, a
                // quebra acontece por um caminho de emergência.
                console.error('[notas] erro ao tratar a tecla', event.key, erro);
                if (event.key === 'Enter' && !event.isComposing) {
                    try { this.quebrarLinhaDeEmergencia(); } catch (falha) { console.error('[notas] falha no fallback do Enter', falha); }
                }
            }
        });

        // Baseline do histórico adiado (notas grandes): captura o estado ANTES da
        // primeira edição. Este listener é registrado antes do motor (`setupNotesEditing`
        // roda na abertura), então executa primeiro na fase de captura.
        document.getElementById('notesEditor')?.addEventListener('beforeinput', () => {
            if (!this.notesHistory) this.resetNotesHistory();
        }, true);

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
        window.addEventListener('resize', () => {
            if (typeof this.aplicarModoMobile === 'function') this.aplicarModoMobile();
            this.refreshNotesCollapseControls();
        });
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
    aplicarOrdemToolbar(ordem = null, opcoes = {}) {
        const toolbar = document.getElementById('notesToolbar');
        if (!toolbar || this.notesToolbarAplicando) return;
        // Trava de reentrância: enquanto aplicamos a ordem ignoramos as NOSSAS próprias
        // mutações. Sem ela o observer reagia a cada insertBefore e reordenava tudo de
        // novo em cascata (CPU a 100% e interface presa - pior ao voltar de outra aba).
        this.notesToolbarAplicando = true;
        this.notesToolbarObserver?.disconnect();
        try {
            const mais = toolbar.querySelector('.notes-toolbar-more');
            const gaveta = toolbar.querySelector('.notes-toolbar-overflow');
            const lista = ordem || this.lerOrdemToolbar();
            const mapa = this.chavesToolbar();
            const itens = [...mapa.keys()];
            const posicao = new Map();
            lista.forEach((chave, indice)=>{ if (!posicao.has(chave)) posicao.set(chave, indice); });
            itens.sort((a, b)=>{
                const pa = posicao.has(mapa.get(a)) ? posicao.get(mapa.get(a)) : Number.MAX_SAFE_INTEGER;
                const pb = posicao.has(mapa.get(b)) ? posicao.get(mapa.get(b)) : Number.MAX_SAFE_INTEGER;
                return pa - pb;
            });
            const referencia = mais || gaveta || null;
            const editar = toolbar.querySelector('[data-pwa="editar-toolbar"]');
            const atuais = [...toolbar.children].filter(el=>el !== mais && el !== gaveta && el !== editar);
            const jaEsta = atuais.length === itens.length
                && atuais.every((el, indice)=>el === itens[indice])
                && (!gaveta || !gaveta.children.length);
            if (!jaEsta) {
                const alvo = opcoes.mover;
                const base = alvo ? itens.filter(el=>el !== alvo) : [];
                const baseAtual = alvo ? atuais.filter(el=>el !== alvo) : [];
                const soMover = Boolean(alvo) && itens.includes(alvo) && (!gaveta || !gaveta.children.length)
                    && base.length === baseAtual.length && base.every((el, i)=>el === baseAtual[i]);
                if (soMover) {
                    const proximo = itens[itens.indexOf(alvo) + 1];
                    toolbar.insertBefore(alvo, proximo && proximo.parentElement === toolbar ? proximo : referencia);
                } else {
                    itens.forEach(el=>toolbar.insertBefore(el, referencia));
                }
            }
            if (editar && toolbar.lastElementChild !== editar) toolbar.append(editar);
            if (mais && !mais.hidden) mais.hidden = true;
            if (gaveta && !gaveta.hidden) gaveta.hidden = true;
        } finally {
            this.notesToolbarAplicando = false;
            this.observarOrdemToolbar(toolbar);
        }
    }

    /** (Re)liga o observer da barra (ele fica desligado enquanto aplicamos a ordem). */
    observarOrdemToolbar(toolbar = document.getElementById('notesToolbar')) {
        if (!toolbar || !this.notesToolbarObserver || !this.notesToolbarConfigurada) return;
        this.notesToolbarObserver.observe(toolbar, { childList: true, subtree: true });
    }

    /**
     * Agenda a ordenação no próximo frame. Reagir a cada mutação virava cascata
     * e usar requestAnimationFrame também evita trabalho com a aba oculta - era isso
     * que deixava o app preso ao voltar para a página.
     */
    agendarOrdemToolbar() {
        // Aplicação SÍNCRONA, como antes da troca por arraste: reagendar em
        // requestAnimationFrame ficava alternando com o ResizeObserver do motor
        // (uma reordenação por frame no boot). A trava de reentrância em
        // aplicarOrdemToolbar é o que impede a cascata.
        this.notesToolbarOrdemPasses += 1;
        // Freio de emergência: se algo reordenar sem parar, ignora este passe - mas
        // NÃO desliga o observer (senão a ordem deixaria de ser aplicada depois).
        if (400 < this.notesToolbarOrdemPasses) return;
        clearTimeout(this.notesToolbarOrdemTimer);
        this.notesToolbarOrdemTimer = setTimeout(()=>{ this.notesToolbarOrdemPasses = 0; }, 500);
        this.aplicarOrdemToolbar();
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
        this.notesToolbarObserver = new MutationObserver(()=>this.agendarOrdemToolbar());
        this.observarOrdemToolbar(toolbar);
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
        // Ícone de "arrastar/reordenar" (mais claro que a antiga lista): alça de
        // arraste + seta vertical, a mesma linguagem do grip da modal.
        botao.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/><path d="M12 2v3m0 0 1.5-1.5M12 5 10.5 3.5M12 22v-3m0 0 1.5 1.5M12 19l-1.5 1.5"/></svg>';
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
        if (indice < 0 || destino < 0 || itens.length <= destino) return;
        itens.splice(indice, 1);
        itens.splice(destino, 0, el);
        const ordem = itens.map(item=>mapa.get(item));
        this.salvarOrdemToolbar(ordem);
        // Aplica só a troca do botão movido (1 mutação em vez de reordenar os ~28).
        this.aplicarOrdemToolbar(ordem, { mover: el });
        this.notesToolbarEditorRedraw?.();
    }

    /** Diálogo "Editar barra de ferramentas": reordena arrastando (ou pelo teclado) e persiste. */
    abrirEditorToolbar() {
        const gatilho = document.querySelector('#notesToolbar [data-pwa="editar-toolbar"]');
        this.notesExtraDialog('Editar barra de ferramentas', dialog=>{
            dialog.classList.add('app-toolbar-editor');
            const ajuda = document.createElement('p');
            ajuda.className = 'app-toolbar-editor-help';
            ajuda.textContent = 'Arraste pela alça para reposicionar os botões (ou use ↑ e ↓ com a linha focada). A ordem fica guardada neste dispositivo.';
            const lista = document.createElement('div');
            lista.className = 'app-toolbar-editor-list';
            lista.setAttribute('role', 'listbox');
            const aviso = document.createElement('p');
            aviso.className = 'app-toolbar-editor-status';
            aviso.setAttribute('role', 'status');
            aviso.setAttribute('aria-live', 'polite');
            dialog.append(ajuda, lista, aviso);

            // Uma linha por botão, REUTILIZADA nas reordenações. Recriar a lista a cada
            // mudança (replaceChildren, como nas antigas setas) destruía o elemento do
            // próprio gesto, jogava o foco no <body> inert do diálogo modal e deixava a
            // interface "presa"; reutilizar também é o que permite arrastar sem perder a linha.
            const linhas = new Map();
            this.notesToolbarEditorRows = linhas;
            let arrasto = null;
            const anunciar = texto=>{ aviso.textContent = texto; };
            const posicaoDe = alvo=>[...lista.querySelectorAll('.app-toolbar-editor-row')].indexOf(alvo) + 1;
            const rolarSePertoDaBorda = clientY=>{
                const caixa = lista.getBoundingClientRect();
                if (clientY < caixa.top + 28) lista.scrollTop -= 12;
                else if (caixa.bottom - 28 < clientY) lista.scrollTop += 12;
            };
            const referenciaPara = (clientY, ignorar)=>{
                const outras = [...lista.querySelectorAll('.app-toolbar-editor-row')].filter(alvo=>alvo !== ignorar);
                for (let i = 0; i < outras.length; i++) {
                    const caixa = outras[i].getBoundingClientRect();
                    if (clientY < caixa.top + caixa.height / 2) return outras[i];
                }
                return null;
            };
            const confirmarArraste = ()=>{
                const mapa = this.chavesToolbar();
                const chaves = [...mapa.keys()];
                const dono = new Map([...linhas].map(par=>[par[1].linha, par[0]]));
                const ordem = [...lista.querySelectorAll('.app-toolbar-editor-row')].map(alvo=>mapa.get(dono.get(alvo))).filter(Boolean);
                if (ordem.length !== chaves.length) return; // nunca guarda uma ordem parcial
                this.salvarOrdemToolbar(ordem);
                this.aplicarOrdemToolbar(ordem);
                this.notesToolbarEditorRedraw?.();
            };
            // Move/solta no document (padrão usado em notes/tables.js): garante que o
            // gesto termine mesmo se o dedo/mouse sair da alça durante o arraste.
            const aoMover = event=>{
                if (!arrasto || arrasto.id !== event.pointerId) return;
                event.preventDefault();
                lista.insertBefore(arrasto.linha, referenciaPara(event.clientY, arrasto.linha));
                rolarSePertoDaBorda(event.clientY);
            };
            const pararDeOuvir = ()=>{
                document.removeEventListener('pointermove', aoMover, true);
                document.removeEventListener('pointerup', aoSoltar, true);
                document.removeEventListener('pointercancel', aoSoltar, true);
            };
            const aoSoltar = event=>{
                if (!arrasto || arrasto.id !== event.pointerId) return;
                const atual = arrasto;
                arrasto = null;
                pararDeOuvir();
                atual.linha.classList.remove('app-toolbar-editor-dragging');
                lista.classList.remove('app-toolbar-editor-sorting');
                if (event.type === 'pointercancel') {
                    atual.retorno.forEach(alvo=>lista.append(alvo));
                    anunciar('Alteração cancelada. ' + this.rotuloBotaoToolbar(atual.el) + ': posição ' + posicaoDe(atual.linha) + ' de ' + lista.children.length + '.');
                    return;
                }
                confirmarArraste();
                atual.linha.focus({ preventScroll: true });
                anunciar(this.rotuloBotaoToolbar(atual.el) + ': posição ' + posicaoDe(atual.linha) + ' de ' + lista.children.length + '.');
            };
            const criarLinha = el=>{
                const linha = document.createElement('div');
                linha.className = 'app-toolbar-editor-row';
                linha.tabIndex = 0;
                linha.setAttribute('role', 'option');
                const alca = document.createElement('span');
                alca.className = 'app-toolbar-editor-grip';
                alca.title = 'Arraste para reordenar';
                alca.setAttribute('aria-hidden', 'true');
                alca.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
                const nome = document.createElement('span');
                nome.className = 'app-toolbar-editor-name';
                linha.append(alca, nome);
                linha.draggable = false;
                alca.draggable = false;
                // No celular o toque longo abria o menu do sistema (pesquisar/selecionar),
                // o que interrompia o arraste no meio do gesto.
                linha.addEventListener('contextmenu', event=>event.preventDefault());
                // Fallback de teclado: o arraste não é acessível a todo mundo.
                linha.addEventListener('keydown', event=>{
                    const passo = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
                    if (!passo || event.ctrlKey || event.metaKey || arrasto) return;
                    event.preventDefault();
                    const antes = posicaoDe(linha);
                    this.moverBotaoToolbar(el, passo);
                    const depois = posicaoDe(linha);
                    if (depois !== antes) anunciar(this.rotuloBotaoToolbar(el) + ': posição ' + depois + ' de ' + lista.children.length + '.');
                });
                alca.addEventListener('pointerdown', event=>{
                    if (arrasto) return;
                    if (event.pointerType === 'mouse' && event.button !== 0) return;
                    event.preventDefault();
                    arrasto = { linha, el, id: event.pointerId, retorno: [...lista.querySelectorAll('.app-toolbar-editor-row')] };
                    linha.classList.add('app-toolbar-editor-dragging');
                    lista.classList.add('app-toolbar-editor-sorting');
                    anunciar(this.rotuloBotaoToolbar(el) + ': arraste para reposicionar e solte para guardar.');
                    document.addEventListener('pointermove', aoMover, true);
                    document.addEventListener('pointerup', aoSoltar, true);
                    document.addEventListener('pointercancel', aoSoltar, true);
                });
                return { linha, nome };
            };
            const desenhar = ()=>{
                const itens = [...this.chavesToolbar().keys()];
                for (const el of [...linhas.keys()]) {
                    if (!itens.includes(el)) { linhas.get(el).linha.remove(); linhas.delete(el); }
                }
                itens.forEach((el, indice)=>{
                    const rotulo = this.rotuloBotaoToolbar(el);
                    let entrada = linhas.get(el);
                    if (!entrada) { entrada = criarLinha(el); linhas.set(el, entrada); }
                    entrada.nome.textContent = rotulo;
                    entrada.linha.setAttribute('aria-label', rotulo + ': posição ' + (indice + 1) + ' de ' + itens.length + '. Arraste para reordenar.');
                    // Reposiciona só quando a linha está fora do lugar: mover um
                    // elemento que já está na posição faz o navegador PERDER o foco.
                    const desejado = lista.children[indice];
                    if (desejado !== entrada.linha) lista.insertBefore(entrada.linha, desejado || null);
                });
            };
            this.notesToolbarEditorRedraw = desenhar;
            desenhar();

            const restaurar = document.createElement('button');
            restaurar.type = 'button';
            restaurar.className = 'app-toolbar-editor-restore';
            restaurar.textContent = 'Restaurar padrão';
            restaurar.addEventListener('click', ()=>this.restaurarOrdemToolbar());
            dialog.append(restaurar);

            dialog.addEventListener("close", ()=>{ pararDeOuvir(); this.notesToolbarEditorRedraw = null; this.notesToolbarEditorRows = null; });
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
            // Mantém a linha digitada acima da barra (quebras de linha não podem
            // esconder o cursor atrás da barra do teclado).
            if (this.notesToolbarTecladoPoll && temFocoNoEditor()) this.rolarCaretParaAcima();
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
        // Garantia na digitação: o poll de 250 ms pode ficar para trás em digitação rápida.
        // Aqui a rolagem é reagendada num frame, então nunca atrasa a linha digitada.
        let pedidoRolagem = 0;
        editorDeNotas()?.addEventListener('input', () => {
            const toolbar = document.getElementById('notesToolbar');
            if (!toolbar?.classList.contains('notes-toolbar-docked')) return;
            cancelAnimationFrame(pedidoRolagem);
            pedidoRolagem = requestAnimationFrame(() => this.rolarCaretParaAcima());
        });
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
        if (editor) editor.style.paddingBottom = (toolbar.offsetHeight + NotesPWA.FOLGA_BARRA_TECLADO) + 'px';
    }
    // ⚡ [FIM: PWA - BARRA DE FERRAMENTAS INLINE, ORDEM E TECLADO]
}

// ============================================
// MODO MOBILE DO BLOCO DE NOTAS
// No mobile a barra de ferramentas SUPERIOR fica escondida por padrao (so a barra
// acoplada ao teclado aparece) e o botao de colapso passa a alternar APENAS os
// chips de notas. A deteccao combina toque (pointer: coarse) com largura.
// ============================================
// 🔄 [INÍCIO: PWA - MODO MOBILE (installModoMobileNotas)]
function installModoMobileNotas(App) {
    const p = App.prototype;
    const superColapso = p.toggleNotesHeaderCollapse;

    p.ehMobile = function () {
        try {
            // Celular = toque (pointer: coarse) E janela estreita. Assim uma janela
            // estreita de desktop NAO entra em modo mobile (mantem a toolbar visible).
            return window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 767;
        } catch (_) { return false; }
    };

    p.aplicarModoMobile = function () {
        const mobile = this.ehMobile();
        document.documentElement.classList.toggle('notes-mobile', mobile);
        const backdrop = document.getElementById('notesModalBackdrop');
        const toolbar = document.getElementById('notesToolbar');
        if (mobile) {
            // No mobile o colapso do cabeçalho não deve esconder a barra do teclado:
            // a toolbar é escondida pelo CSS (só aparece quando acoplada).
            backdrop?.classList.remove('notes-header-collapsed');
            if (toolbar) toolbar.hidden = false;
        } else {
            backdrop?.classList.remove('notes-chips-collapsed');
        }
        this.sincronizarBotaoColapsoChips(Boolean(backdrop?.classList.contains('notes-chips-collapsed')));
    };

    p.sincronizarBotaoColapsoChips = function (recolhido) {
        const botao = document.getElementById('notesHeaderCollapseBtn');
        if (!botao || !this.ehMobile()) return;
        botao.setAttribute('aria-expanded', String(!recolhido));
        botao.title = recolhido ? 'Mostrar notas' : 'Ocultar notas';
        botao.setAttribute('aria-label', botao.title);
    };

    // No mobile o botao de colapso alterna APENAS os chips (a toolbar superior
    // continua escondida por CSS e a barra do teclado nao e afetada).
    p.toggleNotesHeaderCollapse = async function () {
        if (!this.ehMobile()) return superColapso.call(this);
        const backdrop = document.getElementById('notesModalBackdrop');
        if (!backdrop?.classList.contains('active')) return;
        const recolhido = backdrop.classList.toggle('notes-chips-collapsed');
        this.sincronizarBotaoColapsoChips(recolhido);
    };
}

// ============================================
// 🔄 [FIM: PWA - MODO MOBILE (installModoMobileNotas)]
// CAMADA LOCAL DAS FERRAMENTAS EXTRAS / TABELAS
// Mantém as mesmas funcionalidades do sistema, mas sem backend:
// anexos e imagens viram data URLs dentro da própria nota e os
// modelos de nota ficam guardados no dispositivo (LocalStorage).
// ============================================
// 🔄 [INÍCIO: PWA - CAMADA LOCAL DE EXTRAS/TABELAS (installLocalNotesStorage)]
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

// ============================================
// 🔄 [FIM: PWA - CAMADA LOCAL DE EXTRAS/TABELAS (installLocalNotesStorage)]
// AJUSTES PWA PARA NOTAS GRANDES (sem tocar no motor)
// 1) Histórico: o snapshot inicial serializa o documento inteiro em JSON (O(n));
//    em notas grandes isso bloqueava a abertura, então é adiado e capturado antes
//    da primeira edição.
// 2) Rascunho: o motor grava `{ html, base }` — DUAS cópias da nota. Aqui
//    guardamos só o `html` (o `base` nunca era lido) e, em notas muito grandes,
//    nem gravamos: evita estourar a cota do LocalStorage (~5 MB) e o custo de
//    serializar tudo a cada autosave.
// ============================================
// 🔄 [INÍCIO: PWA - AJUSTES DE NOTA GRANDE (installAjustesNotaGrande)]
function installAjustesNotaGrande(App) {
    const p = App.prototype;
    if (p.__ajustesNotaGrandeInstalado) return;
    p.__ajustesNotaGrandeInstalado = true;

    const resetOriginal = p.resetNotesHistory;
    p.resetNotesHistory = function () {
        if (this.notesHistoricoAdiado) {
            this.notesHistoricoAdiado = false;
            this.notesHistory = null;
            this.notesHistoryIndex = -1;
            this.updateNotesHistoryButtons();
            // Se o utilizador editar antes do timer, o `beforeinput` captura o
            // baseline; o `!this.notesHistory` evita apagar o histórico real.
            const projeto = this.currentNotesProjectId;
            clearTimeout(this.notesHistoricoTimer);
            this.notesHistoricoTimer = setTimeout(() => {
                if (!this.notesHistory && this.currentNotesProjectId === projeto) this.resetNotesHistory();
            }, 350);
            return;
        }
        return resetOriginal.call(this);
    };

    p.storeNotesDraft = function () {
        const session = this.notesSession;
        if (!session) return;
        const editor = document.getElementById('notesEditor');
        try {
            if (editor && editor.textContent.length > LIMITE_RASCUNHO) {
                localStorage.removeItem(session.key);
                return;
            }
            localStorage.setItem(session.key, JSON.stringify({ html: this.getCleanNotesHtml() }));
        } catch (_) {
            this.notesStatus('Rascunho local indisponível');
        }
    };
}

// 🔄 [FIM: PWA - AJUSTES DE NOTA GRANDE (installAjustesNotaGrande)]

// 🚀 [INÍCIO: PWA - ATUALIZAÇÃO DO APP (UPDATE NOTIFICATION)]
/**
 * Garante que uma versão NOVA publicada chegue ao dispositivo (o clássico "funciona só
 * no localhost"): o `sw.js` faz `skipWaiting()` no install e `clients.claim()` no activate;
 * AQUI detetamos a versão nova (`updatefound`/`statechange`, `controllerchange` e a
 * mensagem `SW_ATIVADO`), avisamos o usuário e recarregamos UMA vez para aplicar o código.
 * Também verifica atualização a cada 60 s (sessões longas no celular).
 */
function installAtualizacaoPWA(App) {
    if (!App || !App.prototype) return false;

    /** Recarrega uma única vez (`window.__notasRecarregando` evita recargas em loop). */
    App.prototype.recarregarParaNovaVersao = function () {
        if (window.__notasRecarregando) return;
        window.__notasRecarregando = true;
        location.reload();
    };

    /** Aviso VISÍVEL de versão nova, com botão "Atualizar agora". */
    App.prototype.avisarNovaVersao = function (registration) {
        if (document.querySelector('.app-toast.is-update')) return;
        const regiao = document.getElementById('appToastRegion');
        if (!regiao) { this.recarregarParaNovaVersao(); return; }
        const aviso = document.createElement('div');
        aviso.className = 'app-toast is-update';
        aviso.setAttribute('role', 'status');
        const texto = document.createElement('span');
        texto.textContent = 'Nova versão disponível.';
        const atualizar = document.createElement('button');
        atualizar.type = 'button';
        atualizar.className = 'app-toast-action';
        atualizar.textContent = 'Atualizar agora';
        atualizar.addEventListener('click', () => {
            if (registration && registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            this.recarregarParaNovaVersao();
        });
        aviso.append(texto, atualizar);
        regiao.append(aviso);
        // Mesmo sem clique, aplica sozinho (o SW já assumiu o controle com skipWaiting).
        setTimeout(() => this.recarregarParaNovaVersao(), 4000);
    };

    /** Liga a deteção e a reaplicação das atualizações do Service Worker. */
    App.prototype.verificarAtualizacaoSW = function () {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        const tinhaControlador = Boolean(navigator.serviceWorker.controller);
        // Só recarrega se ESTA aba já era controlada (senão é a 1ª instalação).
        const aplicar = () => { if (tinhaControlador) this.recarregarParaNovaVersao(); };

        // (1) Um Service Worker NOVO assumiu o controle desta aba.
        navigator.serviceWorker.addEventListener('controllerchange', aplicar);
        // (2) O próprio SW avisa, no activate, que a versão nova está no controle.
        navigator.serviceWorker.addEventListener('message', evento => {
            if (evento.data && evento.data.type === 'SW_ATIVADO') aplicar();
        });

        navigator.serviceWorker.getRegistration().then(registration => {
            if (!registration) return;
            const observar = trabalhador => {
                if (!trabalhador) return;
                trabalhador.addEventListener('statechange', () => {
                    if (trabalhador.state === 'installed' && navigator.serviceWorker.controller) {
                        this.avisarNovaVersao(registration);
                    }
                });
            };
            registration.addEventListener('updatefound', () => observar(registration.installing));
            observar(registration.installing);
            if (registration.waiting && navigator.serviceWorker.controller) this.avisarNovaVersao(registration);
        }).catch(() => { /* sem registro: o index.html registra no load */ });

        // (3) Sessões longas: procura atualização a cada 60 s (o index.html também
        //     verifica ao carregar e ao voltar para a aba).
        setInterval(() => {
            if (!navigator.serviceWorker.controller) return;
            navigator.serviceWorker.getRegistration()
                .then(registration => registration && registration.update())
                .catch(() => { /* offline: tenta depois */ });
        }, 60000);
    };

    return true;
}
// 🚀 [FIM: PWA - ATUALIZAÇÃO DO APP (UPDATE NOTIFICATION)]

// 🚀 [INÍCIO: PWA - BOOT (DOMContentLoaded)]
// Inicializar a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.notesApp = new NotesPWA();
});
// 🚀 [FIM: PWA - BOOT (DOMContentLoaded)]
