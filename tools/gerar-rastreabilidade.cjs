#!/usr/bin/env node
/**
 * Gera docs/INVENTARIO-REGRAS.md (unidades de comportamento do motor) e
 * docs/RASTREABILIDADE.md (regra -> fonte -> testes que cobrem -> status).
 *
 * Uso: node tools/gerar-rastreabilidade.cjs
 */
const fs = require('fs');
const path = require('path');
const inv = require('./inventario-regras.cjs');

const DOCS = path.join(inv.RAIZ_PWA, 'docs');
fs.mkdirSync(DOCS, { recursive: true });

// ------------------------------------------------------------------ testes
const arquivos = fs.readdirSync(inv.PASTA_TESTES)
  .filter(f => /^notes_.*\.cjs$/.test(f) || f === 'test_notes_editor_ui.cjs')
  .sort();
const testes = arquivos.map(nome => ({ nome, origem: 'original', texto: inv.ler(path.join(inv.PASTA_TESTES, nome)) }));
// A matriz considera tambem os testes proprios do PWA (paridade, atalhos, etc.).
const pastaPWA = path.join(inv.RAIZ_PWA, 'tests');
const testesPWA = fs.existsSync(pastaPWA)
  ? fs.readdirSync(pastaPWA).filter(f => f.endsWith('.cjs') && f !== 'run-all.cjs').sort()
  : [];
testesPWA.forEach(nome => testes.push({ nome, origem: 'pwa', texto: inv.ler(path.join(pastaPWA, nome)) }));
const cobrem = termo => testes.filter(t => t.texto.includes(termo))
  .map(t => (t.origem === 'pwa' ? t.nome.replace(/\.cjs$/, '') + ' (novo)' : t.nome.replace(/\.cjs$/, '')));
