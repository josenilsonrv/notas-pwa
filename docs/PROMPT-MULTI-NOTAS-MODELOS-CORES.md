# Prompt — Múltiplas notas (botão “+”), modelos de nota e cores que seguem a cor padrão

> Documento pronto para entregar a um agente de código. Ele descreve:
> **(1)** como os seletores de cor funcionam e por que *tudo* segue a cor padrão da nota;
> **(2)** como implementar o **botão “+”** que cria uma nova nota (multi-notas no PWA);
> **(3)** como funcionam os **modelos de nota**, aplicando o texto exatamente como foi salvo.

---

## 0. Contexto e restrições (valem para tudo)

- O motor de notas (`notes/editor.js`, `extras.js`, `tables.js`, `table-math.js` + CSS) é
  **byte a byte idêntico** ao do `produtividade-ferrramenta`. **Não edite esses arquivos.**
- O que é do PWA e pode ser alterado: `index.html`, `styles.css`, `theme-origem.css`, `app.js`, `sw.js`.
- Ordem de carregamento do CSS (não alterar): `styles.css` → `theme-origem.css` → `notes/*.css`.
- Fora dos testes, o app funciona 100% local (LocalStorage). Não há backend.
- A suíte precisa continuar verde:
  ```bash
  node tests/parity_structure.cjs && node tests/parity_visual.cjs && node tests/shortcuts.cjs
  npm test
  ```
- Ao publicar: **incrementar `CACHE_NAME`** em `sw.js` (ex.: `notas-pwa-v5`).

---

## 1. Cores: seletores, cor recente e a **cor padrão** que todos seguem

### 1.1 Os seletores (botões)

No HTML do modal existem exatamente dois botões de cor:

```html
<button type="button" class="toolbar-btn" data-notes-color="color"          title="Cor da fonte">A</button>
<button type="button" class="toolbar-btn" data-notes-color="backgroundColor" title="Destaque de texto">▮</button>
```

O motor (`p.setupNotesColors`, em `notes/editor.js`) abre o painel `#notesColorPalette` com:

| Elemento | Classe | Comportamento |
|---|---|---|
| Grade de 80 cores fixas | `.notes-color-grid` | clique = seleciona a cor (fica pendente) |
| Cores personalizadas | `.notes-custom-colors` | até **12** por nota, lidas de `data-note-colors` (texto) ou `data-note-highlight-colors` (fundo) |
| Botão `+` da paleta | `.notes-custom-colors button` (`aria-label="Adicionar cor personalizada"`) | abre o *tone picker* (roda cromática + saturação/brilho) |
| Conta-gotas | `aria-label="Conta-gotas"` | usa `EyeDropper` quando disponível |
| Resetar | botão de reset | para `color`: abre o seletor em **modo cor padrão**; para `backgroundColor`: aplica `transparent` |
| Aplicar | `.notes-color-apply` | ver 1.2 |

### 1.2 Cor padrão da nota (o “accent”)

- Em modo **cor padrão** (`pendingDefault === true`, ativado pelo botão *Resetar* do seletor
  `color`), o botão **Aplicar** chama `setNotesDefaultColor(cor)` em vez de colorir o texto.
- `setNotesDefaultColor(cor)` (motor) grava em **todas as linhas**:
  - `data-note-accent="<#rrggbb>"` → a cor padrão da nota;
  - `data-note-accent-history="<cor,cor,…>"` → até **16** cores usadas (para o histórico);
  - nas linhas com `data-heading`: `data-line-color="var(--notes-accent)"` e cores inline viram `var(--notes-accent)`.
- O título do botão documenta a intenção:
  *“Usar a cor personalizada como padrão dos títulos e colapsos desta nota”*.

### 1.3 Cores de texto/fundo aplicadas a um trecho/linha

- `applyNotesTextStyle(propriedade, valor)` (motor):
  - **seleção colapsada + `property === 'color'`** → `line.dataset.lineColor = valor`
    (a linha inteira passa a usar `--notes-line-color`, que vence o accent);
  - **com seleção** → aplica `style.color` / `style.backgroundColor` apenas no trecho selecionado.
