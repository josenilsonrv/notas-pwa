// 🧪 [INÍCIO: TESTE - MAPA AREA]
/*
 * FASE 0 - Fundação e isolamento da área "Mapa Mental".
 * Cobre: seletor de áreas (Notas | Mapa Mental), troca de área, persistência em
 * `notas-pwa-area-ativa`, montagem LAZY do shell e reação ao evento `themechange`,
 * sem afetar o editor de notas (o modal continua sendo a área padrão).
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
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-render.js', 'mapa/mapa.js']) {
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
      document.getElementById('notesModalBackdrop').classList.add('active');
    });

    const estado = () => page.evaluate(() => ({
      area: localStorage.getItem('notas-pwa-area-ativa'),
      backdropAtivo: document.getElementById('notesModalBackdrop').classList.contains('active'),
      mapaOculto: document.getElementById('mapaArea').hidden,
      montado: document.getElementById('mapaArea').querySelector('.mapa-shell') !== null,
      selecionada: document.querySelector('[data-app-area="mapa"]').getAttribute('aria-selected')
    }));

    // Estrutura do seletor de áreas (fora do modal de notas).
    const abas = await page.evaluate(() => ({
      total: document.querySelectorAll('#appAreas [data-app-area]').length,
      dentroDoModal: document.querySelectorAll('#notesModalBackdrop [data-app-area]').length,
      contemMapa: document.getElementById('notesModalBackdrop').contains(document.getElementById('mapaArea'))
    }));
    assert.equal(abas.total, 3, 'seletor tem Pastas, Notas e Mapa Mental');
    assert.equal(abas.dentroDoModal, 0, 'seletor fica FORA do modal de notas');
    assert.equal(abas.contemMapa, false, 'área do mapa fica FORA do modal de notas');

    // Estado inicial: Notas ativa e mapa NÃO montado (lazy).
    const inicial = await estado();
    assert.equal(inicial.backdropAtivo, true, 'Notas começa ativa');
    assert.equal(inicial.mapaOculto, true, 'área do mapa começa oculta');
    assert.equal(inicial.montado, false, 'área do mapa NÃO monta no boot (lazy)');

    await page.evaluate(() => app.inicializarAreasMapa());

    // Entra no Mapa Mental.
    await page.getByRole('tab', { name: 'Mapa Mental' }).click();
    const noMapa = await estado();
    assert.equal(JSON.parse(noMapa.area), 'mapa', 'área ativa persistida');
    assert.equal(noMapa.backdropAtivo, false, 'modal de notas some no mapa');
    assert.equal(noMapa.mapaOculto, false, 'área do mapa visível');
    assert.equal(noMapa.montado, true, 'shell monta na primeira entrada (lazy)');
    assert.equal(noMapa.selecionada, 'true', 'aba do mapa marcada');

    // Tema acompanha o evento `themechange`.
    const tema = await page.evaluate(async () => {
      document.documentElement.dataset.theme = 'dark';
      window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: 'dark' } }));
      await new Promise(r => setTimeout(r, 0));
      return document.getElementById('mapaArea').dataset.mapaTema;
    });
    assert.equal(tema, 'dark', 'evento themechange reflete na área do mapa');

    // Volta para Notas.
    await page.getByRole('tab', { name: 'Notas' }).click();
    const deVolta = await estado();
    assert.equal(JSON.parse(deVolta.area), 'notas', 'área volta para Notas');
    assert.equal(deVolta.backdropAtivo, true, 'modal de notas volta a aparecer');
    assert.equal(deVolta.mapaOculto, true, 'área do mapa volta a ficar oculta');

    // Blindagem: se um módulo do mapa não carregar, a área mostra um aviso VISÍVEL
    // (nunca fica vazia em silêncio) com as ações "Recarregar" e "Reparar (limpar cache)".
    const blindagem = await page.evaluate(() => {
      const salvo = window.MapaMentalRender;
      window.MapaMentalRender = undefined;
      app.mapaAreaMontada = false;
      app.mapaAreaOuvintesLigados = false;
      app.aplicarArea('mapa');
      const caixa = document.querySelector('#mapaArea .mapa-falha');
      const resultado = {
        visivel: !!caixa,
        titulo: caixa ? caixa.querySelector('.mapa-falha-titulo').textContent : '',
        texto: caixa ? caixa.querySelector('.mapa-falha-dica').textContent : '',
        reparar: caixa ? caixa.querySelector('a[href$="reparar.html"]') !== null : false
      };
      window.MapaMentalRender = salvo;
      return resultado;
    });
    assert.equal(blindagem.visivel, true, 'blindagem mostra aviso quando falta um módulo');
    assert.equal(blindagem.reparar, true, 'aviso oferece "Reparar (limpar cache)"');
    assert.ok(/Módulos|renderização/.test(blindagem.texto), 'aviso explica o motivo');

    // Recuperação: com o módulo de volta, reentrar remonta a área normalmente.
    const recuperado = await page.evaluate(() => {
      app.aplicarArea('notas');
      app.aplicarArea('mapa');
      return {
        falha: document.querySelector('#mapaArea .mapa-falha') !== null,
        montado: document.querySelector('#mapaArea .mapa-shell') !== null,
        ouvintes: app.mapaAreaOuvintesLigados
      };
    });
    assert.equal(recuperado.falha, false, 'aviso some após o módulo voltar');
    assert.equal(recuperado.montado, true, 'área remonta normalmente');
    assert.equal(recuperado.ouvintes, true, 'ouvintes ligados uma única vez');

    assert.deepEqual(erros, []);
    console.log('OK: área Notas/Mapa Mental, montagem lazy, tema e persistência');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA AREA]
