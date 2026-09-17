import { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme } from 'electron'
import trayTemplatePath from '../../resources/trayTemplate.png?asset'
import trayPath from '../../resources/tray.png?asset'
import type { ActionCounts, ActionMenu, ActionMenuFamily, BadgePayload, BadgeStyle, ChangeLink, TabId, TrayStrip, UpdateState } from '../shared/types.ts'
import { ACTION_CATEGORIES, describeActions, glyphTitle, totalActions, type ActionCategoryInfo } from '../shared/model.ts'
import { updateAction, updateMenuLabel } from '../shared/update.ts'

export interface TrayHandlers {
  show(): void
  showTab(tab: TabId): void
  refresh(): void
  /** Open a change in the browser (from a row of the tray menu). */
  openChange(link: ChangeLink): void
  setCompact(on: boolean): void
  setCompactOnTop(on: boolean): void
  /** The next update step: check, download, or restart to install. */
  update(): void
  quit(): void
}

const NO_ACTIONS: ActionCounts = { review: 0, fix: 0, ready: 0, merge: 0 }
const NO_MENU: ActionMenu = { review: [], fix: [], ready: [], merge: [] }
/** Rows a category submenu lists before it says "and N more". */
const MAX_ROWS = 30
const MAX_SUBJECT = 60

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
  private menu: ActionMenu = NO_MENU
  private style: BadgeStyle = 'color'
  private updateRow: { label: string; enabled: boolean } | null = null
  /** The strip currently in the menu bar, kept so a theme change can swap appearances without a round trip. */
  private strip: BadgePayload['strip'] = null
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
      // A click opens the menu and nothing else; the board is raised from
      // "Open board" or a row. macOS pops the context menu up by itself and
      // Linux trays do not send clicks; Windows shows it on the right button
      // only, so the left button gets it here.
      this.tray.on('click', () => {
        if (process.platform === 'win32') this.tray?.popUpContextMenu()
      })
      nativeTheme.on('updated', () => this.applyStrip())
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
    this.menu = payload.menu
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
    this.strip = null
    if (!payload.showTrayCounts) {
      this.tray.setImage(this.base)
      if (process.platform === 'darwin') this.tray.setTitle('')
    } else if (process.platform === 'darwin') {
      // Pills or glyph text replace the icon; the icon alone means nothing is pending.
      const title = payload.style === 'glyph' ? glyphTitle(payload.counts, payload.showZeroCounts) : ''
      if (payload.style === 'color' && payload.strip) {
        this.tray.setTitle('')
        this.strip = payload.strip
        this.applyStrip()
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

  /** Put up the strip for the current menu bar appearance. macOS is the authority on which one that is. */
  private applyStrip(): void {
    if (!this.tray || !this.strip) return
    this.tray.setImage(stripImage(nativeTheme.shouldUseDarkColors ? this.strip.dark : this.strip.light))
  }

  private rebuildMenu(): void {
    if (!this.tray) return
    // One row per category, always present, so the menu doubles as the legend
    // for the pills or glyphs in the menu bar. A category with something in
    // it opens a submenu of its changes; an empty one opens its tab.
    const categories: Electron.MenuItemConstructorOptions[] = ACTION_CATEGORIES.map((k) => {
      const label = `${this.style === 'glyph' ? k.glyph + ' ' : ''}${k.label}: ${this.counts[k.id]}`
      const families = this.menu[k.id]
      if (families.length === 0) return { label, click: () => this.handlers.showTab(k.tab) }
      return { label, submenu: this.categorySubmenu(k, families) }
    })
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

  /**
   * The changes of one category: a row per single change, and for a family
   * a row that opens a submenu of its branches. Branches that do not need
   * the action are listed disabled, with the reason, so the family reads
   * whole. The last row opens the tab, which is what the category row did
   * before it had a submenu.
   */
  private categorySubmenu(k: ActionCategoryInfo, families: ActionMenuFamily[]): Electron.MenuItemConstructorOptions[] {
    // The owner tells a reviewer or merger whose change it is; on Needs Changes and Approved it is always the user's own.
    const withOwner = k.id === 'review' || k.id === 'merge'
    const rows: Electron.MenuItemConstructorOptions[] = families.slice(0, MAX_ROWS).map((f) => {
      const subject = menuText(f.subject.length > MAX_SUBJECT ? f.subject.slice(0, MAX_SUBJECT - 1) + '…' : f.subject)
      const owner = withOwner ? ` · ${f.owner}` : ''
      if (f.members.length === 1) {
        const m = f.members[0]
        return { label: `#${m.number} ${subject} · ${m.branch}${owner}`, click: () => this.handlers.openChange(m.link) }
      }
      return {
        label: `${subject} · ${f.members.length} branches${owner}`,
        submenu: f.members.map((m) => ({
          label: `${m.branch}  #${m.number}${m.actionable ? '' : ` · ${m.note}`}`,
          enabled: m.actionable,
          click: () => this.handlers.openChange(m.link),
        })),
      }
    })
    if (families.length > MAX_ROWS) rows.push({ label: `and ${families.length - MAX_ROWS} more on the tab`, enabled: false })
    return [...rows, { type: 'separator' }, { label: `Open the ${k.label} tab`, click: () => this.handlers.showTab(k.tab) }]
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}

/** A subject as a menu label: on Windows and Linux an ampersand marks a mnemonic, so it is doubled to show. */
function menuText(s: string): string {
  return process.platform === 'darwin' ? s : s.replace(/&/g, '&&')
}

/** Retina strip from the renderer plus a downscaled 1x representation for non-Retina displays. */
function stripImage(strip: TrayStrip): Electron.NativeImage {
  const hi = nativeImage.createFromDataURL(strip.dataUrl)
  const img = nativeImage.createEmpty()
  img.addRepresentation({ scaleFactor: 2, buffer: hi.toPNG() })
  img.addRepresentation({ scaleFactor: 1, buffer: hi.resize({ width: strip.width, height: strip.height }).toPNG() })
  return img
}
