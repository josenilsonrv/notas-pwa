// 🧪 [INÍCIO: TESTE - MAPA CHIPS]
/*
 * Faixa de chips da área de MAPAS — espelho FIEL da faixa de chips de Notas.
 * Cobre: MESMAS classes (`.notes-context-nav`/`.notes-context-chip`/`-add`/`.notes-chip-menu`),
 * MESMA formatação (padding/cor/raio/"+"), só os MAPAS da pasta ativa, clique abre,
 * menu do chip (Renomear · Duplicar · Mover para pasta · Excluir) por botão direito e
 * por toque longo, "+" criando na pasta ativa e o botão "Modelos" na barra de
 * formatação (mesmo ícone/classe do "Modelos" de Notas).
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
        { id: 'nota-1', nome: 'Nota Um', notas: '', pastaId: null },
        { id: 'nota-2', nome: 'Nota Dois', notas: '', pastaId: null }
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
      localStorage.clear();
      document.getElementById('notesModalBackdrop').classList.add('active');
      app.inicializarAreasMapa();
      // Pasta ativa = Geral: 2 mapas lá + 1 mapa em OUTRA pasta (não pode aparecer).
      window.MapaMentalStore.criarMapa('Mapa Um', null);
      const aberto = window.MapaMentalStore.criarMapa('Mapa Dois', null);
      const outra = window.MapaMentalStore.criarPasta('Outra');
      window.MapaMentalStore.criarMapa('Mapa de Fora', outra.id);
      app.aplicarArea('mapa');
      app.mapaAbertaId = aberto.id;
      app.renderArea();
      app.renderNotesNav();
      window.__abertoId = aberto.id;
    });

    // ---------------------------------------------------------------- helpers
    const chipsMapa = () => page.evaluate(() => [...document.querySelectorAll('#mapaChipsNav .notes-context-chip')]
      .map(el => ({ nome: el.textContent, add: el.classList.contains('notes-context-chip-add'), id: el.dataset.mapaId || null })));
    const medir = () => page.evaluate(() => {
      const cs = sel => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const c = getComputedStyle(el);
        return {
          bg: c.backgroundColor, color: c.color, radius: c.borderRadius, bw: c.borderTopWidth,
          pad: c.padding, bf: c.backdropFilter, opacity: c.opacity, w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height), pos: c.position
        };
      };
      return {
        mapa: {
          chip: cs('#mapaChipsNav .notes-context-chip:not(.is-active):not(.notes-context-chip-add)'),
          add: cs('#mapaChipsNav .notes-context-chip-add'),
          navClasses: document.getElementById('mapaChipsNav').className
        },
        notas: {
          chip: cs('#notesContextNav .notes-context-chip:not(.is-active):not(.notes-context-chip-add)'),
          add: cs('#notesContextNav .notes-context-chip-add'),
          navClasses: document.getElementById('notesContextNav').className
        }
      };
    });

    // ---------------------------------------------------------------- 1) mesmas classes
    const classes = await medir();
    ['notes-context-nav', 'app-rolagem'].forEach(c => {
      assert.ok(classes.mapa.navClasses.split(' ').includes(c), 'faixa do Mapa reusa a classe ' + c);
    });
    const medidas = await medir();
    assert.equal(medidas.mapa.chip.radius, medidas.notas.chip.radius, 'chip do Mapa com o MESMO raio de Notas');
    assert.equal(medidas.mapa.chip.bw, medidas.notas.chip.bw, 'chip do Mapa sem borda (igual a Notas)');
    assert.equal(medidas.mapa.chip.pad, medidas.notas.chip.pad, 'chip do Mapa com o MESMO padding de Notas');
    assert.equal(medidas.mapa.chip.bg, medidas.notas.chip.bg, 'chip do Mapa com o MESMO fundo de Notas');
    assert.equal(medidas.mapa.chip.color, medidas.notas.chip.color, 'chip do Mapa com a MESMA cor de texto');
    assert.equal(medidas.mapa.add.bg, medidas.notas.add.bg, 'botão "+" do Mapa com o MESMO fundo do "+" de Notas');
    assert.equal(medidas.mapa.add.bf, medidas.notas.add.bf, 'botão "+" do Mapa com o MESMO vidro do "+" de Notas');
    assert.equal(medidas.mapa.add.pos, 'sticky', 'botão "+" do Mapa preso na faixa (sticky), igual a Notas');
    assert.equal(medidas.mapa.add.w, medidas.notas.add.w, 'botão "+" do Mapa com a MESMA largura do "+" de Notas');
    assert.equal(medidas.mapa.add.h, medidas.notas.add.h, 'botão "+" do Mapa com a MESMA altura do "+" de Notas');
    assert.equal(medidas.mapa.add.opacity, medidas.notas.add.opacity, 'botão "+" do Mapa com a MESMA opacidade de Notas');

    // ---------------------------------------------------------------- 2) só os MAPAS da pasta ativa
    const faixa = await chipsMapa();
    assert.deepEqual(faixa.filter(c => !c.add).map(c => c.nome), ['Mapa Dois', 'Mapa Um'], 'a faixa lista só os mapas da pasta ativa (ordem por nome)');
    assert.equal(faixa.filter(c => c.add).length, 1, 'a faixa tem UM botão "+"');
    assert.equal(faixa.some(c => c.nome === 'Nota Um' || c.nome === 'Nota Dois'), false, 'a faixa do Mapa NÃO mostra notas');
    assert.equal(faixa.some(c => c.nome === 'Mapa de Fora'), false, 'mapa de outra pasta não aparece');

    // ---------------------------------------------------------------- 3) clique abre o mapa
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('#mapaChipsNav .notes-context-chip:not(.notes-context-chip-add)')]
        .find(chip => chip.textContent === 'Mapa Um');
      el.click();
    });
    assert.equal(await page.evaluate(() => document.getElementById('mapaTituloAtual').textContent), 'Mapa Um', 'clicar no chip abre o mapa');
    assert.equal(await page.evaluate(() => document.querySelector('#mapaChipsNav .notes-context-chip.is-active').textContent), 'Mapa Um', 'o chip aberto fica ativo');


    // ---------------------------------------------------------------- 4) menu do chip (botão direito)
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('#mapaChipsNav .notes-context-chip:not(.notes-context-chip-add)')]
        .find(chip => chip.textContent === 'Mapa Dois');
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const menu = await page.evaluate(() => {
      const el = document.getElementById('mapaChipMenu');
      return el ? { classes: el.className, role: el.getAttribute('role'), itens: [...el.querySelectorAll('button')].map(b => b.textContent.trim()) } : null;
    });
    assert.ok(menu, 'o botão direito abre o menu do chip');
    assert.equal(menu.classes, 'notes-chip-menu', 'o menu usa a MESMA classe de Notas (.notes-chip-menu)');
    assert.equal(menu.role, 'menu', 'menu com role="menu"');
    assert.deepEqual(menu.itens, ['Renomear', 'Duplicar', 'Mover para pasta…', 'Excluir'], 'as MESMAS 4 ações do chip de Notas');

    // "Mover para pasta…" abre o submenu com as pastas (a atual marcada).
    await page.evaluate(() => {
      [...document.querySelectorAll('#mapaChipMenu button')].find(b => b.textContent.trim() === 'Mover para pasta…').click();
    });
    const pastas = await page.evaluate(() => [...document.querySelectorAll('#mapaChipMenu button')]
      .map(b => ({ nome: b.textContent.trim(), marcada: b.getAttribute('aria-checked') })));
    assert.deepEqual(pastas.map(p => p.nome), ['Sem pasta', 'Geral', 'Outra'], 'submenu lista as pastas');
    assert.equal(pastas.find(p => p.nome === 'Sem pasta').marcada, 'true', 'a pasta atual do mapa aparece marcada (aqui: sem pasta, como em Notas)');
    assert.equal(pastas.filter(p => p.marcada === 'true').length, 1, 'apenas UMA pasta marcada');
    await page.evaluate(() => window.app.fecharMenuMapa());
    assert.equal(await page.evaluate(() => document.getElementById('mapaChipMenu') === null), true, 'o menu fecha');

    // ---------------------------------------------------------------- 5) toque longo (celular)
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('#mapaChipsNav .notes-context-chip:not(.notes-context-chip-add)')]
        .find(chip => chip.textContent === 'Mapa Dois');
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
    });
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaChipMenu'))), true, 'toque longo abre o menu do chip');
    await page.evaluate(() => window.app.fecharMenuMapa());

    // ---------------------------------------------------------------- 6) "+" cria na pasta ativa
    const antes = await page.evaluate(() => window.MapaMentalStore.listarMapas().length);
    await page.evaluate(() => document.querySelector('#mapaChipsNav .notes-context-chip-add').click());
    const depois = await page.evaluate(() => {
      const lista = window.MapaMentalStore.listarMapas();
      const novo = lista.find(m => m.nome === 'Novo mapa');
      return { total: lista.length, pastaId: novo ? novo.pastaId : null, aberto: document.getElementById('mapaTituloAtual').textContent };
    });
    assert.equal(depois.total, antes + 1, 'o "+" cria um mapa novo');
    assert.equal(depois.pastaId, 'pasta-geral', 'o mapa nasce na PASTA ativa');
    assert.equal(depois.aberto, 'Novo mapa', 'o mapa novo já abre');

    // ---------------------------------------------------------------- 7) botão Modelos (barra de formatação)
    const modelos = await page.evaluate(() => {
      const b = document.getElementById('mapaModelosBtn');
      const notas = document.querySelector('#notesToolbar [data-extra="templates"]');
      return {
        existe: Boolean(b),
        naBarra: b ? document.getElementById('mapaFormatBar').contains(b) : false,
        classes: b ? b.className : '',
        popup: b ? b.getAttribute('aria-haspopup') : '',
        iconeIgual: Boolean(b && notas && b.querySelector('svg') && notas.querySelector('svg')
          && b.querySelector('svg').innerHTML === notas.querySelector('svg').innerHTML)
      };
    });
    assert.equal(modelos.existe, true, 'o botão Modelos existe');
    assert.equal(modelos.naBarra, true, 'o botão Modelos vive na BARRA DE FORMATAÇÃO (como em Notas)');
    assert.ok(modelos.classes.includes('toolbar-btn'), 'o botão Modelos usa a MESMA classe da barra de Notas (toolbar-btn)');
    assert.equal(modelos.popup, 'dialog', 'o botão Modelos anuncia aria-haspopup="dialog"');
    assert.equal(modelos.iconeIgual, true, 'o ícone do Modelos é o MESMO de Notas (quatro quadrados)');
    await page.evaluate(() => document.getElementById('mapaModelosBtn').click());
    assert.equal(await page.evaluate(() => {
      const d = document.querySelector('dialog.notes-extra-dialog');
      return d ? d.querySelector('h3').textContent : null;
    }), 'Modelos do mapa', 'abre o diálogo de Modelos (mesmas classes de Notas)');

    assert.deepEqual(erros, []);
    console.log('OK: faixa de chips dos MAPAS espelha Notas (classes, formatação, menu, toque longo, "+" e Modelos)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA CHIPS]


