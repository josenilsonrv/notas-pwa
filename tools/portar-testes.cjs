#!/usr/bin/env node
/**
 * Porta a suite de testes do projeto original (produtividade-ferrramenta/tests)
 * para o PWA, sem tocar nos asserts: apenas o bootstrap e os caminhos mudam.
 *
 * Uso:
 *   node tools/portar-testes.cjs            (porta e mostra o que mudou por arquivo)
 *   node tools/portar-testes.cjs --resumo   (so o resumo)
 *
 * Substituicoes aplicadas (todas documentadas no rodape do relatorio):
 *   1. caminhos `frontend/...` -> raiz do PWA
 *   2. entradas de `frontend/focus/sports.js|css` removidas (nao existem no PWA)
 *   3. `window.TestApp=NeuralCommandApp` -> `window.TestApp=NotesPWA`
 *   4. `app.ensureNotesFocusPage=...` (dashboard) -> no-op
 *   5. `app.setupAntiInspection()` -> chamada tolerante a ausencia
 */
const fs = require('fs');
const path = require('path');

const RAIZ_PWA = path.join(__dirname, '..');
const ORIGINAL = process.env.NOTAS_ORIGINAL
  || 'C:/Users/Usuario/OneDrive/Desktop/produtividade-ferrramenta';
const ORIGEM = path.join(ORIGINAL, 'tests');
const DESTINO = path.join(RAIZ_PWA, 'tests');
const resumo = process.argv.includes('--resumo');

const SUBSTITUICOES = [
  { desc: 'entrada focus/sports.js removida', de: /'frontend\/focus\/sports\.js',?\s*/g, para: '' },
  { desc: 'entrada focus/sports.css removida', de: /'frontend\/focus\/sports\.css',?\s*/g, para: '' },
  { desc: 'caminhos ../frontend/* -> ../', de: /(['"\u0060])\.\.\/frontend\//g, para: '$1../' },
  { desc: 'caminhos frontend/* -> raiz', de: /(['"\u0060])frontend\//g, para: '$1' },
  { desc: 'TestApp = NotesPWA', de: /window\.TestApp\s*=\s*NeuralCommandApp\s*;/g, para: 'window.TestApp = NotesPWA;' },
  { desc: 'ensureNotesFocusPage -> no-op', de: /app\.ensureNotesFocusPage\s*=\s*\(\)\s*=>\s*\{[^}]*\}\s*;/g, para: 'app.ensureNotesFocusPage = () => {};' },
  { desc: 'setupAntiInspection tolerante', de: /app\.setupAntiInspection\s*\(\s*\)\s*;/g, para: 'if (app.setupAntiInspection) app.setupAntiInspection();' },
  {
    desc: 'motor instalado no prototipo (como o init do app faz)',
    de: /app\.setupModalListeners\(\);/g,
    para: 'if (!TestApp.prototype.__motorInstalado) {'
      + ' installNotesEditor(TestApp);'
      + ' if (typeof installNotesExtras === \'function\') installNotesExtras(TestApp);'
      + ' if (typeof installNotesTables === \'function\') installNotesTables(TestApp);'
      + ' if (typeof installLocalNotesStorage === \'function\') installLocalNotesStorage(TestApp);'
      + ' TestApp.prototype.__motorInstalado = true; }'
      + ' if (app.setupEventListeners) app.setupEventListeners();'
      + ' app.setupModalListeners();'
  }
];

fs.mkdirSync(DESTINO, { recursive: true });
const arquivos = fs.readdirSync(ORIGEM)
  .filter(f => /^notes_.*\.cjs$/.test(f) || f === 'test_notes_editor_ui.cjs')
  .sort();

let portados = 0;
for (const arquivo of arquivos) {
  const original = fs.readFileSync(path.join(ORIGEM, arquivo), 'utf8');
  let texto = original;
  const aplicadas = [];
  for (const regra of SUBSTITUICOES) {
    const antes = texto;
    texto = texto.replace(regra.de, regra.para);
    if (texto !== antes) aplicadas.push(regra.desc);
  }
  const cabecalho = [
    '/*',
    ' * Portado automaticamente de produtividade-ferrramenta/tests/' + arquivo + ' por tools/portar-testes.cjs.',
    ' * Os asserts sao identicos aos do projeto original; apenas o bootstrap e os caminhos foram adaptados.',
    aplicadas.length ? ' * Adaptacoes: ' + aplicadas.join('; ') : ' * Adaptacoes: nenhuma',
    ' */',
    ''
  ].join('\n');
  fs.writeFileSync(path.join(DESTINO, arquivo), cabecalho + texto);
  portados++;
  if (!resumo) console.log(arquivo.padEnd(36) + (aplicadas.length ? aplicadas.join(' | ') : '(caminhos apenas)'));
}

console.log('');
console.log('testes portados: ' + portados);
console.log('origem : ' + ORIGEM);
console.log('destino: ' + DESTINO);
