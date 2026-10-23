import { app, BrowserWindow, ipcMain, Menu, net, shell } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import * as settings from './settings.ts'
import { createService } from './service.ts'
import { TrayController } from './tray.ts'
import { createUpdater, type Updater } from './updater.ts'
import { RELEASES_URL, updateAction } from '../shared/update.ts'
import { slackDeepLink } from '../shared/model.ts'
import type { BadgePayload, ChangeAction, ChangeLink, SettingsInput, TabId, UiState, WindowBounds } from '../shared/types.ts'
import appIconPath from '../../resources/icon.png?asset'
import { editorContextMenu } from './editor-context-menu.ts'
import { externalWebUrl, RendererBoundary, trustedIpc } from './renderer-boundary.ts'
import { pathToFileURL } from 'node:url'
import { ReviewMutations, REVIEW_WRITES } from './review-mutations.ts'
import { requireDraftVersion } from '../shared/draft-version.ts'
import { ReviewWindows, validateReviewLink } from './review-windows.ts'
import { NativeReviewNavigation } from './native-review.ts'

app.on('web-contents-created', (_event, contents) => {
  contents.on('context-menu', (_event, params) => {
    const template = editorContextMenu(params, {
      replace: word => contents.replaceMisspelling(word),
      addToDictionary: word => { contents.session.addWordToSpellCheckerDictionary(word) },
    })
    if (template.length) Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(contents) ?? undefined })
  })
})

const COMPACT_DEFAULT: WindowBounds = { x: 0, y: 0, width: 460, height: 720 }
const NORMAL_DEFAULT: WindowBounds = { x: 0, y: 0, width: 1200, height: 800 }

const reviewWindows = new ReviewWindows<BrowserWindow>()
let connectionGeneration = 0
const reviewMutations = new ReviewMutations((id, connection, generation) => {
  for (const win of BrowserWindow.getAllWindows()) {
    const review = reviewWindows.get(win.webContents.id)
    if (!review || review.context.connection === connection && review.context.link?.id === id) win.webContents.send('app:reviewChanged', { id, connection, generation })
  }
})
let mainWindow: BrowserWindow | null = null
/** The connection window: server, account and password, apart from the settings page. */
let connectionWindow: BrowserWindow | null = null
let tray: TrayController | null = null
let ui: UiState = { compact: false }
/** User setting: the compact window floats above other windows (see Settings, Window). */
let compactOnTop = true
let quitting = false
let updater: Updater | null = null

// net.fetch: Chromium's network stack, so the OS certificate store and system proxy apply.
const service = createService(settings, (url, init) => net.fetch(url, init))
const rendererBoundary = new RendererBoundary()
// Packaged builds always load the bundled document. Development pins the exact Vite entry URL.
const rendererEntry = !app.isPackaged && process.env['ELECTRON_RENDERER_URL']
  ? externalWebUrl(process.env['ELECTRON_RENDERER_URL'])
  : pathToFileURL(path.join(__dirname, '../renderer/index.html')).href

async function openWebUrl(url: unknown): Promise<void> {
  await shell.openExternal(externalWebUrl(url))
}

const nativeReview = new NativeReviewNavigation({
  getSettings: () => service.getSettings(),
  fetchChange: (id) => service.fetchChange(id),
  openWeb: async (link) => openWebUrl(await service.changeUrl(link)),
  show: showWindow,
  send: (request) => mainWindow?.webContents.send('app:review', request),
  openSeparate: (link) => createReviewWindow(link),
})

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** Raise the window on the given board tab (from the tray menu). */
function showTab(tab: TabId): void {
  showWindow()
  const wc = mainWindow?.webContents
  if (!wc) return
  const send = () => wc.send('app:tab', tab)
  if (wc.isLoading()) wc.once('did-finish-load', send)
  else send()
}

function currentBounds(): WindowBounds | undefined {
  if (!mainWindow || mainWindow.isMinimized() || mainWindow.isMaximized()) return undefined
  return mainWindow.getBounds()
}

async function setCompact(on: boolean): Promise<void> {
  if (on === ui.compact) return
  const patch: Partial<UiState> = { compact: on }
  const bounds = currentBounds()
  if (bounds) patch[ui.compact ? 'compactBounds' : 'bounds'] = bounds
  ui = await settings.saveUi(patch)
  applyWindowMode()
  tray?.setCompact(on)
  mainWindow?.webContents.send('app:compact', on)
}

