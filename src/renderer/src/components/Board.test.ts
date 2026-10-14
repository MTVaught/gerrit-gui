import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { classifyAll, sequenceCards, DEFAULT_SORT, EMPTY_FILTER, NO_TEAMS } from '../../../shared/model.ts'
import type { ChangeInfo, TabId } from '../../../shared/types.ts'

// Render the real board in both layouts, including its family and sequence components.
test('Board keeps all three family branches inside their sequence step', async () => {
  const root = fileURLToPath(new URL('../../../../', import.meta.url))
  const browser = globalThis as unknown as { window?: unknown }
  const previousWindow = browser.window
  browser.window = { location: { hash: '' }, matchMedia: () => ({ matches: false }) }
  const vite = await createServer({ configFile: root + 'vite.web.config.ts', server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { Board } = await vite.ssrLoadModule('/src/components/Board.tsx')
    const owner = { _account_id: 1, name: 'Alice', username: 'alice' }
    const reviewer = { _account_id: 2, name: 'Bob', username: 'bob' }
    const change = (number: number, branch: string, family: string, parent: string, approved = false): ChangeInfo => ({
      id: `demo~${branch}~${family}`, _number: number, change_id: family, project: 'demo', branch,
      subject: number === 101 ? 'Add storage layer' : 'Read settings from storage', status: 'NEW', owner,
      hashtags: ['reviewer:bob', ...(number <= 102 ? ['sequence'] : [])],
      custom_keyed_values: { 'review-requested-ps': '1' }, created: '', updated: '',
      reviewers: { REVIEWER: [reviewer] }, labels: { 'Code-Review': { all: [{ ...reviewer, value: approved ? 1 : 0 }] } },
      current_revision: `sha${number}`, revisions: { [`sha${number}`]: { _number: 1, commit: { parents: [{ commit: parent }] } } },
    })
    const changes = [change(101, 'main', 'Ibase', 'tip'), change(102, 'main', 'Isettings', 'sha101'),
      change(103, 'release/1', 'Isettings', 'tip1', true), change(104, 'release/2', 'Isettings', 'tip2', true)]
    for (const tab of ['mine', 'reviewing', 'needs-my-review'] as TabId[]) {
      const self = tab === 'mine' ? owner : reviewer
      const views = classifyAll(changes, self._account_id)
      for (const compact of [false, true]) {
        const html = renderToStaticMarkup(createElement(Board, {
          tab, views, self, compact, loading: false, sort: DEFAULT_SORT, filter: EMPTY_FILTER,
          setup: NO_TEAMS, teamPick: undefined, onAct: async () => {}, onFilter: () => {}, onGoTo: () => {},
        }))
        assert.match(html, /3 branches/)
        assert.match(html, /sequence-family/)
        for (const branch of ['main', 'release/1', 'release/2']) assert.ok(html.includes(branch), `${tab}, compact=${compact}: ${branch}`)
        for (const number of [102, 103, 104]) assert.equal(html.split(`#${number}`).length - 1 > 0, true)
      }
    }
    const render = (input: ChangeInfo[], compact: boolean, search = '') => renderToStaticMarkup(createElement(Board, {
      tab: 'reviewing', views: classifyAll(input, reviewer._account_id), self: reviewer, compact,
      loading: false, sort: DEFAULT_SORT, filter: { ...EMPTY_FILTER, search },
      setup: NO_TEAMS, teamPick: undefined, onAct: async () => {}, onFilter: () => {}, onGoTo: () => {},
    }))
    const releaseBase = change(201, 'release/1', 'Ireleasebase', 'tip-release')
    releaseBase.hashtags!.push('sequence')
    const releaseStep = change(103, 'release/1', 'Isettings', 'sha201')
    releaseStep.hashtags!.push('sequence')
    const overlapping = [changes[0]!, changes[1]!, releaseBase, releaseStep, changes[3]!]
    for (const compact of [false, true]) {
      for (const input of [overlapping, overlapping.slice().reverse()]) {
        const html = render(input, compact)
        for (const number of [101, 102, 103, 104, 201]) {
          assert.equal(html.split(`data-change-number="${number}"`).length - 1, 1,
            `compact=${compact}: #${number} renders exactly once`)
        }
        assert.match(html, /Branches shown in #101 to #102/)
      }
      const pending = structuredClone(changes)
      for (const c of pending) c.labels!['Code-Review']!.all![0]!.value = c._number === 103 ? 0 : 1
      const pendingHtml = render(pending, compact)
      assert.match(pendingHtml, /Sequences/)
      assert.doesNotMatch(pendingHtml, /(?:<h3>|<tr class="g">)[\s\S]*?class="count"/)
      assert.doesNotMatch(pendingHtml, /class="badge tally|class="tally (?!needs-review)/)
      assert.doesNotMatch(pendingHtml, /1 needs your review/)
      assert.match(pendingHtml, /class="step next"/)
      assert.match(pendingHtml, /#103(?:<\/b> is next for you| next)/)
      const familyHeader = pendingHtml.match(compact ? /<tr class="fh sequence-family-head">.*?<\/tr>/ : /<div class="sequence-family-head">.*?<\/div>/)![0]
      assert.doesNotMatch(familyHeader, /step done/)
      const filtered = structuredClone(overlapping)
      filtered.find((c) => c._number === 103)!.subject = 'Release-specific settings follow-up'
      const filteredHtml = render(filtered, compact, 'Release-specific')
      assert.match(filteredHtml, /Sequences/)
      assert.doesNotMatch(filteredHtml, /(?:<h3>|<tr class="g">)[\s\S]*?class="count"/)
      assert.match(filteredHtml, /Showing.*?<b>1<\/b> of 2/)
      for (const number of [101, 102, 103, 104]) assert.equal(filteredHtml.split(`data-change-number="${number}"`).length - 1, 1)
      assert.doesNotMatch(filteredHtml, /data-change-number="201"/)
    }
    const fullyOverlapping = structuredClone(overlapping)
    fullyOverlapping[0]!.change_id = 'Ireleasebase'
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(createElement(Board, {
        tab: 'mine', views: classifyAll(fullyOverlapping, owner._account_id), self: owner, compact,
        loading: false, sort: DEFAULT_SORT, filter: EMPTY_FILTER, setup: NO_TEAMS, teamPick: undefined,
        onAct: async () => {}, onFilter: () => {}, onGoTo: () => {},
      }))
      assert.match(html, /also release\/1 sequence/)
      assert.ok(html.includes(compact ? 'Edit release/1…' : 'Edit release/1 sequence…'))
      for (const number of [101, 102, 103, 104, 201]) assert.equal(html.split(`data-change-number="${number}"`).length - 1, 1)
    }
    // A simple sequence stays together across workflow states without cherry-picks.
    const mixed = [0, 1, 2, 3, 4].map((i) => change(301 + i, 'main', `Imixed${i}`, i === 0 ? 'tip' : `sha${300 + i}`, i === 1 || i === 2))
    for (const c of mixed) c.hashtags!.push('sequence')
    mixed[0]!.subject = 'Urgent correction'
    mixed[0]!.labels!['Code-Review']!.all![0]!.value = -1
    mixed[1]!.subject = 'Approved step'
    mixed[2]!.hashtags!.push('ready-to-merge')
    mixed[2]!.custom_keyed_values!['ready-to-merge-ps'] = '1'
    mixed[4]!.custom_keyed_values = {}
    const unrelated = { ...structuredClone(mixed[0]!), _number: 901, id: 'mirror~main~901', project: 'mirror', change_id: undefined, owner: reviewer, hashtags: [] }
    for (const input of [mixed, [...mixed, unrelated], [unrelated, ...mixed]]) for (const compact of [false, true]) {
      const html = renderToStaticMarkup(createElement(Board, {
        tab: 'mine', views: classifyAll(input, owner._account_id), self: owner, compact,
        loading: false, sort: DEFAULT_SORT, filter: EMPTY_FILTER, setup: NO_TEAMS, teamPick: undefined,
        onAct: async () => {}, onFilter: () => {}, onGoTo: () => {},
      }))
      assert.match(html, /Sequences/,
        `compact=${compact}: mixed states stay in the dedicated sequence section`)
      for (const number of [301, 302, 303, 304, 305]) assert.equal(html.split(`data-change-number="${number}"`).length - 1, 1)
      assert.doesNotMatch(html, /Approved <span class="count">/)
    }
    const mergedBase = structuredClone(mixed)
    mergedBase[0]!.status = 'MERGED'
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(createElement(Board, {
        tab: 'mine', views: classifyAll(mergedBase, owner._account_id), self: owner, compact,
        loading: false, sort: DEFAULT_SORT, filter: { ...EMPTY_FILTER, search: 'Urgent correction' },
        setup: NO_TEAMS, teamPick: undefined, onAct: async () => {}, onFilter: () => {}, onGoTo: () => {},
      }))
      assert.match(html, /No change on this tab matches the filter/, 'closed context cannot bring the card onto a tab')
      const unfiltered = renderToStaticMarkup(createElement(Board, {
        tab: 'mine', views: classifyAll(mergedBase, owner._account_id), self: owner, compact,
        loading: false, sort: DEFAULT_SORT, filter: EMPTY_FILTER,
        setup: NO_TEAMS, teamPick: undefined, onAct: async () => {}, onFilter: () => {}, onGoTo: () => {},
      }))
      assert.match(unfiltered, /Sequences/)
      assert.doesNotMatch(unfiltered, /(?:<h3>|<tr class="g">)[\s\S]*?class="count"/)
      assert.match(unfiltered, /Change which of the related changes are in the sequence/, 'merged base preserves the sequence editor')
      for (const number of [301, 302, 303, 304, 305]) assert.equal(unfiltered.split(`data-change-number="${number}"`).length - 1, 1)
    }
    // Omitting the middle commit keeps the remaining steps on one card in both layouts.
    const skipped = [change(401, 'main', 'Iskipbase', 'tip'),
      change(402, 'main', 'Iskipmiddle', 'sha401'), change(403, 'main', 'Iskiptop', 'sha402')]
    skipped[0]!.hashtags!.push('sequence')
    skipped[2]!.hashtags!.push('sequence')
    for (const compact of [false, true]) {
      const html = render(skipped, compact)
      assert.match(html, /2 in sequence/)
      assert.equal(html.split('id="sequence:').length - 1, 1)
      for (const number of [401, 402, 403]) assert.equal(html.split(`data-change-number="${number}"`).length - 1, 1)
      assert.doesNotMatch(html, /Set up a sequence/)
    }
    const { SequenceFamilyReference } = await vite.ssrLoadModule('/src/components/ChangeRow.tsx')
    const { api } = await vite.ssrLoadModule('/src/api.ts')
    const reference = sequenceCards(classifyAll(overlapping, reviewer._account_id))[1]!.references![1]!
    const dom = globalThis as unknown as { document?: unknown }
    const previousDocument = dom.document
    const previousOpen = api.openChange
    try {
      let scrolled = false
      let opened: unknown = null
      api.openChange = async (link: unknown) => { opened = link }
      dom.document = { getElementById: (id: string) => {
        assert.equal(id, `sequence:${reference.key}`)
        return { scrollIntoView: () => { scrolled = true } }
      } }
      SequenceFamilyReference({ reference }).props.onClick()
      assert.equal(scrolled, true)
      assert.equal(opened, null)
      dom.document = { getElementById: () => null }
      SequenceFamilyReference({ reference }).props.onClick()
      assert.deepEqual(opened, { id: 102, project: 'demo' })
    } finally {
      dom.document = previousDocument
      api.openChange = previousOpen
    }
  } finally {
    await vite.close()
    browser.window = previousWindow
  }
})
