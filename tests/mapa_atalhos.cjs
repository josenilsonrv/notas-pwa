// 🧪 [INÍCIO: TESTE - MAPA ATALHOS]
/*
 * FASE 10 - Atalhos de teclado.
 * Cobre: setas (pai/filho/irmão em ciclo), Ctrl+A, Ctrl+D, Ctrl+Y, Backspace,
 * keymap configurável persistido (`notas-pwa-mapa-atalhos`) com detecção de conflito,
 * "restaurar padrão", painel fechando no Esc e UM ÚNICO listener (sem criação dupla).
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
      const grafo = window.MapaMentalStore.criarMapa('Atalhos', null);
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
    const selecionados = () => page.evaluate(() => [...(window.app.mapaSelecao || [])]);
    const totalNos = () => page.evaluate(() => window.app.mapaCanvasGrafo.nos.length);
    const selecionar = id => page.evaluate(alvo => { window.app.mapaSelecao = new Set([alvo]); }, id);
    const tituloSelecionado = () => page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      const lista = [...(window.app.mapaSelecao || [])];
      const no = g.nos.find(n => n.id === lista[lista.length - 1]);
      return no ? no.titulo : null;
    });
    const tecla = t => page.keyboard.press(t);
    // Clique via JS: alguns botões vivem no overflow `<details>` (invisível para page.click).
    const clicar = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('elemento não encontrado: ' + s);
      el.click();
    }, sel);
    const atalhos = () => page.evaluate(() =>
      JSON.parse(localStorage.getItem('notas-pwa-mapa-atalhos') || '{}'));

    const idProjeto = await idDe('Projeto');
    const idObjetivo = await idDe('Objetivo');
    const idTarefas = await idDe('Tarefas');
    // ---------------------------------------------------------------- 1) navegação por setas
    await selecionar(idProjeto);
    await tecla('ArrowRight');
    assert.equal(await tituloSelecionado(), 'Objetivo', 'ArrowRight desce para o primeiro filho');
    await tecla('ArrowDown');
    assert.equal(await tituloSelecionado(), 'Escopo', 'ArrowDown vai para o próximo irmão');
    await tecla('ArrowDown');
    assert.equal(await tituloSelecionado(), 'Tarefas', 'ArrowDown segue para o 3º irmão');
    await tecla('ArrowDown');
    assert.equal(await tituloSelecionado(), 'Objetivo', 'ArrowDown dá a volta nos irmãos');
    await tecla('ArrowUp');
    assert.equal(await tituloSelecionado(), 'Tarefas', 'ArrowUp volta para o irmão anterior (com volta)');
    await tecla('ArrowLeft');
    assert.equal(await tituloSelecionado(), 'Projeto', 'ArrowLeft sobe para o pai');

    // ---------------------------------------------------------------- 2) Ctrl+A e seleção múltipla
    await tecla('Control+a');
    assert.equal((await selecionados()).length, await totalNos(), 'Ctrl+A seleciona todos os nós');

    // ---------------------------------------------------------------- 3) Ctrl+D + desfazer/refazer
    await selecionar(idObjetivo);
    const antesDup = await totalNos();
    await tecla('Control+d');
    assert.equal(await totalNos(), antesDup + 1, 'Ctrl+D duplica o nó');
    await tecla('Control+z');
    assert.equal(await totalNos(), antesDup, 'Ctrl+Z desfaz a duplicação');
    await tecla('Control+y');
    assert.equal(await totalNos(), antesDup + 1, 'Ctrl+Y refaz');
    await tecla('Control+z');

    // ---------------------------------------------------------------- 4) Backspace exclui
    await selecionar(idObjetivo);
    await tecla('Backspace');
    assert.equal(await totalNos(), antesDup - 1, 'Backspace exclui o nó selecionado');
    await tecla('Control+z');
    assert.equal(await totalNos(), antesDup, 'desfazer restaura a exclusão');

    // ---------------------------------------------------------------- 5) um único listener
    await selecionar(idTarefas);
    const antesEnter = await totalNos();
    await tecla('Enter');
    assert.equal(await totalNos(), antesEnter + 1, 'Enter cria UM irmão (não dois)');
    // `Enter` cria e ABRE a edição inline (de forma ASSÍNCRONA, `iniciarEdicaoDepois`):
    // os atalhos globais ficam bloqueados enquanto se edita (regra documentada).
    await page.waitForSelector('#mapaNos .mapa-no-editor');
    await tecla('Escape');
    await tecla('Control+z');
    assert.equal(await totalNos(), antesEnter, 'desfazer remove o irmão criado');

    // ---------------------------------------------------------------- 6) painel "Configurar atalhos"
    await clicar('[data-mapa-acao="atalhos-abrir"]');
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('mapaAtalhos'))), 'painel de atalhos abre');
    const itens = await page.evaluate(() => document.querySelectorAll('#mapaAtalhos .mapa-atalhos-item').length);
    assert.ok(itens >= 19, 'painel lista todas as ações (' + itens + ')');

    // Captura: 'duplicar' passa a ser F4 (persistido)
    await clicar('[data-mapa-acao="atalho-alterar"][data-mapa-atalho="duplicar"]');
    await tecla('F4');
    assert.deepEqual(await atalhos(), { duplicar: ['F4'] }, 'nova tecla persistida em notas-pwa-mapa-atalhos');
    await selecionar(idObjetivo);
    const antesF4 = await totalNos();
    await tecla('F4');
    assert.equal(await totalNos(), antesF4 + 1, 'a tecla configurada (F4) duplica');
    await tecla('Control+z');

    // Conflito: 'F4' já pertence a "duplicar" (recém-configurado) → avisa e não grava
    await clicar('[data-mapa-acao="atalho-alterar"][data-mapa-atalho="editar"]');
    await tecla('F4');
    const aviso = await page.evaluate(() => {
      const el = document.querySelector('.mapa-atalhos-aviso');
      return el ? el.textContent : '';
    });
    assert.ok(/já é usada/i.test(aviso), 'conflito de atalho é avisado');
    assert.deepEqual(await atalhos(), { duplicar: ['F4'] }, 'conflito NÃO altera as preferências');

    // Esc cancela a captura e depois fecha o painel
    await tecla('Escape');
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('mapaAtalhos'))), 'Esc cancela a captura sem fechar');
    await tecla('Escape');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaAtalhos'))), false, 'Esc fecha o painel');

    // Restaurar padrão: F4 volta a não fazer nada e ctrl+d duplica de novo
    await clicar('[data-mapa-acao="atalhos-abrir"]');
    await clicar('[data-mapa-acao="atalho-padrao"]');
    assert.deepEqual(await atalhos(), {}, 'restaurar padrão apaga as preferências');
    await clicar('[data-mapa-acao="atalho-fechar"]');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaAtalhos'))), false, 'botão Fechar fecha o painel');

    assert.deepEqual(erros, []);
    console.log('OK: atalhos (setas, Ctrl+A/D/Y, Backspace, keymap configurável)');

  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA ATALHOS]