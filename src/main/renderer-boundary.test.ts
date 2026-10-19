import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron'
import { externalWebUrl, RendererBoundary, trustedIpc } from './renderer-boundary.ts'

function fixture(entry = 'file:///opt/app/renderer/index.html') {
  const boundary = new RendererBoundary()
  const emitter = new EventEmitter()
  const frame = { url: entry, origin: (entry.startsWith('file:') ? 'file://' : new URL(entry).origin), parent: null, detached: false }
  let destroyed = false
  let currentUrl = entry
  let popup: (details: { url: string }) => { action: string }
  const contents = Object.assign(emitter, {
    mainFrame: frame,
    isDestroyed: () => destroyed,
    getURL: () => currentUrl,
    setWindowOpenHandler: (handler: typeof popup) => { popup = handler },
  }) as unknown as WebContents
  boundary.register(contents, entry)
  const event = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent
  return { boundary, contents, frame, event,
    popup: (url: string) => popup({ url }),
    destroy: () => { destroyed = true; emitter.emit('destroyed') },
    setCurrentUrl: (url: string) => { currentUrl = url },
  }
}

test('external links accept absolute HTTP(S), preserving Gerrit paths and Slack web links', () => {
  for (const url of ['https://gerrit.example/gerrit/c/project%2Fone/+/12/3..5#42', 'http://localhost:8080/c/demo/+/1', 'https://workspace.slack.com/archives/C123/p1726500000123456']) {
    assert.equal(externalWebUrl(url), url)
  }
  assert.equal(externalWebUrl('HTTPS://EXAMPLE.COM'), 'https://example.com/')
})

test('external links reject OS schemes, relative links, malformed URLs and credentials', () => {
  for (const url of [null, {}, ['https://example.com'], 42, '', '/settings', '//example.com', 'https:example.com', 'https://', 'https:///example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hello', 'blob:https://example.com/id', 'about:blank', 'slack://channel?team=T123&id=C123', 'mailto:alice@example.com', 'tel:123', 'ms-settings:privacy', ' https://example.com', 'https://example.com\n', 'https://exam\tple.com', 'https://example.com\\@evil.test', 'https://user:password@example.com', 'https://example.com:invalid']) {
    assert.throws(() => externalWebUrl(url), Error, String(url))
  }
})

test('only the pinned document and hash routes can navigate in the main frame', () => {
  for (const entry of ['file:///opt/app/renderer/index.html', 'http://localhost:5173/', 'http://localhost:5173/app?dev=1']) {
    const f = fixture(entry)
    assert.equal(f.boundary.allowsNavigation(f.contents, entry + '#connection', true), true)
    assert.equal(f.boundary.allowsNavigation(f.contents, entry, true), true)
    for (const url of ['file:///etc/passwd', 'file:///opt/app/renderer/other.html', 'http://localhost:5173/hostile.html', 'http://localhost:5174/', 'http://localhost:5173.evil.test/', 'http://127.0.0.1:5173/', 'https://localhost:5173/', entry + '?untrusted=1', 'about:blank', 'data:text/html,test', 'blob:' + entry, 'javascript:void(0)', 'invalid']) {
      assert.equal(f.boundary.allowsNavigation(f.contents, url, true), false, url)
    }
    assert.equal(f.boundary.allowsNavigation(f.contents, entry, false), false, 'no child frames')
  }
})

test('navigation, frame navigation, redirects and webview attachment are guarded', () => {
  const f = fixture()
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
    let prevented = false
    f.contents.emit(name, { url: 'https://evil.test/', isMainFrame: true, preventDefault: () => { prevented = true } })
    assert.equal(prevented, true, name)
  }
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect']) {
    let prevented = false
    f.contents.emit(name, { url: f.frame.url + '#tab=settings', isMainFrame: true, preventDefault: () => { prevented = true } })
    assert.equal(prevented, false, name)
  }
})

