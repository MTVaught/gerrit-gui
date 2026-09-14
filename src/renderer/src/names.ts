// Display names for the usernames and email addresses the application stores:
// the merger tag on a change and the entries in Settings. The accounts behind
// them are usually not in the change data, so they are looked up once per
// session and cached. Until the answer is in, the key itself is shown.
import { useEffect, useState } from 'react'
import type { AccountInfo } from '../../shared/types.ts'
import { accountKey, accountKeys, displayName } from '../../shared/model.ts'
import { api } from './api.ts'

const cache = new Map<string, AccountInfo | null>()
const pending = new Set<string>()
const listeners = new Set<() => void>()

function notify(): void {
  for (const l of listeners) l()
}

/** Seed the cache from accounts that came with the change data, so those never need a lookup. */
export function rememberAccounts(accounts: AccountInfo[]): void {
  for (const a of accounts) for (const k of accountKeys(a)) if (!cache.has(k)) cache.set(k, a)
}

async function lookup(keys: string[]): Promise<void> {
  const missing = keys.filter((k) => !cache.has(k) && !pending.has(k))
  if (missing.length === 0) return
  for (const k of missing) pending.add(k)
  try {
    const found = await api.lookupAccounts(missing)
    for (const a of found) for (const k of accountKeys(a)) cache.set(k, a)
    // A key with no account stays unresolved; it shows as typed and is not asked for again.
    for (const k of missing) if (!cache.has(k)) cache.set(k, null)
  } catch {
    // No connection; the keys show as typed and are tried again on the next render that needs them.
  } finally {
    for (const k of missing) pending.delete(k)
    notify()
  }
}

/** The account for a stored key, when it is known. */
export function accountFor(key: string): AccountInfo | null {
  return cache.get(accountKey(key)) ?? null
}

/** The display name for a stored key, or the key itself until it is resolved. */
export function nameFor(key: string): string {
  const a = accountFor(key)
  return a ? displayName(a) : key
}

/**
 * Subscribe to the cache for these keys: triggers the lookups and re-renders
 * when any of them resolves. Returns `nameFor`, bound to the current cache.
 */
export function useNames(keys: string[]): (key: string) => string {
  const [, setTick] = useState(0)
  const wanted = keys.map(accountKey).join('\n')
  useEffect(() => {
    const l = () => setTick((t) => t + 1)
    listeners.add(l)
    void lookup(wanted ? wanted.split('\n') : [])
    return () => {
      listeners.delete(l)
    }
  }, [wanted])
  return nameFor
}
