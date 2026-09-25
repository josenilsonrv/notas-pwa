// 🧪 [INÍCIO: TESTE - NOTES CHIP MENU]
/*
 * Menu de contexto do chip de nota (botão direito / toque longo): Renomear,
 * Duplicar, Mover para pasta e Excluir. Cobre: itens do menu, duplicação
 * (novo id + mesma pasta), mover para pasta (persistência de `pastaId`),
 * submenu de pastas com a pasta atual marcada e exclusão com confirmação.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, hasTouch: true });
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept().catch(() => {}));

    const html = read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.route('**/*', r => r.request().resourceType() === 'document'
      ? r.fulfill({ contentType: 'text/html', body: html }) : r.abort());
    await page.goto('http://notes.test');
    for (const f of ['styles.css', 'theme-origem.css', 'notes/editor.css', 'notes/extras.css', 'notes/tables.css']) {
      await page.addStyleTag({ content: read(f) });
    }
    for (const f of ['notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js']) {
      await page.addScriptTag({ content: read(f) });
    }
    const source = read('app.js');
    await page.addScriptTag({ content: source.slice(0, source.indexOf("document.addEventListener('DOMContentLoaded'")) + '\nwindow.TestApp = NotesPWA;' });

    await page.evaluate(() => {
      localStorage.clear();
      // Stub das pastas (o app real usa MapaMentalStore; aqui é só para o teste).
      window.MapaMentalStore = { listarPastas: () => [{ id: 'pasta-1', nome: 'Trabalho' }, { id: 'pasta-2', nome: 'Pessoal' }] };
      window.app = new TestApp();
      app.projectsData = [
        { id: 'n1', nome: 'Alfa', notas: '<p>A</p>', pastaId: null },
        { id: 'n2', nome: 'Beta', notas: '<p>B</p>', pastaId: null }
      ];
      app.salvarNotasLocais();
      app.renderNotesNav();
    });

    const chips = () => page.locator('#notesContextNav .notes-context-chip:not(.notes-context-chip-add)');
    const abrirMenu = async indice => {
      await page.evaluate(i => {
        const chip = document.querySelectorAll('#notesContextNav .notes-context-chip:not(.notes-context-chip-add)')[i];
        chip.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 40 }));
      }, indice);
      await page.waitForTimeout(80);
    };
    const clicarItem = async texto => {
      await page.locator('#notesChipMenu button', { hasText: texto }).first().click();
      await page.waitForTimeout(120);
    };
    const nota = id => page.evaluate(alvo => {
      const n = (app.projectsData || []).find(x => x.id === alvo);
      return n ? { id: n.id, nome: n.nome, pastaId: n.pastaId ?? null, notas: n.notas } : null;
    }, id);

    // ---------------------------------------------------------------- 1) itens do menu
    await abrirMenu(0);
    const itens = await page.evaluate(() => [...document.querySelectorAll('#notesChipMenu button')].map(b => b.textContent));
    assert.deepEqual(itens, ['Renomear', 'Duplicar', 'Mover para pasta…', 'Excluir'], 'menu do chip tem as 4 ações');

    // ---------------------------------------------------------------- 2) duplicar
    await clicarItem('Duplicar');
    assert.equal(await chips().count(), 3, 'Duplicar cria um chip novo');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-notes')).length), 3, 'duplicação persiste');
    const copiaId = await page.evaluate(() => app.projectsData[1].id);
    assert.notEqual(copiaId, 'n1', 'a cópia tem id novo');
    assert.equal((await nota(copiaId)).nome, 'Alfa (cópia)', 'nome da cópia');
    assert.equal((await nota(copiaId)).notas, '<p>A</p>', 'conteúdo copiado');
    assert.equal(await page.evaluate(() => document.getElementById('notesChipMenu') ? 1 : 0), 0, 'menu fecha ao agir');

    // ---------------------------------------------------------------- 3) mover para pasta
    await abrirMenu(0);
    await clicarItem('Mover para pasta');
    const pastas = await page.evaluate(() => [...document.querySelectorAll('#notesChipMenu button')].map(b => b.textContent));
    assert.deepEqual(pastas, ['Sem pasta', 'Trabalho', 'Pessoal'], 'submenu lista as pastas');
    assert.equal(await page.evaluate(() => document.querySelector('#notesChipMenu button.is-active').textContent), 'Sem pasta', 'pasta atual marcada');
    await clicarItem('Trabalho');
    assert.equal((await nota('n1')).pastaId, 'pasta-1', 'nota movida para a pasta');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-notes')).find(n => n.id === 'n1').pastaId), 'pasta-1', 'pastaId persistido');

    // ---------------------------------------------------------------- 4) pastas carregam a nota movida
    await page.evaluate(id => { app.duplicarNota(id); }, 'n1');
    const copia2 = await page.evaluate(() => app.projectsData[1]);
    assert.equal(copia2.pastaId, 'pasta-1', 'duplicar herda a pasta da nota');

    // ---------------------------------------------------------------- 5) excluir (com confirmação)
    // n1 foi movida para "Trabalho" (pasta-1): os chips seguem a pasta ativa.
    await page.evaluate(() => app.definirPastaAtivaNotas('pasta-1'));
    assert.equal(await chips().count(), 2, 'chips filtrados pela pasta ativa (n1 + cópia)');
    await abrirMenu(0);
    await clicarItem('Excluir');
    await page.waitForTimeout(200);
    assert.equal((await nota('n1')), null, 'Excluir remove a nota');
    assert.equal(await chips().count(), 1, 'chip removido (restou a cópia em Trabalho)');

    assert.deepEqual(errors, [], 'sem erros de página');
    console.log('OK: menu do chip (renomear/duplicar/mover para pasta/excluir)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - NOTES CHIP MENU]
