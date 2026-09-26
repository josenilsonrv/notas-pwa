"""
🗺️ COMPONENTE: Testes do driver `supabase` (com o PostgREST emulado em memoria)
🎯 OBJETIVO: Provar que o driver `supabase` cumpre o MESMO contrato do `memory` e monta as
             chamadas certas (filtro por `user_id`, `deleted_at=is.null`, `rev=gt.N`, upsert,
             soft delete por PATCH) - sem rede, sem credencial e sem banco.
🔗 QUEM DEPENDE DELE: `backend/app/repositorio_supabase.py`, `supabase_cliente.py` e
                      `backend/tests/apoio_supabase.py`.
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_REPOSITORIO_SUPABASE]
import httpx
import pytest

from apoio_supabase import FakePostgrest, repo_falso
from backend.app.repositorio import ENTIDADES
from backend.app.repositorio_supabase import ESQUEMA
from backend.app.supabase_cliente import ClienteSupabase, ErroSupabase

A = "11111111-1111-1111-1111-111111111111"
B = "22222222-2222-2222-2222-222222222222"


@pytest.fixture()
def par():
    return repo_falso()


def test_esquema_cobre_todas_as_entidades():
    assert set(ESQUEMA) == set(ENTIDADES)
    assert ESQUEMA["configuracoes"]["pk"] == "chave"
    assert ESQUEMA["configuracoes"]["campo"] == "valor"
    assert ESQUEMA["ativos_anotacoes"]["pk"] == "ativo_id"
    assert ESQUEMA["ativos_anotacoes"]["campo"] == "ranges"


def test_salvar_e_obter_ida_e_volta(par):
    repo, fake = par
    gravado = repo.salvar("notas", A, "n1", {"nome": "Primeira", "conteudo_html": "<p>oi</p>"})
    assert gravado["gravado"] is True
    assert gravado["rev"] == 1
    assert repo.obter("notas", A, "n1")["dados"] == {
        "nome": "Primeira",
        "conteudo_html": "<p>oi</p>",
    }
    # O payload vai para a coluna jsonb da entidade (o resto do schema e coluna gerada).
    assert fake.linhas("notas")[0]["dados"]["nome"] == "Primeira"


def test_listar_filtra_por_usuario_e_nao_traz_excluidos(par):
    repo, fake = par
    repo.salvar("notas", A, "n1", {"nome": "do A"})
    repo.salvar("notas", B, "n1", {"nome": "do B"})
    lista = repo.listar("notas", A)
    assert [linha["id"] for linha in lista] == ["n1"]
    assert lista[0]["dados"]["nome"] == "do A"
    metodo, caminho, params = fake.chamadas[-1]
    assert metodo == "GET" and caminho == "rest/v1/notas"
    assert params["user_id"] == f"eq.{A}"
    assert params["deleted_at"] == "is.null"
    assert params["order"] == "rev.asc"


def test_delta_por_since_rev_vira_rev_gt(par):
    repo, fake = par
    repo.salvar("notas", A, "n1", {"nome": "um"})
    repo.salvar("notas", A, "n2", {"nome": "dois"})
    assert [linha["id"] for linha in repo.listar("notas", A, since_rev=1)] == ["n2"]
    assert fake.chamadas[-1][2]["rev"] == "gt.1"


def test_obter_usa_limite_1_e_o_pk_da_entidade(par):
    repo, fake = par
    repo.salvar("configuracoes", A, "nota-ativa", {"valor": "n7"})
    assert repo.obter("configuracoes", A, "nota-ativa")["dados"] == {"valor": "n7"}
    metodo, caminho, params = fake.chamadas[-1]
    assert caminho == "rest/v1/configuracoes"
    assert params["chave"] == "eq.nota-ativa"
    assert params["limit"] == "1"


def test_upsert_usa_on_conflict_com_pk(par):
    repo, fake = par
    repo.salvar("notas", A, "n1", {"nome": "um"})
    assert fake.chamadas[-1][2]["on_conflict"] == "user_id,id"
    repo.salvar("ativos_anotacoes", A, "a1", {"ranges": []})
    assert fake.chamadas[-1][1] == "rest/v1/ativos_anotacoes"
    assert fake.chamadas[-1][2]["on_conflict"] == "user_id,ativo_id"


def test_soft_delete_usa_patch_e_nunca_delete(par):
    repo, fake = par
    repo.salvar("notas", A, "n1", {"nome": "um"})
    excluido = repo.excluir("notas", A, "n1")
    assert excluido["deleted_at"] is not None
    assert excluido["rev"] == 2
    assert repo.obter("notas", A, "n1") is None
    assert repo.listar("notas", A) == []
    assert repo.listar("notas", A, incluir_excluidos=True)[0]["deleted_at"]
    assert "DELETE" not in fake.caminhos()
    assert any(metodo == "PATCH" for metodo, _, _ in fake.chamadas)


def test_excluir_inexistente_cria_tombstone(par):
    repo, fake = par
    tombstone = repo.excluir("notas", A, "fantasma")
    assert tombstone["id"] == "fantasma"
    assert tombstone["deleted_at"] is not None
    assert fake.chamadas[-1][0] == "POST"
    assert repo.listar("notas", A) == []


def test_conflito_de_base_rev_nao_grava(par):
    repo, fake = par
    repo.salvar("notas", A, "n1", {"nome": "servidor"})
    resultado = repo.salvar("notas", A, "n1", {"nome": "velho"}, base_rev=0)
    assert resultado["gravado"] is False
    assert resultado["conflito"]["dados"] == {"nome": "servidor"}
    assert repo.obter("notas", A, "n1")["dados"] == {"nome": "servidor"}
    # So UM POST na tabela aconteceu (o do primeiro salvar); o conflito NAO gravou.
    posts_na_tabela = [caminho for caminho in fake.caminhos("POST") if caminho == "rest/v1/notas"]
    assert len(posts_na_tabela) == 1


def test_forcar_sobrepoe_o_conflito(par):
    repo, _fake = par
    repo.salvar("notas", A, "n1", {"nome": "servidor"})
    venceu = repo.salvar("notas", A, "n1", {"nome": "cliente"}, base_rev=0, forcar=True)
    assert venceu["gravado"] is True
    assert repo.obter("notas", A, "n1")["dados"] == {"nome": "cliente"}


def test_rev_global_le_o_contador(par):
    repo, _fake = par
    assert repo.rev_global(A) == 0
    repo.salvar("notas", A, "n1", {"nome": "um"})
    repo.salvar("mapas", A, "m1", {"nome": "mapa"})
    assert repo.rev_global(A) == 2
    assert repo.rev_global(B) == 0


def test_dados_invalidos_sao_recusados(par):
    repo, _fake = par
    with pytest.raises(ValueError):
        repo.salvar("notas", A, "n1", ["nao", "e", "objeto"])
    with pytest.raises(ValueError):
        repo.salvar("planilhas", A, "x", {})


def test_erro_do_postgrest_vira_ErroSupabase():
    def handler(_request):
        return httpx.Response(404, json={"message": 'relation "contadores" does not exist'})

    cliente = ClienteSupabase(
        "https://projeto-falso.supabase.co",
        "chave",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(ErroSupabase) as erro:
        cliente.selecionar("contadores")
    assert erro.value.status == 404
    assert "does not exist" in erro.value.detalhe
    ok, detalhe = cliente.ping()
    assert ok is False and "does not exist" in detalhe


def test_apagar_remove_de_verdade_para_limpeza(par):
    """`apagar` existe so para manutencao (o APP nunca faz DELETE: usa soft delete)."""
    repo, fake = par
    repo.salvar("notas", A, "n1", {"nome": "um"})
    repo.cliente.apagar("notas", {"user_id": f"eq.{A}", "id": "eq.n1"})
    assert repo.obter("notas", A, "n1", incluir_excluido=True) is None
    assert fake.linhas("notas") == []


def test_cliente_monta_rest_v1_e_headers_de_service_role():
    fake = FakePostgrest()
    capturado = {}

    def handler(request):
        capturado["url"] = str(request.url)
        capturado["apikey"] = request.headers.get("apikey")
        capturado["auth"] = request.headers.get("authorization")
        return fake.handler(request)

    cliente = ClienteSupabase(
        "https://projeto-falso.supabase.co/",
        "service-role-abc",
        transport=httpx.MockTransport(handler),
    )
    cliente.selecionar("notas", {"user_id": f"eq.{A}"})
    assert capturado["url"].startswith("https://projeto-falso.supabase.co/rest/v1/notas?")
    assert capturado["apikey"] == "service-role-abc"
    assert capturado["auth"] == "Bearer service-role-abc"
# 🧪 [FIM: TESTE - BACKEND/TEST_REPOSITORIO_SUPABASE]
