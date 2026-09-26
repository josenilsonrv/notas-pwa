// 🧪 [INÍCIO: TESTE - MAPA MOBILE TOPBAR (MESMA DO CABEÇALHO DE NOTAS)]
/*
 * No CELULAR a topbar do MAPA tem de ser a MESMA coisa que o cabeçalho de NOTAS:
 * os TRÊS botões — colapso, ⇄ (alternar área) e ✕ (fechar) — alinhados à DIREITA,
 * numa ÚNICA linha, com o título encolhendo; o ⛶ sai de cena (em Notas sai, porque
 * a área já é a tela inteira — no mapa também, e a tela cheia é liberada ao entrar
 * no modo mobile); e o COLAPSO recolhe os CHIPS (`#mapaChipsNav`), não as barras.
 *
 * Antes disto o mapa quebrava a topbar em DUAS linhas no celular (`flex-wrap`), o
 * ✕ caía sozinho na linha de baixo, o ⛶ ocupava o lugar do ✕ e o colapso recolhia
 * as barras — organização diferente do cabeçalho de Notas.
 *
 * Cobre: paridade dos três botões (visibilidade/ordem/posição), topbar numa linha,
 * nada fora da tela, colapso agindo nos chips (e voltando), tela cheia do mapa
 * liberada ao virar celular, e o retorno ao PC (⛶ de volta, colapso nas barras).
 * No fim compara as DUAS barras do topo (Notas × Mapa) nos DOIS modos: mesmo conjunto
 * de botões, mesma ordem no DOM e mesma altura — no celular (colapso · ⇄ · ✕) e no PC
 * (colapso · ⛶ · ✕). E varre as LARGURAS do PC sem toque (1280px → 480px): nenhuma das
 * duas barras pode quebrar em duas linhas (a do MAPA quebrava).
 *
 * P117: no celular a barra do mapa (agora ÚNICA: ferramentas + formatação na mesma linha)
 * sai do topo e só aparece ACOPLADA acima do teclado — aqui isso é auditado com o inset
 * forçado (`aplicarBarraMapaTeclado`), junto com a barra enxuta (grupos na gaveta "Mais").
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/**
 * Monta o app do teste numa página. O harness corta o `app.js` antes do
 * `DOMContentLoaded` (quem chama o `init`), então o MODO MOBILE é instalado na mão.
 * Serve para a página do CELULAR (com `hasTouch`, que faz `pointer: coarse` bater —
 * é o que liga o modo mobile) e para a página do PC (sem toque).
 */
