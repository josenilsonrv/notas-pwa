"""
🗺️ COMPONENTE: Testes do sync por HTTP (`/api/sync/snapshot` e `/api/sync/push`)
🎯 OBJETIVO: Provar sessão obrigatória, CSRF, `ack` só quando persiste, LWW por `updated_at`,
             soft delete com tombstone no delta e ISOLAMENTO entre contas.
🔗 QUEM DEPENDE DELE: `backend/app/sync/http.py`, `sync/regras.py` e `main.py`.
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_SYNC_HTTP]
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.app.main import app

SENHA = "senha-boa-123"


def novo_cliente(email):
    """Registra a conta e devolve `(TestClient, csrf)` já logado."""
    cliente = TestClient(app)
    assert cliente.post("/api/auth/registrar", json={"email": email, "senha": SENHA}).status_code == 204
    return cliente, cliente.get("/api/auth/me").json()["csrf"]


def agora(deslocamento_segundos=0):
    return (datetime.now(timezone.utc) + timedelta(seconds=deslocamento_segundos)).isoformat()


def op(entidade, id_, dados, **extras):
    corpo = {"entidade": entidade, "acao": "upsert", "id": id_, "dados": dados}
    corpo.update(extras)
    return corpo


def empurrar(cliente, csrf, *operacoes):
    resposta = cliente.post("/api/sync/push", json={"ops": list(operacoes)}, headers={"X-CSRF": csrf})
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def test_snapshot_e_push_exigem_sessao():
    with TestClient(app) as cliente:
        assert cliente.get("/api/sync/snapshot").status_code == 401
        assert cliente.post("/api/sync/push", json={"ops": []}).status_code == 401


def test_push_exige_csrf():
    cliente, _csrf = novo_cliente("csrf@exemplo.com")
    resposta = cliente.post("/api/sync/push", json={"ops": [op("notas", "n1", {"nome": "x"})]})
    assert resposta.status_code == 403
    assert resposta.json()["detail"] == "CSRF invalido"


def test_push_e_snapshot_ida_e_volta():
    cliente, csrf = novo_cliente("ida@exemplo.com")
    vazio = cliente.get("/api/sync/snapshot").json()
    assert vazio["rev_global"] == 0
    assert all(lista == [] for lista in vazio["entidades"].values())
    assert vazio["usuario"]["email"] == "ida@exemplo.com"

    corpo = empurrar(
        cliente, csrf,
        op("notas", "n1", {"nome": "Primeira", "conteudo_html": "<p>oi</p>", "atualizada_em": agora()}),
    )
    assert corpo["conflitos"] == [] and len(corpo["acks"]) == 1
    ack = corpo["acks"][0]
    assert (ack["entidade"], ack["id"], ack["rev"]) == ("notas", "n1", 1)
    assert corpo["rev_global"] == 1

    estado = cliente.get("/api/sync/snapshot").json()
    assert estado["entidades"]["notas"][0]["dados"]["conteudo_html"] == "<p>oi</p>"
    assert estado["entidades"]["mapas"] == [], "as outras entidades seguem vazias"


def test_ack_devolve_o_id_local_da_fila():
    cliente, csrf = novo_cliente("fila@exemplo.com")
    corpo = empurrar(cliente, csrf, op("notas", "n1", {"nome": "um"}, id_local="c1"))
    assert corpo["acks"][0]["id_local"] == "c1"


def test_delta_por_desde_rev():
    cliente, csrf = novo_cliente("delta@exemplo.com")
    empurrar(cliente, csrf, op("notas", "n1", {"nome": "um"}), op("notas", "n2", {"nome": "dois"}))
    delta = cliente.get("/api/sync/snapshot?desde_rev=1").json()
    assert [nota["id"] for nota in delta["entidades"]["notas"]] == ["n2"]
    assert delta["desde_rev"] == 1


def test_delete_vira_tombstone_no_delta():
    cliente, csrf = novo_cliente("apagar@exemplo.com")
    empurrar(cliente, csrf, op("notas", "n1", {"nome": "um"}))
    corpo = empurrar(cliente, csrf, {"entidade": "notas", "acao": "delete", "id": "n1", "id_local": "f1"})
    assert corpo["acks"][0]["deleted_at"]

    inicial = cliente.get("/api/sync/snapshot").json()
    assert inicial["entidades"]["notas"] == [], "a carga inicial nao traz apagados"
    delta = cliente.get("/api/sync/snapshot?desde_rev=1").json()
    assert delta["entidades"]["notas"][0]["deleted_at"], "o delta traz o tombstone"


def test_lww_cliente_mais_novo_vence():
    cliente, csrf = novo_cliente("lww@exemplo.com")
    empurrar(cliente, csrf, op("notas", "n1", {"nome": "servidor", "atualizada_em": agora(-600)}))
    # O aparelho declara um instante MAIS NOVO: vence, mesmo com `base_rev` velho.
    corpo = empurrar(
        cliente, csrf,
        op("notas", "n1", {"nome": "cliente", "atualizada_em": agora(5)}, base_rev=0),
    )
    assert corpo["conflitos"] == [] and corpo["acks"], corpo
    estado = cliente.get("/api/sync/snapshot").json()["entidades"]["notas"][0]["dados"]
    assert estado["nome"] == "cliente"


def test_lww_conflito_quando_o_payload_e_mais_velho():
    cliente, csrf = novo_cliente("conflito@exemplo.com")
    empurrar(cliente, csrf, op("notas", "n1", {"nome": "servidor", "atualizada_em": agora(5)}))
    corpo = empurrar(
        cliente, csrf,
        op("notas", "n1", {"nome": "velho", "atualizada_em": agora(-600)}, base_rev=0),
    )
    assert corpo["acks"] == []
    conflito = corpo["conflitos"][0]
    assert conflito["motivo"] == "rev_mais_novo"
    assert conflito["versao_atual"]["dados"]["nome"] == "servidor"
    assert conflito["id_local"] == ""
    # O servidor NAO foi sobrescrito.
    estado = cliente.get("/api/sync/snapshot").json()["entidades"]["notas"][0]["dados"]
    assert estado["nome"] == "servidor"


def test_isolamento_entre_contas():
    a, csrf_a = novo_cliente("a@exemplo.com")
    b, csrf_b = novo_cliente("b@exemplo.com")
    empurrar(a, csrf_a, op("notas", "n1", {"nome": "do A"}))

    assert b.get("/api/sync/snapshot").json()["entidades"]["notas"] == []
    # B empurrando o MESMO id nao le nem afeta o dado de A.
    empurrar(b, csrf_b, op("notas", "n1", {"nome": "do B"}))
    assert a.get("/api/sync/snapshot").json()["entidades"]["notas"][0]["dados"]["nome"] == "do A"
    assert b.get("/api/sync/snapshot").json()["entidades"]["notas"][0]["dados"]["nome"] == "do B"


def test_op_invalida_nao_derruba_o_lote():
    cliente, csrf = novo_cliente("lote@exemplo.com")
    corpo = empurrar(
        cliente, csrf,
        op("notas", "n1", {"nome": "boa"}),
        op("planilhas", "x", {}),
        op("notas", "n2", {"nome": "outra boa"}),
    )
    assert [ack["id"] for ack in corpo["acks"]] == ["n1", "n2"], "as ops boas passaram"
    assert corpo["conflitos"][0]["motivo"] == "payload_invalido"
    assert "entidade desconhecida" in corpo["conflitos"][0]["detalhe"]


def test_escopo_completo_passa_pelo_mesmo_caminho():
    """Mapas, pastas, configuracoes e modelos (secao 6) ja viajam pelo MESMO push."""
    cliente, csrf = novo_cliente("escopo@exemplo.com")
    corpo = empurrar(
        cliente, csrf,
        op("pastas", "pasta-geral", {"nome": "Geral", "ordem": 0}),
        op("mapas", "m1", {"nome": "Mapa", "pasta_id": "pasta-geral", "grafo": {"nos": []}}),
        op("configuracoes", "nota-ativa", {"valor": "n7"}),
        op("modelos", "tpl-1", {"tipo": "nota", "nome": "Modelo", "payload": {"html": "<p>x</p>"}}),
    )
    assert len(corpo["acks"]) == 4 and corpo["conflitos"] == []
    entidades = cliente.get("/api/sync/snapshot").json()["entidades"]
    assert entidades["mapas"][0]["dados"]["grafo"] == {"nos": []}
    assert entidades["configuracoes"][0]["dados"] == {"valor": "n7"}
    assert entidades["modelos"][0]["dados"]["tipo"] == "nota"
    assert entidades["pastas"][0]["dados"]["ordem"] == 0
# 🧪 [FIM: TESTE - BACKEND/TEST_SYNC_HTTP]
