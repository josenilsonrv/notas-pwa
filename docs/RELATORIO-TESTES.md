# Relatório da suíte de testes

> Gerado por `node tests/run-all.cjs` em 2026-09-26 13:15:28.
> Projeto testado: `C:\Users\Usuario\OneDrive\Desktop\notas-pwa`

**PASSOU: 70 / 79** · FALHOU: 0 · CONHECIDAS: 8 · flaky: 0 · tempo: 871.8 s

Falhas conhecidas (determinísticas, documentadas em `docs/PROBLEMAS-E-MITIGACOES.md` P83): `notes_cascade_defaults.cjs` (cores em cascata divergem do original (paridade do motor)) · `notes_collapse_motion.cjs` (tempo da animacao de colapso diverge do original) · `notes_markdown.cjs` (tabela markdown nao e convertida como no original) · `notes_navigation_completion.cjs` (cor herdada na navegacao por conclusao divergente) · `notes_outline_code.cjs` (colapso de titulo + bloco de codigo diverge do original) · `notes_paste_blocks.cjs` (colagem de blocos de codigo junta linhas do original) · `notes_regression_audit.cjs` (auditoria de regressao: comportamento divergente registrado) · `test_notes_editor_ui.cjs` (Enter em lista aninhada cria nivel diferente do original)

| Teste | Resultado | Tempo |
| --- | --- | --- |
| `backend_python.cjs` | ✅ | 48452 ms |
| `conta_login.cjs` | ✅ | 10699 ms |
| `expandir.cjs` | ✅ | 17353 ms |
| `mapa_abertura_padrao.cjs` | ✅ | 9582 ms |
| `mapa_area.cjs` | ✅ | 18926 ms |
| `mapa_atalhos.cjs` | ✅ | 9581 ms |
| `mapa_canvas.cjs` | ✅ | 17777 ms |
| `mapa_chips.cjs` | ✅ | 15867 ms |
| `mapa_colapso.cjs` | ✅ | 24837 ms |
| `mapa_conexoes.cjs` | ✅ | 23477 ms |
| `mapa_conteudo.cjs` | ✅ | 11261 ms |
| `mapa_dragdrop.cjs` | ✅ | 24433 ms |
| `mapa_estilo.cjs` | ✅ | 4390 ms |
| `mapa_gestao.cjs` | ✅ | 4776 ms |
| `mapa_layout.cjs` | ✅ | 4868 ms |
| `mapa_nos.cjs` | ✅ | 12610 ms |
| `mapa_padrao_notas.cjs` | ✅ | 25017 ms |
| `mapa_toolbar.cjs` | ✅ | 8355 ms |
| `mapa_undo.cjs` | ✅ | 14553 ms |
| `mapa_vazio.cjs` | ✅ | 9029 ms |
| `modo_local_sem_backend.cjs` | ✅ | 10539 ms |
| `multi_notas.cjs` | ✅ | 18341 ms |
| `multi_notas_100.cjs` | ✅ | 13508 ms |
| `nota_abertura_padrao.cjs` | ✅ | 19837 ms |
| `nota_grande_pwa.cjs` | ✅ | 7353 ms |
| `notes_anexos_nuvem.cjs` | ✅ | 15596 ms |
| `notes_cascade_defaults.cjs` | 🔶 conhecida — cores em cascata divergem do original (paridade do motor) | 8957 ms |
| `notes_checklist_enter.cjs` | ✅ | 6046 ms |
| `notes_checklist_numbers.cjs` | ✅ | 5284 ms |
| `notes_checklist_order.cjs` | ✅ | 7203 ms |
| `notes_chip_menu.cjs` | ✅ | 8406 ms |
| `notes_clear_all.cjs` | ✅ | 9110 ms |
| `notes_collapse_motion.cjs` | 🔶 conhecida — tempo da animacao de colapso diverge do original | 7963 ms |
| `notes_collapsed_heading.cjs` | ✅ | 7758 ms |
| `notes_colors_persistence.cjs` | ✅ | 4270 ms |
| `notes_completion_spacing.cjs` | ✅ | 3952 ms |
| `notes_cut_background.cjs` | ✅ | 5896 ms |
| `notes_document_migration.cjs` | ✅ | 5888 ms |
| `notes_document_model.cjs` | ✅ | 177 ms |
| `notes_enter_child.cjs` | ✅ | 4523 ms |
| `notes_enter_robust.cjs` | ✅ | 8985 ms |
| `notes_extras.cjs` | ✅ | 19505 ms |
| `notes_import_spacing.cjs` | ✅ | 5179 ms |
| `notes_indent_child.cjs` | ✅ | 5000 ms |
| `notes_indent_levels.cjs` | ✅ | 4573 ms |
| `notes_large_document.cjs` | ✅ | 6678 ms |
| `notes_last_line_enter.cjs` | ✅ | 6567 ms |
| `notes_markdown.cjs` | 🔶 conhecida — tabela markdown nao e convertida como no original | 6082 ms |
| `notes_million.cjs` | ✅ | 6731 ms |
| `notes_million_extras.cjs` | ✅ | 7405 ms |
| `notes_navigation_completion.cjs` | 🔶 conhecida — cor herdada na navegacao por conclusao divergente | 7834 ms |
| `notes_outline_code.cjs` | 🔶 conhecida — colapso de titulo + bloco de codigo diverge do original | 8864 ms |
| `notes_parent_undo.cjs` | ✅ | 7594 ms |
| `notes_paste_blocks.cjs` | 🔶 conhecida — colagem de blocos de codigo junta linhas do original | 6483 ms |
| `notes_paste_selection.cjs` | ✅ | 6374 ms |
| `notes_performance.cjs` | ✅ | 5394 ms |
| `notes_regression_audit.cjs` | 🔶 conhecida — auditoria de regressao: comportamento divergente registrado | 5477 ms |
| `notes_renumber_structure.cjs` | ✅ | 5880 ms |
| `notes_requested_fixes.cjs` | ➖ n/a — exercita telas do dashboard de foco (#focusStageFocusId, #focusStageTitle), que  | 0 ms |
| `notes_table_math.cjs` | ✅ | 133 ms |
| `notes_table_media.cjs` | ✅ | 9991 ms |
| `notes_table_tools.cjs` | ✅ | 9197 ms |
| `notes_tone_picker.cjs` | ✅ | 3965 ms |
| `notes_tone_picker_mobile.cjs` | ✅ | 9413 ms |
| `notes_underline.cjs` | ✅ | 8372 ms |
| `parity_structure.cjs` | ✅ | 182 ms |
| `parity_visual.cjs` | ✅ | 18862 ms |
| `pastas_unificadas.cjs` | ✅ | 19872 ms |
| `pwa_service_worker.cjs` | ✅ | 14820 ms |
| `shortcuts.cjs` | ✅ | 21872 ms |
| `split_view.cjs` | ✅ | 10850 ms |
| `sync_chaves.cjs` | ✅ | 248 ms |
| `sync_completo.cjs` | ✅ | 23165 ms |
| `sync_snapshot.cjs` | ✅ | 20281 ms |
| `sync_websocket.cjs` | ✅ | 30997 ms |
| `tema_switch.cjs` | ✅ | 13250 ms |
| `tema_vidro.cjs` | ✅ | 17517 ms |
| `test_notes_editor_ui.cjs` | 🔶 conhecida — Enter em lista aninhada cria nivel diferente do original | 7367 ms |
| `toolbar_pwa.cjs` | ✅ | 14420 ms |

