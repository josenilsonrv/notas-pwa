"""
🗺️ COMPONENTE: Testes do repositorio (driver `memory`)
🎯 OBJETIVO: Provar o contrato unico: CRUD, `rev` do servidor, delta por `since_rev`,
             soft delete, conflito por `base_rev` velho e ISOLAMENTO entre `user_id`.
🔗 QUEM DEPENDE DELE: `backend/app/repositorio.py` (contrato que o driver `supabase` repete).
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_REPOSITORIO]
import pytest

from backend.app.config import Configuracao
from backend.app.repositorio import (
    ENTIDADES,
    RepositorioMemoria,
    criar_repositorio,
    normalizar_entidade,
)

A = "usuario-a"
B = "usuario-b"


def test_entidade_desconhecida_e_recusada(repo):
    with pytest.raises(ValueError):
        normalizar_entidade("planilhas")
    with pytest.raises(ValueError):
        repo.salvar("planilhas", A, "x", {})


def test_dados_precisam_ser_objeto(repo):
    with pytest.raises(ValueError):
        repo.salvar("notas", A, "n1", ["nao", "e", "objeto"])


def test_salvar_cria_nota_com_rev_1(repo):
    gravado = repo.salvar("notas", A, "n1", {"nome": "Primeira", "pasta_id": None})
    assert gravado["gravado"] is True
    assert gravado["rev"] == 1
    assert gravado["id"] == "n1"
    assert gravado["deleted_at"] is None
    assert gravado["dados"] == {"nome": "Primeira", "pasta_id": None}
    assert repo.rev_global(A) == 1


def test_rev_e_do_servidor_e_cresce_a_cada_escrita(repo):
    assert repo.salvar("notas", A, "n1", {"nome": "um"})["rev"] == 1
    assert repo.salvar("notas", A, "n1", {"nome": "dois"})["rev"] == 2
    assert repo.salvar("notas", A, "n2", {"nome": "tres"})["rev"] == 3
    assert repo.rev_global(A) == 3
    assert repo.rev_global(B) == 0


def test_obter_atualiza_e_preserva_criado_em(repo):
    primeiro = repo.salvar("notas", A, "n1", {"nome": "um"})
    segundo = repo.salvar("notas", A, "n1", {"nome": "dois"})
    assert segundo["criado_em"] == primeiro["criado_em"]
    assert repo.obter("notas", A, "n1")["dados"] == {"nome": "dois"}
    assert repo.obter("notas", A, "nao-existe") is None


def test_listar_ordenado_por_rev(repo):
    repo.salvar("notas", A, "n2", {"nome": "dois"})
    repo.salvar("notas", A, "n1", {"nome": "um"})
    lista = repo.listar("notas", A)
    assert [registro["id"] for registro in lista] == ["n2", "n1"]
    assert [registro["rev"] for registro in lista] == [1, 2]


def test_delta_por_since_rev(repo):
    repo.salvar("notas", A, "n1", {"nome": "um"})
    repo.salvar("notas", A, "n2", {"nome": "dois"})
    repo.salvar("notas", A, "n3", {"nome": "tres"})
    delta = repo.listar("notas", A, since_rev=1)
    assert [registro["id"] for registro in delta] == ["n2", "n3"]


def test_soft_delete_propaga_mas_some_da_lista(repo):
    repo.salvar("notas", A, "n1", {"nome": "um"})
    excluido = repo.excluir("notas", A, "n1")
    assert excluido["deleted_at"] is not None
    assert excluido["rev"] == 2
    assert repo.obter("notas", A, "n1") is None
    assert repo.listar("notas", A) == []
    # O tombstones precisa aparecer no delta para os outros aparelhos removerem.
    tombstones = repo.listar("notas", A, incluir_excluidos=True)
    assert len(tombstones) == 1 and tombstones[0]["deleted_at"]
    assert repo.obter("notas", A, "n1", incluir_excluido=True)["rev"] == 2


def test_conflito_de_base_rev_nao_grava(repo):
    repo.salvar("notas", A, "n1", {"nome": "servidor"})
    resultado = repo.salvar("notas", A, "n1", {"nome": "cliente-velho"}, base_rev=0)
    assert resultado["gravado"] is False
    assert resultado["conflito"]["rev"] == 1
    assert resultado["conflito"]["dados"] == {"nome": "servidor"}
    assert repo.obter("notas", A, "n1")["dados"] == {"nome": "servidor"}


def test_base_rev_certo_grava_e_forcar_resolve_o_conflito(repo):
    repo.salvar("notas", A, "n1", {"nome": "servidor"})
    ok = repo.salvar("notas", A, "n1", {"nome": "cliente"}, base_rev=1)
    assert ok["gravado"] is True and ok["rev"] == 2

    repo.salvar("notas", A, "n1", {"nome": "servidor-2"})
    venceu = repo.salvar("notas", A, "n1", {"nome": "cliente-2"}, base_rev=1, forcar=True)
    assert venceu["gravado"] is True
    assert repo.obter("notas", A, "n1")["dados"] == {"nome": "cliente-2"}


def test_isolamento_entre_usuarios(repo):
    repo.salvar("notas", A, "n1", {"nome": "do A", "segredo": True})
    repo.salvar("mapas", A, "m1", {"nome": "mapa do A"})
    assert repo.obter("notas", B, "n1") is None
    assert repo.listar("notas", B) == []
    assert repo.listar("mapas", B) == []
    assert repo.rev_global(B) == 0
    # B gravando o MESMO id nao sobrescreve o dado de A
    repo.salvar("notas", B, "n1", {"nome": "do B"})
    assert repo.obter("notas", A, "n1")["dados"]["nome"] == "do A"
    assert repo.obter("notas", B, "n1")["dados"]["nome"] == "do B"


def test_nao_vaza_referencia_do_dict_interno(repo):
    original = {"nome": "um", "tags": ["a"]}
    repo.salvar("notas", A, "n1", original)
    original["tags"].append("mutacao-externa")
    assert repo.obter("notas", A, "n1")["dados"]["tags"] == ["a"]
    copia = repo.obter("notas", A, "n1")
    copia["dados"]["tags"].append("outra")
    assert repo.obter("notas", A, "n1")["dados"]["tags"] == ["a"]


def test_todas_as_entidades_do_schema_existem(repo):
    assert set(ENTIDADES) == {
        "pastas",
        "notas",
        "mapas",
        "configuracoes",
        "modelos",
        "ativos",
        "ativos_anotacoes",
    }
    for nome in ENTIDADES:
        repo.salvar(nome, A, f"{nome}-1", {"ok": True})
    for nome in ENTIDADES:
        assert repo.obter(nome, A, f"{nome}-1") is not None


def test_fabrica_usa_memory_quando_nao_ha_credencial():
    assert isinstance(criar_repositorio(Configuracao(driver_pedido="memory")), RepositorioMemoria)
    # "auto" sem credenciais tambem cai em memory
    assert isinstance(criar_repositorio(Configuracao(driver_pedido="auto")), RepositorioMemoria)
    assert criar_repositorio(Configuracao(driver_pedido="memory")).driver == "memory"
# 🧪 [FIM: TESTE - BACKEND/TEST_REPOSITORIO]
