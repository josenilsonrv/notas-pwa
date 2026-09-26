// 🧪 [INÍCIO: TESTE - EXPANDIR (NOTAS + MAPA)]
/* CLASSE ÚNICA do expandir/contrair (AppExpandir, em app.js) usada pelas DUAS áreas.
 *
 * Cobre: expandir FECHA o lado a lado e recolhe as barras UMA POR VEZ (na ordem);
 * contrair mostra as barras UMA POR VEZ (ORDEM INVERSA) e volta ao LADO A LADO
 * (`contrairEmLadoALado`: o ⛶ é o ÚNICO controle do split — sem ele, contrair
 * só devolvia o tamanho normal); barra que já estava recolhida não reaparece
 * sozinha; `aria-pressed` do botão sincronizado; e a MESMA classe compartilhada
 * `.app-tela-cheia` nas duas áreas.
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
      app.setupModalListeners();
      localStorage.clear();
      document.getElementById('notesModalBackdrop').classList.add('active');
      app.inicializarAreasMapa();
      app.aplicarArea('mapa');
      const grafo = window.MapaMentalStore.criarMapa('Expandir', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'projeto');
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
      // Gravador da ORDEM em que cada barra muda de `hidden` (prova do "uma por vez").
      window.__ordem = [];
      window.__observar = ids => {
        if (window.__obs) window.__obs.disconnect();
        window.__ordem = [];
        window.__obs = new MutationObserver(muts => muts.forEach(m => {
          if (m.attributeName !== 'hidden') return;
          const antes = m.oldValue === null ? false : true;   // atributo presente = hidden
          if (antes === m.target.hidden) return;              // reatribuição sem mudança: ignora
          window.__ordem.push(m.target.id + ':' + (m.target.hidden ? 'hide' : 'show'));
        }));
        ids.forEach(id => { const el = document.getElementById(id); if (el) window.__obs.observe(el, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true }); });
      };
      window.__reiniciar = () => { window.__ordem = []; };
      window.__oculto = ids => ids.map(id => document.getElementById(id).hidden);
    });

    // ------------------------------------------------- 1) NOTAS: lado a lado + ordem
    await page.evaluate(() => { app.aplicarSplit(true); window.__observar(['notesToolbar', 'notesContextNav']); });
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('app-split')), true, 'lado a lado ligado antes de expandir');
    await page.evaluate(() => app.toggleNotesFullscreen());
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('app-split')), false, 'expandir FECHA o que está ao lado');
    assert.deepEqual(await page.evaluate(() => window.__oculto(['notesToolbar', 'notesContextNav'])), [true, true], 'expandir recolhe as duas barras');
    assert.equal(await page.evaluate(() => document.getElementById('notesFullscreenBtn').getAttribute('aria-pressed')), 'true', 'botão de Notas marcado como expandido');
    assert.deepEqual(await page.evaluate(() => window.__ordem), ['notesToolbar:hide', 'notesContextNav:hide'], 'Notas recolhem UMA POR VEZ, na ordem');
    const expandido = await page.evaluate(() => {
      const nota = document.getElementById('notesModal').getBoundingClientRect();
      const shell = document.querySelector('#mapaArea .mapa-shell');
      return {
        notaLeft: Math.round(nota.left), notaLargura: Math.round(nota.width), vista: window.innerWidth,
        backdropAtivo: document.getElementById('notesModalBackdrop').classList.contains('active'),
        mapaEscondido: document.getElementById('mapaArea').hidden,
        temShell: Boolean(shell)
      };
    });
    assert.ok(expandido.notaLeft >= 0 && Math.abs(expandido.notaLargura - expandido.vista) < 4, 'a nota fica em TELA CHEIA NA TELA (não é empurrada para fora do quadro)');
    assert.equal(expandido.backdropAtivo, true, 'o modal de Notas continua ativo ao expandir');
    assert.equal(expandido.mapaEscondido, true, 'o mapa sai de cena enquanto as Notas estão em tela cheia');
    await page.evaluate(() => window.__reiniciar());
    await page.evaluate(() => app.toggleNotesFullscreen());
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('app-split')), true, 'contrair REABRE o que estava ao lado');
    assert.deepEqual(await page.evaluate(() => window.__oculto(['notesToolbar', 'notesContextNav'])), [false, false], 'contrair mostra as duas barras');
    assert.equal(await page.evaluate(() => document.getElementById('notesFullscreenBtn').getAttribute('aria-pressed')), 'false', 'botão de Notas marcado como restaurado');
    assert.deepEqual(await page.evaluate(() => window.__ordem), ['notesContextNav:show', 'notesToolbar:show'], 'Notas mostram em ORDEM INVERSA');
    const contraido = await page.evaluate(() => {
      const nota = document.getElementById('notesModal').getBoundingClientRect();
      const shell = document.querySelector('#mapaArea .mapa-shell');
      const mapa = shell ? shell.getBoundingClientRect() : null;
      return {
        notaLargura: Math.round(nota.width), vista: window.innerWidth,
        mapaEscondido: document.getElementById('mapaArea').hidden,
        mapaLargura: mapa ? Math.round(mapa.width) : 0,
        mapaLeft: mapa ? Math.round(mapa.left) : -1
      };
    });
    assert.ok(contraido.notaLargura < contraido.vista, 'contrair devolve a nota ao tamanho normal (não fica em tela cheia)');
    assert.equal(contraido.mapaEscondido, false, 'o mapa REAPARECE ao contrair');
    assert.ok(contraido.mapaLargura > 0 && contraido.mapaLeft >= contraido.notaLargura - 2, 'ao contrair, nota e mapa voltam LADO A LADO');
    assert.equal(await page.evaluate(() => app.expandirNotas instanceof AppExpandir), true, 'Notas usam a CLASSE ÚNICA AppExpandir');

    // --------------------- 1b) movimento reduzido: aplica o estado SEM animação
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => app.toggleNotesFullscreen());
    assert.equal(await page.evaluate(() => document.getElementById('notesToolbar').hidden), true, 'com movimento reduzido a barra recolhe na hora');
    await page.evaluate(() => app.toggleNotesFullscreen());
    assert.equal(await page.evaluate(() => document.getElementById('notesToolbar').hidden), false, 'com movimento reduzido a barra volta na hora');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // ------------------------------- 2) NOTAS: barra já recolhida NÃO reaparece sozinha
    await page.evaluate(() => {
      document.getElementById('notesToolbar').hidden = true;   // recolhida ANTES de expandir
      document.getElementById('notesContextNav').hidden = false;
      window.__reiniciar();
    });
    await page.evaluate(() => app.toggleNotesFullscreen());
    await page.evaluate(() => window.__reiniciar());
    await page.evaluate(() => app.toggleNotesFullscreen());
    assert.deepEqual(await page.evaluate(() => window.__oculto(['notesToolbar', 'notesContextNav'])), [true, false], 'a barra que já estava recolhida continua recolhida');
    assert.deepEqual(await page.evaluate(() => window.__ordem), ['notesContextNav:show'], 'só a barra que estava visível volta');

    // ------------------------------------------------- 3) MAPA: mesma ordem/inversa
    const BARRAS = ['mapaToolbar', 'mapaFormatBar', 'mapaChipsNav', 'mapaRodape'];
    await page.evaluate(ids => { window.app.renderArea(); window.__observar(ids); }, BARRAS);
    await page.locator('#mapaFullscreenBtn').click();
    await page.waitForFunction(ids => window.app.mapaFullscreen && ids.every(id => document.getElementById(id).hidden), BARRAS);
    assert.equal(await page.evaluate(() => Boolean(app.mapaFullscreen)), true, 'Mapa em tela cheia');
    assert.deepEqual(await page.evaluate(ids => window.__oculto(ids), BARRAS), [true, true, true, true], 'Mapa recolhe as 4 barras');
    assert.deepEqual(await page.evaluate(() => window.__ordem), BARRAS.map(id => id + ':hide'), 'Mapa recolhe UMA POR VEZ, na ordem');
    assert.equal(await page.evaluate(() => document.getElementById('mapaFullscreenBtn').getAttribute('aria-pressed')), 'true', 'botão do Mapa marcado como expandido');
    assert.equal(await page.evaluate(() => document.querySelector('#mapaArea .mapa-shell').classList.contains('app-tela-cheia')), true, 'MESMA classe compartilhada .app-tela-cheia');
    await page.evaluate(() => window.__reiniciar());
    await page.locator('#mapaFullscreenBtn').click();
    await page.waitForFunction(ids => !window.app.mapaFullscreen && ids.every(id => !document.getElementById(id).hidden), BARRAS);
    assert.equal(await page.evaluate(() => Boolean(app.mapaFullscreen)), false, 'Mapa restaurado');
    assert.deepEqual(await page.evaluate(ids => window.__oculto(ids), BARRAS), [false, false, false, false], 'Mapa mostra as 4 barras');
    assert.deepEqual(await page.evaluate(() => window.__ordem), BARRAS.slice().reverse().map(id => id + ':show'), 'Mapa mostra em ORDEM INVERSA');
    assert.equal(await page.evaluate(() => document.querySelector('#mapaArea .mapa-shell').classList.contains('app-tela-cheia')), false, 'classe compartilhada removida ao restaurar');
    assert.equal(await page.evaluate(() => app.expandirMapa instanceof AppExpandir), true, 'Mapa usa a CLASSE ÚNICA AppExpandir');

    // ------------------- 4) ⛶ é o ÚNICO controle do lado a lado (os botões "Ver mapa
    //                        ao lado"/"Ver nota ao lado" foram REMOVIDOS): EXPANDIR
    //                        deixa UMA tela; CONTRAIR volta a Notas + Mapa
    await page.evaluate(() => app.aplicarArea('mapa'));
    await page.evaluate(() => window.__reiniciar());
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('app-split')), false, 'estado inicial: só o mapa na tela (sem lado a lado)');
    await page.locator('#mapaFullscreenBtn').click();
    await page.waitForFunction(ids => window.app.mapaFullscreen && ids.every(id => document.getElementById(id).hidden), BARRAS);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('app-split')), false, 'EXPANDIR deixa uma tela SÓ (não liga o lado a lado)');
    assert.equal(await page.evaluate(() => document.getElementById('mapaFullscreenBtn').title), 'Retrair (notas + mapa)', 'expandido, o rótulo anuncia a volta ao lado a lado');
    await page.locator('#mapaFullscreenBtn').click();
    await page.waitForFunction(() => !window.app.mapaFullscreen && document.documentElement.classList.contains('app-split'));
    const doisLados = await page.evaluate(() => {
      const backdrop = document.getElementById('notesModalBackdrop');
      return {
        mapa: !document.getElementById('mapaArea').hidden,
        nota: backdrop.classList.contains('active'),
        larguraNota: Math.round(backdrop.getBoundingClientRect().width),
        vista: window.innerWidth,
        telaCheia: document.querySelector('#mapaArea .mapa-shell').classList.contains('app-tela-cheia'),
        titulo: document.getElementById('mapaFullscreenBtn').title
      };
    });
    assert.equal(doisLados.mapa, true, 'CONTRAIR traz o MAPA de volta');
    assert.equal(doisLados.nota, true, 'CONTRAIR traz a NOTA de volta — Notas + Mapa lado a lado');
    assert.ok(doisLados.larguraNota < doisLados.vista, 'a nota ocupa METADE da tela (não é tela cheia)');
    assert.equal(doisLados.telaCheia, false, 'a área sai da tela cheia ao contrair');
    assert.equal(doisLados.titulo, 'Expandir (só o mapa)', 'em tela normal, o rótulo do ⛶ diz o que o clique faz');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaSplitBtn'))), false, 'o botão "Ver nota ao lado" não existe mais');

    assert.deepEqual(erros, [], 'sem erros de página');
    console.log('OK: expandir/contrair único (Notas + Mapa) — expandir deixa uma tela, contrair volta ao lado a lado (barras uma por vez)');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - EXPANDIR (NOTAS + MAPA)]
