// 🧪 [INÍCIO: TESTE - MAPA GESTAO]
/*
 * FASE 1 (revisada) — Mapas como ITENS DA PASTA (fim da tela de gestão).
 * Cobre: criar pelo "+" da faixa de chips, abrir/renomear/duplicar/excluir (com
 * confirmação) e mover para pasta pelo MENU DO CHIP, mapas conectados (nó-ponte/
 * backlink), modelos (diálogo "Modelos"), referência quebrada, ausência da antiga
 * lista de gestão e a seta ‹ voltando à tela principal de Pastas.
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
    // prompt/confirm: o teste define o que responder antes de disparar a ação.
    let resposta = { tipo: 'accept', valor: undefined };
    page.on('dialog', async d => {
      if (resposta.tipo === 'dismiss') { await d.dismiss().catch(() => {}); return; }
      await d.accept(resposta.valor).catch(() => {});
    });

    const html = ler('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.route('**/*', rota => (rota.request().resourceType() === 'document'
      ? rota.fulfill({ contentType: 'text/html', body: html })
      : rota.abort()));
    await page.goto('http://notes.test');
    for (const f of ['styles.css', 'theme-origem.css', 'notes/editor.css', 'notes/extras.css', 'notes/tables.css', 'mapa/mapa.css']) {
      await page.addStyleTag({ content: ler(f) });
    }
    for (const f of ['fontes.js', 'notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js']) {
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
    const chipsEls = () => '#mapaChipsNav .notes-context-chip:not(.notes-context-chip-add)';
    const chips = () => page.evaluate(sel => [...document.querySelectorAll(sel)].map(el => ({
      id: el.dataset.mapaId, nome: el.textContent, ativo: el.classList.contains('is-active')
    })), chipsEls());
    const indice = () => page.evaluate(() => window.MapaMentalStore.listarMapas());
    const tituloAberto = () => page.evaluate(() => document.getElementById('mapaTituloAtual').textContent);
    const clicar = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('elemento não encontrado: ' + s);
      el.click();
    }, sel);
    const comChip = (nome, acao) => page.evaluate(({ sel, nome, acao }) => {
      const el = [...document.querySelectorAll(sel)].find(item => item.textContent === nome);
      if (!el) throw new Error('chip não encontrado: ' + nome);
      el.dispatchEvent(new MouseEvent(acao, { bubbles: true, cancelable: true }));
    }, { sel: chipsEls(), nome, acao });
    const acaoMenu = texto => page.evaluate(t => {
      const b = [...document.querySelectorAll('#mapaChipMenu button')].find(el => el.textContent.trim() === t);
      if (!b) throw new Error('ação do menu não encontrada: ' + t);
      b.click();
    }, texto);
    const acaoDireta = acao => page.evaluate(a => {
      const el = document.querySelector('[data-mapa-acao="' + a + '"]');
      if (!el) throw new Error('ação não encontrada: ' + a);
      el.click();
    }, acao);

    // ---------------------------------------------------------------- 1) sem a lista de gestão
    assert.equal(await page.locator('#mapaChipsNav .notes-context-chip-add').count(), 1, 'a faixa tem o botão "+" (novo mapa)');
    assert.equal(await page.evaluate(sel => document.querySelectorAll(sel).length, chipsEls()), 0, 'pasta vazia: nenhum chip de mapa');
    assert.equal(await page.locator('#mapaCanvasWrap .mapa-vazio-titulo').textContent(), 'Nenhum mapa aberto.', 'estado vazio da área (sem lista)');
    for (const id of ['mapaBusca', 'mapaOrdem', 'mapaNovo', 'mapaNovaPasta', 'mapaTemplates', 'mapaMostrarArquivados']) {
      assert.equal(await page.evaluate(i => document.getElementById(i) === null, id), true, 'o controle de lista #' + id + ' não existe mais');
    }
    assert.equal(await page.locator('#mapaCanvasWrap .mapa-itens').count(), 0, 'a lista de mapas (mapa-itens) não existe mais');

    // ---------------------------------------------------------------- 2) "+" cria na pasta ativa
    await clicar('#mapaChipsNav .notes-context-chip-add');
    assert.equal(await tituloAberto(), 'Novo mapa', 'o "+" cria e abre o mapa');
    let lista = await indice();
    assert.equal(lista.length, 1, 'índice com 1 mapa');
    const novoId = lista[0].id;
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-mapa-ativo'))), novoId, 'mapa ativo persistido');
    assert.equal(lista[0].pastaId, 'pasta-geral', 'o mapa novo nasce na pasta ativa (Geral)');
    assert.deepEqual((await chips()).map(c => c.ativo), [true], 'o chip do mapa aberto fica ativo');

    // ---------------------------------------------------------------- 3) renomear pelo chip (duplo clique)
    resposta = { tipo: 'accept', valor: 'Alpha' };
    await comChip('Novo mapa', 'dblclick');
    assert.equal(await tituloAberto(), 'Alpha', 'renomear pelo duplo clique no chip');
    assert.deepEqual((await chips()).map(c => c.nome), ['Alpha'], 'a faixa mostra o novo nome');

    // ---------------------------------------------------------------- 4) segundo mapa + duplicar pelo menu
    await clicar('#mapaChipsNav .notes-context-chip-add');
    resposta = { tipo: 'accept', valor: 'Beta' };
    await comChip('Novo mapa', 'dblclick');
    assert.deepEqual((await chips()).map(c => c.nome), ['Alpha', 'Beta'], 'dois mapas na pasta (ordenados por nome)');

    await comChip('Beta', 'contextmenu');
    await acaoMenu('Duplicar');
    assert.match(await tituloAberto(), /Beta \(cópia\)/, 'duplicar pelo menu do chip abre a cópia');
    assert.equal((await indice()).length, 3, 'a cópia entrou no índice');
    const copiaId = (await indice()).find(m => m.nome.includes('(cópia)')).id;

    // ---------------------------------------------------------------- 5) mover para outra pasta
    const pastaId = await page.evaluate(() => window.MapaMentalStore.criarPasta('Trabalho').id);
    await comChip('Alpha', 'contextmenu');
    await acaoMenu('Mover para pasta…');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#mapaChipMenu button')].find(el => el.getAttribute('aria-checked') !== null && el.textContent === 'Trabalho');
      if (!b) throw new Error('pasta Trabalho não listada no menu');
      b.click();
    });
    assert.deepEqual((await chips()).map(c => c.nome), ['Beta', 'Beta (cópia)'], 'mapa movido sai da faixa da pasta ativa');
    assert.equal(await page.evaluate(id => window.MapaMentalStore.obterResumo(id).pastaId, (await indice()).find(m => m.nome === 'Alpha').id), pastaId, 'mapa gravado na nova pasta');

    // ---------------------------------------------------------------- 6) excluir (com confirmação)
    resposta = { tipo: 'dismiss' };
    await comChip('Beta', 'contextmenu');
    await acaoMenu('Excluir');
    assert.equal((await indice()).some(m => m.id === copiaId), true, 'cancelar a confirmação NÃO exclui');
    resposta = { tipo: 'accept' };
    await comChip('Beta (cópia)', 'contextmenu');
    await acaoMenu('Excluir');
    assert.equal((await indice()).some(m => m.id === copiaId), false, 'mapa excluído do índice');
    assert.equal(await page.evaluate(id => localStorage.getItem('notas-pwa-mapa-' + id), copiaId), null, 'grafo do mapa excluído removido');
    assert.deepEqual((await chips()).map(c => c.nome), ['Beta'], 'a faixa reflete a exclusão');

    // ---------------------------------------------------------------- 7) excluir o aberto abre o restante
    assert.equal(await tituloAberto(), 'Beta', 'excluir o mapa aberto abre o restante da pasta (sem lista)');

    // ---------------------------------------------------------------- 8) modelos (diálogo "Modelos")
    await clicar('#mapaModelosBtn');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.notes-extra-dialog'))), true, 'o botão Modelos abre o diálogo (mesmas classes de Notas)');
    assert.equal(await page.evaluate(() => document.querySelector('.notes-extra-dialog .notes-template-help') !== null), true, 'o diálogo tem a ajuda padrão de Modelos');
    await page.evaluate(() => {
      document.querySelector('.notes-extra-dialog input').value = 'Meu Modelo';
      [...document.querySelectorAll('.notes-extra-dialog button')]
        .find(b => b.textContent === 'Salvar mapa atual como modelo').click();
    });
    assert.equal(await page.evaluate(() => window.MapaMentalStore.listarTemplates().length), 1, 'mapa salvo como modelo');
    const antes = (await indice()).length;
    await clicar('#mapaModelosBtn');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.notes-extra-dialog button')].find(el => el.getAttribute('aria-label') === 'Usar Projeto');
      if (!b) throw new Error('modelo pronto "Projeto" não listado');
      b.click();
    });
    assert.equal(await tituloAberto(), 'Projeto', 'modelo pronto aplicado e aberto');
    const projetoId = (await indice()).find(m => m.nome === 'Projeto').id;
    assert.equal(await page.evaluate(id => window.MapaMentalStore.obterGrafo(id).nos.length, projetoId), 7, 'modelo Projeto materializado');
    assert.equal(await page.evaluate(id => window.MapaMentalStore.obterResumo(id).pastaId, projetoId), 'pasta-geral', 'o mapa do modelo entra na pasta ativa');
    assert.equal((await indice()).length, antes + 1, 'o mapa do modelo entrou no índice');

    // ---------------------------------------------------------------- 9) mapas conectados
    await comChip('Beta', 'click');
    await page.evaluate(() => window.app.renderArea());
    assert.equal(await tituloAberto(), 'Beta', 'clique no chip abre o mapa');
    await acaoDireta('conectar');
    await page.selectOption('#mapaFormDestino', projetoId);
    await page.evaluate(() => document.querySelector('#mapaForm[data-mapa-form="conectar"] button[type="submit"]').click());
    const betaId = (await indice()).find(m => m.nome === 'Beta').id;
    assert.equal(await page.evaluate(id => window.MapaMentalStore.listarSaidas(window.MapaMentalStore.obterGrafo(id)).length, betaId), 1, 'nó-ponte criado');
    assert.equal(await page.evaluate(id => window.MapaMentalStore.listarBacklinks(id).length, projetoId), 1, 'backlink visto no destino');

    // ---------------------------------------------------------------- 10) referência quebrada
    await page.evaluate(id => {
      const s = window.MapaMentalStore;
      const grafo = s.obterGrafo(id);
      grafo.nos.push({ id: 'ponte-quebrada', paiId: null, ordem: 0, titulo: 'Ponte', mapaRef: 'mapa-inexistente' });
      s.salvarGrafo(grafo);
    }, betaId);
    await page.evaluate(() => window.app.renderArea());
    assert.equal(await page.locator('#mapaCanvasWrap .mapa-chip-quebrado').count(), 1, 'referência quebrada avisada sem quebrar o render');

    // ---------------------------------------------------------------- 11) seta ‹ volta às Pastas
    await clicar('#appVoltar');
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.getElementById('pastasArea').hidden), false, 'a seta ‹ leva à tela principal de Pastas');
    assert.equal(await page.evaluate(() => document.getElementById('mapaArea').hidden), true, 'a área do mapa sai de cena');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('notas-pwa-area-ativa'))), 'pastas', 'área ativa persistida como pastas');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#pastasArea .pastas-card').length) >= 1, true, 'os cartões de pasta aparecem');

    assert.deepEqual(erros, []);
    console.log('OK: mapas como itens da pasta (chips: criar/abrir/renomear/duplicar/mover/excluir, conexões, modelos, volta às Pastas)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA GESTAO]

