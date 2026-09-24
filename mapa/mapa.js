// ============================================
// MAPA MENTAL - Instalação como área do aplicativo
// Contrato igual ao motor de notas: installMapaMental(NotesPWA) estende o protótipo.
// A área monta LAZY: seletor e shell só são ligados depois de window.__notasPronto.
// ============================================
(function (global) {
    'use strict';

    // 🔄 [INÍCIO: MAPA - ESTADO/HELPERS]
    const store = () => global.MapaMentalStore;
    const modelo = () => global.MapaMentalModelo;
    const render = () => global.MapaMentalRender;

    /** Reúne o que a tela de gestão precisa (índice leve + resumos resolvidos). */
    function dadosGestao() {
        const s = store();
        const pastas = s.listarPastas();
        const pastaPorId = new Map(pastas.map(p => [p.id, p.nome]));
        const mapas = s.listarMapasFiltrados({
            busca: this.mapaBusca, ordenacao: this.mapaOrdenacao,
            pastaId: this.mapaFiltroPasta, incluirArquivados: this.mapaIncluirArquivados
        });
        mapas.forEach(m => { m.pastaNome = m.pastaId ? (pastaPorId.get(m.pastaId) || null) : null; });
        const nomePorId = new Map(s.listarMapas().map(m => [m.id, m.nome]));
        const recentes = s.listarRecentes()
            .map(r => ({ idMapa: r.idMapa, nome: nomePorId.get(r.idMapa) }))
            .filter(r => r.nome);
        const raiz = s.obterMapaRaiz();
        return {
            mapas, pastas, recentes, raizId: raiz ? raiz.id : null,
            busca: this.mapaBusca, ordenacao: this.mapaOrdenacao, filtroPasta: this.mapaFiltroPasta,
            incluirArquivados: this.mapaIncluirArquivados, mostrarTemplates: this.mapaMostrarTemplates,
            templatesProntos: modelo().TEMPLATES_PRONTOS, templatesSalvos: s.listarTemplates(),
            mapaAberto: null
        };
    }

    /** Abre um mapa (persiste o ativo e registra nos recentes). */
    function abrirMapa(id) {
        if (!id || !store().obterGrafo(id)) return false;
        this.mapaAbertaId = id;
        this.mapaAcao = null;
        store().salvarMapaAtivo(id);
        store().registrarRecente(id);
        return true;
    }

    /** Alterna o mapa raiz (Home) — só um por vez. */
    function definirRaiz(id) {
        const atual = store().obterMapaRaiz();
        store().definirMapaRaiz(atual && atual.id === id ? null : id);
    }

    /** Cria um nó-ponte na origem apontando para o destino (link bidirecional). */
    function conectarMapa(origemId, destinoId) {
        if (!origemId || !destinoId || origemId === destinoId) return false;
        const grafo = store().obterGrafo(origemId);
        if (!grafo) return false;
        const resumo = store().obterResumo(destinoId);
        modelo().criarNoPonte(grafo, destinoId, resumo ? resumo.nome : 'Mapa conectado');
        return store().salvarGrafo(grafo);
    }

    /** Aplica um template PRONTO criando e abrindo um mapa novo. */
    function aplicarTemplatePronto(templateId) {
        const tpl = modelo().TEMPLATES_PRONTOS.find(t => t.id === templateId);
        const grafo = store().criarMapa(tpl ? tpl.nome : 'Novo mapa', null);
        modelo().aplicarTemplatePronto(grafo, templateId);
        store().salvarGrafo(grafo);
        abrirMapa.call(this, grafo.id);
    }

    /** Aplica um template SALVO criando e abrindo um mapa novo (IDs novos). */
    function aplicarTemplateSalvo(templateId) {
        const copia = store().criarMapaDeTemplateSalvo(templateId);
        if (copia) abrirMapa.call(this, copia.id);
    }
    // 🔄 [FIM: MAPA - ESTADO/HELPERS]

    // 🔄 [INÍCIO: MAPA - RENDER/CONTROLE]
    /** Redesenha a área conforme o estado (lista de gestão OU mapa aberto). */
    function renderArea() {
        const r = render();
        if (!r) return;
        const dados = dadosGestao.call(this);
        const grafo = this.mapaAbertaId ? store().obterGrafo(this.mapaAbertaId) : null;
        const resumo = this.mapaAbertaId ? store().obterResumo(this.mapaAbertaId) : null;
        if (grafo && resumo) {
            const layout = global.MapaMentalLayout;
            const m = modelo();
            if (layout && layout.garantirPosicoes(grafo)) store().salvarGrafo(grafo);
            dados.mapaAberto = resumo;
            dados.grafo = grafo;
            dados.qtdNos = (grafo.nos || []).length;
            dados.saidas = store().listarSaidas(grafo).filter(item => item.nome);
            dados.backlinks = store().listarBacklinks(grafo.id);
            dados.referenciasQuebradas = store().listarReferenciasQuebradas(grafo);
            dados.visiveis = m.listarVisiveis(grafo);
            dados.comFilhos = m.idsComFilhos(grafo);
            dados.niveis = m.mapaDeNiveis(grafo);
            dados.selecionados = this.mapaSelecao || new Set();
            dados.nosMoverPara = (grafo.nos || []).map(no => ({
                id: no.id, nome: no.titulo || '(sem título)', nivel: dados.niveis.get(no.id)
            }));
            // Painel de propriedades (Fase 4): nó aberto + info do mapa-ponte.
            dados.painelNo = this.mapaPainelNoId ? m.obterNo(grafo, this.mapaPainelNoId) : null;
            if (!dados.painelNo) this.mapaPainelNoId = null;
            if (dados.painelNo && dados.painelNo.mapaRef) {
                const ref = store().obterResumo(dados.painelNo.mapaRef);
                dados.nomeMapaRef = ref ? ref.nome : null;
                dados.refQuebrada = !ref;
            }
            // Conexões livres (Fase 6): menu contextual + estado do modo de conexão.
            dados.conexaoMenu = this.mapaConexaoMenuId ? m.obterConexao(grafo, this.mapaConexaoMenuId) : null;
            if (!dados.conexaoMenu) this.mapaConexaoMenuId = null;
            dados.modoConexao = Boolean(this.mapaConexaoModo);
            dados.origemConexao = this.mapaConexaoOrigem || null;
            this.mapaCanvasGrafo = grafo;
            // Fit/minimapa consideram só os nós visíveis (respeitam ramos recolhidos).
            this.mapaCanvasLimites = layout ? layout.limites(grafo, dados.visiveis) : null;
            // Mantém a viewport em memória enquanto o MESMO mapa estiver aberto
            // (evita "pular" quando a área é redesenhada por outra ação).
            if (this.mapaCanvasMapaId !== grafo.id || !this.mapaCanvasViewport) {
                this.mapaCanvasViewport = viewportNormalizado(grafo.viewport);
                this.mapaSelecao = new Set();
                historicoReset.call(this);
            }
            this.mapaCanvasMapaId = grafo.id;
        } else {
            this.mapaAbertaId = null;
            this.mapaCanvasMapaId = null;
            this.mapaCanvasGrafo = null;
            this.mapaCanvasViewport = null;
            this.mapaCanvasLimites = null;
        }
        r.atualizarShell({
            mapaAberto: dados.mapaAberto, busca: this.mapaBusca,
            ordenacao: this.mapaOrdenacao, incluirArquivados: this.mapaIncluirArquivados,
            mostrarTemplates: this.mapaMostrarTemplates
        });
        const acao = this.mapaAcao;
        // O formulário pode agir sobre um mapa que NÃO está aberto (a lista é a
        // visão padrão) — por isso resolve o alvo por `acao.id`.
        const mapaAlvo = acao && acao.id ? (store().obterResumo(acao.id) || dados.mapaAberto) : dados.mapaAberto;
        r.renderForm(document.getElementById('mapaForm'), acao, {
            mapa: mapaAlvo, pastas: dados.pastas, mapas: store().listarMapas(),
            nosMoverPara: dados.nosMoverPara || [],
            pasta: acao && acao.id ? dados.pastas.find(p => p.id === acao.id) : null
        });
        const wrap = document.getElementById('mapaCanvasWrap');
        if (dados.mapaAberto) {
            r.renderMapaAberto(wrap, dados);
            aplicarViewportNoDom.call(this);
        } else {
            r.renderGestao(wrap, dados);
        }
    }

    /** Cliques da área do mapa (delegação por `data-mapa-acao`). */
    function tratarCliqueMapa(evento) {
        const alvo = evento.target.closest('[data-mapa-acao]');
        if (!alvo) return;
        const acao = alvo.dataset.mapaAcao;
        const id = alvo.dataset.mapaId || null;
        const s = store();
        const interacao = global.MapaMentalInteracao;
        // Ações de nó usam o id do próprio botão (alternador) ou o nó selecionado.
        const idNo = alvo.dataset.mapaNoId || (interacao ? interacao.idPrincipal(this) : null);
        // Ações do canvas são resolvidas sem re-renderizar a área.
        if (ACOES_CANVAS.includes(acao)) { tratarAcaoCanvas.call(this, acao, evento); return; }
        switch (acao) {
            case 'voltar-lista':
                salvarViewportAgora.call(this);
                if (this.mapaSelecao) this.mapaSelecao.clear();
                this.mapaAbertaId = null;
                this.mapaAcao = null;
                break;
            case 'novo': this.mapaAcao = { tipo: 'novo' }; break;
            case 'templates': this.mapaMostrarTemplates = !this.mapaMostrarTemplates; break;
            case 'alternar-arquivados': this.mapaIncluirArquivados = !this.mapaIncluirArquivados; break;
            case 'filtrar-pasta': this.mapaFiltroPasta = alvo.dataset.mapaPasta || 'todas'; break;
            case 'pasta-nova': this.mapaAcao = { tipo: 'pasta-nova' }; break;
            case 'pasta-renomear': this.mapaAcao = { tipo: 'pasta-renomear', id: alvo.dataset.mapaPasta }; break;
            case 'pasta-excluir': s.excluirPasta(alvo.dataset.mapaPasta); break;
            case 'form-cancelar': this.mapaAcao = null; break;
            case 'abrir': abrirMapa.call(this, id); break;
            case 'favoritar': s.favoritarMapa(id); break;
            case 'arquivar': s.arquivarMapa(id); break;
            case 'raiz': definirRaiz(id); break;
            case 'duplicar': { const copia = s.duplicarMapa(id); if (copia) abrirMapa.call(this, copia.id); break; }
            case 'renomear': this.mapaAcao = { tipo: 'renomear', id }; break;
            case 'mover': this.mapaAcao = { tipo: 'mover', id }; break;
            case 'conectar': this.mapaAcao = { tipo: 'conectar', id: this.mapaAbertaId }; break;
            case 'excluir': this.mapaAcao = { tipo: 'excluir', id }; break;
            case 'excluir-confirmar':
                s.excluirMapa(id);
                if (this.mapaAbertaId === id) this.mapaAbertaId = null;
                this.mapaAcao = null;
                break;
            case 'template-salvar': this.mapaAcao = { tipo: 'template', id: this.mapaAbertaId }; break;
            case 'no-filho': mapaCriarFilhoDeNo.call(this, idNo, true); break;
            case 'no-irmao': mapaCriarIrmaoDeNo.call(this, idNo, true); break;
            case 'no-independente': mapaCriarNoIndependente.call(this); break;
            case 'no-editar': if (interacao) interacao.iniciarEdicao.call(this, idNo); return;
            case 'no-propriedades': mapaAbrirPainel.call(this, idNo); return;
            case 'no-concluir': mapaAlternarConcluidoNo.call(this, idNo); break;
            case 'painel-fechar': mapaFecharPainel.call(this); return;
            case 'no-emoji': mapaDefinirEmojiNo.call(this, alvo.dataset.mapaEmoji); break;
            case 'no-anexo-adicionar': mapaPedirAnexoNo.call(this); return;
            case 'no-anexo-remover': mapaRemoverAnexoNo.call(this, idNo, alvo.dataset.mapaAnexo); break;
            case 'ponte-abrir': abrirMapa.call(this, alvo.dataset.mapaRef); break;
            case 'conectar-nos': mapaAlternarModoConexao.call(this); break;
            case 'no-conectar-para':
                this.mapaAcao = { tipo: 'no-conectar-para', id: idNo };
                renderArea.call(this);
                return;
            case 'cx-menu': mapaAbrirMenuConexao.call(this, alvo.dataset.mapaCxId); return;
            case 'cx-fechar': mapaFecharMenuConexao.call(this); return;
            case 'cx-remover': mapaRemoverConexao.call(this, alvo.dataset.mapaCxId); return;
            case 'no-excluir': mapaExcluirNo.call(this, idNo); break;
            case 'no-duplicar': mapaDuplicarNo.call(this, idNo); break;
            case 'no-copiar': mapaCopiarNo.call(this, idNo); break;
            case 'no-recortar': mapaRecortarNo.call(this, idNo); break;
            case 'no-colar': mapaColarNo.call(this); break;
            case 'no-subir': mapaMoverNoOrdem.call(this, idNo, -1); break;
            case 'no-descer': mapaMoverNoOrdem.call(this, idNo, 1); break;
            case 'no-mover-para':
                this.mapaAcao = { tipo: 'no-mover-para', id: idNo };
                renderArea.call(this);
                return;
            case 'no-recolher': mapaRecolherNo.call(this, idNo); break;
            case 'no-expandir': mapaExpandirNo.call(this, idNo); break;
            case 'no-bloquear': mapaBloquearNo.call(this, idNo); break;
            case 'no-largura-menos': mapaAjustarLargura.call(this, idNo, -24); break;
            case 'no-largura-mais': mapaAjustarLargura.call(this, idNo, 24); break;
            case 'no-desfazer': desfazer.call(this); return;
            case 'recolher-tudo': definirRecolhidoTodos.call(this, true); break;
            case 'expandir-tudo': definirRecolhidoTodos.call(this, false); break;
            case 'aplicar-pronto': aplicarTemplatePronto.call(this, alvo.dataset.mapaTemplate); break;
            case 'aplicar-salvo': aplicarTemplateSalvo.call(this, alvo.dataset.mapaTemplate); break;
            case 'template-excluir': s.excluirTemplate(alvo.dataset.mapaTemplate); break;
            default: return;
        }
        renderArea.call(this);
    }

    /** Envio do formulário inline (um handler cobre todos os tipos). */
    function tratarSubmitMapa(evento) {
        const form = evento.target && evento.target.closest ? evento.target.closest('form[data-mapa-form]') : null;
        if (!form) return;
        evento.preventDefault();
        const tipo = form.dataset.mapaForm;
        const id = form.dataset.mapaId || null;
        const valor = nome => { const el = document.getElementById(nome); return el ? String(el.value).trim() : ''; };
        const s = store();
        if (tipo === 'novo') {
            const grafo = s.criarMapa(valor('mapaFormNome') || 'Novo mapa', valor('mapaFormPasta') || null);
            abrirMapa.call(this, grafo.id);
        } else if (tipo === 'renomear') s.renomearMapa(id, valor('mapaFormNome') || null);
        else if (tipo === 'mover') s.moverMapaParaPasta(id, valor('mapaFormPasta') || null);
        else if (tipo === 'conectar') conectarMapa.call(this, id, valor('mapaFormDestino'));
        else if (tipo === 'template') {
            const grafo = s.obterGrafo(id);
            if (grafo) s.salvarTemplate(valor('mapaFormNome') || grafo.nome, grafo);
        } else if (tipo === 'pasta-nova') s.criarPasta(valor('mapaFormNome') || 'Nova pasta');
        else if (tipo === 'pasta-renomear') s.renomearPasta(id, valor('mapaFormNome') || null);
        else if (tipo === 'no-mover-para') mapaMoverNoPara.call(this, id, valor('mapaFormDestino') || null);
        else if (tipo === 'no-conteudo') mapaSalvarConteudoNo.call(this, form.dataset.mapaNoId || id, form);
        else if (tipo === 'no-conectar-para') {
            if (valor('mapaFormDestino')) mapaCriarConexaoEntre.call(this, id, valor('mapaFormDestino'), {});
        } else if (tipo === 'cx-editar') mapaSalvarConexao.call(this, form);
        this.mapaAcao = null;
        renderArea.call(this);
    }

    function tratarMudancaMapa(evento) {
        if (evento.target && evento.target.id === 'mapaOrdem') {
            this.mapaOrdenacao = evento.target.value;
            renderArea.call(this);
        } else if (evento.target && evento.target.id === 'mapaLayout') {
            mapaDefinirLayout.call(this, evento.target.value);
        }
    }

    function tratarBuscaMapa(evento) {
        if (!evento.target || evento.target.id !== 'mapaBusca') return;
        this.mapaBusca = evento.target.value;
        renderArea.call(this);
    }
    // 🔄 [FIM: MAPA - RENDER/CONTROLE]

    // 🔄 [INÍCIO: MAPA - CANVAS/VIEWPORT]
    const viewportNormalizado = vp => ({
        x: Number(vp && vp.x) || 0,
        y: Number(vp && vp.y) || 0,
        zoom: global.MapaMentalInteracao
            ? global.MapaMentalInteracao.limitarZoom(vp && vp.zoom)
            : (Number(vp && vp.zoom) || 1)
    });

    const caixaDoCanvas = () => {
        const canvas = document.getElementById('mapaCanvas');
        if (!canvas) return null;
        const caixa = canvas.getBoundingClientRect();
        return { largura: Math.max(1, caixa.width), altura: Math.max(1, caixa.height) };
    };

    /** Aplica a viewport no DOM (transform do mundo, rótulo de zoom e minimapa). */
    function aplicarViewportNoDom() {
        const vp = this.mapaCanvasViewport;
        const mundo = document.getElementById('mapaMundo');
        if (!mundo || !vp) return;
        mundo.style.transform = 'translate(' + vp.x + 'px,' + vp.y + 'px) scale(' + vp.zoom + ')';
        const rotulo = document.getElementById('mapaZoomAtual');
        if (rotulo) rotulo.textContent = Math.round(vp.zoom * 100) + '%';
        atualizarMinimapa.call(this);
    }

    function atualizarMinimapa() {
        const layout = global.MapaMentalLayout;
        const minimapa = document.getElementById('mapaMinimapa');
        const mmMundo = document.getElementById('mapaMinimapaMundo');
        const mmViewport = document.getElementById('mapaMinimapaViewport');
        const caixa = caixaDoCanvas();
        if (!layout || !minimapa || !mmMundo || !mmViewport || !caixa || !this.mapaCanvasLimites) return;
        const ret = minimapa.getBoundingClientRect();
        const geo = layout.minimapa({
            limites: this.mapaCanvasLimites,
            viewport: this.mapaCanvasViewport,
            canvas: caixa,
            caixa: { largura: Math.max(1, ret.width - 16), altura: Math.max(1, ret.height - 16) }
        });
        mmMundo.style.left = (8 + geo.offsetX) + 'px';
        mmMundo.style.top = (8 + geo.offsetY) + 'px';
        mmMundo.style.width = (geo.larguraMundo * geo.escala) + 'px';
        mmMundo.style.height = (geo.alturaMundo * geo.escala) + 'px';
        mmViewport.style.left = (8 + geo.viewport.left) + 'px';
        mmViewport.style.top = (8 + geo.viewport.top) + 'px';
        mmViewport.style.width = Math.max(6, geo.viewport.width) + 'px';
        mmViewport.style.height = Math.max(6, geo.viewport.height) + 'px';
    }

    /** Define a viewport (com clamp de zoom), atualiza o DOM e agenda a persistência. */
    function definirViewport(novo) {
        this.mapaCanvasViewport = viewportNormalizado(novo);
        aplicarViewportNoDom.call(this);
        agendarSalvarViewport.call(this);
    }

    /** Persiste a viewport com debounce (não grava a cada frame de pan/zoom). */
    function agendarSalvarViewport() {
        clearTimeout(this.mapaSalvarViewportTimer);
        this.mapaSalvarViewportTimer = setTimeout(() => salvarViewportAgora.call(this), 400);
    }

    function salvarViewportAgora() {
        clearTimeout(this.mapaSalvarViewportTimer);
        const id = this.mapaCanvasMapaId;
        if (!id || !this.mapaCanvasViewport) return;
        const grafo = store().obterGrafo(id);
        if (!grafo) return;
        grafo.viewport = { x: this.mapaCanvasViewport.x, y: this.mapaCanvasViewport.y, zoom: this.mapaCanvasViewport.zoom };
        store().salvarGrafo(grafo);
    }
    // 🔄 [FIM: MAPA - CANVAS/VIEWPORT]

    // 🔄 [INÍCIO: MAPA - NAVEGAÇÃO DO CANVAS]
    function zoomCanvas(fator) {
        const interacao = global.MapaMentalInteracao;
        const caixa = caixaDoCanvas();
        if (!interacao || !caixa || !this.mapaCanvasViewport) return;
        definirViewport.call(this, interacao.zoomEmPonto(
            this.mapaCanvasViewport,
            this.mapaCanvasViewport.zoom * fator,
            caixa.largura / 2,
            caixa.altura / 2
        ));
    }

    /** Centraliza os limites do grafo; `ajustarZoom` também calcula o zoom (fit). */
    function enquadrarCanvas(ajustarZoom) {
        const interacao = global.MapaMentalInteracao;
        const caixa = caixaDoCanvas();
        if (!caixa || !this.mapaCanvasLimites || !this.mapaCanvasViewport) return;
        const lim = this.mapaCanvasLimites;
        let zoom = this.mapaCanvasViewport.zoom;
        if (ajustarZoom) {
            const alvo = Math.min(caixa.largura / lim.largura, caixa.altura / lim.altura);
            zoom = interacao ? interacao.limitarZoom(alvo) : alvo;
        }
        definirViewport.call(this, {
            x: (caixa.largura - lim.largura * zoom) / 2 - lim.minX * zoom,
            y: (caixa.altura - lim.altura * zoom) / 2 - lim.minY * zoom,
            zoom
        });
    }

    /** Volta o foco para o nó raiz (mantendo o zoom). */
    function irParaRaiz() {
        const caixa = caixaDoCanvas();
        const grafo = this.mapaCanvasGrafo;
        if (!caixa || !grafo || !this.mapaCanvasViewport) return;
        const ids = new Set((grafo.nos || []).map(no => no.id));
        const raiz = (grafo.nos || [])
            .filter(no => !no.paiId || !ids.has(no.paiId))
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0))[0];
        if (!raiz) return;
        const posicao = raiz.posicao || { x: 0, y: 0 };
        const larguraNo = (global.MapaMentalLayout && global.MapaMentalLayout.LARGURA_PADRAO) || 180;
        definirViewport.call(this, {
            x: caixa.largura / 2 - (posicao.x + larguraNo / 2) * this.mapaCanvasViewport.zoom,
            y: caixa.altura / 2 - posicao.y * this.mapaCanvasViewport.zoom,
            zoom: this.mapaCanvasViewport.zoom
        });
    }

    /** Clique no minimapa: centraliza a viewport no ponto clicado. */
    function navegarMinimapa(evento) {
        const layout = global.MapaMentalLayout;
        const minimapa = document.getElementById('mapaMinimapa');
        const caixa = caixaDoCanvas();
        if (!layout || !minimapa || !caixa || !this.mapaCanvasLimites || !this.mapaCanvasViewport) return;
        const ret = minimapa.getBoundingClientRect();
        const estado = {
            limites: this.mapaCanvasLimites,
            viewport: this.mapaCanvasViewport,
            canvas: caixa,
            caixa: { largura: Math.max(1, ret.width - 16), altura: Math.max(1, ret.height - 16) }
        };
        const ponto = layout.pontoDoMinimapa(estado, evento.clientX - ret.left - 8, evento.clientY - ret.top - 8);
        const zoom = this.mapaCanvasViewport.zoom;
        definirViewport.call(this, {
            x: caixa.largura / 2 - ponto.x * zoom,
            y: caixa.altura / 2 - ponto.y * zoom,
            zoom
        });
    }

    /** Ações do canvas NÃO re-renderizam a área (senão o canvas seria recriado). */
    const ACOES_CANVAS = ['zoom-in', 'zoom-out', 'centralizar', 'fit', 'ir-raiz', 'minimapa-navegar'];
    function tratarAcaoCanvas(acao, evento) {
        const interacao = global.MapaMentalInteracao;
        if (acao === 'zoom-in') zoomCanvas.call(this, interacao ? interacao.PASSO_ZOOM : 1.2);
        else if (acao === 'zoom-out') zoomCanvas.call(this, 1 / (interacao ? interacao.PASSO_ZOOM : 1.2));
        else if (acao === 'centralizar') enquadrarCanvas.call(this, false);
        else if (acao === 'fit') enquadrarCanvas.call(this, true);
        else if (acao === 'ir-raiz') irParaRaiz.call(this);
        else if (acao === 'minimapa-navegar') navegarMinimapa.call(this, evento);
        return true;
    }
    // 🔄 [FIM: MAPA - NAVEGAÇÃO DO CANVAS]

    // 🔄 [INÍCIO: MAPA - HISTÓRICO/COMANDOS]
    const instantaneoGrafo = grafo => ({
        nos: JSON.parse(JSON.stringify((grafo && grafo.nos) || [])),
        conexoes: JSON.parse(JSON.stringify((grafo && grafo.conexoes) || [])),
        idSeq: (grafo && grafo.idSeq) || 0,
        cxSeq: (grafo && grafo.cxSeq) || 0
    });

    function historicoReset() {
        const grafo = this.mapaCanvasGrafo;
        this.mapaHistorico = grafo ? { pilha: [instantaneoGrafo(grafo)], indice: 0 } : { pilha: [], indice: -1 };
    }

    /** Registra um ponto de retorno (uma entrada por COMANDO, nunca por tecla). */
    function registrarHistorico() {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !this.mapaHistorico) return;
        const pilha = this.mapaHistorico.pilha.slice(0, this.mapaHistorico.indice + 1);
        pilha.push(instantaneoGrafo(grafo));
        while (pilha.length > 40) pilha.shift();
        this.mapaHistorico = { pilha, indice: pilha.length - 1 };
    }

    function aplicarInstantaneo(snap) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !snap) return false;
        grafo.nos = JSON.parse(JSON.stringify(snap.nos));
        grafo.conexoes = JSON.parse(JSON.stringify(snap.conexoes));
        grafo.idSeq = snap.idSeq;
        grafo.cxSeq = snap.cxSeq;
        store().salvarGrafo(grafo);
        if (this.mapaSelecao) this.mapaSelecao.clear();
        renderArea.call(this);
        return true;
    }

    function desfazer() {
        const hist = this.mapaHistorico;
        if (!hist || hist.indice <= 0) return false;
        hist.indice -= 1;
        return aplicarInstantaneo.call(this, hist.pilha[hist.indice]);
    }

    function refazer() {
        const hist = this.mapaHistorico;
        if (!hist || hist.indice >= hist.pilha.length - 1) return false;
        hist.indice += 1;
        return aplicarInstantaneo.call(this, hist.pilha[hist.indice]);
    }

    const persistirGrafoMapa = function () {
        const grafo = this.mapaCanvasGrafo;
        return grafo ? store().salvarGrafo(grafo) : false;
    };

    /** Reaplica o layout automático (vira manual ao arrastar um nó livremente). */
    function reposicionarAuto() {
        const grafo = this.mapaCanvasGrafo;
        const layout = global.MapaMentalLayout;
        if (!grafo || !layout) return;
        const posicoes = layout.calcularPosicoes(grafo);
        grafo.nos.forEach(no => {
            const posicao = posicoes.get(no.id);
            if (posicao) no.posicao = { x: posicao.x, y: posicao.y };
        });
    }

    /** Fecha um comando: reposiciona (se automático), persiste, guarda histórico e redesenha. */
    function aposComandoNo(registrar) {
        const grafo = this.mapaCanvasGrafo;
        if (grafo && grafo.posicionamento !== 'manual') reposicionarAuto.call(this);
        persistirGrafoMapa.call(this);
        if (registrar !== false) registrarHistorico.call(this);
        renderArea.call(this);
    }

    const idsSelecionados = function () { return [...(this.mapaSelecao || [])]; };

    /** Abre a edição depois do próximo frame (o DOM precisa existir). */
    function iniciarEdicaoDepois(idNo) {
        if (!idNo) return;
        const interacao = global.MapaMentalInteracao;
        if (interacao) setTimeout(() => interacao.iniciarEdicao.call(this, idNo), 0);
    }
    // 🔄 [FIM: MAPA - HISTÓRICO/COMANDOS]

    // 🔄 [INÍCIO: MAPA - COMANDOS DE NÓ]
    /** Cria um tópico FILHO do nó (o nó é desrecolhido). */
    // 🔄 [INÍCIO: MAPA - POSICIONAMENTO DO NÓ NOVO]
    /**
     * Coloca o nó recém-criado perto do pai/irmãos quando o mapa está em layout MANUAL
     * (senão ele nasceria "solto", longe da árvore). No layout automático o recálculo
     * de posições já resolve.
     */
    function posicionarNovoNo(grafo, no, idReferencia) {
        if (!grafo || !no || grafo.posicionamento !== 'manual') return;
        const espacamento = grafo.espacamento || { nos: 32, niveis: 80 };
        const passoX = (modelo().LARGURA_NO || 180) + (Number(espacamento.niveis) || 80);
        const passoY = 44 + (Number(espacamento.nos) || 32);
        if (no.paiId) {
            const pai = modelo().obterNo(grafo, no.paiId);
            const irmaos = modelo().listarFilhos(grafo, no.paiId)
                .filter(item => item.id !== no.id && item.posicao);
            const referencia = irmaos.find(item => item.id === idReferencia);
            const ancora = referencia || irmaos[irmaos.length - 1];
            const base = (pai && pai.posicao) || { x: 0, y: 0 };
            no.posicao = ancora
                ? { x: ancora.posicao.x, y: ancora.posicao.y + passoY }
                : { x: base.x + passoX, y: base.y };
            return;
        }
        const outros = (grafo.nos || []).filter(item => item.id !== no.id && item.posicao);
        const ultimo = outros[outros.length - 1];
        if (ultimo) no.posicao = { x: ultimo.posicao.x, y: ultimo.posicao.y + passoY };
    }

    /** Garante o nó visível: paneja a viewport quando ele nasce fora da tela. */
    function garantirNoVisivel(idNo) {
        const grafo = this.mapaCanvasGrafo;
        const no = grafo ? modelo().obterNo(grafo, idNo) : null;
        const caixa = caixaDoCanvas();
        const vp = this.mapaCanvasViewport;
        if (!no || !no.posicao || !caixa || !vp) return;
        const largura = (Number(no.largura) > 0 ? Number(no.largura) : (modelo().LARGURA_NO || 180)) * vp.zoom;
        const altura = 44 * vp.zoom;
        const margem = 24;
        const esquerda = no.posicao.x * vp.zoom + vp.x;
        const topo = no.posicao.y * vp.zoom + vp.y;
        let dx = 0;
        let dy = 0;
        if (esquerda < margem) dx = margem - esquerda;
        else if (esquerda + largura > caixa.largura - margem) dx = (caixa.largura - margem) - (esquerda + largura);
        if (topo < margem) dy = margem - topo;
        else if (topo + altura > caixa.altura - margem) dy = (caixa.altura - margem) - (topo + altura);
        if (!dx && !dy) return;
        this.definirViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom });
    }
    // 🔄 [FIM: MAPA - POSICIONAMENTO DO NÓ NOVO]

    function mapaCriarFilhoDeNo(idNo, editar) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return null;
        const no = modelo().criarFilhoDe(grafo, idNo, '');
        if (!no) return null;
        posicionarNovoNo(grafo, no, null);
        this.mapaSelecao = new Set([no.id]);
        aposComandoNo.call(this);
        garantirNoVisivel.call(this, no.id);
        if (editar) iniciarEdicaoDepois.call(this, no.id);
        return no;
    }

    /** Cria um tópico IRMÃO logo abaixo do nó de referência. */
    function mapaCriarIrmaoDeNo(idNo, editar) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return null;
        const no = modelo().criarIrmaoDe(grafo, idNo, '');
        if (!no) return null;
        posicionarNovoNo(grafo, no, idNo);
        this.mapaSelecao = new Set([no.id]);
        aposComandoNo.call(this);
        garantirNoVisivel.call(this, no.id);
        if (editar) iniciarEdicaoDepois.call(this, no.id);
        return no;
    }

    /** Cria um nó INDEPENDENTE (sem pai) no centro da viewport. */
    function mapaCriarNoIndependente() {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo) return null;
        const caixa = caixaDoCanvas();
        const vp = this.mapaCanvasViewport || { x: 0, y: 0, zoom: 1 };
        const centro = caixa
            ? { x: (caixa.largura / 2 - vp.x) / vp.zoom, y: (caixa.altura / 2 - vp.y) / vp.zoom }
            : { x: 0, y: 0 };
        const no = modelo().criarNoIndependente(grafo, '', { x: Math.round(centro.x), y: Math.round(centro.y) });
        grafo.posicionamento = 'manual';
        this.mapaSelecao = new Set([no.id]);
        aposComandoNo.call(this);
        garantirNoVisivel.call(this, no.id);
        iniciarEdicaoDepois.call(this, no.id);
        return no;
    }

    /** Exclui o nó e toda a ramificação (com histórico para desfazer). */
    function mapaExcluirNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        const removidos = modelo().excluirSubarvore(grafo, idNo);
        if (!removidos.length) return false;
        if (this.mapaSelecao) this.mapaSelecao.clear();
        aposComandoNo.call(this);
        return true;
    }

    function mapaDuplicarNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return null;
        const copia = modelo().duplicarSubarvore(grafo, idNo);
        if (!copia) return null;
        this.mapaSelecao = new Set([copia.id]);
        aposComandoNo.call(this);
        return copia;
    }

    /** Copiar mantém uma cópia INTERNA (navigator.clipboard pode falhar/bloquear). */
    function mapaCopiarNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        const payload = modelo().copiarSubarvore(grafo, idNo);
        if (!payload) return false;
        this.mapaAreaTransferencia = { modo: 'copiar', payload };
        return true;
    }

    function mapaRecortarNo(idNo) {
        if (!mapaCopiarNo.call(this, idNo)) return false;
        this.mapaAreaTransferencia.modo = 'recortar';
        return mapaExcluirNo.call(this, idNo);
    }

    /** Cola como filho do nó selecionado (ou como raiz, se nada estiver selecionado). */
    function mapaColarNo() {
        const grafo = this.mapaCanvasGrafo;
        const transferencia = this.mapaAreaTransferencia;
        if (!grafo || !transferencia) return null;
        const copia = modelo().colarSubarvore(grafo, transferencia.payload, idsSelecionados.call(this)[0] || null);
        if (!copia) return null;
        this.mapaSelecao = new Set([copia.id]);
        if (transferencia.modo === 'recortar') this.mapaAreaTransferencia = null;
        aposComandoNo.call(this);
        return copia;
    }
    // 🔄 [FIM: MAPA - COMANDOS DE NÓ]

    // 🔄 [INÍCIO: MAPA - MOVER/RECOLHER/ESTILO DO NÓ]
    /** Reordena entre irmãos (`delta` -1 sobe, +1 desce). */
    function mapaMoverNoOrdem(idNo, delta) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        if (!modelo().moverOrdemRelativa(grafo, idNo, delta)) return false;
        aposComandoNo.call(this);
        return true;
    }

    /** Reparenting por menu: move o nó para outro pai (bloqueia ciclo). */
    function mapaMoverNoPara(idNo, novoPaiId) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        if (novoPaiId && modelo().contemCiclo(grafo, idNo, novoPaiId)) return false;
        if (!modelo().moverNoPara(grafo, idNo, novoPaiId || null, null)) return false;
        aposComandoNo.call(this);
        return true;
    }

    /** Outdent: move o nó para o pai do pai. */
    function mapaMoverNoParaPai(idNo) {
        const grafo = this.mapaCanvasGrafo;
        const no = grafo ? modelo().obterNo(grafo, idNo) : null;
        if (!no || !no.paiId) return false;
        const pai = modelo().obterNo(grafo, no.paiId);
        return mapaMoverNoPara.call(this, idNo, pai ? (pai.paiId || null) : null);
    }

    function mapaRecolherNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !modelo().definirRecolhido(grafo, idNo)) return false;
        const no = modelo().obterNo(grafo, idNo);
        if (no && no.colapsado) ajustarSelecaoAposRecolher.call(this, idNo);
        aposComandoNo.call(this);
        return true;
    }

    function mapaExpandirNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !modelo().definirRecolhido(grafo, idNo, false)) return false;
        aposComandoNo.call(this);
        return true;
    }

    function mapaBloquearNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !modelo().definirBloqueado(grafo, idNo)) return false;
        aposComandoNo.call(this);
        return true;
    }

    /** Recolhe/expande TODAS as ramificações. */
    function definirRecolhidoTodos(valor) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo) return false;
        grafo.nos.forEach(no => { no.colapsado = Boolean(valor); });
        // Recolher tudo esconde o nó em edição: encerra para não perder foco.
        if (valor && this.mapaEditandoId) {
            const interacao = global.MapaMentalInteracao;
            if (interacao && typeof interacao.confirmarEdicao === 'function') interacao.confirmarEdicao.call(this, true);
            this.mapaEditandoId = null;
        }
        aposComandoNo.call(this);
        return true;
    }

    /** Largura por passo (múltiplos de 8px, com limites do modelo). */
    function mapaAjustarLargura(idNo, delta) {
        const grafo = this.mapaCanvasGrafo;
        const no = grafo ? modelo().obterNo(grafo, idNo) : null;
        if (!no) return false;
        const base = Number(no.largura) > 0 ? Number(no.largura) : modelo().LARGURA_NO;
        modelo().definirLargura(grafo, idNo, base + delta);
        aposComandoNo.call(this);
        return true;
    }

    /** Atualização contínua durante o arrasto da alça (sem persistir a cada frame). */
    function mapaDefinirLarguraNo(idNo, largura) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo) return;
        if (!modelo().definirLargura(grafo, idNo, largura)) return;
        const r = render();
        if (r) r.atualizarNo(modelo().obterNo(grafo, idNo));
    }

    function mapaFinalizarRedimensionarNo(idNo) {
        if (!idNo || !this.mapaCanvasGrafo) return;
        aposComandoNo.call(this);
    }

    /** Fim do arrasto (Fase 7): grava posições, marca layout manual e aplica o drop pela zona. */
    function mapaFinalizarArrastoNo(idPrincipalNo, posicoes, alvoId, zona) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo) return;
        posicoes.forEach((posicao, id) => {
            if (posicao) modelo().moverNoLivre(grafo, id, posicao);
        });
        grafo.posicionamento = 'manual';
        if (alvoId && alvoId !== idPrincipalNo) {
            const alvo = modelo().obterNo(grafo, alvoId);
            if (zona === 'antes' || zona === 'depois') {
                // Reordenar entre irmãos: insere antes/depois do nó alvo.
                const paiAlvo = alvo ? (alvo.paiId || null) : null;
                if (!modelo().contemCiclo(grafo, idPrincipalNo, paiAlvo)) {
                    const irmaos = modelo().listarFilhos(grafo, paiAlvo).filter(item => item.id !== idPrincipalNo);
                    const indice = alvo ? irmaos.indexOf(alvo) : -1;
                    const destino = zona === 'antes' ? Math.max(0, indice) : (indice + 1);
                    modelo().moverNoPara(grafo, idPrincipalNo, paiAlvo, destino);
                }
            } else if (alvo && !modelo().contemCiclo(grafo, idPrincipalNo, alvoId)) {
                // Zona central: vira filho do nó alvo.
                modelo().moverNoPara(grafo, idPrincipalNo, alvoId, null);
            }
        }
        aposComandoNo.call(this);
    }

    // 🔄 [INÍCIO: MAPA - CONTEÚDO DO NÓ (FASE 4)]
    function mapaAbrirPainel(idNo) {
        if (!idNo) return false;
        this.mapaPainelNoId = idNo;
        renderArea.call(this);
        return true;
    }

    function mapaFecharPainel() {
        this.mapaPainelNoId = null;
        renderArea.call(this);
    }

    function mapaAlternarConcluidoNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        if (!modelo().alternarConcluido(grafo, idNo)) return false;
        aposComandoNo.call(this);
        return true;
    }

    function mapaDefinirEmojiNo(emoji) {
        const grafo = this.mapaCanvasGrafo;
        const interacao = global.MapaMentalInteracao;
        const idNo = this.mapaPainelNoId || (interacao ? interacao.idPrincipal(this) : null);
        if (!grafo || !idNo) return false;
        if (!modelo().atualizarConteudo(grafo, idNo, { emoji })) return false;
        aposComandoNo.call(this);
        return true;
    }

    /** Lê os campos do formulário do painel e grava (tudo sanitizado no modelo). */
    function mapaSalvarConteudoNo(idNo, form) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        const el = nome => (form ? form.querySelector('#' + nome) : document.getElementById(nome));
        const val = nome => { const campo = el(nome); return campo ? campo.value : ''; };
        const marcado = nome => { const campo = el(nome); return Boolean(campo && campo.checked); };
        const linhas = texto => String(texto || '').split('\n').map(l => l.trim()).filter(Boolean);
        const links = linhas(val('mapaPainelLinks')).map(linha => {
            const partes = linha.split('|').map(p => p.trim());
            return partes.length > 1 ? { rotulo: partes[0], url: partes[1] } : { url: partes[0] };
        });
        const refs = linhas(val('mapaPainelRefs')).map(linha => {
            const partes = linha.split('|').map(p => p.trim());
            return { tipo: partes[0] || 'nota', id: partes[1] || partes[0], rotulo: partes[2] || partes[1] || partes[0] };
        });
        modelo().atualizarConteudo(grafo, idNo, {
            titulo: val('mapaPainelTitulo'),
            descricao: val('mapaPainelDescricao'),
            notas: val('mapaPainelNotas'),
            emoji: val('mapaPainelEmoji'),
            icone: val('mapaPainelIcone'),
            tags: val('mapaPainelTags'),
            links, refs,
            tarefa: marcado('mapaPainelTarefa'),
            concluido: marcado('mapaPainelConcluido'),
            prioridade: val('mapaPainelPrioridade'),
            status: val('mapaPainelStatus'),
            responsavel: val('mapaPainelResponsavel'),
            inicio: val('mapaPainelInicio'),
            prazo: val('mapaPainelPrazo'),
            progresso: val('mapaPainelProgresso')
        });
        aposComandoNo.call(this);
        return true;
    }
    // 🔄 [FIM: MAPA - CONTEÚDO DO NÓ (FASE 4) - PARTE 1]

    /** Abre o seletor de arquivo (limitado por tipo/tamanho) para anexar ao nó. */
    function mapaPedirAnexoNo() {
        const grafo = this.mapaCanvasGrafo;
        const idNo = this.mapaPainelNoId;
        if (!grafo || !idNo) return;
        const entrada = document.createElement('input');
        entrada.type = 'file';
        entrada.accept = 'image/*,application/pdf,text/plain';
        entrada.style.display = 'none';
        document.body.appendChild(entrada);
        entrada.addEventListener('change', () => {
            const arquivo = entrada.files && entrada.files[0];
            if (arquivo) mapaLerAnexoNo.call(this, idNo, arquivo);
            entrada.remove();
        });
        entrada.click();
    }

    /** Lê o arquivo como base64, mede imagens e grava o anexo (limite no modelo). */
    function mapaLerAnexoNo(idNo, arquivo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !arquivo) return;
        if (arquivo.size > modelo().LIMITE_ANEXO) {
            if (typeof this.showToast === 'function') this.showToast('Anexo maior que 1 MB foi ignorado.');
            return;
        }
        const leitor = new FileReader();
        leitor.onload = () => {
            const dados = String(leitor.result || '');
            const registrar = (largura, altura) => {
                const item = modelo().adicionarAnexo(grafo, idNo, {
                    nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size,
                    dados, largura, altura
                });
                if (!item) {
                    if (typeof this.showToast === 'function') this.showToast('Não foi possível anexar (limite/cota).');
                    return;
                }
                aposComandoNo.call(this);
            };
            if (/^image\//i.test(arquivo.type)) {
                const imagem = new Image();
                imagem.onload = () => registrar(imagem.naturalWidth, imagem.naturalHeight);
                imagem.onerror = () => registrar(null, null);
                imagem.src = dados;
            } else {
                registrar(null, null);
            }
        };
        leitor.readAsDataURL(arquivo);
    }

    function mapaRemoverAnexoNo(idNo, idAnexo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo || !idAnexo) return false;
        if (!modelo().removerAnexo(grafo, idNo, idAnexo)) return false;
        aposComandoNo.call(this);
        return true;
    }
    // 🔄 [FIM: MAPA - CONTEÚDO DO NÓ (FASE 4) - PARTE 2]

    // 🔄 [INÍCIO: MAPA - HIERARQUIA/LAYOUT (FASE 5)]
    /** Troca o layout em árvore do mapa (volta ao modo automático). */
    function mapaDefinirLayout(layout) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !modelo().LAYOUTS.includes(layout)) return false;
        grafo.layout = layout;
        grafo.posicionamento = 'auto';
        aposComandoNo.call(this);
        return true;
    }

    /** Recolher um ramo não pode esconder o nó selecionado/em edição (perder foco). */
    function ajustarSelecaoAposRecolher(idNo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo) return;
        const descendentes = new Set(modelo().listarDescendentes(grafo, idNo));
        if (!descendentes.size) return;
        if (this.mapaEditandoId && descendentes.has(this.mapaEditandoId)) {
            const interacao = global.MapaMentalInteracao;
            if (interacao && typeof interacao.confirmarEdicao === 'function') interacao.confirmarEdicao.call(this, true);
            this.mapaEditandoId = null;
        }
        const escondidos = [...(this.mapaSelecao || [])].filter(id => descendentes.has(id));
        if (escondidos.length) this.mapaSelecao = new Set([idNo]);
    }
    // 🔄 [FIM: MAPA - HIERARQUIA/LAYOUT (FASE 5)]

    // 🔄 [INÍCIO: MAPA - CONEXÕES LIVRES (FASE 6)]
    /** Liga/desliga o modo "Conectar nós" (1º clique = origem, 2º = destino). */
    function mapaAlternarModoConexao() {
        this.mapaConexaoModo = !this.mapaConexaoModo;
        this.mapaConexaoOrigem = null;
        return this.mapaConexaoModo;
    }

    /** Cria uma conexão entre dois nós (independente da hierarquia). */
    function mapaCriarConexaoEntre(de, para, opcoes) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !de || !para || de === para) return null;
        const cx = modelo().criarConexao(grafo, de, para, opcoes || {});
        if (!cx) return null;
        aposComandoNo.call(this);
        return cx;
    }

    /** Clique em nó no modo conexão: 1º marca a origem, 2º fecha a conexão. */
    function mapaCliqueConexaoNo(idNo) {
        if (!this.mapaConexaoModo || !idNo) return false;
        if (!this.mapaConexaoOrigem) {
            this.mapaConexaoOrigem = idNo;
            renderArea.call(this);
            return true;
        }
        if (this.mapaConexaoOrigem === idNo) return false;
        const origem = this.mapaConexaoOrigem;
        this.mapaConexaoOrigem = null;
        this.mapaConexaoModo = false;
        return Boolean(mapaCriarConexaoEntre.call(this, origem, idNo, {}));
    }

    function mapaAbrirMenuConexao(idCx) {
        if (!idCx) return false;
        this.mapaConexaoMenuId = idCx;
        renderArea.call(this);
        return true;
    }

    function mapaFecharMenuConexao() {
        this.mapaConexaoMenuId = null;
        renderArea.call(this);
    }

    /** Lê o formulário do menu e atualiza a conexão (rótulo/estilo/direção/cor/espessura). */
    function mapaSalvarConexao(form) {
        const grafo = this.mapaCanvasGrafo;
        const idCx = form ? form.dataset.mapaCxId : null;
        if (!grafo || !idCx) return false;
        const el = nome => (form ? form.querySelector('#' + nome) : document.getElementById(nome));
        const val = nome => { const campo = el(nome); return campo ? campo.value : ''; };
        const marcado = nome => { const campo = el(nome); return Boolean(campo && campo.checked); };
        const ok = modelo().atualizarConexao(grafo, idCx, {
            texto: val('mapaCxTexto'),
            tipoLinha: val('mapaCxTipo'),
            estiloSeta: val('mapaCxSeta'),
            cor: val('mapaCxCor'),
            espessura: val('mapaCxEspessura'),
            direcionada: marcado('mapaCxDirecionada')
        });
        if (!ok) return false;
        aposComandoNo.call(this);
        return true;
    }

    function mapaRemoverConexao(idCx) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idCx || !modelo().removerConexao(grafo, idCx)) return false;
        if (this.mapaConexaoMenuId === idCx) this.mapaConexaoMenuId = null;
        aposComandoNo.call(this);
        return true;
    }
    // 🔄 [FIM: MAPA - CONEXÕES LIVRES (FASE 6)]

    /** Conclui a edição inline (chamado pela interação). */
    function mapaCommitarTituloNo(idNo, titulo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        modelo().atualizarTitulo(grafo, idNo, titulo);
        aposComandoNo.call(this);
        return true;
    }
    // 🔄 [FIM: MAPA - MOVER/RECOLHER/ESTILO DO NÓ]

    // 🔄 [INÍCIO: MAPA - ÁREA/ISOLAMENTO]
    function aplicarTemaMapa(secao) {
        const alvo = secao || document.getElementById('mapaArea');
        const r = render();
        if (r) r.aplicarTema(alvo);
    }

    /** Montagem lazy: só na primeira entrada (não pesa o boot). */
    function montarAreaMapa() {
        if (this.mapaAreaMontada) return;
        const secao = document.getElementById('mapaArea');
        if (!secao) return;
        this.mapaAreaMontada = true;
        const r = render();
        if (r) r.montarShell(secao);
        // Delegação única na seção (clique, select, busca e formulário).
        secao.addEventListener('click', evento => tratarCliqueMapa.call(this, evento));
        secao.addEventListener('change', evento => tratarMudancaMapa.call(this, evento));
        secao.addEventListener('input', evento => tratarBuscaMapa.call(this, evento));
        secao.addEventListener('submit', evento => tratarSubmitMapa.call(this, evento));
        // Fase 3: edição por duplo clique e atalhos dos nós.
        secao.addEventListener('dblclick', evento => {
            const interacao = global.MapaMentalInteracao;
            if (interacao) interacao.duploClique.call(this, evento);
        });
        // Navegação do canvas (pan/zoom/pinça) — delegação única na seção.
        this.mapaCanvasPonteiros = new Map();
        this.mapaCanvasPan = null;
        this.mapaCanvasPinca = null;
        const interacao = global.MapaMentalInteracao;
        if (interacao) {
            secao.addEventListener('pointerdown', evento => interacao.pointerDown.call(this, evento));
            secao.addEventListener('pointermove', evento => interacao.pointerMove.call(this, evento));
            secao.addEventListener('pointerup', evento => interacao.pointerUp.call(this, evento));
            secao.addEventListener('pointercancel', evento => interacao.pointerUp.call(this, evento));
            secao.addEventListener('wheel', evento => interacao.wheel.call(this, evento), { passive: false });
        }
        // Estado da Fase 3 (seleção, edição, arrasto, área de transferência, histórico).
        this.mapaSelecao = new Set();
        this.mapaEditandoId = null;
        this.mapaEdicaoOriginal = null;
        this.mapaArrastoNo = null;
        this.mapaRedimensionando = null;
        this.mapaLaco = null;
        this.mapaLongPressTimer = null;
        this.mapaAreaTransferencia = null;
        this.mapaHistorico = null;
        this.mapaPainelNoId = null;
        this.mapaConexaoModo = false;
        this.mapaConexaoOrigem = null;
        this.mapaConexaoMenuId = null;
        this.mapaConexaoArrasto = null;
        // Retoma o último mapa aberto (se ele ainda existir).
        const ativo = store() ? store().lerMapaAtivo() : null;
        if (ativo && store().obterGrafo(ativo)) this.mapaAbertaId = ativo;
        aplicarTemaMapa(secao);
        renderArea.call(this);
    }

    /** Troca de área (Notas | Mapa Mental); persiste em `notas-pwa-area-ativa`. */
    function aplicarArea(area) {
        const alvo = area === 'mapa' ? 'mapa' : 'notas';
        this.mapaAreaAtiva = alvo;
        if (store()) store().salvarAreaAtiva(alvo);

        const nav = document.getElementById('appAreas');
        if (nav) {
            nav.querySelectorAll('[data-app-area]').forEach(botao => {
                botao.setAttribute('aria-selected', String(botao.dataset.appArea === alvo));
            });
        }

        const secao = document.getElementById('mapaArea');
        const backdrop = document.getElementById('notesModalBackdrop');

        if (alvo === 'mapa') {
            // Sair de Notas: grava a nota atual e esconde o modal (sem encerrar o motor).
            if (typeof this.persistNow === 'function') this.persistNow();
            montarAreaMapa.call(this);
            if (secao) secao.hidden = false;
            if (backdrop) backdrop.classList.remove('active');
            // Foco no canvas: superficie dos atalhos de criacao/navegacao por teclado.
            const interacaoArea = global.MapaMentalInteracao;
            if (interacaoArea && interacaoArea.focarCanvas) interacaoArea.focarCanvas.call(this);
        } else {
            // Ao sair do mapa, grava a viewport pendente do debounce.
            salvarViewportAgora.call(this);
            if (this.mapaSelecao) this.mapaSelecao.clear();
            this.mapaEditandoId = null;
            this.mapaPainelNoId = null;
            this.mapaConexaoModo = false;
            this.mapaConexaoOrigem = null;
            this.mapaConexaoMenuId = null;
            if (secao) secao.hidden = true;
            if (backdrop) backdrop.classList.add('active');
            const ativa = typeof this.lerNotaAtiva === 'function' ? this.lerNotaAtiva() : null;
            const idNota = ativa || (this.projectsData && this.projectsData[0] ? this.projectsData[0].id : null);
            if (idNota && typeof this.openNotesModal === 'function') this.openNotesModal(idNota);
        }
        return alvo;
    }

    /**
     * Trata uma tecla para a área do mapa. Escutado no DOCUMENTO porque, ao trocar de
     * área, o foco pode continuar no editor de notas (oculto). Só age quando a área do
     * mapa está ativa e o foco não está num campo de texto DESTA área — o editor inline
     * do nó (`.mapa-no-editor`) é exceção e tem regras próprias em `atalho()`.
     */
    function tratarTeclaMapa(evento) {
        if (this.mapaAreaAtiva !== 'mapa') return;
        const secao = document.getElementById('mapaArea');
        if (!secao || secao.hidden) return;
        const alvo = evento.target;
        if (!alvo || !alvo.closest) return;
        const campo = alvo.closest('input, textarea, select, [contenteditable]:not(.mapa-no-editor)');
        if (campo && secao.contains(campo)) return;
        const interacao = global.MapaMentalInteracao;
        if (interacao) interacao.atalho.call(this, evento);
    }

    /** Liga o seletor de áreas e aplica a área salva (só após `__notasPronto`). */
    function inicializarAreasMapa() {
        const nav = document.getElementById('appAreas');
        if (nav && !this.mapaAreasLigadas) {
            this.mapaAreasLigadas = true;
            nav.addEventListener('click', evento => {
                const botao = evento.target.closest('[data-app-area]');
                if (botao) this.aplicarArea(botao.dataset.appArea);
            });
            window.addEventListener('themechange', () => aplicarTemaMapa());
            // Atalhos do mapa: no documento (o foco pode ficar no editor de notas oculto).
            document.addEventListener('keydown', evento => tratarTeclaMapa.call(this, evento));
        }
        const salva = store() ? store().lerAreaAtiva() : 'notas';
        return this.aplicarArea(salva);
    }

    function installMapaMental(NotesPWA) {
        if (!NotesPWA || !NotesPWA.prototype) return false;
        Object.assign(NotesPWA.prototype, {
            mapaAreaMontada: false,
            mapaAreasLigadas: false,
            mapaAreaAtiva: 'notas',
            mapaAbertaId: null,
            mapaBusca: '',
            mapaOrdenacao: 'nome',
            mapaFiltroPasta: 'todas',
            mapaIncluirArquivados: false,
            mapaMostrarTemplates: false,
            mapaAcao: null,
            mapaCanvasViewport: null,
            mapaCanvasMapaId: null,
            mapaCanvasGrafo: null,
            mapaCanvasLimites: null,
            mapaCanvasPonteiros: null,
            mapaCanvasPan: null,
            mapaCanvasPinca: null,
            mapaSalvarViewportTimer: null,
            mapaSelecao: null,
            mapaEditandoId: null,
            mapaEdicaoOriginal: null,
            mapaArrastoNo: null,
            mapaRedimensionando: null,
            mapaLaco: null,
            mapaLongPressTimer: null,
            mapaAreaTransferencia: null,
            mapaHistorico: null,
            mapaPainelNoId: null,
            mapaConexaoModo: false,
            mapaConexaoOrigem: null,
            mapaConexaoMenuId: null,
            mapaConexaoArrasto: null,
            aplicarArea, inicializarAreasMapa, montarAreaMapa, aplicarTemaMapa, renderArea,
            definirViewport, salvarViewportAgora,
            mapaCriarFilhoDeNo, mapaCriarIrmaoDeNo, mapaCriarNoIndependente, mapaExcluirNo,
            mapaDuplicarNo, mapaCopiarNo, mapaRecortarNo, mapaColarNo,
            mapaMoverNoOrdem, mapaMoverNoPara, mapaMoverNoParaPai,
            mapaRecolherNo, mapaExpandirNo, mapaBloquearNo, mapaAjustarLargura,
            mapaDefinirLarguraNo, mapaFinalizarRedimensionarNo, mapaFinalizarArrastoNo,
            mapaCommitarTituloNo, mapaDesfazer: desfazer, mapaRefazer: refazer,
            mapaAbrirPainel, mapaFecharPainel, mapaAlternarConcluidoNo, mapaDefinirEmojiNo,
            mapaSalvarConteudoNo, mapaPedirAnexoNo, mapaRemoverAnexoNo, mapaDefinirLayout,
            mapaAlternarModoConexao, mapaCriarConexaoEntre, mapaCliqueConexaoNo,
            mapaAbrirMenuConexao, mapaFecharMenuConexao, mapaSalvarConexao, mapaRemoverConexao
        });
        return true;
    }
    // 🔄 [FIM: MAPA - ÁREA/ISOLAMENTO]

    global.installMapaMental = installMapaMental;
})(typeof window !== 'undefined' ? window : globalThis);
