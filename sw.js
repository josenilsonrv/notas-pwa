/**
 * Service Worker PWA - Cache e Offline
 * Gerencia cache de assets estáticos, estratégia de fetch e offline
 */

// ============================================
// SERVICE WORKER PARA PWA
// ============================================

// Constantes de cache e assets estáticos
const CACHE_NAME = 'notas-pwa-v8';
const STATIC_ASSETS = [
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

// ============================================
// INSTALLATION
// ============================================
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('Service Worker: Installation complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Installation failed', error);
            })
    );
});

// ============================================
// ACTIVATION
// ============================================
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Activation complete');
                return self.clients.claim();
            })
    );
});

// ============================================
// FETCH STRATEGY
// ============================================
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Estratégia: Network First para assets estáticos
    // Compara o pathname (sempre absoluto) com os assets relativos, ignorando o prefixo do subdiretório
    const isStaticAsset = STATIC_ASSETS.some(asset => {
        const cleanAsset = asset.replace(/^\.\//, '/');
        return url.pathname === cleanAsset || url.pathname.endsWith(cleanAsset);
    });

    if (isStaticAsset) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Verificar se resposta é válida
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clonar resposta para cache
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                })
                .catch((error) => {
                    console.error('Service Worker: Fetch failed, trying cache', error);
                    // Fallback para cache se network falhar (offline)
                    return caches.match(event.request)
                        .then((cachedResponse) => {
                            if (cachedResponse) {
                                return cachedResponse;
                            }
                            // Retornar página offline para erros de navegação
                            if (event.request.mode === 'navigate') {
                                return caches.match('./index.html');
                            }
                        });
                })
        );
    } else {
        // Estratégia: Network First para outros requests
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Verificar se resposta é válida
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }
                    
                    // Clonar resposta para cache
                    const responseToCache = response.clone();
                    
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                })
                .catch(() => {
                    // Fallback para cache se network falhar
                    return caches.match(event.request);
                })
        );
    }
});

// ============================================
// MESSAGE HANDLING
// ============================================
self.addEventListener('message', (event) => {
    console.log('Service Worker: Message received', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_UPDATED') {
        // Notificar clientes sobre atualização de cache
        self.clients.matchAll().then(clients => {
            clients.forEach(client => {
                client.postMessage({
                    type: 'CACHE_UPDATED',
                    cacheName: CACHE_NAME
                });
            });
        });
    }
});