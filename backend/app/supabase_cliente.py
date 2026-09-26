"""
🗺️ COMPONENTE: Cliente HTTP do Supabase (PostgREST + RPC) com a chave `service_role`
🎯 OBJETIVO: Falar com o Postgres do Supabase via REST sem acoplar versao de biblioteca:
             `selecionar`, `inserir_ou_atualizar`, `atualizar`, `proximo_rev`, `rev_global`.
🔗 QUEM DEPENDE DELE: `backend/app/repositorio_supabase.py`, `scripts/migrar.py`,
                      `scripts/verificar.py` e os testes (com `httpx.MockTransport`).

Escolha de desenho (mitigacao R1 do plano): usamos **httpx + PostgREST** em vez do pacote
`supabase-py`. Motivo: menos acoplamento de versao (o pacote ja mudou a API mais de uma vez),
nenhum problema de wheel em Python novo e - o decisivo - a possibilidade de testar TODA a
construcao de URLs/JSON com `httpx.MockTransport`, sem rede e sem credencial.
"""
# 🔄 [INÍCIO: BACKEND - CLIENTE SUPABASE]
from __future__ import annotations

from typing import Any

import httpx


class ErroSupabase(RuntimeError):
    """Erro devolvido pelo PostgREST/Storage (com status e detalhe preservados)."""

    def __init__(self, status: int, detalhe: str, caminho: str = "") -> None:
        self.status = status
        self.detalhe = detalhe
        self.caminho = caminho
        super().__init__(f"Supabase {status} em {caminho}: {detalhe}")


class ClienteSupabase:
    """Cliente REST do Supabase. Recebe a chave `service_role` (so o backend tem)."""

    def __init__(
        self,
        url: str,
        chave: str,
        timeout: float = 15.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.url = (url or "").rstrip("/")
        self.chave = chave or ""
        self.timeout = timeout
        self._transport = transport
        self._cliente: httpx.Client | None = None

    # --- infra --------------------------------------------------------------
    @property
    def cliente(self) -> httpx.Client:
        if self._cliente is None:
            self._cliente = httpx.Client(
                base_url=f"{self.url}/rest/v1",
                headers={
                    "apikey": self.chave,
                    "Authorization": f"Bearer {self.chave}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                timeout=self.timeout,
                transport=self._transport,
            )
        return self._cliente

    def fechar(self) -> None:
        if self._cliente is not None:
            self._cliente.close()
            self._cliente = None

    def _pedir(self, metodo: str, caminho: str, **kwargs: Any) -> Any:
        cabecalhos = dict(kwargs.pop("headers", {}) or {})
        resposta = self.cliente.request(metodo, caminho, headers=cabecalhos, **kwargs)
        if resposta.status_code >= 400:
            raise ErroSupabase(resposta.status_code, resposta.text.strip(), caminho)
        if not resposta.content:
            return None
        try:
            return resposta.json()
        except ValueError:
            return None

    # --- operacoes ----------------------------------------------------------
    def selecionar(
        self,
        tabela: str,
        filtros: dict[str, str] | None = None,
        ordem: str = "rev.asc",
        limite: int | None = None,
        colunas: str = "*",
    ) -> list[dict]:
        """`GET /{tabela}` com filtros no formato PostgREST (`campo=eq.valor`)."""
        params: dict[str, Any] = {"select": colunas}
        params.update(filtros or {})
        if ordem:
            params["order"] = ordem
        if limite:
            params["limit"] = limite
        return self._pedir("GET", f"/{tabela}", params=params) or []

    def inserir_ou_atualizar(self, tabela: str, registro: dict, conflito: str) -> list[dict]:
        """`POST /{tabela}` com `Prefer: resolution=merge-duplicates` (upsert)."""
        return (
            self._pedir(
                "POST",
                f"/{tabela}",
                params={"on_conflict": conflito},
                json=registro,
                headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            )
            or []
        )

    def atualizar(self, tabela: str, filtros: dict[str, str], valores: dict) -> list[dict]:
        """`PATCH /{tabela}` (usado pelo soft delete)."""
        return (
            self._pedir(
                "PATCH",
                f"/{tabela}",
                params=dict(filtros),
                json=valores,
                headers={"Prefer": "return=representation"},
            )
            or []
        )

    def proximo_rev(self, user_id: str) -> int:
        """Chama a funcao ATOMICA `proximo_rev(user_id)` no Postgres."""
        return int(self._pedir("POST", "/rpc/proximo_rev", json={"p_user_id": str(user_id)}))

    def rev_global(self, user_id: str) -> int:
        linhas = self.selecionar(
            "contadores", {"user_id": f"eq.{user_id}"}, ordem="rev.desc", limite=1
        )
        return int(linhas[0]["rev"]) if linhas else 0

    def apagar(self, tabela: str, filtros: dict[str, str]) -> list[dict]:
        """DELETE de verdade (so para manutencao/limpeza: o APP usa soft delete).

        Existe para o `scripts/verificar.py` remover os proprios registros de teste
        e nao deixar lixo na conta do usuario.
        """
        return self._pedir("DELETE", f"/{tabela}", params=dict(filtros),
                           headers={"Prefer": "return=representation"}) or []

    def ping(self) -> tuple[bool, str]:
        """Confere se o projeto responde na tabela `contadores` (diagnostico)."""
        try:
            self.selecionar("contadores", limite=1)
            return True, "ok"
        except ErroSupabase as erro:
            return False, erro.detalhe
        except httpx.HTTPError as erro:
            return False, str(erro)


def criar_cliente(config) -> ClienteSupabase:
    """Monta o cliente a partir da `Configuracao` (chave `service_role`)."""
    return ClienteSupabase(config.supabase_url, config.supabase_service_role_key)
# 🔄 [FIM: BACKEND - CLIENTE SUPABASE]
