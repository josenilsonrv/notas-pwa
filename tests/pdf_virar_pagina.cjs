// 🧪 [INÍCIO: TESTE - PDF VIRAR PAGINA]
/*
 * VIRADA DE LIVRO no visualizador de PDF (notes/pdf.js + StPageFlip em notes/flipjs/):
 *   A) ESTRUTURA: as páginas são FOLHAS MALEÁVEIS (`data-density="soft"`); o bloco do livro é o
 *      `.stf__parent` da lib, com `.stf__block` e `.stf__item` (a dobra pela lombada);
 *   B) BOTÕES ‹ ›: viram a folha e o contador acompanha (1-2 → 3-4 → 1-2);
 *   C) CLIQUE: clicar na página da DIREITA avança (vira p/ a esquerda) e na da ESQUERDA volta
 *      (vira p/ a direita) — como um livro de verdade;
 *   D) prefers-reduced-motion: navega SEM animação.
 * Servidor Node próprio (estático do PWA + /api/note-assets com HTTP RANGE), como em
 * pdf_visualizador.cjs: o WORKER do pdf.js busca arquivos REAIS (não passa por page.route).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

/** Gera um PDF mínimo e VÁLIDO em JS puro (sem dependência): cada item é `{texto}` ou `null`. */
function montarPdf(paginas) {
  const total = paginas.length;
  const fontNum = 3 + total * 2;
  const idConteudo = i => 3 + i * 2;
  const idPagina = i => 4 + i * 2;
  const obj = {};
  obj[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  obj[2] = `<< /Type /Pages /Kids [${paginas.map((_, i) => idPagina(i) + ' 0 R').join(' ')}] /Count ${total} >>`;
  obj[fontNum] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  paginas.forEach((pagina, i) => {
    const texto = (pagina && pagina.texto) ? String(pagina.texto).replace(/([()\\])/g, '\\$1') : '';
    const conteudo = texto ? `BT /F1 24 Tf 72 700 Td (${texto}) Tj ET` : '';
    obj[idConteudo(i)] = `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`;
    obj[idPagina(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontNum} 0 R >> >> /Contents ${idConteudo(i)} 0 R >>`;
  });
  let corpo = '%PDF-1.4\n';
  const offsets = [];
  for (let n = 1; n <= fontNum; n++) {
    offsets[n] = Buffer.byteLength(corpo, 'latin1');
    corpo += `${n} 0 obj\n${obj[n]}\nendobj\n`;
  }
  const inicioXref = Buffer.byteLength(corpo, 'latin1');
  let xref = `xref\n0 ${fontNum + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= fontNum; n++) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
  const trailer = `trailer\n<< /Size ${fontNum + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(corpo + xref + trailer, 'latin1');
}

const PDF = montarPdf(Array.from({ length: 6 }, (_, i) => ({ texto: 'Pagina ' + (i + 1) })));
const FIXTURES = { doc: { buffer: PDF, paginas: 6 } };

/** Resposta binária com `Accept-Ranges`/`206` (o que o pdf.js usa para buscar por trechos). */
function responderBinario(req, res, dados) {
  const cab = { 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  const faixa = req.headers.range;
  if (!faixa) { res.writeHead(200, { ...cab, 'Content-Length': dados.length }); return res.end(dados); }
  const achado = /bytes=(\d*)-(\d*)/.exec(faixa);
  let inicio = achado[1] === '' ? dados.length - Number(achado[2]) : Number(achado[1]);
  let fim = achado[2] === '' ? dados.length - 1 : Number(achado[2]);
  inicio = Math.max(0, inicio);
  fim = Math.min(fim, dados.length - 1);
  const parte = dados.subarray(inicio, fim + 1);
  res.writeHead(206, { ...cab, 'Content-Range': `bytes ${inicio}-${fim}/${dados.length}`, 'Content-Length': parte.length });
  res.end(parte);
}

function subirServidor() {
  return new Promise(resolve => {
    const servidor = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const pedacos = url.pathname.replace('/api/note-assets/files/', '').split('/');
      if (url.pathname.startsWith('/api/note-assets/files/')) {
        const fixture = FIXTURES[pedacos[0]];
        if (!fixture) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"detail":"nao encontrado"}'); }
        if (pedacos[1] === 'info') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ name: 'extrato.pdf', kind: 'pdf', mime: 'application/pdf', size: fixture.buffer.length, pages: fixture.paginas }));
        }
        return responderBinario(req, res, fixture.buffer);
      }
      if (url.pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{}'); }
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const alvo = path.join(RAIZ, rel);
      if (!alvo.startsWith(RAIZ) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) { res.writeHead(404); return res.end('nao encontrado'); }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(alvo).pipe(res);
    });
    servidor.listen(0, '127.0.0.1', () => resolve({ servidor, porta: servidor.address().port }));
  });
}

(async () => {
  const { servidor, porta } = await subirServidor();
  const base = 'http://127.0.0.1:' + porta + '/';
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const erros = [];
  const read = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const html = read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');

  /** Sobe uma página com o app montado (motor + visualizador de PDF) e o anexo 'doc' registrado. */
  const novaPagina = async (viewport, reduzido) => {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', e => erros.push(e.message));
    if (reduzido) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/*', r => r.request().resourceType() === 'document' ? r.fulfill({ contentType: 'text/html', body: html }) : r.continue());
    await page.goto(base);
    for (const f of ['styles.css', 'notes/editor.css', 'notes/extras.css']) await page.addStyleTag({ content: read(f) });
    for (const f of ['notes/flipjs/page-flip.browser.js', 'notes/editor.js', 'notes/extras.js', 'notes/tables.js', 'notes/pdf.js']) await page.addScriptTag({ content: read(f) });
    const fonte = read('app.js');
    await page.addScriptTag({ content: fonte.slice(0, fonte.indexOf("document.addEventListener('DOMContentLoaded'")) + '\nwindow.TestApp = NotesPWA;' });
    await page.evaluate(() => {
      window.app = Object.create(TestApp.prototype);
      app.userId = 1;
      app.showToast = () => {};
      if (!TestApp.prototype.__motorInstalado) {
        installNotesEditor(TestApp);
        installNotesExtras(TestApp);
        installNotesTables(TestApp);
        if (typeof installLocalNotesStorage === 'function') installLocalNotesStorage(TestApp);
        TestApp.prototype.__motorInstalado = true;
      }
      const link = document.createElement('a');
      link.dataset.noteAsset = 'doc';
      link.href = '/api/note-assets/files/doc';
      link.textContent = 'extrato.pdf';
      link.style.cssText = 'position:fixed;left:5px;top:5px;z-index:99999';
      document.body.append(link);
    });
    return page;
  };

  const abrir = page => page.evaluate(() => app.notesFileViewer('doc'));
  const contador = page => page.locator('.notes-pdf-pagina').textContent();
  const esperaContador = (page, re) => page.waitForFunction(
    src => new RegExp(src).test(document.querySelector('.notes-pdf-pagina').textContent), re, { timeout: 8000 });
  try {
    // ---------- A) ESTRUTURA: folhas maleáveis + bloco do livro ----------
    const page = await novaPagina({ width: 1280, height: 960 }, false);
    await abrir(page);
    await page.waitForFunction(() => { const i = document.querySelector('.notes-pdf-img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 30000 });
    assert.equal(await page.locator('.notes-pdf-livro').evaluate(e => e.classList.contains('stf__parent')), true, 'o bloco vira o .stf__parent da lib');
    assert.equal(await page.locator('.notes-pdf-livro .stf__block').count(), 1, 'a lib monta o .stf__block');
    assert.equal(await page.locator('.notes-pdf-page[data-density="soft"]').count(), 6, 'as 6 páginas são folhas maleáveis (soft)');
    assert.match(await contador(page), /1\s*-\s*2\s*\/\s*6/, 'abre em 1-2 / 6');
    await page.waitForSelector('.notes-pdf-lombada.visivel', { timeout: 8000 });
    assert.equal(await page.locator('.notes-pdf-lombada.visivel').count(), 1, 'o vinco central (lombada) aparece entre as DUAS páginas');
    const desvioLombada = await page.evaluate(() => {
      const l = document.querySelector('.notes-pdf-lombada');
      const cl = l.getBoundingClientRect();
      const paginas = [...document.querySelectorAll('.notes-pdf-page')].map(el => el.getBoundingClientRect()).filter(c => c.width > 1);
      const meio = (Math.min(...paginas.map(c => c.left)) + Math.max(...paginas.map(c => c.right))) / 2;
      return Math.abs(cl.left + cl.width / 2 - meio);
    });
    assert.ok(desvioLombada < 4, 'a lombada fica exatamente entre as duas páginas (desvio=' + desvioLombada.toFixed(1) + 'px)');

    // ---------- B) BOTÕES ‹ › viram a folha ----------
    await page.getByRole('button', { name: 'Próxima página' }).click();
    await esperaContador(page, '3\\s*-\\s*4\\s*/\\s*6');
    await page.getByRole('button', { name: 'Página anterior' }).click();
    await esperaContador(page, '1\\s*-\\s*2\\s*/\\s*6');

    // ---------- C) CLIQUE: direita avança (dobra p/ a esquerda), esquerda volta ----------
    const caixa = await page.locator('.notes-pdf-livro').boundingBox();
    await page.mouse.click(caixa.x + caixa.width * 0.9, caixa.y + caixa.height * 0.5);   // página da DIREITA
    await esperaContador(page, '3\\s*-\\s*4\\s*/\\s*6');
    await page.mouse.click(caixa.x + caixa.width * 0.1, caixa.y + caixa.height * 0.5);   // página da ESQUERDA
    await esperaContador(page, '1\\s*-\\s*2\\s*/\\s*6');
    await page.close();

    // ---------- D) prefers-reduced-motion: navega SEM animação ----------
    const reduzida = await novaPagina({ width: 1280, height: 960 }, true);
    await abrir(reduzida);
    await reduzida.waitForFunction(() => { const i = document.querySelector('.notes-pdf-img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 30000 });
    await reduzida.getByRole('button', { name: 'Próxima página' }).click();
    await reduzida.waitForFunction(() => /3\s*-\s*4\s*\/\s*6/.test(document.querySelector('.notes-pdf-pagina').textContent), null, { timeout: 8000 });
    await reduzida.close();

    assert.deepEqual(erros, [], 'sem erro de página: ' + erros.join(' | '));
    console.log('OK: virada de livro do PDF — folhas soft, botões ‹ ›, clique (direita avança / esquerda volta) e reduced-motion');
  } catch (falha) {
    if (erros.length) console.error('erros de página:', erros.join(' | '));
    throw falha;
  } finally {
    await browser.close();
    servidor.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - PDF VIRAR PAGINA]
