# Matriz de rastreabilidade — regra → teste

> Gerado por `node tools/gerar-rastreabilidade.cjs` em 2026-09-24.
> ✅ = existe teste que exercita a regra · ❌ = lacuna a cobrir (Fase 4).

## Comandos

| Regra | Testes que cobrem | Status |
| --- | --- | --- |
| `bold` | notes_paste_blocks, notes_table_tools, test_notes_editor_ui, notes_collapsed_heading (novo), notes_paste_blocks (novo), notes_table_tools (novo), test_notes_editor_ui (novo) | ✅ |
| `checklist` | notes_document_migration, notes_paste_blocks, test_notes_editor_ui, notes_checklist_enter (novo), notes_checklist_numbers (novo), notes_checklist_order (novo), notes_document_migration (novo), notes_paste_blocks (novo), test_notes_editor_ui (novo) | ✅ |
| `codeBlock` | notes_requested_fixes, notes_requested_fixes (novo) | ✅ |
| `collapseAll` | notes_requested_fixes, notes_requested_fixes (novo) | ✅ |
| `heading1` | test_notes_editor_ui, shortcuts (novo), test_notes_editor_ui (novo) | ✅ |
| `heading2` | test_notes_editor_ui, test_notes_editor_ui (novo) | ✅ |
| `heading3` | notes_requested_fixes, test_notes_editor_ui, notes_requested_fixes (novo), test_notes_editor_ui (novo) | ✅ |
| `indent` | notes_document_model, notes_navigation_completion, notes_paste_blocks, notes_renumber_structure, test_notes_editor_ui, notes_document_model (novo), notes_indent_child (novo), notes_indent_levels (novo), notes_navigation_completion (novo), notes_paste_blocks (novo), notes_renumber_structure (novo), shortcuts (novo), test_notes_editor_ui (novo) | ✅ |
| `insertOrderedList` | notes_paste_blocks, notes_renumber_structure, test_notes_editor_ui, notes_paste_blocks (novo), notes_renumber_structure (novo), test_notes_editor_ui (novo) | ✅ |
| `insertUnorderedList` | — | ❌ |
| `italic` | notes_regression_audit, test_notes_editor_ui, notes_regression_audit (novo), test_notes_editor_ui (novo) | ✅ |
| `moveDown` | notes_document_migration, test_notes_editor_ui, notes_document_migration (novo), test_notes_editor_ui (novo) | ✅ |
| `moveUp` | notes_renumber_structure, test_notes_editor_ui, notes_renumber_structure (novo), test_notes_editor_ui (novo) | ✅ |
| `outdent` | notes_renumber_structure, test_notes_editor_ui, notes_indent_levels (novo), notes_renumber_structure (novo), shortcuts (novo), test_notes_editor_ui (novo) | ✅ |
| `redo` | notes_parent_undo, test_notes_editor_ui, notes_parent_undo (novo), test_notes_editor_ui (novo) | ✅ |
| `strikeThrough` | shortcuts (novo) | ✅ |
| `underline` | notes_underline (novo), parity_structure (novo) | ✅ |
| `undo` | notes_cut_background, notes_document_migration, notes_extras, notes_markdown, notes_parent_undo, notes_table_media, notes_table_tools, test_notes_editor_ui, mapa_canvas (novo), notes_cut_background (novo), notes_document_migration (novo), notes_extras (novo), notes_indent_levels (novo), notes_markdown (novo), notes_parent_undo (novo), notes_table_media (novo), notes_table_tools (novo), parity_visual (novo), tema_vidro (novo), test_notes_editor_ui (novo) | ✅ |

## Atalhos

