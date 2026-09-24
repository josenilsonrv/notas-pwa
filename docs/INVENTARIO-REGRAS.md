# Inventário de regras do motor de notas

> Gerado por `node tools/gerar-rastreabilidade.cjs` em 2026-09-24.
> O motor do PWA partia do **byte a byte idêntico** ao do `produtividade-ferrramenta`,
> mas a **Revisão do bloco de notas** fez mudanças deliberadas e documentadas em
> `notes/editor.js`/`notes/extras.js`: teto de 4 níveis de indentação, sublinhado (`underline`/`Ctrl+U`),
> retorno do check à posição original e fluxo do Enter em listas/títulos recolhidos.
> Ver `docs/PROBLEMAS-E-MITIGACOES.md` (P23–P28).

## Resumo

| Categoria | Quantidade |
| --- | --- |
| Arquivos do motor | 4 |
| Métodos públicos (`p.x`) | 50 |
| Funções internas | 21 |
| Comandos | 18 |
| Atalhos (combinações mapeadas) | 28 |
| Teclas tratadas | 10 |
| Eventos escutados | 23 |
| Atributos `dataset.*` | 41 |
| Seletores de atributo no CSS | 17 |
| Regras de domínio (`NotesDocument`) | 8 |
| Arquivos de teste do original | 90 |

Motor: `editor.js`: 1055 linhas / 114190 bytes · `extras.js`: 137 linhas / 34353 bytes · `tables.js`: 133 linhas / 19363 bytes · `table-math.js`: 72 linhas / 6646 bytes

## Comandos (18)

```
  1. bold
  2. checklist
  3. codeBlock
  4. collapseAll
  5. heading1
  6. heading2
  7. heading3
  8. indent
  9. insertOrderedList
 10. insertUnorderedList
 11. italic
 12. moveDown
 13. moveUp
 14. outdent
 15. redo
 16. strikeThrough
 17. underline
 18. undo
```

## Atalhos mapeados (28)

```
  1. Ctrl/Cmd+Z  ->  undo
  2. Ctrl/Cmd+Shift+Z  ->  redo
  3. Ctrl/Cmd+Y  ->  redo
  4. Ctrl/Cmd+S  ->  salvar
  5. Ctrl/Cmd+B  ->  bold
  6. Ctrl/Cmd+I  ->  italic
  7. Tab  ->  indent
  8. Shift+Tab  ->  outdent
  9. Alt+ArrowUp  ->  moveUp
 10. Alt+ArrowDown  ->  moveDown
 11. Ctrl+Alt+1  ->  heading1
 12. Ctrl+Alt+2  ->  heading2
 13. Ctrl+Alt+3  ->  heading3
 14. Ctrl+Alt+4  ->  checklist
 15. Ctrl+Alt+5  ->  insertOrderedList
 16. Ctrl+Alt+6  ->  insertUnorderedList
 17. Ctrl+Alt+7  ->  strikeThrough
 18. Ctrl+U  ->  underline
 19. Ctrl+Alt+8  ->  picker color
 20. Ctrl+Alt+9  ->  picker backgroundColor
 21. Ctrl+Alt+0  ->  toggleNotesFullscreen
 22. Ctrl+Alt+T  ->  toggleNotesHeaderCollapse
 23. Ctrl+Alt+L  ->  animateNotesLineCollapse
 24. Ctrl+Shift+I  ->  notesInsertMenu
 25. Ctrl+Shift+H  ->  notesDivider
 26. Ctrl+K  ->  notesLinkDialog
 27. Ctrl+Alt+M  ->  notesTemplates
 28. Ctrl+Alt+Q  ->  notesTableDialog
```

## Teclas tratadas (10)

```
  1.  
  2. ArrowDown
  3. ArrowLeft
  4. ArrowRight
  5. ArrowUp
  6. Backspace
  7. End
  8. Enter
  9. Home
 10. Tab
```

## Eventos escutados (23)

