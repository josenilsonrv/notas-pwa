/*
 * FASE 7 - Drag & Drop inteligente.
 * Cobre: mover livre (layout manual), reparent pela zona central, inserção entre irmãos
 * (zonas de cima/baixo com linha-guia), ramificação inteira acompanhando o nó arrastado,
 * indicação visual do destino e detecção de ciclo (alvo bloqueado).
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
      const grafo = window.MapaMentalStore.criarMapa('DragDrop', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'projeto');
      grafo.layout = 'esquerda-direita';
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
    });

    const porTitulo = titulo => page.evaluate(t => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === t);
      return no ? { id: no.id, paiId: no.paiId, ordem: no.ordem, posicao: no.posicao } : null;
    }, titulo);
    const posicoes = titulos => page.evaluate(lista => {
      const mapa = {};
      lista.forEach(t => {
        const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === t);
        mapa[t] = no && no.posicao ? { x: no.posicao.x, y: no.posicao.y } : null;
      });
      return mapa;
    }, titulos);
    const pontoNo = (titulo, ratio) => page.evaluate(({ titulo, ratio }) => {
      const el = [...document.querySelectorAll('#mapaNos .mapa-no')]
        .find(n => (n.querySelector('.mapa-no-texto') || {}).textContent === titulo);
      if (!el) throw new Error('nó não encontrado: ' + titulo);
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height * (ratio === undefined ? 0.5 : ratio) };
    }, { titulo, ratio });
    const temClasse = (titulo, classe) => page.evaluate(({ titulo, classe }) => {
      const el = [...document.querySelectorAll('#mapaNos .mapa-no')]
        .find(n => (n.querySelector('.mapa-no-texto') || {}).textContent === titulo);
      return Boolean(el && el.classList.contains(classe));
    }, { titulo, classe });
    const dispararNo = (titulo, tipo, extra) => page.evaluate(({ titulo, tipo, extra }) => {
      const el = [...document.querySelectorAll('#mapaNos .mapa-no')]
        .find(n => (n.querySelector('.mapa-no-texto') || {}).textContent === titulo);
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent(tipo, Object.assign({
        bubbles: true, cancelable: true, pointerId: 5, pointerType: 'mouse',
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, buttons: 1
      }, extra || {})));
    }, { titulo, tipo, extra: extra || {} });
    const dispararCanvas = (tipo, ponto) => page.evaluate(({ tipo, ponto }) => {
      const canvas = document.getElementById('mapaCanvas');
      canvas.dispatchEvent(new PointerEvent(tipo, {
        bubbles: true, cancelable: true, pointerId: 5, pointerType: 'mouse',
        clientX: ponto.x, clientY: ponto.y, buttons: tipo === 'pointerup' ? 0 : 1
      }));
    }, { tipo, ponto });
    const arrastar = async (origem, destino, ratio, aoMover) => {
      const para = typeof destino === 'object' && destino !== null ? destino : await pontoNo(destino, ratio);
      await dispararNo(origem, 'pointerdown');
      await dispararCanvas('pointermove', para);
      if (aoMover) await aoMover();
      await dispararCanvas('pointerup', para);
    };

    // ---------------------------------------------------------------- centro = reparent
    await arrastar('Objetivo', 'Tarefas', 0.5, async () => {
      assert.ok(await temClasse('Tarefas', 'mapa-alvo-reparent'), 'centro destaca reparent');
    });
    assert.equal((await porTitulo('Objetivo')).paiId, (await porTitulo('Tarefas')).id, 'centro reparenta (vira filho)');

    // ---------------------------------------------------------------- zona de cima = irmão antes
    await arrastar('Concluído', 'A fazer', 0.15, async () => {
      assert.ok(await temClasse('A fazer', 'mapa-alvo-antes'), 'zona de cima mostra linha-guia');
    });
    assert.equal((await porTitulo('Concluído')).paiId, (await porTitulo('A fazer')).paiId, 'drop lateral mantém o pai');
    assert.ok((await porTitulo('Concluído')).ordem < (await porTitulo('A fazer')).ordem, 'soltar em cima insere antes');

    // ---------------------------------------------------------------- zona de baixo = irmão depois
    await arrastar('Concluído', 'Em andamento', 0.85, async () => {
      assert.ok(await temClasse('Em andamento', 'mapa-alvo-depois'), 'zona de baixo mostra linha-guia');
    });
    assert.ok((await porTitulo('Concluído')).ordem > (await porTitulo('Em andamento')).ordem, 'soltar embaixo insere depois');

    // ---------------------------------------------------------------- ciclo bloqueado
    // Reflui para garantir os nós dentro da viewport antes do teste de bloqueio.
    await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      g.posicionamento = 'auto';
      const pos = window.MapaMentalLayout.calcularPosicoes(g);
      g.nos.forEach(no => { const p = pos.get(no.id); if (p) no.posicao = { x: p.x, y: p.y }; });
      window.app.mapaCanvasViewport = { x: 0, y: 0, zoom: 1 };
      window.app.renderArea();
    });
    await arrastar('Projeto', 'A fazer', 0.5);
    assert.equal((await porTitulo('Projeto')).paiId, null, 'ciclo bloqueado (raiz não desce para o descendente)');
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.nos.filter(no => no.id === window.app.mapaCanvasGrafo.nos.find(n => n.titulo === 'Projeto').id).length), 1, 'raiz permanece única');

    // ---------------------------------------------------------------- ramificação inteira acompanha
    const antesRamo = await posicoes(['Tarefas', 'A fazer', 'Em andamento', 'Concluído']);
    const cantoVazio = await page.evaluate(() => {
      const r = document.getElementById('mapaCanvas').getBoundingClientRect();
      return { x: r.left + 30, y: r.bottom - 30 };
    });
    await arrastar('Tarefas', cantoVazio);
    const depoisRamo = await posicoes(['Tarefas', 'A fazer', 'Em andamento', 'Concluído']);
    const deltaX = titulo => depoisRamo[titulo].x - antesRamo[titulo].x;
    const deltaY = titulo => depoisRamo[titulo].y - antesRamo[titulo].y;
    assert.ok(Math.abs(deltaX('Tarefas')) > 0, 'nó arrastado se move');
    ['A fazer', 'Em andamento', 'Concluído'].forEach(filho => {
      assert.ok(Math.abs(deltaX(filho) - deltaX('Tarefas')) < 1, filho + ' acompanha o mesmo delta X');
      assert.ok(Math.abs(deltaY(filho) - deltaY('Tarefas')) < 1, filho + ' acompanha o mesmo delta Y');
    });
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.posicionamento), 'manual', 'arrasto marca layout manual');

    // ---------------------------------------------------------------- nó novo respeita a árvore (modo manual)
    await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const pai = g.nos.find(n => n.titulo === 'Tarefas');
      window.app.mapaSelecao = new Set([pai.id]);
      window.app.mapaCriarFilhoDeNo(pai.id, false);
    });
    const alinhamento = await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const pai = g.nos.find(n => n.titulo === 'Tarefas');
      const filhos = window.MapaMentalModelo.listarFilhos(g, pai.id); // ordenados por `ordem`
      const ultimo = filhos[filhos.length - 1];
      const anterior = filhos[filhos.length - 2];
      return {
        x: ultimo.posicao.x, y: ultimo.posicao.y,
        anteriorX: anterior.posicao.x, anteriorY: anterior.posicao.y,
        paiX: pai.posicao.x, paiY: pai.posicao.y
      };
    });
    assert.equal(alinhamento.x, alinhamento.anteriorX, 'filho novo alinhado na coluna do irmão anterior (ordem)');
    assert.ok(alinhamento.y > alinhamento.anteriorY, 'filho novo logo abaixo do irmão anterior (ordem)');
    assert.notEqual(alinhamento.y, alinhamento.paiY, 'filho novo não fica sobreposto ao pai');

    // ---------------------------------------------------------------- ramificação acompanha o arrasto
    const ramoAntes = await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const filho = g.nos.find(n => n.titulo === 'Objetivo');
      const el = document.querySelector('#mapaConexoesSvg .mapa-ramo[data-mapa-ramo="' + filho.id + '"]');
      return el ? el.getAttribute('d') : null;
    });
    const pontoObjetivo = await pontoNo('Objetivo', 0.5);
    await dispararNo('Objetivo', 'pointerdown');
    await dispararCanvas('pointermove', { x: pontoObjetivo.x + 200, y: pontoObjetivo.y + 60 });
    const ramoDurante = await page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const filho = g.nos.find(n => n.titulo === 'Objetivo');
      const el = document.querySelector('#mapaConexoesSvg .mapa-ramo[data-mapa-ramo="' + filho.id + '"]');
      return el ? el.getAttribute('d') : null;
    });
    await dispararCanvas('pointerup', { x: pontoObjetivo.x + 200, y: pontoObjetivo.y + 60 });
    assert.ok(ramoAntes && ramoDurante, 'ramificação desenhada para o nó');
    assert.notEqual(ramoDurante, ramoAntes, 'ramificação acompanha o nó durante o arrasto');

    assert.deepEqual(erros, []);
    console.log('OK: dragdrop (reparent/irmãos/ramo/ciclo)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
