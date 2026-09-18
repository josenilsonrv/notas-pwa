# Correção: o app "travava" no celular (poll do teclado)

> Relato: **"o aplicativo simplesmente travou no celular"**.
> Documento da investigação e da correção, etapa por etapa.
> Arquivos alterados: `app.js`, `sw.js`, `tests/toolbar_pwa.cjs`.

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
