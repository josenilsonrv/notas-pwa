// 🧪 [INÍCIO: TESTE - SYNC SNAPSHOT]
/*
 * Sincronização de NOTAS por HTTP (seção 5), contra o backend REAL:
 *   1) DESLOGADO: editar salva no aparelho e **não** cria fila (offline intacto);
 *   2) 1º LOGIN (conta vazia): o conteúdo do aparelho SOBE em silêncio;
 *   3) EDIÇÃO logada: vira op na fila, o `ack` limpa a fila e a nuvem fica com o texto novo;
 *   4) SEGUNDO APARELHO: entra na mesma conta e VÊ o que foi escrito no primeiro.
 *
 * Sobe um `uvicorn` próprio com `DRIVER=memory` (sessão da conta vive no processo) e usa esse
 * origin — cookies/CSRF funcionam same-origin. Sem `.venv`, o teste SAI com 0 e explica
 * (mesmo contrato de `tests/backend_python.cjs`: a suíte do PWA nunca quebra por causa do backend).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const SENHA = 'senha-de-teste-123';

const acharPython = () => [
    process.env.PYTHON_BACKEND,
    path.join(RAIZ, '.venv', 'Scripts', 'python.exe'),
    path.join(RAIZ, '.venv', 'bin', 'python')
].find(caminho => caminho && fs.existsSync(caminho));

const porta = () => new Promise(resolve => {
    const servidor = net.createServer();
    servidor.listen(0, '127.0.0.1', () => {
        const numero = servidor.address().port;
        servidor.close(() => resolve(numero));
    });
});

const subirBackend = async (python, numero) => {
    const processo = spawn(
        python,
        ['-m', 'uvicorn', 'backend.app.main:app', '--port', String(numero), '--log-level', 'warning'],
        { cwd: RAIZ, env: Object.assign({}, process.env, { DRIVER: 'memory' }) }
    );
    const limite = Date.now() + 25000;
    while (Date.now() < limite) {
        try {
            const resposta = await fetch('http://127.0.0.1:' + numero + '/health');
            if (resposta.ok) return processo;
        } catch (_) { /* ainda subindo */ }
        await new Promise(acordar => setTimeout(acordar, 250));
    }
    processo.kill();
    throw new Error('o backend nao subiu em 25 s');
};

/** Registra/entra pelo PRÓPRIO origin da página (cookie + CSRF do app). */
const autenticar = (page, caminho, email, senha) => page.evaluate(async dados => {
    const resposta = await fetch('/api/auth/' + dados.caminho, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: dados.email, senha: dados.senha })
    });
    return resposta.status;
}, { caminho, email, senha });

const salvarNota = (page, html) => page.evaluate(conteudo => window.notesApp.apiCall('/projects/local', {
    method: 'PUT',
    body: JSON.stringify({ notas: conteudo })
}), html);

/** Digita no EDITOR (caminho real: o motor salva sozinho) e espera o autosave. */
const digitar = async (page, texto) => {
    // O app abre na tela de Pastas; a área de Notas é que revela o editor.
    await page.evaluate(() => window.notesApp.aplicarArea('notas'));
    await page.waitForTimeout(300);
    await page.locator('#notesEditor').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(texto);
    await page.waitForTimeout(500);
};

const conteudoLocal = page => page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('notas-pwa-notes') || '[]')));

const filaVazia = page => page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-fila-sync') || '[]').length === 0);

const esperarSincronizado = page => page.waitForFunction(() => {
    const sync = window.notasConta.sync || {};
    return sync.estado === 'sincronizado' && !(sync.pendentes || 0);
});

