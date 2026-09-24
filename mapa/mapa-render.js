// ============================================
// MAPA MENTAL - Renderização da área
// Tudo que desenha a área vive aqui; nada toca no motor de notas.
// Fase 1: shell + gestão de mapas (lista, filtros, pastas, raiz, templates,
// recentes e busca/ordenação). O canvas de nós chega nas fases 2 e 3.
// ============================================
(function (global) {
    'use strict';

    const criar = (tag, classe, texto) => {
        const elemento = document.createElement(tag);
        if (classe) elemento.className = classe;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    };

    /** Botão com ação de delegação (`data-mapa-acao`) + dados extras. */
    const botao = (classe, texto, acao, dados) => {
        const el = criar('button', classe, texto);
        el.type = 'button';
        if (acao) el.dataset.mapaAcao = acao;
        Object.assign(el.dataset, dados || {});
        return el;
    };

    const dataCurta = iso => {
        if (!iso) return '';
        const data = new Date(iso);
        return isNaN(data) ? '' : data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    };

    // 🔄 [INÍCIO: MAPA - SHELL DA ÁREA]
    /** Monta o esqueleto da área (topbar + formulário inline + superfície). */
    function montarShell(secao) {
        if (!secao) return null;
        secao.innerHTML = '';
        const shell = criar('div', 'mapa-shell');

        const topbar = criar('div', 'mapa-topbar');
        topbar.append(criar('h2', 'mapa-topbar-titulo', 'Mapa Mental'));

        const voltar = botao('mapa-btn', '‹ Mapas', 'voltar-lista');
        voltar.id = 'mapaVoltarLista';
        voltar.hidden = true;
        const tituloAtual = criar('span', 'mapa-titulo-atual', '');
        tituloAtual.id = 'mapaTituloAtual';
        tituloAtual.hidden = true;
        const espaco = criar('div', 'mapa-topbar-espaco');

        const busca = document.createElement('input');
        busca.type = 'search';
        busca.id = 'mapaBusca';
        busca.className = 'mapa-busca';
        busca.placeholder = 'Buscar mapa';
        busca.setAttribute('aria-label', 'Buscar mapa');

        const ordem = document.createElement('select');
        ordem.id = 'mapaOrdem';
        ordem.className = 'mapa-ordem';
        ordem.setAttribute('aria-label', 'Ordenar mapas');
        [['nome', 'Nome'], ['recente', 'Recente'], ['favorito', 'Favorito']].forEach(([valor, rotulo]) => {
            const opcao = document.createElement('option');
            opcao.value = valor;
            opcao.textContent = rotulo;
            ordem.append(opcao);
        });

        const arquivados = botao('mapa-btn', 'Arquivados', 'alternar-arquivados');
        arquivados.id = 'mapaMostrarArquivados';
        const novaPasta = botao('mapa-btn', 'Nova pasta', 'pasta-nova');
        const novo = botao('mapa-btn mapa-btn-primario', 'Novo mapa', 'novo');
        novo.id = 'mapaNovo';
        const templates = botao('mapa-btn', 'Templates', 'templates');
        templates.id = 'mapaTemplates';

        topbar.append(voltar, tituloAtual, espaco, busca, ordem, arquivados, novaPasta, novo, templates);

        const form = document.createElement('form');
        form.id = 'mapaForm';
        form.className = 'mapa-form';
        form.noValidate = true;
        form.hidden = true;

        const wrap = criar('div', 'mapa-canvas-wrap');
        wrap.id = 'mapaCanvasWrap';

        shell.append(topbar, form, wrap);
        secao.append(shell);
        return { shell, topbar, form, wrap };
    }
    // 🔄 [FIM: MAPA - SHELL DA ÁREA]

    // 🔄 [INÍCIO: MAPA - TOPBAR/FORMULÁRIO]
    /** Mostra/oculta os controles conforme a visão (lista x mapa aberto). */
    function atualizarShell(estado) {
        const lista = !estado.mapaAberto;
        const visivel = (id, mostrar) => { const el = document.getElementById(id); if (el) el.hidden = !mostrar; };
        visivel('mapaVoltarLista', !lista);
        visivel('mapaTituloAtual', !lista);
        visivel('mapaBusca', lista);
        visivel('mapaOrdem', lista);
        visivel('mapaMostrarArquivados', lista);
        visivel('mapaNovo', lista);
        visivel('mapaTemplates', lista);
        const titulo = document.getElementById('mapaTituloAtual');
        if (titulo) titulo.textContent = estado.mapaAberto ? (estado.mapaAberto.nome || 'Mapa') : '';
        const busca = document.getElementById('mapaBusca');
        if (busca && busca.value !== (estado.busca || '')) busca.value = estado.busca || '';
        const ordem = document.getElementById('mapaOrdem');
        if (ordem && ordem.value !== (estado.ordenacao || 'nome')) ordem.value = estado.ordenacao || 'nome';
        const arquivados = document.getElementById('mapaMostrarArquivados');
        if (arquivados) arquivados.setAttribute('aria-pressed', String(Boolean(estado.incluirArquivados)));
        const templates = document.getElementById('mapaTemplates');
        if (templates) templates.setAttribute('aria-pressed', String(Boolean(estado.mostrarTemplates)));
    }

    // Layouts de árvore (Fase 5): rótulo amigável por chave do modelo.
    const ROTULOS_LAYOUT = [
        ['bilateral', 'Bilateral'], ['tradicional', 'Tradicional'],
        ['esquerda-direita', 'Esquerda → direita'], ['direita-esquerda', 'Direita → esquerda'],
        ['arvore-vertical', 'Árvore vertical'], ['organograma', 'Organograma'], ['livre', 'Livre']
    ];

    const ROTULOS_FORM = {
        novo: 'Novo mapa', renomear: 'Renomear mapa', mover: 'Mover para pasta',
        conectar: 'Conectar a outro mapa', template: 'Salvar como template',
        'pasta-nova': 'Nova pasta', 'pasta-renomear': 'Renomear pasta', excluir: 'Excluir mapa',
        'no-mover-para': 'Mover nó para...', 'no-conectar-para': 'Conectar nó a...'
    };

    function selectPastas(acao, dados) {
        const select = document.createElement('select');
        select.id = 'mapaFormPasta';
        select.className = 'mapa-form-campo';
        select.setAttribute('aria-label', 'Pasta');
        const vazia = document.createElement('option');
        vazia.value = '';
        vazia.textContent = 'Sem pasta';
        select.append(vazia);
        ((dados && dados.pastas) || []).forEach(pasta => {
            const opcao = document.createElement('option');
            opcao.value = pasta.id;
            opcao.textContent = pasta.nome;
            select.append(opcao);
        });
        select.value = acao.tipo === 'mover' && dados.mapa ? (dados.mapa.pastaId || '') : '';
        return select;
    }

    function selectDestino(acao, dados) {
        const select = document.createElement('select');
        select.id = 'mapaFormDestino';
        select.className = 'mapa-form-campo';
        select.setAttribute('aria-label', 'Mapa de destino');
        const vazio = document.createElement('option');
        vazio.value = '';
        vazio.textContent = 'Escolha um mapa...';
        select.append(vazio);
        ((dados && dados.mapas) || [])
            .filter(m => m.id !== acao.id)
            .forEach(m => {
                const opcao = document.createElement('option');
                opcao.value = m.id;
                opcao.textContent = m.nome;
                select.append(opcao);
            });
        return select;
    }

    /** Select de nós (reparenting por menu). */
    function selectNos(acao, dados) {
        const select = document.createElement('select');
        select.id = 'mapaFormDestino';
        select.className = 'mapa-form-campo';
        select.setAttribute('aria-label', 'Nó de destino');
        const raiz = document.createElement('option');
        raiz.value = '';
        raiz.textContent = 'Raiz (sem pai)';
        select.append(raiz);
        ((dados && dados.nosMoverPara) || [])
            .filter(no => no.id !== acao.id)
            .forEach(no => {
                const opcao = document.createElement('option');
                opcao.value = no.id;
                opcao.textContent = '  '.repeat(Math.max(0, (no.nivel || 1) - 1)) + (no.nome || no.id);
                select.append(opcao);
            });
        return select;
    }

    /** Formulário inline (um por vez): novo, renomear, mover, conectar, template, pasta, excluir. */
    function renderForm(formEl, acao, dados) {
        if (!formEl) return;
        formEl.innerHTML = '';
        formEl.hidden = !acao;
        if (!acao) { formEl.removeAttribute('data-mapa-form'); return; }
        const mapa = (dados && dados.mapa) || null;
        formEl.dataset.mapaForm = acao.tipo;
        formEl.dataset.mapaId = acao.id || '';
        formEl.append(criar('span', 'mapa-form-titulo', ROTULOS_FORM[acao.tipo] || ''));
        if (acao.tipo === 'excluir') {
            formEl.append(criar('span', 'mapa-form-aviso', 'Excluir "' + (mapa ? mapa.nome : '') + '"? Esta ação apaga o mapa e seus dados.'));
            formEl.append(botao('mapa-btn mapa-btn-perigo', 'Sim, excluir', 'excluir-confirmar', { mapaId: acao.id }));
            formEl.append(botao('mapa-btn', 'Cancelar', 'form-cancelar'));
            return;
        }
        if (['novo', 'renomear', 'template', 'pasta-nova', 'pasta-renomear'].includes(acao.tipo)) {
            const nome = document.createElement('input');
            nome.type = 'text';
            nome.id = 'mapaFormNome';
            nome.className = 'mapa-form-campo';
            nome.placeholder = 'Nome';
            nome.setAttribute('aria-label', 'Nome');
            const prefill = (acao.tipo === 'renomear' || acao.tipo === 'template') && mapa
                ? mapa.nome
                : ((dados && dados.pasta) ? dados.pasta.nome : '');
            nome.value = prefill;
            formEl.append(nome);
        }
        if (['novo', 'mover'].includes(acao.tipo)) formEl.append(selectPastas(acao, dados));
        if (acao.tipo === 'conectar') formEl.append(selectDestino(acao, dados));
        if (acao.tipo === 'no-mover-para') formEl.append(selectNos(acao, dados));
        if (acao.tipo === 'no-conectar-para') formEl.append(selectNos(acao, dados));
        const confirmar = criar('button', 'mapa-btn mapa-btn-primario', 'Confirmar');
        confirmar.type = 'submit';
        formEl.append(confirmar);
        formEl.append(botao('mapa-btn', 'Cancelar', 'form-cancelar'));
    }
    // 🔄 [FIM: MAPA - TOPBAR/FORMULÁRIO]

    // 🔄 [INÍCIO: MAPA - MAPA ABERTO]
    const chipMapa = (id, nome) => botao('mapa-chip', nome || id, 'abrir', { mapaId: id });

    /** Vista de um mapa aberto: nome, conexões (nó-ponte/backlinks) e avisos. */
    function renderMapaAberto(wrap, dados) {
        if (!wrap) return;
        wrap.innerHTML = '';
        const mapa = dados.mapaAberto || {};
        const painel = criar('div', 'mapa-aberto');
        painel.append(criar('h3', 'mapa-aberto-nome', mapa.nome || 'Mapa'));
        painel.append(criar('p', 'mapa-aberto-meta',
            'Atualizado ' + dataCurta(mapa.dtAlterado) + ' · ' + (dados.qtdNos || 0) + ' tópico(s)'));

        const conexoes = criar('div', 'mapa-conexoes');
        conexoes.append(criar('span', 'mapa-conexoes-rotulo', 'Conectado a:'));
        const validas = [...(dados.saidas || [])];
        (dados.backlinks || []).forEach(bl => {
            if (!validas.some(c => c.idMapa === bl.idMapa)) validas.push(bl);
        });
        if (!validas.length) conexoes.append(criar('span', 'mapa-vazio-dica', 'nenhum mapa'));
        validas.forEach(item => conexoes.append(chipMapa(item.idMapa, item.nome)));
        (dados.referenciasQuebradas || []).forEach(id => {
            const chip = criar('span', 'mapa-chip mapa-chip-quebrado', 'Referência quebrada');
            chip.title = id;
            conexoes.append(chip);
        });
        conexoes.append(botao('mapa-btn', 'Conectar a mapa...', 'conectar'));
        painel.append(conexoes);

        const acoes = criar('div', 'mapa-aberto-acoes');
        acoes.append(botao('mapa-btn', 'Salvar como template', 'template-salvar', { mapaId: mapa.id }));
        painel.append(acoes);
        painel.append(controlesCanvas(dados));
        // Painel de propriedades do nó (Fase 4) — só quando aberto.
        const moduloPainel = global.MapaMentalPainel;
        if (moduloPainel && dados.painelNo) {
            const elPainel = moduloPainel.montarPainel(dados.painelNo, dados);
            if (elPainel) painel.append(elPainel);
        }
        // Menu contextual da conexão (Fase 6) — só quando uma aresta está selecionada.
        if (dados.conexaoMenu) {
            const menu = menuConexao(dados.conexaoMenu, dados);
            if (menu) painel.append(menu);
        }
        painel.append(acoesNo(dados));
        painel.append(canvasInfinito(dados.grafo, dados));
        wrap.append(painel);
        // Conexões (Fase 6): desenha após o DOM existir (mede os nós reais).
        desenharConexoes(document.getElementById('mapaConexoesSvg'), dados.grafo);
        // Mapa vazio: deixa o canvas pronto para o atalho Enter criar o primeiro tópico.
        if (!((dados.grafo && dados.grafo.nos) || []).length) {
            const interacao = global.MapaMentalInteracao;
            if (interacao && interacao.focarCanvas) interacao.focarCanvas.call(this);
        }
    }

    /** Barra de controles do canvas (zoom, enquadramento, raiz e recolher/expandir). */
    function controlesCanvas(dados) {
        const grafo = (dados && dados.grafo) || null;
        const controles = criar('div', 'mapa-canvas-controles');
        // Ação principal SEMPRE visível: sem nós não existe barra de ações de nó,
        // então é por aqui que se cria o primeiro tópico do mapa.
        const novoTopico = botao('mapa-btn mapa-btn-primario', 'Novo tópico', 'no-independente');
        novoTopico.id = 'mapaNovoTopico';
        controles.append(novoTopico);
        const menos = botao('mapa-btn mapa-canvas-btn', '−', 'zoom-out');
        menos.setAttribute('aria-label', 'Diminuir zoom');
        const mais = botao('mapa-btn mapa-canvas-btn', '+', 'zoom-in');
        mais.setAttribute('aria-label', 'Aumentar zoom');
        const rotulo = criar('span', 'mapa-zoom-atual', '100%');
        rotulo.id = 'mapaZoomAtual';
        controles.append(menos, rotulo, mais);
        // Seletor de layout em árvore (Fase 5).
        const layoutSel = document.createElement('select');
        layoutSel.id = 'mapaLayout';
        layoutSel.className = 'mapa-ordem';
        layoutSel.setAttribute('aria-label', 'Layout do mapa');
        ROTULOS_LAYOUT.forEach(([valor, texto]) => {
            const opcao = document.createElement('option');
            opcao.value = valor;
            opcao.textContent = texto;
            layoutSel.append(opcao);
        });
        layoutSel.value = (grafo && grafo.layout) || 'bilateral';
        controles.append(layoutSel);
        controles.append(botao('mapa-btn', 'Centralizar', 'centralizar'));
        controles.append(botao('mapa-btn', 'Ajustar à tela', 'fit'));
        controles.append(botao('mapa-btn', 'Ir para a raiz', 'ir-raiz'));
        controles.append(botao('mapa-btn', 'Recolher tudo', 'recolher-tudo'));
        controles.append(botao('mapa-btn', 'Expandir tudo', 'expandir-tudo'));
        // Modo "Conectar nós" (Fase 6): 1º clique = origem, 2º = destino.
        const conectar = botao('mapa-btn', 'Conectar nós', 'conectar-nos');
        conectar.id = 'mapaModoConexao';
        conectar.setAttribute('aria-pressed', String(Boolean(dados && dados.modoConexao)));
        controles.append(conectar);
        return controles;
    }

    /** Barra de ações dos nós selecionados. */
    function acoesNo(dados) {
        const barra = criar('div', 'mapa-no-acoes');
        const selecionados = (dados && dados.selecionados) || new Set();
        barra.hidden = selecionados.size === 0;
        const botoes = [
            ['no-filho', 'Filho'], ['no-irmao', 'Irmão'], ['no-independente', 'Independente'],
            ['no-editar', 'Editar'], ['no-propriedades', 'Propriedades'], ['no-concluir', 'Concluir'],
            ['no-conectar-para', 'Conectar a…'],
            ['no-excluir', 'Excluir'], ['no-duplicar', 'Duplicar'],
            ['no-copiar', 'Copiar'], ['no-recortar', 'Recortar'], ['no-colar', 'Colar'],
            ['no-subir', 'Subir'], ['no-descer', 'Descer'], ['no-mover-para', 'Mover para...'],
            ['no-recolher', 'Recolher'], ['no-expandir', 'Expandir'], ['no-bloquear', 'Bloquear'],
            ['no-largura-menos', 'Largura −'], ['no-largura-mais', 'Largura +'], ['no-desfazer', 'Desfazer']
        ];
        botoes.forEach(([acao, rotulo]) => barra.append(botao('mapa-btn mapa-no-btn', rotulo, acao)));
        return barra;
    }

    /** Um nó no canvas: texto, alternador de ramo, cadeado e alça de redimensionar. */
    function noCanvas(no, contexto) {
        const dados = contexto || {};
        const selecionados = dados.selecionados || new Set();
        const elemento = criar('div', 'mapa-no');
        elemento.dataset.mapaNoId = no.id;
        const posicao = no.posicao || { x: 0, y: 0 };
        elemento.style.left = posicao.x + 'px';
        elemento.style.top = posicao.y + 'px';
        if (Number(no.largura) > 0) elemento.style.width = Number(no.largura) + 'px';
        if (no.bloqueado) elemento.classList.add('mapa-no-bloqueado');
        if (no.colapsado) elemento.classList.add('mapa-no-recolhido');
        if (selecionados.has(no.id)) elemento.classList.add('mapa-selecionado');
        elemento.setAttribute('role', 'treeitem');
        elemento.setAttribute('aria-selected', String(selecionados.has(no.id)));
        elemento.setAttribute('aria-level', String((dados.niveis && dados.niveis.get(no.id)) || 1));
        if (no.bloqueado) elemento.title = 'Nó bloqueado (edição e movimento impedidos)';

        // Conteúdo (Fase 4): estado vira classe visual e o nível vira dado para acessibilidade.
        if (no.prioridade) elemento.classList.add('mapa-no-prioridade-' + no.prioridade);
        if (no.status) elemento.classList.add('mapa-no-status-' + no.status);
        if (no.concluido) elemento.classList.add('mapa-no-concluido');
        if (no.mapaRef) elemento.classList.add('mapa-no-ponte');
        elemento.dataset.mapaNivel = String((dados.niveis && dados.niveis.get(no.id)) || 1);
        if (no.prazo) elemento.title = 'Prazo: ' + no.prazo;

        if (dados.comFilhos && dados.comFilhos.has(no.id)) {
            elemento.setAttribute('aria-expanded', String(!no.colapsado));
            const alternador = botao('mapa-no-toggle', no.colapsado ? '▸' : '▾', 'no-recolher', { mapaNoId: no.id });
            alternador.setAttribute('aria-label', no.colapsado ? 'Expandir ramificação' : 'Recolher ramificação');
            elemento.append(alternador);
        }

        // Prefixo: emoji/ícone ou caixa de tarefa clicável.
        const prefixo = no.emoji || no.icone;
        if (prefixo) {
            const marca = criar('span', 'mapa-no-icone', prefixo);
            marca.setAttribute('aria-hidden', 'true');
            elemento.append(marca);
        } else if (no.tarefa) {
            const caixa = botao('mapa-no-check', no.concluido ? '☑' : '☐', 'no-concluir', { mapaNoId: no.id });
            caixa.setAttribute('aria-label', no.concluido ? 'Marcar como não concluída' : 'Marcar como concluída');
            caixa.setAttribute('aria-pressed', String(Boolean(no.concluido)));
            elemento.append(caixa);
        }

        elemento.append(criar('span', 'mapa-no-texto', no.titulo || '(sem título)'));

        if (Array.isArray(no.tags) && no.tags.length) {
            const tags = criar('span', 'mapa-no-tags');
            no.tags.forEach(tag => tags.append(criar('span', 'mapa-no-tag', '#' + tag)));
            elemento.append(tags);
        }

        if (no.mapaRef) {
            const ponte = botao('mapa-no-ponte-icone', '🗺️', 'ponte-abrir', { mapaRef: no.mapaRef });
            ponte.title = 'Abrir mapa conectado';
            ponte.setAttribute('aria-label', 'Abrir mapa conectado');
            elemento.append(ponte);
        }

        if (no.bloqueado) {
            const cadeado = criar('span', 'mapa-no-cadeado', '🔒');
            cadeado.setAttribute('aria-hidden', 'true');
            elemento.append(cadeado);
        }

        const alca = criar('span', 'mapa-no-resize', '');
        alca.dataset.mapaRedimensionar = no.id;
        alca.title = 'Redimensionar (múltiplos de 8px)';
        elemento.append(alca);
        return elemento;
    }

    /** Canvas infinito: mundo com transform + nós visíveis + laço de seleção + minimapa. */
    function canvasInfinito(grafo, contexto) {
        const dados = contexto || {};
        const canvas = criar('div', 'mapa-canvas');
        canvas.id = 'mapaCanvas';
        canvas.tabIndex = 0;
        canvas.setAttribute('role', 'application');
        canvas.setAttribute('aria-keyshortcuts', 'Enter Tab Insert F2 Delete');
        canvas.setAttribute('aria-label', 'Área de trabalho do mapa');

        const mundo = criar('div', 'mapa-mundo');
        mundo.id = 'mapaMundo';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'mapaConexoesSvg';
        svg.setAttribute('class', 'mapa-conexoes-svg');
        svg.setAttribute('aria-hidden', 'true');
        mundo.append(svg);

        const nos = criar('div', 'mapa-nos');
        nos.id = 'mapaNos';
        nos.setAttribute('role', 'tree');
        nos.setAttribute('aria-label', 'Tópicos do mapa');
        const visiveis = dados.visiveis || (grafo && grafo.nos) || [];
        visiveis.forEach(no => nos.append(noCanvas(no, dados)));
        mundo.append(nos);
        canvas.append(mundo);

        const laco = criar('div', 'mapa-laco');
        laco.id = 'mapaLaco';
        laco.hidden = true;
        canvas.append(laco);

        const minimapa = document.createElement('button');

        minimapa.type = 'button';
        minimapa.id = 'mapaMinimapa';
        minimapa.className = 'mapa-minimapa';
        minimapa.dataset.mapaAcao = 'minimapa-navegar';
        minimapa.setAttribute('aria-label', 'Minimapa (clique para navegar)');
        const mmMundo = criar('span', 'mapa-minimapa-mundo', '');
        mmMundo.id = 'mapaMinimapaMundo';
        const mmViewport = criar('span', 'mapa-minimapa-viewport', '');
        mmViewport.id = 'mapaMinimapaViewport';
        minimapa.append(mmMundo, mmViewport);
        canvas.append(minimapa);

        // Estado vazio: mapa recém-criado não tem nós — sem isto, não há como começar.
        if (!(((grafo && grafo.nos) || []).length)) {
            const vazio = criar('div', 'mapa-canvas-vazio');
            vazio.append(criar('p', 'mapa-canvas-vazio-titulo', 'Mapa vazio'));
            vazio.append(criar('p', 'mapa-canvas-vazio-dica',
                'Crie o primeiro tópico e comece a digitar. Atalhos: Enter = irmão, Tab = filho, F2 = editar.'));
            vazio.append(botao('mapa-btn mapa-btn-primario', 'Criar primeiro tópico', 'no-independente'));
            canvas.append(vazio);
        }
        return canvas;
    }
    // 🔄 [FIM: MAPA - MAPA ABERTO]

    // 🔄 [INÍCIO: MAPA - GESTÃO (LISTA)]
    function chipFiltro(rotulo, valor, ativo) {
        const chip = botao('mapa-chip', rotulo, 'filtrar-pasta', { mapaPasta: valor });
        if (ativo) chip.classList.add('mapa-chip-ativo');
        chip.setAttribute('aria-pressed', String(Boolean(ativo)));
        return chip;
    }

    function menuAcoes(mapa) {
        const acoes = criar('div', 'mapa-item-acoes');
        [['renomear', 'Renomear'], ['duplicar', 'Duplicar'], ['mover', 'Mover'], ['excluir', 'Excluir']]
            .forEach(([acao, rotulo]) => acoes.append(botao('mapa-item-acao', rotulo, acao, { mapaId: mapa.id })));
        return acoes;
    }

    function itemMapa(mapa, dados) {
        const item = criar('li', 'mapa-item');
        item.dataset.mapaId = mapa.id;
        if (mapa.arquivado) item.classList.add('mapa-item-arquivado');
        if (dados.raizId === mapa.id) item.classList.add('mapa-item-raiz');

        const abrir = botao('mapa-item-abrir', '', 'abrir', { mapaId: mapa.id });
        abrir.append(criar('span', 'mapa-item-nome', mapa.nome || '(sem nome)'));
        const meta = [];
        if (dados.raizId === mapa.id) meta.push('Raiz');
        meta.push(mapa.pastaNome || 'Sem pasta');
        meta.push('Atualizado ' + dataCurta(mapa.dtAlterado));
        abrir.append(criar('span', 'mapa-item-meta', meta.join(' · ')));
        item.append(abrir);

        const estrela = botao('mapa-item-acao', mapa.favorito ? '★' : '☆', 'favoritar', { mapaId: mapa.id });
        estrela.setAttribute('aria-pressed', String(Boolean(mapa.favorito)));
        estrela.setAttribute('aria-label', mapa.favorito ? 'Remover dos favoritos' : 'Favoritar');
        estrela.title = estrela.getAttribute('aria-label');

        const arquivar = botao('mapa-item-acao', mapa.arquivado ? 'Desarquivar' : 'Arquivar', 'arquivar', { mapaId: mapa.id });
        const raiz = botao('mapa-item-acao', dados.raizId === mapa.id ? 'Remover raiz' : 'Definir raiz', 'raiz', { mapaId: mapa.id });
        item.append(estrela, arquivar, raiz, menuAcoes(mapa));
        return item;
    }
    // 🔄 [FIM: MAPA - GESTÃO (LISTA)]

    // 🔄 [INÍCIO: MAPA - RECENTES/TEMPLATES/LISTA]
    function blocoRecentes(dados) {
        const bloco = criar('div', 'mapa-recentes');
        bloco.append(criar('span', 'mapa-recentes-rotulo', 'Recentes:'));
        (dados.recentes || []).forEach(r => bloco.append(botao('mapa-chip', r.nome, 'abrir', { mapaId: r.idMapa })));
        return bloco;
    }

    function painelTemplates(dados) {
        const painel = criar('div', 'mapa-templates');
        painel.append(criar('span', 'mapa-templates-rotulo', 'Templates prontos:'));
        (dados.templatesProntos || []).forEach(tpl =>
            painel.append(botao('mapa-chip', tpl.nome, 'aplicar-pronto', { mapaTemplate: tpl.id })));
        painel.append(criar('span', 'mapa-templates-rotulo', 'Meus templates:'));
        const salvos = dados.templatesSalvos || [];
        if (!salvos.length) painel.append(criar('span', 'mapa-vazio-dica', 'nenhum'));
        salvos.forEach(tpl => {
            painel.append(botao('mapa-chip', tpl.nome, 'aplicar-salvo', { mapaTemplate: tpl.id }));
            painel.append(botao('mapa-chip mapa-chip-acao', '✕', 'template-excluir', { mapaTemplate: tpl.id }));
        });
        return painel;
    }

    /** Lista de gestão: filtros, recentes, templates e os itens de mapa. */
    function renderGestao(wrap, dados) {
        if (!wrap) return;
        wrap.innerHTML = '';
        const pagina = criar('div', 'mapa-lista');

        const chips = criar('div', 'mapa-chips');
        chips.append(chipFiltro('Todas', 'todas', dados.filtroPasta === 'todas'));
        chips.append(chipFiltro('Favoritos', 'favoritos', dados.filtroPasta === 'favoritos'));
        chips.append(chipFiltro('Sem pasta', 'sem-pasta', dados.filtroPasta === 'sem-pasta'));
        (dados.pastas || []).forEach(pasta => {
            const chip = chipFiltro(pasta.nome, pasta.id, dados.filtroPasta === pasta.id);
            chip.append(botao('mapa-chip-acao', '✎', 'pasta-renomear', { mapaPasta: pasta.id }));
            chip.append(botao('mapa-chip-acao', '✕', 'pasta-excluir', { mapaPasta: pasta.id }));
            chips.append(chip);
        });
        pagina.append(chips);

        if (dados.mostrarTemplates) pagina.append(painelTemplates(dados));
        if ((dados.recentes || []).length) pagina.append(blocoRecentes(dados));

        const itens = dados.mapas || [];
        if (!itens.length) {
            const vazio = criar('div', 'mapa-vazio');
            vazio.append(criar('p', 'mapa-vazio-titulo', 'Nenhum mapa encontrado.'));
            vazio.append(criar('p', 'mapa-vazio-dica', 'Crie seu primeiro mapa para começar.'));
            pagina.append(vazio);
        } else {
            const lista = criar('ul', 'mapa-itens');
            itens.forEach(mapa => lista.append(itemMapa(mapa, dados)));
            pagina.append(lista);
        }
        wrap.append(pagina);
    }
    // 🔄 [FIM: MAPA - RECENTES/TEMPLATES/LISTA]

    /** Atualiza a marcação de seleção sem redesenhar o canvas. */
    function atualizarSelecao(selecionados) {
        const conj = selecionados || new Set();
        document.querySelectorAll('#mapaNos .mapa-no').forEach(elemento => {
            const marcado = conj.has(elemento.dataset.mapaNoId);
            elemento.classList.toggle('mapa-selecionado', marcado);
            elemento.setAttribute('aria-selected', String(marcado));
        });
        const barra = document.querySelector('#mapaCanvasWrap .mapa-no-acoes');
        if (barra) barra.hidden = conj.size === 0;
    }

    /** Atualiza um nó específico (arrasto/redimensionar) sem redesenhar o canvas. */
    function atualizarNo(no) {
        if (!no) return;
        const elemento = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + no.id + '"]');
        if (!elemento) return;
        const posicao = no.posicao || { x: 0, y: 0 };
        elemento.style.left = posicao.x + 'px';
        elemento.style.top = posicao.y + 'px';
        if (Number(no.largura) > 0) elemento.style.width = Number(no.largura) + 'px';
    }

    /** Marca o tema atual na área (o visual vem do CSS via html[data-theme]). */
    function aplicarTema(secao) {
        if (!secao) return;
        secao.dataset.mapaTema = document.documentElement.dataset.theme || 'light';
    }

    // 🔄 [INÍCIO: MAPA - CONEXÕES (FASE 6)]
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const LARGURA_CONEXAO_NO = 180;
    const ALTURA_CONEXAO_NO = 44;

    /** Caixa "mundo" de cada nó (mede o DOM quando possível; senão usa defaults). */
    function dimensoesNos(grafo) {
        const mapa = new Map();
        ((grafo && grafo.nos) || []).forEach(no => {
            const el = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + no.id + '"]');
            const largura = el && el.offsetWidth ? el.offsetWidth : (Number(no.largura) > 0 ? Number(no.largura) : LARGURA_CONEXAO_NO);
            const altura = el && el.offsetHeight ? el.offsetHeight : ALTURA_CONEXAO_NO;
            const posicao = no.posicao || { x: 0, y: 0 };
            mapa.set(no.id, {
                x: posicao.x, y: posicao.y, largura, altura,
                cx: posicao.x + largura / 2, cy: posicao.y + altura / 2,
                // Só desenhamos arestas entre nós RENDERIZADOS (ramos recolhidos ficam ocultos).
                visivel: Boolean(el)
            });
        });
        return mapa;
    }

    /** Traçado da aresta entre dois nós, conforme o tipo de linha. */
    function caminhoConexao(origem, destino, tipo) {
        const ax = origem.x + origem.largura;
        const ay = origem.y + origem.altura / 2;
        const bx = destino.x;
        const by = destino.y + destino.altura / 2;
        const meioX = (ax + bx) / 2;
        const meioY = (ay + by) / 2;
        if (tipo === 'reta') {
            return { d: 'M' + ax + ' ' + ay + ' L' + bx + ' ' + by, mx: meioX, my: meioY };
        }
        if (tipo === 'ortogonal') {
            return {
                d: 'M' + ax + ' ' + ay + ' L' + meioX + ' ' + ay + ' L' + meioX + ' ' + by + ' L' + bx + ' ' + by,
                mx: meioX, my: meioY
            };
        }
        return { d: 'M' + ax + ' ' + ay + ' C' + meioX + ' ' + ay + ' ' + meioX + ' ' + by + ' ' + bx + ' ' + by, mx: meioX, my: meioY };
    }

    const idMarcador = cor => 'mapa-seta-' + String(cor || 'padrao').replace(/[^0-9a-z]/gi, '');

    /**
     * Ramo pai→filho (a ligação da hierarquia): sai da borda do pai mais próxima do filho
     * e entra na borda oposta do filho, com curva suave (estilo mapa mental).
     */
    function caminhoRamo(pai, filho, verticalDeclarado) {
        const dx = filho.cx - pai.cx;
        const dy = filho.cy - pai.cy;
        // Fluxo vertical (organograma/árvore vertical): sai por baixo (ou por cima).
        // Com nó arrastado para o lado (dy pequeno), volta ao fluxo horizontal.
        const fluxoVertical = verticalDeclarado
            ? Math.abs(dy) >= 16
            : Math.abs(dy) > Math.abs(dx);
        if (fluxoVertical) {
            const abaixo = dy >= 0;
            const ax = pai.x + pai.largura / 2;
            const ay = abaixo ? pai.y + pai.altura : pai.y;
            const bx = filho.x + filho.largura / 2;
            const by = abaixo ? filho.y : filho.y + filho.altura;
            const curva = Math.max(24, Math.abs(by - ay) / 2);
            const c = abaixo ? ay + curva : ay - curva;
            return 'M' + ax + ' ' + ay + ' C' + ax + ' ' + c + ' ' + bx + ' ' + c + ' ' + bx + ' ' + by;
        }
        // Fluxo horizontal: sai da borda do pai mais próxima do filho.
        const filhoAEsquerda = filho.cx < pai.cx;
        const ax = filhoAEsquerda ? pai.x : pai.x + pai.largura;
        const ay = pai.y + pai.altura / 2;
        const bx = filhoAEsquerda ? filho.x + filho.largura : filho.x;
        const by = filho.y + filho.altura / 2;
        const curva = Math.max(24, Math.abs(bx - ax) / 2);
        const c1 = filhoAEsquerda ? ax - curva : ax + curva;
        return 'M' + ax + ' ' + ay + ' C' + c1 + ' ' + ay + ' ' + c1 + ' ' + by + ' ' + bx + ' ' + by;
    }

    /** Desenha as RAMIFICAÇÕES (pai→filho) e as conexões livres no SVG (overlay do layout). */
    function desenharConexoes(svg, grafo) {
        if (!svg || !grafo) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        const dim = dimensoesNos(grafo);
        // Fallback: se nenhum nó foi encontrado no DOM (medida antes de montar), considera visível.
        const nenhumMedido = [...dim.values()].every(item => !item.visivel);
        const visivel = item => Boolean(item) && (nenhumMedido || item.visivel);

        // 1) Ramificações da hierarquia — sempre desenhadas (é a ligação pai→filho).
        const fluxoVertical = grafo.layout === 'arvore-vertical' || grafo.layout === 'organograma';
        const ramos = document.createElementNS(SVG_NS, 'g');
        ramos.setAttribute('class', 'mapa-ramos');
        ((grafo.nos) || []).forEach(no => {
            const pai = dim.get(no.paiId);
            const filho = dim.get(no.id);
            if (!visivel(pai) || !visivel(filho)) return;
            const ramo = document.createElementNS(SVG_NS, 'path');
            ramo.setAttribute('d', caminhoRamo(pai, filho, fluxoVertical));
            ramo.setAttribute('class', 'mapa-ramo');
            ramo.setAttribute('fill', 'none');
            ramo.dataset.mapaRamo = no.id;
            ramos.append(ramo);
        });
        svg.append(ramos);

        // 2) Conexões livres (Fase 6) — traçadas por cima das ramificações.
        const lista = (grafo.conexoes || []);
        if (!lista.length) return;

        const defs = document.createElementNS(SVG_NS, 'defs');
        const cores = new Set();
        lista.forEach(cx => cores.add(cx.cor || '#94A3B8'));
        cores.forEach(cor => {
            const marker = document.createElementNS(SVG_NS, 'marker');
            marker.setAttribute('id', idMarcador(cor));
            marker.setAttribute('viewBox', '0 0 10 10');
            marker.setAttribute('refX', '9');
            marker.setAttribute('refY', '5');
            marker.setAttribute('markerWidth', '7');
            marker.setAttribute('markerHeight', '7');
            marker.setAttribute('orient', 'auto-start-reverse');
            const ponta = document.createElementNS(SVG_NS, 'path');
            ponta.setAttribute('d', 'M0 0 L10 5 L0 10 z');
            ponta.setAttribute('fill', cor);
            marker.append(ponta);
            defs.append(marker);
        });
        svg.append(defs);

        lista.forEach(cx => {
            const origem = dim.get(cx.de);
            const destino = dim.get(cx.para);
            if (!visivel(origem) || !visivel(destino)) return;
            const geo = caminhoConexao(origem, destino, cx.tipoLinha);
            const cor = cx.cor || '#94A3B8';
            const grupo = document.createElementNS(SVG_NS, 'g');
            grupo.setAttribute('class', 'mapa-conexao');
            grupo.dataset.mapaCxId = cx.id;

            const hit = document.createElementNS(SVG_NS, 'path');
            hit.setAttribute('d', geo.d);
            hit.setAttribute('class', 'mapa-conexao-hit');
            hit.dataset.mapaAcao = 'cx-menu';
            hit.dataset.mapaCxId = cx.id;
            grupo.append(hit);

            const linha = document.createElementNS(SVG_NS, 'path');
            linha.setAttribute('d', geo.d);
            linha.setAttribute('class', 'mapa-conexao-linha');
            linha.setAttribute('fill', 'none');
            linha.setAttribute('stroke', cor);
            linha.setAttribute('stroke-width', String(cx.espessura || 2));
            if (!cx.direcionada) {
                linha.setAttribute('stroke-dasharray', '6 4');
            } else if (cx.estiloSeta === 'fim' || cx.estiloSeta === 'ambos') {
                linha.setAttribute('marker-end', 'url(#' + idMarcador(cor) + ')');
            }
            if (cx.direcionada && (cx.estiloSeta === 'inicio' || cx.estiloSeta === 'ambos')) {
                linha.setAttribute('marker-start', 'url(#' + idMarcador(cor) + ')');
            }
            grupo.append(linha);

            if (cx.texto) {
                const texto = document.createElementNS(SVG_NS, 'text');
                texto.setAttribute('x', String(geo.mx));
                texto.setAttribute('y', String(geo.my - 4));
                texto.setAttribute('class', 'mapa-conexao-texto');
                texto.setAttribute('text-anchor', 'middle');
                texto.textContent = cx.texto;
                grupo.append(texto);
            }
            svg.append(grupo);
        });
    }

    /** Redesenha o SVG de conexões (usado no render e durante o arrasto). */
    function atualizarConexoes(grafo) {
        const svg = document.getElementById('mapaConexoesSvg');
        if (svg) desenharConexoes(svg, grafo);
    }

    const linhaCx = (tag, id, rotulo) => {
        const wrap = criar('label', 'mapa-painel-campo');
        wrap.append(criar('span', 'mapa-painel-rotulo', rotulo));
        const input = document.createElement(tag);
        input.id = id;
        input.name = id;
        input.className = 'mapa-painel-entrada';
        wrap.append(input);
        return { wrap, input };
    };

    /** Menu contextual de uma conexão livre (rótulo, direção, linha, espessura, cor, seta). */
    function menuConexao(cx, contexto) {
        if (!cx) return null;
        const nos = ((contexto && contexto.grafo && contexto.grafo.nos) || []);
        const nome = id => {
            const no = nos.find(item => item.id === id);
            return no ? (no.titulo || '(sem título)') : id;
        };
        const caixa = criar('section', 'mapa-cx-menu');
        caixa.id = 'mapaConexaoMenu';
        const topo = criar('div', 'mapa-painel-topo');
        topo.append(criar('h3', 'mapa-painel-titulo', nome(cx.de) + ' → ' + nome(cx.para)));
        topo.append(botao('mapa-btn mapa-no-btn', 'Fechar', 'cx-fechar'));
        caixa.append(topo);

        const form = document.createElement('form');
        form.id = 'mapaConexaoForm';
        form.className = 'mapa-painel-form';
        form.noValidate = true;
        form.dataset.mapaForm = 'cx-editar';
        form.dataset.mapaCxId = cx.id;

        const cTexto = linhaCx('input', 'mapaCxTexto', 'Rótulo da conexão');
        cTexto.input.value = cx.texto || '';
        form.append(cTexto.wrap);

        const linhaA = criar('div', 'mapa-painel-meta');
        const cTipo = linhaCx('select', 'mapaCxTipo', 'Tipo de linha');
        [['reta', 'Reta'], ['curva', 'Curva'], ['ortogonal', 'Ortogonal']].forEach(([v, t]) => {
            const op = document.createElement('option'); op.value = v; op.textContent = t; cTipo.input.append(op);
        });
        cTipo.input.value = cx.tipoLinha || 'curva';
        const cSeta = linhaCx('select', 'mapaCxSeta', 'Setas');
        [['nenhuma', 'Nenhuma'], ['fim', 'No destino'], ['inicio', 'Na origem'], ['ambos', 'Ambas']].forEach(([v, t]) => {
            const op = document.createElement('option'); op.value = v; op.textContent = t; cSeta.input.append(op);
        });
        cSeta.input.value = cx.estiloSeta || 'fim';
        linhaA.append(cTipo.wrap, cSeta.wrap);
        form.append(linhaA);

        const linhaB = criar('div', 'mapa-painel-meta');
        const cCor = linhaCx('input', 'mapaCxCor', 'Cor');
        cCor.input.type = 'color';
        cCor.input.value = cx.cor || '#0071e3';
        const cEsp = linhaCx('input', 'mapaCxEspessura', 'Espessura (1-8)');
        cEsp.input.type = 'number';
        cEsp.input.min = '1';
        cEsp.input.max = '8';
        cEsp.input.value = String(cx.espessura || 2);
        const cDirec = criar('label', 'mapa-painel-toggle');
        const ckDirec = document.createElement('input');
        ckDirec.type = 'checkbox';
        ckDirec.id = 'mapaCxDirecionada';
        ckDirec.name = 'mapaCxDirecionada';
        ckDirec.checked = cx.direcionada !== false;
        cDirec.append(ckDirec, criar('span', '', 'Direcionada'));
        linhaB.append(cCor.wrap, cEsp.wrap, cDirec);
        form.append(linhaB);

        const acoes = criar('div', 'mapa-painel-acoes');
        const salvar = criar('button', 'mapa-btn mapa-btn-primario', 'Salvar conexão');
        salvar.type = 'submit';
        acoes.append(salvar);
        acoes.append(botao('mapa-btn mapa-btn-perigo', 'Remover', 'cx-remover', { mapaCxId: cx.id }));
        acoes.append(botao('mapa-btn', 'Cancelar', 'cx-fechar'));
        form.append(acoes);

        caixa.append(form);
        return caixa;
    }
    // 🔄 [FIM: MAPA - CONEXÕES (FASE 6)]

    global.MapaMentalRender = {
        montarShell, atualizarShell, renderForm, renderGestao, renderMapaAberto,
        atualizarSelecao, atualizarNo, aplicarTema, dataCurta,
        desenharConexoes, atualizarConexoes, caminhoConexao, caminhoRamo, dimensoesNos, menuConexao
    };
})(typeof window !== 'undefined' ? window : globalThis);
