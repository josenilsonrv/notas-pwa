"""
🗺️ COMPONENTE: Configuracao do backend Python (leitura do .env + escolha do driver)
🎯 OBJETIVO: Montar a `Configuracao` (credenciais, sessao, porta, rate-limit, origens)
             e decidir entre o driver "supabase" (com credenciais) e o "memory".
🔗 QUEM DEPENDE DELE: `backend/app/main.py`, `repositorio.py`, `seguranca.py`,
                      `auth.py`, `supabase_cliente.py` e os testes de `backend/tests/`.
"""
# ============================================
# 🔄 [INÍCIO: BACKEND - CONFIG]
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Raiz do repositorio: backend/app/config.py -> [0]=app [1]=backend [2]=raiz.
RAIZ = Path(__file__).resolve().parents[2]

# O .env real NUNCA entra no git (ver .gitignore). Carregamos backend/.env e,
# se existir, tambem o .env da raiz - sem sobrescrever o que ja veio do sistema.
for _caminho in (RAIZ / "backend" / ".env", RAIZ / ".env"):
    if _caminho.exists():
        load_dotenv(_caminho, override=False)

# Drivers validos. Qualquer outro valor cai em "auto".
DRIVERS = ("supabase", "memory")


def _texto(nome: str, padrao: str = "") -> str:
    return (os.getenv(nome) or padrao).strip()


def _inteiro(nome: str, padrao: int) -> int:
    try:
        return int((os.getenv(nome) or "").strip())
    except (TypeError, ValueError):
        return padrao


def _booleano(nome: str, padrao: bool = False) -> bool:
    bruto = (os.getenv(nome) or "").strip().lower()
    if not bruto:
        return padrao
    return bruto in ("1", "true", "sim", "yes", "on")


def _lista(nome: str, padrao: str = "") -> list[str]:
    bruto = os.getenv(nome)
    if bruto is None:
        bruto = padrao
    return [item.strip() for item in bruto.split(",") if item.strip()]


@dataclass
class Configuracao:
    """Configuracao imutavel do backend, resolvida a partir do ambiente."""

    raiz: Path = RAIZ
    driver_pedido: str = "auto"
    porta: int = 8000
    host: str = "127.0.0.1"

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_bucket_anexos: str = "anexos"

    sessao_cookie: str = "py_session"
    sessao_segredo: str = ""
    sessao_validade: int = 7 * 24 * 60 * 60  # 7 dias
    csrf_header: str = "X-CSRF"
    seguro: bool = False  # cookie Secure (obrigatorio em producao/https)

    origens_permitidas: list = field(default_factory=list)

    rate_limite: int = 5
    rate_janela: int = 60

    # --- derivados -----------------------------------------------------------
    @property
    def tem_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_service_role_key)

    @property
    def driver(self) -> str:
        """Driver efetivo: explicito, ou automatico pelas credenciais."""
        pedido = (self.driver_pedido or "auto").lower()
        if pedido in DRIVERS:
            return pedido
        return "supabase" if self.tem_supabase else "memory"

    @property
    def modo(self) -> str:
        """Rotulo humano do modo para o /health."""
        return "nuvem" if self.driver == "supabase" else "local"

    @property
    def avisos(self) -> list[str]:
        avisos: list[str] = []
        pedido = (self.driver_pedido or "auto").lower()
        if pedido == "supabase" and not self.tem_supabase:
            avisos.append("DRIVER=supabase sem SUPABASE_URL/SERVICE_ROLE_KEY: caindo em memory.")
        if not self.sessao_segredo:
            avisos.append("SESSAO_SEGREDO ausente: usando segredo efemero (reinicia a cada boot).")
        return avisos


def montar() -> Configuracao:
    """Monta a configuracao a partir das variaveis de ambiente (com defaults)."""
    segredo = _texto("SESSAO_SEGREDO")
    if not segredo:
        segredo = secrets.token_urlsafe(48)
    return Configuracao(
        raiz=RAIZ,
        driver_pedido=_texto("DRIVER", "auto") or "auto",
        porta=_inteiro("PORTA", 8000),
        host=_texto("HOST", "127.0.0.1"),
        supabase_url=_texto("SUPABASE_URL"),
        supabase_anon_key=_texto("SUPABASE_ANON_KEY"),
        supabase_service_role_key=_texto("SUPABASE_SERVICE_ROLE_KEY"),
        supabase_bucket_anexos=_texto("SUPABASE_BUCKET_ANEXOS", "anexos") or "anexos",
        sessao_cookie=_texto("SESSAO_COOKIE", "py_session") or "py_session",
        sessao_segredo=segredo,
        sessao_validade=_inteiro("SESSAO_VALIDADE", 7 * 24 * 60 * 60),
        csrf_header=_texto("CSRF_HEADER", "X-CSRF") or "X-CSRF",
        seguro=_booleano("SESSAO_SEGURA", False),
        origens_permitidas=_lista("ORIGENS_PERMITIDAS", "http://localhost:8000"),
        rate_limite=_inteiro("RATE_LIMITE", 5),
        rate_janela=_inteiro("RATE_JANELA", 60),
    )


_CFG: Configuracao | None = None


def obter_config() -> Configuracao:
    """Singleton da configuracao (recarregavel nos testes via `recarregar`)."""
    global _CFG
    if _CFG is None:
        _CFG = montar()
    return _CFG


def recarregar() -> Configuracao:
    """Descarta o singleton e remonta (usado pelos testes)."""
    global _CFG
    _CFG = None
    return obter_config()
# 🔄 [FIM: BACKEND - CONFIG]
