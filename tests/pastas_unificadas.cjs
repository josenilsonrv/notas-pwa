// 🧪 [INÍCIO: TESTE - PASTAS UNIFICADAS]
/*
 * FRENTE 3 - "Pastas" como primeira tela (workspaces que abrangem Notas + Mapa).
 * Cobre: aba "Pastas" (3 áreas), pasta padrão "Geral", abrir uma pasta (define a
 * pasta ativa e entra em Notas), chips de nota filtrados pelo workspace, mapa
 * filtrado pela pasta e volta para a tela de pastas.
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
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-render.js', 'mapa/mapa.js']) {
      await page.addScriptTag({ content: ler(f) });
    }

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      window.app = Object.create(TestApp.prototype);
      app.userId = 'local';
      app.projectsData = [
        { id: 'n-geral', nome: 'Nota Geral', notas: '<p>g</p>', pastaId: null },
        { id: 'n-trab', nome: 'Nota Trabalho', notas: '<p>t</p>', pastaId: null }
      ];
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
      // Cria a pasta "Trabalho" e joga uma nota + um mapa nela.
      const trab = window.MapaMentalStore.criarPasta('Trabalho');
      app.projectsData[1].pastaId = trab.id;
      const mapa = window.MapaMentalStore.criarMapa('Mapa Trabalho', trab.id);
      app.trabPastaId = trab.id;
      app.trabMapaId = mapa.id;
      app.inicializarAreasMapa();
    });

    const trabId = await page.evaluate(() => app.trabPastaId);
    const estado = () => page.evaluate(() => ({
      area: localStorage.getItem('notas-pwa-area-ativa'),
      pastasVisivel: !document.getElementById('pastasArea').hidden,
      mapaVisivel: !document.getElementById('mapaArea').hidden,
      backdropAtivo: document.getElementById('notesModalBackdrop').classList.contains('active'),
      abas: document.querySelectorAll('#appAreas [data-app-area]').length,
      pastaAtiva: JSON.parse(localStorage.getItem('notas-pwa-pasta-ativa') || 'null')
    }));

    // ---------------------------------------------------------------- 1) tela raiz = Pastas
    const inicial = await estado();
    assert.equal(inicial.abas, 2, 'seletor tem Notas e Mapa Mental (Pastas é a tela raiz, sem aba)');
    assert.equal(inicial.pastasVisivel, true, 'tela de Pastas abre primeiro');
    assert.equal(inicial.mapaVisivel, false, 'área do mapa começa oculta');
    assert.equal(inicial.backdropAtivo, false, 'o modal de Notas não cobre a tela de Pastas');
    assert.equal(JSON.parse(inicial.area), 'pastas', 'área ativa persistida como "pastas"');
    assert.equal(await page.evaluate(() => document.getElementById('appAreas').hidden), true, 'barra de áreas escondida na tela de Pastas (sem aba Pastas)');

    // ---------------------------------------------------------------- 2) cartões de pasta
    const nomes = await page.evaluate(() => [...document.querySelectorAll('#pastasArea .pastas-card-nome')].map(e => e.textContent));
    assert.deepEqual(nomes.sort(), ['Geral', 'Trabalho'], 'mostra a pasta padrão "Geral" + a criada');
    const metaTrab = await page.evaluate(id => {
      const card = document.querySelector('#pastasArea [data-pasta-id="' + id + '"]').closest('.pastas-card');
      return card.querySelector('.pastas-card-meta').textContent;
    }, trabId);
    assert.match(metaTrab, /1 nota\(s\).*1 mapa\(s\)/, 'cartão mostra as contagens de notas e mapas');

    // ---------------------------------------------------------------- 3) abrir a pasta (workspace)
    await page.locator('#pastasArea [data-pastas-acao="abrir-pasta"][data-pasta-id="' + trabId + '"]').click();
    await page.waitForTimeout(150);
    const aberta = await estado();
    assert.equal(aberta.pastasVisivel, false, 'ao abrir a pasta, a tela de Pastas some');
    assert.equal(aberta.backdropAtivo, true, 'entra na área de Notas da pasta');
    assert.equal(aberta.pastaAtiva, trabId, 'pasta ativa persistida em notas-pwa-pasta-ativa');
    assert.equal(await page.evaluate(() => app.notaPastaAtiva), trabId, 'pasta ativa sincronizada nas notas');
    assert.equal(await page.evaluate(() => app.mapaFiltroPasta), trabId, 'mapa também fica na pasta');

    // ---------------------------------------------------------------- 4) chips filtrados pelo workspace
    const chips = () => page.locator('#notesContextNav .notes-context-chip:not(.notes-context-chip-add)');
    assert.equal(await chips().count(), 1, 'só as notas da pasta aparecem');
    assert.equal((await chips().first().textContent()), 'Nota Trabalho', 'chip é o da pasta');

    // ---------------------------------------------------------------- 5) mapa da pasta
    await page.getByRole('tab', { name: 'Mapa Mental' }).click();
    await page.waitForTimeout(120);
    assert.equal((await estado()).mapaVisivel, true, 'área do mapa abre');

    // ---------------------------------------------------------------- 6) voltar para as pastas
    await page.locator('#appVoltarPastas').click();
    await page.waitForTimeout(120);
    assert.equal((await estado()).pastasVisivel, true, 'botão "‹ Pastas" volta para a tela raiz');

    assert.deepEqual(erros, [], 'sem erros de página');
    console.log('OK: Pastas como tela raiz (workspaces de notas + mapas)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - PASTAS UNIFICADAS]
