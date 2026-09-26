"""
🗺️ COMPONENTE: Aplicador do schema do Supabase (idempotente)
🎯 OBJETIVO: Aplicar `backend/supabase/schema.sql` no Postgres e CONFERIR as 9 tabelas:
             via `SUPABASE_DB_URL` (psycopg) quando houver conexao direta; senao, orientar o
             SQL Editor e conferir pelo REST com a chave `service_role`.
🔗 QUEM DEPENDE DELE: `scripts/verificar.py` e `npm run verificar:backend`.
"""
# 💾 [INÍCIO: BACKEND - MIGRAR (SCHEMA)]
from __future__ import annotations

import os
from pathlib import Path

from ..app.config import RAIZ, obter_config

SCHEMA = RAIZ / "backend" / "supabase" / "schema.sql"

TABELAS = (
    "profiles",
    "contadores",
    "pastas",
    "notas",
    "mapas",
    "configuracoes",
    "modelos",
    "ativos",
    "ativos_anotacoes",
)


def sql_do_schema() -> str:
    return Path(SCHEMA).read_text(encoding="utf-8")


def aplicar_com_psycopg(dsn: str) -> None:
    """Aplica o schema inteiro numa transacao (psycopg 3). Idempotente por construcao."""
    import psycopg

    with psycopg.connect(dsn, autocommit=True) as conexao:
        conexao.execute(sql_do_schema())


def conferir_via_rest(config) -> tuple[list[str], list[str]]:
    """Confere cada tabela com um GET limitado (nao depende de psycopg)."""
    from ..app.supabase_cliente import ErroSupabase, criar_cliente

    cliente = criar_cliente(config)
    presentes: list[str] = []
    ausentes: list[str] = []
    for tabela in TABELAS:
        try:
            cliente.selecionar(tabela, limite=1)
            presentes.append(tabela)
        except ErroSupabase:
            ausentes.append(tabela)
    return presentes, ausentes


def instruir_manual() -> None:
    print()
    print("  MODO MANUAL (sem SUPABASE_DB_URL):")
    print("   1) Abra o Dashboard do Supabase > SQL Editor > New query;")
    print(f"   2) cole TODO o conteudo de: {SCHEMA}")
    print("   3) rode (Run). O arquivo e idempotente: pode rodar quantas vezes quiser.")
    print("   4) para automatizar no futuro, adicione ao backend/.env:")
    print("      SUPABASE_DB_URL=postgresql://postgres:<senha>@db.<projeto>.supabase.co:5432/postgres")
    print()


def main() -> int:
    config = obter_config()
    if not config.tem_supabase:
        print("[migrar] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes em backend/.env.")
        instruir_manual()
        return 1

    dsn = (os.getenv("SUPABASE_DB_URL") or "").strip()
    if not dsn:
        instruir_manual()
    else:
        print("[migrar] aplicando schema.sql via SUPABASE_DB_URL (psycopg)...")
        try:
            aplicar_com_psycopg(dsn)
            print("[migrar] schema aplicado.")
        except Exception as erro:  # noqa: BLE001 - queremos a mensagem crua do banco
            print(f"[migrar] FALHOU via SUPABASE_DB_URL: {erro}")
            instruir_manual()

    presentes, ausentes = conferir_via_rest(config)
    print(f"[migrar] tabelas presentes ({len(presentes)}/{len(TABELAS)}): {', '.join(presentes)}")
    if ausentes:
        print(f"[migrar] FALTANDO: {', '.join(ausentes)}")
        print("[migrar] aplique o schema (acima) e rode de novo.")
        return 1
    print("[migrar] OK: todas as tabelas respondem.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
# 💾 [FIM: BACKEND - MIGRAR (SCHEMA)]
