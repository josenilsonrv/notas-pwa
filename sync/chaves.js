/**
 * 🗺️ COMPONENTE: Mapa das chaves locais (`notas-pwa-*` / rascunhos) para o destino na nuvem
 * 🎯 OBJETIVO: Ser a ÚNICA fonte de verdade de "o que sobe, para onde e o que fica só no
 *              aparelho" — usada pela fila, pelo snapshot/1º login e pelo **teste-guarda**
 *              (`sync_chaves.cjs`), que FALHA se aparecer uma chave nova sem destino declarado.
 * 🔗 QUEM DEPENDE DELE: `sync/sync-cliente.js`, `tests/sync_chaves.cjs` e a documentação
 *              (`arquitetura.md`, seção 6 do plano).
 *
 * Regras (decididas com o dono do produto):
 *  - `entidade: null` = **fica só no aparelho**, com o motivo escrito (histórico de desfazer do
 *    mapa, rascunho de digitação, espelho legado e a própria fila de pendências).
 *  - Prefixos são checados NA ORDEM (o mais específico primeiro).
 */
// 💾 [INÍCIO: SYNC - MAPA DE CHAVES (local -> nuvem)]
(function (global) {
    'use strict';

    /** Chaves EXATAS do app. */
    const CHAVES = {
        'notas-pwa-notes': { tipo: 'notas', entidade: 'notas' },
        'notas-pwa-content': {
            tipo: 'espelho', entidade: null,
            motivo: 'espelho legado da nota ativa (derivado de notas-pwa-notes)'
        },
        'notas-pwa-nota-ativa': { tipo: 'config', entidade: 'configuracoes', chave: 'nota-ativa' },
        'notas-pwa-templates': { tipo: 'modelos', entidade: 'modelos', modelo: 'nota' },
        'notas-pwa-toolbar-order': { tipo: 'config', entidade: 'configuracoes', chave: 'toolbar-order' },
        'notas-pwa-theme': { tipo: 'config', entidade: 'configuracoes', chave: 'theme' },
        'notas-pwa-area-ativa': { tipo: 'config', entidade: 'configuracoes', chave: 'area-ativa' },
        'notas-pwa-pasta-ativa': { tipo: 'config', entidade: 'configuracoes', chave: 'pasta-ativa' },
        'notas-pwa-split': { tipo: 'config', entidade: 'configuracoes', chave: 'split' },
        'notas-pwa-maps': { tipo: 'mapas-indice', entidade: 'mapas' },
        'notas-pwa-mapa-pastas': { tipo: 'pastas', entidade: 'pastas' },
        'notas-pwa-mapa-templates': { tipo: 'modelos', entidade: 'modelos', modelo: 'mapa' },
        'notas-pwa-mapa-recentes': { tipo: 'config', entidade: 'configuracoes', chave: 'mapa-recentes' },
        'notas-pwa-mapa-ativo': { tipo: 'config', entidade: 'configuracoes', chave: 'mapa-ativo' },
        'notas-pwa-mapa-atalhos': { tipo: 'config', entidade: 'configuracoes', chave: 'mapa-atalhos' },
        'notas-pwa-mapa-toolbar-order': { tipo: 'config', entidade: 'configuracoes', chave: 'mapa-toolbar-order' },
        'notas-pwa-mapa-grade': { tipo: 'config', entidade: 'configuracoes', chave: 'mapa-grade' },
        'notas-pwa-sync-conta': {
            tipo: 'marca', entidade: null,
            motivo: 'marca local: qual conta já subiu o conteúdo deste aparelho'
        },
        'notas-pwa-fila-sync': {
            tipo: 'fila', entidade: null,
            motivo: 'fila de pendências: é da CONTA mas nunca sobe (só o conteúdo dela sobe)'
        }
    };

    /** Prefixos (ordem importa: o mais específico primeiro). */
    const PREFIXOS = [
        {
            prefixo: 'notas-pwa-mapa-historico-', tipo: 'mapa-historico', entidade: null,
            motivo: 'histórico de desfazer (Ctrl+Z) é por aparelho (decisão do dono)'
        },
        { prefixo: 'notas-pwa-mapa-', tipo: 'mapas-grafo', entidade: 'mapas' },
        {
            prefixo: 'notes-draft:', tipo: 'rascunho', entidade: null,
            motivo: 'rascunho de digitação é por aparelho (decisão do dono)'
        }
    ];

    /** Literais de PREFIXO (montados com `+ id`): não são chave final de configuração. */
    const LITERAIS_IGNORADOS = {
        'notas-pwa-mapa-': 'prefixo de montagem (notas-pwa-mapa-<id>)',
        'notas-pwa-mapa-historico-': 'prefixo de montagem (notas-pwa-mapa-historico-<id>)'
    };

    /** Resolve o destino de uma chave (exata ou por prefixo). `null` = desconhecida. */
    const destinoDaChave = chave => {
        const texto = String(chave || '');
        if (Object.prototype.hasOwnProperty.call(CHAVES, texto)) {
            return Object.assign({ chave: texto }, CHAVES[texto]);
        }
        const porPrefixo = PREFIXOS.find(item => texto.startsWith(item.prefixo));
        return porPrefixo ? Object.assign({ chave: texto }, porPrefixo) : null;
    };

    /** Chaves que SOBEM (têm entidade na nuvem). */
    const chavesSincronizadas = () => Object.keys(CHAVES).filter(chave => CHAVES[chave].entidade);

    global.NotasSyncChaves = {
        CHAVES,
        PREFIXOS,
        LITERAIS_IGNORADOS,
        destinoDaChave,
        chavesConhecidas: () => Object.keys(CHAVES),
        chavesSincronizadas
    };
})(typeof window !== 'undefined' ? window : globalThis);
// 💾 [FIM: SYNC - MAPA DE CHAVES (local -> nuvem)]
