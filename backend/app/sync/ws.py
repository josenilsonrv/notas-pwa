"""
🗺️ COMPONENTE: Hub de sincronizacao em TEMPO REAL (WebSocket `/ws`)
🎯 OBJETIVO: Ligar cada aparelho/aba da mesma conta (`user_id`) a um hub e trocar mensagens do
             protocolo do plano (`hello`/`bemvindo`/`op`/`ack`/`change`/`conflito`/`erro`/
             `ping`/`pong`), reaproveitando a MESMA `aplicar_op` do push HTTP - a decisao de
             conflito nao existe em dois lugares.
🔗 QUEM DEPENDE DELE: `main.py` (include_router, ANTES do estatico), o `sync/sync-cliente.js`
             (secao 8) e `backend/tests/test_sync_ws.py`.

Contrato (secao 2.4 do plano):
  - Autenticacao no HANDSHAKE pela sessao em cookie (`py_session`) + checagem de `Origin`.
    Sem sessao valida -> o socket e aceito e fechado com o codigo **4401** (codigo proprio, para
    o cliente nao entrar em loop de reconexao). Aceitamos ANTES de fechar de proposito: o
    protocolo ASGI transforma um `close` antes do `accept` em HTTP 403 e o codigo 4401 se perde.
  - Um `user_id` pode ter N conexoes (N aparelhos/abas) - o hub agrupa por `user_id`.
  - `ack` = operacao PERSISTIDA (o cliente so entao solta a op da fila).
  - `change` vai para os OUTROS sockets do mesmo `user_id` (nunca para o autor).
  - `erro.acesso_negado` quando a mensagem declara um `user_id` diferente do da sessao
    (mesma regra de compatibilidade do `?user_id=` do HTTP, P84).
  - Sockets mortos (sem NENHUMA mensagem por `LIMITE_SILENCIO`) sao fechados pela vigia.
"""
# 🔄 [INÍCIO: API - SYNC WS]
from __future__ import annotations

import asyncio
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..config import obter_config
from ..repositorio import ENTIDADES, repositorio
from ..seguranca import sessao_do_pedido
from .regras import aplicar_op

# Codigo proprio de "sem sessao": o cliente NAO deve tentar reconectar em loop.
CODIGO_SEM_SESSAO = 4401
# Heartbeat: o cliente manda `ping` a cada 25 s; o servidor fecha quem ficar 50 s em silencio.
INTERVALO_VIGIA = 5.0
LIMITE_SILENCIO = 50.0
# Teto de mensagem: uma `op` de nota gigante cabe folgada; o resto e recusado sem estourar RAM.
LIMITE_MENSAGEM = 1024 * 512

router = APIRouter(tags=["ws"])


class Hub:
    """Agrupa as conexoes por `user_id` (N aparelhos/abas da MESMA conta).

    Sem `asyncio.Lock`: o loop do FastAPI e mono-thread, entao mexer no dicionario/set e
    atomico entre `await`s - e uma trava criada no import amarraria um loop errado nos testes.
    """

    def __init__(self) -> None:
        self._por_usuario: dict[str, set[WebSocket]] = {}

    async def registrar(self, user_id: str, socket: WebSocket) -> None:
        self._por_usuario.setdefault(str(user_id), set()).add(socket)

    async def remover(self, user_id: str, socket: WebSocket) -> None:
        conexoes = self._por_usuario.get(str(user_id))
        if not conexoes:
            return
        conexoes.discard(socket)
        # Limpeza: conta sem conexao nenhuma sai do dicionario (nao vaza entrada vazia).
        if not conexoes:
            self._por_usuario.pop(str(user_id), None)

    def conexoes(self, user_id: str) -> list[WebSocket]:
        return list(self._por_usuario.get(str(user_id), ()))

    async def difundir(self, user_id: str, autor: WebSocket | None, mensagem: dict) -> None:
        """Manda para os OUTROS sockets do usuario (nunca para o autor da op)."""
        alvos = [socket for socket in self.conexoes(user_id) if socket is not autor]
        if not alvos:
            return
        resultados = await asyncio.gather(
            *(enviar(socket, mensagem) for socket in alvos), return_exceptions=True
        )
        for socket, resultado in zip(alvos, resultados):
            if isinstance(resultado, Exception):
                await self.remover(user_id, socket)


