"""
🗺️ COMPONENTE: Seguranca da sessao (cookie assinado) + CSRF + rate-limit
🎯 OBJETIVO: Emitir/validar o cookie `py_session` (ASSINADO por HMAC, sem estado no servidor),
             exigir CSRF nas escritas e limitar tentativas de login/registro - o token do
             Supabase NUNCA chega ao JavaScript.
🔗 QUEM DEPENDE DELE: `backend/app/auth.py` (rotas), `backend/tests/test_auth.py` e (fase 7)
                      o `/ws`, que autentica pela MESMA sessao.
"""
# 🚨 [INÍCIO: BACKEND - SEGURANÇA]
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import threading
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, Response

from .config import obter_config


def _b64(dados: bytes) -> str:
    return base64.urlsafe_b64encode(dados).rstrip(b"=").decode("ascii")


def _desb64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


@dataclass
class Sessao:
    """O que vive DENTRO do cookie assinado (nada de token do Supabase)."""

    user_id: str
    email: str
    csrf: str
    criado_em: float

    def publico(self) -> dict:
        """Corpo de `GET /api/auth/me` (o front precisa do e-mail e do X-CSRF)."""
        return {"id": self.user_id, "email": self.email, "criado_em": self.criado_em, "csrf": self.csrf}


class Assinador:
    """Assina/verifica o cookie (HMAC-SHA256 + base64url). Padrao de mercado, sem estado."""

    def __init__(self, segredo: str, validade: int) -> None:
        self._chave = segredo.encode("utf-8")
        self.validade = int(validade)

    def _assinar(self, corpo: bytes) -> str:
        return _b64(hmac.new(self._chave, corpo, hashlib.sha256).digest())

    def emitir(self, sessao: Sessao) -> str:
        agora = time.time()
        corpo = _b64(
            json.dumps(
                {
                    "uid": sessao.user_id,
                    "email": sessao.email,
                    "csrf": sessao.csrf,
                    "iat": agora,
                    "exp": agora + self.validade,
                },
                separators=(",", ":"),
            ).encode("utf-8")
        )
        return f"{corpo}.{self._assinar(corpo.encode('ascii'))}"

    def ler(self, token: str) -> Sessao | None:
        """Devolve a `Sessao` ou `None` (assinatura invalida ou expirada)."""
        if not token or token.count(".") != 1:
            return None
        corpo, assinatura = token.split(".")
        esperado = self._assinar(corpo.encode("ascii"))
        if not hmac.compare_digest(assinatura, esperado):
            return None
        try:
            dados = json.loads(_desb64(corpo))
        except (ValueError, TypeError):
            return None
        if float(dados.get("exp") or 0) < time.time():
            return None
        return Sessao(
            user_id=str(dados.get("uid") or ""),
            email=str(dados.get("email") or ""),
            csrf=str(dados.get("csrf") or ""),
            criado_em=float(dados.get("iat") or 0),
        )


def nova_sessao(user_id: str, email: str) -> Sessao:
    return Sessao(user_id=str(user_id), email=str(email), csrf=secrets.token_urlsafe(24), criado_em=time.time())


_ASSINADOR: Assinador | None = None


def obter_assinador(config=None) -> Assinador:
    global _ASSINADOR
    if _ASSINADOR is None:
        config = config or obter_config()
        _ASSINADOR = Assinador(config.sessao_segredo, config.sessao_validade)
    return _ASSINADOR


def reiniciar_assinador() -> None:
    """Descarta o assinador (usado pelos testes)."""
    global _ASSINADOR
    _ASSINADOR = None
# 🚨 [FIM: BACKEND - SEGURANÇA - PARTE 1]


# 🚨 [INÍCIO: BACKEND - SEGURANÇA]
def definir_cookie(response: Response, token: str, config=None) -> None:
    """Grava a sessao no cookie `HttpOnly` (o JS nunca le o valor).

    `SameSite=Lax` e o padrao de mercado para app no proprio origin; em producao
    `SESSAO_SEGURA=true` acrescenta `Secure` (obrigatorio em https).
    """
    config = config or obter_config()
    response.set_cookie(
        key=config.sessao_cookie,
        value=token,
        max_age=config.sessao_validade,
        httponly=True,
        samesite="lax",
        secure=config.seguro,
        path="/",
    )


def remover_cookie(response: Response, config=None) -> None:
    """Apaga o cookie de sessao (logout)."""
    config = config or obter_config()
    response.delete_cookie(
        key=config.sessao_cookie,
        httponly=True,
        samesite="lax",
        secure=config.seguro,
        path="/",
    )


def sessao_do_pedido(request: Request) -> Sessao | None:
    """Le o cookie do pedido e devolve a sessao (ou None). Nao levanta erro."""
    config = obter_config()
    token = request.cookies.get(config.sessao_cookie, "")
    return obter_assinador(config).ler(token)


def exigir_sessao(request: Request) -> Sessao:
    """401 quando nao ha sessao valida (e o que o front usa para decidir logado/deslogado)."""
    sessao = sessao_do_pedido(request)
    if sessao is None:
        raise HTTPException(status_code=401, detail="sem sessao")
    return sessao


def exigir_csrf(request: Request, sessao: Sessao) -> None:
    """403 quando o header `X-CSRF` nao bate com o token da sessao (escritas)."""
    config = obter_config()
    enviado = request.headers.get(config.csrf_header, "")
    if not enviado or not hmac.compare_digest(enviado, sessao.csrf):
        raise HTTPException(status_code=403, detail="CSRF invalido")


class Limitador:
    """Rate-limit de janela deslizante em memoria (por IP+e-mail). Suficiente para 1 processo."""

    def __init__(self, limite: int, janela: int) -> None:
        self.limite = int(limite)
        self.janela = int(janela)
        self._marcas: dict[str, list[float]] = {}
        self._trava = threading.Lock()

    def permitir(self, chave: str) -> bool:
        agora = time.monotonic()
        with self._trava:
            recentes = [marca for marca in self._marcas.get(chave, []) if agora - marca < self.janela]
            if len(recentes) >= self.limite:
                self._marcas[chave] = recentes
                return False
            recentes.append(agora)
            self._marcas[chave] = recentes
            return True

    def liberar(self, chave: str) -> None:
        """Zera as marcas da chave (usado quando o login da certo)."""
        with self._trava:
            self._marcas.pop(chave, None)

    def zerar(self) -> None:
        with self._trava:
            self._marcas.clear()


def chave_limite(request: Request, email: str) -> str:
    """Chave do rate-limit: IP do cliente + e-mail em minusculas."""
    cliente = getattr(request, "client", None)
    ip = getattr(cliente, "host", "") or "desconhecido"
    return f"{ip}|{(email or '').strip().lower()}"


_LIMITADOR: Limitador | None = None


def obter_limitador(config=None) -> Limitador:
    global _LIMITADOR
    if _LIMITADOR is None:
        config = config or obter_config()
        _LIMITADOR = Limitador(config.rate_limite, config.rate_janela)
    return _LIMITADOR


def reiniciar_limitador() -> None:
    """Recria o limitador (usado pelos testes, que nao podem herdar contagem)."""
    global _LIMITADOR
    _LIMITADOR = None
# 🚨 [FIM: BACKEND - SEGURANÇA - PARTE 2]