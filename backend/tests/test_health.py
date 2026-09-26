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
