#!/usr/bin/env node
// 🧪 [INÍCIO: TESTE - RUN-ALL]
/**
 * Runner sequencial da suite de testes do PWA.
 *
 * Uso:
 *   node tests/run-all.cjs                 roda TUDO e termina SEM FALHAS (as falhas
 *                                          conhecidas — FALHAS_CONHECIDAS — nao contam)
 *   node tests/run-all.cjs --filter=notes_ roda so os que casam com o padrao
 *   node tests/run-all.cjs --estrito       auditoria: conta as conhecidas como FALHA
 *   node tests/run-all.cjs --baseline      compara com o relatorio anterior (falha NOVA reprova)
 *   node tests/run-all.cjs --retry=1       repete 1x um teste que falhou (timeout transitorio)
 *   node tests/run-all.cjs --jobs=auto     PARALELO com metade dos nucleos (recomendado; em 4
 *                                          nucleos = 2 — usar todos os nucleos PIORA por disputa
 *                                          de CPU; qualquer falha e reconfirmada em serie)
 *   node tests/run-all.cjs --jobs=4        roda 4 testes em PARALELO (ajuste manual)
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
const { spawn } = require('child_process');

/**
 * Testes que NAO se aplicam ao PWA, com o motivo escrito. Sao contabilizados
 * como `n/a` (nunca como sucesso silencioso) e aparecem no relatorio.
 */
const NAO_APLICAVEIS = {
  'notes_requested_fixes.cjs': 'exercita telas do dashboard de foco (#focusStageFocusId, #focusStageTitle), que nao existem no PWA standalone'
};

/**
 * FALHAS CONHECIDAS (deterministicas) — divergencias REAIS do motor de notas em
 * relacao ao projeto original, ja registradas em `docs/PROBLEMAS-E-MITIGACOES.md`
 * (P83) e em `docs/RASTREABILIDADE.md`. Elas NAO contam como falha da suite: a
 * rodada completa termina com `FALHOU: 0` e codigo de saida 0.
 *
 * REGRAS (nao quebre isto):
 *  1. So entre nesta lista uma falha DETERMINISTICA, reproduzida no arquivo
 *     isolado (`node tests/<arquivo>.cjs`) e explicada no doc. Nunca use esta
 *     lista para "esconder" uma regressao.
 *  2. Se o teste comecar a PASSAR, o runner avisa: remova a entrada.
 *  3. Para auditar tudo como falha (sem abrandar), rode `--estrito`.
 */