_HUB: Hub | None = None


def obter_hub() -> Hub:
    """Hub unico do processo (todos os sockets e todas as contas passam por aqui)."""
    global _HUB
    if _HUB is None:
        _HUB = Hub()
    return _HUB


def reiniciar_hub() -> Hub:
    """Descarta o hub (usado pelos testes, que nao podem herdar conexoes)."""
    global _HUB
    _HUB = Hub()
    return _HUB


async def enviar(socket: WebSocket, mensagem: dict) -> None:
    """Envia uma mensagem do protocolo (JSON compacto)."""
    await socket.send_text(json.dumps(mensagem, ensure_ascii=False, default=str))


def _origem_permitida(websocket: WebSocket) -> bool:
    """Confere o `Origin` do handshake (anti-CSRF de WebSocket).

    Aceitamos quando: (a) nao ha `Origin` (cliente que nao e navegador, ex.: TestClient - a
    sessao em cookie continua obrigatoria); (b) o `Origin` esta em `ORIGENS_PERMITIDAS`
    (lista explicita, NUNCA `*`); ou (c) o `Origin` e o MESMO host do pedido - que e o caso
    normal do deploy de origem unica (o proprio Python serve o PWA). Qualquer outra origem
    (um site de terceiros tentando abrir o socket) e recusada.
    """
    origem = (websocket.headers.get("origin") or "").strip()
    if not origem:
        return True
    if origem in obter_config().origens_permitidas:
        return True
    host = (websocket.headers.get("host") or "").strip()
    return bool(host) and origem in (f"http://{host}", f"https://{host}")


def _mensagem_erro(id_local, codigo: str, detalhe: str) -> dict:
    return {"t": "erro", "id_local": str(id_local or ""), "codigo": codigo, "detalhe": detalhe}


async def _hello(websocket: WebSocket, sessao, mensagem: dict) -> None:
    """Devolve o estado da conta desde `desde_rev`: `bemvindo` + um `change` por registro.

    Com `desde_rev > 0` o delta traz TAMBEM os tombstones (`deleted_at`), para o aparelho
    remover o que foi apagado enquanto estava fora - e o que garante "reconexao nao perde
    nada" (secao 2.4 do plano).
    """
    try:
        desde = int(mensagem.get("desde_rev") or 0)
    except (TypeError, ValueError):
        desde = 0
    desde = max(0, desde)
    repo = repositorio()
    await enviar(
        websocket,
        {
            "t": "bemvindo",
            "rev_global": repo.rev_global(sessao.user_id),
            "usuario": {"id": sessao.user_id, "email": sessao.email},
        },
    )
    for entidade in ENTIDADES:
        for registro in repo.listar(
            entidade, sessao.user_id, since_rev=desde, incluir_excluidos=desde > 0
        ):
            await enviar(
                websocket,
                {
                    "t": "change",
                    "entidade": entidade,
                    "id": registro["id"],
                    "rev": registro["rev"],
                    "updated_at": registro["updated_at"],
                    "deleted_at": registro["deleted_at"],
                    "dados": registro["dados"],
                },
            )


