"""
🗺️ COMPONENTE: Checagem completa do backend (o "plug and play" do `.env`)
🎯 OBJETIVO: Em UM comando: conferir o schema, dizer o driver, testar `/health`, fazer um CRUD
             de ida e volta e PROVAR o isolamento entre duas contas - no driver REAL. Tambem
             varre os assets servidos para garantir que nenhuma chave vazou para o front.
🔗 QUEM DEPENDE DELE: `npm run verificar:backend` e o fechamento da secao 2 do plano.
"""
# 🚀 [INÍCIO: BACKEND - VERIFICAR]
from __future__ import annotations

from pathlib import Path

from ..app.config import RAIZ, obter_config
from .migrar import TABELAS, conferir_via_rest, instruir_manual

# Nada disso pode aparecer num arquivo que o navegador recebe.
SEGREDOS = ("service_role", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL")
ASSETS_SERVIDOS = (
    "index.html",
    "reparar.html",
    "app.js",
    "fontes.js",
    "styles.css",
    "theme-origem.css",
    "sw.js",
    "manifest.json",
)

FALHAS: list[str] = []


def ok(rotulo: str) -> None:
    print(f"  [ok]    {rotulo}")


def falha(rotulo: str, detalhe: str = "") -> None:
    sufixo = f" -> {detalhe}" if detalhe else ""
    print(f"  [FALHA] {rotulo}{sufixo}")
    FALHAS.append(rotulo)


def passo_config(config) -> None:
    print("\n1) CONFIGURACAO")
    print(f"  arquivo .env: {'encontrado' if (RAIZ / 'backend' / '.env').exists() else 'AUSENTE'}")
    print(f"  driver efetivo: {config.driver} (modo {config.modo})")
    print(f"  supabase configurado: {config.tem_supabase}")
    for aviso in config.avisos:
        print(f"  [aviso] {aviso}")


def passo_estatico(config) -> None:
    """O estatico do PWA precisa servir o app e NUNCA vazar segredo."""
    print("\n2) ESTATICO DO PWA (allowlist)")
    from fastapi.testclient import TestClient

    from ..app.main import app

    with TestClient(app) as cliente:
        if cliente.get("/").status_code == 200:
            ok("GET / serve o PWA")
        else:
            falha("GET / nao respondeu 200")
        corpo = cliente.get("/health").json()
        if corpo.get("ok"):
            ok("GET /health responde ok")
        else:
            falha("GET /health nao respondeu ok")
        if corpo.get("driver") == config.driver:
            ok(f"/health confirma driver={corpo['driver']}")
        else:
            falha("/health diverge da configuracao", f"{corpo.get('driver')} != {config.driver}")
        for proibido in ("/backend/.env", "/.env", "/docs/PROBLEMAS-E-MITIGACOES.md", "/tests/run-all.cjs"):
            if cliente.get(proibido).status_code == 404:
                ok(f"{proibido} bloqueado (404)")
            else:
                falha(f"{proibido} NAO esta bloqueado")

    alvos: list[Path] = []
    for nome in ASSETS_SERVIDOS:
        caminho = RAIZ / nome
        if caminho.is_file():
            alvos.append(caminho)
    for pasta in ("notes", "mapa", "sync"):
        base = RAIZ / pasta
        if base.is_dir():
            alvos.extend(sorted(base.glob("*.js")))
            alvos.extend(sorted(base.glob("*.css")))
    vazou = []
    for arquivo in alvos:
        try:
            texto = arquivo.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for segredo in SEGREDOS:
            if segredo in texto:
                vazou.append(f"{arquivo.relative_to(RAIZ)} contem '{segredo}'")
    if vazou:
        for item in vazou:
            falha("segredo em asset servido", item)
    else:
        ok(f"{len(alvos)} assets servidos, nenhum com chave/segredo")


def passo_schema(config) -> None:
    print("\n3) SCHEMA DO SUPABASE")
    presentes, ausentes = conferir_via_rest(config)
    if ausentes:
        falha("schema incompleto", f"faltando: {', '.join(ausentes)}")
        instruir_manual()
    else:
        ok(f"{len(presentes)}/{len(TABELAS)} tabelas respondem no REST (service_role)")


def passo_dados(config, numero: int = 4) -> None:
    """CRUD de ida e volta + prova de isolamento NO DRIVER EM USO, com limpeza no final."""
    print(f"\n{numero}) CRUD + ISOLAMENTO (driver em uso)")
    from uuid import uuid4

    from ..app.repositorio import criar_repositorio

    repo = criar_repositorio(config)
    marca = f"verificar-{uuid4().hex[:8]}"
    conta_a = "00000000-0000-4000-8000-00000000000a"
    conta_b = "00000000-0000-4000-8000-00000000000b"
    filtros_a = {"user_id": f"eq.{conta_a}", "id": f"eq.{marca}"}

    try:
        gravado = repo.salvar("notas", conta_a, marca, {"nome": "verificacao", "pasta_id": None})
        if int(gravado.get("rev") or 0) >= 1:
            ok(f"salvar devolveu rev={gravado['rev']}")
        else:
            falha("salvar nao devolveu rev")

        lido = repo.obter("notas", conta_a, marca)
        if lido and lido["dados"]["nome"] == "verificacao":
            ok("obter devolve exatamente o que foi gravado")
        else:
            falha("obter nao devolveu o dado gravado")

        if repo.obter("notas", conta_b, marca) is None and repo.listar("notas", conta_b) == []:
            ok("isolamento: a conta B NAO ve o dado da conta A")
        else:
            falha("ISOLAMENTO QUEBRADO: a conta B leu o dado da conta A")

        excluido = repo.excluir("notas", conta_a, marca)
        if excluido and excluido["deleted_at"] and repo.obter("notas", conta_a, marca) is None:
            ok("soft delete esconde o registro da lista")
        else:
            falha("soft delete nao funcionou")

        tombstones = repo.listar("notas", conta_a, incluir_excluidos=True)
        if any(item["id"] == marca and item["deleted_at"] for item in tombstones):
            ok("tombstone aparece no delta (incluir_excluidos=True)")
        else:
            falha("tombstone nao apareceu no delta")
    finally:
        cliente = getattr(repo, "cliente", None)
        if cliente is not None and hasattr(cliente, "apagar"):
            try:
                cliente.apagar("notas", filtros_a)
                ok("dados de verificacao removidos do banco (limpeza)")
            except Exception as erro:  # noqa: BLE001 - a limpeza nao pode mascarar o resto
                print(f"  [aviso] limpeza de {marca} falhou: {erro}")
        else:
            ok("driver em memoria: nada a limpar")


def passo_login(config, numero: int = 5) -> None:
    """Fluxo completo de login no driver em uso: registrar -> me -> logout -> me 401."""
    print(f"\n{numero}) LOGIN (registrar -> me -> logout -> me)")
    from uuid import uuid4

    from fastapi.testclient import TestClient

    from ..app.main import app
    from ..app.seguranca import reiniciar_limitador

    email = f"verificacao-{uuid4().hex[:8]}@exemplo.com"
    senha = "senha-de-verificacao-123"
    usuario_criado = ""
    reiniciar_limitador()
    with TestClient(app) as cliente:
        if cliente.get("/api/auth/me").status_code == 401:
            ok("sem sessao, /api/auth/me devolve 401")
        else:
            falha("/api/auth/me nao devolveu 401 sem sessao")

        resposta = cliente.post("/api/auth/registrar", json={"email": email, "senha": senha})
        if resposta.status_code == 204:
            ok(f"registrar criou a conta ({email})")
        else:
            falha("registrar falhou", f"{resposta.status_code} {resposta.text[:120]}")

        cookie = resposta.headers.get("set-cookie", "").lower()
        if "httponly" in cookie and "samesite=lax" in cookie:
            ok("cookie de sessao e HttpOnly + SameSite=Lax")
        else:
            falha("cookie de sessao sem HttpOnly/SameSite")

        corpo = cliente.get("/api/auth/me")
        if corpo.status_code == 200 and corpo.json().get("email") == email:
            ok("GET /api/auth/me devolve o e-mail da sessao")
            usuario_criado = corpo.json().get("id", "")
        else:
            falha("GET /api/auth/me nao devolveu o e-mail")

        cliente.cookies.clear()
        if cliente.post("/api/auth/login", json={"email": email, "senha": "errada"}).status_code == 401:
            ok("senha errada devolve 401 (mensagem generica)")
        else:
            falha("senha errada nao devolveu 401")

        if cliente.post("/api/auth/login", json={"email": email, "senha": senha}).status_code == 204:
            ok("login correto devolve 204 + cookie")
        else:
            falha("login correto falhou")

        csrf = cliente.get("/api/auth/me").json().get("csrf", "")
        if cliente.post("/api/auth/logout").status_code == 403:
            ok("escrita sem X-CSRF devolve 403")
        else:
            falha("escrita sem X-CSRF NAO devolveu 403")

        if cliente.post("/api/auth/logout", headers={"X-CSRF": csrf}).status_code == 204:
            ok("logout com CSRF devolve 204")
        else:
            falha("logout com CSRF falhou")

        if cliente.get("/api/auth/me").status_code == 401:
            ok("depois do logout, /api/auth/me volta a 401")
        else:
            falha("a sessao sobreviveu ao logout")

    # Limpeza: no Supabase real, a conta de verificacao nao deve ficar no Auth.
    if usuario_criado:
        from ..app.identidade import obter_identidade
        from ..app.repositorio import repositorio

        provedor = obter_identidade()
        if hasattr(provedor, "remover"):
            try:
                provedor.remover(usuario_criado)
                cliente_repo = getattr(repositorio(), "cliente", None)
                if cliente_repo is not None:
                    cliente_repo.apagar("profiles", {"id": f"eq.{usuario_criado}"})
                ok("conta de verificacao removida do Auth e de `profiles`")
            except Exception as erro:  # noqa: BLE001 - a limpeza nao pode derrubar a checagem
                print(f"  [aviso] nao consegui remover a conta de verificacao: {erro}")
        else:
            ok("driver em memoria: a conta de verificacao morre com o processo")


def main() -> int:
    config = obter_config()
    print("=" * 68)
    print(" VERIFICACAO DO BACKEND - notas-pwa (login + sync opcionais)")
    print("=" * 68)
    passo_config(config)
    passo_estatico(config)
    if config.driver == "supabase":
        passo_schema(config)
        passo_dados(config, numero=4)
        passo_login(config, numero=5)
    else:
        passo_dados(config, numero=3)
        passo_login(config, numero=4)

    print("\n" + "=" * 68)
    if FALHAS:
        print(f" RESULTADO: {len(FALHAS)} FALHA(S)")
        for item in FALHAS:
            print(f"   - {item}")
        return 1
    if config.driver == "memory":
        print(" RESULTADO: SEM FALHAS (driver memory - sem Supabase no .env)")
        print(" Para ligar a nuvem: preencha backend/.env e rode de novo.")
    else:
        print(" RESULTADO: SEM FALHAS - SUPABASE REAL OK (plug and play concluido)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# 🚀 [FIM: BACKEND - VERIFICAR]
