# Prompt — implementar o MODO CLARO com efeitos de vidro (réplica do projeto original)

> Documento pronto para ser entregue a um agente de código (Cline e similares).
> Descreve **exatamente** o que o tema claro do `produtividade-ferrramenta` faz e como
> aplicá-lo neste PWA sem quebrar a paridade já conquistada.

---

## 0. Contexto que o agente precisa ter

- Este projeto (`notas-pwa`) é uma **réplica** do editor de notas do projeto
  `produtividade-ferrramenta` (ex.: `C:/Users/Usuario/OneDrive/Desktop/produtividade-ferrramenta`).
- O motor de notas já é **byte a byte idêntico** ao original:
  `notes/editor.js`, `notes/extras.js`, `notes/tables.js`, `notes/table-math.js`,
  `notes/editor.css`, `notes/extras.css`, `notes/tables.css`.
- Próprios do PWA: `index.html`, `styles.css`, `theme-origem.css`, `app.js`, `sw.js`.
- **Ordem de carregamento do CSS (não alterar!)** — é a mesma do original:
  1. `styles.css` (base do PWA: preflight, reset, utilitários)
  2. `theme-origem.css` (extraído do CSS **compilado** do original: tokens + regras do modal)
  3. `notes/editor.css` → `notes/extras.css` → `notes/tables.css`
- A "verdade" visual é o **CSS compilado** do original (`frontend/styles.css`), não o
  `tailwind.config.js` (que está defasado). As regras de vidro estão nesse compilado.
- **Não edite `theme-origem.css` à mão**: é gerado por `node tools/extrair-tema.cjs`
  (fonte: `frontend/styles.css`). Correções vão em `styles.css` ou no gerador.
- Existe uma suíte que compara os **estilos computados** dos dois projetos. Toda alteração
  de estilo precisa mantê-la verde:
  ```bash
  node tests/parity_structure.cjs   # ids/ARIA/comandos/classes
  node tests/parity_visual.cjs      # estilos computados (claro + escuro) -> 0 divergências reais
  ```

---

## 1. Tokens do tema claro (valores exatos do compilado)

Aplicar em `:root` **e** em `html[data-theme="light"]` (o original usa os dois no mesmo bloco):

```css
:root, html[data-theme="light"] {
  /* superficies */
  --color-bg-global: #F8FAFC;
  --color-bg-container: #FFFFFF;
  --color-tb-page: #F8FAFC;
  --color-tb-card: #FFFFFF;
  --color-tb-hover: #F1F5F9;

  /* texto */
  --color-text-main: #0F172A;
  --color-text-muted: #64748B;
  --color-text-label: #64748B;
  --color-tb-text-primary: #0F172A;
  --color-tb-text-secondary: #64748B;
  --color-tb-text-tertiary: #64748B;

  /* bordas */
  --color-border: #E2E8F0;
  --color-border-hover: #CBD5E1;
  --color-tb-border: #E2E8F0;
  --color-tb-border-hover: #CBD5E1;

  /* acento e estados */
  --color-neon-blue: #3B82F6;
  --color-neon-green: #34C759;
  --color-neon-red: #FF3B30;
  --color-neon-orange: #FF9500;
  --color-neon-purple: #475569;
  --color-tb-accent: #0F172A;
  --color-tb-accent-light: rgba(15, 23, 42, 0.07);

  /* forma/escrita usados pelas utilitarias do modal */
  --color-white: #fff;
  --spacing: 0.25rem;
  --leading-relaxed: 1.625;
  --radius-lg: 0.5rem;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue",
               "Noto Sans", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji",
               "Segoe UI Symbol", "Noto Color Emoji";
}
```

> **Tema escuro:** o compilado do original **não redefine** estas variáveis no escuro — ele
> ajusta componentes pontuais (as regras escuras do editor vivem em `notes/editor.css`, que já
> é idêntico). Portanto **não** crie `html[data-theme="dark"] { --color-*: … }`: isso quebra a
> paridade (o teste `parity_visual` acusa).

---

## 2. Efeitos de vidro — especificação exata

### 2.1 Painéis do modal (header, toolbar, nav de contexto e rodapé)

```css
/* Aplicar SOMENTE com o modal aberto (.active no backdrop) — como no original. */
#notesModalBackdrop.active .notes-modal-header,
#notesModalBackdrop.active .notes-context-nav,
#notesModalBackdrop.active .notes-toolbar,
#notesModalBackdrop.active .notes-modal-footer {
  background: rgba(255, 255, 255, 0.88) !important;
  border-color: rgba(255, 255, 255, 0.48) !important;
  -webkit-backdrop-filter: blur(16px) saturate(108%);
  backdrop-filter: blur(16px) saturate(108%);
}
```

