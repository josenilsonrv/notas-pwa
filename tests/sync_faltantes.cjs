// 🧪 [INÍCIO: TESTE - SYNC FALTANTES]
/*
 * P123 — nota criada SEM sessão não pode ficar órfã.
 *
 * Cenário real: o projeto do Supabase ficou PAUSADO; `/api/auth/me` falhou e o app subiu
 * DESLOGADO (silencioso, P62). O usuário seguiu escrevendo (LocalStorage). Quando a conta
 * voltou, o `syncAoEntrar` pulou o "1º login" (a marca `notas-pwa-sync-conta` já era a mesma) e
 * essas notas NUNCA subiam — o outro aparelho só via o que já estava na nuvem.
 *
 * `syncSubirFaltantes` fecha isso: enfileira as notas que a nuvem DESCONHECE. A marca
 * `notas-pwa-sync-vistas` (ids já vistos) impede o efeito colateral oposto: ressuscitar nota
 * apagada em outro aparelho. Roda no `vm` — sem navegador, backend ou cookies.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const read = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
const idDe = lista => Array.from(lista, nota => nota.id);

/** Sandbox mínimo: armazenamento de mentira, `window.notasConta` e timers inertes. */
const montar = () => {
  const armazem = new Map();
  const sandbox = {
    console,
    setTimeout: () => 0,
    clearTimeout: () => { },
    crypto: { randomUUID: () => 'op-teste' },
    localStorage: {
      getItem: chave => (armazem.has(chave) ? armazem.get(chave) : null),
      setItem: (chave, valor) => armazem.set(chave, String(valor)),
      removeItem: chave => armazem.delete(chave),
      key: indice => Array.from(armazem.keys())[indice] || null,
      get length() { return armazem.size; }
    },
    document: { getElementById: () => null }
  };
  sandbox.window = {
    notasConta: { logado: true, email: 'dona@gmail.com', csrf: 'csrf', sync: { estado: 'local', pendentes: 0 } },
    __notasPronto: true
  };
  vm.createContext(sandbox);
  vm.runInContext(read('sync/sync-cliente.js'), sandbox);
  const App = function () { };
  sandbox.installSync(App);
  return { p: App.prototype, sandbox, armazem };
};

const fila = armazem => JSON.parse(armazem.get('notas-pwa-fila-sync') || '[]');
const vistas = armazem => JSON.parse(armazem.get('notas-pwa-sync-vistas') || 'null');

// ---------------------------------------------------------------------- 1) a escolha (pura)
{
  const { p } = montar();
  const locais = [
    { id: 'n1', nome: 'Orfa (criada sem sessao)' },
    { id: 'n2', nome: 'Ja esta na nuvem' },
    { id: 'n3', nome: 'Apagada no outro aparelho' },
    { id: 'n4', nome: 'Somente nuvem', somenteNuvem: true }
  ];
  assert.deepEqual(idDe(p.syncNotasFaltantes(locais, ['n2'], ['n2', 'n3'])), ['n1'],
    'so sobe o id DESCONHECIDO que falta na nuvem');
  assert.deepEqual(idDe(p.syncNotasFaltantes(locais, [], [])), ['n1', 'n2', 'n3'],
    'sem historico, toda nota local que falta sobe (menos a somenteNuvem)');
  assert.deepEqual(idDe(p.syncNotasFaltantes([{ id: '' }, null, undefined], [], [])), [],
    'nota sem id nao entra');
}

// ------------------------------------------------------------- 2) a fila (syncSubirFaltantes)
{
  const { p, armazem } = montar();
  const locais = [
    { id: 'n1', nome: 'Orfa', notas: 'texto', atualizadaEm: '2026-11-19T10:00:00Z' },
    { id: 'n2', nome: 'Na nuvem', notas: 'texto' },
    { id: 'n3', nome: 'Apagada no outro', notas: 'texto' },
    { id: 'n4', nome: 'Somente nuvem', notas: '', somenteNuvem: true }
  ];
  p.projectsData = locais;
  p.lerNotasLocais = () => locais;
  p.syncNuvemNotas = ['n2'];
  armazem.set('notas-pwa-sync-vistas', JSON.stringify({ conta: 'dona@gmail.com', ids: ['n2', 'n3'] }));

  assert.deepEqual(idDe(p.syncSubirFaltantes()), ['n1'], 'so a orfa entra na fila');
  const pendentes = fila(armazem);
  assert.equal(pendentes.length, 1, 'uma op na fila');
  assert.equal(pendentes[0].entidade, 'notas');
  assert.equal(pendentes[0].id, 'n1');
  assert.equal(pendentes[0].conta, 'dona@gmail.com', 'a op nasce vinculada a conta');

  // Idempotente: rodar de novo (ex.: dois `/me` no boot) NÃO duplica a op.
  assert.deepEqual(idDe(p.syncSubirFaltantes()), [], 'a mesma nota nao entra duas vezes');
  assert.equal(fila(armazem).length, 1, 'a fila continua com UMA op');
}