(async () => {
  const python = acharPython();
  if (!python) {
    console.log('SKIP backend: sem .venv (rode: pip install -r backend/requirements.txt)');
    process.exit(0);
  }
  const numero = await porta();
  const base = 'http://127.0.0.1:' + numero + '/';
  const email = 'sync-' + Date.now().toString(36) + '@exemplo.com';
  let backend = null;
  let page2 = null;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    backend = await subirBackend(python, numero);
    const ctx1 = await browser.newContext();
    const page = await ctx1.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.__notasPronto === true);

    // ---------- 1) DESLOGADO: digitar salva no aparelho e NÃO cria fila ----------
    assert.equal(await page.evaluate(() => window.notasConta.logado), false, 'boot sem sessão');
    await digitar(page, 'so local');
    // O autosave do motor tem timer próprio (~1 s): espera o aparelho gravar.
    await page.waitForFunction(
      () => JSON.stringify(JSON.parse(localStorage.getItem('notas-pwa-notes') || '[]')).includes('so local'),
      null,
      { timeout: 10000 }
    );
    assert.ok(await filaVazia(page), 'deslogado NÃO cria fila');
    assert.ok(String(await conteudoLocal(page)).includes('so local'), 'segue salvando no aparelho');
    const semSessao = await page.evaluate(() => fetch('/api/sync/snapshot', { credentials: 'same-origin' }).then(r => r.status));
    assert.equal(semSessao, 401, 'sem sessão, a nuvem responde 401 (não lê nem escreve)');

    // ---------- 2) 1º LOGIN (conta vazia): sobe o conteúdo do aparelho, em silêncio ----------
    assert.equal(await autenticar(page, 'registrar', email, SENHA), 204, 'registrou a conta');
    await page.reload();
    await page.waitForFunction(() => window.notasConta && window.notasConta.logado === true);
    await esperarSincronizado(page);
    const nuvem = await page.evaluate(() => fetch('/api/sync/snapshot', { credentials: 'same-origin' }).then(r => r.json()));
    assert.ok(nuvem.rev_global >= 1, 'o rev_global andou');
    assert.ok(
      nuvem.entidades.notas.some(nota => String(nota.dados.conteudo_html).includes('so local')),
      'o 1º login subiu o conteúdo que já existia no aparelho'
    );

    // ---------- 3) EDIÇÃO logada: fila -> ack -> nuvem ----------
    await digitar(page, ' oi da nuvem');
    // Espera o CONTEÚDO chegar na nuvem (o enfileiramento tem debounce e a drenagem é assíncrona).
    await page.waitForFunction(async () => {
      const corpo = await fetch('/api/sync/snapshot', { credentials: 'same-origin' }).then(r => r.json());
      return ((corpo.entidades || {}).notas || []).some(nota => String((nota.dados || {}).conteudo_html).includes('oi da nuvem'));
    }, null, { timeout: 15000 });
    // A fila esvazia DEPOIS do ack (o app segue salvando em paralelo, então esperamos).
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('notas-pwa-fila-sync') || '[]').length === 0,
      null,
      { timeout: 15000 }
    );
    await esperarSincronizado(page);

    // ---------- 4) SEGUNDO APARELHO: vê o que foi escrito no primeiro ----------
    const ctx2 = await browser.newContext();
    page2 = await ctx2.newPage();
    const erros2 = [];
    page2.on('pageerror', e => erros2.push(e.message));
    await page2.goto(base);
    await page2.waitForFunction(() => window.__notasPronto === true);
    assert.equal(await autenticar(page2, 'login', email, SENHA), 204, 'o 2º aparelho entrou na mesma conta');
    await page2.reload();
    await page2.waitForFunction(() => window.notasConta && window.notasConta.logado === true);
    await esperarSincronizado(page2);
    await page2.waitForFunction(() => (window.notesApp.projectsData || []).some(
      nota => String(nota.notas || '').includes('oi da nuvem')
    ), null, { timeout: 15000 });

    // ---------- 5) SAIR limpa a fila da conta ----------
    await page.evaluate(async () => {
      await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'X-CSRF': window.notasConta.csrf }
      });
    });
    await page.reload();
    await page.waitForFunction(() => window.__notasPronto === true);
    assert.equal(await page.evaluate(() => window.notasConta.logado), false, 'saiu da conta');
    assert.ok(await filaVazia(page), 'a fila não sobra para outra conta');

    assert.deepEqual(erros, [], 'sem erro de página no 1º aparelho');
    assert.deepEqual(erros2, [], 'sem erro de página no 2º aparelho');
    await ctx1.close();
    await ctx2.close();
    console.log('OK: sync HTTP — offline intacto, 1º login sobe tudo, edição chega na nuvem e o 2º aparelho vê');
  } catch (falha) {
    try {
      console.error('estado no 2º aparelho:', JSON.stringify(await (page2 || {}).evaluate?.(() => ({
        sync: window.notasConta && window.notasConta.sync,
        logado: !!(window.notasConta && window.notasConta.logado),
        notas: (window.notesApp && window.notesApp.projectsData ? window.notesApp.projectsData : []).map(n => String(n.notas || '').slice(0, 20))
      }))));
    } catch (_) { /* sem página para inspecionar */ }
    throw falha;
  } finally {
    await browser.close();
    if (backend) backend.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - SYNC SNAPSHOT]