Estrutura base dos painéis (valores do compilado):

```css
.notes-modal-header {
  background: var(--color-tb-hover);          /* #F1F5F9 no claro */
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
}
.notes-context-nav {
  display: flex; gap: .45rem; padding: .65rem 1.25rem .15rem;
  overflow-x: auto; flex-shrink: 0;
}

/* raios e transicoes (estado janela x tela cheia x cabecalho recolhido) */
#notesModalBackdrop.active:not(.notes-fullscreen-active) .notes-modal-header { border-radius: 1.25rem 1.25rem 0 0; }
#notesModalBackdrop.active .notes-modal-header { transition: padding .28s ease, min-height .28s ease, background-color .28s ease; }
#notesModalBackdrop.notes-fullscreen-active .notes-modal-header { position: relative; border-radius: 2rem 2rem 0 0; overflow: hidden; box-shadow: none; }
#notesModalBackdrop.active.notes-header-collapsed .notes-modal-header { min-height: 2.75rem; padding-top: .4rem; padding-bottom: .4rem; }
```

### 2.2 O "card de vidro" principal (container do editor)

É onde o efeito aparece com força:

```css
.notes-editor-container {
  cursor: text;
  flex: 1;
  min-height: 0;
  margin: 1rem 1.25rem;
  padding: 1.25rem 1.4rem;
  overflow-y: auto;
  user-select: text;
  position: relative;
  isolation: isolate;

  background: rgba(245, 245, 247, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 1.5rem;
  box-shadow: 0 12px 34px rgba(29, 29, 31, 0.07), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  -webkit-backdrop-filter: blur(18px) saturate(145%);
  backdrop-filter: blur(18px) saturate(145%);
}

/* foco: a borda some e a sombra cresce (igual ao original) */
.notes-editor-container:focus-within {
  border-color: transparent;
  box-shadow: 0 14px 38px rgba(29, 29, 31, 0.1);
}

/* scrollbar fina, dentro do vidro */
.notes-editor-container::-webkit-scrollbar { width: 5px; }
.notes-editor-container::-webkit-scrollbar-track { background: transparent; }
.notes-editor-container::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
.notes-editor-container::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
.notes-editor-container { scrollbar-width: thin; scrollbar-color: #d1d5db transparent; }
```

Em **tela cheia** o card perde margem/raio/scroll próprio (o vidro permanece):

```css
#notesModalBackdrop.notes-fullscreen-active #notesModal .notes-editor-container {
  margin: 0; min-height: 0; height: auto; flex: 1 1 0; border-radius: 0; overflow: hidden;
}
```

### 2.3 Camadas decorativas de brilho (existem no original, mas estão DESLIGADAS)

O compilado define duas camadas no container — **ambas com `opacity: 0`**, e não há regra que
as ative em nenhum CSS do projeto original (verificado em `styles.css` e `src/input.css`).
Replique exatamente assim (fiéis) e, se o usuário pedir "mais vidro", ative com
`opacity: .6` a `1`:

```css
.notes-editor-container::before {
  content: ''; position: absolute; inset: 0; border-radius: inherit; z-index: 0;
  background: linear-gradient(118deg, rgba(255,255,255,.3), transparent 46%, rgba(255,255,255,.12));
  opacity: 0;              /* <<< original: 0 (desligada) */
  pointer-events: none;
}
.notes-editor-container::after {
  content: ''; position: absolute; z-index: 0;
  width: 4.6rem; height: 8.5rem; left: .8rem; top: -.6rem;
  border-top: .48rem solid rgba(255,255,255,.5);
  border-left: .42rem solid rgba(255,255,255,.34);
  border-radius: 55% 45% 60% 40%;
  filter: blur(4px); opacity: 0; transform: rotate(38deg); pointer-events: none;
}
```

### 2.4 Vidro do painel de contexto (vem do `editor.css`, já idêntico ao original)

```css
html #notesModalBackdrop.active #notesModal #notesContextNav {
  position: relative; isolation: isolate; margin: 0; padding: 12px 18px; border: 0 !important;
  border-radius: 0;
  background: rgba(245, 245, 247, .72) !important;
  -webkit-backdrop-filter: blur(18px) saturate(145%);
  backdrop-filter: blur(18px) saturate(145%);
}
html #notesModal #notesContextNav::before {
  content: ""; position: absolute; inset: 8px 14px;
  border: 1px solid var(--color-border, #dce3ed); border-radius: 12px;
  background: var(--notes-popup-background, #eeefef); pointer-events: none; z-index: -1;
}
```

### 2.5 A "janela" onde o vidro vive

