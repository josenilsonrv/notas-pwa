// ============================================
// MAPA MENTAL - Interação do canvas
// Fase 2: pan, zoom (botões, Ctrl+scroll e pinça) por Pointer Events.
// Fase 3: seleção (clique/Ctrl/Shift + laço), arrasto de nó e reparenting,
// redimensionar, edição inline (duplo clique/F2/toque longo) e atalhos.
// Todas as funções são chamadas com `this` = instância da aplicação.
// ============================================
(function (global) {
    'use strict';

    const ZOOM_MIN = 0.25;
    const ZOOM_MAX = 3;
    const PASSO_ZOOM = 1.2;
    const LIMITE_ARRASTO = 4; // px de tela para considerar "moveu"
    const TOQUE_LONGO_MS = 550;

    const limitarZoom = valor => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(valor) || 1));

    /** Zoom mantendo fixo o ponto (cx, cy) da tela. */
    function zoomEmPonto(viewport, novoZoom, cx, cy) {
        const zoom = limitarZoom(novoZoom);
        const fator = zoom / ((viewport && viewport.zoom) || 1);
        return {
            x: cx - (cx - ((viewport && viewport.x) || 0)) * fator,
            y: cy - (cy - ((viewport && viewport.y) || 0)) * fator,
            zoom
        };
    }

    const pontoLocal = (canvas, evento) => {
        const retangulo = canvas.getBoundingClientRect();
        return {
            x: evento.clientX - retangulo.left,
            y: evento.clientY - retangulo.top,
            largura: retangulo.width,
            altura: retangulo.height
        };
    };

    const canvasDoEvento = evento => (evento.target && evento.target.closest ? evento.target.closest('#mapaCanvas') : null);
    const render = () => global.MapaMentalRender;
    const modelo = () => global.MapaMentalModelo;

    /** Controles/minimapa/paleta/menu NÃO iniciam pan, arrasto nem zoom (stopPropagation consciente). */
    const alvoInterativo = evento => Boolean(evento.target && evento.target.closest
        && evento.target.closest('#mapaMinimapa, #mapaCoresPaleta, #mapaMenu, #mapaBarraEditor, #mapaToolbar, #mapaFormatBar, .mapa-canvas-controles, .mapa-no-acoes, button, input, select, a, .mapa-chip, .mapa-conexao-hit'));
    const alvoAlternador = evento => Boolean(evento.target && evento.target.closest && evento.target.closest('.mapa-no-toggle'));

    const noAtual = (app, id) => {
        const grafo = app.mapaCanvasGrafo;
        return grafo ? (grafo.nos || []).find(no => no.id === id) || null : null;
    };

    // 🔄 [INÍCIO: MAPA - SELEÇÃO]
    /** Seleciona (ou alterna) um nó; `aditivo` mantém a seleção anterior. */
    function selecionarNo(idNo, aditivo) {
        if (!this.mapaSelecao) this.mapaSelecao = new Set();
        if (!aditivo) this.mapaSelecao.clear();
        if (idNo) {
            if (aditivo && this.mapaSelecao.has(idNo)) this.mapaSelecao.delete(idNo);
            else this.mapaSelecao.add(idNo);
        }
        const r = render();
        if (r) r.atualizarSelecao(this.mapaSelecao);
    }

    /** Último id selecionado (alvo principal das ações). */
    const idPrincipal = app => {
        const lista = [...(app.mapaSelecao || [])];
        return lista.length ? lista[lista.length - 1] : null;
    };
    // 🔄 [FIM: MAPA - SELEÇÃO]

    // 🔄 [INÍCIO: MAPA - EDIÇÃO INLINE]
    const textoDoNo = idNo => document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + idNo + '"] .mapa-no-texto');

    /**
     * Regra de teclado na edição (documentada):
     * - `Enter` confirma · `Shift+Enter` quebra linha · `Tab` confirma e cria um FILHO
     * - `Esc` cancela (restaura o texto).
     * Fora da edição: `Enter` cria irmão, `Tab` cria filho, `F2`/duplo clique edita.
     */
    function iniciarEdicao(idNo) {
        const no = noAtual(this, idNo);
        const texto = textoDoNo(idNo);
        if (!no || !texto || no.bloqueado) return false;
        if (this.mapaEditandoId && this.mapaEditandoId !== idNo) confirmarEdicao.call(this, true);
        this.mapaEditandoId = idNo;
        this.mapaEdicaoOriginal = no.titulo || '';
        texto.setAttribute('contenteditable', 'plaintext-only');
        texto.classList.add('mapa-no-editor');
        const elemento = texto.closest('.mapa-no');
        if (elemento) elemento.classList.add('mapa-no-editando');
        texto.focus();
        const selecao = global.getSelection ? global.getSelection() : null;
        if (selecao) {
            const faixa = document.createRange();
            faixa.selectNodeContents(texto);
            selecao.removeAllRanges();
            selecao.addRange(faixa);
        }
        return true;
    }

    function confirmarEdicao(salvar) {
        const idNo = this.mapaEditandoId;
        if (!idNo) return;
        const texto = textoDoNo(idNo);
        const titulo = texto ? texto.textContent.replace(/\s+/g, ' ').trim() : '';
        if (texto) {
            texto.removeAttribute('contenteditable');
            texto.classList.remove('mapa-no-editor');
        }
        const elemento = texto ? texto.closest('.mapa-no') : null;
        if (elemento) elemento.classList.remove('mapa-no-editando');
        this.mapaEditandoId = null;
        if (salvar !== false && titulo !== this.mapaEdicaoOriginal && typeof this.mapaCommitarTituloNo === 'function') {
            this.mapaCommitarTituloNo(idNo, titulo);
        } else if (texto) {
            texto.textContent = this.mapaEdicaoOriginal || '';
        }
        this.mapaEdicaoOriginal = null;
        // Devolve o foco ao canvas para os atalhos de criacao continuarem funcionando.
        focarCanvas.call(this);
    }

    function cancelarEdicao() {
        confirmarEdicao.call(this, false);
    }
    // 🔄 [FIM: MAPA - EDIÇÃO INLINE]

    // 🔄 [INÍCIO: MAPA - ARRASTO/REDIMENSIONAR/LAÇO]
    function limparArrasto() {
        clearTimeout(this.mapaLongPressTimer);
        this.mapaLongPressTimer = null;
        this.mapaArrastoNo = null;
        this.mapaRedimensionando = null;
        this.mapaLaco = null;
        this.mapaConexaoArrasto = null;
        const laco = document.getElementById('mapaLaco');
        if (laco) laco.hidden = true;
        const temp = document.getElementById('mapaConexaoTemp');
        if (temp) temp.remove();
        document.querySelectorAll('#mapaNos .mapa-no.mapa-no-arrastando')
            .forEach(el => el.classList.remove('mapa-no-arrastando'));
        document.querySelectorAll('#mapaNos .mapa-no.mapa-alvo-reparent')
            .forEach(el => el.classList.remove('mapa-alvo-reparent'));
        document.querySelectorAll('#mapaNos .mapa-no.mapa-alvo-antes, #mapaNos .mapa-no.mapa-alvo-depois, #mapaNos .mapa-no.mapa-alvo-bloqueado')
            .forEach(el => el.classList.remove('mapa-alvo-antes', 'mapa-alvo-depois', 'mapa-alvo-bloqueado'));
        document.querySelectorAll('#mapaNos .mapa-no.mapa-alvo-conexao')
            .forEach(el => el.classList.remove('mapa-alvo-conexao'));
    }

    /** Prepara o arrasto dos nós selecionados (ignora bloqueados). Fase 7: a subárvore acompanha. */
    function iniciarArrastoNo(evento, canvas, idNo) {
        const grafo = this.mapaCanvasGrafo;
        const base = this.mapaSelecao && this.mapaSelecao.has(idNo) ? [...this.mapaSelecao] : [idNo];
        const ids = new Set(base);
        if (grafo && modelo()) {
            // Mover ramificações inteiras: os descendentes vão junto (offsets relativos preservados).
            base.forEach(id => modelo().listarDescendentes(grafo, id).forEach(desc => ids.add(desc)));
        }
        const alvos = [...ids].map(id => noAtual(this, id)).filter(no => no && !no.bloqueado);
        if (!alvos.length) return false;
        const local = pontoLocal(canvas, evento);
        const zoom = (this.mapaCanvasViewport && this.mapaCanvasViewport.zoom) || 1;
        const originais = new Map();
        alvos.forEach(no => originais.set(no.id, {
            x: (no.posicao && no.posicao.x) || 0,
            y: (no.posicao && no.posicao.y) || 0
        }));
        this.mapaArrastoNo = {
            principal: idNo, ids: [...ids], originais, inicio: local, zoom, moveu: false, alvo: null, zona: null,
            cliente: { x: evento.clientX, y: evento.clientY }
        };
        alvos.forEach(no => {
            const el = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + no.id + '"]');
            if (el) el.classList.add('mapa-no-arrastando');
        });
        // Toque longo (celular) abre o MENU do card (F12). A edição continua no duplo clique/F2.
        clearTimeout(this.mapaLongPressTimer);
        this.mapaLongPressTimer = setTimeout(() => {
            if (this.mapaArrastoNo && !this.mapaArrastoNo.moveu) {
                const id = this.mapaArrastoNo.principal;
                const cliente = this.mapaArrastoNo.cliente || { x: 0, y: 0 };
                limparArrasto.call(this);
                if (typeof this.mapaAbrirMenuNo === 'function') this.mapaAbrirMenuNo(id, cliente);
            }
        }, TOQUE_LONGO_MS);
        return true;
    }

    function iniciarRedimensionar(evento, canvas, idNo) {
        const no = noAtual(this, idNo);
        if (!no || no.bloqueado) return;
        const local = pontoLocal(canvas, evento);
        this.mapaRedimensionando = {
            id: idNo,
            inicioX: local.x,
            larguraBase: Number(no.largura) > 0 ? Number(no.largura) : ((modelo() && modelo().LARGURA_NO) || 180),
            zoom: (this.mapaCanvasViewport && this.mapaCanvasViewport.zoom) || 1
        };
        try { canvas.setPointerCapture(evento.pointerId); } catch (_) { /* ponteiro sintético */ }
        evento.preventDefault();
    }

    function iniciarLaco(evento, canvas) {
        const local = pontoLocal(canvas, evento);
        this.mapaLaco = { inicio: local, atual: local, base: new Set(this.mapaSelecao || []) };
        const elemento = document.getElementById('mapaLaco');
        if (elemento) {
            elemento.hidden = false;
            elemento.style.left = local.x + 'px';
            elemento.style.top = local.y + 'px';
            elemento.style.width = '0px';
            elemento.style.height = '0px';
        }
        try { canvas.setPointerCapture(evento.pointerId); } catch (_) { /* ponteiro sintético */ }
        evento.preventDefault();
    }

    /** Atualiza o retângulo do laço e a seleção dos nós que ele intersecta. */
    function atualizarLaco(canvas) {
        const laco = this.mapaLaco;
        if (!laco || !laco.atual) return;
        const x = Math.min(laco.inicio.x, laco.atual.x);
        const y = Math.min(laco.inicio.y, laco.atual.y);
        const largura = Math.abs(laco.atual.x - laco.inicio.x);
        const altura = Math.abs(laco.atual.y - laco.inicio.y);
        const elemento = document.getElementById('mapaLaco');
        if (elemento) {
            elemento.style.left = x + 'px';
            elemento.style.top = y + 'px';
            elemento.style.width = largura + 'px';
            elemento.style.height = altura + 'px';
        }
        const caixa = canvas.getBoundingClientRect();
        const selecionados = new Set(laco.base || []);
        document.querySelectorAll('#mapaNos .mapa-no').forEach(elNo => {
            const r = elNo.getBoundingClientRect();
            const intersecta = !(r.right < caixa.left + x || r.left > caixa.left + x + largura
                || r.bottom < caixa.top + y || r.top > caixa.top + y + altura);
            if (intersecta) selecionados.add(elNo.dataset.mapaNoId);
        });
        this.mapaSelecao = selecionados;
        const r = render();
        if (r) r.atualizarSelecao(selecionados);
    }

    /**
     * Destaca o destino do arrasto com zonas (Fase 7):
     * cima = inserir como irmão antes · meio = reparent (filho) · baixo = inserir depois.
     * Alvos que criariam ciclo ficam marcados como bloqueados (não recebem o drop).
     */
    const ZONA_ANTES = 0.3;
    const ZONA_DEPOIS = 0.7;
    const CLASSES_ALVO = ['mapa-alvo-reparent', 'mapa-alvo-antes', 'mapa-alvo-depois', 'mapa-alvo-bloqueado'];

    function destacarAlvoReparent(evento, estado) {
        document.querySelectorAll('#mapaNos .mapa-no').forEach(el => {
            CLASSES_ALVO.forEach(classe => el.classList.remove(classe));
        });
        estado.alvo = null;
        estado.zona = null;
        const alvo = document.elementFromPoint ? document.elementFromPoint(evento.clientX, evento.clientY) : null;
        const elNo = alvo && alvo.closest ? alvo.closest('.mapa-no') : null;
        if (!elNo) return;
        const idAlvo = elNo.dataset.mapaNoId;
        // Não é possível soltar dentro da própria ramificação (daria ciclo): bloqueia visualmente.
        if (estado.ids.includes(idAlvo)) {
            elNo.classList.add('mapa-alvo-bloqueado');
            return;
        }
        const retangulo = elNo.getBoundingClientRect();
        const proporcao = retangulo.height ? (evento.clientY - retangulo.top) / retangulo.height : 0.5;
        let zona = 'dentro';
        if (proporcao < ZONA_ANTES) zona = 'antes';
        else if (proporcao > ZONA_DEPOIS) zona = 'depois';

        const grafo = this.mapaCanvasGrafo;
        const m = modelo();
        // Detecção de ciclo: não soltar um ancestral dentro (ou ao lado) de seu descendente.
        const noAlvo = m && grafo ? m.obterNo(grafo, idAlvo) : null;
        const novoPai = zona === 'dentro' ? idAlvo : ((noAlvo && noAlvo.paiId) || null);
        if (m && grafo && m.contemCiclo(grafo, estado.principal, novoPai)) {
            elNo.classList.add('mapa-alvo-bloqueado');
            return;
        }
        elNo.classList.add(zona === 'dentro' ? 'mapa-alvo-reparent' : (zona === 'antes' ? 'mapa-alvo-antes' : 'mapa-alvo-depois'));
        estado.alvo = idAlvo;
        estado.zona = zona;
    }

    const MARGEM_AUTOSCROLL = 48;
    const PASSO_AUTOSCROLL = 24;
    // Acima disso, não redesenhamos as arestas a cada quadro do arrasto (o render
    // final do comando já atualiza tudo).
    const LIMITE_REDESENHO_VIVO = 300;

    /** Auto-scroll do canvas quando o arrasto chega perto das bordas (mobile/desktop). */
    function autoRolar(canvas, local) {
        const vp = this.mapaCanvasViewport;
        if (!vp) return;
        const caixa = canvas.getBoundingClientRect();
        let dx = 0;
        let dy = 0;
        if (local.x < MARGEM_AUTOSCROLL) dx = PASSO_AUTOSCROLL;
        else if (local.x > caixa.width - MARGEM_AUTOSCROLL) dx = -PASSO_AUTOSCROLL;
        if (local.y < MARGEM_AUTOSCROLL) dy = PASSO_AUTOSCROLL;
        else if (local.y > caixa.height - MARGEM_AUTOSCROLL) dy = -PASSO_AUTOSCROLL;
        if (!dx && !dy) return;
        this.definirViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom });
    }
    // 🔄 [FIM: MAPA - ARRASTO/REDIMENSIONAR/LAÇO]

    // 🔄 [INÍCIO: MAPA - CONEXÃO POR ARRASTO (FASE 6)]
    const SVG_NS = 'http://www.w3.org/2000/svg';

    const pontoMundo = (app, canvas, evento) => {
        const vp = app.mapaCanvasViewport || { x: 0, y: 0, zoom: 1 };
        const local = pontoLocal(canvas, evento);
        return { x: (local.x - vp.x) / (vp.zoom || 1), y: (local.y - vp.y) / (vp.zoom || 1) };
    };

    /** Linha-guia + destaque do alvo durante o arrasto de conexão (Alt+arrastar). */
    function atualizarConexaoArrasto(canvas, evento) {
        const estado = this.mapaConexaoArrasto;
        const grafo = this.mapaCanvasGrafo;
        const r = render();
        if (!estado || !grafo || !r || !r.dimensoesNos) return;
        const svg = document.getElementById('mapaConexoesSvg');
        const caixa = r.dimensoesNos(grafo).get(estado.origem);
        if (!svg || !caixa) return;
        const mundo = pontoMundo(this, canvas, evento);
        let temp = document.getElementById('mapaConexaoTemp');
        if (!temp) {
            temp = document.createElementNS(SVG_NS, 'path');
            temp.setAttribute('id', 'mapaConexaoTemp');
            temp.setAttribute('class', 'mapa-conexao-temp');
            temp.setAttribute('fill', 'none');
            svg.append(temp);
        }
        temp.setAttribute('d', 'M' + (caixa.x + caixa.largura) + ' ' + (caixa.y + caixa.altura / 2)
            + ' L' + mundo.x + ' ' + mundo.y);

        document.querySelectorAll('#mapaNos .mapa-no.mapa-alvo-conexao')
            .forEach(el => el.classList.remove('mapa-alvo-conexao'));
        const sob = document.elementFromPoint ? document.elementFromPoint(evento.clientX, evento.clientY) : null;
        const elAlvo = sob && sob.closest ? sob.closest('.mapa-no') : null;
        if (elAlvo && elAlvo.dataset.mapaNoId !== estado.origem) {
            elAlvo.classList.add('mapa-alvo-conexao');
            estado.alvo = elAlvo.dataset.mapaNoId;
        } else {
            estado.alvo = null;
        }
    }

    /** Redesenha as arestas (ramificações + conexões) quando um nó muda de posição/tamanho. */
    function redesenharConexoes() {
        const r = render();
        const grafo = this.mapaCanvasGrafo;
        if (!r || !r.atualizarConexoes || !grafo) return;
        const temArestas = (grafo.conexoes || []).length || (grafo.nos || []).some(no => no.paiId);
        if (!temArestas || (grafo.nos || []).length > LIMITE_REDESENHO_VIVO) return;
        r.atualizarConexoes(grafo);
    }
    // 🔄 [FIM: MAPA - CONEXÃO POR ARRASTO (FASE 6)]

    // 🔄 [INÍCIO: MAPA - PONTEIRO/RODA]
    /** pointerdown: alça de resize > controles > nó (seleção/arrasto) > laço (Shift) > pan. */
    function pointerDown(evento) {
        const canvas = canvasDoEvento(evento);
        if (!canvas) return;
        if (!this.mapaCanvasPonteiros) this.mapaCanvasPonteiros = new Map();

        const alca = evento.target.closest && evento.target.closest('.mapa-no-resize');
        if (alca) { iniciarRedimensionar.call(this, evento, canvas, alca.dataset.mapaRedimensionar); return; }

        if (alvoInterativo(evento)) return; // botões/controles/minimapa

        if (!this.mapaEditandoId) {
            try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
        }

        const elNo = evento.target.closest && evento.target.closest('.mapa-no');
        if (elNo) {
            const id = elNo.dataset.mapaNoId;
            // Fase 6: modo "Conectar nós" (1º clique = origem, 2º = destino) — funciona no toque.
            if (this.mapaConexaoModo && typeof this.mapaCliqueConexaoNo === 'function') {
                evento.preventDefault();
                this.mapaCliqueConexaoNo(id);
                return;
            }
            // Fase 6: Alt+arrastar desenha a ligação até outro nó (desktop).
            const noCx = noAtual(this, id);
            if (evento.altKey && noCx && !noCx.bloqueado) {
                this.mapaConexaoArrasto = { origem: id, alvo: null };
                try { canvas.setPointerCapture(evento.pointerId); } catch (_) { /* ponteiro sintético */ }
                atualizarConexaoArrasto.call(this, canvas, evento);
                evento.preventDefault();
                return;
            }
            if (this.mapaEditandoId && this.mapaEditandoId !== id) confirmarEdicao.call(this, true);
            const aditivo = Boolean(evento.shiftKey || evento.ctrlKey || evento.metaKey);
            if (!this.mapaSelecao) this.mapaSelecao = new Set();
            if (!this.mapaSelecao.has(id)) selecionarNo.call(this, id, aditivo);
            else if (aditivo) selecionarNo.call(this, id, true);
            if (iniciarArrastoNo.call(this, evento, canvas, id)) {
                try { canvas.setPointerCapture(evento.pointerId); } catch (_) { /* ponteiro sintético */ }
                return;
            }
        }

        if (evento.shiftKey) { iniciarLaco.call(this, evento, canvas); return; }

        this.mapaCanvasPonteiros.set(evento.pointerId, pontoLocal(canvas, evento));
        try { canvas.setPointerCapture(evento.pointerId); } catch (_) { /* ponteiro sintético */ }
        if (this.mapaCanvasPonteiros.size === 1) {
            this.mapaCanvasPan = { x: evento.clientX, y: evento.clientY };
            canvas.classList.add('mapa-canvas-arrastando');
        } else {
            this.mapaCanvasPan = null;
            this.mapaCanvasPinca = null;
        }
        evento.preventDefault();
    }

    /** pointermove: redimensionar > laço > arrasto de nó > pan/pinça. */
    function pointerMove(evento) {
        const canvas = canvasDoEvento(evento);
        if (!canvas) return;

        if (this.mapaConexaoArrasto) {
            atualizarConexaoArrasto.call(this, canvas, evento);
            evento.preventDefault();
            return;
        }

        if (this.mapaRedimensionando) {
            const estado = this.mapaRedimensionando;
            const local = pontoLocal(canvas, evento);
            const delta = (local.x - estado.inicioX) / (estado.zoom || 1);
            if (typeof this.mapaDefinirLarguraNo === 'function') this.mapaDefinirLarguraNo(estado.id, estado.larguraBase + delta);
            redesenharConexoes.call(this);
            evento.preventDefault();
            return;
        }

        if (this.mapaLaco) {
            this.mapaLaco.atual = pontoLocal(canvas, evento);
            atualizarLaco.call(this, canvas);
            evento.preventDefault();
            return;
        }

        if (this.mapaArrastoNo) {
            const estado = this.mapaArrastoNo;
            const local = pontoLocal(canvas, evento);
            const distancia = Math.hypot(local.x - estado.inicio.x, local.y - estado.inicio.y);
            if (!estado.moveu && distancia > LIMITE_ARRASTO) {
                estado.moveu = true;
                clearTimeout(this.mapaLongPressTimer);
            }
            if (!estado.moveu) return;
            const dx = (local.x - estado.inicio.x) / (estado.zoom || 1);
            const dy = (local.y - estado.inicio.y) / (estado.zoom || 1);
            const r = render();
            estado.ids.forEach(id => {
                const no = noAtual(this, id);
                const original = estado.originais.get(id);
                if (!no || !original) return;
                no.posicao = { x: original.x + dx, y: original.y + dy };
                if (r) r.atualizarNo(no);
            });
            redesenharConexoes.call(this);
            autoRolar.call(this, canvas, local);
            destacarAlvoReparent.call(this, evento, estado);
            evento.preventDefault();
            return;
        }

        if (!this.mapaCanvasPonteiros || !this.mapaCanvasPonteiros.size) return;
        if (this.mapaCanvasPonteiros.has(evento.pointerId)) {
            this.mapaCanvasPonteiros.set(evento.pointerId, pontoLocal(canvas, evento));
        }
        const ponteiros = [...this.mapaCanvasPonteiros.values()];
        if (ponteiros.length >= 2) {
            const distancia = Math.hypot(ponteiros[0].x - ponteiros[1].x, ponteiros[0].y - ponteiros[1].y);
            const meioX = (ponteiros[0].x + ponteiros[1].x) / 2;
            const meioY = (ponteiros[0].y + ponteiros[1].y) / 2;
            if (this.mapaCanvasPinca) {
                const fator = distancia / (this.mapaCanvasPinca.distancia || distancia);
                const vp = this.mapaCanvasViewport;
                if (vp) this.definirViewport(zoomEmPonto(vp, vp.zoom * fator, meioX, meioY));
            }
            this.mapaCanvasPinca = { distancia, meioX, meioY };
            evento.preventDefault();
            return;
        }
        if (!this.mapaCanvasPan || !this.mapaCanvasViewport) return;
        const dx = evento.clientX - this.mapaCanvasPan.x;
        const dy = evento.clientY - this.mapaCanvasPan.y;
        this.mapaCanvasPan = { x: evento.clientX, y: evento.clientY };
        this.definirViewport({
            x: this.mapaCanvasViewport.x + dx,
            y: this.mapaCanvasViewport.y + dy,
            zoom: this.mapaCanvasViewport.zoom
        });
        evento.preventDefault();
    }

    /** pointerup: conclui redimensionar/laço/arrasto (ou encerra pan/pinça). */
    function pointerUp(evento) {
        if (this.mapaConexaoArrasto) {
            const estado = this.mapaConexaoArrasto;
            const origem = estado.origem;
            const alvo = estado.alvo;
            limparArrasto.call(this);
            if (alvo && alvo !== origem && typeof this.mapaCriarConexaoEntre === 'function') {
                this.mapaCriarConexaoEntre(origem, alvo, {});
            } else if (typeof this.renderArea === 'function') {
                // Sem alvo válido: apenas limpa a linha-guia.
                this.renderArea();
            }
            return;
        }
        if (this.mapaRedimensionando) {
            const id = this.mapaRedimensionando.id;
            limparArrasto.call(this);
            if (typeof this.mapaFinalizarRedimensionarNo === 'function') this.mapaFinalizarRedimensionarNo(id);
            return;
        }
        if (this.mapaLaco) { limparArrasto.call(this); return; }
        if (this.mapaArrastoNo) {
            const estado = this.mapaArrastoNo;
            const posicoes = new Map(estado.ids.map(id => {
                const no = noAtual(this, id);
                return [id, no && no.posicao ? { x: no.posicao.x, y: no.posicao.y } : null];
            }));
            const principal = estado.principal;
            const alvo = estado.alvo;
            const zona = estado.zona;
            const moveu = estado.moveu;
            limparArrasto.call(this);
            if (moveu && typeof this.mapaFinalizarArrastoNo === 'function') this.mapaFinalizarArrastoNo(principal, posicoes, alvo, zona);
            return;
        }
        if (!this.mapaCanvasPonteiros) return;
        this.mapaCanvasPonteiros.delete(evento.pointerId);
        if (this.mapaCanvasPonteiros.size < 2) this.mapaCanvasPinca = null;
        if (!this.mapaCanvasPonteiros.size) {
            this.mapaCanvasPan = null;
            const canvas = canvasDoEvento(evento);
            if (canvas) canvas.classList.remove('mapa-canvas-arrastando');
        }
    }

    /** wheel: Ctrl/Cmd+scroll dá zoom; sem modificador, rola o mundo. */
    function wheel(evento) {
        const canvas = canvasDoEvento(evento);
        if (!canvas || alvoInterativo(evento)) return;
        if (!this.mapaCanvasViewport) return;
        const local = pontoLocal(canvas, evento);
        if (evento.ctrlKey || evento.metaKey) {
            const fator = evento.deltaY < 0 ? PASSO_ZOOM : 1 / PASSO_ZOOM;
            this.definirViewport(zoomEmPonto(this.mapaCanvasViewport, this.mapaCanvasViewport.zoom * fator, local.x, local.y));
        } else {
            this.definirViewport({
                x: this.mapaCanvasViewport.x - evento.deltaX,
                y: this.mapaCanvasViewport.y - evento.deltaY,
                zoom: this.mapaCanvasViewport.zoom
            });
        }
        evento.preventDefault();
    }
    // 🔄 [FIM: MAPA - PONTEIRO/RODA]

    // 🔄 [INÍCIO: MAPA - MAPA DE ATALHOS (FASE 10)]
    /**
     * Catálogo de ações com o atalho PADRÃO. O usuário pode trocar em "Configurar atalhos"
     * (persistido em `notas-pwa-mapa-atalhos`). As assinaturas são normalizadas por
     * `assinaturaTecla` (ordem ctrl+alt+shift+tecla; letras em minúsculo) — nunca por `keyCode`.
     */
    const ACOES_ATALHO = [
        { id: 'no-filho', rotulo: 'Criar filho', padrao: ['Tab', 'ctrl+Enter', 'Insert'] },
        { id: 'no-irmao', rotulo: 'Criar irmão', padrao: ['Enter', 'shift+Insert'] },
        { id: 'mover-para-pai', rotulo: 'Mover para o pai (desindentar)', padrao: ['shift+Tab'] },
        { id: 'editar', rotulo: 'Editar o nó', padrao: ['F2'] },
        { id: 'excluir', rotulo: 'Excluir o nó', padrao: ['Delete', 'Backspace'] },
        { id: 'duplicar', rotulo: 'Duplicar o nó', padrao: ['ctrl+d'] },
        { id: 'copiar', rotulo: 'Copiar o nó', padrao: ['ctrl+c'] },
        { id: 'recortar', rotulo: 'Recortar o nó', padrao: ['ctrl+x'] },
        { id: 'colar', rotulo: 'Colar', padrao: ['ctrl+v'] },
        { id: 'desfazer', rotulo: 'Desfazer', padrao: ['ctrl+z'] },
        { id: 'refazer', rotulo: 'Refazer', padrao: ['ctrl+shift+z', 'ctrl+y'] },
        { id: 'selecionar-tudo', rotulo: 'Selecionar todos os nós', padrao: ['ctrl+a'] },
        { id: 'navegar-pai', rotulo: 'Ir para o pai', padrao: ['ArrowLeft'] },
        { id: 'navegar-filho', rotulo: 'Ir para o primeiro filho', padrao: ['ArrowRight'] },
        { id: 'navegar-anterior', rotulo: 'Irmão anterior', padrao: ['ArrowUp'] },
        { id: 'navegar-proximo', rotulo: 'Próximo irmão', padrao: ['ArrowDown'] },
        { id: 'subir-ordem', rotulo: 'Subir na ordem', padrao: ['alt+ArrowUp'] },
        { id: 'descer-ordem', rotulo: 'Descer na ordem', padrao: ['alt+ArrowDown'] },
        { id: 'limpar-selecao', rotulo: 'Limpar seleção', padrao: ['Escape'] }
    ];

    /** Assinatura canônica de uma tecla: `ctrl+alt+shift+<tecla>` (letras em minúsculo). */
    function assinaturaTecla(evento) {
        const partes = [];
        if (evento.ctrlKey || evento.metaKey) partes.push('ctrl');
        if (evento.altKey) partes.push('alt');
        if (evento.shiftKey) partes.push('shift');
        let chave = String((evento && evento.key) || '');
        if (chave.length === 1) chave = chave.toLowerCase();
        partes.push(chave);
        return partes.join('+');
    }

    /** Preferências do usuário (`{ acaoId: [assinatura] }`) normalizadas (só ids conhecidos). */
    function normalizarPreferenciasAtalho(prefs) {
        const saida = {};
        const base = (prefs && typeof prefs === 'object') ? prefs : {};
        ACOES_ATALHO.forEach(acao => {
            const lista = Array.isArray(base[acao.id]) ? base[acao.id] : null;
            if (!lista) return;
            const limpa = [...new Set(lista.map(String).filter(Boolean))];
            if (limpa.length) saida[acao.id] = limpa;
        });
        return saida;
    }

    /** Mapa assinatura -> acaoId (padrões + preferências; a preferência vence o padrão). */
    function mapaDeAtalhos(prefs) {
        const preferencias = normalizarPreferenciasAtalho(prefs);
        const mapa = new Map();
        ACOES_ATALHO.forEach(acao => {
            const lista = preferencias[acao.id] || acao.padrao;
            lista.forEach(ass => { if (!mapa.has(ass)) mapa.set(ass, acao.id); });
        });
        return mapa;
    }

    /** Ação em conflito com `assinatura` (ou null) — usado ao configurar os atalhos. */
    function conflitoDeAtalho(prefs, acaoId, assinatura) {
        const dono = mapaDeAtalhos(prefs).get(assinatura);
        return dono && dono !== acaoId ? dono : null;
    }

    /** Teclas em uso por uma ação (preferência do usuário ou padrão). */
    function teclasDaAcao(prefs, acaoId) {
        const acao = ACOES_ATALHO.find(item => item.id === acaoId);
        if (!acao) return [];
        const preferencias = normalizarPreferenciasAtalho(prefs);
        return preferencias[acaoId] || acao.padrao;
    }
    // 🔄 [FIM: MAPA - MAPA DE ATALHOS (FASE 10)]

    // 🔄 [INÍCIO: MAPA - ATALHOS]
    /** Atalhos de teclado dos nós (edição inline tem regras próprias — ver iniciarEdicao). */
    function atalho(evento) {
        if (this.mapaEditandoId) {
            if (evento.key === 'Escape') { evento.preventDefault(); cancelarEdicao.call(this); }
            else if (evento.key === 'Enter' && !evento.shiftKey) { evento.preventDefault(); confirmarEdicao.call(this, true); }
            else if (evento.key === 'Tab') {
                evento.preventDefault();
                const id = this.mapaEditandoId;
                confirmarEdicao.call(this, true);
                if (typeof this.mapaCriarFilhoDeNo === 'function') this.mapaCriarFilhoDeNo(id, true);
            }
            return;
        }
        const prefs = (global.MapaMentalStore && global.MapaMentalStore.lerAtalhos)
            ? global.MapaMentalStore.lerAtalhos() : {};
        const acao = mapaDeAtalhos(prefs).get(assinaturaTecla(evento));
        if (!acao) return;

        const selecao = this.mapaSelecao || new Set();
        const id = [...selecao][selecao.size - 1] || null;

        // Ações globais (não dependem de seleção).
        if (acao === 'selecionar-tudo') { evento.preventDefault(); selecionarTodos.call(this); return; }
        if (acao === 'desfazer') { evento.preventDefault(); this.mapaDesfazer(); return; }
        if (acao === 'refazer') { evento.preventDefault(); this.mapaRefazer(); return; }
        if (acao === 'limpar-selecao') { selecionarNo.call(this, null, false); return; }

        if (!id) {
            // Sem seleção não há irmão/filho de referência: criamos o primeiro tópico (raiz).
            if (acao === 'no-filho' || acao === 'no-irmao') {
                evento.preventDefault();
                if (typeof this.mapaCriarNoIndependente === 'function') this.mapaCriarNoIndependente();
            }
            return;
        }

        switch (acao) {
            case 'no-filho': evento.preventDefault(); this.mapaCriarFilhoDeNo(id, true); break;
            case 'no-irmao': evento.preventDefault(); this.mapaCriarIrmaoDeNo(id, true); break;
            case 'mover-para-pai':
                evento.preventDefault();
                if (typeof this.mapaMoverNoParaPai === 'function') this.mapaMoverNoParaPai(id);
                break;
            case 'editar': evento.preventDefault(); iniciarEdicao.call(this, id); break;
            case 'excluir': evento.preventDefault(); this.mapaExcluirNo(id); break;
            case 'duplicar':
                evento.preventDefault();
                if (typeof this.mapaDuplicarNo === 'function') this.mapaDuplicarNo(id);
                break;
            case 'copiar': this.mapaCopiarNo(id); break;
            case 'recortar': this.mapaRecortarNo(id); break;
            case 'colar': this.mapaColarNo(); break;
            case 'navegar-pai': evento.preventDefault(); navegar.call(this, id, 'pai'); break;
            case 'navegar-filho': evento.preventDefault(); navegar.call(this, id, 'filho'); break;
            case 'navegar-anterior': evento.preventDefault(); navegar.call(this, id, 'anterior'); break;
            case 'navegar-proximo': evento.preventDefault(); navegar.call(this, id, 'proximo'); break;
            case 'subir-ordem': evento.preventDefault(); this.mapaMoverNoOrdem(id, -1); break;
            case 'descer-ordem': evento.preventDefault(); this.mapaMoverNoOrdem(id, 1); break;
        }
    }

    /** Seleciona TODOS os nós do mapa (Ctrl+A). */
    function selecionarTodos() {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo) return;
        this.mapaSelecao = new Set((grafo.nos || []).map(no => no.id));
        const r = render();
        if (r && r.atualizarSelecao) r.atualizarSelecao(this.mapaSelecao);
    }

    /**
     * Navegação estrutural por setas: pai (`ArrowLeft`), primeiro filho (`ArrowRight`),
     * irmão anterior/próximo (`ArrowUp`/`ArrowDown`, em ciclo). Seleciona o destino e
     * garante que ele fique visível (paneja a viewport quando cai fora da tela).
     */
    function navegar(idNo, direcao) {
        const m = modelo();
        if (!m) return;
        let grafo = this.mapaCanvasGrafo;
        let no = grafo ? m.obterNo(grafo, idNo) : null;
        if (!no) return;
        // Descer para um ramo recolhido precisa expandir antes (senão o filho não existe no DOM).
        if (direcao === 'filho' && no.colapsado && typeof this.mapaExpandirNo === 'function') {
            this.mapaExpandirNo(no.id);
            grafo = this.mapaCanvasGrafo;
            no = m.obterNo(grafo, idNo);
            if (!no) return;
        }
        let destino = null;
        if (direcao === 'pai') {
            destino = no.paiId ? m.obterNo(grafo, no.paiId) : null;
        } else if (direcao === 'filho') {
            destino = m.listarFilhos(grafo, no.id)[0] || null;
        } else {
            const irmaos = m.listarFilhos(grafo, no.paiId || null);
            const indice = irmaos.findIndex(item => item.id === idNo);
            if (indice < 0) return;
            const passo = direcao === 'anterior' ? -1 : 1;
            destino = irmaos[indice + passo] || (passo < 0 ? irmaos[irmaos.length - 1] : irmaos[0]) || null;
        }
        if (!destino) return;
        selecionarNo.call(this, destino.id, false);
        if (typeof this.garantirNoVisivel === 'function') this.garantirNoVisivel(destino.id);
    }

    /**
     * Botão direito (PC) abre o MENU CONTEXTUAL (F12): no card → ações do card;
     * no canvas vazio → ações do mapa. Controles/barras/menus são ignorados.
     */
    function contextMenu(evento) {
        if (this.mapaEditandoId) return;
        if (alvoInterativo(evento)) return;
        const alvo = evento.target;
        if (!alvo || !alvo.closest) return;
        const posicao = { x: evento.clientX, y: evento.clientY };
        const elNo = alvo.closest('#mapaNos .mapa-no');
        if (elNo) {
            evento.preventDefault();
            if (typeof this.mapaAbrirMenuNo === 'function') this.mapaAbrirMenuNo(elNo.dataset.mapaNoId, posicao);
            return;
        }
        if (alvo.closest('#mapaCanvas')) {
            evento.preventDefault();
            if (typeof this.mapaAbrirMenuCanvas === 'function') this.mapaAbrirMenuCanvas(posicao);
        }
    }

    /** Duplo clique (ou duplo toque) no nó entra em edição inline. */
    function duploClique(evento) {
        const elNo = evento.target.closest && evento.target.closest('.mapa-no');
        if (!elNo) return;
        evento.preventDefault();
        iniciarEdicao.call(this, elNo.dataset.mapaNoId);
    }
    // 🔄 [FIM: MAPA - ATALHOS]

    /** Devolve o foco ao canvas (superficie dos atalhos), sem roubar de campos DESTA area. */
    function focarCanvas() {
        const canvas = document.getElementById('mapaCanvas');
        const area = document.getElementById('mapaArea');
        if (!canvas || !area || area.hidden) return;
        const ativo = document.activeElement;
        if (ativo && ativo !== canvas && area.contains(ativo)
            && ativo.closest('input, textarea, select, [contenteditable]')) return;
        try { canvas.focus({ preventScroll: true }); } catch (_) { canvas.focus(); }
    }

    global.MapaMentalInteracao = {
        ZOOM_MIN, ZOOM_MAX, PASSO_ZOOM, TOQUE_LONGO_MS,
        limitarZoom, zoomEmPonto,
        pointerDown, pointerMove, pointerUp, wheel,
        atalho, duploClique, focarCanvas, contextMenu,
        selecionarNo, idPrincipal, limparArrasto,
        iniciarEdicao, confirmarEdicao, cancelarEdicao,
        ACOES_ATALHO, assinaturaTecla, normalizarPreferenciasAtalho,
        mapaDeAtalhos, conflitoDeAtalho, teclasDaAcao, selecionarTodos, navegar
    };
})(typeof window !== 'undefined' ? window : globalThis);

