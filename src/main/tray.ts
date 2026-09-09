import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import trayTemplatePath from '../../resources/trayTemplate.png?asset'
import trayPath from '../../resources/tray.png?asset'
import type { ActionCounts, BadgePayload, BadgeStyle, TabId } from '../shared/types.ts'
import { ACTION_CATEGORIES, describeActions, glyphTitle, totalActions } from '../shared/model.ts'

export interface TrayHandlers {
  show(): void
  showTab(tab: TabId): void
  refresh(): void
  setCompact(on: boolean): void
  quit(): void
}

const NO_ACTIONS: ActionCounts = { review: 0, fix: 0, ready: 0, merge: 0 }

/**
 * System tray icon showing what waits on the user, by category.
 * macOS: with the color style the renderer draws a strip of icon plus colored
 * pills (see renderer/src/badge.ts); with the glyph style the template icon
 * keeps a text title such as "◉ 3  ✎ 1". Windows/Linux trays cannot show text
 * next to the icon, so they get a square icon with the total and the
 * breakdown lives in the tooltip and the menu.
 */
export class TrayController {
  private tray: Tray | null = null
  private compact: boolean
  private counts: ActionCounts = NO_ACTIONS
  private style: BadgeStyle = 'color'
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

  setBadge(payload: BadgePayload, win: BrowserWindow | null): void {
    this.counts = payload.counts
    this.style = payload.style
    const total = totalActions(payload.counts)
    const summary = describeActions(payload.counts)
    // Dock (macOS) / launcher (Linux) badge.
    app.setBadgeCount(total)
    if (process.platform === 'win32' && win) {
      win.setOverlayIcon(total > 0 ? nativeImage.createFromDataURL(payload.iconDataUrl) : null, summary)
    }
    if (!this.tray) return
    this.tray.setToolTip(`Gerrit Review Board: ${summary}`)
    if (process.platform === 'darwin') {
      if (total > 0 && payload.style === 'color' && payload.strip) {
        this.tray.setTitle('')
        this.tray.setImage(stripImage(payload.strip))
      } else {
        this.tray.setImage(this.base)
        this.tray.setTitle(total > 0 ? glyphTitle(payload.counts) : '')
      }
    } else {
      this.tray.setImage(total > 0 ? nativeImage.createFromDataURL(payload.iconDataUrl) : this.base)
    }
    this.rebuildMenu()
  }

  private rebuildMenu(): void {
    if (!this.tray) return
    // One row per category, always present, so the menu doubles as the legend
    // for the pills or glyphs in the menu bar.
    const categories: Electron.MenuItemConstructorOptions[] = ACTION_CATEGORIES.map((k) => ({
      label: `${this.style === 'glyph' ? k.glyph + ' ' : ''}${k.label}: ${this.counts[k.id]}`,
      click: () => this.handlers.showTab(k.tab),
    }))
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        ...categories,
        { type: 'separator' },
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

/** Retina strip from the renderer plus a downscaled 1x representation for non-Retina displays. */
function stripImage(strip: NonNullable<BadgePayload['strip']>): Electron.NativeImage {
  const hi = nativeImage.createFromDataURL(strip.dataUrl)
  const img = nativeImage.createEmpty()
  img.addRepresentation({ scaleFactor: 2, buffer: hi.toPNG() })
  img.addRepresentation({ scaleFactor: 1, buffer: hi.resize({ width: strip.width, height: strip.height }).toPNG() })
  return img
}
