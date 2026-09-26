"""
🗺️ COMPONENTE: Testes do `/health` e do estatico seguro do PWA
🎯 OBJETIVO: Provar que o backend sobe em `memory` sem credencial, que `/health` responde e
             que o estatico NUNCA entrega `backend/`, `.env`, `docs/`, `tests/` ou `node_modules/`.
🔗 QUEM DEPENDE DELE: `backend/app/main.py` (rotas + allowlist do estatico).
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_HEALTH]
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture()
def cliente():
    with TestClient(app) as c:
        yield c


def test_health_sobe_em_memory(cliente):
    resposta = cliente.get("/health")
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["ok"] is True
    assert corpo["driver"] == "memory"
    assert corpo["modo"] == "local"
    assert corpo["supabase"] is False
    # Diagnostico de deploy sem shell: onde o servidor esta ouvindo.
    assert "host" in corpo and "porta" in corpo


def test_porta_aceita_o_padrao_dos_paas(monkeypatch):
    """`PORTA` (do .env) vence; `PORT` (Render/Heroku/Fly) e o fallback; senao 8000."""
    from backend.app.config import montar

    monkeypatch.delenv("PORTA", raising=False)
    monkeypatch.delenv("PORT", raising=False)
    assert montar().porta == 8000
    monkeypatch.setenv("PORT", "10000")
    assert montar().porta == 10000
    monkeypatch.setenv("PORTA", "9000")
    assert montar().porta == 9000, "a variavel do .env tem prioridade"


def test_raiz_serve_o_index_html(cliente):
    resposta = cliente.get("/")
    assert resposta.status_code == 200
    assert resposta.headers["content-type"].startswith("text/html")
    assert "notesEditor" in resposta.text


def test_serve_os_modulos_do_pwa(cliente):
    for caminho, tipo in (
        ("/app.js", "application/javascript"),
        ("/notes/editor.js", "application/javascript"),
        ("/mapa/mapa.js", "application/javascript"),
        ("/styles.css", "text/css"),
        ("/manifest.json", "application/json"),
    ):
        resposta = cliente.get(caminho)
        assert resposta.status_code == 200, caminho
        assert resposta.headers["content-type"].startswith(tipo), caminho


def test_sw_nunca_e_cacheado(cliente):
    resposta = cliente.get("/sw.js")
    assert resposta.status_code == 200
    assert resposta.headers["content-type"].startswith("application/javascript")
    assert "no-store" in resposta.headers["cache-control"]
    assert resposta.headers["service-worker-allowed"] == "/"


def test_cabecalhos_de_seguranca_no_app(cliente):
    """CSP por HASH (cacheável), nosniff, anti-clickjacking e WS liberado no connect-src."""
    resposta = cliente.get("/")
    politica = resposta.headers["content-security-policy"]
    assert "sha256-" in politica, "o script inline do index.html entra por hash"
    assert "frame-ancestors 'none'" in politica
    assert "connect-src 'self' ws: wss:" in politica, "o WebSocket precisa passar"
    assert "object-src 'none'" in politica
    assert resposta.headers["x-content-type-options"] == "nosniff"
    assert resposta.headers["x-frame-options"] == "DENY"
    assert resposta.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    # HSTS só quando SESSAO_SEGURA=true (em http://localhost ele atrapalharia).
    assert "strict-transport-security" not in resposta.headers
    # O JS não recebe CSP (não é documento), mas recebe o nosniff.
    assert cliente.get("/app.js").headers["x-content-type-options"] == "nosniff"


def test_hashes_inline_mudam_com_o_conteudo():
    """O hash acompanha o TEXTO do script inline (é o que permite a CSP ser cacheável)."""
    from backend.app.main import _hashes_inline, csp_do_html
    from backend.app.config import obter_config

    assert _hashes_inline("<script>um()</script>") != _hashes_inline("<script>dois()</script>")
    assert _hashes_inline("<script src='externo.js'></script>") == []
    assert "sha256-" in csp_do_html(obter_config().raiz / "index.html")


def test_hsts_aparece_com_sessao_segura(monkeypatch):
    from backend.app import config as config_mod
    from backend.app.main import cabecalhos_de_seguranca

    monkeypatch.setattr(config_mod.obter_config(), "seguro", True, raising=False)
    index = config_mod.obter_config().raiz / "index.html"
    assert "Strict-Transport-Security" in cabecalhos_de_seguranca(index)


@pytest.mark.parametrize(
    "caminho",
    [
        "/backend/.env",
        "/backend/app/main.py",
        "/.env",
        "/.git/config",
        "/docs/COMO-RODAR-TESTES.md",
        "/tests/run-all.cjs",
        "/node_modules/playwright/package.json",
        "/../backend/.env",
        "/notes/../backend/app/config.py",
        "/nao-existe.js",
    ],
)
def test_estatico_bloqueia_fora_do_pwa(cliente, caminho):
    assert cliente.get(caminho).status_code == 404
# 🧪 [FIM: TESTE - BACKEND/TEST_HEALTH]
