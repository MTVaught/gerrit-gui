import type { Menu, Tray } from 'electron'
import type { TrayClickAction } from '../shared/types.ts'

/** Keep the native menu available while allowing clicks to open reviews. */
export class TrayClickController {
  private menu: Menu | null = null
  private readonly tray: Pick<Tray, 'on' | 'setContextMenu' | 'popUpContextMenu'>
  private readonly openReviews: () => void
  private action: TrayClickAction
  private readonly platform: NodeJS.Platform

  constructor(
    tray: Pick<Tray, 'on' | 'setContextMenu' | 'popUpContextMenu'>,
    openReviews: () => void,
    action: TrayClickAction = 'menu',
    platform: NodeJS.Platform = process.platform,
  ) {
    this.tray = tray
    this.openReviews = openReviews
    this.action = action
    this.platform = platform
    tray.on('click', () => {
      if (this.action === 'my-reviews') this.openReviews()
      else if (this.platform === 'win32') tray.popUpContextMenu()
    })
    tray.on('double-click', () => {
      if (this.action === 'my-reviews') this.openReviews()
    })
    tray.on('right-click', () => {
      if (this.platform === 'darwin' && this.action === 'my-reviews' && this.menu) {
        tray.popUpContextMenu(this.menu)
      }
    })
  }

  setAction(action: TrayClickAction): void {
    if (action === this.action) return
    this.action = action
    this.applyMenu()
  }

  setMenu(menu: Menu): void {
    this.menu = menu
    this.applyMenu()
  }

  private applyMenu(): void {
    // An attached macOS menu handles left-clicks before Electron can emit them.
    // Keep it separately for right-clicks when opening reviews is selected.
    this.tray.setContextMenu(this.platform === 'darwin' && this.action === 'my-reviews' ? null : this.menu)
  }
}
