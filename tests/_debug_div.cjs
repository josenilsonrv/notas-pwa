const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const html = ler('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.route('**/*', r => r.request().resourceType() === 'document' ? r.fulfill({ contentType: 'text/html', body: html }) : r.abort());
    await page.goto('http://notes.test');
    for (const f of ['styles.css', 'theme-origem.css', 'notes/editor.css', 'notes/extras.css', 'notes/tables.css', 'mapa/mapa.css']) await page.addStyleTag({ content: ler(f) });
    for (const f of ['notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js']) await page.addScriptTag({ content: ler(f) });
    const fonte = ler('app.js');
    await page.addScriptTag({ content: fonte.slice(0, fonte.indexOf("document.addEventListener('DOMContentLoaded'")) + '\nwindow.TestApp = NotesPWA;' });
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-layout.js', 'mapa/mapa-render.js', 'mapa/mapa-painel.js', 'mapa/mapa-cores.js', 'mapa/mapa-interacao.js', 'mapa/mapa.js']) await page.addScriptTag({ content: ler(f) });
    await page.evaluate(() => {
      window.app = Object.create(window.TestApp.prototype);
      app.userId = 'local'; app.projectsData = [{ id: 'nota-x', nome: 'N', notas: '', pastaId: null }];
      app.focusStagesData = []; app.ensureNotesFocusPage = () => {}; app.showToast = () => {};
      installNotesEditor(window.TestApp); installMapaMental(window.TestApp);
      app.setupModalListeners(); localStorage.clear();
      const g = window.MapaMentalStore.criarMapa('S', null); window.MapaMentalStore.salvarGrafo(g);
      app.mapaAbertaId = g.id;
      app.inicializarAreasMapa(); app.aplicarArea('mapa'); app.aplicarSplit(true);
    });
    const snap = () => page.evaluate(() => {
      const d = document.getElementById('appSplitDivisor');
      const b = document.getElementById('notesModalBackdrop').getBoundingClientRect();
      const m = document.getElementById('mapaArea').getBoundingClientRect();
      const cs = d ? getComputedStyle(d) : null;
      const r = d ? d.getBoundingClientRect() : null;
      const top = document.elementFromPoint(640, 400);
      return {
        divisor: d ? { hidden: d.hidden, display: cs.display, left: cs.left, width: cs.width, z: cs.zIndex, x: Math.round(r.x), w: Math.round(r.width) } : null,
        nota: Math.round(b.width), mapa: Math.round(m.width),
        topoNoDivisor: top ? (top.id || top.className || top.tagName) : null
      };
    });
    const viewport = () => page.evaluate(() => JSON.stringify(window.app.mapaCanvasViewport || {}));
    console.log('ANTES:', JSON.stringify(await snap()), 'vp=', await viewport());
    // Arrasta na BORDA DO MAPA (fora do divisor de 24px: boundary+14 = 654) para x=400.
    await page.mouse.move(654, 400);
    await page.mouse.down();
    await page.mouse.move(520, 400, { steps: 3 });
    await page.mouse.move(400, 400, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(80);
    console.log('DEPOIS:', JSON.stringify(await snap()), 'vp=', await viewport());
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
