import { sameCredentialIdentity } from '../shared/credentials.ts'
import type { StoredSettings } from './settings-store.ts'

export interface CredentialIdentity { serverUrl: string; username: string }
export interface SecretBackend {
  platform: NodeJS.Platform
  storage: {
    isEncryptionAvailable(): boolean
    getSelectedStorageBackend?(): string
    encryptString(password: string): Buffer
    decryptString(ciphertext: Buffer): string
  }
}

/** Each secret keeps its own identity, independent of editable connection settings. */
export class SecretStorage {
  private session: { identity: CredentialIdentity; password: string } | undefined
  private backend: SecretBackend | undefined
  constructor(backend?: SecretBackend) { this.backend = backend }

  secure(): boolean {
    try {
      if (!this.backend?.storage.isEncryptionAvailable()) return false
      return this.backend.platform !== 'linux' || ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(this.backend.storage.getSelectedStorageBackend?.() ?? '')
    } catch { return false }
  }

  /** Bind old files before any edit. An explicit invalid binding must never fall back. */
  bind(s: StoredSettings): StoredSettings {
    return s.password && s.passwordIdentity === undefined
      ? { ...s, passwordIdentity: { serverUrl: s.serverUrl, username: s.username } }
      : s
  }

  matches(s: StoredSettings, identity: CredentialIdentity): boolean {
    const bound = this.bind(s).passwordIdentity
    return Boolean(bound && typeof bound.serverUrl === 'string' && typeof bound.username === 'string' && sameCredentialIdentity(bound, identity))
  }

  private decode(s: StoredSettings): string | undefined {
    if (!s.password) return undefined
    if (!s.passwordEncrypted) return s.password
    if (s.passwordStorageVersion === 1 && !this.secure()) return undefined
    try {
      if (!this.backend?.storage.isEncryptionAvailable()) return undefined
      return this.backend.storage.decryptString(Buffer.from(s.password, 'base64'))
    } catch { return undefined }
  }

  private legacy(s: StoredSettings): boolean {
    return Boolean(s.password && (!s.passwordEncrypted || s.passwordStorageVersion !== 1 && this.decode(s)))
  }

  password(s: StoredSettings, identity: CredentialIdentity): string | undefined {
    if (this.session && sameCredentialIdentity(this.session.identity, identity)) return this.session.password
    return this.matches(s, identity) ? this.decode(s) : undefined
  }

  status(s: StoredSettings, identity: CredentialIdentity, environmentPassword?: string) {
    const password = environmentPassword || this.password(s, identity)
    const legacyPasswordStored = this.legacy(s)
    const retainedPasswordStored = Boolean(s.password) && !this.matches(s, identity)
    let passwordStorage: 'environment' | 'session' | 'locked' | 'none' | 'legacy' | 'secure'
    if (environmentPassword) passwordStorage = 'environment'
    else if (this.session && sameCredentialIdentity(this.session.identity, identity)) passwordStorage = 'session'
    else if (!password) passwordStorage = s.password && !retainedPasswordStored ? 'locked' : 'none'
    else passwordStorage = legacyPasswordStored ? 'legacy' : 'secure'
    return { encrypted: this.secure(), hasPassword: Boolean(password), passwordStorage, legacyPasswordStored, retainedPasswordStored }
  }

  /** Upgrade readable legacy data without changing its original binding. */
  migrate(s: StoredSettings): StoredSettings | undefined {
    const bound = this.bind(s)
    if (!s.password || s.passwordStorageVersion === 1 || !this.secure()) return bound !== s ? bound : undefined
    const password = this.decode(s)
    if (password) {
      try { return { ...bound, ...this.encrypt(password) } } catch { /* Keep the old copy. */ }
    }
    return bound !== s ? bound : undefined
  }

  private encrypt(password: string) {
    return { password: this.backend!.storage.encryptString(password).toString('base64'), passwordEncrypted: true, passwordStorageVersion: 1 }
  }

  /** Commit memory after the file write. Retained data keeps the previous binding. */
  prepare(previous: StoredSettings, next: StoredSettings, inputPassword?: string, removeLegacy = false, environmentInUse = false) {
    const bound = this.bind(previous)
    let stored = { ...next, password: bound.password, passwordEncrypted: bound.passwordEncrypted, passwordStorageVersion: bound.passwordStorageVersion, passwordIdentity: bound.passwordIdentity }
    let session = this.session
    const identity = { serverUrl: next.serverUrl, username: next.username }
    const password = inputPassword || (session && sameCredentialIdentity(session.identity, identity) ? session.password : undefined)
    if (password) {
      session = { identity, password }
      if (this.secure()) {
        try {
          stored = { ...stored, ...this.encrypt(password), passwordIdentity: identity }
          session = undefined
        } catch { /* The replacement stays in memory. The old saved copy keeps its identity. */ }
      }
    }
    if (removeLegacy && this.legacy(stored)) {
      const current = session && sameCredentialIdentity(session.identity, identity) ? session.password : this.password(stored, identity)
      if (!current && !environmentInUse) throw new Error('The old saved password cannot be used for this connection. Enter a password before removing its saved copy.')
      if (current) session = { identity, password: current }
      delete stored.password
      delete stored.passwordEncrypted
      delete stored.passwordStorageVersion
      delete stored.passwordIdentity
    }
    return { stored, commit: () => { this.session = session } }
  }
}
