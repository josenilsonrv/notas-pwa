"""
🗺️ COMPONENTE: Regras de sincronizacao (rev do servidor, updated_at, LWW, soft delete)
🎯 OBJETIVO: Aplicar UMA operacao do cliente com uma regra UNICA — usada pelo push HTTP
             (secao 5) e, na secao 7, pelo WebSocket: nada de duplicar decisao de conflito.
🔗 QUEM DEPENDE DELE: `sync/http.py`, `sync/ws.py` (secao 7) e `tests/test_sync_http.py`.

Regras (secao 2.5 do plano):
  - `rev` e SEMPRE do servidor: o cliente manda `base_rev` e recebe o novo.
  - Exclusao e SOFT DELETE (`deleted_at`) — precisa chegar aos outros aparelhos.
  - **LWW por `updated_at`**: comparamos o instante que vem no payload do cliente
    (`atualizada_em`/`updated_at`, relogio do APARELHO) com o `updated_at` da linha
    (relogio do SERVIDOR). Se o do cliente for mais novo, ele vence (gravamos com
    `forcar=True`); senao, devolvemos `conflito` com a versao atual e o cliente decide
    (reenviar com `base_rev` novo ou aceitar a do servidor).
  - Empate de instante: vence o servidor (o `rev` maior).
"""
# ⚙️ [INÍCIO: BACKEND - SYNC (REGRAS)]
from __future__ import annotations

from datetime import datetime, timezone

from ..repositorio import ENTIDADES, agora_iso, normalizar_entidade

ACOES = ("upsert", "delete")
CAMPOS_DE_TEMPO = ("atualizada_em", "atualizadaEm", "updated_at", "updatedAt")


def momento(valor) -> float:
    """ISO-8601 (ou epoch) -> epoch em segundos. Devolve 0 quando nao da para ler."""
    if valor in (None, ""):
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor).strip().replace("Z", "+00:00")
    try:
        data = datetime.fromisoformat(texto)
    except ValueError:
        return 0.0
    if data.tzinfo is None:
        data = data.replace(tzinfo=timezone.utc)
    return data.timestamp()


def instante_do_cliente(dados: dict) -> float:
    """O instante declarado pelo aparelho (o mais novo entre os apelidos conhecidos)."""
    if not isinstance(dados, dict):
        return 0.0
    return max((momento(dados.get(campo)) for campo in CAMPOS_DE_TEMPO), default=0.0)


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

    atual = repo.obter(entidade, user_id, id_, incluir_excluido=True)
    desejo_cliente = instante_do_cliente(dados)
    instante_servidor = momento((atual or {}).get("updated_at"))
    # O cliente vence quando declarou um instante mais NOVO que o do servidor.
    venceu = bool(atual) and desejo_cliente > 0 and desejo_cliente > instante_servidor

    resultado = repo.salvar(
        entidade, user_id, id_, dados, base_rev=base_rev, forcar=venceu or not atual
    )
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

    if atual and atual.get("deleted_at") and not venceu:
        # O servidor excluiu DEPOIS de o aparelho ter salvado: avisamos o cliente.
        return {
            "conflito": {
                "id_local": id_local,
                "entidade": entidade,
                "id": id_,
                "motivo": "apagado_no_servidor",
                "versao_atual": {
                    "rev": atual["rev"],
                    "updated_at": atual["updated_at"],
                    "deleted_at": atual["deleted_at"],
                    "dados": atual["dados"],
                },
            }
        }
    conflito = resultado.get("conflito") or {}
    return {
        "conflito": {
            "id_local": id_local,
            "entidade": entidade,
            "id": id_,
            "motivo": "rev_mais_novo",
            "versao_atual": {
                "rev": conflito.get("rev", 0),
                "updated_at": conflito.get("updated_at"),
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