| Regra | Testes que cobrem | Status |
| --- | --- | --- |
| `Ctrl/Cmd+Z` → undo | exercitado via press(Control+z) | ✅ |
| `Ctrl/Cmd+Shift+Z` → redo | exercitado via press(Control+Shift+z) | ✅ |
| `Ctrl/Cmd+Y` → redo | — | ❌ |
| `Ctrl/Cmd+S` → salvar | exercitado via press(Control+s) | ✅ |
| `Ctrl/Cmd+B` → bold | exercitado via press(Control+b) | ✅ |
| `Ctrl/Cmd+I` → italic | — | ❌ |
| `Tab` → indent | citado em notes_cascade_defaults, notes_extras, notes_indent_child, notes_table_media, notes_tone_picker, notes_tone_picker_mobile, test_notes_editor_ui, mapa_area, mapa_gestao, mapa_vazio, notes_cascade_defaults, notes_collapse_motion, notes_completion_spacing, notes_cut_background, notes_document_migration, notes_extras, notes_import_spacing, notes_indent_child, notes_indent_levels, notes_large_document, notes_last_line_enter, notes_markdown, notes_million, notes_million_extras, notes_navigation_completion, notes_outline_code, notes_parent_undo, notes_paste_blocks, notes_paste_selection, notes_performance, notes_regression_audit, notes_renumber_structure, notes_requested_fixes, notes_table_media, notes_table_tools, notes_tone_picker, notes_tone_picker_mobile, notes_underline, shortcuts, test_notes_editor_ui | ✅ |
| `Shift+Tab` → outdent | citado em test_notes_editor_ui, notes_indent_levels, shortcuts, test_notes_editor_ui | ✅ |
| `Alt+ArrowUp` → moveUp | exercitado via press(Alt+ArrowUp) | ✅ |
| `Alt+ArrowDown` → moveDown | exercitado via press(Alt+ArrowDown) | ✅ |
| `Ctrl+Alt+1` → heading1 | citado em shortcuts | ✅ |
| `Ctrl+Alt+2` → heading2 | citado em shortcuts | ✅ |
| `Ctrl+Alt+3` → heading3 | citado em shortcuts | ✅ |
| `Ctrl+Alt+4` → checklist | citado em shortcuts | ✅ |
| `Ctrl+Alt+5` → insertOrderedList | citado em shortcuts | ✅ |
| `Ctrl+Alt+6` → insertUnorderedList | citado em shortcuts | ✅ |
| `Ctrl+Alt+7` → strikeThrough | citado em shortcuts | ✅ |
| `Ctrl+U` → underline | citado em notes_underline | ✅ |
| `Ctrl+Alt+8` → picker color | — | ❌ |
| `Ctrl+Alt+9` → picker backgroundColor | — | ❌ |
| `Ctrl+Alt+0` → toggleNotesFullscreen | citado em shortcuts | ✅ |
| `Ctrl+Alt+T` → toggleNotesHeaderCollapse | citado em shortcuts | ✅ |
| `Ctrl+Alt+L` → animateNotesLineCollapse | — | ❌ |
| `Ctrl+Shift+I` → notesInsertMenu | — | ❌ |
| `Ctrl+Shift+H` → notesDivider | exercitado via press(Control+Shift+H) | ✅ |
| `Ctrl+K` → notesLinkDialog | exercitado via press(Control+k) | ✅ |
| `Ctrl+Alt+M` → notesTemplates | — | ❌ |
| `Ctrl+Alt+Q` → notesTableDialog | exercitado via press(Control+Alt+q) | ✅ |

## Métodos públicos do motor