/** Compact mode: a narrow window; optionally pinned on top and visible on every workspace. */
function applyWindowMode(): void {
  if (!mainWindow) return
  const target = ui.compact ? (ui.compactBounds ?? COMPACT_DEFAULT) : (ui.bounds ?? NORMAL_DEFAULT)
  applyPinning()
  mainWindow.setMinimumSize(ui.compact ? 320 : 800, 400)
  mainWindow.setSize(target.width, target.height)
  if (target.x || target.y) mainWindow.setPosition(target.x, target.y)
}

function applyPinning(): void {
  if (!mainWindow) return
  const pinned = ui.compact && compactOnTop
  mainWindow.setAlwaysOnTop(pinned, 'floating')
  // skipTransformProcessType: without it Electron turns the process into a
  // macOS accessory app (no Dock icon) whenever visibleOnFullScreen is set,
  // even when `visible` is false. We always want the Dock icon and its badge.
  mainWindow.setVisibleOnAllWorkspaces(pinned, {
    visibleOnFullScreen: pinned,
    skipTransformProcessType: true,
  })
}

async function setCompactOnTop(on: boolean): Promise<void> {
  await service.patchSettings({ compactOnTop: on })
  await refreshWindowPrefs()
  broadcast('app:settings')
}

/** Re-read window and tray preferences and apply them. */
async function refreshWindowPrefs(): Promise<void> {
  const prefs = await service.getSettings()
  compactOnTop = prefs.compactOnTop
  tray?.setClickAction(prefs.trayClickAction)
  applyPinning()
  tray?.setCompactOnTop(compactOnTop)
}

let saveBoundsTimer: NodeJS.Timeout | null = null
function scheduleSaveBounds(): void {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    const bounds = currentBounds()
    if (bounds) void settings.saveUi(ui.compact ? { compactBounds: bounds } : { bounds })
  }, 500)
}

function broadcast(channel: string, value?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, value)
}

