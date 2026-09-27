"""
🗺️ COMPONENTE: Regras de sincronizacao (rev do servidor, updated_at, LWW, soft delete)
🎯 OBJETIVO: Aplicar UMA operacao do cliente com uma regra UNICA — usada pelo push HTTP
             (secao 5) e, na secao 7, pelo WebSocket: nada de duplicar decisao de conflito.
🔗 QUEM DEPENDE DELE: `sync/http.py`, `sync/ws.py` (secao 7) e `tests/test_sync_http.py`.

Regras (secao 2.5 do plano):
  - `rev` e SEMPRE do servidor: o cliente manda `base_rev` e recebe o novo.
  - Exclusao e SOFT DELETE (`deleted_at`) — precisa chegar aos outros aparelhos.
  - **LWW por data de EDIÇÃO** (`dados.atualizada_em`): a comparação e a gravação são
    ATÔMICAS, feitas dentro do repositório (`salvar_lww`). Compara a data de edição do
    cliente com a data de edição da linha GRAVADA — nunca com o `updated_at` de
    persistência. A edição mais recente prevalece; empate (ou ausência de data)
    mantém a versão do servidor. Funciona com ou sem `base_rev`.
"""
# ⚙️ [INÍCIO: BACKEND - SYNC (REGRAS)]
from __future__ import annotations

from ..repositorio import ENTIDADES, agora_iso, normalizar_entidade

ACOES = ("upsert", "delete")


def _normalizar_op(op: dict) -> tuple[str, str, str, dict, int | None, str]:
    """Valida a op e devolve `(entidade, acao, id, dados, base_rev, id_local)`."""
    entidade = normalizar_entidade(op.get("entidade", ""))
    acao = str(op.get("acao") or "upsert").strip().lower()
    if acao not in ACOES:
        raise ValueError(f"acao desconhecida: {op.get('acao')!r}")
    id_ = str(op.get("id") or "").strip()
    if not id_:
        raise ValueError("op sem id")
    dados = op.get("dados") or {}
    if acao == "upsert" and not isinstance(dados, dict):
        raise ValueError("dados deve ser um objeto JSON")
    return entidade, acao, id_, dados, op.get("base_rev"), str(op.get("id_local") or "")


def aplicar_op(repo, user_id: str, op: dict) -> dict:
    """Aplica uma op e devolve `{"ack": {...}}` ou `{"conflito": {...}}`.

    O `ack` só sai quando a operação foi REALMENTE persistida (o cliente só então
    remove a op da fila). O conflito traz a versão atual para o cliente decidir.
    """
    entidade, acao, id_, dados, base_rev, id_local = _normalizar_op(op)

    if acao == "delete":
        registro = repo.excluir(entidade, user_id, id_)
        return {
            "ack": {
                "id_local": id_local,
                "entidade": entidade,
                "id": id_,
                "rev": registro["rev"] if registro else 0,
                "deleted_at": registro["deleted_at"] if registro else None,
            }
        }

    # A comparação E a gravação são atômicas (dentro do repositório): duas gravações
    # simultâneas não deixam uma versão antiga vencer.
    resultado = repo.salvar_lww(entidade, user_id, id_, dados, base_rev=base_rev)
    if resultado.get("gravado"):
        return {
            "ack": {
                "id_local": id_local,
                "entidade": entidade,
                "id": id_,
                "rev": resultado["rev"],
                "updated_at": resultado["updated_at"],
            }
        }

    conflito = resultado.get("conflito") or {}
    motivo = "apagado_no_servidor" if conflito.get("deleted_at") else "rev_mais_novo"
    return {
        "conflito": {
            "id_local": id_local,
            "entidade": entidade,
            "id": id_,
            "motivo": motivo,
            "versao_atual": {
                "rev": conflito.get("rev", 0),
                "updated_at": conflito.get("updated_at"),
                "deleted_at": conflito.get("deleted_at"),
                "dados": conflito.get("dados"),
            },
        }
    }


def snapshot_do_usuario(repo, user_id: str, desde_rev: int = 0, entidades=None) -> dict:
    """Estado do usuário para carga inicial/delta.

    `desde_rev = 0` → carga INICIAL (sem tombstones); `> 0` → delta, **com** os
    tombstones, para o cliente remover o que foi apagado em outro aparelho.
    """
    nomes = tuple(entidades) if entidades else ENTIDADES
    delta = int(desde_rev or 0) > 0
    corpo = {}
    for nome in nomes:
        corpo[nome] = [
            {
                "id": registro["id"],
                "rev": registro["rev"],
                "updated_at": registro["updated_at"],
                "deleted_at": registro["deleted_at"],
                "dados": registro["dados"],
            }
            for registro in repo.listar(nome, user_id, since_rev=desde_rev, incluir_excluidos=delta)
        ]
    return {
        "rev_global": repo.rev_global(user_id),
        "desde_rev": int(desde_rev or 0),
        "servidor_em": agora_iso(),
        "entidades": corpo,
    }
# ⚙️ [FIM: BACKEND - SYNC (REGRAS)]
