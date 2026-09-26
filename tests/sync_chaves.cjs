// 🧪 [INÍCIO: TESTE - SYNC CHAVES]
/*
 * Guarda do escopo "TUDO" (decisão nº 5): toda chave `notas-pwa-*` que o app grava precisa ter
 * destino declarado em `sync/chaves.js` — ou na nuvem, ou "fica só no aparelho" com o motivo
 * escrito. Se alguém criar uma configuração nova e esquecer de mapear, ESTE TESTE FALHA.
 *
 * Também falha no caminho de volta: chave declarada no mapa que não existe mais no código.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const read = arquivo => fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');

// ---------------------------------------------------------------- 1) carrega o mapa
const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('sync/chaves.js'), sandbox);
const mapa = sandbox.NotasSyncChaves;
assert.ok(mapa, 'sync/chaves.js precisa expor NotasSyncChaves');
assert.ok(mapa.chavesConhecidas().length >= 17, 'o mapa precisa cobrir as chaves reais do app');

// ---------------------------------------------------------------- 2) varre o código do app
const arquivos = [
  'app.js', 'conta.js', 'fontes.js', 'index.html', 'sw.js',
  'sync/chaves.js', 'sync/sync-cliente.js',
  ...fs.readdirSync(path.join(RAIZ, 'notes')).filter(nome => nome.endsWith('.js')).map(nome => 'notes/' + nome),
  ...fs.readdirSync(path.join(RAIZ, 'mapa')).filter(nome => nome.endsWith('.js')).map(nome => 'mapa/' + nome)
];

const literais = new Set();
// `notas-pwa-vNN` é a VERSÃO do cache do Service Worker (`sw.js`), não uma chave de dado.
const EH_VERSAO_CACHE = /^notas-pwa-v\d+$/;
for (const arquivo of arquivos) {
  for (const casamento of read(arquivo).matchAll(/'(notas-pwa-[a-z0-9-]+)'/g)) {
    if (!EH_VERSAO_CACHE.test(casamento[1])) literais.add(casamento[1]);
  }
}
assert.ok(literais.size >= 17, 'a varredura precisa achar as chaves do app (achou ' + literais.size + ')');

// ---------------------------------------------------------------- 3) chave sem destino
const semDestino = [...literais]
  .filter(chave => !Object.prototype.hasOwnProperty.call(mapa.LITERAIS_IGNORADOS, chave))
  .filter(chave => !mapa.destinoDaChave(chave));
assert.deepEqual(semDestino, [], 'chave(s) sem destino em sync/chaves.js — declare na nuvem ou como "só no aparelho" com o motivo');

// ---------------------------------------------------------------- 4) destino fantasma
// (o espalhamento converte o array vindo do `vm` para um array do host: `deepStrictEqual`
//  compara o PROTÓTIPO e um array de outro realm não é igual a `[]` do host)
const fantasma = [...mapa.chavesConhecidas()].filter(chave => !literais.has(chave));
assert.deepEqual(fantasma, [], 'chave(s) declaradas no mapa que não existem mais no código');

// ---------------------------------------------------------------- 5) o que NÃO sobe (decisões)
for (const chave of ['notas-pwa-mapa-historico-m1', 'notes-draft:u1:n1:focus', 'notas-pwa-fila-sync']) {
  const destino = mapa.destinoDaChave(chave);
  assert.ok(destino, chave + ' precisa estar mapeada');
  assert.equal(destino.entidade, null, chave + ' deve ficar SÓ no aparelho (decisão do dono)');
  assert.ok(destino.motivo, chave + ' precisa do motivo escrito');
}
for (const chave of ['notas-pwa-notes', 'notas-pwa-mapa-pastas', 'notas-pwa-theme', 'notas-pwa-mapa-m1']) {
  assert.ok(mapa.destinoDaChave(chave).entidade, chave + ' precisa subir para a nuvem');
}

console.log('OK: mapa de chaves cobre ' + literais.size + ' literais, sem destino faltando e sem chave fantasma');
// 🧪 [FIM: TESTE - SYNC CHAVES]