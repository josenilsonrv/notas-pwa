// 🧪 [INÍCIO: TESTE - MAPA COLAPSO]
/*
 * COLAPSO DAS BARRAS DA ÁREA DO MAPA (mesma lógica do cabeçalho de Notas).
 * Cobre: botão na topbar (`#mapaColapsoBarras`, só visível com mapa aberto),
 * recolher/expandir esconde/mostra `#mapaToolbar` + `#mapaFormatBar`, classe
 * `.mapa-barras-colapsadas` no shell, `aria-expanded` sincronizado, a formatação
 * contextual não "vaza" depois de expandir e o re-render não descolapsa.
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
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-layout.js', 'mapa/mapa-render.js', 'mapa/mapa-painel.js', 'mapa/mapa-cores.js', 'mapa/mapa-interacao.js', 'mapa/mapa.js']) {
      await page.addScriptTag({ content: ler(f) });
    }

    await page.evaluate(() => {
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
      const grafo = window.MapaMentalStore.criarMapa('Colapso', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'projeto');
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
    });

    const classe = () => page.evaluate(() => document.querySelector('#mapaArea .mapa-shell').classList.contains('mapa-barras-colapsadas'));
    const ariaBotao = () => page.evaluate(() => document.getElementById('mapaColapsoBarras').getAttribute('aria-expanded'));
    // As animações de recolher são sequenciais (toolbar e depois formatação),
    // então a espera cobre os dois passos de ~220 ms.
    const clicarColapso = async () => { await page.locator('#mapaColapsoBarras').click(); await page.waitForTimeout(700); };

    // ---------------------------------------------------------------- 1) botão na topbar
    assert.equal(await page.locator('#mapaColapsoBarras').isVisible(), true, 'botão de colapso visível com o mapa aberto');
    assert.equal(await page.evaluate(() => document.getElementById('mapaColapsoBarras').hidden), false, 'botão não está oculto');
    assert.equal(await ariaBotao(), 'true', 'botão começa expandido (aria-expanded=true)');
    assert.equal(await page.locator('#mapaToolbar').isVisible(), true, 'barra de ferramentas visível');
    assert.equal(await page.evaluate(() => document.getElementById('mapaFormatBar').hidden), true, 'formatação oculta sem seleção');

    // ---------------------------------------------------------------- 2) recolhe
    await clicarColapso();
    assert.equal(await classe(), true, 'shell recebe a classe de colapso');
    assert.equal(await page.locator('#mapaToolbar').isVisible(), false, 'colapso esconde a barra de ferramentas');
    assert.equal(await page.evaluate(() => document.getElementById('mapaToolbar').hidden), true, 'barra de ferramentas fica hidden');
    assert.equal(await ariaBotao(), 'false', 'aria-expanded=false ao recolher');

    // ---------------------------------------------------------------- 3) re-render não descolapsa
    // A classe no shell é o guardião persistente (o `hidden` é recalculado por
    // `atualizarShell`/`renderBarras` a cada render, mas o CSS vence).
    await page.evaluate(() => app.renderArea());
    assert.equal(await classe(), true, 're-render mantém a classe de colapso');
    assert.equal(await page.locator('#mapaToolbar').isVisible(), false, 're-render mantém as barras recolhidas');

    // ---------------------------------------------------------------- 4) expande
    await clicarColapso();
    assert.equal(await classe(), false, 'classe de colapso removida ao expandir');
    assert.equal(await page.locator('#mapaToolbar').isVisible(), true, 'expande mostra a barra de ferramentas');
    assert.equal(await ariaBotao(), 'true', 'aria-expanded=true ao expandir');
    assert.equal(await page.evaluate(() => document.getElementById('mapaFormatBar').hidden), true, 'formatação continua oculta (sem nó selecionado)');

    // ---------------------------------------------------------------- 5) formatação contextual
    const idObjetivo = await page.evaluate(() => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === 'Objetivo');
      return no ? no.id : null;
    });
    await page.evaluate(alvo => { window.app.mapaSelecao = new Set([alvo]); window.app.renderArea(); }, idObjetivo);
    assert.equal(await page.locator('#mapaFormatBar').isVisible(), true, 'formatação aparece com nó selecionado');
    await clicarColapso();
    assert.equal(await page.locator('#mapaFormatBar').isVisible(), false, 'colapso esconde a formatação');
    await clicarColapso();
    assert.equal(await page.locator('#mapaFormatBar').isVisible(), true, 'expande devolve a formatação (nó ainda selecionado)');

    // ---------------------------------------------------------------- 6) some na lista de gestão
    await page.evaluate(() => { window.app.mapaAbertaId = null; window.app.renderArea(); });
    assert.equal(await page.locator('#mapaColapsoBarras').isVisible(), false, 'botão de colapso some na visão de lista');

    assert.deepEqual(erros, [], 'sem erros de página');
    console.log('OK: colapso das barras do mapa (topbar + toolbar + formatação), aria e re-render');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA COLAPSO]
