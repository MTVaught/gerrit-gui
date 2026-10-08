const { webFrame } = require('electron')
// Deterministic misspelling detection without downloading an OS dictionary.
webFrame.setSpellCheckProvider('en-US', {
  spellCheck(words, callback) { callback(words.filter(word => word === 'mispelled')) },
})
