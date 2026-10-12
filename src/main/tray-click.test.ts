import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { Menu, Tray } from 'electron'
import { TrayClickController } from './tray-click.ts'
import type { TrayClickAction } from '../shared/types.ts'

function setup(platform: NodeJS.Platform, action: TrayClickAction = 'menu') {
  const tray = Object.assign(new EventEmitter(), {
    attached: null as Menu | null,
    popups: [] as (Menu | undefined)[],
    setContextMenu(menu: Menu | null) { this.attached = menu },
    popUpContextMenu(menu?: Menu) { this.popups.push(menu) },
  })
  let opened = 0
  const clicks = new TrayClickController(tray as unknown as Tray, () => opened++, action, platform)
  const menu = {} as Menu
  clicks.setMenu(menu)
  return { tray, clicks, menu, opened: () => opened }
}

for (const platform of ['win32', 'darwin', 'linux'] as const) {
  test(`${platform}: default clicks preserve the native menu behavior`, () => {
    const { tray, menu, opened } = setup(platform)
    tray.emit('click')
    tray.emit('double-click')
    tray.emit('right-click')
    assert.equal(opened(), 0)
    assert.equal(tray.attached, menu)
    assert.deepEqual(tray.popups, platform === 'win32' ? [undefined] : [])
  })

  test(`${platform}: saved opt-in opens reviews on click and double-click`, () => {
    const { tray, menu, opened } = setup(platform, 'my-reviews')
    tray.emit('click')
    tray.emit('double-click')
    assert.equal(opened(), 2)
    assert.equal(tray.popups.length, 0)
    assert.equal(tray.attached, platform === 'darwin' ? null : menu)
    tray.emit('right-click')
    assert.equal(opened(), 2)
    assert.deepEqual(tray.popups, platform === 'darwin' ? [menu] : [])
  })

  test(`${platform}: changing the setting takes effect immediately and can restore the default`, () => {
    const { tray, clicks, menu, opened } = setup(platform)
    clicks.setAction('my-reviews')
    tray.emit('click')
    assert.equal(opened(), 1)
    assert.equal(tray.attached, platform === 'darwin' ? null : menu)
    const refreshedMenu = {} as Menu
    clicks.setMenu(refreshedMenu)
    tray.emit('right-click')
    assert.deepEqual(tray.popups, platform === 'darwin' ? [refreshedMenu] : [])
    clicks.setAction('menu')
    assert.equal(tray.attached, refreshedMenu)
    tray.emit('click')
    assert.equal(opened(), 1)
  })
}

test('click action defaults to menu in existing settings and persists across reopening', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { default: os } = await import('node:os')
  const { default: path } = await import('node:path')
  const { fileSettings } = await import('../server/file-settings.ts')
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tray-settings-'))
  try {
    const file = path.join(dir, 'settings.json')
    await writeFile(file, JSON.stringify({ serverUrl: '', username: '' }))
    const store = fileSettings(file)
    const initial = await store.getStatus()
    assert.equal(initial.trayClickAction, 'menu')
    await store.save({ ...initial, trayClickAction: 'my-reviews' })
    assert.equal((await fileSettings(file).getStatus()).trayClickAction, 'my-reviews')
    await store.save({ ...initial, trayClickAction: 'menu' })
    assert.equal((await fileSettings(file).getStatus()).trayClickAction, 'menu')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
