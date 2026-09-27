"""
🗺️ COMPONENTE: Testes da regra LWW atômica do repositório (`salvar_lww`)
🎯 OBJETIVO: Provar que a versão com a data de EDIÇÃO mais recente prevalece — comparando
             `atualizada_em` (edição) contra `atualizada_em` (edição) da linha gravada, e NUNCA
             contra o `updated_at` de persistência do servidor. Cobre `base_rev` ausente, empate
             (vence o servidor) e conteúdo sem data confiável.
🔗 QUEM DEPENDE DELE: `backend/app/repositorio.py`, `repositorio_supabase.py` e `sync/regras.py`.
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_SYNC_LWW]
from datetime import datetime, timedelta, timezone

import pytest

from backend.app.repositorio import RepositorioMemoria

A = "usuario-a"


def iso(deslocamento_segundos=0):
    return (datetime.now(timezone.utc) + timedelta(seconds=deslocamento_segundos)).isoformat()


def test_nova_entidade_sempre_grava(repo_qualquer):
    resultado = repo_qualquer.salvar_lww("notas", A, "n1", {"nome": "x", "atualizada_em": iso(0)})
    assert resultado["gravado"] is True
    assert resultado["rev"] == 1


def test_antigo_nao_sobrescreve_recente_sem_base_rev(repo_qualquer):
    """Defeito reproduzido: op antiga SEM `base_rev` sobrescrevia a recente."""
    repo_qualquer.salvar_lww("notas", A, "n1", {"nome": "recente", "atualizada_em": iso(5)})
    resultado = repo_qualquer.salvar_lww("notas", A, "n1", {"nome": "velho", "atualizada_em": iso(-600)})
    assert resultado["gravado"] is False
    assert resultado["conflito"]["dados"]["nome"] == "recente"
    assert repo_qualquer.obter("notas", A, "n1")["dados"]["nome"] == "recente"


def test_recente_vence_mesmo_com_base_rev_velho(repo_qualquer):
    repo_qualquer.salvar_lww("notas", A, "n1", {"nome": "servidor", "atualizada_em": iso(-600)})
    resultado = repo_qualquer.salvar_lww(
        "notas", A, "n1", {"nome": "cliente", "atualizada_em": iso(5)}, base_rev=0
    )
    assert resultado["gravado"] is True
    assert repo_qualquer.obter("notas", A, "n1")["dados"]["nome"] == "cliente"


def test_empate_mantem_a_versao_do_servidor(repo_qualquer):
    instante = iso(0)
    repo_qualquer.salvar_lww("notas", A, "n1", {"nome": "servidor", "atualizada_em": instante})
    resultado = repo_qualquer.salvar_lww("notas", A, "n1", {"nome": "cliente", "atualizada_em": instante})
    assert resultado["gravado"] is False
    assert repo_qualquer.obter("notas", A, "n1")["dados"]["nome"] == "servidor"


def test_sem_data_confiavel_nao_vence_data_existente(repo_qualquer):
    """Conteúdo local SEM data confiável não recebe data inventada para vencer."""
    repo_qualquer.salvar_lww("notas", A, "n1", {"nome": "recente", "atualizada_em": iso(5)})
    resultado = repo_qualquer.salvar_lww("notas", A, "n1", {"nome": "sem-data"})
    assert resultado["gravado"] is False
    assert repo_qualquer.obter("notas", A, "n1")["dados"]["nome"] == "recente"


def test_isolamento_por_conta_no_lww(repo_qualquer):
    """A regra LWW nunca cruza contas: o `salvar_lww` de B não lê nem afeta o de A."""
    repo_qualquer.salvar_lww("notas", A, "n1", {"nome": "recente", "atualizada_em": iso(5)})
    repo_qualquer.salvar_lww("notas", "usuario-b", "n1", {"nome": "velho-b", "atualizada_em": iso(-600)})
    assert repo_qualquer.obter("notas", A, "n1")["dados"]["nome"] == "recente"


def test_gravacoes_concorrentes_dependem_da_data_nao_da_ordem():
    """Duas gravações simultâneas: vence a de data MAIS NOVA, independentemente da ordem."""
    import threading

    repo = RepositorioMemoria()
    # Data-base comum: a edição "nova" é 100s à frente da "velha". Preenchemos um registro
    # intermediário para que AMBAS as gravações concorrentes disputem contra uma linha existente
    # (e o resultado seja determinístico: quem perde sempre recebe `gravado=False`).
    base = datetime.now(timezone.utc)
    repo.salvar_lww("notas", A, "n1", {"nome": "base", "atualizada_em": base.isoformat()})
    datas = {"nova": base + timedelta(seconds=100), "velha": base + timedelta(seconds=-100)}
    # A ordem de início varia; o resultado não pode depender dela.
    ordem = [("nova", 0), ("velha", 0.01)]
    barreira = threading.Barrier(2)
    resultados = {}

    def gravar(nome, atraso):
        import time as _t
        _t.sleep(atraso)
        barreira.wait()
        resultados[nome] = repo.salvar_lww(
            "notas", A, "n1", {"nome": nome, "atualizada_em": datas[nome].isoformat()}
        )

    fios = [threading.Thread(target=gravar, args=(nome, atraso)) for nome, atraso in ordem]
    for fio in fios:
        fio.start()
    for fio in fios:
        fio.join()

    assert repo.obter("notas", A, "n1")["dados"]["nome"] == "nova"
    # A versão "velha" é SEMPRE recusada (perde para a base ou para a nova).
    assert resultados["velha"]["gravado"] is False
# 🧪 [FIM: TESTE - BACKEND/TEST_SYNC_LWW]
