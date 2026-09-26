// 🧪 [INÍCIO: TESTE - SYNC COMPLETO]
/*
 * Escopo "TUDO" (decisão nº 5) + 1º login silencioso (decisão nº 4), contra o backend REAL:
 *   - sobe pastas, mapa (com o GRAFO/nós), modelo de nota e a configuração do TEMA;
 *   - o 1º login empurra tudo para a conta (sem diálogo);
 *   - um SEGUNDO APARELHO entra e vê tudo (inclusive o tema, guardado CRU, sem reinterpretar);
 *   - o que é "só do aparelho" NÃO entra na coleta: histórico do mapa (Ctrl+Z), rascunho e fila.
 *
 * Mesmo contrato dos outros testes de sync: sem `.venv`, sai com 0 e explica.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const RAIZ = path.join(__dirname, '..');
const SENHA = 'senha-de-teste-123';

const acharPython = () => [
    process.env.PYTHON_BACKEND,
    path.join(RAIZ, '.venv', 'Scripts', 'python.exe'),
    path.join(RAIZ, '.venv', 'bin', 'python')
].find(caminho => caminho && fs.existsSync(caminho));

const porta = () => new Promise(resolve => {
    const servidor = net.createServer();
    servidor.listen(0, '127.0.0.1', () => {
        const numero = servidor.address().port;
        servidor.close(() => resolve(numero));
    });
});

const subirBackend = async (python, numero) => {
    const processo = spawn(
        python,
        ['-m', 'uvicorn', 'backend.app.main:app', '--port', String(numero), '--log-level', 'warning'],
        { cwd: RAIZ, env: Object.assign({}, process.env, { DRIVER: 'memory' }) }
    );
    const limite = Date.now() + 25000;
    while (Date.now() < limite) {
        try {
            const resposta = await fetch('http://127.0.0.1:' + numero + '/health');
            if (resposta.ok) return processo;
        } catch (_) { /* ainda subindo */ }
        await new Promise(acordar => setTimeout(acordar, 250));
    }
    processo.kill();
    throw new Error('o backend nao subiu em 25 s');
};

const autenticar = (page, caminho, email) => page.evaluate(async dados => {
    const resposta = await fetch('/api/auth/' + dados.caminho, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: dados.email, senha: dados.senha })
    });
    return resposta.status;
}, { caminho, email, senha: SENHA });

const esperarSincronizado = page => page.waitForFunction(() => {
    const sync = window.notasConta.sync || {};
    return sync.estado === 'sincronizado' && !(sync.pendentes || 0);
});

/** Cria conteúdo local "completo": pasta, mapa com nós, modelo de nota e tema. */
const semearAparelho = page => page.evaluate(() => {
    const store = window.MapaMentalStore;
    const pasta = store.criarPasta('Trabalho');
    const grafo = store.criarMapa('Projeto', pasta.id);
    window.MapaMentalModelo.criarNo(grafo, { titulo: 'Raiz' });
    window.MapaMentalModelo.criarNo(grafo, { titulo: 'Filho' });
    store.salvarGrafo(grafo);
    localStorage.setItem('notas-pwa-templates', JSON.stringify([{ id: 'tpl-1', name: 'Meu modelo', html: '<p>modelo</p>' }]));
    localStorage.setItem('notas-pwa-theme', JSON.stringify('dark'));
    localStorage.setItem('notas-pwa-mapa-historico-' + grafo.id, JSON.stringify({ pilha: ['x'] }));
    localStorage.setItem('notes-draft:local:local:focus', JSON.stringify({ html: '<p>rascunho</p>' }));
    return grafo.id;
});

