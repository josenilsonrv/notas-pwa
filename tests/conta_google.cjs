// 🧪 [INÍCIO: TESTE - CONTA GOOGLE]
/*
 * Conta OPCIONAL — login com GOOGLE (Google Identity Services).
 *
 * Boot REAL (`new NotesPWA()` -> init -> installNotesFeatures -> installConta), com o app
 * servido dos ARQUIVOS do repo e a API `/api/auth/*` INTERCEPTADA. O script do GIS
 * (`https://accounts.google.com/gsi/client`) é SUBSTITUÍDO por um stub que renderiza o
 * botão e chama o callback com um `credential` — nenhuma rede, nenhum Google real.
 *   A) COM Google ativo: o botão aparece no diálogo e o clique abre a sessão (o botão do
 *      topo passa a mostrar o e-mail);
 *   B) SEM backend (`/api/**` abortado): o botão NÃO aparece, o script do GIS NÃO é
 *      carregado e o app segue 100% utilizável (invariante do modo local).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const read = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
const TIPOS = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

/** Espera uma condição no MESMO processo (o stub roda no Node, não na página). */
const esperar = async (page, condicao, ms = 5000) => {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
        if (await condicao()) return true;
        await page.waitForTimeout(50);
    }
    throw new Error('tempo esgotado esperando a condição');
};

/** Serve os arquivos REAIS do repo (boot de verdade) e prepara o stub da API. */
const montar = async (page, api) => {
    await page.addInitScript(() => { try { localStorage.clear(); } catch (_) { /* privado */ } });
    await page.route('**/*', rota => {
        const pedido = rota.request();
        const url = new URL(pedido.url());
        if (url.pathname === '/sw.js') {
            // Service Worker vazio de propósito: não interfere no teste nem no cache.
            return rota.fulfill({ contentType: 'application/javascript', body: '// sw de teste' });
        }
        if (pedido.resourceType() === 'document') {
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
        return rota.abort(); // `/api/**`, o GIS e o resto: nada responde (a não ser que o stub abaixo cubra)
    });
    // Registrado DEPOIS do catch-all: as rotas do Playwright têm prioridade LIFO.
    if (api) await api(page);
    await page.goto('http://notes.test/');
    await page.waitForFunction(() => window.__notasPronto === true);
};

/** Stub do GIS: mesmo contrato do script oficial (initialize/renderButton + callback). */
const GIS_FAKE = `
window.google = window.google || {};
window.google.accounts = {
    id: {
        initialize: function (opcoes) { window.__gisConfig = opcoes; },
        renderButton: function (alvo, opcoes) {
            window.__gisBotao = opcoes;
            var botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'gis-fake';
            botao.textContent = 'Entrar com Google';
            botao.addEventListener('click', function () {
                if (window.__gisConfig && window.__gisConfig.callback) {
                    window.__gisConfig.callback({ credential: 'cred-da-dona' });
                }
            });
            alvo.append(botao);
        }
    }
};
`;
// 🧪 [FIM: TESTE - CONTA GOOGLE - PARTE 1]

// 🧪 [INÍCIO: TESTE - CONTA GOOGLE - PARTE 2]
const novoEstado = () => {
    const alvo = { logado: false, email: '', csrf: 'csrf-de-teste' };
    alvo.sessao = () => ({ id: 'u-google', email: alvo.email, criado_em: 1, csrf: alvo.csrf });
    alvo.entrar = email => { alvo.logado = true; alvo.email = email; };
    return alvo;
};

/** Stub do backend: `curl /config` diz que o Google está ativo; `/google` troca por sessão. */
const instalarApi = (page, estado, chamadas) => (async () => {
    await page.route('https://accounts.google.com/gsi/client', rota => rota.fulfill({
        contentType: 'application/javascript; charset=utf-8',
        body: GIS_FAKE
    }));
    await page.route('**/api/auth/**', rota => {
        const pedido = rota.request();
        const caminho = new URL(pedido.url()).pathname.replace('/api/auth', '');
        chamadas.push({ caminho, metodo: pedido.method(), corpo: pedido.postData() || '' });
        const json = (status, dados) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(dados) });
        if (caminho === '/config') {
            return json(200, { google_ativo: true, google_client_id: 'cliente-de-teste.apps.googleusercontent.com' });
        }
        if (caminho === '/me') {
            return estado.logado ? json(200, estado.sessao()) : json(401, { detail: 'sem sessao' });
        }
        if (caminho === '/google') {
            const corpo = JSON.parse(pedido.postData() || '{}');
            if (corpo.credential === 'cred-da-dona') {
                estado.entrar('dona@gmail.com');
                return rota.fulfill({ status: 204, body: '' });
            }
            return json(401, { detail: 'credential invalido' });
        }
        if (caminho === '/logout') return rota.fulfill({ status: 204, body: '' });
        return json(404, { detail: 'rota desconhecida' });
    });
})();

(async () => {
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    try {
        // ---------- A) COM Google ativo: o botão aparece e o clique abre a sessão ----------
        const estado = novoEstado();
        const chamadas = [];
        const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await montar(page, pagina => instalarApi(pagina, estado, chamadas));

        assert.equal((await page.locator('#contaBtn').textContent()).trim(), 'Entrar', 'deslogado o botão diz Entrar');
        await page.locator('#contaBtn').click();
        const caixa = page.locator('.conta-dialog');
        await caixa.waitFor();

        const botaoGoogle = caixa.locator('.conta-google .gis-fake');
        await botaoGoogle.waitFor();
        assert.equal((await caixa.locator('.conta-google-divisor').textContent()).trim(), 'ou');
        const clienteId = await page.evaluate(() => window.__gisConfig.client_id);
        assert.ok(String(clienteId).startsWith('cliente-de-teste'), 'o Client ID veio do backend (/api/auth/config)');
        assert.equal(await page.locator('script[data-conta-gis]').count(), 1, 'o script do GIS foi injetado');

        await botaoGoogle.click();
        await esperar(page, async () => (await page.locator('#contaBtn').textContent()).trim() === 'dona@gmail.com');
        assert.ok(
            chamadas.some(c => c.caminho === '/google' && c.metodo === 'POST' && c.corpo.includes('cred-da-dona')),
            'o credential foi enviado no POST /api/auth/google'
        );
        assert.deepEqual(erros, [], 'sem erro de página com o Google ativo');
        await page.close();

        // ---------- B) SEM backend: o botão NÃO aparece e nada muda ----------
        const page2 = await browser.newPage({ viewport: { width: 390, height: 800 } });
        const erros2 = [];
        page2.on('pageerror', e => erros2.push(e.message));
        await montar(page2, null);

        assert.equal((await page2.locator('#contaBtn').textContent()).trim(), 'Entrar', 'segue deslogado');
        await page2.locator('#contaBtn').click();
        const caixa2 = page2.locator('.conta-dialog');
        await caixa2.waitFor();
        assert.equal(await caixa2.locator('#contaEmail').count(), 1, 'o formulário de e-mail/senha continua');
        assert.equal(await caixa2.locator('.conta-google').isHidden(), true, 'a caixa do Google fica escondida');
        assert.equal(await caixa2.locator('.conta-google button').count(), 0, 'nenhum botão do Google');
        assert.equal(await page2.locator('script[data-conta-gis]').count(), 0, 'o script do GIS não é carregado sem backend');
        assert.deepEqual(erros2, [], 'sem erro de página no modo local');
        console.log('OK: login com Google — botão só aparece com backend/Client ID; loga pelo GIS stubado; sem backend nada muda');
        await page2.close();
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - CONTA GOOGLE - PARTE 2]
