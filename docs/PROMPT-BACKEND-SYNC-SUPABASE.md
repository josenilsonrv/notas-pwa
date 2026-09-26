# Prompt — Backend em Python + login OPCIONAL com persistência no Supabase (sync por WebSocket)

> Documento pronto para entregar a um agente de código. Ele descreve **tudo** o que foi
> alinhado com o dono do produto, **organizado em 10 seções de execução**: cada seção traz a
> **ideia a implementar**, o **desenho**, o **checklist**, o **pronto quando** e os **testes**.
>
> **Este documento é o contrato.** Onde houver conflito entre este prompt e uma suposição do
> agente, vale este prompt — e a dúvida deve ser levada ao dono do produto **antes** de codar.

**Índice**

- **§0** Contexto e restrições (estado atual, seams, regras do repo, decisões, invariante)
- **§1** Visão de arquitetura
- **§2** Referência técnica (contratos: arquivos, schema, HTTP, WebSocket, regras de sync, mapa de chaves)
- **§3** **Plano de execução — 10 seções, em 4 blocos**: `I` 1–3 (backend + login) · `II` 4–6 (conta + sync de dados) · `III` 7–8 (WebSocket + fila) · `IV` 9–10 (anexos + fechamento)
- **§4** Como cada seção deve fechar (Regra de Ouro / marcação / suíte)
- **§5** Riscos e mitigações
- **§6** Credenciais (`.env`) e como rodar
- **§7** Definição de pronto (DoD) global
- **§8** Ordem de execução e o que NÃO fazer

---

## 0. Contexto e restrições (valem para tudo)

### 0.1 Estado do projeto HOJE (ponto de partida)

- PWA **vanilla JS**, 100% local-first, **sem backend nenhum**. Não existe um único `.py` no
  repositório e não há dependências de runtime (só `playwright` em `devDependencies`).
- Persistência em `localStorage`, chaves com prefixo `notas-pwa-*`.
- Áreas: **Pastas** (tela raiz/workspaces) · **Notas** · **Mapa Mental**, com lado a lado opcional.
- Suíte **Node + Playwright** (`node tests/run-all.cjs`, `npm test`), hoje com
  `PASSOU 62 / FALHOU 0 / CONHECIDAS 8 / N/A 1 / TOTAL 71` (ver `docs/COMO-RODAR-TESTES.md`).
- Service Worker **offline-first** (`sw.js`, cache-first), `CACHE_NAME` = `notas-pwa-v66`.
- Ambiente já verificado: **Python 3.14.5** + `pip 26.1.2` (sem `.venv` criado ainda).

### 0.2 Seams que JÁ existem no front (é por aqui que o backend entra)

| Seam | Local | O que faz hoje |
|---|---|---|
| `notasBackend()` | `app.js` ~**[Linhas 386-394 ~]** | `listar` / `obter` / `salvar` das notas — hoje LocalStorage |
| `apiCall(endpoint, options)` | `app.js` ~**[Linhas 445-452 ~]** | "engole" toda gravação no dispositivo (o autosave do motor chama isto) |
| `gravarNotasLocais` / `salvarNotasLocais` / `marcarNotaAtiva` / `lerNotaAtiva` | `app.js` ~**[Linhas 395-444 ~]** | CRUD local da lista de notas |
| `pedirNaRede(userId, alvo, options)` | `app.js` ~**[Linhas 1692-1710 ~]** | `fetch('/api/note-assets' + alvo + '?user_id=' + userId)` — fallback de REDE (P84) |
| `notesExtraRequest(path, options)` | `notes/extras.js` **[Linha 13 ~]** | usa `/api/note-assets…?user_id=` e lê `error.detail` |
| `notesFileViewer(id)` | `notes/extras.js` ~**[Linhas 98-116 ~]** | visualizador (local para anexo `data:`; rede para o resto) |
| `MapaMentalStore` | `mapa/mapa-store.js` | CRUD local de mapas/pastas/configurações do mapa |
| `installLocalNotesStorage(App)` | `app.js` ~**[Linhas 1677-1810 ~]** | camada local que **hoje substitui** o cliente HTTP do sistema |

**Consequência de desenho:** o backend **atende exatamente o contrato que o front já espera**
(inclusive `?user_id=…` e `{"detail": "…"}` no erro) e o front só troca de "driver" quando
houver sessão. Sem sessão, o comportamento tem de ser **idêntico** ao de hoje.

### 0.3 Regras do repositório que NÃO podem ser quebradas

- Ler antes de editar: **`.clinerules/regras-de-edicao.md`** (padrão de marcação de blocos) e a
  **Bússola** `arquitetura.md`.
- Todo código novo de app entra com blocos marcados:
  `// <emoji> [INÍCIO: PREFIXO - NOME]` … `// <emoji> [FIM: PREFIXO - NOME]` (pares fechados,
  nome idêntico; emoji pelo **tipo**: 🚀 entrada/boot · 🚨 crítico · 🔄 fluxo/API · 💾 persistência ·
  ⚙️ regra · ⚡ interação · 🎨 estilo · 📊 métricas · 🧪 teste).
  **Prefixos novos propostos:** `CONTA - `, `SYNC - `, `BACKEND - `, `API - `.
- **Depois de editar**: atualizar `arquitetura.md` (linhas `~`, âncora, assinatura, arquivos novos
  e índice) — é a **Regra de Ouro**.
- **Não editar**: `notes/editor.js`, `notes/extras.js`, `notes/tables.js`, `notes/table-math.js`
  (motor do original, byte a byte). Toda extensão entra **por instalação no protótipo**
  (`install…(NotesPWA)`) ou em arquivos novos.
- **Não documentar/alterar**: `node_modules/`, `docs/*.json` (relatórios gerados).
- **Asset cacheado que mudou ⇒ `CACHE_NAME` sobe no MESMO commit** e o asset novo entra em
  `ESSENCIAIS` (P3/P20/P61/P62/P63/P71/P84).
- Comentários e nomes em **pt-BR**, no estilo do `app.js`.

### 0.4 As 9 decisões já fechadas com o dono do produto

| # | Tema | Decisão |
|---|---|---|
| 1 | Arquitetura | **Python é o único gatekeeper.** O front fala só com o Python; **só** o Python fala com o Supabase (`service_role`). O front nunca vê chave do Supabase. |
| 2 | Stack | **FastAPI + Uvicorn + Pydantic** (+ `supabase-py`; driver alternativo em `httpx` — ver R1). |
| 3 | Login | **E-mail + senha** (cadastro + login) via Supabase Auth (GoTrue). O Python cria **sessão própria** em cookie **`httpOnly`** — o token do Supabase nunca vai para o JS. |
| 4 | 1º login | **Local → nuvem automático e silencioso** (sem diálogo). Depois disso, sync **bidirecional**. |
| 5 | Escopo | **Tudo**: pastas (e o que há dentro), notas, mapas, **todas as configurações** (`notas-pwa-*`) e **anexos** (Supabase Storage). |
| 6 | Runtimes | **Dev**: FastAPI serve o PWA **e** a API no mesmo origin (`http://localhost:8000`) — sem CORS. **Produção**: PWA em host estático + API Python, com `/api/*` e `/ws` roteados. |
| 7 | Sync | **WebSocket como espinha dorsal**: ler/salvar passa por mensagens WS; HTTP fica para servir o PWA, login e upload de binário. **Fila de pendências** local obrigatória (offline-safe). |
| 8 | Credenciais | O dono do produto fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e acesso ao SQL (ou `SUPABASE_DB_URL`) num `.env` **fora do git**. |
| 9 | UI de login | **Modal `#contaDialog`** (classes de diálogo já existentes) + botão discreto **"Entrar"**. Deslogado = nada muda; logado = e-mail, estado do sync e "Sair". |

