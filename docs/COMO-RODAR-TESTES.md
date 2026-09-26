# Como rodar os testes (de forma eficiente)

> **Suíte completa SEM FALHAS:** `node tests/run-all.cjs` (ou `npm test`) termina com
> `RESULTADO: SEM FALHAS` e **código de saída 0**. As falhas que sobraram são
> **determinísticas e documentadas** (divergências reais do motor de notas vs. o projeto
> original) e ficam isoladas em **uma única lista**: `FALHAS_CONHECIDAS`, no topo de
> `tests/run-all.cjs` — registradas em `docs/PROBLEMAS-E-MITIGACOES.md` (**P83**).
>
> Os testes são **determinísticos**: os que passam, passam sempre; os que falham, falham
> sempre. O que varia é o **tempo** (até 2× conforme a carga da máquina) e, sob carga,
> aparecem **timeouts** ocasionais — para isso existe `--retry=1`.

## Regra de ouro

Rode **só o arquivo relacionado ao que você mexeu** (leva segundos). A suíte
completa é para visão geral.

| Objetivo | Comando | Tempo típico |
| --- | --- | --- |
| 1 arquivo | `node tests/<arquivo>.cjs` | 2–15 s |
| Subconjunto | `node tests/run-all.cjs --filter=notes_` | 1–3 min |
| **Suíte completa SEM FALHAS** | `node tests/run-all.cjs` | ≈ 11–16 min (4 núcleos) |
| **Suíte rápida** (paralela; falhas reconfirmadas em série) | `npm run test:rapido` ou `node tests/run-all.cjs --jobs=auto` | **a mais rápida** (4 núcleos: ≈ 11 min) |
| Auditoria (conta as conhecidas como falha) | `node tests/run-all.cjs --estrito` ou `npm run test:estrito` | ≈ 11–16 min |
| Suíte completa + comparação com a rodada anterior | `node tests/run-all.cjs --baseline` | ≈ 11–16 min |
| Suíte com retry (tolera timeout transitório) | `node tests/run-all.cjs --retry=1` | + tempo dos que falham |
| Via npm | `npm test` / `npm test -- --filter=toolbar` | igual ao comando |

### O que significa cada resultado no console

| Rótulo | Significado | Reprova? |
| --- | --- | --- |
| `PASSA` | passou | não |
| `PASSA*` | passou **na repetição** (flaky/timeout transitório) | não |
| `CONHEC` | falha **conhecida e documentada** (está em `FALHAS_CONHECIDAS`) | **não** |
| `FALHA` | falha **nova** (ou qualquer falha com `--estrito`) | **sim (código 1)** |
| `n/a` | inaplicável ao PWA, com o motivo escrito (`NAO_APLICAVEIS`) | não |

## O caminho que funcionou de primeira

1. **Deixe a máquina limpa** (sem Edge/node pendentes de execuções anteriores):

```powershell
Get-Process msedge,node -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force
```

2. **Rode o teste do que você mexeu** (é o que dá resultado imediato):

```bash
node tests/mapa_chips.cjs          # faixa de chips dos mapas (espelho dos chips de nota)
node tests/mapa_gestao.cjs         # mapas como itens da pasta (chips/menu/modelos)
node tests/toolbar_pwa.cjs         # barra/teclado
node tests/pwa_service_worker.cjs  # deploy/Service Worker (MIME + fallback de SPA)
node tests/tema_switch.cjs         # tema + theme-color
node tests/nota_grande_pwa.cjs     # nota com ~1 milhão de caracteres
```

3. **Para a suíte completa, rode em segundo plano** — ela leva minutos e
   ultrapassa o timeout do terminal/ferramenta. Guarde o **PID** para acompanhar:

```powershell
# --jobs=auto usa METADE dos núcleos (4 núcleos -> 2). Usar TODOS os núcleos PIORA
# (medido: --jobs=3 = 975 s vs --jobs=2 = 663 s nesta máquina de 4 núcleos).
$p = Start-Process node -ArgumentList 'tests/run-all.cjs','--jobs=auto' `
     -WorkingDirectory . -NoNewWindow -PassThru `
     -RedirectStandardOutput "$env:TEMP\suite.txt" -RedirectStandardError "$env:TEMP\suite.err.txt"
$p.Id | Out-File "$env:TEMP\suite.pid"

# acompanhe com checagens CURTAS (sem espera) — veja "Acompanhar sem travar"
Get-Content "$env:TEMP\suite.txt" -Tail 20
```

> ⚠️ **NUNCA acompanhe a suíte com `Start-Sleep` longo** (ex.: `Start-Sleep -Seconds 25`
> antes de cada leitura). Um único comando com essa espera **estoura o timeout de 30 s**
> da ferramenta/terminal e a checagem **falha mesmo com a suíte passando** — parecia
> "lentidão", mas era só o loop de espera batendo no limite. Faça **uma checagem curta por
> vez** (milissegundos) e repita quando quiser — detalhes em
> [Acompanhar sem travar](#acompanhar-sem-travar-o-que-fazia-a-suíte-parecer-lenta).

4. **Interprete o resultado**:

* `RESULTADO: SEM FALHAS (N conhecidas documentadas)` → **estado esperado**: nada a fazer.
* `RESULTADO: FALHAS (arquivo.cjs)` → foi você; investigue esse arquivo (o runner imprime
  os detalhes no fim).
* `ATENCAO: passaram e ainda estao na lista — remova de FALHAS_CONHECIDAS: arquivo.cjs` →
  a divergência foi resolvida: **remova a entrada** da lista.
* `--baseline`: `BASELINE: SEM REGRESSOES` / `BASELINE: REGRESSAO (arquivo.cjs)` compara
  com `docs/relatorio-testes.json` (lido **antes** de rodar).
* Resumo esperado hoje: **62 passam / 0 falham / 8 conhecidas / 1 n/a** de 71 testes.
* `flaky: N` aparece quando algum teste só passou com `--retry` (ou só passou na
  reconfirmação em série, no modo `--jobs`).

## Acompanhar sem travar (o que fazia a suíte parecer "lenta")

O erro mais comum **não é a suíte ser lenta**: é **esperar de forma bloqueante** para ver o
progresso. Regras para nunca repetir essa lentidão:

* **Não existe "rodar tudo e esperar num único comando".** O terminal/ferramenta **aborta em
  30 s**; a suíte completa leva ~11 min. Por isso o padrão é: **iniciar em 2º plano** (passo 3) e
  fazer **checagens curtas** — nunca `Start-Sleep` longo (ver abaixo).
* **Checagem = comando curto.** Use **um** comando que só lê o estado e sai na hora:

```powershell
$pid = Get-Content "$env:TEMP\suite.pid"
if (Get-Process -Id $pid -ErrorAction SilentlyContinue) { 'AINDA RODANDO' } else { 'TERMINOU' }
Get-Content "$env:TEMP\suite.txt" -Tail 12
```

* **Proibido `Start-Sleep` longo** (`-Seconds 25+`): o comando inteiro passa dos **30 s** de
  timeout da ferramenta e "aborta" — a suíte continua rodando normalmente em 2º plano. Se
  quiser esperar, espere **poucos segundos** (≤ 20 s) ou, melhor, **repita a checagem curta**.
* **Não relance a suíte** enquanto a anterior roda (concorrência de Edge/node deixa tudo mais
  lento e gera timeout). Se um `node`/`msedge` ficou pendente, encerre antes.

```powershell
Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force
```

* **Prefira `--jobs=auto`** (`npm run test:rapido`): usa **metade dos núcleos** (4 núcleos → 2).
  Medição nesta máquina (4 núcleos): **`--jobs=2` = 663 s**; **`--jobs=3` = 975 s (PIOR** — a
  disputa de CPU **dobra** o tempo de cada teste). Regra: **nunca use todos os núcleos**. O
  paralelismo corta tempo até a metade dos núcleos; acima disso, os `waitForTimeout` de animação
  estouram e a suíte **fica mais lenta**.
* **Escopo do dia a dia:** rode só o arquivo que você mexeu (`node tests/<arquivo>.cjs`,
  segundos) em vez da suíte inteira a cada edição.


## Velocidade (o que faz a suíte demorar — e como cortar)

* Cada teste **abre o próprio navegador** (Playwright/Edge): ~2 s só de partida, por teste.
* `--jobs=N` roda N testes ao mesmo tempo. **Use `--jobs=auto`** (`npm run test:rapido`) = metade
  dos núcleos. Medição nesta máquina (**4 núcleos**): `--jobs=2` ≈ **11 min**; `--jobs=3` ≈
  **16 min** (**PIOR** — não use). Como o paralelismo aumenta a disputa de CPU, **toda falha é
  reconfirmada em série**: se passar na reconfirmação, sai como `PASSA*` (não reprova) — paralelo
  **não gera falso positivo**. As falhas conhecidas não são reconfirmadas (economiza tempo).
* Testes isolados (segundos) continuam sendo o caminho do dia a dia: `node tests/<arquivo>.cjs`.
* **Não confunda "suíte lenta" com espera bloqueante**: acompanhe em 2º plano com **checagens
  curtas** (sem `Start-Sleep` longo) — ver
  [Acompanhar sem travar](#acompanhar-sem-travar-o-que-fazia-a-suíte-parecer-lenta).
* `notes_extras.cjs` era o teste mais caro (~45 s, esperando um seletor do visualizador de
  arquivo que nunca vinha). **Corrigido** em P84: o visualizador agora usa a implementação
  de rede quando não há anexo local, então o teste termina em poucos segundos.

## Falhas conhecidas (determinísticas) — 8

Ficam na constante **`FALHAS_CONHECIDAS`** (topo de `tests/run-all.cjs`) e falham
**sempre**, em qualquer execução limpa. Não são flakiness: são divergências reais do
motor de notas em relação ao projeto original (registradas em **P83**):

```
notes_cascade_defaults          cores em cascata (paridade do motor)
notes_collapse_motion           tempo da animação de colapso
notes_markdown                  tabela markdown não convertida
notes_navigation_completion     cor herdada na navegação por conclusão
notes_outline_code              colapso de título + bloco de código
notes_paste_blocks              colagem de blocos junta linhas
notes_regression_audit          auditoria de regressão (comportamento divergente)
test_notes_editor_ui            Enter em lista aninhada (nível diferente)
```

**Regras da lista (não quebre):**

1. Só entra uma falha **determinística**, reproduzida no arquivo isolado
   (`node tests/<arquivo>.cjs`) e **explicada no P83**. Nunca use a lista para
   “esconder” uma regressão.
2. Se o teste começar a **passar**, remova a entrada (o runner avisa).
3. Para auditar tudo como falha (sem abrandar), rode **`--estrito`**.
4. Ao adicionar/remover, rode `node tests/<arquivo>.cjs` e depois a suíte completa.
5. `--estrito` e `--baseline` não alteram a lista: são só modos de leitura.

## Por que a suíte é "lenta"

* Cada teste **abre o próprio navegador** (Playwright/Edge) — ~1–2 s só de partida.
* Vários testes esperam **animação** com `waitForTimeout` fixo (ex.: toolbar 6×,
  editor 11×, multi-notas 8×).
* A execução é **sequencial de propósito**: rodar em paralelo aumenta a disputa
  de CPU e faz os `waitForTimeout` estourarem (mais flakiness, não menos).
* `notes_extras.cjs` gasta ~30–45 s esperando um seletor do visualizador de arquivo
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