- Toda cor escolhida é **lembrada na nota**: `rememberColor` acrescenta ao
  `data-note-colors` / `data-note-highlight-colors` das linhas (máx. 12, sem repetição).

### 1.4 Por que “cada seletor segue a cor padrão configurada”

Porque no CSS do motor os indicadores usam uma **cascata de variáveis** — o accent da nota
alimenta tudo:

| Elemento | Regra (em `notes/editor.css`) |
|---|---|
| Títulos H1–H3 | `color: var(--notes-line-color, var(--notes-accent, var(--color-neon-blue)))` |
| Botão de colapso | `color/background` derivados de `var(--notes-line-color, var(--notes-accent, …))` |
| Checkbox | `accent-color: var(--color-neon-blue)` (fixo) e bordas com `--notes-accent` |
| Bloco de código | `--notes-code-ink` + bordas com `--notes-accent` |
| Aba/indicador ativo do nav | `--notes-accent` do chip |
| Chip da nota no `#notesContextNav` | `--notes-accent` = accent lido da nota (ver 2.4) |

Ou seja: **definir a cor padrão da nota repinta todos esses seletores de uma vez** — e como o
accent é gravado no HTML da nota (`data-note-accent`), ele **persiste ao salvar/reabrir**.
O agente **não precisa criar mecanismo novo**: basta (a) não sobrescrever as variáveis
`--notes-accent`/`--notes-line-color` em `styles.css` e (b) aplicar/replicar `--notes-accent`
por nota na interface (chips, ver 2.4).

### 1.5 Cuidados

1. Não mover as cores do motor para `styles.css` (quebraria a paridade).
2. O accent vive **no conteúdo da nota**, não em variável global: ao trocar de nota, o accent
   muda junto (por isso cada chip recalcula `--notes-accent`).
3. Ao criar uma nota nova, ela deve começar **sem** `data-note-accent` (usa o azul padrão
   `#0071e3`/`var(--color-neon-blue)`), como no original.

---

## 2. Botão “+” — múltiplas notas locais (implementar)

### 2.1 Situação atual e objetivo

Hoje o PWA tem **uma única nota fixa**:
```js
this.projectsData = [{ id: 'local', nome: 'Minhas notas', notas: this.notesContent }];
```
e o `#notesContextNav` fica **vazio**. O objetivo é ter **N notas**, com um **botão “+”** que
cria uma nota nova em branco e **chips** no nav para alternar — a mesma linguagem visual do
original, sem tocar no motor.

### 2.2 Modelo de dados e persistência

```
localStorage:
  notas-pwa-notes        -> [{ id, nome, notas(html), criadaEm, atualizadaEm }, …]
  notas-pwa-nota-ativa   -> "<id da nota aberta>"
  notas-pwa-content      -> mantido por compatibilidade (espelho da nota ativa)
  notas-pwa-templates    -> modelos (ver secao 3)
```

**Migração obrigatória** (primeira execução): se existir `notas-pwa-content` e não existir
`notas-pwa-notes`, criar a lista com uma nota:
```js
{ id: 'local', nome: 'Minhas notas', notas: localStorage.getItem('notas-pwa-content') || '' }
```
> Manter o `id: 'local'` é importante: os testes existentes (`tests/notes_*.cjs`) usam
> `app.projectsData[0]` e `openNotesModal('local')`.

### 2.3 Integração com o motor (nada de reescrever o editor)

O motor já é multi-documento: `projectsData` + `openNotesModal(id)` + `beginNotesSession()`
+ `notesSession.project`. Portanto:
- mantenha `projectsData` como a **lista de notas locais** (é o que o motor consome);
- `openNotesModal(id)` (versão instalada pelo motor) **já salva a nota atual** antes de abrir a
  próxima — não duplique essa lógica.

