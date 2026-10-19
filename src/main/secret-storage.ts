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

  private trusted(s: StoredSettings): boolean {
    return s.passwordEncrypted === true && s.passwordStorageVersion === 1
  }

  private withoutPassword(s: StoredSettings): StoredSettings {
    const stored = { ...s }
    delete stored.password
    delete stored.passwordEncrypted
    delete stored.passwordStorageVersion
    delete stored.passwordIdentity
    return stored
  }

  password(s: StoredSettings, identity: CredentialIdentity): string | undefined {
    if (this.session && sameCredentialIdentity(this.session.identity, identity)) return this.session.password
    return this.matches(s, identity) ? this.decode(s) : undefined
  }

  status(s: StoredSettings, identity: CredentialIdentity, environmentPassword?: string) {
    const password = environmentPassword || this.password(s, identity)
    const retainedPasswordStored = Boolean(s.password) && !this.matches(s, identity)
    let passwordStorage: 'environment' | 'session' | 'locked' | 'none' | 'secure'
    if (environmentPassword) passwordStorage = 'environment'
    else if (this.session && sameCredentialIdentity(this.session.identity, identity)) passwordStorage = 'session'
    else if (!password) passwordStorage = s.password && !retainedPasswordStored ? 'locked' : 'none'
    else passwordStorage = 'secure'
    return { encrypted: this.secure(), hasPassword: Boolean(password), passwordStorage, retainedPasswordStored }
  }

  /** Plan cleanup without changing memory. The caller must persist before commit. */
  migrate(s: StoredSettings) {
    const bound = this.bind(s)
    let stored = bound
    let session = this.session
    if (this.trusted(s)) {
      // Locked trusted ciphertext is retained with its original identity.
      return { stored, changed: stored !== s, commit: () => {} }
    }
    const hasFields = ['password', 'passwordEncrypted', 'passwordStorageVersion', 'passwordIdentity'].some(key => key in s)
    if (!hasFields) return { stored: s, changed: false, commit: () => {} }
    const password = this.decode(s)
    if (password && this.secure()) {
      try {
        stored = { ...bound, ...this.encrypt(password) }
        return { stored, changed: true, commit: () => {} }
      } catch { /* Fall through to automatic removal. */ }
    }
    stored = this.withoutPassword(bound)
    const identity = bound.passwordIdentity
    // Never move a legacy A secret to current B settings or replace a newer session.
    if (!session && password && identity && this.matches(bound, identity)) session = { identity: { ...identity }, password }
    return { stored, changed: true, commit: () => { this.session = session } }
  }

  private encrypt(password: string) {
    return { password: this.backend!.storage.encryptString(password).toString('base64'), passwordEncrypted: true, passwordStorageVersion: 1 }
  }

  /** One atomic write for cleanup and an optional replacement password. */
  prepare(previous: StoredSettings, next: StoredSettings, inputPassword?: string) {
    const cleanup = this.migrate(previous)
    const cleaned = cleanup.stored
    let stored = { ...next, password: cleaned.password, passwordEncrypted: cleaned.passwordEncrypted, passwordStorageVersion: cleaned.passwordStorageVersion, passwordIdentity: cleaned.passwordIdentity }
    let replacement: { identity: CredentialIdentity; password: string } | undefined
    let persistedReplacement = false
    const identity = { serverUrl: next.serverUrl, username: next.username }
    const password = inputPassword || (this.session && sameCredentialIdentity(this.session.identity, identity) ? this.session.password : undefined)
    if (password) {
      replacement = { identity, password }
      if (this.secure()) {
        try {
          stored = { ...stored, ...this.encrypt(password), passwordIdentity: identity }
          persistedReplacement = true
        } catch { /* The replacement stays in memory. Trusted saved data stays bound. */ }
      }
    }
    return { stored, commit: () => {
      cleanup.commit()
      if (replacement) this.session = persistedReplacement ? undefined : replacement
    } }
  }
}
