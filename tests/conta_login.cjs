// 🧪 [INÍCIO: TESTE - CONTA LOGIN]
/*
 * Conta OPCIONAL (login por e-mail/senha): botão "Entrar" + diálogo.
 *
 * Boot REAL (`new NotesPWA()` -> init -> installNotesFeatures -> installConta), com o
 * app servido dos ARQUIVOS do repo e a API `/api/auth/*` INTERCEPTADA:
 *   1) SEM backend (rotas abortadas): o app sobe e funciona, o diálogo abre e o erro é
 *      amigável ("Não foi possível falar com o servidor") — nada quebra (P62);
 *   2) COM backend (stub): entrar, erro de credencial inline, criar conta, sair (com
 *      `X-CSRF`) e o botão voltando para "Entrar" — e, no PC (1280×900), o botão fica
 *      no CANTO ESQUERDO (pastilha só de ícone: âncora única em qualquer largura);
 *   3) `Esc` e clique FORA fecham o diálogo.
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
        return rota.abort();
    });
    // Registrado DEPOIS do catch-all: as rotas do Playwright têm prioridade LIFO.
    if (api) await api(page);
    await page.goto('http://notes.test/');
    await page.waitForFunction(() => window.__notasPronto === true);
};

const novoEstado = () => {
    const alvo = { logado: false, email: '', csrf: 'csrf-de-teste' };
    alvo.sessao = () => ({ id: 'u-1', email: alvo.email, criado_em: 1, csrf: alvo.csrf, provedor: 'senha', foto: '' });
    alvo.entrar = email => { alvo.logado = true; alvo.email = email; };
    alvo.sair = () => { alvo.logado = false; alvo.email = ''; };
    return alvo;
};

/** Stub do backend: guarda cada chamada para conferir caminho, corpo e `X-CSRF`. */
const instalarApi = (page, estado, chamadas) => page.route('**/api/auth/**', rota => {
    const pedido = rota.request();
    const caminho = new URL(pedido.url()).pathname.replace('/api/auth', '');
    chamadas.push({
        caminho,
        metodo: pedido.method(),
        csrf: pedido.headers()['x-csrf'] || '',
        corpo: pedido.postData() || ''
    });
    const json = (status, dados) => rota.fulfill({ status, contentType: 'application/json', body: JSON.stringify(dados) });
    if (caminho === '/me') {
        return estado.logado ? json(200, estado.sessao()) : json(401, { detail: 'sem sessao' });
    }
    if (caminho === '/login') {
        const corpo = JSON.parse(pedido.postData() || '{}');
        if (String(corpo.senha) === 'senha-certa') {
            estado.entrar(corpo.email);
            return rota.fulfill({ status: 204, body: '' });
        }
        return json(401, { detail: 'E-mail ou senha invalidos' });
    }
    if (caminho === '/registrar') {
        estado.entrar(JSON.parse(pedido.postData() || '{}').email);
        return rota.fulfill({ status: 204, body: '' });
    }
    if (caminho === '/logout') {
        if (!pedido.headers()['x-csrf']) return json(403, { detail: 'CSRF invalido' });
        estado.sair();
        return rota.fulfill({ status: 204, body: '' });
    }
    return json(404, { detail: 'rota desconhecida' });
});