test('IPC requires a registered live contents and its exact current main frame, document and origin', () => {
  const f = fixture()
  assert.equal(f.boundary.isTrustedSender(f.event), true)
  f.frame.url += '#connection'
  assert.equal(f.boundary.isTrustedSender(f.event), true)
  const rogue = fixture()
  assert.equal(f.boundary.isTrustedSender(rogue.event), false, 'same URL in another window')
  for (const frame of [null, { ...f.frame }, { ...f.frame, parent: f.frame }]) {
    assert.equal(f.boundary.isTrustedSender({ ...f.event, senderFrame: frame } as IpcMainInvokeEvent), false)
  }
  f.frame.origin = 'https://evil.test'
  assert.equal(f.boundary.isTrustedSender(f.event), false)
  f.frame.origin = 'file://'
  f.frame.url = 'about:blank'
  assert.equal(f.boundary.isTrustedSender(f.event), false, 'inherited origin is insufficient')
  f.frame.url = 'file:///opt/app/renderer/index.html'
  f.frame.detached = true
  assert.equal(f.boundary.isTrustedSender(f.event), false)
  f.frame.detached = false
  f.setCurrentUrl('https://evil.test/')
  assert.equal(f.boundary.isTrustedSender(f.event), false)
  f.setCurrentUrl(f.frame.url)
  f.destroy()
  assert.equal(f.boundary.isTrustedSender(f.event), false)
})

test('popups never dispatch externally because the initiator cannot be authenticated', () => {
  const f = fixture()
  assert.deepEqual(f.popup('https://example.com/'), { action: 'deny' })
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'slack://channel', 'data:text/html,test']) {
    assert.deepEqual(f.popup(url), { action: 'deny' })
  }
  f.frame.url = 'https://evil.test/'
  assert.deepEqual(f.popup('https://other.test/'), { action: 'deny' })
})

test('all wrapped invoke and send handlers reject hostile senders before side effects', () => {
  const f = fixture('http://localhost:5173/')
  let handle!: (...args: any[]) => any
  let send!: (...args: any[]) => any
  const ipcMain = {
    handle: (_channel: string, handler: typeof handle) => { handle = handler },
    on: (_channel: string, handler: typeof send) => { send = handler; return ipcMain },
  } as unknown as IpcMain
  const ipc = trustedIpc(ipcMain, f.boundary)
  const effects: string[] = []
  ipc.handle('settings:save', (_event, value: string) => { effects.push(value); return 'saved' })
  ipc.on('ui:badge', (_event, value: string) => { effects.push(value) })
  const hostile = fixture('http://localhost:5173/').event
  assert.throws(() => handle(hostile, 'hostile'), /Untrusted IPC sender/)
  assert.doesNotThrow(() => send(hostile, 'hostile'))
  assert.deepEqual(effects, [])
  assert.equal(handle(f.event, 'settings'), 'saved')
  send(f.event, 'badge')
  assert.deepEqual(effects, ['settings', 'badge'])
})

test('child and detached initiators cannot navigate the main frame to the pinned document', () => {
  const f = fixture()
  assert.equal(f.boundary.allowsNavigation(f.contents, f.frame.url, true, f.contents.mainFrame), true)
  assert.equal(f.boundary.allowsNavigation(f.contents, f.frame.url, true, { ...f.frame, parent: f.frame } as any), false)
  f.frame.detached = true
  assert.equal(f.boundary.allowsNavigation(f.contents, f.frame.url, true, f.contents.mainFrame), false)
})

test('stale frame identities and disposed frame access fail closed', () => {
  const f = fixture()
  const current = { ...f.frame }
  Object.assign(f.contents, { mainFrame: current })
  assert.equal(f.boundary.isTrustedSender(f.event), false, 'old frame cannot borrow the new main frame URL')
  assert.equal(f.boundary.isTrustedSender({ ...f.event, senderFrame: current } as unknown as IpcMainInvokeEvent), true)
  Object.defineProperty(current, 'origin', { get() { throw Error('Frame disposed') } })
  assert.doesNotThrow(() => f.boundary.isTrustedSender(f.event))
  assert.equal(f.boundary.isTrustedSender(f.event), false)
})
