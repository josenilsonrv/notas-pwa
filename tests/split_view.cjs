// 🧪 [INÍCIO: TESTE - SPLIT VIEW]
/*
 * FRENTE 4 - Vínculo Notas↔Mapa + visão lado a lado (PC).
 * Cobre: vincular uma nota a um nó pelo painel, o atalho "abrir nota" no card,
 * o botão de lado a lado (opt-in), Nota e Mapa visíveis juntos e o gesto de
 * ARRASTAR a barra superior para o lado inverso (troca os lados, com persistência).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, hasTouch: true });
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    page.on('dialog', d => d.accept().catch(() => {}));

    const html = ler('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.route('**/*', rota => (rota.request().resourceType() === 'document'
      ? rota.fulfill({ contentType: 'text/html', body: html })
      : rota.abort()));
    await page.goto('http://notes.test');
    for (const f of ['styles.css', 'theme-origem.css', 'notes/editor.css', 'notes/extras.css', 'notes/tables.css', 'mapa/mapa.css']) {
      await page.addStyleTag({ content: ler(f) });
    }
    for (const f of ['notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js']) {
      await page.addScriptTag({ content: ler(f) });
    }
    const fonte = ler('app.js');
    await page.addScriptTag({ content: fonte.slice(0, fonte.indexOf("document.addEventListener('DOMContentLoaded'")) + '\nwindow.TestApp = NotesPWA;' });
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-layout.js', 'mapa/mapa-render.js', 'mapa/mapa-painel.js', 'mapa/mapa-cores.js', 'mapa/mapa-interacao.js', 'mapa/mapa.js']) {
      await page.addScriptTag({ content: ler(f) });
    }

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      window.app = Object.create(TestApp.prototype);
      app.userId = 'local';
      app.projectsData = [{ id: 'nota-x', nome: 'Minha Nota', notas: '<p>x</p>', pastaId: null }];
      app.focusStagesData = [];
      app.ensureNotesFocusPage = () => {};
      app.showToast = () => {};
      if (!TestApp.prototype.__motorInstalado) {
        installNotesEditor(TestApp);
        if (typeof installNotesExtras === 'function') installNotesExtras(TestApp);
        if (typeof installNotesTables === 'function') installNotesTables(TestApp);
        if (typeof installLocalNotesStorage === 'function') installLocalNotesStorage(TestApp);
        TestApp.prototype.__motorInstalado = true;
      }
      if (typeof installMapaMental === 'function') installMapaMental(TestApp);
      app.setupModalListeners();
      if (app.setupEventListeners) app.setupEventListeners();
      localStorage.clear();
      document.getElementById('notesModalBackdrop').classList.add('active');
      app.inicializarAreasMapa();
      app.aplicarArea('mapa');
      const grafo = window.MapaMentalStore.criarMapa('Split', null);
      const no = window.MapaMentalModelo.criarNo(grafo, { titulo: 'Tópico' });
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
      app.noTesteId = no.id;
      app.mapaSelecao = new Set([no.id]);
      app.mapaAbrirPainel(no.id);
    });

    const split = () => page.evaluate(() => ({
      appSplit: document.documentElement.classList.contains('app-split'),
      notaDireita: document.documentElement.classList.contains('app-split-nota-direita'),
      mapaVisivel: !document.getElementById('mapaArea').hidden,
      backdropAtivo: document.getElementById('notesModalBackdrop').classList.contains('active')
    }));

    // ---------------------------------------------------------------- 1) vincular a nota ao nó
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaPainelNotaRef'))), true, 'painel tem o seletor de nota');
    await page.evaluate(() => {
      const sel = document.getElementById('mapaPainelNotaRef');
      sel.value = 'nota-x';
      document.getElementById('mapaPainelForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.nos.find(n => n.notaRef)?.notaRef), 'nota-x', 'nó guarda o vínculo com a nota');

    // ---------------------------------------------------------------- 2) atalho "abrir nota" no card
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.mapa-no-nota-icone'))), true, 'card mostra o atalho da nota');
    assert.equal(await page.evaluate(() => document.querySelector('.mapa-no-nota-icone').closest('.mapa-no').dataset.mapaNoId), await page.evaluate(() => app.noTesteId), 'atalho está no nó certo');

    // ---------------------------------------------------------------- 3) abrir a nota LADO A LADO (não por cima)
    await page.evaluate(() => document.querySelector('.mapa-no-nota-icone').click());
    await page.waitForTimeout(150);
    const aposAtalho = await split();
    assert.equal(await page.evaluate(() => app.currentNotesProjectId), 'nota-x', 'clique no atalho abre a nota vinculada');
    assert.equal(aposAtalho.appSplit, true, 'o atalho abre em modo LADO A LADO (não por cima)');
    assert.equal(aposAtalho.mapaVisivel, true, 'o mapa continua visível ao lado');
    assert.equal(aposAtalho.backdropAtivo, true, 'a nota aparece ao lado do mapa');

    // ---------------------------------------------------------------- 4) lado a lado (opt-in)
    await page.evaluate(() => app.aplicarArea('mapa'));
    assert.equal((await split()).appSplit, false, 'começa fora do modo lado a lado');
    await page.locator('#mapaSplitBtn').click();
    await page.waitForTimeout(120);
    const ligado = await split();
    assert.equal(ligado.appSplit, true, 'botão liga o modo lado a lado');
    assert.equal(ligado.mapaVisivel, true, 'mapa visível no split');
    assert.equal(ligado.backdropAtivo, true, 'nota visível no split');
    assert.equal(ligado.notaDireita, false, 'nota começa à esquerda');
    assert.equal(await page.evaluate(() => window.app.mapaSplitLado), 'esquerda', 'lado padrão da nota = esquerda');

    // ---------------------------------------------------------------- 5) arrastar a barra troca os lados
    await page.evaluate(() => {
      const cabecalho = document.querySelector('.notes-modal-header');
      cabecalho.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 300, clientY: 30 }));
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 1100, clientY: 30 }));
    });
    await page.waitForTimeout(80);
    assert.equal((await split()).notaDireita, true, 'arrastar a barra da nota para a direita troca os lados');
    assert.equal(await page.evaluate(() => window.app.mapaSplitLado), 'direita', 'lado da nota persistido como direita');

    // ---------------------------------------------------------------- 6) sair do split
    await page.locator('#mapaSplitBtn').click();
    await page.waitForTimeout(120);
    assert.equal((await split()).appSplit, false, 'botão desliga o modo lado a lado');

    assert.deepEqual(erros, [], 'sem erros de página');
    console.log('OK: vínculo Nota↔Mapa + lado a lado (opt-in, arrastar troca o lado)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - SPLIT VIEW]
