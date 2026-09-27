"""
🗺️ COMPONENTE: Repositorio de persistencia (interface UNICA + drivers memory/supabase)
🎯 OBJETIVO: Dar a TODO o backend um contrato unico (listar/obter/salvar/excluir/rev_global)
             com `rev` do servidor, soft delete e isolamento por `user_id`.
🔗 QUEM DEPENDE DELE: `main.py` (rotas), `auth.py`, `sync/http.py` e `sync/ws.py`
                      (fases seguintes), `scripts/migrar.py` e os testes.
"""
# ============================================
# 💾 [INÍCIO: BACKEND - REPOSITÓRIO]
from __future__ import annotations

import copy
import threading
from datetime import datetime, timezone
from typing import Any

# Entidades de conteudo (espelham as tabelas do Supabase - ver supabase/schema.sql).
ENTIDADES = (
    "pastas",
    "notas",
    "mapas",
    "configuracoes",
    "modelos",
    "ativos",
    "ativos_anotacoes",
)


def agora_iso() -> str:
    """Instante do SERVIDOR em ISO-8601 UTC (o cliente nunca define o relogio)."""
    return datetime.now(timezone.utc).isoformat()


def normalizar_entidade(entidade: str) -> str:
    ent = str(entidade or "").strip()
    if ent not in ENTIDADES:
        raise ValueError(f"entidade desconhecida: {entidade!r}")
    return ent


# Campos que carregam a data de EDIÇÃO do aparelho. O `updated_at` (persistência no
# servidor) NÃO decide o vencedor do LWW — só a data de edição (`atualizada_em`).
CAMPOS_DE_TEMPO = ("atualizada_em", "atualizadaEm")


def momento(valor) -> float:
    """ISO-8601 (ou epoch) -> epoch em segundos. Devolve 0 quando não dá para ler."""
    if valor in (None, ""):
        return 0.0
    if isinstance(valor, (int, float)) and not isinstance(valor, bool):
        return float(valor)
    texto = str(valor).strip().replace("Z", "+00:00")
    try:
        data = datetime.fromisoformat(texto)
    except ValueError:
        return 0.0
    if data.tzinfo is None:
        data = data.replace(tzinfo=timezone.utc)
    return data.timestamp()


def instante_de_edicao(dados: dict) -> float:
    """A data de EDIÇÃO declarada pelo aparelho (a mais nova entre os apelidos)."""
    if not isinstance(dados, dict):
        return 0.0
    return max((momento(dados.get(campo)) for campo in CAMPOS_DE_TEMPO), default=0.0)


class Repositorio:
    """Contrato dos drivers. Toda implementacao expoe estes 5 metodos.

    Regras (secao 2.5 do plano):
      - `rev` e SEMPRE do servidor (o cliente manda `base_rev`, recebe o novo).
      - Exclusao e SOFT DELETE (`deleted_at`) para propagar entre aparelhos.
      - Toda leitura/escrita e filtrada por `user_id` (isolamento por conta).
    """

    driver = "?"

    def listar(
        self,
        entidade: str,
        user_id: str,
        since_rev: int = 0,
        incluir_excluidos: bool = False,
    ) -> list[dict]:
        raise NotImplementedError

    def obter(
        self,
        entidade: str,
        user_id: str,
        id: str,
        incluir_excluido: bool = False,
    ) -> dict | None:
        raise NotImplementedError

    def salvar(
        self,
        entidade: str,
        user_id: str,
        id: str,
        dados: dict,
        base_rev: int | None = None,
        forcar: bool = False,
    ) -> dict:
        raise NotImplementedError

    def salvar_lww(
        self,
        entidade: str,
        user_id: str,
        id: str,
        dados: dict,
        base_rev: int | None = None,
    ) -> dict:
        """Upsert ATÔMICO com LWW: a edição mais recente prevalece.

        Compara a data de EDIÇÃO declarada pelo cliente (`dados.atualizada_em`) com a
        data de EDIÇÃO da linha GRAVADA — nunca com o `updated_at` de persistência.
        Cliente vence só quando declara instante MAIS NOVO; empate ou ausência de data
        mantém a versão do servidor. Devolve `{gravado: True, ...}` ou
        `{gravado: False, conflito: {rev, updated_at, deleted_at, dados}}`.
        """
        raise NotImplementedError

    def excluir(self, entidade: str, user_id: str, id: str) -> dict | None:
        raise NotImplementedError

    def rev_global(self, user_id: str) -> int:
        raise NotImplementedError

    def salvar_perfil(self, user_id: str, email: str) -> None:
        """Guarda/atualiza o perfil do usuario (tabela `profiles`).

        O driver de memoria nao tem `profiles` (ele mesmo ja guarda o e-mail), entao
        aqui e um no-op; o driver Supabase sobrescreve com um upsert de verdade.
        """
        return None


