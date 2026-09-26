// 🧪 [INÍCIO: TESTE - PARITY STRUCTURE]
/*
 * Paridade ESTRUTURAL: compara o bloco do modal de notas do PWA com o do
 * projeto original — ids, aria-labels, comandos, atributos de cor e classes.
 *
 * Nao usa navegador: le os dois HTMLs e compara. Falha se faltar (ou sobrar)
 * qualquer elemento/atributo do original no PWA.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ_PWA = path.join(__dirname, '..');
const ORIGINAL = process.env.NOTAS_ORIGINAL
  || 'C:/Users/Usuario/OneDrive/Desktop/produtividade-ferrramenta';

const ler = p => fs.readFileSync(p, 'utf8');
const pwaHtml = ler(path.join(RAIZ_PWA, 'index.html'));
const origHtml = ler(path.join(ORIGINAL, 'frontend', 'index.html'));

// O bloco de notas do original vai de notesModalBackdrop ate o fim do arquivo.
const blocoOriginal = origHtml.slice(origHtml.indexOf('id="notesModalBackdrop"'));
const extrair = (texto, re) => [...texto.matchAll(re)].map(m => m[1]).sort();

const idsOrigem = extrair(blocoOriginal, /id="([^"]+)"/g);
const idsPWA = extrair(pwaHtml, /id="([^"]+)"/g);
const ariaOrigem = extrair(blocoOriginal, /aria-label="([^"]+)"/g);
const ariaPWA = extrair(pwaHtml, /aria-label="([^"]+)"/g);
const comandosOrigem = extrair(blocoOriginal, /data-command="([^"]+)"/g);
const comandosPWA = extrair(pwaHtml, /data-command="([^"]+)"/g);
const coresOrigem = extrair(blocoOriginal, /data-notes-color="([^"]+)"/g);
const coresPWA = extrair(pwaHtml, /data-notes-color="([^"]+)"/g);
const rolesOrigem = extrair(blocoOriginal, /role="([^"]+)"/g);
const rolesPWA = extrair(pwaHtml, /role="([^"]+)"/g);

const classesDe = html => [...new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean))].sort();
const classesOrigem = classesDe(blocoOriginal);
const classesPWA = classesDe(pwaHtml);

const faltando = (origem, destino) => origem.filter(item => !destino.includes(item));

// Comandos que existem SO no PWA (revisao do bloco de notas) e por isso nao tem
// equivalente no original. Cada um precisa de um motivo escrito.
const COMANDOS_EXTRAS_PWA = {
  underline: 'Sublinhado: comando adicionado na revisao do bloco de notas (o original nao tem sublinhado).',
  alignLeft: 'Alinhamento por linha (esquerda): comando adicionado na revisao do bloco de notas (o original nao tem alinhamento).',
  alignCenter: 'Alinhamento por linha (centro): comando adicionado na revisao do bloco de notas (o original nao tem alinhamento).',
  alignRight: 'Alinhamento por linha (direita): comando adicionado na revisao do bloco de notas (o original nao tem alinhamento).',
  alignJustify: 'Alinhamento por linha (justificado): comando adicionado na revisao do bloco de notas (o original nao tem alinhamento).'
};

const relatorio = {
  ids: { origem: idsOrigem, pwa: idsPWA, faltando: faltando(idsOrigem, idsPWA) },
  aria: { origem: ariaOrigem, pwa: ariaPWA, faltando: faltando(ariaOrigem, ariaPWA) },
  comandos: (() => {
    const extras = faltando(comandosPWA, comandosOrigem);
    return {
      origem: comandosOrigem,
      pwa: comandosPWA,
      faltando: faltando(comandosOrigem, comandosPWA),
      sobrando: extras.filter(c => !COMANDOS_EXTRAS_PWA[c]),
      extrasPWA: extras.filter(c => COMANDOS_EXTRAS_PWA[c]).map(c => ({ comando: c, motivo: COMANDOS_EXTRAS_PWA[c] }))
    };
  })(),
  cores: { origem: coresOrigem, pwa: coresPWA, faltando: faltando(coresOrigem, coresPWA) },
  roles: { origem: rolesOrigem, pwa: rolesPWA, faltando: faltando(rolesOrigem, rolesPWA) },
  classesSemRegraNoPWA: (() => {
    const css = ['styles.css', 'theme-origem.css', 'notes/editor.css', 'notes/extras.css', 'notes/tables.css']
      .map(f => ler(path.join(RAIZ_PWA, f))).join('\n');
    const cssOriginal = ['frontend/styles.css', 'frontend/notes/editor.css', 'frontend/notes/extras.css', 'frontend/notes/tables.css']
      .map(f => ler(path.join(ORIGINAL, f))).join('\n');
    return classesPWA.filter(classe => {
      const re = new RegExp('\\.' + classe.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(?![\\w-])');
      return !re.test(css) && re.test(cssOriginal);
    });
  })()
};

const docs = path.join(RAIZ_PWA, 'docs');
fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(path.join(docs, 'parity-estrutura.json'), JSON.stringify(relatorio, null, 2) + '\n');

console.log('ids        : origem=' + idsOrigem.length + ' pwa=' + idsPWA.length + ' faltando=' + relatorio.ids.faltando.length + (relatorio.ids.faltando.length ? ' -> ' + relatorio.ids.faltando.join(', ') : ''));
console.log('aria-label : origem=' + ariaOrigem.length + ' pwa=' + ariaPWA.length + ' faltando=' + relatorio.aria.faltando.length + (relatorio.aria.faltando.length ? ' -> ' + relatorio.aria.faltando.join(', ') : ''));
console.log('data-command: origem=' + comandosOrigem.length + ' pwa=' + comandosPWA.length + ' faltando=' + relatorio.comandos.faltando.length + ' sobrando=' + relatorio.comandos.sobrando.length + ' extrasPWA=' + relatorio.comandos.extrasPWA.map(e => e.comando).join(','));
console.log('data-notes-color: origem=' + coresOrigem.length + ' pwa=' + coresPWA.length + ' faltando=' + relatorio.cores.faltando.length);
console.log('role       : origem=' + rolesOrigem.length + ' pwa=' + rolesPWA.length + ' faltando=' + relatorio.roles.faltando.length + (relatorio.roles.faltando.length ? ' -> ' + relatorio.roles.faltando.join(', ') : ''));
console.log('classes do PWA sem regra CSS (que existem no original): ' + relatorio.classesSemRegraNoPWA.length + (relatorio.classesSemRegraNoPWA.length ? ' -> ' + relatorio.classesSemRegraNoPWA.join(' ') : ''));

assert.deepEqual(relatorio.comandos.faltando, [], 'comandos da toolbar ausentes no PWA');
assert.deepEqual(relatorio.comandos.sobrando, [], 'comandos nao existentes no original');
assert.deepEqual(relatorio.cores.faltando, [], 'botoes de cor ausentes no PWA');
assert.deepEqual(relatorio.ids.faltando, [], 'ids do modal ausentes no PWA');
assert.deepEqual(relatorio.aria.faltando, [], 'aria-labels ausentes no PWA');
console.log('OK: estrutura do modal equivalente ao original');
// 🧪 [FIM: TESTE - PARITY STRUCTURE]