### 0.5 O invariante mais importante

> **O app SEM login continua exatamente o de hoje.** Offline, local-first, Service Worker,
> nenhuma requisição obrigatória. Os **71 testes atuais continuam passando com o backend
> desligado**. Login é uma **camada opcional** que liga a nuvem — nunca uma porta de entrada.

---

## 1. Visão de arquitetura

```
┌─────────────────────────── PWA (hoje: só local) ───────────────────────────┐
│  Pastas · Notas · Mapa Mental    +    #contaDialog ("Entrar")              │
│                                                                            │
│  Camada de persistência (driver):                                          │
│    [ sem sessão ]  LocalStorage (comportamento ATUAL, intacto)             │
│    [ com sessão ]  SyncCliente ── fila de pendências ──┐                   │
│                                                        │                   │
│  Upload de anexo / login / snapshot inicial ── HTTP ───┼───┐               │
└────────────────────────────────────────────────────────┼───┼───────────────┘
                                                         │   │
                                    wss://…/ws  (espinha)│   │  /api/*
                                                         ▼   ▼
┌────────────────────────── Backend Python (FastAPI) ────────────────────────┐
│  auth (cookie httpOnly + CSRF)   ·  repositorio (driver supabase|memory)   │
│  sync (snapshot/push HTTP)       ·  ws (hub: hello/op/ack/change/erro)     │
│  assets (Storage)                ·  /api/note-assets/* (compatível P84)    │
│  service_role  ───────────────►  Supabase (Postgres + GoTrue + Storage)   │
└────────────────────────────────────────────────────────────────────────────┘
```

**Fluxos principais**

1. **Sem login** — nada muda: leitura/escrita no `localStorage`, SW offline-first.
2. **Login** — `#contaDialog` → `POST /api/auth/login` → backend valida no GoTrue → grava
   `py_session` (cookie `httpOnly`, `SameSite`, CSRF) → front abre o `SyncCliente`.
3. **1º login** — o backend responde "conta vazia" (ou o front detecta divergência) e o
   **local sobe para a nuvem** (automático, sem diálogo) → depois, sync bidirecional.
4. **Uso normal** — cada alteração vira uma `op` no WS; o servidor responde `ack` e faz
   `change` para os **outros** aparelhos da mesma conta.
5. **Offline/quedas** — a `op` entra na **fila de pendências** (persistida) e é drenada na
   reconexão, com *backoff*; a UI mostra o estado no `#contaDialog`.

---

## 2. Referência técnica (leia ANTES de codar)

### 2.1 Estrutura de arquivos

```
backend/                          # NOVO — não entra no Service Worker
  requirements.txt                # fastapi, uvicorn[standard], pydantic, python-dotenv,
                                  # httpx, supabase  (+ pytest, pytest-asyncio em dev)
  .env.example                    # modelo do .env (o .env real fica FORA do git)
  README.md                       # como subir, endpoints, WS, deploy
  supabase/schema.sql             # tabelas + índices + RLS (colar no SQL Editor)
  app/
    __init__.py
    main.py                       # FastAPI: rotas + /ws + static do PWA + /health
    config.py                     # env + validação; modo "memory" quando não há Supabase
    seguranca.py                  # cookie de sessão, hash do token, CSRF, rate-limit simples
    supabase_cliente.py           # service_role (supabase-py) + fallback PostgREST (httpx)
    auth.py                       # /api/auth: registrar, login, logout, me
    repositorio.py                # drivers: supabase | memory (MESMA interface)
    sync/http.py                  # /api/sync/snapshot, /api/sync/push (carga inicial/fallback)
    sync/ws.py                    # /ws: hub + protocolo (hello/op/ack/change/erro/heartbeat)
    sync/regras.py                # rev, updated_at, last-write-wins, soft delete, ids
    assets.py                     # Storage + /api/note-assets/* (compatível com P84)
  tests/                          # pytest (TestClient; driver memory não usa rede)
    conftest.py · test_auth.py · test_repositorio.py · test_sync_http.py
    test_sync_ws.py · test_assets.py · test_isolamento.py

conta.js                          # NOVO (raiz, como app.js/fontes.js)
sync/sync-cliente.js              # NOVO (pasta nova, espelha a organização de mapa/ e notes/)

index.html                        # editar: botão "Entrar" + <script> dos arquivos novos
app.js                            # editar: seams conscientes de sessão
sw.js                             # editar: ESSENCIAIS + CACHE_NAME + ignorar /api e /ws
_headers · _redirects             # editar: /api/* e /ws roteados; SW nunca cacheado
package.json                      # editar: scripts test:backend / dev:backend
docs/BACKEND-SYNC.md              # NOVO: contrato resumido para operação
docs/PROBLEMAS-E-MITIGACOES.md    # editar: novas entradas P89, P90…
arquitetura.md                    # editar (Regra de Ouro): novas seções + índice
```

### 2.2 Modelo de dados no Supabase (`backend/supabase/schema.sql`)

Toda tabela de conteúdo tem `user_id uuid not null`, `updated_at timestamptz default now()`,
`rev bigint not null default 1` e `deleted_at timestamptz null` (**soft delete** — exclusão
precisa propagar entre aparelhos). Chave primária **sempre composta com `user_id`**.

| Tabela | Campos-chave | Espelha |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `email`, `criado_em` | usuário do GoTrue |
| `pastas` | `id text`, `nome`, `ordem` | `notas-pwa-mapas-pastas` (workspaces) |
| `notas` | `id text`, `pasta_id`, `nome`, `accent`, `conteudo_html` | `notas-pwa-notes` (conteúdo por nota) |
| `mapas` | `id text`, `pasta_id`, `nome`, `grafo jsonb` | `notas-pwa-mapas` + `notas-pwa-mapa-<id>` |
| `configuracoes` | `chave text`, `valor jsonb` | **todo** o resto de `notas-pwa-*` (ver 2.6) |
| `modelos` | `id text`, `tipo ('nota'\|'mapa')`, `nome`, `payload jsonb` | `notas-pwa-templates`, `notas-pwa-mapa-templates` |
| `ativos` | `id text`, `nome`, `mime`, `tamanho`, `storage_path` | anexos (binário no Storage) |
| `ativos_anotacoes` | `ativo_id`, `ranges jsonb` | destaques do visualizador |

Índices: `(user_id, updated_at desc)` em `notas`/`mapas`/`ativos`, `(user_id, ordem)` em
`pastas`, `(user_id, tipo)` em `modelos`. **RLS ligada em todas** com
`using (user_id = auth.uid()) with check (user_id = auth.uid())` — o backend usa `service_role`
(passa por cima), mas **sempre** filtra pelo `user_id` da sessão; `tests/test_isolamento.py`
prova que o usuário A nunca lê dado do usuário B.

