/**
 * Service Worker PWA - Cache e Offline
 *
 * Estratégia: OFFLINE-FIRST de verdade.
 * O app é 100% local, então o Service Worker serve do CACHE imediatamente e
 * revalida na rede em segundo plano. A rede NUNCA bloqueia o carregamento: se
 * demorar mais que TIMEOUT_MS, a resposta em cache é usada na hora.
 *
 * Motivo: a versão anterior ("Network First" com `fetch` sem timeout) deixava a
 * página em branco carregando para sempre quando a rede pendurava — o CSS (que
 * bloqueia a pintura) nunca chegava.
 */

// ============================================
// SERVICE WORKER PARA PWA
// ============================================

const CACHE_NAME = 'notas-pwa-v18';
const TIMEOUT_MS = 3000;

const OFFLINE_HTML = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Notas</title></head><body style="font:16px system-ui;padding:24px">' +
    '<h1>Notas</h1><p>Sem conexão e sem cópia local do app. Abra uma vez com internet ' +
    'para que o aplicativo fique disponível offline.</p></body></html>';

/**
 * Assets ESSENCIAIS: sem eles o app não funciona (o app.js aplica a classe `active`
 * no modal, monta o editor, etc.). A instalação só é concluída se TODOS estiverem
 * no cache — assim o modo offline nunca serve um app quebrado/à meio.
 */
const ESSENCIAIS = [
    './',
    './index.html',
    './styles.css',
    './theme-origem.css',
    './app.js',
    './notes/editor.js',
    './notes/editor.css',
    './notes/extras.js',
    './notes/extras.css',
    './notes/table-math.js',
    './notes/tables.js',
    './notes/tables.css',
    './manifest.json',
    './icon.svg'
];

/** `fetch` + timeout + `cache.put` (evita travar a instalação com rede lenta/instável). */
const adicionarComRetry = async (cache, asset, tentativas = 3) => {
    for (let i = 0; i < tentativas; i++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
            const response = await fetch(asset, { signal: controller.signal, cache: 'no-store' });
            clearTimeout(timer);
            if (response && response.ok) {
                await cache.put(asset, response);
                return true;
            }
        } catch (_) {
            // tenta de novo
        }
    }
    return false;
};

/** Busca na rede com limite de tempo (nunca deixa o carregamento pendurado). */
const buscarComTimeout = (request, ms) => new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort();
        reject(new Error('timeout'));
    }, ms);
    fetch(request, { signal: controller.signal })
        .then((response) => { clearTimeout(timer); resolve(response); })
        .catch((error) => { clearTimeout(timer); reject(error); });
});

/** Guarda a resposta no cache sem bloquear quem está esperando. */
const guardarNoCache = (request, response) => {
    if (!response || !response.ok) return;
    const copia = response.clone();
    caches.open(CACHE_NAME)
        .then((cache) => cache.put(request, copia))
        .catch(() => { /* sem espaço/opaco: ignora */ });
};

/** Revalida em segundo plano (stale-while-revalidate) sem bloquear a resposta. */
const revalidar = (request) => {
    buscarComTimeout(request, TIMEOUT_MS)
        .then((response) => guardarNoCache(request, response))
        .catch(() => { /* offline: mantém o cache */ });
};

// ============================================
// INSTALLATION
// ============================================
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        const resultados = await Promise.all(ESSENCIAIS.map((asset) => adicionarComRetry(cache, asset)));
        if (resultados.some((ok) => !ok)) {
            // Cache incompleto NUNCA deve ser usado: remove e falha a instalação
            // (mantém a versão anterior funcionando) em vez de servir app quebrado.
            await caches.delete(CACHE_NAME);
            throw new Error('Service Worker: assets essenciais não puderam ser cacheados');
        }
        await self.skipWaiting();
        console.log('Service Worker: instalado');
    })());
});

// ============================================
// ACTIVATION
// ============================================
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(nomes.map((nome) => (nome === CACHE_NAME ? null : caches.delete(nome))));
        await self.clients.claim();
        console.log('Service Worker: ativado');
    })());
});

// ============================================
// FETCH STRATEGY
// ============================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        const emCache = await caches.match(request);

        // 1) Cache primeiro: a página abre na hora, sem depender da rede.
        if (emCache) {
            revalidar(request);
            return emCache;
        }

        // 2) Sem cópia local: tenta a rede, mas com timeout.
        try {
            const response = await buscarComTimeout(request, TIMEOUT_MS);
            guardarNoCache(request, response);
            return response;
        } catch (_) {
            // 3) Navegação sem cache: usa o index.html guardado (se existir) ou
            //    uma página mínima — nunca fica em branco carregando para sempre.
            if (request.mode === 'navigate') {
                const index = await caches.match('./index.html');
                if (index) return index;
                return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
            }
            return Response.error();
        }
    })());
});

// ============================================
// MESSAGE HANDLING
// ============================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'CACHE_UPDATED') {
        self.clients.matchAll().then((clients) => {
            clients.forEach((client) => {
                client.postMessage({ type: 'CACHE_UPDATED', cacheName: CACHE_NAME });
            });
        });
    }
});
