/**
 * 🗺️ COMPONENTE: Visualizador de PDF do PWA (notes/pdf.js)
 * 🎯 OBJETIVO: abrir um PDF (anexo local `data:` ou da conta `/api/note-assets/files/<id>`) e
 *             mostrar as PÁGINAS como um LIVRO com virada realista (folha que enverga) pela
 *             lombada — avança virando a página da DIREITA para a esquerda e volta virando a da
 *             ESQUERDA para a direita, como num livro de verdade. A dobra é feita pela StPageFlip
 *             (vendorizada em `notes/flipjs/`, global `St`); cada página é desenhada pelo pdf.js.
 * 🔗 QUEM DEPENDE DELE: `notes/extras.js`, `app.js` e `sync/sync-cliente.js` — os três
 *             visualizadores de arquivo delegam a ele quando o tipo do anexo é PDF.
 *
 * Desenho (por que assim):
 *   - pdf.js (vendorizado em `notes/pdfjs/`, carregado SOB DEMANDA) rasteriza cada página num
 *     `<canvas>` FORA do DOM e a exibe como `<img>` (blob URL): a StPageFlip aplica a DOBRA
 *     (`clip-path` + `rotateY`) à página e, nas folhas `soft`, CLONA o elemento para a folha que
 *     vira — um `<canvas>` clonado ficaria em BRANCO (o bitmap não é copiado); um `<img>` não.
 *     O desenho é SOB DEMANDA (tela atual + vizinhança).
 *   - ORIENTAÇÃO automática: DUAS páginas lado a lado quando a janela é larga (lombada no meio,
 *     UMA folha por vez) e UMA página no celular — alternável pelo botão ↔.
 *   - BUSCA por `getTextContent()` que NAVEGA até a página (sem realce sobre o papel).
 *   - Ao FECHAR, `destroy()` na StPageFlip e no documento (libera o worker do pdf.js).
 *
 * Sem pdf.js OU sem StPageFlip (offline/cache antigo), o módulo SINALIZA a falha e quem chamou
 * mantém o comportamento anterior (iframe/download) — nunca regride.
 */
