// 🧪 [INÍCIO: TESTE - BARRAS DE BOTÕES (NOTAS + MAPA)]
/*
 * Auditoria das BARRAS das duas áreas do PWA: Notas (cabeçalho, chips, barra de
 * ferramentas e rodapé) e Mapa (topbar, barra de ferramentas, barra de formatação e
 * rodapé). Para CADA barra o teste cobra o que a padronização promete:
 *
 *  1. a barra existe e está visível (na área ativa) com o mínimo de botões esperado;
 *  2. todo botão visível tem rótulo (`title`, `aria-label` ou texto) e alvo de toque
 *     de pelo menos 20 px (o `.toolbar-btn` é 32×32);
 *  3. nenhum botão escapa da altura da barra (a barra é UMA linha) nem se sobrepõe a
 *     outro botão da MESMA barra;
 *  4. as barras de ferramentas das duas áreas têm a MESMA altura (`--app-toolbar-altura`);
 *  5. nenhuma barra opaca é CLARA no tema escuro nem ESCURA no tema claro (tema real,
 *     não só os tokens) — as transparentes (a faixa de chips) ficam de fora.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** Luminância relativa (WCAG 2.1) de "rgb(r, g, b)". */
function luminancia(cor) {
  const canais = cor.match(/\d+/g).slice(0, 3).map(Number).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

/**
 * Relatório de UMA barra: botões visíveis, rótulos, alvos, linha e sobreposição.
 * `b.somente` (opcional) restringe o escopo — a barra do Mapa agrupa os botões em
 * `.mapa-tb-grupo`, e só os que estão NA LINHA entram (os itens de menu ficam de fora).
 */
function auditar(page, b) {
  return page.evaluate(({ sel, somente }) => {
    const barra = document.querySelector(sel);
    if (!barra) return { existe: false };
    const cs = getComputedStyle(barra);
    const caixa = barra.getBoundingClientRect();
    // Botões de POPOVER (menu do card, "Mais", painel…) vivem em caixas `absolute/fixed`
    // ancoradas na barra: não fazem parte da LINHA da barra e saem da auditoria.
    const emPopover = el => {
      let no = el.parentElement;
      while (no && no !== barra) {
        const pos = getComputedStyle(no).position;
        if (pos === 'absolute' || pos === 'fixed') return true;
        no = no.parentElement;
      }
      return false;
    };
    const todos = [...barra.querySelectorAll(somente || 'button')].filter(botao => {
      if (botao.tagName !== 'BUTTON') return false;
      const st = getComputedStyle(botao);
      const r = botao.getBoundingClientRect();
      return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    });
    const botoes = todos.filter(botao => !emPopover(botao));
    const semRotulo = botoes.filter(botao => !(botao.title || botao.getAttribute('aria-label') || (botao.textContent || '').trim())).length;
    const foraDaLinha = botoes.filter(botao => {
      const r = botao.getBoundingClientRect();
      return r.top < caixa.top - 2 || r.bottom > caixa.bottom + 2;
    }).length;
    const pequenos = botoes.filter(botao => {
      // Botão DESABILITADO (ex.: o "Salvo" do rodapé) não é alvo de toque: só mostra estado.
      if (botao.disabled || botao.getAttribute('aria-disabled') === 'true') return false;
      const r = botao.getBoundingClientRect();
      return r.width < 20 || r.height < 20;
    }).length;
    let sobrepostos = 0;
    for (let i = 0; i < botoes.length; i++) {
      for (let j = i + 1; j < botoes.length; j++) {
        const a = botoes[i].getBoundingClientRect(), b2 = botoes[j].getBoundingClientRect();
        if (a.left < b2.right - 0.5 && b2.left < a.right - 0.5 && a.top < b2.bottom - 0.5 && b2.top < a.bottom - 0.5) sobrepostos++;
      }
    }
    return {
      existe: true,
      visivel: cs.display !== 'none' && cs.visibility !== 'hidden' && caixa.width > 0 && caixa.height > 0,
      botoes: botoes.length, popovers: todos.length - botoes.length,
      semRotulo, foraDaLinha, pequenos, sobrepostos,
      altura: Math.round(caixa.height), bg: cs.backgroundColor
    };
  }, { sel: b.sel, somente: b.somente || '' });
}

/** Fundo de uma barra + opacidade (para a checagem de tema). */
function fundoDe(page, sel) {
  return page.evaluate(s => {
    const el = document.querySelector(s);
    const bg = getComputedStyle(el).backgroundColor;
    const partes = bg.match(/[\d.]+/g).map(Number);
    return { bg, alpha: partes.length > 3 ? partes[3] : 1 };
  }, sel);
}

/** Cobra o padrão de UMA barra visível. */
function cobrarBarra(rel, nome, minBotoes) {
  assert.ok(rel.existe, nome + ': a barra existe');
  assert.equal(rel.visivel, true, nome + ': a barra está visível');
  assert.ok(rel.botoes >= minBotoes, nome + ': botões visíveis (' + rel.botoes + ', mínimo ' + minBotoes + ')');
  assert.equal(rel.semRotulo, 0, nome + ': todo botão visível tem rótulo');
  assert.equal(rel.pequenos, 0, nome + ': todo botão ACIONÁVEL visível tem alvo >= 20px');
  assert.equal(rel.foraDaLinha, 0, nome + ': nenhum botão sai da altura da barra (uma linha)');
  assert.equal(rel.sobrepostos, 0, nome + ': nenhum botão se sobrepõe a outro da mesma barra');
}

const NOTAS = [
  { nome: 'Notas · cabeçalho', sel: '.notes-modal-header', minBotoes: 3 },
  { nome: 'Notas · chips', sel: '#notesContextNav', minBotoes: 1 },
  { nome: 'Notas · barra de ferramentas', sel: '#notesToolbar', minBotoes: 10 },
  { nome: 'Notas · rodapé', sel: '.notes-modal-footer', minBotoes: 1 }
];

const MAPA = [
  { nome: 'Mapa · topbar', sel: '.mapa-topbar', minBotoes: 3 },
  // Na barra do Mapa os botões vivem nos grupos (`.mapa-tb-grupo`): só os da LINHA entram.
  { nome: 'Mapa · barra de ferramentas', sel: '#mapaToolbar', minBotoes: 3, somente: ':scope > .mapa-tb-grupo > button, :scope > button' },
  { nome: 'Mapa · barra de formatação', sel: '#mapaFormatBar', minBotoes: 0, somente: ':scope > .mapa-tb-grupo > button, :scope > button' },
  { nome: 'Mapa · rodapé', sel: '#mapaRodape', minBotoes: 0 }
];

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
    for (const f of ['notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js', 'fontes.js']) {
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
      installNotesEditor(TestApp);
      installMapaMental(TestApp);
      app.setupModalListeners();
      // A barra INLINE (uma linha + rolagem + botão "…") é montada no boot real por
      // `configurarToolbarPWA` (dentro do `init`): sem ela a barra de Notas quebra em
      // VÁRIAS linhas e a comparação de altura com a barra do Mapa não teria sentido.
      app.configurarToolbarPWA();
      localStorage.clear();
      document.getElementById('notesModalBackdrop').classList.add('active');
      app.inicializarAreasMapa();
      const grafo = window.MapaMentalStore.criarMapa('Barras', null);
      window.MapaMentalModelo.aplicarTemplatePronto(grafo, 'projeto');
      window.MapaMentalStore.salvarGrafo(grafo);
      app.mapaAbertaId = grafo.id;
      app.aplicarArea('notas');
      app.renderArea();
    });
    await page.waitForTimeout(500);

    // ---------------------------------------------------------------- 1) NOTAS
    const relatorioNotas = {};
    for (const b of NOTAS) {
      const rel = await auditar(page, b);
      relatorioNotas[b.sel] = rel;
      cobrarBarra(rel, b.nome, b.minBotoes);
    }

    // ---------------------------------------------------------------- 2) MAPA
    await page.evaluate(() => app.aplicarArea('mapa'));
    await page.waitForTimeout(700);
    const relatorioMapa = {};
    for (const b of MAPA) {
      const rel = await auditar(page, b);
      relatorioMapa[b.sel] = rel;
      cobrarBarra(rel, b.nome, b.minBotoes);
    }

    // ---------------------------------------------------------------- 3) ALTURA DAS BARRAS
    // A barra de NOTAS é PARIDADE com o projeto original (`parity_visual` mede a altura
    // dela): não se mexe nela. O que se cobra aqui é: todas em UMA linha, rodapés
    // padronizados (`--app-toolbar-altura`) nas duas áreas e barras de ferramentas SEM
    // salto visual entre elas.
    const alturaNotas = relatorioNotas['#notesToolbar'].altura;
    const alturaMapa = relatorioMapa['#mapaToolbar'].altura;
    assert.ok(alturaNotas >= 36 && alturaNotas <= 48, 'barra de Notas em UMA linha (' + alturaNotas + 'px)');
    assert.ok(alturaMapa >= 36 && alturaMapa <= 48, 'barra do Mapa em UMA linha (' + alturaMapa + 'px)');
    assert.ok(Math.abs(alturaMapa - alturaNotas) <= 8,
      'barras de ferramentas sem salto de altura (notas=' + alturaNotas + 'px mapa=' + alturaMapa + 'px)');
    assert.equal(relatorioMapa['#mapaRodape'].altura, relatorioNotas['.notes-modal-footer'].altura,
      'os rodapés das duas áreas têm a MESMA altura: notas=' + relatorioNotas['.notes-modal-footer'].altura
      + ' mapa=' + relatorioMapa['#mapaRodape'].altura);

    // ---------------------------------------------------------------- 4) TEMA REAL DAS BARRAS
    // Barra TRANSPARENTE (a faixa de chips, sem contêiner no PWA) fica de fora: o que se
    // vê nela é o fundo do modal.
    const conferirTema = async (tema, barras, area) => {
      await page.evaluate(t => { document.documentElement.dataset.theme = t; }, tema);
      await page.evaluate(a => app.aplicarArea(a), area);
      await page.waitForTimeout(500);
      for (const b of barras) {
        const f = await fundoDe(page, b.sel);
        if (f.alpha <= 0.5) continue;
        const l = luminancia(f.bg);
        if (tema === 'dark') assert.ok(l < 0.4, b.nome + ': barra ESCURA no tema escuro (' + f.bg + ')');
        else assert.ok(l > 0.6, b.nome + ': barra CLARA no tema claro (' + f.bg + ')');
      }
    };
    await conferirTema('dark', NOTAS, 'notas');
    await conferirTema('dark', MAPA, 'mapa');
    await conferirTema('light', MAPA, 'mapa');
    await conferirTema('light', NOTAS, 'notas');

    assert.deepEqual(erros, [], 'sem erros de JS durante a auditoria (visto: ' + erros.join(' | ') + ')');
    console.log('OK: 8 barras auditadas (rótulos, alvos, uma linha, sem sobreposição, rodapés padronizados e tema claro/escuro)');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - BARRAS DE BOTÕES (NOTAS + MAPA)]
