"""
🗺️ COMPONENTE: Anexos da nota (`/api/note-assets/*`) + armazenamento (Supabase Storage)
🎯 OBJETIVO: Fechar a lacuna do P84 - o anexo passa a ser um OBJETO DA CONTA (não um `data:` URL
             preso no aparelho), então abre em qualquer dispositivo. O backend é o único que fala
             com o Storage (com `service_role`); o cliente NUNCA recebe chave nem caminho.
🔗 QUEM DEPENDE DELE: `main.py` (include_router) e `backend/tests/test_assets.py`.

Segurança (decisões desta entrega):
  - allowlist de MIME (NUNCA `text/html`/`image/svg+xml`/XML: seriam XSS na PRÓPRIA origem);
  - corte em STREAM por `ANEXO_LIMITE_MB` (um arquivo gigante não estoura a memória) + cota por
    conta (não esgota o plano gratuito);
  - download com `X-Content-Type-Options: nosniff`, `Content-Disposition` (inline só para imagem
    segura) e `Content-Security-Policy: default-src 'none'; sandbox`;
  - `?user_id=` (compatibilidade P84): a SESSÃO manda; `user_id` divergente -> 403; sem sessão -> 401;
  - cada anexo vive em `<user_id>/<id>` no bucket PRIVADO (isolamento por conta).
"""
# 🔄 [INÍCIO: API - ANEXOS]
from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException, Request, Response, UploadFile
from pydantic import BaseModel, Field

from .config import obter_config
from .repositorio import agora_iso, repositorio
from .seguranca import exigir_csrf, exigir_sessao
from .sync.regras import aplicar_op

router = APIRouter(prefix="/api/note-assets", tags=["anexos"])

BUCKET_PADRAO = "anexos"
# MIME aceitos no upload (allowlist: o que não está aqui é recusado com mensagem clara).
TIPOS_PERMITIDOS = (
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif",
    "application/pdf", "text/plain", "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/zip", "application/octet-stream",
)
# MIME que podem ser servidos INLINE (imagem segura: sem script, sem SVG/HTML).
INLINE_SEGURO = ("image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/avif")
CABECALHOS_SEGUROS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, max-age=300",
}
TAMANHO_PEDACO = 512 * 1024


def _mb(quantidade) -> int:
    return int(float(quantidade) * 1024 * 1024)


class Storage:
    """Contrato do armazenamento de binários (o `caminho` é `<user_id>/<id>`)."""

    driver = "?"

    def enviar(self, caminho: str, conteudo: bytes, mime: str) -> None:
        raise NotImplementedError

    def baixar(self, caminho: str) -> bytes | None:
        raise NotImplementedError

    def apagar(self, caminho: str) -> None:
        raise NotImplementedError


class StorageMemoria(Storage):
    """Sem nuvem: guarda os bytes no processo (base dos testes e do modo `memory`)."""

    driver = "memory"

    def __init__(self) -> None:
        self._objetos: dict[str, tuple[bytes, str]] = {}

    def enviar(self, caminho: str, conteudo: bytes, mime: str) -> None:
        self._objetos[caminho] = (bytes(conteudo), mime)

    def baixar(self, caminho: str) -> bytes | None:
        item = self._objetos.get(caminho)
        return item[0] if item else None

    def apagar(self, caminho: str) -> None:
        self._objetos.pop(caminho, None)

    def limpar(self) -> None:
        self._objetos.clear()



