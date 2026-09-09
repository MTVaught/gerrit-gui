import { app, BrowserWindow, ipcMain, net, shell } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import * as settings from './settings.ts'
import { createService } from './service.ts'
import { TrayController } from './tray.ts'
import type { BadgePayload, ChangeAction, SettingsInput, TabId, UiState, WindowBounds } from '../shared/types.ts'
import appIconPath from '../../resources/icon.png?asset'

const COMPACT_DEFAULT: WindowBounds = { x: 0, y: 0, width: 460, height: 720 }
const NORMAL_DEFAULT: WindowBounds = { x: 0, y: 0, width: 1200, height: 800 }

let mainWindow: BrowserWindow | null = null
let tray: TrayController | null = null
let ui: UiState = { compact: false }
let quitting = false

// net.fetch: Chromium's network stack, so the OS certificate store and system proxy apply.
const service = createService(settings, (url, init) => net.fetch(url, init))

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

/** Compact mode: small, always on top, visible on every workspace. */
function applyWindowMode(): void {
  if (!mainWindow) return
  const target = ui.compact ? (ui.compactBounds ?? COMPACT_DEFAULT) : (ui.bounds ?? NORMAL_DEFAULT)
  mainWindow.setAlwaysOnTop(ui.compact, 'floating')
  // skipTransformProcessType: without it Electron turns the process into a
  // macOS accessory app (no Dock icon) whenever visibleOnFullScreen is set,
  // even when `visible` is false. We always want the Dock icon and its badge.
  mainWindow.setVisibleOnAllWorkspaces(ui.compact, {
    visibleOnFullScreen: ui.compact,
    skipTransformProcessType: true,
  })
  mainWindow.setMinimumSize(ui.compact ? 320 : 800, 400)
  mainWindow.setSize(target.width, target.height)
  if (target.x || target.y) mainWindow.setPosition(target.x, target.y)
}

let saveBoundsTimer: NodeJS.Timeout | null = null
function scheduleSaveBounds(): void {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    const bounds = currentBounds()
    if (bounds) void settings.saveUi(ui.compact ? { compactBounds: bounds } : { bounds })
  }, 500)
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => service.getSettings())
  ipcMain.handle('settings:save', (_e, input: SettingsInput) => service.saveSettings(input))
  ipcMain.handle('gerrit:testConnection', () => service.testConnection())
  ipcMain.handle('gerrit:fetchDashboard', () => service.fetchDashboard())
  ipcMain.handle('gerrit:act', (_e, action: ChangeAction) => service.act(action))
  ipcMain.handle('gerrit:suggestReviewers', (_e, id: number, q: string) => service.suggestReviewers(id, q))
  ipcMain.handle('gerrit:openChange', async (_e, id: number) => {
    await shell.openExternal(await service.changeUrl(id))
  })

  ipcMain.handle('ui:get', (): UiState => ui)
  ipcMain.handle('ui:setCompact', (_e, on: boolean) => setCompact(on))
  ipcMain.on('ui:badge', (_e, payload: BadgePayload) => {
    tray?.setBadge(payload, mainWindow)
  })
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
      sandbox: true,
    },
  })
  mainWindow = win
  applyWindowMode()
  win.once('ready-to-show', () => win.show())
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
    mainWindow = null
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Optional initial tab, e.g. GERRIT_GUI_TAB=mine (also used by the screenshot test hook).
  const hash = process.env['GERRIT_GUI_TAB'] ? `tab=${process.env['GERRIT_GUI_TAB']}` : ''
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
  return win
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
    registerIpc()
    tray = new TrayController(
      {
        show: showWindow,
        showTab,
        refresh: () => mainWindow?.webContents.send('app:refresh'),
        setCompact: (on) => void setCompact(on),
        quit: () => {
          quitting = true
          app.quit()
        },
      },
      ui.compact,
    )
    const win = createWindow()
    const shot = process.env['GERRIT_GUI_SCREENSHOT']
    if (shot) {
      const delay = Number(process.env['GERRIT_GUI_SCREENSHOT_DELAY'] ?? 3000)
      win.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
          const img = await win.webContents.capturePage()
          await fs.writeFile(shot, img.toPNG())
          quitting = true
          app.quit()
        }, delay)
      })
    }
    app.on('activate', showWindow)
  })
}

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  // With a tray the app stays resident; without one (no system tray), quit like a normal app.
  if (process.platform !== 'darwin' && !tray?.available) app.quit()
})
