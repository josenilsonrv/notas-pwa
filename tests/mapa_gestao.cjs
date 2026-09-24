/*
 * FASE 1 - Gestão de mapas.
 * Cobre: criar/abrir/renomear/duplicar/excluir (com confirmação), favoritar,
 * arquivar, pastas/workspaces, mapa raiz, mapas conectados (nó-ponte/backlink),
 * templates (prontos e salvos), recentes, busca/ordenação e referência quebrada.
 * Mesmo harness dos testes existentes; interações no DOM para determinismo.
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
    for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-render.js', 'mapa/mapa.js']) {
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
      app.aplicarArea('mapa');
    });

    // ---------------------------------------------------------------- helpers
    const clicar = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('elemento não encontrado: ' + s);
      el.click();
    }, sel);
    const clicarAcao = (acao, extra) => page.evaluate(({ acao, extra }) => {
      const el = document.querySelector('[data-mapa-acao="' + acao + '"]' + (extra || ''));
      if (!el) throw new Error('ação não encontrada: ' + acao);
      el.click();
    }, { acao, extra: extra || '' });
    const preencher = (sel, valor) => page.evaluate(({ sel, valor }) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('campo não encontrado: ' + sel);
      el.value = valor;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, { sel, valor });
    const enviarForm = async valor => {
      if (valor !== undefined) await preencher('#mapaFormNome', valor);
      await clicar('#mapaForm button[type="submit"]');
    };
    const itens = () => page.evaluate(() => [...document.querySelectorAll('#mapaCanvasWrap .mapa-item')].map(li => ({
      id: li.dataset.mapaId,
      nome: li.querySelector('.mapa-item-nome').textContent,
      meta: li.querySelector('.mapa-item-meta').textContent,
      raiz: li.classList.contains('mapa-item-raiz'),
      arquivado: li.classList.contains('mapa-item-arquivado'),
      favorito: li.querySelector('[data-mapa-acao="favoritar"]').getAttribute('aria-pressed') === 'true'
    })));
    const indice = () => page.evaluate(() => window.MapaMentalStore.listarMapas());
    const tituloAberto = () => page.evaluate(() => document.getElementById('mapaTituloAtual').textContent);
    const acaoItem = (nome, acao) => page.evaluate(({ nome, acao }) => {
      const item = [...document.querySelectorAll('#mapaCanvasWrap .mapa-item')]
        .find(li => li.querySelector('.mapa-item-nome').textContent === nome);
      if (!item) throw new Error('mapa não encontrado: ' + nome);
      item.querySelector('[data-mapa-acao="' + acao + '"]').click();
    }, { nome, acao });
    const abrirItem = nome => page.evaluate(n => {
      const item = [...document.querySelectorAll('#mapaCanvasWrap .mapa-item')]
        .find(li => li.querySelector('.mapa-item-nome').textContent === n);
      if (!item) throw new Error('mapa não encontrado: ' + n);
      item.querySelector('.mapa-item-abrir').click();
    }, nome);
    const voltarLista = () => clicar('#mapaVoltarLista');

    // ---------------------------------------------------------------- criar/abrir
    await clicar('#mapaNovo');
    assert.equal(await page.evaluate(() => document.getElementById('mapaForm').dataset.mapaForm), 'novo', 'formulário de novo mapa');
    await enviarForm('Alpha');
    assert.equal(await tituloAberto(), 'Alpha', 'mapa criado e aberto');
    let lista = await indice();
    assert.equal(lista.length, 1, 'índice com 1 mapa');
    assert.equal(lista[0].nome, 'Alpha');
    const alphaId = lista[0].id;
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-mapa-ativo'))), alphaId, 'mapa ativo persistido');

    await voltarLista();
    assert.equal((await itens()).length, 1, 'lista com 1 item');
    await clicar('#mapaNovo');
    await enviarForm('Beta');
    await voltarLista();
    let atual = await itens();
    assert.equal(atual.length, 2, 'lista com 2 itens');
    assert.deepEqual(atual.map(i => i.nome), ['Alpha', 'Beta'], 'ordenado por nome');
    const betaId = atual.find(i => i.nome === 'Beta').id;

    // ---------------------------------------------------------------- favoritar/filtrar/ordenar
    await acaoItem('Beta', 'favoritar');
    assert.equal((await itens()).find(i => i.nome === 'Beta').favorito, true, 'Beta favoritado');
    await clicarAcao('filtrar-pasta', '[data-mapa-pasta="favoritos"]');
    assert.deepEqual((await itens()).map(i => i.nome), ['Beta'], 'filtro Favoritos');
    await clicarAcao('filtrar-pasta', '[data-mapa-pasta="todas"]');

    await preencher('#mapaBusca', 'Alp');
    assert.deepEqual((await itens()).map(i => i.nome), ['Alpha'], 'busca por nome');
    await preencher('#mapaBusca', '');

    await page.selectOption('#mapaOrdem', 'favorito');
    assert.deepEqual((await itens()).map(i => i.nome), ['Beta', 'Alpha'], 'ordenação por favorito');
    await page.selectOption('#mapaOrdem', 'nome');
    assert.deepEqual((await itens()).map(i => i.nome), ['Alpha', 'Beta'], 'ordenação por nome');

    // ---------------------------------------------------------------- renomear/duplicar
    await acaoItem('Alpha', 'renomear');
    assert.equal(await page.evaluate(() => document.getElementById('mapaForm').dataset.mapaForm), 'renomear', 'formulário de renomear');
    assert.equal(await page.evaluate(() => document.getElementById('mapaFormNome').value), 'Alpha', 'nome pré-preenchido');
    await enviarForm('Alpha Renomeado');
    assert.deepEqual((await itens()).map(i => i.nome), ['Alpha Renomeado', 'Beta'], 'renomeado');

    await acaoItem('Beta', 'duplicar');
    assert.match(await tituloAberto(), /Beta \(cópia\)/, 'cópia é aberta');
    await voltarLista();
    atual = await itens();
    assert.equal(atual.length, 3, 'cópia entrou na lista');
    const copiaId = (await indice()).find(m => m.nome.includes('(cópia)')).id;

    // ---------------------------------------------------------------- pastas/workspaces
    await clicarAcao('pasta-nova');
    await enviarForm('Trabalho');
    const pastas = await page.evaluate(() => window.MapaMentalStore.listarPastas());
    assert.equal(pastas.length, 1, 'pasta criada');
    assert.equal(pastas[0].nome, 'Trabalho');
    const pastaId = pastas[0].id;

    await acaoItem('Alpha Renomeado', 'mover');
    await page.selectOption('#mapaFormPasta', pastaId);
    await clicar('#mapaForm button[type="submit"]');
    atual = await itens();
    assert.match(atual.find(i => i.nome === 'Alpha Renomeado').meta, /Trabalho/, 'mapa movido para a pasta');
    await clicarAcao('filtrar-pasta', '[data-mapa-pasta="' + pastaId + '"]');
    assert.deepEqual((await itens()).map(i => i.nome), ['Alpha Renomeado'], 'filtro pela pasta');
    await clicarAcao('filtrar-pasta', '[data-mapa-pasta="todas"]');

    // ---------------------------------------------------------------- mapa raiz
    await acaoItem('Alpha Renomeado', 'raiz');
    atual = await itens();
    assert.equal(atual.find(i => i.nome === 'Alpha Renomeado').raiz, true, 'mapa raiz marcado');
    assert.equal(await page.evaluate(() => { const r = window.MapaMentalStore.obterMapaRaiz(); return r && r.id; }), alphaId, 'raiz persistida');

    // ---------------------------------------------------------------- mapas conectados
    await abrirItem('Alpha Renomeado');
    await clicarAcao('conectar');
    await page.selectOption('#mapaFormDestino', betaId);
    await clicar('#mapaForm[data-mapa-form="conectar"] button[type="submit"]');
    const saidas = await page.evaluate(id => window.MapaMentalStore.listarSaidas(window.MapaMentalStore.obterGrafo(id)), alphaId);
    assert.equal(saidas.length, 1, 'nó-ponte criado');
    assert.equal(saidas[0].idMapa, betaId, 'ponte aponta para Beta');
    assert.equal(await page.evaluate(id => window.MapaMentalStore.listarBacklinks(id).length, betaId), 1, 'backlink visto em Beta');
    assert.ok((await page.locator('#mapaCanvasWrap .mapa-chip').count()) >= 1, 'chip de conexão renderizado');
    await voltarLista();

    // ---------------------------------------------------------------- arquivar
    await acaoItem('Beta', 'arquivar');
    assert.equal((await itens()).some(i => i.nome === 'Beta'), false, 'arquivado some da lista');
    await clicarAcao('alternar-arquivados');
    assert.equal((await itens()).some(i => i.nome === 'Beta' && i.arquivado), true, 'arquivado aparece com o filtro');
    await clicarAcao('alternar-arquivados');

    // ---------------------------------------------------------------- excluir (com confirmação)
    await acaoItem('Beta (cópia)', 'excluir');
    assert.equal(await page.evaluate(() => document.getElementById('mapaForm').dataset.mapaForm), 'excluir', 'confirmação antes de excluir');
    await clicarAcao('excluir-confirmar');
    assert.equal((await indice()).some(m => m.id === copiaId), false, 'mapa excluído do índice');
    assert.equal(await page.evaluate(id => localStorage.getItem('notas-pwa-mapa-' + id), copiaId), null, 'grafo do mapa excluído removido');

    // ---------------------------------------------------------------- referência quebrada
    await page.evaluate(id => {
      const s = window.MapaMentalStore;
      const grafo = s.obterGrafo(id);
      grafo.nos.push({ id: 'ponte-quebrada', paiId: null, ordem: 0, titulo: 'Ponte', mapaRef: 'mapa-inexistente' });
      s.salvarGrafo(grafo);
    }, alphaId);
    await abrirItem('Alpha Renomeado');
    assert.equal(await page.locator('#mapaCanvasWrap .mapa-chip-quebrado').count(), 1, 'referência quebrada avisada sem quebrar o render');
    await voltarLista();

    // ---------------------------------------------------------------- templates
    await abrirItem('Alpha Renomeado');
    await clicarAcao('template-salvar');
    await enviarForm('Meu Template');
    assert.equal(await page.evaluate(() => window.MapaMentalStore.listarTemplates().length), 1, 'mapa salvo como template');
    await voltarLista();

    await clicar('#mapaTemplates');
    assert.equal(await page.locator('#mapaCanvasWrap .mapa-templates').count(), 1, 'painel de templates');
    const antes = (await indice()).length;
    await clicarAcao('aplicar-pronto', '[data-mapa-template="projeto"]');
    assert.equal(await tituloAberto(), 'Projeto', 'template pronto aplicado e aberto');
    const projetoId = (await indice()).find(m => m.nome === 'Projeto').id;
    assert.equal(await page.evaluate(id => window.MapaMentalStore.obterGrafo(id).nos.length, projetoId), 7, 'template Projeto materializado');
    assert.equal((await indice()).length, antes + 1, 'mapa do template entrou no índice');
    await voltarLista();

    await clicar('#mapaCanvasWrap [data-mapa-acao="aplicar-salvo"]');
    assert.equal(await tituloAberto(), 'Meu Template', 'template salvo aplicado e aberto');
    await voltarLista();

    // ---------------------------------------------------------------- recentes
    await clicar('#mapaTemplates');
    assert.ok((await page.locator('#mapaCanvasWrap .mapa-recentes .mapa-chip').count()) >= 1, 'lista de recentes com atalho');

    // ---------------------------------------------------------------- sem erros de página
    assert.deepEqual(erros, []);
    console.log('OK: gestão de mapas (CRUD, pastas, raiz, conexões, templates, recentes, busca/ordenação)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
