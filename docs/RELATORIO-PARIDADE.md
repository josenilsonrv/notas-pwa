# Relatório de paridade visual (PWA x projeto original)

> Gerado por `node tests/parity_visual.cjs` em 2026-09-18 12:06:18.
> Compara as propriedades computadas de 18 seletores do modal de notas, em tema claro e escuro.
> O original é usado **somente como referência** (nenhuma alteração é feita nele).

| Resultado | Quantidade |
| --- | --- |
| Divergências reais | 0 |
| Exceções documentadas | 13 |

## Exceções aceitas (com justificativa)

### `#notesContextNav` → `height`

No original o nav e preenchido pelo dashboard com chips de projetos/etapas (altura ~60px); no PWA nao existem projetos/focos, entao o nav fica vazio (altura do padding).

### `#notesContextNav` → `borderTopColor`

Consequencia do item acima: o nav vazio do PWA nao recebe a borda translucida do estado com chips.

### `#notesModalBackdrop` → `color`

No PWA o modal E a tela principal (backdrop sempre ativo); no original ele e um drawer dentro de #focusDetailPage e o backdrop nao recebe .active no fluxo simplificado do harness.

### `#notesModalBackdrop` → `backgroundColor`

Mesma causa do item anterior: regra de fundo do estado ativo/inativo do drawer.

### `#notesModalBackdrop` → `borderTopColor`

Mesma causa dos dois itens anteriores (estado do drawer no tema escuro).

### `#notesContextNav` → `padding`

O nav vazio do PWA (sem chips) nao recebe o padding do estado preenchido do original.

### `#notesEditorContainer` → `height`

Consequencia direta do nav vazio: o container do editor e flex:1 e absorve os ~42px que no original ficam com os chips de contexto.

### `#notesEditor` → `height`

Mesma causa: o editor ocupa o espaco extra que o nav vazio deixa livre.

### `.notes-line-check` → `color`

Tema escuro: o compilado define a cor do texto do dashboard no escuro (#F5F5F7) por regras que nao existem no PWA; o checkbox apenas herda essa cor.

### `.notes-line-check` → `borderTopColor`

Mesma causa do item anterior (cor herdada pelo checkbox no tema escuro).

