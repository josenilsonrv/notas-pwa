#!/usr/bin/env node
/**
 * Runner sequencial da suite de testes do PWA.
 *
 * Uso:
 *   node tests/run-all.cjs                 roda tudo (PWA)
 *   node tests/run-all.cjs --filter=notes_ roda so os que casam com o padrao
 *   node tests/run-all.cjs --dir=DIR       roda a suite de outro projeto (ex.: o original)
 *   node tests/run-all.cjs --prefixo=nome  prefixo dos arquivos de relatorio
 *   node tests/run-all.cjs --timeout=180000
 *
 * Gera docs/RELATORIO-TESTES.md e docs/relatorio-testes.json (ou com o prefixo).
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

/**
 * Testes que NAO se aplicam ao PWA, com o motivo escrito. Sao contabilizados
 * como `n/a` (nunca como sucesso silencioso) e aparecem no relatorio.
 */
const NAO_APLICAVEIS = {
  'notes_requested_fixes.cjs': 'exercita telas do dashboard de foco (#focusStageFocusId, #focusStageTitle), que nao existem no PWA standalone'
};

const RAIZ_PWA = path.join(__dirname, '..');
const arg = nome => (process.argv.find(a => a.startsWith('--' + nome + '=')) || '').split('=')[1] || '';
const DIR = path.resolve(arg('dir') || RAIZ_PWA);
const PREFIXO = arg('prefixo') || 'RELATORIO-TESTES';
const TESTS = path.join(DIR, 'tests');
const RAIZ = DIR;
const filtro = arg('filter');
const timeoutArg = Number(arg('timeout')) || 180000;
const nodePathExtra = process.env.NODE_PATH || '';

const arquivos = fs.readdirSync(TESTS)
  .filter(f => f.endsWith('.cjs'))
  .filter(f => f !== 'run-all.cjs')
  .filter(f => !filtro || f.includes(filtro))
  .sort();

console.log('Suite: ' + arquivos.length + ' testes' + (filtro ? ' (filtro: ' + filtro + ')' : ''));
console.log('');

const resultados = [];
for (const arquivo of arquivos) {
  if (NAO_APLICAVEIS[arquivo]) {
    resultados.push({ arquivo, passou: true, naoAplicavel: NAO_APLICAVEIS[arquivo], ms: 0, motivo: '', saida: '' });
    console.log('n/a'.padEnd(6) + arquivo.padEnd(36) + NAO_APLICAVEIS[arquivo].slice(0, 70));
    continue;
  }
  // Testes parametrizados: recebem um documento grande como argumento.
  const fonte = fs.readFileSync(path.join(TESTS, arquivo), 'utf8');
  const argumentos = [];
  if (fonte.includes('process.argv[2]')) {
    const fixture = path.join(os.tmpdir(), 'pwa-notas-grande.html');
    const linhas = Array.from({ length: 800 }, (_, i) =>
      '<div class="notes-line" data-level="' + (i % 3) + '"><div class="notes-line-text">Linha ' + i + ' com conteudo suficiente para o teste de documento grande</div></div>');
    fs.writeFileSync(fixture, linhas.join('\n'));
    argumentos.push(fixture);
  }
  const inicio = Date.now();
  const r = spawnSync(process.execPath, [path.join(TESTS, arquivo), ...argumentos], {
    cwd: RAIZ, encoding: 'utf8', timeout: timeoutArg, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: nodePathExtra || path.join(RAIZ_PWA, 'node_modules') }
  });
  const ms = Date.now() - inicio;
  const saida = ((r.stdout || '') + (r.stderr || '')).trim();
  const passou = r.status === 0;
  const motivo = passou ? '' : (saida.split('\n').find(l => /Error|assert|at /.test(l)) || saida.split('\n').pop() || 'falha sem saida').trim();
  resultados.push({ arquivo, passou, ms, motivo, saida });
  const icone = passou ? 'PASSA' : 'FALHA';
  console.log(icone.padEnd(6) + arquivo.padEnd(36) + String(ms).padStart(6) + ' ms' + (passou ? '' : '  -> ' + motivo.slice(0, 120)));
}

const naoAplicaveis = resultados.filter(r => r.naoAplicavel).length;
const passaram = resultados.filter(r => r.passou && !r.naoAplicavel).length;
const falharam = resultados.filter(r => !r.passou).length;
const total = resultados.reduce((soma, r) => soma + r.ms, 0);

console.log('');
console.log('==================================================');
console.log(' PASSOU: ' + passaram + ' | FALHOU: ' + falharam + ' | N/A: ' + naoAplicaveis + ' | TOTAL: ' + resultados.length);
console.log(' tempo total: ' + (total / 1000).toFixed(1) + ' s');
console.log('==================================================');

const docs = path.join(RAIZ_PWA, 'docs');
fs.mkdirSync(docs, { recursive: true });
const json = {
  geradoEm: new Date().toISOString(),
  projetoTestado: RAIZ,
  total: resultados.length, passaram, falharam, naoAplicaveis,
  tempoTotalMs: total,
  resultados: resultados.map(({ saida, ...resto }) => resto),
  falhas: resultados.filter(r => !r.passou).map(r => ({ arquivo: r.arquivo, motivo: r.motivo, saida: r.saida.slice(-1500) }))
};
fs.writeFileSync(path.join(docs, PREFIXO.toLowerCase() + '.json'), JSON.stringify(json, null, 2) + '\n');

const md = [
  '# Relatório da suíte de testes',
  '',
  '> Gerado por `node tests/run-all.cjs` em ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '.',
  '> Projeto testado: `' + RAIZ + '`',
  '',
  '**PASSOU: ' + passaram + ' / ' + resultados.length + '** · FALHOU: ' + falharam + ' · tempo: ' + (total / 1000).toFixed(1) + ' s',
  '',
  '| Teste | Resultado | Tempo |',
  '| --- | --- | --- |',
  ...resultados.map(r => '| `' + r.arquivo + '` | ' + (r.naoAplicavel ? '➖ n/a — ' + r.naoAplicavel.slice(0, 80) : (r.passou ? '✅' : '❌ ' + r.motivo.slice(0, 90))) + ' | ' + r.ms + ' ms |'),
  ''
];
fs.writeFileSync(path.join(docs, PREFIXO + '.md'), md.join('\n') + '\n');

if (falharam) {
  console.log('');
  console.log('--- detalhes das falhas ---');
  resultados.filter(r => !r.passou).forEach(r => {
    console.log('');
    console.log('### ' + r.arquivo);
    console.log(r.saida.split('\n').slice(0, 12).join('\n'));
  });
}

process.exit(falharam ? 1 : 0);
