"""
🗺️ COMPONENTE: Testes do login (`/api/auth`) e da camada de seguranca
🎯 OBJETIVO: Provar o fluxo completo (registrar -> me -> logout -> me 401), o cookie
             `HttpOnly`, o CSRF nas escritas, o rate-limit e que senha errada e e-mail
             inexistente devolvem a MESMA mensagem.
🔗 QUEM DEPENDE DELE: `backend/app/auth.py`, `seguranca.py`, `identidade.py` e `main.py`.
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_AUTH]
import json
import time

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.identidade import ErroIdentidade, IdentidadeGoTrue
from backend.app.main import app
from backend.app.seguranca import _b64, obter_assinador, reiniciar_limitador

EMAIL = "dona@exemplo.com"
SENHA = "senha-boa-123"


@pytest.fixture()
def cliente():
    with TestClient(app) as c:
        yield c


def _registrar(cliente, email=EMAIL, senha=SENHA):
    return cliente.post("/api/auth/registrar", json={"email": email, "senha": senha})


def _login(cliente, email=EMAIL, senha=SENHA):
    return cliente.post("/api/auth/login", json={"email": email, "senha": senha})


def _cookie_sessao(cliente) -> str:
    return cliente.cookies.get("py_session", "")


def test_registrar_ja_deixa_logado(cliente):
    resposta = _registrar(cliente)
    assert resposta.status_code == 204
    assert _cookie_sessao(cliente)
    corpo = cliente.get("/api/auth/me").json()
    assert corpo["email"] == EMAIL
    assert corpo["id"]
    # Rosto da conta: quem entra por senha nao tem foto (o front mostra o e-mail).
    assert corpo["provedor"] == "senha"
    assert corpo["foto"] == ""


def test_cookie_e_httponly_lax_e_com_validade(cliente):
    cabecalho = _registrar(cliente).headers["set-cookie"].lower()
    assert "httponly" in cabecalho
    assert "samesite=lax" in cabecalho
    assert "path=/" in cabecalho
    assert "max-age=" in cabecalho


def test_sem_sessao_me_devolve_401(cliente):
    resposta = cliente.get("/api/auth/me")
    assert resposta.status_code == 401
    assert resposta.json()["detail"] == "sem sessao"


def test_logout_encerra_a_sessao_e_e_idempotente(cliente):
    _registrar(cliente)
    csrf = cliente.get("/api/auth/me").json()["csrf"]
    assert cliente.post("/api/auth/logout", headers={"X-CSRF": csrf}).status_code == 204
    assert cliente.get("/api/auth/me").status_code == 401
    # de novo, sem sessao: tambem 204 (idempotente)
    assert cliente.post("/api/auth/logout").status_code == 204


def test_escrita_com_sessao_sem_csrf_da_403(cliente):
    _registrar(cliente)
    resposta = cliente.post("/api/auth/logout")
    assert resposta.status_code == 403
    assert resposta.json()["detail"] == "CSRF invalido"
    # e com um CSRF errado tambem
    assert cliente.post("/api/auth/logout", headers={"X-CSRF": "chute"}).status_code == 403


def test_login_funciona_e_devolve_o_mesmo_usuario(cliente):
    _registrar(cliente)
    user_id = cliente.get("/api/auth/me").json()["id"]
    cliente.cookies.clear()
    assert cliente.get("/api/auth/me").status_code == 401
    assert _login(cliente).status_code == 204
    assert cliente.get("/api/auth/me").json()["id"] == user_id


def test_senha_errada_e_email_inexistente_dao_a_MESMA_mensagem(cliente):
    _registrar(cliente)
    cliente.cookies.clear()
    errada = _login(cliente, senha="senha-errada")
    inexistente = _login(cliente, email="ninguem@exemplo.com")
    assert errada.status_code == inexistente.status_code == 401
    assert errada.json() == inexistente.json()
    assert errada.json()["detail"] == "E-mail ou senha invalidos"


def test_registrar_email_repetido_e_generico(cliente):
    assert _registrar(cliente).status_code == 204
    repetido = _registrar(cliente)
    assert repetido.status_code == 400
    assert repetido.json()["detail"] == "Nao foi possivel criar a conta"


def test_validacao_de_email_e_senha(cliente):
    assert _registrar(cliente, email="sem-arroba").status_code == 400
    assert _registrar(cliente, email="a@b").status_code == 400
    assert _registrar(cliente, senha="123").status_code == 400
    # nada foi criado com os pedidos invalidos...
    assert cliente.get("/api/auth/me").status_code == 401
    # ...e o pedido valido continua funcionando
    assert _registrar(cliente).status_code == 204


def test_rate_limit_bloqueia_depois_de_5_tentativas(cliente):
    _registrar(cliente)
    cliente.cookies.clear()
    # O REGISTRO tambem consome o rate-limit (o plano pede "login/registro"):
    # zeramos aqui para medir exatamente as 5 tentativas de login.
    reiniciar_limitador()
    for _ in range(5):
        assert _login(cliente, senha="errada").status_code == 401
    bloqueado = _login(cliente, senha="errada")
    assert bloqueado.status_code == 429
    assert "Muitas tentativas" in bloqueado.json()["detail"]
    # o login CERTO tambem espera a janela passar (proteção e por IP+e-mail)
    assert _login(cliente).status_code == 429


def test_login_certo_libera_o_rate_limit(cliente):
    _registrar(cliente)
    cliente.cookies.clear()
    assert _login(cliente, senha="errada").status_code == 401
    assert _login(cliente).status_code == 204
    cliente.cookies.clear()
    assert _login(cliente, senha="errada").status_code == 401
    assert _login(cliente).status_code == 204


def _sessao_antiga() -> str:
    """Cookie no formato ANTIGO (payload sem `provedor`/`foto`), assinado de verdade."""
    agora = time.time()
    corpo = json.dumps({
        "uid": "u-antigo",
        "email": EMAIL,
        "csrf": "csrf-antigo",
        "iat": agora,
        "exp": agora + 600,
    })
    assinatura = obter_assinador()._assinar(_b64(corpo.encode("utf-8")).encode("ascii"))
    return f"{_b64(corpo.encode('utf-8'))}.{assinatura}"


def test_cookie_sem_provedor_continua_valendo(cliente):
    """Sessao emitida ANTES do campo existir segue logada e cai no rosto padrao (`senha`)."""
    cliente.cookies.set("py_session", _sessao_antiga())
    corpo = cliente.get("/api/auth/me").json()
    assert corpo["id"] == "u-antigo"
    assert corpo["email"] == EMAIL
    assert corpo["provedor"] == "senha"
    assert corpo["foto"] == ""


def test_cookie_adulterado_e_recusado(cliente):
    _registrar(cliente)
    token = _cookie_sessao(cliente)
    cliente.cookies.set("py_session", token.split(".")[0] + "." + "a" * 43)
    assert cliente.get("/api/auth/me").status_code == 401


def test_sessao_de_outro_segredo_e_recusada(cliente):
    _registrar(cliente)
    # troca o segredo do assinador: o cookie emitido antes deixa de valer
    obter_assinador()._chave = b"outro-segredo-completamente-diferente"
    assert cliente.get("/api/auth/me").status_code == 401


# ---------------------------------------------------------------------------
# Provedor REAL (GoTrue do Supabase) com transporte emulado: prova as URLs/corpos
# enviados e que o token do GoTrue NAO e guardado em lugar nenhum.
# ---------------------------------------------------------------------------
GT_URL = "https://projeto-falso.supabase.co"


def _gotrue(handler) -> IdentidadeGoTrue:
    return IdentidadeGoTrue(GT_URL, "service-role-fake", transport=httpx.MockTransport(handler))


def test_gotrue_registrar_usa_endpoint_admin_com_email_confirmado():
    visto = {}

    def handler(request):
        visto["url"] = str(request.url)
        visto["corpo"] = json.loads(request.content)
        visto["apikey"] = request.headers.get("apikey")
        return httpx.Response(200, json={"id": "u-123"})

    provedor = _gotrue(handler)
    assert provedor.registrar("Dona@Exemplo.com", SENHA) == "u-123"
    assert visto["url"] == f"{GT_URL}/auth/v1/admin/users"
    assert visto["corpo"] == {
        "email": EMAIL,
        "password": SENHA,
        "email_confirm": True,
    }
    assert visto["apikey"] == "service-role-fake"


def test_gotrue_login_usa_grant_type_password():
    visto = {}

    def handler(request):
        visto["url"] = str(request.url)
        return httpx.Response(200, json={"access_token": "tok-secreto", "user": {"id": "u-123"}})

    provedor = _gotrue(handler)
    assert provedor.autenticar(EMAIL, SENHA) == "u-123"
    assert "grant_type=password" in visto["url"]
    assert visto["url"].startswith(f"{GT_URL}/auth/v1/token")


def test_gotrue_credencial_invalida_devolve_none():
    provedor = _gotrue(lambda _r: httpx.Response(400, json={"msg": "invalid"}))
    assert provedor.autenticar(EMAIL, SENHA) is None


def test_gotrue_falha_de_rede_vira_503():
    def handler(_request):
        raise httpx.ConnectError("sem rede")

    provedor = _gotrue(handler)
    with pytest.raises(ErroIdentidade) as erro:
        provedor.autenticar(EMAIL, SENHA)
    assert erro.value.status == 503
    with pytest.raises(ErroIdentidade):
        provedor.registrar(EMAIL, SENHA)


def test_gotrue_registro_repetido_nao_revela_o_motivo():
    provedor = _gotrue(lambda _r: httpx.Response(422, json={"msg": "User already registered"}))
    with pytest.raises(ErroIdentidade) as erro:
        provedor.registrar(EMAIL, SENHA)
    assert erro.value.status == 400
    assert "already registered" not in str(erro.value)


def test_gotrue_usuario_le_o_perfil():
    def handler(request):
        if request.url.path.endswith("/admin/users/u-123"):
            return httpx.Response(
                200, json={"id": "u-123", "email": EMAIL, "created_at": "2026-01-01T00:00:00Z"}
            )
        return httpx.Response(404, json={"msg": "nao achei"})

    provedor = _gotrue(handler)
    assert provedor.usuario("u-123")["email"] == EMAIL
    assert provedor.usuario("u-999") is None
# 🧪 [FIM: TESTE - BACKEND/TEST_AUTH]


def test_corpo_invalido_mantem_o_contrato_detail_string(cliente):
    resposta = cliente.post("/api/auth/login", json=["nao", "e", "objeto"])
    assert resposta.status_code == 422
    assert isinstance(resposta.json()["detail"], str)
