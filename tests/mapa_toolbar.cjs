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

    // ------------------------------------------- 3.1) ícones padronizados nas DUAS barras
    const icones = await page.evaluate(() => {
      const botoes = [...document.querySelectorAll('#mapaToolbar .mapa-tb-btn, #mapaFormatBar .mapa-tb-btn')];
      const svgs = botoes.map(b => b.querySelector(':scope > svg'));
      return {
        total: botoes.length,
        comIcone: svgs.filter(Boolean).length,
        tamanhos: [...new Set(svgs.filter(Boolean).map(s => s.getAttribute('width') + 'x' + s.getAttribute('height')))],
        tracos: [...new Set(svgs.filter(Boolean).map(s => s.getAttribute('stroke-width')))],
        cores: [...new Set(svgs.filter(Boolean).map(s => s.getAttribute('stroke')))],
        vazios: svgs.filter(s => s && s.children.length === 0).length
      };
    });
    assert.ok(icones.total >= 20, 'barras têm botões suficientes (' + icones.total + ')');
    assert.equal(icones.comIcone, icones.total, 'TODO botão das barras usa ícone SVG');
    assert.equal(icones.vazios, 0, 'nenhum ícone vazio (desenho presente)');
    assert.deepEqual(icones.tamanhos, ['16x16'], 'ícones com o MESMO tamanho (16x16)');
    assert.deepEqual(icones.tracos, ['2'], 'ícones com o MESMO traço (stroke-width 2)');
    assert.deepEqual(icones.cores, ['currentColor'], 'ícones seguem a cor do tema (currentColor)');

    // As funções que existem também em Notas usam o MESMO desenho de lá.
    const iguaisNotas = await page.evaluate(() => {
      const ler = sel => { const b = document.querySelector(sel); return b && b.querySelector('svg') ? b.querySelector('svg').innerHTML : null; };
      return {
        negrito: ler('#mapaFormatBar [data-mapa-estilo="negrito"]'),
        italico: ler('#mapaFormatBar [data-mapa-estilo="italico"]'),
        desfazer: ler('#mapaToolbar [data-mapa-acao="no-desfazer"]'),
        refazer: ler('#mapaToolbar [data-mapa-acao="no-refazer"]'),
        cor: ler('#mapaFormatBar [data-mapa-cor="cor"]'),
        fundo: ler('#mapaFormatBar [data-mapa-cor="fundo"]')
      };
    });
    assert.ok(/M6 4h8a4 4 0 0 1 4 4/.test(iguaisNotas.negrito), 'negrito usa o desenho da barra de Notas');
    assert.ok(/19" y1="4" x2="10"/.test(iguaisNotas.italico), 'itálico usa o desenho da barra de Notas');
    assert.ok(/M9 7 4 12l5 5/.test(iguaisNotas.desfazer), 'desfazer usa o desenho da barra de Notas');
    assert.ok(/m15 7 5 5-5 5/.test(iguaisNotas.refazer), 'refazer usa o desenho da barra de Notas');
    assert.ok(/M6\.5 12\.5 10 3\.5/.test(iguaisNotas.cor), 'cor usa o desenho da barra de Notas');
    assert.ok(/m14 3 7 7-10 10H4v-7z/.test(iguaisNotas.fundo), 'destaque usa o desenho da barra de Notas');

    // ------------------------------------------- 3.2) Fonte/Forma/Alinhamento em UM botão (menu de opções)
    const opcoes = await page.evaluate(() => [...document.querySelectorAll('#mapaFormatBar [data-mapa-acao="barra-menu"]')]
      .map(b => ({ menu: b.dataset.mapaMenu, popup: b.getAttribute('aria-haspopup') })));
    assert.deepEqual(opcoes.map(o => o.menu).sort(), ['alinhamento', 'fonte', 'forma'],
      'fonte/forma/alinhamento têm UM botão próprio cada');
    assert.ok(opcoes.every(o => o.popup === 'menu'), 'botões de opções anunciam aria-haspopup="menu"');

    await clicar('#mapaFormatBar [data-mapa-acao="barra-menu"][data-mapa-menu="fonte"]');
    const menuFonte = await page.evaluate(() => {
      const el = document.getElementById('mapaMenuOpcoes');
      return el ? {
        role: el.getAttribute('role'),
        valores: [...el.querySelectorAll('[data-mapa-estilo="fonte"]')].map(b => b.dataset.mapaValor),
        comIcone: [...el.querySelectorAll('[data-mapa-estilo="fonte"] svg')].length
      } : null;
    });
    assert.ok(menuFonte, 'botão Fonte abre o menu de opções');
    assert.equal(menuFonte.role, 'menu', 'menu de opções com role="menu"');
    assert.deepEqual(menuFonte.valores, ['sistema', 'serif', 'mono', 'cursiva'], 'opções de fonte listadas');
    assert.equal(menuFonte.comIcone, 4, 'opções também usam ícone padronizado');

    await clicar('#mapaMenuOpcoes [data-mapa-estilo="fonte"][data-mapa-valor="serif"]');
    assert.equal((await estiloDe('Objetivo')).fonte, 'serif', 'opção escolhida é aplicada no nó');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaMenuOpcoes'))), false, 'menu fecha ao escolher');

    await clicar('#mapaFormatBar [data-mapa-acao="barra-menu"][data-mapa-menu="forma"]');
    const menuForma = await page.evaluate(() => [...document.querySelectorAll('#mapaMenuOpcoes [data-mapa-estilo="forma"]')]
      .map(b => b.dataset.mapaValor));
    assert.deepEqual(menuForma, ['retangulo', 'pilula', 'elipse', 'nota'], 'opções de forma listadas');
    await clicar('#mapaMenuOpcoes [data-mapa-estilo="forma"][data-mapa-valor="pilula"]');
    assert.equal((await estiloDe('Objetivo')).forma, 'pilula', 'forma escolhida aplicada no nó');

    await clicar('#mapaFormatBar [data-mapa-acao="barra-menu"][data-mapa-menu="alinhamento"]');
    await clicar('#mapaMenuOpcoes [data-mapa-estilo="alinhamento"][data-mapa-valor="centro"]');
    assert.equal((await estiloDe('Objetivo')).alinhamento, 'centro', 'alinhamento escolhido aplicado no nó');

    // ------------------------------------------- 3.3) clicar FORA fecha os menus flutuantes
    const foraFecha = async (abrir, seletor, rotulo) => {
      await abrir();
      assert.ok(await page.evaluate(s => Boolean(document.querySelector(s)), seletor), rotulo + ': abre');
      await page.evaluate(() => {
        const alvo = document.getElementById('mapaCanvas') || document.getElementById('mapaArea');
        alvo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      assert.equal(await page.evaluate(s => Boolean(document.querySelector(s)), seletor), false,
        rotulo + ': fecha ao clicar fora');
    };

    await foraFecha(() => menuNo(idObjetivo), '#mapaMenu', 'menu contextual do card');
    await foraFecha(() => clicar('#mapaFormatBar [data-mapa-acao="barra-menu"][data-mapa-menu="forma"]'),
      '#mapaMenuOpcoes', 'menu de opções (forma)');
    await foraFecha(() => clicar('#mapaToolbar [data-mapa-acao="atalhos-abrir"]'), '#mapaAtalhos', 'painel de atalhos');
    await foraFecha(() => clicar('#mapaToolbar [data-mapa-acao="barra-editar"]'), '#mapaBarraEditor', 'editor da barra');
    await foraFecha(() => page.evaluate(() => { document.querySelector('.mapa-tb-mais').open = true; }),
      '.mapa-tb-mais[open]', 'overflow "Mais"');

    // Clicar DENTRO do menu não fecha (o gatilho continua funcionando).
    await clicar('#mapaToolbar [data-mapa-acao="barra-editar"]');
    await page.evaluate(() => document.querySelector('#mapaBarraEditor .mapa-barra-editor-lista').dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })));
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('mapaBarraEditor'))), 'clicar dentro NÃO fecha');

    // E o Esc também fecha (mesma família de menus).
    await menuNo(idObjetivo);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaMenu'))), false, 'Esc fecha o menu aberto');
    await page.evaluate(() => window.app.fecharMenusAbertos());

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