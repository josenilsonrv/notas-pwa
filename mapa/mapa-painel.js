// ============================================
// MAPA MENTAL - Painel de propriedades do nó (Fase 4)
// Formulário de conteúdo (título, descrição, notas, links, tags, emoji, ícone,
// tarefa/prioridade/status/datas, anexos e referências). Só monta quando aberto.
// Nada toca no motor de notas.
// ============================================
(function (global) {
    'use strict';

    // 🔄 [INÍCIO: MAPA - HELPERS DE DOM / RÓTULOS]
    const EMOJIS = ['⭐', '🔥', '💡', '✅', '⚠️', '📌', '📎', '🎯', '🚀', '📈', '🧩', '🔑', '📝', '🧠', '❤️', '❓'];

    const criar = (tag, classe, texto) => {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    };

    const campo = (tag, id, rotulo) => {
        const wrap = criar('label', 'mapa-painel-campo');
        wrap.append(criar('span', 'mapa-painel-rotulo', rotulo));
        const input = document.createElement(tag);
        input.id = id;
        input.name = id;
        input.className = 'mapa-painel-entrada';
        wrap.append(input);
        return { wrap, input };
    };

    const botao = (classe, texto, acao, dados) => {
        const el = criar('button', classe, texto);
        el.type = 'button';
        if (acao) el.dataset.mapaAcao = acao;
        Object.assign(el.dataset, dados || {});
        return el;
    };

    const modelo = () => global.MapaMentalModelo;

    const ROTULO_PRIORIDADE = { '': 'Sem prioridade', baixa: 'Baixa', media: 'Média', alta: 'Alta' };
    const ROTULO_STATUS = { '': 'Sem status', 'a-fazer': 'A fazer', fazendo: 'Fazendo', feito: 'Feito', bloqueado: 'Bloqueado' };

    /** Cor com checkbox "usar": sem marcar, o nó HERDA (nível/tema) — Fase 9. */
    const campoCorComHerda = (id, rotulo, valor, ativo) => {
        const wrap = criar('label', 'mapa-painel-cor');
        const ck = document.createElement('input');
        ck.type = 'checkbox';
        ck.id = id + 'Ativa';
        ck.checked = Boolean(ativo);
        const cor = document.createElement('input');
        cor.type = 'color';
        cor.id = id;
        cor.value = /^#[0-9a-f]{6}$/i.test(valor || '') ? valor : '#4cc9f0';
        wrap.append(ck, criar('span', 'mapa-painel-rotulo', rotulo), cor);
        return wrap;
    };

    /** Select de estilo: a opção '' significa "(herdar)" — Fase 9. */
    const selectEstilo = (id, rotulo, opcoes, valor) => {
        const wrap = criar('label', 'mapa-painel-campo');
        wrap.append(criar('span', 'mapa-painel-rotulo', rotulo));
        const sel = document.createElement('select');
        sel.id = id;
        opcoes.forEach(([v, t]) => {
            const op = document.createElement('option');
            op.value = v;
            op.textContent = t;
            sel.append(op);
        });
        sel.value = (valor === undefined || valor === null) ? '' : String(valor);
        wrap.append(sel);
        return wrap;
    };
    // 🔄 [FIM: MAPA - HELPERS DE DOM / RÓTULOS]

    // 🔄 [INÍCIO: MAPA - BLOCOS DE CONTEÚDO (links/anexos/ponte)]
    /** Chips de URLs achados no texto (auto-link) — alimenta o campo `links` ao salvar. */
    function blocoLinksDetectados(no) {
        const m = modelo();
        const bloco = criar('div', 'mapa-painel-detectados');
        const achados = m
            ? [...new Set([...m.extrairLinks((no.descricao || '').replace(/<[^>]*>/g, '')), ...m.extrairLinks((no.notas || '').replace(/<[^>]*>/g, ''))])]
            : [];
        if (!achados.length) return bloco;
        bloco.append(criar('span', 'mapa-painel-rotulo', 'Links detectados:'));
        achados.forEach(url => {
            const chip = criar('a', 'mapa-chip mapa-painel-link', url);
            chip.href = url;
            chip.target = '_blank';
            chip.rel = 'noopener noreferrer';
            bloco.append(chip);
        });
        return bloco;
    }

    /** Lista de anexos/imagens do nó, com miniaturas e botão remover. */
    function blocoAnexos(no) {
        const bloco = criar('div', 'mapa-painel-anexos');
        const anexos = Array.isArray(no.anexos) ? no.anexos : [];
        bloco.append(criar('span', 'mapa-painel-rotulo', 'Anexos (' + anexos.length + ')'));
        if (!anexos.length) bloco.append(criar('span', 'mapa-vazio-dica', 'nenhum anexo'));
        anexos.forEach(item => {
            const linha = criar('div', 'mapa-painel-anexo');
            if (/^image\//i.test(item.tipo || '')) {
                const img = criar('img', 'mapa-painel-miniatura');
                img.src = item.dados;
                img.alt = item.nome || '';
                linha.append(img);
            } else {
                linha.append(criar('span', 'mapa-painel-anexo-tipo', '📎'));
            }
            linha.append(criar('span', 'mapa-painel-anexo-nome', item.nome || 'arquivo'));
            linha.append(botao('mapa-btn mapa-no-btn', '✕', 'no-anexo-remover', { mapaAnexo: item.id }));
            bloco.append(linha);
        });
        bloco.append(botao('mapa-btn', 'Adicionar anexo…', 'no-anexo-adicionar'));
        return bloco;
    }

    /** Nó-ponte: mostra o mapa de destino (clique abre) ou aviso de referência quebrada. */
    function blocoPonte(no, contexto) {
        if (!no.mapaRef) return null;
        const bloco = criar('div', 'mapa-painel-ponte');
        const nome = (contexto && contexto.nomeMapaRef) || 'Mapa conectado';
        if (contexto && contexto.refQuebrada) {
            bloco.append(criar('span', 'mapa-chip mapa-chip-quebrado', 'Referência quebrada'));
        } else {
            bloco.append(botao('mapa-chip', '🗺️ ' + nome, 'ponte-abrir', { mapaRef: no.mapaRef }));
        }
        return bloco;
    }

    /**
     * Vínculo com uma NOTA do app (vínculo Notas↔Mapa): um `select` com as notas
     * da pasta ativa e um atalho "Abrir nota". Salvo junto do conteúdo do nó.
     */
    function blocoNotaRef(no, contexto) {
        const bloco = criar('div', 'mapa-painel-nota');
        bloco.append(criar('span', 'mapa-painel-rotulo', 'Nota vinculada'));
        const notas = (global.app && global.app.projectsData)
            || (contexto && contexto.notas) || [];
        const linha = criar('div', 'mapa-painel-nota-linha');
        const sel = document.createElement('select');
        sel.id = 'mapaPainelNotaRef';
        sel.className = 'mapa-ordem';
        sel.setAttribute('aria-label', 'Nota vinculada');
        sel.append(new Option('— nenhuma —', ''));
        notas.forEach(nota => sel.append(new Option(nota.nome || 'Nota', nota.id)));
        sel.value = no.notaRef || '';
        linha.append(sel);
        if (no.notaRef) linha.append(botao('mapa-chip', '📄 Abrir nota', 'abrir-nota', { mapaNota: no.notaRef }));
        bloco.append(linha);
        return bloco;
    }
    // 🔄 [FIM: MAPA - BLOCOS DE CONTEÚDO (links/anexos/ponte)]

    // 🔄 [INÍCIO: MAPA - SEÇÃO ESTILO (FASE 9)]
    /**
     * Seção "Estilo" do painel: visual do nó (cores/forma/fonte/tamanho/alinhamento),
     * espessura da borda/ramo e as ações de pincel. Vive DENTRO do `#mapaPainelForm`
     * (nunca cria um form aninhado) e envia os campos vazios como "herdar" (limpa).
     */
    function blocoEstilo(no, contexto) {
        const m = modelo();
        const secao = criar('section', 'mapa-painel-estilo');
        secao.append(criar('h4', 'mapa-painel-subtitulo', 'Estilo'));
        const dados = contexto || {};
        const efetivo = (m && m.estiloEfetivo) ? m.estiloEfetivo(dados.grafo, no) : {};
        const proprio = no.estilo || {};
        const temCopiado = Boolean(dados.estiloCopiado && Object.keys(dados.estiloCopiado).length);

        const cores = criar('div', 'mapa-painel-meta');
        [['Cor', 'mapaEstiloCor', 'cor'], ['Fundo', 'mapaEstiloFundo', 'fundo'], ['Borda', 'mapaEstiloBorda', 'borda']]
            .forEach(([rotulo, id, chave]) => cores.append(
                campoCorComHerda(id, rotulo, proprio[chave] || efetivo[chave] || '#4cc9f0', Boolean(proprio[chave]))
            ));
        secao.append(cores);

        const linha = criar('div', 'mapa-painel-meta');
        linha.append(selectEstilo('mapaEstiloForma', 'Forma',
            [['', '(herdar)'], ['retangulo', 'Retângulo'], ['pilula', 'Pílula'], ['elipse', 'Elipse'], ['nota', 'Nota']], proprio.forma));
        linha.append(selectEstilo('mapaEstiloFonte', 'Fonte',
            [['', '(herdar)'], ['sistema', 'Sistema'], ['serif', 'Serifada'], ['mono', 'Monoespaçada'], ['cursiva', 'Cursiva']], proprio.fonte));
        linha.append(selectEstilo('mapaEstiloAlinhamento', 'Alinhamento',
            [['', '(herdar)'], ['esquerda', 'Esquerda'], ['centro', 'Centro'], ['direita', 'Direita']], proprio.alinhamento));
        secao.append(linha);

        const linha2 = criar('div', 'mapa-painel-meta');
        linha2.append(selectEstilo('mapaEstiloTamanho', 'Tamanho',
            [['', '(herdar)'], ['12', '12'], ['13', '13'], ['14', '14'], ['16', '16'], ['18', '18'], ['20', '20']],
            proprio.tamanho ? String(proprio.tamanho) : ''));
        linha2.append(selectEstilo('mapaEstiloEspessuraBorda', 'Esp. borda',
            [['', '(herdar)'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']],
            proprio.espessuraBorda ? String(proprio.espessuraBorda) : ''));
        linha2.append(selectEstilo('mapaEstiloNegrito', 'Negrito',
            [['', '(herdar)'], ['sim', 'Sim'], ['nao', 'Não']],
            typeof proprio.negrito === 'boolean' ? (proprio.negrito ? 'sim' : 'nao') : ''));
        linha2.append(selectEstilo('mapaEstiloItalico', 'Itálico',
            [['', '(herdar)'], ['sim', 'Sim'], ['nao', 'Não']],
            typeof proprio.italico === 'boolean' ? (proprio.italico ? 'sim' : 'nao') : ''));
        secao.append(linha2);

        const cRamo = campo('input', 'mapaEstiloEspessuraRamo', 'Esp. do ramo (1-8)');
        cRamo.input.type = 'number';
        cRamo.input.min = '1';
        cRamo.input.max = '8';
        cRamo.input.value = proprio.espessuraRamo ? String(proprio.espessuraRamo) : '';
        secao.append(cRamo.wrap);

        const acoes = criar('div', 'mapa-painel-acoes');
        acoes.append(botao('mapa-btn mapa-btn-primario', 'Salvar estilo', 'no-estilo-salvar'));
        acoes.append(botao('mapa-btn', 'Copiar estilo', 'no-estilo-copiar'));
        const aplicar = botao('mapa-btn', 'Aplicar copiado', 'no-estilo-aplicar');
        aplicar.disabled = !temCopiado;
        aplicar.title = temCopiado ? 'Aplica o estilo copiado neste nó' : 'Copie um estilo primeiro';
        acoes.append(aplicar);
        acoes.append(botao('mapa-btn', 'Restaurar padrão', 'no-estilo-restaurar'));
        secao.append(acoes);
        return secao;
    }
    // 🔄 [FIM: MAPA - SEÇÃO ESTILO (FASE 9)]

    // 🔄 [INÍCIO: MAPA - LINHAS META (prioridade/status/datas)]
    /** Linha prioridade/status/responsável. */
    function linhaMeta(no) {
        const linha = criar('div', 'mapa-painel-meta');
        const cPrioridade = campo('select', 'mapaPainelPrioridade', 'Prioridade');
        [['', 'Sem prioridade'], ['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']].forEach(([v, t]) => {
            const op = document.createElement('option');
            op.value = v; op.textContent = t;
            cPrioridade.input.append(op);
        });
        cPrioridade.input.value = no.prioridade || '';
        const cStatus = campo('select', 'mapaPainelStatus', 'Status');
        [['', 'Sem status'], ['a-fazer', 'A fazer'], ['fazendo', 'Fazendo'], ['feito', 'Feito'], ['bloqueado', 'Bloqueado']].forEach(([v, t]) => {
            const op = document.createElement('option');
            op.value = v; op.textContent = t;
            cStatus.input.append(op);
        });
        cStatus.input.value = no.status || '';
        const cResponsavel = campo('input', 'mapaPainelResponsavel', 'Responsável');
        cResponsavel.input.value = no.responsavel || '';
        linha.append(cPrioridade.wrap, cStatus.wrap, cResponsavel.wrap);
        return linha;
    }

    /** Linha início/prazo/progresso. */
    function linhaDatas(no) {
        const linha = criar('div', 'mapa-painel-meta');
        const cInicio = campo('input', 'mapaPainelInicio', 'Início');
        cInicio.input.type = 'date';
        cInicio.input.value = no.inicio || '';
        const cPrazo = campo('input', 'mapaPainelPrazo', 'Prazo');
        cPrazo.input.type = 'date';
        cPrazo.input.value = no.prazo || '';
        const cProgresso = campo('input', 'mapaPainelProgresso', 'Progresso (%)');
        cProgresso.input.type = 'number';
        cProgresso.input.min = '0';
        cProgresso.input.max = '100';
        cProgresso.input.value = String(no.progresso || 0);
        linha.append(cInicio.wrap, cPrazo.wrap, cProgresso.wrap);
        return linha;
    }


    // 🔄 [FIM: MAPA - LINHAS META (prioridade/status/datas)]

    // 🔄 [INÍCIO: MAPA - FORMULÁRIO DO PAINEL (montarPainel)]
    /** Monta o formulário completo do painel para um nó. */
    function montarPainel(no, contexto) {
        if (!no) return null;
        const painel = criar('section', 'mapa-painel');
        painel.id = 'mapaPainel';

        const topo = criar('div', 'mapa-painel-topo');
        topo.append(criar('h3', 'mapa-painel-titulo', 'Propriedades do nó'));
        topo.append(botao('mapa-btn mapa-no-btn', 'Fechar', 'painel-fechar'));
        painel.append(topo);

        const form = document.createElement('form');
        form.id = 'mapaPainelForm';
        form.className = 'mapa-painel-form';
        form.noValidate = true;
        form.dataset.mapaForm = 'no-conteudo';
        form.dataset.mapaNoId = no.id;

        const linhaIcone = criar('div', 'mapa-painel-icones');
        const cEmoji = campo('input', 'mapaPainelEmoji', 'Emoji');
        cEmoji.input.maxLength = 4;
        cEmoji.input.value = no.emoji || '';
        const cIcone = campo('input', 'mapaPainelIcone', 'Ícone (texto curto)');
        cIcone.input.maxLength = 8;
        cIcone.input.value = no.icone || '';
        linhaIcone.append(cEmoji.wrap, cIcone.wrap);
        form.append(linhaIcone);

        const paleta = criar('div', 'mapa-painel-emoji-picker');
        EMOJIS.forEach(emoji => paleta.append(botao('mapa-emoji', emoji, 'no-emoji', { mapaEmoji: emoji })));
        form.append(paleta);

        const cTitulo = campo('input', 'mapaPainelTitulo', 'Título');
        cTitulo.input.value = no.titulo || '';
        form.append(cTitulo.wrap);

        const cDescricao = campo('textarea', 'mapaPainelDescricao', 'Descrição (auto-link de URLs)');
        cDescricao.input.rows = 3;
        cDescricao.input.value = (no.descricao || '').replace(/<[^>]*>/g, '');
        form.append(cDescricao.wrap);

        const cNotas = campo('textarea', 'mapaPainelNotas', 'Notas');
        cNotas.input.rows = 3;
        cNotas.input.value = (no.notas || '').replace(/<[^>]*>/g, '');
        form.append(cNotas.wrap);
        form.append(blocoLinksDetectados(no));

        const cTags = campo('input', 'mapaPainelTags', 'Tags (separadas por vírgula)');
        cTags.input.value = (no.tags || []).join(', ');
        form.append(cTags.wrap);

        const cLinks = campo('textarea', 'mapaPainelLinks', 'Links (um por linha: rótulo | url)');
        cLinks.input.rows = 2;
        cLinks.input.value = (no.links || []).map(l => (l.rotulo && l.rotulo !== l.url ? l.rotulo + ' | ' + l.url : l.url)).join('\n');
        form.append(cLinks.wrap);



        const cTarefa = criar('label', 'mapa-painel-toggle');
        const ckTarefa = document.createElement('input');
        ckTarefa.type = 'checkbox';
        ckTarefa.id = 'mapaPainelTarefa';
        ckTarefa.name = 'mapaPainelTarefa';
        ckTarefa.checked = Boolean(no.tarefa);
        cTarefa.append(ckTarefa, criar('span', '', 'É uma tarefa'));
        form.append(cTarefa);

        const cConcluido = criar('label', 'mapa-painel-toggle');
        const ckConcluido = document.createElement('input');
        ckConcluido.type = 'checkbox';
        ckConcluido.id = 'mapaPainelConcluido';
        ckConcluido.name = 'mapaPainelConcluido';
        ckConcluido.checked = Boolean(no.concluido);
        cConcluido.append(ckConcluido, criar('span', '', 'Concluído'));
        form.append(cConcluido);

        form.append(linhaMeta(no));
        form.append(linhaDatas(no));

        const cRefs = campo('textarea', 'mapaPainelRefs', 'Referências (uma por linha: tipo | id | rótulo)');
        cRefs.input.rows = 2;
        cRefs.input.value = (no.refs || []).map(r => [r.tipo, r.id, r.rotulo].join(' | ')).join('\n');
        form.append(cRefs.wrap);

        form.append(blocoAnexos(no));
        const ponte = blocoPonte(no, contexto);
        if (ponte) form.append(ponte);
        // Vínculo Notas↔Mapa (abre a nota ao clicar no atalho).
        form.append(blocoNotaRef(no, contexto));
        // Estilo do nó (Fase 9) — dentro do mesmo form (nunca um form aninhado).
        form.append(blocoEstilo(no, contexto));

        const acoes = criar('div', 'mapa-painel-acoes');
        const salvar = criar('button', 'mapa-btn mapa-btn-primario', 'Salvar conteúdo');
        salvar.type = 'submit';
        acoes.append(salvar, botao('mapa-btn', 'Cancelar', 'painel-fechar'));
        form.append(acoes);

        painel.append(form);
        return painel;
    }

    // 🔄 [FIM: MAPA - FORMULÁRIO DO PAINEL (montarPainel)]

    // 🔄 [INÍCIO: MAPA - API PÚBLICA]
    global.MapaMentalPainel = {
        EMOJIS, ROTULO_PRIORIDADE, ROTULO_STATUS, montarPainel,
        blocoLinksDetectados, blocoAnexos, blocoPonte, blocoEstilo, blocoNotaRef
    };
    // 🔄 [FIM: MAPA - API PÚBLICA]
})(typeof window !== 'undefined' ? window : globalThis);
