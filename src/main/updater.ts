// Application updates from the GitHub releases of this repository, through
// electron-updater. Nothing is downloaded or installed without a click: a
// check finds a newer release, the user asks for the download, then asks for
// the restart that installs it. The state machine is in ../shared/update.ts
// so the renderer, the tray and this file agree on what happens next.
import { app, dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../shared/types.ts'
import * as u from '../shared/update.ts'

const STARTUP_DELAY_MS = 10_000
const POLL_INTERVAL_MS = 60 * 60_000

export interface UpdaterOptions {
  onChange(state: UpdateState): void
  /**
   * Quitting for an install closes the window first; the close handler must
   * know it is a real quit or it hides the window to the tray and cancels it.
   */
  setQuitting(on: boolean): void
  window(): BrowserWindow | null
}

export interface Updater {
  getState(): UpdateState
  check(): Promise<UpdateState>
  download(): Promise<UpdateState>
  /** Quit and install the downloaded update; with confirm, a native dialog asks first. */
  install(confirm: boolean): Promise<UpdateState>
  /** Whatever the state calls for next: check, download or install. */
  runAction(confirmInstall: boolean): Promise<UpdateState>
  /** Check shortly after start, then every hour. */
  start(): void
  stop(): void
}

export function createUpdater(opts: UpdaterOptions): Updater {
  // electron-updater reads the packaged app's metadata. From the source tree
  // it can use dev-app-update.yml instead when asked (see docs/testing.md).
  const enabled = app.isPackaged || process.env['GERRIT_GUI_DEV_UPDATE'] === '1'
  let state = u.initialUpdateState(app.getVersion(), enabled ? null : 'Automatic updates only work in the packaged app.')
  let checking: Promise<UpdateState> | null = null
  let downloading: Promise<UpdateState> | null = null
  const timers: NodeJS.Timeout[] = []

  const set = (next: UpdateState): void => {
    state = next
    opts.onChange(state)
  }
  const now = (): string => new Date().toISOString()

  if (enabled) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.forceDevUpdateConfig = !app.isPackaged
    autoUpdater.logger = console
    autoUpdater.on('update-available', (info) => {
      set(u.onAvailable(state, info.version, u.plainReleaseNotes(info.releaseNotes), now()))
    })
    autoUpdater.on('update-not-available', () => set(u.onNoUpdate(state, now())))
    autoUpdater.on('download-progress', (p) => {
      // Whole percents only; the raw events come per chunk.
      if (Math.floor(p.percent) !== Math.floor(state.downloadPercent ?? -1)) set(u.onDownloadProgress(state, p.percent))
    })
    autoUpdater.on('update-downloaded', (info) => set(u.onDownloaded(state, info.version)))
    // Failures are handled where the check or download started; this listener
    // only keeps an 'error' emit from being fatal.
    autoUpdater.on('error', (e) => console.warn('updater:', e.message))
  }

  function check(): Promise<UpdateState> {
    if (!enabled || state.status === 'downloading') return Promise.resolve(state)
    if (checking) return checking
    set(u.onCheckStart(state, now()))
    checking = autoUpdater
      .checkForUpdates()
      .then((r) => {
        // The events above normally move the state on before this resolves.
        if (state.status === 'checking') {
          if (r?.isUpdateAvailable) {
            set(u.onAvailable(state, r.updateInfo.version, u.plainReleaseNotes(r.updateInfo.releaseNotes), now()))
          } else if (r) {
            set(u.onNoUpdate(state, now()))
          } else {
            set(u.onCheckFailure(state, 'The updater is not active in this build.', now()))
          }
        }
        return state
      })
      .catch((e: unknown) => {
        set(u.onCheckFailure(state, describe(e), now()))
        return state
      })
      .finally(() => {
        checking = null
      })
    return checking
  }

  function download(): Promise<UpdateState> {
    const version = state.availableVersion
    if (!enabled || !version || state.downloadedVersion === version) return Promise.resolve(state)
    if (downloading) return downloading
    set(u.onDownloadStart(state))
    downloading = autoUpdater
      .downloadUpdate()
      .then(() => {
        if (state.status === 'downloading') set(u.onDownloaded(state, version))
        return state
      })
      .catch((e: unknown) => {
        set(u.onDownloadFailure(state, describe(e)))
        return state
      })
      .finally(() => {
        downloading = null
      })
    return downloading
  }

  async function install(confirm: boolean): Promise<UpdateState> {
    const version = state.downloadedVersion
    if (!enabled || !version) return state
    if (confirm) {
      const box: MessageBoxOptions = {
        type: 'question',
        message: `Install version ${version} and restart Gerrit Review Board?`,
        buttons: ['Restart and install', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }
      const win = opts.window()
      const { response } = win && win.isVisible() ? await dialog.showMessageBox(win, box) : await dialog.showMessageBox(box)
      if (response !== 0) return state
    }
    opts.setQuitting(true)
    try {
      autoUpdater.quitAndInstall(false, true)
    } catch (e) {
      opts.setQuitting(false)
      set(u.onInstallFailure(state, describe(e)))
    }
    return state
  }

  function runAction(confirmInstall: boolean): Promise<UpdateState> {
    switch (u.updateAction(state)) {
      case 'check':
        return check()
      case 'download':
        return download()
      case 'install':
        return install(confirmInstall)
      case 'none':
        return Promise.resolve(state)
    }
  }

  return {
    getState: () => state,
    check,
    download,
    install,
    runAction,
    start() {
      if (!enabled || timers.length) return
      timers.push(setTimeout(() => void check(), STARTUP_DELAY_MS))
      timers.push(setInterval(() => void check(), POLL_INTERVAL_MS))
    },
    stop() {
      for (const t of timers) clearTimeout(t)
      timers.length = 0
    },
  }
}

/** First line of the error; electron-updater messages can run to several. */
function describe(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.split('\n')[0]?.trim() || 'unknown error'
}