// ------------------------------------------------------- 3) deslogado não cria fila (modo local)
{
  const { p, sandbox, armazem } = montar();
  sandbox.window.notasConta.logado = false;
  p.projectsData = [{ id: 'x1', nome: 'Local' }];
  assert.deepEqual(idDe(p.syncSubirFaltantes()), [], 'deslogado nao sobe nada');
  assert.equal(armazem.has('notas-pwa-fila-sync'), false, 'deslogado NAO cria fila');
}

// ------------------------------------------- 4) a fotografia da nuvem e o histórico (vistas)
{
  const { p, armazem } = montar();
  armazem.set('notas-pwa-sync-vistas', JSON.stringify({ conta: 'dona@gmail.com', ids: ['velha', 'apagada'] }));
  p.syncNuvemNotas = ['velha'];

  p.syncRegistrarNotasDaNuvem([{ id: 'n2' }], false);   // carga inicial
  assert.deepEqual(Array.from(p.syncNuvemNotas), ['n2'], 'a carga inicial E a fotografia da conta');
  assert.ok(vistas(armazem).ids.includes('apagada'), 'o historico NUNCA diminui');
  assert.ok(vistas(armazem).ids.includes('n2'), 'a foto entra no historico');

  p.syncRegistrarNotasDaNuvem([{ id: 'n2', deleted_at: '2026-11-19T00:00:00Z' }], true); // delta
  assert.deepEqual(Array.from(p.syncNuvemNotas), [], 'tombstone sai da fotografia');
  assert.ok(vistas(armazem).ids.includes('n2'), 'mas continua no historico (nao ressuscita)');

  p.syncRegistrarNotasDaNuvem([{ id: 'n5' }], true);
  assert.deepEqual(Array.from(p.syncNuvemNotas), ['n5'], 'delta acrescenta a nota nova');
}

// --------------------------------------------- 5) troca de conta: histórico não é herdado
{
  const { p, armazem } = montar();
  armazem.set('notas-pwa-sync-vistas', JSON.stringify({ conta: 'outra@gmail.com', ids: ['x1', 'x2'] }));
  p.projectsData = [{ id: 'x1' }, { id: 'x9' }];
  assert.deepEqual(idDe(p.syncSubirFaltantes()), ['x1', 'x9'],
    'marca de OUTRA conta nao protege nada: as duas sobem para a conta atual');
}

// ------------------------------------------------------------ 6) ligado no login (syncAoEntrar)
(async () => {
  const { p, armazem } = montar();
  const locais = [
    { id: 'n1', nome: 'Orfa (escrita sem sessao)' },
    { id: 'n3', nome: 'Apagada em outro aparelho' }
  ];
  p.projectsData = locais;
  let drenou = false;
  let conectou = false;
  p.syncSnapshot = async () => { p.syncNuvemNotas = ['n2']; return { rev_global: 1 }; };
  p.syncDrenar = async () => { drenou = true; };
  p.syncConectar = () => { conectou = true; };
  armazem.set('notas-pwa-sync-conta', 'dona@gmail.com');   // o 1º login JA aconteceu
  armazem.set('notas-pwa-sync-vistas', JSON.stringify({ conta: 'dona@gmail.com', ids: ['n2', 'n3'] }));

  assert.equal(await p.syncAoEntrar(), true, 'syncAoEntrar conclui');
  assert.equal(drenou, true, 'a fila e drenada depois de subir as faltantes');
  assert.equal(conectou, true, 'o socket e aberto depois');
  assert.deepEqual(fila(armazem).map(item => item.id), ['n1'],
    'a orfa entra na fila no login; a apagada no outro aparelho NAO volta');

  console.log('OK: notas criadas SEM sessao sobem no proximo login; apagadas em outro aparelho nao ressuscitam');
})().catch(erro => { console.error(erro); process.exit(1); });
// 🧪 [FIM: TESTE - SYNC FALTANTES]

