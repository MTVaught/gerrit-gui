import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import trayTemplatePath from '../../resources/trayTemplate.png?asset'
import trayPath from '../../resources/tray.png?asset'
import type { ActionCounts, BadgePayload, BadgeStyle, TabId, UpdateState } from '../shared/types.ts'
import { ACTION_CATEGORIES, describeActions, glyphTitle, totalActions } from '../shared/model.ts'
import { updateAction, updateMenuLabel } from '../shared/update.ts'

export interface TrayHandlers {
  show(): void
  showTab(tab: TabId): void
  refresh(): void
  setCompact(on: boolean): void
  setCompactOnTop(on: boolean): void
  /** The next update step: check, download, or restart to install. */
  update(): void
  quit(): void
}

const NO_ACTIONS: ActionCounts = { review: 0, fix: 0, ready: 0, merge: 0 }

/**
 * System tray icon showing what waits on the user, by category.
 * macOS: with the color style the renderer draws a strip of colored pills
 * (see renderer/src/badge.ts); with the glyph style the item is a text title
 * such as "◉ 3  ✎ 1". Either way the app icon is left out while counts
 * show, and comes back when there is nothing to show. Windows/Linux trays cannot show text
 * next to the icon, so they get a square icon with the total and the
 * breakdown lives in the tooltip and the menu. Two settings turn the visible
 * counts off: showAppBadge for the dock / launcher / taskbar badge and
 * showTrayCounts for the tray icon, which then stays the plain icon.
 */
export class TrayController {
  private tray: Tray | null = null
  private compact: boolean
  private compactOnTop: boolean
  private counts: ActionCounts = NO_ACTIONS
  private style: BadgeStyle = 'color'
  private updateRow: { label: string; enabled: boolean } | null = null
  private readonly base: Electron.NativeImage
  private readonly handlers: TrayHandlers

  constructor(handlers: TrayHandlers, compact: boolean, compactOnTop: boolean) {
    this.handlers = handlers
    this.compact = compact
    this.compactOnTop = compactOnTop
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

  setCompactOnTop(on: boolean): void {
    this.compactOnTop = on
    this.rebuildMenu()
  }

  /** Show the updater in the menu. Rebuilds only when the row changes, not on every progress tick. */
  setUpdate(state: UpdateState): void {
    const row = state.status === 'disabled' ? null : { label: updateMenuLabel(state), enabled: updateAction(state) !== 'none' }
    if (row?.label === this.updateRow?.label && row?.enabled === this.updateRow?.enabled) return
    this.updateRow = row
    this.rebuildMenu()
  }

  setBadge(payload: BadgePayload, win: BrowserWindow | null): void {
    this.counts = payload.counts
    this.style = payload.style
    const total = totalActions(payload.counts)
    const summary = describeActions(payload.counts)
    // Dock (macOS) / launcher (Linux) badge, and the taskbar overlay on Windows.
    const badgeTotal = payload.showAppBadge ? total : 0
    app.setBadgeCount(badgeTotal)
    if (process.platform === 'win32' && win) {
      win.setOverlayIcon(badgeTotal > 0 ? nativeImage.createFromDataURL(payload.iconDataUrl) : null, summary)
    }
    if (!this.tray) return
    this.tray.setToolTip(`Gerrit Review Board: ${summary}`)
    if (!payload.showTrayCounts) {
      this.tray.setImage(this.base)
      if (process.platform === 'darwin') this.tray.setTitle('')
    } else if (process.platform === 'darwin') {
      // Pills or glyph text replace the icon; the icon alone means nothing is pending.
      const title = payload.style === 'glyph' ? glyphTitle(payload.counts, payload.showZeroCounts) : ''
      if (payload.style === 'color' && payload.strip) {
        this.tray.setTitle('')
        this.tray.setImage(stripImage(payload.strip))
      } else if (title) {
        this.tray.setImage(nativeImage.createEmpty())
        this.tray.setTitle(title)
      } else {
        this.tray.setImage(this.base)
        this.tray.setTitle('')
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
          label: 'Compact window',
          type: 'checkbox',
          checked: this.compact,
          click: (item) => this.handlers.setCompact(item.checked),
        },
        {
          label: 'Compact window stays on top',
          type: 'checkbox',
          checked: this.compactOnTop,
          click: (item) => this.handlers.setCompactOnTop(item.checked),
        },
        { type: 'separator' },
        // Which build is running, so an installed copy can be checked against the repo.
        { label: `Version ${app.getVersion()}, build ${__BUILD_COMMIT__}`, enabled: false },
        ...(this.updateRow
          ? [{ label: this.updateRow.label, enabled: this.updateRow.enabled, click: () => this.handlers.update() }]
          : []),
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