(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'msedge' });
 try {
  // ---------- 1) SEM backend: o app sobe, funciona e o erro é amigável ----------
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await montar(page, null);

  assert.equal((await page.locator('#contaBtn').textContent()).trim(), 'Entrar', 'deslogado o botão diz Entrar');
  assert.equal(await page.locator('#contaBtn').getAttribute('aria-label'), 'Entrar na sua conta');
  assert.equal(await page.locator('#notesEditor').count(), 1, 'o app abriu normal (o editor existe)');
  assert.equal(await page.evaluate(() => window.notasConta.logado), false, 'sem sessão, deslogado');

  const dialogo = page.locator('.conta-dialog');
  await page.locator('#contaBtn').click();
  await dialogo.waitFor();
  assert.equal(await dialogo.locator('h3').textContent(), 'Conta');
  await dialogo.locator('#contaEmail').fill('dona@exemplo.com');
  await dialogo.locator('#contaSenha').fill('senha-certa');
  await dialogo.getByRole('button', { name: 'Entrar', exact: true }).click();
  await dialogo.locator('.conta-erro:not([hidden])').waitFor();
  assert.equal((await dialogo.locator('.conta-erro').textContent()).trim(), 'Não foi possível falar com o servidor.');
  assert.equal(await page.evaluate(() => window.notasConta.logado), false, 'falhou ao entrar: continua deslogado');
  assert.deepEqual(erros, [], 'backend desligado NÃO gera erro de página (P62)');

  // `Esc` fecha o diálogo.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.conta-dialog'));
  await page.close();

  // ---------- 2) COM backend (stub) ----------
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erros2 = [];
  page2.on('pageerror', e => erros2.push(e.message));
  const chamadas = [];
  const estado = novoEstado();
  await montar(page2, p => instalarApi(p, estado, chamadas));
  await esperar(page2, () => chamadas.some(c => c.caminho === '/me'));
  assert.equal((await page2.locator('#contaBtn').textContent()).trim(), 'Entrar', '401 no /me = deslogado');

  // 2.0) Âncora no PC (1280×900): o botão "Entrar" fica no CANTO ESQUERDO, como no
  //      celular — a antiga centralização na "metade livre" saiu —, e a pastilha é só
  //      ÍCONE em qualquer largura, então os 3.5rem reservados nas barras do topo
  //      bastam para o título da área ao lado não ficar sob o botão.
  const caixaBotao = await page2.locator('#contaBtn').boundingBox();
  assert.ok(caixaBotao.x < 60, 'o botão "Entrar" fica no canto ESQUERDO no PC, x=' + caixaBotao.x);
  assert.ok(caixaBotao.width < 60, 'no PC a pastilha também é SÓ ÍCONE, w=' + caixaBotao.width);
  assert.equal(
    await page2.evaluate(() => getComputedStyle(document.querySelector('.notes-modal-header')).paddingLeft),
    '56px', 'o cabeçalho de Notas reserva 3.5rem para o título não ficar sob o botão'
  );

  // 2.1) senha errada: erro inline e SEGUE no formulário
  const caixa = page2.locator('.conta-dialog');
  await page2.locator('#contaBtn').click();
  await caixa.waitFor();
  assert.equal(await caixa.locator('#contaEmail').count(), 1, 'o diálogo deslogado tem os campos');
  await caixa.locator('#contaEmail').fill('dona@exemplo.com');
  await caixa.locator('#contaSenha').fill('errada');
  await caixa.getByRole('button', { name: 'Entrar', exact: true }).click();
  await caixa.locator('.conta-erro:not([hidden])').waitFor();
  assert.equal((await caixa.locator('.conta-erro').textContent()).trim(), 'E-mail ou senha invalidos');
  assert.equal(await caixa.locator('#contaSenha').count(), 1, 'continua no formulário depois do erro');
  assert.equal((await page2.locator('#contaBtn').textContent()).trim(), 'Entrar');

  // 2.2) senha certa: logado — o botão passa a mostrar o e-mail (sem foto: isto não é Google)
  await caixa.locator('#contaSenha').fill('senha-certa');
  await caixa.getByRole('button', { name: 'Entrar', exact: true }).click();
  await esperar(page2, async () => (await page2.locator('#contaBtn').textContent()).trim() === 'dona@exemplo.com');
  assert.equal(await page2.locator('#contaBtn img.conta-btn-foto').count(), 0, 'sessão por senha não tem foto do Google');
  assert.equal(await page2.locator('#contaBtn svg').count(), 1, 'fica o ícone de pessoa + o e-mail');
  assert.equal(await page2.locator('#contaBtn').getAttribute('aria-label'), 'Conta de dona@exemplo.com');
  assert.equal(await page2.evaluate(() => window.notasConta.provedor), 'senha');
  assert.equal((await caixa.locator('.conta-email').textContent()).trim(), 'dona@exemplo.com', 'o diálogo mostra o e-mail');
  assert.ok(((await caixa.locator('.conta-sync').textContent()) || '').trim().length > 0, 'o diálogo mostra a situação do sync');
  assert.equal(await page2.evaluate(() => window.notasConta.logado), true);
  assert.equal(await page2.evaluate(() => window.notasConta.email), 'dona@exemplo.com');
  const login = chamadas.filter(c => c.caminho === '/login').pop();
  assert.equal(login.metodo, 'POST');
  assert.deepEqual(JSON.parse(login.corpo), { email: 'dona@exemplo.com', senha: 'senha-certa' });

  // 2.3) sair: POST /logout COM X-CSRF e o botão volta para "Entrar"
  await caixa.getByRole('button', { name: 'Sair da conta' }).click();
  await esperar(page2, () => !estado.logado);
  const saida = chamadas.filter(c => c.caminho === '/logout').pop();
  assert.equal(saida.metodo, 'POST');
  assert.equal(saida.csrf, 'csrf-de-teste', 'o logout leva o X-CSRF da sessão');
  await esperar(page2, async () => (await page2.locator('#contaBtn').textContent()).trim() === 'Entrar');
  assert.equal(await caixa.locator('#contaEmail').count(), 1, 'o diálogo voltou ao formulário');

  // 2.4) criar conta: já sai logado
  await caixa.locator('#contaEmail').fill('nova@exemplo.com');
  await caixa.locator('#contaSenha').fill('senha-certa');
  await caixa.getByRole('button', { name: 'Criar conta' }).click();
  await esperar(page2, () => estado.logado && estado.email === 'nova@exemplo.com');
  assert.ok(chamadas.some(c => c.caminho === '/registrar' && c.metodo === 'POST'), 'criou conta via POST /registrar');
  await esperar(page2, async () => (await page2.locator('#contaBtn').textContent()).trim() === 'nova@exemplo.com');

  // 2.5) clique FORA fecha o diálogo (padrão P67)
  await page2.mouse.click(5, 880);
  await page2.waitForFunction(() => !document.querySelector('.conta-dialog'));

  assert.deepEqual(erros2, [], 'sem erro de página no fluxo logado');
  await page2.close();

  console.log('OK: conta opcional — botão, diálogo, login, erro genérico, criar conta, logout com CSRF e fechamento');
 } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - CONTA LOGIN]