| Regra | Testes que cobrem | Status |
| --- | --- | --- |
| `animateNotesMovement` | — | ✅ |
| `applyNotesOutlineDefaults` | — | ✅ |
| `applyNotesTextStyle` | notes_regression_audit, notes_regression_audit (novo) | ✅ |
| `beginNotesSession` | — | ✅ |
| `closeNotesColorPanels` | — | ✅ |
| `executeNotesCommand` | notes_cascade_defaults, notes_collapse_motion, notes_completion_spacing, notes_cut_background, notes_document_migration, notes_extras, notes_import_spacing, notes_large_document, notes_last_line_enter, notes_markdown, notes_million, notes_million_extras, notes_navigation_completion, notes_outline_code, notes_parent_undo, notes_paste_blocks, notes_paste_selection, notes_performance, notes_regression_audit, notes_renumber_structure, notes_requested_fixes, notes_table_media, notes_table_tools, test_notes_editor_ui, notes_cascade_defaults (novo), notes_collapse_motion (novo), notes_completion_spacing (novo), notes_cut_background (novo), notes_document_migration (novo), notes_extras (novo), notes_import_spacing (novo), notes_large_document (novo), notes_last_line_enter (novo), notes_markdown (novo), notes_million (novo), notes_million_extras (novo), notes_navigation_completion (novo), notes_outline_code (novo), notes_parent_undo (novo), notes_paste_blocks (novo), notes_paste_selection (novo), notes_performance (novo), notes_regression_audit (novo), notes_renumber_structure (novo), notes_requested_fixes (novo), notes_table_media (novo), notes_table_tools (novo), test_notes_editor_ui (novo) | ✅ |
| `flushNotesTyping` | — | ✅ |
| `getCleanNotesHtml` | notes_colors_persistence, notes_document_migration, notes_extras, notes_large_document, notes_million, notes_million_extras, notes_paste_blocks, notes_requested_fixes, notes_table_media, notes_table_tools, notes_colors_persistence (novo), notes_document_migration (novo), notes_extras (novo), notes_large_document (novo), notes_million (novo), notes_million_extras (novo), notes_paste_blocks (novo), notes_requested_fixes (novo), notes_table_media (novo), notes_table_tools (novo) | ✅ |
| `handleNotesEditorShortcut` | notes_colors_persistence, notes_enter_child, notes_indent_child, notes_colors_persistence (novo), notes_enter_child (novo), notes_indent_child (novo) | ✅ |
| `notesAutoLinks` | notes_extras, notes_extras (novo) | ✅ |
| `notesBackspaceMedia` | — | ✅ |
| `notesCaptureInsertion` | — | ✅ |
| `notesDateDialog` | — | ✅ |
| `notesDivider` | — | ✅ |
| `notesExtraDialog` | — | ✅ |
| `notesFocusMedia` | — | ✅ |
| `notesInsertMenu` | — | ✅ |
| `notesInsertNode` | — | ✅ |
| `notesLinkDialog` | — | ✅ |
| `notesMedia` | notes_extras, notes_table_media, notes_extras (novo), notes_table_media (novo) | ✅ |
| `notesRecalculateTable` | — | ✅ |
| `notesRestoreInsertion` | — | ✅ |
| `notesRevealInsertion` | — | ✅ |
| `notesStatus` | — | ✅ |
| `notesTableDialog` | notes_extras, notes_extras (novo) | ✅ |
| `notesTemplates` | notes_extras, notes_extras (novo) | ✅ |
| `notesUpload` | — | ✅ |
| `notesVideoDialog` | — | ✅ |
| `queueNotesSave` | — | ✅ |
| `recordNotesHistory` | notes_checklist_numbers, notes_checklist_order, notes_colors_persistence, notes_enter_child, notes_indent_child, notes_tone_picker, notes_tone_picker_mobile, notes_checklist_numbers (novo), notes_checklist_order (novo), notes_colors_persistence (novo), notes_enter_child (novo), notes_indent_child (novo), notes_tone_picker (novo), notes_tone_picker_mobile (novo) | ✅ |
| `redoNotes` | notes_parent_undo, notes_parent_undo (novo) | ✅ |
| `refreshNotesCodePresentation` | — | ✅ |
| `refreshNotesCollapseControls` | notes_checklist_numbers, notes_checklist_order, notes_collapse_motion, notes_colors_persistence, notes_document_migration, notes_enter_child, notes_indent_child, notes_requested_fixes, notes_checklist_numbers (novo), notes_checklist_order (novo), notes_collapse_motion (novo), notes_colors_persistence (novo), notes_document_migration (novo), notes_enter_child (novo), notes_indent_child (novo), notes_requested_fixes (novo) | ✅ |
| `refreshNotesSyntaxHighlight` | — | ✅ |
| `renderNotesDocument` | notes_document_migration, notes_document_migration (novo) | ✅ |
| `resetNotesHistory` | — | ✅ |
| `restoreNotesHistory` | — | ✅ |
| `restoreNotesSelection` | notes_enter_child, notes_indent_child, notes_enter_child (novo), notes_indent_child (novo) | ✅ |
| `setNotesDefaultColor` | notes_cascade_defaults, notes_extras, notes_navigation_completion, notes_table_media, notes_cascade_defaults (novo), notes_extras (novo), notes_navigation_completion (novo), notes_table_media (novo) | ✅ |
| `setNotesHeaderCollapsed` | — | ✅ |
| `setupModalListeners` | notes_cascade_defaults, notes_collapse_motion, notes_completion_spacing, notes_cut_background, notes_document_migration, notes_extras, notes_import_spacing, notes_large_document, notes_last_line_enter, notes_markdown, notes_million, notes_million_extras, notes_navigation_completion, notes_outline_code, notes_parent_undo, notes_paste_blocks, notes_paste_selection, notes_performance, notes_regression_audit, notes_renumber_structure, notes_requested_fixes, notes_table_media, notes_table_tools, test_notes_editor_ui, mapa_area (novo), mapa_canvas (novo), mapa_conexoes (novo), mapa_conteudo (novo), mapa_dragdrop (novo), mapa_gestao (novo), mapa_layout (novo), mapa_nos (novo), mapa_vazio (novo), notes_cascade_defaults (novo), notes_checklist_enter (novo), notes_collapse_motion (novo), notes_collapsed_heading (novo), notes_completion_spacing (novo), notes_cut_background (novo), notes_document_migration (novo), notes_extras (novo), notes_import_spacing (novo), notes_indent_levels (novo), notes_large_document (novo), notes_last_line_enter (novo), notes_markdown (novo), notes_million (novo), notes_million_extras (novo), notes_navigation_completion (novo), notes_outline_code (novo), notes_parent_undo (novo), notes_paste_blocks (novo), notes_paste_selection (novo), notes_performance (novo), notes_regression_audit (novo), notes_renumber_structure (novo), notes_requested_fixes (novo), notes_table_media (novo), notes_table_tools (novo), notes_underline (novo), shortcuts (novo), test_notes_editor_ui (novo) | ✅ |
| `setupNotesColors` | notes_tone_picker, notes_tone_picker_mobile, notes_tone_picker (novo), notes_tone_picker_mobile (novo) | ✅ |
| `setupNotesEditing` | — | ✅ |
| `setupNotesResize` | — | ✅ |
| `storeNotesDraft` | nota_grande_pwa (novo) | ✅ |
| `syncNotesDocument` | — | ✅ |
| `toggleAllNotesCollapse` | notes_requested_fixes, notes_requested_fixes (novo) | ✅ |
| `undoNotes` | notes_parent_undo, notes_parent_undo (novo) | ✅ |
| `updateNotesChecklistOrder` | notes_checklist_numbers, notes_checklist_order, notes_checklist_numbers (novo), notes_checklist_order (novo) | ✅ |
| `updateNotesToolbarState` | — | ✅ |