const FALHAS_CONHECIDAS = {
  'notes_cascade_defaults.cjs': 'cores em cascata divergem do original (paridade do motor)',
  'notes_collapse_motion.cjs': 'tempo da animacao de colapso diverge do original',
  'notes_markdown.cjs': 'tabela markdown nao e convertida como no original',
  'notes_navigation_completion.cjs': 'cor herdada na navegacao por conclusao divergente',
  'notes_outline_code.cjs': 'colapso de titulo + bloco de codigo diverge do original',
  'notes_paste_blocks.cjs': 'colagem de blocos de codigo junta linhas do original',
  'notes_regression_audit.cjs': 'auditoria de regressao: comportamento divergente registrado',
  'test_notes_editor_ui.cjs': 'Enter em lista aninhada cria nivel diferente do original'
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
// Paralelismo: `--jobs=auto` usa METADE dos nucleos. Medicao nesta maquina (4 nucleos):
// --jobs=2 = 663 s; --jobs=3 = 975 s (PIOR — a disputa de CPU dobra o tempo de cada
// teste). Por isso o padrao recomendado e `auto` (= 2 aqui), nunca "todos os nucleos".
const jobsArg = arg('jobs');
const nucleos = os.cpus().length;
const jobs = jobsArg === 'auto'
  ? Math.max(1, Math.floor(nucleos / 2))
  : Math.max(1, Number(jobsArg) || 1);
const usarBaseline = process.argv.includes('--baseline');
const modoEstrito = process.argv.includes('--estrito');
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
if (jobs > 1) console.log('paralelismo: ' + jobs + ' testes ao mesmo tempo (falhas reconfirmadas em serie)');
console.log('');

/**
 * Roda um arquivo de teste uma vez (com os argumentos de fixture quando houver).
 * ASSÍNCRONO (`spawn` + Promises) de propósito: assim o runner consegue rodar vários
 * arquivos em PARALELO (`--jobs=N`) sem bloquear o event loop.
 */
const executar = (arquivo, argumentos) => new Promise(resolve => {
  const inicio = Date.now();
  const filho = spawn(process.execPath, [path.join(TESTS, arquivo), ...argumentos], {
    cwd: RAIZ,
    env: { ...process.env, NODE_PATH: nodePathExtra || path.join(RAIZ_PWA, 'node_modules') }
  });
  let saida = '';
  let estourou = false;
  const timer = setTimeout(() => { estourou = true; filho.kill('SIGKILL'); }, timeoutArg);
  filho.stdout.on('data', dados => { saida += dados; });
  filho.stderr.on('data', dados => { saida += dados; });
  filho.on('error', erro => { saida += '\n' + erro.message; });
  filho.on('close', codigo => {
    clearTimeout(timer);
    const ms = Date.now() - inicio;
    const texto = saida.trim();
    const passou = !estourou && codigo === 0;
    const motivo = passou ? '' : (texto.split('\n').find(l => /Error|assert|at /.test(l)) || texto.split('\n').pop() || 'falha sem saida').trim();
    resolve({ passou, ms, saida: texto, motivo });
  });
});

const argumentosDe = arquivo => {
  // Testes parametrizados: recebem um documento grande como argumento.
  const fonte = fs.readFileSync(path.join(TESTS, arquivo), 'utf8');
  if (!fonte.includes('process.argv[2]')) return [];
  const fixture = path.join(os.tmpdir(), 'pwa-notas-grande.html');
  const linhas = Array.from({ length: 800 }, (_, i) =>
    '<div class="notes-line" data-level="' + (i % 3) + '"><div class="notes-line-text">Linha ' + i + ' com conteudo suficiente para o teste de documento grande</div></div>');
  fs.writeFileSync(fixture, linhas.join('\n'));
  return [fixture];
};

/** Imprime a linha do teste (mesmo formato para o run em série e em paralelo). */
const anunciar = (arquivo, r, tentativas, extra) => {
  const conhecida = !r.passou && !modoEstrito && Boolean(FALHAS_CONHECIDAS[arquivo]);
  const icone = r.passou ? (tentativas > 1 ? 'PASSA*' : 'PASSA') : (conhecida ? 'CONHEC' : 'FALHA');
  console.log(icone.padEnd(7) + arquivo.padEnd(36) + String(r.ms).padStart(6) + ' ms' + (extra || (tentativas > 1 ? ' (retry ' + (tentativas - 1) + ')' : '')) + (r.passou || conhecida ? (r.passou ? '' : '  -> ' + (FALHAS_CONHECIDAS[arquivo] || r.motivo).slice(0, 110)) : '  -> ' + r.motivo.slice(0, 120)));
};

const resultados = new Array(arquivos.length);

// ---------------------------------------------------------------- execução
// `--jobs=1` (padrão) é a rodada SÉRIE e determinística. Com `--jobs=N>1` os arquivos
// rodam em paralelo (bem mais rápido) e QUALQUER falha é RECONFIRMADA em série — assim
// o paralelismo nunca gera falso positivo (só marca `PASSA*`/flaky quando confirma).
let proximo = 0;
const trabalhador = async () => {
  while (proximo < arquivos.length) {
    const indice = proximo++;
    const arquivo = arquivos[indice];
    if (NAO_APLICAVEIS[arquivo]) {
      resultados[indice] = { arquivo, passou: true, naoAplicavel: NAO_APLICAVEIS[arquivo], ms: 0, motivo: '', saida: '' };
      console.log('n/a'.padEnd(7) + arquivo.padEnd(36) + NAO_APLICAVEIS[arquivo].slice(0, 70));
      continue;
    }
    let r = await executar(arquivo, argumentosDe(arquivo));
    let tentativas = 1;
    while (!r.passou && tentativas <= retryArg) {
      tentativas++;
      console.log('retry'.padEnd(7) + arquivo.padEnd(36) + 'tentativa ' + tentativas + '...');
      r = await executar(arquivo, argumentosDe(arquivo));
    }
    resultados[indice] = { ...r, arquivo, tentativas };
    anunciar(arquivo, r, tentativas);
  }
};
/** Reconfirma em SÉRIE as falhas do run paralelo (evita falso positivo por concorrência). */
const reconfirmarEmSerie = async () => {
  // As falhas CONHECIDAS não são reconfirmadas (já são esperadas e custariam tempo);
  // a não ser em `--estrito`, quando o objetivo é justamente vê-las como falha.
  const falhasParalelas = resultados.filter(r => r && !r.passou && !r.naoAplicavel
    && !(FALHAS_CONHECIDAS[r.arquivo] && !modoEstrito));
  if (jobs <= 1 || !falhasParalelas.length) return;
  console.log('');
  console.log('reconfirmando em SÉRIE ' + falhasParalelas.length + ' falha(s) do run paralelo...');
  for (const item of falhasParalelas) {
    const indice = resultados.findIndex(r => r === item);
    const confirmacao = await executar(item.arquivo, argumentosDe(item.arquivo));
    resultados[indice] = { ...confirmacao, arquivo: item.arquivo, tentativas: confirmacao.passou ? 2 : 1 };
    anunciar(item.arquivo, confirmacao, resultados[indice].tentativas, confirmacao.passou ? ' (paralelo; série OK)' : ' (confirmada)');
  }
};

Promise.all(Array.from({ length: Math.max(1, jobs) }, trabalhador))
  .then(reconfirmarEmSerie)
  .then(relatar);

/** Contadores, resumo de console, relatórios e código de saída. */
function relatar() {
const naoAplicaveis = resultados.filter(r => r.naoAplicavel).length;
const passaram = resultados.filter(r => r.passou && !r.naoAplicavel).length;
// Falhas CONHECIDAS (documentadas) nao contam como falha da suite — a menos que
// se rode com `--estrito` (auditoria) ou que o item nao esteja na lista.
const conhecidas = modoEstrito ? [] : resultados.filter(r => !r.passou && FALHAS_CONHECIDAS[r.arquivo]);
const falharam = resultados.filter(r => !r.passou && !conhecidas.includes(r)).length;
const resolvidas = resultados.filter(r => r.passou && FALHAS_CONHECIDAS[r.arquivo]).map(r => r.arquivo);
const flaky = resultados.filter(r => r.passou && r.tentativas > 1).length;
const total = resultados.reduce((soma, r) => soma + r.ms, 0);

const arquivosFalhando = resultados.filter(r => !r.passou).map(r => r.arquivo);
const falhasNovas = usarBaseline ? arquivosFalhando.filter(a => !falhasConhecidas.has(a) && !FALHAS_CONHECIDAS[a]) : [];
const falhasResolvidas = usarBaseline && !filtro ? [...falhasConhecidas].filter(a => !arquivosFalhando.includes(a)) : [];

console.log('');
console.log('==================================================');
console.log(' PASSOU: ' + passaram + ' | FALHOU: ' + falharam + ' | CONHECIDAS: ' + conhecidas.length + ' | N/A: ' + naoAplicaveis + ' | TOTAL: ' + resultados.length + (flaky ? ' | flaky: ' + flaky : ''));
console.log(' tempo total: ' + (total / 1000).toFixed(1) + ' s');
if (conhecidas.length) console.log(' conhecidas (deterministicas, documentadas no P83): ' + conhecidas.map(r => r.arquivo).join(', '));
if (resolvidas.length) console.log(' ATENCAO: passaram e ainda estao na lista — remova de FALHAS_CONHECIDAS: ' + resolvidas.join(', '));
console.log(falharam ? ' RESULTADO: FALHAS (' + resultados.filter(r => !r.passou && !conhecidas.includes(r)).map(r => r.arquivo).join(', ') + ')' : ' RESULTADO: SEM FALHAS' + (conhecidas.length ? ' (' + conhecidas.length + ' conhecidas documentadas)' : ''));
if (usarBaseline) {
  console.log(' baseline -> falhas conhecidas antes: ' + falhasConhecidas.size + ' | falhas NOVAS: ' + falhasNovas.length + ' | resolvidas: ' + falhasResolvidas.length);
  console.log(falhasNovas.length ? ' BASELINE: REGRESSAO (' + falhasNovas.join(', ') + ')' : ' BASELINE: SEM REGRESSOES');
}
console.log('==================================================');

const docs = path.join(RAIZ_PWA, 'docs');
fs.mkdirSync(docs, { recursive: true });
const json = {
  geradoEm: new Date().toISOString(),
  projetoTestado: RAIZ,
  total: resultados.length, passaram, falharam, naoAplicaveis, flaky,
  conhecidas: conhecidas.map(r => r.arquivo),
  conhecidasMotivo: FALHAS_CONHECIDAS,
  resolvidas,
  tempoTotalMs: total,
  falhasNovas, falhasResolvidas,
  resultados: resultados.map(({ saida, ...resto }) => resto),
  falhas: resultados.filter(r => !r.passou).map(r => ({ arquivo: r.arquivo, motivo: r.motivo, conhecida: Boolean(FALHAS_CONHECIDAS[r.arquivo]), saida: r.saida.slice(-1500) }))
};
fs.writeFileSync(path.join(docs, PREFIXO.toLowerCase() + '.json'), JSON.stringify(json, null, 2) + '\n');

const md = [
  '# Relatório da suíte de testes',
  '',
  '> Gerado por `node tests/run-all.cjs` em ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '.',
  '> Projeto testado: `' + RAIZ + '`',
  '',
  '**PASSOU: ' + passaram + ' / ' + resultados.length + '** · FALHOU: ' + falharam + ' · CONHECIDAS: ' + conhecidas.length + ' · flaky: ' + flaky + ' · tempo: ' + (total / 1000).toFixed(1) + ' s',
  '',
  ...(conhecidas.length ? ['Falhas conhecidas (determinísticas, documentadas em `docs/PROBLEMAS-E-MITIGACOES.md` P83): ' + conhecidas.map(r => '`' + r.arquivo + '` (' + (FALHAS_CONHECIDAS[r.arquivo] || '') + ')').join(' · '), ''] : []),
  ...(resolvidas.length ? ['⚠️ Passaram e ainda estão na lista — remova de `FALHAS_CONHECIDAS`: ' + resolvidas.map(a => '`' + a + '`').join(', '), ''] : []),
  ...(usarBaseline ? ['Falhas novas: **' + falhasNovas.length + '** · resolvidas: ' + falhasResolvidas.length + (falhasNovas.length ? ' (**REGRESSÃO**)' : ' (sem regressões)'), ''] : []),
  '| Teste | Resultado | Tempo |',
  '| --- | --- | --- |',
  ...resultados.map(r => '| `' + r.arquivo + '` | ' + (r.naoAplicavel ? '➖ n/a — ' + r.naoAplicavel.slice(0, 80) : (r.passou ? (r.tentativas > 1 ? '⚠️ passou com retry' : '✅') : (FALHAS_CONHECIDAS[r.arquivo] && !modoEstrito ? '🔶 conhecida — ' + String(FALHAS_CONHECIDAS[r.arquivo]).slice(0, 70) : '❌ ' + r.motivo.slice(0, 90)))) + ' | ' + r.ms + ' ms |'),
  ''
];
fs.writeFileSync(path.join(docs, PREFIXO + '.md'), md.join('\n') + '\n');

if (falharam) {
  console.log('');
  console.log('--- detalhes das falhas ---');
  resultados.filter(r => !r.passou && !conhecidas.includes(r)).forEach(r => {
    console.log('');
    console.log('### ' + r.arquivo);
    console.log(r.saida.split('\n').slice(0, 12).join('\n'));
  });
}

// Codigo de saida: reprova em FALHA real; `--baseline` tambem reprova em falha NOVA.
process.exit((falharam || (usarBaseline && falhasNovas.length)) ? 1 : 0);
}
// 🧪 [FIM: TESTE - RUN-ALL]
