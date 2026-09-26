# Relatório da suíte de testes

> Gerado por `node tests/run-all.cjs` em 2026-09-26 01:38:46.
> Projeto testado: `C:\Users\Usuario\OneDrive\Desktop\notas-pwa`

**PASSOU: 62 / 71** · FALHOU: 0 · CONHECIDAS: 8 · flaky: 0 · tempo: 974.7 s

Falhas conhecidas (determinísticas, documentadas em `docs/PROBLEMAS-E-MITIGACOES.md` P83): `notes_cascade_defaults.cjs` (cores em cascata divergem do original (paridade do motor)) · `notes_collapse_motion.cjs` (tempo da animacao de colapso diverge do original) · `notes_markdown.cjs` (tabela markdown nao e convertida como no original) · `notes_navigation_completion.cjs` (cor herdada na navegacao por conclusao divergente) · `notes_outline_code.cjs` (colapso de titulo + bloco de codigo diverge do original) · `notes_paste_blocks.cjs` (colagem de blocos de codigo junta linhas do original) · `notes_regression_audit.cjs` (auditoria de regressao: comportamento divergente registrado) · `test_notes_editor_ui.cjs` (Enter em lista aninhada cria nivel diferente do original)

| Teste | Resultado | Tempo |
| --- | --- | --- |
| `expandir.cjs` | ✅ | 23208 ms |
| `mapa_abertura_padrao.cjs` | ✅ | 22462 ms |
| `mapa_area.cjs` | ✅ | 22748 ms |
| `mapa_atalhos.cjs` | ✅ | 17626 ms |
| `mapa_canvas.cjs` | ✅ | 17115 ms |
| `mapa_chips.cjs` | ✅ | 16709 ms |
| `mapa_colapso.cjs` | ✅ | 14983 ms |
| `mapa_conexoes.cjs` | ✅ | 15101 ms |
| `mapa_conteudo.cjs` | ✅ | 40479 ms |
| `mapa_dragdrop.cjs` | ✅ | 11006 ms |
| `mapa_estilo.cjs` | ✅ | 11047 ms |
| `mapa_gestao.cjs` | ✅ | 19592 ms |
| `mapa_layout.cjs` | ✅ | 26268 ms |
| `mapa_nos.cjs` | ✅ | 12554 ms |
| `mapa_padrao_notas.cjs` | ✅ | 8019 ms |
| `mapa_toolbar.cjs` | ✅ | 17941 ms |
| `mapa_undo.cjs` | ✅ | 17025 ms |
| `mapa_vazio.cjs` | ✅ | 16447 ms |
| `multi_notas.cjs` | ✅ | 17204 ms |
| `multi_notas_100.cjs` | ✅ | 16853 ms |
| `nota_abertura_padrao.cjs` | ✅ | 16381 ms |
| `nota_grande_pwa.cjs` | ✅ | 9936 ms |
| `notes_cascade_defaults.cjs` | 🔶 conhecida — cores em cascata divergem do original (paridade do motor) | 11089 ms |
| `notes_checklist_enter.cjs` | ✅ | 10061 ms |
| `notes_checklist_numbers.cjs` | ✅ | 10252 ms |
| `notes_checklist_order.cjs` | ✅ | 9318 ms |
| `notes_chip_menu.cjs` | ✅ | 8441 ms |
| `notes_clear_all.cjs` | ✅ | 12666 ms |
| `notes_collapse_motion.cjs` | 🔶 conhecida — tempo da animacao de colapso diverge do original | 12454 ms |
| `notes_collapsed_heading.cjs` | ✅ | 17909 ms |
| `notes_colors_persistence.cjs` | ✅ | 5706 ms |
| `notes_completion_spacing.cjs` | ✅ | 5906 ms |
| `notes_cut_background.cjs` | ✅ | 8265 ms |
| `notes_document_migration.cjs` | ✅ | 8393 ms |
| `notes_document_model.cjs` | ✅ | 184 ms |
| `notes_enter_child.cjs` | ✅ | 7778 ms |
| `notes_enter_robust.cjs` | ✅ | 11214 ms |
| `notes_extras.cjs` | ✅ | 27278 ms |
| `notes_import_spacing.cjs` | ✅ | 10803 ms |
| `notes_indent_child.cjs` | ✅ | 8209 ms |
| `notes_indent_levels.cjs` | ✅ | 7975 ms |
| `notes_large_document.cjs` | ✅ | 8488 ms |
| `notes_last_line_enter.cjs` | ✅ | 8799 ms |
| `notes_markdown.cjs` | 🔶 conhecida — tabela markdown nao e convertida como no original | 10768 ms |
| `notes_million.cjs` | ✅ | 10347 ms |
| `notes_million_extras.cjs` | ✅ | 10590 ms |
| `notes_navigation_completion.cjs` | 🔶 conhecida — cor herdada na navegacao por conclusao divergente | 12181 ms |
| `notes_outline_code.cjs` | 🔶 conhecida — colapso de titulo + bloco de codigo diverge do original | 12058 ms |
| `notes_parent_undo.cjs` | ✅ | 11576 ms |
| `notes_paste_blocks.cjs` | 🔶 conhecida — colagem de blocos de codigo junta linhas do original | 8881 ms |
| `notes_paste_selection.cjs` | ✅ | 9378 ms |
| `notes_performance.cjs` | ✅ | 9742 ms |
| `notes_regression_audit.cjs` | 🔶 conhecida — auditoria de regressao: comportamento divergente registrado | 9186 ms |
| `notes_renumber_structure.cjs` | ✅ | 9081 ms |
| `notes_requested_fixes.cjs` | ➖ n/a — exercita telas do dashboard de foco (#focusStageFocusId, #focusStageTitle), que  | 0 ms |
| `notes_table_math.cjs` | ✅ | 189 ms |
| `notes_table_media.cjs` | ✅ | 16937 ms |
| `notes_table_tools.cjs` | ✅ | 14479 ms |
| `notes_tone_picker.cjs` | ✅ | 13445 ms |
| `notes_tone_picker_mobile.cjs` | ✅ | 20499 ms |
| `notes_underline.cjs` | ✅ | 12743 ms |
| `parity_structure.cjs` | ✅ | 125 ms |
| `parity_visual.cjs` | ✅ | 24260 ms |
| `pastas_unificadas.cjs` | ✅ | 12020 ms |
| `pwa_service_worker.cjs` | ✅ | 28903 ms |
| `shortcuts.cjs` | ✅ | 26285 ms |
| `split_view.cjs` | ✅ | 24791 ms |
| `tema_switch.cjs` | ✅ | 7092 ms |
| `tema_vidro.cjs` | ✅ | 18026 ms |
| `test_notes_editor_ui.cjs` | 🔶 conhecida — Enter em lista aninhada cria nivel diferente do original | 16807 ms |
| `toolbar_pwa.cjs` | ✅ | 22432 ms |

