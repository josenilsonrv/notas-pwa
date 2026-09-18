# Correção: o app "travava" no celular

> Relato: **"o aplicativo simplesmente travou no celular"**.
> Documento da investigação e das correções, etapa por etapa — em **duas rodadas**:
> 1. **vazamento do poll do teclado** (seções 1–9);
> 2. **robustez para notas grandes** (seção 10) — a causa confirmada do travamento
>    no aparelho ("em aba anônima, sem dados, abre normal").
> Arquivos alterados: `app.js`, `notes/editor.js`, `sw.js`, `tests/toolbar_pwa.cjs`.

---

## 1. Sintoma

No celular, depois de usar o editor, a interface ficava **presa/travada**: a barra
de ferramentas continuava a se reposicionar sozinha, o app ficava pesado e o gasto
de bateria subia, mesmo com o teclado fechado e o editor sem foco.

O problema apareceu depois do commit `18d9edd` ("Corrige a barra que nao ficava
colada acima do teclado no celular"), que passou a manter a barra acima do teclado
virtual com **um `setInterval` de 250 ms**.

---

## 2. Causa raiz

O commit `18d9edd` adicionou, em `NotesPWA#ativarToolbarTeclado`, um poll de 250 ms
que só era interrompido quando o `focusout` chegava com **`target` = `#notesEditor`**:

```js
// ANTES (trecho com o defeito)
editor?.addEventListener('focusin', () => {
    [0, 80, 180, 320, 520, 800].forEach(atraso => setTimeout(atualizar, atraso));
    clearInterval(this.notesToolbarTecladoPoll);
    this.notesToolbarTecladoPoll = setInterval(atualizar, 250); // poll "infinito"
});
document.addEventListener('focusout', event => {
    // ❌ só para o poll quando o PRÓPRIO editor perde o foco
    if (event.target && event.target.id === 'notesEditor') {
        clearInterval(this.notesToolbarTecladoPoll);
        this.notesToolbarTecladoPoll = null;
        atualizar();
    }
});
```

Defeitos encontrados:

1. **Vazamento do poll.** Quando o foco estava num **filho** do editor (um checkbox,
   um link, um botão dentro da nota) e o usuário tocava **fora** do editor, o
   `focusout` chega com `target` = esse filho — **não** `#notesEditor`. A condição
   dava `false`, o `setInterval` **nunca era interrompido** e continuava rodando a
   cada 250 ms indefinidamente.
2. **Reflow forçado a cada tick.** `aplicarToolbarTeclado()` sempre reaplicava as
   variáveis CSS do dock e media o layout
   (`getBoundingClientRect()` / `toolbar.offsetHeight` / `editor.style.paddingBottom`),
   mesmo quando nada havia mudado. Com o poll "solto", isso virava um **reflow
   contínuo** — o que trava/engasga a interface em celulares mais modestos.
3. **Reajustes agendados sem limpeza.** Os seis `setTimeout` disparados em cada
   `focusin` nunca eram cancelados.

---

## 3. Como o bug foi reproduzido (etapa por etapa)

O defeito foi confirmado com **Playwright/Edge** (mesmo runner da suíte), fazendo o
boot **real** do app (`new NotesPWA()` → `init`) em **viewport de celular
(390×700, `hasTouch`)** e instrumentando as chamadas internas.

1. **Boot instrumentado.** Envolvi `NotesPWA.prototype.aplicarToolbarTeclado` e
   `aplicarOrdemToolbar` para contar chamadas e usei `PerformanceObserver`
   (`longtask`) para medir travadas de thread principal.
2. **Ligar o poll.** Disparei `focusin` no `#notesEditor`: em **2 s** o método foi
   chamado **15 vezes** (6 `setTimeout` imediatos + ~8 ticks de 250 ms) — o poll
   estava de fato rodando.
3. **Fazer o foco sair vindo de um filho.** Com o foco num elemento **dentro** da
   nota, movi o foco para **fora** do editor e disparei o `focusout` do filho:

   | app | `notesToolbarTecladoPoll` após o foco sair |
   | --- | --- |
   | **antigo (HEAD)** | `true` → **vazando** (rodava para sempre) |
   | **novo (corrigido)** | `false`, `notesToolbarTecladoTimeouts = 0` → **parado** |

4. **Descartei outras hipóteses.** Também testei o ping-pong entre o
   `ResizeObserver` do overflow (`notes/extras.js`) e o `MutationObserver` da ordem
   da barra (`app.js`): ele fica **limitado** (não é loop infinito). O gargalo real
   era o poll do teclado.

---

## 4. O que foi feito (etapas da correção)

### 4.1 Estado novo no construtor (`app.js`)

```js
this.notesToolbarTecladoPoll = null;
this.notesToolbarTecladoTimeouts = [];   // reajustes agendados (setTimeout)
this.notesToolbarTecladoAplicado = null; // memo do último dock aplicado
```

### 4.2 `ativarToolbarTeclado()` reescrito

* **`pararAjustes()`** — ponto único de parada: cancela o `setInterval`, cancela
  **todos** os `setTimeout` agendados e limpa o memo do dock.
* **`atualizar()` com autoproteção** — a cada tick, se o poll ainda existe mas o
  foco **saiu** do editor (`document.activeElement` fora de `#notesEditor`), ele se
  encerra sozinho. É uma rede de segurança independente dos eventos.
* **`reagirAoFoco()`** — sempre chama `pararAjustes()` antes de reagendar, para
  **não acumular** timeouts a cada `focusin`.
* **`focusout` robusto** — dispara quando o alvo está **dentro** do editor
  (`editor.contains(event.target)`) e, no tick seguinte, confirma se o foco
  realmente saiu. Assim o caso do checkbox/link (alvo = filho) é tratado.
* **`visibilitychange`** — ao ocultar a aba/app, **para** tudo; ao voltar, retoma o
  poll apenas se o editor ainda tiver foco.
* **`pagehide`** — para tudo (evita trabalho pendente ao sair).

```js
const pararAjustes = () => {
    clearInterval(this.notesToolbarTecladoPoll);
    this.notesToolbarTecladoPoll = null;
    (this.notesToolbarTecladoTimeouts || []).forEach(clearTimeout);
    this.notesToolbarTecladoTimeouts = [];
    this.notesToolbarTecladoAplicado = null;
};
const atualizar = () => {
    if (this.notesToolbarTecladoPoll && !temFocoNoEditor()) pararAjustes();
    this.aplicarToolbarTeclado();
};
const reagirAoFoco = () => {
    pararAjustes();
    this.notesToolbarTecladoTimeouts = [0, 80, 180, 320, 520, 800].map(atraso => setTimeout(atualizar, atraso));
    this.notesToolbarTecladoPoll = setInterval(atualizar, 250);
};
// ...
document.addEventListener('focusout', event => {
    const editor = editorDeNotas();
    if (!editor || !editor.contains(event.target)) return;
    setTimeout(() => {                       // o foco pode só trocar dentro do editor
        if (!temFocoNoEditor()) { pararAjustes(); atualizar(); }
    }, 0);
});
```

### 4.3 `aplicarToolbarTeclado()` com memoização

Antes de mexer no DOM, monta uma **chave** com o estado do dock
(`teclado | inset | layout | left | width do modal`) e **não reaplica** quando nada
mudou. Isso elimina o reflow desnecessário a cada tick enquanto o teclado está
aberto e estável:

```js
const chave = [teclado, inset, Math.round(layout), Math.round(caixa.left), Math.round(caixa.width)].join('|');
if (estaDockada && chave === this.notesToolbarTecladoAplicado) return;
this.notesToolbarTecladoAplicado = chave;
```

### 4.4 `sw.js`

`CACHE_NAME` de `notas-pwa-v7` → **`notas-pwa-v8`**, para o celular não continuar
servindo o `app.js` antigo do cache do Service Worker (convenção do projeto: o
commit anterior também subiu a versão ao corrigir a barra).

---

## 5. Teste de regressão

Em `tests/toolbar_pwa.cjs` foi adicionado o caso **3b**, que trava exatamente o
vazamento: coloca o foco num elemento **dentro** da nota, move o foco para **fora**
do editor a partir desse filho e exige que o poll e os reajustes parem:

```js
assert.ok((await estadoPoll()).poll, 'poll ligado com o foco dentro da nota');
// ...
document.getElementById('focoForaDaNota').focus();
document.getElementById('focoNaNota').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
// ...
assert.deepEqual(await estadoPoll(), { poll: false, timeouts: 0 },
  'poll e reajustes parados quando o foco sai da nota (veio de um filho)');
```

O caso **3** (dock acima do teclado) também passou a **parar o poll** antes de
forçar o `inset` simulado — antes ele só passava por sorte de tempo (o tick de
250 ms desfazia o dock e o teste podia falhar de forma intermitente).

---

## 6. Validação

```bash
node --check app.js                 # sintaxe OK
node --check sw.js                  # sintaxe OK
node tests/toolbar_pwa.cjs          # OK (rodado 3x)
npm test                            # suíte completa: 27 passam / 12 falham / 1 n/a
```

* **Prova antes/depois** (mesmo cenário de diagnóstico, app antigo vs. novo):

  | app | poll após o foco sair (veio de um filho) |
  | --- | --- |
  | antigo (`HEAD`) | `true` (vazando) |
  | corrigido | `false`, `timeouts: 0` |

* **Suíte sem regressão.** O resultado (**27 passam / 12 falham / 1 n/a**) é
  **idêntico ao baseline** já registrado em `docs/relatorio-testes.json`. As 12
  falhas são **pré-existentes** e não têm relação com esta correção (são testes do
  motor de notas, que nem passa pelo código do teclado):

  `notes_cascade_defaults`, `notes_checklist_numbers`, `notes_checklist_order`,
  `notes_collapse_motion`, `notes_enter_child`, `notes_extras`, `notes_markdown`,
  `notes_navigation_completion`, `notes_outline_code`, `notes_paste_blocks`,
  `notes_regression_audit`, `test_notes_editor_ui`.

---

## 7. Como validar manualmente no celular

1. Publique/reinstale a versão (o `sw.js` em `v8` força o app a buscar o `app.js`
   novo; se necessário, feche a aba/PWA e abra de novo).
2. Abra o editor e toque no campo (o teclado virtual abre e a barra sobe).
3. Toque **fora** do editor (ou num checkbox e depois fora) para fechar o teclado.
4. Verifique que:
   * a barra volta ao lugar (sem ficar "pulando");
   * o app continua respondendo normalmente ao toque;
   * o uso de CPU se estabiliza (no Chrome remoto, aba *Performance*, não há mais
     atividade a cada 250 ms).

---

## 8. Observações e limitações

* Esta correção ataca o **re-render contínuo** que fazia a interface travar/engasgar
  no celular. O vazamento do poll foi **reproduzido e comprovado** com e sem a
  correção.
* Não foi reproduzido um "congelamento" absoluto (tela parada sem resposta). Se o
  app ainda travar em algum aparelho após esta versão, o mais útil é capturar os
  **erros do console** do celular (ex.: Chrome/Edge remoto) e o momento exato —
  assim é possível investigar se é um caso distinto (CSS pesado, arquivo grande,
  imagem/PDF etc.).
* O teste `tests/toolbar_pwa.cjs` usa um `inset` simulado porque o navegador
  headless não tem teclado virtual real; por isso ele para o poll antes de medir o
  dock (mede o cálculo, não o teclado).

## 9. Referências

* Commit que introduziu o poll: `18d9edd` — "Corrige a barra que nao ficava colada
  acima do teclado no celular".
* Código: `app.js` (`NotesPWA#ativarToolbarTeclado`, `NotesPWA#aplicarToolbarTeclado`).
* Teste: `tests/toolbar_pwa.cjs` (casos 3 e 3b).
* Relatórios gerados: `docs/RELATORIO-TESTES.md`, `docs/relatorio-testes.json`.

---

## 10. Segunda rodada — robustez para notas grandes (causa confirmada)

### 10.1 Confirmação do usuário

> "Acho que é a nota ficando pesada; **em modo anônimo (sem dados) carregou normal**."

Isso fecha o diagnóstico: o problema **está no dado** (a nota crescendo), não no
aparelho. O aviso **"UI do sistema não está respondendo" ao abrir** acontece porque a
thread principal fica bloqueada tempo demais montando a nota.

### 10.2 Medições (boot real, viewport de celular 390×700)

| Cenário | Boot |
| --- | --- |
| 300 linhas | ~0,5 s |
| 1000 linhas | ~1,2 s |
| 3000 linhas | ~2,4 s |
| 100 notas × 20 linhas | ~0,14 s |
| 300 notas × 20 linhas | ~0,22 s |

Perfil de **uma abertura** (2000 linhas ≈ 295 KB de HTML):

| Operação | Antes | Depois |
| --- | --- | --- |
| `resetNotesHistory` (serializa o documento em JSON) | ~582 ms | **0 ms no caminho crítico** (adiado) |
| `refreshNotesCollapseControls` (monta a UI) | ~171–274 ms | igual (necessário) |
| `getCleanNotesHtml` | ~168–240 ms | igual |
| **Abertura total** | **~0,9–1,1 s** | **~0,75 s** |

O maior custo era o histórico: cada `resetNotesHistory` serializa o documento inteiro
em JSON (O(n)) e era chamado **duas vezes** na abertura.

### 10.3 O que mudou

* `app.js openNotesModal`: **removeu o `resetNotesHistory()` duplicado** — o motor já
  reinicia o histórico em `beginNotesSession`.
* `app.js openNotesModal`: em vez de `salvarNotasLocais()` (que reescrevia a **lista
  inteira** de notas, com anexos em base64, a cada abertura), grava **só o id da nota
  ativa** (`marcarNotaAtiva`).
* `app.js apiCall`: usa a lista em memória (`projectsData`) em vez de fazer
  `JSON.parse` de todas as notas a cada salvamento.
* `notes/editor.js resetNotesHistory`: para **notas grandes** (HTML ≥ 120 KB, marcado
  por `notesHistoricoAdiado`), o snapshot inicial é **adiado** (~350 ms), fora do
  caminho crítico. O baseline continua correto: é capturado **antes da primeira
  edição**, no `beforeinput` (`if(!this.notesHistory)this.resetNotesHistory()`).
* `app.js updateNotesHistoryButtons`: seguro quando ainda não há snapshot (evita erro
  enquanto o histórico está adiado).

### 10.4 Resultado

* A abertura de uma nota grande **não faz mais um bloqueio longo antes de pintar**.
* Desfazer/refazer continuam funcionando (`notes_parent_undo`, `notes_million`,
  `notes_million_extras`, `notes_large_document` passam).
* Suíte completa: **27 passam / 12 falham / 1 n/a** — **idêntico ao baseline** (as 12
  falhas são pré-existentes).
* `sw.js` foi para **v9** para o celular buscar a versão nova.

### 10.5 Se ainda estiver pesado

O custo restante é proporcional ao tamanho da nota (`refreshNotesCollapseControls` +
`getCleanNotesHtml` + parse do HTML). Para notas **muito** grandes, o próximo passo é
um **"modo nota grande"**: montar os controles aos poucos e/ou oferecer dividir a
nota. Hoje o limite confortável fica na casa de **milhares de linhas**.

---

## 11. Terceira rodada — página em branco ao carregar (Service Worker)

### 11.1 Sintoma

> "Agora o erro mudou: não aparece mais a tela da nota travada; a trava está no
> carregamento — **não finaliza o carregamento e a página fica em branco**."

### 11.2 Causa

O HTML estático apareceria mesmo com erro de JavaScript, então **não era o app**: era
a camada de carregamento. O `sw.js` usava **"Network First" com `fetch` sem timeout**.
Se a rede **pendura** (nem falha nem responde), a requisição **nunca resolve** — e como
o `styles.css` bloqueia a pintura, a página fica **branca carregando para sempre**. O
mesmo valia para a navegação (`index.html`).

Isso só ficou visível agora porque o *bump* de cache (`v8 → v9`) fez o Service Worker
se atualizar e rebaixar os assets, expondo exatamente esse caminho.

### 11.3 Correção (`sw.js` → v10)

* **Cache primeiro (offline-first)**: tudo que já está no cache é servido **imediatamente**;
  a rede é consultada em segundo plano (stale-while-revalidate).
* **Rede sempre com timeout** (3 s, via `AbortController`): nunca mais fica pendurada.
* **Navegação sem cache**: usa o `index.html` guardado ou um **HTML mínimo** — em
  nenhum caso a página fica em branco esperando.
* **Instalação tolerante** (`Promise.allSettled`): um asset que falhe (rede instável)
  não impede o Service Worker de instalar.

### 11.4 Validação

Teste automatizado com servidor local: registra o Service Worker, deixa o navegador
**offline** e recarrega a página.

```
online:  {"titulo":"Notas","editor":true,"controlado":true}
OFFLINE carregou em 240ms: {"titulo":"Notas","editor":true,"estiloAplicado":"6px"}
erros de pagina: []
```

### 11.5 Recuperação no celular (enquanto a versão antiga está instalada)

1. Abra o app **com internet** (Wi‑Fi/dados) — com rede boa, o Service Worker antigo
   consegue completar a requisição e a página carrega.
2. **Recarregue uma ou duas vezes**: nesse carregamento o `sw.js` novo (v10) é
   detectado, instalado e assume (`skipWaiting`/`clients.claim`).
3. A partir daí o app abre **na hora** e **offline**, sem tela branca.

### 11.6 Correção extra (v11) — cache incompleto deixava o app "à meio"

Sintoma: *"a tela da nota fica mais recuada, aparecendo de forma travada"*.

Na v10 a instalação ficou **tolerante** (`Promise.allSettled`): se um asset falhasse
ao baixar (rede móvel instável), ele ficava **fora do cache**. Com *cache-first*, o
app era então servido **sem o `app.js`** — o JavaScript não rodava, o modal **não
recebia a classe `active`** e aparecia **recuado/parado** (o sintoma relatado).

Agora a instalação **só conclui se todos os assets essenciais estiverem no cache**
(até 3 tentativas cada). Se algum falhar, o cache é descartado e a instalação falha,
mantendo a versão anterior funcionando em vez de servir um app quebrado.

Validação (servidor local, offline):

```
cache: {"cache":"notas-pwa-v11","itens":14}
OFFLINE carregou em 198ms: {"titulo":"Notas","editor":true,"modalAtivo":true,"barraVisivel":true}
erros de pagina: []
```

### 11.7 Auto-recuperação no app (v12)

Para não depender de "limpar dados do site" (o que apagaria as notas), o `index.html`
ganhou um **watchdog de inicialização** que roda *inline* (funciona mesmo se o `app.js`
não carregar):

* Se o app **não ficar pronto em 6 s** ou ocorrer **erro de carregamento** (script/CSS),
  aparece um aviso: **"O aplicativo não iniciou"** + a mensagem do erro.
* O botão **"Reparar e recarregar"** desregistra o Service Worker, apaga os *caches* e
  recarrega com `?v=<timestamp>` — **sem tocar no LocalStorage** (as notas continuam lá).
* Quando o app inicia normalmente, o `app.js` marca `window.__notasPronto = true` e o
  aviso **nunca aparece**.

Validação (servidor local):

```
(a) normal: {"pronto":true,"guardEscondido":true}
(b) falha : {"guardVisivel":true,"erro":"Erro ao carregar recurso"}
(c) reparar -> url: ?v=1789757006505
```

> **Diagnóstico importante:** abrindo o site publicado num cliente novo, o app carrega
> 100% (`modalAtivo: true`, editor com conteúdo, 25 botões, zero erros). Ou seja, o
> problema relatado é **estado antigo no aparelho** (Service Worker/cache), não o código.

### 11.8 Página de reparo `reparar.html` (v13)

Sintoma: *"tanto navegador como PWA ficam em tela branca; no navegador a barrinha tenta
carregar mas não finaliza"*.

Ciclo vicioso: o Service Worker antigo prende as requisições, e qualquer recuperação
"dentro do app" depende de carregar a página — que é justamente o que trava.

Solução: uma página **independente** `reparar.html` (sem `app.js`, sem CSS do app e sem
depender do Service Worker) que:

1. **desregistra os Service Workers** da origem;
2. **apaga os caches** do app;
3. volta para o app (`./?reparado=<timestamp>`).

Como ela **não está no cache** do Service Worker, carrega mesmo com o app quebrado. As
**notas não são apagadas** (ficam no LocalStorage, que não é tocado).

Além disso, a instalação do Service Worker passou a usar `fetch` **com timeout** +
`cache.put` (não trava quando a rede está lenta).

Validação (servidor local):

```
antes:            {"caches":1,"sw":1}
durante o reparo: {"caches":0,"sw":0,"estado":"Pronto! O app vai abrir do zero (sem cache antigo)."}
app apos reparo:  {"titulo":"Notas","modalAtivo":true,"appPronto":true}
```

> **Como usar no celular:** abrir `.../notas-pwa/reparar.html` com internet.

---

## 12. Barra de status na cor padrão de cada modo

Pedido: *"altere a cor da barra de status para que fique na cor padrão de cada modo"*.

Medição das cores reais do app:

| modo | fundo da página | header | superfície principal |
| --- | --- | --- | --- |
| claro | `#F8FAFC` | `#FFFFFF` | footer `rgba(255,255,255,.88)` |
| escuro | `#F8FAFC` | `#FFFFFF` | modal `#11161D` / footer `#151B23` |

Antes o `theme-color` era `#000000` (escuro) e `#F5F5F7` (claro) — não casava com cada
modo. Agora a cor vem de um **token de CSS** (`--app-status-bar`), então muda no CSS e
vale para o JS:

* `styles.css` → `:root { --app-status-bar: #F8FAFC; }` e
  `html[data-theme="dark"] { --app-status-bar: #11161D; }`
* `app.js` (`ThemeManager.applyTheme`) lê o token e atualiza o
  `<meta name="theme-color">` ao trocar de tema.
* `index.html` (script inline, antes do paint) já define o `theme-color` correto para
  não piscar a cor errada ao abrir.
* `manifest.json` (`theme_color`/`background_color`) alinhado a `#F8FAFC`.
* `sw.js` → v14.

Validação (viewport de celular):

```
light: metaThemeColor "#F8FAFC"
dark : metaThemeColor "#11161D"
light: metaThemeColor "#F8FAFC"
```

> Para mudar a cor depois, basta editar `--app-status-bar` em `styles.css`.
