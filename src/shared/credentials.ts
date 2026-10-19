interface CredentialIdentity {
  serverUrl: string
  username: string
}

export const replacementPasswordMessage = 'The server origin or username changed. Enter an HTTP password for this connection. The saved password cannot be reused.'

function identityUrl(serverUrl: string): URL {
  const input = serverUrl.trim()
  return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : 'https://' + input)
}

/** Passwords belong to an HTTP(S) origin and an exact, trimmed account name. */
export function sameCredentialIdentity(a: CredentialIdentity, b: CredentialIdentity): boolean {
  if (!a.username.trim() || a.username.trim() !== b.username.trim()) return false
  try {
    // Compare identity without authorizing transport. The stores and client
    // enforce HTTPS separately, including the explicit loopback test policy.
    const left = identityUrl(a.serverUrl)
    const right = identityUrl(b.serverUrl)
    return [left, right].every((url) =>
      (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password,
    ) && left.origin === right.origin
  } catch {
    return false
  }
}

export function requireReplacementPassword(previous: CredentialIdentity & { password?: string }, input: CredentialIdentity & { password?: string }): void {
  if (previous.password && !input.password && !sameCredentialIdentity(previous, input)) {
    throw new Error(replacementPasswordMessage)
  }
}