```html
<div class="modal notes-modal w-[90%] max-w-[600px] h-[70vh] max-h-[70vh] overflow-hidden bg-white
            rounded-[20px] shadow-[0_12px_32px_rgba(0,0,0,0.12)] transition-transform duration-300
            flex flex-col p-0 select-text" id="notesModal" role="region" aria-labelledby="notesModalTitle">
```
Estas utilitárias precisam existir em `styles.css` (com os tokens da seção 1):
`.bg-white` (`var(--color-white)`), `.w-\[90\%\]`, `.max-w-\[600px\]`, `.h-\[70vh\]`,
`.max-h-\[70vh\]`, `.rounded-\[20px\]`, `.shadow-\[0_12px_32px_rgba\(0\,0\,0\,0\.12\)\]`,
`.max-h-full`, `.overflow-hidden`, `.p-0`, `.select-text`.

> **Requisitos que fazem o vidro funcionar** (armadilhas conhecidas):
> 1. `backdrop-filter` só surte efeito se houver **conteúdo por baixo** — por isso o
>    backdrop (`#notesModalBackdrop`) tem fundo próprio e o card é translúcido.
> 2. O `#notesModalBackdrop` **precisa** ter a classe `active`; as regras 2.1 usam
>    `#notesModalBackdrop.active …` (sem isso o vidro não aplica).
> 3. **Preflight** obrigatório em `styles.css` (senão os botões herdam Arial/13.33px do
>    navegador e a comparação falha):
>    `*, ::before, ::after, ::backdrop { box-sizing: border-box; border: 0 solid; margin: 0; padding: 0; }`
>    e `button, input, optgroup, select, textarea { font: inherit; color: inherit; letter-spacing: inherit; background: transparent; }`.
> 4. **Não** colocar as regras de vidro dentro de `@layer` — o Tailwind v4 envolve utilitários
>    em layers e isso faz a regra **perder prioridade** contra o CSS fora de layer
>    (foi exatamente o bug que a paridade acusou: `.toolbar-btn` 36px em vez de 38px).
> 5. Não definir `width`/`height` fixos em `.toolbar-btn` no PWA: no compilado ela usa
>    `min-width/min-height: 32px` + `padding: .5rem` (a largura resulta ~38px).

---

## 3. Procedimento de implementação (passo a passo)

1. **Tokens** — confirme que `:root`/`html[data-theme="light"]` contém os valores da seção 1
   (no PWA eles vêm do `theme-origem.css`). Se algo faltar, rode:
   `node tools/extrair-tema.cjs` (regenera a partir do compilado do original).
2. **Preflight** — garanta o bloco da seção 2.5, item 3, em `styles.css` (antes dos utilitários).
3. **Regras de vidro** — as regras 2.1/2.2/2.4 já chegam pelo `theme-origem.css`; o que for
   específico do PWA deve entrar em `styles.css` **sem** `@layer` e **sem** `!important`
   desnecessário (o original usa `!important` só nos painéis e no nav).
4. **HTML** — confirme em `index.html`:
   - `#notesModalBackdrop` com `class="notes-drawer active"` (o `active` é o que liga o vidro);
   - `#notesModal` com as classes da seção 2.5;
   - `#notesEditorContainer` com `class="notes-editor-container focus-shell"`;
   - header com `<div class="notes-modal-header">` (sem utilitárias de padding: o padding vem do CSS);
   - footer com `class="notes-modal-footer flex justify-end gap-3 mt-0 px-6 py-4 border-t border-border bg-bg-global shrink-0"`.
5. **Verificar** (não pule):
   ```bash
   node tests/parity_structure.cjs   # espera: 0 classes sem regra, 0 ids/aria faltando
   node tests/parity_visual.cjs      # espera: 0 divergencias reais (somente excecoes documentadas)
   node tests/shortcuts.cjs          # atalhos continuam funcionando
   ```
6. **Publicar** — commit + push; incrementar `CACHE_NAME` no `sw.js` (ex.: `notas-pwa-v5`)
   para os clientes descartarem o CSS antigo.

---

## 4. Critérios de aceite (mensuráveis)

| Critério | Como medir | Esperado (o Chrome normaliza a %) |
|---|---|---|
| Painéis com vidro | `getComputedStyle(header).backdropFilter` | `blur(16px) saturate(1.08)` |
| Card do editor com vidro | `getComputedStyle(#notesEditorContainer).backdropFilter` | `blur(18px) saturate(1.45)` |
| Fundo translúcido do card | `getComputedStyle(#notesEditorContainer).backgroundColor` | `rgba(245, 245, 247, 0.72)` |
| Borda translúcida do card | `borderTopColor` | `rgba(255, 255, 255, 0.78)` |
| Painéis translúcidos | `backgroundColor` do header | `rgba(255, 255, 255, 0.88)` |
| Fonte do claro | `getComputedStyle(body).fontFamily` | system stack (com `Segoe UI`/`-apple-system`), **não** Inter |
| Paridade | `node tests/parity_visual.cjs` | `divergencias reais: 0` |
| Estrutura | `node tests/parity_structure.cjs` | `classes ... 0` e `OK: estrutura ... equivalente` |

