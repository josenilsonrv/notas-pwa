# Relatório da suíte de testes

> Gerado por `node tests/run-all.cjs` em 2026-09-26 20:26:58.
> Projeto testado: `C:\Users\Usuario\OneDrive\Desktop\notas-pwa`

**PASSOU: 76 / 83** · FALHOU: 0 · CONHECIDAS: 6 · flaky: 0 · tempo: 632.0 s

Falhas conhecidas (determinísticas, documentadas em `docs/PROBLEMAS-E-MITIGACOES.md` P83): `notes_cascade_defaults.cjs` (cores em cascata divergem do original (paridade do motor)) · `notes_markdown.cjs` (tabela markdown nao e convertida como no original) · `notes_navigation_completion.cjs` (cor herdada na navegacao por conclusao divergente) · `notes_outline_code.cjs` (colapso de titulo + bloco de codigo diverge do original) · `notes_paste_blocks.cjs` (colagem de blocos de codigo junta linhas do original) · `test_notes_editor_ui.cjs` (Enter em lista aninhada cria nivel diferente do original)

⚠️ Passaram e ainda estão na lista — remova de `FALHAS_CONHECIDAS`: `notes_collapse_motion.cjs`, `notes_regression_audit.cjs`

| Teste | Resultado | Tempo |
| --- | --- | --- |
| `alternar_areas_mobile.cjs` | ✅ | 7771 ms |
| `backend_python.cjs` | ✅ | 19026 ms |
| `barras_botoes.cjs` | ✅ | 7737 ms |
| `conta_google.cjs` | ✅ | 10613 ms |
| `conta_login.cjs` | ✅ | 7107 ms |
| `expandir.cjs` | ✅ | 13862 ms |
| `mapa_abertura_padrao.cjs` | ✅ | 20758 ms |
| `mapa_area.cjs` | ✅ | 4678 ms |
| `mapa_atalhos.cjs` | ✅ | 9549 ms |
| `mapa_canvas.cjs` | ✅ | 6138 ms |
| `mapa_chips.cjs` | ✅ | 5512 ms |
| `mapa_colapso.cjs` | ✅ | 7600 ms |
| `mapa_conexoes.cjs` | ✅ | 8087 ms |
| `mapa_conteudo.cjs` | ✅ | 6506 ms |
| `mapa_dragdrop.cjs` | ✅ | 5647 ms |
| `mapa_estilo.cjs` | ✅ | 5637 ms |
| `mapa_gestao.cjs` | ✅ | 7418 ms |
| `mapa_layout.cjs` | ✅ | 7260 ms |
| `mapa_nos.cjs` | ✅ | 9939 ms |
| `mapa_padrao_notas.cjs` | ✅ | 6778 ms |
| `mapa_toolbar.cjs` | ✅ | 7333 ms |
| `mapa_undo.cjs` | ✅ | 7808 ms |
| `mapa_vazio.cjs` | ✅ | 6747 ms |
| `modo_local_sem_backend.cjs` | ✅ | 8014 ms |
| `multi_notas.cjs` | ✅ | 9140 ms |
| `multi_notas_100.cjs` | ✅ | 3714 ms |
| `nota_abertura_padrao.cjs` | ✅ | 4565 ms |
| `nota_grande_pwa.cjs` | ✅ | 5519 ms |
| `notes_anexos_nuvem.cjs` | ✅ | 17668 ms |
| `notes_cascade_defaults.cjs` | 🔶 conhecida — cores em cascata divergem do original (paridade do motor) | 6519 ms |
| `notes_checklist_enter.cjs` | ✅ | 6489 ms |
| `notes_checklist_numbers.cjs` | ✅ | 3713 ms |
| `notes_checklist_order.cjs` | ✅ | 2895 ms |
| `notes_chip_menu.cjs` | ✅ | 7192 ms |
| `notes_clear_all.cjs` | ✅ | 5441 ms |
| `notes_collapse_motion.cjs` | ✅ | 3816 ms |
| `notes_collapsed_heading.cjs` | ✅ | 6313 ms |
| `notes_colors_persistence.cjs` | ✅ | 1861 ms |
| `notes_completion_spacing.cjs` | ✅ | 4124 ms |
| `notes_cut_background.cjs` | ✅ | 5384 ms |
| `notes_document_migration.cjs` | ✅ | 6429 ms |
| `notes_document_model.cjs` | ✅ | 123 ms |
| `notes_enter_child.cjs` | ✅ | 4722 ms |
| `notes_enter_robust.cjs` | ✅ | 5566 ms |
| `notes_extras.cjs` | ✅ | 16721 ms |
| `notes_import_spacing.cjs` | ✅ | 3164 ms |
| `notes_indent_child.cjs` | ✅ | 3691 ms |
| `notes_indent_levels.cjs` | ✅ | 6727 ms |
| `notes_large_document.cjs` | ✅ | 8209 ms |
| `notes_last_line_enter.cjs` | ✅ | 7331 ms |
| `notes_markdown.cjs` | 🔶 conhecida — tabela markdown nao e convertida como no original | 6467 ms |
| `notes_million.cjs` | ✅ | 5523 ms |
| `notes_million_extras.cjs` | ✅ | 5791 ms |
| `notes_navigation_completion.cjs` | 🔶 conhecida — cor herdada na navegacao por conclusao divergente | 8793 ms |
| `notes_outline_code.cjs` | 🔶 conhecida — colapso de titulo + bloco de codigo diverge do original | 5040 ms |
| `notes_parent_undo.cjs` | ✅ | 7143 ms |
| `notes_paste_blocks.cjs` | 🔶 conhecida — colagem de blocos de codigo junta linhas do original | 10684 ms |
| `notes_paste_selection.cjs` | ✅ | 6227 ms |
| `notes_performance.cjs` | ✅ | 4183 ms |
| `notes_regression_audit.cjs` | ✅ | 5135 ms |
| `notes_renumber_structure.cjs` | ✅ | 4491 ms |
| `notes_requested_fixes.cjs` | ➖ n/a — exercita telas do dashboard de foco (#focusStageFocusId, #focusStageTitle), que  | 0 ms |
| `notes_table_math.cjs` | ✅ | 117 ms |
| `notes_table_media.cjs` | ✅ | 8405 ms |
| `notes_table_tools.cjs` | ✅ | 8319 ms |
| `notes_tone_picker.cjs` | ✅ | 2921 ms |
| `notes_tone_picker_mobile.cjs` | ✅ | 3604 ms |
| `notes_underline.cjs` | ✅ | 5098 ms |
| `paletas_tema.cjs` | ✅ | 5575 ms |
| `parity_structure.cjs` | ✅ | 159 ms |
| `parity_visual.cjs` | ✅ | 15597 ms |
| `pastas_unificadas.cjs` | ✅ | 11161 ms |
| `pwa_service_worker.cjs` | ✅ | 5733 ms |
| `shortcuts.cjs` | ✅ | 19385 ms |
| `split_view.cjs` | ✅ | 12057 ms |
| `sync_chaves.cjs` | ✅ | 146 ms |
| `sync_completo.cjs` | ✅ | 10882 ms |
| `sync_snapshot.cjs` | ✅ | 16382 ms |
| `sync_websocket.cjs` | ✅ | 31087 ms |
| `tema_switch.cjs` | ✅ | 5111 ms |
| `tema_vidro.cjs` | ✅ | 13617 ms |
| `test_notes_editor_ui.cjs` | 🔶 conhecida — Enter em lista aninhada cria nivel diferente do original | 6815 ms |
| `toolbar_pwa.cjs` | ✅ | 15773 ms |

