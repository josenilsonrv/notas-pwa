# Relatório da suíte de testes

> Gerado por `node tests/run-all.cjs` em 2026-09-26 14:43:47.
> Projeto testado: `C:\Users\Usuario\OneDrive\Desktop\notas-pwa`

**PASSOU: 71 / 80** · FALHOU: 0 · CONHECIDAS: 8 · flaky: 1 · tempo: 753.9 s

Falhas conhecidas (determinísticas, documentadas em `docs/PROBLEMAS-E-MITIGACOES.md` P83): `notes_cascade_defaults.cjs` (cores em cascata divergem do original (paridade do motor)) · `notes_collapse_motion.cjs` (tempo da animacao de colapso diverge do original) · `notes_markdown.cjs` (tabela markdown nao e convertida como no original) · `notes_navigation_completion.cjs` (cor herdada na navegacao por conclusao divergente) · `notes_outline_code.cjs` (colapso de titulo + bloco de codigo diverge do original) · `notes_paste_blocks.cjs` (colagem de blocos de codigo junta linhas do original) · `notes_regression_audit.cjs` (auditoria de regressao: comportamento divergente registrado) · `test_notes_editor_ui.cjs` (Enter em lista aninhada cria nivel diferente do original)

| Teste | Resultado | Tempo |
| --- | --- | --- |
| `backend_python.cjs` | ✅ | 33150 ms |
| `conta_google.cjs` | ✅ | 8863 ms |
| `conta_login.cjs` | ✅ | 6516 ms |
| `expandir.cjs` | ✅ | 9913 ms |
| `mapa_abertura_padrao.cjs` | ✅ | 4891 ms |
| `mapa_area.cjs` | ✅ | 18991 ms |
| `mapa_atalhos.cjs` | ⚠️ passou com retry | 8382 ms |
| `mapa_canvas.cjs` | ✅ | 6769 ms |
| `mapa_chips.cjs` | ✅ | 7180 ms |
| `mapa_colapso.cjs` | ✅ | 11399 ms |
| `mapa_conexoes.cjs` | ✅ | 9911 ms |
| `mapa_conteudo.cjs` | ✅ | 10875 ms |
| `mapa_dragdrop.cjs` | ✅ | 10536 ms |
| `mapa_estilo.cjs` | ✅ | 11778 ms |
| `mapa_gestao.cjs` | ✅ | 11543 ms |
| `mapa_layout.cjs` | ✅ | 16230 ms |
| `mapa_nos.cjs` | ✅ | 16400 ms |
| `mapa_padrao_notas.cjs` | ✅ | 10326 ms |
| `mapa_toolbar.cjs` | ✅ | 10135 ms |
| `mapa_undo.cjs` | ✅ | 8373 ms |
| `mapa_vazio.cjs` | ✅ | 8150 ms |
| `modo_local_sem_backend.cjs` | ✅ | 8006 ms |
| `multi_notas.cjs` | ✅ | 14955 ms |
| `multi_notas_100.cjs` | ✅ | 7608 ms |
| `nota_abertura_padrao.cjs` | ✅ | 10528 ms |
| `nota_grande_pwa.cjs` | ✅ | 9956 ms |
| `notes_anexos_nuvem.cjs` | ✅ | 21439 ms |
| `notes_cascade_defaults.cjs` | 🔶 conhecida — cores em cascata divergem do original (paridade do motor) | 7068 ms |
| `notes_checklist_enter.cjs` | ✅ | 4064 ms |
| `notes_checklist_numbers.cjs` | ✅ | 3210 ms |
| `notes_checklist_order.cjs` | ✅ | 6138 ms |
| `notes_chip_menu.cjs` | ✅ | 7679 ms |
| `notes_clear_all.cjs` | ✅ | 7163 ms |
| `notes_collapse_motion.cjs` | 🔶 conhecida — tempo da animacao de colapso diverge do original | 4915 ms |
| `notes_collapsed_heading.cjs` | ✅ | 7161 ms |
| `notes_colors_persistence.cjs` | ✅ | 2483 ms |
| `notes_completion_spacing.cjs` | ✅ | 5563 ms |
| `notes_cut_background.cjs` | ✅ | 5379 ms |
| `notes_document_migration.cjs` | ✅ | 7272 ms |
| `notes_document_model.cjs` | ✅ | 134 ms |
| `notes_enter_child.cjs` | ✅ | 6096 ms |
| `notes_enter_robust.cjs` | ✅ | 7522 ms |
| `notes_extras.cjs` | ✅ | 18943 ms |
| `notes_import_spacing.cjs` | ✅ | 4464 ms |
| `notes_indent_child.cjs` | ✅ | 2488 ms |
| `notes_indent_levels.cjs` | ✅ | 5151 ms |
| `notes_large_document.cjs` | ✅ | 6539 ms |
| `notes_last_line_enter.cjs` | ✅ | 6483 ms |
| `notes_markdown.cjs` | 🔶 conhecida — tabela markdown nao e convertida como no original | 7483 ms |
| `notes_million.cjs` | ✅ | 8622 ms |
| `notes_million_extras.cjs` | ✅ | 9910 ms |
| `notes_navigation_completion.cjs` | 🔶 conhecida — cor herdada na navegacao por conclusao divergente | 8824 ms |
| `notes_outline_code.cjs` | 🔶 conhecida — colapso de titulo + bloco de codigo diverge do original | 5153 ms |
| `notes_parent_undo.cjs` | ✅ | 5761 ms |
| `notes_paste_blocks.cjs` | 🔶 conhecida — colagem de blocos de codigo junta linhas do original | 8346 ms |
| `notes_paste_selection.cjs` | ✅ | 7521 ms |
| `notes_performance.cjs` | ✅ | 13301 ms |
| `notes_regression_audit.cjs` | 🔶 conhecida — auditoria de regressao: comportamento divergente registrado | 9203 ms |
| `notes_renumber_structure.cjs` | ✅ | 7145 ms |
| `notes_requested_fixes.cjs` | ➖ n/a — exercita telas do dashboard de foco (#focusStageFocusId, #focusStageTitle), que  | 0 ms |
| `notes_table_math.cjs` | ✅ | 169 ms |
| `notes_table_media.cjs` | ✅ | 8043 ms |
| `notes_table_tools.cjs` | ✅ | 8782 ms |
| `notes_tone_picker.cjs` | ✅ | 3473 ms |
| `notes_tone_picker_mobile.cjs` | ✅ | 5609 ms |
| `notes_underline.cjs` | ✅ | 20607 ms |
| `parity_structure.cjs` | ✅ | 132 ms |
| `parity_visual.cjs` | ✅ | 13320 ms |
| `pastas_unificadas.cjs` | ✅ | 8346 ms |
| `pwa_service_worker.cjs` | ✅ | 6826 ms |
| `shortcuts.cjs` | ✅ | 17013 ms |
| `split_view.cjs` | ✅ | 14275 ms |
| `sync_chaves.cjs` | ✅ | 106 ms |
| `sync_completo.cjs` | ✅ | 15364 ms |
| `sync_snapshot.cjs` | ✅ | 21783 ms |
| `sync_websocket.cjs` | ✅ | 30373 ms |
| `tema_switch.cjs` | ✅ | 6628 ms |
| `tema_vidro.cjs` | ✅ | 14542 ms |
| `test_notes_editor_ui.cjs` | 🔶 conhecida — Enter em lista aninhada cria nivel diferente do original | 11398 ms |
| `toolbar_pwa.cjs` | ✅ | 17145 ms |

