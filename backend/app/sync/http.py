"""
🗺️ COMPONENTE: Sync por HTTP (`/api/sync/snapshot` e `/api/sync/push`)
🎯 OBJETIVO: Entregar o estado do usuário (carga inicial/delta) e receber operações — é o
             caminho de rede da seção 5; a seção 7 (WebSocket) reaproveita a MESMA
             `aplicar_op`, e por isso a decisão de conflito não existe em dois lugares.
🔗 QUEM DEPENDE DELE: `main.py` (include_router), o `sync/sync-cliente.js` (front) e
                      `backend/tests/test_sync_http.py`.
"""
# 🔄 [INÍCIO: API - SYNC HTTP]
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..repositorio import repositorio
from ..seguranca import exigir_csrf, exigir_sessao
from .regras import aplicar_op, snapshot_do_usuario

router = APIRouter(prefix="/api/sync", tags=["sync"])


class Operacao(BaseModel):
    """Uma operação do cliente. `id_local` é o bilhete da fila (o cliente só o solta no ack)."""

    entidade: str = Field(default="")
    acao: str = Field(default="upsert")
    id: str = Field(default="")
    base_rev: int | None = None
    dados: dict = Field(default_factory=dict)
    id_local: str = Field(default="")


class Lote(BaseModel):
    ops: list[Operacao] = Field(default_factory=list)


@router.get("/snapshot")
def snapshot(request: Request, desde_rev: int = 0) -> dict:
    """Carga inicial (`desde_rev=0`, sem tombstones) ou delta (`> 0`, com tombstones)."""
    sessao = exigir_sessao(request)
    repo = repositorio()
    corpo = snapshot_do_usuario(repo, sessao.user_id, desde_rev=desde_rev)
    corpo["usuario"] = {"id": sessao.user_id, "email": sessao.email}
    return corpo


@router.get("/entidade/{entidade}/{id}")
def entidade(entidade: str, id: str, request: Request) -> dict:
    """UMA entidade do usuário (usada pela nota `somenteNuvem`: baixa o texto ao abrir)."""
    sessao = exigir_sessao(request)
    repo = repositorio()
    try:
        registro = repo.obter(entidade, sessao.user_id, id)
    except ValueError as erro:
        raise HTTPException(status_code=404, detail="entidade desconhecida") from erro
    if not registro:
        raise HTTPException(status_code=404, detail="nao encontrado")
    return {
        "id": registro["id"],
        "entidade": entidade,
        "rev": registro["rev"],
        "updated_at": registro["updated_at"],
        "dados": registro["dados"],
    }


@router.post("/push")
def push(lote: Lote, request: Request) -> dict:
    """Aplica as operações NA ORDEM e devolve `acks`/`conflitos` + o `rev_global` novo.

    O `ack` só aparece para operação persistida (o cliente só então tira a op da fila);
    operação malformada vira um item de `conflito` com `motivo: payload_invalido` — **não
    derruba o lote** (uma op ruim não pode travar as outras).
    """
    sessao = exigir_sessao(request)
    exigir_csrf(request, sessao)
    repo = repositorio()
    acks: list[dict] = []
    conflitos: list[dict] = []
    for op in lote.ops:
        try:
            resultado = aplicar_op(repo, sessao.user_id, op.model_dump())
        except ValueError as erro:
            conflitos.append(
                {
                    "id_local": op.id_local,
                    "entidade": op.entidade,
                    "id": op.id,
                    "motivo": "payload_invalido",
                    "detalhe": str(erro),
                    "versao_atual": None,
                }
            )
            continue
        if "ack" in resultado:
            acks.append(resultado["ack"])
        else:
            conflitos.append(resultado["conflito"])
    return {
        "acks": acks,
        "conflitos": conflitos,
        "rev_global": repo.rev_global(sessao.user_id),
    }
# 🔄 [FIM: API - SYNC HTTP]
