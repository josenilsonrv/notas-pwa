// 🧪 [INÍCIO: TESTE - SYNC WEBSOCKET]
/*
 * Sincronização em TEMPO REAL por WebSocket (seções 7–8), contra o backend REAL:
 *   1) duas páginas da MESMA conta conversam pelo socket (`hello`/`bemvindo`/`op`/`ack`/`change`);
 *   2) editar na 1ª aparece na 2ª **sem recarregar** (e o autor não recebe eco);
 *   3) sem rede (`setOffline`), a edição entra na FILA (`Offline — N na fila`) e NADA se perde;
 *   4) ao voltar a rede, a fila drena pelo socket e as duas páginas CONVERGEM;
 *   5) DESLOGADO nenhum socket é aberto (o app continua 100% local).
 *
 * Sobe um `uvicorn` próprio com `DRIVER=memory` (FICA NO AR durante todo o teste — é o que
 * permite "derrubar e religar a rede" sem perder a conta). Sem `.venv`, SAI com 0 e explica.
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

/** Digita no EDITOR (caminho real: o motor salva sozinho) e espera o autosave. */
const digitar = async (page, texto) => {
  await page.evaluate(() => window.notesApp.aplicarArea('notas'));
  await page.waitForTimeout(300);
  await page.locator('#notesEditor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(texto);
  await page.waitForTimeout(500);
};

const entrarNoApp = async (browser, base, caminho, email) => {
  const contexto = await browser.newContext();
  const page = await contexto.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => window.__notasPronto === true);
  assert.equal(await autenticar(page, caminho, email, SENHA), 204, 'autenticou em ' + email);
  await page.reload();
  await page.waitForFunction(() => window.notasConta && window.notasConta.logado === true);
  await page.waitForFunction(() => {
    const sync = window.notasConta.sync || {};
    return sync.estado === 'sincronizado' && !(sync.pendentes || 0);
  }, null, { timeout: 20000 });
  return { contexto, page, erros };
};

const fila = page => page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-fila-sync') || '[]').length);
const socketAberto = page => page.evaluate(() => Boolean(window.notesApp.syncWsAberto && window.notesApp.syncWsAberto()));
/** O socket abre depois do `syncAoEntrar` (é assíncrono): espera em vez de afirmar na hora. */
const esperarSocket = page => page.waitForFunction(
  () => Boolean(window.notesApp.syncWsAberto && window.notesApp.syncWsAberto()),
  null,
  { timeout: 15000 }
);
const textoDoEditor = page => page.evaluate(() => String(document.getElementById('notesEditor')?.textContent || ''));
const abrirNotas = page => page.evaluate(() => window.notesApp.aplicarArea('notas'));
const editorCom = (page, trecho) => page.waitForFunction(
  t => String(document.getElementById('notesEditor')?.textContent || '').includes(t),
  trecho,
  { timeout: 20000 }
);
/** Espera o trecho chegar à NUVEM (source of truth do sync, independente da memória do app). */
const naNuvem = (page, trecho) => page.waitForFunction(async t => {
  const corpo = await fetch('/api/sync/snapshot', { credentials: 'same-origin' }).then(r => r.json());
  return ((corpo.entidades || {}).notas || []).some(nota => String((nota.dados || {}).conteudo_html).includes(t));
}, trecho, { timeout: 20000 });