> O SQL completo, comentado e pronto para colar, fica em `backend/supabase/schema.sql`
> (entregável da **etapa 2**).

### 2.3 Contrato HTTP

Erros **sempre** no formato `{"detail": "mensagem"}` (é o que `notesExtraRequest` já lê).

| Método | Rota | Corpo / Query | Resposta | Observação |
|---|---|---|---|---|
| `GET` | `/health` | — | `{"ok": true, "driver": "supabase\|memory"}` | liveness para deploy |
| `POST` | `/api/auth/registrar` | `{email, senha}` | `204` + cookie `py_session` | cria no GoTrue e o `profiles` |
| `POST` | `/api/auth/login` | `{email, senha}` | `204` + cookie `py_session` | rate-limit + mensagem genérica |
| `POST` | `/api/auth/logout` | — | `204` (limpa cookie) | idempotente |
| `GET` | `/api/auth/me` | — | `{id, email, criado_em}` ou `401` | usado no boot do front |
| `GET` | `/api/sync/snapshot` | `?desde_rev=` | `{rev_global, entidades: {notas: [...], mapas: [...], pastas: [...], configuracoes: [...], modelos: [...]}}` | carga inicial e fallback |
| `POST` | `/api/sync/push` | `{ops: [op, …]}` | `{acks: [...], conflitos: [...]}` | usado no 1º login (local → nuvem) |
| `POST` | `/api/note-assets/files` | `multipart file` | `{id, name, kind, size}` | anexo → Storage |
| `GET` | `/api/note-assets/files/{id}` | — | binário (ou 404 `detail`) | download/visualização |
| `GET` | `/api/note-assets/files/{id}/info` | — | `{name, kind, pages}` | visualizador |
| `GET` | `/api/note-assets/files/{id}/page` | `?index&sheet&column` | `{html}` ou `{rows, more}` | visualizador |
| `GET` | `/api/note-assets/files/{id}/page-image` | `?index` | imagem | PDF |
| `GET`/`PUT` | `/api/note-assets/files/{id}/annotations` | `{ranges: [...]}` | `{ranges: [...]}` | destaques |
| `GET`/`POST` | `/api/note-assets/templates` | `{nome, payload}` | lista / item | modelos (opcional; no PWA os modelos são locais) |

**Compatibilidade obrigatória (P84):** as rotas `/api/note-assets/…` aceitam `?user_id=<id>` no
query string. Quando houver sessão válida em cookie, **a sessão manda**; o `user_id` da query só
é aceito quando **coincide** com a sessão (senão `403`). Sem sessão → `401`.

### 2.4 Contrato WebSocket (`/ws`)

- **Autenticação no handshake** pelo **cookie de sessão** + checagem de `Origin`. Sem sessão
  válida → fechamento `4401` (código próprio, para o cliente não tentar reconectar em loop).
- Um `user_id` pode ter **N conexões** (N aparelhos/abas) — o hub agrupa por `user_id`.

**Cliente → servidor**

```jsonc
{"t":"hello","desde_rev":123}                  // "o que mudou desde o rev X?"
{"t":"op","id_local":"c1","entidade":"notas",
 "acao":"upsert","id":"n7","base_rev":12,
 "dados":{"nome":"…","pasta_id":"…","conteudo_html":"…"}}
{"t":"op","id_local":"c2","entidade":"mapas","acao":"delete","id":"m3","base_rev":4}
{"t":"ping"}
```

**Servidor → cliente**

```jsonc
{"t":"bemvindo","rev_global":130,"usuario":{"id":"…","email":"…"}}
{"t":"change","entidade":"mapas","id":"m3","rev":131,"dados":{…}}   // delta desde o hello
{"t":"ack","id_local":"c1","id":"n7","rev":131}
{"t":"conflito","id_local":"c1","id":"n7","versao_atual":{…,"rev":129}}
{"t":"erro","id_local":"c1","codigo":"sem_sessao|acesso_negado|payload_invalido","detalhe":"…"}
{"t":"pong"}
```

**Semântica**

- `ack` = operação **persistida** (rev novo). O cliente só remove a op da fila **no `ack`**.
- `change` é entregue aos **outros** sockets do mesmo `user_id` (nunca ao autor) — é o
  "o que eu escrevo no PC aparece no celular".
- `conflito` ⇒ o cliente resolve por **last-write-wins** (`updated_at`) e, se a versão local for
  a mais nova, **reenvia** a op com o `base_rev` novo.
- **Heartbeat**: `ping`/`pong` a cada 25 s; sem `pong` em 50 s ⇒ o cliente considera queda,
  fecha e reabre (com *backoff* exponencial 1 s → 30 s, com jitter).
- **Reconexão**: ao voltar, o cliente manda `hello {desde_rev: rev_global_conhecido}` e recebe
  os `change` que perdeu **antes** de drenar a fila.

### 2.5 Regras de sincronização (valem para HTTP e WS)

1. **`rev` é do servidor.** O cliente nunca inventa `rev`: envia `base_rev` (o último que
   conhece) e recebe o novo. `rev_global` por usuário (tabela `contadores` ou `max(rev)`).
2. **Uma entidade por mensagem.** `op` sempre tem `entidade` + `id`; nada de "salvar tudo".
3. **`localStorage` é a fonte da verdade enquanto offline.** A nuvem só é consultada quando há
   sessão; a UI **nunca** espera a rede para responder (escreve local e enfileira).
4. **Última escrita ganha** por `updated_at` (relógio do **servidor** quando ele persiste; se o
   do cliente for mais recente, ele reenvia). Empate de `updated_at` ⇒ vence o `rev` maior.
5. **Soft delete** (`deleted_at`) em vez de `DELETE`: exclusão precisa chegar aos outros
   aparelhos e sobreviver ao undo.
6. **Ids**: os ids locais existentes (`n7`, `mapa-…`, `pasta-geral`, `m1`) são **preservados**
   na nuvem (sem re-gerar) — é o que permite o 1º login ("local → nuvem") não duplicar nada.
7. **Fila de pendências** persistida em `notas-pwa-fila-sync`:
   `[{seq, entidade, acao, id, base_rev, dados, criado_em}]`; drenada **em ordem** (`seq`),
   uma a uma, removendo só no `ack`. Sobrevive a recarregar a página.
8. **Sem sessão, a fila não existe** — tudo continua no LocalStorage como hoje.

### 2.6 Mapa de chaves `notas-pwa-*` → destino na nuvem

