// 🧪 [INÍCIO: TESTE - MAPA CONTEUDO]
/*
 * FASE 4 - Conteúdo dentro dos nós.
 * Cobre: sanitização (texto/HTML/URL/datas), painel de propriedades (abrir/fechar/salvar),
 * emoji/ícone, tags, tarefa/concluído, prioridade/status/datas/progresso, links com
 * auto-link, referências, anexos (limite + remover) e nó-ponte (indicação visual + abrir).
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
      const grafo = window.MapaMentalStore.criarMapa('Conteúdo', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'simples');
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.renderArea();
    });

    const clicarAcao = acao => page.evaluate(a => {
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
    const clicar = sel => page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) throw new Error('elemento não encontrado: ' + s);
      el.click();
    }, sel);
    const noPorTitulo = titulo => page.evaluate(t => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === t);
      return no ? JSON.parse(JSON.stringify(no)) : null;
    }, titulo);
    const clicarNo = titulo => page.evaluate(t => {
      const el = [...document.querySelectorAll('#mapaNos .mapa-no')]
        .find(n => (n.querySelector('.mapa-no-texto') || {}).textContent === t);
      if (!el) throw new Error('nó não encontrado: ' + t);
      const r = el.getBoundingClientRect();
      const base = {
        bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
      };
      el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
      el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, { buttons: 0 })));
    }, titulo);

    // ---------------------------------------------------------------- sanitização (modelo)
    const limpo = await page.evaluate(() => {
      const m = window.MapaMentalModelo;
      return {
        texto: m.sanitizarTexto('<b>Oi</b><script>alert(1)</script>'),
        urlRuim: m.urlSegura('javascript:alert(1)'),
        urlBoa: m.urlSegura('https://exemplo.com'),
        html: m.htmlSeguro('<script>alert(1)</script> oi https://a.com'),
        dataRuim: m.normalizarData('31/12/2024'),
        dataBoa: m.normalizarData('2024-12-31'),
        tags: m.normalizarTags('a, b; a, #c')
      };
    });
    assert.equal(limpo.texto.indexOf('<'), -1, 'sanitizarTexto remove tags');
    assert.equal(limpo.urlRuim, null, 'javascript: é rejeitado');
    assert.equal(limpo.urlBoa, 'https://exemplo.com', 'https continua permitido');
    assert.ok(limpo.html.indexOf('&lt;script&gt;') >= 0, 'htmlSeguro escapa <script>');
    assert.ok(limpo.html.indexOf('<script>') === -1, 'htmlSeguro não deixa <script> cru');
    assert.ok(limpo.html.indexOf('<a href="https://a.com"') >= 0, 'htmlSeguro ancora URLs');
    assert.equal(limpo.dataRuim, null, 'data fora de ISO é rejeitada');
    assert.equal(limpo.dataBoa, '2024-12-31', 'data ISO é aceita');
    assert.deepEqual(limpo.tags, ['a', 'b', 'c'], 'tags únicas e sem #');

    // ---------------------------------------------------------------- painel: abrir/fechar
    await clicarNo('Tópico 1');
    await clicarAcao('no-propriedades');
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('mapaPainel'))), 'painel de propriedades abre');
    await clicarAcao('painel-fechar');
    assert.equal(await page.evaluate(() => Boolean(document.getElementById('mapaPainel'))), false, 'painel fecha');

    // ---------------------------------------------------------------- salvar conteúdo
    await clicarNo('Tópico 1');
    await clicarAcao('no-propriedades');
    await page.fill('#mapaPainelTitulo', 'Tarefa principal');
    await page.fill('#mapaPainelDescricao', 'Ver https://docs.exemplo.com e o plano');
    await page.fill('#mapaPainelNotas', 'nota interna');
    await page.fill('#mapaPainelTags', 'urgente, projeto');
    await page.fill('#mapaPainelEmoji', '🚀');
    await page.fill('#mapaPainelResponsavel', 'Ana');
    await page.check('#mapaPainelTarefa');
    await page.selectOption('#mapaPainelPrioridade', 'alta');
    await page.selectOption('#mapaPainelStatus', 'fazendo');
    await page.fill('#mapaPainelInicio', '2024-01-01');
    await page.fill('#mapaPainelPrazo', '2024-02-01');
    await page.fill('#mapaPainelProgresso', '40');
    await page.fill('#mapaPainelLinks', 'Docs | https://docs.exemplo.com');
    await page.fill('#mapaPainelRefs', 'nota | nota-1 | Nota base');
    await clicar('#mapaPainelForm button[type="submit"]');

    const salvo = await noPorTitulo('Tarefa principal');
    assert.ok(salvo, 'título salvo pelo painel');
    assert.equal(salvo.emoji, '🚀', 'emoji salvo');
    assert.deepEqual(salvo.tags, ['urgente', 'projeto'], 'tags salvas');
    assert.equal(salvo.tarefa, true, 'marcado como tarefa');
    assert.equal(salvo.prioridade, 'alta', 'prioridade salva');
    assert.equal(salvo.status, 'fazendo', 'status salvo');
    assert.equal(salvo.inicio, '2024-01-01', 'início salvo');
    assert.equal(salvo.prazo, '2024-02-01', 'prazo salvo');
    assert.equal(salvo.progresso, 40, 'progresso salvo');
    assert.equal(salvo.links.length, 1, 'link salvo');
    assert.equal(salvo.links[0].url, 'https://docs.exemplo.com', 'url do link');
    assert.ok(salvo.descricao.indexOf('<a href="https://docs.exemplo.com"') >= 0, 'descrição com auto-link');
    assert.equal(salvo.refs.length, 1, 'referência salva');
    assert.equal(salvo.refs[0].id, 'nota-1', 'id da referência');

    // ---------------------------------------------------------------- render do nó
    const visual = await page.evaluate(() => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === 'Tarefa principal');
      const el = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + no.id + '"]');
      const iconeEl = el.querySelector('.mapa-no-icone');
      return {
        icone: iconeEl ? iconeEl.textContent : null,
        tags: [...el.querySelectorAll('.mapa-no-tag')].map(t => t.textContent),
        prioridadeAlta: el.classList.contains('mapa-no-prioridade-alta')
      };
    });
    assert.equal(visual.icone, '🚀', 'emoji aparece no nó');
    assert.deepEqual(visual.tags, ['#urgente', '#projeto'], 'tags aparecem no nó');
    assert.equal(visual.prioridadeAlta, true, 'prioridade alta vira classe visual');

    // ---------------------------------------------------------------- concluir (tarefa)
    await clicarAcao('no-concluir');
    const concluido = await noPorTitulo('Tarefa principal');
    assert.equal(concluido.concluido, true, 'concluir marca a tarefa');
    assert.equal(concluido.progresso, 100, 'concluir leva o progresso a 100');

    // ---------------------------------------------------------------- anexos (limite + remover)
    const anexos = await page.evaluate(() => {
      const m = window.MapaMentalModelo;
      const g = window.app.mapaCanvasGrafo;
      const alvo = g.nos.find(n => n.titulo === 'Tarefa principal');
      const recusado = m.adicionarAnexo(g, alvo.id, { nome: 'grande.txt', tipo: 'text/plain', dados: 'x'.repeat(m.LIMITE_ANEXO + 1) });
      const aceito = m.adicionarAnexo(g, alvo.id, { nome: 'bom.txt', tipo: 'text/plain', dados: 'abc' });
      window.MapaMentalStore.salvarGrafo(g);
      return {
        recusado: recusado === null,
        aceito: aceito ? aceito.nome : null,
        total: g.nos.find(n => n.titulo === 'Tarefa principal').anexos.length
      };
    });
    assert.equal(anexos.recusado, true, 'anexo acima do limite é recusado');
    assert.equal(anexos.aceito, 'bom.txt', 'anexo dentro do limite é aceito');
    assert.equal(anexos.total, 1, 'um anexo gravado');

    await page.evaluate(() => window.app.renderArea());
    await clicarNo('Tarefa principal');
    await clicarAcao('no-propriedades');
    assert.ok(await page.evaluate(() => Boolean(document.querySelector('.mapa-painel-anexo'))), 'anexo listado no painel');
    await clicarAcao('no-anexo-remover');
    assert.equal(await page.evaluate(() => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.titulo === 'Tarefa principal');
      return no.anexos.length;
    }), 0, 'remover anexo pelo painel');

    // ---------------------------------------------------------------- nó-ponte (mapa conectado)
    await page.evaluate(() => {
      const outro = window.MapaMentalStore.criarMapa('Outro mapa', null);
      window.MapaMentalModelo.criarNoPonte(window.app.mapaCanvasGrafo, outro.id, 'Ir para Outro');
      window.MapaMentalStore.salvarGrafo(window.app.mapaCanvasGrafo);
      window.app.renderArea();
    });
    const ponte = await page.evaluate(() => {
      const no = window.app.mapaCanvasGrafo.nos.find(n => n.mapaRef);
      const el = document.querySelector('#mapaNos .mapa-no[data-mapa-no-id="' + no.id + '"]');
      return { classe: el.classList.contains('mapa-no-ponte'), temIcone: Boolean(el.querySelector('.mapa-no-ponte-icone')) };
    });
    assert.equal(ponte.classe, true, 'nó-ponte tem classe visual');
    assert.equal(ponte.temIcone, true, 'nó-ponte mostra o ícone');
    const mapaAntes = await page.evaluate(() => window.app.mapaAbertaId);
    await page.evaluate(() => document.querySelector('.mapa-no-ponte-icone').click());
    const mapaDepois = await page.evaluate(() => window.app.mapaAbertaId);
    assert.notEqual(mapaDepois, mapaAntes, 'clicar no nó-ponte abre o mapa destino');

    assert.deepEqual(erros, []);
    console.log('OK: conteúdo (concluir/anexos/nó-ponte)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA CONTEUDO]
