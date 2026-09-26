"""
🗺️ COMPONENTE: Apoio de teste - emulador minimo do PostgREST
🎯 OBJETIVO: Testar o driver `supabase` (URLs, upsert, soft delete, `rev`) SEM rede, SEM
             credencial e SEM banco. O que sobra para o `scripts/verificar.py` provar de verdade.
🔗 QUEM DEPENDE DELE: `test_repositorio_supabase.py` e `test_isolamento.py`.
"""
# 🧪 [INÍCIO: TESTE - BACKEND/APOIO_SUPABASE]
from __future__ import annotations

import json
from urllib.parse import parse_qsl, urlparse

import httpx

PK_POR_TABELA = {"configuracoes": "chave", "ativos_anotacoes": "ativo_id"}
PARAMS_DE_CONTROLE = ("select", "order", "limit", "offset", "on_conflict", "columns")


def _pk(tabela: str) -> str:
    return PK_POR_TABELA.get(tabela, "id")


class FakePostgrest:
    """Emula o subconjunto do PostgREST que o driver usa (filtros eq/gt/is.null + order)."""

    def __init__(self) -> None:
        self.tabelas: dict[str, dict[tuple[str, str], dict]] = {}
        self.contador: dict[str, int] = {}
        self.chamadas: list[tuple[str, str, dict]] = []

    # --- utilidades --------------------------------------------------------
    def linhas(self, tabela: str) -> list[dict]:
        return list(self.tabelas.get(tabela, {}).values())

    def proximo_rev(self, user_id: str) -> int:
        novo = int(self.contador.get(str(user_id), 0)) + 1
        self.contador[str(user_id)] = novo
        # A funcao REAL faz upsert em `contadores` (por isso `rev_global` le de la):
        # aqui espelhamos esse efeito, senao o teste de `rev_global` mediria outra coisa.
        self.tabelas.setdefault("contadores", {})[(str(user_id), str(user_id))] = {
            "user_id": str(user_id),
            "rev": novo,
        }
        return novo

    def caminhos(self, metodo: str | None = None) -> list[str]:
        return [c for m, c, _ in self.chamadas if metodo is None or m == metodo]

    def _filtrar(self, tabela: str, params: dict) -> list[dict]:
        linhas = self.linhas(tabela)
        for campo, filtro in params.items():
            if campo in PARAMS_DE_CONTROLE:
                continue
            if filtro == "is.null":
                linhas = [linha for linha in linhas if linha.get(campo) is None]
            elif filtro.startswith("eq."):
                alvo = filtro[3:]
                linhas = [linha for linha in linhas if str(linha.get(campo)) == alvo]
            elif filtro.startswith("gt."):
                piso = float(filtro[3:])
                linhas = [linha for linha in linhas if float(linha.get(campo) or 0) > piso]
            elif filtro.startswith("neq."):
                alvo = filtro[4:]
                linhas = [linha for linha in linhas if str(linha.get(campo)) != alvo]
        ordem = params.get("order")
        if ordem:
            campo, _, direcao = ordem.partition(".")
            linhas.sort(key=lambda linha: float(linha.get(campo) or 0), reverse=(direcao == "desc"))
        limite = params.get("limit")
        if limite:
            linhas = linhas[: int(limite)]
        return linhas

    # --- HTTP -------------------------------------------------------------
    def _rpc(self, partes: list[str], request: httpx.Request) -> httpx.Response:
        funcao = partes[3] if len(partes) > 3 else ""
        if funcao != "proximo_rev":
            return httpx.Response(404, json={"message": "rpc desconhecida"})
        corpo = json.loads(request.content or b"{}")
        return httpx.Response(200, json=self.proximo_rev(str(corpo.get("p_user_id"))))

    def _tabela(self, tabela: str, request: httpx.Request, params: dict) -> httpx.Response:
        self.tabelas.setdefault(tabela, {})
        if request.method == "GET":
            return httpx.Response(200, json=self._filtrar(tabela, params))
        if request.method == "POST":
            linha = json.loads(request.content or b"{}")
            if not linha.get("user_id"):
                return httpx.Response(400, json={"message": "user_id e obrigatorio"})
            chave = (str(linha["user_id"]), str(linha.get(_pk(tabela))))
            self.tabelas[tabela][chave] = linha
            return httpx.Response(201, json=[linha])
        if request.method == "PATCH":
            valores = json.loads(request.content or b"{}")
            linhas = self._filtrar(tabela, params)
            for linha in linhas:
                linha.update(valores)
            return httpx.Response(200, json=linhas)
        if request.method == "DELETE":
            # DELETE de verdade: so o `scripts/verificar.py` usa (limpeza dos proprios testes).
            alvos = self._filtrar(tabela, params)
            for linha in alvos:
                chave = (str(linha["user_id"]), str(linha.get(_pk(tabela))))
                self.tabelas[tabela].pop(chave, None)
            return httpx.Response(200, json=alvos)
        return httpx.Response(405, json={"message": "metodo nao suportado"})

    def handler(self, request: httpx.Request) -> httpx.Response:
        partes = [parte for parte in urlparse(str(request.url)).path.split("/") if parte]
        params = dict(parse_qsl(urlparse(str(request.url)).query))
        self.chamadas.append((request.method, "/".join(partes), params))
        if partes[:2] != ["rest", "v1"] or len(partes) < 3:
            return httpx.Response(404, json={"message": "rota desconhecida"})
        if partes[2] == "rpc":
            return self._rpc(partes, request)
        return self._tabela(partes[2], request, params)


def repo_falso(url: str = "https://projeto-falso.supabase.co"):
    """Devolve `(RepositorioSupabase, FakePostgrest)` pronto para uso nos testes."""
    from backend.app.repositorio_supabase import RepositorioSupabase
    from backend.app.supabase_cliente import ClienteSupabase

    fake = FakePostgrest()
    cliente = ClienteSupabase(
        url=url,
        chave="service-role-de-teste",
        transport=httpx.MockTransport(fake.handler),
    )
    return RepositorioSupabase(cliente=cliente), fake
# 🧪 [FIM: TESTE - BACKEND/APOIO_SUPABASE]
