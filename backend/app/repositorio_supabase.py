"""
🗺️ COMPONENTE: Driver Supabase do repositorio (MESMA interface do driver memory)
🎯 OBJETIVO: Implementar `listar/obter/salvar/excluir/rev_global` sobre o PostgREST,
             preservando `rev` do servidor (`proximo_rev` atomico), soft delete e o
             isolamento por `user_id` - sem duplicar a logica do driver de memoria.
🔗 QUEM DEPENDE DELE: `criar_repositorio` (fabrica em `repositorio.py`), `scripts/verificar.py`
                      e os testes (que usam `httpx.MockTransport`, sem rede).

Mapa entidade -> tabela (ver `backend/supabase/schema.sql`):
    cada entidade guarda TODO o payload do cliente em UMA coluna jsonb
    (`dados`, `valor` ou `ranges`); as colunas nomeadas no schema sao GERADAS
    a partir dela - por isso o driver nao precisa conhecer cada campo.
"""
# 💾 [INÍCIO: BACKEND - REPOSITÓRIO SUPABASE]
from __future__ import annotations

from .config import obter_config
from .repositorio import Repositorio, agora_iso, normalizar_entidade
from .supabase_cliente import ClienteSupabase, criar_cliente

ESQUEMA: dict[str, dict[str, str]] = {
    "pastas": {"tabela": "pastas", "pk": "id", "campo": "dados"},
    "notas": {"tabela": "notas", "pk": "id", "campo": "dados"},
    "mapas": {"tabela": "mapas", "pk": "id", "campo": "dados"},
    "modelos": {"tabela": "modelos", "pk": "id", "campo": "dados"},
    "ativos": {"tabela": "ativos", "pk": "id", "campo": "dados"},
    "configuracoes": {"tabela": "configuracoes", "pk": "chave", "campo": "valor"},
    "ativos_anotacoes": {"tabela": "ativos_anotacoes", "pk": "ativo_id", "campo": "ranges"},
}


class RepositorioSupabase(Repositorio):
    """Implementa o contrato de `Repositorio` falando com o Postgres via PostgREST."""

    driver = "supabase"

    def __init__(self, config=None, cliente: ClienteSupabase | None = None) -> None:
        if cliente is None:
            cliente = criar_cliente(config or obter_config())
        self.cliente = cliente

    # --- internos -----------------------------------------------------------
    @staticmethod
    def _cfg(entidade: str) -> tuple[str, dict[str, str]]:
        ent = normalizar_entidade(entidade)
        return ent, ESQUEMA[ent]

    @staticmethod
    def _publico(linha: dict, entidade: str, campo: str) -> dict:
        """Converte a linha do Postgres no mesmo formato publico do driver de memoria."""
        pk = ESQUEMA[entidade]["pk"]
        return {
            "entidade": entidade,
            "id": str(linha.get(pk)),
            "user_id": str(linha.get("user_id")),
            "rev": int(linha.get("rev") or 0),
            "updated_at": linha.get("updated_at"),
            "criado_em": linha.get("criado_em"),
            "deleted_at": linha.get("deleted_at"),
            "dados": linha.get(campo),
        }

    # --- interface ----------------------------------------------------------
    def listar(
        self,
        entidade: str,
        user_id: str,
        since_rev: int = 0,
        incluir_excluidos: bool = False,
    ) -> list[dict]:
        ent, cfg = self._cfg(entidade)
        filtros = {"user_id": f"eq.{user_id}"}
        if since_rev:
            filtros["rev"] = f"gt.{int(since_rev)}"
        if not incluir_excluidos:
            filtros["deleted_at"] = "is.null"
        linhas = self.cliente.selecionar(cfg["tabela"], filtros, ordem="rev.asc")
        return [self._publico(linha, ent, cfg["campo"]) for linha in linhas]

    def obter(
        self,
        entidade: str,
        user_id: str,
        id: str,
        incluir_excluido: bool = False,
    ) -> dict | None:
        ent, cfg = self._cfg(entidade)
        filtros = {"user_id": f"eq.{user_id}", cfg["pk"]: f"eq.{id}"}
        linhas = self.cliente.selecionar(cfg["tabela"], filtros, ordem="rev.desc", limite=1)
        if not linhas:
            return None
        registro = self._publico(linhas[0], ent, cfg["campo"])
        if registro["deleted_at"] and not incluir_excluido:
            return None
        return registro

    def salvar(
        self,
        entidade: str,
        user_id: str,
        id: str,
        dados: dict,
        base_rev: int | None = None,
        forcar: bool = False,
    ) -> dict:
        ent, cfg = self._cfg(entidade)
        if dados is None:
            dados = {}
        if not isinstance(dados, dict):
            raise ValueError("dados deve ser um objeto JSON")
        user_id, id = str(user_id), str(id)
        atual = self.obter(ent, user_id, id, incluir_excluido=True)
        if atual and base_rev is not None and int(base_rev) < atual["rev"] and not forcar:
            # Conflito: devolve a versao do servidor SEM gravar (o sync decide por LWW).
            publico = dict(atual)
            publico["gravado"] = False
            publico["conflito"] = {
                "rev": atual["rev"],
                "updated_at": atual["updated_at"],
                "dados": atual["dados"],
            }
            return publico

        instante = agora_iso()
        linha = {
            "user_id": user_id,
            cfg["pk"]: id,
            cfg["campo"]: dados,
            "rev": self.cliente.proximo_rev(user_id),
            "updated_at": instante,
            "criado_em": (atual or {}).get("criado_em") or instante,
            "deleted_at": None,
        }
        gravadas = self.cliente.inserir_ou_atualizar(
            cfg["tabela"], linha, conflito=f"user_id,{cfg['pk']}"
        )
        registro = self._publico(gravadas[0] if gravadas else linha, ent, cfg["campo"])
        registro["gravado"] = True
        return registro

    def excluir(self, entidade: str, user_id: str, id: str) -> dict | None:
        """Soft delete: PATCH com `deleted_at` + `rev` novo (tombstone se nao existir)."""
        ent, cfg = self._cfg(entidade)
        user_id, id = str(user_id), str(id)
        instante = agora_iso()
        rev = self.cliente.proximo_rev(user_id)
        linhas = self.cliente.atualizar(
            cfg["tabela"],
            {"user_id": f"eq.{user_id}", cfg["pk"]: f"eq.{id}"},
            {"deleted_at": instante, "rev": rev, "updated_at": instante},
        )
        if not linhas:
            tombstone = {
                "user_id": user_id,
                cfg["pk"]: id,
                cfg["campo"]: {},
                "rev": rev,
                "updated_at": instante,
                "criado_em": instante,
                "deleted_at": instante,
            }
            linhas = self.cliente.inserir_ou_atualizar(
                cfg["tabela"], tombstone, conflito=f"user_id,{cfg['pk']}"
            )
        return self._publico(linhas[0], ent, cfg["campo"]) if linhas else None

    def rev_global(self, user_id: str) -> int:
        return self.cliente.rev_global(user_id)

    def salvar_perfil(self, user_id: str, email: str) -> None:
        """Upsert em `profiles` (mesmo id do GoTrue) - secao 3, item 1 do plano."""
        self.cliente.inserir_ou_atualizar(
            "profiles",
            {"id": str(user_id), "email": (email or "").strip().lower()},
            conflito="id",
        )

    # --- diagnostico --------------------------------------------------------
    def ping(self) -> tuple[bool, str]:
        """Confere se o projeto responde (usado pelo `scripts/verificar.py`)."""
        return self.cliente.ping()
# 💾 [FIM: BACKEND - REPOSITÓRIO SUPABASE]
