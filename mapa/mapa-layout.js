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
    const ALTURA_LINHA = 18;      // altura de uma linha de texto dentro do nó
    const PADDING_VERTICAL = 16;  // respiro vertical do nó (padding 8px topo+base)
    const FOLGA = 64; // respiro no fit/minimapa
    const ESPACO_MIN = 0;
    const ESPACO_MAX = 400;
    // Espelha os layouts do modelo (o motor de layout não depende do módulo do modelo).
    const LAYOUTS = ['bilateral', 'tradicional', 'esquerda-direita', 'direita-esquerda', 'arvore-vertical', 'organograma', 'livre'];

    /** Normaliza o espaçamento (`{ nos, niveis }`) para inteiros dentro do limite (Fase 8). */
    function normalizarEspacamento(espacamento) {
        const base = espacamento || {};
        const limitar = valor => {
            const numero = Math.round(Number(valor));
            if (!Number.isFinite(numero)) return null;
            return Math.min(ESPACO_MAX, Math.max(ESPACO_MIN, numero));
        };
        const nos = limitar(base.nos);
        const niveis = limitar(base.niveis);
        return { nos: nos === null ? 32 : nos, niveis: niveis === null ? 80 : niveis };
    }

    /**
     * Altura estimada do nó (determinística, SEM DOM): nº de linhas do título quebrado
     * pela largura útil + uma linha extra quando há tags. Fallback quando não há medição real.
     */
    function estimarAltura(no, largura) {
        const larguraNo = Number(largura) > 0 ? Number(largura)
            : (Number(no && no.largura) > 0 ? Number(no.largura) : LARGURA_PADRAO);
        const larguraUtil = Math.max(40, larguraNo - 28);
        const porLinha = Math.max(6, Math.floor(larguraUtil / 7));
        const texto = String((no && no.titulo) || '');
        const linhas = Math.max(1, Math.ceil(texto.length / porLinha));
        const extraTags = (no && Array.isArray(no.tags) && no.tags.length) ? ALTURA_LINHA : 0;
        return PADDING_VERTICAL + linhas * ALTURA_LINHA + extraTags;
    }

    /**
     * Dimensões de um nó: usa a MEDIÇÃO real quando disponível (`medidas`: Map id -> {largura,altura}),
     * senão a largura gravada + a altura ESTIMADA (determinística).
     */
    const dimensoesNo = (no, medidas) => {
        const medida = medidas && no ? medidas.get(no.id) : null;
        const largura = (medida && medida.largura > 0) ? medida.largura
            : (Number(no && no.largura) > 0 ? Number(no.largura) : LARGURA_PADRAO);
        const altura = (medida && medida.altura > 0) ? medida.altura
            : Math.max(ALTURA_PADRAO, estimarAltura(no, largura));
        return { largura, altura };
    };
    // 🔄 [FIM: MAPA - CONSTANTES/DIMENSÕES]

    /**
     * Layout em árvore POR RAIZ (Fases 5 e 8). Honra `grafo.layout`:
     * - `esquerda-direita` / `tradicional`: raiz à esquerda, filhos à direita
     * - `direita-esquerda`: espelhado
     * - `bilateral`: filhos divididos em metades contíguas (1ª metade à direita, resto à esquerda)
     * - `arvore-vertical` / `organograma`: raiz no topo, filhos abaixo
     * - `livre`: mantém as posições gravadas (layout manual)
     *
     * Fase 8: usa as DIMENSÕES REAIS dos nós (`cfg.medidas`, medido no DOM) para que os irmãos
     * não se sobreponham — a faixa de cada folha avança pela altura/ largura real + o espaçamento
     * e os pais ficam centrados nos filhos. A coluna de cada nível avança pela MAIOR dimensão
     * daquele nível + o espaçamento entre níveis; uma passada final (`desobrepor`) garante a
     * folga mínima dentro de cada coluna. Sem medição, cai na estimativa determinística.
     * A travessia é ITERATIVA (pós-ordem) — profundidade ilimitada sem estourar a pilha.
     */
    // 🔄 [INÍCIO: MAPA - LAYOUT EM ÁRVORE (calcularPosicoes)]
    function calcularPosicoes(grafo, opcoes) {
        const cfg = opcoes || {};
        const layout = LAYOUTS.includes(cfg.layout) ? cfg.layout : ((grafo && grafo.layout) || 'bilateral');
        const espacamento = normalizarEspacamento(cfg.espacamento || (grafo && grafo.espacamento));
        const medidas = cfg.medidas || null;
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
        const centros = new Map();      // id -> centro no eixo dos IRMÃOS (folhas acumulam; pais = média)
        const direcoes = new Map();     // id -> -1 / 0 / 1
        const profundidades = new Map();
        let cursor = 0;
        const pilha = raizes.map(raiz => ({ id: raiz.id, dir: direcaoRaiz, prof: 0, iniciado: false }));

        while (pilha.length) {
            const topo = pilha[pilha.length - 1];
            if (!topo.iniciado) {
                if (processados.has(topo.id)) { pilha.pop(); continue; }
                processados.add(topo.id);
                topo.iniciado = true;
                direcoes.set(topo.id, topo.dir);
                profundidades.set(topo.id, topo.prof);
                topo.filhos = filhosDe(topo.id).map((filho, indice, lista) => ({
                    id: filho.id,
                    // Bilateral (mapa mental clássico): metade CONTÍGUA dos filhos vai para a
                    // direita e a outra para a esquerda — mantém a ordem dos irmãos em cada lado.
                    dir: topo.dir === 0 ? (indice < Math.ceil(lista.length / 2) ? 1 : -1) : topo.dir,
                    prof: topo.prof + 1
                }));
                const novos = topo.filhos.filter(f => !processados.has(f.id));
                for (let i = novos.length - 1; i >= 0; i -= 1) {
                    pilha.push({ id: novos[i].id, dir: novos[i].dir, prof: novos[i].prof, iniciado: false });
                }
            } else {
                const filhosCentro = topo.filhos.map(f => centros.get(f.id)).filter(Number.isFinite);
                if (filhosCentro.length) {
                    centros.set(topo.id, filhosCentro.reduce((a, b) => a + b, 0) / filhosCentro.length);
                } else {
                    const dimensao = dimensoesNo(porId.get(topo.id), medidas);
                    const tamanho = vertical ? dimensao.largura : dimensao.altura;
                    centros.set(topo.id, cursor + tamanho / 2);
                    cursor += tamanho + espacamento.nos;
                }
                pilha.pop();
            }
        }

        // Nós inalcançáveis (ciclos corrompidos): empilha no fim, nunca descarta.
        nos.filter(no => !processados.has(no.id)).forEach(no => {
            const dimensao = dimensoesNo(no, medidas);
            const tamanho = vertical ? dimensao.largura : dimensao.altura;
            centros.set(no.id, cursor + tamanho / 2);
            cursor += tamanho + espacamento.nos;
            direcoes.set(no.id, direcaoRaiz);
            profundidades.set(no.id, 0);
        });

        // Coluna de cada PROFUNDIDADE avança pela maior dimensão do nível + espaçamento entre níveis.
        const maiorPorNivel = new Map();
        nos.forEach(no => {
            const nivel = profundidades.get(no.id) || 0;
            const dimensao = dimensoesNo(no, medidas);
            const tamanho = vertical ? dimensao.altura : dimensao.largura;
            maiorPorNivel.set(nivel, Math.max(maiorPorNivel.get(nivel) || 0, tamanho));
        });
        const inicioNivel = new Map();
        const niveis = [...maiorPorNivel.keys()];
        const maxNivel = niveis.length ? Math.max(...niveis) : 0;
        let acumulado = 0;
        for (let nivel = 0; nivel <= maxNivel; nivel += 1) {
            inicioNivel.set(nivel, acumulado);
            acumulado += (maiorPorNivel.get(nivel) || (vertical ? ALTURA_PADRAO : LARGURA_PADRAO)) + espacamento.niveis;
        }

        nos.forEach(no => {
            const dimensao = dimensoesNo(no, medidas);
            const centro = centros.get(no.id) || 0;
            const nivel = profundidades.get(no.id) || 0;
            const dir = direcoes.get(no.id) || 1;
            const inicio = inicioNivel.get(nivel) || 0;
            if (vertical) {
                posicoes.set(no.id, { x: Math.round(centro - dimensao.largura / 2), y: Math.round(inicio) });
            } else {
                // Direita: encosta no início da coluna; esquerda: encosta na borda oposta da coluna.
                const x = dir >= 0 ? inicio : -(inicio + (maiorPorNivel.get(nivel) || dimensao.largura));
                posicoes.set(no.id, { x: Math.round(x), y: Math.round(centro - dimensao.altura / 2) });
            }
        });

        // Passada final: folga mínima garantida dentro de cada coluna (mesma coordenada transversal).
        desobrepor(posicoes, nos, medidas, espacamento.nos, vertical);

        // Normaliza para o quadrante positivo: filhos "à esquerda" (bilateral/direita-esquerda)
        // não podem nascer fora da viewport inicial (ficariam cortados e inalcançáveis).
        let menorX = Infinity, menorY = Infinity;
        posicoes.forEach(p => { menorX = Math.min(menorX, p.x); menorY = Math.min(menorY, p.y); });
        if (Number.isFinite(menorX) && menorX < 0) {
            posicoes.forEach(p => { p.x -= menorX; });
        }
        if (Number.isFinite(menorY) && menorY < 0) {
            posicoes.forEach(p => { p.y -= menorY; });
        }
        return posicoes;
    }

    /** Empurra os nós que dividem a mesma coluna até respeitarem a folga mínima (sem sobreposição). */
    function desobrepor(posicoes, nos, medidas, espaco, vertical) {
        const porColuna = new Map();
        nos.forEach(no => {
            const p = posicoes.get(no.id);
            if (!p) return;
            const chave = vertical ? String(p.y) : String(p.x);
            if (!porColuna.has(chave)) porColuna.set(chave, []);
            porColuna.get(chave).push(no.id);
        });
        porColuna.forEach(ids => {
            ids.sort((a, b) => {
                const pa = posicoes.get(a);
                const pb = posicoes.get(b);
                return vertical ? pa.x - pb.x : pa.y - pb.y;
            });
            let limite = -Infinity;
            ids.forEach(id => {
                const p = posicoes.get(id);
                const no = nos.find(item => item.id === id);
                const dimensao = dimensoesNo(no, medidas);
                const tamanho = vertical ? dimensao.largura : dimensao.altura;
                const valor = vertical ? p.x : p.y;
                if (valor < limite) {
                    if (vertical) p.x = Math.round(limite); else p.y = Math.round(limite);
                }
                limite = (vertical ? p.x : p.y) + tamanho + espaco;
            });
        });
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

    // 🔄 [INÍCIO: MAPA - MEDIÇÃO DO DOM (medidasDoDom)]
    /**
     * Lê as dimensões REAIS dos nós já renderizados (Fase 8): `#mapaNos .mapa-no`
     * → `offsetWidth/offsetHeight`. É o que permite o layout "sem sobreposição" usar
     * a caixa verdadeira (que varia com o conteúdo/fonte). Sem DOM, retorna vazio.
     */
    function medidasDoDom(grafo, raiz) {
        const medidas = new Map();
        const doc = global.document;
        if (!doc) return medidas;
        const escopo = raiz || doc.getElementById('mapaNos');
        if (!escopo) return medidas;
        ((grafo && grafo.nos) || []).forEach(no => {
            const el = escopo.querySelector('.mapa-no[data-mapa-no-id="' + no.id + '"]');
            if (!el || !el.offsetWidth) return;
            medidas.set(no.id, { largura: el.offsetWidth, altura: el.offsetHeight });
        });
        return medidas;
    }

    // 🔄 [FIM: MAPA - MEDIÇÃO DO DOM (medidasDoDom)]

    // 🔄 [INÍCIO: MAPA - API PÚBLICA]
    global.MapaMentalLayout = {
        LARGURA_PADRAO, ALTURA_PADRAO, ESPACO_MIN, ESPACO_MAX,
        estimarAltura, normalizarEspacamento, medidasDoDom,
        calcularPosicoes, garantirPosicoes, limites, minimapa, pontoDoMinimapa, medirNo
    };
    // 🔄 [FIM: MAPA - API PÚBLICA]
})(typeof window !== 'undefined' ? window : globalThis);