function registerIpc(): void {
  const authenticated = trustedIpc(ipcMain, rendererBoundary, (event, channel, args) => {
    reviewWindows.authorize(event.sender.id, channel, args, connectionGeneration)
  })
  const ipc: typeof authenticated = {
    on: authenticated.on,
    handle(channel, listener) {
      authenticated.handle(channel, async (event, ...args) => {
        const connection = connectionGeneration
        if (REVIEW_WRITES.has(channel)) {
          const first = args[0] as ChangeLink | number
          const id = typeof first === 'number' ? first : first.id
          const action = args[0] as { type?: string; add?: number[]; remove?: number[] }
          const ids = channel === 'gerrit:act' && action.type === 'setSequence' ? [id, ...(action.add ?? []), ...(action.remove ?? [])] : [id]
          return reviewMutations.run(ids, connection, () => connectionGeneration, async () => {
            if (channel === 'gerrit:saveReviewDraft' || channel === 'gerrit:deleteReviewDraft') {
              const draftId = channel === 'gerrit:saveReviewDraft' ? (args[2] as { id?: string }).id : args[2] as string
              if (draftId) requireDraftVersion((await service.reviewDiscussion(id)).drafts, draftId, args[3] as string | undefined)
            }
            return listener(event, ...args)
          })
        }
        const result = await listener(event, ...args)
        if (channel.startsWith('gerrit:') && connection !== connectionGeneration) throw new Error('Connection changed. The old response was discarded.')
        return result
      })
    },
  }
  ipc.handle('window:context', event => {
    const review = reviewWindows.get(event.sender.id)?.context
    if (review) return review.connection === connectionGeneration ? review : { ...review, error: 'Connection changed. Close and reopen this review.' }
    return { kind: event.sender === connectionWindow?.webContents ? 'connection' : 'board' }
  })
  ipc.handle('window:openReview', async (_event, link: ChangeLink, subject: string) => {
    validateReviewLink(link)
    const prefs = await service.getSettings()
    if (!prefs.localReview || !prefs.separateReviewWindows) return false
    await createReviewWindow(link, subject)
    return true
  })
  ipc.handle('window:close', event => { reviewWindows.get(event.sender.id)?.window.close() })
  ipc.on('window:closeReply', (event, token: number, allowed: boolean) => {
    const win = reviewWindows.finishClose(event.sender.id, token)
    if (win && allowed && !reviewMutations.busy(reviewWindows.get(event.sender.id)?.context.link?.id ?? -1)) win.destroy()
  })
  ipc.handle('settings:get', () => service.getSettings())
  ipc.handle('settings:save', async (_e, input: SettingsInput) => {
    await service.saveSettings(input)
    await refreshWindowPrefs()
    broadcast('app:settings')
  })
  ipc.handle('settings:patch', async (_e, input: Partial<SettingsInput>) => {
    const before = await service.getSettings()
    const saved = await service.patchSettings(input)
    if (before.serverUrl !== saved.serverUrl || before.username !== saved.username) {
      connectionGeneration++
      broadcast('app:connection')
    }
    await refreshWindowPrefs()
    broadcast('app:settings')
    return saved
  })
  ipc.handle('preferences:get', (_e, legacy: unknown) => settings.getReviewPreferences(legacy))
  ipc.handle('preferences:patch', async (_e, patch) => {
    const saved = await settings.patchReviewPreferences(patch)
    broadcast('app:preferences', saved)
    return saved
  })
  ipc.handle('gerrit:testConnection', () => service.testConnection())
  ipc.handle('gerrit:fetchDashboard', () => service.fetchDashboard())
  ipc.handle('gerrit:fetchChange', (_e, id: number) => service.fetchChange(id))
  ipc.handle('gerrit:reviewBlame', (_e, link: ChangeLink, path: string) => service.reviewBlame(link, path))
  ipc.handle('gerrit:previewReviewFix', (_e, id: number, patchSet: number, fix: import('../shared/types.ts').FixSuggestion) => service.previewReviewFix(id, patchSet, fix))
  ipc.handle('gerrit:applyProvidedReviewFix', (_e, id: number, patchSet: number, fix: import('../shared/types.ts').FixSuggestion) => service.applyProvidedReviewFix(id, patchSet, fix))
  ipc.handle('gerrit:reviewFiles', (_e, link: ChangeLink) => service.reviewFiles(link))
  ipc.handle('gerrit:reviewDiff', (_e, link: ChangeLink, path: string) => service.reviewDiff(link, path))
  ipc.handle('gerrit:reviewCommentPositions', (_e, link: ChangeLink) => service.reviewCommentPositions(link))
  ipc.handle('gerrit:reviewDiscussion', (_e, id: number) => service.reviewDiscussion(id))
  ipc.handle('gerrit:saveReviewDraft', (_e, id: number, patchSet: number, input: import('../shared/types.ts').DraftCommentInput) => service.saveReviewDraft(id, patchSet, input))
  ipc.handle('gerrit:deleteReviewDraft', (_e, id: number, patchSet: number, draftId: string) => service.deleteReviewDraft(id, patchSet, draftId))
  ipc.handle('gerrit:deleteReviewComment', (_e, id: number, patchSet: number, commentId: string, reason: string) => service.deleteReviewComment(id, patchSet, commentId, reason))
  ipc.handle('gerrit:applyReviewFix', (_e, id: number, patchSet: number, fixId: string) => service.applyReviewFix(id, patchSet, fixId))
  ipc.handle('gerrit:submitReview', (_e, link: ChangeLink, input: import('../shared/types.ts').SubmitReviewInput) => service.submitReview(link, input))
  ipc.handle('gerrit:reviewPatchSets', (_e, id: number) => service.reviewPatchSets(id))
  ipc.handle('gerrit:reviewReviewedFiles', (_e, link: ChangeLink) => service.reviewReviewedFiles(link))
  ipc.handle('gerrit:setReviewFileReviewed', (_e, link: ChangeLink, path: string, reviewed: boolean) => service.setReviewFileReviewed(link, path, reviewed))
  ipc.handle('gerrit:act', (_e, action: ChangeAction) => service.act(action))
  ipc.handle('gerrit:suggestReviewers', (_e, id: number, q: string) => service.suggestReviewers(id, q))
  ipc.handle('gerrit:suggestAccounts', (_e, q: string) => service.suggestAccounts(q))
  ipc.handle('gerrit:lookupAccounts', (_e, keys: string[]) => service.lookupAccounts(keys))
  ipc.handle('gerrit:openChange', async (_e, link: ChangeLink) => {
    await openWebUrl(await service.changeUrl(link))
  })
  ipc.handle('gerrit:changeUrl', (_e, link: ChangeLink) => service.changeUrl(link))
  ipc.handle('gerrit:inspectChange', (_e, id: number) => service.inspectChange(id))
  ipc.handle('gerrit:getPretend', () => service.getPretend())
  ipc.handle('gerrit:setPretend', async (_e, key: string | null) => { const result = await service.setPretend(key); connectionGeneration++; broadcast('app:connection'); return result })
  ipc.handle('app:openUrl', async (_e, url: string) => {
    // Comment and Slack links may open a browser. Keep other URI schemes out of the shell.
    const webUrl = externalWebUrl(url)
    // A Slack link opens in the Slack app when Settings knows the workspace's team ID; the slack:// link is
    // built here from the stored ID, never taken from the renderer. Without Slack installed the open fails
    // (or on macOS does nothing), so the browser gets the https link then.
    const deep = slackDeepLink(webUrl, (await service.getSettings()).slackWorkspaces)
    if (deep) {
      try {
        await shell.openExternal(deep)
        return
      } catch (e) {
        console.warn('Open in Slack:', (e as Error).message)
      }
    }
    await openWebUrl(webUrl)
  })

  ipc.handle('connection:open', () => showConnectionWindow())
  ipc.handle('connection:changed', () => {
    broadcast('app:connection')
  })
  ipc.handle('connection:close', () => connectionWindow?.close())

  ipc.handle('ui:get', (): UiState => ui)
  ipc.handle('ui:setCompact', (_e, on: boolean) => setCompact(on))
  ipc.on('ui:badge', (_e, payload: BadgePayload) => {
    tray?.setBadge(payload, mainWindow)
  })
  // Connection windows are trusted app documents too, but cannot consume board navigation.
  ipc.on('app:reviewReady', (event, ready: unknown) => {
    if (event.sender === mainWindow?.webContents && typeof ready === 'boolean') nativeReview.setReady(ready)
  })
  ipc.on('app:reviewHandled', (event, requestId: unknown) => {
    if (event.sender === mainWindow?.webContents && typeof requestId === 'number') nativeReview.acknowledge(requestId)
  })

  ipc.handle('update:get', () => updater?.getState())
  ipc.handle('update:check', () => updater?.check())
  ipc.handle('update:download', () => updater?.download())
  ipc.handle('update:install', (_e, confirm: boolean) => updater?.install(confirm))
  ipc.handle('update:openReleaseNotes', async () => {
    await openWebUrl(updater?.getState().releaseUrl ?? RELEASES_URL)
  })
}