## Eventos escutados

| Regra | Testes que cobrem | Status |
| --- | --- | --- |
| `beforeinput` | — | ✅ |
| `beforeunload` | — | ✅ |
| `cancel` | — | ✅ |
| `change` | — | ✅ |
| `click` | — | ✅ |
| `close` | — | ✅ |
| `contextmenu` | — | ✅ |
| `copy` | — | ✅ |
| `cut` | — | ✅ |
| `dblclick` | — | ✅ |
| `input` | — | ✅ |
| `keydown` | notes_enter_child, notes_indent_child, notes_enter_child (novo), notes_indent_child (novo) | ✅ |
| `mousedown` | — | ✅ |
| `paste` | — | ✅ |
| `pointercancel` | — | ✅ |
| `pointerdown` | — | ✅ |
| `pointerenter` | — | ✅ |
| `pointerleave` | — | ✅ |
| `pointermove` | — | ✅ |
| `pointerup` | — | ✅ |
| `resize` | — | ✅ |
| `scroll` | — | ✅ |
| `selectionchange` | — | ✅ |

## Atributos dataset

| Regra | Testes que cobrem | Status |
| --- | --- | --- |
| `cellValue` | — | ✅ |
| `check` | notes_cascade_defaults, notes_checklist_numbers, notes_checklist_order, notes_colors_persistence, notes_completion_spacing, notes_document_migration, notes_document_model, notes_enter_child, notes_indent_child, notes_navigation_completion, notes_parent_undo, notes_paste_blocks, notes_renumber_structure, test_notes_editor_ui, mapa_conexoes (novo), mapa_conteudo (novo), notes_cascade_defaults (novo), notes_checklist_enter (novo), notes_checklist_numbers (novo), notes_checklist_order (novo), notes_collapsed_heading (novo), notes_colors_persistence (novo), notes_completion_spacing (novo), notes_document_migration (novo), notes_document_model (novo), notes_enter_child (novo), notes_indent_child (novo), notes_navigation_completion (novo), notes_parent_undo (novo), notes_paste_blocks (novo), notes_renumber_structure (novo), parity_visual (novo), shortcuts (novo), tema_switch (novo), test_notes_editor_ui (novo), toolbar_pwa (novo) | ✅ |
| `checkNumber` | notes_document_model, notes_document_model (novo) | ✅ |
| `checked` | notes_cascade_defaults, notes_checklist_numbers, notes_checklist_order, notes_colors_persistence, notes_document_migration, notes_document_model, notes_renumber_structure, test_notes_editor_ui, notes_cascade_defaults (novo), notes_checklist_enter (novo), notes_checklist_numbers (novo), notes_checklist_order (novo), notes_collapsed_heading (novo), notes_colors_persistence (novo), notes_document_migration (novo), notes_document_model (novo), notes_renumber_structure (novo), tema_switch (novo), test_notes_editor_ui (novo) | ✅ |
| `codeBlock` | notes_requested_fixes, notes_requested_fixes (novo) | ✅ |
| `codeDisabled` | — | ✅ |
| `codeLanguage` | — | ✅ |
| `collapsed` | notes_cascade_defaults, notes_collapse_motion, notes_enter_child, notes_extras, notes_indent_child, notes_markdown, notes_navigation_completion, notes_outline_code, notes_parent_undo, notes_paste_blocks, notes_requested_fixes, notes_cascade_defaults (novo), notes_collapse_motion (novo), notes_collapsed_heading (novo), notes_enter_child (novo), notes_extras (novo), notes_indent_child (novo), notes_markdown (novo), notes_navigation_completion (novo), notes_outline_code (novo), notes_parent_undo (novo), notes_paste_blocks (novo), notes_requested_fixes (novo), toolbar_pwa (novo) | ✅ |
| `command` | notes_cascade_defaults, notes_collapse_motion, notes_completion_spacing, notes_cut_background, notes_document_migration, notes_extras, notes_import_spacing, notes_large_document, notes_last_line_enter, notes_markdown, notes_million, notes_million_extras, notes_navigation_completion, notes_outline_code, notes_parent_undo, notes_paste_blocks, notes_paste_selection, notes_performance, notes_regression_audit, notes_renumber_structure, notes_requested_fixes, notes_table_media, notes_table_tools, test_notes_editor_ui, notes_cascade_defaults (novo), notes_collapse_motion (novo), notes_completion_spacing (novo), notes_cut_background (novo), notes_document_migration (novo), notes_extras (novo), notes_import_spacing (novo), notes_indent_levels (novo), notes_large_document (novo), notes_last_line_enter (novo), notes_markdown (novo), notes_million (novo), notes_million_extras (novo), notes_navigation_completion (novo), notes_outline_code (novo), notes_parent_undo (novo), notes_paste_blocks (novo), notes_paste_selection (novo), notes_performance (novo), notes_regression_audit (novo), notes_renumber_structure (novo), notes_requested_fixes (novo), notes_table_media (novo), notes_table_tools (novo), notes_underline (novo), parity_structure (novo), test_notes_editor_ui (novo) | ✅ |
| `completedAt` | — | ✅ |
| `completedBy` | — | ✅ |
| `completionBatch` | — | ✅ |
| `completionLabel` | — | ✅ |
| `completionPosition` | — | ✅ |
| `extra` | notes_extras, notes_last_line_enter, notes_million_extras, notes_table_media, notes_table_tools, mapa_area (novo), mapa_canvas (novo), mapa_conexoes (novo), mapa_conteudo (novo), mapa_dragdrop (novo), mapa_gestao (novo), mapa_layout (novo), mapa_nos (novo), mapa_vazio (novo), multi_notas (novo), multi_notas_100 (novo), nota_grande_pwa (novo), notes_extras (novo), notes_last_line_enter (novo), notes_million_extras (novo), notes_table_media (novo), notes_table_tools (novo), notes_underline (novo), parity_structure (novo), shortcuts (novo), toolbar_pwa (novo) | ✅ |
| `formula` | notes_table_math, notes_table_tools, notes_table_math (novo), notes_table_tools (novo) | ✅ |
| `formulaError` | — | ✅ |
| `heading` | notes_document_model, notes_extras, notes_indent_child, notes_last_line_enter, notes_markdown, notes_requested_fixes, test_notes_editor_ui, notes_collapsed_heading (novo), notes_document_model (novo), notes_extras (novo), notes_indent_child (novo), notes_last_line_enter (novo), notes_markdown (novo), notes_requested_fixes (novo), shortcuts (novo), test_notes_editor_ui (novo) | ✅ |
| `indentLevel` | — | ✅ |
| `inlineHeading` | — | ✅ |
| `largeNote` | — | ✅ |
| `level` | notes_cascade_defaults, notes_checklist_numbers, notes_checklist_order, notes_colors_persistence, notes_completion_spacing, notes_document_model, notes_enter_child, notes_indent_child, notes_markdown, notes_navigation_completion, notes_outline_code, notes_parent_undo, notes_paste_blocks, notes_performance, notes_renumber_structure, notes_requested_fixes, test_notes_editor_ui, multi_notas (novo), multi_notas_100 (novo), nota_grande_pwa (novo), notes_cascade_defaults (novo), notes_checklist_enter (novo), notes_checklist_numbers (novo), notes_checklist_order (novo), notes_collapsed_heading (novo), notes_colors_persistence (novo), notes_completion_spacing (novo), notes_document_model (novo), notes_enter_child (novo), notes_indent_child (novo), notes_indent_levels (novo), notes_markdown (novo), notes_navigation_completion (novo), notes_outline_code (novo), notes_parent_undo (novo), notes_paste_blocks (novo), notes_performance (novo), notes_renumber_structure (novo), notes_requested_fixes (novo), notes_underline (novo), shortcuts (novo), test_notes_editor_ui (novo), toolbar_pwa (novo) | ✅ |
| `lineColor` | notes_table_media, notes_table_media (novo) | ✅ |
| `list` | notes_checklist_numbers, notes_checklist_order, notes_colors_persistence, notes_document_migration, notes_document_model, notes_outline_code, notes_paste_blocks, test_notes_editor_ui, mapa_conteudo (novo), mapa_dragdrop (novo), mapa_gestao (novo), mapa_layout (novo), multi_notas (novo), notes_checklist_enter (novo), notes_checklist_numbers (novo), notes_checklist_order (novo), notes_collapsed_heading (novo), notes_colors_persistence (novo), notes_document_migration (novo), notes_document_model (novo), notes_outline_code (novo), notes_paste_blocks (novo), pwa_service_worker (novo), shortcuts (novo), test_notes_editor_ui (novo) | ✅ |
| `mediaAction` | — | ✅ |
| `noteAccent` | notes_colors_persistence, notes_document_model, notes_colors_persistence (novo), notes_document_model (novo) | ✅ |
| `noteAccentHistory` | — | ✅ |
| `noteAsset` | — | ✅ |
| `noteColors` | notes_colors_persistence, notes_colors_persistence (novo) | ✅ |
| `noteHighlightColors` | notes_regression_audit, notes_regression_audit (novo) | ✅ |
| `noteId` | notes_document_migration, notes_document_migration (novo) | ✅ |
| `noteTable` | — | ✅ |
| `notesColor` | notes_cascade_defaults, notes_regression_audit, test_notes_editor_ui, notes_cascade_defaults (novo), notes_regression_audit (novo), test_notes_editor_ui (novo) | ✅ |
| `numberCurrency` | — | ✅ |
| `numberDecimals` | — | ✅ |
| `numberFormat` | — | ✅ |
| `outlineBreak` | notes_collapsed_heading (novo) | ✅ |
| `property` | — | ✅ |
| `tableResize` | — | ✅ |
| `videoPoster` | — | ✅ |
| `youtube` | notes_extras, notes_extras (novo) | ✅ |

