#!/usr/bin/env node
// 🧪 [INÍCIO: SCRIPT - COMPARAR-SUITES]
/**
 * Compara o resultado da suite rodada no PWA com o resultado da MESMA suite
 * rodada no projeto original, classificando cada teste:
 *
 *   OK              -> passa nos dois (replica fiel)
 *   ORIGEM-QUEBRADA -> falha nos dois (o teste esta desatualizado na origem)
 *   DIVERGENCIA     -> passa na origem e falha no PWA (bug real a corrigir)
 *   PWA-MELHOR      -> passa no PWA e falha na origem (investigar)
 *
 * Uso: node tools/comparar-suites.cjs
 * Le docs/relatorio-testes.json (PWA) e docs/relatorio-origem.json (origem).
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DOCS = path.join(RAIZ, 'docs');
const PWA = path.join(DOCS, 'relatorio-testes.json');
const ORIGEM = path.join(DOCS, 'relatorio-origem.json');

const lerJson = arquivo => {
  if (!fs.existsSync(arquivo)) {
    console.error('arquivo ausente: ' + path.relative(RAIZ, arquivo));
    console.error('rode primeiro: node tests/run-all.cjs --prefixo=RELATORIO-TESTES');
    console.error('e depois:      node tests/run-all.cjs --dir="<projeto original>" --prefixo=RELATORIO-ORIGEM');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
};

const pwa = lerJson(PWA);
const origem = lerJson(ORIGEM);
const doPWA = new Map(pwa.resultados.map(r => [r.arquivo, r]));
const daOrigem = new Map(origem.resultados.map(r => [r.arquivo, r]));

/**
 * Testes que nao se aplicam ao PWA (mesma lista do runner). Sao classificados
 * como N/A-justificado e nunca como divergencia.
 */
const NAO_APLICAVEIS = {
  'notes_requested_fixes.cjs': 'exercita telas do dashboard de foco, inexistentes no PWA standalone'
};

/**
 * Divergencias CONHECIDAS e aceitas: o PWA difere por uma decisao de arquitetura
 * (standalone, sem backend), nao por defeito. Cada uma precisa de motivo escrito.
 */
const DIVERGENCIAS_ACEITAS = {
  'notes_extras.cjs': 'valida o visualizador de paginas de arquivo servido pelo backend (/api/note-assets); no PWA os anexos viram data URL e o visualizador e local (decisao do projeto).',
  'notes_regression_audit.cjs': 'todos os asserts passam, exceto o do overflow do <html>: no PWA o modal E a tela principal e permanece ativo, enquanto no original fecha-lo libera o overflow.'
};

const classificar = (() => {
  const linhas = [];
  for (const arquivo of [...new Set([...doPWA.keys(), ...daOrigem.keys()])].sort()) {
    const p = doPWA.get(arquivo);
    const o = daOrigem.get(arquivo);
    let status;
    if (NAO_APLICAVEIS[arquivo]) status = 'N/A-JUSTIFICADO';
    else if (DIVERGENCIAS_ACEITAS[arquivo] && p && !p.passou) status = 'DIVERGENCIA-ACEITA';
    else if (p?.passou && o?.passou) status = 'OK';
    else if (p && o && !p.passou && !o.passou) status = 'ORIGEM-QUEBRADA';
    else if (p && o && !p.passou && o.passou) status = 'DIVERGENCIA';
    else if (p && o && p.passou && !o.passou) status = 'PWA-MELHOR';
    else status = 'SO-EM-UM-LADO';
    linhas.push({ arquivo, pwa: p ? (p.passou ? 'passa' : 'falha') : 'ausente', origem: o ? (o.passou ? 'passa' : 'falha') : 'ausente', status });
  }
  return linhas;
})();

const contagem = classificar.reduce((acc, linha) => {
  acc[linha.status] = (acc[linha.status] || 0) + 1;
  return acc;
}, {});

const md = [
  '# Relatório comparativo das suítes (PWA × projeto original)',
  '',
  '> Gerado por `node tools/comparar-suites.cjs` em ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '.',
  '> A MESMA suíte é executada nos dois projetos; a origem serve de referência.',
  '',
  '| Classificação | Quantidade |',
  '| --- | --- |',
  ...Object.entries(contagem).map(([k, v]) => '| ' + k + ' | ' + v + ' |'),
  '',
  '| Teste | PWA | Origem | Classificação |',
  '| --- | --- | --- | --- |',
  ...classificar.map(l => '| `' + l.arquivo + '` | ' + l.pwa + ' | ' + l.origem + ' | ' + l.status + ' |'),
  '',
  '## Legenda',
  '- **OK**: passa nos dois — replica fiel.',
  '- **ORIGEM-QUEBRADA**: falha nos dois — o teste está desatualizado na origem (o comportamento do motor mudou e o teste não).',
  '- **DIVERGENCIA**: passa na origem e falha no PWA — bug real a corrigir no PWA.',
  '- **PWA-MELHOR**: passa no PWA e falha na origem — investigar se o PWA alterou comportamento.',
  '- **N/A-JUSTIFICADO / DIVERGENCIA-ACEITA**: diferenças assumidas por decisão de arquitetura, com motivo escrito abaixo.',
  '',
  '## N/A e divergências aceitas (com justificativa)',
  ''
];
Object.entries({ ...NAO_APLICAVEIS, ...DIVERGENCIAS_ACEITAS }).forEach(([arquivo, motivo]) => {
  md.push('- `' + arquivo + '` — ' + motivo);
});
md.push('');
fs.writeFileSync(path.join(DOCS, 'RELATORIO-COMPARATIVO.md'), md.join('\n') + '\n');
fs.writeFileSync(path.join(DOCS, 'comparativo.json'), JSON.stringify({ geradoEm: new Date().toISOString(), contagem, classificar }, null, 2) + '\n');

console.log('PWA    : ' + pwa.passaram + '/' + pwa.total + ' passando');
console.log('Origem : ' + origem.passaram + '/' + origem.total + ' passando');
Object.entries(contagem).forEach(([status, quantidade]) => console.log('  ' + status.padEnd(18) + quantidade));
const divergencias = classificar.filter(l => l.status === 'DIVERGENCIA');
if (divergencias.length) {
  console.log('');
  console.log('Divergencias reais do PWA (a corrigir):');
  divergencias.forEach(l => console.log('  - ' + l.arquivo));
}
console.log('');
console.log('relatorio: docs/RELATORIO-COMPARATIVO.md');
// 🧪 [FIM: SCRIPT - COMPARAR-SUITES]
