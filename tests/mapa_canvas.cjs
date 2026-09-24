/*
 * FASE 2 - Canvas infinito.
 * Cobre: mundo com transform, zoom (botões, Ctrl+scroll, pinça) com limites,
 * pan por Pointer Events, centralizar/ajustar à tela/ir para a raiz, minimapa
 * e restauração da última posição/zoom (viewport por mapa, com debounce).
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
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-layout.js', 'mapa/mapa-render.js', 'mapa/mapa-interacao.js', 'mapa/mapa.js']) {
      await page.addScriptTag({ content: ler(f) });
    }

    const criado = await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      window.app = Object.create(TestApp.prototype);
      app.userId = 'local';
      app.projectsData = [{ id: 'local', nome: 'Teste', notas: '' }];
      app.focusStagesData = [];
      app.ensureNotesFocusPage = () => {};
      app.showToast = () => {};
      installNotesEditor(TestApp);
      installMapaMental(TestApp);
      app.setupModalListeners();
      localStorage.clear();
      document.getElementById('notesModalBackdrop').classList.add('active');
      app.inicializarAreasMapa();
      app.aplicarArea('mapa');
      // Mapa com nós (template pronto) para dar "mundo" ao canvas.
      const grafo = window.MapaMentalStore.criarMapa('Canvas', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'simples');
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
      return { id: grafo.id, nos: grafo.nos.length };
    });
    const mapaId = criado.id;

    // ---------------------------------------------------------------- helpers
    const clicarAcao = acao => page.evaluate(a => {
      const el = document.querySelector('[data-mapa-acao="' + a + '"]');
      if (!el) throw new Error('ação não encontrada: ' + a);
      el.click();
    }, acao);
    const vp = () => page.evaluate(() => ({ ...window.app.mapaCanvasViewport }));
    const caixaCanvas = () => page.evaluate(() => {
      const r = document.getElementById('mapaCanvas').getBoundingClientRect();
      return { left: r.left, top: r.top, largura: r.width, altura: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    const perto = (a, b, tolerancia = 1.5) => Math.abs(a - b) <= tolerancia;

    // ---------------------------------------------------------------- estrutura do canvas
    const estrutura = await page.evaluate(() => ({
      canvas: Boolean(document.getElementById('mapaCanvas')),
      mundo: Boolean(document.getElementById('mapaMundo')),
      nos: document.querySelectorAll('#mapaNos .mapa-no').length,
      minimapa: Boolean(document.getElementById('mapaMinimapa')),
      viewportRect: Boolean(document.getElementById('mapaMinimapaViewport')),
      transform: document.getElementById('mapaMundo').style.transform
    }));
    assert.equal(estrutura.canvas, true, 'canvas existe');
    assert.equal(estrutura.mundo, true, 'mundo (container com transform) existe');
    assert.equal(estrutura.nos, criado.nos, 'todos os nós renderizados');
    assert.equal(estrutura.minimapa, true, 'minimapa existe');
    assert.equal(estrutura.viewportRect, true, 'retângulo da viewport no minimapa');
    assert.match(estrutura.transform, /scale\(1\)/, 'viewport inicial com zoom 1');

    const posicoes = await page.evaluate(id => {
      const grafo = window.MapaMentalStore.obterGrafo(id);
      return grafo.nos.map(no => no.posicao);
    }, mapaId);
    assert.ok(posicoes.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)), 'layout gerou posição para todos os nós');
    assert.ok(posicoes.some(p => p.x > 0), 'há nós em níveis diferentes (colunas)');

    // ---------------------------------------------------------------- zoom por botões + limites
    await clicarAcao('zoom-in');
    assert.ok(perto((await vp()).zoom, 1.2), 'zoom-in aumenta');
    assert.equal(await page.evaluate(() => document.getElementById('mapaZoomAtual').textContent), '120%', 'rótulo de zoom atualizado');
    await clicarAcao('zoom-out');
    await clicarAcao('zoom-out');
    assert.ok((await vp()).zoom < 1, 'zoom-out reduz');

    for (let i = 0; i < 20; i += 1) await clicarAcao('zoom-out');
    assert.equal((await vp()).zoom, 0.25, 'zoom mínimo respeitado (0.25)');
    for (let i = 0; i < 30; i += 1) await clicarAcao('zoom-in');
    assert.equal((await vp()).zoom, 3, 'zoom máximo respeitado (3)');
    await clicarAcao('zoom-out');
    await clicarAcao('zoom-out');

    // ---------------------------------------------------------------- Ctrl+scroll e scroll simples
    const antesRoda = await vp();
    await page.evaluate(() => {
      const canvas = document.getElementById('mapaCanvas');
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: -100, ctrlKey: true,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
      }));
    });
    const depoisRoda = await vp();
    assert.ok(depoisRoda.zoom > antesRoda.zoom, 'Ctrl+scroll dá zoom');
    const larguraRoda = await page.evaluate(() => document.getElementById('mapaCanvas').getBoundingClientRect().width);
    const mundoAntesRoda = (larguraRoda / 2 - antesRoda.x) / antesRoda.zoom;
    const mundoDepoisRoda = (larguraRoda / 2 - depoisRoda.x) / depoisRoda.zoom;
    assert.ok(perto(mundoAntesRoda, mundoDepoisRoda, 1), 'Ctrl+scroll mantém o ponto sob o ponteiro');

    const antesScroll = await vp();
    await page.evaluate(() => {
      const canvas = document.getElementById('mapaCanvas');
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true, cancelable: true, deltaY: 50, deltaX: 0,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
      }));
    });
    const depoisScroll = await vp();
    assert.ok(perto(depoisScroll.y, antesScroll.y - 50, 1), 'scroll sem Ctrl desloca o mundo');
    assert.ok(perto(depoisScroll.zoom, antesScroll.zoom, 0.0001), 'scroll sem Ctrl não muda o zoom');

    // ---------------------------------------------------------------- pan por Pointer Events
    const caixa = await caixaCanvas();
    const antesPan = await vp();
    await page.mouse.move(caixa.cx, caixa.cy);
    await page.mouse.down();
    await page.mouse.move(caixa.cx + 60, caixa.cy + 40, { steps: 3 });
    await page.mouse.up();
    const depoisPan = await vp();
    assert.ok(perto(depoisPan.x, antesPan.x + 60, 2), 'pan horizontal pelo mouse');
    assert.ok(perto(depoisPan.y, antesPan.y + 40, 2), 'pan vertical pelo mouse');

    // ---------------------------------------------------------------- centralizar / fit / raiz
    await clicarAcao('centralizar');
    const c1 = await caixaCanvas();
    const lim1 = await page.evaluate(() => ({ ...window.app.mapaCanvasLimites }));
    const vpC = await vp();
    assert.ok(perto(vpC.x, (c1.largura - lim1.largura * vpC.zoom) / 2 - lim1.minX * vpC.zoom, 2), 'centralizar (X)');
    assert.ok(perto(vpC.y, (c1.altura - lim1.altura * vpC.zoom) / 2 - lim1.minY * vpC.zoom, 2), 'centralizar (Y)');

    await clicarAcao('fit');
    const c2 = await caixaCanvas();
    const lim2 = await page.evaluate(() => ({ ...window.app.mapaCanvasLimites }));
    const vpFit = await vp();
    const zoomEsperado = Math.min(3, Math.max(0.25, Math.min(c2.largura / lim2.largura, c2.altura / lim2.altura)));
    assert.ok(perto(vpFit.zoom, zoomEsperado, 0.02), 'fit calcula o zoom para caber tudo');
    assert.ok(vpFit.x + lim2.minX * vpFit.zoom >= -2, 'fit: borda esquerda visível');
    assert.ok(vpFit.x + lim2.maxX * vpFit.zoom <= c2.largura + 2, 'fit: borda direita visível');

    await clicarAcao('ir-raiz');
    const c3 = await caixaCanvas();
    const raiz = await page.evaluate(id => {
      const grafo = window.MapaMentalStore.obterGrafo(id);
      const ids = new Set(grafo.nos.map(n => n.id));
      const alvo = grafo.nos.filter(n => !n.paiId || !ids.has(n.paiId)).sort((a, b) => (a.ordem || 0) - (b.ordem || 0))[0];
      return { posicao: alvo.posicao, largura: alvo.largura || 180 };
    }, mapaId);
    const vpRaiz = await vp();
    assert.ok(perto(raiz.posicao.x * vpRaiz.zoom + vpRaiz.x + (raiz.largura / 2) * vpRaiz.zoom, c3.largura / 2, 2), 'raiz centralizada em X');
    assert.ok(perto(raiz.posicao.y * vpRaiz.zoom + vpRaiz.y, c3.altura / 2, 2), 'raiz centralizada em Y');


    // ---------------------------------------------------------------- minimapa
    const rectViewport = await page.evaluate(() => {
      const r = document.getElementById('mapaMinimapaViewport').getBoundingClientRect();
      return { largura: r.width, altura: r.height };
    });
    assert.ok(rectViewport.largura > 0 && rectViewport.altura > 0, 'retângulo da viewport dimensionado');

    const antesMini = await vp();
    const mm = await page.evaluate(() => {
      const r = document.getElementById('mapaMinimapa').getBoundingClientRect();
      return { left: r.left, top: r.top };
    });
    await page.mouse.click(mm.left + 24, mm.top + 24);
    const depoisMini = await vp();
    assert.ok(!perto(depoisMini.x, antesMini.x, 0.5) || !perto(depoisMini.y, antesMini.y, 0.5), 'clique no minimapa navega');

    // ---------------------------------------------------------------- persistência + restauração
    await page.waitForTimeout(650);
    const salvo = await page.evaluate(id => window.MapaMentalStore.obterGrafo(id).viewport, mapaId);
    const atualVp = await vp();
    assert.ok(perto(salvo.x, atualVp.x, 1) && perto(salvo.y, atualVp.y, 1) && perto(salvo.zoom, atualVp.zoom, 0.001), 'viewport persistida com debounce');

    await page.evaluate(() => {
      window.app.mapaCanvasMapaId = null;
      window.app.mapaCanvasViewport = null;
      window.app.renderArea();
    });
    const restaurada = await vp();
    assert.ok(perto(restaurada.x, salvo.x, 1) && perto(restaurada.y, salvo.y, 1) && perto(restaurada.zoom, salvo.zoom, 0.001), 'viewport restaurada ao reabrir o mapa');

    // ---------------------------------------------------------------- pinça (dois dedos)
    const zoomAntesPinca = (await vp()).zoom;
    await page.evaluate(() => {
      const canvas = document.getElementById('mapaCanvas');
      const r = canvas.getBoundingClientRect();
      const disparar = (tipo, id, x, y) => canvas.dispatchEvent(new PointerEvent(tipo, {
        bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch',
        clientX: r.left + x, clientY: r.top + y
      }));
      disparar('pointerdown', 1, 100, 100);
      disparar('pointerdown', 2, 200, 100);
      disparar('pointermove', 2, 300, 100);
      disparar('pointermove', 2, 400, 100);
      disparar('pointerup', 1, 100, 100);
      disparar('pointerup', 2, 400, 100);
    });
    const zoomDepoisPinca = (await vp()).zoom;
    assert.ok(zoomDepoisPinca > zoomAntesPinca, 'pinça dá zoom');

    assert.deepEqual(erros, []);
    console.log('OK: canvas infinito (zoom, pan, pinça, centralizar/fit/raiz, minimapa, viewport persistida)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });

