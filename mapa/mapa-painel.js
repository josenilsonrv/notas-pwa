// ============================================
// MAPA MENTAL - Painel de propriedades do nó (Fase 4)
// Formulário de conteúdo (título, descrição, notas, links, tags, emoji, ícone,
// tarefa/prioridade/status/datas, anexos e referências). Só monta quando aberto.
// Nada toca no motor de notas.
// ============================================
(function (global) {
    'use strict';

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

        const acoes = criar('div', 'mapa-painel-acoes');
        const salvar = criar('button', 'mapa-btn mapa-btn-primario', 'Salvar conteúdo');
        salvar.type = 'submit';
        acoes.append(salvar, botao('mapa-btn', 'Cancelar', 'painel-fechar'));
        form.append(acoes);

        painel.append(form);
        return painel;
    }

    global.MapaMentalPainel = {
        EMOJIS, ROTULO_PRIORIDADE, ROTULO_STATUS, montarPainel,
        blocoLinksDetectados, blocoAnexos, blocoPonte
    };
})(typeof window !== 'undefined' ? window : globalThis);
