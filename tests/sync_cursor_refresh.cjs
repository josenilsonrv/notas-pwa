// 🧪 [INÍCIO: TESTE - SYNC CURSOR/REFRESH]
/*
 * P120 — o "refresh" do sync não pode deslocar o cursor/rolagem nem a viewport do mapa:
 *   1) NOTAS: com a nota aberta e a tela ROLADA, aplicar uma versão nova da nuvem re-renderiza o
 *      editor, mas a ROLAGEM volta ao ponto original (mesmo SEM caret selecionado — era o defeito);
 *   2) NOTAS: aplicar a MESMA versão (eco da própria gravação) NÃO re-renderiza (sem "refresh");
 *   3) MAPAS: um grafo que chega da nuvem NÃO sobrescreve a VIEWPORT do aparelho (o "scroll" do
 *      mapa é por aparelho) — mas os nós novos são aplicados.
 *
 * Serve os ARQUIVOS do repo por `page.route` (boot REAL: `installNotesFeatures` -> `installSync`),
 * com Service Worker vazio. É client-only: aplica via `syncAplicarEntidades` (não precisa backend).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const read = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
const TIPOS = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const montar = async page => {
    await page.route('**/*', rota => {
        const url = new URL(rota.request().url());
        if (url.pathname === '/sw.js') {
            return rota.fulfill({ contentType: 'application/javascript', body: '// sw de teste' });
        }
        if (rota.request().resourceType() === 'document') {
            return rota.fulfill({ contentType: 'text/html; charset=utf-8', body: read('index.html') });
        }
        const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const alvo = path.join(RAIZ, rel);
        if (rel && alvo.toLowerCase().startsWith(RAIZ.toLowerCase()) && fs.existsSync(alvo) && !fs.statSync(alvo).isDirectory()) {
            return rota.fulfill({ contentType: TIPOS[path.extname(alvo)] || 'application/octet-stream', body: fs.readFileSync(alvo) });
        }
        return rota.abort(); // `/api/**` e `/ws`: nada do backend responde
    });
    await page.goto('http://notes.test/');
    await page.waitForFunction(() => window.__notasPronto === true);
};

/** Conta os re-renders do editor (cada `syncRefazerEditor` chama `openNotesModal`). */
const contarRefeitos = page => page.evaluate(() => {
    window.__refeitos = 0;
    const alvo = window.notesApp;
    const original = alvo.openNotesModal.bind(alvo);
    alvo.openNotesModal = async function (...args) { window.__refeitos += 1; return original(...args); };
});

const htmlNota = marcador => {
    const linhas = [];
    for (let i = 1; i <= 80; i++) {
        linhas.push('<div class="notes-line" data-level="0"><div class="notes-line-text">linha ' + i + (marcador && i === 10 ? ' MARCADOR' : '') + '</div></div>');
    }
    return linhas.join('');
};

