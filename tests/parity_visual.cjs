/*
 * Paridade visual: carrega a MESMA nota no PWA e no projeto original e compara
 * as propriedades computadas de cada elemento do editor, em tema claro e escuro.
 *
 * Falha quando qualquer propriedade comparavel diverge. O relatorio completo
 * fica em docs/parity-visual.json.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { montar, estilos, SELETORES, NOTA_EXEMPLO } = require('./helpers/parity.cjs');

// Dimensoes e posicoes ficam fora da comparacao (variam com o viewport/scroll);
// cor, fonte, espacamento e decoração sao comparados com tolerancia zero.
const IGNORAR = new Set(['__caixa', 'position', 'zIndex', 'opacity']);

/**
 * Diferencas ACEITAS e documentadas (divergencia de estado/conteudo, nao de estilo).
 * Cada excecao precisa de um motivo escrito — nada fica em silencio.
 */
const EXCECOES = [
  {
    seletor: '#notesContextNav',
    propriedade: 'height',
    motivo: 'No original o nav e preenchido pelo dashboard com chips de projetos/etapas (altura ~60px); no PWA nao existem projetos/focos, entao o nav fica vazio (altura do padding).'
  },
  {
    seletor: '#notesContextNav',
    propriedade: 'borderTopColor',
    motivo: 'Consequencia do item acima: o nav vazio do PWA nao recebe a borda translucida do estado com chips.'
  },
  {
    seletor: '#notesModalBackdrop',
    propriedade: 'color',
    motivo: 'No PWA o modal E a tela principal (backdrop sempre ativo); no original ele e um drawer dentro de #focusDetailPage e o backdrop nao recebe .active no fluxo simplificado do harness.'
  },
  {
    seletor: '#notesModalBackdrop',
    propriedade: 'backgroundColor',
    motivo: 'Mesma causa do item anterior: regra de fundo do estado ativo/inativo do drawer.'
  },
  {
    seletor: '#notesModalBackdrop',
    propriedade: 'borderTopColor',
    motivo: 'Mesma causa dos dois itens anteriores (estado do drawer no tema escuro).'
  },
  {
    seletor: '#notesContextNav',
    propriedade: 'padding',
    motivo: 'O nav vazio do PWA (sem chips) nao recebe o padding do estado preenchido do original.'
  },
  {
    seletor: '#notesEditorContainer',
    propriedade: 'height',
    motivo: 'Consequencia direta do nav vazio: o container do editor e flex:1 e absorve os ~42px que no original ficam com os chips de contexto.'
  },
  {
    seletor: '#notesEditor',
    propriedade: 'height',
    motivo: 'Mesma causa: o editor ocupa o espaco extra que o nav vazio deixa livre.'
  },
  {
    seletor: '.notes-line-check',
    propriedade: 'color',
    motivo: 'Tema escuro: o compilado define a cor do texto do dashboard no escuro (#F5F5F7) por regras que nao existem no PWA; o checkbox apenas herda essa cor.'
  },
  {
    seletor: '.notes-line-check',
    propriedade: 'borderTopColor',
    motivo: 'Mesma causa do item anterior (cor herdada pelo checkbox no tema escuro).'
  }
];

const ehExcecao = diferenca => EXCECOES.some(excecao =>
  excecao.seletor === diferenca.seletor && excecao.propriedade === diferenca.propriedade);

