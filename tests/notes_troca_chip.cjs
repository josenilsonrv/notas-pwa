// 🧪 [INÍCIO: TESTE - NOTES TROCA CHIP]
/*
 * Trocar de NOTA pelo chip NÃO pode fechar/reabrir o modal (P125).
 *
 * O clique no chip chamava `openNotesModal`, que no PWA fechava a nota atual antes de
 * abrir a próxima: `closeNotesModal` tira `.active` do `#notesModalBackdrop` e TODO o
 * estilo do cabeçalho/faixa depende dessa classe. Resultado: a faixa de chips voltava
 * ao "estado fechado" (padding 12px -> 4px) e as transições reiniciavam — a "piscada"
 * (no celular a faixa encolhia de 60px para 44px e voltava animando).
 *
 * Cobre: o backdrop nunca perde `.active`, a faixa não dispara transição/padding de
 * fechado, a troca salva a nota anterior e abre a nova, e a rolagem horizontal da faixa
 * é preservada (com muitas notas ela voltava ao início).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ler = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    // Celular: é onde a faixa encolhia de 60px para 44px (a piscada mais visível).
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));

    const html = ler('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    await page.route('**/*', rota => (rota.request().resourceType() === 'document'
      ? rota.fulfill({ contentType: 'text/html', body: html })
      : rota.abort()));
    await page.goto('http://notes.test');
    for (const f of ['styles.css', 'theme-origem.css', 'notes/editor.css', 'notes/extras.css', 'notes/tables.css']) {
      await page.addStyleTag({ content: ler(f) });
    }
    for (const f of ['notes/editor.js', 'notes/table-math.js', 'notes/extras.js', 'notes/tables.js']) {
      await page.addScriptTag({ content: ler(f) });
    }
    const fonte = ler('app.js');
    await page.addScriptTag({ content: fonte.slice(0, fonte.indexOf("document.addEventListener('DOMContentLoaded'")) + '\nwindow.TestApp = NotesPWA;' });

    // 1) Duas notas, a primeira aberta.
    await page.evaluate(() => {
      localStorage.clear();
      const agora = new Date().toISOString();
      localStorage.setItem('notas-pwa-notes', JSON.stringify([
        { id: 'n1', nome: 'Nota Um', notas: 'um', pastaId: null, criadaEm: agora, atualizadaEm: agora },
        { id: 'n2', nome: 'Nota Dois', notas: 'dois', pastaId: null, criadaEm: agora, atualizadaEm: agora }
      ]));
      window.app = new TestApp();
    });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => app.currentNotesProjectId), 'n1', 'abre a primeira nota');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('notes-mobile')), true,
      'modo celular ligado (390px + toque) — é onde a piscada aparecia');

    // 2) Clica no chip da 2ª nota medindo o backdrop e a faixa quadro a quadro.
    const troca = await page.evaluate(() => new Promise(resolve => {
      const bd = document.getElementById('notesModalBackdrop');
      const nav = document.getElementById('notesContextNav');
      const marcasAtivo = [];
      const obs = new MutationObserver(() => marcasAtivo.push(bd.classList.contains('active')));
      obs.observe(bd, { attributes: true, attributeFilter: ['class'] });
      const quadros = [];
      const passo = () => {
        const estilo = getComputedStyle(nav);
        quadros.push({
          pad: estilo.paddingTop,
          anims: nav.getAnimations().length,
          altura: Math.round(nav.getBoundingClientRect().height)
        });
        if (quadros.length < 40) { requestAnimationFrame(passo); return; }
        obs.disconnect();
        resolve({
          perdeuAtivo: marcasAtivo.some(ativo => ativo === false),
          pads: [...new Set(quadros.map(q => q.pad))],
          anims: Math.max(...quadros.map(q => q.anims)),
          alturas: [...new Set(quadros.map(q => q.altura))],
          ativa: app.currentNotesProjectId,
          texto: document.getElementById('notesEditor').textContent.trim(),
          notaUm: (JSON.parse(localStorage.getItem('notas-pwa-notes') || '[]').find(n => n.id === 'n1') || {}).notas || ''
        });
      };
      requestAnimationFrame(passo);
      setTimeout(() => {
        const alvo = [...nav.querySelectorAll('.notes-context-chip:not(.notes-context-chip-add)')]
          .find(c => c.dataset.noteId === 'n2');
        alvo.click();
      }, 100);
    }));

    assert.equal(troca.perdeuAtivo, false, 'o backdrop NUNCA perde .active ao trocar de nota (nada de fechar/reabrir)');
    assert.deepEqual(troca.pads, ['12px'], 'a faixa mantém o padding do modal ABERTO (antes caía para 4px)');
    assert.equal(troca.anims, 0, 'nenhuma transição CSS é disparada na faixa (era a "piscada")');
    assert.equal(troca.alturas.length, 1, 'a faixa mantém a MESMA altura durante a troca (antes 60 -> 44 -> 60)');
    assert.equal(troca.ativa, 'n2', 'troca para a nota clicada');
    assert.ok(troca.texto.includes('dois'), 'o editor mostra o conteúdo da nova nota');
    assert.ok(troca.notaUm.includes('um'), 'a nota anterior continua guardada');

    // 3) Com muitas notas, a faixa NÃO volta ao início ao trocar de chip.
    await page.evaluate(async () => {
      clearTimeout(app.notesSaveTimer);
      app.notesSession = null; // descarta a sessão (sem salvar conteúdo de outra nota)
      const agora = new Date().toISOString();
      app.projectsData = Array.from({ length: 30 }, (_, i) => ({
        id: 'l' + (i + 1), nome: 'Nota ' + String(i + 1).padStart(2, '0'),
        notas: 'conteudo ' + (i + 1), pastaId: null, criadaEm: agora, atualizadaEm: agora
      }));
      app.currentNotesProjectId = 'l1';
      app.salvarNotasLocais();
      await app.openNotesModal('l1');
      app.renderNotesNav();
      await new Promise(r => setTimeout(r, 80));
    });
    const rolagem = await page.evaluate(async () => {
      const nav = document.getElementById('notesContextNav');
      const rolavel = nav.scrollHeight > nav.clientHeight + 2;
      nav.scrollTop = 40;
      const antes = nav.scrollTop;
      const alvo = [...nav.querySelectorAll('.notes-context-chip:not(.notes-context-chip-add)')]
        .find(c => c.dataset.noteId === 'l20');
      alvo.click();
      await new Promise(r => setTimeout(r, 400));
      return { rolavel, antes, depois: nav.scrollTop, ativa: app.currentNotesProjectId, chips: nav.querySelectorAll('.notes-context-chip').length };
    });
    assert.equal(rolagem.rolavel, true, 'a faixa com 30 notas tem rolagem (pré-condição)');
    assert.ok(rolagem.antes > 0, 'a faixa foi rolada (pré-condição)');
    assert.ok(Math.abs(rolagem.depois - rolagem.antes) <= 1, 'a rolagem da faixa é preservada (não volta ao início)');
    assert.equal(rolagem.ativa, 'l20', 'abre a nota do chip clicado');
    assert.equal(rolagem.chips, 31, 'a faixa continua com as 30 notas + o botão "+"');

    assert.deepEqual(erros, []);
    console.log('OK: troca de nota pelo chip sem fechar o modal (sem piscada e sem perder a rolagem da faixa)');
  } finally {
    await browser.close();
  }
})().catch(erro => { console.error(erro); process.exit(1); });
// 🧪 [FIM: TESTE - NOTES TROCA CHIP]

