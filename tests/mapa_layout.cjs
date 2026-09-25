// 🧪 [INÍCIO: TESTE - MAPA LAYOUT]
/*
 * FASE 5 - Hierarquia e layout em árvore.
 * Cobre: níveis ilimitados + identificação visual por profundidade (data-mapa-nivel),
 * troca de layout (esquerda→direita, direita→esquerda, bilateral, vertical, livre) e
 * o cuidado de recolher um ramo sem esconder o nó selecionado.
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
      const grafo = window.MapaMentalStore.criarMapa('Hierarquia', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'projeto');
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
    });

    const posicoes = () => page.evaluate(() => {
      const mapa = {};
      window.app.mapaCanvasGrafo.nos.forEach(no => {
        mapa[no.titulo] = { x: no.posicao ? no.posicao.x : null, y: no.posicao ? no.posicao.y : null };
      });
      return mapa;
    });
    const niveisDom = () => page.evaluate(() => {
      const mapa = {};
      document.querySelectorAll('#mapaNos .mapa-no').forEach(el => {
        mapa[el.querySelector('.mapa-no-texto').textContent] = Number(el.dataset.mapaNivel);
      });
      return mapa;
    });
    const trocarLayout = layout => page.selectOption('#mapaLayout', layout);

    // ---------------------------------------------------------------- profundidade + níveis visuais
    const niveis = await niveisDom();
    assert.equal(niveis['Projeto'], 1, 'raiz no nível 1');
    assert.equal(niveis['Tarefas'], 2, 'filho no nível 2');
    assert.equal(niveis['A fazer'], 3, 'neto no nível 3 (múltiplos níveis)');
    const descendentes = await page.evaluate(() => {
      const grafo = window.app.mapaCanvasGrafo;
      const raiz = grafo.nos.find(n => n.titulo === 'Projeto');
      return window.MapaMentalModelo.listarDescendentes(grafo, raiz.id).length;
    });
    assert.equal(descendentes, 6, 'descendentes de profundidade ilimitada');

    // ---------------------------------------------------------------- esquerda -> direita
    await trocarLayout('esquerda-direita');
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.layout), 'esquerda-direita', 'layout persistido');
    let p = await posicoes();
    assert.ok(p['Objetivo'].x > p['Projeto'].x, 'filhos à direita da raiz');
    assert.ok(p['Tarefas'].x > p['Projeto'].x, 'todos os filhos à direita');

    // ---------------------------------------------------------------- direita -> esquerda
    await trocarLayout('direita-esquerda');
    p = await posicoes();
    assert.ok(p['Objetivo'].x < p['Projeto'].x, 'filhos à esquerda da raiz');

    // ---------------------------------------------------------------- bilateral
    await trocarLayout('bilateral');
    p = await posicoes();
    const filhosBilateral = ['Objetivo', 'Escopo', 'Tarefas'].map(t => p[t].x);
    assert.ok(filhosBilateral.some(x => x < p['Projeto'].x), 'bilateral: algum filho à esquerda');
    assert.ok(filhosBilateral.some(x => x > p['Projeto'].x), 'bilateral: algum filho à direita');
    assert.ok(Math.min(...Object.values(p).map(v => v.x)) >= 0, 'nada em coordenada negativa');
    // Organização padrão: metade CONTÍGUA à direita (mantendo a ordem) e o resto à esquerda.
    assert.equal(filhosBilateral.filter(x => x > p['Projeto'].x).length, 2, 'bilateral: 1ª metade contígua à direita');
    assert.equal(filhosBilateral.filter(x => x < p['Projeto'].x).length, 1, 'bilateral: 2ª metade contígua à esquerda');
    assert.equal(p['Objetivo'].x, p['Escopo'].x, 'filhos do mesmo lado na mesma coluna');

    // ---------------------------------------------------------------- ramificações pai→filho
    const ramos = await page.evaluate(() => {
      const paths = [...document.querySelectorAll('#mapaConexoesSvg .mapa-ramo')];
      return { total: paths.length, comD: paths.filter(x => (x.getAttribute('d') || '').length > 0).length };
    });
    assert.equal(ramos.total, 6, 'uma ramificação por nó com pai (7 nós - 1 raiz)');
    assert.equal(ramos.comD, 6, 'toda ramificação tem traçado');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#mapaConexoesSvg .mapa-ramo').length), await page.evaluate(() => window.app.mapaCanvasGrafo.nos.filter(n => n.paiId).length), 'ramos = nós com pai');

    // ---------------------------------------------------------------- recolher não deixa ramo "no vazio"
    const ramosRecolhido = await page.evaluate(() => {
      const pai = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === 'Tarefas');
      window.app.mapaRecolherNo(pai.id);
      const g = window.app.mapaCanvasGrafo;
      const visiveis = window.MapaMentalModelo.listarVisiveis(g).map(n => n.id);
      return {
        nosDom: document.querySelectorAll('#mapaNos .mapa-no').length,
        noDom: document.querySelectorAll('#mapaConexoesSvg .mapa-ramo').length,
        esperado: g.nos.filter(n => n.paiId && visiveis.includes(n.id) && visiveis.includes(n.paiId)).length
      };
    });
    assert.equal(ramosRecolhido.nosDom, 4, 'recolher esconde os netos');
    assert.equal(ramosRecolhido.noDom, ramosRecolhido.esperado, 'recolher não deixa ramificação para nó oculto');
    await page.evaluate(() => {
      const pai = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === 'Tarefas');
      window.app.mapaExpandirNo(pai.id);
    });

    // ---------------------------------------------------------------- árvore vertical
    await trocarLayout('arvore-vertical');
    p = await posicoes();
    assert.ok(p['Objetivo'].y > p['Projeto'].y, 'vertical: filhos abaixo da raiz');
    assert.ok(p['A fazer'].y > p['Tarefas'].y, 'vertical: netos abaixo dos filhos');
    const ramoVertical = await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const pai = g.nos.find(n => n.titulo === 'Projeto');
      const filho = g.nos.find(n => n.titulo === 'Objetivo');
      const elPai = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + pai.id + '"]');
      const el = document.querySelector('#mapaConexoesSvg .mapa-ramo[data-mapa-ramo="' + filho.id + '"]');
      const m = /^M([\-\d.]+) ([\-\d.]+) /.exec(el ? el.getAttribute('d') : '');
      return {
        inicioX: m ? Number(m[1]) : null, inicioY: m ? Number(m[2]) : null,
        centroX: pai.posicao.x + elPai.offsetWidth / 2,
        baseY: pai.posicao.y + elPai.offsetHeight
      };
    });
    assert.equal(ramoVertical.inicioX, ramoVertical.centroX, 'vertical: ramo sai do centro do pai');
    assert.equal(ramoVertical.inicioY, ramoVertical.baseY, 'vertical: ramo sai da base do pai');

    // ---------------------------------------------------------------- recolher não esconde o selecionado
    const recolher = await page.evaluate(() => {
      const grafo = window.app.mapaCanvasGrafo;
      const neto = grafo.nos.find(n => n.titulo === 'A fazer');
      const pai = grafo.nos.find(n => n.titulo === 'Tarefas');
      window.app.mapaSelecao = new Set([neto.id]);
      window.app.mapaRecolherNo(pai.id);
      return { selecao: [...window.app.mapaSelecao], idPai: pai.id };
    });
    assert.deepEqual(recolher.selecao, [recolher.idPai], 'ao recolher, a seleção vai para o nó recolhido');

    assert.deepEqual(erros, []);
    console.log('OK: hierarquia (níveis + layouts + recolher seguro)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA LAYOUT]
