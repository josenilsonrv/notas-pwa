# Backend + Sync (login opcional na conta) — guia de operação

> **Regra de ouro:** o PWA é **local-first**. Sem login e com o backend desligado, o app é
> **exatamente** o de hoje (LocalStorage, offline, Service Worker). Tudo aqui é **opcional**.

## 1. Como rodar (dev, origem única)

```powershell
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
python -m uvicorn backend.app.main:app --port 8000 --reload   # ou: npm run dev:backend
# abrir http://localhost:8000/  (o Python serve o PWA **e** a API no mesmo origin — sem CORS)
```

- Sem `backend/.env`, o backend sobe em `DRIVER=memory` (nada de nuvem, tudo em memória) — é o
  modo usado pelos testes. Com credenciais, vira `DRIVER=supabase`.
- Checagem completa em um comando: **`npm run verificar:backend`** (`backend/scripts/verificar.py`):
  configuração, estático, schema, dados/isolamento e o fluxo de login/logout.
- Testes: **`npm run test:backend`** (`pytest backend/tests`) e a suíte do PWA
  (`npm run test:rapido`), que também chama o pytest pelo wrapper `tests/backend_python.cjs`.

## 2. Ligar o Supabase (a nuvem de verdade)

1. Crie o projeto e copie `backend/.env.example` para **`backend/.env`** (esse arquivo NUNCA entra
   no git) preenchendo `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e
   `SESSAO_SEGREDO` (string longa aleatória).
2. Aplique o schema: `python -m backend.scripts.migrar` (aplica com `SUPABASE_DB_URL`) **ou** cole
   `backend/supabase/schema.sql` no SQL Editor. É **idempotente**: pode rodar quantas vezes quiser.
   > ⚠️ **`SUPABASE_DB_URL`**: nos projetos novos o host direto `db.<ref>.supabase.co` é
   > **IPv6-only** e falha em redes IPv4 (`getaddrinfo failed`). Use o **Session pooler**
   > (Dashboard → *Project Settings → Database → Connection string → Session pooler*):
   > `postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres`.
   > Se a senha tiver caracteres especiais, **percent-encode** (ex.: `@` → `%40`). O usuário
   > do pooler leva o **ref do projeto**: `postgres.<ref>`.
3. Crie o bucket **privado** `anexos` (Storage) — o backend assina/serve com `service_role`.
4. `GET /health` deve responder `{"ok":true,"driver":"supabase"}`.
5. **Conferência de segredo** (nada de chave no front):
   `Select-String -Path *.js,*.css,*.html,notes\*,mapa\*,sync\* -Pattern 'service_role|SUPABASE_'`

### Ligar o login com Google (opcional)

O login com Google usa o **Google Identity Services (GIS)** no navegador: o Google devolve um
**ID token** (JWT) e o **backend** o valida contra as chaves públicas do Google (JWKS, RS256) antes
de emitir a MESMA sessão em cookie `HttpOnly`. **Não existe `client_secret` neste fluxo** — só o
**Client ID**, que é público.

1. No **Google Cloud Console** → *APIs e serviços → Credenciais* → crie um **ID do cliente OAuth**
   do tipo *Aplicativo da Web*.
2. Em **Origens JavaScript autorizadas**, cadastre a origem do app (ex.: `http://localhost:8000` e o
   domínio de produção, sem barra no fim e sem caminho).
3. Preencha **`GOOGLE_CLIENT_ID`** em `backend/.env` (vazio = botão desligado; o app volta a ser o de
   sempre) e reinicie o backend.
4. Abra o diálogo de **Conta**: com o Client ID configurado, aparece o divisor **"ou"** e o **botão
   oficial do Google** (renderizado pelo próprio GIS). Sem backend, sem Client ID ou offline, o botão
   **não aparece** e o e-mail/senha segue normal — é o comportamento esperado.
5. **Vínculo de conta** (padrão de mercado): o e-mail do Google vem marcado como **verificado**;
   se ele JÁ existir como conta de senha, o acesso cai na **mesma conta** (mesmos dados/sync).
   Uma conta criada só pelo Google fica **sem senha utilizável** (a entrada é pelo Google).
6. **Em nuvem (Render/Fly/Railway)**: o `backend/.env` **não** é publicado (está no `.gitignore`) —
   a variável vai no **painel do serviço** (*Environment*). E a origem pública
   (`https://seu-app.onrender.com`, sem barra no fim) precisa estar em **Origens JavaScript
   autorizadas** no Google Cloud, senão o GIS recusa com `origin_mismatch`. Para conferir se o
   backend está com o Google ligado do próprio celular, abra `GET /api/auth/config`.

## 3. Contrato HTTP (todos os erros são `{"detail": "mensagem"}`)

| Método | Rota | Para quê |
|---|---|---|
| `GET` | `/health` | liveness + driver |
| `POST` | `/api/auth/registrar` · `/login` · `/logout` · `GET /me` | conta (cookie `HttpOnly` + `X-CSRF`) |
| `GET` | `/api/auth/config` | config pública: `{google_ativo, google_client_id}` (sem segredo) |
| `POST` | `/api/auth/google` | login com o ID token do Google (`{credential}`; e-mail verificado) |
| `GET` | `/api/sync/snapshot?desde_rev=` | carga inicial (0) ou delta (>0, com tombstones) |
| `GET` | `/api/sync/entidade/{entidade}/{id}` | uma entidade (nota `somenteNuvem`) |
| `POST` | `/api/sync/push` | lote de operações (1º login e fallback do socket) |
| `POST` | `/api/note-assets/files` | upload do anexo (multipart; 25 MB/arquivo + cota da conta) |
| `GET` | `/api/note-assets/files/{id}` | binário (`nosniff` + `Content-Disposition`) |
| `GET` | `…/info` · `…/page` · `…/page-image` | visualizador |
| `GET`/`PUT` | `…/annotations` | destaques do visualizador |
| `GET`/`POST` | `/api/note-assets/templates` | modelos de nota da conta |