async def _op(websocket: WebSocket, hub: Hub, sessao, mensagem: dict) -> None:
    """Aplica UMA operacao pela MESMA `aplicar_op` do HTTP e responde `ack`/`conflito`."""
    id_local = str(mensagem.get("id_local") or "")
    # Compatibilidade P84: a mensagem pode declarar `user_id`; se divergir da sessao -> negado.
    declarado = str(mensagem.get("user_id") or "").strip()
    if declarado and declarado != str(sessao.user_id):
        await enviar(
            websocket, _mensagem_erro(id_local, "acesso_negado", "user_id diferente da sessao")
        )
        return
    try:
        resultado = aplicar_op(repositorio(), sessao.user_id, mensagem)
    except ValueError as erro:
        await enviar(websocket, _mensagem_erro(id_local, "payload_invalido", str(erro)))
        return

    if "ack" not in resultado:
        conflito = dict(resultado["conflito"])
        conflito["t"] = "conflito"
        await enviar(websocket, conflito)
        return

    ack = dict(resultado["ack"])
    await enviar(websocket, {"t": "ack", **ack})

    # `change` para os OUTROS aparelhos: lemos o registro GRAVADO (versao canonica do servidor).
    change = {"t": "change", "entidade": ack["entidade"], "id": ack["id"], "rev": ack["rev"]}
    try:
        registro = repositorio().obter(
            ack["entidade"], sessao.user_id, ack["id"], incluir_excluido=True
        )
    except ValueError:
        registro = None
    if registro:
        change.update(
            {
                "updated_at": registro["updated_at"],
                "deleted_at": registro["deleted_at"],
                "dados": registro["dados"],
            }
        )
    await hub.difundir(sessao.user_id, websocket, change)


async def _vigia(websocket: WebSocket, estado: dict) -> None:
    """Fecha o socket que ficar `LIMITE_SILENCIO` sem NENHUMA mensagem (heartbeat do servidor)."""
    try:
        while True:
            await asyncio.sleep(INTERVALO_VIGIA)
            if time.monotonic() - estado["visto"] > LIMITE_SILENCIO:
                await websocket.close(code=1001)
                return
    except (asyncio.CancelledError, RuntimeError):
        return


async def _atender(websocket: WebSocket, hub: Hub, sessao) -> None:
    """Loop de mensagens da conexao (com a vigia de silencio rodando ao lado)."""
    estado = {"visto": time.monotonic()}
    vigia = asyncio.create_task(_vigia(websocket, estado))
    try:
        while True:
            bruto = await websocket.receive_text()
            estado["visto"] = time.monotonic()
            if len(bruto) > LIMITE_MENSAGEM:
                await enviar(
                    websocket, _mensagem_erro("", "payload_invalido", "mensagem grande demais")
                )
                continue
            try:
                mensagem = json.loads(bruto)
            except (ValueError, TypeError):
                await enviar(websocket, _mensagem_erro("", "payload_invalido", "JSON invalido"))
                continue
            if not isinstance(mensagem, dict):
                await enviar(
                    websocket, _mensagem_erro("", "payload_invalido", "mensagem deve ser um objeto")
                )
                continue
            tipo = str(mensagem.get("t") or "").strip().lower()
            if tipo == "ping":
                await enviar(websocket, {"t": "pong"})
            elif tipo == "hello":
                await _hello(websocket, sessao, mensagem)
            elif tipo == "op":
                await _op(websocket, hub, sessao, mensagem)
            else:
                await enviar(
                    websocket,
                    _mensagem_erro(
                        mensagem.get("id_local"), "payload_invalido", f"tipo desconhecido: {tipo!r}"
                    ),
                )
    finally:
        vigia.cancel()
        await hub.remover(sessao.user_id, websocket)


@router.websocket("/ws")
async def ws_sync(websocket: WebSocket) -> None:
    """Endpoint do WebSocket: autentica no handshake, entra no hub e conversa o protocolo."""
    sessao = sessao_do_pedido(websocket)
    origem_ok = _origem_permitida(websocket)
    # Aceitamos primeiro: sem isso o codigo 4401 nao chega ao cliente (ASGI vira HTTP 403).
    await websocket.accept()
    if sessao is None:
        await websocket.close(code=CODIGO_SEM_SESSAO, reason="sem sessao")
        return
    if not origem_ok:
        await websocket.close(code=CODIGO_SEM_SESSAO, reason="origem nao permitida")
        return

    hub = obter_hub()
    await hub.registrar(sessao.user_id, websocket)
    try:
        await _atender(websocket, hub, sessao)
    except WebSocketDisconnect:
        pass
    finally:
        await hub.remover(sessao.user_id, websocket)
# 🔄 [FIM: API - SYNC WS]