### 2.4 `renderNotesNav()` — chips + botão “+” (baseado no `renderNotesNavigator` do original)

```js
renderNotesNav() {
  const nav = document.getElementById('notesContextNav');
  if (!nav) return;
  const ativa = this.currentNotesProjectId;
  nav.replaceChildren();
  for (const nota of this.projectsData) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'notes-context-chip' + (nota.id === ativa ? ' is-active' : '');
    chip.dataset.noteId = nota.id;
    chip.textContent = nota.nome || 'Nota';
    chip.title = 'Abrir esta nota';
    chip.style.setProperty('--notes-accent', this.accentDaNota(nota) || '#0071e3');
    chip.addEventListener('click', () => { if (nota.id !== ativa) this.openNotesModal(nota.id); });
    nav.append(chip);
  }
  const mais = document.createElement('button');
  mais.type = 'button';
  mais.className = 'notes-context-chip notes-context-chip-add';
  mais.textContent = '+';
  mais.title = 'Nova nota';
  mais.setAttribute('aria-label', 'Criar nova nota');
  mais.addEventListener('click', () => this.criarNota());
  nav.append(mais);
}

accentDaNota(nota) {
  const template = document.createElement('template');
  template.innerHTML = nota.notas || '';
  return template.content.querySelector('[data-note-accent]')?.dataset.noteAccent || '';
}
```

> `accentDaNota` é a cópia fiel do que o original faz em `renderNotesNavigator`:
> o chip recebe `--notes-accent` **lido do conteúdo da nota** — é isso que faz
> **cada chip (e cada nota) seguir a sua cor padrão**.

### 2.5 `criarNota()` — o clique no “+”

```js
criarNota() {
  const id = 'nota-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nota = { id, nome: 'Nova nota', notas: '', criadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString() };
  this.persistNow?.();            // garante que a nota atual foi gravada
  this.projectsData.push(nota);
  this.salvarNotasLocais();
  this.openNotesModal(id);        // abre a nova (o motor salva a anterior)
}
```

Requisitos de UX:
- o “+” fica **sempre no fim** do nav (o `overflow-x:auto` do `.notes-context-nav` já resolve muitas notas);
- a nota nova abre **vazia**, com o cursor no fim (o `openNotesModal` já posiciona);
- título inicial “Nova nota”, **renomeável** (2.6);
- acessibilidade: `<button>`, `aria-label="Criar nova nota"`, foco visível (use `:focus-visible` já global).

### 2.6 Renomear e excluir

- **Renomear**: clique no título do modal (`#notesModalTitle`) com `contenteditable="plaintext-only"`;
  ao `blur`/Enter grava `nota.nome`, chama `salvarNotasLocais()` e `renderNotesNav()`.
  Alternativa de menor esforço: duplo-clique no chip → `prompt('Nome da nota', nomeAtual)`.
- **Excluir**: no chip **ativo**, duplo-clique/long-press abre um pequeno menu com “Renomear” e
  “Excluir”; exclusão **sempre com confirmação**. Se era a última nota, criar uma nova vazia em
  seguida (o app nunca fica sem nota).
- Após qualquer mudança: `salvarNotasLocais()` + `renderNotesNav()`.

### 2.7 Persistência / autosave

- `salvarNotasLocais()` grava `notas-pwa-notes` e `notas-pwa-nota-ativa`.
- O autosave do motor chama `apiCall(url, { method:'PUT', body: JSON.stringify({ notas: html }) })`.
  Ajuste o `apiCall` do PWA para gravar **na nota ativa** (além de manter `notas-pwa-content`):

```js
async apiCall(endpoint, options = {}) {
  const metodo = (options.method || 'GET').toUpperCase();
  if (metodo !== 'GET' && options.body) {
    try {
      const payload = JSON.parse(options.body);
      if (typeof payload.notas === 'string') {
        this.saveContentToStorage(payload.notas);                    // espelho (compatibilidade)
        const lista = this.lerNotasLocais();
        const nota = lista.find(n => n.id === this.currentNotesProjectId) || lista[0];
        if (nota) { nota.notas = payload.notas; nota.atualizadaEm = new Date().toISOString(); this.gravarNotasLocais(lista); }
      }
    } catch (_) { /* corpo não-JSON é ignorado */ }
  }
  return {};
}
```

### 2.8 Arquivos a alterar

| Arquivo | Mudança |
|---|---|
| `app.js` | `lerNotasLocais()`, `gravarNotasLocais()`, `salvarNotasLocais()`, `renderNotesNav()`, `criarNota()`, `accentDaNota()`, `apiCall` multi-nota, migração e chamada de `renderNotesNav()` no `init()` |
| `index.html` | nada obrigatório (o `#notesContextNav` já existe) |
| `styles.css` | garantir `.notes-context-chip`, `.notes-context-chip.is-active` e o visual do `.notes-context-chip-add` (a base vem do `theme-origem.css`) |
| `sw.js` | bump do `CACHE_NAME` |

### 2.9 Critérios de aceite

1. Clicar em “+” cria a nota, ela abre vazia e o chip fica ativo.
2. Alternar entre chips troca o conteúdo **sem perder** nada (o autosave grava na nota certa).
3. Recarregar o app mantém **todas** as notas e a última aberta.
4. Cada chip pinta com a **cor padrão da sua nota**.
5. `npm test` continua verde (a primeira nota permanece `id:'local'` com o conteúdo migrado).

---

## 3. Modelos de nota — o texto entra **exatamente como foi salvo** (já funciona)

### 3.1 Fluxo atual (motor + camada local do PWA)

O botão **Modelos** (ícone `▤`, atalho **Ctrl+Alt+M**) chama `p.notesTemplates()` do motor:

1. **Salvar**: campo “Nome do modelo” + botão *Salvar nota como modelo* →
   `POST /templates { name, html: this.getCleanNotesHtml() }`
2. **Listar**: `GET /templates` → `[{ id, name }]`
3. **Aplicar**: ao escolher *Aplicar: <nome>* o motor:
   - busca `GET /templates/<id>` (HTML completo do modelo);
   - **sanitiza**: remove `script, style, iframe, object, embed` e atributos `on*` / `javascript:`;
   - `editor().replaceChildren(conteúdo do modelo)` → **todo o texto da nota é substituído por uma
     cópia editável, exatamente como foi salvo**;
   - regenera `data-note-id` de cada linha (`NotesDocument.id()`);
   - `recordNotesHistory()` → **Ctrl+Z desfaz a aplicação**.
   - O texto de ajuda do diálogo resume: *“um modelo é uma cópia editável; editar a nota não
     altera o modelo salvo; pode ser desfeito com Ctrl+Z”*.

### 3.2 Onde os modelos ficam no PWA

`installLocalNotesStorage` (em `app.js`) já implementa o “backend” local:

```js
p.notesExtraRequest = async function (path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (path === '/templates' && method === 'POST') { /* cria {id, name, html} e grava */ }
  if (path === '/templates') return readTemplates().map(({ id, name }) => ({ id, name }));
  if (path.startsWith('/templates/')) { /* devolve o modelo completo {id,name,html} */ }
  throw new Error('Recurso indisponível neste dispositivo.');
};
```
Persistência: `localStorage['notas-pwa-templates']` = `[{ id, name, html }, …]`.
**Nada a implementar** — apenas garantir que o botão **Modelos** aparece na toolbar
(o motor adiciona em `setupNotesEditing`/`refreshNotesCollapseControls`) e documentar o atalho.

### 3.3 Melhorias recomendadas (opcionais, se o usuário quiser)

1. **Gerenciar modelos**: renomear/excluir na própria lista (`DELETE /templates/<id>` local).
2. **Nome sugerido**: pré-preencher com a primeira linha da nota.
3. **Preservar a cor padrão**: ao aplicar um modelo, se a nota atual tiver
   `data-note-accent` e o modelo não, definir `nota.nome`/accent conforme a preferência do usuário.
4. **Modelos por nota vs. globais**: hoje são globais (compartilhados entre todas as notas) —
   documentar isso na interface (“Modelos salvos no dispositivo”).

---

## 4. Passo a passo de implementação

1. **Migração** — criar `lerNotasLocais()`/`gravarNotasLocais()` com a migração da nota única
   (`notas-pwa-content` → `notas-pwa-notes`, `id: 'local'`).
2. **`apiCall` multi-nota** — gravar na nota ativa (código em 2.7).
3. **`renderNotesNav()` + `criarNota()` + `accentDaNota()`** — chips + botão “+”.
4. **Chamar `renderNotesNav()`**: no `init()` (após abrir a primeira nota) e sempre que a nota
   ativa mudar/criar/renomear/excluir.
5. **Renomear/excluir** — título editável e menu no chip ativo.
6. **Estilo do “+”** — em `styles.css` (base no `theme-origem.css`):
   ```css
   .notes-context-chip-add {
     min-width: 2rem; font-weight: 700; font-size: 1.05rem; line-height: 1;
     color: var(--notes-accent, var(--color-neon-blue));
   }
   ```
7. **Verificar**:
   ```bash
   node tests/parity_structure.cjs   # estrutura do modal intacta
   node tests/parity_visual.cjs      # estilos do modal intactos (0 divergencias reais)
   node tests/shortcuts.cjs          # atalhos seguem funcionando
   npm test
   ```
8. **Publicar** — commit + push e **bump do `CACHE_NAME`** em `sw.js`.
9. **Teste manual no celular**: criar 3 notas, digitar em cada uma, alternar, recarregar o app e
   conferir que as 3 continuam lá e que cada chip tem a cor padrão da sua nota.

---

## 5. Armadilhas (aprendidas na prática)

1. ❌ **Não** altere `notes/editor.js`/`extras.js` para adicionar multi-notas — o motor já é
   multi-documento via `projectsData`; a mudança é só de *armazenamento/render* no `app.js`.
2. ❌ **Não** mova a definição das cores/accent para `styles.css` (quebraria a paridade visual).
3. ❌ **Não** guarde o accent em variável global — ele vive no HTML da nota
   (`data-note-accent`), e o chip recalcula `--notes-accent` a cada renderização.
4. ❌ **Não** esqueça a migração: sem ela, quem já usava o app perde a nota ao atualizar.
5. ❌ **Não** troque a nota sem salvar a anterior (use `persistNow()` + `openNotesModal(id)`, que
   já fecha/salva pelo motor).
6. ❌ **Não** deixe `#notesContextNav` com `hidden` — ele é o lugar dos chips (e o
   `parity_structure` exige o `role`/`aria-label` equivalentes ao original).
7. ❌ **Não** usar `localStorage` sem `try/catch`: em modo privado/iOS pode lançar.
8. ⚠️ Ao aplicar um **modelo**, o motor **substitui todo o texto** — avise isso na interface
   (“o texto atual será substituído; Ctrl+Z desfaz”), como o próprio diálogo já faz.

---

## 6. Resumo do que já existe × o que implementar

| Funcionalidade | Situação | Ação |
|---|---|---|
| Seletores de cor (80 cores + recentes + `+` + conta-gotas) | ✅ no motor | nada |
| Cor padrão da nota (accent) que repinta títulos/colapsos/chips | ✅ no motor | nada (só não sobrescrever) |
| Modelos de nota (salvar/listar/aplicar com o texto como está) | ✅ motor + camada local | documentar; melhorias opcionais na seção 3.3 |
| **Botão “+” criando nova nota** | ❌ não existe no PWA | **implementar (seção 2)** |
| Chips de notas no `#notesContextNav` | ❌ nav vazio | **implementar (seção 2.4)** |
| Renomear/excluir notas | ❌ | **implementar (seção 2.6)** |

