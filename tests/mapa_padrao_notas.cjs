// 🧪 [INÍCIO: TESTE - MAPA PADRAO NOTAS]
/*
 * P81 — Padronização do Mapa com Notas:
 *  - a faixa de chips dos MAPAS (`#mapaChipsNav`) usa as MESMAS classes/cores/formatação
 *    do `#notesContextNav` (claro e escuro) — inclusive o botão "+";
 *  - o campo do Mapa (`#mapaCanvas`) usa o MESMO fundo/borda/vidro do campo de edição de
 *    Notas (`#notesEditorContainer.focus-shell`);
 *  - no modo lado a lado o backdrop mantém o fundo + blur (vidro) CONFINADO à coluna da nota.
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
        { id: 'nota-x', nome: 'Minha Nota', notas: 'ola', pastaId: null },
        { id: 'nota-y', nome: 'Outra Nota', notas: 'ola2', pastaId: null }
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
      app.configurarToolbarPWA();
      localStorage.clear();
      document.getElementById('notesModalBackdrop').classList.add('active');
      app.inicializarAreasMapa();
      const grafo = window.MapaMentalStore.criarMapa('Meu Mapa', null);
      window.MapaMentalModelo.criarNo(grafo, { titulo: 'Topico' });
      window.MapaMentalStore.salvarGrafo(grafo);
      // Um 2º mapa na MESMA pasta, para existir chip ATIVO e chip inativo.
      window.MapaMentalStore.criarMapa('Outro Mapa', null);
      app.aplicarArea('mapa');
      app.mapaAbertaId = grafo.id;
      app.renderArea();
      app.renderNotesNav();
    });
    await page.waitForTimeout(500);

    const medir = () => page.evaluate(() => {
      const cs = sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const c = getComputedStyle(el);
        return { bg: c.backgroundColor, color: c.color, radius: c.borderRadius, bw: c.borderTopWidth, bf: c.backdropFilter, pad: c.padding };
      };
      const caixa = document.getElementById('mapaCanvas').getBoundingClientRect();
      const rodape = document.getElementById('mapaRodape').getBoundingClientRect();
      const rodapeNotas = document.querySelector('.notes-modal-footer').getBoundingClientRect();
      return {
        mapa: {
          chipAtivo: cs('#mapaChipsNav .notes-context-chip.is-active'),
          chip: cs('#mapaChipsNav .notes-context-chip:not(.is-active):not(.notes-context-chip-add)'),
          add: cs('#mapaChipsNav .notes-context-chip-add'),
          nav: cs('#mapaChipsNav'),
          nomes: [...document.querySelectorAll('#mapaChipsNav .notes-context-chip:not(.notes-context-chip-add)')].map(el => el.textContent),
          ids: [...document.querySelectorAll('#mapaChipsNav .notes-context-chip:not(.notes-context-chip-add)')].map(el => el.dataset.mapaId),
          notasNavVazio: document.getElementById('mapaNotasNav') === null,
          canvas: cs('#mapaCanvas'),
          canvasW: Math.round(caixa.width), canvasH: Math.round(caixa.height),
          rodapeH: Math.round(rodape.height)
        },
        notas: {
          chipAtivo: cs('#notesContextNav .notes-context-chip.is-active'),
          chip: cs('#notesContextNav .notes-context-chip:not(.is-active):not(.notes-context-chip-add)'),
          add: cs('#notesContextNav .notes-context-chip-add'),
          nav: cs('#notesContextNav'),
          editor: cs('#notesEditorContainer'),
          rodapeH: Math.round(rodapeNotas.height)
        }
      };
    });

    // ------------------------------------------------- 1) CLARO: Mapa == Notas
    const claro = await medir();
    assert.ok(claro.mapa.canvasW > 0 && claro.mapa.canvasH > 100, 'o campo do Mapa tem area real (o vidro nao quebra o layout)');
    assert.equal(claro.mapa.chip.bg, claro.notas.chip.bg, 'chip do Mapa com o MESMO fundo do chip de Notas (claro)');
    assert.equal(claro.mapa.chipAtivo.bg, claro.notas.chipAtivo.bg, 'chip ATIVO do Mapa com o MESMO fundo de Notas (claro)');
    assert.equal(claro.mapa.chip.radius, '8px', 'chip do Mapa com o MESMO raio de Notas (nao e mais "pilula")');
    assert.equal(claro.mapa.chip.bw, '0px', 'chip do Mapa sem borda (igual a Notas)');
    assert.equal(claro.mapa.chip.pad, claro.notas.chip.pad, 'chip do Mapa com o MESMO padding de Notas');
    assert.equal(claro.mapa.chip.color, claro.notas.chip.color, 'chip do Mapa com a MESMA cor de texto de Notas');
    assert.ok(claro.mapa.nav.pad.startsWith('12px'), 'faixa dos chips do Mapa com o MESMO padding vertical de Notas');
    assert.equal(claro.mapa.add.bf, 'blur(3px)', 'botao "+" do Mapa com o MESMO vidro de Notas');
    assert.notEqual(claro.mapa.add.bg, 'rgba(0, 0, 0, 0)', 'botao "+" do Mapa tem fundo (nao fica transparente)');
    assert.deepEqual(claro.mapa.nomes.slice().sort(), ['Meu Mapa', 'Outro Mapa'], 'a faixa do Mapa lista os MAPAS da pasta');
    assert.ok(claro.mapa.ids.every(id => typeof id === 'string' && id), 'os chips do Mapa carregam o id do mapa');
    assert.equal(claro.mapa.notasNavVazio, true, 'a faixa de NOTAS saiu da area do Mapa (so mapas)');
    assert.equal(claro.mapa.add.pad, claro.notas.add.pad, 'o "+" do Mapa tem o MESMO padding do "+" de Notas');
    assert.equal(claro.mapa.canvas.bg, claro.notas.editor.bg, 'campo do Mapa com o MESMO fundo do campo de edicao de Notas');
    assert.equal(claro.mapa.canvas.bw, claro.notas.editor.bw, 'campo do Mapa com a MESMA borda do campo de Notas');
    assert.equal(claro.mapa.canvas.bf, claro.notas.editor.bf, 'campo do Mapa com o MESMO vidro (blur) do campo de Notas');
    assert.equal(claro.notas.rodapeH, claro.mapa.rodapeH, 'rodape de Notas com a MESMA altura do rodape do Mapa (2.25rem)');

    // ------------------------------------------------- 2) ESCURO: Mapa == Notas
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.dispatchEvent(new Event('themechange')); });
    await page.waitForTimeout(350);
    const escuro = await medir();
    assert.equal(escuro.mapa.chip.bg, escuro.notas.chip.bg, 'chip do Mapa com o MESMO fundo de Notas no tema escuro');
    assert.notEqual(escuro.mapa.chip.bg, 'rgba(0, 0, 0, 0)', 'o chip do Mapa APARECE no tema escuro (nao fica transparente)');
    assert.equal(escuro.mapa.chip.color, escuro.notas.chip.color, 'chip do Mapa com a MESMA cor de texto no escuro');
    assert.equal(escuro.mapa.canvas.bg, 'rgb(13, 18, 24)', 'campo do Mapa com o fundo de Notas no escuro (#0D1218)');
    assert.equal(escuro.mapa.canvas.bf, 'none', 'campo do Mapa sem o blur no tema escuro (igual a Notas)');

    // ------------------------------------------------- 3) SPLIT: vidro preservado e confinado
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; window.dispatchEvent(new Event('themechange')); });
    await page.waitForTimeout(250);
    const split = await page.evaluate(() => {
      window.app.aplicarSplit(true);
      const b = document.getElementById('notesModalBackdrop');
      const c = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      const m = document.getElementById('mapaArea').getBoundingClientRect();
      return { bg: c.backgroundColor, bf: c.backdropFilter, right: Math.round(r.right), mapaLeft: Math.round(m.left) };
    });
    assert.notEqual(split.bg, 'rgba(0, 0, 0, 0)', 'o backdrop do split mantem o fundo (vidro), nao fica transparente');
    assert.equal(split.bf, 'blur(8px)', 'o backdrop do split mantem o blur (embacado dos chips)');
    assert.ok(split.right <= split.mapaLeft, 'o backdrop fica CONFINADO a coluna da Nota (nao cobre o Mapa)');

    assert.deepEqual(erros, [], 'sem erros de pagina');
    console.log('OK: Mapa padronizado como Notas (chips + campo do Mapa) e vidro preservado no split');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA PADRAO NOTAS]
