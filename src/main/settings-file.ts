import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/** Repair existing permissions before reading credentials. Never follow a file symlink. */
export async function readSettingsFile<T>(file: string): Promise<T | undefined> {
  let handle
  try {
    handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  try {
    await handle.chmod(0o600)
    const content = await handle.readFile('utf8')
    let settings: unknown
    try {
      settings = JSON.parse(content)
    } catch {
      // Parser errors can include a slice of the file, including a password.
      throw new SyntaxError('The settings file contains invalid JSON. The file was kept.')
    }
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('The settings file must contain a JSON object. The file was kept.')
    }
    return settings as T
  } finally {
    await handle.close()
  }
}

/** A failed write leaves the old credentials intact. Replacement also repairs mode 0644. */
export async function writeSettingsFile(file: string, settings: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    const handle = await fs.open(temp, 'wx', 0o600)
    try {
      await handle.writeFile(JSON.stringify(settings, null, 2))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(temp, file)
  } finally {
    await fs.rm(temp, { force: true })
  }
}
