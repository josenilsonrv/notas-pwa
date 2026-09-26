"""
🗺️ COMPONENTE: Testes dos anexos na nuvem (`/api/note-assets/*` + Storage)
🎯 OBJETIVO: Provar o contrato do P84 com SESSÃO obrigatória, `?user_id=` validado, ISOLAMENTO
             entre contas, allowlist de MIME, teto por arquivo, cota por conta e os cabeçalhos de
             segurança do download — tudo com o Storage em memória (hermético).
🔗 QUEM DEPENDE DELE: `backend/app/assets.py` e `main.py`.
"""
# 🧪 [INÍCIO: TESTE - BACKEND/TEST_ASSETS]
import pytest
from fastapi.testclient import TestClient

from backend.app.assets import CABECALHOS_SEGUROS, StorageMemoria, definir_storage, obter_storage
from backend.app.main import app

SENHA = "senha-boa-123"
PNG = b"\x89PNG\r\n\x1a\n" + b"conteudo-de-teste" * 8


def novo_cliente(email: str):
    """Registra a conta e devolve `(cliente, csrf)` já logado."""
    cliente = TestClient(app)
    assert cliente.post("/api/auth/registrar", json={"email": email, "senha": SENHA}).status_code == 204
    return cliente, cliente.get("/api/auth/me").json()["csrf"]


def subir(cliente, csrf, conteudo=PNG, nome="foto.png", mime="image/png"):
    return cliente.post(
        "/api/note-assets/files",
        files={"file": (nome, conteudo, mime)},
        headers={"X-CSRF": csrf},
    )


def test_anexo_exige_sessao():
    with TestClient(app) as cliente:
        assert cliente.get("/api/note-assets/files/a1").status_code == 401
        assert cliente.get("/api/note-assets/files/a1/info").status_code == 401
        assert cliente.post("/api/note-assets/files", files={"file": ("x.png", PNG, "image/png")}).status_code == 401


def test_anexo_exige_csrf():
    cliente, _csrf = novo_cliente("csrf-anexo@exemplo.com")
    resposta = cliente.post("/api/note-assets/files", files={"file": ("x.png", PNG, "image/png")})
    assert resposta.status_code == 403
    assert resposta.json()["detail"] == "CSRF invalido"


def test_upload_info_e_download():
    cliente, csrf = novo_cliente("anexo@exemplo.com")
    subiu = subir(cliente, csrf)
    assert subiu.status_code == 200, subiu.text
    corpo = subiu.json()
    assert corpo["name"] == "foto.png" and corpo["kind"] == "image" and corpo["size"] == len(PNG)

    info = cliente.get(f"/api/note-assets/files/{corpo['id']}/info").json()
    assert info["name"] == "foto.png" and info["kind"] == "image"
    assert "storage_path" not in info, "o caminho do Storage NUNCA vai ao cliente"

    baixado = cliente.get(f"/api/note-assets/files/{corpo['id']}")
    assert baixado.status_code == 200
    assert baixado.content == PNG
    assert baixado.headers["content-type"] == "image/png"
    # Cabeçalhos de segurança (XSS na própria origem seria o risco do anexo).
    for chave, valor in CABECALHOS_SEGUROS.items():
        assert baixado.headers[chave.lower()] == valor, chave
    assert baixado.headers["content-disposition"].startswith("inline")


def test_texto_vai_como_attachment():
    """Só imagem segura pode ser `inline`; texto/PDF/desconhecido baixam (`attachment`)."""
    cliente, csrf = novo_cliente("texto@exemplo.com")
    enviado = subir(cliente, csrf, b"a,b\n1,2\n", "planilha.csv", "text/csv").json()
    baixado = cliente.get(f"/api/note-assets/files/{enviado['id']}")
    assert baixado.headers["content-disposition"].startswith("attachment")

    pagina = cliente.get(f"/api/note-assets/files/{enviado['id']}/page").json()
    assert pagina["rows"][0] == ["a", "b"] and pagina["more"] is False


def test_mime_fora_da_allowlist_e_recusado():
    """HTML/SVG na MESMA origem seria XSS: recusado com mensagem clara (nunca 500)."""
    cliente, csrf = novo_cliente("mime@exemplo.com")
    for mime in ("text/html", "image/svg+xml", "application/xml"):
        resposta = subir(cliente, csrf, b"<script>alert(1)</script>", "mal.html", mime)
        assert resposta.status_code == 415, mime
        assert resposta.json()["detail"] == "Tipo de arquivo nao permitido"


