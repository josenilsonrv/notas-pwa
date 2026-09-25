// 🧪 [INÍCIO: TESTE - PARITY]
/**
 * Helper de paridade: monta a mesma nota no PWA e no projeto original para
 * comparar estrutura e estilos computados.
 *
 * O original e somente leitura: usamos os arquivos dele e o mesmo harness dos
 * testes originais (route + addStyleTag + addScriptTag + stubs).
 */
const fs = require('fs');
const path = require('path');

const RAIZ_PWA = path.join(__dirname, '..', '..');
const ORIGINAL = process.env.NOTAS_ORIGINAL
  || 'C:/Users/Usuario/OneDrive/Desktop/produtividade-ferrramenta';

const lerOriginal = f => fs.readFileSync(path.join(ORIGINAL, f), 'utf8');
const lerPWA = f => fs.readFileSync(path.join(RAIZ_PWA, f), 'utf8');

const semScripts = html => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*>/gi, '');

const appAteDomReady = (fonte, classe) => {
  const corte = fonte.indexOf("document.addEventListener('DOMContentLoaded'");
  return fonte.slice(0, corte > 0 ? corte : fonte.length) + '\nwindow.TestApp = ' + classe + ';';
};

// ---------------------------------------------------------------- PWA
const PWA_HTML = semScripts(lerPWA('index.html'));
const PWA_CSS = ['styles.css', 'theme-origem.css', 'notes/editor.css', 'notes/extras.css', 'notes/tables.css'].map(lerPWA);
const PWA_SCRIPTS = ['notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js'].map(lerPWA);
const PWA_APP = appAteDomReady(lerPWA('app.js'), 'NotesPWA');

// ---------------------------------------------------------------- ORIGINAL
const ORIG_HTML = semScripts(lerOriginal('frontend/index.html'));
const ORIG_CSS = ['frontend/styles.css', 'frontend/focus/sports.css', 'frontend/notes/editor.css', 'frontend/notes/extras.css', 'frontend/notes/tables.css'].map(lerOriginal);
const ORIG_SCRIPTS = ['frontend/focus/sports.js', 'frontend/notes/editor.js', 'frontend/notes/table-math.js', 'frontend/notes/extras.js', 'frontend/notes/tables.js'].map(lerOriginal);
const ORIG_APP = appAteDomReady(lerOriginal('frontend/app.js'), 'NeuralCommandApp');

/**
 * Monta uma das aplicacoes na pagina e devolve helpers de manipulacao.
 * @param {import('playwright').Page} page
 * @param {'pwa'|'original'} variante
 * @param {{tema?:'light'|'dark'}} [opcoes]
 */
async function montar(page, variante, opcoes = {}) {
  const dados = variante === 'original'
    ? { html: ORIG_HTML, css: ORIG_CSS, scripts: ORIG_SCRIPTS, app: ORIG_APP }
    : { html: PWA_HTML, css: PWA_CSS, scripts: PWA_SCRIPTS, app: PWA_APP };
  const tema = opcoes.tema || 'light';
  await page.route('**/*', rota => (rota.request().resourceType() === 'document'
    ? rota.fulfill({ contentType: 'text/html', body: dados.html })
    : rota.abort()));
  await page.goto('http://notas.test');
  for (const css of dados.css) await page.addStyleTag({ content: css });
  for (const js of dados.scripts) await page.addScriptTag({ content: js });
  await page.addScriptTag({ content: dados.app });
  await page.evaluate(({ tema, projeto, variante }) => {
    document.documentElement.dataset.theme = tema;
    window.app = Object.create(TestApp.prototype);
    app.userId = 'local';
    app.projectsData = [projeto];
    app.focusStagesData = [{ id: 'stage', foco_id: 'local', titulo: 'Etapa', notas: '' }];
    // No original o modal vive dentro de #focusDetailPage (escondida por padrao);
    // este stub reproduz o que o bootstrap dos testes originais faz para exibi-la.
    app.ensureNotesFocusPage = variante === 'original' ? () => {
      document.querySelectorAll('.section').forEach(elemento => {
        elemento.style.display = elemento.id === 'focusDetailPage' ? 'block' : 'none';
      });
      const pagina = document.getElementById('focusDetailPage');
      if (pagina) { pagina.style.contentVisibility = 'visible'; pagina.classList.add('active'); }
      const backdrop = document.getElementById('notesModalBackdrop');
      if (backdrop) { backdrop.inert = false; document.body.append(backdrop); }
    } : () => {};
    app.ensureNotesFocusPage();
    if (app.setupAntiInspection) app.setupAntiInspection();
    app.showToast = () => {};
    if (!TestApp.prototype.__motorInstalado) {
      installNotesEditor(TestApp);
      if (typeof installNotesExtras === 'function') installNotesExtras(TestApp);
      if (typeof installNotesTables === 'function') installNotesTables(TestApp);
      if (typeof installLocalNotesStorage === 'function') installLocalNotesStorage(TestApp);
      TestApp.prototype.__motorInstalado = true;
    }
    app.setupModalListeners();
    app.apiCall = async () => ({});
    document.getElementById('notesModalBackdrop')?.classList.add('active');
    window.carregarNota = async html => {
      clearTimeout(app.notesSaveTimer);
      app.notesSession = null;
      app.projectsData[0].notas = html;
      await app.openNotesModal(app.projectsData[0].id);
      // openNotesModal pode limpar o estado do backdrop; garante o modal ABERTO
      // nos dois projetos para que a comparacao seja feita no mesmo estado.
      const backdrop = document.getElementById('notesModalBackdrop');
      if (backdrop) { backdrop.inert = false; backdrop.hidden = false; backdrop.classList.add('active'); }
      document.getElementById('notesModal')?.classList.remove('fullscreen');
      await new Promise(resolver => setTimeout(resolver, 250));
      return app.getCleanNotesHtml();
    };
  }, { tema, projeto: { id: 'local', nome: 'Teste', notas: '' }, variante });
  return page;
}