async function createReviewWindow(input: ChangeLink, subject?: string): Promise<void> {
  validateReviewLink(input)
  const connection = connectionGeneration
  let link = { ...input }
  let error: string | undefined
  try {
    if (!subject || !link.patchSet) {
      const change = await service.fetchChange(link.id)
      subject = change.subject
      link = { ...link, patchSet: link.patchSet ?? change.revisions?.[change.current_revision ?? '']?._number }
    }
    if (!subject || !link.patchSet) throw new Error('The change has no reviewable patch set or subject')
    if (connection !== connectionGeneration) throw new Error('Connection changed. Close and reopen this review.')
  } catch (reason) { error = `Could not open review #${link.id}: ${reason instanceof Error ? reason.message : String(reason)}` }
  const win = new BrowserWindow({
    ...NORMAL_DEFAULT, minWidth: 640, minHeight: 400, show: false,
    title: `#${link.id} ${subject ?? 'Review'}`, icon: appIconPath, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, '../preload/index.js'), contextIsolation: true, backgroundThrottling: false,
      nodeIntegration: false, nodeIntegrationInSubFrames: false, webviewTag: false, sandbox: true },
  })
  const id = win.webContents.id
  reviewWindows.add(id, win, { kind: 'review', connection, link, subject, error })
  win.once('ready-to-show', () => { win.show(); win.focus() })
  win.on('close', event => {
    if (quitting) return
    event.preventDefault()
    const token = reviewWindows.requestClose(id)
    if (token === undefined) return
    win.webContents.send('app:closeReview', token)
    const timer = setTimeout(() => reviewWindows.finishClose(id, token), 15000)
    timer.unref()
  })
  win.webContents.on('did-start-loading', () => {
    const pending = reviewWindows.get(id)?.closeToken
    if (pending) reviewWindows.finishClose(id, pending)
  })
  win.on('closed', () => reviewWindows.delete(id))
  loadRenderer(win, 'review')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    ...NORMAL_DEFAULT,
    minWidth: 800,
    minHeight: 400,
    title: 'Gerrit Review Board',
    icon: appIconPath,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      sandbox: true,
    },
  })
  mainWindow = win
  applyWindowMode()
  win.once('ready-to-show', () => { win.show(); win.focus() })
  win.webContents.on('did-start-loading', () => nativeReview.setReady(false))
  win.webContents.on('render-process-gone', () => nativeReview.setReady(false))
  win.on('resize', scheduleSaveBounds)
  win.on('move', scheduleSaveBounds)
  // Close hides to the tray so the board stays resident; Quit is in the tray menu.
  win.on('close', (e) => {
    if (!quitting && tray?.available) {
      e.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    nativeReview.setReady(false)
    mainWindow = null
  })
  // Optional initial tab, e.g. GERRIT_GUI_TAB=mine (also used by the screenshot test hook).
  loadRenderer(win, process.env['GERRIT_GUI_TAB'] ? `tab=${process.env['GERRIT_GUI_TAB']}` : '')
  return win
}