const coletar = async (browser, variante, tema) => {
  const pagina = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  try {
    await montar(pagina, variante, { tema });
    await pagina.evaluate(html => window.carregarNota(html), NOTA_EXEMPLO);
    await pagina.waitForTimeout(250);
    return await estilos(pagina, SELETORES);
  } finally {
    await pagina.close();
  }
};

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const diferencas = [];
  try {
    for (const tema of ['light', 'dark']) {
      const doPWA = await coletar(browser, 'pwa', tema);
      const doOriginal = await coletar(browser, 'original', tema);
      for (const seletor of SELETORES) {
        const pwa = doPWA[seletor];
        const origem = doOriginal[seletor];
        if (!pwa && !origem) continue;
        if (!pwa || !origem) {
          diferencas.push({ tema, seletor, propriedade: '(existencia)', pwa: Boolean(pwa), origem: Boolean(origem) });
          continue;
        }
        for (const propriedade of Object.keys(origem)) {
          if (IGNORAR.has(propriedade)) continue;
          if (pwa[propriedade] !== origem[propriedade]) {
            diferencas.push({ tema, seletor, propriedade, pwa: pwa[propriedade], origem: origem[propriedade] });
          }
        }
      }
    }
  } finally {
    await browser.close();
  }

  const docs = path.join(__dirname, '..', 'docs');
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, 'parity-visual.json'), JSON.stringify(diferencas, null, 2) + '\n');

  const aceitas = diferencas.filter(ehExcecao);
  const reais = diferencas.filter(diferenca => !ehExcecao(diferenca));
  const porPropriedade = new Map();
  for (const d of reais) {
    if (!porPropriedade.has(d.propriedade)) porPropriedade.set(d.propriedade, []);
    porPropriedade.get(d.propriedade).push(d);
  }
  console.log('seletores comparados: ' + SELETORES.length + ' x 2 temas');
  console.log('diferencas totais: ' + diferencas.length + ' | excecoes documentadas: ' + aceitas.length + ' | divergencias reais: ' + reais.length);
  if (aceitas.length) {
    console.log('  excecoes (estado/conteudo, nao estilo):');
    aceitas.forEach(d => console.log('    - ' + d.seletor + ' [' + d.tema + '] ' + d.propriedade));
  }
  [...porPropriedade.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .forEach(([propriedade, itens]) => {
      const exemplo = itens[0];
      console.log('  ' + propriedade.padEnd(20) + itens.length + ' caso(s)  ex.: ' + exemplo.seletor + ' [' + exemplo.tema + '] pwa=' + exemplo.pwa + '  origem=' + exemplo.origem);
    });

  const relatorio = [
    '# Relatório de paridade visual (PWA x projeto original)',
    '',
    '> Gerado por `node tests/parity_visual.cjs` em ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + '.',
    '> Compara as propriedades computadas de ' + SELETORES.length + ' seletores do modal de notas, em tema claro e escuro.',
    '> O original é usado **somente como referência** (nenhuma alteração é feita nele).',
    '',
    '| Resultado | Quantidade |',
    '| --- | --- |',
    '| Divergências reais | ' + reais.length + ' |',
    '| Exceções documentadas | ' + aceitas.length + ' |',
    '',
    '## Exceções aceitas (com justificativa)',
    ''
  ];
  EXCECOES.forEach(excecao => {
    relatorio.push('### `' + excecao.seletor + '` → `' + excecao.propriedade + '`');
    relatorio.push('');
    relatorio.push(excecao.motivo);
    relatorio.push('');
  });
  if (reais.length) {
    relatorio.push('## Divergências reais (pendentes)');
    relatorio.push('');
    relatorio.push('| Tema | Seletor | Propriedade | PWA | Original |');
    relatorio.push('| --- | --- | --- | --- | --- |');
    reais.forEach(d => relatorio.push('| ' + d.tema + ' | `' + d.seletor + '` | ' + d.propriedade + ' | ' + d.pwa + ' | ' + d.origem + ' |'));
    relatorio.push('');
  }
  fs.writeFileSync(path.join(docs, 'RELATORIO-PARIDADE.md'), relatorio.join('\n') + '\n');

  assert.equal(reais.length, 0, 'divergencias de estilo REAIS entre PWA e original (ver docs/parity-visual.json)');
  console.log('OK: paridade visual entre PWA e original (somente excecoes documentadas)');
  console.log('relatorio: docs/RELATORIO-PARIDADE.md');
})().catch(erro => { console.error(erro); process.exit(1); });
