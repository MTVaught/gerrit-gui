import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import trayTemplatePath from '../../resources/trayTemplate.png?asset'
import trayPath from '../../resources/tray.png?asset'

export interface TrayHandlers {
  show(): void
  refresh(): void
  setCompact(on: boolean): void
  quit(): void
}

/**
 * System tray icon showing how many changes need the user's review.
 * macOS: template icon plus a text title. Windows/Linux: the renderer draws a
 * badged icon (see renderer/src/badge.ts) because tray icons there cannot show
 * text next to them.
 */
export class TrayController {
  private tray: Tray | null = null
  private compact: boolean
  private readonly base: Electron.NativeImage
  private readonly handlers: TrayHandlers

  constructor(handlers: TrayHandlers, compact: boolean) {
    this.handlers = handlers
    this.compact = compact
    this.base = nativeImage.createFromPath(process.platform === 'darwin' ? trayTemplatePath : trayPath)
    try {
      this.tray = new Tray(this.base)
      this.tray.setToolTip('Gerrit Review Board')
      this.tray.on('click', () => handlers.show())
      this.rebuildMenu()
    } catch (e) {
      // No system tray (e.g. bare X server); the app still works without one.
      console.warn('Tray unavailable:', (e as Error).message)
      this.tray = null
    }
  }

  get available(): boolean {
    return this.tray !== null
  }

  setCompact(on: boolean): void {
    this.compact = on
    this.rebuildMenu()
  }

  setBadge(count: number, iconDataUrl: string, win: BrowserWindow | null): void {
    const label = count === 0 ? 'Nothing needs your review' : `${count} change${count === 1 ? '' : 's'} need${count === 1 ? 's' : ''} your review`
    // Dock (macOS) / launcher (Linux) badge.
    app.setBadgeCount(count)
    if (process.platform === 'win32' && win) {
      win.setOverlayIcon(count > 0 ? nativeImage.createFromDataURL(iconDataUrl) : null, label)
    }
    if (!this.tray) return
    this.tray.setToolTip(`Gerrit Review Board: ${label}`)
    if (process.platform === 'darwin') {
      this.tray.setTitle(count > 0 ? String(count) : '')
    } else {
      this.tray.setImage(count > 0 ? nativeImage.createFromDataURL(iconDataUrl) : this.base)
    }
  }

  private rebuildMenu(): void {
    if (!this.tray) return
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open board', click: () => this.handlers.show() },
        { label: 'Refresh now', click: () => this.handlers.refresh() },
        {
          label: 'Compact, always on top',
          type: 'checkbox',
          checked: this.compact,
          click: (item) => this.handlers.setCompact(item.checked),
        },
        { type: 'separator' },
        { label: 'Quit', click: () => this.handlers.quit() },
      ]),
    )
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
