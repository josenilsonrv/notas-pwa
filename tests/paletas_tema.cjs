// 🧪 [INÍCIO: TESTE - PALETAS DE TEMA (PALETA DE CORES E SELETOR DE TONS)]
/*
 * A paleta de cores e o seletor de tons de Notas tiram o fundo de um TOKEN do CLARO
 * (`--color-bg-container` = #FFF) e o recorte do compilado que o PWA carrega não define o
 * token no escuro (P115): o popover ficava BRANCO com texto quase preto por cima.
 *
 * Este teste mede os DOIS popovers nos DOIS temas:
 *  - claro  → superfície CLARA (#eeefef) com texto ESCURO;
 *  - escuro → #151B23 (a MESMA superfície das barras do modal, `theme-origem.css`) com
 *             texto #CBD5E1 e divisor #2A3543;
 * e exige contraste WCAG AA (>= 4.5) em todos os quatro casos.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** Luminância relativa (WCAG 2.1) de uma cor "rgb(r, g, b)". */
function luminancia(cor) {
  const canais = cor.match(/\d+/g).slice(0, 3).map(Number).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

/** Razão de contraste (WCAG 2.1) entre texto e fundo. */
function contraste(texto, fundo) {
  const [maior, menor] = [luminancia(texto), luminancia(fundo)].sort((a, b) => b - a);
  return (maior + 0.05) / (menor + 0.05);
}

/** Mede cor de fundo/texto/borda do primeiro elemento do seletor. */
function medir(page, sel) {
  return page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const st = getComputedStyle(el);
    return { bg: st.backgroundColor, cor: st.color, borda: st.borderTopColor };
  }, sel);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    // Uma PÁGINA nova por tema: `addScriptTag` reavaliado na mesma página redeclararia
    // identificadores globais do motor (`NotesDocument`) e quebraria o harness.
    const medirTema = async tema => {
      const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
      const erros = [];
      page.on('pageerror', e => erros.push(e.message));
      try {
        await page.setContent('<div id="notesModal" style="position:relative;margin:0 auto;width:400px">'
          + '<button data-notes-color="color" title="Cor">Cor</button>'
          + '<div id="notesEditor"><div class="notes-line"><div class="notes-line-text">Texto</div></div></div>'
          + '</div>');
        for (const f of ['styles.css', 'notes/editor.css']) await page.addStyleTag({ content: ler(f) });
        await page.addScriptTag({ content: ler('notes/editor.js') });
        await page.evaluate(t => {
          document.documentElement.dataset.theme = t;
          class App {}
          installNotesEditor(App);
          window.app = new App();
          app.rememberNotesSelection = () => {};
          app.recordNotesHistory = () => {};
          app.setupNotesColors();
        }, tema);
        await page.locator('[data-notes-color]').click();                                 // abre a PALETA
        await page.getByRole('button', { name: 'Adicionar cor personalizada' }).click();  // abre o TONALIDADE
        await page.getByRole('dialog', { name: 'Escolher tonalidade' }).waitFor({ state: 'visible' });
        return { paleta: await medir(page, PALETA), tons: await medir(page, TONS), erros };
      } finally {
        await page.close();
      }
    };

    const PALETA = '#notesColorPalette';
    const TONS = '.notes-tone-picker';

    // ---------------------------------------------------------------- 1) TEMA CLARO
    const claro = await medirTema('light');
    assert.deepEqual(claro.erros, [], 'sem erros de JS no tema claro (visto: ' + claro.erros.join(' | ') + ')');
    const claroPaleta = claro.paleta;
    const claroTons = claro.tons;
    assert.ok(claroPaleta && claroTons, 'os dois popovers existem no tema claro');
    assert.equal(claroPaleta.bg, 'rgb(238, 239, 239)', 'paleta clara com a superfície #eeefef');
    assert.equal(claroTons.bg, 'rgb(238, 239, 239)', 'seletor de tons claro com a superfície #eeefef');
    assert.ok(luminancia(claroPaleta.bg) > 0.6, 'paleta CLARA no tema claro');
    assert.ok(luminancia(claroPaleta.cor) < 0.3, 'texto ESCURO na paleta clara');
    assert.ok(luminancia(claroTons.cor) < 0.3, 'texto ESCURO no seletor de tons claro');
    assert.ok(contraste(claroPaleta.cor, claroPaleta.bg) >= 4.5, 'contraste WCAG AA na paleta clara');
    assert.ok(contraste(claroTons.cor, claroTons.bg) >= 4.5, 'contraste WCAG AA no seletor de tons claro');

    // ---------------------------------------------------------------- 2) TEMA ESCURO
    // Antes da correção (P115) o fundo vinha #FFFFFF nos DOIS popovers e o texto quase
    // preto por cima: fundo claro de tela branca no meio de um modal escuro.
    const escuro = await medirTema('dark');
    assert.deepEqual(escuro.erros, [], 'sem erros de JS no tema escuro (visto: ' + escuro.erros.join(' | ') + ')');
    const escuroPaleta = escuro.paleta;
    const escuroTons = escuro.tons;
    assert.ok(escuroPaleta && escuroTons, 'os dois popovers existem no tema escuro');
    assert.equal(escuroPaleta.bg, 'rgb(21, 27, 35)', 'paleta escura = #151B23 (superfície das barras do modal)');
    assert.equal(escuroTons.bg, 'rgb(21, 27, 35)', 'seletor de tons escuro = #151B23');
    assert.equal(escuroPaleta.cor, 'rgb(203, 213, 225)', 'texto #CBD5E1 na paleta escura');
    assert.equal(escuroTons.cor, 'rgb(203, 213, 225)', 'texto #CBD5E1 no seletor de tons escuro');
    assert.equal(escuroPaleta.borda, 'rgb(42, 53, 67)', 'divisor #2A3543 na paleta escura');
    assert.equal(escuroTons.borda, 'rgb(42, 53, 67)', 'divisor #2A3543 no seletor de tons escuro');
    assert.ok(luminancia(escuroPaleta.bg) < 0.1, 'paleta ESCURA no tema escuro (não é mais branca)');
    assert.ok(luminancia(escuroTons.bg) < 0.1, 'seletor de tons ESCURO no tema escuro (não é mais branco)');
    assert.ok(contraste(escuroPaleta.cor, escuroPaleta.bg) >= 4.5, 'contraste WCAG AA na paleta escura');
    assert.ok(contraste(escuroTons.cor, escuroTons.bg) >= 4.5, 'contraste WCAG AA no seletor de tons escuro');

    console.log('OK: paleta de cores e seletor de tons seguem o tema (claro #eeefef / escuro #151B23) com contraste AA');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - PALETAS DE TEMA (PALETA DE CORES E SELETOR DE TONS)]