class StorageSupabase(Storage):
    """Supabase Storage pelo endpoint REST (httpx), com `service_role` (nunca sai do backend)."""

    driver = "supabase"

    def __init__(self, config) -> None:
        self.bucket = config.supabase_bucket_anexos or BUCKET_PADRAO
        self.base = config.supabase_url.rstrip("/") + "/storage/v1"
        self.chave = config.supabase_service_role_key

    def _url(self, caminho: str) -> str:
        return f"{self.base}/object/{self.bucket}/{caminho}"

    def _cabecalhos(self, extra: dict | None = None) -> dict:
        cabecalhos = {"apikey": self.chave, "Authorization": f"Bearer {self.chave}"}
        cabecalhos.update(extra or {})
        return cabecalhos

    def enviar(self, caminho: str, conteudo: bytes, mime: str) -> None:
        with httpx.Client(timeout=30.0) as cliente:
            resposta = cliente.post(
                self._url(caminho),
                content=conteudo,
                headers=self._cabecalhos({"Content-Type": mime, "x-upsert": "true"}),
            )
        if resposta.status_code >= 400:
            raise HTTPException(status_code=503, detail="Nao foi possivel guardar o arquivo na conta")

    def baixar(self, caminho: str) -> bytes | None:
        with httpx.Client(timeout=30.0) as cliente:
            resposta = cliente.get(self._url(caminho), headers=self._cabecalhos())
        if resposta.status_code == 404:
            return None
        if resposta.status_code >= 400:
            raise HTTPException(status_code=503, detail="Nao foi possivel ler o arquivo da conta")
        return resposta.content

    def apagar(self, caminho: str) -> None:
        try:
            with httpx.Client(timeout=15.0) as cliente:
                cliente.delete(self._url(caminho), headers=self._cabecalhos())
        except httpx.HTTPError:
            pass


def criar_storage(config=None) -> Storage:
    """Fabrica do armazenamento: UM `if` decide nuvem x memoria (igual ao repositorio)."""
    config = config or obter_config()
    if getattr(config, "tem_supabase", False):
        return StorageSupabase(config)
    return StorageMemoria()


_STORAGE: Storage | None = None


def obter_storage() -> Storage:
    global _STORAGE
    if _STORAGE is None:
        _STORAGE = criar_storage(obter_config())
    return _STORAGE


def definir_storage(storage: Storage | None) -> None:
    """Troca o armazenamento (usado pelos testes, que nao podem herdar objetos)."""
    global _STORAGE
    _STORAGE = storage



class ModeloTemplate(BaseModel):
    """Corpo de `POST /templates` (o PWA guarda modelos locais; isto é o contrato do backend)."""

    nome: str = Field(default="")
    name: str = Field(default="")
    payload: dict = Field(default_factory=dict)
    html: str = Field(default="")


class Anotacoes(BaseModel):
    ranges: list = Field(default_factory=list)
    page: int = Field(default=0)


def _sessao_do_pedido(request: Request, declarado: str | None = None):
    """Sessão manda; `?user_id=` só é aceito quando CONFERE com ela (compatibilidade P84)."""
    sessao = exigir_sessao(request)
    if declarado and str(declarado) != str(sessao.user_id):
        raise HTTPException(status_code=403, detail="acesso negado")
    return sessao


def _kind(mime: str) -> str:
    """Classifica o arquivo para o visualizador. Desconhecido -> `arquivo` (só download)."""
    if mime.startswith("image/"):
        return "image"
    if mime == "application/pdf":
        return "pdf"
    if mime in ("text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"):
        return "sheet"
    if "word" in mime:
        return "word"
    if mime.startswith("text/"):
        return "text"
    return "arquivo"


def _tamanho_usado(user_id: str) -> int:
    """Soma o tamanho dos anexos da conta (base da cota)."""
    total = 0
    for registro in repositorio().listar("ativos", user_id):
        try:
            total += int((registro.get("dados") or {}).get("tamanho") or 0)
        except (TypeError, ValueError):
            continue
    return total


def _registro_ativo(user_id: str, id_: str) -> dict:
    registro = repositorio().obter("ativos", user_id, id_)
    if not registro or registro.get("deleted_at"):
        raise HTTPException(status_code=404, detail="nao encontrado")
    return registro