(function (root) {
 'use strict';

 // Build ESM do pdf.js v6 (sem bundle), sem `eval`.
 // Armadilha de resolução: `import()` num script CLÁSSICO resolve relativo ao PRÓPRIO script
 // (`/notes/pdf.js`), enquanto o worker e os recursos o pdf.js resolve a partir do DOCUMENTO.
 // Por isso tudo vira URL ABSOLUTA derivada da URL deste script — funciona nos dois casos e
 // também quando o módulo é injetado inline (teste), caindo no `baseURI`.
 const MEU = (root.document?.currentScript?.src) || new URL('notes/pdf.js', root.document.baseURI).href;
 const BASE = new URL('./pdfjs/', MEU).href;
 const BIBLIOTECA = BASE + 'pdf.min.mjs';
 const WORKER = BASE + 'pdf.worker.min.mjs';
 const CMAPS = BASE + 'cmaps/';
 const FONTES = BASE + 'standard_fonts/';
 const WASM = BASE + 'wasm/';
 const ICCS = BASE + 'iccs/';

 // Resolução do canvas de cada página (múltiplo da escala de exibição): nitidez suficiente sem
 // registrar (bitmap) a página inteira em tamanho de tela. As páginas são DOM — a lib escala.
 const RESOLUCAO = 2;
 // Páginas desenhadas ao mesmo tempo (mantém a troca fluida).
 const CONCORRENCIA = 2;
 // Quantas páginas em volta da atual ficam desenhadas (cobre o spread seguinte/anterior: a página
 // de BAIXO já tem canvas quando o usuário dobra a folha — senão apareceria em branco).
 const VIZINHANCA = 4;
 // Largura mínima da janela para já abrir com DUAS páginas (celular abre com UMA).
 const LARGURA_JANELA_DUAS = 720;
 // Limiar de largura que a StPageFlip usa para decidir portrait × landscape (size:'stretch').
 const MIN_PAGINA_LARGURA = 320;
 // Tempo (ms) da dobra da folha. Em `prefers-reduced-motion` a virada é praticamente instantânea
 // (a StPageFlip recusa `flippingTime <= 0`, então usamos 1 ms em vez de 0).
 const DURA_FOLHA = 750, DURA_FOLHA_REDUZIDA = 1;

 /** Cria um botão no padrão do visualizador (sem foco ao clicar na barra). */
 const botao = (rotulo, texto, acao) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = texto;
  el.title = rotulo;
  el.setAttribute('aria-label', rotulo);
  el.onmousedown = e => e.preventDefault();
  el.onclick = acao;
  return el;
 };

 /** O usuário pediu para reduzir movimento? (nesse caso a dobra é instantânea). */
 function reduzirMovimento() {
  return typeof root.matchMedia === 'function'
   && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
 }

 // 🚀 [INÍCIO: NOTAS/PDF - CARREGAR BIBLIOTECA (pdf.js sob demanda)]
 let biblioteca = null;
 let carregandoBiblioteca = null;

 /** Carrega o pdf.js UMA vez (import dinâmico) e aponta o worker para o arquivo vendorizado. */
 function carregarBiblioteca() {
  if (biblioteca) return Promise.resolve(biblioteca);
  if (!carregandoBiblioteca) {
   carregandoBiblioteca = import(BIBLIOTECA).then(lib => {
    lib.GlobalWorkerOptions.workerSrc = WORKER;
    biblioteca = lib;
    return lib;
   }).catch(erro => {
    carregandoBiblioteca = null;
    throw erro;
   });
  }
  return carregandoBiblioteca;
 }
 // 🚀 [FIM: NOTAS/PDF - CARREGAR BIBLIOTECA (pdf.js sob demanda)]

 // 🔄 [INÍCIO: NOTAS/PDF - ABRIR (monta a janela e inicia)]
 /**
  * Ponto de entrada público. `app` é a instância do editor (dá o diálogo base);
  * `opcoes` = `{ url, nome, trigger }`. Devolve o `<dialog>`.
  */
 function abrir(app, opcoes) {
  const { url, nome, trigger } = opcoes || {};
  return app.notesExtraDialog('Visualização do arquivo', dialog => {
   dialog.classList.add('notes-file-viewer', 'notes-pdf-viewer');
   const titulo = dialog.querySelector('h3');
   if (titulo) titulo.textContent = nome || 'Documento';
   const estado = {
    app, dialog, url, nome,
    lib: null, doc: null, carregando: null,
    total: 0, paginaAtual: 1,
    base: { w: 0, h: 0 },
    paginas: [], livro: null, fila: [], ativos: 0,
    controles: null, busca: null, fallback: null,
    scroll: null, aviso: null, lombada: null, bloco: null, observadorTamanho: null, frameTamanho: 0,
    fechado: false,
   };
   estado.controles = montarBarra(estado);
   montarConteudo(estado);
   dialog.addEventListener('close', () => encerrar(estado), { once: true });
   iniciar(estado);
  }, trigger);
 }
 // 🔄 [FIM: NOTAS/PDF - ABRIR (monta a janela e inicia)]

// ⚡ [INÍCIO: NOTAS/PDF - BARRA (página, orientação, busca, expandir)]
 /** Monta a barra de ferramentas e devolve os controles (usados por atualizarBarra). */
 function montarBarra(estado) {
  const { dialog } = estado;
  const tools = document.createElement('div');
  tools.className = 'notes-viewer-tools';

  const anterior = botao('Página anterior', '‹', () => virarPagina(estado, -1));
  const proxima = botao('Próxima página', '›', () => virarPagina(estado, 1));
  const pagina = document.createElement('span');
  pagina.className = 'notes-pdf-pagina';
  pagina.textContent = '1 / 1';

  // Uma página ⇄ duas páginas lado a lado (portrait × landscape).
  const orientacao = botao('Uma ou duas páginas por tela', '↔', () => alternarPaginas(estado));
  orientacao.setAttribute('aria-pressed', 'false');

  const campo = document.createElement('input');
  campo.type = 'search';
  campo.className = 'notes-pdf-busca';
  campo.placeholder = 'Buscar no documento';
  campo.setAttribute('aria-label', 'Buscar no documento');
  campo.addEventListener('keydown', e => {
   if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); iniciarBusca(estado, campo.value); }
  });
  campo.addEventListener('input', () => { if (!campo.value.trim()) limparBusca(estado); });
  const contador = document.createElement('span');
  contador.className = 'notes-pdf-contador';
  const irAnterior = botao('Ocorrência anterior', '↑', () => navegarBusca(estado, -1));
  const irProxima = botao('Próxima ocorrência', '↓', () => navegarBusca(estado, 1));

  const expandir = botao('Expandir/restaurar', '', () => {
   expandir.setAttribute('aria-expanded', String(dialog.classList.toggle('expanded')));
  });
  expandir.innerHTML = document.getElementById('notesFullscreenBtn')?.innerHTML || '⛶';

  tools.append(
   anterior, pagina, proxima,
   orientacao,
   campo, contador, irAnterior, irProxima,
   expandir,
  );
  if (estado.url) {
   const baixar = document.createElement('a');
   baixar.className = 'notes-pdf-download';
   baixar.href = estado.url;
   baixar.download = estado.nome || 'documento.pdf';
   baixar.textContent = 'Baixar';
   baixar.title = 'Baixar arquivo';
   tools.append(baixar);
  }
  dialog.append(tools);
  return { anterior, proxima, pagina, orientacao, campo, contador, irAnterior, irProxima, expandir };
 }
 // ⚡ [FIM: NOTAS/PDF - BARRA (página, orientação, busca, expandir)]

 // 🎨 [INÍCIO: NOTAS/PDF - CONTEÚDO (área do livro e aviso)]
 /** Cria a área do livro (onde a StPageFlip monta as páginas) e a faixa de aviso/erro. */
 function montarConteudo(estado) {
  const scroll = document.createElement('div');
  scroll.className = 'notes-pdf-scroll';
  scroll.tabIndex = 0;
  const aviso = document.createElement('div');
  aviso.className = 'notes-pdf-aviso';
  aviso.setAttribute('role', 'status');
  aviso.hidden = true;
  const lombada = document.createElement('div');
  lombada.className = 'notes-pdf-lombada';
  lombada.setAttribute('aria-hidden', 'true');
  scroll.append(aviso, lombada);
  estado.dialog.append(scroll);
  estado.scroll = scroll;
  estado.aviso = aviso;
  estado.lombada = lombada;
  // Reencaixa a dobra quando a JANELA do leitor muda (EXPANDIR/restaurar): a StPageFlip só ouve
  // `window.resize`, então um diálogo que muda de tamanho sozinho precisa avisar a lib.
  const observador = new ResizeObserver(() => {
   if (estado.fechado || !estado.livro) return;
   cancelAnimationFrame(estado.frameTamanho);
   estado.frameTamanho = root.requestAnimationFrame(() => {
    try { estado.livro.getRender().update(); } catch (_) { /* ainda não inicializou */ }
    atualizarLombada(estado);
   });
  });
  observador.observe(scroll);
  estado.observadorTamanho = observador;
 }
 // 🎨 [FIM: NOTAS/PDF - CONTEÚDO (área do livro e aviso)]

 // 🔄 [INÍCIO: NOTAS/PDF - DESENHAR PÁGINA (canvas sob demanda)]
 /** Cria o elemento de UMA página (DOM de verdade: a StPageFlip dobra a folha, não rasteriza). */
 function criarPagina(estado, n) {
  const el = document.createElement('div');
  el.className = 'notes-pdf-page';
  el.dataset.page = String(n);
  el.dataset.density = 'soft'; // folha maleável (enverga na lombada)
  // A página é uma IMAGEM (não um <canvas>): a StPageFlip CLONA a página (`cloneNode`) para a folha
  // que vira — e um <canvas> clonado fica em BRANCO (o bitmap não é copiado), enquanto o <img>
  // clonado mantém o `src` e continua mostrando a página durante a dobra.
  const img = document.createElement('img');
  img.className = 'notes-pdf-img';
  img.alt = '';
  img.draggable = false;
  el.append(img);
  return { n, el, img, url: null, page: null, tarefa: null, renderizada: false, desenho: false, naFila: false };
 }

 /** Desenha UMA página no canvas do próprio elemento (o conteúdo aparece na folha dobrada). */
 async function desenharPagina(estado, slot) {
  if (!slot || slot.renderizada || slot.desenho || estado.fechado) return;
  slot.desenho = true;
  try {
   if (!slot.page) slot.page = await estado.doc.getPage(slot.n);
   if (estado.fechado) return;
   const viewport = slot.page.getViewport({ scale: RESOLUCAO });
   const canvas = document.createElement('canvas'); // fora do DOM: só rasteriza a página
   canvas.width = Math.max(1, Math.floor(viewport.width));
   canvas.height = Math.max(1, Math.floor(viewport.height));
   const contexto = canvas.getContext('2d', { alpha: false });
   const tarefa = slot.page.render({ canvasContext: contexto, viewport });
   slot.tarefa = tarefa;
   await tarefa.promise;
   if (estado.fechado) return;
   const blob = await new Promise(res => { try { canvas.toBlob(res, 'image/png'); } catch (_) { res(null); } });
   if (estado.fechado || !blob) return;
   if (slot.url) { try { URL.revokeObjectURL(slot.url); } catch (_) { /* já revogado */ } }
   slot.url = URL.createObjectURL(blob);
   slot.img.src = slot.url;
   slot.renderizada = true;
  } catch (erro) {
   if (erro && erro.name === 'RenderingCancelledException') return;
   mostrarErro(estado, erro);
  } finally {
   slot.tarefa = null;
   slot.desenho = false;
  }
 }
 // 🔄 [FIM: NOTAS/PDF - DESENHAR PÁGINA (canvas sob demanda)]

 // 💾 [INÍCIO: NOTAS/PDF - LIBERAR PÁGINA (memória)]
 /** Libera o canvas de uma página (some da memória); a folha continua, só fica em branco. */
 function liberarPagina(estado, slot) {
  if (!slot || !slot.renderizada) return;
  if (slot.tarefa) { try { slot.tarefa.cancel(); } catch (_) { /* já concluído */ } }
  try { slot.page?.cleanup?.(); } catch (_) { /* página já liberada */ }
  slot.page = null;
  if (slot.url) { try { URL.revokeObjectURL(slot.url); } catch (_) { /* já revogado */ } slot.url = null; }
  slot.img.removeAttribute('src');
  slot.renderizada = false;
 }
 // 💾 [FIM: NOTAS/PDF - LIBERAR PÁGINA (memória)]

 // 🔄 [INÍCIO: NOTAS/PDF - DESENHO SOB DEMANDA (fila + vizinhança)]
 function enfileirar(estado, slot) {
  if (!slot || slot.renderizada || slot.desenho || slot.naFila || estado.fechado) return;
  slot.naFila = true;
  estado.fila.push(slot);
  processarFila(estado);
 }

 /** Renderiza até CONCORRENCIA páginas ao mesmo tempo (troca fluida). */
 function processarFila(estado) {
  while (estado.ativos < CONCORRENCIA && estado.fila.length) {
   const slot = estado.fila.shift();
   slot.naFila = false;
   estado.ativos++;
   desenharPagina(estado, slot).finally(() => {
    estado.ativos--;
    if (estado.fila.length) processarFila(estado);
   });
  }
 }

 /** Garante desenho da página atual e da VIZINHANÇA; libera o que ficou longe (memória baixa). */
 function garantirPaginas(estado, indice) {
  const total = estado.total || 0;
  for (let d = 0; d <= VIZINHANCA; d++) {
   for (const i of (d === 0 ? [indice] : [indice + d, indice - d])) {
    if (i >= 0 && i < total) enfileirar(estado, estado.paginas[i]);
   }
  }
  for (let i = 0; i < total; i++) {
   if (Math.abs(i - indice) > VIZINHANCA + 2) liberarPagina(estado, estado.paginas[i]);
  }
 }
 // 🔄 [FIM: NOTAS/PDF - DESENHO SOB DEMANDA (fila + vizinhança)]

 // ⚙️ [INÍCIO: NOTAS/PDF - BUSCA (índice incremental + navegação)]
 /** Cancela a busca atual e limpa o contador de ocorrências. */
 function limparBusca(estado) {
  estado.busca?.cancelar?.();
  estado.busca = null;
  if (estado.controles) estado.controles.contador.textContent = '';
 }

 /** Cede o controle (entre blocos de busca/carga) sem travar a interface. */
 const esperar = () => new Promise(resolve => {
  if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(() => resolve(), { timeout: 250 });
  else root.setTimeout(resolve, 0);
 });

 /**
  * Varre as páginas em BLOCOS (cedendo o controle a cada 8) e guarda em que páginas o termo
  * aparece. A busca NAVEGA até a página com `flip` (a StPageFlip não expõe realce no papel).
  */
 async function iniciarBusca(estado, termo) {
  termo = String(termo || '').trim();
  limparBusca(estado);
  if (!termo || !estado.doc || estado.fechado) return;
  const token = { ativo: true };
  const busca = { termo, token, ocorrencias: [], indice: -1, cancelar: () => { token.ativo = false; } };
  estado.busca = busca;
  const contador = estado.controles.contador;
  const alvo = termo.toLowerCase();
  for (let n = 1; n <= estado.total; n++) {
   if (!token.ativo || estado.fechado) return;
   try {
    const page = await estado.doc.getPage(n);
    const conteudo = await page.getTextContent();
    const texto = conteudo.items.map(item => item.str).join(' ').toLowerCase();
    if (texto.includes(alvo)) busca.ocorrencias.push(n);
    page.cleanup();
   } catch (_) { /* página ilegível não interrompe a busca */ }
   contador.textContent = 'Buscando… ' + n + '/' + estado.total;
   if (n % 8 === 0) await esperar();
  }
  if (!token.ativo || estado.fechado) return;
  if (!busca.ocorrencias.length) { contador.textContent = 'Nenhum resultado'; return; }
  busca.indice = 0;
  contador.textContent = '1 de ' + busca.ocorrencias.length;
  irParaOcorrencia(estado);
 }

 function navegarBusca(estado, passo) {
  const busca = estado.busca;
  if (!busca || !busca.ocorrencias.length) return;
  busca.indice = (busca.indice + passo + busca.ocorrencias.length) % busca.ocorrencias.length;
  estado.controles.contador.textContent = (busca.indice + 1) + ' de ' + busca.ocorrencias.length;
  irParaOcorrencia(estado);
 }

 /** Vira (com animação) até a página da ocorrência atual. */
 function irParaOcorrencia(estado) {
  const busca = estado.busca;
  if (!busca || !estado.livro) return;
  const pagina = busca.ocorrencias[busca.indice];
  estado.livro.flip(pagina - 1, 'top');
 }
 // ⚙️ [FIM: NOTAS/PDF - BUSCA (índice incremental + navegação)]

 // ⚡ [INÍCIO: NOTAS/PDF - VIRAR PÁGINA (livro / StPageFlip)]
 /**
  * Monta o LIVRO com a StPageFlip: as páginas (DOM) entram na lib, que faz a DOBRA realista da
  * folha pela lombada — vira a página da DIREITA para a esquerda ao avançar e a da ESQUERDA para
  * a direita ao voltar. A orientação (uma/duas páginas) é decidida pela largura da janela.
  */
 function montarLivro(estado) {
  const St = root.St;
  if (!St || typeof St.PageFlip !== 'function') {
   mostrarErro(estado, new Error('A biblioteca de virada (StPageFlip) não carregou.'), true);
   return;
  }
  const bloco = document.createElement('div');
  bloco.className = 'notes-pdf-livro';
  for (const slot of estado.paginas) bloco.append(slot.el);
  estado.scroll.append(bloco);
  estado.bloco = bloco;
  estado.livro = new St.PageFlip(bloco, {
   width: Math.max(1, Math.round(estado.base.w)),
   height: Math.max(1, Math.round(estado.base.h)),
   size: 'stretch',
   minWidth: MIN_PAGINA_LARGURA, maxWidth: 1200, minHeight: 400, maxHeight: 1700,
   drawShadow: true,
   maxShadowOpacity: 0.45,
   flippingTime: reduzirMovimento() ? DURA_FOLHA_REDUZIDA : DURA_FOLHA,
   usePortrait: true,          // orientação automática pela largura (1 no celular, 2 no PC)
   showCover: false,           // pareia 1-2, 3-4 … como no contador
   mobileScrollSupport: false, // o gesto horizontal é da folha, não da página
   useMouseEvents: true,       // arrasto com rato e toque (a própria lib decide o sentido)
   clickEventForward: true,
   showPageCorners: true,
   disableFlipByClick: false,
   swipeDistance: 24,
   startPage: 0,
  });
  const livro = estado.livro;
  livro.loadFromHTML(estado.paginas.map(slot => slot.el));
  // A LOMBADA vai para DENTRO do bloco de páginas (mesma pilha 3D) com z-index logo ACIMA das
  // páginas paradas (`startZIndex+1`) e ABAIXO da folha que vira (`startZIndex+5`) e da de baixo
  // (`+3`): assim ela aparece em repouso e é COBERTA pela página durante a viração.
  const blocoPaginas = bloco.querySelector('.stf__block');
  if (blocoPaginas && estado.lombada) {
   estado.lombada.style.zIndex = String((livro.getSettings().startZIndex || 0) + 2);
   blocoPaginas.appendChild(estado.lombada);
  }
  // Reforço: a 1ª medição pode correr antes de o layout assentar — refaz após o 1º paint.
  root.requestAnimationFrame(() => root.requestAnimationFrame(() => atualizarLombada(estado)));
  livro.on('flip', e => {
   const indice = Math.max(0, Number(e.data) || 0);
   estado.paginaAtual = indice + 1;
   garantirPaginas(estado, indice);
   atualizarBarra(estado);
   atualizarLombada(estado);
  });
  livro.on('changeOrientation', () => { atualizarBarra(estado); atualizarLombada(estado); });
  livro.on('changeState', e => {
   // Ao COMEÇAR a interação, reforça o desenho da vizinhança: a página que fica POR BAIXO precisa
   // ter imagem pronta antes de ser revelada pela dobra. (A lombada NÃO é escondida na virada: ela
   // é coberta pela própria página, que está numa camada acima — ver `montarLivro`.)
   if (String(e.data) !== 'read') garantirPaginas(estado, Math.max(0, (estado.paginaAtual || 1) - 1));
  });
  livro.on('init', () => { garantirPaginas(estado, 0); atualizarBarra(estado); atualizarLombada(estado); });
 }

 /** Avança (passo > 0) ou volta (passo < 0) UMA folha — com a animação de livro da lib. */
 function virarPagina(estado, passo) {
  const livro = estado.livro;
  if (!livro || estado.fechado) return;
  if (passo >= 0) livro.flipNext(); else livro.flipPrev();
 }

 /** Alterna entre UMA e DUAS páginas por tela (portrait × landscape). */
 function alternarPaginas(estado) {
  const livro = estado.livro;
  if (!livro) return;
  const cfg = livro.getSettings();
  const emDuas = livro.getOrientation() === 'landscape';
  if (emDuas) {
   // passa a UMA: força portrait (largura do bloco < 2*minWidth)
   cfg.usePortrait = true;
   cfg.minWidth = Math.ceil((estado.scroll.clientWidth || 800) / 2) + 2;
  } else {
   // volta a DUAS: força landscape
   cfg.usePortrait = false;
   cfg.minWidth = MIN_PAGINA_LARGURA;
  }
  try { livro.getRender().update(); } catch (_) { /* estado transitório */ }
  atualizarBarra(estado);
  atualizarLombada(estado);
 }

 /**
  * Mostra/posiciona a LOMBADA (o "vinco"/spine no MEIO do livro). Ela vive DENTRO do bloco de
  * páginas (mesma pilha), com z-index logo acima das páginas paradas e ABAIXO da folha que vira —
  * por isso, ao virar, a PÁGINA COBRE a lombada. A posição vem do RETÂNGULO real do livro
  * (`getBoundsRect`). A aparência acompanha o VOLUME: quanto mais páginas, mais larga/marcada.
  */
 function atualizarLombada(estado) {
  const lombada = estado.lombada;
  if (!lombada || !estado.livro) return;
  // Escala de aparência pelo nº de páginas (log): 1 página → fraca; 1000+ → forte (aproxima o
  // "vinco" mais largo/marcado de um livro grosso).
  const total = estado.total || 1;
  const forca = Math.min(1, Math.log10(Math.max(1, total)) / Math.log10(1000));
  lombada.style.setProperty('--lombada-largura', Math.round(44 + 52 * forca) + 'px');
  lombada.style.setProperty('--lombada-forca', (0.5 + 0.42 * forca).toFixed(2));
  const duas = estado.livro.getOrientation() === 'landscape';
  if (!duas || estado.fechado) { lombada.classList.remove('visivel'); return; }
  let caixa = null;
  try { caixa = estado.livro.getBoundsRect(); } catch (_) { caixa = null; }
  if (!caixa || !caixa.width) { lombada.classList.remove('visivel'); return; }
  // Coordenadas RELATIVAS ao bloco de páginas (a lombada está dentro dele).
  lombada.style.left = Math.round(caixa.left + caixa.width / 2) + 'px';
  lombada.style.top = Math.round(caixa.top) + 'px';
  lombada.style.height = Math.round(caixa.height) + 'px';
  lombada.classList.add('visivel');
 }

 /** Atualiza o contador (faixa `n-m / total` em duas páginas) e o estado dos botões. */
 function atualizarBarra(estado) {
  const c = estado.controles;
  if (!c) return;
  const total = estado.total || 1;
  const idx = estado.livro ? Number(estado.livro.getCurrentPageIndex()) || 0 : 0;
  const atual = Math.min(total, Math.max(1, idx + 1));
  const duas = Boolean(estado.livro) && estado.livro.getOrientation() === 'landscape' && total > 1;
  const fim = duas ? Math.min(total, atual + 1) : atual;
  c.pagina.textContent = (fim > atual ? atual + '-' + fim : String(atual)) + ' / ' + total;
  c.anterior.disabled = atual <= 1;
  c.proxima.disabled = atual + (duas ? 1 : 0) >= total;
  c.orientacao?.setAttribute('aria-pressed', String(duas));
 }
 // ⚡ [FIM: NOTAS/PDF - VIRAR PÁGINA (livro / StPageFlip)]

 // ⚙️ [INÍCIO: NOTAS/PDF - CONTROLE (abrir documento, avisos, encerrar)]
 function mostrarAviso(estado, texto) {
  if (!estado.aviso) return;
  estado.aviso.hidden = false;
  estado.aviso.textContent = texto;
 }

 function esconderAviso(estado) {
  if (!estado.aviso) return;
  estado.aviso.hidden = true;
  estado.aviso.textContent = '';
 }

 /** Bytes do anexo local (`data:`) ou a URL (o pdf.js busca por RANGE quando o servidor apoia). */
 async function fonteDoDocumento(estado) {
  const url = estado.url || '';
  if (url.startsWith('data:')) {
   const resposta = await fetch(url);
   return { data: new Uint8Array(await resposta.arrayBuffer()) };
  }
  return { url };
 }

 function mensagemDeErro(erro) {
  const nome = String((erro && erro.name) || '');
  if (nome === 'PasswordException') return 'O arquivo é protegido por senha.';
  if (nome === 'InvalidPDFException') return 'O arquivo não é um PDF válido ou está corrompido.';
  if (nome === 'MissingPDFException' || nome === 'UnexpectedResponseException') return 'O arquivo não foi encontrado.';
  return (erro && erro.message) ? String(erro.message) : 'Erro inesperado.';
 }

 function adicionarFallback(estado) {
  if (estado.fallback || !estado.url) return;
  const link = document.createElement('a');
  link.className = 'notes-pdf-download';
  link.href = estado.url;
  link.download = estado.nome || 'documento.pdf';
  link.textContent = 'Baixar arquivo';
  estado.aviso.append(document.createElement('br'), link);
  estado.fallback = link;
 }

 function mostrarErro(estado, erro, critico = false) {
  if (!estado.aviso) return;
  estado.aviso.hidden = false;
  estado.aviso.textContent = (critico ? 'Não foi possível abrir o PDF. ' : 'Não foi possível desenhar esta página. ')
   + mensagemDeErro(erro);
  if (critico) adicionarFallback(estado);
 }

 /** Abre o documento, cria as páginas e monta o LIVRO (StPageFlip). */
 async function iniciar(estado) {
  try {
   mostrarAviso(estado, 'Carregando documento…');
   const lib = await carregarBiblioteca();
   if (estado.fechado) return;
   estado.lib = lib;
   const fonte = await fonteDoDocumento(estado);
   const tarefa = lib.getDocument({
    ...fonte,
    cMapUrl: CMAPS,
    cMapPacked: true,
    standardFontDataUrl: FONTES,
    wasmUrl: WASM,
    iccUrl: ICCS,
    withCredentials: true,
   });
   estado.carregando = tarefa;
   tarefa.onProgress = ({ loaded, total }) => {
    if (estado.fechado || !total) return;
    mostrarAviso(estado, 'Carregando documento… ' + Math.round((loaded / total) * 100) + '%');
   };
   estado.doc = await tarefa.promise;
   if (estado.fechado) return;
   estado.total = estado.doc.numPages || 0;
   if (!estado.total) throw new Error('O PDF não tem páginas.');
   const primeira = await estado.doc.getPage(1);
   const bruto = primeira.getViewport({ scale: 1 });
   estado.base = { w: bruto.width, h: bruto.height };
   estado.paginas = [];
   for (let n = 1; n <= estado.total; n++) estado.paginas.push(criarPagina(estado, n));
   esconderAviso(estado);
   montarLivro(estado);
   atualizarBarra(estado);
  } catch (erro) {
   if (estado.fechado) return;
   mostrarErro(estado, erro, true);
  }
 }

 /** Fechou a janela: cancela tudo, destrói o LIVRO (StPageFlip) e o documento (libera o worker). */
 function encerrar(estado) {
  estado.fechado = true;
  estado.busca?.cancelar?.();
  estado.busca = null;
  estado.observadorTamanho?.disconnect();
  for (const slot of estado.paginas || []) {
   if (slot.tarefa) { try { slot.tarefa.cancel(); } catch (_) { /* já concluído */ } }
  }
  try { estado.livro?.destroy?.(); } catch (_) { /* já destruído */ }
  estado.livro = null;
  try { estado.carregando?.destroy?.(); } catch (_) { /* já destruído */ }
  if (estado.doc) { try { estado.doc.destroy(); } catch (_) { /* já destruído */ } }
  estado.doc = null;
 }
 // ⚙️ [FIM: NOTAS/PDF - CONTROLE (abrir documento, avisos, encerrar)]

 root.NotesPdf = { abrir: abrir, disponivel: () => Boolean(biblioteca) };
})(typeof window !== 'undefined' ? window : self);