| Chave local (hoje) | Destino |
|---|---|
| `notas-pwa-notes` | tabela `notas` (metadados dos chips) |
| `notas-pwa-content` + `notas-pwa-nota-<id>` + rascunhos | coluna `notas.conteudo_html` |
| `notas-pwa-nota-ativa` | `configuracoes['nota-ativa']` |
| `notas-pwa-templates` | tabela `modelos` (`tipo='nota'`) |
| `notas-pwa-mapas` (índice) | tabela `mapas` (metadados) |
| `notas-pwa-mapa-<id>` (grafo + viewport) | coluna `mapas.grafo` |
| `notas-pwa-mapa-historico-<id>` | `configuracoes['mapa-historico-<id>']` (cap 100, como hoje) |
| `notas-pwa-mapas-pastas` | tabela `pastas` |
| `notas-pwa-pasta-ativa` / `notas-pwa-area-ativa` | `configuracoes` |
| `notas-pwa-mapa-templates` | tabela `modelos` (`tipo='mapa'`) |
| `notas-pwa-mapa-atalhos` / `notas-pwa-mapa-toolbar-order` / `notas-pwa-mapa-grade` | `configuracoes` |
| `notas-pwa-split` (lado a lado + ratio) | `configuracoes['split']` |
| `notas-pwa-tema` (ThemeManager) | `configuracoes['tema']` |
| ordem/recolhimento da toolbar de Notas | `configuracoes['toolbar-notas-*']` |
| anexos em `data:` URL (hoje) | tabela `ativos` + **Supabase Storage** |
| `notas-pwa-fila-sync` (**nova**) | **só local** — nunca vai para a nuvem |

> Regra de ouro do mapa: se a chave **não** estiver aqui, ela vai para `configuracoes` com o
> **próprio nome**, em `valor jsonb`. Nada de "esquecer" uma configuração (a decisão nº 5 é
> "tudo").

---

## 3. Plano de execução por seções (faça nesta ordem, em blocos)

O trabalho está dividido em **10 seções de execução**. Cada seção é um incremento
**utilizável e testável** — não uma "parte de um arquivo".

> **Recomendação de ritmo (importante):** implemente **em blocos**, e **não** uma seção por vez
> quando elas forem do mesmo bloco. O bloco só é considerado pronto quando **todas** as suas
> seções fecharem o "Pronto quando" e a suíte afetada estiver verde.
>
> | Bloco | Seções | Entrega ao final do bloco |
> |---|---|---|
> | **I** | **1–3** | Backend Python de pé: o app roda igual a hoje e o backend responde `/health`, tem banco (Supabase real), login funcionando e sessão em cookie. **Nada muda para quem não loga.** |
> | **II** | **4–6** | Conta visível no app (`#contaDialog`), persistência completa na nuvem (pastas, notas, mapas, configurações, modelos) com carga inicial **local → nuvem**. |
> | **III** | **7–8** | Sync **tempo real por WebSocket** + fila de pendências offline-safe; dois aparelhos se enxergam. |
> | **IV** | **9–10** | Anexos no Storage (funcionando em qualquer aparelho) + fechamento: Service Worker, deploy, docs, bússola e suíte completa. |
>
> **Regra entre blocos:** ao fechar um bloco, rode a suíte completa (`npm run test:rapido`) e
> **pare** para o dono do produto validar antes de começar o próximo. Nenhuma falha nova é
> aceitável fora de `FALHAS_CONHECIDAS` (P83).

---

### Seção 1 — Fundação do backend (o esqueleto que sobe e responde)

**Ideia:** criar o backend FastAPI que **roda sem credencial nenhuma** e roda **com** o Supabase,
com a mesma interface nos dois casos. Sem isso, nada mais é testável.

- **Entregáveis:** `backend/` completo de esqueleto, `.venv`, `requirements.txt`, `.env.example`,
  `config.py`, `repositorio.py` (**driver `memory`** primeiro, interface fechada), `main.py`
  (`/health` + static do PWA), `README.md`, `package.json` com `dev:backend`/`test:backend`.
- **Checklist**
  1. `.venv` criado com **Python 3.14.5** e dependências instaladas (ver **R1** se algum wheel
     falhar); congelar em `requirements.txt`.
  2. `config.py` lê o `.env` (nada de segredo no código) e expõe
     `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY`, `SESSAO_SEGREDO`, `ORIGENS_PERMITIDAS`,
     `PORTA=8000`, `DRIVER=supabase|memory` (auto: `memory` se faltar credencial).
  3. `repositorio.py` com a interface ÚNICA:
     `listar(entidade, user_id,since_rev)` · `obter(entidade,user_id,id)` · `salvar(entidade,user_id,id,dados,base_rev)`
     · `excluir(entidade,user_id,id)` · `rev_global(user_id)` — driver `memory` funcional.
  4. `main.py` com `/health` (`{ok, driver}`) e o **static do PWA** em `GET /` (serve `index.html`,
     `app.js`, `notes/`, `mapa/`, `fontes.js`…). **Sem CORS** (mesmo origin).
  5. Blocos marcados: `// 🔄 [INÍCIO: BACKEND - CONFIG]`, `… - REPOSITÓRIO`, `… - APP/ROTAS`,
     `// 🚀 [INÍCIO: BACKEND - BOOT (uvicorn)]` (pares fechados).
- **Pronto quando:** `python -m uvicorn backend.app.main:app --port 8000` sobe; `GET /health`
  devolve `{"ok":true,"driver":"memory"}`; abrir `http://localhost:8000/` mostra o PWA atual
  **funcionando igual** (todos os dados locais intactos); `python -m pytest backend/tests` verde.
- **Testes:** `backend/tests/test_repositorio.py` (CRUD + rev + soft delete + isolamento por
  `user_id`) e um `test_health.py`.
- **Não fazer ainda:** login, WS, Supabase real, qualquer mudança no front.

---

### Seção 2 — Supabase real: schema, RLS e driver oficial

**Ideia:** trocar o `memory` pelo Supabase **de verdade**, entregando o SQL pronto e validando
RLS/isolamento com as credenciais fornecidas (decisão nº 8).

- **Entregáveis:** `backend/supabase/schema.sql` (tabelas + índices + RLS + `contadores` para
  `rev_global`), `supabase_cliente.py` (`service_role`), driver `supabase` no `repositorio.py`,
  `test_isolamento.py` e um `backend/scripts/migrar.py` (aplica o SQL / confere as tabelas).
- **Checklist**
  1. Colar `schema.sql` no SQL Editor (ou rodar `migrar.py`) e **confirmar** as 8 tabelas.
  2. Ligar RLS em todas com `user_id = auth.uid()` e criar o `contadores` com função
     `proximo_rev(user_id)` atômica (evita `rev` duplicado com dois aparelhos simultâneos).
  3. `supabase_cliente.py` com `service_role` **só no backend**; nenhuma chave vai para o front
     nem para o Service Worker (conferir: a chave não aparece em nenhum arquivo servido).
  4. Driver `supabase` implementando a MESMA interface da seção 1 (nada de código duplicado:
     um `if` só na fábrica do driver).
  5. `migrar.py` idempotente (pode rodar 2× sem quebrar).
- **Pronto quando:** com `.env` preenchido, `/health` devolve `{"ok":true,"driver":"supabase"}`;
  `pytest` passa **nos dois drivers**; `test_isolamento.py` prova que A não lê/escreve dado de B
  (inclusive tentando `id` de B com `user_id` de A → `403`/vazio, nunca dado de B).
- **Testes:** `test_repositorio.py` parametrizado por driver + `test_isolamento.py`.
- **Não fazer ainda:** login no front, WS, anexos.

---

### Seção 3 — Login: e-mail + senha, sessão em cookie `httpOnly`

**Ideia:** autenticação completa no backend (decisão nº 3), sem tocar no front ainda. O Python é
quem fala com o GoTrue e o token do Supabase **nunca** chega ao JavaScript.