@router.post("/files")
async def enviar_arquivo(request: Request, file: UploadFile, user_id: str | None = None) -> dict:
    """Sobe o anexo para o Storage e registra a linha em `ativos` (devolve o id do anexo)."""
    sessao = _sessao_do_pedido(request, user_id)
    exigir_csrf(request, sessao)
    config = obter_config()
    limite = _mb(config.anexo_limite_mb)
    cota = _mb(config.anexo_cota_mb)
    nome = Path(str(file.filename or "arquivo")).name[:120] or "arquivo"
    mime = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
    if mime not in TIPOS_PERMITIDOS:
        raise HTTPException(status_code=415, detail="Tipo de arquivo nao permitido")

    usado = _tamanho_usado(sessao.user_id)
    if usado >= cota:
        raise HTTPException(status_code=413, detail="Espaco da conta esgotado")

    # Leitura em PEDACOS: corta no limite ANTES de ter o arquivo inteiro na memoria.
    conteudo = bytearray()
    while True:
        pedaco = await file.read(TAMANHO_PEDACO)
        if not pedaco:
            break
        conteudo.extend(pedaco)
        if len(conteudo) > limite:
            raise HTTPException(
                status_code=413, detail=f"Arquivo maior que o limite de {config.anexo_limite_mb} MB"
            )
    if usado + len(conteudo) > cota:
        raise HTTPException(status_code=413, detail="Espaco da conta esgotado")

    id_ = "a" + datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S") + uuid4().hex[:8]
    caminho = f"{sessao.user_id}/{id_}"
    obter_storage().enviar(caminho, bytes(conteudo), mime)
    dados = {
        "nome": nome,
        "mime": mime,
        "tamanho": len(conteudo),
        "storage_path": caminho,
        "kind": _kind(mime),
        "atualizada_em": agora_iso(),
    }
    # A MESMA aplicacao de op do sync: o anexo entra na conta e o `rev` avanca (os outros
    # aparelhos descobrem o anexo pelo delta).
    aplicar_op(
        repositorio(), sessao.user_id,
        {"entidade": "ativos", "acao": "upsert", "id": id_, "dados": dados},
    )
    return {"id": id_, "name": nome, "kind": dados["kind"], "size": len(conteudo)}


@router.get("/files/{id}")
def baixar_arquivo(id: str, request: Request, user_id: str | None = None) -> Response:
    """Devolve o BINARIO com os cabeçalhos de segurança (nunca `inline` para texto/HTML)."""
    sessao = _sessao_do_pedido(request, user_id)
    registro = _registro_ativo(sessao.user_id, id)
    dados = registro.get("dados") or {}
    conteudo = obter_storage().baixar(str(dados.get("storage_path") or f"{sessao.user_id}/{id}"))
    if conteudo is None:
        raise HTTPException(status_code=404, detail="nao encontrado")
    mime = str(dados.get("mime") or "application/octet-stream")
    nome = str(dados.get("nome") or id)
    cabecalhos = dict(CABECALHOS_SEGUROS)
    disposicao = "inline" if mime in INLINE_SEGURO else "attachment"
    cabecalhos["Content-Disposition"] = f"{disposicao}; filename*=UTF-8''{quote(nome)}"
    return Response(content=conteudo, media_type=mime, headers=cabecalhos)


@router.get("/files/{id}/info")
def info_arquivo(id: str, request: Request, user_id: str | None = None) -> dict:
    """Metadados para o visualizador — NUNCA devolve `storage_path` (segredo do backend)."""
    sessao = _sessao_do_pedido(request, user_id)
    dados = _registro_ativo(sessao.user_id, id).get("dados") or {}
    mime = str(dados.get("mime") or "application/octet-stream")
    kind = str(dados.get("kind") or _kind(mime))
    info = {
        "name": str(dados.get("nome") or id),
        "kind": kind,
        "mime": mime,
        "size": int(dados.get("tamanho") or 0),
    }
    info["pages"] = 1
    if kind == "sheet":
        info["sheets"] = [{"name": "Planilha", "pages": 1, "columns": 100}]
    return info



@router.get("/files/{id}/page")
def pagina_arquivo(
    id: str, request: Request, index: int = 0, sheet: int = 0, column: int = 0, user_id: str | None = None
) -> dict:
    """Prévia da página: imagem (a própria URL), texto/CSV (HTML/linhas) ou só download.

    PDF e Word **não** têm renderização no servidor nesta entrega (sem dependência pesada): o
    contrato devolve `download=True` e o app oferece o arquivo — decisão registrada em P9x.
    """
    sessao = _sessao_do_pedido(request, user_id)
    dados = _registro_ativo(sessao.user_id, id).get("dados") or {}
    mime = str(dados.get("mime") or "application/octet-stream")
    kind = str(dados.get("kind") or _kind(mime))
    if kind == "image":
        return {"html": f'<img class="notes-local-file" alt="" src="/api/note-assets/files/{quote(id)}">'}
    if kind in ("text", "sheet") or mime == "text/csv":
        conteudo = obter_storage().baixar(str(dados.get("storage_path") or "")) or b""
        texto = conteudo.decode("utf-8", errors="replace")
        if mime == "text/csv":
            linhas = [linha.split(",") for linha in texto.splitlines() if linha.strip()]
            inicio = max(0, int(index or 0)) * 100
            return {"rows": linhas[inicio:inicio + 100], "more": len(linhas) > inicio + 100}
        return {"html": f"<pre>{escape(texto[:200000])}</pre>", "download": True}
    return {"html": "<p>Sem prévia para este tipo — use o download.</p>", "download": True}


