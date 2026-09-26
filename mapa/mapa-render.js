// ============================================
// MAPA MENTAL - Renderização da área
// Tudo que desenha a área vive aqui; nada toca no motor de notas.
// A área de mapas mostra SÓ o mapa aberto + a faixa de chips dos mapas da pasta
// ativa (mesmas classes dos chips de Notas). Não existe mais lista de gestão.
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

    /** Campo numérico rotulado (controles do canvas — Fase 8). */
    const campoNumero = (id, rotulo, valor, maximo) => {
        const wrap = criar('label', 'mapa-campo-numero');
        wrap.append(criar('span', 'mapa-campo-numero-rotulo', rotulo));
        const input = document.createElement('input');
        input.type = 'number';
        input.id = id;
        input.min = '0';
        input.max = String(maximo || 400);
        input.step = '4';
        input.value = String(Number(valor) || 0);
        input.setAttribute('aria-label', rotulo);
        wrap.append(input);
        return wrap;
    };

    /** Campo de cor rotulado (controles de estilo do mapa — Fase 9). */
    const campoCor = (id, rotulo, valor) => {
        const wrap = criar('label', 'mapa-campo-cor');
        wrap.append(criar('span', 'mapa-campo-numero-rotulo', rotulo));
        const input = document.createElement('input');
        input.type = 'color';
        input.id = id;
        input.value = /^#[0-9a-f]{6}$/i.test(valor || '') ? valor : '#4cc9f0';
        input.setAttribute('aria-label', rotulo);
        wrap.append(input);
        return wrap;
    };

    // 🔄 [INÍCIO: MAPA - SHELL DA ÁREA]
    /** Monta o esqueleto da área (topbar + formulário inline + superfície). */
    function montarShell(secao) {
        if (!secao) return null;
        secao.innerHTML = '';
        const shell = criar('div', 'mapa-shell');

        const topbar = criar('div', 'mapa-topbar app-vidro-barra');
        topbar.append(criar('h2', 'mapa-topbar-titulo', 'Mapa Mental'));

        // O título fica AO LADO da seta ‹ (igual a Notas). A navegação da área usa a
        // MESMA seta fixa (#appVoltar, topo-esquerdo), que volta à tela principal de
        // Pastas (cada pasta é um workspace com as áreas de Notas e de Mapas).
        const tituloAtual = criar('span', 'mapa-titulo-atual', '');
        tituloAtual.id = 'mapaTituloAtual';
        tituloAtual.hidden = true;
        const espaco = criar('div', 'mapa-topbar-espaco');

        // Botão de COLAPSO das barras (mesma lógica do cabeçalho de Notas): vive na
        // topbar (que permanece visível) e recolhe `#mapaToolbar` + `#mapaFormatBar`.
        const colapso = btnIcone('colapso', 'colapso', 'Recolher barras', 'alternar-colapso', null, 'mapaColapsoBarras');
        colapso.hidden = true;
        colapso.setAttribute('aria-expanded', 'true');

        // Lado a lado: ver a nota e o mapa ao mesmo tempo (espelha o "Ver mapa ao lado" de Notas).
        const splitBtn = btnIcone('split', 'split', 'Ver nota ao lado', 'alternar-split', null, 'mapaSplitBtn');
        splitBtn.hidden = true;
        splitBtn.setAttribute('aria-pressed', 'false');

        // Fechar o mapa (espelha o #notesModalClose de Notas): só fecha o mapa,
        // mantendo a nota (e vice-versa).
        const fechar = btnIcone('fechar', 'fechar', 'Fechar mapa', 'fechar-mapa', null, 'mapaFechar');
        fechar.hidden = true;

        // Expandir/contrair a área (espelha o #notesFullscreenBtn de Notas): MESMO par
        // de ícones (expandir/restaurar) e a MESMA alternância por classe no shell.
        const telaCheia = btnTelaCheia('mapaFullscreenBtn');
        telaCheia.hidden = true;
        telaCheia.setAttribute('aria-pressed', 'false');

        topbar.append(tituloAtual, espaco, colapso, telaCheia, splitBtn, fechar);

        const form = document.createElement('form');
        form.id = 'mapaForm';
        form.className = 'mapa-form';
        form.noValidate = true;
        form.hidden = true;

        // Faixa de chips dos MAPAS da pasta ativa: as MESMAS classes/posição dos chips
        // de Notas (`#notesContextNav`), ACIMA da barra de ferramentas. O conteúdo é
        // montado pelo orquestrador (`renderMapasNav`, em mapa.js).
        const chipsNav = criar('nav', 'notes-context-nav mapa-chips-nav app-rolagem');
        chipsNav.id = 'mapaChipsNav';
        chipsNav.setAttribute('aria-label', 'Mapas desta pasta');
        chipsNav.hidden = false;

        // Barras padronizadas (F12): ferramentas (fixa) + formatação (contextual).
        const toolbar = criar('div', 'mapa-toolbar app-barra app-rolagem app-vidro-barra');
        toolbar.id = 'mapaToolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Ferramentas do mapa');
        toolbar.hidden = true;
        const formatBar = criar('div', 'mapa-format-bar app-barra app-rolagem app-vidro-barra');
        formatBar.id = 'mapaFormatBar';
        formatBar.setAttribute('role', 'toolbar');
        formatBar.setAttribute('aria-label', 'Formatação do nó');
        formatBar.hidden = true;

        const wrap = criar('div', 'mapa-canvas-wrap');
        wrap.id = 'mapaCanvasWrap';

        // Rodapé informativo (MESMAS classes `.app-rodape`/`.app-rodape-meta` do rodapé
        // de Notas): esquerda = última edição, centro = tópicos, direita = "Salvo".
        const rodape = criar('div', 'mapa-rodape app-rodape');
        rodape.id = 'mapaRodape';
        rodape.hidden = true;
        const ultimaEdicao = criar('span', 'mapa-rodape-meta app-rodape-meta', '');
        ultimaEdicao.id = 'mapaLastEdit';
        const contagem = criar('span', 'mapa-rodape-meta app-rodape-meta', '');
        contagem.id = 'mapaTopicCount';
        contagem.setAttribute('role', 'status');
        contagem.setAttribute('aria-live', 'polite');
        const salvo = criar('span', 'mapa-rodape-meta app-rodape-meta', 'Salvo');
        salvo.id = 'mapaStatus';
        salvo.setAttribute('role', 'status');
        salvo.setAttribute('aria-live', 'polite');
        rodape.append(ultimaEdicao, contagem, salvo);

        shell.append(topbar, chipsNav, toolbar, formatBar, form, wrap, rodape);
        secao.append(shell);
        return { shell, topbar, toolbar, formatBar, form, wrap, rodape };
    }
    // 🔄 [FIM: MAPA - SHELL DA ÁREA]

    // 🔄 [INÍCIO: MAPA - TOPBAR/FORMULÁRIO]
    /** Mostra/oculta os controles conforme o estado (mapa aberto × sem mapa). */
    function atualizarShell(estado) {
        const lista = !estado.mapaAberto;
        const visivel = (id, mostrar) => { const el = document.getElementById(id); if (el) el.hidden = !mostrar; };
        visivel('mapaTituloAtual', !lista);
        // A faixa de chips dos MAPAS da pasta fica SEMPRE visível: é por ela que se
        // escolhe/cria um mapa (mesma lógica da faixa de chips de Notas).
        visivel('mapaChipsNav', true);
        visivel('mapaToolbar', !lista);
        visivel('mapaColapsoBarras', !lista);
        visivel('mapaSplitBtn', !lista);
        visivel('mapaFechar', !lista);
        visivel('mapaRodape', !lista);
        visivel('mapaFullscreenBtn', !lista);
        // Estado de "tela cheia" da área (espelha o fullscreen de Notas): aplica a
        // classe no shell (que troca o ícone expandir/restaurar via CSS) e o título.
        const telaCheia = document.getElementById('mapaFullscreenBtn');
        if (telaCheia) {
            const ativo = Boolean(estado.telaCheia);
            telaCheia.setAttribute('aria-pressed', String(ativo));
            const rotulo = ativo ? 'Restaurar tamanho' : 'Expandir (tela cheia)';
            telaCheia.title = rotulo;
            telaCheia.setAttribute('aria-label', rotulo);
        }
        const shellTela = document.querySelector('#mapaArea .mapa-shell');
        if (shellTela) shellTela.classList.toggle('mapa-fullscreen', Boolean(estado.telaCheia));
        const titulo = document.getElementById('mapaTituloAtual');
        if (titulo) titulo.textContent = estado.mapaAberto ? (estado.mapaAberto.nome || 'Mapa') : '';
    }

    // Layouts de árvore (Fase 5): rótulo amigável por chave do modelo.
    const ROTULOS_LAYOUT = [
        ['bilateral', 'Bilateral'], ['tradicional', 'Tradicional'],
        ['esquerda-direita', 'Esquerda → direita'], ['direita-esquerda', 'Direita → esquerda'],
        ['arvore-vertical', 'Árvore vertical'], ['organograma', 'Organograma'], ['livre', 'Livre']
    ];

    // Rótulos dos formulários inline que AINDA existem (nós/conexões). Os formulários de
    // mapa/pasta saíram: agora as ações de mapa vivem no menu do chip (igual a Notas).
    const ROTULOS_FORM = {
        conectar: 'Conectar a outro mapa',
        'no-mover-para': 'Mover nó para...', 'no-conectar-para': 'Conectar nó a...'
    };

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

    /** Formulário inline (um por vez): conectar mapas e mover/conectar nós. */
    function renderForm(formEl, acao, dados) {
        if (!formEl) return;
        formEl.innerHTML = '';
        formEl.hidden = !acao;
        if (!acao) { formEl.removeAttribute('data-mapa-form'); return; }
        formEl.dataset.mapaForm = acao.tipo;
        formEl.dataset.mapaId = acao.id || '';
        formEl.append(criar('span', 'mapa-form-titulo', ROTULOS_FORM[acao.tipo] || ''));
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
        // Campo de edição do mapa espelha o de Notas: NÃO há título/metadados
        // empilhados acima do canvas (o nome vive no cabeçalho/#mapaTituloAtual).
        const painel = criar('div', 'mapa-aberto');

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
        painel.append(conexoes);

        // F12: "Conectar a mapa…" e "Salvar como template" saíram daqui e viraram itens da
        // barra de ferramentas (grupo "Mais") — a área do mapa NÃO tem botão solto.
        // Confirmação em duas etapas antes de descartar as posições manuais (Fase 8).
        if (dados.acao && dados.acao.tipo === 'layout-confirmar') painel.append(barraConfirmacaoLayout());
        // Painel "Configurar atalhos" (Fase 10).
        if (dados.atalhos) painel.append(renderAtalhos(dados.atalhos));
        // Painel "Editar barra" (Fase 12).
        if (dados.barraAberta) painel.append(editorBarra());
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
        // Menu contextual do card/canvas (Fase 12) — comandos específicos de card.
        const menu = menuContextual(dados);
        if (menu) painel.append(menu);
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

    /** Estilos por nível (Fase 9): nível + fundo/borda e ações aplicar/limpar. */
    function estiloNivelControles(grafo) {
        const detalhes = criar('details', 'mapa-estilo-nivel');
        detalhes.append(criar('summary', 'mapa-estilo-nivel-titulo', 'Estilo por nível'));
        const linha = criar('div', 'mapa-estilo-nivel-linha');
        const sel = document.createElement('select');
        sel.id = 'mapaEstiloNivel';
        sel.setAttribute('aria-label', 'Nível');
        for (let n = 1; n <= 6; n += 1) {
            const opcao = document.createElement('option');
            opcao.value = String(n);
            opcao.textContent = 'Nível ' + n;
            sel.append(opcao);
        }
        const nivel = (grafo && grafo.estilosNivel) || {};
        const atual = nivel['1'] || {};
        linha.append(sel,
            campoCor('mapaEstiloNivelFundo', 'Fundo', atual.fundo),
            campoCor('mapaEstiloNivelBorda', 'Borda', atual.borda));
        linha.append(botao('mapa-btn mapa-btn-primario', 'Aplicar ao nível', 'estilo-nivel-aplicar'));
        linha.append(botao('mapa-btn', 'Limpar nível', 'estilo-nivel-limpar'));
        detalhes.append(linha);
        return detalhes;
    }

    // 🔄 [INÍCIO: MAPA - BARRAS PADRONIZADAS (FASE 12)]
    /**
     * Botão da barra no MESMO padrão de Notas: `.toolbar-btn` (32x32, ícone/texto),
     * `title`/`aria-label`, `data-mapa-acao` (os testes e as ações dependem disso) e
     * `data-mapa-botao` (chave para a ordem persistida).
     */
    function btnBarra(chave, rotulo, titulo, acao, dados, id) {
        const el = criar('button', 'toolbar-btn mapa-tb-btn', rotulo);
        el.type = 'button';
        el.title = titulo || rotulo;
        el.setAttribute('aria-label', titulo || rotulo);
        el.dataset.mapaAcao = acao;
        el.dataset.mapaBotao = chave;
        if (dados) Object.assign(el.dataset, dados);
        if (id) el.id = id;
        return el;
    }

    /** Grupo da barra (divisores separam os grupos, igual à barra de Notas). */
    function grupoBarra(id, rotulo) {
        const g = criar('div', 'mapa-tb-grupo');
        g.dataset.mapaGrupo = id;
        g.setAttribute('role', 'group');
        g.setAttribute('aria-label', rotulo);
        return g;
    }
    const divisorBarra = () => criar('span', 'mapa-tb-divisor', '');

    /** Botão de menu com ÍCONE + TEXTO (overflow "Mais") — mesmo ícone padronizado. */
    function btnMenu(chave, nome, rotulo, acao, dados, id) {
        const el = btnBarra(chave, '', rotulo, acao, dados, id);
        el.append(icone(nome), criar('span', 'mapa-menu-item-texto', rotulo));
        return el;
    }

    /**
     * Ícones PADRONIZADOS das barras do mapa: sempre 16×16, `stroke: currentColor`,
     * `stroke-width: 2`, `linecap/linejoin: round` e grade 24×24.
     * As funções que TAMBÉM existem na barra de Notas reaproveitam o MESMO desenho de lá
     * (`negrito`, `italico`, `cor`, `fundo`, `desfazer`, `refazer`) — mesma linguagem visual.
     */
    const ICONES = {
        // ---- Mesmos ícones da barra de Notas ----
        negrito: { d: '<path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>' },
        italico: { d: '<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>' },
        cor: { vb: '0 0 20 20', d: '<path d="M6.5 12.5 10 3.5l3.5 9M7.7 9.5h4.6" stroke-width="1.4" stroke-linejoin="round"/><path d="M1 17.5h18" stroke-width="2.5"/>' },
        fundo: { d: '<path d="m14 3 7 7-10 10H4v-7zM11 6l7 7M3 23h18"/>' },
        desfazer: { d: '<path d="M9 7 4 12l5 5"/><path d="M4 12h9a7 7 0 0 1 7 7"/>' },
        refazer: { d: '<path d="m15 7 5 5-5 5"/><path d="M20 12h-9a7 7 0 0 0-7 7"/>' },
        // ---- Ícones próprios do mapa (mesmo traço/grade) ----
        novo: { d: '<path d="M12 5v14M5 12h14"/>' },
        // MESMO desenho do botão "Modelos" da barra de Notas (quatro quadrados).
        templates: { vb: '0 0 24 24', d: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>' },
        topico: { d: '<rect x="3" y="3" width="12" height="12" rx="2"/><path d="M19 12v9M14.5 16.5h9"/>' },
        'zoom-menos': { d: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>' },
        'zoom-mais': { d: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>' },
        centralizar: { d: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>' },
        fit: { d: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>' },
        raiz: { d: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/>' },
        grade: { d: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>' },
        recolher: { d: '<path d="m9 4 3 3 3-3M9 20l3-3 3 3M4 12h16"/>' },
        expandir: { d: '<path d="m15 4-3 3-3-3M15 20l-3-3-3 3M4 12h16"/>' },
        mais: { d: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>' },
        'tamanho-menos': { d: '<path d="M3 19 8 5l5 14M4.6 14.5h6.8"/><path d="M15 12h6"/>' },
        'tamanho-mais': { d: '<path d="M3 19 8 5l5 14M4.6 14.5h6.8"/><path d="M18 9v6M15 12h6"/>' },
        fonte: { d: '<path d="M5 5h14M12 5v14M9 19h6"/>' },
        borda: { d: '<rect x="4" y="4" width="16" height="16" rx="2"/>' },
        forma: { d: '<circle cx="8" cy="16" r="4"/><rect x="12" y="4" width="9" height="9" rx="2"/>' },
        alinhamento: { d: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>' },
        // Alinhamento do TEXTO do nó: um desenho DISTINTO por opção (antes as 3 opções
        // usavam o mesmo ícone e pareciam todas "à direita").
        'alinha-esquerda': { d: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>' },
        'alinha-centro': { d: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>' },
        'alinha-direita': { d: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>' },
        'linha-menos': { d: '<path d="M4 12h16" stroke-width="1.4"/>' },
        'linha-mais': { d: '<path d="M4 12h16" stroke-width="4"/>' },
        'ramo-menos': { d: '<path d="M3 16c4 0 5-8 9-8s5 8 9 8" stroke-width="1.4"/>' },
        'ramo-mais': { d: '<path d="M3 16c4 0 5-8 9-8s5 8 9 8" stroke-width="3"/>' },
        pincel: { d: '<path d="m15 4 5 5-4 4-5-5z"/><path d="M11 8 4 15v5h5l7-7"/>' },
        aplicar: { d: '<path d="M5 13l4 4L19 7"/>' },
        restaurar: { d: '<path d="M4 10a8 8 0 1 1 2.3 6.3"/><path d="M4 4v6h6"/>' },
        subir: { d: '<path d="M12 20V5"/><path d="m6 11 6-6 6 6"/>' },
        descer: { d: '<path d="M12 4v15"/><path d="m6 13 6 6 6-6"/>' },
        // Ações rápidas de criação (barra de formatação, fixas à direita).
        irmao: { d: '<rect x="2" y="8" width="8" height="8" rx="2"/><path d="M17 8v8M13 12h8"/>' },
        filho: { d: '<rect x="8" y="2" width="8" height="7" rx="2"/><path d="M12 9v4"/><path d="M12 13v8M9 17h6"/>' },
        'conectar-nos': { d: '<path d="M9 12h6"/><path d="M7 8H6a4 4 0 0 0 0 8h1"/><path d="M17 8h1a4 4 0 0 1 0 8h-1"/>' },
        'conectar-mapa': { d: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>' },
        'template-salvar': { d: '<path d="M6 3h12v18l-6-4-6 4z"/>' },
        atalhos: { d: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>' },
        'barra-editar': { d: '<path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h13"/><circle cx="16" cy="6" r="2.2"/><circle cx="10" cy="12" r="2.2"/><circle cx="19" cy="18" r="2.2"/>' },
        // Colapso das barras (MESMO desenho da seta do cabeçalho de Notas).
        colapso: { d: '<path d="m5 15 7-7 7 7"/>' },
        // Lado a lado: dois painéis divididos.
        split: { d: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>' },
        // Fechar (MESMO desenho do #notesModalClose de Notas).
        fechar: { d: '<path d="M18 6 6 18M6 6l12 12"/>' },
        // Expandir/contrair (MESMO desenho do #notesFullscreenBtn de Notas).
        'tela-cheia': { d: '<path d="M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3"/>' },
        'restaurar-tela': { d: '<path d="M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3"/>' }
    };

    /** Cria o SVG padronizado de um ícone (16×16, `stroke: currentColor`). */
    function icone(nome) {
        const def = ICONES[nome] || ICONES.forma;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', def.vb || '0 0 24 24');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = def.d;
        return svg;
    }

    /** Botão de ÍCONE da barra: mesma caixa do `.toolbar-btn` (32×32) e ícone padronizado. */
    function btnIcone(chave, nome, titulo, acao, dados, id) {
        const el = btnBarra(chave, '', titulo, acao, dados, id);
        el.dataset.mapaIcone = nome;
        el.append(icone(nome));
        return el;
    }

    /**
     * Botão de expandir/contrair (tela cheia) — ESPELHA o `#notesFullscreenBtn` de
     * Notas: um único SVG com os DOIS desenhos (expandir + restaurar) e o CSS troca
     * qual aparece conforme `.mapa-fullscreen` no shell. Garante que o ícone apareça
     * sempre (antes o desenho era só 2 cantos e podia passar despercebido).
     */
    function btnTelaCheia(id) {
        const el = btnBarra('tela-cheia', '', 'Expandir (tela cheia)', 'alternar-fullscreen', null, id);
        el.dataset.mapaIcone = 'tela-cheia';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = '<path class="mapa-expand-icon" d="M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3"/>'
            + '<path class="mapa-restore-icon" d="M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3"/>';
        el.append(svg);
        return el;
    }

    /**
     * Opções que ficam em UM botão só (abre um menu) em vez de vários botões soltos:
     * Fonte, Forma e Alinhamento. O `data-mapa-acao` do botão é `barra-menu`.
     */
    const OPCOES_BARRA = {
        forma: {
            rotulo: 'Forma', icone: 'forma',
            itens: [['retangulo', 'Retângulo'], ['pilula', 'Pílula'], ['elipse', 'Elipse'], ['nota', 'Nota']]
        },
        alinhamento: {
            rotulo: 'Alinhamento', icone: 'alinhamento',
            itens: [
                ['esquerda', 'Esquerda', 'alinha-esquerda'],
                ['centro', 'Centro', 'alinha-centro'],
                ['direita', 'Direita', 'alinha-direita']
            ]
        }
    };

    /** Nome legível da opção ativa (para o `title`/`aria-label` do botão que abre as opções). */
    function rotuloOpcao(chave, valor) {
        const def = OPCOES_BARRA[chave];
        if (!def) return '';
        const achado = def.itens.find(([v]) => v === valor);
        return achado ? achado[1] : '(herdar)';
    }

    /** Botão único que ABRE as opções de um grupo (fonte/forma/alinhamento). */
    function btnOpcoes(chave, efetivo) {
        const def = OPCOES_BARRA[chave];
        if (!def) return null;
        const titulo = def.rotulo + ': ' + rotuloOpcao(chave, efetivo && efetivo[chave]);
        const el = btnIcone(chave, def.icone, titulo, 'barra-menu', { mapaMenu: chave });
        el.setAttribute('aria-haspopup', 'menu');
        return el;
    }

    /** Menu de OPÇÕES do botão aberto (popover fixo, como o menu contextual do card). */
    function menuOpcoesBarra(bar, info, efetivo) {
        const aberto = info && info.menuBarra;
        const def = aberto && OPCOES_BARRA[aberto.chave];
        if (!def) return null;
        const botao = bar.querySelector('[data-mapa-botao="' + aberto.chave + '"]');
        if (!botao) return null;
        const caixa = criar('div', 'mapa-menu mapa-menu-opcoes');
        caixa.id = 'mapaMenuOpcoes';
        caixa.setAttribute('role', 'menu');
        caixa.setAttribute('aria-label', def.rotulo);
        const ret = botao.getBoundingClientRect();
        const largura = 200;
        caixa.style.left = Math.max(8, Math.min(ret.left, (global.innerWidth || 1024) - largura - 8)) + 'px';
        caixa.style.top = Math.max(8, ret.bottom + 6) + 'px';
        def.itens.forEach(([valor, rotulo, iconeItem]) => {
            const ativo = efetivo && efetivo[aberto.chave] === valor;
            const item = criar('button', 'mapa-menu-item', '');
            item.type = 'button';
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('aria-checked', String(Boolean(ativo)));
            item.dataset.mapaAcao = 'estilo-definir';
            item.dataset.mapaEstilo = aberto.chave;
            item.dataset.mapaValor = valor;
            if (ativo) item.classList.add('mapa-menu-item-ativo');
            item.append(icone(iconeItem || def.icone), criar('span', 'mapa-menu-item-texto', rotulo));
            caixa.append(item);
        });
        const fechar = criar('button', 'mapa-menu-item mapa-menu-item-fechar', 'Fechar');
        fechar.type = 'button';
        fechar.dataset.mapaAcao = 'menu-barra-fechar';
        caixa.append(fechar);
        return caixa;
    }

    /** Reordena um grupo conforme a ordem salva (chaves desconhecidas ficam no fim). */
    function aplicarOrdemBarra(grupo, ordem) {
        const salva = (ordem && ordem[grupo.dataset.mapaGrupo]) || null;
        if (!salva || !salva.length) return;
        const porChave = new Map();
        [...grupo.children].forEach(filho => {
            if (filho.dataset && filho.dataset.mapaBotao) porChave.set(filho.dataset.mapaBotao, filho);
        });
        salva.forEach(chave => {
            const el = porChave.get(chave);
            if (el) grupo.append(el);
        });
    }

    /** Campo numérico compacto da barra (espaçamento). */
    const campoBarra = (id, rotulo, valor) => campoNumero(id, rotulo, valor);

    /**
     * Preenche `#mapaToolbar` (ferramentas, FIXA) e `#mapaFormatBar` (formatação,
     * CONTEXTUAL ao nó selecionado). Sem mapa aberto, ambas ficam vazias/ocultas.
     * Regra de ouro (F12): NADA de botão solto — ferramentas aqui, formatação na
     * `#mapaFormatBar` e comandos específicos de card no MENU CONTEXTUAL do nó.
     */
    function renderBarras(dados) {
        const toolbar = document.getElementById('mapaToolbar');
        const formatBar = document.getElementById('mapaFormatBar');
        if (!toolbar || !formatBar) return;
        toolbar.innerHTML = '';
        formatBar.innerHTML = '';
        const info = dados || {};
        if (!info.mapaAberto) { toolbar.hidden = true; formatBar.hidden = true; return; }
        const grafo = info.grafo || null;
        const ordem = (global.MapaMentalStore && global.MapaMentalStore.lerOrdemBarra) ? global.MapaMentalStore.lerOrdemBarra() : {};

        // ---- Grupo: Histórico (MESMOS ícones da barra de Notas) ----
        const gHist = grupoBarra('historico', 'Histórico');
        gHist.append(btnIcone('desfazer', 'desfazer', 'Desfazer', 'no-desfazer'));
        gHist.append(btnIcone('refazer', 'refazer', 'Refazer', 'no-refazer'));
        toolbar.append(gHist);

        // ---- Grupo: Inserir (somente o tópico RAIZ; filho/irmão vão no menu do card) ----
        toolbar.append(divisorBarra());
        const gInserir = grupoBarra('inserir', 'Inserir');
        gInserir.append(btnIcone('novo-topico', 'topico', 'Novo tópico (raiz)', 'no-independente', null, 'mapaNovoTopico'));
        toolbar.append(gInserir);

        // ---- Grupo: Exibir (zoom, enquadramento, layout, espaçamento, tema, nível) ----
        toolbar.append(divisorBarra());
        toolbar.append(grupoExibir(grafo, Boolean(info.grade)));

        // ---- Grupo: Mais (overflow + atalhos + editar barra) ----
        toolbar.append(divisorBarra());
        toolbar.append(grupoMais(info));

        [...toolbar.querySelectorAll('.mapa-tb-grupo')].forEach(g => aplicarOrdemBarra(g, ordem));
        renderFormatBar(formatBar, info);
    }
    /** Grupo "Exibir": zoom, enquadramento, layout, espaçamento, tema e estilo por nível. */
    function grupoExibir(grafo, gradeLigado) {
        const g = grupoBarra('exibir', 'Exibir');
        g.append(btnIcone('zoom-out', 'zoom-menos', 'Diminuir zoom', 'zoom-out'));
        const rotuloZoom = criar('span', 'mapa-zoom-atual', '100%');
        rotuloZoom.id = 'mapaZoomAtual';
        g.append(rotuloZoom);
        g.append(btnIcone('zoom-in', 'zoom-mais', 'Aumentar zoom', 'zoom-in'));
        g.append(btnIcone('centralizar', 'centralizar', 'Centralizar', 'centralizar'));
        g.append(btnIcone('fit', 'fit', 'Ajustar à tela', 'fit'));
        g.append(btnIcone('raiz', 'raiz', 'Ir para a raiz', 'ir-raiz'));

        // Grade (pontinhos) da superfície: OPCIONAL, desligada por padrão.
        const gradeBtn = btnIcone('grade', 'grade', 'Mostrar grade (pontinhos)', 'alternar-grade', null, 'mapaGradeBtn');
        gradeBtn.setAttribute('aria-pressed', String(Boolean(gradeLigado)));
        g.append(gradeBtn);

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
        layoutSel.dataset.mapaBotao = 'layout';
        g.append(layoutSel);

        const espaco = criar('span', 'mapa-tb-campos');
        espaco.dataset.mapaBotao = 'espacamento';
        const cfgEspaco = (grafo && grafo.espacamento) || { nos: 32, niveis: 80 };
        espaco.append(campoBarra('mapaEspacoNos', 'Entre nós', cfgEspaco.nos));
        espaco.append(campoBarra('mapaEspacoNiveis', 'Entre níveis', cfgEspaco.niveis));
        espaco.append(botao('mapa-btn mapa-btn-compacto', 'Aplicar', 'espacamento-aplicar'));
        g.append(espaco);

        const temaSel = document.createElement('select');
        temaSel.id = 'mapaTema';
        temaSel.className = 'mapa-ordem';
        temaSel.setAttribute('aria-label', 'Tema do mapa');
        ((global.MapaMentalModelo && global.MapaMentalModelo.TEMAS_MAPA) || []).forEach(t => {
            const opcao = document.createElement('option');
            opcao.value = t.id;
            opcao.textContent = t.nome;
            temaSel.append(opcao);
        });
        temaSel.value = (grafo && grafo.temaId) || 'padrao';
        temaSel.dataset.mapaBotao = 'tema';
        g.append(temaSel);

        const nivel = estiloNivelControles(grafo);
        nivel.dataset.mapaBotao = 'nivel';
        g.append(nivel);

        g.append(btnIcone('recolher-tudo', 'recolher', 'Recolher tudo', 'recolher-tudo'));
        g.append(btnIcone('expandir-tudo', 'expandir', 'Expandir tudo', 'expandir-tudo'));
        return g;
    }

    /** Grupo "Mais": overflow com conexões, atalhos e a edição da barra. */
    function grupoMais(info) {
        const g = grupoBarra('mais', 'Mais');
        const detalhes = criar('details', 'mapa-tb-mais');
        const resumo = criar('summary', 'mapa-tb-mais-resumo', '');
        resumo.append(icone('mais'));
        resumo.title = 'Mais ferramentas';
        resumo.setAttribute('aria-label', 'Mais ferramentas');
        detalhes.append(resumo);
        const lista = criar('div', 'mapa-tb-mais-lista');
        [
            ['conectar-nos', 'conectar-nos', 'Conectar nós', 'conectar-nos'],
            ['conectar-mapa', 'conectar-mapa', 'Conectar a mapa…', 'conectar'],
            ['atalhos', 'atalhos', 'Atalhos', 'atalhos-abrir'],
            ['barra-editar', 'barra-editar', 'Editar barra', 'barra-editar'],
            ['barra-restaurar', 'restaurar', 'Restaurar barra', 'barra-restaurar']
        ].forEach(([chave, nome, rotulo, acao]) => {
            const el = btnMenu(chave, nome, rotulo, acao);
            if (acao === 'conectar-nos') {
                el.id = 'mapaModoConexao';
                el.setAttribute('aria-pressed', String(Boolean(info && info.modoConexao)));
            }
            lista.append(el);
        });
        detalhes.append(lista);
        detalhes.dataset.mapaBotao = 'mais';
        g.append(detalhes);
        return g;
    }
    /** Marca `aria-pressed` nos toggles da formatação. */
    function comEstado(el, ativo) {
        el.setAttribute('aria-pressed', String(Boolean(ativo)));
        return el;
    }

    /** Barra de FORMATAÇÃO (contextual ao nó selecionado) — espelha a `#notesToolbar`. */
    function renderFormatBar(bar, info) {
        const selecionados = (info && info.selecionados) || new Set();
        // Espelha a barra de formatação de Notas: SEMPRE visível com o mapa aberto,
        // mesmo sem nó selecionado — aí os controles ficam desabilitados até haver seleção.
        const grafo = (info && info.grafo) || null;
        const lista = [...selecionados];
        const no = grafo ? (grafo.nos || []).find(item => item.id === lista[lista.length - 1]) : null;
        bar.hidden = false;
        const m = global.MapaMentalModelo;
        const efetivo = (m && m.estiloEfetivo && no) ? m.estiloEfetivo(grafo, no) : {};

        // ---- Texto: MESMOS ícones da barra de Notas (negrito/itálico) ----
        const gTexto = grupoBarra('fmt-texto', 'Texto');
        gTexto.append(comEstado(btnIcone('negrito', 'negrito', 'Negrito', 'estilo-toggle', { mapaEstilo: 'negrito' }), efetivo.negrito === true));
        gTexto.append(comEstado(btnIcone('italico', 'italico', 'Itálico', 'estilo-toggle', { mapaEstilo: 'italico' }), efetivo.italico === true));
        bar.append(gTexto);

        // ---- Cores: MESMOS ícones de Cor/Destaque de Notas (+ borda do nó) ----
        bar.append(divisorBarra());
        const gCores = grupoBarra('fmt-cores', 'Cores');
        [['cor', 'cor', 'Cor do texto'], ['fundo', 'fundo', 'Fundo do nó'], ['borda', 'borda', 'Borda do nó']]
            .forEach(([prop, nome, titulo]) => {
                const b = btnIcone('cor-' + prop, nome, titulo, 'cor-abrir', { mapaCor: prop });
                b.setAttribute('aria-haspopup', 'dialog');
                gCores.append(b);
            });
        bar.append(gCores);

        // ---- Tamanho (passo) + FONTE (UM botão abre as opções) ----
        bar.append(divisorBarra());
        const gTamanho = grupoBarra('fmt-tamanho', 'Tamanho e fonte');
        gTamanho.append(btnIcone('tamanho-menos', 'tamanho-menos', 'Diminuir tamanho', 'estilo-passo', { mapaEstilo: 'tamanho', mapaPasso: '-1' }));
        gTamanho.append(btnIcone('tamanho-mais', 'tamanho-mais', 'Aumentar tamanho', 'estilo-passo', { mapaEstilo: 'tamanho', mapaPasso: '1' }));
        // Fonte: abre o MESMO catálogo do sistema usado em Notas (`NotasFontes`).
        const btnFonte = btnIcone('fonte', 'fonte', 'Fonte', 'fonte-abrir');
        btnFonte.setAttribute('aria-haspopup', 'dialog');
        gTamanho.append(btnFonte);
        bar.append(gTamanho);

        // ---- FORMA (UM botão abre as opções) ----
        bar.append(divisorBarra());
        const gForma = grupoBarra('fmt-forma', 'Forma');
        gForma.append(btnOpcoes('forma', efetivo));
        bar.append(gForma);

        // ---- ALINHAMENTO (UM botão abre as opções) ----
        bar.append(divisorBarra());
        const gAlinha = grupoBarra('fmt-alinhamento', 'Alinhamento');
        gAlinha.append(btnOpcoes('alinhamento', efetivo));
        bar.append(gAlinha);

        // ---- Linhas do nó/ramo + pincel ----
        bar.append(divisorBarra());
        const gLinhas = grupoBarra('fmt-linhas', 'Linhas e pincel');
        gLinhas.append(btnIcone('borda-menos', 'linha-menos', 'Borda mais fina', 'estilo-passo', { mapaEstilo: 'espessuraBorda', mapaPasso: '-1' }));
        gLinhas.append(btnIcone('borda-mais', 'linha-mais', 'Borda mais grossa', 'estilo-passo', { mapaEstilo: 'espessuraBorda', mapaPasso: '1' }));
        gLinhas.append(btnIcone('ramo-menos', 'ramo-menos', 'Ramo mais fino', 'estilo-passo', { mapaEstilo: 'espessuraRamo', mapaPasso: '-1' }));
        gLinhas.append(btnIcone('ramo-mais', 'ramo-mais', 'Ramo mais grosso', 'estilo-passo', { mapaEstilo: 'espessuraRamo', mapaPasso: '1' }));
        gLinhas.append(btnIcone('estilo-copiar', 'pincel', 'Copiar estilo (pincel)', 'no-estilo-copiar'));
        const aplicar = btnIcone('estilo-aplicar', 'aplicar', 'Aplicar o estilo copiado', 'no-estilo-aplicar');
        aplicar.disabled = !(info.estiloCopiado && Object.keys(info.estiloCopiado).length);
        gLinhas.append(aplicar);
        gLinhas.append(btnIcone('estilo-restaurar', 'restaurar', 'Restaurar o estilo padrão', 'no-estilo-restaurar'));
        bar.append(gLinhas);

        // ---- Modelos: MESMO botão/ícone (quatro quadrados) da barra de Notas. Abre o
        // diálogo "Modelos do mapa" (mesmas classes do "Modelos de nota"). ----
        bar.append(divisorBarra());
        const gModelos = grupoBarra('modelos', 'Modelos');
        const btnModelos = btnIcone('modelos', 'templates', 'Modelos', 'modelos', null, 'mapaModelosBtn');
        btnModelos.setAttribute('aria-haspopup', 'dialog');
        gModelos.append(btnModelos);
        bar.append(gModelos);

        // ---- Ações RÁPIDAS fixadas à DIREITA (uso no celular): ficam SEMPRE visíveis,
        // mesmo com a barra rolada na horizontal (`position: sticky; right: 0`), e já
        // criam o tópico em edição (mesmas ações do menu do card).
        const fixos = criar('div', 'mapa-tb-fixos');
        fixos.setAttribute('role', 'group');
        fixos.setAttribute('aria-label', 'Criar tópico');
        fixos.append(btnIcone('rapido-irmao', 'irmao', 'Adicionar irmão', 'no-irmao'));
        fixos.append(btnIcone('rapido-filho', 'filho', 'Adicionar filho', 'no-filho'));
        bar.append(fixos);

        // Menu de OPÇÕES do botão aberto (fonte/forma/alinhamento) — sempre por último.
        const opcoes = menuOpcoesBarra(bar, info, efetivo);
        if (opcoes) bar.append(opcoes);
    }
    /**
     * Menu contextual (F12): os comandos ESPECÍFICOS DE CARD vivem aqui — aberto por
     * botão direito (PC) ou toque longo. `role="menu"`; fecha com `Esc`/clique fora.
     * No canvas vazio, mostra as ações de mapa/tela.
     */
    function menuContextual(dados) {
        const info = dados || {};
        const noMenu = info.menuNo;
        const canvasMenu = info.menuCanvas;
        if (!noMenu && !canvasMenu) return null;
        const menu = criar('div', 'mapa-menu');
        menu.id = 'mapaMenu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', noMenu ? 'Ações do card' : 'Ações do mapa');
        const pos = noMenu || canvasMenu;
        menu.style.left = Math.max(8, Math.min(pos.x || 0, (global.innerWidth || 1024) - 232)) + 'px';
        menu.style.top = Math.max(8, Math.min(pos.y || 0, (global.innerHeight || 768) - 340)) + 'px';
        const itens = noMenu ? [
            ['filho', 'Adicionar filho', 'no-filho'],
            ['irmao', 'Adicionar irmão', 'no-irmao'],
            ['editar', 'Editar texto', 'no-editar'],
            ['propriedades', 'Propriedades', 'no-propriedades'],
            ['concluir', 'Concluir / desconcluir', 'no-concluir'],
            ['duplicar', 'Duplicar', 'no-duplicar'],
            ['copiar', 'Copiar', 'no-copiar'],
            ['recortar', 'Recortar', 'no-recortar'],
            ['colar', 'Colar', 'no-colar'],
            ['subir', 'Subir', 'no-subir'],
            ['descer', 'Descer', 'no-descer'],
            ['mover', 'Mover para…', 'no-mover-para'],
            ['recolher', 'Recolher', 'no-recolher'],
            ['expandir', 'Expandir', 'no-expandir'],
            ['bloquear', 'Bloquear / desbloquear', 'no-bloquear'],
            ['largura-menos', 'Largura −', 'no-largura-menos'],
            ['largura-mais', 'Largura +', 'no-largura-mais'],
            ['conectar', 'Conectar a…', 'no-conectar-para'],
            ['excluir', 'Excluir', 'no-excluir']
        ] : [
            ['novo-topico', 'Novo tópico (raiz)', 'no-independente'],
            ['colar', 'Colar', 'no-colar'],
            ['recolher-tudo', 'Recolher tudo', 'recolher-tudo'],
            ['expandir-tudo', 'Expandir tudo', 'expandir-tudo'],
            ['centralizar', 'Centralizar', 'centralizar'],
            ['fit', 'Ajustar à tela', 'fit'],
            ['ir-raiz', 'Ir para a raiz', 'ir-raiz']
        ];
        itens.forEach(([chave, rotulo, acao]) => {
            const item = criar('button', 'mapa-menu-item', rotulo);
            item.type = 'button';
            item.setAttribute('role', 'menuitem');
            item.dataset.mapaAcao = acao;
            item.dataset.mapaBotao = chave;
            if (noMenu) item.dataset.mapaNoId = noMenu.id;
            if (acao === 'no-excluir') item.classList.add('mapa-menu-item-perigo');
            menu.append(item);
        });
        const fechar = criar('button', 'mapa-menu-item mapa-menu-item-fechar', 'Fechar');
        fechar.type = 'button';
        fechar.setAttribute('role', 'menuitem');
        fechar.dataset.mapaAcao = 'menu-fechar';
        menu.append(fechar);
        return menu;
    }

    /** Painel "Editar barra" (F12): reordena os botões de cada grupo e restaura o padrão. */
    function editorBarra() {
        const toolbar = document.getElementById('mapaToolbar');
        if (!toolbar) return null;
        const secao = criar('section', 'mapa-barra-editor');
        secao.id = 'mapaBarraEditor';
        secao.setAttribute('role', 'dialog');
        secao.setAttribute('aria-label', 'Editar barra de ferramentas');
        const topo = criar('div', 'mapa-atalhos-topo');
        topo.append(criar('h4', 'mapa-atalhos-titulo', 'Editar barra de ferramentas'));
        topo.append(criar('div', 'mapa-topbar-espaco'));
        topo.append(botao('mapa-btn', 'Restaurar padrão', 'barra-restaurar'));
        topo.append(botao('mapa-btn', 'Fechar', 'barra-fechar'));
        secao.append(topo);
        const lista = criar('div', 'mapa-barra-editor-lista');
        [...toolbar.querySelectorAll('.mapa-tb-grupo')].forEach(grupo => {
            const bloco = criar('div', 'mapa-barra-editor-grupo');
            bloco.append(criar('span', 'mapa-atalhos-rotulo', grupo.getAttribute('aria-label') || grupo.dataset.mapaGrupo));
            [...grupo.children].forEach(filho => {
                if (!filho.dataset || !filho.dataset.mapaBotao) return;
                const chave = filho.dataset.mapaBotao;
                const item = criar('span', 'mapa-barra-editor-item');
                item.append(criar('span', 'mapa-barra-editor-nome', String(filho.title || filho.textContent || chave).slice(0, 24)));
                const dados = { mapaBotao: chave, mapaGrupo: grupo.dataset.mapaGrupo };
                item.append(botao('mapa-btn mapa-no-btn', '↑', 'barra-mover', Object.assign({}, dados, { mapaDir: '-1' })));
                item.append(botao('mapa-btn mapa-no-btn', '↓', 'barra-mover', Object.assign({}, dados, { mapaDir: '1' })));
                bloco.append(item);
            });
            lista.append(bloco);
        });
        secao.append(lista);
        return secao;
    }
    // 🔄 [FIM: MAPA - BARRAS PADRONIZADAS (FASE 12)]

    /** Confirmação inline (duas etapas) antes de descartar as posições manuais (Fase 8). */
    function barraConfirmacaoLayout() {
        const barra = criar('div', 'mapa-confirmacao');
        barra.setAttribute('role', 'alertdialog');
        barra.setAttribute('aria-label', 'Confirmar troca de layout');
        barra.append(criar('span', 'mapa-confirmacao-texto',
            'Trocar para layout automático descarta as posições manuais dos nós.'));
        barra.append(botao('mapa-btn mapa-btn-primario', 'Confirmar', 'layout-confirmar'));
        barra.append(botao('mapa-btn', 'Cancelar', 'layout-cancelar'));
        return barra;
    }

    /**
     * Painel "Configurar atalhos" (Fase 10): lista as ações com as teclas atuais, captura
     * uma tecla por vez e permite restaurar o padrão. Fechado por `Esc`/clique no botão.
     */
    function renderAtalhos(dados) {
        const info = dados || {};
        const secao = criar('section', 'mapa-atalhos');
        secao.id = 'mapaAtalhos';
        secao.setAttribute('role', 'dialog');
        secao.setAttribute('aria-label', 'Configurar atalhos');
        const topo = criar('div', 'mapa-atalhos-topo');
        topo.append(criar('h4', 'mapa-atalhos-titulo', 'Atalhos do mapa'));
        const espaco = criar('div', 'mapa-topbar-espaco');
        topo.append(espaco);
        topo.append(botao('mapa-btn', 'Restaurar padrão', 'atalho-padrao'));
        topo.append(botao('mapa-btn', 'Fechar', 'atalho-fechar'));
        secao.append(topo);
        const lista = criar('ul', 'mapa-atalhos-lista');
        (info.itens || []).forEach(item => {
            const linha = criar('li', 'mapa-atalhos-item');
            linha.append(criar('span', 'mapa-atalhos-rotulo', item.rotulo));
            linha.append(criar('span', 'mapa-atalhos-teclas',
                info.capturando === item.id ? 'Pressione a tecla…' : (item.teclas || []).join(' · ')));
            const alterar = botao('mapa-btn mapa-no-btn', 'Alterar', 'atalho-alterar', { mapaAtalho: item.id });
            alterar.setAttribute('aria-label', 'Alterar o atalho de ' + item.rotulo);
            linha.append(alterar);
            lista.append(linha);
        });
        secao.append(lista);
        if (info.aviso) secao.append(criar('p', 'mapa-atalhos-aviso', info.aviso));
        return secao;
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

        // Estilo (Fase 9): classes + variáveis CSS do estilo EFETIVO (nó > nível > tema).
        const modeloEstilo = global.MapaMentalModelo;
        const estilo = (modeloEstilo && modeloEstilo.estiloEfetivo) ? modeloEstilo.estiloEfetivo(dados.grafo, no) : {};
        if (estilo.fundo) elemento.style.setProperty('--mapa-no-fundo', estilo.fundo);
        if (estilo.cor) elemento.style.setProperty('--mapa-no-cor', estilo.cor);
        if (estilo.borda) elemento.style.setProperty('--mapa-no-borda', estilo.borda);
        if (estilo.tamanho) elemento.style.setProperty('--mapa-no-tamanho', estilo.tamanho + 'px');
        if (estilo.espessuraBorda) elemento.style.setProperty('--mapa-no-borda-espessura', estilo.espessuraBorda + 'px');
        if (estilo.forma) elemento.classList.add('mapa-no-forma-' + estilo.forma);
        if (estilo.fonte) {
            // Fonte conhecida (FONTES_NO) usa a classe; família do catálogo do sistema
            // (`NotasFontes`, com fallback) vai para o `style.fontFamily`.
            const fontesConhecidas = (global.MapaMentalModelo && global.MapaMentalModelo.FONTES_NO) || [];
            elemento.style.removeProperty('font-family');
            if (fontesConhecidas.includes(estilo.fonte)) elemento.classList.add('mapa-no-fonte-' + estilo.fonte);
            else elemento.style.fontFamily = estilo.fonte;
        }
        if (estilo.alinhamento) elemento.classList.add('mapa-no-alinha-' + estilo.alinhamento);
        if (estilo.negrito) elemento.classList.add('mapa-no-negrito');
        if (estilo.italico) elemento.classList.add('mapa-no-italico');
        if (estilo.espessuraRamo) elemento.dataset.mapaRamo = String(estilo.espessuraRamo);

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

        // Vínculo Notas↔Mapa: atalho que abre a nota vinculada.
        if (no.notaRef) {
            const nota = botao('mapa-no-nota-icone', '📄', 'abrir-nota', { mapaNota: no.notaRef });
            nota.title = 'Abrir a nota vinculada';
            nota.setAttribute('aria-label', 'Abrir a nota vinculada');
            elemento.append(nota);
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
        const canvas = criar('div', 'mapa-canvas app-vidro-campo');
        canvas.id = 'mapaCanvas';
        canvas.tabIndex = 0;
        // Grade (pontinhos) OPCIONAL — desligada por padrão (espelha o editor de Notas).
        if (dados.grade) canvas.classList.add('mapa-grade');
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

    // 🔄 [INÍCIO: MAPA - SEM MAPA ABERTO (ESTADO VAZIO)]
    /**
     * Sem mapa aberto, a área mostra a faixa de chips dos mapas da pasta (montada por
     * `renderMapasNav`, em mapa.js) e uma dica — NÃO existe mais lista de gestão. A
     * seta ‹ fixa (topo-esquerdo) volta à tela principal de Pastas.
     */
    function renderSemMapa(wrap, dados) {
        if (!wrap) return;
        wrap.innerHTML = '';
        const vazio = criar('div', 'mapa-vazio');
        vazio.append(criar('p', 'mapa-vazio-titulo', 'Nenhum mapa aberto.'));
        const pasta = dados && dados.pastaNome;
        vazio.append(criar('p', 'mapa-vazio-dica', pasta
            ? 'Escolha um mapa de "' + pasta + '" na faixa acima ou crie o primeiro com o "+".'
            : 'Escolha um mapa na faixa acima ou crie o primeiro com o "+".'));
        wrap.append(vazio);
    }
    // 🔄 [FIM: MAPA - SEM MAPA ABERTO (ESTADO VAZIO)]


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
            // Espessura do ramo (Fase 9): estilo EFETIVO do filho (nó > nível > tema).
            const modeloRamo = global.MapaMentalModelo;
            const estiloRamo = (modeloRamo && modeloRamo.estiloEfetivo) ? modeloRamo.estiloEfetivo(grafo, no) : {};
            if (estiloRamo.espessuraRamo) ramo.style.strokeWidth = estiloRamo.espessuraRamo + 'px';
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
        montarShell, atualizarShell, renderForm, renderSemMapa, renderMapaAberto,
        atualizarSelecao, atualizarNo, aplicarTema, dataCurta,
        desenharConexoes, atualizarConexoes, caminhoConexao, caminhoRamo, dimensoesNos, menuConexao,
        renderAtalhos, renderBarras, menuContextual, editorBarra
    };
})(typeof window !== 'undefined' ? window : globalThis);