- **Entregáveis:** `auth.py`, `seguranca.py`, `POST /api/auth/registrar|login|logout`,
  `GET /api/auth/me`, tabela `sessoes` (ou JWT assinado próprio em cookie) e os testes de auth.
- **Checklist**
  1. `registrar` cria o usuário no GoTrue (`service_role`) e grava `profiles` (mesmo `id`).
  2. `login` valida credenciais no GoTrue e **emite sessão própria**: cookie **`py_session`**
     com `HttpOnly`, `SameSite=Lax` (em produção, `Secure`; com domínios diferentes,
     `SameSite=None; Secure`), `Path=/`, validade configurável.
  3. **Anti-CSRF**: token por sessão exigido em `POST/PUT/DELETE` (header `X-CSRF`), também
     entregue por `GET /api/auth/me`; sem token válido → `403`.
  4. **Rate-limit** simples no login/registro (ex.: 5 tentativas por minuto por IP+e-mail) e
     mensagem **genérica** ("E-mail ou senha inválidos") — nunca dizer se o e-mail existe.
  5. Sessão guarda `user_id` + `email`; `logout` invalida; `me` devolve `401` quando não há
     sessão (é o que o front usa para decidir "logado ou não").
  6. Nada de senha em log; `SESSAO_SEGREDO` vem do `.env` (documentado no `.env.example`).
- **Pronto quando:** fluxo completo por HTTP funciona: registrar → `me` → logout → `me` = `401`;
  login com senha errada = `401` com `{"detail":"E-mail ou senha inválidos"}`; login sem `X-CSRF`
  em rota de escrita = `403`; o **usuário criado aparece no Auth do Supabase** e o `profiles`
  também; `pytest backend/tests/test_auth.py` verde.
- **Testes:** `test_auth.py` (registrar/login/logout/me, cookie `HttpOnly`, CSRF, rate-limit,
  senha errada, e-mail inexistente com resposta idêntica à senha errada).
- **Não fazer ainda:** qualquer coisa no front (isso é a seção 4), WS, anexos.

---

### Seção 4 — Front: botão "Entrar" + `#contaDialog` (sem sync ainda)

**Ideia:** dar rosto ao login (decisão nº 9) — e **provar** que, deslogado, o app está idêntico
ao de hoje (o invariante do §0.5).

- **Entregáveis:** `conta.js` (novo módulo, prefixo `CONTA - `), botão "Entrar" no `index.html`,
  registro no `sw.js` (asset novo + bump do `CACHE_NAME`), estilos em `styles.css`, testes.
- **Checklist**
  1. `conta.js` instala por `installConta(NotesPWA)` (**mesmo contrato** de `installMapaMental`),
     chamado em `installNotesFeatures()` — sem editar o motor.
  2. **Botão "Entrar"** discreto no topo (mesma linguagem visual dos botões existentes,
     `aria-label` correto); deslogado = "Entrar"; logado = e-mail abre o diálogo.
  3. **`#contaDialog`** com as classes de diálogo já validadas pelo projeto
     (`.notes-extra-dialog`, `.notes-template-help` — como faz o "Modelos" do mapa, P82):
     estados **Entrar** / **Criar conta**, mensagem de erro inline, foco preso, fecha no
     `Esc` e no **clique fora** (padrão P67).
  4. **Estado logado**: e-mail, estado do sync (placeholder "—" nesta seção), botão "Sair".
  5. `conta.js` guarda **só um espelho do estado** (`window.notasConta = {logado, email, csrf}`);
     nenhum token no JS — o cookie `HttpOnly` faz o resto (`credentials: 'same-origin'`).
  6. Asset novo ⇒ `ESSENCIAIS` + **`CACHE_NAME` v66 → v67** (P3/P20/P61/P62).
  7. `arquitetura.md`: nova seção **`# Nome do Arquivo: conta.js`** e atualização das linhas de
     `index.html`/`sw.js`/`styles.css`.
- **Pronto quando:** com o backend no ar, o usuário **cria conta, entra e sai** pelo diálogo;
  aparecendo "e-mail X" quando logado; **com o backend desligado**, o botão não quebra nada (erro
  amigável "Não foi possível falar com o servidor") e **o app continua 100% utilizável offline**.
- **Testes:** `tests/conta_login.cjs` (novo): deslogado o app abre e edita normalmente; abrir o
  diálogo, entrar, ver o e-mail, sair, voltar a deslogado; erro de credencial mostra mensagem;
  `Esc`/clique fora fecham.
- **Não fazer ainda:** sincronizar dado algum (seções 5–6), WS (7–8), anexos (9).

---

### Seção 5 — Sincronização de dados: pastas e notas na nuvem (via HTTP)

**Ideia:** ligar a persistência de verdade, começando pelo **núcleo** (pastas + notas). Ainda por
HTTP (`snapshot`/`push`), para depois o WS (seção 7) assumir o caminho quente sem reescrever nada.

- **Entregáveis:** `sync/http.py` (`/api/sync/snapshot`, `/api/sync/push`), `sync/regras.py`
  (`rev`, `updated_at`, LWW, soft delete), driver remoto nos seams do front e testes.
- **Checklist**
  1. **Backend**: `snapshot` devolve TODAS as entidades do usuário com `rev`/`updated_at`
     (aceita `?desde_rev=` para delta); `push` recebe `{ops:[…]}` e devolve `{acks, conflitos}`,
     aplicando a regra 4 do §2.5 (LWW + `proximo_rev` atômico).
  2. **Front**: `notasBackend()` passa a ter **dois drivers** — local (sem sessão) e remoto (com
     sessão). O remoto: **escreve local primeiro** (a UI nunca bloqueia) e **enfileira** a op.
  3. `apiCall()` deixa de "engolir" a gravação quando há sessão, mas **continua** o caminho local
     como cache (é isso que mantém o app offline).
  4. **Pastas**: CRUD do `MapaMentalStore` (pastas) passa a gerar `op` de `entidade:"pastas"`.
  5. **Ids preservados** (§2.5-6): nada de re-gerar id ao subir.
  6. **Blocos marcados** no front: `// 💾 [INÍCIO: SYNC - DRIVER DE PERSISTÊNCIA]`,
     `// 🔄 [INÍCIO: SYNC - SNAPSHOT/PUSH]`; no backend, `// 🔄 [INÍCIO: API - SYNC HTTP]`.
- **Pronto quando:** logado em dois navegadores (mesma conta), criar uma nota e uma pasta no 1º e
  ver no 2º após recarregar; deslogado, tudo continua igual; o conteúdo é encontrado **no
  Supabase** (conferir no Table Editor); `pytest` + `tests/sync_snapshot.cjs` verdes.
- **Testes:** `backend/tests/test_sync_http.py` (delta por `desde_rev`, LWW, soft delete,
  isolamento) e `tests/sync_snapshot.cjs` (logar, editar, recarregar, conferir; deslogar e
  conferir que o local assume).
- **Não fazer ainda:** WS (o push aqui é HTTP de propósito — ver seção 7), anexos.

---

### Seção 6 — Sincronização completa: mapas, configurações, modelos e 1º login

**Ideia:** fechar o escopo "tudo" (decisão nº 5) e implementar a decisão nº 4: no **primeiro
login**, o conteúdo do aparelho **sobe automaticamente** para a conta, **sem diálogo**.

