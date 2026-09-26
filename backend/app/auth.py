"""
🗺️ COMPONENTE: Rotas de autenticacao (`/api/auth`)
🎯 OBJETIVO: Registrar/entrar/sair e dizer quem esta logado, sempre com cookie `HttpOnly` +
             CSRF nas escritas + rate-limit. Erros SEMPRE no formato `{"detail": "..."}`.
🔗 QUEM DEPENDE DELE: `backend/app/main.py` (include_router), o `conta.js` (fase 4) e
                      `backend/tests/test_auth.py`.
"""
# 🚨 [INÍCIO: BACKEND - AUTH]
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .config import obter_config
from .google import ErroGoogle, configurado, perfil_do_token
from .identidade import ErroIdentidade, obter_identidade
from .repositorio import repositorio
from .seguranca import (
    chave_limite,
    definir_cookie,
    exigir_csrf,
    exigir_sessao,
    nova_sessao,
    obter_assinador,
    obter_limitador,
    remover_cookie,
    sessao_do_pedido,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

SENHA_MINIMA = 6
SENHA_MAXIMA = 200
EMAIL_MAXIMO = 254

MSG_CREDENCIAL = "E-mail ou senha invalidos"
MSG_LIMITE = "Muitas tentativas; tente novamente em instantes"
MSG_IDENTIDADE = "Servico de login indisponivel no momento"
MSG_GOOGLE_DESLIGADO = "Login com Google indisponivel"


class Credenciais(BaseModel):
    """Corpo do login/registro. Campos com default para NUNCA devolver 422 em lista."""

    email: str = Field(default="")
    senha: str = Field(default="")


class CredencialGoogle(BaseModel):
    """Corpo do login com Google: o ID token (JWT) que o GIS entrega no navegador."""

    credential: str = Field(default="")


def _validar(email: str, senha: str) -> str:
    """Normaliza o e-mail e valida o minimo. Devolve o e-mail em minusculas."""
    limpo = (email or "").strip().lower()
    partes = limpo.split("@")
    if len(partes) != 2 or not partes[0] or "." not in partes[1] or len(limpo) > EMAIL_MAXIMO:
        raise HTTPException(status_code=400, detail="Informe um e-mail valido")
    if not SENHA_MINIMA <= len(senha or "") <= SENHA_MAXIMA:
        raise HTTPException(
            status_code=400, detail=f"A senha precisa ter ao menos {SENHA_MINIMA} caracteres"
        )
    return limpo


def _limitar(request: Request, email: str) -> None:
    if not obter_limitador().permitir(chave_limite(request, email)):
        raise HTTPException(status_code=429, detail=MSG_LIMITE)


def _abrir_sessao(response: Response, user_id: str, email: str, provedor: str = "senha", foto: str = "") -> None:
    """Emite o cookie da sessao com o rosto da conta (`provedor` + `foto`), quando houver."""
    token = obter_assinador().emitir(nova_sessao(user_id, email, provedor, foto))
    definir_cookie(response, token)


@router.post("/registrar", status_code=204)
def registrar(dados: Credenciais, request: Request, response: Response) -> None:
    """Cria a conta (GoTrue ou memoria) e ja sai logado."""
    email = _validar(dados.email, dados.senha)
    _limitar(request, email)
    try:
        user_id = obter_identidade().registrar(email, dados.senha)
    except ErroIdentidade as erro:
        # Mensagem GENERICA de proposito: nao revelamos se o e-mail ja existia.
        raise HTTPException(status_code=400, detail="Nao foi possivel criar a conta") from erro
    repositorio().salvar_perfil(user_id, email)
    _abrir_sessao(response, user_id, email)


@router.post("/login", status_code=204)
def login(dados: Credenciais, request: Request, response: Response) -> None:
    """Valida a credencial e emite a sessao (cookie `HttpOnly`)."""
    email = _validar(dados.email, dados.senha)
    _limitar(request, email)
    try:
        user_id = obter_identidade().autenticar(email, dados.senha)
    except ErroIdentidade as erro:
        raise HTTPException(status_code=503, detail=MSG_IDENTIDADE) from erro
    if not user_id:
        # MESMA mensagem para senha errada e e-mail inexistente.
        raise HTTPException(status_code=401, detail=MSG_CREDENCIAL)
    obter_limitador().liberar(chave_limite(request, email))
    _abrir_sessao(response, user_id, email)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response) -> None:
    """Encerra a sessao. IDEMPOTENTE: sem sessao, tambem responde 204."""
    sessao = sessao_do_pedido(request)
    if sessao is not None:
        exigir_csrf(request, sessao)
    remover_cookie(response)


@router.get("/me")
def me(request: Request) -> dict:
    """Diz quem esta logado (401 quando nao ha sessao). O front usa isto no boot."""
    sessao = exigir_sessao(request)
    return sessao.publico()
@router.get("/config")
def configuracao_publica() -> dict:
    """Config PUBLICA do login: diz ao front se ha Google e qual o Client ID.

    Nao ha segredo aqui (o `client_secret` nem existe neste fluxo). Sem `GOOGLE_CLIENT_ID`, o
    front nao renderiza o botao e o app segue exatamente como hoje.
    """
    ativo = configurado()
    return {
        "google_ativo": ativo,
        "google_client_id": obter_config().google_client_id if ativo else "",
    }


@router.post("/google", status_code=204)
def login_google(dados: CredencialGoogle, request: Request, response: Response) -> None:
    """Entra com o ID token do Google (validado no backend) e emite a sessao de sempre.

    O e-mail so vem do token VALIDADO (nunca do cliente). O vinculo e automatico por e-mail
    verificado: mesma conta quando o e-mail ja existe (padrao de mercado). A `foto` do perfil
    tambem sai do token e vai na sessao: e o rosto da conta no cabecalho.
    """
    if not configurado():
        raise HTTPException(status_code=503, detail=MSG_GOOGLE_DESLIGADO)
    _limitar(request, "")  # sem e-mail antes da validacao: limita por IP
    try:
        perfil = perfil_do_token(dados.credential, obter_config().google_client_id)
    except ErroGoogle as erro:
        raise HTTPException(status_code=erro.status, detail=str(erro)) from erro
    email = perfil["email"]
    try:
        user_id = obter_identidade().google(email)
    except ErroIdentidade as erro:
        raise HTTPException(status_code=erro.status, detail=str(erro)) from erro
    if not user_id:
        raise HTTPException(status_code=503, detail=MSG_IDENTIDADE)
    obter_limitador().liberar(chave_limite(request, email))
    repositorio().salvar_perfil(user_id, email)
    _abrir_sessao(response, user_id, email, provedor="google", foto=perfil["foto"])


# 🚨 [FIM: BACKEND - AUTH]