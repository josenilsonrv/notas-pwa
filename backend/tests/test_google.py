"""
🗺️ COMPONENTE: Testes do login com Google (`/api/auth/config` e `/api/auth/google`)
🎯 OBJETIVO: Provar, SEM rede, que o backend so aceita um ID token REALMENTE valido (assinatura
             RS256 via JWKS emulado, `iss`, `aud`, `exp`), exige e-mail verificado e faz o
             vinculo automatico por e-mail (a MESMA conta da senha).
🔗 QUEM DEPENDE DELE: `backend/app/google.py`, `backend/app/auth.py` e `backend/app/identidade.py`.
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_GOOGLE]
import json
import time

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jwt.algorithms import RSAAlgorithm

from backend.app import google as google_mod
from backend.app.identidade import ErroIdentidade, IdentidadeGoTrue
from backend.app.main import app
from backend.app.seguranca import reiniciar_limitador

CLIENT_ID = "cliente-de-teste.apps.googleusercontent.com"
EMAIL = "dona@gmail.com"
GT_URL = "https://projeto-falso.supabase.co"

# Chave RSA do "Google" (gerada uma vez): o JWKS emulado publica apenas a parte publica.
_CHAVE = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_KID = "chave-de-teste"
_JWK = json.loads(RSAAlgorithm.to_jwk(_CHAVE.public_key()))
_JWK["kid"] = _KID
_JWKS = {"keys": [_JWK]}


def _jwks_handler(request: httpx.Request) -> httpx.Response:
    if "oauth2" in str(request.url) or str(request.url).endswith("/certs"):
        return httpx.Response(200, json=_JWKS)
    return httpx.Response(404, json={})


def _token(**mudancas) -> str:
    agora = int(time.time())
    corpo = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "1234567890",
        "email": EMAIL,
        "email_verified": True,
        "iat": agora,
        "exp": agora + 3600,
        "name": "Dona Exemplo",
    }
    corpo.update(mudancas)
    return jwt.encode(corpo, _CHAVE, algorithm="RS256", headers={"kid": _KID})


@pytest.fixture()
def google(monkeypatch):
    """Liga o Google com JWKS EMULADO (nenhuma rede) e limpa o estado ao sair.

    Muta o SINGLETON da `Configuracao` (e nao `recarregar()`): trocar o singleton deixaria o
    `main.config` apontando para o objeto antigo e quebraria outros testes (ex.: o HSTS).
    O `monkeypatch` reverte o valor automaticamente.
    """
    from backend.app.config import obter_config

    monkeypatch.setattr(obter_config(), "google_client_id", CLIENT_ID)
    google_mod.definir_verificador(
        google_mod.VerificadorGoogle(transport=httpx.MockTransport(_jwks_handler))
    )
    yield
    google_mod.reiniciar_verificador()


@pytest.fixture()
def cliente():
    with TestClient(app) as c:
        yield c


def _entrar_com_google(cliente, token=None):
    return cliente.post("/api/auth/google", json={"credential": token or _token()})


# --------------------------------------------------------------------------- config
def test_config_sem_client_id_desliga_o_google(cliente):
    # O singleton nasce com `GOOGLE_CLIENT_ID=""` (o conftest zera a variavel): nada de Google.
    assert cliente.get("/api/auth/config").json() == {"google_ativo": False, "google_client_id": ""}


def test_config_com_client_id_liga_o_google(cliente, google):
    corpo = cliente.get("/api/auth/config").json()
    assert corpo == {"google_ativo": True, "google_client_id": CLIENT_ID}
# 🧪 [FIM: TESTE - BACKEND/TEST_GOOGLE - PARTE 1]

# 🧪 [INÍCIO: TESTE - BACKEND/TEST_GOOGLE - PARTE 2]
# --------------------------------------------------------------------------- login
def test_login_google_abre_a_sessao(cliente, google):
    assert _entrar_com_google(cliente).status_code == 204
    corpo = cliente.get("/api/auth/me").json()
    assert corpo["email"] == EMAIL
    assert corpo["id"]
    assert corpo["csrf"]


def test_login_google_reusa_a_conta_pelo_email(cliente, google):
    _entrar_com_google(cliente)
    primeiro = cliente.get("/api/auth/me").json()["id"]
    cliente.cookies.clear()
    assert _entrar_com_google(cliente).status_code == 204
    assert cliente.get("/api/auth/me").json()["id"] == primeiro


def test_login_google_vincula_a_conta_de_senha(cliente, google):
    """Padrao de mercado: e-mail verificado do Google cai na MESMA conta ja existente."""
    assert cliente.post(
        "/api/auth/registrar", json={"email": EMAIL, "senha": "senha-boa-123"}
    ).status_code == 204
    da_senha = cliente.get("/api/auth/me").json()["id"]
    cliente.cookies.clear()
    assert _entrar_com_google(cliente).status_code == 204
    assert cliente.get("/api/auth/me").json()["id"] == da_senha


def test_email_nao_verificado_da_403(cliente, google):
    resposta = _entrar_com_google(cliente, _token(email_verified=False))
    assert resposta.status_code == 403
    assert resposta.json()["detail"] == google_mod.MSG_EMAIL
    assert cliente.get("/api/auth/me").status_code == 401


def test_aud_errado_da_400(cliente, google):
    assert _entrar_com_google(cliente, _token(aud="outro-cliente")).status_code == 400


def test_token_expirado_da_400(cliente, google):
    agora = int(time.time())
    assert _entrar_com_google(cliente, _token(iat=agora - 7200, exp=agora - 3600)).status_code == 400


def test_token_lixo_da_400(cliente, google):
    assert _entrar_com_google(cliente, "nao-e-um-jwt").status_code == 400


def test_assinatura_de_outra_chave_da_400(cliente, google):
    """Token com o `kid` certo mas assinado por OUTRA chave privada: recusado."""
    outra = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    agora = int(time.time())
    token = jwt.encode(
        {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "email": EMAIL,
            "email_verified": True,
            "iat": agora,
            "exp": agora + 3600,
        },
        outra,
        algorithm="RS256",
        headers={"kid": _KID},
    )
    assert _entrar_com_google(cliente, token).status_code == 400
    assert cliente.get("/api/auth/me").status_code == 401


def test_google_fora_do_ar_da_503(cliente, google):
    def cai(_request):
        raise httpx.ConnectError("sem rede")

    google_mod.definir_verificador(google_mod.VerificadorGoogle(transport=httpx.MockTransport(cai)))
    resposta = _entrar_com_google(cliente)
    assert resposta.status_code == 503
    assert resposta.json()["detail"] == google_mod.MSG_INDISPONIVEL


def test_login_google_desligado_da_503(cliente):
    # Sem Client ID (padrao da suite), a rota recusa: o front nem chega a mostrar o botao.
    resposta = _entrar_com_google(cliente)
    assert resposta.status_code == 503
    assert resposta.json()["detail"] == "Login com Google indisponivel"


def test_rate_limit_do_google_e_por_ip(cliente, google):
    reiniciar_limitador()
    for _ in range(5):
        assert _entrar_com_google(cliente, "lixo").status_code == 400
    assert _entrar_com_google(cliente, "lixo").status_code == 429


# --------------------------------------------------------------------------- unitario
def test_verificador_aceita_o_token_do_google():
    verificador = google_mod.VerificadorGoogle(transport=httpx.MockTransport(_jwks_handler))
    dados = verificador.verificar(_token(), CLIENT_ID)
    assert dados["email"] == EMAIL
    assert dados["email_verified"] is True


def test_email_do_token_exige_verificacao():
    google_mod.definir_verificador(
        google_mod.VerificadorGoogle(transport=httpx.MockTransport(_jwks_handler))
    )
    try:
        with pytest.raises(google_mod.ErroGoogle) as erro:
            google_mod.email_do_token(_token(email_verified=False), CLIENT_ID)
        assert erro.value.status == 403
    finally:
        google_mod.reiniciar_verificador()


# --------------------------------------------------------------------------- GoTrue
def test_gotrue_google_reusa_o_usuario_pelo_email():
    metodos = []

    def handler(request):
        metodos.append(request.method)
        if request.method == "GET":
            return httpx.Response(200, json={"users": [{"id": "u-9", "email": EMAIL}]})
        return httpx.Response(500, json={"msg": "nao deveria criar"})

    provedor = IdentidadeGoTrue(GT_URL, "service-role-fake", transport=httpx.MockTransport(handler))
    assert provedor.google(EMAIL) == "u-9"
    assert metodos == ["GET"], "reusou a conta: nenhum POST /admin/users"


def test_gotrue_google_cria_usuario_sem_senha_util():
    visto = {}

    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json={"users": []})
        visto["url"] = str(request.url)
        visto["corpo"] = json.loads(request.content)
        return httpx.Response(200, json={"id": "u-novo"})

    provedor = IdentidadeGoTrue(GT_URL, "service-role-fake", transport=httpx.MockTransport(handler))
    assert provedor.google(EMAIL, "Dona") == "u-novo"
    assert visto["url"] == f"{GT_URL}/auth/v1/admin/users"
    assert visto["corpo"]["email"] == EMAIL
    assert visto["corpo"]["email_confirm"] is True
    assert visto["corpo"]["password"]


def test_gotrue_google_falha_de_rede_vira_503():
    def cai(_request):
        raise httpx.ConnectError("sem rede")

    provedor = IdentidadeGoTrue(GT_URL, "service-role-fake", transport=httpx.MockTransport(cai))
    with pytest.raises(ErroIdentidade) as erro:
        provedor.google(EMAIL)
    assert erro.value.status == 503
# 🧪 [FIM: TESTE - BACKEND/TEST_GOOGLE - PARTE 2]
