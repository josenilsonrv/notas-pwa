# Backend Python do notas-pwa (login + sync com o Supabase)

Backend **opcional**. O PWA continua 100% local-first: **sem login e com o backend
desligado**, ele funciona exatamente como antes. Este backend só entra em cena quando o
usuário faz login.

## Por que existe

- **Um único gatekeeper.** O front fala só com o Python; **só o Python** fala com o
  Supabase (chave `service_role`). A chave **nunca** chega ao JS/Service Worker.
- **Sessão em cookie `httpOnly`.** Nenhum token trafega pelo JavaScript
  (`py_session` assinado por HMAC + CSRF por token duplo).
- **Sync por WebSocket** com fila de pendências offline-safe (fases seguintes).

## Estrutura

```
backend/
  requirements.txt          dependencias (runtime + testes)
  requirements.lock.txt     `pip freeze` do ambiente validado (Python 3.14.5) - reproducao exata
  .env.example              MODELO do .env (copie para .env - nunca versionado)
  README.md                 este arquivo
  supabase/schema.sql       tabelas + indices + RLS + proximo_rev (colar no SQL Editor)
  app/
    config.py               le o .env e decide driver supabase|memory
    repositorio.py          INTERFACE UNICA + driver memory (o supabase fica em repositorio_supabase.py)
    supabase_cliente.py     cliente service_role + fallback PostgREST (httpx)
    seguranca.py            cookie de sessao, CSRF, rate-limit
    auth.py                 /api/auth: registrar|login|logout|me
    main.py                 FastAPI: /health + estatico do PWA (allowlist)
  scripts/
    migrar.py               aplica o schema (idempotente)
    verificar.py            checagem completa quando o .env estiver preenchido
  tests/                    pytest (hermetico: DRIVER=memory, sem rede)
```

## Como rodar (dev)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# PWA + API no MESMO origin (sem CORS). Abra http://localhost:8000/
npm run dev:backend
# equivalente a: python -m uvicorn backend.app.main:app --port 8000 --reload
```

`GET /health` responde:

```json
{"ok": true, "driver": "memory", "modo": "local", "supabase": false, "avisos": []}
```

Sem `backend/.env`, o driver é **`memory`** (tudo vive no processo; reinicia vazio) — é o
modo dos testes e do desenvolvimento. Não é persistente de propósito.

## Como ligar o Supabase (quando você tiver as credenciais)

1. Copie `backend/.env.example` para `backend/.env` e preencha:

   ```
   SUPABASE_URL=https://<projeto>.supabase.co
   SUPABASE_ANON_KEY=<anon>
   SUPABASE_SERVICE_ROLE_KEY=<service_role>   # nunca vai para o front
   SESSAO_SEGREDO=<string longa aleatoria>
   DRIVER=auto
   ```

   Gere o segredo com:
   `python -c "import secrets;print(secrets.token_urlsafe(48))"`

2. Aplique o schema (idempotente) e confira tudo de uma vez:

   ```powershell
   npm run verificar:backend
   # equivalente a: python -m backend.scripts.verificar
   ```

   O script: aplica `supabase/schema.sql`, confere as tabelas, testa `/health`,
   faz um CRUD de ida e volta e **checa o isolamento entre dois usuários**.

3. Reinicie o backend. `GET /health` passa a devolver `"driver": "supabase"`.

> Observação: as rotas `/api/*` (login/sync) chegam nas próximas seções. Hoje o backend
> entrega `/health` e o estático do PWA.

## Testes

```powershell
npm run test:backend        # python -m pytest backend/tests -q
```

A suíte é **hermética**: o `conftest.py` força `DRIVER=memory` e apaga as variáveis do
Supabase, então nenhum teste toca a nuvem (nem depende de credencial). O driver `supabase`
é coberto com **mocks**. Pela suíte principal do projeto, o pytest entra pelo wrapper
`node tests/backend_python.cjs` — que **passa com aviso** quando o `.venv` não existe, para a
suíte continuar verde com o backend desligado.

## Segurança (checagem rápida)

Nenhuma chave do Supabase pode aparecer em arquivo servido ao navegador:

```powershell
Select-String -Path app.js,sw.js,index.html,styles.css,notes\*.js,mapa\*.js -Pattern 'service_role|SUPABASE_SERVICE'
```

O estático do backend usa uma **allowlist**: só `index.html`, `app.js`, `fontes.js`,
`conta.js`, `styles.css`, `theme-origem.css`, `sw.js`, `manifest.json`, `icon*` e as pastas
`notes/`, `mapa/` e `sync/`. `backend/`, `docs/`, `tests/`, `tools/`, `node_modules/`,
`.git/` e `.env` respondem **404**.
