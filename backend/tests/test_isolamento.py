"""
🗺️ COMPONENTE: Testes de ISOLAMENTO entre contas (nos DOIS drivers)
🎯 OBJETIVO: Provar que o usuario A nunca le nem escreve dado do usuario B - inclusive
             quando tenta reutilizar o MESMO `id` do outro (o risco mais serio do plano).
🔗 QUEM DEPENDE DELE: `backend/app/repositorio.py` (memory) e `repositorio_supabase.py`,
                      via a fixture `repo_qualquer` (conftest).
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_ISOLAMENTO]
import pytest

A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def test_listar_e_sempre_do_dono(repo_qualquer):
    repo_qualquer.salvar("notas", A, "n1", {"nome": "do A", "segredo": "so o A ve"})
    repo_qualquer.salvar("notas", B, "n2", {"nome": "do B"})
    assert [nota["id"] for nota in repo_qualquer.listar("notas", A)] == ["n1"]
    assert [nota["id"] for nota in repo_qualquer.listar("notas", B)] == ["n2"]
    assert repo_qualquer.listar("notas", "cccccccc-cccc-cccc-cccc-cccccccccccc") == []


def test_obter_id_do_outro_devolve_none(repo_qualquer):
    repo_qualquer.salvar("notas", A, "n1", {"nome": "do A"})
    assert repo_qualquer.obter("notas", B, "n1") is None
    assert repo_qualquer.obter("notas", A, "n1")["dados"]["nome"] == "do A"


def test_mesmo_id_em_contas_diferentes_nao_colide(repo_qualquer):
    repo_qualquer.salvar("mapas", A, "m1", {"nome": "mapa do A", "grafo": {"nos": ["A"]}})
    repo_qualquer.salvar("mapas", B, "m1", {"nome": "mapa do B", "grafo": {"nos": ["B"]}})
    assert repo_qualquer.obter("mapas", A, "m1")["dados"]["grafo"] == {"nos": ["A"]}
    assert repo_qualquer.obter("mapas", B, "m1")["dados"]["grafo"] == {"nos": ["B"]}


def test_excluir_do_outro_nao_apaga_nada(repo_qualquer):
    repo_qualquer.salvar("notas", A, "n1", {"nome": "do A"})
    repo_qualquer.excluir("notas", B, "n1")
    assert repo_qualquer.obter("notas", A, "n1")["dados"]["nome"] == "do A"


def test_rev_global_e_por_conta(repo_qualquer):
    repo_qualquer.salvar("notas", A, "n1", {"nome": "um"})
    repo_qualquer.salvar("notas", A, "n2", {"nome": "dois"})
    repo_qualquer.salvar("notas", B, "n1", {"nome": "um do B"})
    assert repo_qualquer.rev_global(A) == 2
    assert repo_qualquer.rev_global(B) == 1


@pytest.mark.parametrize("entidade", ["pastas", "notas", "mapas", "configuracoes", "modelos"])
def test_todas_as_entidades_respeitam_o_dono(repo_qualquer, entidade):
    repo_qualquer.salvar(entidade, A, "x1", {"nome": "do A"})
    assert repo_qualquer.obter(entidade, B, "x1") is None
    assert repo_qualquer.listar(entidade, B) == []
    assert repo_qualquer.obter(entidade, A, "x1")["dados"]["nome"] == "do A"
# 🧪 [FIM: TESTE - BACKEND/TEST_ISOLAMENTO]