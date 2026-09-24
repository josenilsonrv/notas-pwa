// ============================================
// MAPA MENTAL - Layout e medição
// Fase 2: layout em árvore (simples e determinístico) para dar "mundo" ao canvas
// + limites do grafo (fit/minimapa). Os modos avançados chegam na Fase 8.
// ============================================
(function (global) {
    'use strict';

    // 🔄 [INÍCIO: MAPA - CONSTANTES/DIMENSÕES]
    const LARGURA_PADRAO = 180;
    const ALTURA_PADRAO = 44;
    const FOLGA = 64; // respiro no fit/minimapa
    // Espelha os layouts do modelo (o motor de layout não depende do módulo do modelo).
    const LAYOUTS = ['bilateral', 'tradicional', 'esquerda-direita', 'direita-esquerda', 'arvore-vertical', 'organograma', 'livre'];

    const dimensoesNo = no => ({
        largura: Number(no && no.largura) > 0 ? Number(no.largura) : LARGURA_PADRAO,
        altura: ALTURA_PADRAO
    });
    // 🔄 [FIM: MAPA - CONSTANTES/DIMENSÕES]

    /**
     * Layout em árvore POR RAIZ (Fase 5). Honra `grafo.layout`:
     * - `esquerda-direita` / `tradicional`: raiz à esquerda, filhos à direita
     * - `direita-esquerda`: espelhado
     * - `bilateral`: filhos alternam à direita/esquerda da raiz (mapa mental clássico)
     * - `arvore-vertical` / `organograma`: raiz no topo, filhos abaixo
     * - `livre`: mantém as posições gravadas (layout manual)
     * A travessia é ITERATIVA (pós-ordem) — profundidade ilimitada sem estourar a pilha.
     */
    // 🔄 [INÍCIO: MAPA - LAYOUT EM ÁRVORE (calcularPosicoes)]
    function calcularPosicoes(grafo, opcoes) {
        const cfg = opcoes || {};
        const layout = LAYOUTS.includes(cfg.layout) ? cfg.layout : ((grafo && grafo.layout) || 'bilateral');
        const espacamento = (grafo && grafo.espacamento) || { nos: 32, niveis: 80 };
        const passoX = (cfg.larguraNo || LARGURA_PADRAO) + (Number(espacamento.niveis) || 80);
        const passoY = (cfg.alturaNo || ALTURA_PADRAO) + (Number(espacamento.nos) || 32);
        const nos = (grafo && grafo.nos) || [];
        const posicoes = new Map();
        if (!nos.length) return posicoes;

        if (layout === 'livre') {
            nos.forEach(no => posicoes.set(no.id, no.posicao && Number.isFinite(no.posicao.x)
                ? { x: no.posicao.x, y: no.posicao.y }
                : { x: 0, y: 0 }));
            return posicoes;
        }

        const porId = new Map(nos.map(no => [no.id, no]));
        const filhosDe = paiId => nos
            .filter(no => (no.paiId || null) === (paiId || null))
            .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));

        const vertical = layout === 'arvore-vertical' || layout === 'organograma';
        // 0 = alterna lados (bilateral); 1 = direita; -1 = esquerda (ignorado no vertical).
        const direcaoRaiz = layout === 'bilateral' ? 0 : (layout === 'direita-esquerda' ? -1 : 1);
        const raizes = filhosDe(null).concat(nos.filter(no => no.paiId && !porId.has(no.paiId)));

        const processados = new Set();
        const linhas = new Map(); // id -> linha (slot de folha, média para nós internos)
        let cursor = 0;
        const pilha = raizes.map(raiz => ({ id: raiz.id, dir: direcaoRaiz, profundidade: 0, iniciado: false }));

        while (pilha.length) {
            const topo = pilha[pilha.length - 1];
            if (!topo.iniciado) {
                if (processados.has(topo.id)) { pilha.pop(); continue; }
                processados.add(topo.id);
                topo.iniciado = true;
                topo.filhos = filhosDe(topo.id).map((filho, indice, lista) => ({
                    id: filho.id,
                    // Bilateral (mapa mental clássico): metade CONTÍGUA dos filhos vai para a
                    // direita e a outra para a esquerda — mantém a ordem dos irmãos em cada lado
                    // (antes alternava 1 a 1, o que parecia aleatório ao adicionar um filho).
                    dir: topo.dir === 0 ? (indice < Math.ceil(lista.length / 2) ? 1 : -1) : topo.dir,
                    profundidade: topo.profundidade + 1
                }));
                const novos = topo.filhos.filter(f => !processados.has(f.id));
                for (let i = novos.length - 1; i >= 0; i -= 1) {
                    pilha.push({ id: novos[i].id, dir: novos[i].dir, profundidade: novos[i].profundidade, iniciado: false });
                }
            } else {
                const filhosLinha = topo.filhos.map(f => linhas.get(f.id)).filter(Number.isFinite);
                let linha;
                if (filhosLinha.length) {
                    linha = filhosLinha.reduce((a, b) => a + b, 0) / filhosLinha.length;
                } else {
                    linha = cursor;
                    cursor += 1;
                }
                linhas.set(topo.id, linha);
                posicoes.set(topo.id, vertical
                    ? { x: Math.round(linha * passoX), y: Math.round(topo.profundidade * passoY) }
                    : { x: Math.round(topo.dir * topo.profundidade * passoX), y: Math.round(linha * passoY) });
                pilha.pop();
            }
        }

        // Nós inalcançáveis (ciclos corrompidos): empilha no fim, nunca descarta.
        nos.filter(no => !processados.has(no.id)).forEach(no => {
            posicoes.set(no.id, { x: 0, y: cursor * passoY });
            cursor += 1;
        });

        // Normaliza para o quadrante positivo: filhos "à esquerda" (bilateral/direita-esquerda)
        // não podem nascer fora da viewport inicial (ficariam cortados e inalcançáveis).
        let menorX = Infinity;
        posicoes.forEach(p => { menorX = Math.min(menorX, p.x); });
        if (Number.isFinite(menorX) && menorX < 0) {
            posicoes.forEach(p => { p.x -= menorX; });
        }
        return posicoes;
    }

    // 🔄 [FIM: MAPA - LAYOUT EM ÁRVORE (calcularPosicoes)]

    // 🔄 [INÍCIO: MAPA - POSIÇÕES GARANTIDAS (garantirPosicoes)]
    /** Garante `posicao` em todos os nós (uma vez por mapa) e informa se alterou. */
    function garantirPosicoes(grafo) {
        if (!grafo || !grafo.nos || !grafo.nos.length) return false;
        if (grafo.nos.every(no => no.posicao && Number.isFinite(no.posicao.x))) return false;
        const posicoes = calcularPosicoes(grafo);
        let alterou = false;
        grafo.nos.forEach(no => {
            const posicao = posicoes.get(no.id);
            if (!posicao) return;
            if (!no.posicao || !Number.isFinite(no.posicao.x)) {
                no.posicao = { x: posicao.x, y: posicao.y };
                alterou = true;
            }
        });
        return alterou;
    }

    // 🔄 [FIM: MAPA - POSIÇÕES GARANTIDAS (garantirPosicoes)]

    // 🔄 [INÍCIO: MAPA - LIMITES/FIT (limites)]
    /** Limites do "mundo" (com folga) para fit e minimapa. `lista` opcional (nós visíveis). */
    function limites(grafo, lista) {
        const nos = lista || (grafo && grafo.nos) || [];
        if (!nos.length) {
            return {
                minX: 0, minY: 0, maxX: LARGURA_PADRAO, maxY: ALTURA_PADRAO,
                largura: LARGURA_PADRAO + FOLGA * 2, altura: ALTURA_PADRAO + FOLGA * 2
            };
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nos.forEach(no => {
            const dim = dimensoesNo(no);
            const posicao = no.posicao || { x: 0, y: 0 };
            minX = Math.min(minX, posicao.x);
            minY = Math.min(minY, posicao.y);
            maxX = Math.max(maxX, posicao.x + dim.largura);
            maxY = Math.max(maxY, posicao.y + dim.altura);
        });
        return {
            minX: minX - FOLGA, minY: minY - FOLGA,
            maxX: maxX + FOLGA, maxY: maxY + FOLGA,
            largura: (maxX - minX) + FOLGA * 2, altura: (maxY - minY) + FOLGA * 2
        };
    }

    // 🔄 [FIM: MAPA - LIMITES/FIT (limites)]

    // 🔄 [INÍCIO: MAPA - MINIMAPA (minimapa/pontoDoMinimapa/medirNo)]
    /** Geometria do minimapa: escala/offset do mundo + retângulo da viewport atual. */
    function minimapa(estado) {
        const lim = estado.limites;
        const larguraMundo = Math.max(1, lim.largura);
        const alturaMundo = Math.max(1, lim.altura);
        const escala = Math.min(estado.caixa.largura / larguraMundo, estado.caixa.altura / alturaMundo);
        const offsetX = (estado.caixa.largura - larguraMundo * escala) / 2;
        const offsetY = (estado.caixa.altura - alturaMundo * escala) / 2;
        const zoom = (estado.viewport && estado.viewport.zoom) || 1;
        const mundoX = -((estado.viewport && estado.viewport.x) || 0) / zoom;
        const mundoY = -((estado.viewport && estado.viewport.y) || 0) / zoom;
        return {
            escala, offsetX, offsetY, larguraMundo, alturaMundo,
            viewport: {
                left: offsetX + (mundoX - lim.minX) * escala,
                top: offsetY + (mundoY - lim.minY) * escala,
                width: (estado.canvas.largura / zoom) * escala,
                height: (estado.canvas.altura / zoom) * escala
            }
        };
    }

    /** Converte um ponto do minimapa em um ponto do "mundo". */
    function pontoDoMinimapa(estado, mx, my) {
        const geo = minimapa(estado);
        return {
            x: estado.limites.minX + (mx - geo.offsetX) / geo.escala,
            y: estado.limites.minY + (my - geo.offsetY) / geo.escala
        };
    }

    function medirNo(elemento) {
        if (!elemento) return { largura: LARGURA_PADRAO, altura: ALTURA_PADRAO };
        return { largura: elemento.offsetWidth || LARGURA_PADRAO, altura: elemento.offsetHeight || ALTURA_PADRAO };
    }

    // 🔄 [FIM: MAPA - MINIMAPA (minimapa/pontoDoMinimapa/medirNo)]

    // 🔄 [INÍCIO: MAPA - API PÚBLICA]
    global.MapaMentalLayout = {
        LARGURA_PADRAO, ALTURA_PADRAO,
        calcularPosicoes, garantirPosicoes, limites, minimapa, pontoDoMinimapa, medirNo
    };
    // 🔄 [FIM: MAPA - API PÚBLICA]
})(typeof window !== 'undefined' ? window : globalThis);
