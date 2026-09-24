# Como rodar os testes (de forma eficiente)

> Medição real feita com **18 execuções repetidas** (3× cada teste):
> os testes são **determinísticos** — os que passam, passam sempre; os 12 que
> falham, falham sempre. O que varia é o **tempo** (até 2× conforme a carga da
> máquina) e, sob carga, aparecem **timeouts** ocasionais. Ou seja: não é "falha
> até dar certo"; é falta de baseline + máquina ocupada.

### Tempos medidos (máquina limpa, 3 rodadas de cada)

| teste | resultado | tempos (ms) |
| --- | --- | --- |
| `toolbar_pwa.cjs` | ✅ 3/3 | 8512 · 7649 · 6455 |
| `tema_switch.cjs` | ✅ 3/3 | 4581 · 7291 · 6851 |
| `nota_grande_pwa.cjs` | ✅ 3/3 | 7072 · 3743 · 3489 |
| `notes_enter_child.cjs` | ❌ 0/3 | 2479 · 1927 · 2005 |
| `notes_cascade_defaults.cjs` | ❌ 0/3 | 4738 · 4850 · 5182 |
| `notes_markdown.cjs` | ❌ 0/3 | 4635 · 5961 · 5778 |

## Regra de ouro

Rode **só o arquivo relacionado ao que você mexeu** (leva segundos). A suíte
completa é para visão geral.

| Objetivo | Comando | Tempo típico |
| --- | --- | --- |
| 1 arquivo | `node tests/<arquivo>.cjs` | 2–15 s |
| Subconjunto | `node tests/run-all.cjs --filter=notes_` | 1–3 min |
| Suíte completa (só falha se houver falha **nova**) | `node tests/run-all.cjs --baseline` | 5–9 min |
| Suíte com retry (tolera timeout transitório) | `node tests/run-all.cjs --retry=1` | + tempo dos que falham |
| Via npm | `npm test -- --filter=toolbar` | igual ao filtro |

## O caminho que funcionou de primeira

1. **Deixe a máquina limpa** (sem Edge/node pendentes de execuções anteriores):

```powershell
Get-Process msedge,node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force
```

2. **Rode o teste do que você mexeu** (é o que dá resultado imediato):

```bash
node tests/toolbar_pwa.cjs        # barra/teclado
node tests/pwa_service_worker.cjs  # deploy/Service Worker (MIME + fallback de SPA)
node tests/tema_switch.cjs        # tema + theme-color
node tests/nota_grande_pwa.cjs    # nota com ~1 milhão de caracteres
```

3. **Para a suíte completa, rode em segundo plano** — ela leva minutos e
   ultrapassa o timeout do terminal/ferramenta:

```powershell
$p = Start-Process node -ArgumentList 'tests/run-all.cjs','--baseline' `
     -WorkingDirectory . -NoNewWindow -PassThru `
     -RedirectStandardOutput "$env:TEMP\suite.txt" -RedirectStandardError "$env:TEMP\suite.err.txt"

# acompanhe quando quiser
Get-Content "$env:TEMP\suite.txt" -Tail 20
```

4. **Interprete o resultado**:

* `--baseline` **só retorna código de erro se aparecer falha NOVA**, comparando
  com `docs/relatorio-testes.json` (lido **antes** de rodar).
* `RESULTADO: SEM REGRESSOES (as falhas atuais ja existiam)` → pode seguir.
* `RESULTADO: REGRESSAO (arquivo.cjs)` → foi você; investigue esse arquivo.
* Resumo esperado hoje: **28 passam / 12 falham (conhecidas) / 1 n/a** de 41 testes.
* `flaky: N` aparece quando algum teste só passou com `--retry`.

## Falhas conhecidas (determinísticas) — 12

Estas falham **sempre**, em qualquer execução limpa, e **não** são flakiness
(são divergências reais do motor em relação ao projeto original, já registradas
no baseline):

```
notes_cascade_defaults   notes_checklist_numbers   notes_checklist_order
notes_collapse_motion    notes_enter_child         notes_extras
notes_markdown           notes_navigation_completion
notes_outline_code       notes_paste_blocks        notes_regression_audit
test_notes_editor_ui
```

Não persiga essas 12 ao rodar a suíte: use `--baseline` para focar no que é novo.

## Por que a suíte é "lenta"

* Cada teste **abre o próprio navegador** (Playwright/Edge) — ~1–2 s só de partida.
* Vários testes esperam **animação** com `waitForTimeout` fixo (ex.: toolbar 6×,
  editor 11×, multi-notas 8×).
* A execução é **sequencial de propósito**: rodar em paralelo aumenta a disputa
  de CPU e faz os `waitForTimeout` estourarem (mais flakiness, não menos).
* `notes_extras.cjs` gasta ~30 s esperando um seletor do visualizador de arquivo
  (`notes-file-page p`) que não aparece — é a falha conhecida mais cara do run.

## Dicas que evitam a "grande demora"

* **Não rode a suíte enquanto roda diagnósticos/capturas** (foi o que fez alguns
  testes estourarem tempo nas execuções anteriores).
* Use `--retry=1` quando a máquina estiver carregada: ele mostra `PASSA*` / `flaky`
  em vez de reprovar por um timeout transitório.
* Se algum teste passar de 3 min sob carga: `--timeout=300000`.
* Meça tempos por teste no rodapé de cada linha (`PASSA  arquivo  1234 ms`) para
  saber o que está lento.

## Registro de problemas e mitigações

Se a suíte acusar **falha nova** ou **flakiness** (e depois de corrigir), registre em
`docs/PROBLEMAS-E-MITIGACOES.md`: sintoma, causa, correção e como evitar nas próximas
fases. Antes de “consertar” uma divergência de paridade, rode o teste **isolado**
(ex.: `node tests/parity_visual.cjs`) para confirmar que ela é real.

**Sempre que assets cacheados mudarem** (CSS/JS servidos pelo Service Worker),
incremente o `CACHE_NAME` em `sw.js` e inclua os novos caminhos em `ESSENCIAIS`.
