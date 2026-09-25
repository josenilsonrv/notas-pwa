# Atualização do app (PWA) — por que parecia "não atualizar" e como isso foi resolvido

> Documento de referência sobre **como uma versão nova chega (ou não) até o aparelho**.
> Complementa `docs/PROBLEMAS-E-MITIGACOES.md` (P3, P20, P61-P68) e a Bússola `arquitetura.md`.

---

## 1. O problema, como foi relatado

1. *"As alterações que faço funcionam no `localhost` (porta), mas não aparecem no link publicado."*
2. *"No celular a área **Mapa Mental** abre **vazia** — sem a topbar, sem 'Novo mapa' e sem as
   barras de ferramentas/formatação. No PC, servindo os mesmos arquivos, aparecia tudo."*
3. *"Digitar a última linha da nota: ela fica **atrás da barra de ferramentas** do teclado."*

O relato (1) e (2) têm a **mesma causa**: o app instalado estava rodando uma **cópia antiga**
dos arquivos. O (3) é outro problema (espaço de rolagem) e está na seção 6.

---

## 2. Como eu diagnostiquei (o caminho real, passo a passo)

| Passo | O que fiz | Resultado |
|---|---|---|
| 1 | Baixei `https://<site>/index.html` e comparei com o local | **idênticos** (mesmo tamanho/bytes) |
| 2 | Baixei `https://<site>/mapa/mapa-render.js` e comparei | **idêntico** ao local (65.027 B) |
| 3 | Baixei `https://<site>/sw.js` e li o `CACHE_NAME` | **igual ao local** naquele momento |
| 4 | Servi o projeto local (porta) | **tudo funcionava** |
| 5 | Conclusão | o **deploy estava correto**; o que estava velho era a **cópia no aparelho** |

O ponto (2) do relato fechou o diagnóstico: como a **aba trocava de área** (o clique funcionava),
o `mapa/mapa.js` tinha carregado; mas a área ficava vazia, o que só acontece se o
`mapa/mapa-render.js` **não** exportar `MapaMentalRender.montarShell`. Ou seja: o cache do
aparelho tinha uma **mistura de versões** (um arquivo novo + outro antigo) — impossível no
repositório, típico de cache parcial.

---

## 3. Causa raiz

1. **Service Worker offline-first com estratégia `cache-first`** (`sw.js`): a resposta vem do
   cache **primeiro** e a rede só revalida em segundo plano. Quem já instalou o app continua
   recebendo os arquivos antigos **até o `CACHE_NAME` mudar**.
2. **`sw.js` cacheado pelo host/CDN**: se o navegador não consegue buscar um `sw.js` novo, ele
   **nunca** percebe que existe versão nova. Um `sw.js` servido como `text/html` (por um
   catch-all de SPA) é rejeitado **em silêncio** pelo navegador.
3. **Instalação parcial**: `sw.js` só conclui o `install` se **todos** os `ESSENCIAIS` forem
   cacheados; se um falhar, a versão anterior continua ativa (o app não quebra, mas não atualiza).

---

## 4. O que foi implementado (arquivos e linhas)

### `sw.js` — assumir o controle na hora e avisar as abas
| Linha | O que faz |
|---|---|
| **19** | `const CACHE_NAME = 'notas-pwa-v46';` — **versão do cache** (sobe a cada mudança de asset) |
| **127** | `await self.skipWaiting();` no `install` — o SW novo **não espera** as abas fecharem |
| **144** | `await self.clients.claim();` no `activate` — passa a controlar as abas **já abertas** |
| **145-148** | `postMessage({ type: 'SW_ATIVADO' })` para as abas → a página sabe que há versão nova |
| **200-201** | `SKIP_WAITING` por mensagem (a página pode pedir o *skip waiting*) |

### `app.js` — "update notification" (avisa e recarrega uma única vez)
| Linha | O que faz |
|---|---|
| **1467-1511** | `installAtualizacaoPWA(App)` |
| **1471-1476** | `recarregarParaNovaVersao()` — reload **único** (`window.__notasRecarregando`) |
| **1478-1499** | `avisarNovaVersao()` — toast "**Nova versão disponível**" + botão "**Atualizar agora**" e auto-reload em 4 s |
| **1502-1531** | `verificarAtualizacaoSW()` — `updatefound`/`statechange`, `controllerchange`, mensagem `SW_ATIVADO` e checagem a cada **60 s** (sessões longas no celular) |
| **160 / 177** | chamadas no `init()` e em `installNotesFeatures()` |