const atalhosExercitados = inv.unicos(testes.flatMap(t => inv.capturar(t.texto, /press\('([^']+)'\)/g)));
const comandosExercitados = inv.unicos(testes.flatMap(t => inv.capturar(t.texto, /(?:data-command=|executeNotesCommand\(')([a-zA-Z0-9_]+)/g)));
const regrasOk = testes.flatMap(t => inv.capturar(t.texto, /console\.log\('OK: ([^']*)'\)/g).map(r => ({ teste: t.nome.replace(/\.cjs$/, ''), regra: r })));

// combinacoes de atalho declaradas no handler (modificador + tecla)
const editorTxt = inv.editor;
const mapaCtrlAlt = inv.capturar(editorTxt, /const commands=\{([^}]+)\}/g)
  .flatMap(grupo => inv.capturar(grupo, /'([0-9])'\s*:\s*'([a-zA-Z0-9_]+)'/g));
const combos = [
  ['Ctrl/Cmd+Z', 'undo'], ['Ctrl/Cmd+Shift+Z', 'redo'], ['Ctrl/Cmd+Y', 'redo'],
  ['Ctrl/Cmd+S', 'salvar'], ['Ctrl/Cmd+B', 'bold'], ['Ctrl/Cmd+I', 'italic'],
  ['Tab', 'indent'], ['Shift+Tab', 'outdent'],
  ['Alt+ArrowUp', 'moveUp'], ['Alt+ArrowDown', 'moveDown'],
  ['Ctrl+Alt+1', 'heading1'], ['Ctrl+Alt+2', 'heading2'], ['Ctrl+Alt+3', 'heading3'],
  ['Ctrl+Alt+4', 'checklist'], ['Ctrl+Alt+5', 'insertOrderedList'], ['Ctrl+Alt+6', 'insertUnorderedList'],
  ['Ctrl+Alt+7', 'strikeThrough'], ['Ctrl+U', 'underline'], ['Ctrl+Alt+8', 'picker color'], ['Ctrl+Alt+9', 'picker backgroundColor'],
  ['Ctrl+Alt+0', 'toggleNotesFullscreen'], ['Ctrl+Alt+T', 'toggleNotesHeaderCollapse'], ['Ctrl+Alt+L', 'animateNotesLineCollapse'],
  ['Ctrl+Shift+I', 'notesInsertMenu'], ['Ctrl+Shift+H', 'notesDivider'], ['Ctrl+K', 'notesLinkDialog'],
  ['Ctrl+Alt+M', 'notesTemplates'], ['Ctrl+Alt+Q', 'notesTableDialog']
];
const pressEquivalente = {
  'Ctrl/Cmd+Z': 'Control+z', 'Ctrl/Cmd+Shift+Z': 'Control+Shift+z', 'Ctrl/Cmd+Y': 'Control+y',
  'Ctrl/Cmd+S': 'Control+s', 'Ctrl/Cmd+B': 'Control+b', 'Ctrl/Cmd+I': 'Control+i',
  'Alt+ArrowUp': 'Alt+ArrowUp', 'Alt+ArrowDown': 'Alt+ArrowDown',
  'Ctrl+Shift+I': 'Control+Shift+I', 'Ctrl+Shift+H': 'Control+Shift+H', 'Ctrl+K': 'Control+k',
  'Ctrl+Alt+Q': 'Control+Alt+q', 'Ctrl+Alt+M': 'Control+Alt+m'
};
const coberturaAtalho = ([combo]) => {
  const press = pressEquivalente[combo];
  if (press && atalhosExercitados.includes(press)) return 'exercitado via press(' + press + ')';
  const texto = combo.replace('Ctrl/Cmd+', 'Control+').replace('Ctrl+', 'Control+').replace('Alt+', 'Alt+');
  const citado = testes.filter(t => t.texto.includes(combo) || t.texto.includes(texto)).map(t => t.nome.replace(/\.cjs$/, ''));
  return citado.length ? 'citado em ' + citado.join(', ') : '*** SEM TESTE ***';
};

module.exports = { DOCS, testes, testesPWA, cobrem, atalhosExercitados, comandosExercitados, regrasOk, combos, coberturaAtalho, mapaCtrlAlt };

if (require.main === module) {
  const m = module.exports;
  const hoje = new Date().toISOString().slice(0, 10);
  const motorResumo = inv.motor.map(f => '`' + f.nome + '`: ' + f.linhas + ' linhas / ' + f.bytes + ' bytes').join(' · ');
  const linha = (...colunas) => '| ' + colunas.join(' | ') + ' |';
  const listaMd = itens => (itens.length ? itens.join(', ') : '—');

  // ---------------------------------------------------------------- inventario
  const md = [];
  md.push('# Inventário de regras do motor de notas');
  md.push('');
  md.push('> Gerado por `node tools/gerar-rastreabilidade.cjs` em ' + hoje + '.');
  md.push('> O motor do PWA partia do **byte a byte idêntico** ao do `produtividade-ferrramenta`,');
  md.push('> mas a **Revisão do bloco de notas** fez mudanças deliberadas e documentadas em');
  md.push('> `notes/editor.js`/`notes/extras.js`: teto de 4 níveis de indentação, sublinhado (`underline`/`Ctrl+U`),');
  md.push('> retorno do check à posição original e fluxo do Enter em listas/títulos recolhidos.');
  md.push('> Ver `docs/PROBLEMAS-E-MITIGACOES.md` (P23–P28).');
  md.push('');
  md.push('## Resumo');
  md.push('');
  md.push(linha('Categoria', 'Quantidade'));
  md.push(linha('---', '---'));
  md.push(linha('Arquivos do motor', String(inv.motor.length)));
  md.push(linha('Métodos públicos (`p.x`)', String(inv.metodos.length)));
  md.push(linha('Funções internas', String(inv.funcoesInternas.length)));
  md.push(linha('Comandos', String(inv.comandos.length)));
  md.push(linha('Atalhos (combinações mapeadas)', String(m.combos.length)));
  md.push(linha('Teclas tratadas', String(inv.unicos([...inv.teclas, ...inv.teclasLista]).length)));
  md.push(linha('Eventos escutados', String(inv.eventos.length)));
  md.push(linha('Atributos `dataset.*`', String(inv.atributos.length)));
  md.push(linha('Seletores de atributo no CSS', String(inv.attrsCss.length)));
  md.push(linha('Regras de domínio (`NotesDocument`)', String(inv.modelo.length)));
  md.push(linha('Arquivos de teste do original', String(m.testes.length)));
  md.push('');
  md.push('Motor: ' + motorResumo);
  md.push('');
  const bloco = (titulo, itens) => {
    md.push('## ' + titulo + ' (' + itens.length + ')');
    md.push('');
    md.push('```');
    itens.forEach((item, i) => md.push(String(i + 1).padStart(3, ' ') + '. ' + item));
    md.push('```');
    md.push('');
  };
  bloco('Comandos', inv.comandos);
  bloco('Atalhos mapeados', m.combos.map(c => c[0] + '  ->  ' + c[1]));
  bloco('Teclas tratadas', inv.unicos([...inv.teclas, ...inv.teclasLista]));
  bloco('Eventos escutados', inv.eventos);
  bloco('Atributos dataset', inv.atributos);
  bloco('Seletores de atributo no CSS', inv.attrsCss.map(a => '[data-' + a + ']'));
  bloco('Métodos públicos do motor', inv.metodos);
  bloco('Regras de domínio (NotesDocument)', inv.modelo);
  bloco('Propriedades de estado (props)', inv.propsModelo);
  fs.writeFileSync(path.join(m.DOCS, 'INVENTARIO-REGRAS.md'), md.join('\n') + '\n');
  console.log('docs/INVENTARIO-REGRAS.md gerado');

  // ----------------------------------------------------------- rastreabilidade
  const rt = [];
  rt.push('# Matriz de rastreabilidade — regra → teste');
  rt.push('');
  rt.push('> Gerado por `node tools/gerar-rastreabilidade.cjs` em ' + hoje + '.');
  rt.push('> ✅ = existe teste que exercita a regra · ❌ = lacuna a cobrir (Fase 4).');
  rt.push('');
  const json = { geradoEm: hoje, comandos: [], atalhos: [], metodos: [], eventos: [], atributos: [], regrasOk: m.regrasOk };
  const tabela = (titulo, itens, extrair) => {
    rt.push('## ' + titulo);
    rt.push('');
    rt.push(linha('Regra', 'Testes que cobrem', 'Status'));
    rt.push(linha('---', '---', '---'));
    itens.forEach(item => {
      const { regra, cobertura } = extrair(item);
      rt.push(linha(regra, cobertura || '—', cobertura ? '✅' : '❌'));
    });
    rt.push('');
  };
  tabela('Comandos', inv.comandos, nome => {
    const encontrados = m.cobrem(nome);
    json.comandos.push({ regra: nome, testes: encontrados, coberto: encontrados.length > 0 });
    return { regra: '`' + nome + '`', cobertura: encontrados.length ? listaMd(encontrados) : '' };
  });
  tabela('Atalhos', m.combos, combo => {
    const cobertura = m.coberturaAtalho(combo);
    const semTeste = cobertura.startsWith('***');
    json.atalhos.push({ regra: combo[0], acao: combo[1], cobertura, coberto: !semTeste });
    return { regra: '`' + combo[0] + '` → ' + combo[1], cobertura: semTeste ? '' : cobertura };
  });
  tabela('Métodos públicos do motor', inv.metodos, nome => {
    const encontrados = m.cobrem(nome);
    json.metodos.push({ regra: nome, testes: encontrados, coberto: encontrados.length > 0 });
    return { regra: '`' + nome + '`', cobertura: listaMd(encontrados) };
  });
  tabela('Eventos escutados', inv.eventos, nome => {
    const encontrados = m.cobrem("addEventListener('" + nome + "'");
    json.eventos.push({ regra: nome, testes: encontrados, coberto: encontrados.length > 0 });
    return { regra: '`' + nome + '`', cobertura: listaMd(encontrados) };
  });
  tabela('Atributos dataset', inv.atributos, nome => {
    const encontrados = m.cobrem(nome);
    json.atributos.push({ regra: nome, testes: encontrados, coberto: encontrados.length > 0 });
    return { regra: '`' + nome + '`', cobertura: listaMd(encontrados) };
  });
  rt.push('## Regras declaradas pelos próprios testes (`console.log(\'OK: ...\')`)');
  rt.push('');
  m.regrasOk.forEach(r => rt.push('- **' + r.teste + '** — ' + r.regra));
  rt.push('');
  const lacunas = {
    comandos: json.comandos.filter(x => !x.coberto).map(x => x.regra),
    atalhos: json.atalhos.filter(x => !x.coberto).map(x => x.regra),
    metodos: json.metodos.filter(x => !x.coberto).map(x => x.regra),
    eventos: json.eventos.filter(x => !x.coberto).map(x => x.regra),
    atributos: json.atributos.filter(x => !x.coberto).map(x => x.regra)
  };
  rt.push('## Lacunas (sem teste) — a cobrir na Fase 4');
  rt.push('');
  rt.push(linha('Categoria', 'Lacunas', 'Itens'));
  rt.push(linha('---', '---', '---'));
  Object.entries(lacunas).forEach(([categoria, itens]) => {
    rt.push(linha(categoria, String(itens.length), listaMd(itens.map(i => '`' + i + '`'))));
  });
  rt.push('');
  json.lacunas = lacunas;
  fs.writeFileSync(path.join(m.DOCS, 'RASTREABILIDADE.md'), rt.join('\n') + '\n');
  fs.writeFileSync(path.join(m.DOCS, 'rastreabilidade.json'), JSON.stringify(json, null, 2) + '\n');
  console.log('docs/RASTREABILIDADE.md gerado');
  console.log('docs/rastreabilidade.json gerado');
  Object.entries(lacunas).forEach(([categoria, itens]) => console.log(categoria + ': ' + (json[categoria].length) + ' regras, ' + itens.length + ' lacunas'));
  console.log('testes na origem: ' + m.testes.length + ' | testes ja no PWA: ' + m.testesPWA.length);
}
