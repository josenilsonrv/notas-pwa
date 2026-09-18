#!/usr/bin/env node
/**
 * Extrai do CSS COMPILADO do projeto original (frontend/styles.css) tudo o que
 * diz respeito ao motor de notas:
 *   - o bloco `:root, :host { ... }` (paleta e tokens do tema — a "verdade" escolhida)
 *   - todas as regras cujo seletor menciona `.notes-` ou `#notes`
 *
 * O resultado vira `theme-origem.css`, que entra logo apos `styles.css` e antes
 * de `notes/*.css` — exatamente a mesma ordem de carga do projeto original.
 *
 * Uso: node tools/extrair-tema.cjs
 */
const fs = require('fs');
const path = require('path');

const RAIZ_PWA = path.join(__dirname, '..');
const ORIGINAL = process.env.NOTAS_ORIGINAL
  || 'C:/Users/Usuario/OneDrive/Desktop/produtividade-ferrramenta';
const ENTRADA = path.join(ORIGINAL, 'frontend', 'styles.css');
const SAIDA = path.join(RAIZ_PWA, 'theme-origem.css');

const css = fs.readFileSync(ENTRADA, 'utf8');

/**
 * Percorre o CSS e devolve os blocos `preludio { corpo }` cujo seletor
 * satisfaz o filtro, preservando o contexto (@media/@layer/@supports).
 */
function extrairBlocos(texto, filtro) {
  const blocos = [];
  const pilha = [];      // contextos abertos (@media, @layer, ...)
  let preludio = '';
  let inicioPreludio = 0;
  let profundidade = 0;
  for (let i = 0; i < texto.length; i++) {
    const caractere = texto[i];
    if (caractere === '{') {
      const seletor = preludio.trim().replace(/\s+/g, ' ');
      if (profundidade === 0 && !seletor.startsWith('@')) {
        pilha.push({ tipo: 'regra', seletor });
      } else if (seletor.startsWith('@')) {
        pilha.push({ tipo: 'contexto', seletor });
      } else {
        pilha.push({ tipo: 'regra', seletor });
      }
      profundidade++;
      preludio = '';
      inicioPreludio = i + 1;
    } else if (caractere === '}') {
      profundidade--;
      const topo = pilha.pop();
      if (topo && topo.tipo === 'regra' && filtro(topo.seletor)) {
        const corpo = texto.slice(inicioPreludio, i);
        blocos.push({ seletor: topo.seletor, corpo, contextos: pilha.filter(p => p.tipo === 'contexto').map(p => p.seletor) });
      }
      preludio = '';
      inicioPreludio = i + 1;
    } else if (caractere === ';' && profundidade === 0) {
      preludio = texto.slice(inicioPreludio, i + 1) + preludio.replace(/^\s*[\s\S]*$/, '');
      inicioPreludio = i + 1;
    } else {
      preludio += caractere;
    }
  }
  return blocos;
}

const ehRaiz = seletor => /^:root\b|,\s*:host\b/.test(seletor) || seletor.includes(':root');
// Regras que compoem o modal de notas: classes do motor, a toolbar, o card do
// modal e o container do editor (o "focus-shell" e usado pelo editor no original).
const CLASSES_DO_MODAL = ['notes-', 'toolbar-btn', 'modal', 'focus-shell', 'select-text', 'select-none'];
const ehNotas = seletor => /#notes/.test(seletor)
  || CLASSES_DO_MODAL.some(classe => new RegExp('(^|[\\s,>+~(.])' + '\\.' + classe.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).test(seletor));

const raizes = extrairBlocos(css, ehRaiz);
const notas = extrairBlocos(css, ehNotas);

const partes = [];
partes.push('/*');
partes.push(' * theme-origem.css');
partes.push(' *');
partes.push(' * GERADO AUTOMATICAMENTE por tools/extrair-tema.cjs a partir de:');
partes.push(' *   ' + ENTRADA);
partes.push(' *');
partes.push(' * Contem:');
partes.push(' *   1. o bloco :root do CSS compilado do original (paleta/tokens do tema);');
partes.push(' *   2. todas as regras do compilado cujo seletor menciona .notes- / #notes.');
partes.push(' *');
partes.push(' * Este arquivo e carregado DEPOIS de styles.css e ANTES de notes/*.css,');
partes.push(' * reproduzindo a ordem de carga do projeto original. NAO EDITE A MAO.');
partes.push(' */');
partes.push('');

for (const bloco of raizes) {
  partes.push('/* --- tokens do tema (do compilado do original) --- */');
  partes.push(bloco.seletor + ' {');
  partes.push(bloco.corpo.trim());
  partes.push('}');
  partes.push('');
}
for (const bloco of notas) {
  // O Tailwind envolve utilitarios em @layer; manter o wrapper faria a regra
  // perder prioridade contra o CSS fora de layer. @media/@supports sao mantidos.
  const contextos = bloco.contextos.filter(contexto => !/^@layer\b/.test(contexto));
  if (contextos.length) {
    partes.push(contextos.join(' { ') + ' {');
    partes.push(bloco.seletor + ' {');
    partes.push(bloco.corpo.trim());
    partes.push('}');
    partes.push('}');
  } else {
    partes.push(bloco.seletor + ' {');
    partes.push(bloco.corpo.trim());
    partes.push('}');
  }
  partes.push('');
}

fs.writeFileSync(SAIDA, partes.join('\n'));
console.log('blocos :root    : ' + raizes.length);
console.log('blocos de notas : ' + notas.length);
console.log('gerado          : theme-origem.css (' + fs.statSync(SAIDA).size + ' bytes)');
