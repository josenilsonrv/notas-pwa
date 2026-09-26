// 🧪 [INÍCIO: TESTE - MODO LOCAL SEM BACKEND]
/*
 * INVARIANTE do projeto (decisão nº 5 do plano + R7): SEM login e com o BACKEND DESLIGADO
 * (nenhuma rota `/api/*` responde — todas ABORTADAS), o app é EXATAMENTE o de hoje:
 *   1) sobe (`__notasPronto`), deslogado, e o editor abre/edita normalmente;
 *   2) a edição fica no LocalStorage e **NÃO** cria fila de sync (`notas-pwa-fila-sync`);
 *   3) nenhum WebSocket é aberto (`syncWs` ausente) e o estado do sync segue "local";
 *   4) recarregar mantém o texto (offline-first de verdade — LocalStorage é a fonte);
 *   5) nenhum erro de página.
 *
 * Serve os ARQUIVOS do repo (boot REAL: `installNotesFeatures` -> `installConta`/`installSync`)
 * por `page.route`, com um Service Worker vazio; qualquer `/api/**` cai em `abort()`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const read = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
const TIPOS = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/** Serve os arquivos REAIS do repo e ABORTA tudo o que não for arquivo — é o "backend fora". */
const montar = async page => {
    // Contexto novo já começa com o LocalStorage VAZIO (não limpar a cada navegação: o reload
    // precisa manter o texto para provar o offline-first).
    await page.route('**/*', rota => {
        const url = new URL(rota.request().url());
        if (url.pathname === '/sw.js') {
            // Service Worker vazio de propósito: não interfere no teste nem no cache.
            return rota.fulfill({ contentType: 'application/javascript', body: '// sw de teste' });
        }
        if (rota.request().resourceType() === 'document') {
            return rota.fulfill({ contentType: 'text/html; charset=utf-8', body: read('index.html') });
        }
        const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const alvo = path.join(RAIZ, rel);
        if (rel && alvo.toLowerCase().startsWith(RAIZ.toLowerCase()) && fs.existsSync(alvo) && !fs.statSync(alvo).isDirectory()) {
            return rota.fulfill({
                contentType: TIPOS[path.extname(alvo)] || 'application/octet-stream',
                body: fs.readFileSync(alvo)
            });
        }
        return rota.abort(); // `/api/**` e `/ws`: NADA do backend responde
    });
    await page.goto('http://notes.test/');
    await page.waitForFunction(() => window.__notasPronto === true);
};

/** Digita no editor pelo caminho real (o motor salva sozinho). */
const digitar = async (page, texto) => {
    await page.evaluate(() => window.notesApp.aplicarArea('notas'));
    await page.waitForTimeout(300);
    await page.locator('#notesEditor').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(texto);
    await page.waitForFunction(
        marca => JSON.stringify(JSON.parse(localStorage.getItem('notas-pwa-notes') || '[]')).includes(marca),
        texto,
        { timeout: 10000 }
    );
};

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        const pedidosApi = [];
        page.on('request', pedido => {
            const caminho = new URL(pedido.url()).pathname;
            if (caminho.indexOf('/api/') === 0) pedidosApi.push(caminho);
        });
        await montar(page);

        // 1) Sobe DESLOGADO e utilizável, mesmo com o backend fora.
        assert.equal(await page.evaluate(() => window.notasConta.logado), false, 'segue deslogado');
        assert.equal((await page.locator('#contaBtn').textContent()).trim(), 'Entrar', 'o botão continua "Entrar"');
        assert.equal(await page.evaluate(() => window.notesApp.syncWs || null), null, 'nenhum socket aberto');
        assert.equal(await page.evaluate(() => (window.notasConta.sync || {}).estado), 'local', 'o sync segue "local"');

        // 2) Editar salva no aparelho e NÃO cria fila de pendências.
        await digitar(page, 'texto offline');
        assert.ok(String(await page.evaluate(() => localStorage.getItem('notas-pwa-notes'))).includes('texto offline'), 'salvou no aparelho');
        const fila = await page.evaluate(() => localStorage.getItem('notas-pwa-fila-sync'));
        assert.ok(fila === null || JSON.parse(fila).length === 0, 'deslogado NÃO cria fila de sync');
        assert.equal(await page.evaluate(() => window.notesApp.syncFilaLer().length), 0, 'a fila do app está vazia');
        assert.equal(await page.evaluate(() => window.notesApp.syncWs || null), null, 'segue sem socket depois de editar');

        // 3) Recarregar mantém o texto: LocalStorage é a fonte da verdade.
        await page.reload();
        await page.waitForFunction(() => window.__notasPronto === true);
        assert.ok(String(await page.evaluate(() => localStorage.getItem('notas-pwa-notes'))).includes('texto offline'), 'o texto sobreviveu ao reload');
        assert.equal(await page.evaluate(() => window.notasConta.logado), false, 'continua deslogado depois do reload');

        assert.deepEqual(erros, [], 'sem erro de página no modo local');
        console.log('OK: modo local sem backend — sobe, edita, salva no aparelho, sem fila e sem socket (' + pedidosApi.length + ' /api tentados e ignorados)');
        await page.close();
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MODO LOCAL SEM BACKEND]
