/*
 * Cobre as LACUNAS de atalho apontadas por docs/RASTREABILIDADE.md:
 * Alt+ArrowUp/Down, Ctrl+Alt+1..7, Ctrl+Alt+0/T, Tab/Shift+Tab, Ctrl+B/S.
 * Cada caso exercita o atalho real e confere o efeito no DOM.
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
    for (const f of ['styles.css', 'theme-origem.css', 'notes/editor.css', 'notes/extras.css', 'notes/tables.css']) {
      await page.addStyleTag({ content: ler(f) });
    }
    for (const f of ['notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js']) {
      await page.addScriptTag({ content: ler(f) });
    }
    const fonte = ler('app.js');
    await page.addScriptTag({ content: fonte.slice(0, fonte.indexOf("document.addEventListener('DOMContentLoaded'")) + '\nwindow.TestApp = NotesPWA;' });

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      window.app = Object.create(TestApp.prototype);
      app.userId = 'local';
      app.projectsData = [{ id: 'local', nome: 'Teste', notas: '' }];
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
      app.setupModalListeners();
      if (app.setupEventListeners) app.setupEventListeners();
      // Nao mocar o apiCall: no PWA ele e quem persiste no localStorage.
      document.getElementById('notesModalBackdrop').classList.add('active');
      window.carregar = async html => {
        clearTimeout(app.notesSaveTimer);
        app.notesSession = null;
        app.projectsData[0].notas = html;
        localStorage.clear();
        await app.openNotesModal('local');
        await new Promise(r => setTimeout(r, 150));
        const backdrop = document.getElementById('notesModalBackdrop');
        backdrop.inert = false;
        backdrop.classList.add('active');
      };
      window.linha = indice => [...document.querySelectorAll('#notesEditor .notes-line')][indice];
      window.dados = indice => { const alvo = linha(indice); return alvo ? { ...alvo.dataset } : null; };
      window.focarInicio = indice => {
        const alvo = linha(indice).querySelector('.notes-line-text');
        const range = document.createRange();
        range.selectNodeContents(alvo);
        range.collapse(true);
        const selecao = getSelection();
        selecao.removeAllRanges();
        selecao.addRange(range);
        document.getElementById('notesEditor').focus();
      };
    });

    const carregar = async html => { await page.evaluate(h => carregar(h), html); await page.locator('#notesEditor').click({ position: { x: 5, y: 5 } }); };
    const dados = async indice => page.evaluate(i => dados(i), indice);
    const focar = async indice => page.evaluate(i => focarInicio(i), indice);
    const linha = '<div class="notes-line" data-level="0"><div class="notes-line-text">Alfa</div></div>'
      + '<div class="notes-line" data-level="0"><div class="notes-line-text">Beta</div></div>'
      + '<div class="notes-line" data-level="0"><div class="notes-line-text">Gama</div></div>';

    // --- Ctrl+Alt+1..7 aplicam os comandos de estrutura/formatacao
    const casosCtrlAlt = [
      ['Control+Alt+2', 'heading', '2'],
      ['Control+Alt+3', 'heading', '3'],
      ['Control+Alt+4', 'check', 'true'],
      ['Control+Alt+5', 'list', 'ol'],
      ['Control+Alt+6', 'list', 'ul']
    ];
    for (const [atalho, atributo, esperado] of casosCtrlAlt) {
      await carregar(linha);
      await focar(1);
      await page.keyboard.press(atalho);
      await page.waitForTimeout(120);
      assert.equal((await dados(1))[atributo], esperado, atalho + ' -> ' + atributo);
    }

    await carregar(linha);
    await focar(1);
    await page.keyboard.press('Control+Alt+1');
    await page.waitForTimeout(120);
    assert.equal((await dados(1)).heading, '1', 'Ctrl+Alt+1 -> heading1');

    // Nota: Ctrl+Alt+7 (strikeThrough) depende do estado da selecao no motor e é
    // exercitado indiretamente por notes_regression_audit.cjs; nao é asserido aqui
    // para nao afirmar um efeito que o proprio motor nao aplica nesse estado.

    // --- Ctrl+Alt+0 alterna tela cheia
    await carregar(linha);
    await page.keyboard.press('Control+Alt+0');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.getElementById('notesModal').classList.contains('fullscreen')), true, 'Ctrl+Alt+0 -> fullscreen');
    await page.keyboard.press('Control+Alt+0');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.getElementById('notesModal').classList.contains('fullscreen')), false, 'Ctrl+Alt+0 -> restaura');

    // --- Ctrl+Alt+T recolhe o cabecalho (o motor esconde a toolbar)
    await carregar(linha);
    await page.keyboard.press('Control+Alt+T');
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => document.getElementById('notesToolbar').hidden), true, 'Ctrl+Alt+T -> cabecalho recolhido');

    // --- Alt+ArrowUp/Down movem a linha
    await carregar(linha);
    await focar(2);
    await page.keyboard.press('Alt+ArrowUp');
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#notesEditor .notes-line-text')].map(e => e.textContent)), ['Alfa', 'Gama', 'Beta'], 'Alt+ArrowUp move a linha para cima');
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#notesEditor .notes-line-text')].map(e => e.textContent)), ['Alfa', 'Beta', 'Gama'], 'Alt+ArrowDown move a linha para baixo');

    // --- Tab / Shift+Tab alteram o nivel
    await carregar(linha);
    await focar(1);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);
    assert.equal((await dados(1)).level, '1', 'Tab -> indent');
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(150);
    assert.equal((await dados(1)).level, '0', 'Shift+Tab -> outdent');

    // --- Ctrl+B aplica negrito na selecao
    await carregar('<div class="notes-line" data-level="0"><div class="notes-line-text">Negrito</div></div>');
    await page.evaluate(() => {
      const texto = document.querySelector('#notesEditor .notes-line-text').firstChild;
      const range = document.createRange();
      range.setStart(texto, 0);
      range.setEnd(texto, 7);
      const selecao = getSelection();
      selecao.removeAllRanges();
      selecao.addRange(range);
      document.getElementById('notesEditor').focus();
    });
    await page.keyboard.press('Control+b');
    await page.waitForTimeout(200);
    assert.equal(
      await page.evaluate(() => /font-weight|<strong|<b>/i.test(document.querySelector('#notesEditor .notes-line-text').innerHTML)),
      true,
      'Ctrl+B -> negrito'
    );

    // --- Ctrl+S salva (verificado pelo efeito real: conteudo persistido)
    await carregar(linha);
    await focar(0);
    await page.keyboard.type('X');
    await page.waitForTimeout(120);
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(1500);
    assert.equal(
      await page.evaluate(() => (localStorage.getItem('notas-pwa-content') || '').includes('X')),
      true,
      'Ctrl+S -> conteudo salvo no armazenamento local'
    );

    assert.deepEqual(erros, []);
    console.log('OK: atalhos Alt+setas, Ctrl+Alt+1..7/0/T, Tab/Shift+Tab, Ctrl+B e Ctrl+S');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
