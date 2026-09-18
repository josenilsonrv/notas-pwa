#!/usr/bin/env node
/**
 * Inventario de regras do motor de notas + matriz de rastreabilidade.
 *
 * Le o motor do PWA (notes/*.js|css) e a suite do projeto original
 * (produtividade-ferrramenta/tests), extrai as unidades de comportamento e
 * gera:
 *   docs/INVENTARIO-REGRAS.md
 *   docs/RASTREABILIDADE.md
 *
 * Uso:
 *   node tools/inventario-regras.cjs
 *   node tools/inventario-regras.cjs --resumo   (so imprime os totais)
 *
 * O caminho do projeto original pode ser trocado com a variavel de ambiente
 * NOTAS_ORIGINAL.
 */
const fs = require('fs');
const path = require('path');

const RAIZ_PWA = path.join(__dirname, '..');
const ORIGINAL = process.env.NOTAS_ORIGINAL
  || 'C:/Users/Usuario/OneDrive/Desktop/produtividade-ferrramenta';
const MOTOR = ['editor.js', 'extras.js', 'tables.js', 'table-math.js'];
const CSS = ['editor.css', 'extras.css', 'tables.css'];
const HTML_PWA = path.join(RAIZ_PWA, 'index.html');
const HTML_ORIG = path.join(ORIGINAL, 'frontend', 'index.html');
const CSS_ORIG = path.join(ORIGINAL, 'frontend', 'styles.css');
const CSS_PWA = path.join(RAIZ_PWA, 'styles.css');
const PASTA_TESTES = path.join(ORIGINAL, 'tests');

const ler = p => fs.readFileSync(p, 'utf8');
const existe = p => fs.existsSync(p);
const unicos = lista => [...new Set(lista)].filter(Boolean).sort();
const capturar = (texto, re) => [...texto.matchAll(re)].map(m => m[1]);

// ---------------------------------------------------------------- motor
const motor = MOTOR.map(nome => {
  const texto = ler(path.join(RAIZ_PWA, 'notes', nome));
  return { nome, texto, linhas: texto.split(/\r?\n/).length, bytes: Buffer.byteLength(texto) };
});
const motorTudo = motor.map(m => m.texto).join('\n');
const editor = motor[0].texto;

// ------------------------------------------------------- unidades de comportamento
const metodos = unicos(capturar(motorTudo, /p\.([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*function/g));
const funcoesInternas = unicos(capturar(editor, /function ([a-zA-Z][a-zA-Z0-9_]*)\s*\(/g));

const comandos = unicos([
  ...capturar(motorTudo, /command\s*===\s*'([a-zA-Z0-9_]+)'/g),
  ...capturar(motorTudo, /executeNotesCommand\('([a-zA-Z0-9_]+)'\)/g),
  ...capturar(ler(HTML_PWA), /data-command="([a-zA-Z0-9_]+)"/g)
]);

const comandosAtalho = unicos(capturar(editor, /'(?:[0-9a-z])'\s*:\s*'([a-zA-Z0-9_]+)'/g));
const teclas = unicos(capturar(motorTudo, /event\.key\s*===\s*'([^']+)'/g));
const teclasLista = unicos(capturar(motorTudo, /\[((?:'[^']+',?\s*)+)\]/g)
  .flatMap(grupo => capturar(grupo, /'([^']+)'/g))
  .filter(tecla => /^Arrow|^Home$|^End$|^Escape$|^Enter$|^Tab$|^Backspace$|^Delete$|^ $/.test(tecla)));
const eventos = unicos(capturar(motorTudo, /addEventListener\('([a-zA-Z]+)'/g));
const atributos = unicos(capturar(motorTudo, /dataset\.([a-zA-Z][a-zA-Z0-9_]*)/g));
const classesCss = unicos(CSS.flatMap(nome => capturar(ler(path.join(RAIZ_PWA, 'notes', nome)), /\.([a-zA-Z][a-zA-Z0-9_-]*)/g)));
const attrsCss = unicos(CSS.flatMap(nome => capturar(ler(path.join(RAIZ_PWA, 'notes', nome)), /\[data-([a-zA-Z0-9_-]+)/g)));

// Regras do dominio NotesDocument (antes do globalThis.NotesDocument=...)
const trechoModelo = editor.slice(0, editor.indexOf('globalThis.NotesDocument'));
const modelo = unicos(capturar(trechoModelo, /^\s{4}([a-zA-Z][a-zA-Z0-9_]*)\s*\(/gm));
const propsModelo = unicos(capturar(trechoModelo, /(?:state|props)\.([a-zA-Z][a-zA-Z0-9_]*)/g));

module.exports = {
  RAIZ_PWA, ORIGINAL, MOTOR, CSS, HTML_PWA, HTML_ORIG, CSS_ORIG, CSS_PWA, PASTA_TESTES,
  ler, existe, unicos, capturar,
  motor, motorTudo, editor,
  metodos, funcoesInternas, comandos, comandosAtalho, teclas, teclasLista,
  eventos, atributos, classesCss, attrsCss, modelo, propsModelo
};
