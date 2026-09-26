// 🧪 [INÍCIO: TESTE - MAPA ABERTURA PADRAO]
/*
 * Abertura padrão da área de MAPAS — espelho fiel das Notas
 * (`lerNotaAtiva() || projectsData[0]` + `definirPastaAtivaNotas`):
 *  - ao ENTRAR na área, o PRIMEIRO mapa da pasta ativa já fica selecionado
 *    (chip `is-active` + canvas renderizado);
 *  - o mapa JÁ aberto é preservado quando pertence à pasta ativa;
 *  - trocar de pasta abre o primeiro mapa DAQUELA pasta;
 *  - mapa aberto de OUTRA pasta é trocado pelo primeiro da pasta ativa;
 *  - pasta VAZIA mantém o estado "Nenhum mapa aberto." (não cria mapa);
 *  - na abertura, restaura o último mapa ativo persistido (`lerMapaAtivo`) se
 *    ele pertencer à pasta ativa.
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
      // Pasta ativa = Geral: dois mapas (Alpha/Beta) + um mapa em OUTRA pasta.
      const s = window.MapaMentalStore;
      const beta = s.criarMapa('Beta', null);
      const alpha = s.criarMapa('Alpha', null);
      const trab = s.criarPasta('Trabalho');
      const zeta = s.criarMapa('Zeta', trab.id);
      app.__betaId = beta.id;
      app.__alphaId = alpha.id;
      app.__trabId = trab.id;
      app.__zetaId = zeta.id;
      // 1ª ENTRADA na área: abertura padrão (não há mapa aberto ainda).
      app.aplicarArea('mapa');
    });
    await page.waitForTimeout(250);

    const chipAtivo = () => page.evaluate(() => {
      const el = document.querySelector('#mapaChipsNav .notes-context-chip.is-active');
      return el ? el.textContent : null;
    });
    const titulo = () => page.evaluate(() => {
      const el = document.getElementById('mapaTituloAtual');
      return el ? el.textContent : null;
    });
    const estadoVazio = () => page.evaluate(() => {
      const el = document.querySelector('#mapaCanvasWrap .mapa-vazio-titulo');
      return el ? el.textContent : null;
    });

    // ---------------------------------------------------------------- 1) 1ª entrada abre o PRIMEIRO mapa
    assert.equal(await chipAtivo(), 'Alpha', 'ao entrar na área, o PRIMEIRO mapa da pasta (ordem por nome) já fica ativo');
    assert.equal(await titulo(), 'Alpha', 'o mapa do primeiro chip é renderizado no canvas');
    assert.equal(await estadoVazio(), null, 'com mapa selecionado, NÃO mostra o estado "Nenhum mapa aberto."');
    assert.equal(await page.evaluate(() => window.app.mapaAbertaId), await page.evaluate(() => window.app.__alphaId), 'o mapa aberto é o do primeiro chip');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-mapa-ativo'))), await page.evaluate(() => window.app.__alphaId), 'o mapa ativo fica persistido');

    // ---------------------------------------------------------------- 2) mapa já aberto é PRESERVADO
    await page.evaluate(() => { window.app.mapaAbertaId = window.app.__betaId; window.app.renderArea(); });
    await page.evaluate(() => window.app.aplicarArea('mapa'));
    assert.equal(await chipAtivo(), 'Beta', 'o mapa já selecionado (da pasta) é PRESERVADO, não volta ao primeiro');
    assert.equal(await titulo(), 'Beta', 'o canvas continua no mapa já aberto');

    // ---------------------------------------------------------------- 3) trocar de pasta abre o 1º da nova pasta
    await page.evaluate(() => window.app.abrirPasta(window.app.__trabId));
    await page.waitForTimeout(150);
    await page.evaluate(() => window.app.aplicarArea('mapa'));
    assert.equal(await page.evaluate(() => window.app.mapaAbertaId), await page.evaluate(() => window.app.__zetaId), 'ao voltar ao mapa, abre o primeiro mapa da pasta ativa (Zeta)');
    assert.equal(await chipAtivo(), 'Zeta', 'o chip ativo é o do mapa da pasta (Zeta)');
    assert.equal(await titulo(), 'Zeta', 'o canvas renderiza o mapa da pasta');
    const chipsTrab = await page.evaluate(() => [...document.querySelectorAll('#mapaChipsNav .notes-context-chip:not(.notes-context-chip-add)')].map(c => c.textContent));
    assert.deepEqual(chipsTrab, ['Zeta'], 'a faixa lista só os mapas da pasta ativa');

    // ---------------------------------------------------------------- 4) pasta VAZIA mantém o estado vazio
    await page.evaluate(() => {
      const vazia = window.MapaMentalStore.criarPasta('Vazia');
      window.app.__vaziaId = vazia.id;
      window.app.abrirPasta(vazia.id);
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => window.app.aplicarArea('mapa'));
    assert.equal(await page.evaluate(() => window.app.mapaAbertaId), null, 'pasta vazia: nenhum mapa aberto (não cria mapa)');
    assert.equal(await estadoVazio(), 'Nenhum mapa aberto.', 'pasta vazia mantém o estado "Nenhum mapa aberto."');
    assert.equal(await chipAtivo(), null, 'pasta vazia: nenhum chip ativo');

    // ---------------------------------------------------------------- 5) restaura o mapa ativo persistido
    const restaurado = await page.evaluate(() => {
      window.app.pastaAtiva = 'pasta-geral';
      window.app.mapaAbertaId = null;
      localStorage.setItem('notas-pwa-mapa-ativo', JSON.stringify(window.app.__betaId));
      const mudou = window.app.garantirMapaSelecionado();
      window.app.renderArea();
      return { mudou, aberto: window.app.mapaAbertaId };
    });
    assert.equal(restaurado.mudou, true, 'a seleção mudou ao restaurar');
    assert.equal(restaurado.aberto, await page.evaluate(() => window.app.__betaId), 'restaura o último mapa ativo persistido (Beta)');
    assert.equal(await chipAtivo(), 'Beta', 'o chip restaurado fica ativo');

    // ---------------------------------------------------------------- 6) mapa de OUTRA pasta é trocado
    const trocado = await page.evaluate(() => {
      window.app.pastaAtiva = 'pasta-geral';
      window.app.mapaAbertaId = window.app.__zetaId; // Zeta pertence a Trabalho
      localStorage.setItem('notas-pwa-mapa-ativo', JSON.stringify(window.app.__zetaId));
      const mudou = window.app.garantirMapaSelecionado();
      window.app.renderArea();
      return { mudou, aberto: window.app.mapaAbertaId };
    });
    assert.equal(trocado.mudou, true, 'troca o mapa quando ele NÃO pertence à pasta ativa');
    assert.equal(trocado.aberto, await page.evaluate(() => window.app.__alphaId), 'cai no PRIMEIRO mapa da pasta ativa (Alpha)');
    assert.equal(await chipAtivo(), 'Alpha', 'o chip ativo volta ao primeiro da pasta');

    assert.deepEqual(erros, []);
    console.log('OK: abertura padrão da área de Mapas (primeiro chip ativo + mapa renderizado, espelho das Notas)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA ABERTURA PADRAO]
