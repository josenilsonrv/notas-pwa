// 🧪 [INÍCIO: TESTE - NOTES ANEXOS NUVEM]
/*
 * Anexos na CONTA (seção 9), contra o backend REAL (Supabase Storage = StorageMemoria):
 *   A) DESLOGADO: o anexo continua virando `data:` URL dentro da nota (P84 intacto, sem rede);
 *   B) 1º LOGIN: a MIGRAÇÃO converte o anexo antigo (`data:`) em objeto da conta (id no HTML);
 *   C) LOGADO: um anexo NOVO sobe para o Storage e abre pela URL `/api/note-assets/files/<id>`
 *      (imagem com o content-type certo; PDF com `attachment` — os cabeçalhos de segurança);
 *   D) VISUALIZADOR: `notesFileViewer` abre o anexo da conta em qualquer aparelho.
 *
 * Sem `.venv`, o teste SAI com 0 e explica (a suíte do PWA nunca quebra pelo backend).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
// 1x1 PNG de verdade (para o MIME e o conteúdo baterem).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

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
      if ((await fetch('http://127.0.0.1:' + numero + '/health')).ok) return processo;
    } catch (_) { /* ainda subindo */ }
    await new Promise(acordar => setTimeout(acordar, 250));
  }
  processo.kill();
  throw new Error('o backend nao subiu em 25 s');
};

/** Dispara o upload do app (o seletor de arquivos é capturado pelo Playwright). */
const enviarArquivo = async (page, imagem, arquivo) => {
  const [seletor] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.evaluate(ehImagem => window.notesApp.notesUpload(ehImagem), imagem)
  ]);
  await seletor.setFiles(arquivo);
  await page.waitForTimeout(1200);
};

const htmlDasNotas = page => page.evaluate(
  () => JSON.parse(localStorage.getItem('notas-pwa-notes') || '[]').map(n => String(n.notas || '')).join('\n')
);
const esperarNotas = (page, teste) => page.waitForFunction(t => {
  const html = JSON.parse(localStorage.getItem('notas-pwa-notes') || '[]').map(n => String(n.notas || '')).join('\n');
  return t.startsWith('!') ? !html.includes(t.slice(1)) : html.includes(t);
}, teste, { timeout: 25000 });


(async () => {
  const python = acharPython();
  if (!python) {
    console.log('SKIP backend: sem .venv (rode: pip install -r backend/requirements.txt)');
    process.exit(0);
  }
  const numero = await porta();
  const base = 'http://127.0.0.1:' + numero + '/';
  const email = 'anexo-' + Date.now().toString(36) + '@exemplo.com';
  let backend = null;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  let page = null;
  try {
    backend = await subirBackend(python, numero);
    const contexto = await browser.newContext();
    page = await contexto.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.__notasPronto === true);
    await page.evaluate(() => window.notesApp.aplicarArea('notas'));
    await page.waitForTimeout(400);

    // ---------- A) DESLOGADO: anexo vira `data:` local (o comportamento de hoje) ----------
    assert.equal(await page.evaluate(() => window.notasConta.logado), false, 'começa deslogado');
    await enviarArquivo(page, true, { name: 'antiga.png', mimeType: 'image/png', buffer: PNG });
    await esperarNotas(page, 'data:image/png');
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-fila-sync') || '[]').length),
      0,
      'deslogado NÃO cria fila de sync'
    );

    // ---------- B) 1º LOGIN: a migração leva o anexo antigo para a CONTA ----------
    await page.evaluate(async e => fetch('/api/auth/registrar', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e, senha: 'senha-de-teste-123' })
    }), email);
    await page.reload();
    await page.waitForFunction(() => window.notasConta.logado === true);
    await page.waitForFunction(() => {
      const sync = window.notasConta.sync || {};
      return sync.estado === 'sincronizado' && !(sync.pendentes || 0);
    }, null, { timeout: 30000 });
    await esperarNotas(page, '!data:image/png');
    await esperarNotas(page, '/api/note-assets/files/');

    const primeiroId = (await htmlDasNotas(page)).match(/\/api\/note-assets\/files\/([^"?]+)/)[1];
    const info = await page.evaluate(async id => {
      const resposta = await fetch('/api/note-assets/files/' + id + '/info', { credentials: 'same-origin' });
      return { status: resposta.status, corpo: await resposta.json() };
    }, primeiroId);
    assert.equal(info.status, 200, 'o anexo migrado existe na conta');
    assert.equal(info.corpo.kind, 'image');
    assert.equal(info.corpo.name, 'antiga.png');
    assert.ok(!('storage_path' in info.corpo), 'o caminho do Storage não vai ao cliente');
    await page.evaluate(() => window.notesApp.aplicarArea('notas'));
    await page.waitForTimeout(300);

    // ---------- C) LOGADO: anexo NOVO sobe para o Storage ----------
    await enviarArquivo(page, false, { name: 'relatorio.pdf', mimeType: 'application/pdf', buffer: PDF });
    await esperarNotas(page, 'relatorio.pdf');
    const anexos = await page.evaluate(async () => {
      const corpo = await fetch('/api/sync/snapshot', { credentials: 'same-origin' }).then(r => r.json());
      return ((corpo.entidades || {}).ativos || []).map(a => a.dados);
    });
    assert.equal(anexos.length, 2, 'os DOIS anexos estão na conta (o migrado e o novo)');
    assert.ok(anexos.some(a => a.nome === 'relatorio.pdf' && a.mime === 'application/pdf'));

    const idDoPdf = await page.evaluate(() => {
      const link = [...document.querySelectorAll('a[data-note-asset]')].find(a => /relatorio\.pdf/.test(a.textContent));
      return link ? link.dataset.noteAsset : '';
    });
    assert.ok(idDoPdf, 'o link da nota guarda SÓ o id do anexo');
    const baixado = await page.evaluate(async id => {
      const resposta = await fetch('/api/note-assets/files/' + id, { credentials: 'same-origin' });
      return {
        status: resposta.status,
        tipo: resposta.headers.get('content-type'),
        disposicao: resposta.headers.get('content-disposition'),
        nosniff: resposta.headers.get('x-content-type-options'),
        texto: await resposta.text()
      };
    }, idDoPdf);
    assert.equal(baixado.status, 200);
    assert.equal(baixado.tipo, 'application/pdf');
    assert.ok(baixado.disposicao.startsWith('attachment'), 'PDF nunca é servido inline');
    assert.equal(baixado.nosniff, 'nosniff');
    assert.ok(baixado.texto.startsWith('%PDF'), 'o binário volta igual');

    // ---------- D) VISUALIZADOR: abre o anexo da conta ----------
    await page.evaluate(id => window.notesApp.notesFileViewer(id), idDoPdf);
    await page.waitForSelector('.notes-file-viewer iframe', { timeout: 10000 });

    assert.deepEqual(erros, [], 'sem erro de página: ' + erros.join(' | '));
    console.log('OK: anexos na nuvem — migração do antigo, upload novo, download seguro e visualizador');
  } catch (falha) {
    try {
      console.error('estado:', JSON.stringify(await page.evaluate(() => ({
        logado: window.notasConta.logado,
        sync: window.notasConta.sync,
        fila: JSON.parse(localStorage.getItem('notas-pwa-fila-sync') || '[]').length,
        notas: JSON.parse(localStorage.getItem('notas-pwa-notes') || '[]').map(n => String(n.notas || '').slice(-70))
      }))));
    } catch (_) { /* sem página para inspecionar */ }
    throw falha;
  } finally {
    await browser.close();
    if (backend) backend.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - NOTES ANEXOS NUVEM]
