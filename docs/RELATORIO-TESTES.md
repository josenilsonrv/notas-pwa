# Relatório da suíte de testes

> Gerado por `node tests/run-all.cjs` em 2026-10-06 20:10:24.
> Projeto testado: `C:\Users\Usuario\OneDrive\Desktop\notas-pwa`

**PASSOU: 78 / 86** · FALHOU: 0 · CONHECIDAS: 7 · flaky: 0 · tempo: 475.0 s

Falhas conhecidas (determinísticas, documentadas em `docs/PROBLEMAS-E-MITIGACOES.md` P83): `notes_cascade_defaults.cjs` (cores em cascata divergem do original (paridade do motor)) · `notes_collapse_motion.cjs` (tempo da animacao de colapso diverge do original) · `notes_markdown.cjs` (tabela markdown nao e convertida como no original) · `notes_navigation_completion.cjs` (cor herdada na navegacao por conclusao divergente) · `notes_outline_code.cjs` (colapso de titulo + bloco de codigo diverge do original) · `notes_paste_blocks.cjs` (colagem de blocos de codigo junta linhas do original) · `test_notes_editor_ui.cjs` (Enter em lista aninhada cria nivel diferente do original)

⚠️ Passaram e ainda estão na lista — remova de `FALHAS_CONHECIDAS`: `notes_regression_audit.cjs`

