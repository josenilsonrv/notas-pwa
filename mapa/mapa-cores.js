// ============================================
// MAPA MENTAL - Paleta de cores (Fase 12)
// MESMO padrão de lógica e visualização dos botões de cor/destaque de Notas
// (`setupNotesColors` em notes/editor.js): grade 8x10 (80 cores), cores personalizadas
// (recentes máx. 12 + "+" + conta-gotas), reset, "Aplicar", popover preso ao
// visualViewport, `Esc`/clique fora e foco preso. Nada aqui toca no motor de notas.
// ============================================
(function (global) {
    'use strict';

    // 🔄 [INÍCIO: MAPA - PALETA DE CORES (FASE 12)]
    /** Mesmas 80 cores da paleta de Notas (8 linhas x 10 colunas). */
    const GRADE = [
        ['#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff'],
        ['#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff'],
        ['#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc'],
        ['#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
        ['#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0'],
        ['#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79'],
        ['#85200c', '#990000', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#1155cc', '#0b5394', '#351c75', '#741b47'],
        ['#5b0f00', '#660000', '#783f04', '#7f6000', '#274e13', '#0c343d', '#1c4587', '#073763', '#20124d', '#4c1130']
    ].flat();
    const LIMITE_RECENTES = 12;
    const ID_PALETA = 'mapaCoresPaleta';

    const criar = (tag, classe, texto) => {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    };
    const corValida = valor => /^#[0-9a-f]{6}$/i.test(String(valor || ''));

    /** Fecha a paleta aberta (se houver), desconectando os listeners externos. */
    function fechar() {
        const painel = document.getElementById(ID_PALETA);
        if (!painel) return;
        if (painel._dispose) painel._dispose();
        if (painel._fecharEsc) document.removeEventListener('keydown', painel._fecharEsc, true);
        painel.remove();
    }

    /**
     * Abre a paleta ancorada em `botao` para a propriedade `propriedade`
     * ('cor' | 'fundo' | 'borda'). `contexto` = { valorAtual, recentes,
     * aoConfirmar(valorOuNull), aoGravarRecente(valor) }.
     * Clicar de novo no MESMO botão fecha (toggle), igual ao padrão de Notas.
     */
    function abrir(botao, propriedade, contexto) {
        if (!botao || !propriedade) return null;
        const atual = document.getElementById(ID_PALETA);
        if (atual) {
            const mesma = atual.dataset.propriedade === propriedade;
            fechar();
            if (mesma) return null;
        }
        const cfg = contexto || {};
        let pendente = null;

        const painel = criar('div', 'mapa-cor-paleta');
        painel.id = ID_PALETA;
        painel.dataset.propriedade = propriedade;
        painel.setAttribute('role', 'dialog');
        painel.setAttribute('aria-label', 'Escolher ' + propriedade);

        // Grade 8x10 (80 cores), igual à de Notas.
        const grade = criar('div', 'mapa-cor-grade');
        GRADE.forEach(cor => {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.style.backgroundColor = cor;
            swatch.title = cor;
            swatch.setAttribute('aria-label', cor);
            swatch.setAttribute('aria-pressed', String(String(cfg.valorAtual || '').toLowerCase() === cor));
            swatch.addEventListener('click', () => {
                pendente = cor;
                painel.querySelectorAll('.mapa-cor-grade button, .mapa-cor-recentes button')
                    .forEach(b => b.setAttribute('aria-pressed', 'false'));
                swatch.setAttribute('aria-pressed', 'true');
            });
            grade.append(swatch);
        });
        painel.append(grade);
        montarExtras(painel, cfg, valor => { pendente = valor; }, () => pendente);

        // Popover manual (mesmo padrão de Notas) + fechamento por clique fora e `Esc`.
        painel.setAttribute('popover', 'manual');
        painel.style.position = 'fixed';
        painel.style.inset = 'auto';
        painel.style.margin = '0';
        try { painel.showPopover(); } catch (_) { /* navegador sem popover */ }
        posicionar(painel, botao);
        if (global.ResizeObserver) {
            const observador = new global.ResizeObserver(() => posicionar(painel, botao));
            observador.observe(document.documentElement);
            painel._observador = observador;
        }
        const fora = evento => {
            if (!painel.contains(evento.target) && !botao.contains(evento.target)) fechar();
        };
        document.addEventListener('pointerdown', fora);
        const esc = evento => {
            if (evento.key !== 'Escape') return;
            evento.preventDefault();
            evento.stopPropagation();
            fechar();
            botao.focus();
        };
        document.addEventListener('keydown', esc, true);
        painel._dispose = () => {
            document.removeEventListener('pointerdown', fora);
            if (painel._observador) painel._observador.disconnect();
        };
        painel._fecharEsc = esc;
        return painel;
    }

    /** Cores personalizadas (recentes + "+" + conta-gotas), reset ("Sem cor") e "Aplicar". */
    function montarExtras(painel, cfg, definirPendente, lerPendente) {
        const recentes = criar('div', 'mapa-cor-recentes');
        recentes.append(criar('small', 'mapa-cor-recentes-rotulo', 'Cores personalizadas'));
        (Array.isArray(cfg.recentes) ? cfg.recentes.filter(corValida) : [])
            .slice(-LIMITE_RECENTES)
            .forEach(cor => {
                const swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.style.background = cor;
                swatch.title = cor;
                swatch.setAttribute('aria-label', cor);
                swatch.addEventListener('click', () => definirPendente(cor));
                recentes.append(swatch);
            });

        const custom = document.createElement('input');
        custom.type = 'color';
        custom.id = 'mapaCorCustom';
        custom.value = corValida(cfg.valorAtual) ? cfg.valorAtual : '#4cc9f0';
        custom.setAttribute('aria-label', 'Cor personalizada');
        recentes.append(custom);

        const adicionar = criar('button', 'mapa-cor-add', '+');
        adicionar.type = 'button';
        adicionar.setAttribute('aria-label', 'Adicionar cor personalizada');
        adicionar.addEventListener('click', () => definirPendente(custom.value));
        recentes.append(adicionar);

        if (global.EyeDropper) {
            const dropper = criar('button', 'mapa-cor-dropper', '⌖');
            dropper.type = 'button';
            dropper.setAttribute('aria-label', 'Conta-gotas');
            dropper.addEventListener('click', async () => {
                try {
                    const resultado = await new global.EyeDropper().open();
                    if (resultado && resultado.sRGBHex) {
                        custom.value = resultado.sRGBHex;
                        definirPendente(resultado.sRGBHex);
                    }
                } catch (_) { /* cancelado */ }
            });
            recentes.append(dropper);
        }
        painel.append(recentes);

        const acoes = criar('div', 'mapa-cor-acoes');
        const reset = criar('button', 'mapa-cor-reset', 'Sem cor');
        reset.type = 'button';
        reset.addEventListener('click', () => {
            if (cfg.aoConfirmar) cfg.aoConfirmar(null);
            fechar();
        });
        const confirmar = criar('button', 'mapa-cor-aplicar', 'Aplicar');
        confirmar.type = 'button';
        confirmar.addEventListener('click', () => {
            const valor = lerPendente();
            if (!valor) return;
            if (cfg.aoGravarRecente) cfg.aoGravarRecente(valor);
            if (cfg.aoConfirmar) cfg.aoConfirmar(valor);
            fechar();
        });
        acoes.append(reset, confirmar);
        painel.append(acoes);

        painel.addEventListener('mousedown', evento => { if (evento.target.tagName !== 'INPUT') evento.preventDefault(); });
        document.body.append(painel);
    }

    /** Prende o popover ao visualViewport, ancorado no botão (nunca sai da tela). */
    function posicionar(painel, botao) {
        const vv = global.visualViewport;
        const largura = (vv && vv.width) || document.documentElement.clientWidth;
        const altura = (vv && vv.height) || global.innerHeight;
        const esquerda = (vv && vv.offsetLeft) || 0;
        const topo = (vv && vv.offsetTop) || 0;
        painel.style.maxWidth = Math.max(0, largura - 16) + 'px';
        painel.style.maxHeight = Math.max(0, altura - 16) + 'px';
        const caixa = botao.getBoundingClientRect();
        painel.style.left = (esquerda + Math.max(8, Math.min(caixa.left - esquerda, largura - painel.offsetWidth - 8))) + 'px';
        painel.style.top = (topo + Math.max(8, Math.min(caixa.bottom - topo, altura - painel.offsetHeight - 8))) + 'px';
    }

    global.MapaMentalCores = { GRADE, LIMITE_RECENTES, ID_PALETA, abrir, fechar };
})(typeof window !== 'undefined' ? window : globalThis);
// 🔄 [FIM: MAPA - PALETA DE CORES (FASE 12)]
