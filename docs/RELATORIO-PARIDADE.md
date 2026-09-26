# Relatório de paridade visual (PWA x projeto original)

> Gerado por `node tests/parity_visual.cjs` em 2026-09-26 05:23:24.
> Compara as propriedades computadas de 18 seletores do modal de notas, em tema claro e escuro.
> O original é usado **somente como referência** (nenhuma alteração é feita nele).

| Resultado | Quantidade |
| --- | --- |
| Divergências reais | 0 |
| Exceções documentadas | 43 |

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

### `#notesContextNav` → `overflow`

Revisao do bloco de notas: os chips passam a rolar na vertical a partir de ~2 linhas (o original so rola na horizontal).

### `#notesContextNav` → `backgroundColor`

Revisao do bloco de notas: o conteiner (faixa/painel) atras dos chips foi removido de proposito, entao o nav fica transparente sobre o cabecalho. O original mantem a faixa branca.

### `#notesEditorContainer` → `height`

Consequencia de eventual diferenca de altura do nav entre os chips locais do PWA e os chips de projeto/etapa do original.

### `#notesEditor` → `height`

Mesma causa do item anterior: o editor e flex:1 e absorve a diferenca de altura do nav.

### `.notes-line-check` → `color`

Tema escuro: o compilado define a cor do texto do dashboard no escuro (#F5F5F7) por regras que nao existem no PWA; o checkbox apenas herda essa cor.

### `.notes-line-check` → `borderTopColor`

Mesma causa do item anterior (cor herdada pelo checkbox no tema escuro).

### `#notesEditorContainer` → `padding`

Revisao do bloco de notas: recuo lateral esquerdo reduzido de proposito (0.6rem) para aproximar o conteudo da borda do campo. O original mantem 1.4rem.

### `#notesEditor` → `width`

Consequencia direta da reducao do padding-left do container (item 14 da revisao): o editor fica ~13px mais largo. Nao e divergencia de estilo, e o efeito pedido.

### `.notes-line` → `width`

Mesma causa do item anterior (largura herdada do editor mais largo).

### `.notes-line-text` → `width`

Mesma causa dos itens anteriores (a area de texto acompanha a largura do editor).

### `.notes-modal-header` → `height`

Padronizacao dos icones em 1.125rem (18px, o mesmo tamanho do <h1> "Notas"): os botoes do cabecalho ficam 2px mais baixos e o header acompanha. Efeito pedido.

### `.toolbar-btn` → `height`

Consequencia direta da padronizacao dos icones em 1.125rem (18px): o botao de icone (usado no cabecalho e na barra) fica 2px mais baixo. Efeito pedido.

### `.toolbar-btn` → `width`

Mesma causa da altura do .toolbar-btn: com o icone de 1.125rem (18px) o botao de icone fica 2px mais estreito. Efeito pedido.

### `#notesToolbar` → `height`

Padronizacao dos icones em 1.125rem (18px): no harness de paridade a barra de Notas usa o overflow "..." do motor (sem a classe notes-toolbar-inline, aplicada so no app), entao icones um pouco maiores empurram mais itens para a gaveta e a barra fica mais alta. No app real a classe inline mantem UMA linha com rolagem (toolbar_pwa.cjs).

### `.notes-modal-footer` → `alignItems`

Rodape mais baixo/discreto (item E/K): conteudo centralizado verticalmente (items-center) para caber na altura reduzida (2.25rem), igual ao rodape do Mapa.

### `.notes-modal-footer` → `display`

Rodape PADRONIZADO com o do Mapa pela classe compartilhada `.app-rodape` (grade 1fr auto 1fr = esquerda | CENTRO | direita). O original usa `flex`; a grade centraliza de verdade o item do meio (contagem de topicos). Efeito pedido.

### `.notes-modal-footer` → `padding`

Rodape mais baixo/discreto (item E/K): padding vertical reduzido de 16px para 8px para igualar a altura do rodape do Mapa. Efeito pedido.

### `#notesSaveStatus` → `height`

Consequencia do rodape mais baixo (min-height 2.25rem) e do texto padronizado em 12px: o status fica mais baixo que o original. Efeito pedido para igualar ao rodape do Mapa.

### `.notes-modal-footer` → `minHeight`

Padronizacao P81: a altura do rodape de Notas passa a ser a MESMA do rodape do Mapa (2.25rem) — o original usa 4rem. Efeito pedido.

### `.notes-modal-footer` → `height`

Consequencia direta do item anterior (min-height 2.25rem = altura do rodape do Mapa).