async function montarApp(pg) {
  const html = ler('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
  await pg.route('**/*', rota => (rota.request().resourceType() === 'document'
    ? rota.fulfill({ contentType: 'text/html', body: html })
    : rota.abort()));
  await pg.goto('http://notes.test');
  for (const f of ['styles.css', 'theme-origem.css', 'notes/editor.css', 'notes/extras.css', 'notes/tables.css', 'mapa/mapa.css']) {
    await pg.addStyleTag({ content: ler(f) });
  }
  for (const f of ['notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js', 'fontes.js']) {
    await pg.addScriptTag({ content: ler(f) });
  }
  const fonte = ler('app.js');
  await pg.addScriptTag({ content: fonte.slice(0, fonte.indexOf("document.addEventListener('DOMContentLoaded'")) + '\nwindow.TestApp = NotesPWA;' });
  for (const f of ['mapa/mapa-modelo.js', 'mapa/mapa-store.js', 'mapa/mapa-layout.js', 'mapa/mapa-render.js', 'mapa/mapa-painel.js', 'mapa/mapa-cores.js', 'mapa/mapa-interacao.js', 'mapa/mapa.js']) {
    await pg.addScriptTag({ content: ler(f) });
  }
  await pg.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    window.app = Object.create(TestApp.prototype);
    app.userId = 'local';
    app.projectsData = [{ id: 'local', nome: 'Teste', notas: '' }];
    app.focusStagesData = [];
    app.ensureNotesFocusPage = () => {};
    app.showToast = () => {};
    installNotesEditor(TestApp);
    installMapaMental(TestApp);
    installModoMobileNotas(TestApp);
    app.setupModalListeners();
    app.setupEventListeners();
    app.setupResize();
    localStorage.clear();
    document.getElementById('notesModalBackdrop').classList.add('active');
    app.inicializarAreasMapa();
    const grafo = window.MapaMentalStore.criarMapa('Celular', null);
    window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'projeto');
    window.MapaMentalStore.salvarGrafo(grafo);
    app.mapaAbertaId = grafo.id;
    app.renderArea();
    app.aplicarArea('mapa');
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    // `hasTouch` é o que faz `pointer: coarse` bater — e é o que define o modo mobile.
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, hasTouch: true });
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await montarApp(page);

    /** Papel de cada botão do topo (o mesmo par de nome nas DUAS áreas). */
    const PAPEIS_MAPA = { mapaColapsoBarras: 'colapso', mapaAlternarAreaBtn: 'alternar', mapaFechar: 'fechar', mapaFullscreenBtn: 'tela-cheia' };
    const PAPEIS_NOTAS = { notesHeaderCollapseBtn: 'colapso', notesAlternarAreaBtn: 'alternar', notesModalClose: 'fechar', notesFullscreenBtn: 'tela-cheia' };

    const lerTopo = (papeis, raiz) => page.evaluate(([mapa, seletorRaiz]) => {
      const container = document.querySelector(seletorRaiz);
      const encontrados = [...container.querySelectorAll('button')]
        .filter(b => mapa[b.id])
        .map(b => {
          const r = b.getBoundingClientRect();
          return {
            papel: mapa[b.id], id: b.id, visivel: !!(r.width && r.height),
            x: Math.round(r.x), y: Math.round(r.y), dir: Math.round(r.right),
            fora: r.right > innerWidth + 1 || r.left < -1
          };
        });
      const topo = container.getBoundingClientRect();
      return {
        altura: Math.round(topo.height), dir: Math.round(topo.right),
        botoes: encontrados.filter(b => b.visivel), ordem: encontrados.map(b => b.papel)
      };
    }, [papeis, raiz]);

    // ---------------------------------------------------------- 1) CELULAR
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('notes-mobile')), true,
      'modo mobile ligado no celular (390px + toque)');

    const mapa = await lerTopo(PAPEIS_MAPA, '#mapaArea .mapa-topbar');
    assert.deepEqual(mapa.botoes.map(b => b.papel), ['colapso', 'alternar', 'fechar'],
      'topbar do Mapa no celular mostra colapso, ⇄ e ✕ (o ⛶ sai de cena)');
    assert.equal(mapa.altura <= 74, true, 'topbar do Mapa em UMA linha no celular (não quebra)');
    assert.equal(new Set(mapa.botoes.map(b => b.y)).size, 1, 'os três botões na MESMA linha');
    assert.equal(mapa.botoes.every(b => !b.fora), true, 'nenhum botão fora da tela');
    assert.equal(mapa.botoes[2].papel, 'fechar', 'o ✕ é o ÚLTIMO botão (canto direito)');
    assert.equal(mapa.botoes[0].x < mapa.botoes[1].x && mapa.botoes[1].x < mapa.botoes[2].x, true,
      'ordem da esquerda para a direita: colapso → ⇄ → ✕ (a mesma do cabeçalho de Notas)');

    // O cabeçalho de Notas tem EXATAMENTE os mesmos três botões (paridade de organização).
    await page.evaluate(() => app.aplicarArea('notas'));
    await page.waitForTimeout(500);
    const notas = await lerTopo(PAPEIS_NOTAS, '.notes-modal-header');
    assert.deepEqual(notas.botoes.map(b => b.papel), ['colapso', 'alternar', 'fechar'],
      'cabeçalho de Notas no celular mostra colapso, ⇄ e ✕ (sem ⛶) — MESMO conjunto do Mapa');
    assert.equal(notas.altura - mapa.altura <= 8 && mapa.altura - notas.altura <= 8, true,
      'as duas barras do topo têm a MESMA altura no celular (tolerância do padding interno)');
    assert.equal(notas.botoes[2].papel, 'fechar', 'o ✕ de Notas também é o último botão à direita');
    assert.deepEqual(notas.ordem, mapa.ordem,
      'no celular as DUAS barras têm a MESMA ordem no DOM (colapso → ⇄ → ⛶ → ✕), com o ⇄ no mesmo lugar');

    // ---------------------------------------------------------- 2) COLAPSO = CHIPS
    await page.evaluate(() => app.aplicarArea('mapa'));
    await page.waitForTimeout(500);
    const chips = () => page.evaluate(() => {
      const r = document.getElementById('mapaChipsNav').getBoundingClientRect();
      return { h: Math.round(r.height), visivel: !!(r.width && r.height) };
    });
    const classeChips = () => page.evaluate(() => document.querySelector('#mapaArea .mapa-shell').classList.contains('mapa-chips-colapsados'));
    assert.equal((await chips()).visivel, true, 'chips dos mapas visíveis antes do colapso');
    assert.equal(await page.evaluate(() => document.getElementById('mapaColapsoBarras').title), 'Ocultar mapas',
      'colapso no celular anuncia o que recolhe (mapas), como o "Ocultar notas" de Notas');

    await page.locator('#mapaColapsoBarras').click();
    await page.waitForTimeout(500);
    assert.equal(await classeChips(), true, 'shell marcado com o colapso dos CHIPS (mapa-chips-colapsados)');
    assert.equal((await chips()).visivel, false, 'colapso recolhe os CHIPS (igual ao #notesContextNav de Notas)');
    // P117: no celular a barra única NÃO fica no topo (só aparece acoplada ao teclado —
    // ver seção 6), e o colapso dos chips NEM A TOCA: o `hidden` dela continua falso.
    assert.equal(await page.evaluate(() => document.getElementById('mapaBarraUnica').hidden), false,
      'o colapso dos chips não toca na barra única (quem a esconde no celular é o CSS)');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('mapaBarraUnica')).display), 'none',
      'no celular a barra única fica FORA do topo');
    assert.equal(await page.evaluate(() => document.getElementById('mapaColapsoBarras').getAttribute('aria-expanded')), 'false',
      'aria-expanded=false ao recolher os chips');

    await page.locator('#mapaColapsoBarras').click();
    await page.waitForTimeout(500);
    assert.equal(await classeChips(), false, 'segundo toque devolve os chips');
    assert.equal((await chips()).visivel, true, 'chips visíveis de novo');
    assert.equal(await page.evaluate(() => document.getElementById('mapaColapsoBarras').title), 'Ocultar mapas',
      'rótulo volta a Ocultar mapas');
    // Um re-render da área não pode descolapsar nem perder o rótulo do celular.
    await page.locator('#mapaColapsoBarras').click();
    await page.waitForTimeout(400);
    await page.evaluate(() => app.renderArea());
    assert.equal(await classeChips(), true, 're-render mantém o colapso dos chips');
    assert.equal((await chips()).visivel, false, 're-render mantém os chips recolhidos');
    assert.equal(await page.evaluate(() => document.getElementById('mapaColapsoBarras').title), 'Mostrar mapas',
      're-render mantém o rótulo do celular');
    await page.locator('#mapaColapsoBarras').click();
    await page.waitForTimeout(400);

    // ---------------------------------------------------------- 3) TELA CHEIA NÃO FICA PRESA
    // Liga o ⛶ no PC (como se o usuário tivesse expandido) e vira CELULAR: sem o ⛶
    // visível, a tela cheia ficaria sem controle — precisa ser liberada.
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.waitForTimeout(500);
    await page.locator('#mapaFullscreenBtn').click();
    await page.waitForTimeout(1600);
    assert.equal(await page.evaluate(() => Boolean(app.mapaFullscreen)), true, 'tela cheia ligada no PC pelo ⛶');
    await page.setViewportSize({ width: 390, height: 800 });
    // A saída da tela cheia é animada (400 ms de pausa + uma barra por vez, 220 ms cada).
    await page.waitForTimeout(2000);
    assert.equal(await page.evaluate(() => Boolean(app.mapaFullscreen)), false, 'tela cheia do mapa liberada ao entrar no celular');
    assert.equal(await page.evaluate(() => document.getElementById('mapaBarraUnica').hidden), false,
      'a barra única volta ao estado normal depois da liberação (no celular quem a mostra é a doca do teclado)');
    assert.equal(await page.locator('#mapaFullscreenBtn').isVisible(), false, '⛶ do Mapa fora do celular');
    assert.equal(await page.evaluate(() => document.querySelector('#mapaArea .mapa-shell').classList.contains('mapa-fullscreen')), false,
      'classe de tela cheia limpa no shell');

    // ---------------------------------------------------------- 4) VOLTA AO PC
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.waitForTimeout(600);
    const deVolta = await lerTopo(PAPEIS_MAPA, '#mapaArea .mapa-topbar');
    assert.deepEqual(deVolta.botoes.map(b => b.papel), ['colapso', 'tela-cheia', 'fechar'],
      'no PC o Mapa volta a ter o ⛶ e o ⇄ sai de cena (o ⇄ é exclusivo do celular)');
    assert.equal(await page.evaluate(() => document.querySelector('#mapaArea .mapa-shell').classList.contains('mapa-chips-colapsados')), false,
      'a classe do colapso dos chips é descartada ao voltar ao PC');
    assert.equal(await page.evaluate(() => document.getElementById('mapaColapsoBarras').title), 'Recolher barras',
      'no PC o colapso volta a anunciar as barras');
    await page.locator('#mapaColapsoBarras').click();
    await page.waitForTimeout(900);
    assert.equal(await page.locator('#mapaToolbar').isVisible(), false, 'no PC o colapso continua recolhendo as BARRAS');
    assert.equal((await chips()).visivel, true, 'no PC os chips não são tocados pelo colapso');
    await page.locator('#mapaColapsoBarras').click(); // desfaz o colapso das barras
    await page.waitForTimeout(900);

    // ---------------------------------------------------------- 5) AS DUAS BARRAS NO PC
    // O que o celular mostrou (colapso · ⇄ · ✕) tem de continuar valendo como REGRA no PC:
    // as duas barras do topo mantêm o MESMO conjunto, a MESMA ordem (inclusive no DOM, com
    // o ⛶ no lugar do ⇄) e a MESMA altura — só o ⛶ volta e o ⇄ sai de cena nas DUAS.
    await page.evaluate(() => app.aplicarArea('notas'));
    await page.waitForTimeout(500);
    const notasPc = await lerTopo(PAPEIS_NOTAS, '.notes-modal-header');
    await page.evaluate(() => app.aplicarArea('mapa'));
    await page.waitForTimeout(500);
    const mapaPc = await lerTopo(PAPEIS_MAPA, '#mapaArea .mapa-topbar');
    assert.deepEqual(mapaPc.botoes.map(b => b.papel), notasPc.botoes.map(b => b.papel),
      'no PC as DUAS barras voltam ao MESMO conjunto de botões (colapso · ⛶ · ✕)');
    assert.deepEqual(mapaPc.botoes.map(b => b.papel), ['colapso', 'tela-cheia', 'fechar'],
      'no PC as DUAS barras têm o ⛶ no lugar do ⇄');
    assert.deepEqual(mapaPc.ordem, notasPc.ordem,
      'no PC as DUAS barras têm a MESMA ordem no DOM (colapso → ⇄ → ⛶ → ✕)');
    assert.equal(Math.abs(mapaPc.altura - notasPc.altura) <= 8, true,
      'no PC as duas barras do topo têm a MESMA altura (' + notasPc.altura + 'px × ' + mapaPc.altura + 'px)');
    assert.equal(notasPc.botoes.every(b => !b.fora) && mapaPc.botoes.every(b => !b.fora), true,
      'no PC nenhum botão das duas barras fica fora da tela');
    assert.equal(notasPc.botoes[notasPc.botoes.length - 1].papel === 'fechar' && mapaPc.botoes[mapaPc.botoes.length - 1].papel === 'fechar', true,
      'no PC o ✕ é o ÚLTIMO botão à direita nas DUAS barras');

    // ---------------------------------------------------------- 6) BARRA ÚNICA (P117)
    // A barra do mapa é UMA só: ferramentas + formatação na mesma linha (a casca
    // `#mapaBarraUnica`). No CELULAR ela sai do topo e só aparece ACOPLADA acima do
    // teclado — o MESMO comportamento do `#notesToolbar` de Notas. Para a barra caber,
    // os grupos menos usados vão para a gaveta "Mais" e as ações rápidas (irmão/filho)
    // ficam SEMPRE na linha.
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('notes-mobile')), true,
      'de volta ao celular para auditar a barra única');

    const barraCelular = await page.evaluate(() => {
      const barra = document.getElementById('mapaBarraUnica');
      const gaveta = document.querySelector('#mapaBarraUnica .mapa-tb-mais-lista');
      const naGaveta = chave => Boolean(gaveta && gaveta.querySelector('.mapa-tb-grupo[data-mapa-grupo="' + chave + '"]'));
      const naBarra = chave => Boolean(document.querySelector('#mapaToolbar > .mapa-tb-grupo[data-mapa-grupo="' + chave + '"]'));
      return {
        existe: Boolean(barra) && barra.contains(document.getElementById('mapaToolbar')) && barra.contains(document.getElementById('mapaFormatBar')),
        topo: getComputedStyle(barra).display,
        gaveta: ['exibir', 'fmt-linhas', 'modelos'].map(chave => naGaveta(chave)),
        fora: ['exibir', 'fmt-linhas', 'modelos'].map(chave => naBarra(chave)),
        fixos: Boolean(document.querySelector('#mapaBarraUnica > .mapa-tb-fixos'))
      };
    });
    assert.equal(barraCelular.existe, true, 'a casca contém as duas partes (ferramentas + formatação)');
    assert.equal(barraCelular.topo, 'none', 'no celular a barra única NÃO fica no topo');
    assert.deepEqual(barraCelular.gaveta, [true, true, true],
      'grupos Exibir/Linhas/Modelos vão para a gaveta "Mais" (barra enxuta no celular)');
    assert.deepEqual(barraCelular.fora, [false, false, false], 'e saem da linha da barra');
    assert.equal(barraCelular.fixos, true, 'as ações rápidas de criação ficam SEMPRE na linha');
    assert.equal(await page.locator('#mapaBarraUnica').isVisible(), false,
      'sem teclado a barra não aparece em lugar nenhum na área do mapa');

    // "Teclado aberto" — o teste NÃO abre teclado real: força o inset (320px), a MESMA
    // porta que o Notas usa (`aplicarToolbarTeclado(insetForcado)`).
    const dock = await page.evaluate(() => {
      const dockou = window.app.aplicarBarraMapaTeclado(320);
      const barra = document.getElementById('mapaBarraUnica');
      const r = barra.getBoundingClientRect();
      const estilo = getComputedStyle(barra);
      return {
        dockou, classe: barra.classList.contains('mapa-barra-docked'),
        posicao: estilo.position, bottom: Math.round(r.bottom), esquerda: Math.round(r.left),
        largura: Math.round(r.width), altura: Math.round(r.height),
        vista: window.innerWidth, alturaVista: window.innerHeight
      };
    });
    assert.equal(dock.dockou, true, 'com o teclado aberto a barra é DOCADA');
    assert.equal(dock.classe, true, 'classe `.mapa-barra-docked` aplicada');
    assert.equal(dock.posicao, 'fixed', 'barra docada é fixa (acima do teclado)');
    assert.equal(await page.locator('#mapaBarraUnica').isVisible(), true, 'barra docada fica visível');
    assert.equal(dock.bottom, dock.alturaVista - 320, 'barra encosta ACIMA do teclado (bottom = altura da tela − teclado)');
    assert.equal(dock.altura >= 36 && dock.altura <= 48, true, 'barra docada em UMA linha (' + dock.altura + 'px)');
    assert.equal(dock.esquerda >= -1 && dock.largura > 200, true,
      'barra docada ocupa a largura da tela (' + dock.largura + 'px)');

    // Teclado fechado: a barra sai da doca, limpa as variáveis e desaparece outra vez.
    const semTeclado = await page.evaluate(() => {
      const dockou = window.app.aplicarBarraMapaTeclado(0);
      const barra = document.getElementById('mapaBarraUnica');
      return { dockou, classe: barra.classList.contains('mapa-barra-docked'), estilo: (barra.getAttribute('style') || '').trim() };
    });
    assert.equal(semTeclado.dockou, false, 'sem teclado a barra não é docada');
    assert.equal(semTeclado.classe, false, 'classe da doca removida');
    assert.equal(semTeclado.estilo, '', 'variáveis da doca limpas (sem estilo inline pendurado)');
    assert.equal(await page.locator('#mapaBarraUnica').isVisible(), false, 'fechado o teclado a barra sai de cena');

    // Fora do celular a doca NÃO entra em ação (é uma barra de CELULAR) e os grupos
    // voltam para a linha da barra.
    await page.setViewportSize({ width: 1280, height: 960 });
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(() => window.app.aplicarBarraMapaTeclado(320)), false,
      'no PC a barra não é docada nem com inset forçado');
    assert.equal(await page.locator('#mapaBarraUnica').isVisible(), true, 'no PC a barra única volta ao topo');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('#mapaToolbar > .mapa-tb-grupo[data-mapa-grupo="exibir"]'))), true,
      'no PC os grupos abandonam a gaveta e voltam para a linha');

    // ---------------------------------------------------------- 7) PC ESTREITO: NADA DE QUEBRA
    // Encolher a janela do PC não pode quebrar NENHUMA das duas barras do topo. A de
    // Notas nunca quebrou; a do MAPA caía para uma SEGUNDA linha por causa do
    // `flex-wrap: wrap` (a barra saltava de 65px para 109px em 640px e 131px em 480px).
    // Esta seção roda numa página SEM toque (`pointer: fine` — o modo mobile NÃO liga, é
    // o PC de verdade) e varre larguras: as duas barras têm de ficar em UMA linha, na
    // MESMA altura e sem nada escapando da barra, em todas elas.
    const pc = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errosPc = [];
    pc.on('pageerror', e => errosPc.push(e.message));
    await montarApp(pc);

    const medirBarra = (pg, seletor) => pg.evaluate(sel => {
      const barra = document.querySelector(sel);
      const caixa = barra.getBoundingClientRect();
      const botoes = [...barra.querySelectorAll('button')].filter(b => {
        const s = getComputedStyle(b);
        const c = b.getBoundingClientRect();
        return s.display !== 'none' && s.visibility !== 'hidden' && c.width > 0 && c.height > 0;
      });
      return {
        altura: Math.round(caixa.height),
        linhas: new Set(botoes.map(b => Math.round(b.getBoundingClientRect().top))).size,
        botoes: botoes.length,
        fora: botoes.filter(b => {
          const c = b.getBoundingClientRect();
          return c.right > caixa.right + 1 || c.left < caixa.left - 1 || c.bottom > caixa.bottom + 1;
        }).length
      };
    }, seletor);

    let alturaNotasPc = null;
    let alturaMapaPc = null;
    for (const largura of [1280, 1024, 900, 800, 700, 640, 560, 480]) {
      await pc.setViewportSize({ width: largura, height: 900 });
      await pc.waitForTimeout(400);
      assert.equal(await pc.evaluate(() => document.documentElement.classList.contains('notes-mobile')), false,
        'em ' + largura + 'px o modo mobile NÃO liga numa página de PC (sem toque)');
      await pc.evaluate(() => app.aplicarArea('notas'));
      await pc.waitForTimeout(300);
      const notasL = await medirBarra(pc, '.notes-modal-header');
      await pc.evaluate(() => app.aplicarArea('mapa'));
      await pc.waitForTimeout(300);
      const mapaL = await medirBarra(pc, '#mapaArea .mapa-topbar');
      assert.equal(notasL.linhas, 1, 'cabeçalho de Notas em UMA linha com ' + largura + 'px (' + notasL.botoes + ' botões)');
      assert.equal(mapaL.linhas, 1, 'topbar do Mapa em UMA linha com ' + largura + 'px (' + mapaL.botoes + ' botões)');
      assert.equal(notasL.fora + mapaL.fora, 0, 'nenhum botão escapa da barra com ' + largura + 'px');
      if (alturaNotasPc === null) {
        alturaNotasPc = notasL.altura;
        alturaMapaPc = mapaL.altura;
      } else {
        assert.equal(notasL.altura, alturaNotasPc, 'a barra de Notas mantém a altura com ' + largura + 'px (' + notasL.altura + 'px)');
        assert.equal(mapaL.altura, alturaMapaPc, 'a barra do Mapa mantém a altura com ' + largura + 'px — antes ia a 109/131px');
      }
    }
    assert.deepEqual(errosPc, [], 'sem erros de JS na varredura de larguras do PC');

    assert.deepEqual(erros, [], 'sem erros de JS durante o ciclo celular ⇄ PC');
    console.log('OK: topbar do Mapa no celular = cabeçalho de Notas (colapso ⇄ ✕, uma linha, colapso nos chips)');
    console.log('OK: no PC as DUAS barras do topo ficam em UMA linha (mesma altura) de 1280px a 480px');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - MAPA MOBILE TOPBAR (MESMA DO CABEÇALHO DE NOTAS)]
