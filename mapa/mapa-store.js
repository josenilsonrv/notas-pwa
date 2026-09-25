// ============================================
// MAPA MENTAL - Persistência local (LocalStorage)
// Toda leitura/gravação em try/catch (iOS/privado pode lançar).
// Convenção de chaves do app: prefixo `notas-pwa-`.
// ============================================
(function (global) {
    'use strict';

    const CHAVES = {
        indice: 'notas-pwa-maps',
        pastas: 'notas-pwa-mapa-pastas',
        templates: 'notas-pwa-mapa-templates',
        recentes: 'notas-pwa-mapa-recentes',
        ativo: 'notas-pwa-mapa-ativo',
        area: 'notas-pwa-area-ativa',
        pastaAtiva: 'notas-pwa-pasta-ativa',
        split: 'notas-pwa-split',
        atalhos: 'notas-pwa-mapa-atalhos',
        barra: 'notas-pwa-mapa-toolbar-order'
    };
    const TETO_RECENTES = 20;
    const chaveGrafo = id => 'notas-pwa-mapa-' + id;
    const chaveHistorico = id => 'notas-pwa-mapa-historico-' + id;
    const novoId = prefixo => prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

    const ler = (chave, padrao) => {
        try {
            const bruto = global.localStorage.getItem(chave);
            return bruto ? JSON.parse(bruto) : padrao;
        } catch (_) { return padrao; }
    };
    const gravar = (chave, valor) => {
        try { global.localStorage.setItem(chave, JSON.stringify(valor)); return true; }
        catch (_) { return false; }
    };
    const remover = chave => { try { global.localStorage.removeItem(chave); } catch (_) { /* storage opcional */ } };
    const modelo = global.MapaMentalModelo;

    // 🔄 [INÍCIO: MAPA - ÁREA ATIVA]
    // Áreas do app: "Pastas" (tela raiz) | "Notas" | "Mapa".
    const AREAS = ['pastas', 'notas', 'mapa'];
    const lerAreaAtiva = () => { const valor = ler(CHAVES.area, 'pastas'); return AREAS.includes(valor) ? valor : 'pastas'; };
    const salvarAreaAtiva = area => gravar(CHAVES.area, AREAS.includes(area) ? area : 'notas');
    // 🔄 [FIM: MAPA - ÁREA ATIVA]

    // 🔄 [INÍCIO: MAPA - ATALHOS (FASE 10)]
    /** Preferências de atalho do usuário: `{ acaoId: ['ctrl+d', ...] }` (o resto usa o padrão). */
    const lerAtalhos = () => {
        const mapa = ler(CHAVES.atalhos, {});
        return (mapa && typeof mapa === 'object' && !Array.isArray(mapa)) ? mapa : {};
    };
    const salvarAtalhos = mapa => gravar(CHAVES.atalhos, (mapa && typeof mapa === 'object') ? mapa : {});
    const limparAtalhos = () => remover(CHAVES.atalhos);

    /** Ordem da barra de ferramentas por GRUPO: `{ grupo: [chaves...] }` (F12). */
    const lerOrdemBarra = () => {
        const mapa = ler(CHAVES.barra, {});
        return (mapa && typeof mapa === 'object' && !Array.isArray(mapa)) ? mapa : {};
    };
    const salvarOrdemBarra = mapa => gravar(CHAVES.barra, (mapa && typeof mapa === 'object') ? mapa : {});
    const limparOrdemBarra = () => remover(CHAVES.barra);
    // 🔄 [FIM: MAPA - ATALHOS (FASE 10)]

    // 🔄 [INÍCIO: MAPA - ÍNDICE/CRUD]
    const listarMapas = () => {
        const lista = ler(CHAVES.indice, []);
        return Array.isArray(lista) ? lista : [];
    };
    const salvarListaMapas = lista => gravar(CHAVES.indice, lista);
    const obterResumo = id => listarMapas().find(m => m.id === id) || null;

    function atualizarResumo(id, mudancas) {
        const lista = listarMapas();
        const alvo = lista.find(m => m.id === id);
        if (!alvo) return null;
        Object.assign(alvo, mudancas, { dtAlterado: new Date().toISOString() });
        salvarListaMapas(lista);
        return alvo;
    }

    function empilharResumo(grafo) {
        const lista = listarMapas();
        lista.push({
            id: grafo.id, nome: grafo.nome, pastaId: grafo.pastaId || null,
            favorito: false, arquivado: false, raiz: false,
            dtCriado: grafo.dtCriado, dtAlterado: grafo.atualizadoEm
        });
        salvarListaMapas(lista);
    }

    function criarMapa(nome, pastaId) {
        const id = novoId('mapa-');
        const grafo = modelo.criarGrafo({ id, nome: nome || 'Novo mapa', pastaId: pastaId || null });
        gravar(chaveGrafo(id), grafo);
        empilharResumo(grafo);
        return grafo;
    }

    function obterGrafo(id) {
        const grafo = ler(chaveGrafo(id), null);
        return grafo ? modelo.normalizarGrafo(grafo) : null;
    }

    function salvarGrafo(grafo) {
        if (!grafo || !grafo.id) return false;
        grafo.atualizadoEm = new Date().toISOString();
        atualizarResumo(grafo.id, { nome: grafo.nome, pastaId: grafo.pastaId || null });
        return gravar(chaveGrafo(grafo.id), grafo);
    }

    function renomearMapa(id, nome) {
        const grafo = obterGrafo(id);
        if (!grafo) return false;
        grafo.nome = nome || grafo.nome;
        return salvarGrafo(grafo);
    }

    /** Exclui o mapa e tudo que o referencia (grafo, histórico, recentes, nós-ponte). */
    function excluirMapa(id) {
        remover(chaveGrafo(id));
        remover(chaveHistorico(id));
        salvarListaMapas(listarMapas().filter(m => m.id !== id));
        salvarRecentes(listarRecentes().filter(r => r.idMapa !== id));
        // Nó-ponte que apontava para este mapa vira "referência quebrada" (avisa na UI).
        listarMapas().forEach(resumo => {
            const grafo = obterGrafo(resumo.id);
            if (!grafo) return;
            let alterou = false;
            grafo.nos.forEach(no => {
                if (no.mapaRef === id) { no.mapaRef = null; alterou = true; }
            });
            if (alterou) salvarGrafo(grafo);
        });
        if (lerMapaAtivo() === id) salvarMapaAtivo(null);
        return true;
    }

    function duplicarMapa(id, novoNome) {
        const origem = obterGrafo(id);
        if (!origem) return null;
        const copia = modelo.duplicarGrafo(origem, novoId('mapa-'), novoNome || (origem.nome + ' (cópia)'));
        gravar(chaveGrafo(copia.id), copia);
        empilharResumo(copia);
        return copia;
    }

    const favoritarMapa = (id, valor) => atualizarResumo(id, {
        favorito: valor === undefined ? !Boolean((obterResumo(id) || {}).favorito) : Boolean(valor)
    });
    const arquivarMapa = (id, valor) => atualizarResumo(id, {
        arquivado: valor === undefined ? !Boolean((obterResumo(id) || {}).arquivado) : Boolean(valor)
    });

    /** Move o mapa para uma pasta (ou para "sem pasta" com `null`). */
    function moverMapaParaPasta(id, pastaId) {
        const grafo = obterGrafo(id);
        if (!grafo) return false;
        grafo.pastaId = pastaId || null;
        return salvarGrafo(grafo);
    }

    /** Define UM mapa como raiz (Home); `null` remove a marcação. */
    function definirMapaRaiz(id) {
        const lista = listarMapas();
        lista.forEach(m => { m.raiz = Boolean(id) && m.id === id; });
        salvarListaMapas(lista);
        return obterMapaRaiz();
    }
    const obterMapaRaiz = () => listarMapas().find(m => m.raiz) || null;

    /** Lista filtrada/ordenada para a tela de gestão (índice leve, sem grafo). */
    function listarMapasFiltrados(opcoes) {
        const cfg = opcoes || {};
        const busca = String(cfg.busca || '').trim().toLowerCase();
        const pastaId = cfg.pastaId || 'todas';
        let lista = listarMapas();
        if (!cfg.incluirArquivados) lista = lista.filter(m => !m.arquivado);
        if (pastaId === 'favoritos') lista = lista.filter(m => m.favorito);
        else if (pastaId === 'sem-pasta') lista = lista.filter(m => !m.pastaId);
        else if (pastaId && pastaId !== 'todas') lista = lista.filter(m => m.pastaId === pastaId);
        if (busca) lista = lista.filter(m => String(m.nome || '').toLowerCase().includes(busca));
        const ordenacao = cfg.ordenacao || 'nome';
        if (ordenacao === 'recente') lista.sort((a, b) => String(b.dtAlterado || '').localeCompare(String(a.dtAlterado || '')));
        else if (ordenacao === 'favorito') lista.sort((a, b) => Number(Boolean(b.favorito)) - Number(Boolean(a.favorito)) || String(a.nome || '').localeCompare(String(b.nome || '')));
        else lista.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
        return lista;
    }

    /** Mapas que apontam para `idMapa` através de um nó-ponte (link bidirecional). */
    function listarBacklinks(idMapa) {
        const resultado = [];
        listarMapas().forEach(resumo => {
            if (resumo.id === idMapa) return;
            const grafo = obterGrafo(resumo.id);
            if (!grafo) return;
            grafo.nos.forEach(no => {
                if (no.mapaRef === idMapa) resultado.push({ idMapa: resumo.id, nome: resumo.nome, idNo: no.id });
            });
        });
        return resultado;
    }

    /** Saídas do grafo: nós-ponte para outros mapas (nome `null` = referência quebrada). */
    function listarSaidas(grafo) {
        if (!grafo) return [];
        const nomes = new Map(listarMapas().map(m => [m.id, m.nome]));
        return (grafo.nos || []).filter(no => no.mapaRef).map(no => ({
            idNo: no.id, idMapa: no.mapaRef, nome: nomes.get(no.mapaRef) || null
        }));
    }

    function listarReferenciasQuebradas(grafo) {
        return listarSaidas(grafo).filter(item => !item.nome).map(item => item.idMapa);
    }
    // 🔄 [FIM: MAPA - ÍNDICE/CRUD]

    // 🔄 [INÍCIO: MAPA - PASTAS/RECENTES/TEMPLATES/ATIVO]
    const listarPastas = () => {
        const lista = ler(CHAVES.pastas, []);
        return Array.isArray(lista) ? lista : [];
    };
    function criarPasta(nome, paiId) {
        const lista = listarPastas();
        const pasta = { id: novoId('pasta-'), nome: nome || 'Nova pasta', paiId: paiId || null };
        lista.push(pasta);
        gravar(CHAVES.pastas, lista);
        return pasta;
    }
    function renomearPasta(id, nome) {
        const lista = listarPastas();
        const pasta = lista.find(p => p.id === id);
        if (!pasta) return false;
        pasta.nome = nome || pasta.nome;
        return gravar(CHAVES.pastas, lista);
    }
    function excluirPasta(id) {
        gravar(CHAVES.pastas, listarPastas().filter(p => p.id !== id));
        const lista = listarMapas();
        lista.forEach(m => { if (m.pastaId === id) m.pastaId = null; });
        salvarListaMapas(lista);
        return true;
    }

    /** Id fixo da pasta "Geral" (adota itens sem pasta — notas e mapas). */
    const ID_PASTA_PADRAO = 'pasta-geral';

    /** Garante a existência da pasta padrão "Geral" (workspace raiz). */
    function garantirPastaPadrao() {
        const lista = listarPastas();
        let geral = lista.find(p => p.id === ID_PASTA_PADRAO);
        if (!geral) {
            geral = { id: ID_PASTA_PADRAO, nome: 'Geral', paiId: null };
            lista.unshift(geral);
            gravar(CHAVES.pastas, lista);
        }
        return geral;
    }

    /** Pasta/workspace ativa (tela raiz). */
    const lerPastaAtiva = () => {
        const valor = ler(CHAVES.pastaAtiva, null);
        return typeof valor === 'string' && valor ? valor : null;
    };
    const salvarPastaAtiva = id => gravar(CHAVES.pastaAtiva, id || null);

    /** Preferências da visão lado a lado (Nota + Mapa no PC) + proporção dos painéis. */
    const LIMITE_SPLIT = [0.2, 0.8];
    const normalizarRatio = valor => {
        const numero = Number(valor);
        if (!Number.isFinite(numero)) return 0.5;
        return Math.min(LIMITE_SPLIT[1], Math.max(LIMITE_SPLIT[0], numero));
    };
    const lerSplit = () => {
        const valor = ler(CHAVES.split, {});
        return {
            ligado: Boolean(valor && valor.ligado),
            lado: (valor && valor.lado === 'direita') ? 'direita' : 'esquerda',
            ratio: normalizarRatio(valor && valor.ratio)
        };
    };
    const salvarSplit = pref => gravar(CHAVES.split, {
        ligado: Boolean(pref && pref.ligado),
        lado: (pref && pref.lado === 'direita') ? 'direita' : 'esquerda',
        ratio: normalizarRatio(pref && pref.ratio)
    });

    /** Quantos mapas pertencem a uma pasta (a "Geral" também conta os sem pasta). */
    function contarMapasDaPasta(pastaId) {
        return listarMapas().filter(m => (m.pastaId || ID_PASTA_PADRAO) === pastaId).length;
    }

    const listarRecentes = () => {
        const lista = ler(CHAVES.recentes, []);
        return Array.isArray(lista) ? lista : [];
    };
    const salvarRecentes = lista => gravar(CHAVES.recentes, lista.slice(0, TETO_RECENTES));
    function registrarRecente(idMapa, idNo) {
        const lista = listarRecentes().filter(r => r.idMapa !== idMapa);
        lista.unshift({ idMapa, idNo: idNo || null, quando: new Date().toISOString() });
        salvarRecentes(lista);
    }

    const listarTemplates = () => {
        const lista = ler(CHAVES.templates, []);
        return Array.isArray(lista) ? lista : [];
    };
    function salvarTemplate(nome, grafo) {
        const lista = listarTemplates();
        lista.push({ id: novoId('tpl-'), nome: nome || 'Template', grafo: JSON.parse(JSON.stringify(grafo)), criadoEm: new Date().toISOString() });
        return gravar(CHAVES.templates, lista);
    }

    const lerMapaAtivo = () => {
        const valor = ler(CHAVES.ativo, null);
        return typeof valor === 'string' ? valor : null;
    };
    const salvarMapaAtivo = id => gravar(CHAVES.ativo, id || null);

    /** Cria um mapa novo a partir de um template salvo (IDs novos, sem compartilhar objetos). */
    function criarMapaDeTemplateSalvo(templateId, nome) {
        const template = listarTemplates().find(t => t.id === templateId);
        if (!template || !template.grafo) return null;
        const origem = modelo.normalizarGrafo(JSON.parse(JSON.stringify(template.grafo)));
        const copia = modelo.duplicarGrafo(origem, novoId('mapa-'), nome || template.nome || 'Novo mapa');
        gravar(chaveGrafo(copia.id), copia);
        empilharResumo(copia);
        return copia;
    }

    function excluirTemplate(id) {
        return gravar(CHAVES.templates, listarTemplates().filter(t => t.id !== id));
    }
    // 🔄 [FIM: MAPA - PASTAS/RECENTES/TEMPLATES/ATIVO]

    global.MapaMentalStore = {
        CHAVES, chaveGrafo, chaveHistorico,
        lerAreaAtiva, salvarAreaAtiva,
        lerAtalhos, salvarAtalhos, limparAtalhos,
        lerOrdemBarra, salvarOrdemBarra, limparOrdemBarra,
        listarMapas, salvarListaMapas, obterResumo, criarMapa, obterGrafo, salvarGrafo,
        renomearMapa, excluirMapa, duplicarMapa, favoritarMapa, arquivarMapa,
        moverMapaParaPasta, definirMapaRaiz, obterMapaRaiz, listarMapasFiltrados,
        listarBacklinks, listarSaidas, listarReferenciasQuebradas,
        listarPastas, criarPasta, renomearPasta, excluirPasta,
        ID_PASTA_PADRAO, garantirPastaPadrao, lerPastaAtiva, salvarPastaAtiva, contarMapasDaPasta,
        lerSplit, salvarSplit, LIMITE_SPLIT,
        listarRecentes, salvarRecentes, registrarRecente,
        listarTemplates, salvarTemplate, criarMapaDeTemplateSalvo, excluirTemplate,
        lerMapaAtivo, salvarMapaAtivo
    };
})(typeof window !== 'undefined' ? window : globalThis);