/** Aplica uma versão da nota pela mesma via do sync (client-side). */
const aplicarNota = (page, html) => page.evaluate(conteudo => window.notesApp.syncAplicarEntidades({
    notas: [{
        id: window.notesApp.currentNotesProjectId,
        dados: { nome: 'Cursor', conteudo_html: conteudo, atualizada_em: new Date(Date.now() + 60000).toISOString() },
        updated_at: new Date().toISOString(), deleted_at: null, rev: 7
    }]
}), html);

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        // Semeia a nota ANTES do boot (o app carrega `projectsData` do LocalStorage): uma nota
        // com MUITAS linhas para a área rolar de verdade.
        await page.addInitScript(html => {
            try {
                localStorage.setItem('notas-pwa-notes', JSON.stringify([{
                    id: 'nota-cursor', nome: 'Cursor', notas: html, pastaId: null,
                    criadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString()
                }]));
                localStorage.setItem('notas-pwa-nota-ativa', JSON.stringify('nota-cursor'));
            } catch (_) { /* about:blank */ }
        }, htmlNota(false));
        await montar(page);

        await page.evaluate(async () => { window.notesApp.aplicarArea('notas'); await window.notesApp.openNotesModal('nota-cursor'); });
        await page.locator('#notesModalBackdrop.active').waitFor();
        await contarRefeitos(page);

        // ---------- 1) SEM CARET: rolar e aplicar versão nova -> a rolagem tem de voltar ao ponto ----------
        const antes = await page.evaluate(() => {
            const container = document.getElementById('notesEditorContainer');
            container.scrollTop = 400;
            // Sem caret: tira a seleção do editor (era justamente este caso que quebrava a blindagem).
            const sel = window.getSelection(); if (sel) sel.removeAllRanges();
            return { scroll: container.scrollTop };
        });
        assert.ok(antes.scroll > 100, 'a nota rolou de verdade (scrollTop=' + antes.scroll + ')');
        await aplicarNota(page, htmlNota(true));
        await page.waitForTimeout(400);
        const depois = await page.evaluate(() => ({
            scroll: document.getElementById('notesEditorContainer').scrollTop,
            refeitos: window.__refeitos,
            marcador: document.getElementById('notesEditor').textContent.indexOf('MARCADOR') >= 0
        }));
        assert.equal(depois.refeitos, 1, 'a versão nova re-renderizou o editor (1x)');
        assert.ok(depois.marcador, 'o conteúdo novo da nuvem chegou ao editor');
        assert.ok(Math.abs(depois.scroll - antes.scroll) <= 2,
            'SEM CARET a rolagem volta ao ponto original (antes=' + antes.scroll + ', depois=' + depois.scroll + ')');

        // ---------- 2) SEM NOVIDADE (eco): aplicar a MESMA versão -> NÃO re-renderiza (sem "refresh") ----------
        const scrollAntesEco = await page.evaluate(() => document.getElementById('notesEditorContainer').scrollTop);
        await aplicarNota(page, htmlNota(true));   // mesmo conteúdo
        await page.waitForTimeout(300);
        const eco = await page.evaluate(() => ({
            refeitos: window.__refeitos,
            scroll: document.getElementById('notesEditorContainer').scrollTop
        }));
        assert.equal(eco.refeitos, 1, 'a MESMA versão NÃO re-renderiza (o contador não andou)');
        assert.equal(eco.scroll, scrollAntesEco, 'o eco não mexe na rolagem (nada foi re-renderizado)');

        // ---------- 3) MAPAS: a VIEWPORT do aparelho é preservada ao aplicar um grafo da nuvem ----------
        const mapaId = await page.evaluate(() => {
            const store = window.MapaMentalStore;
            const grafo = store.criarMapa('Mapa Cursor', null);
            window.MapaMentalModelo.criarNo(grafo, { titulo: 'A' });
            grafo.viewport = { x: 12, y: 34, zoom: 1.5 };   // a MINHA view
            store.salvarGrafo(grafo);
            return grafo.id;
        });
        await page.evaluate(id => {
            const cloud = JSON.parse(localStorage.getItem('notas-pwa-mapa-' + id));
            cloud.viewport = { x: 999, y: 999, zoom: 3 };    // a view do OUTRO aparelho
            cloud.nos.push({ id: 'no-novo', paiId: null, ordem: 1, titulo: 'No novo', posicao: { x: 5, y: 5 } });
            window.notesApp.syncAplicarEntidades({
                mapas: [{
                    id, dados: { nome: 'Mapa Cursor', pasta_id: null, grafo: cloud, item: { id, nome: 'Mapa Cursor' }, atualizada_em: new Date().toISOString() },
                    updated_at: new Date().toISOString(), deleted_at: null, rev: 9
                }]
            });
        }, mapaId);
        const mapa = await page.evaluate(id => JSON.parse(localStorage.getItem('notas-pwa-mapa-' + id)), mapaId);
        assert.deepEqual(mapa.viewport, { x: 12, y: 34, zoom: 1.5 }, 'a VIEWPORT do aparelho NÃO pulou para a do outro aparelho');
        assert.ok((mapa.nos || []).some(no => no.titulo === 'No novo'), 'o grafo da nuvem (nós) foi aplicado');

        assert.deepEqual(erros, [], 'sem erro de página');
        console.log('OK: sync não desloca cursor/rolagem (mesmo sem caret) nem a viewport do mapa; eco não re-renderiza');
        await page.close();
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - SYNC CURSOR/REFRESH]
