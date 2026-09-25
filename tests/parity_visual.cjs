// 🧪 [INÍCIO: TESTE - PARITY VISUAL]
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
    motivo: 'No original o nav e preenchido pelo dashboard com chips de projetos/etapas; no PWA ele e preenchido com os chips das notas locais + botao "+". A altura acompanha quando o numero/tamanho dos chips e o mesmo, mas a excecao permanece porque o conteudo do nav pode diferir.'
  },
  {
    seletor: '#notesContextNav',
    propriedade: 'borderTopColor',
    motivo: 'O original aplica a borda translucida do estado "com chips" do dashboard; o nav do PWA (chips locais + "+") usa a borda base definida em notes/editor.css.'
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
    motivo: 'Tolerancia de layout do nav quando os chips do PWA (nomes de notas) e do original (projetos/etapas) tem larguras diferentes.'
  },
  {
    seletor: '#notesContextNav',
    propriedade: 'overflow',
    motivo: 'Revisao do bloco de notas: os chips passam a rolar na vertical a partir de ~2 linhas (o original so rola na horizontal).'
  },
  {
    seletor: '#notesContextNav',
    propriedade: 'backgroundColor',
    motivo: 'Revisao do bloco de notas: o conteiner (faixa/painel) atras dos chips foi removido de proposito, entao o nav fica transparente sobre o cabecalho. O original mantem a faixa branca.'
  },
  {
    seletor: '#notesEditorContainer',
    propriedade: 'height',
    motivo: 'Consequencia de eventual diferenca de altura do nav entre os chips locais do PWA e os chips de projeto/etapa do original.'
  },
  {
    seletor: '#notesEditor',
    propriedade: 'height',
    motivo: 'Mesma causa do item anterior: o editor e flex:1 e absorve a diferenca de altura do nav.'
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
  },
  {
    seletor: '#notesEditorContainer',
    propriedade: 'padding',
    motivo: 'Revisao do bloco de notas: recuo lateral esquerdo reduzido de proposito (0.6rem) para aproximar o conteudo da borda do campo. O original mantem 1.4rem.'
  },
  {
    seletor: '#notesEditor',
    propriedade: 'width',
    motivo: 'Consequencia direta da reducao do padding-left do container (item 14 da revisao): o editor fica ~13px mais largo. Nao e divergencia de estilo, e o efeito pedido.'
  },
  {
    seletor: '.notes-line',
    propriedade: 'width',
    motivo: 'Mesma causa do item anterior (largura herdada do editor mais largo).'
  },
  {
    seletor: '.notes-line-text',
    propriedade: 'width',
    motivo: 'Mesma causa dos itens anteriores (a area de texto acompanha a largura do editor).'
  },
  {
    seletor: '.notes-modal-header',
    propriedade: 'height',
    motivo: 'Padronizacao dos icones em 1.125rem (18px, o mesmo tamanho do <h1> "Notas"): os botoes do cabecalho ficam 2px mais baixos e o header acompanha. Efeito pedido.'
  },
  {
    seletor: '.toolbar-btn',
    propriedade: 'height',
    motivo: 'Consequencia direta da padronizacao dos icones em 1.125rem (18px): o botao de icone (usado no cabecalho e na barra) fica 2px mais baixo. Efeito pedido.'
  },
  {
    seletor: '.toolbar-btn',
    propriedade: 'width',
    motivo: 'Mesma causa da altura do .toolbar-btn: com o icone de 1.125rem (18px) o botao de icone fica 2px mais estreito. Efeito pedido.'
  },
  {
    seletor: '#notesToolbar',
    propriedade: 'height',
    motivo: 'Padronizacao dos icones em 1.125rem (18px): no harness de paridade a barra de Notas usa o overflow "..." do motor (sem a classe notes-toolbar-inline, aplicada so no app), entao icones um pouco maiores empurram mais itens para a gaveta e a barra fica mais alta. No app real a classe inline mantem UMA linha com rolagem (toolbar_pwa.cjs).'
  },
  {
    seletor: '.notes-modal-footer',
    propriedade: 'alignItems',
    motivo: 'Rodape mais baixo/discreto (item E/K): conteudo centralizado verticalmente (items-center) para caber na altura reduzida (2.25rem), igual ao rodape do Mapa.'
  },
  {
    seletor: '.notes-modal-footer',
    propriedade: 'padding',
    motivo: 'Rodape mais baixo/discreto (item E/K): padding vertical reduzido de 16px para 8px para igualar a altura do rodape do Mapa. Efeito pedido.'
  },
  {
    seletor: '#notesSaveStatus',
    propriedade: 'height',
    motivo: 'Consequencia do rodape mais baixo (min-height 2.25rem) e do texto padronizado em 12px: o status fica mais baixo que o original. Efeito pedido para igualar ao rodape do Mapa.'
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
// 🧪 [FIM: TESTE - PARITY VISUAL]
