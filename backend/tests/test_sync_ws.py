"""
🗺️ COMPONENTE: Testes do WebSocket de sincronizacao (`/ws`)
🎯 OBJETIVO: Provar o protocolo do plano (secao 7) sem navegador: handshake com sessao obrigatoria
             (4401), `hello`/`bemvindo` com delta e tombstones, `op` -> `ack` -> `change` PARA OS
             OUTROS (nunca eco ao autor), `conflito` com `base_rev` velho, `erro` de payload e de
             acesso negado, `ping`/`pong` e ISOLAMENTO entre contas.
🔗 QUEM DEPENDE DELE: `backend/app/sync/ws.py`, `sync/regras.py` e `main.py`.
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_SYNC_WS]
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app.main import app

SENHA = "senha-boa-123"


def registrar(cliente: TestClient, email: str) -> TestClient:
    """Registra a conta NESTE cliente (o cookie de sessao fica no proprio cliente)."""
    assert cliente.post("/api/auth/registrar", json={"email": email, "senha": SENHA}).status_code == 204
    return cliente


def novo_cliente(email: str) -> TestClient:
    """TestClient novo com a conta REGISTRADA."""
    return registrar(TestClient(app), email)


def agora(deslocamento_segundos: int = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=deslocamento_segundos)).isoformat()


def operacao(entidade: str, id_: str, dados: dict, **extras) -> dict:
    corpo = {"t": "op", "entidade": entidade, "acao": "upsert", "id": id_, "dados": dados}
    corpo.update(extras)
    return corpo


def escrever(socket, operacao_: dict) -> dict:
    """Manda uma `op` e devolve a resposta IMEDIATA dela (`ack` ou `conflito`/`erro`)."""
    socket.send_json(operacao_)
    return socket.receive_json()


def coletar(socket, *envios) -> list[dict]:
    """Manda mensagens e devolve tudo o que chegar ATE o `pong` (inclusive `bemvindo`).

    O servidor responde na ordem em que recebe, entao `hello` + `ping` basta para ler um
    delta inteiro sem depender de tempo: o `pong` e a sentinela do fim.
    """
    for envio in envios:
        socket.send_json(envio)
    socket.send_json({"t": "ping"})
    recebidas: list[dict] = []
    while True:
        mensagem = socket.receive_json()
        if mensagem["t"] == "pong":
            return recebidas
        recebidas.append(mensagem)


def test_ws_sem_sessao_fecha_4401():
    """Sem cookie de sessao o socket NAO entra no hub: fechamento 4401 (sem loop de reconexao)."""
    with TestClient(app) as cliente:
        with pytest.raises(WebSocketDisconnect) as erro:
            with cliente.websocket_connect("/ws") as socket:
                socket.receive_text()
        assert erro.value.code == 4401


def test_origin_fora_da_lista_fecha_4401():
    """`Origin` que nao esta em ORIGENS_PERMITIDAS tambem e recusado (anti-CSRF do handshake)."""
    with TestClient(app) as cliente:
        registrar(cliente, "origin@exemplo.com")
        with pytest.raises(WebSocketDisconnect) as erro:
            with cliente.websocket_connect("/ws", headers={"origin": "http://malicioso.exemplo"}) as socket:
                socket.receive_text()
        assert erro.value.code == 4401
def test_hello_devolve_bemvindo_e_delta_com_tombstones():
    """`hello` traz `bemvindo` + o delta por `rev`; com `desde_rev > 0` o delta traz tombstones."""
    with TestClient(app) as cliente:
        registrar(cliente, "hello-ws@exemplo.com")
        with cliente.websocket_connect("/ws") as socket:
            inicial = coletar(socket, {"t": "hello", "desde_rev": 0})
            assert inicial[0]["t"] == "bemvindo"
            assert inicial[0]["rev_global"] == 0
            assert inicial[0]["usuario"]["email"] == "hello-ws@exemplo.com"
            assert inicial[1:] == [], "conta vazia: nenhum change"

            assert escrever(socket, operacao("notas", "n1", {"nome": "um"}))["t"] == "ack"
            assert escrever(socket, operacao("notas", "n2", {"nome": "dois"}))["t"] == "ack"
            apagada = escrever(socket, {"t": "op", "entidade": "notas", "acao": "delete", "id": "n1"})
            assert apagada["t"] == "ack" and apagada["deleted_at"]

            # Carga inicial (desde_rev = 0): SEM tombstones.
            completa = coletar(socket, {"t": "hello", "desde_rev": 0})
            assert completa[0]["rev_global"] == 3
            assert [m["id"] for m in completa[1:]] == ["n2"]

            # Delta (desde_rev > 0): COM o tombstone de n1.
            delta = coletar(socket, {"t": "hello", "desde_rev": 1})
            por_id = {m["id"]: m for m in delta[1:]}
            assert por_id["n1"]["deleted_at"], "o delta traz o tombstone"
            assert por_id["n1"]["rev"] == 3
            assert por_id["n2"]["dados"]["nome"] == "dois"


def test_change_vai_para_o_outro_socket_e_nao_ecoa_no_autor():
    """Dois aparelhos da mesma conta: o 2º recebe o `change`; o autor recebe SO o `ack`."""
    with TestClient(app) as cliente:
        registrar(cliente, "dois-sockets@exemplo.com")
        with cliente.websocket_connect("/ws") as socket_a, cliente.websocket_connect("/ws") as socket_b:
            coletar(socket_a, {"t": "hello", "desde_rev": 0})
            coletar(socket_b, {"t": "hello", "desde_rev": 0})

            socket_a.send_json(operacao("notas", "n1", {"nome": "Primeira"}, id_local="c1"))
            ack = socket_a.receive_json()
            assert ack["t"] == "ack" and ack["id_local"] == "c1" and ack["rev"] == 1

            change = socket_b.receive_json()
            assert change["t"] == "change"
            assert (change["entidade"], change["id"]) == ("notas", "n1")
            assert change["dados"]["nome"] == "Primeira"

            # O AUTOR nao recebe eco: a proxima mensagem dele e o `pong` do ping (nada antes).
            assert coletar(socket_a) == [], "o autor NUNCA recebe o proprio change"


def test_conflito_quando_base_rev_e_velho():
    """`base_rev` velho e payload sem instante mais novo: `conflito` com a versao do servidor."""
    with TestClient(app) as cliente:
        registrar(cliente, "conflito-ws@exemplo.com")
        with cliente.websocket_connect("/ws") as socket:
            servidor = operacao("notas", "n1", {"nome": "servidor", "atualizada_em": agora(60)})
            assert escrever(socket, servidor)["t"] == "ack"
            velho = operacao("notas", "n1", {"nome": "velho", "atualizada_em": agora(-600)}, base_rev=0, id_local="c2")
            resposta = escrever(socket, velho)
            assert resposta["t"] == "conflito"
            assert resposta["motivo"] == "rev_mais_novo"
            assert resposta["id_local"] == "c2"
            assert resposta["versao_atual"]["dados"]["nome"] == "servidor"


def test_payload_invalido_vira_erro_sem_derrubar_a_conexao():
    """JSON quebrado, `op` sem id e tipo desconhecido viram `erro` — e o socket SEGUE vivo."""
    with TestClient(app) as cliente:
        registrar(cliente, "payload-ws@exemplo.com")
        with cliente.websocket_connect("/ws") as socket:
            socket.send_text("isto nao e json")
            erro = socket.receive_json()
            assert erro["t"] == "erro" and erro["codigo"] == "payload_invalido"

            socket.send_json({"t": "op"})
            assert socket.receive_json()["codigo"] == "payload_invalido"

            socket.send_json({"t": "teleporte"})
            assert socket.receive_json()["codigo"] == "payload_invalido"

            # A conexao continua utilizavel depois de tudo isso.
            assert escrever(socket, operacao("notas", "n1", {"nome": "viva"}))["t"] == "ack"


def test_acesso_negado_quando_o_user_id_diverge_da_sessao():
    """Compatibilidade P84: `user_id` declarado diferente da sessao -> `erro.acesso_negado`."""
    with TestClient(app) as cliente:
        registrar(cliente, "acesso-ws@exemplo.com")
        with cliente.websocket_connect("/ws") as socket:
            alheio = operacao("notas", "n1", {"nome": "x"}, id_local="c9", user_id="outro-usuario")
            resposta = escrever(socket, alheio)
            assert resposta["t"] == "erro"
            assert resposta["codigo"] == "acesso_negado"
            assert resposta["id_local"] == "c9"
            # Nada foi gravado na conta do usuario da sessao.
            delta = coletar(socket, {"t": "hello", "desde_rev": 0})
            assert delta[1:] == []


def test_ping_responde_pong():
    """Heartbeat do protocolo: `ping` -> `pong`."""
    with TestClient(app) as cliente:
        registrar(cliente, "ping@exemplo.com")
        with cliente.websocket_connect("/ws") as socket:
            socket.send_json({"t": "ping"})
            assert socket.receive_json() == {"t": "pong"}


def test_isolamento_entre_contas_no_ws():
    """A nunca ve o dado de B e o socket de B nunca recebe o change de A."""
    with TestClient(app) as cliente_a, TestClient(app) as cliente_b:
        registrar(cliente_a, "a-ws@exemplo.com")
        registrar(cliente_b, "b-ws@exemplo.com")
        with cliente_a.websocket_connect("/ws") as socket_a:
            with cliente_b.websocket_connect("/ws") as socket_b:
                coletar(socket_a, {"t": "hello", "desde_rev": 0})
                coletar(socket_b, {"t": "hello", "desde_rev": 0})

                assert escrever(socket_a, operacao("notas", "n1", {"nome": "do A"}))["t"] == "ack"
                assert coletar(socket_b) == [], "contas diferentes: B nao recebe o change de A"
                assert coletar(socket_b, {"t": "hello", "desde_rev": 0})[1:] == []

                # B grava o MESMO id: nao le nem afeta o dado de A.
                assert escrever(socket_b, operacao("notas", "n1", {"nome": "do B"}))["t"] == "ack"
                nomes = [m["dados"]["nome"] for m in coletar(socket_a, {"t": "hello", "desde_rev": 0})[1:]]
                assert nomes == ["do A"]


def test_origin_da_propria_origem_do_pedido_e_aceito():
    """Origem ÚNICA (decisão nº 4): `Origin` igual ao `Host` do pedido é o caso normal e passa."""
    with TestClient(app) as cliente:
        registrar(cliente, "mesma-origem@exemplo.com")
        socket = cliente.websocket_connect("/ws", headers={"origin": "http://testserver"})
        with socket as aberto:
            aberto.send_json({"t": "ping"})
            assert aberto.receive_json() == {"t": "pong"}


def test_vigia_fecha_socket_em_silencio(monkeypatch):
    """Sem NENHUMA mensagem por `LIMITE_SILENCIO`, o servidor fecha o socket morto (1001)."""
    from backend.app.sync import ws as ws_mod

    monkeypatch.setattr(ws_mod, "INTERVALO_VIGIA", 0.01)
    monkeypatch.setattr(ws_mod, "LIMITE_SILENCIO", 0.05)
    with TestClient(app) as cliente:
        registrar(cliente, "vigia@exemplo.com")
        with pytest.raises(WebSocketDisconnect) as erro:
            with cliente.websocket_connect("/ws") as socket:
                socket.receive_text()
        assert erro.value.code == 1001
# 🧪 [FIM: TESTE - BACKEND/TEST_SYNC_WS]

