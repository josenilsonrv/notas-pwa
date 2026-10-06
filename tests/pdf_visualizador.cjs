// 🧪 [INÍCIO: TESTE - PDF VISUALIZADOR]
/*
 * Visualizador de PDF (notes/pdf.js + pdf.js vendorizado em notes/pdfjs/):
 *   A) TEXTO: um PDF de 1 página abre, RENDERIZA (canvas) e a camada de texto traz o conteúdo;
 *   B) VIRTUALIZAÇÃO: num PDF de 1000 páginas existem 1000 placeholders e POUCOS canvas (o
 *      custo não cresce com o total de páginas);
 *   C) BUSCA: acha o termo e navega (contador), sem travar;
 *   D) ZOOM controla a escala e o fechar libera o documento.
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
    for (const f of ['notes/editor.js', 'notes/extras.js', 'notes/tables.js', 'notes/pdf.js']) await page.addScriptTag({ content: read(f) });
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

    // ---------- A) TEXTO: renderiza + camada de texto + busca + zoom ----------
    await abrir('texto');
    await page.locator('.notes-pdf-page canvas').first().waitFor({ timeout: 25000 });
    assert.equal(await page.locator('.notes-pdf-page').count(), 1);
    const camada = await page.locator('.notes-pdf-page .textLayer').first().evaluate(e => e.textContent);
    assert.ok(camada.includes('MARCA123'), 'a camada de texto traz o conteúdo: ' + JSON.stringify(camada));
    assert.match(await page.locator('.notes-pdf-pagina').textContent(), /1\s*\/\s*1/);

    await page.locator('.notes-pdf-busca').fill('MARCA123');
    await page.locator('.notes-pdf-busca').press('Enter');
    await page.waitForFunction(() => /1 de 1/.test(document.querySelector('.notes-pdf-contador').textContent), null, { timeout: 15000 });

    const zoomAntes = await page.locator('.notes-pdf-zoom').textContent();
    await page.getByRole('button', { name: 'Ampliar' }).click();
    await page.waitForTimeout(400);
    assert.notEqual(await page.locator('.notes-pdf-zoom').textContent(), zoomAntes, 'o zoom muda a escala');

    // Leitura HORIZONTAL (esquerda → direita): páginas lado a lado.
    await page.getByRole('button', { name: 'Ver as páginas lado a lado (horizontal)' }).click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('.notes-pdf-scroll').evaluate(e => e.classList.contains('notes-pdf-horizontal')), true, 'o modo horizontal liga');
    assert.equal(await page.locator('.notes-pdf-pages').evaluate(e => getComputedStyle(e).flexDirection), 'row', 'as páginas ficam lado a lado');
    await page.getByRole('button', { name: 'Ver as páginas lado a lado (horizontal)' }).click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.notes-pdf-scroll').evaluate(e => e.classList.contains('notes-pdf-horizontal')), false, 'volta ao vertical');

    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.waitForSelector('.notes-pdf-viewer', { state: 'detached', timeout: 5000 });

    // ---------- B) VIRTUALIZAÇÃO: 1000 páginas, poucos canvas ----------
    await abrir('grande');
    await page.locator('.notes-pdf-page canvas').first().waitFor({ timeout: 40000 });
    assert.equal(await page.locator('.notes-pdf-page').count(), 1000, 'um placeholder leve por página');
    await page.waitForTimeout(600);
    const canvases = await page.locator('.notes-pdf-page canvas').count();
    assert.ok(canvases > 0 && canvases < 20, 'só a janela visível é renderizada (canvas=' + canvases + ')');
    assert.match(await page.locator('.notes-pdf-pagina').textContent(), /1\s*\/\s*1000/);

    // HORIZONTAL: DUAS páginas por vez (lado a lado), contador em faixa.
    await page.getByRole('button', { name: 'Ver as páginas lado a lado (horizontal)' }).click();
    await page.waitForTimeout(1000);
    assert.match(await page.locator('.notes-pdf-pagina').textContent(), /1\s*-\s*2\s*\/\s*1000/, 'contador em faixa (1-2 / 1000)');
    const visiveis = await page.evaluate(() => {
      const alvo = document.querySelector('.notes-pdf-scroll').getBoundingClientRect();
      return [...document.querySelectorAll('.notes-pdf-page')].filter(pagina => {
        const caixa = pagina.getBoundingClientRect();
        return caixa.left >= alvo.left - 3 && caixa.right <= alvo.right + 3;
      }).length;
    });
    assert.ok(visiveis >= 2, 'cabem DUAS páginas por vez no horizontal (visíveis=' + visiveis + ')');

    // CELULAR: no horizontal cabe só UMA página por vez.
    await page.setViewportSize({ width: 420, height: 760 });
    await page.waitForTimeout(1000);
    assert.match(await page.locator('.notes-pdf-pagina').textContent(), /^\s*1\s*\/\s*1000/, 'no celular o contador volta a "1 / 1000"');
    const visiveisMobile = await page.evaluate(() => {
      const alvo = document.querySelector('.notes-pdf-scroll').getBoundingClientRect();
      return [...document.querySelectorAll('.notes-pdf-page')].filter(pagina => {
        const caixa = pagina.getBoundingClientRect();
        return caixa.left >= alvo.left - 3 && caixa.right <= alvo.right + 3;
      }).length;
    });
    assert.equal(visiveisMobile, 1, 'no celular cabe só UMA página (visíveis=' + visiveisMobile + ')');
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: 'Ver as páginas lado a lado (horizontal)' }).click();
    await page.waitForTimeout(700);

    // Busca numa página distante: encontra sem varrer tudo de uma vez e o busca é da 1ª página.
    await page.locator('.notes-pdf-busca').fill('Primeira pagina');
    await page.locator('.notes-pdf-busca').press('Enter');
    await page.waitForFunction(() => /1 de 1/.test(document.querySelector('.notes-pdf-contador').textContent), null, { timeout: 40000 });
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.waitForSelector('.notes-pdf-viewer', { state: 'detached', timeout: 5000 });

    assert.deepEqual(erros, [], 'sem erro de página: ' + erros.join(' | '));
    console.log('OK: visualizador de PDF — render+texto, busca, zoom e virtualização (1000 páginas)');
  } catch (falha) {
    if (erros.length) console.error('erros de página:', erros.join(' | '));
    throw falha;
  } finally {
    await browser.close();
    servidor.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - PDF VISUALIZADOR]