def test_tamanho_acima_do_limite_e_recusado(monkeypatch):
    """O corte acontece DURANTE a leitura (stream): o arquivo grande nunca é aceito."""
    from backend.app import config as config_mod

    config = config_mod.obter_config()
    monkeypatch.setattr(config, "anexo_limite_mb", 1, raising=False)
    cliente, csrf = novo_cliente("grande@exemplo.com")
    resposta = subir(cliente, csrf, b"x" * (2 * 1024 * 1024), "grande.png", "image/png")
    assert resposta.status_code == 413
    assert "limite" in resposta.json()["detail"]


def test_cota_da_conta_e_recusada(monkeypatch):
    from backend.app import config as config_mod

    config = config_mod.obter_config()
    monkeypatch.setattr(config, "anexo_cota_mb", 1, raising=False)
    cliente, csrf = novo_cliente("cota@exemplo.com")
    assert subir(cliente, csrf, b"y" * (900 * 1024), "um.png", "image/png").status_code == 200
    segunda = subir(cliente, csrf, b"z" * (200 * 1024), "dois.png", "image/png")
    assert segunda.status_code == 413
    assert segunda.json()["detail"] == "Espaco da conta esgotado"


def test_isolamento_entre_contas_nos_anexos():
    """A nunca lê o anexo de B — nem com o `id` na mão (o caminho é `<user_id>/<id>`)."""
    a, csrf_a = novo_cliente("a-anexo@exemplo.com")
    b, csrf_b = novo_cliente("b-anexo@exemplo.com")
    do_a = subir(a, csrf_a).json()

    assert b.get(f"/api/note-assets/files/{do_a['id']}").status_code == 404
    assert b.get(f"/api/note-assets/files/{do_a['id']}/info").status_code == 404
    # B usando o `user_id` de A na query é NEGADO (a sessão manda - compatibilidade P84).
    id_do_a = a.get("/api/auth/me").json()["id"]
    assert b.get(f"/api/note-assets/files/{do_a['id']}?user_id={id_do_a}").status_code == 403
    # Cada anexo vive na pasta da SUA conta dentro do bucket privado.
    assert [chave.split("/")[0] for chave in obter_storage()._objetos] == [id_do_a]


def test_user_id_igual_ao_da_sessao_e_aceito():
    """O front manda `?user_id=` (P84): igual à sessão, funciona normalmente."""
    cliente, csrf = novo_cliente("compat@exemplo.com")
    meu = cliente.get("/api/auth/me").json()["id"]
    enviado = subir(cliente, csrf).json()
    assert cliente.get(f"/api/note-assets/files/{enviado['id']}?user_id={meu}").status_code == 200
    assert cliente.get(f"/api/note-assets/files/{enviado['id']}/info?user_id={meu}").status_code == 200


def test_anotacoes_guardam_e_devolvem_os_destaques():
    cliente, csrf = novo_cliente("anota@exemplo.com")
    enviado = subir(cliente, csrf).json()
    assert cliente.get(f"/api/note-assets/files/{enviado['id']}/annotations").json()["ranges"] == []

    ranges = [{"start": 3, "end": 12, "color": "#ffd54f"}]
    salvo = cliente.put(
        f"/api/note-assets/files/{enviado['id']}/annotations",
        json={"ranges": ranges, "page": 1},
        headers={"X-CSRF": csrf},
    )
    assert salvo.status_code == 200 and salvo.json()["ranges"] == ranges
    devolvido = cliente.get(f"/api/note-assets/files/{enviado['id']}/annotations").json()
    assert devolvido["ranges"] == ranges and devolvido["page"] == 1
    # PUT é escrita: sem CSRF, 403.
    assert cliente.put(
        f"/api/note-assets/files/{enviado['id']}/annotations", json={"ranges": []}
    ).status_code == 403


def test_modelos_da_conta_pelo_contrato_do_visualizador():
    cliente, csrf = novo_cliente("modelos-anexo@exemplo.com")
    assert cliente.get("/api/note-assets/templates").json() == []
    criado = cliente.post(
        "/api/note-assets/templates",
        json={"name": "Reuniao", "html": "<p>pauta</p>"},
        headers={"X-CSRF": csrf},
    )
    assert criado.status_code == 200 and criado.json()["name"] == "Reuniao"
    lista = cliente.get("/api/note-assets/templates").json()
    assert [item["name"] for item in lista] == ["Reuniao"]


def test_storage_em_memoria_e_o_padrao_sem_supabase():
    """Sem credencial, o backend sobe com o Storage em memória (nada quebra)."""
    definir_storage(None)
    assert isinstance(obter_storage(), StorageMemoria)
# 🧪 [FIM: TESTE - BACKEND/TEST_ASSETS]
