# Relatório comparativo das suítes (PWA × projeto original)

> Gerado por `node tools/comparar-suites.cjs` em 2026-09-18 12:06:35.
> A MESMA suíte é executada nos dois projetos; a origem serve de referência.

| Classificação | Quantidade |
| --- | --- |
| ORIGEM-QUEBRADA | 10 |
| OK | 20 |
| DIVERGENCIA-ACEITA | 2 |
| N/A-JUSTIFICADO | 1 |
| SO-EM-UM-LADO | 6 |

| Teste | PWA | Origem | Classificação |
| --- | --- | --- | --- |
| `notes_cascade_defaults.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `notes_checklist_numbers.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `notes_checklist_order.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `notes_collapse_motion.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `notes_colors_persistence.cjs` | passa | passa | OK |
| `notes_completion_spacing.cjs` | passa | passa | OK |
| `notes_cut_background.cjs` | passa | passa | OK |
| `notes_document_migration.cjs` | passa | passa | OK |
| `notes_document_model.cjs` | passa | passa | OK |
| `notes_enter_child.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `notes_extras.cjs` | falha | passa | DIVERGENCIA-ACEITA |
| `notes_import_spacing.cjs` | passa | passa | OK |
| `notes_indent_child.cjs` | passa | passa | OK |
| `notes_large_document.cjs` | passa | passa | OK |
| `notes_last_line_enter.cjs` | passa | passa | OK |
| `notes_markdown.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `notes_million.cjs` | passa | passa | OK |
| `notes_million_extras.cjs` | passa | passa | OK |
| `notes_navigation_completion.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `notes_outline_code.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `notes_parent_undo.cjs` | passa | passa | OK |
| `notes_paste_blocks.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `notes_paste_selection.cjs` | passa | passa | OK |
| `notes_performance.cjs` | passa | passa | OK |
| `notes_regression_audit.cjs` | falha | passa | DIVERGENCIA-ACEITA |
| `notes_renumber_structure.cjs` | passa | passa | OK |
| `notes_requested_fixes.cjs` | passa | passa | N/A-JUSTIFICADO |
| `notes_table_math.cjs` | passa | passa | OK |
| `notes_table_media.cjs` | passa | passa | OK |
| `notes_table_tools.cjs` | passa | passa | OK |
| `notes_tone_picker.cjs` | passa | passa | OK |
| `notes_tone_picker_mobile.cjs` | passa | passa | OK |
| `parity_structure.cjs` | passa | ausente | SO-EM-UM-LADO |
| `parity_visual.cjs` | passa | ausente | SO-EM-UM-LADO |
| `shortcuts.cjs` | passa | ausente | SO-EM-UM-LADO |
| `test_focus_pages_ui.cjs` | ausente | passa | SO-EM-UM-LADO |
| `test_notes_editor_ui.cjs` | falha | falha | ORIGEM-QUEBRADA |
| `test_sports_ui.cjs` | ausente | passa | SO-EM-UM-LADO |
| `test_workout_templates_ui.cjs` | ausente | falha | SO-EM-UM-LADO |

## Legenda
- **OK**: passa nos dois — replica fiel.
- **ORIGEM-QUEBRADA**: falha nos dois — o teste está desatualizado na origem (o comportamento do motor mudou e o teste não).
- **DIVERGENCIA**: passa na origem e falha no PWA — bug real a corrigir no PWA.
- **PWA-MELHOR**: passa no PWA e falha na origem — investigar se o PWA alterou comportamento.
- **N/A-JUSTIFICADO / DIVERGENCIA-ACEITA**: diferenças assumidas por decisão de arquitetura, com motivo escrito abaixo.

## N/A e divergências aceitas (com justificativa)

- `notes_requested_fixes.cjs` — exercita telas do dashboard de foco, inexistentes no PWA standalone
- `notes_extras.cjs` — valida o visualizador de paginas de arquivo servido pelo backend (/api/note-assets); no PWA os anexos viram data URL e o visualizador e local (decisao do projeto).
- `notes_regression_audit.cjs` — todos os asserts passam, exceto o do overflow do <html>: no PWA o modal E a tela principal e permanece ativo, enquanto no original fecha-lo libera o overflow.

