import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron'

type EditorContext = Pick<ContextMenuParams, 'isEditable' | 'misspelledWord' | 'dictionarySuggestions' | 'editFlags'>

/** Use Chromium's spelling results and editing commands for every text field. */
export function editorContextMenu(params: EditorContext, actions: { replace(word: string): void; addToDictionary(word: string): void }): MenuItemConstructorOptions[] {
  if (!params.isEditable) return []
  const items: MenuItemConstructorOptions[] = []
  if (params.misspelledWord) {
    for (const word of params.dictionarySuggestions) items.push({ label: word, click: () => actions.replace(word) })
    if (!params.dictionarySuggestions.length) items.push({ label: 'No spelling suggestions', enabled: false })
    items.push({ label: 'Add to dictionary', click: () => actions.addToDictionary(params.misspelledWord) }, { type: 'separator' })
  }
  const flags = params.editFlags
  items.push(
    { role: 'undo', enabled: flags.canUndo }, { role: 'redo', enabled: flags.canRedo }, { type: 'separator' },
    { role: 'cut', enabled: flags.canCut }, { role: 'copy', enabled: flags.canCopy }, { role: 'paste', enabled: flags.canPaste },
    { type: 'separator' }, { role: 'selectAll', enabled: flags.canSelectAll },
  )
  return items
}
