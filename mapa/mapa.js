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

    /** Contexto da PASTA ativa (nome do workspace) para o render da área. */
    function dadosGestao() {
        const s = store();
        const pastas = (s && s.listarPastas) ? s.listarPastas() : [];
        const pasta = pastas.find(p => p.id === this.pastaAtiva) || null;
        return { pastas, pastaNome: pasta ? (pasta.nome || 'Pasta') : '', mapaAberto: null };
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

    /** Cria um nó-ponte na origem apontando para o destino (link bidirecional). */
    function conectarMapa(origemId, destinoId) {
        if (!origemId || !destinoId || origemId === destinoId) return false;
        const grafo = store().obterGrafo(origemId);
        if (!grafo) return false;
        const resumo = store().obterResumo(destinoId);
        modelo().criarNoPonte(grafo, destinoId, resumo ? resumo.nome : 'Mapa conectado');
        return store().salvarGrafo(grafo);
    }

    /**
     * Mapas da PASTA ativa (cada mapa pertence a uma pasta; a "Geral" adota os sem
     * pasta). É a fonte da faixa de chips da área de mapas — espelho dos chips de nota.
     */
    function mapasDaPasta(pastaId) {
        const s = store();
        if (!s) return [];
        const alvo = pastaId || this.pastaAtiva || s.ID_PASTA_PADRAO;
        if (typeof s.listarMapasDaPasta === 'function') return s.listarMapasDaPasta(alvo);
        return s.listarMapas().filter(m => (m.pastaId || s.ID_PASTA_PADRAO) === alvo);
    }

    /** Aplica um template PRONTO criando e abrindo um mapa novo NA PASTA ativa. */
    function aplicarTemplatePronto(templateId) {
        const tpl = modelo().TEMPLATES_PRONTOS.find(t => t.id === templateId);
        const grafo = store().criarMapa(tpl ? tpl.nome : 'Novo mapa', this.pastaAtiva || null);
        modelo().aplicarTemplatePronto(grafo, templateId);
        store().salvarGrafo(grafo);
        abrirMapa.call(this, grafo.id);
    }

    /** Aplica um template SALVO criando e abrindo um mapa novo NA PASTA ativa (IDs novos). */
    function aplicarTemplateSalvo(templateId) {
        const copia = store().criarMapaDeTemplateSalvo(templateId);
        if (!copia) return null;
        if (this.pastaAtiva) store().moverMapaParaPasta(copia.id, this.pastaAtiva);
        abrirMapa.call(this, copia.id);
        return copia;
    }
    // 🔄 [FIM: MAPA - ESTADO/HELPERS]

    // 🔄 [INÍCIO: MAPA - RENDER/CONTROLE]
    /**
     * Garante um mapa selecionado na área — espelho fiel das Notas
     * (`lerNotaAtiva() || projectsData[0]` + `definirPastaAtivaNotas`):
     *  - mantém o mapa JÁ aberto se ele pertencer à pasta ativa;
     *  - senão, tenta o último mapa ativo persistido (`lerMapaAtivo`) se for da pasta;
     *  - senão, abre o PRIMEIRO mapa da pasta (o 1º chip exibido, ordem por nome);
     *  - pasta vazia → mantém o estado "Nenhum mapa aberto" (não cria mapa).
     * Retorna `true` quando a seleção mudou (para disparar um re-render).
     */
    function garantirMapaSelecionado() {
        const s = store();
        if (!s) return false;
        const daPasta = mapasDaPasta.call(this);
        const pertence = id => Boolean(id) && daPasta.some(m => m.id === id);
        let alvo = this.mapaAbertaId;
        if (!pertence(alvo)) {
            const persistido = (typeof s.lerMapaAtivo === 'function') ? s.lerMapaAtivo() : null;
            alvo = pertence(persistido) ? persistido : (daPasta[0] ? daPasta[0].id : null);
        }
        if (alvo === this.mapaAbertaId) return false;
        if (alvo) abrirMapa.call(this, alvo); // grava o ativo + recente e abre
        else this.mapaAbertaId = null;
        return true;
    }

    /** Redesenha a área (mapa aberto OU estado "nenhum mapa aberto"). */
    function renderArea() {
        const r = render();
        // Blindagem: sem os módulos do mapa (ex.: cache antigo do Service Worker), a
        // área ficaria vazia em silêncio — mostra um aviso visível em vez disso.
        if (!r || typeof r.montarShell !== 'function' || diagnosticoModulosMapa().length) {
            mostrarFalhaMapa(document.getElementById('mapaArea'));
            return;
        }
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
            // Vínculo Notas↔Mapa: nome da nota vinculada (para o rótulo do atalho).
            if (dados.painelNo && dados.painelNo.notaRef) {
                const nota = ((this.projectsData || []).find(n => n.id === dados.painelNo.notaRef)) || null;
                dados.nomeNotaRef = nota ? (nota.nome || 'Nota') : null;
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
            mapaAberto: dados.mapaAberto, telaCheia: Boolean(this.mapaFullscreen)
        });
        // Faixa de chips dos MAPAS da pasta ativa (mesmas classes dos chips de nota).
        renderMapasNav.call(this);
        const acao = this.mapaAcao;
        const mapaAlvo = acao && acao.id ? (store().obterResumo(acao.id) || dados.mapaAberto) : dados.mapaAberto;
        r.renderForm(document.getElementById('mapaForm'), acao, {
            mapa: mapaAlvo, mapas: store().listarMapas(), nosMoverPara: dados.nosMoverPara || []
        });
        dados.acao = acao;
        dados.estiloCopiado = this.mapaEstiloCopiado || null;
        dados.atalhos = this.mapaAtalhosAberto ? dadosAtalhos.call(this) : null;
        dados.menuNo = this.mapaMenuNo || null;
        dados.menuCanvas = this.mapaMenuCanvas || null;
        dados.barraAberta = Boolean(this.mapaBarraAberta);
        // Menu de OPÇÕES da barra de formatação (fonte/forma/alinhamento) — F12.
        dados.menuBarra = this.mapaMenuBarra || null;
        // Grade (pontinhos) da superfície: preferência persistida (padrão: desligada).
        dados.grade = (store() && typeof store().lerGrade === 'function') ? store().lerGrade() : false;
        // Barras padronizadas (F12) ANTES do mapa: o editor de barra lê o DOM da toolbar.
        r.renderBarras(dados);
        // Reaplica o colapso (um re-render não pode "descolapsar"): barras no PC,
        // chips no celular — quem decide é o modo atual (ver `sincronizarColapsoArea`).
        sincronizarColapsoArea.call(this);
        // Reaplica a TELA CHEIA (um re-render não pode "desexpandir"). Fora dela,
        // apenas garante que o estado visual (classes/botão) está limpo.
        if (this.mapaFullscreen) aplicarBarrasFullscreen.call(this, true);
        else expandidorMapa(this).aplicar(false);
        const wrap = document.getElementById('mapaCanvasWrap');
        if (dados.mapaAberto) {
            r.renderMapaAberto(wrap, dados);
            aplicarViewportNoDom.call(this);
            refinarLayoutPorMedicao.call(this);
        } else {
            r.renderSemMapa(wrap, dados);
        }
        // F11: os botões Desfazer/Refazer refletem a pilha sempre que a área é redesenhada.
        atualizarBotoesHistorico.call(this);
        // Rodapé informativo (espelha o status de Notas): esquerda = última edição,
        // centro = tópicos, direita = "Salvo".
        const preencher = (id, texto) => { const el = document.getElementById(id); if (el) el.textContent = texto; };
        if (dados.mapaAberto) {
            const total = ((dados.grafo && dados.grafo.nos) || []).length;
            const sel = this.mapaSelecao ? this.mapaSelecao.size : 0;
            const elUltima = document.getElementById('mapaLastEdit');
            if (elUltima) {
                elUltima.textContent = tempoRelativo(dados.mapaAberto.dtAlterado);
                elUltima.title = dataAbsoluta(dados.mapaAberto.dtAlterado);
            }
            preencher('mapaTopicCount', total + ' tópico(s)' + (sel ? ' · ' + sel + ' selecionado(s)' : ''));
            preencher('mapaStatus', 'Salvo');
        } else {
            preencher('mapaLastEdit', 'Nenhum mapa aberto');
            preencher('mapaTopicCount', '');
            preencher('mapaStatus', '');
        }
    }

    /** Data/hora ABSOLUTA (vai no `title` do rodapé). */
    function dataAbsoluta(iso) {
        const data = iso ? new Date(iso) : null;
        return (data && !isNaN(data)) ? data.toLocaleString('pt-BR') : '';
    }

    /** "editado há 5 min" — última edição em data/hora RELATIVA (pt-BR). */
    function tempoRelativo(iso) {
        const data = iso ? new Date(iso) : null;
        if (!data || isNaN(data)) return 'sem edição';
        let rtf = null;
        try { rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }); } catch (_) { rtf = null; }
        const unidade = (valor, u) => rtf ? rtf.format(-valor, u) : ('há ' + valor + ' ' + u);
        const seg = Math.round((Date.now() - data.getTime()) / 1000);
        if (Math.abs(seg) < 60) return 'editado ' + unidade(Math.max(1, Math.abs(seg)), 'second');
        const min = Math.round(seg / 60);
        if (Math.abs(min) < 60) return 'editado ' + unidade(min, 'minute');
        const horas = Math.round(min / 60);
        if (Math.abs(horas) < 24) return 'editado ' + unidade(horas, 'hour');
        const dias = Math.round(horas / 24);
        if (Math.abs(dias) < 30) return 'editado ' + unidade(dias, 'day');
        return 'editado em ' + data.toLocaleDateString('pt-BR');
    }

    /**
     * Volta à TELA PRINCIPAL de Pastas (fim da "lista de mapas": cada pasta é um
     * workspace com as áreas de Notas e de Mapas). É o destino dos botões FECHAR
     * (`#mapaFechar` no Mapa e `#notesModalClose` em Notas) — a antiga seta ‹ fixa
     * saiu do topo, que agora é a moldura do botão de conta (`conta.js`).
     */
    function mapaVoltarParaPastas() {
        salvarViewportAgora.call(this);
        if (this.mapaSelecao) this.mapaSelecao.clear();
        this.mapaAbertaId = null;
        this.mapaAcao = null;
        this.mapaBarrasColapsadas = false;
        this.mapaFullscreen = false;
        fecharMenuMapa.call(this);
        // Fecha o modal de Notas (se aberto), revelando os cartões de pasta.
        const backdrop = document.getElementById('notesModalBackdrop');
        if (backdrop && backdrop.classList.contains('active') && typeof this.closeNotesModal === 'function') {
            this.closeNotesModal();
        }
        aplicarArea.call(this, 'pastas');
    }

    /** Cliques da área do mapa (delegação por `data-mapa-acao`). */
    function tratarCliqueMapa(evento) {
        const alvo = evento.target.closest('[data-mapa-acao]');
        if (!alvo) {
            // Clique fora de um botão: fecha o menu de OPÇÕES da barra, se estiver aberto
            // (só re-renderiza nesse caso, para não atrapalhar o painel de propriedades).
            if (this.mapaMenuBarra) { this.mapaMenuBarra = null; renderArea.call(this); }
            return;
        }
        const acao = alvo.dataset.mapaAcao;
        const id = alvo.dataset.mapaId || null;
        const s = store();
        const interacao = global.MapaMentalInteracao;
        // F12: qualquer ação fecha o menu contextual aberto (sem render extra).
        if (this.mapaMenuNo || this.mapaMenuCanvas) {
            this.mapaMenuNo = null;
            this.mapaMenuCanvas = null;
            const menuAberto = document.getElementById('mapaMenu');
            if (menuAberto) menuAberto.remove();
        }
        // Ações de nó usam o id do próprio botão (alternador) ou o nó selecionado.
        const idNo = alvo.dataset.mapaNoId || (interacao ? interacao.idPrincipal(this) : null);
        // O menu de OPÇÕES da barra (fonte/forma/alinhamento) fecha em QUALQUER ação,
        // menos no próprio botão que o abre/fecha.
        if (this.mapaMenuBarra && acao !== 'barra-menu') this.mapaMenuBarra = null;
        // Ações do canvas são resolvidas sem re-renderizar a área.
        if (ACOES_CANVAS.includes(acao)) { tratarAcaoCanvas.call(this, acao, evento); return; }
        switch (acao) {
            case 'voltar-lista': mapaVoltarParaPastas.call(this); return;
            case 'form-cancelar': this.mapaAcao = null; break;
            case 'abrir': abrirMapa.call(this, id); break;
            case 'duplicar': duplicarMapaNoChip.call(this, id); break;
            case 'modelos': mapaTemplates.call(this, alvo); return;
            case 'conectar': this.mapaAcao = { tipo: 'conectar', id: this.mapaAbertaId }; break;
            case 'no-filho': mapaCriarFilhoDeNo.call(this, idNo, true); break;
            case 'no-irmao': mapaCriarIrmaoDeNo.call(this, idNo, true); break;
            case 'no-independente': mapaCriarNoIndependente.call(this); break;
            case 'no-editar': if (interacao) interacao.iniciarEdicao.call(this, idNo); return;
            case 'no-propriedades': mapaAbrirPainel.call(this, idNo); return;
            case 'no-concluir': mapaAlternarConcluidoNo.call(this, idNo); break;
            case 'painel-fechar': mapaFecharPainel.call(this); return;
            case 'no-emoji': mapaDefinirEmojiNo.call(this, alvo.dataset.mapaEmoji); break;
            // Estilo (Fase 9): visual do nó, pincel, estilos por nível e tema do mapa.
            // Os botões vivem no painel, então o alvo é o nó do painel (fallback: seleção).
            case 'no-estilo-salvar': mapaSalvarEstiloNo.call(this, this.mapaPainelNoId || idNo, document.getElementById('mapaPainelForm')); break;
            case 'no-estilo-copiar': mapaCopiarEstiloNo.call(this, this.mapaPainelNoId || idNo); break;
            case 'no-estilo-aplicar': mapaAplicarEstiloCopiadoNo.call(this, this.mapaPainelNoId || idNo); break;
            case 'no-estilo-restaurar': mapaRestaurarEstiloNo.call(this, this.mapaPainelNoId || idNo); break;
            case 'estilo-nivel-aplicar': {
                const nivelEl = document.getElementById('mapaEstiloNivel');
                const lerCor = nome => { const el = document.getElementById(nome); return el ? el.value : null; };
                mapaDefinirEstiloNivel.call(this, nivelEl ? nivelEl.value : 1, {
                    fundo: lerCor('mapaEstiloNivelFundo'), borda: lerCor('mapaEstiloNivelBorda')
                });
                return;
            }
            case 'estilo-nivel-limpar': {
                const nivelEl = document.getElementById('mapaEstiloNivel');
                mapaLimparEstiloNivel.call(this, nivelEl ? nivelEl.value : 1);
                return;
            }
            // Atalhos (Fase 10): abrir/fechar o painel, capturar tecla e restaurar padrão.
            case 'atalhos-abrir': mapaAbrirAtalhos.call(this); return;
            case 'atalho-fechar': mapaFecharAtalhos.call(this); return;
            case 'atalho-padrao': mapaRestaurarAtalhosPadrao.call(this); return;
            case 'atalho-alterar': mapaCapturarAtalho.call(this, alvo.dataset.mapaAtalho); return;
            // Barras padronizadas (Fase 12): menu contextual, formatação rápida, cores e barra.
            case 'menu-fechar': this.mapaMenuNo = null; this.mapaMenuCanvas = null; break;
            case 'barra-editar': this.mapaBarraAberta = true; break;
            case 'barra-fechar': this.mapaBarraAberta = false; break;
            case 'barra-restaurar': mapaRestaurarBarra.call(this); break;
            case 'barra-menu': mapaAlternarMenuBarra.call(this, alvo.dataset.mapaMenu); break;
            case 'menu-barra-fechar': this.mapaMenuBarra = null; break;
            case 'barra-mover':
                mapaMoverBotaoBarra.call(this, alvo.dataset.mapaGrupo, alvo.dataset.mapaBotao, Number(alvo.dataset.mapaDir) || 1);
                break;
            case 'estilo-toggle': mapaAlternarEstiloRapido.call(this, alvo.dataset.mapaEstilo, idNo); break;
            case 'estilo-definir': mapaDefinirEstiloRapido.call(this, alvo.dataset.mapaEstilo, alvo.dataset.mapaValor, idNo); break;
            case 'estilo-passo': mapaPassoEstiloRapido.call(this, alvo.dataset.mapaEstilo, Number(alvo.dataset.mapaPasso) || 1, idNo); break;
            case 'cor-abrir': mapaAbrirCor.call(this, alvo.dataset.mapaCor, alvo, idNo); return;
            // Fonte: abre o MESMO catálogo do sistema usado em Notas (`NotasFontes`) e
            // aplica a família escolhida ao nó selecionado.
            case 'fonte-abrir': {
                const fontes = global.NotasFontes;
                if (!fontes || !idNo) return;
                const grafoFonte = this.mapaCanvasGrafo;
                const noFonte = grafoFonte ? (grafoFonte.nos || []).find(no => no.id === idNo) : null;
                const atual = noFonte && noFonte.estilo ? noFonte.estilo.fonte : '';
                fontes.abrir({
                    atual: typeof atual === 'string' ? atual : '',
                    trigger: alvo,
                    onEscolher: css => mapaDefinirEstiloRapido.call(this, 'fonte', css, idNo)
                });
                return;
            }
            case 'no-anexo-adicionar': mapaPedirAnexoNo.call(this); return;
            case 'no-anexo-remover': mapaRemoverAnexoNo.call(this, idNo, alvo.dataset.mapaAnexo); break;
            case 'ponte-abrir': abrirMapa.call(this, alvo.dataset.mapaRef); break;
            // Vínculo Notas↔Mapa: abre a nota vinculada LADO A LADO com o mapa (no PC).
            case 'abrir-nota': {
                const idNota = alvo.dataset.mapaNota;
                if (!idNota || typeof this.openNotesModal !== 'function') return;
                if (typeof this.ehMobile === 'function' && this.ehMobile()) {
                    aplicarArea.call(this, 'notas');
                    this.openNotesModal(idNota);
                } else {
                    this.openNotesModal(idNota);
                    aplicarSplit.call(this, true);
                }
                return;
            }
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
            case 'no-refazer': refazer.call(this); return;
            case 'recolher-tudo': definirRecolhidoTodos.call(this, true); break;
            case 'expandir-tudo': definirRecolhidoTodos.call(this, false); break;
            // Fase 8: layout automático (confirmação em duas etapas) e espaçamento.
            case 'layout-confirmar': mapaConfirmarLayout.call(this); return;
            case 'layout-cancelar': this.mapaAcao = null; renderArea.call(this); return;
            case 'espacamento-aplicar': {
                const lerNum = nome => { const el = document.getElementById(nome); return el ? Number(el.value) : null; };
                mapaDefinirEspacamento.call(this, { nos: lerNum('mapaEspacoNos'), niveis: lerNum('mapaEspacoNiveis') });
                return;
            }
            case 'alternar-colapso': mapaAlternarColapsoBarras.call(this); return;
            // Alternar área (⇄, celular): volta para as NOTAS — espelho exato do ⇄ de
            // Notas (`#notesAlternarAreaBtn`), que traz o Mapa. `aplicarArea` já desliga
            // a tela cheia do mapa e o lado a lado ao trocar.
            case 'alternar-area': aplicarArea.call(this, 'notas'); return;
            // Expandir/contrair a área (espelha o fullscreen de Notas): EXPANDIR deixa só
            // o mapa na tela; CONTRAIR volta ao lado a lado (notas + mapa) e recolhe/mostra
            // as barras UMA POR VEZ (animação sequencial).
            case 'alternar-fullscreen': mapaAlternarFullscreen.call(this); return;
            // Grade (pontinhos) da superfície: alterna e persiste (padrão: desligada).
            case 'alternar-grade': {
                const sGrade = store();
                const novo = !(sGrade && typeof sGrade.lerGrade === 'function' ? sGrade.lerGrade() : false);
                if (sGrade && typeof sGrade.salvarGrade === 'function') sGrade.salvarGrade(novo);
                break;
            }
            // Fechar a ÁREA DO MAPA (o espelho exato é `fecharAreaNotas()`, do ✕ de Notas):
            // em lado a lado fecha SÓ o mapa (a nota permanece); sozinho, volta à raiz.
            case 'fechar-mapa':
                if (this.mapaSplit) { aplicarSplit.call(this, false); aplicarArea.call(this, 'notas'); }
                else { aplicarArea.call(this, 'pastas'); }
                return;
            default: return;
        }
        renderArea.call(this);
    }

    /** Envio do formulário inline (nós e conexões). */
    function tratarSubmitMapa(evento) {
        const form = evento.target && evento.target.closest ? evento.target.closest('form[data-mapa-form]') : null;
        if (!form) return;
        evento.preventDefault();
        const tipo = form.dataset.mapaForm;
        const id = form.dataset.mapaId || null;
        const valor = nome => { const el = document.getElementById(nome); return el ? String(el.value).trim() : ''; };
        if (tipo === 'conectar') conectarMapa.call(this, id, valor('mapaFormDestino'));
        else if (tipo === 'no-mover-para') mapaMoverNoPara.call(this, id, valor('mapaFormDestino') || null);
        else if (tipo === 'no-conteudo') mapaSalvarConteudoNo.call(this, form.dataset.mapaNoId || id, form);
        else if (tipo === 'no-conectar-para') {
            if (valor('mapaFormDestino')) mapaCriarConexaoEntre.call(this, id, valor('mapaFormDestino'), {});
        } else if (tipo === 'cx-editar') mapaSalvarConexao.call(this, form);
        this.mapaAcao = null;
        renderArea.call(this);
    }

    function tratarMudancaMapa(evento) {
        if (evento.target && evento.target.id === 'mapaLayout') {
            mapaDefinirLayout.call(this, evento.target.value);
        } else if (evento.target && evento.target.id === 'mapaTema') {
            mapaDefinirTema.call(this, evento.target.value);
        }
    }
    // 🔄 [FIM: MAPA - RENDER/CONTROLE]

    // ⚡ [INÍCIO: MAPA - FAIXA DE CHIPS E MENU DO MAPA (ESPELHO DOS CHIPS DE NOTA)]
    /**
     * Faixa de chips dos MAPAS da pasta ativa — espelha FIELMENTE a faixa de chips de
     * Notas (`renderNotesNavEm`, em app.js): MESMAS classes (`.notes-context-nav` /
     * `.notes-context-chip` / `.notes-context-chip-add` / `.notes-chip-menu`), mesmo "+"
     * para criar, duplo clique renomeia e o menu do chip (Renomear · Duplicar · Mover
     * para pasta · Excluir) abre com o botão direito ou toque longo.
     */
    function renderMapasNav() {
        const nav = document.getElementById('mapaChipsNav');
        if (!nav) return;
        const ativo = this.mapaAbertaId;
        nav.replaceChildren();
        mapasDaPasta.call(this).forEach(mapa => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'notes-context-chip' + (mapa.id === ativo ? ' is-active' : '');
            chip.dataset.mapaId = String(mapa.id);
            chip.textContent = mapa.nome || 'Mapa';
            chip.title = 'Abrir este mapa (duplo clique renomeia)';
            chip.setAttribute('aria-label', 'Abrir mapa ' + (mapa.nome || 'Mapa'));
            // MESMO accent dos chips de Notas sem cor própria (`app.js`: '#0071e3'), para
            // o chip do mapa ficar com a MESMA cor/formatação do chip de nota.
            chip.style.setProperty('--notes-accent', '#0071e3');
            chip.addEventListener('click', () => {
                if (chip.dataset.menuAberto === 'true') { delete chip.dataset.menuAberto; return; }
                if (mapa.id !== ativo) { abrirMapa.call(this, mapa.id); renderArea.call(this); }
            });
            chip.addEventListener('dblclick', () => renomearMapaNoChip.call(this, mapa.id));
            chip.addEventListener('contextmenu', evento => {
                evento.preventDefault();
                abrirMenuMapa.call(this, mapa, chip);
            });
            setupChipLongPressMapa.call(this, chip, mapa);
            nav.append(chip);
        });

        const mais = document.createElement('button');
        mais.type = 'button';
        mais.className = 'notes-context-chip notes-context-chip-add';
        mais.textContent = '+';
        mais.title = 'Novo mapa';
        mais.setAttribute('aria-label', 'Criar novo mapa');
        mais.addEventListener('click', () => criarMapaNoChip.call(this));
        nav.append(mais);
    }

    /** Cria um mapa na PASTA ativa e abre (espelha o "+" de nova nota). */
    function criarMapaNoChip() {
        const s = store();
        if (!s) return null;
        const grafo = s.criarMapa('Novo mapa', this.pastaAtiva || s.ID_PASTA_PADRAO);
        abrirMapa.call(this, grafo.id);
        renderArea.call(this);
        return grafo;
    }

    /** Renomeia o mapa (duplo clique no chip ou opção do menu), igual ao chip de nota. */
    function renomearMapaNoChip(id) {
        const s = store();
        const resumo = s ? s.obterResumo(id) : null;
        if (!resumo) return;
        let nome = null;
        try { nome = window.prompt('Nome do mapa', resumo.nome || 'Mapa'); } catch (_) { nome = null; }
        if (nome === null) return;
        nome = String(nome).trim().slice(0, 60);
        if (!nome || nome === resumo.nome) return;
        s.renomearMapa(id, nome);
        renderArea.call(this);
    }

    /** Duplica o mapa (novo id, mesmo conteúdo) na pasta ativa e abre a cópia. */
    function duplicarMapaNoChip(id) {
        const s = store();
        const copia = s ? s.duplicarMapa(id) : null;
        if (!copia) return null;
        if (this.pastaAtiva) s.moverMapaParaPasta(copia.id, this.pastaAtiva);
        abrirMapa.call(this, copia.id);
        renderArea.call(this);
        return copia;
    }

    /** Move o mapa para outra pasta (opção "Mover para pasta…" do menu do chip). */
    function moverMapaDeChip(id, pastaId) {
        const s = store();
        if (!s) return false;
        s.moverMapaParaPasta(id, pastaId);
        renderArea.call(this);
        return true;
    }

    /** Exclui o mapa com confirmação; se for o último da pasta, volta às Pastas. */
    function excluirMapaDoChip(id) {
        const s = store();
        const resumo = s ? s.obterResumo(id) : null;
        if (!s || !resumo) return false;
        let ok = false;
        try { ok = window.confirm('Excluir o mapa "' + (resumo.nome || 'Mapa') + '"?'); } catch (_) { ok = false; }
        if (!ok) return false;
        const eraAberto = this.mapaAbertaId === id;
        s.excluirMapa(id);
        if (eraAberto) {
            this.mapaAbertaId = null;
            this.mapaAcao = null;
            // Seleciona o mapa restante da pasta (MESMA regra da abertura padrão).
            garantirMapaSelecionado.call(this);
        }
        renderArea.call(this);
        return true;
    }
    /** Menu do chip de mapa (MESMA estrutura/estilo do menu do chip de nota). */
    function criarMenuMapa(rotulo) {
        const menu = document.createElement('div');
        menu.id = 'mapaChipMenu';
        menu.className = 'notes-chip-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', rotulo || 'Ações do mapa');
        return menu;
    }

    /** Posiciona (preso ao chip, com clamp de viewport) e registra o menu aberto. */
    function mostrarMenuMapa(menu, chip) {
        document.body.append(menu);
        const caixa = chip.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(caixa.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
        menu.style.top = Math.min(caixa.bottom + 6, window.innerHeight - menu.offsetHeight - 8) + 'px';
        menu.querySelector('button')?.focus();
        this.mapaChipMenu = menu;
    }

    /** Menu de ações do mapa (renomear/duplicar/mover para pasta/excluir). */
    function abrirMenuMapa(mapa, chip) {
        fecharMenuMapa.call(this);
        const menu = criarMenuMapa('Ações do mapa');
        const acoes = [
            ['Renomear', () => renomearMapaNoChip.call(this, mapa.id)],
            ['Duplicar', () => duplicarMapaNoChip.call(this, mapa.id)],
            ['Mover para pasta…', () => abrirMenuMoverMapa.call(this, mapa, chip)],
            ['Excluir', () => excluirMapaDoChip.call(this, mapa.id)]
        ];
        for (const [texto, acao] of acoes) {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.setAttribute('role', 'menuitem');
            botao.textContent = texto;
            botao.addEventListener('click', () => { fecharMenuMapa.call(this); acao(); });
            menu.append(botao);
        }
        mostrarMenuMapa.call(this, menu, chip);
    }

    /** Submenu "Mover para pasta": lista as pastas (a atual marcada). */
    function abrirMenuMoverMapa(mapa, chip) {
        fecharMenuMapa.call(this);
        const s = store();
        if (!s) return;
        const menu = criarMenuMapa('Mover mapa para pasta');
        const opcoes = [['Sem pasta', null]].concat(
            (s.listarPastas() || []).map(pasta => [pasta.nome || 'Pasta', pasta.id]));
        for (const [texto, pastaId] of opcoes) {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.setAttribute('role', 'menuitemradio');
            const atual = (mapa.pastaId ?? null) === (pastaId ?? null);
            botao.setAttribute('aria-checked', String(atual));
            if (atual) botao.classList.add('is-active');
            botao.textContent = texto;
            botao.addEventListener('click', () => { fecharMenuMapa.call(this); moverMapaDeChip.call(this, mapa.id, pastaId); });
            menu.append(botao);
        }
        mostrarMenuMapa.call(this, menu, chip);
    }

    /** Fecha o menu do chip de mapa (se aberto). */
    function fecharMenuMapa() {
        this.mapaChipMenu?.remove();
        this.mapaChipMenu = null;
    }

    /** Toque longo no chip (celular) abre o menu, sem abrir o mapa. */
    function setupChipLongPressMapa(chip, mapa) {
        let timer = null;
        const cancelar = () => { clearTimeout(timer); timer = null; };
        chip.addEventListener('pointerdown', evento => {
            if (evento.pointerType === 'mouse') return;
            cancelar();
            timer = setTimeout(() => {
                timer = null;
                chip.dataset.menuAberto = 'true';
                abrirMenuMapa.call(this, mapa, chip);
            }, 550);
        });
        ['pointerup', 'pointerleave', 'pointercancel', 'click'].forEach(tipo => chip.addEventListener(tipo, cancelar));
    }
    // ⚡ [FIM: MAPA - FAIXA DE CHIPS E MENU DO MAPA (ESPELHO DOS CHIPS DE NOTA)]

    // 🔄 [INÍCIO: MAPA - MODELOS (DIÁLOGO — ESPELHO DO "MODELOS DE NOTA")]
    /**
     * Diálogo "Modelos do mapa" — REFLETE fielmente o "Modelos de nota"
     * (`notesTemplates`, em notes/extras.js): MESMO diálogo base
     * (`notesExtraDialog` → `.notes-extra-dialog`/`.notes-template-help`) e o mesmo
     * padrão de botões. Salva o mapa atual como modelo e cria um mapa novo (na pasta
     * ativa) a partir de um modelo PRONTO ou SALVO.
     */
    function mapaTemplates(trigger) {
        const s = store();
        const tpl = modelo();
        if (!s || !tpl || typeof this.notesExtraDialog !== 'function') return null;
        const botao = (rotulo, texto, acao) => {
            const el = document.createElement('button');
            el.type = 'button';
            el.textContent = texto;
            el.title = rotulo;
            el.setAttribute('aria-label', rotulo);
            el.addEventListener('click', acao);
            return el;
        };
        this.notesExtraDialog('Modelos do mapa', dialog => {
            const ajuda = document.createElement('p');
            ajuda.className = 'notes-template-help';
            ajuda.textContent = 'Salve o mapa atual como modelo. Ao escolher um modelo, um mapa NOVO é criado na pasta ativa como cópia editável; editar o mapa não altera o modelo salvo.';
            dialog.append(ajuda);

            const nome = document.createElement('input');
            nome.placeholder = 'Nome do modelo';
            nome.maxLength = 100;
            dialog.append(nome, botao('Salvar mapa como modelo', 'Salvar mapa atual como modelo', () => {
                const grafo = this.mapaAbertaId ? s.obterGrafo(this.mapaAbertaId) : null;
                if (!grafo) { this.showToast?.('Abra um mapa para salvá-lo como modelo.', 'error'); return; }
                s.salvarTemplate(String(nome.value || '').trim() || grafo.nome || 'Modelo', grafo);
                dialog.close();
                mapaTemplates.call(this, trigger);
            }));

            const lista = document.createElement('div');
            dialog.append(lista);
            const itens = (tpl.TEMPLATES_PRONTOS || [])
                .map(item => ({ id: item.id, nome: item.nome, pronto: true }))
                .concat(s.listarTemplates().map(item => ({ id: item.id, nome: item.nome, pronto: false })));
            itens.forEach(item => lista.append(botao('Usar ' + item.nome, 'Aplicar: ' + item.nome, () => {
                dialog.close();
                if (item.pronto) aplicarTemplatePronto.call(this, item.id);
                else aplicarTemplateSalvo.call(this, item.id);
                renderArea.call(this);
            })));
        }, trigger);
        return true;
    }
    // 🔄 [FIM: MAPA - MODELOS (DIÁLOGO — ESPELHO DO "MODELOS DE NOTA")]

    // ⚡ [INÍCIO: MAPA - COLAPSO DAS BARRAS]
    /**
     * Recolhe/expande as barras da área do mapa. Espelha o padrão de Notas
     * (`setNotesHeaderCollapsed` + `notesPanelMotion`): o botão vive na topbar
     * (que permanece visível) e apenas `#mapaToolbar`/`#mapaFormatBar` recolhem.
     */
    function setMapaBarrasColapsadas(collapsed) {
        const shell = document.querySelector('#mapaArea .mapa-shell');
        const botao = document.getElementById('mapaColapsoBarras');
        if (shell) shell.classList.toggle('mapa-barras-colapsadas', Boolean(collapsed));
        if (botao) {
            botao.setAttribute('aria-expanded', String(!collapsed));
            botao.title = collapsed ? 'Mostrar barras' : 'Recolher barras';
            botao.setAttribute('aria-label', botao.title);
        }
    }

    /**
     * Recolhe/expande os CHIPS dos mapas — o que o colapso faz no CELULAR, espelhando
     * o colapso do cabeçalho de Notas (`notes-chips-collapsed` → `#notesContextNav`).
     * No celular as BARRAS ficam: no mapa não existe barra acoplada ao teclado, então
     * recolher a toolbar tiraria as ferramentas do alcance.
     */
    function setMapaChipsColapsados(collapsed) {
        const shell = document.querySelector('#mapaArea .mapa-shell');
        const botao = document.getElementById('mapaColapsoBarras');
        if (shell) shell.classList.toggle('mapa-chips-colapsados', Boolean(collapsed));
        if (botao) {
            botao.setAttribute('aria-expanded', String(!collapsed));
            botao.title = collapsed ? 'Mostrar mapas' : 'Ocultar mapas';
            botao.setAttribute('aria-label', botao.title);
        }
    }

    /** Estado atual do colapso no celular (chips recolhidos?). */
    function mapaChipsColapsados() {
        const shell = document.querySelector('#mapaArea .mapa-shell');
        return Boolean(shell && shell.classList.contains('mapa-chips-colapsados'));
    }

    /**
     * Reaplica o colapso conforme o MODO: no celular vale o colapso dos CHIPS; no PC o
     * das BARRAS (e a classe do celular é descartada, para a área voltar limpa ao girar
     * o aparelho ou redimensionar a janela). Chamada no re-render e na troca de modo.
     */
    function sincronizarColapsoArea() {
        const movel = typeof this.ehMobile === 'function' && this.ehMobile();
        if (movel) { setMapaChipsColapsados.call(this, mapaChipsColapsados()); return; }
        const shell = document.querySelector('#mapaArea .mapa-shell');
        if (shell) shell.classList.remove('mapa-chips-colapsados');
        setMapaBarrasColapsadas.call(this, Boolean(this.mapaBarrasColapsadas));
    }

    /** Animação de painel — MESMA implementação da classe compartilhada `AppExpandir`. */
    function mapaPanelMotion(elemento, esconder, versao) {
        return AppExpandir.motion(elemento, esconder, versao, () => this.mapaMotionVersion);
    }

    /** Alterna o colapso da área (botão da topbar): chips no CELULAR, barras no PC. */
    async function mapaAlternarColapsoBarras() {
        // CELULAR: MESMO funcionamento do colapso de Notas — recolhe os CHIPS
        // (`#mapaChipsNav`), sem animação e sem tocar nas barras (ver `setMapaChipsColapsados`).
        if (typeof this.ehMobile === 'function' && this.ehMobile()) {
            setMapaChipsColapsados.call(this, !mapaChipsColapsados());
            return;
        }
        const toolbar = document.getElementById('mapaToolbar');
        const formatBar = document.getElementById('mapaFormatBar');
        const botao = document.getElementById('mapaColapsoBarras');
        if (!toolbar) return;
        const esconder = !this.mapaBarrasColapsadas;
        const versao = this.mapaMotionVersion = (this.mapaMotionVersion || 0) + 1;
        [toolbar, formatBar].filter(Boolean).forEach(e => e.getAnimations().forEach(a => a.cancel()));
        if (botao) botao.setAttribute('aria-expanded', String(!esconder));
        if (esconder) {
            // Só anima a formatação se ela estiver visível (nó selecionado).
            this.mapaFormatBarVisivel = Boolean(formatBar && !formatBar.hidden);
        } else {
            const shell = document.querySelector('#mapaArea .mapa-shell');
            if (shell) shell.classList.remove('mapa-barras-colapsadas');
        }
        await mapaPanelMotion.call(this, toolbar, esconder, versao);
        if (this.mapaFormatBarVisivel) await mapaPanelMotion.call(this, formatBar, esconder, versao);
        if (versao === this.mapaMotionVersion) {
            this.mapaBarrasColapsadas = esconder;
            setMapaBarrasColapsadas.call(this, esconder);
        }
    }

    /**
     * Sai da TELA CHEIA da área do mapa — o MESMO caminho do CONTRAIR (`alternar(false)`),
     * que além de tirar a classe ainda DEVOLVE as barras recolhidas (o `aplicar(false)`
     * sozinho só limpa a classe/estado; quem mostra as barras é o `aplicarBarras`).
     * Usado quando o modo mobile liga: no celular o ⛶ sai de cena (igual ao ⛶ de Notas)
     * e a tela cheia ficaria sem controle visível — espelho de
     * `sairDaTelaCheiaNotasMobile` (app.js).
     */
    async function mapaSairTelaCheia() {
        return expandidorMapa(this).alternar(false);
    }
    /** Barras da área que recolhem na TELA CHEIA (ordem de recolher/mostrar). */
    const BARRAS_FULLSCREEN = ['mapaToolbar', 'mapaFormatBar', 'mapaChipsNav', 'mapaRodape'];

    /** Instância ÚNICA do expandir/contrair da área (classe compartilhada `AppExpandir`). */
    function expandidorMapa(app) {
        if (!app.expandirMapa) app.expandirMapa = new AppExpandir({
            alvo: () => document.querySelector('#mapaArea .mapa-shell'),
            expandido: () => Boolean(app.mapaFullscreen),
            classeArea: 'mapa-fullscreen',
            barras: () => BARRAS_FULLSCREEN.map(id => document.getElementById(id)),
            botao: () => document.getElementById('mapaFullscreenBtn'),
            rotulos: {
                aberto: () => (document.documentElement.classList.contains('notes-mobile') ? 'Restaurar tamanho' : 'Retrair (notas + mapa)'),
                fechado: 'Expandir (só o mapa)'
            },
            versao: { nova: () => (app.mapaMotionVersion = (app.mapaMotionVersion || 0) + 1), atual: () => app.mapaMotionVersion },
            ladoALadoAtivo: () => Boolean(app.mapaSplit),
            aplicarLadoALado: ligado => aplicarSplit.call(app, ligado),
            // CONTRAIR (retrair) volta à tela LADO A LADO: Notas + Mapa — é o ⛶ que liga o
            // split (o espelho "Ver nota ao lado" saiu). No celular não existe lado a lado,
            // então o flag devolve false e o ⛶ apenas restaura o tamanho normal.
            contrairEmLadoALado: () => !(typeof app.ehMobile === 'function' && app.ehMobile()),
            aoAplicar: aberto => { app.mapaFullscreen = aberto; }
        });
        return app.expandirMapa;
    }

    /** Aplica (SEM animação) o estado de tela cheia das barras — usado no re-render. */
    function aplicarBarrasFullscreen(esconder) {
        BARRAS_FULLSCREEN.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.hidden = Boolean(esconder);
        });
        expandidorMapa(this).aplicar(Boolean(esconder));
    }

    /**
     * Expandir/contrair a área — comportamento PADRÃO (o MESMO de Notas, via a classe
     * única `AppExpandir`):
     *  - EXPANDIR: a área toma a tela SOZINHA (fecha o lado a lado) e recolhe as barras
     *    UMA POR VEZ; CONTRAIR mostra UMA POR VEZ (INVERSA) e volta ao LADO A LADO.
     */
    async function mapaAlternarFullscreen() {
        return expandidorMapa(this).alternar();
    }
    // ⚡ [FIM: MAPA - COLAPSO DAS BARRAS]

    // ⚡ [INÍCIO: MAPA - PASTAS (ÁREA RAIZ / WORKSPACES)]
    /** Botão da área de Pastas (mesma delegação `data-mapa-acao`). */
    function botaoPastas(rotulo, acao, dados) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mapa-btn';
        b.textContent = rotulo;
        // Namespace PRÓPRIO (`data-pastas-acao`) para não colidir com as ações do Mapa.
        b.dataset.pastasAcao = acao;
        Object.assign(b.dataset, dados || {});
        return b;
    }

    function textoPastas(tag, classe, texto) {
        const el = document.createElement(tag);
        el.className = classe;
        el.textContent = texto;
        return el;
    }

    /** Monta o shell da área de Pastas (lazy, uma vez). */
    function montarAreaPastas() {
        if (this.pastasAreaMontada) return;
        const secao = document.getElementById('pastasArea');
        if (!secao) return;
        secao.innerHTML = '';
        const shell = document.createElement('div');
        shell.className = 'pastas-shell app-rolagem';
        secao.append(shell);
        if (!this.pastasAreaOuvintesLigados) {
            secao.addEventListener('click', evento => tratarCliquePastas.call(this, evento));
            this.pastasAreaOuvintesLigados = true;
        }
        this.pastasAreaMontada = true;
    }

    /** Renderiza a lista de pastas (tela raiz). Cada pasta é um workspace. */
    function renderPastas() {
        const secao = document.getElementById('pastasArea');
        if (!secao) return;
        const shell = secao.querySelector('.pastas-shell');
        if (!shell) return;
        const s = store();
        if (s && typeof s.garantirPastaPadrao === 'function') s.garantirPastaPadrao();
        const pastas = (s && s.listarPastas) ? s.listarPastas() : [];
        shell.innerHTML = '';

        const topo = document.createElement('div');
        topo.className = 'pastas-topbar';
        topo.append(textoPastas('h2', 'pastas-titulo', 'Pastas'));
        const espaco = document.createElement('div');
        espaco.className = 'mapa-topbar-espaco';
        topo.append(espaco, botaoPastas('Nova pasta', 'pasta-nova'));
        shell.append(topo);

        const grade = document.createElement('div');
        grade.className = 'pastas-grade';
        pastas.forEach(pasta => {
            const card = document.createElement('div');
            card.className = 'pastas-card' + (pasta.id === this.pastaAtiva ? ' is-active' : '');
            const abrir = botaoPastas('', 'abrir-pasta', { pastaId: pasta.id });
            abrir.classList.add('pastas-card-abrir');
            abrir.append(textoPastas('span', 'pastas-card-nome', pasta.nome || 'Pasta'));
            const nMaps = (s && s.contarMapasDaPasta) ? s.contarMapasDaPasta(pasta.id) : 0;
            const nNotas = typeof this.contarNotasDaPasta === 'function' ? this.contarNotasDaPasta(pasta.id) : 0;
            abrir.append(textoPastas('span', 'pastas-card-meta', nNotas + ' nota(s) · ' + nMaps + ' mapa(s)'));
            card.append(abrir);
            const acoes = document.createElement('div');
            acoes.className = 'pastas-card-acoes';
            acoes.append(botaoPastas('Renomear', 'pasta-renomear', { pastaId: pasta.id }));
            if (!s || pasta.id !== s.ID_PASTA_PADRAO) acoes.append(botaoPastas('Excluir', 'pasta-excluir', { pastaId: pasta.id }));
            card.append(acoes);
            grade.append(card);
        });
        shell.append(grade);
    }

    /** Abre um workspace: define a pasta ativa (notas + mapas) e entra em Notas. */
    function abrirPasta(id) {
        const s = store();
        const pastaId = id || (s && s.ID_PASTA_PADRAO) || 'pasta-geral';
        this.pastaAtiva = pastaId;
        if (s && typeof s.salvarPastaAtiva === 'function') s.salvarPastaAtiva(pastaId);
        this.mapaFiltroPasta = pastaId;
        this.mapaAbertaId = null;
        if (typeof this.definirPastaAtivaNotas === 'function') this.definirPastaAtivaNotas(pastaId);
        renderPastas.call(this);
        aplicarArea.call(this, 'notas');
    }

    /** Cliques da área de Pastas (criar/abrir/renomear/excluir). */
    function tratarCliquePastas(evento) {
        const alvo = evento.target.closest('[data-pastas-acao]');
        if (!alvo) return;
        const acao = alvo.dataset.pastasAcao;
        const s = store();
        if (acao === 'abrir-pasta') { abrirPasta.call(this, alvo.dataset.pastaId); return; }
        if (acao === 'pasta-nova') {
            let nome = null;
            try { nome = window.prompt('Nome da pasta', 'Nova pasta'); } catch (_) { nome = null; }
            if (nome === null || !s) return;
            s.criarPasta(String(nome).trim() || 'Nova pasta');
            renderPastas.call(this);
            return;
        }
        if (acao === 'pasta-renomear') {
            const pasta = s ? s.listarPastas().find(p => p.id === alvo.dataset.pastaId) : null;
            if (!pasta) return;
            let nome = null;
            try { nome = window.prompt('Nome da pasta', pasta.nome); } catch (_) { nome = null; }
            if (nome === null) return;
            s.renomearPasta(pasta.id, String(nome).trim() || pasta.nome);
            renderPastas.call(this);
            return;
        }
        if (acao === 'pasta-excluir') {
            const pasta = s ? s.listarPastas().find(p => p.id === alvo.dataset.pastaId) : null;
            if (!pasta || (s && pasta.id === s.ID_PASTA_PADRAO)) return;
            let ok = false;
            try { ok = window.confirm('Excluir a pasta "' + pasta.nome + '"?'); } catch (_) { ok = false; }
            if (!ok) return;
            s.excluirPasta(pasta.id);
            if (this.pastaAtiva === pasta.id) { this.pastaAtiva = s.ID_PASTA_PADRAO; s.salvarPastaAtiva(s.ID_PASTA_PADRAO); }
            renderPastas.call(this);
            return;
        }
    }
    // ⚡ [FIM: MAPA - PASTAS (ÁREA RAIZ / WORKSPACES)]
    // ⚡ [INÍCIO: MAPA - LADO A LADO (SPLIT NOTA + MAPA)]
    /**
     * Navegação: só a MOLDURA FIXA do topo (`#appAreas` — o botão de CONTA, definido no
     * `conta.js`), sempre visível. A troca Notas↔Mapa é feita pelo ⛶ de cada área:
     * EXPANDIR deixa uma tela só e CONTRAIR volta ao lado a lado (Notas + Mapa) — os
     * botões "Ver mapa ao lado" (Notas) e "Ver nota ao lado" (Mapa) foram REMOVIDOS.
     */
    function atualizarBarraAreas() {
        const nav = document.getElementById('appAreas');
        // A moldura fica SEMPRE disponível (topo-esquerdo): é por ela que se volta à raiz
        // de Pastas (Fechar de Notas/Mapa) e se abre o painel da CONTA.
        if (nav) nav.hidden = false;
    }


    /** Aplica a proporção do split (largura do painel da NOTA) via `--split-nota`. */
    function aplicarSplitRatio() {
        const limite = (store() && store().LIMITE_SPLIT) || [0.2, 0.8];
        const ratio = Math.min(limite[1], Math.max(limite[0], Number(this.mapaSplitRatio) || 0.5));
        this.mapaSplitRatio = ratio;
        document.documentElement.style.setProperty('--split-nota', (ratio * 100).toFixed(3) + '%');
        // O CARD da nota (`#notesModal`) tem `width: var(--notes-width) !important` dentro de
        // `@layer components` — que VENCE uma regra importante fora de camada. Por isso o
        // painel só acompanha se controlarmos `--notes-width` (100% do backdrop = a metade).
        const modal = document.getElementById('notesModal');
        if (modal && this.mapaSplit) modal.style.setProperty('--notes-width', '100%');
        const divisor = document.getElementById('appSplitDivisor');
        if (divisor) divisor.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    }

    /** Cria/posiciona o DIVISOR arrastável entre os painéis (só aparece no split). */
    function montarDivisorSplit() {
        let divisor = document.getElementById('appSplitDivisor');
        if (!divisor) {
            divisor = document.createElement('div');
            divisor.id = 'appSplitDivisor';
            divisor.className = 'app-split-divisor';
            divisor.setAttribute('role', 'separator');
            divisor.setAttribute('aria-orientation', 'vertical');
            divisor.setAttribute('aria-label', 'Ajustar a largura da nota e do mapa');
            divisor.tabIndex = 0;
            document.body.append(divisor);
        }
        divisor.hidden = !this.mapaSplit;
        if (this.mapaSplit) aplicarSplitRatio.call(this);
    }

    /**
     * Arrastar o divisor ajusta a proporção: estreitar/alargar a NOTA redimensiona o
     * MAPA automaticamente (e vice-versa). A proporção é persistida em `notas-pwa-split`.
     */
    /** X (px) da divisa entre os painéis. */
    function splitDivisaX() {
        const largura = window.innerWidth;
        const ratio = Number(this.mapaSplitRatio) || 0.5;
        return this.mapaSplitLado === 'direita' ? (1 - ratio) * largura : ratio * largura;
    }

    /**
     * Arrastar a DIVISA (o divisor ou a borda de qualquer um dos painéis, perto dela)
     * ajusta a proporção: estreitar/alargar a NOTA redimensiona o MAPA automaticamente
     * (e vice-versa). A proporção é persistida em `notas-pwa-split`.
     * O `pointerdown` é capturado na fase de CAPTURA para o mapa NÃO iniciar o pan.
     */
    function instalarDivisorSplit() {
        if (this.mapaSplitDivisorLigado) return;
        this.mapaSplitDivisorLigado = true;
        montarDivisorSplit.call(this);
        const obter = () => document.getElementById('appSplitDivisor');
        const TOLERANCIA = 18;
        document.addEventListener('pointerdown', evento => {
            if (!this.mapaSplit) return;
            const alvo = evento.target;
            const noDivisor = Boolean(alvo.closest && alvo.closest('#appSplitDivisor'));
            const pertoDaDivisa = Math.abs(evento.clientX - splitDivisaX.call(this)) <= TOLERANCIA;
            if (!noDivisor && !pertoDaDivisa) return;
            if (alvo.closest && alvo.closest('button, input, select, a, [data-mapa-acao], [data-pastas-acao]')) return;
            this.mapaSplitArrastoRatio = true;
            obter()?.classList.add('mapa-split-arrastando');
            document.documentElement.classList.add('mapa-split-arrastando');
            evento.preventDefault();
            evento.stopPropagation();
        }, true);
        document.addEventListener('pointermove', evento => {
            if (!this.mapaSplitArrastoRatio) return;
            const fracao = Math.min(0.8, Math.max(0.2, evento.clientX / window.innerWidth));
            // Com a nota à direita, a largura da nota é o complemento da fração do ponteiro.
            this.mapaSplitRatio = this.mapaSplitLado === 'direita' ? (1 - fracao) : fracao;
            aplicarSplitRatio.call(this);
            evento.preventDefault();
        }, true);
        const soltar = () => {
            if (!this.mapaSplitArrastoRatio) return;
            this.mapaSplitArrastoRatio = false;
            obter()?.classList.remove('mapa-split-arrastando');
            document.documentElement.classList.remove('mapa-split-arrastando');
            if (store()) store().salvarSplit({ ligado: this.mapaSplit, lado: this.mapaSplitLado, ratio: this.mapaSplitRatio });
        };
        document.addEventListener('pointerup', soltar);
        document.addEventListener('pointercancel', soltar);
        // O motor de notas pode reescrever `--notes-width` (ex.: resize da janela); reaplica.
        window.addEventListener('resize', () => { if (this.mapaSplit) aplicarSplitRatio.call(this); });
    }

    /**
     * Visão lado a lado (PC): a nota e o mapa aparecem juntos. É LIGADA pelo CONTRAIR
     * (⛶) das DUAS áreas — `contrairEmLadoALado`, na classe `AppExpandir` — e lembrada
     * no boot; arrastar a BARRA SUPERIOR de um painel para o lado inverso TROCA os
     * lados. Persistido em `notas-pwa-split`.
     *
     * `opcoes.manter` (usado pelo expandir/contrair): ao DESLIGAR, só remove o
     * lado a lado — NÃO troca de área. Sem isso, fechar o split a partir da tela
     * cheia das NOTAS chamava `aplicarArea('mapa')`, que removia o `active` do
     * modal e entregava a tela ao mapa. Com `manter: 'notas'`, o painel do Mapa
     * sai de cena (não rouba o teclado) e o modal de Notas continua ativo.
     */
    function aplicarSplit(ligado, opcoes = {}) {
        const html = document.documentElement;
        this.mapaSplit = Boolean(ligado) && !(typeof this.ehMobile === 'function' && this.ehMobile());
        html.classList.toggle('app-split', this.mapaSplit);
        html.classList.toggle('app-split-nota-direita', this.mapaSplit && this.mapaSplitLado === 'direita');
        if (store()) store().salvarSplit({ ligado: this.mapaSplit, lado: this.mapaSplitLado, ratio: this.mapaSplitRatio });
        montarDivisorSplit.call(this);
        if (!this.mapaSplit) {
            if (opcoes.manter === 'notas') {
                // A NOTA fica com a tela: o mapa sai de cena (a área ativa NÃO muda).
                const secao = document.getElementById('mapaArea');
                if (secao) secao.hidden = true;
                return;
            }
            if (opcoes.manter === 'mapa') {
                const backdrop = document.getElementById('notesModalBackdrop');
                if (backdrop) backdrop.classList.remove('active');
                return;
            }
            aplicarArea.call(this, this.mapaAreaAtiva === 'pastas' ? 'notas' : (this.mapaAreaAtiva || 'notas'));
            return;
        }
        // Ligado: mantém o mapa E o modal de notas visíveis ao mesmo tempo.
        this.mapaAreaAtiva = 'mapa';
        if (store()) store().salvarAreaAtiva('mapa');
        const secao = document.getElementById('mapaArea');
        const pastas = document.getElementById('pastasArea');
        const backdrop = document.getElementById('notesModalBackdrop');
        montarAreaMapa.call(this);
        if (secao) secao.hidden = false;
        if (pastas) pastas.hidden = true;
        if (backdrop) backdrop.classList.add('active');
        atualizarBarraAreas.call(this);
        aplicarSplitRatio.call(this);
    }

    /** Troca o lado da nota no split (esquerda/direita). */
    function trocarLadoSplit(novoLado) {
        const lado = novoLado === 'direita' ? 'direita' : 'esquerda';
        if (lado === this.mapaSplitLado) return;
        this.mapaSplitLado = lado;
        if (store()) store().salvarSplit({ ligado: this.mapaSplit, lado, ratio: this.mapaSplitRatio });
        document.documentElement.classList.toggle('app-split-nota-direita', Boolean(this.mapaSplit) && lado === 'direita');
    }

    /** Arrastar a barra superior (nota ou mapa) para o lado inverso troca os lados. */
    function instalarArrastoSplit() {
        if (this.mapaSplitArrastoLigado) return;
        this.mapaSplitArrastoLigado = true;
        document.addEventListener('pointerdown', evento => {
            if (!this.mapaSplit) return;
            const cabecalho = evento.target.closest('.notes-modal-header, .mapa-topbar');
            if (!cabecalho) return;
            if (evento.target.closest('button, input, select, a, [data-mapa-acao], [data-pastas-acao]')) return;
            this.mapaSplitArrasto = { painel: cabecalho.classList.contains('mapa-topbar') ? 'mapa' : 'nota' };
            cabecalho.classList.add('mapa-split-arrastando');
        });
        const soltar = evento => {
            const estado = this.mapaSplitArrasto;
            this.mapaSplitArrasto = null;
            document.querySelectorAll('.mapa-split-arrastando').forEach(el => el.classList.remove('mapa-split-arrastando'));
            if (!estado || !this.mapaSplit) return;
            const soltouNaDireita = evento.clientX > (window.innerWidth / 2);
            const notaQuerDireita = estado.painel === 'nota' ? soltouNaDireita : !soltouNaDireita;
            trocarLadoSplit.call(this, notaQuerDireita ? 'direita' : 'esquerda');
        };
        document.addEventListener('pointerup', soltar);
        document.addEventListener('pointercancel', soltar);
    }
    // ⚡ [FIM: MAPA - LADO A LADO (SPLIT NOTA + MAPA)]




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
    const LIMITE_HISTORICO = 100;   // cap de passos (F11)
    const JANELA_COALESCE = 900;    // ms — digitação contínua vira UM passo (F11)

    /** Instantâneo serializável do estado do mapa (nunca referências vivas). */
    const instantaneoGrafo = grafo => ({
        nome: (grafo && grafo.nome) || '',
        nos: JSON.parse(JSON.stringify((grafo && grafo.nos) || [])),
        conexoes: JSON.parse(JSON.stringify((grafo && grafo.conexoes) || [])),
        idSeq: (grafo && grafo.idSeq) || 0,
        cxSeq: (grafo && grafo.cxSeq) || 0,
        // F8/F9: layout, espaçamento, tema e estilos por nível também são desfazíveis.
        layout: (grafo && grafo.layout) || 'bilateral',
        posicionamento: (grafo && grafo.posicionamento) || null,
        espacamento: JSON.parse(JSON.stringify((grafo && grafo.espacamento) || {})),
        temaId: (grafo && grafo.temaId) || 'padrao',
        estilosNivel: JSON.parse(JSON.stringify((grafo && grafo.estilosNivel) || {}))
    });

    function historicoReset() {
        const grafo = this.mapaCanvasGrafo;
        this.mapaHistorico = grafo ? { pilha: [instantaneoGrafo(grafo)], indice: 0 } : { pilha: [], indice: -1 };
        this.mapaHistoricoCoalesce = null;
    }

    /**
     * Registra um ponto de retorno (uma entrada por COMANDO, nunca por tecla).
     * `opcoes.coalescer` agrupa comandos contínuos (digitação) numa ÚNICA entrada:
     * dentro da janela, substitui o topo em vez de empilhar.
     */
    function registrarHistorico(opcoes) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !this.mapaHistorico) return;
        const cfg = opcoes || {};
        const chave = cfg.coalescer || null;
        const agora = Date.now();
        const hist = this.mapaHistorico;
        const coalescendo = Boolean(chave && this.mapaHistoricoCoalesce
            && this.mapaHistoricoCoalesce.chave === chave
            && (agora - this.mapaHistoricoCoalesce.quando) < JANELA_COALESCE
            && hist.indice === hist.pilha.length - 1);
        if (coalescendo) {
            hist.pilha[hist.indice] = instantaneoGrafo(grafo);
            this.mapaHistoricoCoalesce = { chave, quando: agora };
            atualizarBotoesHistorico.call(this);
            return;
        }
        const pilha = hist.pilha.slice(0, hist.indice + 1);
        pilha.push(instantaneoGrafo(grafo));
        while (pilha.length > LIMITE_HISTORICO) pilha.shift();
        this.mapaHistorico = { pilha, indice: pilha.length - 1 };
        this.mapaHistoricoCoalesce = chave ? { chave, quando: agora } : null;
        // Comandos que NÃO re-renderizam (layout/estilo/tema) também precisam atualizar os botões.
        atualizarBotoesHistorico.call(this);
    }

    /** Aplica um instantâneo (undo/redo): restaura o estado, re-salva e redesenha. */
    function aplicarInstantaneo(snap) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !snap) return false;
        grafo.nome = snap.nome || grafo.nome;
        grafo.nos = JSON.parse(JSON.stringify(snap.nos));
        grafo.conexoes = JSON.parse(JSON.stringify(snap.conexoes));
        grafo.idSeq = snap.idSeq;
        grafo.cxSeq = snap.cxSeq;
        grafo.layout = snap.layout || grafo.layout;
        grafo.posicionamento = snap.posicionamento;
        grafo.espacamento = JSON.parse(JSON.stringify(snap.espacamento || grafo.espacamento));
        grafo.temaId = snap.temaId || grafo.temaId;
        grafo.estilosNivel = JSON.parse(JSON.stringify(snap.estilosNivel || {}));
        // F11: undo/redo precisa re-agendar o autosave — aqui persiste na hora.
        store().salvarGrafo(grafo);
        if (this.mapaSelecao) this.mapaSelecao.clear();
        renderArea.call(this);
        return true;
    }

    function desfazer() {
        const hist = this.mapaHistorico;
        if (!hist || hist.indice <= 0) return false;
        hist.indice -= 1;
        this.mapaHistoricoCoalesce = null;
        return aplicarInstantaneo.call(this, hist.pilha[hist.indice]);
    }

    function refazer() {
        const hist = this.mapaHistorico;
        if (!hist || hist.indice >= hist.pilha.length - 1) return false;
        hist.indice += 1;
        this.mapaHistoricoCoalesce = null;
        return aplicarInstantaneo.call(this, hist.pilha[hist.indice]);
    }

    /** Estado dos botões Desfazer/Refazer conforme a pilha (F11) — a F12 os põe na toolbar. */
    function atualizarBotoesHistorico() {
        const hist = this.mapaHistorico;
        const podeDesfazer = Boolean(hist && hist.indice > 0);
        const podeRefazer = Boolean(hist && hist.indice < hist.pilha.length - 1);
        const marcar = (acao, ativo) => {
            document.querySelectorAll('[data-mapa-acao="' + acao + '"]').forEach(el => {
                el.disabled = !ativo;
                el.setAttribute('aria-disabled', String(!ativo));
            });
        };
        marcar('no-desfazer', podeDesfazer);
        marcar('no-refazer', podeRefazer);
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
        const medidas = layout.medidasDoDom ? layout.medidasDoDom(grafo) : null;
        const posicoes = layout.calcularPosicoes(grafo, medidas && medidas.size ? { medidas } : undefined);
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
        if (registrar !== false) {
            registrarHistorico.call(this, (registrar && typeof registrar === 'object') ? registrar : undefined);
        }
        renderArea.call(this);
    }

    // 🔄 [INÍCIO: MAPA - LAYOUT AUTOMÁTICO (FASE 8)]
    /**
     * Mede os nós JÁ renderizados e refina o layout automático (1 passada, com guarda
     * anti-loop). Precisa rodar depois do render — a caixa real varia com conteúdo/fonte.
     */
    function refinarLayoutPorMedicao() {
        const grafo = this.mapaCanvasGrafo;
        const layout = global.MapaMentalLayout;
        if (!grafo || !layout || !grafo.nos.length) return;
        if (grafo.posicionamento === 'manual' || this.mapaRefinandoLayout) return;
        const medidas = layout.medidasDoDom ? layout.medidasDoDom(grafo) : null;
        if (!medidas || !medidas.size) return;
        const posicoes = layout.calcularPosicoes(grafo, { medidas });
        let mudou = false;
        grafo.nos.forEach(no => {
            const p = posicoes.get(no.id);
            if (!p) return;
            if (!no.posicao || no.posicao.x !== p.x || no.posicao.y !== p.y) {
                no.posicao = { x: p.x, y: p.y };
                mudou = true;
            }
        });
        if (!mudou) return;
        store().salvarGrafo(grafo);
        this.mapaRefinandoLayout = true;
        try { renderArea.call(this); } finally { this.mapaRefinandoLayout = false; }
    }

    /**
     * Reaplica o layout automático no DOM SEM recriar a área (Fase 8): recalcula as posições
     * com as medidas reais, anima os nós (classe `.mapa-transicao`) e redesenha ramos/minimapa.
     * Mantém o estado do canvas (pan/zoom/seleção) — diferente de um `renderArea()`.
     */
    function reposicionarSuave() {
        const grafo = this.mapaCanvasGrafo;
        const layout = global.MapaMentalLayout;
        if (!grafo || !layout) return false;
        const medidas = layout.medidasDoDom ? layout.medidasDoDom(grafo) : null;
        const posicoes = layout.calcularPosicoes(grafo, medidas && medidas.size ? { medidas } : undefined);
        const nosEl = document.getElementById('mapaNos');
        if (nosEl) nosEl.classList.add('mapa-transicao');
        grafo.nos.forEach(no => {
            const p = posicoes.get(no.id);
            if (!p) return;
            no.posicao = { x: p.x, y: p.y };
            const el = nosEl ? nosEl.querySelector('.mapa-no[data-mapa-no-id="' + no.id + '"]') : null;
            if (el) { el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; }
        });
        store().salvarGrafo(grafo);
        const svg = document.getElementById('mapaConexoesSvg');
        if (svg) render().desenharConexoes(svg, grafo);
        this.mapaCanvasLimites = layout.limites(grafo, modelo().listarVisiveis(grafo));
        atualizarMinimapa.call(this);
        clearTimeout(this.mapaTransicaoTimer);
        this.mapaTransicaoTimer = setTimeout(() => {
            if (nosEl) nosEl.classList.remove('mapa-transicao');
        }, 320);
        return true;
    }
    // 🔄 [FIM: MAPA - LAYOUT AUTOMÁTICO (FASE 8)]

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
            progresso: val('mapaPainelProgresso'),
            // Vínculo Notas↔Mapa (o select fica no painel; salva junto do conteúdo).
            notaRef: val('mapaPainelNotaRef')
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

    // 🔄 [INÍCIO: MAPA - ATALHOS (FASE 10)]
    /** Dados do painel de atalhos: itens (ação → teclas atuais) + estado da captura/aviso. */
    function dadosAtalhos() {
        const interacao = global.MapaMentalInteracao;
        if (!interacao) return null;
        const prefs = store().lerAtalhos();
        return {
            itens: interacao.ACOES_ATALHO.map(acao => ({
                id: acao.id,
                rotulo: acao.rotulo,
                teclas: interacao.teclasDaAcao(prefs, acao.id)
            })),
            capturando: this.mapaAtalhoCapturando || null,
            aviso: this.mapaAtalhoAviso || ''
        };
    }

    function mapaAbrirAtalhos() {
        this.mapaAtalhosAberto = true;
        this.mapaAtalhoCapturando = null;
        this.mapaAtalhoAviso = '';
        renderArea.call(this);
        return true;
    }

    function mapaFecharAtalhos() {
        this.mapaAtalhosAberto = false;
        this.mapaAtalhoCapturando = null;
        this.mapaAtalhoAviso = '';
        renderArea.call(this);
        return false;
    }

    /** Apaga as preferências de atalho (volta a todos os padrões). */
    function mapaRestaurarAtalhosPadrao() {
        store().limparAtalhos();
        this.mapaAtalhoCapturando = null;
        this.mapaAtalhoAviso = '';
        renderArea.call(this);
        return true;
    }

    /** Entra no modo "capturar tecla" para a ação indicada. */
    function mapaCapturarAtalho(acaoId) {
        this.mapaAtalhoCapturando = acaoId || null;
        this.mapaAtalhoAviso = '';
        renderArea.call(this);
        return true;
    }

    /** Salva a tecla capturada para a ação — com detecção de conflito (avisa e não grava). */
    function mapaLigarAtalho(acaoId, evento) {
        const interacao = global.MapaMentalInteracao;
        if (!interacao || !acaoId || !evento) return false;
        // `Esc` cancela a captura (não é um atalho).
        if (evento.key === 'Escape' && !evento.ctrlKey && !evento.altKey) {
            this.mapaAtalhoCapturando = null;
            this.mapaAtalhoAviso = '';
            renderArea.call(this);
            return false;
        }
        const assinatura = interacao.assinaturaTecla(evento);
        const prefs = store().lerAtalhos();
        const conflito = interacao.conflitoDeAtalho(prefs, acaoId, assinatura);
        if (conflito) {
            const outra = interacao.ACOES_ATALHO.find(item => item.id === conflito);
            this.mapaAtalhoAviso = 'A tecla "' + assinatura + '" já é usada por "' +
                (outra ? outra.rotulo : conflito) + '".';
            renderArea.call(this);
            return false;
        }
        const novo = Object.assign({}, prefs);
        novo[acaoId] = [assinatura];
        store().salvarAtalhos(novo);
        this.mapaAtalhoCapturando = null;
        this.mapaAtalhoAviso = '';
        renderArea.call(this);
        return true;
    }
    // 🔄 [FIM: MAPA - ATALHOS (FASE 10)]

    // 🔄 [INÍCIO: MAPA - BARRAS/MENU/CORES (FASE 12)]
    /** Abre o menu contextual do CARD (botão direito no PC / toque longo no celular). */
    function mapaAbrirMenuNo(idNo, posicao) {
        if (!idNo) return false;
        this.mapaMenuCanvas = null;
        this.mapaMenuNo = { id: idNo, x: (posicao && posicao.x) || 0, y: (posicao && posicao.y) || 0 };
        if (this.mapaSelecao) { this.mapaSelecao.clear(); this.mapaSelecao.add(idNo); }
        renderArea.call(this);
        return true;
    }

    /** Abre o menu contextual do CANVAS (ações de mapa/tela). */
    function mapaAbrirMenuCanvas(posicao) {
        this.mapaMenuNo = null;
        this.mapaMenuCanvas = { x: (posicao && posicao.x) || 0, y: (posicao && posicao.y) || 0 };
        renderArea.call(this);
        return true;
    }

    function mapaFecharMenus() {
        if (!this.mapaMenuNo && !this.mapaMenuCanvas && !this.mapaMenuBarra) return false;
        this.mapaMenuNo = null;
        this.mapaMenuCanvas = null;
        this.mapaMenuBarra = null;
        renderArea.call(this);
        return true;
    }

    /**
     * Menus/telas flutuantes do mapa que devem FECHAR ao clicar fora deles.
     * `gatilhos` = seletores do(s) botão(ões) que ABRE(M) o menu (clicar nele NÃO fecha —
     * ele mesmo alterna o estado). `somenteEstado` = não remover o nó (caso do `<details>`).
     *
     * ⚠️ Fechamos removendo o nó do DOM + limpando o estado, SEM chamar `renderArea` —
     * mesmo padrão do fechamento do menu contextual. Assim nada que esteja digitado no
     * painel de propriedades se perde por causa do clique fora.
     */
    const MENUS_FLUTUANTES = [
        { seletor: '#mapaMenu', gatilhos: [], fechar: app => { app.mapaMenuNo = null; app.mapaMenuCanvas = null; } },
        { seletor: '#mapaMenuOpcoes', gatilhos: ['[data-mapa-acao="barra-menu"]'], fechar: app => { app.mapaMenuBarra = null; } },
        { seletor: '#mapaConexaoMenu', gatilhos: ['[data-mapa-acao="cx-menu"]'], fechar: app => { app.mapaConexaoMenuId = null; } },
        {
            seletor: '#mapaAtalhos', gatilhos: ['[data-mapa-acao="atalhos-abrir"]'],
            fechar: app => { app.mapaAtalhosAberto = false; app.mapaAtalhoCapturando = null; app.mapaAtalhoAviso = ''; }
        },
        { seletor: '#mapaBarraEditor', gatilhos: ['[data-mapa-acao="barra-editar"]'], fechar: app => { app.mapaBarraAberta = false; } },
        // Overflow "Mais" é um `<details>`: fechar = tirar o `open` (o clique no resumo alterna).
        { seletor: '.mapa-tb-mais[open]', gatilhos: ['.mapa-tb-mais-resumo'], somenteEstado: true, fechar: (app, el) => { el.open = false; } }
    ];

    /** Fecha TODOS os menus flutuantes abertos (usado no clique fora e no `Esc`). */
    function fecharMenusAbertos(excepto) {
        let fechou = false;
        MENUS_FLUTUANTES.forEach(menu => {
            const aberto = document.querySelector(menu.seletor);
            if (!aberto || aberto === excepto) return;
            if (!menu.somenteEstado) aberto.remove();
            if (menu.fechar) menu.fechar(this, aberto);
            fechou = true;
        });
        return fechou;
    }

    /**
     * Handler de CLIQUE FORA: se o alvo não estiver dentro de nenhum menu aberto nem for o
     * botão que o abre, o menu fecha. Usado em `click` (e não `pointerdown`) de propósito:
     * não interfere no arrasto/pan do canvas nem na digitação do painel.
     */
    function fecharMenusFora(evento) {
        const alvo = evento && evento.target;
        if (!alvo || !alvo.closest) return false;
        let fechou = false;
        MENUS_FLUTUANTES.forEach(menu => {
            const aberto = document.querySelector(menu.seletor);
            if (!aberto) return;
            if (aberto.contains(alvo)) return;                         // clique DENTRO: mantém
            if (menu.gatilhos.some(sel => alvo.closest(sel))) return;  // clique no gatilho: mantém
            if (!menu.somenteEstado) aberto.remove();
            if (menu.fechar) menu.fechar(this, aberto);
            fechou = true;
        });
        return fechou;
    }

    /** Ordem ATUAL dos grupos da barra (lida do DOM, na ordem visual). */
    function ordemBarraAtual() {
        const ordem = {};
        document.querySelectorAll('#mapaToolbar .mapa-tb-grupo').forEach(grupo => {
            const chaves = [...grupo.children]
                .filter(el => el.dataset && el.dataset.mapaBotao)
                .map(el => el.dataset.mapaBotao);
            if (chaves.length) ordem[grupo.dataset.mapaGrupo] = chaves;
        });
        return ordem;
    }

    /** Move um botão dentro do grupo; persiste em `notas-pwa-mapa-toolbar-order` (F12). */
    function mapaMoverBotaoBarra(grupoId, chave, dir) {
        if (!grupoId || !chave) return false;
        const ordem = Object.assign({}, store().lerOrdemBarra(), ordemBarraAtual());
        const lista = (ordem[grupoId] || []).slice();
        const i = lista.indexOf(chave);
        if (i < 0) return false;
        const j = i + (dir < 0 ? -1 : 1);
        if (j < 0 || j >= lista.length) return false;
        lista.splice(i, 1);
        lista.splice(j, 0, chave);
        ordem[grupoId] = lista;
        store().salvarOrdemBarra(ordem);
        return true;
    }

    /** Restaura a ordem padrão da barra (apaga as preferências). */
    function mapaRestaurarBarra() {
        store().limparOrdemBarra();
        renderArea.call(this);
        return true;
    }

    /**
     * Abre/fecha o menu de OPÇÕES de um botão da barra de formatação
     * (`fonte` / `forma` / `alinhamento`) — um botão só, com as opções dentro.
     */
    function mapaAlternarMenuBarra(chave) {
        if (!chave) return false;
        this.mapaMenuBarra = (this.mapaMenuBarra && this.mapaMenuBarra.chave === chave) ? null : { chave };
        return true;
    }

    // 🔄 [FIM: MAPA - BARRAS/MENU/CORES (FASE 12)]

    // 🔄 [INÍCIO: MAPA - FORMATAÇÃO RÁPIDA E CORES (FASE 12)]
    /** Alterna um booleano de estilo (negrito/itálico) pelo botão da barra de formatação. */
    function mapaAlternarEstiloRapido(estilo, idNo) {
        const grafo = this.mapaCanvasGrafo;
        const no = grafo ? modelo().obterNo(grafo, idNo) : null;
        if (!no || !estilo) return false;
        const mudancas = {};
        mudancas[estilo] = !((no.estilo && no.estilo[estilo]) === true);
        modelo().atualizarEstiloNo(grafo, no.id, mudancas);
        aposComandoNo.call(this);
        return true;
    }

    /** Define um valor de enum (forma/fonte/alinhamento); repetir o valor LIMPA (herdar). */
    function mapaDefinirEstiloRapido(estilo, valor, idNo) {
        const grafo = this.mapaCanvasGrafo;
        const no = grafo ? modelo().obterNo(grafo, idNo) : null;
        if (!no || !estilo || valor === undefined) return false;
        const atual = no.estilo ? no.estilo[estilo] : null;
        const mudancas = {};
        mudancas[estilo] = String(atual) === String(valor) ? null : valor;
        modelo().atualizarEstiloNo(grafo, no.id, mudancas);
        aposComandoNo.call(this);
        return true;
    }

    /** Passo (+/-) em tamanho/espessuras, dentro dos limites do modelo. */
    function mapaPassoEstiloRapido(estilo, passo, idNo) {
        const grafo = this.mapaCanvasGrafo;
        const m = modelo();
        const no = grafo ? m.obterNo(grafo, idNo) : null;
        if (!no || !estilo) return false;
        const delta = passo < 0 ? -1 : 1;
        const passoEm = (lista, valor, padrao) => {
            const i = lista.indexOf(Number(valor) || padrao);
            const base = i < 0 ? Math.max(0, lista.indexOf(padrao)) : i;
            return lista[Math.max(0, Math.min(lista.length - 1, base + delta))];
        };
        const proprio = no.estilo || {};
        let mudancas = null;
        if (estilo === 'tamanho') {
            mudancas = { tamanho: passoEm(m.TAMANHOS_NO || [12, 13, 14, 16, 18, 20], proprio.tamanho, 14) };
        } else if (estilo === 'espessuraBorda') {
            mudancas = { espessuraBorda: passoEm(m.ESPESSURAS_BORDA || [1, 2, 3, 4], proprio.espessuraBorda, 1) };
        } else if (estilo === 'espessuraRamo') {
            mudancas = { espessuraRamo: Math.max(1, Math.min(8, (Number(proprio.espessuraRamo) || 2) + delta)) };
        }
        if (!mudancas) return false;
        m.atualizarEstiloNo(grafo, no.id, mudancas);
        aposComandoNo.call(this);
        return true;
    }

    /** Abre a paleta de cores no MESMO padrão dos botões de cor/destaque de Notas. */
    function mapaAbrirCor(propriedade, botao, idNo) {
        const grafo = this.mapaCanvasGrafo;
        const cores = global.MapaMentalCores;
        const no = grafo ? modelo().obterNo(grafo, idNo) : null;
        if (!cores || !no || !propriedade) return false;
        const efetivo = modelo().estiloEfetivo ? modelo().estiloEfetivo(grafo, no) : (no.estilo || {});
        const recentes = (grafo.coresRecentes && grafo.coresRecentes[propriedade]) || [];
        cores.abrir(botao, propriedade, {
            valorAtual: (no.estilo && no.estilo[propriedade]) || efetivo[propriedade] || '',
            recentes,
            aoGravarRecente: valor => mapaGravarCorRecente.call(this, propriedade, valor),
            aoConfirmar: valor => {
                const mudancas = {};
                mudancas[propriedade] = valor;
                modelo().atualizarEstiloNo(grafo, no.id, mudancas);
                aposComandoNo.call(this);
            }
        });
        return true;
    }

    /** Guarda a cor em "cores personalizadas" do mapa (máx. 12 por propriedade). */
    function mapaGravarCorRecente(propriedade, valor) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !propriedade || !valor) return false;
        grafo.coresRecentes = grafo.coresRecentes || {};
        const lista = (grafo.coresRecentes[propriedade] || []).filter(cor => cor !== valor);
        lista.push(valor);
        grafo.coresRecentes[propriedade] = lista.slice(-12);
        persistirGrafoMapa.call(this);
        return true;
    }
    // 🔄 [FIM: MAPA - FORMATAÇÃO RÁPIDA E CORES (FASE 12)]

    // 🔄 [INÍCIO: MAPA - ESTILO DO NÓ/MAPA (FASE 9)]
    /** Lê a seção "Estilo" do painel e grava no nó. Campo vazio/desmarcado = herdar (limpa). */
    function mapaSalvarEstiloNo(idNo, form) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        const el = nome => (form && form.querySelector('#' + nome)) || document.getElementById(nome);
        const valor = nome => { const campo = el(nome); return campo ? campo.value : ''; };
        const marcado = nome => { const campo = el(nome); return Boolean(campo && campo.checked); };
        const corOuNull = id => (marcado(id + 'Ativa') ? valor(id) : null);
        const numeroOuNull = id => { const v = valor(id); return v === '' ? null : Number(v); };
        const booleanoOuNull = id => {
            const v = valor(id);
            if (v === 'sim') return true;
            if (v === 'nao') return false;
            return null;
        };
        modelo().atualizarEstiloNo(grafo, idNo, {
            cor: corOuNull('mapaEstiloCor'),
            fundo: corOuNull('mapaEstiloFundo'),
            borda: corOuNull('mapaEstiloBorda'),
            forma: valor('mapaEstiloForma') || null,
            fonte: valor('mapaEstiloFonte') || null,
            alinhamento: valor('mapaEstiloAlinhamento') || null,
            tamanho: numeroOuNull('mapaEstiloTamanho'),
            espessuraBorda: numeroOuNull('mapaEstiloEspessuraBorda'),
            espessuraRamo: numeroOuNull('mapaEstiloEspessuraRamo'),
            negrito: booleanoOuNull('mapaEstiloNegrito'),
            italico: booleanoOuNull('mapaEstiloItalico')
        });
        aposComandoNo.call(this);
        return true;
    }

    /** Pincel: guarda SÓ o visual do nó (clipboard interno, não usa o clipboard do sistema). */
    function mapaCopiarEstiloNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        const no = grafo && modelo().obterNo(grafo, idNo);
        if (!no) return false;
        this.mapaEstiloCopiado = modelo().copiarEstiloNo(no);
        renderArea.call(this);
        return true;
    }

    /** Aplica o estilo copiado como estilo PRÓPRIO do nó (substitui o anterior). */
    function mapaAplicarEstiloCopiadoNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        const copiado = this.mapaEstiloCopiado;
        if (!grafo || !idNo || !copiado || !Object.keys(copiado).length) return false;
        modelo().limparEstiloNo(grafo, idNo);
        modelo().atualizarEstiloNo(grafo, idNo, copiado);
        aposComandoNo.call(this);
        return true;
    }

    /** Restaura o estilo padrão (limpa o estilo próprio; volta a herdar nível/tema). */
    function mapaRestaurarEstiloNo(idNo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        modelo().limparEstiloNo(grafo, idNo);
        aposComandoNo.call(this);
        return true;
    }

    /** Troca o tema (paleta) do mapa inteiro. */
    function mapaDefinirTema(temaId) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !modelo().definirTemaMapa(grafo, temaId)) return false;
        aposComandoNo.call(this);
        return true;
    }

    /** Define o estilo de um nível (aplica a todos os nós daquele nível). */
    function mapaDefinirEstiloNivel(nivel, valores) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo) return false;
        modelo().definirEstiloNivel(grafo, nivel, valores || {});
        aposComandoNo.call(this);
        return true;
    }

    /** Limpa o estilo de um nível (volta a herdar o tema). */
    function mapaLimparEstiloNivel(nivel) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo) return false;
        modelo().removerEstiloNivel(grafo, nivel);
        aposComandoNo.call(this);
        return true;
    }
    // 🔄 [FIM: MAPA - ESTILO DO NÓ/MAPA (FASE 9)]

    // 🔄 [INÍCIO: MAPA - HIERARQUIA/LAYOUT (FASE 5)]
    /**
     * Troca o layout em árvore do mapa. Se o mapa está em layout MANUAL com posições gravadas,
     * pede confirmação (descarta as posições) antes de virar automático (Fase 8).
     */
    function mapaDefinirLayout(layout) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !modelo().LAYOUTS.includes(layout)) return false;
        const temManual = grafo.posicionamento === 'manual'
            && (grafo.nos || []).some(no => no.posicao && Number.isFinite(no.posicao.x));
        if (temManual && layout !== 'livre') {
            this.mapaAcao = { tipo: 'layout-confirmar', layout };
            renderArea.call(this);
            return true;
        }
        grafo.layout = layout;
        grafo.posicionamento = layout === 'livre' ? 'manual' : 'auto';
        reposicionarSuave.call(this);
        registrarHistorico.call(this);
        return true;
    }

    /** Aplica o layout automático confirmado (descarta as posições manuais) — Fase 8. */
    function mapaConfirmarLayout() {
        const grafo = this.mapaCanvasGrafo;
        const acao = this.mapaAcao;
        if (!grafo || !acao || !acao.layout) return false;
        grafo.layout = acao.layout;
        grafo.posicionamento = 'auto';
        this.mapaAcao = null;
        const barra = document.querySelector('.mapa-confirmacao');
        if (barra) barra.remove();
        reposicionarSuave.call(this);
        registrarHistorico.call(this);
        return true;
    }

    /** Define o espaçamento do layout automático (por mapa) e reaplica sem sobreposição. */
    function mapaDefinirEspacamento(valores) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo) return false;
        grafo.espacamento = modelo().normalizarEspacamento(
            Object.assign({}, grafo.espacamento, valores || {}));
        if (grafo.posicionamento === 'manual') grafo.posicionamento = 'auto';
        reposicionarSuave.call(this);
        registrarHistorico.call(this);
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

    /**
     * Conclui a edição inline (chamado pela interação). A digitação é COALESCIDA (F11):
     * sequência de commits em `titulo:<id>` dentro da janela vira UM único passo de undo.
     */
    function mapaCommitarTituloNo(idNo, titulo) {
        const grafo = this.mapaCanvasGrafo;
        if (!grafo || !idNo) return false;
        modelo().atualizarTitulo(grafo, idNo, titulo);
        aposComandoNo.call(this, { coalescer: 'titulo:' + idNo });
        return true;
    }
    // 🔄 [FIM: MAPA - MOVER/RECOLHER/ESTILO DO NÓ]

    // 🔄 [INÍCIO: MAPA - ÁREA/ISOLAMENTO]
    function aplicarTemaMapa(secao) {
        const alvo = secao || document.getElementById('mapaArea');
        const r = render();
        if (r) r.aplicarTema(alvo);
    }

    /** Módulos mínimos para a área montar (store + modelo + render do shell). */
    const MODULOS_MAPA = ['MapaMentalModelo', 'MapaMentalStore', 'MapaMentalRender'];

    /** Módulos do mapa que NÃO carregaram (ex.: cache antigo do Service Worker). */
    function diagnosticoModulosMapa() {
        return MODULOS_MAPA.filter(nome => typeof global[nome] === 'undefined');
    }

    /** Aviso VISÍVEL na área quando o mapa não pode ser montado (nunca falha em silêncio). */
    function mostrarFalhaMapa(secao, motivo) {
        const alvo = secao || document.getElementById('mapaArea');
        if (!alvo) return;
        const faltando = diagnosticoModulosMapa();
        const caixa = document.createElement('div');
        caixa.className = 'mapa-falha';
        caixa.setAttribute('role', 'alert');
        const titulo = document.createElement('p');
        titulo.className = 'mapa-falha-titulo';
        titulo.textContent = 'Não foi possível montar a área do Mapa Mental.';
        const dica = document.createElement('p');
        dica.className = 'mapa-falha-dica';
        dica.textContent = motivo || (faltando.length
            ? 'Módulos ausentes: ' + faltando.join(', ') + '. Provavelmente o cache do app está desatualizado.'
            : 'Ocorreu um erro ao montar a área. Recarregue ou repare o app.');
        const acoes = document.createElement('div');
        acoes.className = 'mapa-falha-acoes';
        const recarregar = document.createElement('button');
        recarregar.type = 'button';
        recarregar.className = 'mapa-btn mapa-btn-primario';
        recarregar.textContent = 'Recarregar';
        recarregar.addEventListener('click', () => global.location.reload());
        const reparar = document.createElement('a');
        reparar.className = 'mapa-btn';
        reparar.href = './reparar.html';
        reparar.textContent = 'Reparar (limpar cache)';
        acoes.append(recarregar, reparar);
        caixa.append(titulo, dica, acoes);
        alvo.innerHTML = '';
        alvo.append(caixa);
    }

    /** Montagem lazy: só na primeira entrada (não pesa o boot). Retorna `true` se montou agora. */
    function montarAreaMapa() {
        if (this.mapaAreaMontada) return false;
        const secao = document.getElementById('mapaArea');
        if (!secao) return false;
        // Blindagem: se um módulo do mapa não carregou (ex.: cache antigo do Service
        // Worker), mostra um aviso VISÍVEL em vez de deixar a área vazia em silêncio.
        // NÃO marca como montada, para permitir nova tentativa na próxima entrada.
        const faltando = diagnosticoModulosMapa();
        const r = render();
        if (faltando.length || !r || typeof r.montarShell !== 'function') {
            mostrarFalhaMapa(secao, faltando.length
                ? 'Módulos do mapa não carregaram: ' + faltando.join(', ') + '. Abra "Reparar (limpar cache)" e tente de novo.'
                : 'O módulo de renderização do mapa não carregou. Abra "Reparar (limpar cache)" e tente de novo.');
            return false;
        }
        try {
            r.montarShell(secao);
            // Delegação única na seção (clique, select, busca e formulário). Os ouvintes
            // são ligados UMA vez, para uma nova tentativa não duplicar handlers.
            if (!this.mapaAreaOuvintesLigados) {
                this.mapaAreaOuvintesLigados = true;
                secao.addEventListener('click', evento => tratarCliqueMapa.call(this, evento));
                secao.addEventListener('change', evento => tratarMudancaMapa.call(this, evento));
                secao.addEventListener('submit', evento => tratarSubmitMapa.call(this, evento));
                // Fase 3: edição por duplo clique e atalhos dos nós.
                secao.addEventListener('dblclick', evento => {
                    const interacao = global.MapaMentalInteracao;
                    if (interacao) interacao.duploClique.call(this, evento);
                });
                // Fase 12: botão direito (PC) abre o MENU CONTEXTUAL do card/canvas.
                secao.addEventListener('contextmenu', evento => {
                    const interacaoCtx = global.MapaMentalInteracao;
                    if (interacaoCtx && interacaoCtx.contextMenu) interacaoCtx.contextMenu.call(this, evento);
                });
                // Navegação do canvas (pan/zoom/pinça) — delegação única na seção.
                const interacao = global.MapaMentalInteracao;
                if (interacao) {
                    secao.addEventListener('pointerdown', evento => interacao.pointerDown.call(this, evento));
                    secao.addEventListener('pointermove', evento => interacao.pointerMove.call(this, evento));
                    secao.addEventListener('pointerup', evento => interacao.pointerUp.call(this, evento));
                    secao.addEventListener('pointercancel', evento => interacao.pointerUp.call(this, evento));
                    secao.addEventListener('wheel', evento => interacao.wheel.call(this, evento), { passive: false });
                }
            }
            // Estado do canvas (sempre (re)inicializado ao montar).
            this.mapaCanvasPonteiros = new Map();
            this.mapaCanvasPan = null;
            this.mapaCanvasPinca = null;
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
            // Abertura padrão (espelho das Notas): deixa o PRIMEIRO mapa da pasta
            // ativa já selecionado/renderizado — preservando o mapa aberto quando ele
            // pertencer à pasta (ver `garantirMapaSelecionado`).
            garantirMapaSelecionado.call(this);
            aplicarTemaMapa(secao);
            this.mapaAreaMontada = true;
            renderArea.call(this);
            return true;
        } catch (erro) {
            this.mapaAreaMontada = false;
            mostrarFalhaMapa(secao, 'Erro ao montar a área do mapa: ' + (erro && erro.message ? erro.message : erro));
            return false;
        }
    }

    /** Troca de área (Pastas | Notas | Mapa Mental); persiste em `notas-pwa-area-ativa`. */
    function aplicarArea(area) {
        // Trocar de aba sai do modo lado a lado (evita estados inconsistentes).
        if (this.mapaSplit) {
            this.mapaSplit = false;
            document.documentElement.classList.remove('app-split', 'app-split-nota-direita');
            if (store()) store().salvarSplit({ ligado: false, lado: this.mapaSplitLado });
        }
        const alvo = (area === 'mapa' || area === 'pastas') ? area : 'notas';
        // Sair do mapa restaura a tela cheia (não deixa a área "presa" ao voltar).
        if (alvo !== 'mapa') { this.mapaFullscreen = false; expandidorMapa(this).aplicar(false); }
        this.mapaAreaAtiva = alvo;
        if (store()) store().salvarAreaAtiva(alvo);

        atualizarBarraAreas.call(this);

        const secao = document.getElementById('mapaArea');
        const pastasSecao = document.getElementById('pastasArea');
        const backdrop = document.getElementById('notesModalBackdrop');
        if (pastasSecao) pastasSecao.hidden = (alvo === 'mapa');

        if (alvo === 'mapa') {
            // Sair de Notas: grava a nota atual e esconde o modal (sem encerrar o motor).
            if (typeof this.persistNow === 'function') this.persistNow();
            const montouAgora = montarAreaMapa.call(this);
            // Abertura padrão a cada entrada: mantém o mapa já selecionado se ele
            // pertencer à pasta ativa; senão abre o primeiro da pasta. Ao REENTRAR
            // (área já montada) o DOM é re-renderizado para refletir o estado atual
            // (pasta vazia, troca de pasta/nota, etc.).
            if (garantirMapaSelecionado.call(this) || !montouAgora) renderArea.call(this);
            if (secao) secao.hidden = false;
            if (backdrop) backdrop.classList.remove('active');
            // Foco no canvas: superficie dos atalhos de criacao/navegacao por teclado.
            const interacaoArea = global.MapaMentalInteracao;
            if (interacaoArea && interacaoArea.focarCanvas) interacaoArea.focarCanvas.call(this);
        } else if (alvo === 'pastas') {
            // Tela raiz: lista os workspaces (pastas) com notas + mapas.
            if (typeof this.persistNow === 'function') this.persistNow();
            montarAreaPastas.call(this);
            renderPastas.call(this);
            if (secao) secao.hidden = true;
            // Na RAIZ o modal de Notas fica fechado (os cartões de pasta ficam clicáveis);
            // ao abrir uma pasta/nota ele reaparece POR CIMA das pastas (subproduto).
            if (backdrop) backdrop.classList.remove('active');
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
            // Abertura padrão (espelho da área de MAPAS): mantém a nota JÁ aberta se
            // ela pertencer à pasta ativa; senão abre a PRIMEIRA nota da pasta (e cria
            // uma "Nova nota" se a pasta estiver vazia — Notas sempre tem ao menos 1).
            // `definirPastaAtivaNotas` é o equivalente, nas Notas, de
            // `garantirMapaSelecionado` (mapa/mapa.js).
            if (typeof this.definirPastaAtivaNotas === 'function') {
                this.definirPastaAtivaNotas(this.notaPastaAtiva);
            } else {
                const ativa = typeof this.lerNotaAtiva === 'function' ? this.lerNotaAtiva() : null;
                const idNota = ativa || (this.projectsData && this.projectsData[0] ? this.projectsData[0].id : null);
                if (idNota && typeof this.openNotesModal === 'function') this.openNotesModal(idNota);
            }
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
        // Captura de atalho (F10): a PRÓXIMA tecla vira o atalho da ação escolhida.
        if (this.mapaAtalhoCapturando) {
            evento.preventDefault();
            if (evento.stopImmediatePropagation) evento.stopImmediatePropagation();
            else evento.stopPropagation();
            mapaLigarAtalho.call(this, this.mapaAtalhoCapturando, evento);
            return;
        }
        // Painel de atalhos aberto: `Esc` fecha (antes do atalho de limpar seleção).
        if (this.mapaAtalhosAberto && evento.key === 'Escape') {
            evento.preventDefault();
            mapaFecharAtalhos.call(this);
            return;
        }
        // `Esc` fecha QUALQUER outro menu/tela flutuante aberto (F12).
        if (evento.key === 'Escape') {
            const aberto = document.querySelector(MENUS_FLUTUANTES.map(m => m.seletor).join(','));
            if (aberto) {
                evento.preventDefault();
                fecharMenusAbertos.call(this);
                return;
            }
        }
        const alvo = evento.target;
        if (!alvo || !alvo.closest) return;
        const campo = alvo.closest('input, textarea, select, [contenteditable]:not(.mapa-no-editor)');
        if (campo && secao.contains(campo)) return;
        const interacao = global.MapaMentalInteracao;
        if (interacao) interacao.atalho.call(this, evento);
    }

    /** Liga o seletor de áreas e aplica a área salva (só após `__notasPronto`). */
    function inicializarAreasMapa() {
        if (!this.mapaAreasLigadas) {
            this.mapaAreasLigadas = true;
            // Delegação no DOCUMENTO: os botões de área/split vivem DENTRO de cada área
            // (cabeçalho de Notas e topbar do Mapa). A seta ‹ saiu — a moldura fixa do
            // topo agora é o botão de CONTA (`conta.js`) e quem volta às Pastas é o
            // "Fechar" do Mapa (`#mapaFechar` → `mapaVoltarParaPastas`).
            document.addEventListener('click', evento => {
                const aba = evento.target.closest('[data-app-area]');
                if (aba) { this.aplicarArea(aba.dataset.appArea); return; }
                if (evento.target.closest('[data-app-voltar]')) {
                    // Compatibilidade: se a seta ‹ voltar a existir, ela volta a funcionar.
                    mapaVoltarParaPastas.call(this);
                    return;
                }
            });
            window.addEventListener('themechange', () => aplicarTemaMapa());
            // Atalhos do mapa: no documento (o foco pode ficar no editor de notas oculto).
            document.addEventListener('keydown', evento => tratarTeclaMapa.call(this, evento));
            // Clicar FORA de qualquer menu flutuante fecha o menu (F12) — em `click` e na
            // fase de CAPTURA, para rodar ANTES da delegação das ações (data-mapa-acao).
            document.addEventListener('click', evento => fecharMenusFora.call(this, evento), true);
        }
        const s = store();
        // Pasta ativa (workspace): garante a "Geral" e sincroniza as notas.
        if (s) {
            if (typeof s.garantirPastaPadrao === 'function') s.garantirPastaPadrao();
            this.pastaAtiva = (typeof s.lerPastaAtiva === 'function' ? s.lerPastaAtiva() : null) || s.ID_PASTA_PADRAO;
            if (typeof this.definirPastaAtivaNotas === 'function') this.definirPastaAtivaNotas(this.pastaAtiva);
        }
        // Lado a lado (split): preferência lembrada + arrasto da barra p/ trocar de lado.
        let splitSalvo = null;
        if (s && typeof s.lerSplit === 'function') {
            splitSalvo = s.lerSplit();
            this.mapaSplitLado = splitSalvo.lado;
            this.mapaSplitRatio = splitSalvo.ratio;
        }
        instalarArrastoSplit.call(this);
        instalarDivisorSplit.call(this);
        const resultado = this.aplicarArea(s ? s.lerAreaAtiva() : 'pastas');
        if (splitSalvo && splitSalvo.ligado) aplicarSplit.call(this, true);
        return resultado;
    }

    /**
     * Fecha a ÁREA DE NOTAS (✕ `#notesModalClose`) — a MESMA regra dos DOIS botões de
     * fechar, cada um fechando a SUA área: `#mapaFechar` (ação `fechar-mapa`) fecha o
     * Mapa; esta fecha as Notas. Em LADO A LADO a área pedida sai e a OUTRA fica com a
     * tela; sozinha (sem a outra aberta ao lado), volta à TELA INICIAL de Pastas.
     * A nota é SALVA antes: se o salvamento falhar, nada fecha (o texto não se perde).
     */
    async function fecharAreaNotas() {
        const fechou = typeof this.closeNotesModal === 'function' ? await this.closeNotesModal() : true;
        if (fechou === false) return false;
        if (this.mapaSplit) {
            // O MAPA fica com a tela: sai do lado a lado SEM trocar de área (a área do mapa
            // continua ativa e a seção visível) — a Nota já foi fechada acima.
            aplicarSplit.call(this, false, { manter: 'mapa' });
        } else {
            // Não sobrou nada aberto: a tela inicial de Pastas (os cartões) é o destino.
            aplicarArea.call(this, 'pastas');
        }
        return true;
    }

    function installMapaMental(NotesPWA) {
        if (!NotesPWA || !NotesPWA.prototype) return false;
        Object.assign(NotesPWA.prototype, {
            mapaAreaMontada: false,
            mapaAreaOuvintesLigados: false,
            mapaAreasLigadas: false,
            mapaAreaAtiva: 'notas',
            mapaAbertaId: null,
            mapaFiltroPasta: 'todas',
            mapaChipMenu: null,
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
            mapaRefinandoLayout: null,
            mapaTransicaoTimer: null,
            mapaEstiloCopiado: null,
            mapaAtalhosAberto: false,
            mapaAtalhoCapturando: null,
            mapaAtalhoAviso: '',
            mapaMenuNo: null,
            mapaMenuCanvas: null,
            mapaBarraAberta: false,
            mapaMenuBarra: null,
            mapaBarrasColapsadas: false,
            mapaFullscreen: false,
            mapaFormatBarVisivel: false,
            mapaMotionVersion: 0,
            pastaAtiva: null,
            pastasAreaMontada: false,
            pastasAreaOuvintesLigados: false,
            mapaSplit: false,
            mapaSplitLado: 'esquerda',
            mapaSplitRatio: 0.5,
            mapaSplitArrasto: null,
            mapaSplitArrastoLigado: false,
            mapaSplitDivisorLigado: false,
            mapaSplitArrastoRatio: false,
            aplicarArea, inicializarAreasMapa, montarAreaMapa, aplicarTemaMapa, renderArea,
            garantirMapaSelecionado,
            definirViewport, salvarViewportAgora,
            mapaCriarFilhoDeNo, mapaCriarIrmaoDeNo, mapaCriarNoIndependente, mapaExcluirNo,
            mapaDuplicarNo, mapaCopiarNo, mapaRecortarNo, mapaColarNo,
            mapaMoverNoOrdem, mapaMoverNoPara, mapaMoverNoParaPai,
            mapaRecolherNo, mapaExpandirNo, mapaBloquearNo, mapaAjustarLargura,
            mapaDefinirLarguraNo, mapaFinalizarRedimensionarNo, mapaFinalizarArrastoNo,
            mapaCommitarTituloNo, mapaDesfazer: desfazer, mapaRefazer: refazer,
            mapaAbrirPainel, mapaFecharPainel, mapaAlternarConcluidoNo, mapaDefinirEmojiNo,
            mapaSalvarConteudoNo, mapaPedirAnexoNo, mapaRemoverAnexoNo, mapaDefinirLayout,
            mapaConfirmarLayout, mapaDefinirEspacamento, reposicionarSuave, garantirNoVisivel,
            mapaSalvarEstiloNo, mapaCopiarEstiloNo, mapaAplicarEstiloCopiadoNo, mapaRestaurarEstiloNo,
            mapaDefinirTema, mapaDefinirEstiloNivel, mapaLimparEstiloNivel,
            mapaAbrirAtalhos, mapaFecharAtalhos, mapaCapturarAtalho, mapaLigarAtalho, mapaRestaurarAtalhosPadrao,
            atualizarBotoesHistorico,
            mapaAbrirMenuNo, mapaAbrirMenuCanvas, mapaFecharMenus,
            mapaAlternarMenuBarra,
            fecharMenusFora, fecharMenusAbertos,
            mapaMoverBotaoBarra, mapaRestaurarBarra,
            mapaAlternarColapsoBarras, setMapaBarrasColapsadas, setMapaChipsColapsados,
            sincronizarColapsoArea, mapaSairTelaCheia,
            montarAreaPastas, renderPastas, abrirPasta,
            renderMapasNav, mapasDaPasta, mapaTemplates,
            criarMapaNoChip, renomearMapaNoChip, duplicarMapaNoChip, excluirMapaDoChip,
            abrirMenuMapa, abrirMenuMoverMapa, fecharMenuMapa,
            aplicarSplit, trocarLadoSplit, aplicarSplitRatio, fecharAreaNotas,
            mapaAlternarEstiloRapido, mapaDefinirEstiloRapido, mapaPassoEstiloRapido,
            mapaAbrirCor, mapaGravarCorRecente,
            mapaAlternarModoConexao, mapaCriarConexaoEntre, mapaCliqueConexaoNo,
            mapaAbrirMenuConexao, mapaFecharMenuConexao, mapaSalvarConexao, mapaRemoverConexao
        });
        return true;
    }
    // 🔄 [FIM: MAPA - ÁREA/ISOLAMENTO]

    global.installMapaMental = installMapaMental;
})(typeof window !== 'undefined' ? window : globalThis);