class RepositorioMemoria(Repositorio):
    """Driver em memoria: sem rede e sem credencial nenhuma. Base dos testes.

    Guarda tudo num dicionario protegido por lock (o backend atende em threads).
    """

    driver = "memory"

    def __init__(self) -> None:
        self._trava = threading.RLock()
        self._dados: dict[str, dict[tuple[str, str], dict]] = {nome: {} for nome in ENTIDADES}
        self._rev: dict[str, int] = {}

    # --- internos ----------------------------------------------------------
    def _proximo_rev(self, user_id: str) -> int:
        """Equivale ao `proximo_rev(user_id)` atomico do Postgres (secao 2 do plano)."""
        with self._trava:
            novo = int(self._rev.get(user_id, 0)) + 1
            self._rev[user_id] = novo
            return novo

    @staticmethod
    def _publico(registro: dict) -> dict:
        """Copia do registro no formato que o sync consome (sem vazar o dict interno)."""
        return {
            "entidade": registro["entidade"],
            "id": registro["id"],
            "user_id": registro["user_id"],
            "rev": registro["rev"],
            "updated_at": registro["updated_at"],
            "criado_em": registro["criado_em"],
            "deleted_at": registro["deleted_at"],
            "dados": copy.deepcopy(registro["dados"]),
        }

    def _novo_registro(
        self,
        entidade: str,
        user_id: str,
        id: str,
        dados: dict,
        atual: dict | None = None,
        excluido: bool = False,
    ) -> dict:
        instante = agora_iso()
        return {
            "entidade": entidade,
            "id": id,
            "user_id": user_id,
            "rev": self._proximo_rev(user_id),
            "updated_at": instante,
            "criado_em": (atual or {}).get("criado_em") or instante,
            "deleted_at": instante if excluido else None,
            "dados": copy.deepcopy(dados),
        }

    # --- interface ---------------------------------------------------------
    def listar(
        self,
        entidade: str,
        user_id: str,
        since_rev: int = 0,
        incluir_excluidos: bool = False,
    ) -> list[dict]:
        ent = normalizar_entidade(entidade)
        piso = int(since_rev or 0)
        with self._trava:
            registros = [r for (dono, _), r in self._dados[ent].items() if dono == str(user_id)]
        saida = [
            self._publico(r)
            for r in registros
            if r["rev"] > piso and (incluir_excluidos or not r["deleted_at"])
        ]
        saida.sort(key=lambda r: r["rev"])
        return saida

    def obter(
        self,
        entidade: str,
        user_id: str,
        id: str,
        incluir_excluido: bool = False,
    ) -> dict | None:
        ent = normalizar_entidade(entidade)
        with self._trava:
            registro = self._dados[ent].get((str(user_id), str(id)))
        if not registro:
            return None
        if registro["deleted_at"] and not incluir_excluido:
            return None
        return self._publico(registro)

    def salvar(
        self,
        entidade: str,
        user_id: str,
        id: str,
        dados: dict,
        base_rev: int | None = None,
        forcar: bool = False,
    ) -> dict:
        ent = normalizar_entidade(entidade)
        if dados is None:
            dados = {}
        if not isinstance(dados, dict):
            raise ValueError("dados deve ser um objeto JSON")
        user_id, id = str(user_id), str(id)
        with self._trava:
            atual = self._dados[ent].get((user_id, id))
            if atual and base_rev is not None and int(base_rev) < atual["rev"] and not forcar:
                # O servidor tem versao mais nova: devolve o conflito SEM gravar.
                publico = self._publico(atual)
                publico["gravado"] = False
                publico["conflito"] = {
                    "rev": atual["rev"],
                    "updated_at": atual["updated_at"],
                    "dados": copy.deepcopy(atual["dados"]),
                }
                return publico
            registro = self._novo_registro(ent, user_id, id, dados, atual=atual)
            self._dados[ent][(user_id, id)] = registro
            saida = self._publico(registro)
        saida["gravado"] = True
        return saida

    def salvar_lww(
        self,
        entidade: str,
        user_id: str,
        id: str,
        dados: dict,
        base_rev: int | None = None,
    ) -> dict:
        ent = normalizar_entidade(entidade)
        if dados is None:
            dados = {}
        if not isinstance(dados, dict):
            raise ValueError("dados deve ser um objeto JSON")
        user_id, id = str(user_id), str(id)
        # A comparação E a gravação acontecem sob a MESMA trava: duas gravações
        # simultâneas não conseguem deixar uma versão antiga vencer.
        with self._trava:
            atual = self._dados[ent].get((user_id, id))
            desejo = instante_de_edicao(dados)
            gravado_instante = instante_de_edicao((atual or {}).get("dados") or {})
            if atual is None or desejo > gravado_instante:
                registro = self._novo_registro(ent, user_id, id, dados, atual=atual)
                self._dados[ent][(user_id, id)] = registro
                saida = self._publico(registro)
                saida["gravado"] = True
                return saida
            # Servidor vence (empate, edição mais antiga ou sem data confiável).
            publico = self._publico(atual)
            publico["gravado"] = False
            publico["conflito"] = {
                "rev": atual["rev"],
                "updated_at": atual["updated_at"],
                "deleted_at": atual["deleted_at"],
                "dados": copy.deepcopy(atual["dados"]),
            }
            return publico

    def excluir(self, entidade: str, user_id: str, id: str) -> dict | None:
        """Soft delete: grava `deleted_at` e um `rev` novo (propaga entre aparelhos)."""
        ent = normalizar_entidade(entidade)
        user_id, id = str(user_id), str(id)
        with self._trava:
            atual = self._dados[ent].get((user_id, id))
            dados = (atual or {}).get("dados") or {}
            registro = self._novo_registro(ent, user_id, id, dados, atual=atual, excluido=True)
            self._dados[ent][(user_id, id)] = registro
        return self._publico(registro)

    def rev_global(self, user_id: str) -> int:
        with self._trava:
            return int(self._rev.get(str(user_id), 0))

    # --- utilidades de teste ------------------------------------------------
    def limpar(self) -> None:
        """Zera tudo (usado entre testes)."""
        with self._trava:
            self._dados = {nome: {} for nome in ENTIDADES}
            self._rev = {}


def criar_repositorio(config=None) -> Repositorio:
    """Fabrica do driver: UM unico `if` decide memoria x Supabase (secao 1 do plano)."""
    if config is None:
        from .config import obter_config

        config = obter_config()
    if getattr(config, "driver", "memory") == "supabase":
        from .repositorio_supabase import RepositorioSupabase

        return RepositorioSupabase(config)
    return RepositorioMemoria()


_REPO_UNICO: Repositorio | None = None


def repositorio() -> Repositorio:
    """Instancia unica do driver (memory ou supabase) para todo o processo.

    Fica aqui (e nao no `main.py`) para que `auth.py`, `sync/*.py` e os scripts usem a
    MESMA instancia sem import circular com o app FastAPI.
    """
    global _REPO_UNICO
    if _REPO_UNICO is None:
        from .config import obter_config

        _REPO_UNICO = criar_repositorio(obter_config())
    return _REPO_UNICO


def definir_repositorio(repo: Repositorio | None) -> None:
    """Troca o driver em uso (usado pelos testes e pelo `scripts/verificar.py`)."""
    global _REPO_UNICO
    _REPO_UNICO = repo
# 💾 [FIM: BACKEND - REPOSITÓRIO]
