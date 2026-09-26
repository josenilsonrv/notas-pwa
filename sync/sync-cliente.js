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
    const TENTATIVAS_MAX = 2;

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
        try { localStorage.setItem(FILA, JSON.stringify(lista)); } catch (_) { /* sem espaço: a memória segue */ }
        this.syncEstado((window.notasConta.sync || {}).estado, lista.length);
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
        // ANTES do 1º snapshot o aparelho ainda não conhece o estado da conta: enfileirar aqui
        // subiria um retrato INCOMPLETO (ex.: a nota vazia do boot por cima da versão boa). Os
        // saves desse intervalo continuam locais e entram na conta no próximo envio — P98.
        if (!this.syncPronto) return false;
        const fila = this.syncFilaLer();
        const maior = fila.reduce((valor, item) => Math.max(valor, Number(item.seq) || 0), 0);
        fila.push({
            seq: maior + 1,
            entidade,
            acao,
            id: String(id),
            dados: dados || {},
            base_rev: baseRev === undefined ? null : baseRev,
            tentativas: 0,
            criado_em: new Date().toISOString()
        });
        this.syncFilaGravar(fila);
        this.syncAgendarDrenagem();
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
     * Drena a fila EM ORDEM: sai do armário só o que teve `ack`; no `conflito`, decide por LWW
     * (se o local declarou instante mais novo, reenvia com o `base_rev` novo — máx. 2 voltas).
     */
    p.syncDrenar = async function () {
        if (!this.syncAtivo() || this.syncDrenando) return;
        const fila = this.syncFilaLer();
        if (!fila.length) { this.syncEstado('sincronizado', 0); return; }
        this.syncDrenando = true;
        this.syncEstado('sincronizando', fila.length);
        try {
            const lote = fila.map(item => ({
                entidade: item.entidade,
                acao: item.acao,
                id: item.id,
                base_rev: item.base_rev,
                dados: item.dados,
                id_local: String(item.seq)
            }));
            const corpo = await this.syncEmpurrar(lote);
            const resolvidos = new Set((corpo.acks || []).map(ack => String(ack.id_local)));
            const restantes = fila.filter(item => !resolvidos.has(String(item.seq)));
            for (const conflito of corpo.conflitos || []) {
                const indice = restantes.findIndex(item => String(item.seq) === String(conflito.id_local));
                if (indice < 0) continue;
                const item = restantes[indice];
                if (this.syncConflitoLocalVence(item, conflito)) {
                    item.tentativas = (Number(item.tentativas) || 0) + 1;
                    item.base_rev = ((conflito.versao_atual || {}).rev === undefined)
                        ? item.base_rev
                        : conflito.versao_atual.rev;
                    if (item.tentativas > TENTATIVAS_MAX) {
                        restantes.splice(indice, 1);
                        this.syncAplicarItem(conflito);
                    }
                } else {
                    restantes.splice(indice, 1);
                    this.syncAplicarItem(conflito);
                }
            }
            this.syncFilaGravar(restantes);
        } catch (erro) {
            this.syncEstado(erro && erro.status === 401 ? 'expirada' : 'offline', this.syncFilaLer().length);
            return;
        } finally {
            this.syncDrenando = false;
        }
        const pendentes = this.syncFilaLer().length;
        this.syncEstado(pendentes ? 'offline' : 'sincronizado', pendentes);
        if (pendentes && pendentes < fila.length) this.syncAgendarDrenagem(200);
    };

    /** LWW do lado do cliente: o instante declarado na op é MAIS NOVO que o do servidor? */
    p.syncConflitoLocalVence = function (item, conflito) {
        const momento = valor => {
            if (!valor) return 0;
            const data = new Date(String(valor).replace('Z', '+00:00'));
            return isNaN(data) ? 0 : data.getTime();
        };
        const dados = item.dados || {};
        const local = dados.atualizada_em || dados.updated_at;
        return momento(local) > momento((conflito.versao_atual || {}).updated_at);
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
                const aberta = this.currentNotesProjectId;
                if (aberta && entidades.notas.some(registro => String(registro.id) === String(aberta))) {
                    this.syncEstale = true;
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
        const areaMapa = document.getElementById('mapaArea');
        if (typeof this.renderArea === 'function' && areaMapa && !areaMapa.hidden) this.renderArea();
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
                // Preserva o texto local se a nuvem veio sem conteúdo (nota somente-metadados).
                lista[indice] = Object.assign({}, lista[indice], nota, {
                    notas: nota.notas || lista[indice].notas || ''
                });
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
        return Promise.resolve(this.openNotesModal(id)).then(() => { this.syncEstale = false; });
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
            atualizada_em: nota.atualizadaEm || new Date().toISOString()
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
            await this.syncEmpurrar(lote);
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

    /** Ao SAIR: a fila é DA CONTA (não pode vazar para outra); nada local é apagado. */
    p.syncAoSair = function () {
        clearTimeout(this.syncDrenoTimer);
        this.syncPronto = false;
        if (this.syncFilaLer().length) this.syncFilaGravar([]);
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
}
// 🔄 [FIM: SYNC - CLIENTE (FILA + SNAPSHOT/PUSH)]

