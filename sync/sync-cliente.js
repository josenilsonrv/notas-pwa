/**
 * 🗺️ COMPONENTE: Cliente de sincronização (fila persistida + snapshot/push HTTP)
 * 🎯 OBJETIVO: Manter a nuvem em dia SEM a UI esperar a rede: toda gravação passa pelo
 *              LocalStorage e vira uma `op` numa FILA PERSISTIDA (drenada em ordem e removida
 *              só no `ack`). A seção 7 troca o transporte por WebSocket sem mexer nas regras.
 * 🔗 QUEM DEPENDE DELE: `index.html` (`<script>`), `app.js` (`installNotesFeatures` chama
 *              `installSync`), `conta.js` (chama `syncAoEntrar` / `syncAoSair`) e os testes
 *              `sync_snapshot.cjs` / `sync_completo.cjs`.
 *
 * Estratégia de cota (decisão do dono — opção C): o snapshot TENTA guardar a nota inteira no
 * aparelho; o que não couber fica marcado `somenteNuvem` (só metadados locais) e é baixado ao
 * abrir a nota — nunca enche o armário e nunca perde nota.
 */
// 🔄 [INÍCIO: SYNC - CLIENTE (FILA + SNAPSHOT/PUSH)]
function installSync(App) {
    const p = App.prototype;
    const FILA = 'notas-pwa-fila-sync';
    const MARCA_CONTA = 'notas-pwa-sync-conta';
    const TAMANHO_LOTE = 60;
    // Identificador único e PERSISTENTE da operação (enviado como `id_local`). O `seq` é só
    // a ordem local; o `op_id` sobrevive a mesclas/reaquisitamentos da fila.
    const opId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'op-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    // `id_local` estável de um item (itens legados sem `op_id` caem no `seq`).
    const idLocalDe = item => String(item.op_id || item.seq);

    // 💾 [INÍCIO: SYNC - FILA DE PENDÊNCIAS (persistida)]
    p.syncLer = function (chave, padrao) {
        try {
            const bruto = localStorage.getItem(chave);
            return bruto ? JSON.parse(bruto) : padrao;
        } catch (_) { return padrao; }
    };

    p.syncFilaLer = function () {
        const lista = this.syncLer(FILA, []);
        return Array.isArray(lista) ? lista : [];
    };

    p.syncFilaGravar = function (lista) {
        try {
            localStorage.setItem(FILA, JSON.stringify(lista));
        } catch (_) {
            // Sem espaço para persistir: a fila segue em memória (o texto NÃO se perde) e o
            // estado reflete a FALHA de persistência — nunca "sincronizado".
            this.syncEstado('erro', lista.length);
            return;
        }
        this.syncEstado((window.notasConta.sync || {}).estado, lista.length);
    };

    /** Itens da fila que pertencem à conta ATUAL (as outras ficam preservadas, sem envio). */
    p.syncFilaDaConta = function () {
        const email = (window.notasConta && window.notasConta.email) || '';
        return this.syncFilaLer().filter(item => (item.conta || '') === email);
    };

    /** Associa itens LEGADOS (sem `conta`) à marca persistida da conta, se houver. */
    p.syncMigrarFilaLegada = function () {
        const email = (window.notasConta && window.notasConta.email) || '';
        let marca = '';
        try { marca = localStorage.getItem(MARCA_CONTA) || ''; } catch (_) { marca = ''; }
        const dono = email || marca;
        const fila = this.syncFilaLer();
        let mudou = false;
        for (const item of fila) {
            if (!item.conta && dono) { item.conta = dono; mudou = true; }
        }
        if (mudou) this.syncFilaGravar(fila);
    };

    /** Há sessão? (deslogado não enfileira nada e o offline segue intacto) */
    p.syncAtivo = function () { return Boolean(window.notasConta && window.notasConta.logado); };

    /** Estado do sync no espelho da conta — é o que o diálogo mostra (sem hora). */
    p.syncEstado = function (estado, pendentes) {
        window.notasConta = window.notasConta || { logado: false, email: '', csrf: '', sync: {} };
        window.notasConta.sync = { estado: estado || 'local', pendentes: Number(pendentes || 0) };
        if (typeof this.contaAtualizarDialogo === 'function') this.contaAtualizarDialogo();
    };

    /**
     * Enfileira UMA operação. A fila é gravada ANTES do envio: se o app fechar agora, a
     * alteração não se perde (ela sobe quando houver sessão de novo).
     */
    p.syncEnfileirar = function (entidade, acao, id, dados, baseRev) {
        if (!this.syncAtivo() || this.syncAplicando) return false;
        const fila = this.syncFilaLer();
        const maior = fila.reduce((valor, item) => Math.max(valor, Number(item.seq) || 0), 0);
        fila.push({
            seq: maior + 1,
            op_id: opId(),
            conta: window.notasConta.email || '',
            entidade,
            acao,
            id: String(id),
            dados: dados || {},
            base_rev: baseRev === undefined ? null : baseRev,
            tentativas: 0,
            criado_em: new Date().toISOString()
        });
        this.syncFilaGravar(fila);
        // Registra a alteração MESMO antes de conhecer o estado da conta (`syncPronto`):
        // o que fica adiado é só o ENVIO, até a reconciliação inicial terminar — nada se perde.
        if (this.syncPronto) this.syncAgendarDrenagem();
        return true;
    };

    /** Debounce: várias digitações viram UM push. */
    p.syncAgendarDrenagem = function (atraso = 700) {
        clearTimeout(this.syncDrenoTimer);
        this.syncDrenoTimer = setTimeout(() => { this.syncDrenar().catch(() => { }); }, atraso);
    };
    // 💾 [FIM: SYNC - FILA DE PENDÊNCIAS (persistida)]

    // 🔄 [INÍCIO: SYNC - ENVIO (push HTTP)]
    /** POST /api/sync/push (sessão pelo cookie `HttpOnly`; escrita com `X-CSRF`). */
    p.syncEmpurrar = async function (ops) {
        if (!ops || !ops.length) return { acks: [], conflitos: [], rev_global: null };
        let resposta;
        try {
            resposta = await fetch('/api/sync/push', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF': (window.notasConta && window.notasConta.csrf) || ''
                },
                body: JSON.stringify({ ops })
            });
        } catch (_) {
            const offline = new Error('sem rede');
            offline.status = 0;
            throw offline;
        }
        if (!resposta.ok) {
            const erro = new Error('push recusado');
            erro.status = resposta.status;
            throw erro;
        }
        return resposta.json();
    };

    /**
     * Drena a fila EM ORDEM (por `seq`). Sai do armário SÓ o que teve `ack` ou foi resolvido por
     * conflito — alterações enfileiradas DURANTE o envio permanecem e disparam um novo envio.
     */
    p.syncDrenar = async function () {
        if (!this.syncAtivo() || this.syncDrenando) return;
        const email = (window.notasConta && window.notasConta.email) || '';
        const fila = this.syncFilaDaConta();
        if (!fila.length) { this.syncEstado('sincronizado', 0); return; }
        this.syncDrenando = true;
        this.syncEstado('sincronizando', fila.length);
        try {
            const lote = fila
                .slice()
                .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0))
                .slice(0, TAMANHO_LOTE)
                .map(item => ({
                    entidade: item.entidade,
                    acao: item.acao,
                    id: item.id,
                    base_rev: item.base_rev,
                    dados: item.dados,
                    id_local: idLocalDe(item)
                }));
            const corpo = await this.syncEmpurrar(lote);
            const confirmados = new Set((corpo.acks || []).map(ack => String(ack.id_local)));
            const conflitoPorId = {};
            (corpo.conflitos || []).forEach(c => { conflitoPorId[String(c.id_local)] = c; });
            // RELÊ a fila DEPOIS do envio: itens novos (adicionados enquanto aguardávamos a rede)
            // e itens de OUTRAS contas não podem ser descartados. Só saem os confirmados e os
            // resolvidos por conflito da conta atual.
            const restantes = [];
            for (const item of this.syncFilaLer()) {
                const idLocal = idLocalDe(item);
                if ((item.conta || '') !== email) { restantes.push(item); continue; }
                if (confirmados.has(idLocal)) continue;
                const conflito = conflitoPorId[idLocal];
                if (conflito) {
                    // O servidor venceu o LWW: preserva cópia de recuperação do texto divergente
                    // e aplica a versão vencedora pelo MESMO fluxo (nunca reenvia o antigo).
                    this.syncPreservarRecuperacao(item, conflito);
                    this.syncAplicarItem(conflito);
                    continue;
                }
                restantes.push(item);
            }
            this.syncFilaGravar(restantes);
            this.syncDrenoFalhas = 0;
        } catch (erro) {
            // Falha temporária (rede) ou sessão expirada: a fila PERMANECE intacta.
            if (erro && erro.status === 401) {
                this.syncEstado('expirada', this.syncFilaDaConta().length);
                return;
            }
            this.syncEstado('offline', this.syncFilaDaConta().length);
            this.syncAgendarDrenagem(this.syncBackoff());
            return;
        } finally {
            this.syncDrenando = false;
        }
        const pendentes = this.syncFilaDaConta().length;
        this.syncEstado(pendentes ? 'offline' : 'sincronizado', pendentes);
        if (pendentes) this.syncAgendarDrenagem(400);
    };

    /** Espera progressiva para reenvio (1s → 30s), reiniciada a cada sucesso. */
    p.syncBackoff = function () {
        const falhas = (Number(this.syncDrenoFalhas) || 0) + 1;
        this.syncDrenoFalhas = falhas;
        return Math.min(30000, 1000 * Math.pow(2, Math.min(falhas, 5)));
    };

    /** Guarda o texto divergente ANTES de a versão vencedora substituí-lo (recuperação). */
    p.syncPreservarRecuperacao = function (item, conflito) {
        const dados = item && item.dados;
        if (!dados || typeof dados.conteudo_html !== 'string') return;
        try {
            const chave = 'notas-pwa-sync-recuperacao-' + String(item.id);
            const atual = JSON.parse(localStorage.getItem(chave) || '[]');
            atual.push({
                em: new Date().toISOString(),
                entidade: item.entidade,
                id: item.id,
                dados: dados
            });
            localStorage.setItem(chave, JSON.stringify(atual.slice(-20)));
        } catch (_) { /* cota: a recuperação é best-effort */ }
    };
    // 🔄 [FIM: SYNC - ENVIO (push HTTP)]

    // 🔄 [INÍCIO: SYNC - RECEBIMENTO (snapshot HTTP + aplicação local)]
    /** GET `/api/sync/snapshot` (0 = carga inicial · >0 = delta, COM tombstones). */
    p.syncSnapshot = async function (desdeRev = 0) {
        let resposta;
        try {
            resposta = await fetch('/api/sync/snapshot?desde_rev=' + Number(desdeRev || 0), {
                credentials: 'same-origin'
            });
        } catch (_) {
            const offline = new Error('sem rede');
            offline.status = 0;
            throw offline;
        }
        if (!resposta.ok) {
            const erro = new Error('snapshot recusado');
            erro.status = resposta.status;
            throw erro;
        }
        const corpo = await resposta.json();
        this.syncAplicarEntidades(corpo.entidades || {}, Number(desdeRev || 0) > 0);
        return corpo;
    };

    /** Busca UMA entidade na nuvem (usado quando a nota está `somenteNuvem`). */
    p.syncBaixarEntidade = async function (entidade, id) {
        const resposta = await fetch(
            '/api/sync/entidade/' + encodeURIComponent(entidade) + '/' + encodeURIComponent(id),
            { credentials: 'same-origin' }
        );
        if (!resposta.ok) return null;
        return resposta.json();
    };

    p.syncBaixarNota = async function (id) {
        const registro = await this.syncBaixarEntidade('notas', id);
        return registro && registro.dados ? String(registro.dados.conteudo_html || '') : '';
    };

    /** Nuvem -> formato local da nota. */
    const notaLocal = registro => {
        const dados = registro.dados || {};
        return {
            id: String(registro.id),
            nome: dados.nome || 'Nova nota',
            notas: String(dados.conteudo_html || ''),
            pastaId: dados.pasta_id === undefined ? null : dados.pasta_id,
            accent: dados.accent || '',
            criadaEm: dados.criada_em || registro.updated_at,
            atualizadaEm: dados.atualizada_em || registro.updated_at
        };
    };

    /**
     * Aplica o que veio da nuvem. Marca `syncAplicando` para NADA voltar para a fila
     * (senão a aplicação viraria eco infinito entre os aparelhos).
     */
    p.syncAplicarEntidades = function (entidades, delta) {
        const anterior = this.syncAplicando;
        this.syncAplicando = true;
        // Cada entidade é aplicada de forma INDEPENDENTE: um applier que falhe (ex.: o editor
        // no meio do render) NUNCA impede as outras entidades de chegarem.
        const passo = (nome, acao) => {
            try { acao(); } catch (erro) { console.warn('[sync] falha ao aplicar ' + nome + ':', erro); }
        };
        try {
            if (entidades.notas) passo('notas', () => this.syncAplicarNotas(entidades.notas, delta));
            if (entidades.notas && entidades.notas.length) {
                // Só a NOTA ABERTA fica "velha" com a aplicação: as outras nem têm editor na tela.
                // Enquanto a flag estiver ligada, nenhum save desse editor entra na fila (senão o
                // documento VELHO apaga o que acabou de chegar da nuvem — P98).
                const backdrop = document.getElementById('notesModalBackdrop');
                const editorAberto = Boolean(backdrop && backdrop.classList.contains('active'));
                const aberta = editorAberto ? this.currentNotesProjectId : null;
                if (aberta && entidades.notas.some(registro => String(registro.id) === String(aberta))) {
                    this.syncEstale = true;
                } else if (!editorAberto) {
                    // Editor FECHADO: não existe documento "velho" na tela — e o `syncRefazerEditor`
                    // (que limparia a flag) sai cedo. Sem este `else`, a flag ficava PRESA e NENHUMA
                    // edição seguinte subia (o aparelho salvava local e a nuvem ficava vazia —
                    // achado do `sync_websocket.cjs`).
                    this.syncEstale = false;
                }
                this.syncRefazerEditor(entidades.notas).catch(() => { });
            }
            if (entidades.configuracoes) passo('configuracoes', () => this.syncAplicarConfiguracoes(entidades.configuracoes));
            if (entidades.pastas) passo('pastas', () => this.syncAplicarPastas(entidades.pastas));
            if (entidades.modelos) passo('modelos', () => this.syncAplicarModelos(entidades.modelos));
            if (entidades.mapas) passo('mapas', () => this.syncAplicarMapas(entidades.mapas));
        } finally {
            this.syncAplicando = anterior;
        }
        if (typeof this.renderNotesNav === 'function') this.renderNotesNav();
        // A tela de PASTAS (cartões) também precisa refletir o que chegou da nuvem em tempo
        // real — sem isto, a pasta criada no outro aparelho só aparecia depois de um F5.
        if (typeof this.renderPastas === 'function') this.renderPastas();
        const areaMapa = document.getElementById('mapaArea');
        if (typeof this.renderArea === 'function' && areaMapa && !areaMapa.hidden) {
            // A edição inline do título de um nó vive SÓ no DOM (só é confirmada no Enter/Esc/blur):
            // o `renderArea` reconstrói o canvas do zero e apagaria o que o usuário está digitando.
            // Captura nó + texto + caret ANTES e reabre a edição no MESMO ponto DEPOIS (nada se perde).
            const edicao = this.syncCapturarEdicaoMapa();
            this.renderArea();
            if (edicao) this.syncRestaurarEdicaoMapa(edicao);
        }
    };

    p.syncAplicarNotas = function (registros) {
        // Nada a aplicar: NÃO mexe no aparelho. (Durante o boot o app pode estar com a lista
        // em memória ainda incompleta; gravar aqui zeraria o texto da nota — achado do teste.)
        if (!registros || !registros.length) return;
        const lista = (this.projectsData || []).slice();
        for (const registro of registros) {
            const indice = lista.findIndex(nota => String(nota.id) === String(registro.id));
            if (registro.deleted_at) {
                if (indice >= 0) lista.splice(indice, 1);
                if (String(this.currentNotesProjectId) === String(registro.id)) this.currentNotesProjectId = null;
                continue;
            }
            const nota = notaLocal(registro);
            if (indice >= 0) {
                // Preserva o texto local se a nuvem veio sem conteúdo (nota somente-metadados)
                // E preserva a data de edição MAIS RECENTE: aplicar uma versão antiga (ex.: a
                // nota vazia que o próprio aparelho acabou de enviar) não pode "rebaixar" a data.
                const anterior = lista[indice];
                const dataDe = valor => {
                    if (!valor) return 0;
                    const d = new Date(String(valor).replace('Z', '+00:00'));
                    return isNaN(d) ? 0 : d.getTime();
                };
                const mesclada = Object.assign({}, anterior, nota, {
                    notas: nota.notas || anterior.notas || ''
                });
                if (dataDe(nota.atualizadaEm) < dataDe(anterior.atualizadaEm)) {
                    mesclada.atualizadaEm = anterior.atualizadaEm;
                }
                lista[indice] = mesclada;
            } else {
                lista.push(nota);
            }
        }
        if (!lista.length) lista.push({ id: 'local', nome: 'Minhas notas', notas: '', pastaId: null });
        this.gravarNotasLocaisComCota(lista);
        if (!lista.some(nota => String(nota.id) === String(this.currentNotesProjectId))) {
            this.currentNotesProjectId = lista[0].id;
        }
    };

    // 🔄 [INÍCIO: SYNC - PRESERVAÇÃO DE CURSOR/ROLAGEM (editor de notas)]
    /**
     * Captura a posição do caret e a rolagem do editor de notas ABERTO antes de um re-render.
     * A marca guarda o ÍNDICE da `.notes-line` (+ `noteId`, para reencontrá-la) e o offset em
     * CARACTERES dentro do `.notes-line-text` — o mapa sobrevive a reescrever o `innerHTML`,
     * porque é recomposto a partir do conteúdo. Sem seleção no editor, devolve `null`.
     */
    function capturarCursorNota() {
        const editor = document.getElementById('notesEditor');
        if (!editor) return null;
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount || !editor.contains(selection.anchorNode)) return null;
        const range = selection.getRangeAt(0);
        const linha = (range.startContainer.nodeType === 1
            ? range.startContainer
            : range.startContainer.parentElement)?.closest?.('.notes-line');
        if (!linha) return null;
        const box = linha.querySelector('.notes-line-text');
        if (!box) return null;
        let offset = 0;
        try {
            const r = document.createRange();
            r.selectNodeContents(box);
            r.setEnd(range.startContainer, range.startOffset);
            offset = r.toString().length;
        } catch (_) { offset = 0; }
        const linhas = [...editor.children].filter(el => el.classList.contains('notes-line'));
        const container = document.getElementById('notesEditorContainer');
        return {
            indice: linhas.indexOf(linha),
            noteId: linha.dataset.noteId || null,
            offset,
            scroll: container ? container.scrollTop : 0
        };
    }

    /** Repõe o caret (e a rolagem) capturados — chamado DEPOIS do re-render do editor. */
    p.restaurarCursorNota = function (captura) {
        if (!captura) return;
        const editor = document.getElementById('notesEditor');
        if (!editor) return;
        const linhas = [...editor.children].filter(el => el.classList.contains('notes-line'));
        if (!linhas.length) return;
        const linha = (captura.noteId && linhas.find(el => el.dataset.noteId === captura.noteId))
            || linhas[Math.min(Math.max(captura.indice, 0), linhas.length - 1)];
        const box = linha && linha.querySelector('.notes-line-text');
        if (!box) return;
        // Percorre os nós de TEXTO somando os comprimentos até chegar ao offset salvo.
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        let restante = captura.offset;
        while (node && restante > node.length) { restante -= node.length; node = walker.nextNode(); }
        const range = document.createRange();
        if (node) range.setStart(node, Math.min(restante, node.length));
        else range.setStart(box, 0);
        range.collapse(true);
        editor.focus({ preventScroll: true });
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const container = document.getElementById('notesEditorContainer');
        if (container) container.scrollTop = captura.scroll;
        if (typeof this.rememberNotesSelection === 'function') this.rememberNotesSelection();
        if (typeof this.updateNotesToolbarState === 'function') this.updateNotesToolbarState();
    };
    // 🔄 [FIM: SYNC - PRESERVAÇÃO DE CURSOR/ROLAGEM (editor de notas)]

    /**
     * Depois de aplicar notas, o EDITOR ABERTO precisa refletir o que veio da nuvem — senão o
     * autosave seguinte do motor regravaria o conteúdo velho por cima (achado do
     * `sync_snapshot.cjs`: o 2º aparelho recebia a nota e ela voltava vazia).
     */
    p.syncRefazerEditor = function (registros) {
        // Autosave AGENDADO antes desta aplicação carrega o estado antigo: cancela de todo jeito.
        clearTimeout(this.notesSaveTimer);
        clearTimeout(this.notesDraftTimer);
        // Só re-renderiza se a NOTA ESTIVER ABERTA: com o app na tela de Pastas, o editor está
        // escondido e abrir a nota seria trocar de tela sem o usuário pedir (P98).
        const backdrop = document.getElementById('notesModalBackdrop');
        if (!backdrop || !backdrop.classList.contains('active')) return Promise.resolve();
        const id = this.currentNotesProjectId;
        if (!id) return Promise.resolve();
        const tocada = (registros || []).some(registro => String(registro.id) === String(id) && !registro.deleted_at);
        if (!tocada) return Promise.resolve();
        // Neutraliza a sessão (o "fechar" da reabertura não pode regravar o documento velho) e
        // reabre a nota pelo CAMINHO DO APP: render, sessão e chips ficam consistentes.
        if (this.notesSession) {
            this.notesSession.saved = this.getCleanNotesHtml();
            this.notesSession.needsModelMigration = false;
        }
        // A reabertura reescreve o `innerHTML` do editor (o caret e a rolagem se perdem): captura a
        // posição ANTES e repõe DEPOIS. O `setTimeout` de 150 ms vence o `placeNotesCursorAtEnd`
        // (100 ms, só no desktop) disparado dentro de `openNotesModal` — a última palavra é a nossa.
        const captura = capturarCursorNota();
        return Promise.resolve(this.openNotesModal(id)).then(() => {
            this.syncEstale = false;
            if (!captura) return;
            setTimeout(() => {
                // Entre a captura e a reposição o usuário pode ter FECHADO o modal ou trocado de
                // nota: repor o caret aí seria pior que não repor.
                const backdrop = document.getElementById('notesModalBackdrop');
                if (!backdrop || !backdrop.classList.contains('active')) return;
                if (String(this.currentNotesProjectId) !== String(id)) return;
                this.restaurarCursorNota(captura);
            }, 150);
        });
    };

    /** Ajustes: o `v` guarda o TEXTO CRU do aparelho (lossless, sem reinterpretar JSON). */
    p.syncAplicarConfiguracoes = function (registros) {
        for (const registro of registros) {
            const chave = 'notas-pwa-' + registro.id;
            try {
                if (registro.deleted_at) localStorage.removeItem(chave);
                else localStorage.setItem(chave, String((registro.dados || {}).v ?? ''));
            } catch (_) { /* sem espaço: ignora aquele ajuste */ }
        }
    };

    /** Pastas (`notas-pwa-mapa-pastas`): a linha guarda a pasta CRUA em `item`. */
    p.syncAplicarPastas = function (registros) {
        const atual = this.syncLer('notas-pwa-mapa-pastas', []);
        const lista = Array.isArray(atual) ? atual.slice() : [];
        for (const registro of registros) {
            const indice = lista.findIndex(pasta => String(pasta.id) === String(registro.id));
            if (registro.deleted_at) {
                if (indice >= 0) lista.splice(indice, 1);
                continue;
            }
            const pasta = Object.assign({}, (registro.dados || {}).item || {}, { id: String(registro.id) });
            if (indice >= 0) lista[indice] = pasta;
            else lista.push(pasta);
        }
        try { localStorage.setItem('notas-pwa-mapa-pastas', JSON.stringify(lista)); } catch (_) { /* cota */ }
    };

    /** Modelos: `tipo` decide a chave local (`notas-pwa-templates` ou `...-mapa-templates`). */
    p.syncAplicarModelos = function (registros) {
        const porTipo = { nota: 'notas-pwa-templates', mapa: 'notas-pwa-mapa-templates' };
        for (const tipo of Object.keys(porTipo)) {
            const chave = porTipo[tipo];
            const atual = this.syncLer(chave, []);
            const lista = Array.isArray(atual) ? atual.slice() : [];
            for (const registro of registros.filter(item => (item.dados || {}).tipo === tipo)) {
                const indice = lista.findIndex(item => String(item.id) === String(registro.id));
                if (registro.deleted_at) {
                    if (indice >= 0) lista.splice(indice, 1);
                    continue;
                }
                const item = Object.assign({}, (registro.dados || {}).item || {}, { id: String(registro.id) });
                if (indice >= 0) lista[indice] = item;
                else lista.push(item);
            }
            try { localStorage.setItem(chave, JSON.stringify(lista)); } catch (_) { /* cota */ }
        }
    };

    /** Mapas: índice em `notas-pwa-maps` + o grafo em `notas-pwa-mapa-<id>`. */
    p.syncAplicarMapas = function (registros) {
        const atual = this.syncLer('notas-pwa-maps', []);
        const lista = Array.isArray(atual) ? atual.slice() : [];
        for (const registro of registros) {
            const dados = registro.dados || {};
            const indice = lista.findIndex(item => String(item.id) === String(registro.id));
            if (registro.deleted_at) {
                if (indice >= 0) lista.splice(indice, 1);
                try { localStorage.removeItem('notas-pwa-mapa-' + registro.id); } catch (_) { /* ok */ }
                continue;
            }
            const item = Object.assign({}, dados.item || {}, {
                id: String(registro.id),
                nome: dados.nome || (dados.item || {}).nome || 'Mapa'
            });
            if (indice >= 0) lista[indice] = item;
            else lista.push(item);
            if (dados.grafo) {
                try { localStorage.setItem('notas-pwa-mapa-' + registro.id, JSON.stringify(dados.grafo)); }
                catch (_) { /* cota: o grafo volta no próximo snapshot */ }
            }
        }
        try { localStorage.setItem('notas-pwa-maps', JSON.stringify(lista)); } catch (_) { /* cota */ }
    };

    // 🔄 [INÍCIO: SYNC - PRESERVAÇÃO DA EDIÇÃO INLINE DO NÓ (mapa)]
    /**
     * Captura a EDIÇÃO INLINE de um nó do Mapa (id + texto digitado + offset do caret) ANTES de um
     * re-render. O texto digitado só vive no DOM (é confirmado no Enter/Esc/blur), então o
     * `renderArea` — que reconstrói o canvas do zero — apagaria o que o usuário está escrevendo.
     */
    p.syncCapturarEdicaoMapa = function () {
        const idNo = this.mapaEditandoId;
        if (!idNo) return null;
        const texto = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + idNo + '"] .mapa-no-texto');
        if (!texto) return null;
        // Offset em CARACTERES dentro do título (o `contenteditable` é `plaintext-only`).
        let offset = String(texto.textContent || '').length;
        const selecao = window.getSelection ? window.getSelection() : null;
        if (selecao && selecao.rangeCount && texto.contains(selecao.anchorNode)) {
            const faixa = selecao.getRangeAt(0);
            try {
                const r = document.createRange();
                r.selectNodeContents(texto);
                r.setEnd(faixa.startContainer, faixa.startOffset);
                offset = r.toString().length;
            } catch (_) { /* mantém o fim do texto */ }
        }
        return { idNo, titulo: texto.textContent || '', offset };
    };

    /**
     * Repõe a edição inline capturada DEPOIS do re-render: salva o texto que o usuário digitou (a
     * edição dele é a MAIS NOVA — vence por LWW na nuvem, igual ao Enter), reabre a edição no MESMO
     * nó e devolve o caret à posição original (o `iniciarEdicao` selecionaria tudo).
     */
    p.syncRestaurarEdicaoMapa = function (edicao) {
        if (!edicao) return;
        const grafo = this.mapaCanvasGrafo;
        const existe = grafo && (grafo.nos || []).some(no => String(no.id) === String(edicao.idNo));
        if (!existe) return;
        if (typeof this.mapaCommitarTituloNo === 'function') this.mapaCommitarTituloNo(edicao.idNo, edicao.titulo);
        const interacao = window.MapaMentalInteracao;
        if (!interacao || typeof interacao.iniciarEdicao !== 'function') return;
        // Assíncrono (como `iniciarEdicaoDepois`): o DOM já precisa existir depois do render.
        setTimeout(() => {
            if (interacao.iniciarEdicao.call(this, edicao.idNo) === false) return;
            const texto = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + edicao.idNo + '"] .mapa-no-texto');
            const selecao = window.getSelection ? window.getSelection() : null;
            if (!texto || !selecao) return;
            const walker = document.createTreeWalker(texto, NodeFilter.SHOW_TEXT);
            let node = walker.nextNode();
            let restante = edicao.offset;
            while (node && restante > node.length) { restante -= node.length; node = walker.nextNode(); }
            const faixa = document.createRange();
            if (node) faixa.setStart(node, Math.min(restante, node.length));
            else faixa.setStart(texto, 0);
            faixa.collapse(true);
            selecao.removeAllRanges();
            selecao.addRange(faixa);
        }, 0);
    };
    // 🔄 [FIM: SYNC - PRESERVAÇÃO DA EDIÇÃO INLINE DO NÓ (mapa)]

    /** Aplica UMA versão do servidor (usada quando o conflito resolve para o servidor). */
    p.syncAplicarItem = function (conflito) {
        const versao = conflito.versao_atual || {};
        if (versao.dados === null || versao.dados === undefined) return;
        const registro = {
            id: conflito.id,
            dados: versao.dados,
            updated_at: versao.updated_at,
            deleted_at: versao.deleted_at || null
        };
        const anterior = this.syncAplicando;
        this.syncAplicando = true;
        try {
            if (conflito.entidade === 'notas') this.syncAplicarNotas([registro]);
            else if (conflito.entidade === 'configuracoes') this.syncAplicarConfiguracoes([registro]);
            else if (conflito.entidade === 'pastas') this.syncAplicarPastas([registro]);
            else if (conflito.entidade === 'modelos') this.syncAplicarModelos([registro]);
            else if (conflito.entidade === 'mapas') this.syncAplicarMapas([registro]);
        } finally {
            this.syncAplicando = anterior;
        }
    };

    /**
     * Grava a lista de notas respeitando a COTA (opção C): tenta tudo; o que não couber vira
     * `somenteNuvem` (só os metadados ficam no aparelho e o texto é baixado ao abrir a nota).
     */
    p.gravarNotasLocaisComCota = function (lista) {
        const cabe = candidata => {
            try { localStorage.setItem('notas-pwa-notes', JSON.stringify(candidata)); return true; }
            catch (_) { return false; }
        };
        if (cabe(lista)) {
            this.projectsData = lista;
            if (this.currentNotesProjectId) this.marcarNotaAtiva(this.currentNotesProjectId);
            return lista;
        }
        const porTamanho = lista.slice().sort((a, b) => String(b.notas || '').length - String(a.notas || '').length);
        for (const nota of porTamanho) {
            if (!String(nota.notas || '').length) continue;
            nota.somenteNuvem = true;
            nota.notas = '';
            if (cabe(lista)) break;
        }
        try { localStorage.setItem('notas-pwa-notes', JSON.stringify(lista)); } catch (_) { /* segue em memória */ }
        this.projectsData = lista;
        return lista;
    };
    // 🔄 [FIM: SYNC - RECEBIMENTO (snapshot HTTP + aplicação local)]

    // 🔄 [INÍCIO: SYNC - COLETA E 1º LOGIN (local -> nuvem)]
    /** A nota local -> payload da nuvem (nomes batem com as colunas geradas do schema). */
    p.syncDadosDaNota = function (nota) {
        return {
            nome: nota.nome || 'Nova nota',
            pasta_id: nota.pastaId === undefined ? null : nota.pastaId,
            accent: nota.accent || '',
            conteudo_html: String(nota.notas || ''),
            criada_em: nota.criadaEm || '',
            // A data de EDIÇÃO nunca é inventada: sem data confiável, o campo fica vazio e
            // a regra LWW do servidor preserva a versão já confirmada (não a faz "vencer").
            atualizada_em: nota.atualizadaEm || ''
        };
    };

    p.syncEnfileirarNota = function (nota) {
        return this.syncEnfileirar('notas', 'upsert', String(nota.id), this.syncDadosDaNota(nota));
    };

    /**
     * Varre o aparelho e devolve UMA op por item (é o "sobe tudo" do 1º login). O mapa de
     * chaves (`sync/chaves.js`) decide o que entra: `entidade: null` fica de fora.
     */
    p.syncColetarOps = function () {
        const ops = [];
        const semBase = { base_rev: null, id_local: '' };
        // A lista de notas vive em MEMÓRIA (`projectsData`); se ela ainda estiver vazia
        // (corrida de boot), lemos do ARMAZENAMENTO — a coleta nunca pode ficar incompleta.
        const notas = (this.projectsData && this.projectsData.length)
            ? this.projectsData
            : this.lerNotasLocais();
        (notas || []).forEach(nota => ops.push(Object.assign({
            entidade: 'notas', acao: 'upsert', id: String(nota.id), dados: this.syncDadosDaNota(nota)
        }, semBase)));

        const pastas = this.syncLer('notas-pwa-mapa-pastas', []);
        (Array.isArray(pastas) ? pastas : []).forEach(pasta => ops.push(Object.assign({
            entidade: 'pastas', acao: 'upsert', id: String(pasta.id),
            dados: { nome: pasta.nome || '', item: pasta }
        }, semBase)));

        const indice = this.syncLer('notas-pwa-maps', []);
        (Array.isArray(indice) ? indice : []).forEach(item => ops.push(Object.assign({
            entidade: 'mapas', acao: 'upsert', id: String(item.id),
            dados: {
                nome: item.nome || '',
                pasta_id: item.pastaId === undefined ? null : item.pastaId,
                grafo: this.syncLer('notas-pwa-mapa-' + item.id, null),
                item
            }
        }, semBase)));

        [['nota', 'notas-pwa-templates'], ['mapa', 'notas-pwa-mapa-templates']].forEach(([tipo, chave]) => {
            const modelos = this.syncLer(chave, []);
            (Array.isArray(modelos) ? modelos : []).forEach(item => ops.push(Object.assign({
                entidade: 'modelos', acao: 'upsert', id: String(item.id),
                dados: { tipo, nome: item.name || item.nome || '', item }
            }, semBase)));
        });

        // Ajustes: TODA chave mapeada para `configuracoes`, guardando o TEXTO CRU do aparelho.
        if (typeof NotasSyncChaves !== 'undefined') {
            NotasSyncChaves.chavesSincronizadas().forEach(chave => {
                const destino = NotasSyncChaves.destinoDaChave(chave);
                if (!destino || destino.entidade !== 'configuracoes') return;
                let cru = null;
                try { cru = localStorage.getItem(chave); } catch (_) { cru = null; }
                if (cru === null) return;
                ops.push(Object.assign({
                    entidade: 'configuracoes', acao: 'upsert', id: destino.chave, dados: { v: cru }
                }, semBase));
            });
        }
        return ops;
    };

    /** Sobe TUDO em lotes, mostrando o progresso discreto no diálogo de conta. */
    p.syncSubirTudo = async function () {
        const ops = this.syncColetarOps();
        if (!ops.length) return { enviados: 0 };
        let enviados = 0;
        for (let inicio = 0; inicio < ops.length; inicio += TAMANHO_LOTE) {
            const lote = ops.slice(inicio, inicio + TAMANHO_LOTE);
            // O 1º login é um LOTE GRANDE: continua pelo `push` HTTP (o caminho do plano para a
            // carga inicial). O socket fica com o caminho quente, op a op, depois disso.
            await EMPURRAR_HTTP.call(this, lote);
            enviados += lote.length;
            this.syncEstado('sincronizando', ops.length - enviados);
        }
        return { enviados };
    };

    /**
     * Ao ENTRAR na conta (chamado pelo `conta.js`):
     *  1) traz o que existe na nuvem (aplicação local);
     *  2) se este aparelho ainda não subiu para ESTA conta, sobe tudo em silêncio
     *     (conta vazia ou não: o servidor resolve item a item por LWW — nada é perdido);
     *  3) drena a fila de pendências.
     */
    p.syncAoEntrar = async function () {
        if (!this.syncAtivo()) return false;
        // Migração idempotente: associa pendências legadas (sem `conta`) à marca da conta.
        this.syncMigrarFilaLegada();
        // ESPERA O BOOT TERMINAR: a lista de notas vive em memória (`projectsData`) e é o
        // `init()` que a monta; `window.__notasPronto` é o sinal que o próprio app publica no
        // fim. Sem esta espera, um login logo no boot subiria um retrato INCOMPLETO do aparelho
        // (achado do `sync_snapshot.cjs`: o 1º login mandava a nota vazia).
        const limite = Date.now() + 5000;
        while (!window.__notasPronto && Date.now() < limite) {
            await new Promise(acordar => setTimeout(acordar, 50));
        }
        this.syncEstado('sincronizando', this.syncFilaLer().length);
        try {
            await this.syncSnapshot(0);
            let marca = '';
            try { marca = localStorage.getItem(MARCA_CONTA) || ''; } catch (_) { marca = ''; }
            if (marca !== window.notasConta.email) {
                await this.syncSubirTudo();
                try { localStorage.setItem(MARCA_CONTA, window.notasConta.email); } catch (_) { /* privado */ }
            }
            await this.syncDrenar();
            this.syncPronto = true;   // o aparelho já conhece o estado da conta
            return true;
        } catch (erro) {
            this.syncEstado(erro && erro.status === 401 ? 'expirada' : 'offline', this.syncFilaLer().length);
            return false;
        }
    };

    /** Ao SAIR: a fila é DA CONTA — NÃO é apagada; as pendências ficam vinculadas à conta de
     *  origem e só são retomadas quando ela voltar (troca de conta não vaza nem descarta nada). */
    p.syncAoSair = function () {
        clearTimeout(this.syncDrenoTimer);
        this.syncPronto = false;
        this.syncMigrarFilaLegada();
        this.syncEstado('local', 0);
    };
    // 🔄 [FIM: SYNC - COLETA E 1º LOGIN (local -> nuvem)]

    // 🔄 [INÍCIO: SYNC - GANCHOS NO APP (autosave e nota "somente nuvem")]
    /**
     * `apiCall` é o caminho do autosave do motor. Aqui ele ganha uma "segunda escrita": a
     * MESMA gravação também entra na fila (a UI já respondeu — nada de esperar a rede).
     */
    const apiCallOriginal = p.apiCall;
    p.apiCall = async function (endpoint, opcoes = {}) {
        // P98 (blindagem): `syncEstale` = o editor ainda NÃO renderizou a versão que acabou de
        // chegar da nuvem. Nesse estado, um save VAZIO é o autosave do boot (documento velho) e
        // apagaria a nota na nuvem e no aparelho. Só ESSE caso é ignorado: um save com conteúdo
        // (a digitação do usuário) segue o caminho normal — nunca se perde o que foi digitado.
        if (this.syncAtivo() && this.syncEstale) {
            let html = null;
            try {
                const corpo = JSON.parse((opcoes || {}).body || '{}');
                if (typeof corpo.notas === 'string') html = corpo.notas;
            } catch (_) { /* corpo não-JSON não é gravação de nota */ }
            if (html !== null && !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) return {};
        }
        const resultado = await apiCallOriginal.call(this, endpoint, opcoes);
        // `syncEstale`: o editor ainda não re-renderizou o que veio da nuvem — um save dele é o
        // documento VELHO do boot e não pode apagar o texto da conta (P98).
        if (this.syncAtivo() && !this.syncAplicando && !this.syncEstale) {
            try {
                const corpo = JSON.parse((opcoes || {}).body || '{}');
                if (typeof corpo.notas === 'string') {
                    const lista = this.projectsData || [];
                    const nota = lista.find(item => String(item.id) === String(this.currentNotesProjectId)) || lista[0];
                    if (nota) {
                        nota.notas = corpo.notas;
                        nota.atualizadaEm = new Date().toISOString();
                        this.syncEnfileirarNota(nota);
                    }
                }
            } catch (_) { /* corpo não-JSON: não é gravação de nota */ }
        }
        return resultado;
    };

    /**
     * Nota "somente nuvem" (não coube na cota): busca o texto antes de abrir. Sem conexão,
     * avisa e abre mesmo assim — o app NUNCA fica preso.
     */
    const abrirOriginal = p.openNotesModal;
    p.openNotesModal = async function (id) {
        const lista = this.projectsData || [];
        const nota = lista.find(item => String(item.id) === String(id));
        if (nota && nota.somenteNuvem && !String(nota.notas || '').length && this.syncAtivo()) {
            try {
                nota.notas = await this.syncBaixarNota(nota.id);
                nota.somenteNuvem = false;
                if (typeof this.invalidarAccentDaNota === 'function') this.invalidarAccentDaNota(nota.id);
                this.gravarNotasLocais(lista);
            } catch (_) {
                if (typeof this.showToast === 'function') {
                    this.showToast('Sem conexão para abrir esta nota (o texto está na sua conta).', 'error');
                }
            }
        }
        const resultado = await abrirOriginal.call(this, id);
        // O app renderizou a nota a partir do que está em memória: o editor deixou de ser "velho".
        this.syncEstale = false;
        return resultado;
    };

    /** Seam do plano (seção 5.2): o driver local ganha o "modo remoto" quando há sessão. */
    const notasBackendOriginal = p.notasBackend;
    p.notasBackend = function () {
        const driver = notasBackendOriginal.call(this);
        return Object.assign(driver, {
            remoto: this.syncAtivo(),
            salvar: lista => {
                this.gravarNotasLocais(lista);
                if (this.syncAtivo() && !this.syncAplicando) {
                    (lista || []).forEach(nota => this.syncEnfileirarNota(nota));
                }
            }
        });
    };
    // 🔄 [FIM: SYNC - GANCHOS NO APP (autosave e nota "somente nuvem")]

    // Estado inicial: sem sessão o sync é "local" (a fila, se existir, conta as pendências).
    // ATENÇÃO: `installSync` é chamada como função simples — aqui `this` NÃO é a instância,
    // por isso usamos o protótipo (`p`) com `call`.
    if (!(window.notasConta && window.notasConta.logado)) {
        window.notasConta = window.notasConta || { logado: false, email: '', csrf: '', sync: {} };
        window.notasConta.sync = { estado: 'local', pendentes: p.syncFilaLer.call(p).length };
    }

    // 🔄 [INÍCIO: SYNC - TEMPO REAL (WebSocket)]
    /**
     * A espinha dorsal do sync (decisão nº 7): com sessão o app abre UM socket em `/ws` e as
     * operações da fila viajam por ele (`op` → `ack`), enquanto o `change` dos OUTROS aparelhos
     * chega sem recarregar nada. O `push` HTTP continua como FALLBACK: se o socket não estiver
     * aberto (ou cair no meio), o dreno usa o caminho HTTP de sempre — a fila nunca fica presa.
     *
     * Deslogado NADA disto roda: sem sessão não existe socket, então o app segue 100% offline.
     */
    const EMPURRAR_HTTP = p.syncEmpurrar;
    const SNAPSHOT_HTTP = p.syncSnapshot;
    const AO_ENTRAR = p.syncAoEntrar;
    const AO_SAIR = p.syncAoSair;
    const HEARTBEAT_MS = 25000;
    const SILENCIO_MS = 50000;
    const RESPOSTA_MS = 8000;
    const BACKOFF_MAX = 30000;

    /** O socket está aberto e pronto para mandar `op`? */
    p.syncWsAberto = function () {
        return Boolean(this.syncWs) && this.syncWs.readyState === 1; // 1 = OPEN
    };

    /** Endereço do socket: MESMO host do app (é o origin do cookie de sessão). */
    p.syncWsUrl = function () {
        const esquema = location.protocol === 'https:' ? 'wss://' : 'ws://';
        return esquema + location.host + '/ws';
    };

    p.syncWsEnviar = function (mensagem) {
        if (!this.syncWsAberto()) return false;
        try { this.syncWs.send(JSON.stringify(mensagem)); return true; }
        catch (_) { return false; }
    };

    /** Fecha o socket e para o heartbeat (sem agendar reconexão — quem decide é o chamador). */
    p.syncFecharSocket = function () {
        clearInterval(this.syncWsHeartbeat);
        this.syncWsHeartbeat = null;
        const socket = this.syncWs;
        this.syncWs = null;
        if (socket) {
            socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
            try { socket.close(); } catch (_) { /* já estava fechado */ }
        }
        // Ops que ficaram sem resposta voltam para a fila (o dreno tenta de novo).
        this.syncWsPendentes = {};
    };

    /** Abre o socket. Deslogado NÃO tenta nada (invariante do §0.5 do plano). */
    p.syncConectar = function () {
        if (!this.syncAtivo() || this.syncWs || this.syncWsDesistiu) return false;
        let socket;
        try { socket = new WebSocket(this.syncWsUrl()); } catch (_) { return false; }
        this.syncWs = socket;
        this.syncWsPendentes = this.syncWsPendentes || {};
        this.syncWsTentativas = Number(this.syncWsTentativas) || 0;
        this.syncWsUltimoPong = Date.now();

        socket.onopen = () => {
            this.syncWsTentativas = 0;
            this.syncWsUltimoPong = Date.now();
            // `hello` = "o que mudou desde o rev X?": o servidor responde `bemvindo` + os `change`
            // perdidos ANTES de a fila drenar (é o que garante que reconexão não perde dado).
            this.syncWsEnviar({ t: 'hello', desde_rev: Number(this.syncRevGlobal) || 0 });
            this.syncWsLigarHeartbeat();
        };
        socket.onmessage = evento => {
            let mensagem = null;
            try { mensagem = JSON.parse(evento.data); } catch (_) { return; }
            if (mensagem && typeof mensagem === 'object') this.syncReceberWs(mensagem);
        };
        socket.onclose = evento => {
            const eraEste = this.syncWs === socket;
            clearInterval(this.syncWsHeartbeat);
            this.syncWsHeartbeat = null;
            if (!eraEste) return;
            this.syncWs = null;
            // 4401 = sem sessão válida: NÃO reconecta em loop (o usuário precisa entrar de novo).
            if (evento && evento.code === 4401) {
                this.syncWsDesistiu = true;
                this.syncEstado('expirada', this.syncFilaLer().length);
                return;
            }
            if (this.syncAtivo()) this.syncAgendarReconexao();
        };
        socket.onerror = () => { /* o `onclose` cuida da reconexão */ };
        return true;
    };

    /** Reconexão com backoff exponencial (1 s → 30 s) + jitter (evita manada de reconexões). */
    p.syncAgendarReconexao = function () {
        if (this.syncWsTimer || !this.syncAtivo() || this.syncWsDesistiu) return;
        const base = Math.min(BACKOFF_MAX, 1000 * Math.pow(2, Number(this.syncWsTentativas) || 0));
        const espera = base + Math.floor(Math.random() * 250);
        this.syncWsTentativas = (Number(this.syncWsTentativas) || 0) + 1;
        this.syncWsTimer = setTimeout(() => {
            this.syncWsTimer = null;
            this.syncConectar();
            if (!this.syncWs) this.syncAgendarReconexao();
        }, espera);
    };

    /** `ping` a cada 25 s; sem `pong` em 50 s considera o socket MORTO e fecha (reconecta). */
    p.syncWsLigarHeartbeat = function () {
        clearInterval(this.syncWsHeartbeat);
        this.syncWsHeartbeat = setInterval(() => {
            if (!this.syncWsAberto()) return;
            if (Date.now() - (this.syncWsUltimoPong || 0) > SILENCIO_MS) {
                this.syncFecharSocket();
                this.syncAgendarReconexao();
                return;
            }
            this.syncWsEnviar({ t: 'ping' });
        }, HEARTBEAT_MS);
    };


    /** Uma mensagem do servidor: `bemvindo`, `change`, `sync_fim`, `ack`, `conflito`, `erro` ou `pong`. */
    p.syncReceberWs = function (mensagem) {
        const tipo = mensagem.t;
        if (tipo === 'pong') { this.syncWsUltimoPong = Date.now(); return; }
        if (tipo === 'sync_fim') {
            // Fim do lote: SÓ agora avança o cursor de recebimento (o lote inteiro já foi
            // aplicado). Interromper no meio NÃO adianta o cursor — a reconexão reenvia o lote.
            const revGlobal = Number(mensagem.rev_global) || 0;
            if (revGlobal) this.syncRevGlobal = Math.max(Number(this.syncRevGlobal) || 0, revGlobal);
            return;
        }

        if (tipo === 'bemvindo') {
            this.syncWsUltimoPong = Date.now();
            this.syncPronto = true;   // o socket já conhece a conta: a fila pode drenar por aqui
            if (!this.syncFilaLer().length) this.syncEstado('sincronizado', 0);
            this.syncDrenar().catch(() => { });
            return;
        }
        if (tipo === 'change') {
            this.syncAplicarChangeWs(mensagem);
            return;
        }

        // `ack`, `conflito` e `erro` fecham UMA op pendente do lote que está no socket.
        const chave = String(mensagem.id_local || '');
        const pendente = this.syncWsPendentes && this.syncWsPendentes[chave];
        if (!pendente) return;
        delete this.syncWsPendentes[chave];
        if (tipo === 'ack') pendente.acks.push(mensagem);
        else if (tipo === 'conflito') pendente.conflitos.push(mensagem);
        else {
            // `erro` do servidor entra como conflito de motivo próprio: a op sai da fila
            // (reenviá-la nunca daria certo — payload inválido ou acesso negado).
            pendente.conflitos.push({
                id_local: chave,
                entidade: pendente.entidades[chave] || '',
                id: pendente.ids[chave] || '',
                motivo: mensagem.codigo || 'erro',
                detalhe: mensagem.detalhe || '',
                versao_atual: null
            });
        }
        pendente.faltam -= 1;
        if (pendente.faltam <= 0) pendente.resolver();
    };

    /**
     * `change` = outro aparelho NOSSO gravou algo: aplica pelos MESMOS pontos de entrada do app
     * (`syncAplicarEntidades`) e re-renderiza — nunca mexe no DOM por fora do render.
     */
    p.syncAplicarChangeWs = function (mensagem) {
        const entidade = String(mensagem.entidade || '');
        const conhecidas = { notas: 'notas', mapas: 'mapas', pastas: 'pastas', configuracoes: 'configuracoes', modelos: 'modelos' };
        if (!conhecidas[entidade]) return;   // `ativos*`/entidades futuras não têm applier local ainda
        this.syncAplicarEntidades({
            [entidade]: [{
                id: mensagem.id,
                rev: mensagem.rev,
                updated_at: mensagem.updated_at,
                deleted_at: mensagem.deleted_at || null,
                dados: mensagem.dados || {}
            }]
        }, true);
    };

    /**
     * `op` da fila pelo socket. Resolve quando TODAS as ops do lote foram respondidas; se o socket
     * cair (ou ninguém responder em `RESPOSTA_MS`), REJEITA com `status 0` para o dreno manter a
     * fila inteira e tentar depois — reenviar uma op já aplicada é inofensivo (upsert por LWW).
     */
    p.syncEmpurrarWs = function (ops) {
        return new Promise((resolver, rejeitar) => {
            const pendente = { acks: [], conflitos: [], faltam: ops.length, entidades: {}, ids: {}, resolver: null };
            const limpar = () => {
                for (const op of ops) delete this.syncWsPendentes[String(op.id_local)];
            };
            const desistir = motivo => {
                clearTimeout(timer);
                limpar();
                const erro = new Error(motivo);
                erro.status = 0;
                rejeitar(erro);
            };
            const timer = setTimeout(() => desistir('sem resposta do socket'), RESPOSTA_MS);
            pendente.resolver = () => {
                clearTimeout(timer);
                resolver({ acks: pendente.acks, conflitos: pendente.conflitos, rev_global: this.syncRevGlobal });
            };
            this.syncWsPendentes = this.syncWsPendentes || {};
            for (const op of ops) {
                const idLocal = String(op.id_local);
                pendente.entidades[idLocal] = op.entidade;
                pendente.ids[idLocal] = op.id;
                this.syncWsPendentes[idLocal] = pendente;
                const enviado = this.syncWsEnviar({
                    t: 'op', id_local: idLocal, entidade: op.entidade, acao: op.acao,
                    id: op.id, base_rev: op.base_rev, dados: op.dados
                });
                if (!enviado) { desistir('socket fechado antes do envio'); return; }
            }
            if (!pendente.faltam) pendente.resolver();
        });
    };

    /** Transporte do dreno: socket quando estiver aberto; senão o `push` HTTP de sempre. */
    p.syncEmpurrar = function (ops) {
        if (this.syncWsAberto()) return this.syncEmpurrarWs(ops);
        return EMPURRAR_HTTP.call(this, ops);
    };


    /** Ao ENTRAR: snapshot + 1º envio continuam iguais; SÓ DEPOIS o socket é aberto. */
    p.syncAoEntrar = async function () {
        this.syncWsDesistiu = false;
        this.syncWsTentativas = 0;
        const resultado = await AO_ENTRAR.call(this);
        this.syncConectar();
        return resultado;
    };

    /** Guarda o `rev_global` que veio do snapshot: é o `desde_rev` do próximo `hello`. */
    p.syncSnapshot = async function (desdeRev) {
        const corpo = await SNAPSHOT_HTTP.call(this, desdeRev);
        if (corpo && corpo.rev_global !== undefined) {
            this.syncRevGlobal = Math.max(Number(this.syncRevGlobal) || 0, Number(corpo.rev_global) || 0);
        }
        return corpo;
    };

    /** Ao SAIR: nada de socket aberto (e nada de reconectar) — a fila é da conta. */
    p.syncAoSair = function () {
        AO_SAIR.call(this);
        this.syncWsDesistiu = true;
        clearTimeout(this.syncWsTimer);
        this.syncWsTimer = null;
        this.syncFecharSocket();
    };

    /**
     * Liga os gatilhos de reconexão UMA vez: voltar a rede (`online`) e voltar para a aba
     * (`visibilitychange`) reconectam NA HORA, sem esperar o backoff. Se o app subiu já logado
     * (recarregar com sessão), o `contaVerificar` chama `syncAoEntrar` e o socket abre por lá.
     */
    p.syncLigarTempoReal = function () {
        if (this.syncTempoRealLigado) return;
        this.syncTempoRealLigado = true;
        const acordar = () => {
            if (!this.syncAtivo()) return;
            if (!this.syncWsAberto()) {
                this.syncWsDesistiu = false;
                this.syncWsTentativas = 0;
                clearTimeout(this.syncWsTimer);
                this.syncWsTimer = null;
                this.syncConectar();
            }
            // Voltou a rede (ou a aba): RETOMA a fila e consulta o delta desde o cursor de
            // recebimento — recupera mudanças que o aviso em tempo real possa ter perdido.
            this.syncDrenar().catch(() => { });
            if (this.syncPronto && !document.hidden) this.syncSnapshot(Number(this.syncRevGlobal) || 0).catch(() => { });
        };
        window.addEventListener('online', acordar);
        document.addEventListener('visibilitychange', acordar);
        // Consulta periódica (30 s) enquanto a página está visível e autenticada: o caminho de
        // recuperação quando o aviso em tempo real falha. Serializado por `syncConsultando`.
        this.syncPollingTimer = setInterval(() => {
            if (document.hidden || !this.syncAtivo() || !this.syncPronto || this.syncConsultando) return;
            this.syncConsultando = true;
            this.syncSnapshot(Number(this.syncRevGlobal) || 0)
                .catch(() => { })
                .finally(() => { this.syncConsultando = false; });
        }, 30000);
        if (this.syncAtivo() && this.syncPronto) this.syncConectar();
    };

    // 🔄 [INÍCIO: SYNC - ANEXOS NA NUVEM (upload + migração do P84)]
    /**
     * Fecha a lacuna do P84: com sessão, o anexo vira OBJETO DA CONTA (Supabase Storage) e abre em
     * qualquer aparelho. Deslogado nada disto roda — o app continua no comportamento de hoje
     * (`data:` URL dentro da nota, sem uma única requisição).
     */
    const extraRequestOriginal = p.notesExtraRequest;
    const uploadOriginal = p.notesUpload;

    /** Chamada de anexo: logado a SESSÃO identifica o usuário (o `user_id` local não vale). */
    p.notesExtraRequest = async function (path, opcoes = {}) {
        if (!this.syncAtivo()) return extraRequestOriginal.call(this, path, opcoes);
        // Templates são LOCAIS no PWA (a camada do app.js resolve): não vão para a rede.
        if (String(path).indexOf('/templates') === 0) return extraRequestOriginal.call(this, path, opcoes);
        const metodo = (opcoes.method || 'GET').toUpperCase();
        const cabecalhos = Object.assign({}, opcoes.headers || {});
        if (metodo !== 'GET' && window.notasConta.csrf) cabecalhos['X-CSRF'] = window.notasConta.csrf;
        const resposta = await fetch('/api/note-assets' + path, Object.assign({}, opcoes, {
            method: metodo, headers: cabecalhos, credentials: 'same-origin'
        }));
        if (!resposta.ok) {
            const erro = await resposta.json().catch(() => ({}));
            throw Error(erro.detail || 'Não foi possível concluir a operação');
        }
        return resposta.json();
    };

    /** URL pública (mesmo origin) de um anexo da conta. */
    p.syncUrlDoAnexo = function (id) {
        return '/api/note-assets/files/' + encodeURIComponent(String(id));
    };

    /**
     * Upload LOGADO: manda o arquivo para a conta e guarda SÓ o id no HTML da nota (o binário
     * fica no Storage — nem `storage_path` nem `mime` entram na nota).
     */
    p.notesUpload = function (image = false) {
        if (!this.syncAtivo() || typeof FormData === 'undefined') return uploadOriginal.call(this, image);
        const salvo = this.notesCaptureInsertion();
        const entrada = document.createElement('input');
        entrada.type = 'file';
        entrada.accept = image ? 'image/*' : '.pdf,.docx,.xlsx,.csv,.txt,application/pdf,application/octet-stream';
        entrada.onchange = async () => {
            const arquivo = entrada.files[0];
            if (!arquivo) return;
            try {
                this.notesStatus('Enviando arquivo…');
                const dados = new FormData();
                dados.append('file', arquivo);
                const ativo = await this.notesExtraRequest('/files', { method: 'POST', body: dados });
                if (!this.notesRestoreInsertion(salvo)) return;
                const url = this.syncUrlDoAnexo(ativo.id);
                if (image) {
                    this.notesMedia('image', url, ativo.name);
                } else {
                    const link = document.createElement('a');
                    link.href = url;
                    link.dataset.noteAsset = ativo.id;
                    link.textContent = '📎 ' + ativo.name;
                    this.notesInsertNode(link);
                }
                this.queueNotesSave();
                this.notesStatus('Salvo');
            } catch (erro) {
                this.showToast(erro.message, 'error');
            }
        };
        entrada.click();
    };

    /**
     * Visualizador de um anexo DA CONTA: imagem no próprio elemento e PDF/outros no visualizador
     * NATIVO do navegador (iframe) — abre em qualquer aparelho, sem depender do arquivo local.
     */
    const visualizadorOriginal = p.notesFileViewer;
    p.notesFileViewer = function (id) {
        if (!this.syncAtivo()) return visualizadorOriginal.call(this, id);
        const link = document.querySelector('a[data-note-asset="' + id + '"]');
        const url = link?.getAttribute('href') || '';
        if (url && !url.startsWith('data:') && url.indexOf('/api/note-assets/') === 0) {
            const nome = (link?.textContent || 'Arquivo').replace(/^\s*📎\s*/, '');
            this.notesExtraDialog('Visualização do arquivo', dialog => {
                dialog.classList.add('notes-file-viewer');
                const titulo = dialog.querySelector('h3');
                if (titulo) titulo.textContent = nome;
                const mime = (nome.match(/\.(png|jpe?g|gif|webp|bmp|avif)$/i) || [])[1] ? 'image/' : '';
                if (mime) {
                    const imagem = document.createElement('img');
                    imagem.src = url;
                    imagem.alt = nome;
                    imagem.className = 'notes-local-file';
                    dialog.append(imagem);
                } else {
                    const quadro = document.createElement('iframe');
                    quadro.src = url;
                    quadro.title = nome;
                    quadro.className = 'notes-local-file';
                    dialog.append(quadro);
                }
                const baixar = document.createElement('a');
                baixar.href = url;
                baixar.download = nome;
                baixar.textContent = 'Baixar arquivo';
                dialog.append(baixar);
            }, link);
            return;
        }
        return visualizadorOriginal.call(this, id);
    };
    // 🔄 [FIM: SYNC - ANEXOS NA NUVEM (upload + migração do P84)]

    // 🔄 [INÍCIO: SYNC - MIGRAÇÃO DOS ANEXOS ANTIGOS (1º login)]
    /**
     * `data:` URL -> `Blob` SEM `fetch`: a CSP do app (`connect-src 'self' ws: wss:`) bloqueia
     * `fetch('data:…')` — e não vamos afrouxar a política por causa disto. Decodificar à mão é
     * mais rápido e mantém a blindagem intacta.
     */
    p.syncDataUrlParaBlob = function (dataUrl) {
        const texto = String(dataUrl || '');
        const corte = texto.indexOf(',');
        if (corte < 0) throw new Error('data URL inválido');
        const cabecalho = texto.slice(0, corte);
        const corpo = texto.slice(corte + 1);
        const mime = (cabecalho.match(/^data:([^;]*)/) || [])[1] || 'application/octet-stream';
        if (/;base64/i.test(cabecalho)) {
            const binario = atob(corpo);
            const bytes = new Uint8Array(binario.length);
            for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
            return new Blob([bytes], { type: mime });
        }
        return new Blob([decodeURIComponent(corpo)], { type: mime });
    };

    /** Sobe um `data:` URL para a conta e devolve o id do anexo (ou lança). */
    p.syncSubirDataUrl = async function (dataUrl, nomeSugerido) {
        const blob = this.syncDataUrlParaBlob(dataUrl);
        const extensao = (String(blob.type).split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
        // Nome do anexo: o `data:` não guarda o nome original, mas o app deixa a pista no
        // `alt` da imagem ou no texto do link (`📎 nome`) — usar a pista mantém o arquivo legível.
        const pista = String(nomeSugerido || '').replace(/^\s*📎\s*/, '').trim().slice(0, 120);
        const nome = pista || ('anexo-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + extensao);
        const dados = new FormData();
        dados.append('file', new File([blob], nome, { type: blob.type || 'application/octet-stream' }));
        const ativo = await this.notesExtraRequest('/files', { method: 'POST', body: dados });
        return ativo && ativo.id ? String(ativo.id) : '';
    };

    /**
     * Converte os anexos `data:` de UMA nota para o Storage e devolve o HTML novo.
     * Um anexo que falhe (tipo não permitido, cota, sem rede) NÃO impede os outros — ele
     * simplesmente segue local, como hoje.
     */
    p.syncMigrarAnotacao = async function (html) {
        const texto = String(html || '');
        if (texto.indexOf('data:') < 0) return { html: texto, migrados: 0 };
        const modelo = document.createElement('template');
        modelo.innerHTML = texto;
        const alvos = [
            ...modelo.content.querySelectorAll('img[src^="data:"]'),
            ...modelo.content.querySelectorAll('a[href^="data:"]')
        ];
        let migrados = 0;
        for (const elemento of alvos) {
            const atributo = elemento.tagName === 'IMG' ? 'src' : 'href';
            const pista = elemento.tagName === 'IMG'
                ? (elemento.getAttribute('alt') || '')
                : (elemento.textContent || '');
            try {
                const id = await this.syncSubirDataUrl(elemento.getAttribute(atributo), pista);
                if (!id) continue;
                elemento.setAttribute(atributo, this.syncUrlDoAnexo(id));
                if (elemento.tagName !== 'IMG') elemento.dataset.noteAsset = id;
                migrados += 1;
            } catch (_) { /* segue local: nada se perde */ }
        }
        return { html: migrados ? modelo.innerHTML : texto, migrados };
    };

    /**
     * Varre as notas do aparelho e sobe os anexos antigos (`data:`) para a conta — é a
     * "migração no 1º login" decidida com o dono do produto. Roda ANTES do envio em lote, para
     * a nota subir já com os ids (o HTML da nota é texto; não existe migração separada).
     */
    p.syncMigrarAnexos = async function () {
        // Fonte da verdade é o ARMAZENAMENTO (`lerNotasLocais`), não a memória: durante o boot a
        // lista em `projectsData` pode ainda estar sem o HTML da nota (mesma razão do P98).
        const lista = typeof this.lerNotasLocais === 'function' ? this.lerNotasLocais() : (this.projectsData || []);
        let migrados = 0;
        let tocadas = 0;
        for (const nota of lista) {
            if (String(nota.notas || '').indexOf('data:') < 0) continue;
            try {
                const resultado = await this.syncMigrarAnotacao(nota.notas);
                if (resultado.migrados) {
                    nota.notas = resultado.html;
                    migrados += resultado.migrados;
                    tocadas += 1;
                }
            } catch (_) { /* uma nota com erro não impede as outras */ }
        }
        if (migrados) {
            this.gravarNotasLocaisComCota(lista);
            this.projectsData = lista;
            this.syncEstado('sincronizando', migrados);
        }
        return { migrados, tocadas };
    };

    /** O 1º login sobe o aparelho INTEIRO: os anexos antigos vão junto (migração silenciosa). */
    const subirTudoOriginal = p.syncSubirTudo;
    p.syncSubirTudo = async function () {
        try { await this.syncMigrarAnexos(); } catch (_) { /* o envio segue mesmo sem migrar */ }
        return subirTudoOriginal.call(this);
    };
    // 🔄 [FIM: SYNC - MIGRAÇÃO DOS ANEXOS ANTIGOS (1º login)]

    // 🔄 [INÍCIO: SYNC - CRIAÇÃO DE NOTA (pasta vazia/botão + entram na fila)]
    /** A nota criada ao ABRIR UMA PASTA VAZIA (ou pelo botão +) era salva só no aparelho
     *  (`salvarNotasLocais` não passa pelo `notasBackend.salvar`) e só subia quando o usuário
     *  digitava. Resultado: o outro aparelho abria a pasta (ainda vazia) e criava OUTRA nota —
     *  duplicação. Aqui a nota recém-criada entra na fila na hora. */
    p.syncLigarCriacaoNota = function () {
        if (this.syncCriacaoNotaLigado) return;
        this.syncCriacaoNotaLigado = true;
        const embrulhar = nome => {
            const original = p[nome];
            if (typeof original !== 'function') return;
            p[nome] = function (...args) {
                const resultado = original.apply(this, args);
                try {
                    if (this.syncAtivo() && !this.syncAplicando) {
                        const nota = (this.projectsData || []).find(n => String(n.id) === String(this.currentNotesProjectId));
                        if (nota) this.syncEnfileirarNota(nota);
                    }
                } catch (_) { /* best-effort: a gravação local já aconteceu */ }
                return resultado;
            };
        };
        embrulhar('criarNota');
        embrulhar('definirPastaAtivaNotas');
    };
    // 🔄 [FIM: SYNC - CRIAÇÃO DE NOTA (pasta vazia/botão + entram na fila)]

    // 🔄 [INÍCIO: SYNC - PASTAS (criar/renomear/excluir entram na fila)]
    /** Notas já têm o gancho via `notasBackend`; as PASTAS (mapa-store) ficavam órfãs:
     *  criadas/renomeadas/excluídas só subiam no 1º login. Aqui elas viram `op` na fila. */
    p.syncEnfileirarPasta = function (pasta) {
        if (!pasta || !pasta.id) return false;
        return this.syncEnfileirar('pastas', 'upsert', String(pasta.id), {
            nome: pasta.nome || '',
            item: pasta,
            // A data de EDIÇÃO é o que decide o vencedor do LWW: sem ela, criar/renomear pasta
            // era comparado como "0 > 0" e a renomeação era REJEITADA (o nome antigo prevalecia).
            atualizada_em: new Date().toISOString()
        });
    };

    p.syncEnfileirarExcluirPasta = function (id) {
        return this.syncEnfileirar('pastas', 'delete', String(id), {});
    };

    p.syncLigarPastas = function () {
        if (this.syncPastasLigado) return;
        this.syncPastasLigado = true;
        const app = this;
        const store = (typeof MapaMentalStore !== 'undefined') ? MapaMentalStore : null;
        if (!store) return;
        const embrulhar = (nome, aoMudar) => {
            const original = store[nome];
            if (typeof original !== 'function') return;
            store[nome] = function (...args) {
                const resultado = original.apply(store, args);
                try {
                    if (app.syncAtivo() && !app.syncAplicando) aoMudar(app, args, resultado);
                } catch (_) { /* best-effort: a gravação local já aconteceu */ }
                return resultado;
            };
        };
        embrulhar('criarPasta', (aplicacao, _args, resultado) => {
            if (resultado && resultado.id) aplicacao.syncEnfileirarPasta(resultado);
        });
        embrulhar('renomearPasta', (aplicacao, args) => {
            const id = String(args[0] || '');
            const pastas = aplicacao.syncLer('notas-pwa-mapa-pastas', []);
            const pasta = (Array.isArray(pastas) ? pastas : []).find(p => String(p.id) === id);
            if (pasta) aplicacao.syncEnfileirarPasta(pasta);
        });
        embrulhar('excluirPasta', (aplicacao, args) => {
            aplicacao.syncEnfileirarExcluirPasta(args[0]);
        });
    };
    // 🔄 [FIM: SYNC - PASTAS (criar/renomear/excluir entram na fila)]

    // 🔄 [INÍCIO: SYNC - MODELOS (templates entram na fila)]
    /** Modelos (templates de nota e de mapa) só subiam no 1º login. Aqui eles viram `op` ao vivo. */
    p.syncEnfileirarModelo = function (tipo, item) {
        if (!item || !item.id) return false;
        return this.syncEnfileirar('modelos', 'upsert', String(item.id), {
            tipo,
            nome: item.name || item.nome || '',
            item,
            atualizada_em: new Date().toISOString()  // mesma regra LWW das pastas
        });
    };

    p.syncEnfileirarExcluirModelo = function (id) {
        return this.syncEnfileirar('modelos', 'delete', String(id), {});
    };

    p.syncLigarModelos = function () {
        if (this.syncModelosLigado) return;
        this.syncModelosLigado = true;
        const app = this;

        // Templates de MAPA (`MapaMentalStore.salvarTemplate`/`excluirTemplate`).
        const store = (typeof MapaMentalStore !== 'undefined') ? MapaMentalStore : null;
        if (store) {
            const embrulhar = (nome, aoMudar) => {
                const original = store[nome];
                if (typeof original !== 'function') return;
                store[nome] = function (...args) {
                    const resultado = original.apply(store, args);
                    try {
                        if (app.syncAtivo() && !app.syncAplicando) aoMudar(app, args);
                    } catch (_) { /* best-effort: a gravação local já aconteceu */ }
                    return resultado;
                };
            };
            embrulhar('salvarTemplate', aplicacao => {
                const modelos = aplicacao.syncLer('notas-pwa-mapa-templates', []);
                (Array.isArray(modelos) ? modelos : []).forEach(item => aplicacao.syncEnfileirarModelo('mapa', item));
            });
            embrulhar('excluirTemplate', (aplicacao, args) => {
                aplicacao.syncEnfileirarExcluirModelo(args[0]);
            });
        }

        // Templates de NOTA (`notesExtraRequest` POST /templates).
        const originalExtra = p.notesExtraRequest;
        if (typeof originalExtra === 'function') {
            p.notesExtraRequest = async function (path, options = {}) {
                const resultado = await originalExtra.call(this, path, options);
                try {
                    const metodo = (options.method || 'GET').toUpperCase();
                    if (app.syncAtivo() && !app.syncAplicando && path === '/templates' && metodo === 'POST' && resultado && resultado.id) {
                        app.syncEnfileirarModelo('nota', { id: resultado.id, name: resultado.name, html: resultado.html });
                    }
                } catch (_) { /* best-effort */ }
                return resultado;
            };
        }
    };
    // 🔄 [FIM: SYNC - MODELOS (templates entram na fila)]

    /**
     * Igual ao `conta.js` (P96/P98): `installSync` roda como função simples dentro de
     * `new NotesPWA()`, então `this` NÃO é a instância. Ligar o tempo real no PROTÓTIPO
     * faria os gatilhos (`online`/`visibilitychange`) e o estado do socket viverem fora da
     * instância. Agendamos para o 1º instante em que `window.notesApp` existir.
     */
    const ligarTempoReal = () => {
        const aplicacao = window.notesApp;
        if (!aplicacao || aplicacao.__syncTempoRealIniciado) return;
        aplicacao.__syncTempoRealIniciado = true;
        aplicacao.syncLigarTempoReal();
    };
    if (window.notesApp) ligarTempoReal();
    else setTimeout(ligarTempoReal, 0);

    /** Mesma deferência: liga o gancho das PASTAS na INSTÂNCIA (não no protótipo). */
    const ligarPastas = () => {
        const aplicacao = window.notesApp;
        if (!aplicacao || aplicacao.__syncPastasIniciado) return;
        aplicacao.__syncPastasIniciado = true;
        aplicacao.syncLigarPastas();
    };
    if (window.notesApp) ligarPastas();
    else setTimeout(ligarPastas, 0);

    /** Mesma deferência: liga o gancho de CRIAÇÃO DE NOTA na INSTÂNCIA. */
    const ligarCriacaoNota = () => {
        const aplicacao = window.notesApp;
        if (!aplicacao || aplicacao.__syncCriacaoNotaIniciado) return;
        aplicacao.__syncCriacaoNotaIniciado = true;
        aplicacao.syncLigarCriacaoNota();
    };
    if (window.notesApp) ligarCriacaoNota();
    else setTimeout(ligarCriacaoNota, 0);

    /** Mesma deferência: liga o gancho de MODELOS na INSTÂNCIA. */
    const ligarModelos = () => {
        const aplicacao = window.notesApp;
        if (!aplicacao || aplicacao.__syncModelosIniciado) return;
        aplicacao.__syncModelosIniciado = true;
        aplicacao.syncLigarModelos();
    };
    if (window.notesApp) ligarModelos();
    else setTimeout(ligarModelos, 0);
    // 🔄 [FIM: SYNC - TEMPO REAL (WebSocket)]
}
// 🔄 [FIM: SYNC - CLIENTE (FILA + SNAPSHOT/PUSH)]

