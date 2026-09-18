# Correção: travamento na modal "Editar barra de ferramentas"

> Relato: **ao clicar no botão com a seta apontando para a esquerda** (ao lado de um
> dos títulos da modal "Editar barra de ferramentas") o app travava — "trava tudo,
> simplesmente fico sem conseguir mexer em nada". Também travou ao **sair da página e
> voltar** ("ficou tão lento que travou") e ao **maximizar o navegador**, chegando a
> exigir reinício da máquina.
> Arquivos alterados: `app.js`, `styles.css`, `notes/extras.js`, `notes/extras.css`,
> `index.html`, `sw.js`, `tests/toolbar_pwa.cjs`.

---

## 1. Sintoma

Na modal **Editar barra de ferramentas**, o clique na seta (principalmente a da
**esquerda**) deixava a interface sem resposta. Reproduzia no PC e no celular, com
piora depois de trocar de aba/voltar e de maximizar a janela.

## 2. O que foi medido (app real, Playwright/Edge)

| Cenário | Resultado |
| --- | --- |
| Clique em qualquer seta (mouse ou toque) | o botão clicado era **destruído**; `document.activeElement` ia para `<body>` com a modal aberta |
| Custo por clique, CPU 20x (celular modesto) | **1 long task de 439 ms**, com `aplicarOrdemToolbar` chamado 2x |
| Rajada de 15 toques, CPU 20x | **8,4 s** |
| Boot com a nova ordenação agendada em rAF | **37 reordenações em 1,2 s** (cascata com o `ResizeObserver` do motor) |
| Nota de 150 mil caracteres | clique = 318 ms, 2 long tasks (205 ms máx.) |

## 3. Causa raiz

1. **A lista do diálogo era recriada a cada movimento.** `desenhar()` usava
   `lista.replaceChildren()` e refazia as 28 linhas. O botão que recebeu o clique era
   removido do DOM e o foco caía em `<body>` — que está **inert** porque o diálogo é
   `showModal()`. É isso que "solta" a interação (e era igual nas duas setas).
2. **As setas eram os únicos botões sem `pointerdown/mousedown preventDefault`**
   (o motor usa esse padrão em `notes/extras.js` e o próprio botão de editar em
   `app.js`), então o clique ainda roubava o foco antes de perdê-lo.
3. **Cascata de reordenação.** Cada movimento reordenava os ~28 botões e o
   `MutationObserver` da barra reagia às próprias mutações, refazendo tudo de novo.
4. **Trabalho contínuo de layout/composição.** O diálogo era reposicionado a cada
   mudança de tamanho (`ResizeObserver` + `position()`) forçando layout do documento
   inteiro, e usava `backdrop-filter: blur(22px)` sobre a nota — caro ao maximizar.

## 4. Correção

### 4.1 Os botões de seta foram **substituídos por arrastar-e-soltar**

- Cada linha tem uma **alça** e o nome do botão; arrastar a alça reordena ao vivo e,
  ao soltar, a ordem é salva e aplicada na barra.
- **Pointer Events** (`pointerdown` na alça + `pointermove`/`pointerup`/`pointercancel`
  no `document`), o mesmo padrão de `notes/tables.js`. **Não** foi usado o HTML5
  drag-and-drop porque `draggable`/`dragstart`/`drop` **não disparam em telas de
  toque** — no celular o arraste simplesmente não funcionaria.
- `touch-action: none` **apenas na alça**: o gesto não briga com a rolagem da lista.
- Auto-rolagem perto das bordas e `pointercancel` devolve a ordem anterior.
- **Fallback de teclado:** com a linha focada, `ArrowUp`/`ArrowDown` movem o item, o
  foco acompanha a linha e um `aria-live` anuncia a nova posição.

### 4.2 Fim da destruição de elementos

As linhas são criadas **uma vez** e reutilizadas (`Map` elemento -> linha). A
reposição só acontece quando a linha está fora do lugar — mover um elemento que já
está na posição faz o navegador **perder o foco** dele.

### 4.3 Trava de reentrância e freio anti-cascata

`aplicarOrdemToolbar` ignora as próprias mutações (observer desconectado durante a
aplicação) e voltou a aplicar de forma **síncrona**: agendar em `requestAnimationFrame`
ficava alternando com o `ResizeObserver` do motor (uma reordenação por frame no boot).
Há um freio de emergência que apenas ignora o passe, **sem desligar** o observer.
Quando a diferença é só um botão, ele move **um único nó** em vez de reordenar os 28.

### 4.4 Menos trabalho de layout/composição

`position()` do diálogo foi coalescido em um frame e o `backdrop-filter` do diálogo foi
removido (fundo quase opaco). Os vidros do tema (header/card/nav) continuam intactos.

### 4.5 Meta tag e cache

- `index.html`: incluída `<meta name="mobile-web-app-capable" content="yes">`
  (a `apple-mobile-web-app-capable` foi **mantida** para iOS antigo).
- `sw.js`: cache `notas-pwa-v15` -> `notas-pwa-v16`.

## 5. Verificação

`tests/toolbar_pwa.cjs` foi reescrito/ampliado e passa:

- arraste com **mouse** reordena, salva e aplica no DOM;
- arraste por **toque** (CDP `Input.dispatchTouchEvent`) reordena e salva;
- **teclado** (`ArrowUp`/`ArrowDown`) reordena e o foco continua na modal;
- **não existem mais** botões de seta na modal;
- **sem cascata**: a reordenação para no repouso, depois do arraste e depois do resize;
- linhas **reutilizadas** (a contagem não muda) e foco preservado.