## Regras declaradas pelos próprios testes (`console.log('OK: ...')`)

- **notes_cascade_defaults** — cascata reversível persistida, data de conclusão, cor do corpo preservada, seletor padrão e fechamento independente
- **notes_checklist_numbers** — pilha de concluídos, desmarcação e evento duplicado
- **notes_checklist_order** — pilha de concluídos, desmarcação e evento duplicado
- **notes_collapse_motion** — following title moves continuously without final spacing jump
- **notes_colors_persistence** — Enter sem número repetido, cores serializadas e nova nota independente
- **notes_completion_spacing** — conclusão sem espaços de HTML e linha vazia real preservada
- **notes_cut_background** — recortar/colar sem fundo acidental e com destaque intencional preservado
- **notes_document_migration** — modelo/HTML sem perdas, IDs persistidos, histórico estruturado, cópia independente, nota extensa
- **notes_document_model** — modelo sem navegador, identidade, hierarquia, cascata, snapshots, recuo e movimento
- **notes_document_model** — movimento manual recalcula pendentes; conclusão preserva número
- **notes_document_model** — primeiro filho sobe acima do pai preservando os demais filhos
- **notes_document_model** — recuo acompanha o item anterior ao título
- **notes_document_model** — posição de conclusão persistida e retorno após exclusão de vizinho
- **notes_document_model** — all checked then unchecked in different orders restore original order
- **notes_enter_child** — Enter reutiliza o filho vazio recolhido sem duplicar checkbox
- **notes_extras** — divider shortcut/removal, automatic and titled links, cursor media, table and toolbar overflow
- **notes_import_spacing** — BR + HTML newline produces one line break; legacy empty fragments removed
- **notes_indent_child** — Tab abre o pai e permite digitar no filho sem título
- **notes_last_line_enter** — Enter at the last paragraph, heading, empty line and editor boundary
- **notes_navigation_completion** — retorno original, cursor vazio, colapsos, conclusão coletiva, cores salvas e abas
- **notes_outline_code** — nested outline visible and complete TypeScript interface grouped
- **notes_parent_undo** — desfazer/refazer por botão e teclado com movimento contínuo
- **notes_paste_blocks** — multiline paste, 150k text, selected bold, indentation and marker sizing
- **notes_paste_selection** — paste on editor root, Select All, and missing selection
- **notes_regression_audit** — remoção parcial preserva formatação, cores sobrevivem em novas linhas, fechamento limpa paletas
- **notes_renumber_structure** — numeração em seleção múltipla, itens marcados, movimento e recuo
- **notes_requested_fixes** — code boundaries, Enter, manual code, collapse persistence, H3, staged colors and module payload
- **notes_table_math** — arithmetic, localized functions, references, dependencies, error handling and 1,000 cells
- **notes_table_media** — create/edit/reopen table; click media, Backspace removal, undo and explicit video playback
- **notes_table_tools** — formulas, recalculation, point-and-click references, staged cell colors, dimensions, drag, undo and reopen
- **notes_tone_picker** — seletor de tonalidade, cancelar, confirmar e independência da cor padrão
- **notes_tone_picker_mobile** — seletor de tonalidade, cancelar, confirmar e independência da cor padrão
- **test_notes_editor_ui** — edição, checkbox, linhas vazias, autosave, expansão sequencial, resize e redução de movimento.
- **mapa_area** — área Notas/Mapa Mental, montagem lazy, tema e persistência
- **mapa_canvas** — canvas infinito (zoom, pan, pinça, centralizar/fit/raiz, minimapa, viewport persistida)
- **mapa_conexoes** — conexões (menu/modo/alt+arrastar/editar/remover)
- **mapa_conteudo** — conteúdo (concluir/anexos/nó-ponte)
- **mapa_dragdrop** — dragdrop (reparent/irmãos/ramo/ciclo)
- **mapa_gestao** — gestão de mapas (CRUD, pastas, raiz, conexões, templates, recentes, busca/ordenação)
- **mapa_layout** — hierarquia (níveis + layouts + recolher seguro)
- **mapa_nos** — nós (criar/editar/excluir/duplicar/copiar/colar/reordenar/reparent/laço/recolher/bloquear/largura/desfazer)
- **mapa_vazio** — mapa vazio -> primeiro tópico (clique + Enter/Tab/Insert/Ctrl+Enter)
- **multi_notas** — multi-notas (migração, "+", chips, troca, renomear, excluir, accent por nota)
- **notes_cascade_defaults** — cascata reversível persistida, data de conclusão, cor do corpo preservada, seletor padrão e fechamento independente
- **notes_checklist_enter** — Enter em lista com check+numerada mantem continuidade e foca o item seguinte
- **notes_checklist_numbers** — pilha de concluídos, desmarcação e evento duplicado
- **notes_checklist_order** — pilha de concluídos, desmarcação e evento duplicado
- **notes_collapse_motion** — following title moves continuously without final spacing jump
- **notes_collapsed_heading** — Enter em titulo recolhido replica a formatacao (linha e inline) e listas seguem o fluxo
- **notes_colors_persistence** — Enter sem número repetido, cores serializadas e nova nota independente
- **notes_completion_spacing** — conclusão sem espaços de HTML e linha vazia real preservada
- **notes_cut_background** — recortar/colar sem fundo acidental e com destaque intencional preservado
- **notes_document_migration** — modelo/HTML sem perdas, IDs persistidos, histórico estruturado, cópia independente, nota extensa
- **notes_document_model** — modelo sem navegador, identidade, hierarquia, cascata, snapshots, recuo e movimento
- **notes_document_model** — movimento manual recalcula pendentes; conclusão preserva número
- **notes_document_model** — primeiro filho sobe acima do pai preservando os demais filhos
- **notes_document_model** — recuo acompanha o item anterior ao título
- **notes_document_model** — posição de conclusão persistida e retorno após exclusão de vizinho
- **notes_document_model** — all checked then unchecked in different orders restore original order
- **notes_enter_child** — Enter reutiliza o filho vazio recolhido sem duplicar checkbox
- **notes_extras** — divider shortcut/removal, automatic and titled links, cursor media, table and toolbar overflow
- **notes_import_spacing** — BR + HTML newline produces one line break; legacy empty fragments removed
- **notes_indent_child** — Tab abre o pai e permite digitar no filho sem título
- **notes_indent_levels** — teto de 4 niveis, recuo/desrecuo e rotulos de atalho
- **notes_last_line_enter** — Enter at the last paragraph, heading, empty line and editor boundary
- **notes_navigation_completion** — retorno original, cursor vazio, colapsos, conclusão coletiva, cores salvas e abas
- **notes_outline_code** — nested outline visible and complete TypeScript interface grouped
- **notes_parent_undo** — desfazer/refazer por botão e teclado com movimento contínuo
- **notes_paste_blocks** — multiline paste, 150k text, selected bold, indentation and marker sizing
- **notes_paste_selection** — paste on editor root, Select All, and missing selection
- **notes_regression_audit** — remoção parcial preserva formatação, cores sobrevivem em novas linhas, fechamento limpa paletas
- **notes_renumber_structure** — numeração em seleção múltipla, itens marcados, movimento e recuo
- **notes_requested_fixes** — code boundaries, Enter, manual code, collapse persistence, H3, staged colors and module payload
- **notes_table_math** — arithmetic, localized functions, references, dependencies, error handling and 1,000 cells
- **notes_table_media** — create/edit/reopen table; click media, Backspace removal, undo and explicit video playback
- **notes_table_tools** — formulas, recalculation, point-and-click references, staged cell colors, dimensions, drag, undo and reopen
- **notes_tone_picker** — seletor de tonalidade, cancelar, confirmar e independência da cor padrão
- **notes_tone_picker_mobile** — seletor de tonalidade, cancelar, confirmar e independência da cor padrão
- **notes_underline** — sublinhado por botao/atalho Ctrl+U
- **parity_structure** — estrutura do modal equivalente ao original
- **parity_visual** — paridade visual entre PWA e original (somente excecoes documentadas)
- **pwa_service_worker** — sw.js na raiz servido como JavaScript (fora do fallback de SPA), registro com updateViaCache none e app inicia controlado
- **shortcuts** — atalhos Alt+setas, Ctrl+Alt+1..7/0/T, Tab/Shift+Tab, Ctrl+B e Ctrl+S
- **tema_switch** — seletor sutil de tema (claro/escuro) alterna, persiste e reabre mantendo a escolha
- **tema_vidro** — modo claro com vidro (paineis blur16, card blur18/alpha .72, system stack) e escuro solido, iguais ao original
- **test_notes_editor_ui** — edição, checkbox, linhas vazias, autosave, expansão sequencial, resize e redução de movimento.
- **toolbar_pwa** — toolbar inline com rolagem, sem "..." , ordem editavel/persistida e dock acima do teclado

