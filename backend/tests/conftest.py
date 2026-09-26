"""
🗺️ COMPONENTE: Conftest da suite pytest do backend
🎯 OBJETIVO: Fixar um ambiente HERMETICO (driver `memory`, sem credencial) e pôr a raiz do
             repositorio no `sys.path`, para `import backend...` funcionar de qualquer lugar.
🔗 QUEM DEPENDE DELE: todos os testes de `backend/tests/`.
"""
# 🧪 [INÍCIO: TESTE - BACKEND/CONFTEST]
import os
import sys
from pathlib import Path

# ANTES de qualquer import do backend: os testes NUNCA usam a nuvem real.
# (o .env carrega com override=False, entao o que esta aqui sempre ganha)
os.environ["DRIVER"] = "memory"
for _var in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
    os.environ.pop(_var, None)

import pytest  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
AQUI = Path(__file__).resolve().parent
for _caminho in (AQUI, RAIZ):
    if str(_caminho) not in sys.path:
        sys.path.insert(0, str(_caminho))

from backend.app.config import Configuracao  # noqa: E402
from backend.app.repositorio import RepositorioMemoria  # noqa: E402

DRIVERS = ("memory", "supabase")


@pytest.fixture()
def config_memoria() -> Configuracao:
    """Configuracao de memoria apontando para a raiz real (para servir o PWA)."""
    return Configuracao(raiz=RAIZ, driver_pedido="memory")


@pytest.fixture()
def repo() -> RepositorioMemoria:
    """Driver em memoria limpo por teste."""
    return RepositorioMemoria()


@pytest.fixture(params=DRIVERS)
def repo_qualquer(request):
    """O MESMO contrato testado nos DOIS drivers (supabase com PostgREST emulado)."""
    if request.param == "memory":
        return RepositorioMemoria()
    from apoio_supabase import repo_falso

    repositorio, _fake = repo_falso()
    return repositorio


@pytest.fixture(autouse=True)
def ambiente_de_contas():
    """Zera usuários/sessões/dados entre os testes.

    `obter_identidade`, `repositorio`, o assinador da sessão e o rate-limit são
    SINGLETONS do processo — sem esta fixture um teste herdaria o estado do anterior.
    """
    from backend.app.identidade import IdentidadeMemoria, definir_identidade
    from backend.app.repositorio import RepositorioMemoria, definir_repositorio
    from backend.app.seguranca import reiniciar_assinador, reiniciar_limitador

    definir_identidade(IdentidadeMemoria())
    definir_repositorio(RepositorioMemoria())
    reiniciar_limitador()
    reiniciar_assinador()
    yield
    reiniciar_limitador()
    reiniciar_assinador()
# 🧪 [FIM: TESTE - BACKEND/CONFTEST]