(async () => {
  const python = acharPython();
  if (!python) {
    console.log('SKIP backend: sem .venv (rode: pip install -r backend/requirements.txt)');
    process.exit(0);
  }
  const numero = await porta();
  const base = 'http://127.0.0.1:' + numero + '/';
  const email = 'completo-' + Date.now().toString(36) + '@exemplo.com';
  let backend = null;
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    backend = await subirBackend(python, numero);

    // ---------- 1) APARELHO 1: conteúdo local -> 1º login silencioso ----------
    const ctx1 = await browser.newContext();
    const page = await ctx1.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.__notasPronto === true);
    await semearAparelho(page);

    // Decisões do dono: histórico (Ctrl+Z), rascunho e fila NÃO entram na coleta.
    const coletadas = await page.evaluate(() => window.notesApp.syncColetarOps().map(op => op.entidade + '/' + op.id));
    assert.ok(coletadas.length > 0, 'a coleta não pode ser vazia');
    assert.ok(!coletadas.some(chave => chave.includes('historico')), 'histórico NÃO entra na coleta');
    assert.ok(!coletadas.some(chave => chave.includes('rascunho')), 'rascunho NÃO entra na coleta');
    assert.ok(!coletadas.some(chave => chave.startsWith('null/')), 'nenhuma op sem entidade');
    assert.ok(coletadas.includes('configuracoes/theme'), 'ajustes usam o NOME da chave (theme)');

    assert.equal(await autenticar(page, 'registrar', email), 204, 'registrou a conta');
    await page.reload();
    await page.waitForFunction(() => window.notasConta && window.notasConta.logado === true);
    await esperarSincronizado(page);

    const nuvem = await page.evaluate(() => fetch('/api/sync/snapshot', { credentials: 'same-origin' }).then(r => r.json()));
    const entidades = nuvem.entidades;
    assert.ok(entidades.pastas.some(p => ((p.dados || {}).item || {}).nome === 'Trabalho'), 'a pasta subiu');
    assert.ok(entidades.mapas.some(m => (m.dados || {}).nome === 'Projeto'), 'o mapa subiu');
    assert.ok(
      entidades.mapas.some(m => m.dados.grafo && (m.dados.grafo.nos || []).length >= 2),
      'o GRAFO (com os nós) subiu'
    );
    assert.ok(
      entidades.modelos.some(m => (m.dados || {}).tipo === 'nota' && (m.dados || {}).nome === 'Meu modelo'),
      'o modelo de nota subiu'
    );
    assert.ok(entidades.configuracoes.some(c => c.id === 'theme'), 'a configuração do tema subiu');
    assert.ok(!entidades.configuracoes.some(c => String(c.id).includes('historico')), 'o histórico NÃO subiu');

    // ---------- 2) APARELHO 2: vê TUDO (tema cru e grafo com nós) ----------
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    const erros2 = [];
    page2.on('pageerror', e => erros2.push(e.message));
    await page2.goto(base);
    await page2.waitForFunction(() => window.__notasPronto === true);
    assert.equal(await autenticar(page2, 'login', email), 204, 'o 2º aparelho entrou na conta');
    await page2.reload();
    await page2.waitForFunction(() => window.notasConta && window.notasConta.logado === true);
    await page2.waitForFunction(
      () => JSON.parse(localStorage.getItem('notas-pwa-maps') || '[]').length > 0,
      null,
      { timeout: 15000 }
    );

    const local = await page2.evaluate(() => {
      const indice = JSON.parse(localStorage.getItem('notas-pwa-maps') || '[]');
      const grafo = indice[0] ? JSON.parse(localStorage.getItem('notas-pwa-mapa-' + indice[0].id) || 'null') : null;
      return {
        pastas: JSON.parse(localStorage.getItem('notas-pwa-mapa-pastas') || '[]').map(p => p.nome),
        mapas: indice.map(m => m.nome),
        nos: grafo && grafo.nos ? grafo.nos.length : 0,
        tema: localStorage.getItem('notas-pwa-theme'),
        modelos: JSON.parse(localStorage.getItem('notas-pwa-templates') || '[]').map(t => t.name),
        historico: indice[0] ? localStorage.getItem('notas-pwa-mapa-historico-' + indice[0].id) : null
      };
    });
    assert.ok(local.pastas.includes('Trabalho'), 'a pasta chegou no 2º aparelho');
    assert.ok(local.mapas.includes('Projeto'), 'o mapa chegou');
    assert.ok(local.nos >= 2, 'o grafo chegou COM os nós');
    assert.equal(local.tema, JSON.stringify('dark'), 'o tema chegou CRU (sem reinterpretar JSON)');
    assert.ok(local.modelos.includes('Meu modelo'), 'o modelo de nota chegou');
    assert.equal(local.historico, null, 'o histórico (Ctrl+Z) NÃO veio: é por aparelho');

    assert.deepEqual(erros, [], 'sem erro de página no 1º aparelho');
    assert.deepEqual(erros2, [], 'sem erro de página no 2º aparelho');
    await ctx1.close();
    await ctx2.close();
    console.log('OK: escopo completo — pastas, mapas (com grafo), modelos e ajustes sobem no 1º login e chegam no 2º aparelho');
  } finally {
    await browser.close();
    if (backend) backend.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
// 🧪 [FIM: TESTE - SYNC COMPLETO]
