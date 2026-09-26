# Relatório da suíte de testes

> Gerado por `node tests/run-all.cjs` em 2026-09-26 05:24:18.
> Projeto testado: `C:\Users\Usuario\OneDrive\Desktop\notas-pwa`

**PASSOU: 66 / 76** · FALHOU: 0 · CONHECIDAS: 9 · flaky: 0 · tempo: 560.7 s

Falhas conhecidas (determinísticas, documentadas em `docs/PROBLEMAS-E-MITIGACOES.md` P83): `notes_cascade_defaults.cjs` (cores em cascata divergem do original (paridade do motor)) · `notes_collapse_motion.cjs` (tempo da animacao de colapso diverge do original) · `notes_markdown.cjs` (tabela markdown nao e convertida como no original) · `notes_navigation_completion.cjs` (cor herdada na navegacao por conclusao divergente) · `notes_outline_code.cjs` (colapso de titulo + bloco de codigo diverge do original) · `notes_paste_blocks.cjs` (colagem de blocos de codigo junta linhas do original) · `notes_regression_audit.cjs` (auditoria de regressao: comportamento divergente registrado) · `sync_snapshot.cjs` (aparelho NOVO pode terminar com a nota vazia: o autosave do boot (editor ainda vazio) vence a versao da nuvem no LWW — ver P98 em docs/PROBLEMAS-E-MITIGACOES.md) · `test_notes_editor_ui.cjs` (Enter em lista aninhada cria nivel diferente do original)

| Teste | Resultado | Tempo |
| --- | --- | --- |
| `backend_python.cjs` | ✅ | 23106 ms |
| `conta_login.cjs` | ✅ | 6496 ms |
| `expandir.cjs` | ✅ | 10585 ms |
| `mapa_abertura_padrao.cjs` | ✅ | 4106 ms |
| `mapa_area.cjs` | ✅ | 3305 ms |
| `mapa_atalhos.cjs` | ✅ | 10520 ms |
| `mapa_canvas.cjs` | ✅ | 9104 ms |
| `mapa_chips.cjs` | ✅ | 9604 ms |
| `mapa_colapso.cjs` | ✅ | 16219 ms |
| `mapa_conexoes.cjs` | ✅ | 6793 ms |
| `mapa_conteudo.cjs` | ✅ | 15002 ms |
| `mapa_dragdrop.cjs` | ✅ | 14719 ms |
| `mapa_estilo.cjs` | ✅ | 8210 ms |
| `mapa_gestao.cjs` | ✅ | 8189 ms |
| `mapa_layout.cjs` | ✅ | 10457 ms |
| `mapa_nos.cjs` | ✅ | 10973 ms |
| `mapa_padrao_notas.cjs` | ✅ | 7241 ms |
| `mapa_toolbar.cjs` | ✅ | 7142 ms |
| `mapa_undo.cjs` | ✅ | 8211 ms |
| `mapa_vazio.cjs` | ✅ | 7822 ms |
| `multi_notas.cjs` | ✅ | 9381 ms |
| `multi_notas_100.cjs` | ✅ | 9116 ms |
| `nota_abertura_padrao.cjs` | ✅ | 5696 ms |
| `nota_grande_pwa.cjs` | ✅ | 5533 ms |
| `notes_cascade_defaults.cjs` | 🔶 conhecida — cores em cascata divergem do original (paridade do motor) | 7371 ms |
| `notes_checklist_enter.cjs` | ✅ | 4533 ms |
| `notes_checklist_numbers.cjs` | ✅ | 2662 ms |
| `notes_checklist_order.cjs` | ✅ | 5021 ms |
| `notes_chip_menu.cjs` | ✅ | 5206 ms |
| `notes_clear_all.cjs` | ✅ | 5840 ms |
| `notes_collapse_motion.cjs` | 🔶 conhecida — tempo da animacao de colapso diverge do original | 5524 ms |
| `notes_collapsed_heading.cjs` | ✅ | 6490 ms |
| `notes_colors_persistence.cjs` | ✅ | 3690 ms |
| `notes_completion_spacing.cjs` | ✅ | 5689 ms |
| `notes_cut_background.cjs` | ✅ | 3322 ms |
| `notes_document_migration.cjs` | ✅ | 4909 ms |
| `notes_document_model.cjs` | ✅ | 109 ms |
| `notes_enter_child.cjs` | ✅ | 3580 ms |
| `notes_enter_robust.cjs` | ✅ | 5316 ms |
| `notes_extras.cjs` | ✅ | 16331 ms |
| `notes_import_spacing.cjs` | ✅ | 3585 ms |
| `notes_indent_child.cjs` | ✅ | 2003 ms |
| `notes_indent_levels.cjs` | ✅ | 2999 ms |
| `notes_large_document.cjs` | ✅ | 6075 ms |
| `notes_last_line_enter.cjs` | ✅ | 5869 ms |
| `notes_markdown.cjs` | 🔶 conhecida — tabela markdown nao e convertida como no original | 3772 ms |
| `notes_million.cjs` | ✅ | 5839 ms |
| `notes_million_extras.cjs` | ✅ | 8067 ms |
| `notes_navigation_completion.cjs` | 🔶 conhecida — cor herdada na navegacao por conclusao divergente | 5851 ms |
| `notes_outline_code.cjs` | 🔶 conhecida — colapso de titulo + bloco de codigo diverge do original | 2914 ms |
| `notes_parent_undo.cjs` | ✅ | 8263 ms |
| `notes_paste_blocks.cjs` | 🔶 conhecida — colagem de blocos de codigo junta linhas do original | 8374 ms |
| `notes_paste_selection.cjs` | ✅ | 5080 ms |
| `notes_performance.cjs` | ✅ | 19292 ms |
| `notes_regression_audit.cjs` | 🔶 conhecida — auditoria de regressao: comportamento divergente registrado | 2732 ms |
| `notes_renumber_structure.cjs` | ✅ | 8833 ms |
| `notes_requested_fixes.cjs` | ➖ n/a — exercita telas do dashboard de foco (#focusStageFocusId, #focusStageTitle), que  | 0 ms |
| `notes_table_math.cjs` | ✅ | 82 ms |
| `notes_table_media.cjs` | ✅ | 6133 ms |
| `notes_table_tools.cjs` | ✅ | 9178 ms |
| `notes_tone_picker.cjs` | ✅ | 2898 ms |
| `notes_tone_picker_mobile.cjs` | ✅ | 2896 ms |
| `notes_underline.cjs` | ✅ | 7333 ms |
| `parity_structure.cjs` | ✅ | 118 ms |
| `parity_visual.cjs` | ✅ | 13357 ms |
| `pastas_unificadas.cjs` | ✅ | 6175 ms |
| `pwa_service_worker.cjs` | ✅ | 7696 ms |
| `shortcuts.cjs` | ✅ | 13523 ms |
| `split_view.cjs` | ✅ | 6529 ms |
| `sync_chaves.cjs` | ✅ | 214 ms |
| `sync_completo.cjs` | ✅ | 10218 ms |
| `sync_snapshot.cjs` | 🔶 conhecida — aparelho NOVO pode terminar com a nota vazia: o autosave do boot (edit | 31089 ms |
| `tema_switch.cjs` | ✅ | 5280 ms |
| `tema_vidro.cjs` | ✅ | 8445 ms |
| `test_notes_editor_ui.cjs` | 🔶 conhecida — Enter em lista aninhada cria nivel diferente do original | 4445 ms |
| `toolbar_pwa.cjs` | ✅ | 12403 ms |

