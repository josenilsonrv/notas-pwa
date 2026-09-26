// 🧪 [INÍCIO: TESTE - NOTA ABERTURA PADRAO]
/*
 * Abertura padrão da área de NOTAS — espelho da área de MAPAS
 * (`garantirMapaSelecionado`, em mapa/mapa.js). Nas Notas a regra vive em
 * `definirPastaAtivaNotas` (app.js) e é chamada ao ENTRAR na área:
 *  - mantém a nota JÁ aberta se ela pertencer à pasta ativa;
 *  - senão abre a PRIMEIRA nota da pasta;
 *  - pasta VAZIA → cria uma "Nova nota" na pasta (Notas sempre tem ao menos 1);
 *  - a nota aberta fica com o chip `is-active` e renderizada no editor.
 * Mesmo harness dos testes de mapa (interações no DOM, determinismo).
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
    for (const f of ['fontes.js', 'notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js']) {
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
      app.projectsData = [
        { id: 'n-geral-1', nome: 'Geral Um', notas: '<p>g1</p>', pastaId: null },
        { id: 'n-geral-2', nome: 'Geral Dois', notas: '<p>g2</p>', pastaId: null }
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
      installMapaMental(TestApp);
      app.setupModalListeners();
      if (app.setupEventListeners) app.setupEventListeners();
      localStorage.clear();
      document.getElementById('notesModalBackdrop').classList.add('active');
      // Pasta ativa = Geral; cria "Trabalho" com uma nota + define os ids do teste.
      app.inicializarAreasMapa();
      const store = window.MapaMentalStore;
      const trab = store.criarPasta('Trabalho');
      app.projectsData.push({ id: 'n-trab', nome: 'Trabalho Um', notas: '<p>t</p>', pastaId: trab.id });
      app.salvarNotasLocais();
      app.__trabId = trab.id;
      // Estado de partida: nenhuma nota aberta → a área deve abrir a PRIMEIRA da pasta.
      app.currentNotesProjectId = null;
      app.notaPastaAtiva = 'pasta-geral';
      app.aplicarArea('notas');
    });
    await page.waitForTimeout(200);

    const chipAtivo = () => page.evaluate(() => {
      const el = document.querySelector('#notesContextNav .notes-context-chip.is-active');
      return el ? el.textContent : null;
    });
    const chips = () => page.evaluate(() => [...document.querySelectorAll('#notesContextNav .notes-context-chip:not(.notes-context-chip-add)')].map(el => el.textContent));
    const titulo = () => page.evaluate(() => {
      const el = document.getElementById('notesModalTitle');
      return el ? el.textContent : null;
    });

    // ---------------------------------------------------------------- 1) 1ª entrada abre a PRIMEIRA nota
    assert.equal(await chipAtivo(), 'Geral Um', 'ao entrar na área, a PRIMEIRA nota da pasta já fica ativa');
    assert.equal(await titulo(), 'Geral Um', 'a nota da primeira posição é renderizada no editor');
    assert.equal(await page.evaluate(() => window.app.currentNotesProjectId), 'n-geral-1', 'a nota aberta é a primeira da pasta');
    assert.equal(await page.evaluate(() => localStorage.getItem('notas-pwa-nota-ativa')), 'n-geral-1', 'a nota ativa fica persistida');
    assert.equal(await page.evaluate(() => (document.getElementById('notesEditor').textContent || '').includes('g1')), true, 'o conteúdo da nota é renderizado');

    // ---------------------------------------------------------------- 2) nota já aberta é PRESERVADA
    await page.evaluate(() => window.app.openNotesModal('n-geral-2'));
    await page.evaluate(() => window.app.aplicarArea('notas'));
    assert.equal(await chipAtivo(), 'Geral Dois', 'a nota já aberta (da pasta) é PRESERVADA, não volta à primeira');
    assert.equal(await titulo(), 'Geral Dois', 'o editor continua na nota já aberta');

    // ---------------------------------------------------------------- 3) trocar de pasta abre a 1ª da nova pasta
    await page.evaluate(() => window.app.abrirPasta(window.app.__trabId));
    await page.waitForFunction(() => window.app.currentNotesProjectId === 'n-trab', null, { timeout: 3000 });
    await page.evaluate(() => window.app.aplicarArea('notas'));
    assert.equal(await page.evaluate(() => window.app.currentNotesProjectId), 'n-trab', 'ao voltar às Notas, abre a primeira nota da pasta ativa (Trabalho)');
    assert.equal(await chipAtivo(), 'Trabalho Um', 'o chip ativo é o da nota da pasta');
    assert.deepEqual(await chips(), ['Trabalho Um'], 'a faixa lista só as notas da pasta ativa');

    // ---------------------------------------------------------------- 4) nota de OUTRA pasta é trocada
    // (`openNotesModal` do motor é ASSÍNCRONO: a troca conclui alguns ms depois.)
    await page.evaluate(() => {
      window.app.notaPastaAtiva = 'pasta-geral';
      window.app.currentNotesProjectId = 'n-trab'; // pertence a Trabalho
      window.app.aplicarArea('notas');
    });
    await page.waitForFunction(() => window.app.currentNotesProjectId === 'n-geral-1', null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => window.app.currentNotesProjectId), 'n-geral-1', 'troca a nota quando ela NÃO pertence à pasta ativa (cai na primeira da pasta)');
    assert.equal(await chipAtivo(), 'Geral Um', 'o chip ativo volta à primeira nota da pasta');

    // ---------------------------------------------------------------- 5) pasta VAZIA cria uma "Nova nota"
    await page.evaluate(() => {
      const store = window.MapaMentalStore;
      const vazia = store.criarPasta('Vazia');
      window.app.__vaziaId = vazia.id;
      window.app.abrirPasta(vazia.id);
    });
    await page.waitForFunction(() => {
      const nota = (window.app.projectsData || []).find(n => n.id === window.app.currentNotesProjectId);
      return Boolean(nota) && nota.nome === 'Nova nota';
    }, null, { timeout: 3000 });
    const vazio = await page.evaluate(() => {
      const atual = (window.app.projectsData || []).find(n => n.id === window.app.currentNotesProjectId);
      return {
        pastaId: window.app.notaPastaAtiva,
        abertaPasta: atual ? (atual.pastaId || null) : null,
        nome: atual ? atual.nome : null
      };
    });
    assert.equal(vazio.pastaId, await page.evaluate(() => window.app.__vaziaId), 'a pasta ativa é a "Vazia"');
    assert.equal(vazio.abertaPasta, await page.evaluate(() => window.app.__vaziaId), 'a nota criada pertence à pasta vazia (Notas sempre tem ao menos 1)');
    assert.equal(vazio.nome, 'Nova nota', 'a nota criada se chama "Nova nota"');
    assert.equal(await titulo(), 'Nova nota', 'a nova nota é aberta no editor');
    assert.deepEqual(await chips(), ['Nova nota'], 'a faixa mostra a nota criada');

    assert.deepEqual(erros, []);
    console.log('OK: abertura padrão da área de Notas (primeira nota ativa + renderizada, espelho dos Mapas)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - NOTA ABERTURA PADRAO]