## 4. Contrato WebSocket (`/ws`)

- Handshake autenticado pelo **cookie de sessão** + `Origin` (lista `ORIGENS_PERMITIDAS` **ou** o
  mesmo host do pedido). Sem sessão → fechamento **4401** (o cliente **não** reconecta em loop).
- Cliente → servidor: `{"t":"hello","desde_rev":N}` · `{"t":"op","id_local","entidade","acao","id","base_rev","dados"}` · `{"t":"ping"}`
- Servidor → cliente: `bemvindo` · `change` · `ack` · `conflito` · `erro` · `pong`
- **`ack` = persistido** (o cliente só então tira a `op` da fila). **`change` vai para os OUTROS**
  sockets da conta (nunca para o autor).
- Heartbeat `ping`/`pong` a cada 25 s; o cliente considera queda após 50 s e reconecta com
  *backoff* 1 s → 30 s (+ jitter). O servidor fecha socket mudo em 50 s.
- Reconexão: `hello {desde_rev: rev_global_conhecido}` traz o delta **antes** de drenar a fila.

## 5. Deploy

**Modelo padrão (origem única):** publique **o backend** (Render/Fly/Railway/qualquer host Python)
com `HOST=0.0.0.0` e `SESSAO_SEGURA=true`. Ele serve o PWA e a API no mesmo host — é o que torna
cookie, CSRF e WebSocket triviais e evita CORS.

A **porta não precisa ser configurada**: o backend usa `PORTA` (do `.env`) e, se ela não existir, o
**`PORT` que a plataforma injeta** na subida (padrão Render/Heroku/Fly). Para conferir o que o
servidor adotou — sem shell — abra `GET /health`: ele devolve `host` e `porta`.
`HOST` tem de ser `0.0.0.0` se o processo subir por `python -m backend.app.main` (com
`uvicorn ... --host 0.0.0.0` o CLI já cuida disso).

Se o host estático (Cloudflare Pages) continuar servindo o PWA, lembre-se de que
`_redirects` **não** encaminha para outro domínio: use uma Pages Function como proxy de `/api/*`
e `/ws`, e configure `ORIGENS_PERMITIDAS` com a origem do PWA (`_headers`/`_redirects` já trazem
essas regras e o comentário explicativo).

### Cabeçalhos de segurança (já ativos)
O estático do backend responde com **CSP por hash** (dos `<script>` inline do `index.html`),
`nosniff`, `Referrer-Policy`, anti-clickjacking (`frame-ancestors 'none'` + `X-Frame-Options`),
`Cross-Origin-Opener-Policy: same-origin-allow-popups` (**nunca** `same-origin`: o popup do GIS
devolve o `credential` por `postMessage` ao `window.opener`, e `same-origin` corta esse canal — P108)
e **HSTS quando `SESSAO_SEGURA=true`**. Trocar o conteúdo de um
`<script>` inline do `index.html` exige **reiniciar o backend** (o hash é calculado na subida) —
a suíte de navegador falha se a CSP quebrar o app.

### Anexos
- 25 MB por arquivo (`ANEXO_LIMITE_MB`) + cota por conta (`ANEXO_COTA_MB`, ~90% do plano).
- **Allowlist de MIME**: `text/html`, `image/svg+xml` e XML são recusados (seriam XSS na própria
  origem). Download vai com `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` e
  `Content-Disposition` (`inline` só para imagem segura).
- PDF/Word **não** têm prévia renderizada no servidor (sem dependência pesada): o `/info`
  devolve `kind` e o app oferece o download/visualizador nativo do navegador.
- No **1º login**, os anexos antigos gravados como `data:` na nota são migrados para a conta
  (o HTML da nota passa a guardar só o id).

## 6. Diagnóstico: "o sync travou"

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Login "não pega" / dados velhos | Service Worker servindo `/api` do cache | já tratado: o `sw.js` ignora `/api/*` e `/ws`; confira o `CACHE_NAME` do deploy |
| `Sessão expirada (entre novamente)` | cookie ausente/expirado ou `Origin` recusado | refaça o login; confira `ORIGENS_PERMITIDAS` e `SESSAO_SEGURA`/https |
| `Offline — N na fila` com o servidor no ar | socket caiu e o `push` HTTP também falhou | a fila está **persistida**: nada se perde; veja o console e o `/health` |
| `403 CSRF invalido` | escrita sem o header `X-CSRF` | o app manda o token vindo de `/api/auth/me`; recarregue a página |
| Anexo não abre em outro aparelho | upload não passou pela conta (deslogado?) | com sessão o anexo vira objeto da conta (`/api/note-assets/files/<id>`) |
| `413` no upload | arquivo > `ANEXO_LIMITE_MB` ou cota da conta esgotada | veja o `.env` (`ANEXO_LIMITE_MB`/`ANEXO_COTA_MB`) |
| Duas escritas ao mesmo tempo | o `rev` do servidor resolve por LWW | o cliente vence se declarar instante mais novo; senão recebe `conflito` e reenvia |

**Compatibilidade (P84):** as rotas de anexo aceitam `?user_id=`, mas **a sessão manda** — se o
`user_id` divergir dela, a resposta é **403**; sem sessão, **401**.
