"""
🗺️ COMPONENTE: API FastAPI do backend Python (rotas + estatico do PWA)
🎯 OBJETIVO: Subir o PWA e a API no MESMO origin (dev, sem CORS), expondo `/health`
             agora e `/api/*` nas proximas secoes - sem nunca servir `backend/` nem `.env`.
🔗 QUEM DEPENDE DELE: `uvicorn backend.app.main:app`, `scripts/verificar.py`, os testes de
                      `backend/tests/` e o wrapper `tests/backend_python.cjs`.
"""
# ============================================
# 🔄 [INÍCIO: BACKEND - APP/ROTAS]
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from .auth import router as auth_router
from .config import obter_config
from .repositorio import repositorio
from .sync.http import router as sync_router

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
    """Liveness do deploy: diz se o backend subiu e em qual driver."""
    repo = repositorio()
    return {
        "ok": True,
        "driver": getattr(repo, "driver", config.driver),
        "modo": config.modo,
        "supabase": bool(config.tem_supabase),
        "avisos": config.avisos,
    }

# As rotas de `/ws` entram AQUI (antes do estatico), na proxima secao -
# a ordem importa: o catch-all do estatico e o ULTIMO.
app.include_router(auth_router)
app.include_router(sync_router)


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
