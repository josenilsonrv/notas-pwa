// 🧪 [INÍCIO: TESTE - MAPA TOOLBAR]
/*
 * FASE 12 - Barras padronizadas + menus + cores.
 * Cobre: barra de FERRAMENTAS fixa (uma linha com rolagem, grupos + divisores),
 * barra de FORMATAÇÃO contextual, ausência de botão solto, menu contextual do card
 * (botão direito) com comandos específicos, paleta de cores no MESMO padrão de Notas
 * (80 cores + recentes no grafo), ordem da barra persistida + restaurar.
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
      const grafo = window.MapaMentalStore.criarMapa('Barras', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'projeto');
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
    });

    // ---------------------------------------------------------------- helpers
    const idDe = titulo => page.evaluate(t => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === t);
      return no ? no.id : null;
    }, titulo);
    const selecionar = id => page.evaluate(alvo => {
      window.app.mapaSelecao = new Set([alvo]);
      window.app.renderArea();
    }, id);
    const menuNo = id => page.evaluate(alvo => {
      const el = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + alvo + '"]');
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 140, clientY: 160 }));
    }, id);
    const estiloDe = titulo => page.evaluate(t => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === t);
      return no ? JSON.parse(JSON.stringify(no.estilo || {})) : null;
    }, titulo);
    const clicar = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('elemento não encontrado: ' + s);
      el.click();
    }, sel);

    const idObjetivo = await idDe('Objetivo');
    // ---------------------------------------------------------------- 1) barra de ferramentas
    const barra = await page.evaluate(() => {
      const el = document.getElementById('mapaToolbar');
      const estilo = getComputedStyle(el);
      return {
        existe: Boolean(el),
        visivel: !el.hidden,
        role: el.getAttribute('role'),
        grupos: el.querySelectorAll('.mapa-tb-grupo').length,
        divisores: el.querySelectorAll('.mapa-tb-divisor').length,
        linhas: estilo.flexWrap,
        rolagem: estilo.overflowX,
        acoes: [...el.querySelectorAll('[data-mapa-acao]')].map(b => b.dataset.mapaAcao)
      };
    });
    assert.ok(barra.existe && barra.visivel, 'barra de ferramentas visível com o mapa aberto');
    assert.equal(barra.role, 'toolbar', 'barra com role="toolbar"');
    assert.ok(barra.grupos >= 5, 'barra tem grupos (' + barra.grupos + ')');
    assert.ok(barra.divisores >= 4, 'grupos separados por divisores');
    assert.equal(barra.linhas, 'nowrap', 'barra em UMA linha');
    assert.ok(['auto', 'scroll'].includes(barra.rolagem), 'barra com rolagem horizontal');
    ['no-desfazer', 'no-refazer', 'zoom-in', 'zoom-out', 'centralizar', 'fit', 'ir-raiz',
      'recolher-tudo', 'expandir-tudo', 'no-independente'].forEach(a => {
      assert.ok(barra.acoes.includes(a), 'barra contém a ferramenta ' + a);
    });

    // ---------------------------------------------------------------- 2) sem botão solto
    // A TOPBAR é uma barra própria (gestão); o resto exclui afinidades DO CARD
    // (alternador/checkbox/ponte), os chips de mapa conectado, o minimapa e o estado vazio.
    const soltos = await page.evaluate(() => [...document.querySelectorAll('#mapaArea [data-mapa-acao]')]
      .filter(el => !el.closest('#mapaToolbar, #mapaFormatBar, .mapa-topbar, .mapa-menu, #mapaAtalhos, #mapaBarraEditor, .mapa-painel, #mapaForm, .mapa-canvas-vazio, .mapa-no, .mapa-conexoes, #mapaMinimapa'))
      .map(el => el.dataset.mapaAcao));
    assert.deepEqual(soltos, [], 'nenhum botão solto fora das barras/menus/painel');
    // No mapa aberto, a topbar mostra SÓ "‹ Mapas" (o resto é da visão de lista).
    const topbarVisivel = await page.evaluate(() => [...document.querySelectorAll('.mapa-topbar [data-mapa-acao]')]
      .filter(el => el.offsetParent !== null).map(el => el.dataset.mapaAcao));
    assert.deepEqual(topbarVisivel, ['voltar-lista'], 'topbar do mapa só mostra "‹ Mapas"');

    // ---------------------------------------------------------------- 3) barra de formatação contextual
    assert.equal(await page.evaluate(() => document.getElementById('mapaFormatBar').hidden), true,
      'barra de formatação oculta sem seleção');
    await selecionar(idObjetivo);
    const fmt = await page.evaluate(() => {
      const el = document.getElementById('mapaFormatBar');
      return {
        visivel: !el.hidden,
        acoes: [...el.querySelectorAll('[data-mapa-acao]')].map(b => b.dataset.mapaAcao),
        cores: [...el.querySelectorAll('[data-mapa-cor]')].map(b => b.dataset.mapaCor)
      };
    });
    assert.equal(fmt.visivel, true, 'barra de formatação aparece com nó selecionado');
    assert.ok(fmt.acoes.includes('estilo-toggle') && fmt.acoes.includes('estilo-passo'), 'formatação tem toggles/passos');
    assert.deepEqual(fmt.cores.sort(), ['borda', 'cor', 'fundo'], 'formatação tem os 3 botões de cor (popover)');

    // Formatação rápida: negrito no nó selecionado
    await clicar('#mapaFormatBar [data-mapa-acao="estilo-toggle"][data-mapa-estilo="negrito"]');
    assert.equal((await estiloDe('Objetivo')).negrito, true, 'barra de formatação aplica negrito');

    // ---------------------------------------------------------------- 4) menu contextual do card
    await menuNo(idObjetivo);
    const menu = await page.evaluate(() => {
      const el = document.getElementById('mapaMenu');
      return el ? { role: el.getAttribute('role'), itens: [...el.querySelectorAll('[data-mapa-acao]')].map(b => b.dataset.mapaAcao) } : null;
    });
    assert.ok(menu, 'menu contextual abre no botão direito');
    assert.equal(menu.role, 'menu', 'menu com role="menu"');
    ['no-filho', 'no-irmao', 'no-duplicar', 'no-copiar', 'no-recortar', 'no-colar',
      'no-bloquear', 'no-largura-menos', 'no-largura-mais', 'no-excluir'].forEach(a => {
      assert.ok(menu.itens.includes(a), 'menu do card contém ' + a);
    });

    // Duplicar pelo menu
    const antesDup = await page.evaluate(() => window.app.mapaCanvasGrafo.nos.length);
    await clicar('#mapaMenu [data-mapa-acao="no-duplicar"]');
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.nos.length), antesDup + 1,
      'duplicar pelo menu contextual funciona');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaMenu'))), false,
      'menu fecha após a ação');

    // Esc/clique fora fecha o menu
    await menuNo(idObjetivo);
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('mapaMenu'))), 'menu reabre');
    await clicar('#mapaMenu [data-mapa-acao="menu-fechar"]');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaMenu'))), false, 'menu fecha pelo item Fechar');

    // ---------------------------------------------------------------- 5) paleta de cores (padrão de Notas)
    await selecionar(idObjetivo);
    await clicar('#mapaFormatBar [data-mapa-cor="fundo"]');
    const paleta = await page.evaluate(() => {
      const el = document.getElementById('mapaCoresPaleta');
      return el ? {
        role: el.getAttribute('role'),
        swatches: el.querySelectorAll('.mapa-cor-grade button').length,
        recentes: el.querySelectorAll('.mapa-cor-recentes button').length,
        temReset: Boolean(el.querySelector('.mapa-cor-reset')),
        temAplicar: Boolean(el.querySelector('.mapa-cor-aplicar'))
      } : null;
    });
    assert.ok(paleta, 'clique no botão de cor abre a paleta');
    assert.equal(paleta.role, 'dialog', 'paleta com role="dialog"');
    assert.equal(paleta.swatches, 80, 'grade 8x10 = 80 cores (igual a Notas)');
    assert.ok(paleta.recentes >= 1 && paleta.temReset && paleta.temAplicar, 'paleta tem recentes/reset/aplicar');

    await page.evaluate(() => {
      const swatch = [...document.querySelectorAll('#mapaCoresPaleta .mapa-cor-grade button')]
        .find(b => b.title.toLowerCase() === '#4a86e8');
      swatch.click();
      document.querySelector('#mapaCoresPaleta .mapa-cor-aplicar').click();
    });
    assert.equal((await estiloDe('Objetivo')).fundo, '#4a86e8', 'cor escolhida é aplicada no nó');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaCoresPaleta'))), false, 'paleta fecha ao aplicar');
    const recentesGrafo = await page.evaluate(() => window.app.mapaCanvasGrafo.coresRecentes || {});
    assert.ok((recentesGrafo.fundo || []).includes('#4a86e8'), 'recentes do mapa guardam a cor usada');

    // Esc fecha a paleta
    await clicar('#mapaFormatBar [data-mapa-cor="borda"]');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaCoresPaleta'))), false, 'Esc fecha a paleta');

    // ---------------------------------------------------------------- 6) ordem da barra persistida
    await clicar('#mapaToolbar [data-mapa-acao="barra-editar"]');
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('mapaBarraEditor'))), 'painel "Editar barra" abre');
    const ordemAntes = await page.evaluate(() => [...document.querySelectorAll('#mapaToolbar .mapa-tb-grupo[data-mapa-grupo="historico"] .mapa-tb-btn')]
      .map(b => b.dataset.mapaBotao));
    await clicar('#mapaBarraEditor [data-mapa-acao="barra-mover"][data-mapa-grupo="historico"][data-mapa-botao="refazer"][data-mapa-dir="-1"]');
    const ordemDepois = await page.evaluate(() => [...document.querySelectorAll('#mapaToolbar .mapa-tb-grupo[data-mapa-grupo="historico"] .mapa-tb-btn')]
      .map(b => b.dataset.mapaBotao));
    assert.deepEqual(ordemDepois, ordemAntes.slice().reverse(), 'mover altera a ordem do grupo');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-mapa-toolbar-order')).historico.join(',')),
      'refazer,desfazer', 'ordem persistida em notas-pwa-mapa-toolbar-order');

    await clicar('#mapaBarraEditor [data-mapa-acao="barra-restaurar"]');
    assert.equal(await page.evaluate(() => localStorage.getItem('notas-pwa-mapa-toolbar-order')), null, 'restaurar padrão apaga a ordem');
    await clicar('#mapaBarraEditor [data-mapa-acao="barra-fechar"]');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaBarraEditor'))), false, 'painel fecha');

    assert.deepEqual(erros, []);
    console.log('OK: barras padronizadas (ferramentas, formatação, menu do card, cores, ordem)');

  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA TOOLBAR]