```
  1. beforeinput
  2. beforeunload
  3. cancel
  4. change
  5. click
  6. close
  7. contextmenu
  8. copy
  9. cut
 10. dblclick
 11. input
 12. keydown
 13. mousedown
 14. paste
 15. pointercancel
 16. pointerdown
 17. pointerenter
 18. pointerleave
 19. pointermove
 20. pointerup
 21. resize
 22. scroll
 23. selectionchange
```

## Atributos dataset (41)

```
  1. cellValue
  2. check
  3. checkNumber
  4. checked
  5. codeBlock
  6. codeDisabled
  7. codeLanguage
  8. collapsed
  9. command
 10. completedAt
 11. completedBy
 12. completionBatch
 13. completionLabel
 14. completionPosition
 15. extra
 16. formula
 17. formulaError
 18. heading
 19. indentLevel
 20. inlineHeading
 21. largeNote
 22. level
 23. lineColor
 24. list
 25. mediaAction
 26. noteAccent
 27. noteAccentHistory
 28. noteAsset
 29. noteColors
 30. noteHighlightColors
 31. noteId
 32. noteTable
 33. notesColor
 34. numberCurrency
 35. numberDecimals
 36. numberFormat
 37. outlineBreak
 38. property
 39. tableResize
 40. videoPoster
 41. youtube
```

## Seletores de atributo no CSS (17)

```
  1. [data-bold]
  2. [data-check]
  3. [data-code-block]
  4. [data-code-disabled]
  5. [data-command]
  6. [data-completion-label]
  7. [data-formula]
  8. [data-formula-error]
  9. [data-heading]
 10. [data-inline-heading]
 11. [data-italic]
 12. [data-large-note]
 13. [data-list]
 14. [data-note-asset]
 15. [data-note-table]
 16. [data-table-resize]
 17. [data-theme]
```

## Métodos públicos do motor (50)

```
  1. animateNotesMovement
  2. applyNotesOutlineDefaults
  3. applyNotesTextStyle
  4. beginNotesSession
  5. closeNotesColorPanels
  6. executeNotesCommand
  7. flushNotesTyping
  8. getCleanNotesHtml
  9. handleNotesEditorShortcut
 10. notesAutoLinks
 11. notesBackspaceMedia
 12. notesCaptureInsertion
 13. notesDateDialog
 14. notesDivider
 15. notesExtraDialog
 16. notesFocusMedia
 17. notesInsertMenu
 18. notesInsertNode
 19. notesLinkDialog
 20. notesMedia
 21. notesRecalculateTable
 22. notesRestoreInsertion
 23. notesRevealInsertion
 24. notesStatus
 25. notesTableDialog
 26. notesTemplates
 27. notesUpload
 28. notesVideoDialog
 29. queueNotesSave
 30. recordNotesHistory
 31. redoNotes
 32. refreshNotesCodePresentation
 33. refreshNotesCollapseControls
 34. refreshNotesSyntaxHighlight
 35. renderNotesDocument
 36. resetNotesHistory
 37. restoreNotesHistory
 38. restoreNotesSelection
 39. setNotesDefaultColor
 40. setNotesHeaderCollapsed
 41. setupModalListeners
 42. setupNotesColors
 43. setupNotesEditing
 44. setupNotesResize
 45. storeNotesDraft
 46. syncNotesDocument
 47. toggleAllNotesCollapse
 48. undoNotes
 49. updateNotesChecklistOrder
 50. updateNotesToolbarState
```

## Regras de domínio (NotesDocument) (8)

```
  1. constructor
  2. descendants
  3. indent
  4. move
  5. reindex
  6. renumber
  7. setCompletion
  8. snapshot
```

## Propriedades de estado (props) (9)

```
  1. check
  2. checkNumber
  3. checked
  4. collapsed
  5. completedAt
  6. completedBy
  7. completionBatch
  8. completionOrder
  9. completionPosition
```

