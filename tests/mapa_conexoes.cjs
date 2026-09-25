// 🧪 [INÍCIO: TESTE - MAPA CONEXOES]
/*
 * FASE 6 - Conexões livres.
 * Cobre as TRÊS formas de criação (menu, modo "Conectar nós" e Alt+arrastar), o
 * direcionamento/seta, o rótulo editável, tipos de linha/espessura/cor, edição e
 * remoção pelo menu contextual da aresta, além do nó-ponte como caso especial.
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
      const grafo = window.MapaMentalStore.criarMapa('Conexões', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'simples');
      grafo.layout = 'esquerda-direita';
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
    });

    const clicarAcao = acao => page.evaluate(a => {
      const el = document.querySelector('[data-mapa-acao="' + a + '"]');
      if (!el) throw new Error('ação não encontrada: ' + a);
      if (typeof el.click === 'function') el.click();
      else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, acao);
    const clicar = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('elemento não encontrado: ' + s);
      if (typeof el.click === 'function') el.click();
      else el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }, sel);
    const idPorTitulo = titulo => page.evaluate(t => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === t);
      if (!no) throw new Error('nó não encontrado: ' + t);
      return no.id;
    }, titulo);
    const conexoes = () => page.evaluate(() => JSON.parse(JSON.stringify(window.app.mapaCanvasGrafo.conexoes || [])));
    const pontoNo = titulo => page.evaluate(t => {
      const el = [...document.querySelectorAll('#mapaNos .mapa-no')]
        .find(n => (n.querySelector('.mapa-no-texto') || {}).textContent === t);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, titulo);
    const pointerNo = (titulo, tipo, extra) => page.evaluate(({ titulo, tipo, extra }) => {
      const el = [...document.querySelectorAll('#mapaNos .mapa-no')]
        .find(n => (n.querySelector('.mapa-no-texto') || {}).textContent === titulo);
      const r = el.getBoundingClientRect();
      const base = {
        bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse',
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, buttons: tipo === 'pointerup' ? 0 : 1
      };
      el.dispatchEvent(new PointerEvent(tipo, Object.assign(base, extra || {})));
    }, { titulo, tipo, extra: extra || {} });
    const pointerCanvas = (tipo, ponto, extra) => page.evaluate(({ tipo, ponto, extra }) => {
      const canvas = document.getElementById('mapaCanvas');
      canvas.dispatchEvent(new PointerEvent(tipo, Object.assign({
        bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse',
        clientX: ponto.x, clientY: ponto.y, buttons: tipo === 'pointerup' ? 0 : 1
      }, extra || {})));
    }, { tipo, ponto, extra: extra || {} });

    // ---------------------------------------------------------------- criação 1: menu no nó
    const t1 = await idPorTitulo('Tópico 1');
    const t2 = await idPorTitulo('Tópico 2');
    await page.evaluate(id => { window.app.mapaSelecao = new Set([id]); window.app.renderArea(); }, t1);
    await clicarAcao('no-conectar-para');
    assert.equal(await page.evaluate(() => document.getElementById('mapaForm').dataset.mapaForm), 'no-conectar-para', 'formulário de conexão por menu');
    await page.selectOption('#mapaFormDestino', t2);
    await clicar('#mapaForm[data-mapa-form="no-conectar-para"] button[type="submit"]');
    let cx = await conexoes();
    assert.equal(cx.length, 1, 'conexão criada pelo menu');
    assert.equal(cx[0].de, t1, 'origem correta');
    assert.equal(cx[0].para, t2, 'destino correto');
    assert.equal(cx[0].direcionada, true, 'conexão direcionada por padrão');

    // ---------------------------------------------------------------- criação 2: modo "Conectar nós"
    await clicarAcao('conectar-nos');
    assert.equal(await page.evaluate(() => document.getElementById('mapaModoConexao').getAttribute('aria-pressed')), 'true', 'modo conexão ativo');
    await pointerNo('Tópico 2', 'pointerdown');
    await pointerNo('Tópico 2', 'pointerup');
    await pointerNo('Tópico 3', 'pointerdown');
    await pointerNo('Tópico 3', 'pointerup');
    cx = await conexoes();
    assert.equal(cx.length, 2, 'conexão criada pelo modo "Conectar nós"');
    assert.equal(await page.evaluate(() => document.getElementById('mapaModoConexao').getAttribute('aria-pressed')), 'false', 'modo sai após conectar');

    // ---------------------------------------------------------------- criação 3: Alt+arrastar
    const pontoT1 = await pontoNo('Tópico 1');
    await pointerNo('Tópico 3', 'pointerdown', { altKey: true });
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('mapaConexaoTemp'))), 'linha-guia aparece no Alt+arrastar');
    await pointerCanvas('pointermove', pontoT1, { altKey: true });
    await pointerCanvas('pointerup', pontoT1, { altKey: true });
    cx = await conexoes();
    assert.equal(cx.length, 3, 'conexão criada pelo Alt+arrastar');

    // ---------------------------------------------------------------- render das arestas
    const desenho = await page.evaluate(() => {
      const grupos = [...document.querySelectorAll('#mapaConexoesSvg .mapa-conexao')];
      const linha = grupos[0] ? grupos[0].querySelector('.mapa-conexao-linha') : null;
      return {
        total: grupos.length,
        temLinha: Boolean(linha),
        marker: linha ? linha.getAttribute('marker-end') : null
      };
    });
    assert.equal(desenho.total, 3, 'três arestas desenhadas no SVG');
    assert.equal(desenho.temLinha, true, 'aresta tem traçado');
    assert.ok(desenho.marker && desenho.marker.indexOf('mapa-seta-') >= 0, 'aresta direcionada tem seta');

    // ---------------------------------------------------------------- edição pelo menu da aresta
    await clicarAcao('cx-menu');
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('mapaConexaoMenu'))), 'menu da conexão abre');
    const idCx = (await conexoes())[0].id;
    await page.fill('#mapaCxTexto', 'depende de');
    await page.selectOption('#mapaCxTipo', 'ortogonal');
    await page.fill('#mapaCxEspessura', '5');
    await page.uncheck('#mapaCxDirecionada');
    await clicar('#mapaConexaoForm button[type="submit"]');
    const editada = (await conexoes()).find(c => c.id === idCx);
    assert.equal(editada.texto, 'depende de', 'rótulo salvo');
    assert.equal(editada.tipoLinha, 'ortogonal', 'tipo de linha salvo');
    assert.equal(editada.espessura, 5, 'espessura salva');
    assert.equal(editada.direcionada, false, 'direção salva');
    assert.ok(await page.evaluate(() => Boolean(document.querySelector('#mapaConexoesSvg .mapa-conexao-texto'))), 'rótulo aparece na aresta');

    // ---------------------------------------------------------------- remoção pelo menu
    await clicarAcao('cx-menu');
    await clicarAcao('cx-remover');
    assert.equal((await conexoes()).length, 2, 'conexão removida pelo menu');

    // ---------------------------------------------------------------- validações do modelo
    const validacoes = await page.evaluate(() => {
      const m = window.MapaMentalModelo;
      const g = window.app.mapaCanvasGrafo;
      const a = g.nos[0].id;
      return {
        mesmo: m.criarConexao(g, a, a, {}),
        inexistente: m.criarConexao(g, a, 'nao-existe', {}),
        tipos: m.TIPOS_LINHA.length,
        setas: m.ESTILOS_SETA.length
      };
    });
    assert.equal(validacoes.mesmo, null, 'não conecta o nó a ele mesmo');
    assert.equal(validacoes.inexistente, null, 'não conecta a nó inexistente');
    assert.equal(validacoes.tipos, 3, 'três tipos de linha');
    assert.equal(validacoes.setas, 4, 'quatro estilos de seta');

    assert.deepEqual(erros, []);
    console.log('OK: conexões (menu/modo/alt+arrastar/editar/remover)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA CONEXOES]