- **Entregáveis:** `entidades` de `mapas`, `configuracoes` e `modelos` no backend; no front, a
  varredura de `notas-pwa-*` (§2.6) e a rotina de carga inicial `enviarLocalParaNuvem()`.
- **Checklist**
  1. **Mapas**: índice (`notas-pwa-mapas`) + grafo completo (`mapas.grafo`) e **viewport** por
     mapa (em `configuracoes['viewport-<id>']` ou dentro do grafo — decidir e documentar).
  2. **Configurações**: varrer TODAS as chaves `notas-pwa-*` do §2.6 e subir como
     `configuracoes` (`valor jsonb`), com o nome da chave preservado.
  3. **Modelos**: `notas-pwa-templates` → `modelos(tipo='nota')`;
     `notas-pwa-mapa-templates` → `modelos(tipo='mapa')`.
  4. **1º login (local → nuvem, silencioso)**: ao detectar sessão nova com conta **vazia** (ou
     `rev_global = 0`), subir TUDO o que existe localmente em um `push` em lote (paginado) e
     **mostrar progresso discreto** no `#contaDialog` ("Enviando seus dados…"), sem popup.
  5. **Conta não vazia**: NÃO sobrescrever — aplicar a regra 4 (LWW por `updated_at`/`rev`) e
     deixar o `snapshot` trazer o que existe (a decisão nº 4 é "depois disso, bidirecional").
  6. **Nada de perder chave nova**: um teste que compara a lista de chaves `notas-pwa-*` do app
     com o mapa do §2.6 e **falha** se aparecer chave não mapeada (proteção contra "esquecemos
     uma configuração").
- **Pronto quando:** logar num aparelho com dados e ver **tudo** (pastas, notas, mapas,
  configurações, modelos) no outro aparelho e no Supabase; a toolbar/atalhos/tema/pasta ativa do
  1º aparelho aparecem no 2º; `tests/sync_completo.cjs` verde e o teste de "chave não mapeada" verde.
- **Testes:** `tests/sync_completo.cjs` (mapas + configurações + modelos + 1º login), e no backend
  `test_sync_http.py` estendido para as novas entidades.
- **Não fazer ainda:** WS e fila (seção 7–8) e anexos (9).

---

### Seção 7 — WebSocket: hub, protocolo e tempo real (backend)

**Ideia:** o sync passa a ser **tempo real** (decisão nº 7): o que é salvo num aparelho aparece no
outro **sem recarregar**. Esta seção entrega o **lado servidor** funcionando e testado.

- **Entregáveis:** `sync/ws.py` (`/ws`), hub por `user_id`, protocolo do §2.4 e testes de WS.
- **Checklist**
  1. Handshake autenticado por **cookie de sessão** + `Origin`; sem sessão → fechamento `4401`.
  2. Hub: `dict[user_id] → set[WebSocket]`; `bemvindo` com `rev_global`; `change` para os
     **outros** sockets do mesmo usuário (nunca para o autor).
  3. `op` → valida payload (Pydantic) → persiste pelo `repositorio` (mesma regra do `push` HTTP —
     **uma única** função de aplicação de op, reaproveitada pelo HTTP e pelo WS) → `ack` com `rev`
     novo → broadcast de `change`.
  4. `conflito` quando `base_rev` < rev atual; `erro` com `codigo` para payload inválido/acesso
     negado (inclui tentativa de mexer em id de outro usuário).
  5. **Heartbeat** `ping`/`pong` (25 s) e fechamento de sockets mortos; **limpeza** do hub no
     `disconnect` (nenhum vazamento de conexão).
  6. `hello {desde_rev}` devolve os `change` perdidos (delta por `rev`) — é o que garante que
     reconexão não perde dado.
- **Pronto quando:** `pytest backend/tests/test_sync_ws.py` verde, cobrindo: dois sockets da mesma
  conta (o 2º recebe `change` do 1º, e o 1º **não** recebe eco); `ack` com rev crescente;
  `conflito` com `base_rev` velho; `hello` trazendo delta; socket sem sessão fechado com `4401`;
  socket de outro usuário **não** recebe nada.
- **Testes:** `test_sync_ws.py` (usa `TestClient.websocket_connect`), sem depender de navegador.
- **Não fazer ainda:** a fila/cliente no front (seção 8) — esta seção é só o servidor.

---

### Seção 8 — `SyncCliente` no front: fila de pendências, reconexão e indicador

**Ideia:** fechar o sync como **espinha dorsal** (decisão nº 7) do lado do cliente: tudo passa a
ser op enfileirada, com reconexão e **zero perda** em queda de rede.

- **Entregáveis:** `sync/sync-cliente.js` (novo, prefixo `SYNC - `), entrada em `index.html`,
  `ESSENCIAIS` + bump do `CACHE_NAME` (v67 → v68), estado no `#contaDialog` e testes.
- **Checklist**
  1. Conectar em `wss?://<mesmo host>/ws` com `credentials` (cookie); **sem cookie, nem tenta**
     (deslogado não abre socket — offline intacto).
  2. **Fila de pendências** em `notas-pwa-fila-sync` (§2.5-7): `enfileirar(op)` **sempre** grava
     no storage **antes** de enviar; `drenar()` envia em ordem e remove **só** no `ack`.
  3. **Reconexão** com *backoff* exponencial (1 s → 30 s + jitter) e `hello {desde_rev}` ao voltar,
     aplicando os `change` perdidos antes de drenar.
  4. **Aplicação de `change`** no front: passar pelos **mesmos** pontos de entrada que o app já usa
     (`MapaMentalStore.salvarGrafo`, `gravarNotasLocais`, `salvarNotasLocais`, `aplicarArea`…) —
     **nunca** mexer no DOM direto por fora do render; depois de aplicar, re-renderizar como faz
     qualquer ação do app (`renderArea()`/`renderNotesNav()`).
  5. **Indicador de estado** no `#contaDialog`: `Sincronizado` · `Enviando N alterações…` ·
     `Offline — N na fila` · `Sessão expirada (entrar novamente)`.
  6. **Guardas**: uma única instância do cliente; `visibilitychange`/`online` disparam reconexão;
     `beforeunload` não perde a fila (ela já está no storage).
- **Pronto quando:** `tests/sync_websocket.cjs` verde: com o backend em driver `memory`, abrir
  **duas páginas** da mesma conta, editar na 1ª e ver o texto aparecer na 2ª **sem recarregar**;
  derrubar o backend, editar (a fila cresce e o indicador mostra "Offline — N na fila"), religar o
  backend e ver a fila drenar e as duas páginas convergirem; deslogado, **nenhum** socket é aberto.
- **Testes:** `tests/sync_websocket.cjs` (tempo real, fila, reconexão, convergência) e a suíte de
  regressão do modo local.
- **Não fazer ainda:** anexos (seção 9).

---

### Seção 9 — Anexos no Supabase Storage (funcionando em qualquer aparelho)

**Ideia:** fechar a lacuna real de hoje (P84): anexo adicionado no PC **não abre** no celular
porque vira `data:` URL. Com o Storage, o anexo passa a ser um objeto da conta.

- **Entregáveis:** `assets.py` (upload/download + `/api/note-assets/*` completo), bucket no
  Supabase, `notesExtraRequest`/`notesFileViewer` usando a rede (o caminho de rede **já existe**,
  ver seams do §0.2), e testes.
- **Checklist**
  1. Bucket privado `anexos` + política de acesso por `user_id` (pasta `user_id/…`); o backend
     assina/serve com `service_role` — o cliente **nunca** recebe chave do Storage.
  2. `POST /api/note-assets/files` grava no Storage + linha em `ativos` e devolve
     `{id, name, kind, size}` (o **mesmo** formato que `notes/extras.js` já espera).
  3. `GET /files/{id}` (binário), `/info` (`{name, kind, pages}`), `/page` e `/page-image`
     (visualizador) e `/annotations` (GET/PUT) — contrato do §2.3, com `?user_id=` aceito
     (e validado contra a sessão).
  4. **Sem Storage configurado**, o app continua com o comportamento local atual (`data:` URL) —
     nada quebra; o upload remoto só é usado com sessão.
  5. Anexo em nota: o HTML da nota guarda `data-note-asset="<id>"` e a URL passa a ser
     `/api/note-assets/files/<id>` (hoje é `data:`); a migração é feita pela `op` de `notas`
     (o conteúdo é texto — nada de migração separada).
  6. `storage_path` e `mime` **nunca** vão para o HTML da nota (só o id).
- **Pronto quando:** `tests/notes_anexos_nuvem.cjs` verde: logado, subir uma imagem e um PDF numa
  nota, recarregar (limpar o cache local) e **ver os dois abrindo**; o visualizador de arquivo
  mostra a página (`/page`) e o destaque salva via `/annotations`; deslogado, o comportamento
  antigo (P84) permanece idêntico.
- **Testes:** `backend/tests/test_assets.py` (upload/download/`info`/`page`/`annotations`,
  isolamento entre usuários e recusa de `user_id` divergente) + `tests/notes_anexos_nuvem.cjs`.
- **Não fazer ainda:** OCR/extração avançada de PDF/Word (fica para depois; se `/info` não souber
  o tipo, responder `kind:'arquivo'` e oferecer download).

---

### Seção 10 — Fechamento: Service Worker, deploy, docs e blindagem

**Ideia:** transformar tudo isso em algo **publicável e sustentável**: nada de cache servindo API,
documentação atualizada e a suíte inteira verde.

- **Entregáveis:** `sw.js` ajustado, `_headers`/`_redirects`, `docs/BACKEND-SYNC.md`,
  `docs/PROBLEMAS-E-MITIGACOES.md` (P89+), `arquitetura.md` completo, `README.md` e a suíte final.
- **Checklist**
  1. **`sw.js`**: o handler de `fetch` **ignora `/api/` e `/ws`** (hoje é cache-first e
     interceptaria tudo); `ESSENCIAIS` com `conta.js`, `sync/sync-cliente.js` e bump final do
     `CACHE_NAME` (v68 → v69 ou o próximo livre).
  2. **`_headers`**: `/api/*` e `/ws` **sem cache** e sem fallback de SPA; `/sw.js` continua
     `no-store, no-cache, must-revalidate` (P63).
  3. **`_redirects`**: `/api/*` → backend; `/ws` → backend. Documentar no `docs/BACKEND-SYNC.md`
     como apontar para o host do Python (Render/Fly/Railway ou o escolhido).
  4. **Blindagem visível** no padrão P62: se `/api/auth/me` falhar, **não** quebrar o boot; se o
     sync falhar repetidamente, mostrar aviso discreto (nunca "tela vazia").
  5. **`docs/BACKEND-SYNC.md`**: contrato HTTP/WS resumido, como rodar local, como aplicar o
     `schema.sql`, como fazer deploy, e o que fazer se o sync "travar" (checklist de diagnóstico).
  6. **`docs/PROBLEMAS-E-MITIGACOES.md`**: entradas novas (P89, P90…) com sintoma/causa/correção de
     cada armadilha encontrada (ex.: cookie + CORS, cache do SW em `/api`, rev duplicado).
  7. **`arquitetura.md`**: seções novas (`conta.js`, `sync/sync-cliente.js`, `backend/`), índice,
     linhas `~`, âncoras e assinaturas — **Regra de Ouro** fechada, sem marcador órfão.
  8. **Suíte completa**: `node tests/run-all.cjs --jobs=auto` → `RESULTADO: SEM FALHAS`;
     `python -m pytest backend/tests` verde; sem falha nova fora de `FALHAS_CONHECIDAS`.
- **Pronto quando:** o app é publicado em host estático com a API no host do Python, funciona
  **offline** e funciona **logado**; um aparelho novo (cache limpo) faz login e vê tudo; a suíte e
  o pytest estão verdes; a documentação permite que outra pessoa suba o ambiente sem ajuda.
- **Testes:** os novos (`conta_login`, `sync_snapshot`, `sync_completo`, `sync_websocket`,
  `notes_anexos_nuvem`, `modo_local_sem_backend`, `backend_python`) + a suíte completa.

---

### Resumo das 10 seções

| Seção | Nome | Bloco | Depende de |
|---|---|---|---|
| 1 | Fundação do backend | I | — |
| 2 | Supabase real: schema, RLS e driver | I | 1 |
| 3 | Login (e-mail + senha, cookie `httpOnly`) | I | 2 |
| 4 | Front: botão "Entrar" + `#contaDialog` | II | 3 |
| 5 | Sync de dados: pastas e notas (HTTP) | II | 3 |
| 6 | Sync completo + 1º login (local → nuvem) | II | 5 |
| 7 | WebSocket (backend) | III | 5, 6 |
| 8 | `SyncCliente` (fila, reconexão, indicador) | III | 7 |
| 9 | Anexos no Storage | IV | 3, 6 |
| 10 | Fechamento: SW, deploy, docs | IV | todas |

---

## 4. Como cada seção deve fechar (obrigatório)

1. **Antes de codar**: ler `.clinerules/regras-de-edicao.md` e localizar na Bússola os blocos que
   serão tocados (usar `[Linhas XX-YY ~]` — **nunca** pedir o arquivo inteiro nem reescrevê-lo).
2. **Marcação**: todo bloco novo/alterado em par fechado com o **MESMO** nome e o emoji do tipo.
3. **Validação local** (na ordem):
   ```bash
   node --check <cada .js tocado>
   node tests/<teste do que mudou>.cjs        # segundos
   python -m pytest backend/tests -q          # quando houver backend
   ```
4. **Suíte** ao fechar o bloco/seção: `npm run test:rapido` → `RESULTADO: SEM FALHAS`. Se aparecer
   falha nova: investigar (isolado → `git stash` para ver se é pré-existente, como no **P41**) e
   registrar em `docs/PROBLEMAS-E-MITIGACOES.md`. Só entra em `FALHAS_CONHECIDAS` se for
   **determinística e explicada** (P83).
5. **Regra de Ouro**: atualizar `arquitetura.md` — linhas `~`, âncoras, assinaturas, arquivos
   novos, índice — e conferir que não sobrou marcador órfão:
   ```powershell
   Select-String -Path <arquivo> -Pattern 'CIO:|\[FIM:'   # contagem INÍCIO == FIM
   ```
6. **Cache**: se algum asset cacheado mudou, `CACHE_NAME` sobe **no mesmo commit** e o asset novo
   entra em `ESSENCIAIS` (P3/P20/P61/P62/P63).
7. **Testes novos entram na suíte**: `tests/*.cjs` novo é chamado pelo `run-all.cjs`; o pytest entra
   via o wrapper `tests/backend_python.cjs`. Todo teste novo tem o par file-level
   `// 🧪 [INÍCIO: TESTE - NOME DO ARQUIVO]` … `// 🧪 [FIM: …]`.

---

## 5. Riscos e mitigações

| # | Risco | Mitigação |
|---|---|---|
| **R1** | Python **3.14.5** é muito novo: algum wheel de `pydantic-core`/`supabase` pode não existir | O `repositorio.py` nasce com driver `httpx` puro (PostgREST + GoTrue via REST) para não travar; testar a instalação **na seção 1** e reportar o que for preciso. Nunca fixar versão que não instala. |
| **R2** | **Service Worker cacheando `/api`** (sintoma: login "não pega", dados velhos) | Seção 10: `sw.js` ignora `/api/` e `/ws`; bump do cache; `pwa_service_worker.cjs` estendido. |
| **R3** | **CORS/cookies** quando API e PWA ficam em domínios diferentes | Preferir **mesmo origin** (decisão nº 6). Se separar: `SameSite=None; Secure`, `allow_credentials` e `ORIGENS_PERMITIDAS` explícitas (nunca `*` com credenciais). |
| **R4** | **Rev duplicado** com dois aparelhos salvando ao mesmo tempo | `proximo_rev(user_id)` **atômico** no Postgres (seção 2) + `conflito`/LWW no protocolo. |
| **R5** | **Duplicação no 1º login** | Ids preservados (§2.5-6) + regra "conta vazia → sobe tudo; conta não vazia → LWW" (seção 6), com teste dedicado. |
| **R6** | **Perda de dado offline** | Fila **persistida**, removida só no `ack`; `hello {desde_rev}` recupera o delta; nunca "salvar tudo por cima". |
| **R7** | **Regressão no modo local** (o app é offline-first e isso não pode mudar) | `tests/modo_local_sem_backend.cjs` obrigatório + suíte completa a cada bloco. |
| **R8** | **Chave do Supabase vazando para o front** | `service_role` só no backend; verificação por `Select-String` no repositório ao fechar cada bloco. |
| **R9** | **Cookie `HttpOnly` + PWA instalado** (standalone) | Testar o login no **PWA instalado** (não só na aba) antes de fechar o bloco II; documentar se o WebView exigir `SameSite=Lax`. |
| **R10** | O escopo "tudo" (decisão nº 5) esquecer uma configuração | O teste de "chave `notas-pwa-*` não mapeada" (seção 6, item 6) falha de propósito. |

---

## 6. Credenciais (`.env`) e como rodar

**O dono do produto fornece** o arquivo `backend/.env` (**fora do git** — conferir `.gitignore`):

```env
SUPABASE_URL=https://<projeto>.supabase.co
SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>       # NUNCA vai para o front
SUPABASE_BUCKET_ANEXOS=anexos
SESSAO_SEGREDO=<string longa aleatória>
ORIGENS_PERMITIDAS=http://localhost:8000,https://<host-do-pwa>
PORTA=8000
DRIVER=supabase                                 # ou "memory"
```

`backend/.env.example` entra no git **sem valores**. Se `SUPABASE_*` faltarem, o backend sobe em
`DRIVER=memory` (útil para dev e para a suíte) e avisa no `/health`.

**Rodar (dev)**

```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --port 8000 --reload   # PWA + API no mesmo origin
# abrir http://localhost:8000/
```

**Rodar a suíte** (o Playwright continua subindo o servidor estático dele quando o teste não
precisa do backend — por isso os 71 testes atuais não mudam):

```powershell
node tests/run-all.cjs --jobs=auto     # ou npm run test:rapido
python -m pytest backend/tests -q
```

---

## 7. Definição de pronto (DoD) global

O trabalho só está concluído quando **tudo** abaixo for verdade:

1. **Deslogado**: o app é idêntico ao de hoje (offline, local-first, sem nenhuma requisição
   obrigatória) e a suíte completa passa **com o backend desligado**.
2. **Logado**: criar conta, entrar, sair; sessão em cookie `HttpOnly` + CSRF; nada de token no JS.
3. **Persistência total**: pastas, notas, mapas, **todas as configurações** e **anexos** na conta
   (decisão nº 5), verificável no Supabase.
4. **1º login**: local → nuvem automático, silencioso e **sem duplicar** (ids preservados).
5. **Tempo real**: dois aparelhos convergem **sem recarregar**; queda de rede **não perde** nada
   (fila persistida + `hello`/delta).
6. **Isolamento**: nenhum usuário vê dado de outro (testes de isolamento no backend).
7. **Blindagem**: API fora do ar ⇒ aviso amigável, app utilizável, nada de tela vazia (padrão P62).
8. **Higiene**: `CACHE_NAME` bumpado, `ESSENCIAIS` atualizado, `docs/BACKEND-SYNC.md` e
   `docs/PROBLEMAS-E-MITIGACOES.md` (P89+) escritos, `arquitetura.md` atualizado, sem marcador
   órfão, `node --check` limpo, suíte + pytest verdes.

---

## 8. Ordem de execução e o que NÃO fazer

- **Ordem**: seções **1 → 10**, em **blocos I (1–3) · II (4–6) · III (7–8) · IV (9–10)**, parando
  ao fim de cada bloco para validação do dono do produto.
- **Regra de dependência**: **não** comece a seção 7 antes de a 6 fechar (o WS reaproveita a mesma
  função de aplicação de op do `push` HTTP); **não** comece a 9 antes de a 3 e a 6 fecharem.
- **NÃO faça**:
  - editar o motor de notas (`notes/*.js`) — a extensão é sempre por `install…(NotesPWA)`;
  - colocar chave do Supabase no front, no `sw.js` ou em qualquer arquivo servido;
  - guardar token de sessão em `localStorage`/JS (é cookie `HttpOnly`);
  - fazer o login virar obrigatório, esconder dados locais ou exigir rede para o app abrir;
  - reescrever arquivos inteiros para "ajustar linhas" (trabalhe **por blocos**, com `[Linhas XX-YY ~]`);
  - deixar `CACHE_NAME` sem bump quando asset cacheado mudar;
  - commitar `backend/.env`;
  - mexer em `docs/*.json` (relatórios gerados) nem em `node_modules/`.
- **Ao final de cada seção**, entregar no relatório: o que foi implementado, os comandos rodados,
  o resultado da suíte, os problemas encontrados (para virar P8x) e o "Pronto quando" conferido.

---

> **Dúvidas que o agente deve PERGUNTAR ao dono do produto** (não decidir em silêncio): o viewport
> do mapa vai dentro do `grafo` ou em `configuracoes`?; o histórico do mapa (cap 100) sobe para a
> nuvem ou fica local?; qual o limite de tamanho por anexo (limite do bucket)?; o `#contaDialog`
> deve mostrar "Última sincronização" com data/hora?

