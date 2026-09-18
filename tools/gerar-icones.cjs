/**
 * Gera os icones PNG do PWA (com dependencias zero, usando apenas o zlib do Node).
 * Reproduz a identidade do icon.svg: fundo #0B0E14, circulo #2B7FE6 e a letra "P" branca.
 *
 * Uso:
 *   node tools/gerar-icones.cjs --inspecionar   (mostra assinatura e dimensoes dos PNGs atuais)
 *   node tools/gerar-icones.cjs                 (regenera icon-192.png e icon-512.png)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RAIZ = path.join(__dirname, '..');
const FUNDO = [0x0b, 0x0e, 0x14];
const CIRCULO = [0x2b, 0x7f, 0xe6];
const LETRA = [0xff, 0xff, 0xff];
const LETRA_P = ['11110', '10001', '10001', '11110', '10000', '10000', '10000'];
const AMOSTRAS = 4; // supersampling para suavizar as bordas

const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    tabela[n] = c;
  }
  return tabela;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const tipoBuf = Buffer.from(tipo, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tipoBuf, dados])), 0);
  return Buffer.concat([tamanho, tipoBuf, dados, crc]);
}

function desenharLado(lado) {
  const celula = Math.max(1, Math.round((lado * 0.36) / LETRA_P.length));
  const letraLargura = LETRA_P[0].length * celula;
  const letraAltura = LETRA_P.length * celula;
  const letraX = Math.round((lado - letraLargura) / 2);
  const letraY = Math.round((lado - letraAltura) / 2);
  const centro = lado / 2;
  const raio = lado * 0.4;
  const pixels = Buffer.alloc(lado * lado * 3);

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const px = x + (sx + 0.5) / AMOSTRAS;
          const py = y + (sy + 0.5) / AMOSTRAS;
          const dx = px - centro;
          const dy = py - centro;
          const dentroLetra = px >= letraX && px < letraX + letraLargura
            && py >= letraY && py < letraY + letraAltura
            && LETRA_P[Math.floor((py - letraY) / celula)][Math.floor((px - letraX) / celula)] === '1';
          const cor = dentroLetra
            ? LETRA
            : (Math.sqrt(dx * dx + dy * dy) <= raio ? CIRCULO : FUNDO);
          r += cor[0];
          g += cor[1];
          b += cor[2];
        }
      }
      const total = AMOSTRAS * AMOSTRAS;
      const i = (y * lado + x) * 3;
      pixels[i] = Math.round(r / total);
      pixels[i + 1] = Math.round(g / total);
      pixels[i + 2] = Math.round(b / total);
    }
  }
  return pixels;
}

function montarPng(lado, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8;  // 8 bits por canal
  ihdr[9] = 2;  // truecolor RGB
  ihdr[10] = 0; // compressao deflate
  ihdr[11] = 0; // filtro padrao
  ihdr[12] = 0; // sem entrelacamento

  const bytesLinha = lado * 3;
  const linhas = Buffer.alloc(lado * (1 + bytesLinha));
  for (let y = 0; y < lado; y++) {
    const origem = y * bytesLinha;
    const destino = y * (1 + bytesLinha);
    linhas[destino] = 0; // filtro None
    pixels.copy(linhas, destino + 1, origem, origem + bytesLinha);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0))
  ]);
}

function inspecionar(caminho) {
  const buf = fs.readFileSync(caminho);
  const ehPng = buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  return {
    arquivo: path.basename(caminho),
    bytes: buf.length,
    pngValido: ehPng,
    dimensoes: ehPng ? `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}` : 'nao e PNG',
    inicio: buf.subarray(0, 4).toString('utf8').replace(/[^\x20-\x7e]/g, '?')
  };
}

const alvos = [[192, 'icon-192.png'], [512, 'icon-512.png']];

if (process.argv.includes('--inspecionar')) {
  for (const [, nome] of alvos) console.log(JSON.stringify(inspecionar(path.join(RAIZ, nome))));
} else {
  for (const [lado, nome] of alvos) {
    const destino = path.join(RAIZ, nome);
    if (fs.existsSync(destino)) console.log('antes :', JSON.stringify(inspecionar(destino)));
    fs.writeFileSync(destino, montarPng(lado, desenharLado(lado)));
    console.log('depois:', JSON.stringify(inspecionar(destino)));
  }
}
