/**
 * 🗺️ COMPONENTE: Visualizador de PDF do PWA (notas/pdf.js)
 * 🎯 OBJETIVO: abrir um PDF (anexo local `data:` ou anexo da conta `/api/note-assets/files/<id>`)
 *             e mostrar as PÁGINAS renderizadas + camada de TEXTO (seleção, cópia e busca),
 *             com VIRTUALIZAÇÃO para documentos de milhares de páginas.
 * 🔗 QUEM DEPENDE DELE: `notes/extras.js`, `app.js` e `sync/sync-cliente.js` — os três
 *             visualizadores de arquivo delegam a ele quando o tipo do anexo é PDF.
 *
 * Desenho (por que assim):
 *   - `pdf.js` (vendored em `notes/pdfjs/`, carregado SOB DEMANDA) faz o trabalho pesado num
 *     Web Worker; a main thread só desenha a janela visível.
 *   - VIRTUALIZAÇÃO: um placeholder leve por página (dezenas de milhares seriam caros só se
 *     fossem canvas); `IntersectionObserver` renderiza só o que está perto da tela e libera
 *     (canvas + texto) o que já saiu — o custo por rolagem não cresce com o total de páginas.
 *   - TEXTO sob demanda: `page.getTextContent()` só das páginas renderizadas (base da busca).
 *   - BUSCA incremental e CANCELÁVEL: varre as páginas em blocos, cedendo o controle, com
 *     progresso — nunca materializa o texto inteiro de uma vez.
 *   - Ao FECHAR, cancela desenhos em andamento e `destroy()` no documento (libera o worker).
 *
 * Sem `pdf.js` disponível (offline/cache antigo), o módulo SINALIZA a falha e quem chamou
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

 // Zoom: limites e passo do botão (teclado também usa).
 const ZOOM_MIN = 0.25, ZOOM_MAX = 5, ZOOM_PASSO = 1.25;
 // Margem (px) de pré-renderização e de liberação em volta da tela.
 const PREVIA = 400, FOLGA = 1400;
 // Páginas desenhadas ao mesmo tempo (mantém a rolagem fluida).
 const CONCORRENCIA = 2;
 // Modo HORIZONTAL: quantas páginas ficam lado a lado por vez e o espaço entre elas (px).
 const PAGINAS_POR_VEZ = 2, ESPACO_PAGINA = 12;
 // Largura mínima da janela para caberem DUAS páginas (no CELULAR fica UMA por vez).
 const LARGURA_MINIMA_DUAS = 720;

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
    total: 0, escala: 1, ajuste: 1, paginaAtual: 0,
    dpr: Math.min(root.devicePixelRatio || 1, 2),
    base: { w: 0, h: 0 }, modo: 'vertical',
    paginas: [], pendentes: [], ativos: 0, observadores: [],
    controles: null, busca: null, fallback: null,
    fechado: false,
   };
   estado.controles = montarBarra(estado);
   montarConteudo(estado);
   dialog.addEventListener('close', () => encerrar(estado), { once: true });
   iniciar(estado);
  }, trigger);
 }
 // 🔄 [FIM: NOTAS/PDF - ABRIR (monta a janela e inicia)]

 // ⚡ [INÍCIO: NOTAS/PDF - BARRA (página, zoom, busca, expandir)]
 /** Monta a barra de ferramentas e devolve os controles (usados por atualizarBarra). */
 function montarBarra(estado) {
  const { dialog } = estado;
  const tools = document.createElement('div');
  tools.className = 'notes-viewer-tools';

  const anterior = botao('Página anterior', '‹', () => irPara(estado, estado.paginaAtual - paginasPorVez(estado)));
  const proxima = botao('Próxima página', '›', () => irPara(estado, estado.paginaAtual + paginasPorVez(estado)));
  const pagina = document.createElement('span');
  pagina.className = 'notes-pdf-pagina';
  pagina.textContent = '1 / 1';

  const menos = botao('Reduzir', '−', () => aplicarZoom(estado, 1 / ZOOM_PASSO));
  const mais = botao('Ampliar', '+', () => aplicarZoom(estado, ZOOM_PASSO));
  const zoom = document.createElement('span');
  zoom.className = 'notes-pdf-zoom';
  zoom.textContent = '100%';
  const ajustar = botao('Ajustar à largura', 'Ajustar', () => aplicarZoom(estado, 0, true));
  // Leitura HORIZONTAL: as páginas ficam lado a lado (esquerda → direita).
  const orientacao = botao('Ver as páginas lado a lado (horizontal)', '↔', () => alternarOrientacao(estado));
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
   menos, zoom, mais, ajustar, orientacao,
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
  return { anterior, proxima, pagina, menos, mais, zoom, ajustar, orientacao, campo, contador, irAnterior, irProxima, expandir };
 }
 // ⚡ [FIM: NOTAS/PDF - BARRA (página, zoom, busca, expandir)]

 // 🎨 [INÍCIO: NOTAS/PDF - CONTEÚDO (área rolável e aviso)]
 /** Cria a área rolável (com os placeholders) e a faixa de aviso/erro. */
 function montarConteudo(estado) {
  const scroll = document.createElement('div');
  scroll.className = 'notes-pdf-scroll';
  scroll.tabIndex = 0;
  const paginasEl = document.createElement('div');
  paginasEl.className = 'notes-pdf-pages';
  scroll.append(paginasEl);
  const aviso = document.createElement('div');
  aviso.className = 'notes-pdf-aviso';
  aviso.setAttribute('role', 'status');
  aviso.hidden = true;
  // A página "atual" vem da ROLAGEM (não da última página desenhada): rAF evita custo por evento.
  scroll.addEventListener('scroll', () => {
   cancelAnimationFrame(estado.frameScroll);
   estado.frameScroll = root.requestAnimationFrame(() => atualizarPaginaPorRolagem(estado));
  }, { passive: true });
  estado.dialog.append(scroll, aviso);
  estado.scroll = scroll;
  estado.paginasEl = paginasEl;
  estado.aviso = aviso;
  // Reencaixa quando a janela muda de tamanho — inclusive troca 2 ⇄ 1 página no horizontal.
  const observadorTamanho = new ResizeObserver(() => {
   if (estado.fechado) return;
   const porVez = paginasPorVez(estado);
   if (porVez === estado.porVezAplicado) return;
   estado.porVezAplicado = porVez;
   if (estado.modo === 'horizontal') {
    estado.escala = escalaDeAjuste(estado);
    estado.ajuste = estado.escala;
    redesenhar(estado);
    atualizarBarra(estado);
   }
  });
  observadorTamanho.observe(scroll);
  estado.observadorTamanho = observadorTamanho;
 }
 // 🎨 [FIM: NOTAS/PDF - CONTEÚDO (área rolável e aviso)]

 // 🔄 [INÍCIO: NOTAS/PDF - DESENHAR PÁGINA (canvas + camada de texto)]
 /** Desenha UMA página (canvas na resolução do dpr + camada de texto) e a coloca no slot. */
 async function desenharPagina(estado, slot) {
  if (!slot || slot.renderizada || slot.desenho || estado.fechado) return;
  slot.desenho = true;
  try {
   if (!slot.page) slot.page = await estado.doc.getPage(slot.n);
   if (estado.fechado) return;
   const cssW = Math.round(estado.base.w * estado.escala);
   const cssH = Math.round(estado.base.h * estado.escala);
   const viewport = slot.page.getViewport({ scale: estado.escala * estado.dpr });
   const canvas = document.createElement('canvas');
   canvas.className = 'notes-pdf-canvas';
   canvas.style.width = cssW + 'px';
   canvas.style.height = cssH + 'px';
   canvas.width = Math.max(1, Math.floor(viewport.width));
   canvas.height = Math.max(1, Math.floor(viewport.height));
   const contexto = canvas.getContext('2d', { alpha: false });
   const tarefa = slot.page.render({ canvasContext: contexto, viewport });
   slot.tarefa = tarefa;
   await tarefa.promise;
   if (estado.fechado) return;

   const texto = document.createElement('div');
   texto.className = 'textLayer';
   texto.style.setProperty('--total-scale-factor', String(estado.escala));
   texto.style.setProperty('--scale-round-x', '1px');
   texto.style.setProperty('--scale-round-y', '1px');
   texto.style.width = cssW + 'px';
   texto.style.height = cssH + 'px';
   const camada = new estado.lib.TextLayer({
    textContentSource: await slot.page.getTextContent(),
    container: texto,
    viewport: slot.page.getViewport({ scale: estado.escala }),
   });
   await camada.render();
   if (estado.fechado) return;

   slot.el.replaceChildren(canvas, texto); // troca atômica: evita "meia página" na tela
   slot.renderizada = true;
   ajustarAltura(estado, slot, cssH);
   const busca = estado.busca;
   if (busca && busca.ocorrencias.length && busca.ocorrencias[busca.indice] === slot.n) {
    pintarOcorrencias(estado, slot.n, busca.termo);
   }
  } catch (erro) {
   if (erro && erro.name === 'RenderingCancelledException') return;
   mostrarErro(estado, erro);
  } finally {
   slot.tarefa = null;
   slot.desenho = false;
  }
 }
 // 🔄 [FIM: NOTAS/PDF - DESENHAR PÁGINA (canvas + camada de texto)]

 // 💾 [INÍCIO: NOTAS/PDF - LIBERAR PÁGINA (memória)]
 /** Cancela o desenho e esvazia o slot — o custo de manter 1000 páginas não existe. */
 function liberarPagina(estado, slot) {
  if (!slot || !slot.renderizada) return;
  if (slot.tarefa) { try { slot.tarefa.cancel(); } catch (_) { /* já concluído */ } }
  try { slot.page?.cleanup?.(); } catch (_) { /* página já liberada */ }
  slot.page = null;
  slot.el.replaceChildren();
  slot.renderizada = false;
 }
 // 💾 [FIM: NOTAS/PDF - LIBERAR PÁGINA (memória)]

 // 🔄 [INÍCIO: NOTAS/PDF - VIRTUALIZADOR (placeholders + observadores)]
 /** Cria um placeholder LEVE por página (nunca um canvas por página). */
 function criarPaginas(estado) {
  const largura = Math.round(estado.base.w * estado.escala);
  const altura = Math.round(estado.base.h * estado.escala);
  const fragmento = document.createDocumentFragment();
  estado.paginas = [];
  for (let n = 1; n <= estado.total; n++) {
   const el = document.createElement('div');
   el.className = 'notes-pdf-page';
   el.dataset.page = String(n);
   el.style.width = largura + 'px';
   el.style.height = altura + 'px';
   fragmento.append(el);
   estado.paginas.push({ n, el, page: null, tarefa: null, renderizada: false, desenho: false, naFila: false, altura });
  }
  estado.paginasEl.replaceChildren(fragmento);
  aplicarOrientacaoDOM(estado);
 }

 /** Margem do IntersectionObserver no eixo em que as páginas estão dispostas. */
 function margensDePrevia(estado, valor) {
  return estado.modo === 'horizontal' ? '0px ' + valor + 'px' : valor + 'px 0px';
 }

 /** Observa os placeholders: desenha o que se aproxima e libera o que já saiu. */
 function observarPaginas(estado) {
  const desenhar = new IntersectionObserver(entradas => {
   for (const entrada of entradas) {
    if (entrada.isIntersecting) enfileirar(estado, estado.paginas[Number(entrada.target.dataset.page) - 1]);
   }
  }, { root: estado.scroll, rootMargin: margensDePrevia(estado, PREVIA) });
  const soltar = new IntersectionObserver(entradas => {
   for (const entrada of entradas) {
    if (!entrada.isIntersecting) liberarPagina(estado, estado.paginas[Number(entrada.target.dataset.page) - 1]);
   }
  }, { root: estado.scroll, rootMargin: margensDePrevia(estado, FOLGA) });
  for (const slot of estado.paginas) { desenhar.observe(slot.el); soltar.observe(slot.el); }
  estado.observadores = [desenhar, soltar];
 }

 /** Reobserva (após troca de zoom): garante que a janela visível seja redesenhada. */
 function reobservar(estado) {
  for (const observador of estado.observadores) observador.disconnect();
  estado.observadores = [];
  for (const slot of estado.paginas) slot.naFila = false;
  estado.pendentes = [];
  observarPaginas(estado);
 }

 function enfileirar(estado, slot) {
  if (!slot || slot.renderizada || slot.desenho || slot.naFila || estado.fechado) return;
  slot.naFila = true;
  estado.pendentes.push(slot);
  processarFila(estado);
 }

 /** Renderiza até CONCORRENCIA páginas ao mesmo tempo (rolagem fluida). */
 function processarFila(estado) {
  while (estado.ativos < CONCORRENCIA && estado.pendentes.length) {
   const slot = estado.pendentes.shift();
   slot.naFila = false;
   estado.ativos++;
   desenharPagina(estado, slot).finally(() => {
    estado.ativos--;
    if (estado.pendentes.length) processarFila(estado);
   });
  }
 }
 // 🔄 [FIM: NOTAS/PDF - VIRTUALIZADOR (placeholders + observadores)]

 // ⚙️ [INÍCIO: NOTAS/PDF - BUSCA (varredura incremental e cancelável)]
 /** Cancela a busca atual e limpa o destaque. */
 function limparBusca(estado) {
  estado.busca?.cancelar?.();
  estado.busca = null;
  if (estado.controles) estado.controles.contador.textContent = '';
  if (root.CSS && CSS.highlights) CSS.highlights.delete('notes-pdf-find');
 }

 /**
  * Varre as páginas em BLOCOS (cedendo o controle a cada 8) para não travar a interface.
  * Em 1000 páginas isto lê uma página por vez e pode ser cancelado a qualquer momento.
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
   const slot = estado.paginas[n - 1];
   try {
    const jaTinha = Boolean(slot.page);
    const page = slot.page || (slot.page = await estado.doc.getPage(n));
    const conteudo = await page.getTextContent();
    const texto = conteudo.items.map(item => item.str).join(' ').toLowerCase();
    let pos = texto.indexOf(alvo);
    while (pos !== -1) { busca.ocorrencias.push(n); pos = texto.indexOf(alvo, pos + alvo.length); }
    if (!jaTinha && !slot.renderizada) { page.cleanup(); slot.page = null; }
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

 function irParaOcorrencia(estado) {
  const busca = estado.busca;
  const pagina = busca.ocorrencias[busca.indice];
  irPara(estado, pagina);
  pintarOcorrencias(estado, pagina, busca.termo);
 }

 /** Destaque das ocorrências da página atual (CSS Custom Highlight sobre a camada de texto). */
 function pintarOcorrencias(estado, n, termo) {
  if (!root.CSS || !CSS.highlights || typeof Highlight === 'undefined') return;
  CSS.highlights.delete('notes-pdf-find');
  const camada = estado.paginas[n - 1]?.el.querySelector('.textLayer');
  if (!camada) return;
  const realce = new Highlight();
  const alvo = termo.toLowerCase();
  const caminhante = document.createTreeWalker(camada, NodeFilter.SHOW_TEXT);
  let no;
  while ((no = caminhante.nextNode())) {
   const baixo = no.data.toLowerCase();
   let pos = baixo.indexOf(alvo);
   while (pos !== -1) {
    const faixa = document.createRange();
    faixa.setStart(no, pos);
    faixa.setEnd(no, pos + alvo.length);
    realce.add(faixa);
    pos = baixo.indexOf(alvo, pos + alvo.length);
   }
  }
  if (realce.size) CSS.highlights.set('notes-pdf-find', realce);
 }
 // ⚙️ [FIM: NOTAS/PDF - BUSCA (varredura incremental e cancelável)]

 // ⚙️ [INÍCIO: NOTAS/PDF - CONTROLE (abrir documento, zoom, navegação, avisos, encerrar)]
 /** Cede o controle (entre blocos de busca/carga) sem travar a interface. */
 const esperar = () => new Promise(resolve => {
  if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(() => resolve(), { timeout: 250 });
  else root.setTimeout(resolve, 0);
 });

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

 /** Quantas páginas ficam lado a lado: 2 no horizontal QUANDO cabe, senão 1 (celular). */
 function paginasPorVez(estado) {
  if (estado.modo !== 'horizontal') return 1;
  return ((estado.scroll && estado.scroll.clientWidth) || 0) >= LARGURA_MINIMA_DUAS ? PAGINAS_POR_VEZ : 1;
 }

 /** Aplica a orientação no DOM por ESTILO INLINE (não depende só do CSS, que pode estar em cache antigo). */
 function aplicarOrientacaoDOM(estado) {
  const horizontal = estado.modo === 'horizontal';
  estado.scroll.classList.toggle('notes-pdf-horizontal', horizontal);
  estado.paginasEl.style.flexDirection = horizontal ? 'row' : 'column';
  estado.paginasEl.style.alignItems = horizontal ? 'flex-start' : 'center';
  estado.paginasEl.style.width = horizontal ? 'max-content' : Math.round(estado.base.w * estado.escala) + 'px';
  estado.scroll.style.overflowX = horizontal ? 'auto' : '';
  estado.scroll.style.overflowY = horizontal ? 'hidden' : '';
 }

 /** Escala de encaixe: 1 página na largura (vertical) ou DUAS lado a lado (horizontal). */
 function escalaDeAjuste(estado) {
  const porVez = paginasPorVez(estado);
  let escala;
  if (porVez > 1) {
   const largura = (estado.scroll.clientWidth || 760) - 24 - (porVez - 1) * ESPACO_PAGINA;
   const altura = (estado.scroll.clientHeight || 560) - 24;
   escala = Math.min(largura / (porVez * estado.base.w), altura / estado.base.h);
  } else {
   const largura = (estado.scroll.clientWidth || 760) - 24;
   escala = largura / estado.base.w;
  }
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(escala) && escala > 0 ? escala : 1));
 }

 function atualizarBarra(estado) {
  const c = estado.controles;
  if (!c) return;
  const atual = estado.paginaAtual || 1;
  const total = estado.total || 1;
  const porVez = paginasPorVez(estado);
  const fim = Math.min(total, atual + porVez - 1);
  c.pagina.textContent = (fim > atual ? atual + '-' + fim : String(atual)) + ' / ' + total;
  if (estado.escala) c.zoom.textContent = Math.round((estado.escala / (estado.ajuste || 1)) * 100) + '%';
  c.anterior.disabled = atual <= 1;
  c.proxima.disabled = atual + porVez > total;
  c.orientacao?.setAttribute('aria-pressed', String(estado.modo === 'horizontal'));
  if (c.orientacao) c.orientacao.title = estado.modo === 'horizontal'
   ? 'Ver as páginas de cima para baixo (vertical)'
   : 'Ver as páginas lado a lado (horizontal)';
 }

 function definirPaginaAtual(estado, n) {
  if (!n || estado.paginaAtual === n) return;
  estado.paginaAtual = n;
  atualizarBarra(estado);
 }

 /** Página atual pela POSIÇÃO da rolagem (placeholders têm tamanho uniforme). */
 function atualizarPaginaPorRolagem(estado) {
  if (estado.fechado || !estado.total) return;
  const horizontal = estado.modo === 'horizontal';
  const referencia = horizontal ? estado.base.w : estado.base.h;
  const passo = Math.max(1, Math.round(referencia * estado.escala) + ESPACO_PAGINA);
  const posicao = horizontal ? estado.scroll.scrollLeft : estado.scroll.scrollTop;
  const n = Math.min(estado.total, Math.max(1, Math.floor(posicao / passo) + 1));
  definirPaginaAtual(estado, n);
 }

 function ajustarAltura(estado, slot, cssH) {
  if (Math.abs((slot.altura || 0) - cssH) < 1) return;
  slot.altura = cssH;
  slot.el.style.height = cssH + 'px';
 }

 /** Vai para uma página (rola a área interna no eixo ativo e atualiza o contador). */
 function irPara(estado, n) {
  const alvo = Math.min(Math.max(1, n || 1), estado.total || 1);
  const slot = estado.paginas[alvo - 1];
  if (!slot) return;
  const caixa = estado.scroll.getBoundingClientRect();
  const alvoCaixa = slot.el.getBoundingClientRect();
  if (estado.modo === 'horizontal') {
   const esquerda = alvoCaixa.left - caixa.left + estado.scroll.scrollLeft;
   estado.scroll.scrollLeft = Math.max(0, esquerda - ESPACO_PAGINA);
  } else {
   const topo = alvoCaixa.top - caixa.top + estado.scroll.scrollTop;
   estado.scroll.scrollTop = Math.max(0, topo - ESPACO_PAGINA);
  }
  definirPaginaAtual(estado, alvo);
 }

 /** Zoom: `ajustarLargura` recalcula o encaixe; senão multiplica a escala atual. */
 function aplicarZoom(estado, fator, ajustarLargura = false) {
  if (!estado.doc) return;
  const alvo = ajustarLargura ? escalaDeAjuste(estado) : estado.escala * fator;
  const nova = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, alvo));
  if (Math.abs(nova - estado.escala) < 0.001) return;
  estado.escala = nova;
  redesenhar(estado);
 }

 /** Alterna a leitura VERTICAL (de cima para baixo) × HORIZONTAL (esquerda → direita). */
 function alternarOrientacao(estado) {
  if (!estado.doc) return;
  estado.modo = estado.modo === 'horizontal' ? 'vertical' : 'horizontal';
  aplicarOrientacaoDOM(estado);
  estado.escala = escalaDeAjuste(estado);
  estado.ajuste = estado.escala;
  estado.porVezAplicado = paginasPorVez(estado);
  estado.scroll.scrollTop = 0;
  estado.scroll.scrollLeft = 0;
  redesenhar(estado);
  atualizarBarra(estado);
 }

 /** Aplica o zoom: libera tudo, redimensiona os placeholders e redesde a janela visível. */
 function redesenhar(estado) {
  for (const slot of estado.paginas) liberarPagina(estado, slot);
  const largura = Math.round(estado.base.w * estado.escala);
  const altura = Math.round(estado.base.h * estado.escala);
  for (const slot of estado.paginas) {
   slot.el.style.width = largura + 'px';
   slot.el.style.height = altura + 'px';
   slot.altura = altura;
  }
  aplicarOrientacaoDOM(estado);
  atualizarBarra(estado);
  reobservar(estado);
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

 /** Abre o documento: mostra a 1ª página e só então deixa a rolagem assumir o resto. */
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
   estado.escala = escalaDeAjuste(estado);
   estado.ajuste = estado.escala;
   estado.porVezAplicado = paginasPorVez(estado);
   criarPaginas(estado);
   observarPaginas(estado);
   atualizarBarra(estado);
   esconderAviso(estado);
  } catch (erro) {
   if (estado.fechado) return;
   mostrarErro(estado, erro, true);
  }
 }

 /** Fechou a janela: cancela tudo e destrói o documento (libera o worker do pdf.js). */
 function encerrar(estado) {
  estado.fechado = true;
  estado.busca?.cancelar?.();
  estado.busca = null;
  for (const observador of estado.observadores) observador.disconnect();
  estado.observadores = [];
  estado.observadorTamanho?.disconnect();
  for (const slot of estado.paginas || []) {
   if (slot.tarefa) { try { slot.tarefa.cancel(); } catch (_) { /* já concluído */ } }
  }
  if (root.CSS && CSS.highlights) CSS.highlights.delete('notes-pdf-find');
  try { estado.carregando?.destroy?.(); } catch (_) { /* já destruído */ }
  if (estado.doc) { try { estado.doc.destroy(); } catch (_) { /* já destruído */ } }
  estado.doc = null;
 }
 // ⚙️ [FIM: NOTAS/PDF - CONTROLE (abrir documento, zoom, navegação, avisos, encerrar)]

 root.NotesPdf = { abrir: abrir, disponivel: () => Boolean(biblioteca) };
})(typeof window !== 'undefined' ? window : self);
