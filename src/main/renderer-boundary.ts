import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron'

/** Absolute web links only. Never pass renderer-supplied OS protocol handlers to the shell. */
export function externalWebUrl(input: unknown): string {
  if (typeof input !== 'string' || !/^https?:\/\/[^/]/i.test(input) || /[\\\u0000-\u0020\u007f]/.test(input)) {
    throw new Error('Only absolute http and https links can be opened')
  }
  const url = new URL(input)
  if (!url.hostname || url.username || url.password) throw new Error('Invalid external web link')
  return url.href
}

function documentUrl(input: string): URL {
  const url = new URL(input)
  url.hash = ''
  return url
}

/** A window and its current main frame must both belong to the pinned app document. */
export class RendererBoundary {
  private readonly renderers = new WeakMap<WebContents, URL>()

  register(contents: WebContents, entry: string): void {
    this.renderers.set(contents, documentUrl(entry))
    contents.once('destroyed', () => this.renderers.delete(contents))
    // App routes use hashes. Reloads of the pinned document are also safe.
    contents.on('will-navigate', (event) => {
      if (!this.allowsNavigation(contents, event.url, true, event.initiator)) event.preventDefault()
    })
    contents.on('will-frame-navigate', (event) => {
      if (!this.allowsNavigation(contents, event.url, event.isMainFrame, event.initiator)) event.preventDefault()
    })
    contents.on('will-redirect', (event) => {
      if (!this.allowsNavigation(contents, event.url, event.isMainFrame, event.initiator)) event.preventDefault()
    })
    contents.on('will-attach-webview', event => event.preventDefault())
    // Electron does not provide the initiating frame here. Referrer URLs are not proof.
    // External links use the named IPC APIs, which authenticate the exact main frame.
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  }

  allowsNavigation(contents: WebContents, target: string, isMainFrame: boolean, initiator?: WebFrameMain | null): boolean {
    if (!isMainFrame || contents.isDestroyed()) return false
    const entry = this.renderers.get(contents)
    if (!entry) return false
    try {
      if (initiator && (initiator !== contents.mainFrame || initiator.detached || initiator.parent !== null)) return false
      return documentUrl(target).href === entry.href
    } catch {
      return false
    }
  }

  private isTrustedMainFrame(contents: WebContents): boolean {
    if (contents.isDestroyed()) return false
    try {
      const entry = this.renderers.get(contents)
      const frame = contents.mainFrame
      // Chromium serializes the local file origin as file://, unlike Node's URL.origin.
      const origin = entry?.protocol === 'file:' ? 'file://' : entry?.origin
      return Boolean(entry && !frame.detached && frame.parent === null &&
        frame.origin === origin && this.allowsNavigation(contents, frame.url, true) &&
        this.allowsNavigation(contents, contents.getURL(), true))
    } catch {
      // A frame can disappear while Electron dispatches an event.
      return false
    }
  }

  isTrustedSender(event: Pick<IpcMainInvokeEvent | IpcMainEvent, 'sender' | 'senderFrame'>): boolean {
    try {
      return this.isTrustedMainFrame(event.sender) && event.senderFrame === event.sender.mainFrame
    } catch {
      return false
    }
  }
}

/** Central registration keeps new channels behind the same sender check. */
export function trustedIpc(ipcMain: IpcMain, boundary: RendererBoundary, authorize: (event: IpcMainInvokeEvent | IpcMainEvent, channel: string, args: unknown[]) => void = () => {}): Pick<IpcMain, 'handle' | 'on'> {
  return {
    handle(channel, listener) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!boundary.isTrustedSender(event)) throw new Error('Untrusted IPC sender')
        authorize(event, channel, args)
        return listener(event, ...args)
      })
    },
    on(channel, listener) {
      return ipcMain.on(channel, (event, ...args) => {
        // Send-only IPC has no error reply. Drop it before any side effect.
        if (boundary.isTrustedSender(event)) {
          try { authorize(event, channel, args) } catch { return }
          listener(event, ...args)
        }
      })
    },
  }
}