(async () => {
  const python = acharPython();
  if (!python) {
    console.log('SKIP backend: sem .venv (rode: pip install -r backend/requirements.txt)');
    process.exit(0);
  }
  const numero = await porta();
  const base = 'http://127.0.0.1:' + numero + '/';
  const email = 'ws-' + Date.now().toString(36) + '@exemplo.com';
  let backend = null;
  let aparelho1 = null;
  let aparelho2 = null;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    backend = await subirBackend(python, numero);

    // ---------- 1) DOIS APARELHOS da mesma conta, cada um com o SOCKET aberto ----------
    aparelho1 = await entrarNoApp(browser, base, 'registrar', email);
    await digitar(aparelho1.page, 'nota do aparelho um');
    await aparelho1.page.waitForFunction(() => {
      const sync = window.notasConta.sync || {};
      return sync.estado === 'sincronizado' && !(sync.pendentes || 0);
    }, null, { timeout: 20000 });
    await naNuvem(aparelho1.page, 'nota do aparelho um');

    aparelho2 = await entrarNoApp(browser, base, 'login', email);
    await esperarSocket(aparelho1.page);
    await esperarSocket(aparelho2.page);
    await naNuvem(aparelho2.page, 'nota do aparelho um');
    // Abre a área de Notas no 2º aparelho (o editor é quem prova o tempo real, passo 2).
    await abrirNotas(aparelho2.page);
    await aparelho2.page.waitForTimeout(500);

    // ---------- 2) TEMPO REAL: editar na 1ª aparece na 2ª SEM recarregar ----------
    await digitar(aparelho1.page, ' e chegou no tempo real');
    // O EDITOR do 2º aparelho mostra o texto sem reload (o app re-renderiza pelo caminho dele).
    await editorCom(aparelho2.page, 'chegou no tempo real');
    assert.equal(await fila(aparelho1.page), 0, 'o `ack` limpou a fila do autor');
    assert.equal(await fila(aparelho2.page), 0, 'o receptor não enfileira o `change` (sem eco)');

    // SEM REDE: o app descobre pelo caminho do socket (o `setOffline` do Chromium não fecha um
    // WebSocket já aberto — a `op` some sem `ack` e o timeout de resposta assume o controle).
    await aparelho1.contexto.setOffline(true);
    await digitar(aparelho1.page, ' escrita offline');
    await aparelho1.page.waitForFunction(
      () => (window.notasConta.sync || {}).estado === 'offline' && (window.notasConta.sync || {}).pendentes >= 1,
      null,
      { timeout: 25000 }
    );
    assert.ok(await fila(aparelho1.page) >= 1, 'a alteração offline ficou na fila');
    assert.ok(
      String(await aparelho1.page.evaluate(() => JSON.stringify(window.notesApp.projectsData))).includes('escrita offline'),
      'a alteração offline ficou no APARELHO'
    );

    // ---------- 4) VOLTA A REDE: a fila drena pelo socket e os dois convergem ----------
    await aparelho1.contexto.setOffline(false);
    await aparelho1.page.waitForFunction(() => {
      const sync = window.notasConta.sync || {};
      return sync.estado === 'sincronizado' && !(sync.pendentes || 0);
    }, null, { timeout: 30000 });
    assert.equal(await fila(aparelho1.page), 0, 'a fila foi drenada depois da reconexão');
    await esperarSocket(aparelho1.page);
    await naNuvem(aparelho1.page, 'escrita offline');
    await editorCom(aparelho2.page, 'escrita offline');

    // ---------- 5) DESLOGADO: nenhum socket é aberto ----------
    const anonimo = await browser.newContext();
    const page3 = await anonimo.newPage();
    const erros3 = [];
    page3.on('pageerror', e => erros3.push(e.message));
    await page3.goto(base);
    await page3.waitForFunction(() => window.__notasPronto === true);
    assert.equal(await page3.evaluate(() => window.notasConta.logado), false, 'sem sessão');
    assert.equal(await socketAberto(page3), false, 'deslogado NÃO abre socket');
    assert.equal(await page3.evaluate(() => window.notesApp.syncPronto === true), false, 'o sync nem ligou');
    assert.deepEqual(erros3, [], 'sem erro de página no aparelho deslogado');
    await anonimo.close();

    assert.deepEqual(aparelho1.erros, [], 'sem erro de página no 1º aparelho: ' + aparelho1.erros.join(' | '));
    assert.deepEqual(aparelho2.erros, [], 'sem erro de página no 2º aparelho: ' + aparelho2.erros.join(' | '));
    console.log('OK: WS — tempo real sem reload, fila offline, reconexão com backoff, sem socket deslogado');
  } catch (falha) {
    try {
      console.error('estado do 1º aparelho:', JSON.stringify(await aparelho1.page.evaluate(() => ({
        sync: window.notasConta && window.notasConta.sync,
        socket: Boolean(window.notesApp.syncWs),
        fila: JSON.parse(localStorage.getItem('notas-pwa-fila-sync') || '[]').length,
        notas: (window.notesApp.projectsData || []).map(n => String(n.notas || '').slice(-25))
      }))));
    } catch (_) { /* sem página para inspecionar */ }
    throw falha;
  } finally {
    await browser.close();
    if (backend) backend.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - SYNC WEBSOCKET]