function loadRenderer(win: BrowserWindow, hash: string): void {
  rendererBoundary.register(win.webContents, rendererEntry)
  const url = new URL(rendererEntry)
  url.hash = hash
  void win.loadURL(url.href)
}

/**
 * The connection window: a small separate window for the server URL, the
 * username and the HTTP password, with the one Test button. It is what the
 * first launch shows, and what "Connection" on the settings page opens. The
 * renderer picks the page from the hash.
 */
function showConnectionWindow(): void {
  if (connectionWindow) {
    if (connectionWindow.isMinimized()) connectionWindow.restore()
    connectionWindow.show()
    connectionWindow.focus()
    return
  }
  const win = new BrowserWindow({
    width: 520,
    height: 560,
    minWidth: 420,
    minHeight: 420,
    title: 'Connection',
    icon: appIconPath,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      sandbox: true,
    },
  })
  connectionWindow = win
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    connectionWindow = null
  })
  loadRenderer(win, 'connection')
}

// Test hooks: isolated config dir, and headless screenshot-then-exit.
if (process.env['GERRIT_GUI_USER_DATA']) app.setPath('userData', process.env['GERRIT_GUI_USER_DATA'])

// One resident instance; a second launch just raises the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)

  void app.whenReady().then(async () => {
    ui = await settings.getUi()
    const prefs = await service.getSettings()
    compactOnTop = prefs.compactOnTop
    registerIpc()
    updater = createUpdater({
      onChange: (state) => {
        tray?.setUpdate(state)
        mainWindow?.webContents.send('app:update', state)
      },
      setQuitting: (on) => {
        quitting = on
      },
      window: () => mainWindow,
    })
    tray = new TrayController(
      {
        show: showWindow,
        showTab,
        refresh: () => mainWindow?.webContents.send('app:refresh'),
        openChange: (link) => {
          void nativeReview.select(link)
        },
        setCompact: (on) => void setCompact(on),
        setCompactOnTop: (on) => void setCompactOnTop(on),
        update: () => {
          if (!updater) return
          // Progress and the restart prompt are in the window, so raise it for a download.
          if (updateAction(updater.getState()) === 'download') showWindow()
          void updater.runAction(true)
        },
        quit: () => {
          quitting = true
          app.quit()
        },
      },
      ui.compact,
      compactOnTop,
      prefs.trayClickAction,
    )
    tray.setUpdate(updater.getState())
    const win = createWindow()
    const shot = process.env['GERRIT_GUI_SCREENSHOT']
    // First launch: nothing to show until the server and the account are in.
    const s = await service.getSettings()
    if (!(s.serverUrl && s.username && s.hasPassword) && !shot) showConnectionWindow()
    if (shot) {
      const delay = Number(process.env['GERRIT_GUI_SCREENSHOT_DELAY'] ?? 3000)
      win.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          // Optional JS to run first, e.g. to open a row or a dialog.
          const js = process.env['GERRIT_GUI_SCREENSHOT_JS']
          if (js) await win.webContents.executeJavaScript(js)
          await new Promise((r) => setTimeout(r, 300))
          const img = await win.webContents.capturePage()
          await fs.writeFile(shot, img.toPNG())
          quitting = true
          app.quit()
        }, delay)
      })
    }
    updater.start()
    app.on('activate', showWindow)
  }).catch(error => {
    console.error('Desktop startup failed while initializing application:', error)
    app.exit(1)
  })
}

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  // With a tray the app stays resident; without one (no system tray), quit like a normal app.
  if (process.platform !== 'darwin' && !tray?.available) app.quit()
})
