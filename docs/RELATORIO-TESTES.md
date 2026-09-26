# Relatório da suíte de testes

> Gerado por `node tests/run-all.cjs` em 2026-09-26 22:11:23.
> Projeto testado: `C:\Users\Usuario\OneDrive\Desktop\notas-pwa`

**PASSOU: 76 / 84** · FALHOU: 0 · CONHECIDAS: 7 · flaky: 0 · tempo: 575.9 s

Falhas conhecidas (determinísticas, documentadas em `docs/PROBLEMAS-E-MITIGACOES.md` P83): `notes_cascade_defaults.cjs` (cores em cascata divergem do original (paridade do motor)) · `notes_collapse_motion.cjs` (tempo da animacao de colapso diverge do original) · `notes_markdown.cjs` (tabela markdown nao e convertida como no original) · `notes_navigation_completion.cjs` (cor herdada na navegacao por conclusao divergente) · `notes_outline_code.cjs` (colapso de titulo + bloco de codigo diverge do original) · `notes_paste_blocks.cjs` (colagem de blocos de codigo junta linhas do original) · `test_notes_editor_ui.cjs` (Enter em lista aninhada cria nivel diferente do original)

⚠️ Passaram e ainda estão na lista — remova de `FALHAS_CONHECIDAS`: `notes_regression_audit.cjs`

