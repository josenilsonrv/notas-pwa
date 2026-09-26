// 🧪 [INÍCIO: TESTE - ALTERNAR ÁREAS NO CELULAR (⇄)]
/*
 * O ⛶ do CELULAR só restaurava o tamanho: não havia caminho direto entre Notas e Mapa
 * (P112/P114). Agora o cabeçalho de Notas tem o ⇄ (`#notesAlternarAreaBtn`), que leva ao
 * Mapa, e a topbar do Mapa tem o espelho (`#mapaAlternarAreaBtn`), que volta às Notas.
 *
 * Cobre: os dois ⇄ ficam ESCONDIDOS no DESKTOP (lá o lado a lado já mostra as duas áreas);
 * no CELULAR o ⇄ aparece e o ⛶ de Notas sai de cena; o vaivém Notas ⇄ Mapa funciona nos
 * DOIS sentidos; e a tela cheia ligada antes de virar celular NÃO fica presa (sem o ⛶
 * visível não haveria como restaurar).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    // `hasTouch` é o que faz `pointer: coarse` bater — e é o que define o modo mobile.
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
    for (const f of ['notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js', 'fontes.js']) {
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
      // O harness corta o app.js antes do `DOMContentLoaded` (quem chama o `init`), então
      // o MODO MOBILE do bloco de notas precisa ser instalado aqui na mão.
      installModoMobileNotas(TestApp);
      app.setupModalListeners();
      // Os CLIQUES dos botões do cabeçalho (⛶ e ⇄) são ligados por `setupEventListeners`
      // (no boot real, dentro do `init`): sem isto o clique do ⇄ não teria efeito.
      app.setupEventListeners();
      // O modo mobile é aplicado no RESIZE (`setupResize`); o boot real (`init`) faz isso,
      // aqui o harness precisa ligar na mão.
      app.setupResize();
      localStorage.clear();
      document.getElementById('notesModalBackdrop').classList.add('active');
      app.inicializarAreasMapa();
      const grafo = window.MapaMentalStore.criarMapa('Alternar', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'projeto');
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      // Abre no MAPA: é com o mapa aberto que os DOIS ⇄ existem no DOM (o do Mapa nasce no
      // `montarShell`) — o resto do teste volta para as Notas.
      app.aplicarArea('mapa');
      app.renderArea();
    });
    await page.waitForTimeout(300);

    const estado = () => page.evaluate(() => ({
      mobile: document.documentElement.classList.contains('notes-mobile'),
      mapa: !document.getElementById('mapaArea').hidden,
      notas: document.getElementById('notesModalBackdrop').classList.contains('active'),
      area: window.MapaMentalStore.lerAreaAtiva(),
      telaCheia: document.getElementById('notesModal').classList.contains('fullscreen')
    }));

    // ---------------------------------------------------------------- 1) DESKTOP
    // No PC as DUAS áreas convivem (lado a lado) e o controle é o ⛶: o ⇄ não aparece.
    const desktop = await estado();
    assert.equal(desktop.mobile, false, 'desktop não está em modo mobile');
    assert.equal(desktop.mapa, true, 'desktop começa com o Mapa aberto (onde os dois ⇄ existem no DOM)');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('notesAlternarAreaBtn')).display), 'none',
      '⇄ de Notas escondido no desktop');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('mapaAlternarAreaBtn')).display), 'none',
      '⇄ da topbar do Mapa escondido no desktop');
    assert.equal(await page.locator('#mapaFullscreenBtn').isVisible(), true, '⛶ do Mapa visível no desktop');
    // Estado de partida do resto do teste: Notas na tela.
    await page.evaluate(() => app.aplicarArea('notas'));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#notesFullscreenBtn').isVisible(), true, '⛶ de Notas visível no desktop');

    // ---------------------------------------------------------------- 2) TELA CHEIA PRESA
    // Liga o ⛶ (como se o usuário tivesse expandido no PC) e vira CELULAR: a tela cheia
    // precisa ser liberada — no celular o ⛶ sai de cena e não haveria como restaurar.
    await page.evaluate(() => document.getElementById('notesModal').classList.add('fullscreen', 'app-tela-cheia'));
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(800);
    const celular = await estado();
    assert.equal(celular.mobile, true, 'modo mobile ligado no celular (390px + toque)');
    assert.equal(celular.telaCheia, false, 'tela cheia do ⛶ liberada ao entrar no celular (não fica presa)');
    assert.equal(await page.locator('#notesAlternarAreaBtn').isVisible(), true, '⇄ de Notas visível no celular');
    assert.equal(await page.locator('#notesFullscreenBtn').isVisible(), false, '⛶ de Notas sai de cena no celular');
    assert.equal(await page.evaluate(() => document.getElementById('notesAlternarAreaBtn').getAttribute('aria-label')), 'Abrir o Mapa Mental',
      '⇄ de Notas anuncia o destino (Mapa)');

    // ---------------------------------------------------------------- 3) NOTAS -> MAPA
    await page.locator('#notesAlternarAreaBtn').click();
    await page.waitForTimeout(500);
    const noMapa = await estado();
    assert.equal(noMapa.mapa, true, '⇄ de Notas leva ao Mapa');
    assert.equal(noMapa.notas, false, 'o modal de Notas sai de cena quando o Mapa entra');
    assert.equal(noMapa.area, 'mapa', 'área ativa persistida como mapa');
    assert.equal(await page.locator('#mapaAlternarAreaBtn').isVisible(), true, '⇄ do Mapa visível no celular');
    assert.equal(await page.evaluate(() => document.getElementById('mapaAlternarAreaBtn').getAttribute('aria-label')), 'Ver as Notas',
      '⇄ do Mapa anuncia o destino (Notas)');

    // ---------------------------------------------------------------- 4) MAPA -> NOTAS
    await page.locator('#mapaAlternarAreaBtn').click();
    await page.waitForTimeout(500);
    const nasNotas = await estado();
    assert.equal(nasNotas.mapa, false, '⇄ do Mapa esconde a área do Mapa');
    assert.equal(nasNotas.notas, true, '⇄ do Mapa traz as Notas de volta');
    assert.equal(nasNotas.area, 'notas', 'área ativa voltou para notas');

    // ---------------------------------------------------------------- 5) VOLTA AO DESKTOP
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#notesAlternarAreaBtn').isVisible(), false, '⇄ escondido de volta no desktop');
    assert.equal(await page.locator('#notesFullscreenBtn').isVisible(), true, '⛶ volta ao desktop');

    assert.deepEqual(erros, [], 'sem erros de JS durante o vaivém');
    console.log('OK: ⇄ alterna Notas ⇄ Mapa no celular (o ⛶ sai de cena) e a tela cheia não fica presa');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - ALTERNAR ÁREAS NO CELULAR (⇄)]
