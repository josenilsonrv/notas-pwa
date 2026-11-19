// 🧪 [INÍCIO: TESTE - PDF VISUALIZADOR]
/*
 * Visualizador de PDF como LIVRO (notes/pdf.js + StPageFlip em notes/flipjs/ + pdf.js vendorizado):
 *   A) TEXTO: um PDF de 1 página abre, RENDERIZA (canvas) e a busca acha o termo (índice);
 *   B) LIVRO: num PDF de 1000 páginas existem 1000 páginas e POUCOS canvas (desenho sob demanda);
 *      as páginas são FOLHAS MALEÁVEIS (`data-density="soft"`); o contador mostra o PAR (1-2 / N);
 *   C) NAVEGAÇÃO: os botões ‹ › viram a folha e o contador acompanha (3-4 → 1-2);
 *   D) ORIENTAÇÃO: o botão ↔ alterna UMA ⇄ DUAS páginas por tela; fechar destrói o LIVRO.
 *
 * Servidor Node (estático do PWA + `/api/note-assets` mockado com HTTP RANGE) porque o WORKER
 * do pdf.js busca arquivos REAIS — as requisições INTERNAS do worker não passam por `page.route`.
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

const PDF_TEXTO = montarPdf([{ texto: 'Extrato de teste MARCA123 fim' }]);
const PDF_GRANDE = montarPdf(Array.from({ length: 1000 }, (_, i) => (i === 0 ? { texto: 'Primeira pagina MARCA123' } : null)));
const FIXTURES = {
  texto: { buffer: PDF_TEXTO, paginas: 1 },
  grande: { buffer: PDF_GRANDE, paginas: 1000 },
};

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
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    page.on('pageerror', e => erros.push(e.message));
    const read = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
    const html = read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
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
    });

    const abrir = id => page.evaluate(id => {
      let link = document.querySelector('a[data-note-asset="' + id + '"]');
      if (!link) {
        link = document.createElement('a');
        link.dataset.noteAsset = id;
        link.href = '/api/note-assets/files/' + id;
        link.textContent = '📎 extrato.pdf';
        link.style.cssText = 'position:fixed;left:5px;top:5px;z-index:99999';
        document.body.append(link);
      }
      return app.notesFileViewer(id);
    }, id);

    const contador = () => page.locator('.notes-pdf-pagina').textContent();
    const paginaDesenhada = () => page.waitForFunction(
      () => [...document.querySelectorAll('.notes-pdf-img')].some(i => i.complete && i.naturalWidth > 10),
      null, { timeout: 40000 });

    // ---------- A) 1 página: abre, RENDERIZA e a BUSCA acha o termo ----------
    await abrir('texto');
    await paginaDesenhada();
    assert.equal(await page.locator('.notes-pdf-page').count(), 1, 'uma página');
    assert.equal(await page.locator('.notes-pdf-livro').evaluate(e => e.classList.contains('stf__parent')), true, 'a StPageFlip assume o bloco do livro');
    assert.equal(await page.locator('.notes-pdf-page').first().evaluate(e => e.dataset.density), 'soft', 'a folha é maleável (soft)');
    assert.match(await contador(), /1\s*\/\s*1/, 'contador 1 / 1');

    await page.locator('.notes-pdf-busca').fill('MARCA123');
    await page.locator('.notes-pdf-busca').press('Enter');
    await page.waitForFunction(() => /1 de 1/.test(document.querySelector('.notes-pdf-contador').textContent), null, { timeout: 15000 });

    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.waitForSelector('.notes-pdf-viewer', { state: 'detached', timeout: 5000 });

    // ---------- B) LIVRO: 1000 páginas, desenho sob demanda, folhas soft ----------
    await abrir('grande');
    await page.waitForFunction(() => document.querySelectorAll('.notes-pdf-page').length === 1000, null, { timeout: 40000 });
    await paginaDesenhada();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.notes-pdf-page[data-density="soft"]').count(), 1000, 'todas as páginas são folhas maleáveis');
    const desenhadas = await page.locator('.notes-pdf-img').evaluateAll(is => is.filter(i => i.complete && i.naturalWidth > 10).length);
    assert.ok(desenhadas > 0 && desenhadas < 20, 'só a vizinhança é desenhada (imgs=' + desenhadas + ')');
    assert.match(await contador(), /1\s*-\s*2\s*\/\s*1000/, 'contador em faixa (1-2 / 1000) no desktop');

    // ---------- C) NAVEGAÇÃO: ‹ › viram a folha e o contador acompanha ----------
    await page.getByRole('button', { name: 'Próxima página' }).click();
    await page.waitForFunction(() => /3\s*-\s*4\s*\/\s*1000/.test(document.querySelector('.notes-pdf-pagina').textContent), null, { timeout: 8000 });
    await page.getByRole('button', { name: 'Página anterior' }).click();
    await page.waitForFunction(() => /1\s*-\s*2\s*\/\s*1000/.test(document.querySelector('.notes-pdf-pagina').textContent), null, { timeout: 8000 });

    // ---------- D) ORIENTAÇÃO: ↔ alterna UMA ⇄ DUAS páginas ----------
    await page.getByRole('button', { name: 'Uma ou duas páginas por tela' }).click();
    await page.waitForFunction(() => /^\s*1\s*\/\s*1000/.test(document.querySelector('.notes-pdf-pagina').textContent), null, { timeout: 8000 });
    assert.equal(await page.locator('.notes-pdf-lombada.visivel').count(), 0, 'em UMA página não há vinco central');
    await page.getByRole('button', { name: 'Uma ou duas páginas por tela' }).click();
    await page.waitForFunction(() => /1\s*-\s*2\s*\/\s*1000/.test(document.querySelector('.notes-pdf-pagina').textContent), null, { timeout: 8000 });
    assert.equal(await page.locator('.notes-pdf-lombada.visivel').count(), 1, 'voltando a DUAS páginas o vinco central reaparece');

    // ---------- Fechar destrói o LIVRO ----------
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.waitForSelector('.notes-pdf-viewer', { state: 'detached', timeout: 5000 });
    assert.equal(await page.locator('.stf__parent').count(), 0, 'o livro (StPageFlip) é destruído ao fechar');

    assert.deepEqual(erros, [], 'sem erro de página: ' + erros.join(' | '));
    console.log('OK: visualizador de PDF como LIVRO — render, busca, 1000 páginas sob demanda, navegação e orientação');
  } catch (falha) {
    if (erros.length) console.error('erros de página:', erros.join(' | '));
    throw falha;
  } finally {
    await browser.close();
    servidor.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - PDF VISUALIZADOR]
