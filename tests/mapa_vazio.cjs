/*
 * Mapa vazio -> primeiro tópico.
 * Guarda contra o beco sem saída: um mapa recém-criado não tem nós e a barra de ações
 * do nó só aparece com algo selecionado. Deve existir um caminho óbvio para começar
 * (botão "Novo tópico" nos controles + estado vazio clicável no canvas).
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
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-layout.js', 'mapa/mapa-render.js', 'mapa/mapa-painel.js', 'mapa/mapa-interacao.js', 'mapa/mapa.js']) {
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
      // Mapa NOVO: sem nenhum nó (como o "Novo mapa" faz hoje).
      const grafo = window.MapaMentalStore.criarMapa('Vazio', null);
      window.app.mapaAbertaId = grafo.id;
      window.app.renderArea();
    });

    const qtdNos = () => page.evaluate(() => window.app.mapaCanvasGrafo.nos.length);
    const nos = () => page.evaluate(() => JSON.parse(JSON.stringify(window.app.mapaCanvasGrafo.nos.map(n => ({ id: n.id, titulo: n.titulo, paiId: n.paiId })))));
    const ultimo = async () => (await nos())[(await qtdNos()) - 1];
    const raiz = async () => (await nos()).find(n => n.paiId === null);
    const ativo = () => page.evaluate(() => (document.activeElement && document.activeElement.id) || '');
    const aguardarEdicao = () => page.waitForFunction(() => window.app.mapaEditandoId !== null);
    const aguardarFimEdicao = () => page.waitForFunction(() => window.app.mapaEditandoId === null);

    // ---------------------------------------------------------------- estado vazio visível
    assert.equal(await qtdNos(), 0, 'mapa novo começa vazio');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('#mapaCanvas .mapa-canvas-vazio'))), true, 'estado vazio aparece no canvas');
    assert.equal(await page.evaluate(() => document.querySelector('.mapa-canvas-vazio button').textContent.trim()), 'Criar primeiro tópico', 'estado vazio tem botão de criação');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaNovoTopico'))), true, 'botão "Novo tópico" sempre nos controles');
    assert.equal(await page.evaluate(() => document.getElementById('mapaCanvas').getAttribute('aria-keyshortcuts')), 'Enter Tab Insert F2 Delete', 'canvas anuncia os atalhos');

    // ---------------------------------------------------------------- teclado SEM seleção: Enter cria o 1º tópico
    await page.keyboard.press('Enter');
    await aguardarEdicao();
    assert.equal(await qtdNos(), 1, 'Enter (sem seleção) cria o primeiro tópico');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('#mapaCanvas .mapa-canvas-vazio'))), false, 'estado vazio some após criar');
    await page.keyboard.type('Raiz');
    await page.keyboard.press('Enter');
    await aguardarFimEdicao();
    assert.equal((await raiz()).titulo, 'Raiz', 'título digitado direto no nó é salvo');
    assert.equal(await ativo(), 'mapaCanvas', 'foco volta ao canvas ao terminar a edição');

    // ---------------------------------------------------------------- Insert = filho (padrão FreeMind/XMind)
    await page.keyboard.press('Insert');
    await aguardarEdicao();
    assert.equal(await qtdNos(), 2, 'Insert cria nó');
    assert.equal((await ultimo()).paiId, (await raiz()).id, 'Insert cria FILHO da seleção');
    await page.keyboard.type('Filho');
    await page.keyboard.press('Enter');
    await aguardarFimEdicao();

    // ---------------------------------------------------------------- Enter = irmão (mesmo pai)
    await page.keyboard.press('Enter');
    await aguardarEdicao();
    assert.equal(await qtdNos(), 3, 'Enter cria irmão');
    assert.equal((await ultimo()).paiId, (await raiz()).id, 'irmão compartilha o pai da seleção');
    await page.keyboard.press('Escape');
    await aguardarFimEdicao();

    // ---------------------------------------------------------------- Ctrl+Enter = filho
    const irmaoId = (await ultimo()).id;
    await page.keyboard.press('Control+Enter');
    await aguardarEdicao();
    assert.equal(await qtdNos(), 4, 'Ctrl+Enter cria nó');
    assert.equal((await ultimo()).paiId, irmaoId, 'Ctrl+Enter cria FILHO da seleção');
    await page.keyboard.press('Escape');
    await aguardarFimEdicao();

    // ---------------------------------------------------------------- Tab = filho
    const ctrlEnterId = (await ultimo()).id;
    await page.keyboard.press('Tab');
    await aguardarEdicao();
    assert.equal(await qtdNos(), 5, 'Tab cria nó');
    assert.equal((await ultimo()).paiId, ctrlEnterId, 'Tab cria FILHO da seleção');
    await page.keyboard.press('Escape');
    await aguardarFimEdicao();

    // ---------------------------------------------------------------- caminho por clique (volta ao vazio)
    await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      g.nos = [];
      window.MapaMentalStore.salvarGrafo(g);
      window.app.renderArea();
    });
    assert.equal(await qtdNos(), 0, 'mapa esvaziado');
    await page.evaluate(() => document.querySelector('.mapa-canvas-vazio button').click());
    await page.waitForFunction(() => window.app.mapaCanvasGrafo.nos.length === 1);
    assert.equal(await qtdNos(), 1, 'botão do estado vazio cria o primeiro tópico');
    await page.keyboard.press('Escape');
    await aguardarFimEdicao();
    await page.evaluate(() => document.getElementById('mapaNovoTopico').click());
    await page.waitForFunction(() => window.app.mapaCanvasGrafo.nos.length === 2);
    assert.equal(await qtdNos(), 2, 'botão "Novo tópico" também cria');

    assert.deepEqual(erros, []);
    console.log('OK: mapa vazio -> primeiro tópico (clique + Enter/Tab/Insert/Ctrl+Enter)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