@router.get("/files/{id}/page-image")
def imagem_da_pagina(id: str, request: Request, index: int = 0, user_id: str | None = None) -> Response:
    """Imagem da página: só existe para ANEXO de imagem (PDF exigiria renderização no servidor)."""
    sessao = _sessao_do_pedido(request, user_id)
    dados = _registro_ativo(sessao.user_id, id).get("dados") or {}
    mime = str(dados.get("mime") or "")
    if not mime.startswith("image/"):
        raise HTTPException(status_code=404, detail="sem previa em imagem para este tipo")
    conteudo = obter_storage().baixar(str(dados.get("storage_path") or ""))
    if conteudo is None:
        raise HTTPException(status_code=404, detail="nao encontrado")
    return Response(content=conteudo, media_type=mime, headers=dict(CABECALHOS_SEGUROS))


@router.get("/files/{id}/annotations")
def ler_anotacoes(id: str, request: Request, page: int = 0, user_id: str | None = None) -> dict:
    """Destaques salvos do visualizador (`ranges`) — por anexo e por página."""
    sessao = _sessao_do_pedido(request, user_id)
    _registro_ativo(sessao.user_id, id)
    registro = repositorio().obter("ativos_anotacoes", sessao.user_id, id)
    dados = (registro or {}).get("dados") or {}
    return {"ranges": dados.get("ranges") or [], "page": int(dados.get("page") or 0)}


@router.put("/files/{id}/annotations")
def salvar_anotacoes(id: str, corpo: Anotacoes, request: Request, user_id: str | None = None) -> dict:
    """Grava os destaques (escrita: exige CSRF, como todo `POST`/`PUT` do backend)."""
    sessao = _sessao_do_pedido(request, user_id)
    exigir_csrf(request, sessao)
    _registro_ativo(sessao.user_id, id)
    dados = {"ativo_id": id, "ranges": corpo.ranges, "page": int(corpo.page or 0), "atualizada_em": agora_iso()}
    aplicar_op(
        repositorio(), sessao.user_id,
        {"entidade": "ativos_anotacoes", "acao": "upsert", "id": id, "dados": dados},
    )
    return {"ranges": dados["ranges"]}


@router.get("/templates")
def listar_modelos(request: Request, user_id: str | None = None) -> list:
    """Modelos de NOTA da conta (o PWA guarda os dele localmente; isto cumpre o contrato)."""
    sessao = _sessao_do_pedido(request, user_id)
    saida = []
    for registro in repositorio().listar("modelos", sessao.user_id):
        dados = registro.get("dados") or {}
        if str(dados.get("tipo") or "") != "nota":
            continue
        saida.append({"id": registro["id"], "name": dados.get("nome") or "Modelo"})
    return saida


@router.post("/templates")
def criar_modelo(corpo: ModeloTemplate, request: Request, user_id: str | None = None) -> dict:
    """Cria um modelo de nota na conta (mesma entidade `modelos` usada pelo sync)."""
    sessao = _sessao_do_pedido(request, user_id)
    exigir_csrf(request, sessao)
    nome = str(corpo.nome or corpo.name or "Modelo")[:100]
    id_ = "tpl-" + uuid4().hex[:12]
    dados = {
        "tipo": "nota",
        "nome": nome,
        "payload": corpo.payload or {"html": corpo.html},
        "atualizada_em": agora_iso(),
    }
    aplicar_op(
        repositorio(), sessao.user_id,
        {"entidade": "modelos", "acao": "upsert", "id": id_, "dados": dados},
    )
    return {"id": id_, "name": nome}
# 🔄 [FIM: API - ANEXOS]
