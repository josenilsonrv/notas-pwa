"""
🗺️ COMPONENTE: API FastAPI do backend Python (rotas + estatico do PWA)
🎯 OBJETIVO: Subir o PWA e a API no MESMO origin (dev, sem CORS), expondo `/health`
             agora e `/api/*` nas proximas secoes - sem nunca servir `backend/` nem `.env`.
🔗 QUEM DEPENDE DELE: `uvicorn backend.app.main:app`, `scripts/verificar.py`, os testes de
                      `backend/tests/` e o wrapper `tests/backend_python.cjs`.
"""
from __future__ import annotations

# ============================================
# 🚨 [INÍCIO: BACKEND - SEGURANÇA (CABEÇALHOS)]
import base64
import hashlib
import re

# CSP conservadora e CACHEÁVEL (o Service Worker guarda o HTML COM este cabeçalho; por isso
# usamos HASH do script inline - e não um nonce por requisição, que quebraria o cache).
# `style-src 'unsafe-inline'` é obrigatório: o app usa `style` inline em toda a interface
# (mapa, cores, split) e isso NÃO é vetor de execução. `connect-src` libera o WebSocket.
_DIRETIVAS_CSP = (
    "default-src 'self'",
    "worker-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    "frame-src 'self' https://www.youtube-nocookie.com https://accounts.google.com",
    # `data:` no `connect-src`: o Chromium reporta um "connect" interno ao re-renderizar imagens
    # `data:` (o anexo local de hoje). URL `data:` NÃO sai do navegador, então liberá-la aqui não
    # abre exfiltração nenhuma — e evita um erro de console que assustava sem haver defeito.
    "connect-src 'self' ws: wss: data:",
    "font-src 'self' data:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
)
_CACHE_CSP: dict[str, str] = {}


def _hashes_inline(texto: str) -> list[str]:
    """Hashes `sha256-…` dos `<script>` INLINE (os com `src` não precisam de hash)."""
    conteudos = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", texto, re.S | re.I)
    hashes = []
    for conteudo in conteudos:
        if not conteudo.strip():
            continue
        digest = hashlib.sha256(conteudo.encode("utf-8")).digest()
        hashes.append("'sha256-" + base64.b64encode(digest).decode("ascii") + "'")
    return hashes


def csp_do_html(caminho) -> str:
    """CSP do HTML com os hashes dos scripts inline (calculados uma vez por arquivo)."""
    chave = str(caminho)
    if chave in _CACHE_CSP:
        return _CACHE_CSP[chave]
    try:
        hashes = _hashes_inline(caminho.read_text(encoding="utf-8"))
    except OSError:
        hashes = []
    script = "script-src 'self' https://accounts.google.com" + ((" " + " ".join(hashes)) if hashes else "")
    politica = "; ".join([_DIRETIVAS_CSP[0], script, *_DIRETIVAS_CSP[1:]])
    _CACHE_CSP[chave] = politica
    return politica


def cabecalhos_de_seguranca(caminho) -> dict:
    """Cabeçalhos de toda resposta do app (CSP por hash + blindagem de sniff/frame/referrer)."""
    cabecalhos = {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "X-Frame-Options": "DENY",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    }
    if str(caminho).lower().endswith((".html", ".htm")):
        cabecalhos["Content-Security-Policy"] = csp_do_html(caminho)
    if config.seguro:
        # Só em https: em `http://localhost` o HSTS atrapalharia o desenvolvimento.
        cabecalhos["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return cabecalhos
# 🚨 [FIM: BACKEND - SEGURANÇA (CABEÇALHOS)]


# 🔄 [INÍCIO: BACKEND - APP/ROTAS]
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from .assets import router as assets_router
from .auth import router as auth_router
from .config import obter_config
from .repositorio import repositorio
from .sync.http import router as sync_router
from .sync.ws import router as ws_router

config = obter_config()

app = FastAPI(
    title="notas-pwa backend",
    description="API opcional do notas-pwa (login + sync). O PWA funciona sem ela.",
    version="0.1.0",
)


@app.exception_handler(RequestValidationError)
async def erro_de_validacao(_request: Request, _erro: RequestValidationError) -> JSONResponse:
    """Mantem o contrato de erro: SEMPRE `{"detail": "mensagem"}` (string, nunca lista)."""
    return JSONResponse(status_code=422, content={"detail": "Requisicao invalida"})


@app.get("/health")
def health() -> dict:
    """Liveness do deploy: diz se o backend subiu, em qual driver e em qual host:porta.

    `host`/`porta` estao aqui para o deploy ser diagnosticavel sem shell: em PaaS (Render,
    Heroku, Fly) a porta vem do `PORT` injetado e este endpoint mostra o que foi usado.
    """
    repo = repositorio()
    return {
        "ok": True,
        "driver": getattr(repo, "driver", config.driver),
        "modo": config.modo,
        "supabase": bool(config.tem_supabase),
        "host": config.host,
        "porta": config.porta,
        "avisos": config.avisos,
    }

# As rotas de `/ws` entram AQUI (antes do estatico) - a ordem importa:
# o catch-all do estatico e o ULTIMO.
app.include_router(auth_router)
app.include_router(sync_router)
app.include_router(ws_router)
app.include_router(assets_router)


# ---------------------------------------------------------------------------
# Estatico do PWA (allowlist): so os arquivos do app sao servidos.
# `backend/`, `docs/`, `tests/`, `tools/`, `node_modules/`, `.git/` e `.env`
# NUNCA sao alcancaveis (erro 404).
# ---------------------------------------------------------------------------
TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
}

