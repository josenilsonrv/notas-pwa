/*
 * FASE 3 - Nós / tópicos.
 * Cobre: criar raiz/filho/irmão/independente, edição inline (F2/duplo clique),
 * excluir/duplicar/copiar/recortar/colar (com desfazer), reordenar, reparenting
 * (menu e arrastar), seleção múltipla (Ctrl/Shift + laço), recolher/expandir,
 * bloquear e largura (botões e alça, múltiplos de 8px).
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
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-layout.js', 'mapa/mapa-render.js', 'mapa/mapa-interacao.js', 'mapa/mapa.js']) {
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
      const grafo = window.MapaMentalStore.criarMapa('Nós', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'simples');
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
    });

    // ---------------------------------------------------------------- helpers
    const clicarAcao = acao => page.evaluate(a => {
      const el = document.querySelector('[data-mapa-acao="' + a + '"]');
      if (!el) throw new Error('ação não encontrada: ' + a);
      el.click();
    }, acao);
    const clicar = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('elemento não encontrado: ' + s);
      el.click();
    }, sel);
    const nos = () => page.evaluate(() => window.app.mapaCanvasGrafo.nos.map(no => ({
      id: no.id, titulo: no.titulo, paiId: no.paiId, ordem: no.ordem,
      colapsado: Boolean(no.colapsado), bloqueado: Boolean(no.bloqueado),
      largura: no.largura || null, posicao: no.posicao
    })));
    const porTitulo = async titulo => (await nos()).find(no => no.titulo === titulo) || null;
    const clicarNo = (titulo, shift) => page.evaluate(({ titulo, shift }) => {
      const el = [...document.querySelectorAll('#mapaNos .mapa-no')]
        .find(n => (n.querySelector('.mapa-no-texto') || {}).textContent === titulo);
      if (!el) throw new Error('nó não encontrado: ' + titulo);
      const r = el.getBoundingClientRect();
      const base = {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
        shiftKey: Boolean(shift), clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
      };
      el.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
    }, { titulo, shift: Boolean(shift) });
    const selecao = () => page.evaluate(() => [...window.app.mapaSelecao]);
    const digitando = () => page.evaluate(() => ({
      editando: window.app.mapaEditandoId,
      editavel: Boolean(document.querySelector('#mapaNos .mapa-no-texto[contenteditable]'))
    }));
    const aguardarEdicao = () => page.waitForFunction(() => window.app.mapaEditandoId !== null);
    const digitar = async texto => { await page.keyboard.type(texto); await page.keyboard.press('Enter'); };
    const visiveis = () => page.evaluate(() => document.querySelectorAll('#mapaNos .mapa-no').length);

    // ---------------------------------------------------------------- estrutura inicial
    assert.equal((await nos()).length, 4, 'template simples com 4 nós');
    assert.equal(await visiveis(), 4, 'todos visíveis');
    assert.equal(await page.locator('#mapaNos .mapa-no[role="treeitem"]').count(), 4, 'role=treeitem nos nós');

    // ---------------------------------------------------------------- criar filho / irmão / independente
    await clicarNo('Ideia central');
    assert.deepEqual((await selecao()).length, 1, 'clique seleciona um nó');
    await clicarAcao('no-filho');
    await aguardarEdicao();
    assert.equal((await digitando()).editavel, true, 'nó novo entra em edição (contenteditable)');
    await digitar('Filho A');
    const filhoA = await porTitulo('Filho A');
    assert.ok(filhoA, 'filho criado com o título digitado');
    const raizTitulo = 'Ideia central';
    const raiz = await porTitulo(raizTitulo);
    assert.equal(filhoA.paiId, raiz.id, 'filho aponta para o nó raiz');

    await clicarNo('Filho A');
    await clicarAcao('no-irmao');
    await aguardarEdicao();
    await digitar('Irmão B');
    const irmaoB = await porTitulo('Irmão B');
    assert.equal(irmaoB.paiId, raiz.id, 'irmão tem o mesmo pai');
    assert.ok(irmaoB.ordem > filhoA.ordem, 'irmão entra depois do nó de referência');

    await clicarAcao('no-independente');
    await aguardarEdicao();
    await digitar('Solto');
    const solto = await porTitulo('Solto');
    assert.equal(solto.paiId, null, 'nó independente não tem pai');
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.posicionamento), 'manual', 'independente marca layout manual');

    // ---------------------------------------------------------------- edição inline (F2)
    await clicarNo('Irmão B');
    await page.keyboard.press('F2');
    await aguardarEdicao();
    assert.equal((await digitando()).editavel, true, 'F2 abre a edição');
    await digitar('Irmão B2');
    assert.ok(await porTitulo('Irmão B2'), 'título editado inline');
    assert.equal(await porTitulo('Irmão B'), null, 'título antigo não existe mais');

    // ---------------------------------------------------------------- recolher/expandir
    const total = (await nos()).length;
    assert.equal(await visiveis(), total, 'todos visíveis antes de recolher');
    await page.evaluate(id => {
      const el = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + id + '"] .mapa-no-toggle');
      if (!el) throw new Error('alternador não encontrado');
      el.click();
    }, raiz.id);
    assert.equal((await porTitulo(raizTitulo)).colapsado, true, 'ramo recolhido');
    assert.equal(await visiveis(), 2, 'só a raiz e o nó independente ficam visíveis');
    await clicarAcao('expandir-tudo');
    assert.equal((await porTitulo(raizTitulo)).colapsado, false, 'expandir tudo limpa o recolhido');
    assert.equal(await visiveis(), total, 'todos voltam a ficar visíveis');

    // ---------------------------------------------------------------- duplicar / copiar / colar / recortar
    const antesDup = (await nos()).length;
    await clicarNo('Irmão B2');
    await clicarAcao('no-duplicar');
    assert.equal((await nos()).length, antesDup + 1, 'duplicar cria uma cópia');
    const copias = (await nos()).filter(no => no.titulo === 'Irmão B2');
    assert.equal(copias.length, 2, 'cópia mantém o título');
    assert.equal(copias[0].paiId, copias[1].paiId, 'cópia fica no mesmo pai');
    assert.notEqual(copias[0].id, copias[1].id, 'cópia usa ID novo');

    await clicarNo('Filho A');
    await clicarAcao('no-copiar');
    await clicarNo(raizTitulo);
    const antesColar = (await nos()).length;
    await clicarAcao('no-colar');
    assert.equal((await nos()).length, antesColar + 1, 'colar cria um nó');
    const colados = (await nos()).filter(no => no.titulo === 'Filho A' && no.id !== filhoA.id);
    assert.equal(colados.length, 1, 'conteúdo colado preserva o título');
    assert.equal(colados[0].paiId, raiz.id, 'colado como filho do nó selecionado');

    await clicarNo('Solto');
    await clicarAcao('no-recortar');
    assert.equal(await porTitulo('Solto'), null, 'recortar remove o nó');
    await clicarNo(raizTitulo);
    await clicarAcao('no-colar');
    const soltoColado = (await nos()).find(no => no.titulo === 'Solto');
    assert.ok(soltoColado, 'recortado volta com o colar');
    assert.equal(soltoColado.paiId, raiz.id, 'recortado foi colado sob o nó selecionado');

    // ---------------------------------------------------------------- reordenar irmãos
    const antesOrdem = await porTitulo('Tópico 3');
    await clicarNo('Tópico 3');
    await clicarAcao('no-descer');
    const depoisOrdem = await porTitulo('Tópico 3');
    assert.ok(depoisOrdem.ordem > antesOrdem.ordem, 'descer aumenta a ordem entre irmãos');
    await clicarAcao('no-subir');
    assert.equal((await porTitulo('Tópico 3')).ordem, antesOrdem.ordem, 'subir volta a posição');

    // ---------------------------------------------------------------- reparenting por menu (+ bloqueio de ciclo)
    await clicarNo('Tópico 1');
    await clicarAcao('no-mover-para');
    assert.equal(await page.evaluate(() => document.getElementById('mapaForm').dataset.mapaForm), 'no-mover-para', 'formulário de mover nó');
    await page.selectOption('#mapaFormDestino', filhoA.id);
    await clicar('#mapaForm[data-mapa-form="no-mover-para"] button[type="submit"]');
    assert.equal((await porTitulo('Tópico 1')).paiId, filhoA.id, 'nó movido para o novo pai');

    await clicarNo('Filho A');
    await clicarAcao('no-mover-para');
    await page.selectOption('#mapaFormDestino', (await porTitulo('Tópico 1')).id);
    await clicar('#mapaForm[data-mapa-form="no-mover-para"] button[type="submit"]');
    assert.equal((await porTitulo('Filho A')).paiId, raiz.id, 'ciclo é bloqueado (ancestral não desce para o filho)');



    // ---------------------------------------------------------------- reparenting por arrastar
    const alvoDrag = await porTitulo('Tópico 2');
    const fonteDrag = await porTitulo('Tópico 3');
    const caixas = await page.evaluate(() => {
      const mapa = {};
      document.querySelectorAll('#mapaNos .mapa-no').forEach(el => {
        const r = el.getBoundingClientRect();
        mapa[el.querySelector('.mapa-no-texto').textContent] = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      });
      return mapa;
    });
    await page.mouse.move(caixas['Tópico 3'].cx, caixas['Tópico 3'].cy);
    await page.mouse.down();
    await page.mouse.move(caixas['Tópico 2'].cx, caixas['Tópico 2'].cy, { steps: 6 });
    await page.mouse.up();
    const reposicionado = await porTitulo('Tópico 3');
    assert.equal(reposicionado.paiId, alvoDrag.id, 'soltar sobre outro nó reparenta (drag)');
    assert.notDeepEqual(reposicionado.posicao, fonteDrag.posicao, 'arrasto grava nova posição');
    assert.equal(await page.evaluate(() => window.app.mapaCanvasGrafo.posicionamento), 'manual', 'arrasto marca layout manual');

    // ---------------------------------------------------------------- bloquear nó
    await clicarNo('Tópico 2');
    await clicarAcao('no-bloquear');
    assert.equal((await porTitulo('Tópico 2')).bloqueado, true, 'nó bloqueado');
    assert.ok(await page.locator('#mapaNos .mapa-no.mapa-no-bloqueado .mapa-no-cadeado').count() >= 1, 'indicador de cadeado');
    const posicaoBloqueado = (await porTitulo('Tópico 2')).posicao;
    await page.mouse.move(caixas['Tópico 2'].cx, caixas['Tópico 2'].cy);
    await page.mouse.down();
    await page.mouse.move(caixas['Tópico 2'].cx + 80, caixas['Tópico 2'].cy + 60, { steps: 4 });
    await page.mouse.up();
    assert.deepEqual((await porTitulo('Tópico 2')).posicao, posicaoBloqueado, 'nó bloqueado não se move');
    await clicarNo('Tópico 2');
    await clicarAcao('no-editar');
    assert.equal(await page.evaluate(() => window.app.mapaEditandoId), null, 'nó bloqueado não entra em edição');
    await clicarAcao('no-bloquear');
    assert.equal((await porTitulo('Tópico 2')).bloqueado, false, 'desbloquear volta a permitir edição');

    // ---------------------------------------------------------------- largura (botões e alça)
    await clicarNo('Tópico 2');
    const larguraAntes = (await porTitulo('Tópico 2')).largura || 180;
    await clicarAcao('no-largura-mais');
    const larguraDepois = (await porTitulo('Tópico 2')).largura;
    assert.ok(larguraDepois > larguraAntes, 'Largura + aumenta a largura');
    assert.equal(larguraDepois % 8, 0, 'largura em múltiplos de 8px');

    const alca = await page.evaluate(() => {
      const id = window.app.mapaSelecao.values().next().value;
      const el = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + id + '"] .mapa-no-resize');
      if (!el) throw new Error('alça não encontrada');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(alca.x, alca.y);
    await page.mouse.down();
    await page.mouse.move(alca.x + 40, alca.y, { steps: 4 });
    await page.mouse.up();
    const larguraAlca = (await porTitulo('Tópico 2')).largura;
    assert.ok(larguraAlca > larguraDepois, 'alça aumenta a largura');
    assert.equal(larguraAlca % 8, 0, 'alça mantém múltiplos de 8px');

    // ---------------------------------------------------------------- desfazer
    const antesDesfazer = (await nos()).length;
    await clicarNo('Tópico 2');
    await clicarAcao('no-duplicar');
    assert.ok((await nos()).length > antesDesfazer, 'duplicar cria cópia da ramificação');
    await clicarAcao('no-desfazer');
    assert.equal((await nos()).length, antesDesfazer, 'desfazer reverte o último comando');

    // ---------------------------------------------------------------- seleção múltipla (Ctrl/Shift + laço)
    await clicarNo('Tópico 1');
    assert.equal((await selecao()).length, 1, 'um nó selecionado');
    await clicarNo('Tópico 2', true);
    assert.equal((await selecao()).length, 2, 'Ctrl/Shift+clique soma à seleção');
    await page.keyboard.press('Escape');
    assert.equal((await selecao()).length, 0, 'Esc limpa a seleção');

    await page.evaluate(() => {
      const canvas = document.getElementById('mapaCanvas');
      const r = canvas.getBoundingClientRect();
      const ev = (tipo, x, y, botoes) => canvas.dispatchEvent(new PointerEvent(tipo, {
        bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', shiftKey: true,
        clientX: r.left + x, clientY: r.top + y, buttons: botoes
      }));
      ev('pointerdown', r.width - 2, r.height - 2, 1);
      ev('pointermove', 2, 2, 1);
      ev('pointerup', 2, 2, 0);
    });
    assert.ok((await selecao()).length >= 2, 'laço (Shift+arrastar) seleciona vários nós');

    assert.deepEqual(erros, []);
    console.log('OK: nós (criar/editar/excluir/duplicar/copiar/colar/reordenar/reparent/laço/recolher/bloquear/largura/desfazer)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });

