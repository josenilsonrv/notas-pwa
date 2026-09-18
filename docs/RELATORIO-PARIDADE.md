# Relatório de paridade visual (PWA x projeto original)

> Gerado por `node tests/parity_visual.cjs` em 2026-09-18 15:29:16.
> Compara as propriedades computadas de 18 seletores do modal de notas, em tema claro e escuro.
> O original é usado **somente como referência** (nenhuma alteração é feita nele).

| Resultado | Quantidade |
| --- | --- |
| Divergências reais | 0 |
| Exceções documentadas | 7 |

## Exceções aceitas (com justificativa)

### `#notesContextNav` → `height`

No original o nav e preenchido pelo dashboard com chips de projetos/etapas; no PWA ele e preenchido com os chips das notas locais + botao "+". A altura acompanha quando o numero/tamanho dos chips e o mesmo, mas a excecao permanece porque o conteudo do nav pode diferir.

### `#notesContextNav` → `borderTopColor`

O original aplica a borda translucida do estado "com chips" do dashboard; o nav do PWA (chips locais + "+") usa a borda base definida em notes/editor.css.

### `#notesModalBackdrop` → `color`

No PWA o modal E a tela principal (backdrop sempre ativo); no original ele e um drawer dentro de #focusDetailPage e o backdrop nao recebe .active no fluxo simplificado do harness.

### `#notesModalBackdrop` → `backgroundColor`

Mesma causa do item anterior: regra de fundo do estado ativo/inativo do drawer.

### `#notesModalBackdrop` → `borderTopColor`

Mesma causa dos dois itens anteriores (estado do drawer no tema escuro).

### `#notesContextNav` → `padding`

Tolerancia de layout do nav quando os chips do PWA (nomes de notas) e do original (projetos/etapas) tem larguras diferentes.

### `#notesEditorContainer` → `height`

Consequencia de eventual diferenca de altura do nav entre os chips locais do PWA e os chips de projeto/etapa do original.

### `#notesEditor` → `height`

Mesma causa do item anterior: o editor e flex:1 e absorve a diferenca de altura do nav.

### `.notes-line-check` → `color`

Tema escuro: o compilado define a cor do texto do dashboard no escuro (#F5F5F7) por regras que nao existem no PWA; o checkbox apenas herda essa cor.

### `.notes-line-check` → `borderTopColor`

Mesma causa do item anterior (cor herdada pelo checkbox no tema escuro).