> Valores medidos em produção (verificado): header `blur(16px) saturate(1.08)` ·
> card `blur(18px) saturate(1.45)` · fundo `rgba(245,245,247,0.72)` ·
> borda `rgba(255,255,255,0.78)` · painel `rgba(255,255,255,0.88)` · fonte system stack.

### 4.1 No MODO ESCURO o próprio compilado desliga o vidro

Isso é fiel e **não é bug** — o original troca vidro por superfícies sólidas:

```css
html[data-theme="dark"] #notesModalBackdrop.active { background: rgba(3, 7, 12, .72) !important; }
html[data-theme="dark"] #notesModalBackdrop.active #notesModal.notes-modal {
  color: #CBD5E1; background: #11161D !important; border: 1px solid #2A3543;
  box-shadow: 0 24px 60px rgba(0, 0, 0, .46) !important; -webkit-backdrop-filter: none;
}
html[data-theme="dark"] #notesModalBackdrop.active .notes-toolbar,
html[data-theme="dark"] #notesModalBackdrop.active .notes-modal-footer,
html[data-theme="dark"] #notesModalBackdrop.active .notes-context-nav {
  color: #CBD5E1; background: #151B23 !important; border-color: #2A3543 !important;
  -webkit-backdrop-filter: none; backdrop-filter: none;
}
html[data-theme="dark"] #notesModalBackdrop #notesModalTitle { color: #F8FAFC; }
/* card do editor no escuro (editor.css) */
html[data-theme="dark"] #notesModalBackdrop.active #notesModal #notesContextNav { background: #0d1218 !important; backdrop-filter: none; }
```

Portanto: **o efeito de vidro vive no modo claro**. No escuro, replicar os valores acima
(medidos: fundo do card `rgb(13,18,24)`, borda `rgb(38,50,65)`, painéis `rgb(21,27,35)` — todos
com `backdrop-filter: none`).

---

## 5. O que NÃO fazer (aprendido na prática)

1. ❌ Editar `theme-origem.css` à mão — ele é **gerado**; a edição se perde na próxima extração.
2. ❌ Criar `html[data-theme="dark"] { --color-*: … }` — o compilado do original **não** redefine
   tokens no escuro; isso gera divergência no `parity_visual`.
3. ❌ Colocar CSS de vidro dentro de `@layer` — perde prioridade e o efeito não aplica.
4. ❌ Fixar `width`/`height` no `.toolbar-btn` (o compilado usa `min-*` + `padding`).
5. ❌ Remover o preflight — os controles herdam Arial 13,33px e cor preta do navegador.
6. ❌ Reintroduzir Google Fonts/Inter — a tipografia é o *system stack* do compilado.
7. ❌ Usar `filter: blur()` no lugar de `backdrop-filter` — desfoca o conteúdo, não o fundo.

---

## 6. Estado atual deste repositório (referência)

O modo claro com vidro **já está implementado e verificado**:

- `theme-origem.css` (gerado) traz os tokens do compilado + **197 regras** do modal, incluindo
  todas as de vidro das seções 2.1, 2.2 e 2.4;
- `styles.css` complementa com preflight, utilitárias e o botão/`aria` que faltavam;
- `node tests/parity_visual.cjs` → **0 divergências reais** (13 exceções documentadas, todas de
  estado/conteúdo, não de estilo);
- validação no app publicado: fonte system stack, modal em janela (50vw), vidro aplicado,
  atalhos funcionando e **nenhum erro de console**.

Se o objetivo for **intensificar** o vidro (além do original), o caminho é:
1. ativar as camadas `::before`/`::after` da seção 2.3 (`opacity: .6`);
2. aumentar o `blur`/`saturate` do card (ex.: `blur(24px) saturate(180%)`);
3. adicionar `background: rgba(255,255,255,.55)` aos painéis;
— e então **documentar como divergência aceita** em `tests/parity_visual.cjs` (a lista
`EXCECOES`), para a suíte continuar sendo a fonte da verdade.

---

## 7. Documentos relacionados

- `docs/PROMPT-MULTI-NOTAS-MODELOS-CORES.md` — **botão “+” (multi-notas)**, chips no
  `#notesContextNav`, **modelos de nota** (texto aplicado como está) e como os **seletores de cor
  seguem a cor padrão (accent)** da nota.
- `docs/RASTREABILIDADE.md` — matriz regra → teste (o que está coberto e o que falta).
- `docs/RELATORIO-PARIDADE.md` — divergências visuais e exceções justificadas.
