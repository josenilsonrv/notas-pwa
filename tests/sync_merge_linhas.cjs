// 🧪 [INÍCIO: TESTE - SYNC MERGE LINHAS]
/*
 * P124 — a experiência "Google Docs/Word" SEM OT/CRDT:
 *   1) MESCLA DE 3 VIAS: um aparelho edita a linha 2 e o outro a linha 5 → as DUAS edições
 *      sobrevivem (nada de documento inteiro vencendo o outro) e a tela não é reconstruída;
 *   2) DIGITANDO: uma versão da nuvem que chega no meio da digitação NÃO encosta no DOM —
 *      fica pendente e entra sozinha na primeira janela ociosa;
 *   3) NUVEM MAIS ANTIGA: é ignorada (o texto local nunca é rebaixado).
 *
 * Serve os ARQUIVOS do repo por `page.route` (boot REAL), com Service Worker vazio. É
 * client-only: aplica via `syncAplicarEntidades` (não precisa backend).
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

/** Linha no formato CANÔNICO do motor (id estável em `data-note-id`). */
const linha = (id, texto) => '<div class="notes-line" data-level="0" data-note-id="' + id
    + '" data-document-version="1"><div class="notes-line-text">' + texto + '</div></div>';

/** Nota de 6 linhas (b1..b6) — a BASE que os dois aparelhos conhecem. */
const htmlBase = () => [1, 2, 3, 4, 5, 6].map(n => linha('b' + n, 'linha ' + n)).join('');

/** Aplica UMA versão da nota pela mesma via do sync. */
const aplicar = (page, html, quando) => page.evaluate(({ conteudo, data }) => window.notesApp.syncAplicarEntidades({
    notas: [{
        id: window.notesApp.currentNotesProjectId,
        dados: { nome: 'Merge', conteudo_html: conteudo, atualizada_em: data },
        updated_at: data, deleted_at: null, rev: 9
    }]
}), { conteudo: html, data: quando || new Date(Date.now() + 60000).toISOString() });

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        const base = htmlBase();
        await page.addInitScript(html => {
            try {
                localStorage.setItem('notas-pwa-notes', JSON.stringify([{
                    id: 'nota-merge', nome: 'Merge', notas: html, pastaId: null,
                    criadaEm: '2024-01-01T00:00:00.000Z', atualizadaEm: '2024-01-01T00:00:00.000Z'
                }]));
                localStorage.setItem('notas-pwa-nota-ativa', JSON.stringify('nota-merge'));
            } catch (_) { /* about:blank */ }
        }, base);
        await montar(page);
        await page.evaluate(async () => {
            window.__refeitos = 0;
            const app = window.notesApp;
            const original = app.openNotesModal.bind(app);
            app.openNotesModal = async function (...args) { window.__refeitos += 1; return original(...args); };
            app.aplicarArea('notas');
            await app.openNotesModal('nota-merge');
        });
        await page.locator('#notesModalBackdrop.active').waitFor();
        await page.waitForTimeout(250);

        // A nuvem confirmou a BASE: é contra ela que as duas edições são comparadas.
        await page.evaluate(html => { window.notesApp.syncNotasBase = new Map([['nota-merge', html]]); }, base);
        const refeitosAntes = await page.evaluate(() => window.__refeitos);

        // ---------- 1) MESCLA: eu mudo a linha 2, o outro aparelho muda a linha 5 ----------
        const localEditado = base.replace('linha 2', 'linha 2 MINHA');
        const remotoEditado = base.replace('linha 5', 'linha 5 DO OUTRO');
        await page.evaluate(html => {
            const app = window.notesApp;
            const nota = app.projectsData.find(n => n.id === 'nota-merge');
            nota.notas = html;                       // a edição local (já salva no aparelho)
            if (app.notesSession) app.notesSession.saved = html;   // editor LIMPO (não está digitando)
            app.syncAtualizarEditorSilencioso(html);
        }, localEditado);
        await aplicar(page, remotoEditado);
        await page.waitForTimeout(350);
        const mesclado = await page.evaluate(() => ({
            projeto: (window.notesApp.projectsData.find(n => n.id === 'nota-merge') || {}).notas || '',
            tela: document.getElementById('notesEditor').textContent,
            refeitos: window.__refeitos
        }));
        assert.ok(mesclado.projeto.indexOf('MINHA') >= 0, 'a MINHA edição (linha 2) sobreviveu');
        assert.ok(mesclado.projeto.indexOf('DO OUTRO') >= 0, 'a edição do OUTRO aparelho (linha 5) sobreviveu');
        assert.ok(mesclado.tela.indexOf('MINHA') >= 0 && mesclado.tela.indexOf('DO OUTRO') >= 0, 'a tela mostra as duas edições');
        assert.equal(mesclado.refeitos, refeitosAntes, 'mesclar NÃO reabre o modal (0 "refresh")');

        // ---------- 2) DIGITANDO: a versão da nuvem espera (DOM intocado) ----------
        await page.locator('#notesEditor').click();
        await page.keyboard.press('Control+End');
        await page.keyboard.type(' DIGITANDO');
        const refeitosDigitando = await page.evaluate(() => window.__refeitos);
        await aplicar(page, base.replace('linha 6', 'linha 6 DA NUVEM'));
        await page.waitForTimeout(300);
        const durante = await page.evaluate(() => ({
            digitado: document.getElementById('notesEditor').textContent.indexOf('DIGITANDO') >= 0,
            refeitos: window.__refeitos,
            pendente: Boolean(window.notesApp.syncRemotoPendente
                && window.notesApp.syncRemotoPendente[String(window.notesApp.currentNotesProjectId)])
        }));
        assert.ok(durante.digitado, 'o que eu estava digitando CONTINUA na tela');
        assert.equal(durante.refeitos, refeitosDigitando, 'nada de re-render no meio da digitação');
        assert.ok(durante.pendente, 'a versão da nuvem ficou guardada para a janela ociosa');

        // ---------- 3) NUVEM MAIS ANTIGA: ignorada (o texto local prevalece) ----------
        await page.waitForTimeout(1600);   // autosave + janela ociosa
        const antesAntiga = await page.evaluate(() => document.getElementById('notesEditor').textContent);
        const refeitosAntesAntiga = await page.evaluate(() => window.__refeitos);
        await aplicar(page, base.replace(/linha/g, 'ANTIGA'), '2024-01-01T00:00:00.000Z');
        await page.waitForTimeout(300);
        const depoisAntiga = await page.evaluate(() => ({
            tela: document.getElementById('notesEditor').textContent,
            refeitos: window.__refeitos
        }));
        assert.ok(depoisAntiga.tela.indexOf('ANTIGA') < 0, 'a versão ANTIGA da nuvem foi ignorada');
        assert.equal(depoisAntiga.tela, antesAntiga, 'o texto local não foi rebaixado');
        assert.equal(depoisAntiga.refeitos, refeitosAntesAntiga, 'versão antiga não redesenha nada');

        assert.deepEqual(erros, [], 'sem erro de página');
        console.log('OK: merge por linha — edições dos dois aparelhos sobrevivem, digitação nunca é interrompida e versão antiga é ignorada');
        await page.close();
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - SYNC MERGE LINHAS]