# Arquivos do PWA na raiz (os unicos servidos diretamente na raiz).
ARQUIVOS_RAIZ = {
    "index.html",
    "reparar.html",
    "app.js",
    "fontes.js",
    "conta.js",
    "styles.css",
    "theme-origem.css",
    "sw.js",
    "manifest.json",
    "icon.svg",
    "icon-192.png",
    "icon-512.png",
}

# Pastas do PWA (todo o conteudo delas e servido).
PASTAS_PWA = ("notes", "mapa", "sync")


def _normalizar(caminho: str) -> str:
    rel = (caminho or "").strip().lstrip("/").replace("\\", "/")
    return rel or "index.html"


def _permitido(rel: str) -> bool:
    """Allowlist: bloqueia travessia de caminho e qualquer pasta fora do PWA."""
    if ".." in Path(rel).parts:
        return False
    partes = Path(rel).parts
    if not partes:
        return False
    if len(partes) == 1:
        return partes[0] in ARQUIVOS_RAIZ
    return partes[0] in PASTAS_PWA


def servir(caminho: str) -> FileResponse:
    """Devolve um arquivo do PWA (ou 404 em JSON, nunca HTML de SPA)."""
    rel = _normalizar(caminho)
    if not _permitido(rel):
        raise HTTPException(status_code=404, detail="nao encontrado")
    raiz = config.raiz.resolve()
    alvo = (raiz / rel).resolve()
    if raiz != alvo and raiz not in alvo.parents:
        raise HTTPException(status_code=404, detail="nao encontrado")
    if not alvo.is_file():
        raise HTTPException(status_code=404, detail="nao encontrado")

    cabecalhos: dict[str, str] = {}
    # Blindagem de TODA resposta do app (CSP por hash, nosniff, anti-clickjacking, referrer).
    cabecalhos.update(cabecalhos_de_seguranca(alvo))
    if alvo.name == "sw.js":
        # O Service Worker NUNCA pode ficar preso em cache (P63).
        cabecalhos["Cache-Control"] = "no-store, no-cache, must-revalidate"
        cabecalhos["Service-Worker-Allowed"] = "/"
    elif alvo.suffix == ".html":
        cabecalhos["Cache-Control"] = "no-cache"

    return FileResponse(
        alvo,
        media_type=TIPOS.get(alvo.suffix.lower(), "application/octet-stream"),
        headers=cabecalhos,
    )


@app.get("/", include_in_schema=False)
def raiz() -> FileResponse:
    return servir("index.html")


@app.get("/{caminho:path}", include_in_schema=False)
def estatico(caminho: str) -> FileResponse:
    return servir(caminho)
# 🔄 [FIM: BACKEND - APP/ROTAS]


# 🚀 [INÍCIO: BACKEND - BOOT (uvicorn)]
def main() -> None:
    """Sobe o servidor. Uso: `python -m backend.app.main` (ou uvicorn --reload)."""
    import uvicorn

    for aviso in config.avisos:
        print(f"[backend] AVISO: {aviso}")
    print(
        f"[backend] driver={config.driver} modo={config.modo} "
        f"-> http://{config.host}:{config.porta}/"
    )
    uvicorn.run(app, host=config.host, port=config.porta)


if __name__ == "__main__":
    main()
# 🚀 [FIM: BACKEND - BOOT (uvicorn)]
