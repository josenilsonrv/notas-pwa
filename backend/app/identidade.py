"""
🗺️ COMPONENTE: Provedor de identidade (GoTrue do Supabase OU memoria)
🎯 OBJETIVO: `registrar` / `autenticar` / `usuario` com UM contrato, para o backend ser
             testavel sem credencial (memoria) e usar o GoTrue de verdade quando houver `.env`.
🔗 QUEM DEPENDE DELE: `backend/app/auth.py` (rotas) e `backend/tests/test_auth.py`.
"""
# 🚨 [INÍCIO: BACKEND - IDENTIDADE]
from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
import uuid
from datetime import datetime, timezone

import httpx

from .config import obter_config

ITERACOES = 120_000  # custo do PBKDF2 (so no provedor de memoria/dev)

# Varredura de usuarios do GoTrue por e-mail (o admin API nao tem indice por e-mail):
# pagina de 200 e no maximo 5 paginas (1000 usuarios) - suficiente para este produto.
POR_PAGINA_USUARIOS = 200
PAGINAS_USUARIOS = 5


class ErroIdentidade(RuntimeError):
    """Falha do provedor de identidade (com status para a rota decidir)."""

    def __init__(self, mensagem: str, status: int = 400) -> None:
        self.status = status
        super().__init__(mensagem)


def _hash_senha(senha: str) -> str:
    sal = secrets.token_bytes(16)
    derivado = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), sal, ITERACOES)
    return f"pbkdf2_sha256${ITERACOES}${sal.hex()}${derivado.hex()}"


def _conferir_senha(senha: str, guardado: str) -> bool:
    try:
        _, iteracoes, sal_hex, esperado_hex = str(guardado).split("$")
        derivado = hashlib.pbkdf2_hmac(
            "sha256", senha.encode("utf-8"), bytes.fromhex(sal_hex), int(iteracoes)
        )
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(derivado.hex(), esperado_hex)


class IdentidadeMemoria:
    """Provedor de desenvolvimento/teste: usuarios em memoria, senha com PBKDF2.

    Existe para o fluxo de login ser testavel (e utilizavel) SEM Supabase. Em
    `DRIVER=supabase`, quem manda e o GoTrue (ver `IdentidadeGoTrue`).
    """

    driver = "memory"

    def __init__(self) -> None:
        self._trava = threading.RLock()
        self._por_email: dict[str, dict] = {}
        self._por_id: dict[str, dict] = {}

    def registrar(self, email: str, senha: str) -> str:
        chave = email.strip().lower()
        with self._trava:
            if chave in self._por_email:
                raise ErroIdentidade("nao foi possivel criar a conta", status=409)
            user_id = str(uuid.uuid4())
            perfil = {
                "id": user_id,
                "email": chave,
                "criado_em": time.time(),
                "senha": _hash_senha(senha),
            }
            self._por_email[chave] = perfil
            self._por_id[user_id] = perfil
            return user_id

    def autenticar(self, email: str, senha: str) -> str | None:
        with self._trava:
            perfil = self._por_email.get(email.strip().lower())
        if not perfil or not _conferir_senha(senha, perfil["senha"]):
            return None
        return str(perfil["id"])

    def usuario(self, user_id: str) -> dict | None:
        with self._trava:
            perfil = self._por_id.get(str(user_id))
        if not perfil:
            return None
        return {"id": perfil["id"], "email": perfil["email"], "criado_em": perfil["criado_em"]}

    # --- Login com Google ----------------------------------------------------
    def google(self, email: str, nome: str = "") -> str:
        """Resolve a conta do Google pelo e-mail VERIFICADO (vinculo automatico, padrao de
        mercado): reusa a conta quando o e-mail ja existe e so cria uma nova quando nao existe.
        """
        chave = email.strip().lower()
        with self._trava:
            perfil = self._por_email.get(chave)
            if perfil:
                return str(perfil["id"])
            user_id = str(uuid.uuid4())
            novo = {
                "id": user_id,
                "email": chave,
                "criado_em": time.time(),
                # Sem senha utilizavel: a entrada desta conta e pelo Google.
                "senha": None,
                "nome": nome or "",
            }
            self._por_email[chave] = novo
            self._por_id[user_id] = novo
            return user_id

    def limpar(self) -> None:
        """Zera os usuarios (usado entre testes)."""
        with self._trava:
            self._por_email.clear()
            self._por_id.clear()
# 🚨 [FIM: BACKEND - IDENTIDADE - PARTE 1]