Paridade visual (`parity_visual.cjs`) e vidro do tema (`tema_vidro.cjs`) seguem OK.
As falhas de `notes_extras.cjs` e `test_notes_editor_ui.cjs` são **pré-existentes**
(idênticas no relatório anterior).

---

## 6. Cores da modal no modo escuro

Relato: **"deixe a modal com cor ajustada de acordo com o modo"**.

### O que foi medido (estilos computados)

| Elemento | Claro | Escuro ANTES | Escuro DEPOIS |
| --- | --- | --- | --- |
| Diálogo | branco | **branco** (errado) | `#11161D` |
| Texto do diálogo | `#0F172A` | `#0F172A` (escuro) | `#CBD5E1` |
| Linha | branco | `#11161D` com texto escuro (**ilegível**) | `#151B23` com texto claro |
| "Restaurar padrão" | texto escuro | texto claro sobre fundo claro | texto claro sobre fundo escuro |
| Alça / aviso | `#64748B` | `#94A3B8` | mantido |

### Causa

Os tokens `--color-bg-container` e `--color-text-main` **só existem no modo claro**
(o escuro do app é feito por regras por componente). A modal usava esses tokens — então
ficava sempre clara por fora — mas tinha regras `html[data-theme="dark"]` apenas para a
**linha** e para o **botão**, o que a deixava clara por fora e escura por dentro, com o
texto escuro em cima do fundo escuro.

### Correção

- `notes/extras.css`: novo bloco `html[data-theme="dark"] .notes-extra-dialog` — fundo, texto,
borda, `h3`, `label`, `input`, `select`, botões (exceto o de envio) e `::backdrop`. Vale para
**todos** os diálogos do motor (link, tabela, modelos, vídeo...), não só o da toolbar.
- `styles.css`: a linha do editor de toolbar no escuro passou a `#151B23` (um degrau acima do
fundo do diálogo, para a linha continuar destacada).
- `sw.js` → **v17** (para o CSS novo instalar de forma limpa em quem já tinha o v16).

### Verificação

Estilos computados conferidos nos dois modos; `tema_vidro.cjs` **OK**,
`parity_visual.cjs` **OK** (0 divergências reais) e `toolbar_pwa.cjs` **OK**.

### 6.1 Toque longo no celular (menu "pesquisar")

No Android, manter o dedo na alça abria o menu do sistema (pesquisar/selecionar), o que
interrompia o arraste. Correção: `user-select: none` + `-webkit-touch-callout: none` no
diálogo e na alça, `pointer-events: none` no SVG da alça (o alvo do toque passa a ser o
próprio `span`, e não a "imagem") e `contextmenu` cancelado na linha.

Verificado no navegador: `userSelect` = `none` (linha e alça), `touchAction` = `none`,
SVG com `pointer-events: none`, `draggable` = false e `contextmenu` com `defaultPrevented`
= true tanto na linha quanto na alça. `sw.js` -> **v18**.

---

## 7. Deploy e Service Worker (fallback de SPA)

Relato: o host publica com **fallback de SPA** (rota desconhecida -> `index.html` com 200),
entao o `sw.js` podia ser respondido como `text/html`. O navegador **rejeita em silencio** um
Service Worker que nao e JavaScript, e o PWA nunca mais atualiza no cliente.

Medicao no deploy: rota inexistente -> `HTTP 200 text/html`; `/sw.js` -> `application/javascript`
(somente porque o arquivo existe e vence o fallback — fragil).

### Correcoes

- `_redirects` (novo): `/sw.js` e `/manifest.json` servidos como arquivos estaticos **antes** de
  qualquer catch-all para o `index.html`.
- `_headers`: `/sw.js` com `Content-Type: application/javascript; charset=utf-8`,
  `Cache-Control: no-cache` e `Service-Worker-Allowed: /` (escopo da raiz); `manifest.json` idem.
- `index.html`: registro com `new URL("sw.js", document.baseURI)` (caminho real do arquivo),
  `{ scope: "./", updateViaCache: "none" }` (ignora o cache HTTP do sw.js), `registration.update()`
  ao carregar e ao voltar para a aba, `controllerchange` -> uma recarga unica, e checagem de
  `Content-Type` que **avisa** (via bootGuard) em vez de falhar em silencio.
- `sw.js`: `self.skipWaiting()` no `install` e `self.clients.claim()` no `activate` ficam
  explicitos com comentario; cache -> **v19**.
- `tests/pwa_service_worker.cjs` (novo): sobe um servidor real com fallback de SPA e valida o
  MIME do `sw.js`, `skipWaiting`/`clients.claim`, `updateViaCache`, registro ativo e o app iniciando.

> Se o fallback estiver configurado fora do repositorio (netlify.toml, nginx, Workers), replique
> a exclusao de `/sw.js` e `/manifest.json` la. Em nginx, por exemplo, coloque
> `location = /sw.js { try_files $uri =404; }` **antes** de `location / { try_files $uri /index.html; }`.

### 7.1 Deploy estava desatualizado

Durante a investigacao, `notas-pwa.pages.dev` passou a servir um build **antigo**
(`app.js` de 50.629 bytes, contendo `textContent = \u2039seta\u203a` e sem `app-toolbar-editor-grip`),
enquanto `origin/main` ja estava em `1ea0a1b`. Ou seja: o que aparecia no celular tambem era
**deploy antigo**, nao apenas cache do aparelho. Confira em Cloudflare -> Deployments qual commit
esta em Production (deve ser o HEAD do `main`) e refaca o deploy.