### `index.html` — registro do SW robusto
- `new URL('sw.js', document.baseURI)` (caminho **real** do arquivo), `{ scope: './',
  updateViaCache: 'none' }` (ignora o cache HTTP do `sw.js`), checagem de `Content-Type`
  (avisa em vez de falhar em silêncio) e `controllerchange` recarregando **1×** — respeitando
  a trava `window.__notasRecarregando` para não haver reload duplo.

### `styles.css` — aviso de nova versão
- `.app-toast.is-update` e `.app-toast-action` (o toast volta a aceitar clique).

### `_headers` / `_redirects` — o SW nunca vem do cache nem do fallback de SPA
```
/sw.js
  Content-Type: application/javascript; charset=utf-8
  Cache-Control: no-store, no-cache, must-revalidate
  Service-Worker-Allowed: /
```
```
/sw.js          /sw.js          200
/manifest.json  /manifest.json  200
```

### `reparar.html` — reparo manual no aparelho (não apaga notas)
- Remove **Service Worker** + **caches** e reabre o app do zero.

### Regra de ouro (nunca esquecer)
> **Mudou qualquer asset cacheado (`app.js`, `styles.css`, `index.html`, `mapa/*`, `notes/*`) ⇒
> suba o `CACHE_NAME` no MESMO commit.** É o que faz o aparelho descartar o cache antigo.
> Registros: P3, P20, P61, P62, P66, P68.

---

## 5. Como conferir (e forçar) a atualização em produção

1. **No aparelho (mais rápido):** abra `https://<site>/reparar.html` → limpa SW + cache → "Abrir o app".
2. **No PC:** DevTools → **Application → Service Workers** (ver qual SW está ativo) e
   **Application → Cache Storage** (ver o nome do cache: deve terminar no `CACHE_NAME` atual).
3. **Linha de comando (confirmar o que o servidor entrega):**
   ```bash
   curl -sI https://<site>/sw.js | grep -i -E 'cache-control|content-type|service-worker-allowed'
   curl -s  https://<site>/sw.js | grep CACHE_NAME
   ```
   Esperado: `content-type: application/javascript`, `cache-control: ... no-store ...` e o
   `CACHE_NAME` mais recente.
4. **No app:** ao publicar, aparece o toast "**Nova versão disponível**" com o botão
   "Atualizar agora" (e a página recarrega sozinha em 4 s).

---

## 6. Cabeçalhos por plataforma (o `sw.js` NUNCA pode ficar em cache)

Regra geral: **`Cache-Control: no-store, no-cache, must-revalidate`** no `/sw.js`
(e garantir que ele **não** caia em nenhum fallback de SPA).

### Firebase Hosting (`firebase.json`) — exemplo pronto
```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "headers": [
      {
        "source": "/sw.js",
        "headers": [
          { "key": "Content-Type", "value": "application/javascript; charset=utf-8" },
          { "key": "Cache-Control", "value": "no-store, no-cache, must-revalidate" },
          { "key": "Service-Worker-Allowed", "value": "/" }
        ]
      },
      {
        "source": "/manifest.json",
        "headers": [
          { "key": "Content-Type", "value": "application/manifest+json" },
          { "key": "Cache-Control", "value": "no-cache" }
        ]
      },
      {
        "source": "**/*.@(js|css|html)",
        "headers": [{ "key": "Cache-Control", "value": "no-cache, must-revalidate" }]
      }
    ]
  }
}
```
- **Por que é obrigatório:** o Hosting aplica **cache longo por padrão** em arquivos estáticos
  (tipicamente `max-age=3600`). Sem a regra acima, o `sw.js` fica preso até 1 h no CDN/aparelho e
  o app **não** vê a versão nova. Confirme com `curl -sI https://<site>/sw.js | grep -i cache-control`.
- **Se você usa rewrite de SPA** (`"source": "**", "destination": "/index.html"`), declare o
  `/sw.js` **antes** dele:
  ```json
  "rewrites": [
    { "source": "/sw.js", "destination": "/sw.js" },
    { "source": "/manifest.json", "destination": "/manifest.json" },
    { "source": "**", "destination": "/index.html" }
  ]
  ```
  (o Hosting serve primeiro o arquivo estático que existe; o rewrite explícito é a garantia.)
- Depois de mudar o `firebase.json`: `firebase deploy --only hosting`.

### Cloudflare Pages (é o que este repositório usa)
- `_headers` e `_redirects` na raiz (já versionados) — o deploy do repositório já os aplica.
- **Atenção**: se existir uma regra global `/*`, o Cloudflare **concatena** o `Cache-Control`
  das duas; o `no-store` da regra do `/sw.js` prevalece (nenhum cache).