## Lacunas (sem teste) — a cobrir na Fase 4

| Categoria | Lacunas | Itens |
| --- | --- | --- |
| comandos | 1 | `insertUnorderedList` |
| atalhos | 7 | `Ctrl/Cmd+Y`, `Ctrl/Cmd+I`, `Ctrl+Alt+8`, `Ctrl+Alt+9`, `Ctrl+Alt+L`, `Ctrl+Shift+I`, `Ctrl+Alt+M` |
| metodos | 30 | `animateNotesMovement`, `applyNotesOutlineDefaults`, `beginNotesSession`, `closeNotesColorPanels`, `flushNotesTyping`, `notesBackspaceMedia`, `notesCaptureInsertion`, `notesDateDialog`, `notesDivider`, `notesExtraDialog`, `notesFocusMedia`, `notesInsertMenu`, `notesInsertNode`, `notesLinkDialog`, `notesRecalculateTable`, `notesRestoreInsertion`, `notesRevealInsertion`, `notesStatus`, `notesUpload`, `notesVideoDialog`, `queueNotesSave`, `refreshNotesCodePresentation`, `refreshNotesSyntaxHighlight`, `resetNotesHistory`, `restoreNotesHistory`, `setNotesHeaderCollapsed`, `setupNotesEditing`, `setupNotesResize`, `syncNotesDocument`, `updateNotesToolbarState` |
| eventos | 22 | `beforeinput`, `beforeunload`, `cancel`, `change`, `click`, `close`, `contextmenu`, `copy`, `cut`, `dblclick`, `input`, `mousedown`, `paste`, `pointercancel`, `pointerdown`, `pointerenter`, `pointerleave`, `pointermove`, `pointerup`, `resize`, `scroll`, `selectionchange` |
| atributos | 22 | `cellValue`, `codeDisabled`, `codeLanguage`, `completedAt`, `completedBy`, `completionBatch`, `completionLabel`, `completionPosition`, `formulaError`, `indentLevel`, `inlineHeading`, `largeNote`, `mediaAction`, `noteAccentHistory`, `noteAsset`, `noteTable`, `numberCurrency`, `numberDecimals`, `numberFormat`, `property`, `tableResize`, `videoPoster` |

