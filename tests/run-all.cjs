#!/usr/bin/env node
// 🧪 [INÍCIO: TESTE - RUN-ALL]
/**
 * Runner sequencial da suite de testes do PWA.
 *
 * Uso:
 *   node tests/run-all.cjs                 roda tudo (PWA)
 *   node tests/run-all.cjs --filter=notes_ roda so os que casam com o padrao
 *   node tests/run-all.cjs --baseline      roda tudo e so falha se houver FALHA NOVA
 *   node tests/run-all.cjs --retry=1       repete 1x um teste que falhou (timeout transitorio)
 *   node tests/run-all.cjs --dir=DIR       roda a suite de outro projeto (ex.: o original)
 *   node tests/run-all.cjs --prefixo=nome  prefixo dos arquivos de relatorio
 *   node tests/run-all.cjs --timeout=180000
 *
 * Gera docs/RELATORIO-TESTES.md e docs/relatorio-testes.json (ou com o prefixo).
 *
 * EFICIENCIA: cada teste abre o proprio navegador e a suite completa leva minutos.
 * Para o dia a dia rode o ARQUIVO do que voce mexeu: `node tests/<arquivo>.cjs`.
 * Guia completo em docs/COMO-RODAR-TESTES.md.
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
const retryArg = Math.max(0, Number(arg('retry')) || 0);
const usarBaseline = process.argv.includes('--baseline');
const nodePathExtra = process.env.NODE_PATH || '';

const arquivos = fs.readdirSync(TESTS)
  .filter(f => f.endsWith('.cjs'))
  .filter(f => f !== 'run-all.cjs')
  .filter(f => !filtro || f.includes(filtro))
  .sort();

// Baseline: falhas ja conhecidas (lidas ANTES de sobrescrever o relatorio).
const caminhoRelatorio = path.join(RAIZ_PWA, 'docs', PREFIXO.toLowerCase() + '.json');
let falhasConhecidas = new Set();
if (usarBaseline) {
  try {
    const anterior = JSON.parse(fs.readFileSync(caminhoRelatorio, 'utf8'));
    falhasConhecidas = new Set((anterior.falhas || []).map(f => f.arquivo));
  } catch (_) {
    console.log('--baseline: nenhum relatorio anterior encontrado; todas as falhas serao tratadas como novas.');
  }
}

console.log('Suite: ' + arquivos.length + ' testes' + (filtro ? ' (filtro: ' + filtro + ')' : ''));
if (retryArg) console.log('retry: ate ' + retryArg + ' repeticao(oes) em caso de falha');
console.log('');

/** Roda um arquivo de teste uma vez (com os argumentos de fixture quando houver). */
const executar = (arquivo, argumentos) => {
  const inicio = Date.now();
  const r = spawnSync(process.execPath, [path.join(TESTS, arquivo), ...argumentos], {
    cwd: RAIZ, encoding: 'utf8', timeout: timeoutArg, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NODE_PATH: nodePathExtra || path.join(RAIZ_PWA, 'node_modules') }
  });
  const ms = Date.now() - inicio;
  const saida = ((r.stdout || '') + (r.stderr || '')).trim();
  const passou = r.status === 0;
  const motivo = passou ? '' : (saida.split('\n').find(l => /Error|assert|at /.test(l)) || saida.split('\n').pop() || 'falha sem saida').trim();
  return { passou, ms, saida, motivo };
};

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
  let r = executar(arquivo, argumentos);
  let tentativas = 1;
  while (!r.passou && tentativas <= retryArg) {
    tentativas++;
    console.log('retry'.padEnd(6) + arquivo.padEnd(36) + 'tentativa ' + tentativas + '...');
    r = executar(arquivo, argumentos);
  }
  resultados.push({ ...r, arquivo, tentativas });
  const icone = r.passou ? (tentativas > 1 ? 'PASSA*' : 'PASSA') : 'FALHA';
  console.log(icone.padEnd(6) + arquivo.padEnd(36) + String(r.ms).padStart(6) + ' ms' + (tentativas > 1 ? ' (retry ' + (tentativas - 1) + ')' : '') + (r.passou ? '' : '  -> ' + r.motivo.slice(0, 120)));
}

const naoAplicaveis = resultados.filter(r => r.naoAplicavel).length;
const passaram = resultados.filter(r => r.passou && !r.naoAplicavel).length;
const falharam = resultados.filter(r => !r.passou).length;
const flaky = resultados.filter(r => r.passou && r.tentativas > 1).length;
const total = resultados.reduce((soma, r) => soma + r.ms, 0);

const arquivosFalhando = resultados.filter(r => !r.passou).map(r => r.arquivo);
const falhasNovas = usarBaseline ? arquivosFalhando.filter(a => !falhasConhecidas.has(a)) : [];
// Sem filtro comparamos o conjunto inteiro; com --filter, so importam falhas novas.
const falhasResolvidas = usarBaseline && !filtro ? [...falhasConhecidas].filter(a => !arquivosFalhando.includes(a)) : [];

console.log('');
console.log('==================================================');
console.log(' PASSOU: ' + passaram + ' | FALHOU: ' + falharam + ' | N/A: ' + naoAplicaveis + ' | TOTAL: ' + resultados.length + (flaky ? ' | flaky: ' + flaky : ''));
console.log(' tempo total: ' + (total / 1000).toFixed(1) + ' s');
if (usarBaseline) {
  console.log(' falhas conhecidas: ' + (arquivosFalhando.length - falhasNovas.length) + ' | falhas NOVAS: ' + falhasNovas.length + ' | resolvidas: ' + falhasResolvidas.length);
  console.log(falhasNovas.length ? ' RESULTADO: REGRESSAO (' + falhasNovas.join(', ') + ')' : ' RESULTADO: SEM REGRESSOES (as falhas atuais ja existiam)');
}
console.log('==================================================');

const docs = path.join(RAIZ_PWA, 'docs');
fs.mkdirSync(docs, { recursive: true });
const json = {
  geradoEm: new Date().toISOString(),
  projetoTestado: RAIZ,
  total: resultados.length, passaram, falharam, naoAplicaveis, flaky,
  tempoTotalMs: total,
  falhasNovas, falhasResolvidas,
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
  '**PASSOU: ' + passaram + ' / ' + resultados.length + '** · FALHOU: ' + falharam + ' · flaky: ' + flaky + ' · tempo: ' + (total / 1000).toFixed(1) + ' s',
  '',
  ...(usarBaseline ? ['Falhas novas: **' + falhasNovas.length + '** · resolvidas: ' + falhasResolvidas.length + (falhasNovas.length ? ' (**REGRESSÃO**)' : ' (sem regressões)'), ''] : []),
  '| Teste | Resultado | Tempo |',
  '| --- | --- | --- |',
  ...resultados.map(r => '| `' + r.arquivo + '` | ' + (r.naoAplicavel ? '➖ n/a — ' + r.naoAplicavel.slice(0, 80) : (r.passou ? (r.tentativas > 1 ? '⚠️ passou com retry' : '✅') : '❌ ' + r.motivo.slice(0, 90))) + ' | ' + r.ms + ' ms |'),
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

// Com --baseline, o codigo de saida so reprova quando aparece falha NOVA.
process.exit(usarBaseline ? (falhasNovas.length ? 1 : 0) : (falharam ? 1 : 0));
// 🧪 [FIM: TESTE - RUN-ALL]
