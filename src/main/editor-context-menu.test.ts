import { test } from 'node:test'
import assert from 'node:assert/strict'
import { editorContextMenu } from './editor-context-menu.ts'

const params = {
  isEditable: true, misspelledWord: 'mispelled', dictionarySuggestions: ['misspelled', 'misspelt'],
  editFlags: { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canDelete: true, canSelectAll: true, canEditRichly: false },
}

test('spelling actions replace the clicked word and update the dictionary', () => {
  const replaced: string[] = []
  const added: string[] = []
  const items = editorContextMenu(params, { replace: word => replaced.push(word), addToDictionary: word => added.push(word) })
  Reflect.apply(items.find(item => item.label === 'misspelt')!.click!, undefined, [])
  Reflect.apply(items.find(item => item.label === 'Add to dictionary')!.click!, undefined, [])
  assert.deepEqual(replaced, ['misspelt'])
  assert.deepEqual(added, ['mispelled'])
  assert.equal(items.find(item => item.role === 'undo')!.enabled, true)
  assert.equal(items.find(item => item.role === 'redo')!.enabled, false)
})

test('ordinary text fields keep edit actions; unknown words allow dictionary additions', () => {
  const actions = { replace() {}, addToDictionary() {} }
  const ordinary = editorContextMenu({ ...params, misspelledWord: '', dictionarySuggestions: [] }, actions)
  assert.ok(ordinary.some(item => item.role === 'paste'))
  assert.ok(ordinary.every(item => !item.label))
  const unknown = editorContextMenu({ ...params, dictionarySuggestions: [] }, actions)
  assert.equal(unknown.find(item => item.label === 'No spelling suggestions')!.enabled, false)
  assert.ok(unknown.some(item => item.label === 'Add to dictionary'))
  assert.deepEqual(editorContextMenu({ ...params, isEditable: false }, actions), [])
})
