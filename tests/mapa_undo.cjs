// 🧪 [INÍCIO: TESTE - MAPA UNDO]
/*
 * FASE 11 - Undo/Redo.
 * Cobre: pilha cobrindo criação, exclusão, texto, estilo, tema, layout, estilos por nível e
 * conexões; COALESCÊNCIA de digitação (1 undo por rajada); cap de 100 passos; botões
 * Desfazer/Refazer com estado refletindo a pilha; e undo re-persistindo (autosave).
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
      const grafo = window.MapaMentalStore.criarMapa('Undo', null);
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
    const totalNos = () => page.evaluate(() => window.app.mapaCanvasGrafo.nos.length);
    const totalConexoes = () => page.evaluate(() => (window.app.mapaCanvasGrafo.conexoes || []).length);
    const estado = () => page.evaluate(() => {
      const h = window.app.mapaHistorico || { pilha: [], indice: -1 };
      return { len: h.pilha.length, indice: h.indice };
    });
    const botao = acao => page.evaluate(a => {
      const el = document.querySelector('[data-mapa-acao="' + a + '"]');
      return el ? { disabled: Boolean(el.disabled) } : { disabled: null };
    }, acao);
    const clicar = acao => page.evaluate(a => {
      let el = document.querySelector('[data-mapa-acao="' + a + '"]');
      if (!el) {
        // Ações de CARD (F12) vivem no MENU CONTEXTUAL: abre no nó selecionado e tenta de novo.
        const sel = [...(window.app.mapaSelecao || [])];
        const id = sel[sel.length - 1];
        const noEl = id ? document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + id + '"]') : null;
        if (noEl) {
          noEl.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));
          el = document.querySelector('[data-mapa-acao="' + a + '"]');
        }
      }
      if (!el) throw new Error('ação não encontrada: ' + a);
      el.click();
    }, acao);
    const tituloDe = id => page.evaluate(alvo => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.id === alvo);
      return no ? no.titulo : null;
    }, id);
    const grafo = () => page.evaluate(() => {
      const g = window.app.mapaCanvasGrafo;
      return { temaId: g.temaId, layout: g.layout, estilosNivel: g.estilosNivel || {} };
    });

    const idProjeto = await idDe('Projeto');
    const idEscopo = await idDe('Escopo');
    const idObjetivo = await idDe('Objetivo');
    // ---------------------------------------------------------------- 1) estado inicial
    await page.evaluate(id => { window.app.mapaSelecao = new Set([id]); window.app.renderArea(); }, idProjeto);
    assert.deepEqual(await estado(), { len: 1, indice: 0 }, 'pilha começa com 1 ponto');
    assert.equal((await botao('no-desfazer')).disabled, true, 'Desfazer começa desabilitado');
    assert.equal((await botao('no-refazer')).disabled, true, 'Refazer começa desabilitado');

    // ---------------------------------------------------------------- 2) criar → desfazer/refazer (botões)
    const base = await totalNos();
    await page.evaluate(id => window.app.mapaCriarFilhoDeNo(id, false), idProjeto);
    assert.equal(await totalNos(), base + 1, 'criar filho aumenta a árvore');
    assert.equal((await botao('no-desfazer')).disabled, false, 'Desfazer habilita após o comando');
    await clicar('no-desfazer');
    assert.equal(await totalNos(), base, 'Desfazer remove o filho criado');
    assert.equal((await botao('no-refazer')).disabled, false, 'Refazer habilita após desfazer');
    await clicar('no-refazer');
    assert.equal(await totalNos(), base + 1, 'Refazer recria o filho');
    await clicar('no-desfazer');

    // ---------------------------------------------------------------- 3) exclusão (id/título preservados)
    await page.evaluate(id => window.app.mapaExcluirNo(id), idEscopo);
    assert.equal(await totalNos(), base - 1, 'exclusão remove o nó');
    await clicar('no-desfazer');
    assert.equal(await totalNos(), base, 'Desfazer restaura o nó excluído');
    assert.equal(await tituloDe(idEscopo), 'Escopo', 'o nó restaurado mantém id e título');

    // ---------------------------------------------------------------- 4) estilo/tema/layout/nível são desfazíveis
    await page.evaluate(() => window.app.mapaDefinirTema('neon'));
    assert.equal((await grafo()).temaId, 'neon', 'tema aplicado');
    await clicar('no-desfazer');
    assert.equal((await grafo()).temaId, 'padrao', 'Desfazer volta o tema');

    await page.evaluate(() => window.app.mapaDefinirLayout('livre'));
    assert.equal((await grafo()).layout, 'livre', 'layout aplicado');
    await clicar('no-desfazer');
    assert.equal((await grafo()).layout, 'bilateral', 'Desfazer volta o layout');

    await page.evaluate(() => window.app.mapaDefinirEstiloNivel(2, { fundo: '#00ff00' }));
    assert.ok((await grafo()).estilosNivel['2'], 'estilo de nível aplicado');
    await clicar('no-desfazer');
    assert.equal(Boolean((await grafo()).estilosNivel['2']), false, 'Desfazer remove o estilo de nível');

    // ---------------------------------------------------------------- 5) conexões
    await page.evaluate(({ de, para }) => window.app.mapaCriarConexaoEntre(de, para, {}),
      { de: idObjetivo, para: idEscopo });
    assert.equal(await totalConexoes(), 1, 'conexão criada');
    await clicar('no-desfazer');
    assert.equal(await totalConexoes(), 0, 'Desfazer remove a conexão');

    // ---------------------------------------------------------------- 6) coalescência da digitação
    const antesCoalesce = await estado();
    await page.evaluate(id => {
      window.app.mapaCommitarTituloNo(id, 'Titulo A');
      window.app.mapaCommitarTituloNo(id, 'Titulo A e B');
      window.app.mapaCommitarTituloNo(id, 'Titulo A e B final');
    }, idObjetivo);
    const depoisCoalesce = await estado();
    assert.ok(depoisCoalesce.len <= antesCoalesce.len + 1,
      'a rajada de digitação NÃO empilha um passo por commit (' + antesCoalesce.len + ' -> ' + depoisCoalesce.len + ')');
    assert.equal(depoisCoalesce.indice, depoisCoalesce.len - 1, 'o topo da pilha é o estado atual');
    await clicar('no-desfazer');
    assert.equal(await tituloDe(idObjetivo), 'Objetivo', 'um único undo volta ao título original');

    // ---------------------------------------------------------------- 7) cap de 100 passos
    // Posicionamento manual: pula o recálculo de layout (a pilha é o que interessa aqui).
    await page.evaluate(() => {
      window.app.mapaCanvasGrafo.posicionamento = 'manual';
      for (let i = 0; i < 110; i += 1) window.app.mapaDefinirTema(i % 2 ? 'neon' : 'padrao');
    });
    const cap = await estado();
    assert.equal(cap.len, 100, 'a pilha respeita o cap de 100 passos');
    assert.equal(cap.indice, 99, 'o índice fica no topo da pilha');

    // ---------------------------------------------------------------- 8) undo re-persiste (autosave)
    const antesPersistir = await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-mapa-' + window.app.mapaAbertaId)).temaId);
    await clicar('no-desfazer');
    const depoisPersistir = await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-mapa-' + window.app.mapaAbertaId)).temaId);
    assert.notEqual(depoisPersistir, antesPersistir, 'undo grava o estado no storage (autosave)');

    assert.deepEqual(erros, []);
    console.log('OK: undo/redo (comandos, coalescência, cap 100, botões, autosave)');

  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA UNDO]