### Netlify
- `_headers` e `_redirects` na raiz (mesmo formato). Em `netlify.toml`, o equivalente é
  `[[headers]] for = "/sw.js"` com `[headers.values]`.

### Nginx
```nginx
location = /sw.js          { try_files $uri =404; add_header Cache-Control "no-store, no-cache, must-revalidate"; add_header Service-Worker-Allowed "/"; }
location = /manifest.json  { try_files $uri =404; }
location /                 { try_files $uri /index.html; }   # catch-all DEPOIS
```

### Regras que valem para qualquer host
1. `sw.js` **na raiz** do site (escopo `/`).
2. O `sw.js` **nunca** pode ser reescrito para `index.html` (rewrite/redirect/SPA fallback).
3. O `sw.js` **nunca** pode ser servido com `Content-Type: text/html`.
4. O `sw.js` **nunca** pode ficar em cache (no-store/no-cache).

---

## 7. As mudanças desta rodada

### 7.1 Notas — a última linha nunca fica atrás da barra do teclado
**Problema:** perto do fim da nota não havia **espaço de rolagem suficiente**; a linha digitada
ficava sob a barra de formatação acoplada ao teclado.

**Correção (`app.js`):**
| Linha | O que mudou |
|---|---|
| **92-96** | novas constantes `NotesPWA.FOLGA_BARRA_TECLADO = 28` e `NotesPWA.MARGEM_CURSOR_BARRA = 10` |
| **608-639** | `rolarCaretParaAcima()` agora é **adaptativo**: se o container não consegue rolar o suficiente, o `padding-bottom` do editor **cresce só o que falta** e rola de novo (garantia de a linha ficar ACIMA da barra) |
| **1151-1157** | rolagem também a cada `input` (coalescida num `requestAnimationFrame`) — em digitação rápida o poll de 250 ms podia atrasar |
| **1228** | a folga reservada passou de `altura + 12` para `altura + FOLGA_BARRA_TECLADO` |

**Teste:** `tests/toolbar_pwa.cjs` §3c-bis monta o cenário **sem folga** (conteúdo cobrindo o
container, `padding-bottom: 0`) e prova que a linha continua acima da barra e que a reserva cresce.

### 7.2 Mapa — ações rápidas FIXAS à direita na barra de formatação
**Pedido:** dois botões para criar tópico **enquanto edita no celular**, **fixos** na barra
(visíveis mesmo rolando para os lados).

**Implementação (`mapa/mapa-render.js` + `mapa/mapa.css`):**
- `ICONES.irmao` / `ICONES.filho` (o **mesmo desenho/estilo** dos outros: 16×16, traço 2).
- `renderFormatBar()` cria o grupo `div.mapa-tb-fixos` (último item da barra) com:
  - `data-mapa-acao="no-irmao"` → **Adicionar irmão**
  - `data-mapa-acao="no-filho"` → **Adicionar filho**
  (as MESMAS ações do menu do card; já abrem o tópico novo **em edição**).
- `.mapa-tb-fixos { position: sticky; right: 0; margin-left: auto; background: var(--mapa-container); }`
  — `sticky` mantém o grupo na borda direita durante a rolagem, `margin-left: auto` o encosta na
  direita quando não há rolagem, e o fundo evita que o conteúdo apareça por trás.

> ⚠️ **Observação de requisito:** o modelo do mapa tem **criar irmão** e **criar filho**
> (`criarIrmaoDe` / `criarFilhoDe`). **Não existe** "criar PAI" (envolver o nó num novo pai).
> Os dois botões foram feitos com **irmão** e **filho**; se a intenção era "pai", é preciso
> criar um comando novo no modelo (`criarPaiDe`).

**Teste:** `tests/mapa_toolbar.cjs` §7 valida que o grupo é o **último item** da barra, está
**dentro** dela, usa `position: sticky` + `right: 0`, encosta na borda direita, tem ícones
padronizados e que o botão realmente cria o tópico já em edição.

---

## 8. Checklist de release (PWA)

1. [ ] Fez as alterações e rodou `node tests/<teste>.cjs` (ou `npm test`).
2. [ ] **Subiu o `CACHE_NAME`** em `sw.js` (ex.: `notas-pwa-v47`).
3. [ ] Commit + push (o deploy automático publica).
4. [ ] Confirmou no servidor: `curl -sI <site>/sw.js` (cache-control + content-type) e
       `curl -s <site>/sw.js | grep CACHE_NAME`.
5. [ ] No aparelho: abriu `<site>/reparar.html` **ou** esperou o toast "Nova versão disponível".
6. [ ] Atualizou `arquitetura.md` e registrou o caso em `docs/PROBLEMAS-E-MITIGACOES.md`.
