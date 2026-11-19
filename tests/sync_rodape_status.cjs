// 🧪 [INÍCIO: TESTE - SYNC RODAPE STATUS]
/*
 * P124 — o rodapé de Notas diz o estado REAL da alteração:
 *   deslogado → "Salvo" (offline-first, como sempre);
 *   logado → "Enviando…", "Pendente — N na fila", "Sem conexão — N na fila",
 *   "Sessão expirada", "Falha ao salvar" e, só com a fila vazia, "Salvo" (sincronizado).
 * O motor fala "Salvo" assim que grava no aparelho: aqui provamos que isso NÃO basta para
 * o rodapé dizer que está sincronizado — e que nada disso re-renderiza a nota.
 *
 * Client-only (sem backend): a sessão é simulada no espelho `window.notasConta`.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const read = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
const TIPOS = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const CONTA = 'teste@exemplo.com';

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
        return rota.abort();
    });
    await page.goto('http://notes.test/');
    await page.waitForFunction(() => window.__notasPronto === true);
};

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await montar(page);
        await page.evaluate(async () => {
            window.__refeitos = 0;
            const app = window.notesApp;
            const original = app.openNotesModal.bind(app);
            app.openNotesModal = async function (...args) { window.__refeitos += 1; return original(...args); };
            app.aplicarArea('notas');
            await app.openNotesModal(window.notesApp.projectsData[0].id);
            window.__refeitos = 0;   // a abertura do teste não conta
        });
        await page.locator('#notesModalBackdrop.active').waitFor();
        await page.waitForTimeout(200);

        const ler = () => page.evaluate(() => {
            const el = document.getElementById('notesSaveStatus');
            return { texto: el.textContent, estado: el.dataset.estado || '', titulo: el.title, erro: el.classList.contains('is-error') };
        });
        const entrar = () => page.evaluate(conta => {
            window.notasConta = window.notasConta || {};
            window.notasConta.logado = true;
            window.notasConta.email = conta;
            window.notasConta.csrf = 'csrf-de-teste';
        }, CONTA);
        const fila = total => page.evaluate(({ conta, n }) => {
            if (!n) { localStorage.removeItem('notas-pwa-fila-sync'); return; }
            const lista = Array.from({ length: n }, (_, i) => ({
                seq: i + 1, op_id: 'op-' + i, conta, entidade: 'notas', acao: 'upsert',
                id: 'nota-' + i, dados: {}, base_rev: null, tentativas: 0, criado_em: new Date().toISOString()
            }));
            localStorage.setItem('notas-pwa-fila-sync', JSON.stringify(lista));
        }, { conta: CONTA, n: total });
        const estado = (nome, pendentes) => page.evaluate(({ nome, pendentes }) => window.notesApp.syncEstado(nome, pendentes), { nome, pendentes });

        // 1) DESLOGADO: "Salvo" é a verdade (só neste aparelho) e sem atributo de estado.
        const deslogado = await ler();
        assert.equal(deslogado.texto, 'Salvo', 'deslogado o rodapé segue "Salvo" (offline-first)');
        // "local" não tem regra de cor no CSS: deslogado o visual é exatamente o de antes.
        assert.equal(deslogado.estado, 'local', 'deslogado marca o estado "local"');

        await entrar();
        await fila(0);

        // 2) SINCRONIZADO (fila vazia): aqui sim é "Salvo".
        await estado('sincronizado', 0);
        const salvo = await ler();
        assert.equal(salvo.texto, 'Salvo', 'com fila vazia e nuvem confirmada → "Salvo"');
        assert.equal(salvo.estado, 'salvo');
        assert.ok(salvo.titulo.indexOf('Sincronizado') >= 0, 'o title explica o estado real');

        // 3) ENVIANDO.
        await fila(2);
        await estado('sincronizando', 2);
        assert.equal((await ler()).texto, 'Enviando…', 'enquanto envia, o rodapé mostra "Enviando…"');

        // 4) PENDENTE (com fila).
        await estado('pendente', 2);
        assert.equal((await ler()).texto, 'Pendente — 2 na fila', 'fila pendente aparece com o número');

        // 5) SEM CONEXÃO.
        await estado('offline', 2);
        assert.equal((await ler()).texto, 'Sem conexão — 2 na fila', 'offline com pendências é explícito');

        // 6) SESSÃO EXPIRADA.
        await estado('expirada', 1);
        assert.equal((await ler()).texto, 'Sessão expirada', 'sessão expirada é avisada no rodapé');

        // 7) O MOTOR diz "Salvo" ao gravar no aparelho — com fila, o rodapé NÃO pode dizer "Salvo".
        await fila(1);
        await estado('pendente', 1);
        await page.evaluate(() => window.notesApp.notesStatus('Salvo'));
        assert.equal((await ler()).texto, 'Pendente — 1 na fila', 'gravar no aparelho não é "sincronizado"');

        // 8) Editando: "Alterações pendentes" vira "Pendente".
        await fila(0);
        await estado('sincronizado', 0);
        await page.evaluate(() => window.notesApp.notesStatus('Alterações pendentes'));
        assert.equal((await ler()).texto, 'Pendente', 'antes de gravar no aparelho também é "Pendente"');

        // 9) Terminou de gravar e a nuvem confirmou: volta a "Salvo".
        await page.evaluate(() => window.notesApp.notesStatus('Salvo'));
        assert.equal((await ler()).texto, 'Salvo', 'fila vazia + nuvem confirmada → "Salvo"');

        // 10) Falha de gravação local: erro no rodapé (com o clique de retry).
        await page.evaluate(() => window.notesApp.notesStatus('Falha ao salvar — tentar novamente', true));
        const falha = await ler();
        assert.ok(falha.texto.indexOf('Falha') >= 0, 'falha de gravação aparece no rodapé');
        assert.ok(falha.erro, 'falha usa o estado de erro (clique para tentar de novo)');

        // Nada disto pode ter re-renderizado a nota.
        assert.equal(await page.evaluate(() => window.__refeitos), 0, 'o rodapé nunca re-renderiza a nota');
        assert.deepEqual(erros, [], 'sem erro de página');
        console.log('OK: rodapé mostra o estado REAL (salvo x pendente x enviando x offline x expirada x falha) sem re-renderizar a nota');
        await page.close();
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - SYNC RODAPE STATUS]
