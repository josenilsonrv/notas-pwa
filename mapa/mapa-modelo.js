// ============================================
// MAPA MENTAL - Modelo de dados
// Entidades (No/Conexao), IDs monotônicos, validação, migração e duplicação.
// Sem DOM: pode ser usado/testado isoladamente.
// ============================================
(function (global) {
    'use strict';

    const SCHEMA_VERSION = 1;
    const LAYOUTS = ['bilateral', 'tradicional', 'esquerda-direita', 'direita-esquerda', 'arvore-vertical', 'organograma', 'livre'];
    // Espaçamento do layout automático (Fase 8): default por mapa + limite do aceitável.
    const ESPACO_NO_PADRAO = 32;
    const ESPACO_NIVEL_PADRAO = 80;
    const ESPACO_MAX = 400;

    /** Normaliza `{ nos, niveis }` (inteiros 0..ESPACO_MAX) com default por campo. */
    function normalizarEspacamento(espacamento) {
        const base = espacamento || {};
        const limitar = (valor, padrao) => {
            const numero = Math.round(Number(valor));
            if (!Number.isFinite(numero)) return padrao;
            return Math.min(ESPACO_MAX, Math.max(0, numero));
        };
        return {
            nos: limitar(base.nos, ESPACO_NO_PADRAO),
            niveis: limitar(base.niveis, ESPACO_NIVEL_PADRAO)
        };
    }

    // 🔄 [INÍCIO: MAPA - MODELO/GRAFO]
    const isoAgora = () => new Date().toISOString();

    // 🔄 [INÍCIO: MAPA - CONTEÚDO/SANITIZAÇÃO]
    // Campos de conteúdo por nó (Fase 4). Tudo passa por normalização/sanitização
    // antes de gravar — nada de `<script>` e nada de URL fora de http/https/mailto/tel.
    const PRIORIDADES = ['baixa', 'media', 'alta'];
    const STATUS_NO = ['', 'a-fazer', 'fazendo', 'feito', 'bloqueado'];
    const LIMITE_ANEXO = 1024 * 1024; // ~1 MB por anexo (cota do localStorage é ~5 MB)
    const LIMITE_TEXTO = 20000;       // teto para descrição/notas (evita cota estourada)
    const LIMITE_TAGS = 24;
    const CAMPOS_CONTEUDO = [
        'titulo', 'descricao', 'notas', 'links', 'imagens', 'icone', 'emoji', 'tags', 'anexos',
        'tarefa', 'concluido', 'prioridade', 'status', 'inicio', 'prazo', 'responsavel', 'progresso', 'refs'
    ];

    const clonar = valor => (valor == null ? valor : JSON.parse(JSON.stringify(valor)));

    /** Texto puro: remove tags, colapsa espaços. Usado em título/tags/responsável. */
    function sanitizarTexto(valor) {
        return String(valor == null ? '' : valor).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    /** Escapa HTML — base do `htmlSeguro` (só o `<a>` que nós criamos sobrevive). */
    function escaparHtml(valor) {
        return String(valor == null ? '' : valor)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** Aceita apenas esquemas seguros. Devolve null quando a URL não é confiável. */
    function urlSegura(url) {
        const texto = String(url == null ? '' : url).trim();
        return /^(https?:|mailto:|tel:)/i.test(texto) ? texto : null;
    }

    /** Acha URLs http(s) no texto (auto-link). Devolve lista única. */
    function extrairLinks(texto) {
        const achados = String(texto == null ? '' : texto).match(/https?:\/\/[^\s<>"']+/gi) || [];
        return [...new Set(achados)];
    }

    /**
     * HTML seguro (whitelist de fato = só HTML escapado + `<a>` gerado por nós).
     * Recebe texto puro e devolve o mesmo texto escapado, com links ancorados.
     */
    function htmlSeguro(valor) {
        const bruto = String(valor == null ? '' : valor).slice(0, LIMITE_TEXTO);
        const escapado = escaparHtml(bruto);
        return escapado.replace(/https?:\/\/[^\s<>&"']+/gi, url => {
            const limpa = urlSegura(url);
            return limpa ? '<a href="' + limpa + '" target="_blank" rel="noopener noreferrer">' + url + '</a>' : url;
        });
    }

    function normalizarData(valor) {
        const texto = String(valor == null ? '' : valor).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
        return isNaN(new Date(texto + 'T00:00:00')) ? null : texto;
    }

    function limitarProgresso(valor) {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return 0;
        return Math.max(0, Math.min(100, Math.round(numero)));
    }
    // 🔄 [FIM: MAPA - CONTEÚDO/SANITIZAÇÃO - PARTE 1]

    /** Tags aceitas como array ou string ("a, b c") → lista única e sanitizada. */
    function normalizarTags(tags) {
        const lista = Array.isArray(tags)
            ? tags
            : String(tags == null ? '' : tags).split(/[,;]+/);
        const vistas = new Set();
        lista.forEach(tag => {
            const texto = sanitizarTexto(tag).replace(/^#/, '');
            if (texto) vistas.add(texto.slice(0, 40));
        });
        return [...vistas].slice(0, LIMITE_TAGS);
    }

    /** Links: aceita `[{rotulo,url}]` ou strings; mantém só URLs seguras. */
    function normalizarLinks(links) {
        const lista = Array.isArray(links) ? links : [];
        return lista.map(item => {
            const objeto = typeof item === 'string' ? { url: item } : (item || {});
            const url = urlSegura(objeto.url);
            if (!url) return null;
            return { rotulo: sanitizarTexto(objeto.rotulo) || url, url };
        }).filter(Boolean);
    }

    /** Referências a outras entidades (nota/mapa): `[{tipo,id,rotulo}]`. */
    function normalizarRefs(refs) {
        const lista = Array.isArray(refs) ? refs : [];
        return lista.map(item => {
            const objeto = item || {};
            const id = sanitizarTexto(objeto.id);
            if (!id) return null;
            return {
                tipo: sanitizarTexto(objeto.tipo) || 'nota',
                id, rotulo: sanitizarTexto(objeto.rotulo) || id
            };
        }).filter(Boolean);
    }

    /** Garante que o nó tenha TODOS os campos de conteúdo (migração segura). */
    function normalizarConteudoNo(no) {
        if (!no || typeof no !== 'object') return no;
        no.titulo = sanitizarTexto(no.titulo);
        no.descricao = htmlSeguro(no.descricao);
        no.notas = htmlSeguro(no.notas);
        no.links = normalizarLinks(no.links);
        no.imagens = Array.isArray(no.imagens) ? no.imagens : [];
        no.icone = sanitizarTexto(no.icone).slice(0, 8);
        no.emoji = sanitizarTexto(no.emoji).slice(0, 4);
        no.tags = normalizarTags(no.tags);
        no.anexos = Array.isArray(no.anexos) ? no.anexos : [];
        no.tarefa = Boolean(no.tarefa);
        no.concluido = Boolean(no.concluido);
        no.prioridade = PRIORIDADES.includes(no.prioridade) ? no.prioridade : null;
        no.status = STATUS_NO.includes(no.status) ? no.status : '';
        no.inicio = normalizarData(no.inicio);
        no.prazo = normalizarData(no.prazo);
        no.responsavel = sanitizarTexto(no.responsavel);
        no.progresso = limitarProgresso(no.progresso);
        no.refs = normalizarRefs(no.refs);
        return no;
    }
    // 🔄 [FIM: MAPA - CONTEÚDO/SANITIZAÇÃO - PARTE 2]

    /** Campos de conteúdo copiáveis de um nó (usado por duplicar/copiar/colar). */
    function dadosConteudoNo(no) {
        const origem = no || {};
        return {
            titulo: origem.titulo, descricao: origem.descricao, notas: origem.notas,
            links: clonar(origem.links), imagens: clonar(origem.imagens),
            icone: origem.icone, emoji: origem.emoji, tags: clonar(origem.tags),
            anexos: clonar(origem.anexos), tarefa: origem.tarefa, concluido: origem.concluido,
            prioridade: origem.prioridade, status: origem.status, inicio: origem.inicio,
            prazo: origem.prazo, responsavel: origem.responsavel, progresso: origem.progresso,
            refs: clonar(origem.refs), mapaRef: origem.mapaRef, notaRef: origem.notaRef
        };
    }

    /** Cria um grafo vazio já normalizado (fonte da verdade de cada mapa). */
    function criarGrafo(opcoes) {
        const cfg = opcoes || {};
        return {
            id: cfg.id || '',
            nome: cfg.nome || 'Novo mapa',
            pastaId: cfg.pastaId || null,
            schemaVersion: SCHEMA_VERSION,
            temaId: cfg.temaId || 'padrao',
            nos: [],
            conexoes: [],
            estilosNivel: {},
            viewport: { x: 0, y: 0, zoom: 1 },
            layout: LAYOUTS.includes(cfg.layout) ? cfg.layout : 'bilateral',
            espacamento: normalizarEspacamento(cfg.espacamento),
            idSeq: 0,
            cxSeq: 0,
            dtCriado: isoAgora(),
            atualizadoEm: isoAgora()
        };
    }

    /** IDs por contador monotônico — nunca reutilizados. */
    function proximoIdNo(grafo) {
        grafo.idSeq = Number(grafo.idSeq || 0) + 1;
        return 'n' + grafo.idSeq;
    }

    function proximoIdConexao(grafo) {
        grafo.cxSeq = Number(grafo.cxSeq || 0) + 1;
        return 'cx' + grafo.cxSeq;
    }

    function proximaOrdem(grafo, paiId) {
        return (grafo.nos || []).filter(no => (no.paiId || null) === (paiId || null)).length;
    }

    function criarNo(grafo, dados) {
        const cfg = dados || {};
        const no = {
            id: cfg.id || proximoIdNo(grafo),
            mapaId: grafo.id || null,
            paiId: cfg.paiId || null,
            ordem: Number.isFinite(cfg.ordem) ? cfg.ordem : proximaOrdem(grafo, cfg.paiId || null),
            titulo: cfg.titulo || '',
            descricao: cfg.descricao || '',
            // Conteúdo (Fase 4) — normalizado/sanitizado logo abaixo.
            notas: cfg.notas || '',
            links: cfg.links,
            imagens: cfg.imagens,
            icone: cfg.icone,
            emoji: cfg.emoji,
            tags: cfg.tags,
            anexos: cfg.anexos,
            tarefa: cfg.tarefa,
            concluido: cfg.concluido,
            prioridade: cfg.prioridade,
            status: cfg.status,
            inicio: cfg.inicio,
            prazo: cfg.prazo,
            responsavel: cfg.responsavel,
            progresso: cfg.progresso,
            refs: cfg.refs,
            mapaRef: cfg.mapaRef || null,
            notaRef: cfg.notaRef || null,
            colapsado: Boolean(cfg.colapsado),
            bloqueado: Boolean(cfg.bloqueado),
            posicao: cfg.posicao ? { x: Number(cfg.posicao.x) || 0, y: Number(cfg.posicao.y) || 0 } : null,
            largura: Number.isFinite(cfg.largura) ? cfg.largura : null,
            estilo: cfg.estilo ? Object.assign({}, cfg.estilo) : {},
            criadoEm: isoAgora()
        };
        normalizarConteudoNo(no);
        grafo.nos.push(no);
        return no;
    }

    function obterNo(grafo, id) {
        return (grafo.nos || []).find(no => no.id === id) || null;
    }

    function listarFilhos(grafo, paiId) {
        return (grafo.nos || [])
            .filter(no => (no.paiId || null) === (paiId || null))
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
    }

    function normalizarOrdem(grafo, paiId) {
        listarFilhos(grafo, paiId).forEach((no, indice) => { no.ordem = indice; });
    }

    /** Verdadeiro se definir `novoPaiId` como pai de `idNo` criaria um ciclo. */
    function contemCiclo(grafo, idNo, novoPaiId) {
        if (!novoPaiId) return false;
        if (novoPaiId === idNo) return true;
        const visitados = new Set();
        let atual = novoPaiId;
        while (atual && !visitados.has(atual)) {
            if (atual === idNo) return true;
            visitados.add(atual);
            const no = obterNo(grafo, atual);
            atual = no ? (no.paiId || null) : null;
        }
        return false;
    }

    /** Migração versionada: v0 (sem schema) -> v1 (coleções + contadores garantidos). */
    function migrarGrafo(grafo) {
        if (!grafo || typeof grafo !== 'object') return criarGrafo();
        if (Number(grafo.schemaVersion || 0) >= SCHEMA_VERSION) return grafo;
        grafo.nos = Array.isArray(grafo.nos) ? grafo.nos : [];
        grafo.conexoes = Array.isArray(grafo.conexoes) ? grafo.conexoes : [];
        grafo.viewport = grafo.viewport || { x: 0, y: 0, zoom: 1 };
        grafo.espacamento = normalizarEspacamento(grafo.espacamento);
        grafo.layout = LAYOUTS.includes(grafo.layout) ? grafo.layout : 'bilateral';
        grafo.temaId = TEMAS_MAPA.some(t => t.id === grafo.temaId) ? grafo.temaId : 'padrao';
        grafo.estilosNivel = normalizarEstilosNivel(grafo.estilosNivel);
        grafo.idSeq = Number(grafo.idSeq || 0);
        grafo.cxSeq = Number(grafo.cxSeq || 0);
        grafo.schemaVersion = SCHEMA_VERSION;
        return grafo;
    }

    /** Garante integridade: IDs únicos, pais existentes e `ordem` normalizada. */
    function normalizarGrafo(grafo) {
        migrarGrafo(grafo);
        // Fase 8: garante layout/espaçamento válidos mesmo em grafos já migrados.
        grafo.layout = LAYOUTS.includes(grafo.layout) ? grafo.layout : 'bilateral';
        grafo.espacamento = normalizarEspacamento(grafo.espacamento);
        // Fase 9: tema e estilos por nível válidos mesmo em grafos já migrados.
        grafo.temaId = TEMAS_MAPA.some(t => t.id === grafo.temaId) ? grafo.temaId : 'padrao';
        grafo.estilosNivel = normalizarEstilosNivel(grafo.estilosNivel);
        const ids = new Set();
        grafo.nos.forEach(no => {
            if (!no.id || ids.has(no.id)) no.id = proximoIdNo(grafo);
            ids.add(no.id);
            no.paiId = no.paiId || null;
            no.estilo = normalizarEstilo(no.estilo);
            normalizarConteudoNo(no);
        });
        // Referência quebrada de pai vira raiz (nunca descarta o nó).
        grafo.nos.forEach(no => { if (no.paiId && !ids.has(no.paiId)) no.paiId = null; });
        const pais = new Set(grafo.nos.map(no => no.paiId || null));
        pais.forEach(pai => normalizarOrdem(grafo, pai));
        // Conexões (Fase 6): descarta as que apontam para nós inexistentes/para si mesmas
        // e garante IDs únicos com o contador acima do maior existente.
        grafo.conexoes = (Array.isArray(grafo.conexoes) ? grafo.conexoes : [])
            .filter(cx => cx && ids.has(cx.de) && ids.has(cx.para) && cx.de !== cx.para)
            .map(cx => normalizarConexao(cx));
        const idsCx = new Set();
        grafo.conexoes.forEach(cx => {
            const achado = /^cx(\d+)$/.exec(cx.id || '');
            grafo.cxSeq = Math.max(Number(grafo.cxSeq || 0), achado ? Number(achado[1]) : 0);
            if (!cx.id || idsCx.has(cx.id)) cx.id = proximoIdConexao(grafo);
            idsCx.add(cx.id);
        });
        return grafo;
    }

    /** Cópia profunda com IDs NOVOS e pais/conexões remapeados (nunca compartilha objetos). */
    function duplicarGrafo(origem, novoId, novoNome) {
        const novo = criarGrafo({ id: novoId, nome: novoNome || origem.nome, pastaId: origem.pastaId || null });
        novo.temaId = origem.temaId || 'padrao';
        novo.layout = LAYOUTS.includes(origem.layout) ? origem.layout : 'bilateral';
        novo.espacamento = Object.assign({}, novo.espacamento, origem.espacamento || {});
        novo.estilosNivel = Object.assign({}, origem.estilosNivel || {});
        const mapa = new Map();
        (origem.nos || []).forEach(no => {
            const copia = criarNo(novo, Object.assign(dadosConteudoNo(no), {
                ordem: no.ordem, colapsado: no.colapsado, bloqueado: no.bloqueado,
                posicao: no.posicao, largura: no.largura, estilo: no.estilo
            }));
            copia.paiId = null;
            mapa.set(no.id, copia);
        });
        (origem.nos || []).forEach(no => {
            const copia = mapa.get(no.id);
            copia.paiId = no.paiId && mapa.has(no.paiId) ? mapa.get(no.paiId).id : null;
        });
        novo.conexoes = (origem.conexoes || [])
            .filter(cx => mapa.has(cx.de) && mapa.has(cx.para))
            .map(cx => Object.assign({}, cx, { id: proximoIdConexao(novo), de: mapa.get(cx.de).id, para: mapa.get(cx.para).id }));
        return normalizarGrafo(novo);
    }
    // 🔄 [FIM: MAPA - MODELO/GRAFO]

    // 🔄 [INÍCIO: MAPA - TEMPLATES/INTERLIGAÇÃO]
    /** Templates prontos (specs de nós; `pai` = índice do nó pai já criado). */
    const TEMPLATES_PRONTOS = [
        { id: 'branco', nome: 'Mapa em branco', nos: [{ titulo: 'Ideia central' }] },
        { id: 'simples', nome: 'Simples', nos: [
            { titulo: 'Ideia central' },
            { pai: 0, titulo: 'Tópico 1' },
            { pai: 0, titulo: 'Tópico 2' },
            { pai: 0, titulo: 'Tópico 3' }
        ] },
        { id: 'projeto', nome: 'Projeto', nos: [
            { titulo: 'Projeto' },
            { pai: 0, titulo: 'Objetivo' },
            { pai: 0, titulo: 'Escopo' },
            { pai: 0, titulo: 'Tarefas' },
            { pai: 3, titulo: 'A fazer' },
            { pai: 3, titulo: 'Em andamento' },
            { pai: 3, titulo: 'Concluído' }
        ] }
    ];

    /** Materializa um template pronto no grafo (mantém os IDs monotônicos). */
    function aplicarTemplatePronto(grafo, templateId) {
        const template = TEMPLATES_PRONTOS.find(t => t.id === templateId) || TEMPLATES_PRONTOS[0];
        const criados = [];
        template.nos.forEach((spec, indice) => {
            const pai = Number.isInteger(spec.pai) && criados[spec.pai] ? criados[spec.pai].id : null;
            criados.push(criarNo(grafo, { titulo: spec.titulo, ordem: indice, paiId: pai }));
        });
        return normalizarGrafo(grafo);
    }

    /** Nó-ponte: nó que aponta para OUTRO mapa (link bidirecional via backlink). */
    function criarNoPonte(grafo, idMapaDestino, titulo) {
        if (!idMapaDestino) return null;
        return criarNo(grafo, { titulo: titulo || 'Mapa conectado', mapaRef: idMapaDestino });
    }

    function listarNosPonte(grafo) {
        return (grafo && grafo.nos ? grafo.nos : []).filter(no => no.mapaRef);
    }
    // 🔄 [FIM: MAPA - TEMPLATES/INTERLIGAÇÃO]

    // 🔄 [INÍCIO: MAPA - COMANDOS DE NÓ]
    const LARGURA_NO = 180;
    const LARGURA_MIN = 96;
    const LARGURA_MAX = 480;
    const PASSO_LARGURA = 8;

    /** Descendentes de um nó (iterativo, profundidade ilimitada). */
    function listarDescendentes(grafo, idNo) {
        const resultado = [];
        const visitados = new Set([idNo]);
        const pilha = [idNo];
        while (pilha.length) {
            const atual = pilha.pop();
            (grafo.nos || []).forEach(no => {
                if ((no.paiId || null) === atual && !visitados.has(no.id)) {
                    visitados.add(no.id);
                    resultado.push(no.id);
                    pilha.push(no.id);
                }
            });
        }
        return resultado;
    }

    /** Nós visíveis (nenhum ancestral recolhido). */
    function listarVisiveis(grafo) {
        const nos = (grafo && grafo.nos) || [];
        const porId = new Map(nos.map(no => [no.id, no]));
        return nos.filter(no => {
            let atual = no;
            const vistos = new Set();
            while (atual && atual.paiId && !vistos.has(atual.id)) {
                vistos.add(atual.id);
                const pai = porId.get(atual.paiId);
                if (!pai) return true;
                if (pai.colapsado) return false;
                atual = pai;
            }
            return true;
        });
    }

    /** Mapa id -> nível (1 = raiz) para acessibilidade e estilo por profundidade. */
    function mapaDeNiveis(grafo) {
        const niveis = new Map();
        const nos = (grafo && grafo.nos) || [];
        const porId = new Map(nos.map(no => [no.id, no]));
        nos.forEach(no => {
            let nivel = 1;
            let atual = no;
            const vistos = new Set();
            while (atual && atual.paiId && !vistos.has(atual.id)) {
                vistos.add(atual.id);
                atual = porId.get(atual.paiId);
                if (!atual) break;
                nivel += 1;
            }
            niveis.set(no.id, nivel);
        });
        return niveis;
    }

    function idsComFilhos(grafo) {
        const ids = new Set();
        (grafo && grafo.nos ? grafo.nos : []).forEach(no => { if (no.paiId) ids.add(no.paiId); });
        return ids;
    }

    function criarFilhoDe(grafo, paiId, titulo) {
        const pai = paiId ? obterNo(grafo, paiId) : null;
        if (pai) pai.colapsado = false;
        return criarNo(grafo, { paiId: paiId || null, titulo: titulo || 'Novo tópico' });
    }

    /** Cria um irmão logo DEPOIS do nó de referência. */
    function criarIrmaoDe(grafo, idNo, titulo) {
        const base = obterNo(grafo, idNo);
        if (!base) return null;
        const criado = criarNo(grafo, { paiId: base.paiId || null, titulo: titulo || 'Novo tópico' });
        const irmaos = listarFilhos(grafo, base.paiId || null).filter(item => item.id !== criado.id);
        const indice = irmaos.indexOf(base);
        irmaos.splice(indice >= 0 ? indice + 1 : irmaos.length, 0, criado);
        irmaos.forEach((item, i) => { item.ordem = i; });
        return criado;
    }

    function criarNoIndependente(grafo, titulo, posicao) {
        return criarNo(grafo, { paiId: null, titulo: titulo || 'Novo tópico', posicao: posicao || null });
    }

    function atualizarTitulo(grafo, idNo, titulo) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        no.titulo = String(titulo || '').trim();
        return true;
    }

    function moverNoLivre(grafo, idNo, posicao) {
        const no = obterNo(grafo, idNo);
        if (!no || !posicao) return false;
        no.posicao = { x: Number(posicao.x) || 0, y: Number(posicao.y) || 0 };
        return true;
    }

    function definirRecolhido(grafo, idNo, valor) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        no.colapsado = valor === undefined ? !no.colapsado : Boolean(valor);
        return true;
    }

    function definirBloqueado(grafo, idNo, valor) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        no.bloqueado = valor === undefined ? !no.bloqueado : Boolean(valor);
        return true;
    }

    /** Largura em múltiplos de 8px, com limites mínimo/máximo. */
    function definirLargura(grafo, idNo, largura) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        const base = Number.isFinite(Number(largura))
            ? Number(largura)
            : (Number(no.largura) > 0 ? Number(no.largura) : LARGURA_NO);
        const ajustada = Math.round(base / PASSO_LARGURA) * PASSO_LARGURA;
        no.largura = Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, ajustada));
        return true;
    }

    /** Remove o nó e toda a sua ramificação (ordem dos irmãos normalizada). */
    function excluirSubarvore(grafo, idNo) {
        const alvo = obterNo(grafo, idNo);
        if (!alvo) return [];
        const ids = [idNo, ...listarDescendentes(grafo, idNo)];
        const removidos = new Set(ids);
        grafo.nos = (grafo.nos || []).filter(no => !removidos.has(no.id));
        grafo.conexoes = (grafo.conexoes || []).filter(cx => !removidos.has(cx.de) && !removidos.has(cx.para));
        normalizarOrdem(grafo, alvo.paiId || null);
        return ids;
    }

    /** Cópia serializável da subárvore (clipboard/duplicar). */
    function copiarSubarvore(grafo, idNo) {
        if (!obterNo(grafo, idNo)) return null;
        const ids = new Set([idNo, ...listarDescendentes(grafo, idNo)]);
        return {
            raizId: idNo,
            nos: (grafo.nos || []).filter(no => ids.has(no.id)).map(no => JSON.parse(JSON.stringify(no)))
        };
    }

    /** Cola uma subárvore como filha de `paiId`, com IDs novos. */
    function colarSubarvore(grafo, payload, paiId) {
        if (!payload || !payload.nos || !payload.nos.length) return null;
        const mapa = new Map();
        payload.nos.forEach(origem => {
            mapa.set(origem.id, criarNo(grafo, Object.assign(dadosConteudoNo(origem), {
                colapsado: origem.colapsado, bloqueado: origem.bloqueado, estilo: origem.estilo,
                posicao: origem.posicao, largura: origem.largura
            })));
        });
        payload.nos.forEach(origem => {
            const copia = mapa.get(origem.id);
            copia.paiId = origem.id === payload.raizId
                ? (paiId || null)
                : (mapa.has(origem.paiId) ? mapa.get(origem.paiId).id : null);
        });
        const pai = paiId ? obterNo(grafo, paiId) : null;
        if (pai) pai.colapsado = false;
        normalizarGrafo(grafo);
        return mapa.get(payload.raizId) || null;
    }

    /** Duplica a subárvore: a cópia entra logo DEPOIS do original, no mesmo pai. */
    function duplicarSubarvore(grafo, idNo) {
        const original = obterNo(grafo, idNo);
        if (!original) return null;
        const copia = copiarSubarvore(grafo, idNo);
        const novo = colarSubarvore(grafo, copia, original.paiId || null);
        if (!novo) return null;
        const irmaos = listarFilhos(grafo, original.paiId || null).filter(item => item.id !== novo.id);
        const indice = irmaos.indexOf(original);
        irmaos.splice(indice >= 0 ? indice + 1 : irmaos.length, 0, novo);
        irmaos.forEach((item, i) => { item.ordem = i; });
        return novo;
    }

    /** Reparenting: move `idNo` para `novoPaiId` na posição `indice` (bloqueia ciclo). */
    function moverNoPara(grafo, idNo, novoPaiId, indice) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        if (contemCiclo(grafo, idNo, novoPaiId || null)) return false;
        const paiAnterior = no.paiId || null;
        no.paiId = novoPaiId || null;
        const irmaos = listarFilhos(grafo, novoPaiId || null).filter(item => item.id !== idNo);
        const posicao = Number.isInteger(indice) ? Math.max(0, Math.min(indice, irmaos.length)) : irmaos.length;
        irmaos.splice(posicao, 0, no);
        irmaos.forEach((item, i) => { item.ordem = i; });
        if (paiAnterior !== (novoPaiId || null)) normalizarOrdem(grafo, paiAnterior);
        if (novoPaiId) {
            const pai = obterNo(grafo, novoPaiId);
            if (pai) pai.colapsado = false;
        }
        return true;
    }

    /** Reordena entre irmãos (`delta` -1 sobe, +1 desce). */
    function moverOrdemRelativa(grafo, idNo, delta) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        const irmaos = listarFilhos(grafo, no.paiId || null);
        const indice = irmaos.indexOf(no);
        const destino = indice + delta;
        if (indice < 0 || destino < 0 || destino >= irmaos.length) return false;
        irmaos.splice(indice, 1);
        irmaos.splice(destino, 0, no);
        irmaos.forEach((item, i) => { item.ordem = i; });
        return true;
    }
    // 🔄 [FIM: MAPA - COMANDOS DE NÓ]

    // 🔄 [INÍCIO: MAPA - COMANDOS DE CONTEÚDO]
    /**
     * Atualiza o conteúdo do nó (Fase 4). Só os campos presentes em `mudancas` mudam;
     * tudo é sanitizado (texto puro/HTML seguro/URLs e datas validadas).
     */
    function atualizarConteudo(grafo, idNo, mudancas) {
        const no = obterNo(grafo, idNo);
        if (!no || !mudancas) return false;
        const tem = campo => Object.prototype.hasOwnProperty.call(mudancas, campo);
        if (tem('titulo')) no.titulo = sanitizarTexto(mudancas.titulo);
        if (tem('descricao')) no.descricao = htmlSeguro(mudancas.descricao);
        if (tem('notas')) no.notas = htmlSeguro(mudancas.notas);
        if (tem('icone')) no.icone = sanitizarTexto(mudancas.icone).slice(0, 8);
        if (tem('emoji')) no.emoji = sanitizarTexto(mudancas.emoji).slice(0, 4);
        if (tem('responsavel')) no.responsavel = sanitizarTexto(mudancas.responsavel);
        if (tem('tags')) no.tags = normalizarTags(mudancas.tags);
        if (tem('links')) no.links = normalizarLinks(mudancas.links);
        if (tem('refs')) no.refs = normalizarRefs(mudancas.refs);
        // Vínculo Notas↔Mapa: id da nota aberta ao clicar no nó (`null` limpa).
        if (tem('notaRef')) no.notaRef = mudancas.notaRef ? sanitizarTexto(mudancas.notaRef) : null;
        if (tem('prioridade')) {
            no.prioridade = PRIORIDADES.includes(mudancas.prioridade) ? mudancas.prioridade : null;
        }
        if (tem('status')) no.status = STATUS_NO.includes(mudancas.status) ? mudancas.status : '';
        if (tem('tarefa')) no.tarefa = Boolean(mudancas.tarefa);
        if (tem('concluido')) no.concluido = Boolean(mudancas.concluido);
        if (tem('progresso')) no.progresso = limitarProgresso(mudancas.progresso);
        if (tem('inicio')) no.inicio = normalizarData(mudancas.inicio);
        if (tem('prazo')) no.prazo = normalizarData(mudancas.prazo);
        if (no.concluido) no.progresso = 100;
        return true;
    }

    /** Define (ou limpa) a NOTA vinculada ao nó — vínculo Notas↔Mapa. */
    function definirNotaRef(grafo, idNo, notaId) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        no.notaRef = notaId ? sanitizarTexto(notaId) : null;
        return true;
    }

    /** Marca/desmarca o nó como concluído (tarefa). Concluir zera para 100%. */
    function alternarConcluido(grafo, idNo, valor) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        no.concluido = valor === undefined ? !no.concluido : Boolean(valor);
        if (no.concluido) no.progresso = 100;
        return true;
    }

    /**
     * Anexa um arquivo/imagem (base64) ao nó. Rejeita vazio e acima de `LIMITE_ANEXO`
     * (a cota do localStorage é ~5 MB — limitar ANTES de gravar).
     */
    function adicionarAnexo(grafo, idNo, anexo) {
        const no = obterNo(grafo, idNo);
        if (!no || !anexo) return null;
        const dados = String(anexo.dados == null ? '' : anexo.dados);
        if (!dados || dados.length > LIMITE_ANEXO) return null;
        const item = {
            id: 'anx' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            nome: sanitizarTexto(anexo.nome) || 'arquivo',
            tipo: sanitizarTexto(anexo.tipo) || 'application/octet-stream',
            tamanho: Number(anexo.tamanho) || dados.length,
            largura: Number(anexo.largura) || null,
            altura: Number(anexo.altura) || null,
            dados
        };
        no.anexos = Array.isArray(no.anexos) ? no.anexos : [];
        no.anexos.push(item);
        // Imagens também entram na coleção `imagens` (render de thumbnail).
        if (/^image\//i.test(item.tipo)) {
            no.imagens = Array.isArray(no.imagens) ? no.imagens : [];
            no.imagens.push({ id: item.id, nome: item.nome, dados: item.dados, largura: item.largura, altura: item.altura });
        }
        return item;
    }

    /** Remove um anexo (e a imagem correspondente) do nó. */
    function removerAnexo(grafo, idNo, idAnexo) {
        const no = obterNo(grafo, idNo);
        if (!no || !idAnexo) return false;
        no.anexos = (no.anexos || []).filter(item => item.id !== idAnexo);
        no.imagens = (no.imagens || []).filter(item => item.id !== idAnexo);
        return true;
    }
    // 🔄 [FIM: MAPA - COMANDOS DE CONTEÚDO]

    // 🔄 [INÍCIO: MAPA - ESTILO (FASE 9)]
    // Formas, fontes, alinhamento, tamanhos e temas do mapa (paleta) — só o VISUAL.
    const FORMAS_NO = ['retangulo', 'pilula', 'elipse', 'nota'];
    const ALINHAMENTOS_NO = ['esquerda', 'centro', 'direita'];
    const FONTES_NO = ['sistema', 'serif', 'mono', 'cursiva'];
    const TAMANHOS_NO = [12, 13, 14, 16, 18, 20];
    const ESPESSURAS_BORDA = [1, 2, 3, 4];
    const LIMITE_RAMO = 8;
    const TEMAS_MAPA = [
        { id: 'padrao', nome: 'Padrão', no: null },
        { id: 'neon', nome: 'Neon', no: { cor: '#e6f1ff', fundo: '#0d1b2a', borda: '#4cc9f0' } },
        { id: 'pastel', nome: 'Pastel', no: { cor: '#3b3b4f', fundo: '#fdf2f8', borda: '#f0abfc' } },
        { id: 'monocromatico', nome: 'Monocromático', no: { cor: '#f5f5f7', fundo: '#2b2b33', borda: '#8b8b9a' } }
    ];

    /** Normaliza o estilo VISUAL (nó ou nível): só chaves conhecidas, valores validados. */
    function normalizarEstilo(estilo) {
        const item = (estilo && typeof estilo === 'object') ? estilo : {};
        const saida = {};
        const cor = chave => {
            const valor = normalizarCor(item[chave]);
            if (valor) saida[chave] = valor;
        };
        cor('cor');
        cor('fundo');
        cor('borda');
        if (FORMAS_NO.includes(item.forma)) saida.forma = item.forma;
        // Fonte: as chaves conhecidas (FONTES_NO) OU uma família CSS válida — o catálogo
        // do sistema (`NotasFontes`) aplica `style.fontFamily` com pares de fallback.
        if (FONTES_NO.includes(item.fonte)) saida.fonte = item.fonte;
        else if (typeof item.fonte === 'string' && /^[\w\s,'-]{1,120}$/.test(item.fonte.trim())) saida.fonte = item.fonte.trim();
        if (ALINHAMENTOS_NO.includes(item.alinhamento)) saida.alinhamento = item.alinhamento;
        if (TAMANHOS_NO.includes(Number(item.tamanho))) saida.tamanho = Number(item.tamanho);
        if (ESPESSURAS_BORDA.includes(Number(item.espessuraBorda))) saida.espessuraBorda = Number(item.espessuraBorda);
        const ramo = item.espessuraRamo;
        if (ramo !== undefined && ramo !== null && ramo !== '' && Number.isFinite(Number(ramo))) {
            saida.espessuraRamo = Math.max(1, Math.min(LIMITE_RAMO, Math.round(Number(ramo))));
        }
        if (typeof item.negrito === 'boolean') saida.negrito = item.negrito;
        if (typeof item.italico === 'boolean') saida.italico = item.italico;
        return saida;
    }

    /** Normaliza o mapa de estilos por nível (`{ '2': {...} }`); níveis vazios são removidos. */
    function normalizarEstilosNivel(mapa) {
        const saida = {};
        if (!mapa || typeof mapa !== 'object') return saida;
        Object.keys(mapa).forEach(chave => {
            const nivel = Number(chave);
            if (!Number.isFinite(nivel) || nivel < 1) return;
            const estilo = normalizarEstilo(mapa[chave]);
            if (Object.keys(estilo).length) saida[String(nivel)] = estilo;
        });
        return saida;
    }

    /** Tema (paleta) do mapa; cai no `padrao` quando o id é desconhecido. */
    function temaDoMapa(grafo) {
        const id = (grafo && grafo.temaId) || 'padrao';
        return TEMAS_MAPA.find(t => t.id === id) || TEMAS_MAPA[0];
    }

    /** Nível do nó na árvore (1 = raiz) — base dos estilos por nível. */
    function nivelDoNo(grafo, idNo) {
        const porId = new Map(((grafo && grafo.nos) || []).map(no => [no.id, no]));
        let nivel = 1;
        let atual = porId.get(idNo);
        const vistos = new Set();
        while (atual && atual.paiId && !vistos.has(atual.id)) {
            vistos.add(atual.id);
            atual = porId.get(atual.paiId);
            if (!atual) break;
            nivel += 1;
        }
        return nivel;
    }

    /** Precedência de estilo: NÓ > NÍVEL > TEMA do mapa. Sempre devolve estilo normalizado. */
    function estiloEfetivo(grafo, no) {
        if (!no) return {};
        const base = temaDoMapa(grafo).no || {};
        const nivel = nivelDoNo(grafo, no.id);
        const porNivel = (grafo && grafo.estilosNivel && grafo.estilosNivel[String(nivel)]) || {};
        return normalizarEstilo(Object.assign({}, base, porNivel, no.estilo || {}));
    }

    /** Copia SÓ o visual do nó (nunca conteúdo/tarefa) — alimenta o "pincel". */
    function copiarEstiloNo(no) {
        return no ? normalizarEstilo(no.estilo) : {};
    }

    /** Aplica mudanças no estilo do nó (merge). Devolve `true` quando algo mudou. */
    function atualizarEstiloNo(grafo, idNo, mudancas) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        const antes = JSON.stringify(no.estilo || {});
        no.estilo = normalizarEstilo(Object.assign({}, no.estilo || {}, mudancas || {}));
        return antes !== JSON.stringify(no.estilo);
    }

    /** Limpa o estilo próprio do nó (volta a herdar nível/tema) — "restaurar padrão". */
    function limparEstiloNo(grafo, idNo) {
        const no = obterNo(grafo, idNo);
        if (!no) return false;
        no.estilo = {};
        return true;
    }

    /** Define/limpa o estilo de um NÍVEL (1 = raiz). Sem chaves válidas, o nível é removido. */
    function definirEstiloNivel(grafo, nivel, mudancas) {
        const numero = Number(nivel);
        if (!grafo || !Number.isFinite(numero) || numero < 1) return false;
        const mapa = normalizarEstilosNivel(grafo.estilosNivel);
        const novo = normalizarEstilo(Object.assign({}, mapa[String(numero)] || {}, mudancas || {}));
        if (Object.keys(novo).length) mapa[String(numero)] = novo;
        else delete mapa[String(numero)];
        grafo.estilosNivel = mapa;
        return true;
    }

    /** Remove COMPLETAMENTE o estilo de um nível (volta a herdar tema) — "limpar nível". */
    function removerEstiloNivel(grafo, nivel) {
        const numero = Number(nivel);
        if (!grafo || !Number.isFinite(numero) || numero < 1) return false;
        const mapa = normalizarEstilosNivel(grafo.estilosNivel);
        delete mapa[String(numero)];
        grafo.estilosNivel = mapa;
        return true;
    }

    /** Troca o tema (paleta) do mapa. */
    function definirTemaMapa(grafo, temaId) {
        if (!grafo || !TEMAS_MAPA.some(t => t.id === temaId)) return false;
        grafo.temaId = temaId;
        return true;
    }
    // 🔄 [FIM: MAPA - ESTILO (FASE 9)]

    // 🔄 [INÍCIO: MAPA - CONEXÕES LIVRES (FASE 6)]
    const TIPOS_LINHA = ['reta', 'curva', 'ortogonal'];
    const ESTILOS_SETA = ['nenhuma', 'fim', 'inicio', 'ambos'];
    const LARGURA_CONEXAO = 2;
    const LIMITE_ESPESSURA = 8;

    const normalizarCor = valor => {
        const texto = String(valor == null ? '' : valor).trim();
        return /^#[0-9a-f]{3,8}$/i.test(texto) ? texto : null;
    };

    const limitarEspessura = valor => {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return LARGURA_CONEXAO;
        return Math.max(1, Math.min(LIMITE_ESPESSURA, Math.round(numero)));
    };

    /** Normaliza uma conexão existente (migração/importação). */
    function normalizarConexao(cx) {
        const item = cx || {};
        return {
            id: item.id || '',
            de: item.de,
            para: item.para,
            direcionada: item.direcionada === undefined ? true : Boolean(item.direcionada),
            texto: sanitizarTexto(item.texto),
            tipoLinha: TIPOS_LINHA.includes(item.tipoLinha) ? item.tipoLinha : 'curva',
            cor: normalizarCor(item.cor),
            espessura: limitarEspessura(item.espessura),
            estiloSeta: ESTILOS_SETA.includes(item.estiloSeta) ? item.estiloSeta : (item.direcionada === false ? 'nenhuma' : 'fim')
        };
    }

    function obterConexao(grafo, idCx) {
        return ((grafo && grafo.conexoes) || []).find(cx => cx.id === idCx) || null;
    }

    function listarConexoes(grafo) {
        return ((grafo && grafo.conexoes) || []).slice();
    }

    function listarConexoesDoNo(grafo, idNo) {
        return ((grafo && grafo.conexoes) || []).filter(cx => cx.de === idNo || cx.para === idNo);
    }

    /** Cria uma conexão livre entre dois nós (independente da hierarquia). */
    function criarConexao(grafo, de, para, opcoes) {
        const cfg = opcoes || {};
        if (!grafo || !de || !para || de === para) return null;
        if (!obterNo(grafo, de) || !obterNo(grafo, para)) return null;
        grafo.conexoes = Array.isArray(grafo.conexoes) ? grafo.conexoes : [];
        const direcionada = cfg.direcionada === undefined ? true : Boolean(cfg.direcionada);
        const cx = normalizarConexao({
            id: cfg.id || proximoIdConexao(grafo),
            de, para,
            direcionada,
            texto: cfg.texto,
            tipoLinha: cfg.tipoLinha,
            cor: cfg.cor,
            espessura: cfg.espessura,
            estiloSeta: cfg.estiloSeta || (direcionada ? 'fim' : 'nenhuma')
        });
        grafo.conexoes.push(cx);
        return cx;
    }

    /** Atualiza rótulo/estilo/direção de uma conexão (só os campos presentes). */
    function atualizarConexao(grafo, idCx, mudancas) {
        const cx = obterConexao(grafo, idCx);
        if (!cx || !mudancas) return false;
        const tem = campo => Object.prototype.hasOwnProperty.call(mudancas, campo);
        if (tem('texto')) cx.texto = sanitizarTexto(mudancas.texto);
        if (tem('direcionada')) cx.direcionada = Boolean(mudancas.direcionada);
        if (tem('tipoLinha')) cx.tipoLinha = TIPOS_LINHA.includes(mudancas.tipoLinha) ? mudancas.tipoLinha : cx.tipoLinha;
        if (tem('cor')) cx.cor = normalizarCor(mudancas.cor);
        if (tem('espessura')) cx.espessura = limitarEspessura(mudancas.espessura);
        if (tem('estiloSeta')) cx.estiloSeta = ESTILOS_SETA.includes(mudancas.estiloSeta) ? mudancas.estiloSeta : cx.estiloSeta;
        return true;
    }

    function removerConexao(grafo, idCx) {
        if (!grafo || !idCx) return false;
        const antes = (grafo.conexoes || []).length;
        grafo.conexoes = (grafo.conexoes || []).filter(cx => cx.id !== idCx);
        return grafo.conexoes.length !== antes;
    }
    // 🔄 [FIM: MAPA - CONEXÕES LIVRES (FASE 6)]

    global.MapaMentalModelo = {
        SCHEMA_VERSION, LAYOUTS, TEMPLATES_PRONTOS,
        ESPACO_NO_PADRAO, ESPACO_NIVEL_PADRAO, ESPACO_MAX, normalizarEspacamento,
        LARGURA_NO, LARGURA_MIN, LARGURA_MAX, PASSO_LARGURA,
        PRIORIDADES, STATUS_NO, LIMITE_ANEXO, LIMITE_TEXTO, LIMITE_TAGS, CAMPOS_CONTEUDO,
        sanitizarTexto, escaparHtml, urlSegura, extrairLinks, htmlSeguro, normalizarData, limitarProgresso,
        normalizarTags, normalizarLinks, normalizarRefs, normalizarConteudoNo, dadosConteudoNo,
        atualizarConteudo, definirNotaRef, alternarConcluido, adicionarAnexo, removerAnexo,
        TIPOS_LINHA, ESTILOS_SETA, LARGURA_CONEXAO, normalizarCor, limitarEspessura, normalizarConexao,
        FORMAS_NO, ALINHAMENTOS_NO, FONTES_NO, TAMANHOS_NO, ESPESSURAS_BORDA, TEMAS_MAPA,
        normalizarEstilo, normalizarEstilosNivel, temaDoMapa, nivelDoNo, estiloEfetivo,
        copiarEstiloNo, atualizarEstiloNo, limparEstiloNo, definirEstiloNivel, removerEstiloNivel, definirTemaMapa,
        criarConexao, obterConexao, listarConexoes, listarConexoesDoNo, atualizarConexao, removerConexao,
        criarGrafo, proximoIdNo, proximoIdConexao, criarNo, obterNo,
        listarFilhos, normalizarOrdem, contemCiclo, migrarGrafo, normalizarGrafo, duplicarGrafo,
        aplicarTemplatePronto, criarNoPonte, listarNosPonte,
        listarDescendentes, listarVisiveis, mapaDeNiveis, idsComFilhos,
        criarFilhoDe, criarIrmaoDe, criarNoIndependente, atualizarTitulo, moverNoLivre,
        definirRecolhido, definirBloqueado, definirLargura,
        excluirSubarvore, copiarSubarvore, colarSubarvore, duplicarSubarvore,
        moverNoPara, moverOrdemRelativa
    };
})(typeof window !== 'undefined' ? window : globalThis);