| Teste | Resultado | Tempo |
| --- | --- | --- |
| `alternar_areas_mobile.cjs` | ✅ | 6231 ms |
| `backend_python.cjs` | ✅ | 12310 ms |
| `barras_botoes.cjs` | ✅ | 6091 ms |
| `conta_google.cjs` | ✅ | 6730 ms |
| `conta_login.cjs` | ✅ | 4524 ms |
| `expandir.cjs` | ✅ | 10839 ms |
| `mapa_abertura_padrao.cjs` | ✅ | 3816 ms |
| `mapa_area.cjs` | ✅ | 2469 ms |
| `mapa_atalhos.cjs` | ✅ | 4027 ms |
| `mapa_canvas.cjs` | ✅ | 4981 ms |
| `mapa_chips.cjs` | ✅ | 3546 ms |
| `mapa_colapso.cjs` | ✅ | 6353 ms |
| `mapa_conexoes.cjs` | ✅ | 4369 ms |
| `mapa_conteudo.cjs` | ✅ | 6423 ms |
| `mapa_dragdrop.cjs` | ✅ | 5630 ms |
| `mapa_estilo.cjs` | ✅ | 4046 ms |
| `mapa_gestao.cjs` | ✅ | 3812 ms |
| `mapa_layout.cjs` | ✅ | 3745 ms |
| `mapa_mobile_topbar.cjs` | ✅ | 26314 ms |
| `mapa_nos.cjs` | ✅ | 6246 ms |
| `mapa_padrao_notas.cjs` | ✅ | 3974 ms |
| `mapa_toolbar.cjs` | ✅ | 4696 ms |
| `mapa_undo.cjs` | ✅ | 4563 ms |
| `mapa_vazio.cjs` | ✅ | 3673 ms |
| `modo_local_sem_backend.cjs` | ✅ | 5191 ms |
| `multi_notas.cjs` | ✅ | 7327 ms |
| `multi_notas_100.cjs` | ✅ | 2924 ms |
| `nota_abertura_padrao.cjs` | ✅ | 3065 ms |
| `nota_grande_pwa.cjs` | ✅ | 3185 ms |
| `notes_anexos_nuvem.cjs` | ✅ | 11434 ms |
| `notes_cascade_defaults.cjs` | 🔶 conhecida — cores em cascata divergem do original (paridade do motor) | 4233 ms |
| `notes_checklist_enter.cjs` | ✅ | 2810 ms |
| `notes_checklist_numbers.cjs` | ✅ | 1661 ms |
| `notes_checklist_order.cjs` | ✅ | 1948 ms |
| `notes_chip_menu.cjs` | ✅ | 4244 ms |
| `notes_clear_all.cjs` | ✅ | 4137 ms |
| `notes_collapse_motion.cjs` | 🔶 conhecida — tempo da animacao de colapso diverge do original | 2771 ms |
| `notes_collapsed_heading.cjs` | ✅ | 4948 ms |
| `notes_colors_persistence.cjs` | ✅ | 1997 ms |
| `notes_completion_spacing.cjs` | ✅ | 3584 ms |
| `notes_cut_background.cjs` | ✅ | 5268 ms |
| `notes_document_migration.cjs` | ✅ | 3505 ms |
| `notes_document_model.cjs` | ✅ | 107 ms |
| `notes_enter_child.cjs` | ✅ | 1693 ms |
| `notes_enter_robust.cjs` | ✅ | 4316 ms |
| `notes_extras.cjs` | ✅ | 13892 ms |
| `notes_import_spacing.cjs` | ✅ | 2905 ms |
| `notes_indent_child.cjs` | ✅ | 16677 ms |
| `notes_indent_levels.cjs` | ✅ | 2657 ms |
| `notes_large_document.cjs` | ✅ | 3744 ms |
| `notes_last_line_enter.cjs` | ✅ | 4238 ms |
| `notes_markdown.cjs` | 🔶 conhecida — tabela markdown nao e convertida como no original | 3333 ms |
| `notes_million.cjs` | ✅ | 3925 ms |
| `notes_million_extras.cjs` | ✅ | 3911 ms |
| `notes_navigation_completion.cjs` | 🔶 conhecida — cor herdada na navegacao por conclusao divergente | 5192 ms |
| `notes_outline_code.cjs` | 🔶 conhecida — colapso de titulo + bloco de codigo diverge do original | 2829 ms |
| `notes_parent_undo.cjs` | ✅ | 3791 ms |
| `notes_paste_blocks.cjs` | 🔶 conhecida — colagem de blocos de codigo junta linhas do original | 2622 ms |
| `notes_paste_selection.cjs` | ✅ | 4013 ms |
| `notes_performance.cjs` | ✅ | 4156 ms |
| `notes_regression_audit.cjs` | ✅ | 3450 ms |
| `notes_renumber_structure.cjs` | ✅ | 4347 ms |
| `notes_requested_fixes.cjs` | ➖ n/a — exercita telas do dashboard de foco (#focusStageFocusId, #focusStageTitle), que  | 0 ms |
| `notes_table_math.cjs` | ✅ | 142 ms |
| `notes_table_media.cjs` | ✅ | 6963 ms |
| `notes_table_tools.cjs` | ✅ | 7245 ms |
| `notes_tone_picker.cjs` | ✅ | 3124 ms |
| `notes_tone_picker_mobile.cjs` | ✅ | 3531 ms |
| `notes_underline.cjs` | ✅ | 6600 ms |
| `paletas_tema.cjs` | ✅ | 7016 ms |
| `parity_structure.cjs` | ✅ | 143 ms |
| `parity_visual.cjs` | ✅ | 12952 ms |
| `pastas_unificadas.cjs` | ✅ | 8466 ms |
| `pdf_visualizador.cjs` | ✅ | 12865 ms |
| `pwa_service_worker.cjs` | ✅ | 3056 ms |
| `shortcuts.cjs` | ✅ | 10452 ms |
| `split_view.cjs` | ✅ | 6707 ms |
| `sync_chaves.cjs` | ✅ | 80 ms |
| `sync_completo.cjs` | ✅ | 9128 ms |
| `sync_cursor_refresh.cjs` | ✅ | 3249 ms |
| `sync_snapshot.cjs` | ✅ | 9965 ms |
| `sync_websocket.cjs` | ✅ | 20481 ms |
| `tema_switch.cjs` | ✅ | 3928 ms |
| `tema_vidro.cjs` | ✅ | 7343 ms |
| `test_notes_editor_ui.cjs` | 🔶 conhecida — Enter em lista aninhada cria nivel diferente do original | 4150 ms |
| `toolbar_pwa.cjs` | ✅ | 11947 ms |