| Teste | Resultado | Tempo |
| --- | --- | --- |
| `alternar_areas_mobile.cjs` | ✅ | 6944 ms |
| `backend_python.cjs` | ✅ | 19546 ms |
| `barras_botoes.cjs` | ✅ | 6842 ms |
| `conta_google.cjs` | ✅ | 7819 ms |
| `conta_login.cjs` | ✅ | 7415 ms |
| `expandir.cjs` | ✅ | 13940 ms |
| `mapa_abertura_padrao.cjs` | ✅ | 5319 ms |
| `mapa_area.cjs` | ✅ | 5507 ms |
| `mapa_atalhos.cjs` | ✅ | 6130 ms |
| `mapa_canvas.cjs` | ✅ | 6700 ms |
| `mapa_chips.cjs` | ✅ | 4548 ms |
| `mapa_colapso.cjs` | ✅ | 8977 ms |
| `mapa_conexoes.cjs` | ✅ | 5920 ms |
| `mapa_conteudo.cjs` | ✅ | 6877 ms |
| `mapa_dragdrop.cjs` | ✅ | 6561 ms |
| `mapa_estilo.cjs` | ✅ | 6548 ms |
| `mapa_gestao.cjs` | ✅ | 8146 ms |
| `mapa_layout.cjs` | ✅ | 8359 ms |
| `mapa_mobile_topbar.cjs` | ✅ | 30572 ms |
| `mapa_nos.cjs` | ✅ | 11069 ms |
| `mapa_padrao_notas.cjs` | ✅ | 6918 ms |
| `mapa_toolbar.cjs` | ✅ | 7462 ms |
| `mapa_undo.cjs` | ✅ | 7879 ms |
| `mapa_vazio.cjs` | ✅ | 6325 ms |
| `modo_local_sem_backend.cjs` | ✅ | 7414 ms |
| `multi_notas.cjs` | ✅ | 9428 ms |
| `multi_notas_100.cjs` | ✅ | 4133 ms |
| `nota_abertura_padrao.cjs` | ✅ | 7310 ms |
| `nota_grande_pwa.cjs` | ✅ | 5943 ms |
| `notes_anexos_nuvem.cjs` | ✅ | 16801 ms |
| `notes_cascade_defaults.cjs` | 🔶 conhecida — cores em cascata divergem do original (paridade do motor) | 6427 ms |
| `notes_checklist_enter.cjs` | ✅ | 5248 ms |
| `notes_checklist_numbers.cjs` | ✅ | 2935 ms |
| `notes_checklist_order.cjs` | ✅ | 4035 ms |
| `notes_chip_menu.cjs` | ✅ | 6199 ms |
| `notes_clear_all.cjs` | ✅ | 5748 ms |
| `notes_collapse_motion.cjs` | 🔶 conhecida — tempo da animacao de colapso diverge do original | 4476 ms |
| `notes_collapsed_heading.cjs` | ✅ | 5772 ms |
| `notes_colors_persistence.cjs` | ✅ | 1806 ms |
| `notes_completion_spacing.cjs` | ✅ | 4904 ms |
| `notes_cut_background.cjs` | ✅ | 3766 ms |
| `notes_document_migration.cjs` | ✅ | 5729 ms |
| `notes_document_model.cjs` | ✅ | 263 ms |
| `notes_enter_child.cjs` | ✅ | 3605 ms |
| `notes_enter_robust.cjs` | ✅ | 7041 ms |
| `notes_extras.cjs` | ✅ | 17698 ms |
| `notes_import_spacing.cjs` | ✅ | 4851 ms |
| `notes_indent_child.cjs` | ✅ | 4782 ms |
| `notes_indent_levels.cjs` | ✅ | 4046 ms |
| `notes_large_document.cjs` | ✅ | 4964 ms |
| `notes_last_line_enter.cjs` | ✅ | 4974 ms |
| `notes_markdown.cjs` | 🔶 conhecida — tabela markdown nao e convertida como no original | 5811 ms |
| `notes_million.cjs` | ✅ | 6034 ms |
| `notes_million_extras.cjs` | ✅ | 6956 ms |
| `notes_navigation_completion.cjs` | 🔶 conhecida — cor herdada na navegacao por conclusao divergente | 7600 ms |
| `notes_outline_code.cjs` | 🔶 conhecida — colapso de titulo + bloco de codigo diverge do original | 5620 ms |
| `notes_parent_undo.cjs` | ✅ | 6175 ms |
| `notes_paste_blocks.cjs` | 🔶 conhecida — colagem de blocos de codigo junta linhas do original | 3466 ms |
| `notes_paste_selection.cjs` | ✅ | 4404 ms |
| `notes_performance.cjs` | ✅ | 4477 ms |
| `notes_regression_audit.cjs` | ✅ | 4378 ms |
| `notes_renumber_structure.cjs` | ✅ | 3509 ms |
| `notes_requested_fixes.cjs` | ➖ n/a — exercita telas do dashboard de foco (#focusStageFocusId, #focusStageTitle), que  | 0 ms |
| `notes_table_math.cjs` | ✅ | 92 ms |
| `notes_table_media.cjs` | ✅ | 7061 ms |
| `notes_table_tools.cjs` | ✅ | 8664 ms |
| `notes_tone_picker.cjs` | ✅ | 3315 ms |
| `notes_tone_picker_mobile.cjs` | ✅ | 3696 ms |
| `notes_underline.cjs` | ✅ | 4481 ms |
| `paletas_tema.cjs` | ✅ | 2974 ms |
| `parity_structure.cjs` | ✅ | 86 ms |
| `parity_visual.cjs` | ✅ | 11002 ms |
| `pastas_unificadas.cjs` | ✅ | 7188 ms |
| `pwa_service_worker.cjs` | ✅ | 6336 ms |
| `shortcuts.cjs` | ✅ | 13541 ms |
| `split_view.cjs` | ✅ | 7284 ms |
| `sync_chaves.cjs` | ✅ | 87 ms |
| `sync_completo.cjs` | ✅ | 6517 ms |
| `sync_snapshot.cjs` | ✅ | 9225 ms |
| `sync_websocket.cjs` | ✅ | 23756 ms |
| `tema_switch.cjs` | ✅ | 4044 ms |
| `tema_vidro.cjs` | ✅ | 7747 ms |
| `test_notes_editor_ui.cjs` | 🔶 conhecida — Enter em lista aninhada cria nivel diferente do original | 5672 ms |
| `toolbar_pwa.cjs` | ✅ | 12044 ms |

