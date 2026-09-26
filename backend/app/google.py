"""
🗺️ COMPONENTE: Verificacao do ID token do Google (login com Google)
🎯 OBJETIVO: Validar o JWT que o Google Identity Services entrega no navegador (assinatura
             RS256 via JWKS, `iss`, `aud` e `exp`) e devolver o PERFIL do token: e-mail
             VERIFICADO (o unico dado que resolve a conta) + `nome`/`foto`, que sao apenas
             apresentacao (o rosto da conta no cabecalho) - o backend nunca confia em dado
             vindo do cliente sem esta checagem.
🔗 QUEM DEPENDE DELE: `backend/app/auth.py` (rotas `/api/auth/config` e `/api/auth/google`) e
             `backend/tests/test_google.py`. A `foto` chega ao front pelo `GET /api/auth/me`.

Escolha de desenho: validamos o token LOCALMENTE com `PyJWT` + as chaves publicas do Google
(`https://www.googleapis.com/oauth2/v3/certs`), com cache em memoria. Assim nao ha chamada ao
Google a cada login e o teste roda sem rede (`httpx.MockTransport`), no mesmo espirito do
`supabase_cliente.py`.
"""
# 🚨 [INÍCIO: BACKEND - GOOGLE]
from __future__ import annotations

import threading
import time
from urllib.parse import urlsplit

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

from .config import obter_config

JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
# O Google emite `iss` das duas formas; aceitamos ambas (documentacao oficial).
EMISSORES = ("accounts.google.com", "https://accounts.google.com")
JANELA_CHAVES = 3600.0  # 1 h de cache (o Google rotaciona as chaves com folga)

MSG_TOKEN = "Nao foi possivel validar o login do Google"
MSG_EMAIL = "Sua conta Google precisa de e-mail verificado"
MSG_INDISPONIVEL = "Servico de login do Google indisponivel no momento"


class ErroGoogle(RuntimeError):
    """Falha ao validar o ID token (o `status` decide a resposta da rota)."""

    def __init__(self, mensagem: str, status: int = 400) -> None:
        self.status = status
        super().__init__(mensagem)


def client_id(config=None) -> str:
    """Client ID publico do projeto (vazio = login com Google desativado)."""
    return (config or obter_config()).google_client_id


def configurado(config=None) -> bool:
    """Ha Client ID? Sem ele o botao do Google nem aparece no front."""
    return bool(client_id(config))


class VerificadorGoogle:
    """Valida o ID token contra o JWKS do Google (com cache e recarga na troca de `kid`)."""

    def __init__(
        self,
        url: str = JWKS_URL,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 10.0,
    ) -> None:
        self.url = url
        self._transport = transport
        self._timeout = timeout
        self._chaves: dict[str, dict] = {}
        self._expira_em = 0.0
        self._trava = threading.RLock()

    def _baixar(self) -> dict[str, dict]:
        with self._trava:
            agora = time.monotonic()
            if self._chaves and agora < self._expira_em:
                return self._chaves
            try:
                with httpx.Client(timeout=self._timeout, transport=self._transport) as cliente:
                    resposta = cliente.get(self.url)
            except httpx.HTTPError as erro:
                raise ErroGoogle(MSG_INDISPONIVEL, status=503) from erro
            if resposta.status_code >= 400:
                raise ErroGoogle(MSG_INDISPONIVEL, status=503)
            dados = resposta.json() or {}
            chaves = {str(k.get("kid")): k for k in dados.get("keys", []) if k.get("kid")}
            if not chaves:
                raise ErroGoogle(MSG_INDISPONIVEL, status=503)
            self._chaves = chaves
            self._expira_em = agora + JANELA_CHAVES
            return chaves

    def chave(self, kid: str) -> dict | None:
        """Chave publica do `kid` (recarrega o JWKS uma vez se o Google tiver rotacionado)."""
        chaves = self._baixar()
        if kid not in chaves:
            with self._trava:
                self._chaves = {}
                self._expira_em = 0.0
            chaves = self._baixar()
        return chaves.get(kid)

    def verificar(self, token: str, publico: str) -> dict:
        """Valida o token e devolve o payload. Levanta `ErroGoogle` se nao for confiavel."""
        if not token or not publico:
            raise ErroGoogle(MSG_TOKEN, status=400)
        try:
            cabecalho = jwt.get_unverified_header(token)
        except jwt.PyJWTError as erro:
            raise ErroGoogle(MSG_TOKEN, status=400) from erro
        chave = self.chave(str(cabecalho.get("kid") or ""))
        if not chave:
            raise ErroGoogle(MSG_TOKEN, status=400)
        try:
            chave_publica = RSAAlgorithm.from_jwk(chave)
        except (ValueError, TypeError, jwt.PyJWTError) as erro:
            raise ErroGoogle(MSG_TOKEN, status=400) from erro
        try:
            return jwt.decode(
                token,
                key=chave_publica,
                algorithms=["RS256"],
                audience=publico,
                issuer=list(EMISSORES),
                options={"require": ["aud", "iss", "exp"]},
            )
        except jwt.PyJWTError as erro:
            raise ErroGoogle(MSG_TOKEN, status=400) from erro


_VERIFICADOR: VerificadorGoogle | None = None


def obter_verificador() -> VerificadorGoogle:
    """Singleton do processo (o front nunca chama isto: a validacao e do backend)."""
    global _VERIFICADOR
    if _VERIFICADOR is None:
        _VERIFICADOR = VerificadorGoogle()
    return _VERIFICADOR


def definir_verificador(verificador) -> None:
    """Troca o verificador (usado pelos testes, com transporte emulado)."""
    global _VERIFICADOR
    _VERIFICADOR = verificador


def reiniciar_verificador() -> None:
    global _VERIFICADOR
    _VERIFICADOR = None


# Hosts de onde a FOTO do perfil pode vir (o `picture` do Google vive em `*.googleusercontent.com`).
# Lista FECHADA de proposito: a URL vira `src` de um <img> no front, entao um valor inesperado
# (host qualquer, `data:`, `http:`) e descartado e o front cai no rosto padrao da conta.
HOSTS_FOTO = ("googleusercontent.com", "google.com")


def _foto_segura(valor) -> str:
    """URL https da foto do perfil, ou "" quando nao vier de um host do proprio Google."""
    url = str(valor or "").strip()
    if not url.startswith("https://"):
        return ""
    host = (urlsplit(url).hostname or "").lower()
    if not any(host == dominio or host.endswith("." + dominio) for dominio in HOSTS_FOTO):
        return ""
    return url


def perfil_do_token(token: str, publico: str) -> dict:
    """Perfil do token VALIDADO: `{"email", "nome", "foto"}` - a base do rosto da conta.

    Regra de seguranca: o e-mail so vale quando o proprio Google o marca como verificado
    (`email_verified`), que e o que sustenta o vinculo automatico por e-mail (padrao de mercado).
    """
    dados = obter_verificador().verificar(token, publico)
    email = str(dados.get("email") or "").strip().lower()
    if not email:
        raise ErroGoogle(MSG_TOKEN, status=400)
    if not dados.get("email_verified"):
        raise ErroGoogle(MSG_EMAIL, status=403)
    return {
        "email": email,
        "nome": str(dados.get("name") or "").strip(),
        "foto": _foto_segura(dados.get("picture")),
    }


def email_do_token(token: str, publico: str) -> str:
    """Email VERIFICADO do token (atalho de `perfil_do_token`: a conta so e resolvida por ele)."""
    return perfil_do_token(token, publico)["email"]
# 🚨 [FIM: BACKEND - GOOGLE]
