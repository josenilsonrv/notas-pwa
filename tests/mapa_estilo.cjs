// 🧪 [INÍCIO: TESTE - MAPA ESTILO]
/*
 * FASE 9 - Editor visual.
 * Cobre: cores/forma/fonte/tamanho/alinhamento/negrito/itálico pelo painel (persistidos em
 * `no.estilo` e refletidos no DOM), precedência NÓ > NÍVEL > TEMA, tema (paleta) do mapa,
 * espessura do ramo pai→filho, pincel (copiar/aplicar/restaurar) sem copiar conteúdo e o
 * tema claro/escuro respeitado automaticamente.
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
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-layout.js', 'mapa/mapa-render.js', 'mapa/mapa-painel.js', 'mapa/mapa-interacao.js', 'mapa/mapa.js']) {
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
      const grafo = window.MapaMentalStore.criarMapa('Estilo', null);
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
    const estiloDe = titulo => page.evaluate(t => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === t);
      return no ? JSON.parse(JSON.stringify(no.estilo || {})) : null;
    }, titulo);
    const clicar = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('não encontrado: ' + s);
      el.click();
    }, sel);
    const computado = (titulo, prop) => page.evaluate(({ titulo, prop }) => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === titulo);
      const el = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + no.id + '"]');
      return el ? getComputedStyle(el)[prop] : null;
    }, { titulo, prop });
    // ---------------------------------------------------------------- 1) estilo do nó pelo painel
    const idObjetivo = await idDe('Objetivo');
    await page.evaluate(id => {
      window.app.mapaSelecao = new Set([id]);
      window.app.mapaAbrirPainel(id);
    }, idObjetivo);
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('mapaEstiloFundo'))), 'seção Estilo montada no painel');
    assert.ok(await page.evaluate(() => document.querySelectorAll('#mapaTema option').length >= 4), 'seletor de tema do mapa com opções');

    await page.evaluate(() => {
      document.getElementById('mapaEstiloFundoAtiva').checked = true;
      document.getElementById('mapaEstiloFundo').value = '#123456';
      document.getElementById('mapaEstiloForma').value = 'pilula';
      document.getElementById('mapaEstiloFonte').value = 'mono';
      document.getElementById('mapaEstiloTamanho').value = '18';
      document.getElementById('mapaEstiloAlinhamento').value = 'centro';
      document.getElementById('mapaEstiloNegrito').value = 'sim';
      document.getElementById('mapaEstiloItalico').value = 'sim';
      document.getElementById('mapaEstiloEspessuraBorda').value = '3';
      document.getElementById('mapaEstiloEspessuraRamo').value = '5';
    });
    await clicar('[data-mapa-acao="no-estilo-salvar"]');

    const estilo = await estiloDe('Objetivo');
    assert.equal(estilo.fundo, '#123456', 'fundo salvo no modelo');
    assert.equal(estilo.forma, 'pilula', 'forma salva');
    assert.equal(estilo.fonte, 'mono', 'fonte salva');
    assert.equal(estilo.tamanho, 18, 'tamanho salvo');
    assert.equal(estilo.alinhamento, 'centro', 'alinhamento salvo');
    assert.equal(estilo.negrito, true, 'negrito salvo');
    assert.equal(estilo.italico, true, 'itálico salvo');
    assert.equal(estilo.espessuraBorda, 3, 'espessura da borda salva');
    assert.equal(estilo.espessuraRamo, 5, 'espessura do ramo salva');

    const classes = await page.evaluate(id => {
      const el = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + id + '"]');
      return el ? el.className : '';
    }, idObjetivo);
    ['mapa-no-forma-pilula', 'mapa-no-fonte-mono', 'mapa-no-alinha-centro', 'mapa-no-negrito', 'mapa-no-italico']
      .forEach(c => assert.ok(classes.includes(c), 'classe aplicada: ' + c));
    assert.equal(await computado('Objetivo', 'backgroundColor'), 'rgb(18, 52, 86)', 'fundo refletido no DOM');
    assert.equal(await computado('Objetivo', 'fontSize'), '18px', 'tamanho refletido no DOM');
    assert.equal(await computado('Objetivo', 'borderTopWidth'), '3px', 'espessura da borda refletida');
    const ramoW = await page.evaluate(id => {
      const p = document.querySelector('#mapaConexoesSvg .mapa-ramo[data-mapa-ramo="' + id + '"]');
      return p ? getComputedStyle(p).strokeWidth : null;
    }, idObjetivo);
    assert.equal(ramoW, '5px', 'espessura do ramo aplicada no SVG');

    // ---------------------------------------------------------------- 2) tema claro/escuro automático
    const claroBg = await computado('Escopo', 'backgroundColor');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.app.renderArea(); });
    const escuroBg = await computado('Escopo', 'backgroundColor');
    // P81: o nó sem estilo usa a MESMA superfície de vidro das barras (--app-vidro-fundo =
    // #151B23 no escuro), e não mais o container #11161D do tema original.
    assert.equal(escuroBg, 'rgb(21, 27, 35)', 'nó sem estilo usa a superfície de vidro no escuro (#151B23)');
    assert.notEqual(claroBg, escuroBg, 'o tema claro/escuro muda o nó sem estilo');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; window.app.renderArea(); });

    // ---------------------------------------------------------------- 3) precedência NÓ > NÍVEL > TEMA
    // Mutação no modelo exige persistir: o `renderArea` recarrega o grafo do storage.
    await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      window.MapaMentalModelo.definirEstiloNivel(g, 2, { fundo: '#00ff00' });
      window.MapaMentalStore.salvarGrafo(g);
      window.app.renderArea();
    });
    assert.equal(await computado('Tarefas', 'backgroundColor'), 'rgb(0, 255, 0)', 'estilo por nível aplica o fundo');
    await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const no = g.nos.find(n => n.titulo === 'Tarefas');
      window.MapaMentalModelo.atualizarEstiloNo(g, no.id, { fundo: '#ff0000' });
      window.MapaMentalStore.salvarGrafo(g);
      window.app.renderArea();
    });
    assert.equal(await computado('Tarefas', 'backgroundColor'), 'rgb(255, 0, 0)', 'estilo do nó vence o nível');

    await page.evaluate(() => window.app.mapaDefinirTema('neon'));
    assert.equal(await computado('Projeto', 'backgroundColor'), 'rgb(13, 27, 42)', 'tema do mapa (neon) aplica o fundo');
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.temaId), 'neon', 'tema persistido no grafo');
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.nos.find(n => n.titulo === 'Objetivo').estilo.fundo),
      '#123456', 'tema não sobrescreve o estilo próprio do nó');

    // ---------------------------------------------------------------- 4) pincel (copiar/aplicar/restaurar)
    const chavesCopiadas = await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const no = g.nos.find(n => n.titulo === 'Objetivo');
      return Object.keys(window.MapaMentalModelo.copiarEstiloNo(no));
    });
    assert.ok(!chavesCopiadas.includes('titulo') && !chavesCopiadas.includes('tarefa'), 'copiar estilo não copia conteúdo/tarefa');

    await page.evaluate(id => window.app.mapaCopiarEstiloNo(id), idObjetivo);
    await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const alvo = g.nos.find(n => n.titulo === 'Escopo');
      window.app.mapaAplicarEstiloCopiadoNo(alvo.id);
    });
    assert.deepEqual(await estiloDe('Escopo'), await estiloDe('Objetivo'), 'estilo copiado aplicado ao outro nó');
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.nos.find(n => n.titulo === 'Escopo').titulo),
      'Escopo', 'pincel não altera o conteúdo');

    await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const alvo = g.nos.find(n => n.titulo === 'Escopo');
      window.app.mapaRestaurarEstiloNo(alvo.id);
    });
    assert.deepEqual(await estiloDe('Escopo'), {}, 'restaurar padrão limpa o estilo do nó');

    // ---------------------------------------------------------------- 5) limpar estilo de nível
    await page.evaluate(() => window.app.mapaLimparEstiloNivel(2));
    assert.equal(await page.evaluate(() => Boolean(window.app.mapaCanvasGrafo.estilosNivel['2'])), false, 'limpar nível remove o estilo do nível');

    assert.deepEqual(erros, []);
    console.log('OK: estilo (painel, precedência nó>nível>tema, tema, ramo, pincel, claro/escuro)');

  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA ESTILO]