/**
 * Process-only opt-in for local fixtures with dummy credentials. Never store
 * this in user settings or allow a renderer/API argument to enable it.
 * The shared URL validator still limits HTTP to 127.0.0.1 and [::1].
 */
export function allowLocalTestHttp(): boolean {
  return process.env['GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP'] === '1'
}