# 🚨 [INÍCIO: BACKEND - IDENTIDADE]
class IdentidadeGoTrue:
    """Provedor real: Supabase Auth (GoTrue) via REST, com a chave `service_role`.

    Usamos o endpoint ADMIN (`/admin/users` com `email_confirm: true`) no cadastro, para
    nao depender de e-mail de confirmacao; e `/token?grant_type=password` no login. O token
    do GoTrue NAO e guardado: o backend emite a PROPRIA sessao (cookie `HttpOnly`).
    """

    driver = "supabase"

    def __init__(self, url: str, chave: str, transport: httpx.BaseTransport | None = None,
                 timeout: float = 15.0) -> None:
        self.url = (url or "").rstrip("/")
        self.chave = chave or ""
        self._transport = transport
        self._timeout = timeout
        self._cliente: httpx.Client | None = None

    @property
    def cliente(self) -> httpx.Client:
        if self._cliente is None:
            self._cliente = httpx.Client(
                base_url=f"{self.url}/auth/v1",
                headers={
                    "apikey": self.chave,
                    "Authorization": f"Bearer {self.chave}",
                    "Content-Type": "application/json",
                },
                timeout=self._timeout,
                transport=self._transport,
            )
        return self._cliente

    def fechar(self) -> None:
        if self._cliente is not None:
            self._cliente.close()
            self._cliente = None

    def registrar(self, email: str, senha: str) -> str:
        try:
            resposta = self.cliente.post(
                "/admin/users",
                json={"email": email.strip().lower(), "password": senha, "email_confirm": True},
            )
        except httpx.HTTPError as erro:
            raise ErroIdentidade("servico de identidade indisponivel", status=503) from erro
        if resposta.status_code >= 400:
            # Mensagem GENÉRICA: nao dizemos se o e-mail ja existia.
            raise ErroIdentidade("nao foi possivel criar a conta", status=400)
        return str((resposta.json() or {}).get("id") or "")

    def autenticar(self, email: str, senha: str) -> str | None:
        try:
            resposta = self.cliente.post(
                "/token",
                params={"grant_type": "password"},
                json={"email": email.strip().lower(), "password": senha},
            )
        except httpx.HTTPError as erro:
            raise ErroIdentidade("servico de identidade indisponivel", status=503) from erro
        if resposta.status_code >= 400:
            return None  # credencial invalida (a rota devolve a mensagem generica)
        usuario = (resposta.json() or {}).get("user") or {}
        return str(usuario.get("id") or "") or None

    def _usuario_por_email(self, email: str) -> str | None:
        """Procura o usuario do GoTrue pelo e-mail (paginado: o admin API nao indexa por e-mail)."""
        alvo = email.strip().lower()
        for pagina in range(1, PAGINAS_USUARIOS + 1):
            try:
                resposta = self.cliente.get(
                    "/admin/users",
                    params={"page": pagina, "per_page": POR_PAGINA_USUARIOS},
                )
            except httpx.HTTPError as erro:
                raise ErroIdentidade("servico de identidade indisponivel", status=503) from erro
            if resposta.status_code >= 400:
                return None
            dados = resposta.json()
            usuarios = dados.get("users") if isinstance(dados, dict) else dados
            usuarios = usuarios or []
            for usuario in usuarios:
                if str(usuario.get("email") or "").strip().lower() == alvo:
                    return str(usuario.get("id") or "") or None
            if len(usuarios) < POR_PAGINA_USUARIOS:
                return None
        return None

    def google(self, email: str, nome: str = "") -> str:
        """Vinculo por e-mail VERIFICADO: reusa o usuario do GoTrue ou cria um sem senha util.

        O `user_id` devolvido e o MESMO da conta de senha quando o e-mail ja existe - e isso
        que faz o login com Google cair nos dados da conta (padrao de mercado).
        """
        existente = self._usuario_por_email(email)
        if existente:
            return existente
        try:
            resposta = self.cliente.post(
                "/admin/users",
                json={
                    "email": email.strip().lower(),
                    "password": secrets.token_urlsafe(32),
                    "email_confirm": True,
                    "user_metadata": {"nome": nome} if nome else {},
                },
            )
        except httpx.HTTPError as erro:
            raise ErroIdentidade("servico de identidade indisponivel", status=503) from erro
        if resposta.status_code >= 400:
            raise ErroIdentidade("nao foi possivel entrar com o Google", status=400)
        return str((resposta.json() or {}).get("id") or "")

    def usuario(self, user_id: str) -> dict | None:
        try:
            resposta = self.cliente.get(f"/admin/users/{user_id}")
        except httpx.HTTPError as erro:
            raise ErroIdentidade("servico de identidade indisponivel", status=503) from erro
        if resposta.status_code >= 400:
            return None
        dados = resposta.json() or {}
        return {
            "id": dados.get("id"),
            "email": dados.get("email"),
            "criado_em": dados.get("created_at") or datetime.now(timezone.utc).isoformat(),
        }

    def remover(self, user_id: str) -> None:
        """Apaga o usuario no GoTrue (usado pelo `scripts/verificar.py` para limpar a conta
        de verificacao; o APP nunca apaga conta por aqui)."""
        try:
            self.cliente.delete(f"/admin/users/{user_id}")
        except httpx.HTTPError as erro:
            raise ErroIdentidade("servico de identidade indisponivel", status=503) from erro


_IDENTIDADE = None


def obter_identidade(config=None, transport: httpx.BaseTransport | None = None):
    """Singleton do provedor: GoTrue quando ha Supabase; senao, memoria."""
    global _IDENTIDADE
    if _IDENTIDADE is None:
        config = config or obter_config()
        if config.driver == "supabase" and config.tem_supabase:
            _IDENTIDADE = IdentidadeGoTrue(
                config.supabase_url, config.supabase_service_role_key, transport=transport
            )
        else:
            _IDENTIDADE = IdentidadeMemoria()
    return _IDENTIDADE


def definir_identidade(provedor) -> None:
    """Troca o provedor (usado pelos testes)."""
    global _IDENTIDADE
    _IDENTIDADE = provedor


def reiniciar_identidade() -> None:
    global _IDENTIDADE
    _IDENTIDADE = None
# 🚨 [FIM: BACKEND - IDENTIDADE - PARTE 2]