/**
 * Le as propriedades computadas dos seletores informados.
 * @param {import('playwright').Page} page
 * @param {string[]} seletores
 */
async function estilos(page, seletores) {
  return page.evaluate(lista => {
    const props = ['display', 'position', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color',
      'backgroundColor', 'borderTopWidth', 'borderTopColor', 'padding', 'margin',
      'minHeight', 'height', 'width', 'borderRadius', 'cursor', 'opacity', 'textDecorationLine',
      'textAlign', 'overflow', 'flexDirection', 'alignItems', 'gap', 'zIndex'];
    const resultado = {};
    for (const seletor of lista) {
      const elemento = document.querySelector(seletor);
      if (!elemento) { resultado[seletor] = null; continue; }
      const estilo = getComputedStyle(elemento);
      const retangulo = elemento.getBoundingClientRect();
      const valores = {};
      for (const prop of props) valores[prop] = estilo[prop];
      valores.__caixa = [Math.round(retangulo.width), Math.round(retangulo.height)];
      resultado[seletor] = valores;
    }
    return resultado;
  }, seletores);
}

const SELETORES = [
  '#notesModalBackdrop', '#notesModal', '.notes-modal-header', '#notesToolbar', '.toolbar-btn',
  '#notesContextNav', '#notesEditorContainer', '#notesEditor', '.notes-line', '.notes-line-controls',
  '.notes-line-collapse', '.notes-line-check', '.notes-line-marker', '.notes-line-text',
  '#notesSaveStatus', '.notes-modal-footer', 'table[data-note-table]', 'table[data-note-table] td'
];

const NOTA_EXEMPLO = [
  '<div class="notes-line" data-level="0"><div class="notes-line-text">Primeiro item</div></div>',
  '<div class="notes-line" data-level="0" data-check="true" data-checked="false"><div class="notes-line-text">Checklist <strong>negrito</strong></div></div>',
  '<div class="notes-line" data-level="0" data-list="ol" data-check-number="1"><div class="notes-line-text">Numerado</div></div>',
  '<div class="notes-line" data-level="1" data-heading="2"><div class="notes-line-text">Subtitulo</div></div>',
  '<div class="notes-line" data-level="0" data-check="true" data-collapsed="false"><div class="notes-line-text">Pai</div></div>',
  '<div class="notes-line" data-level="1"><div class="notes-line-text">Filho</div></div>',
  '<div class="notes-line" data-level="0" data-list="ul"><div class="notes-line-text">Marcador</div></div>'
].join('');

module.exports = {
  RAIZ_PWA, ORIGINAL, lerOriginal, lerPWA, montar, estilos, SELETORES, NOTA_EXEMPLO,
  PWA_HTML, ORIG_HTML, PWA_CSS, ORIG_CSS, PWA_APP, ORIG_APP, PWA_SCRIPTS, ORIG_SCRIPTS
};
// 🧪 [FIM: TESTE - PARITY]
