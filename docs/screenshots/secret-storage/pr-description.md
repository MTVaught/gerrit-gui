# Protect password persistence and clean legacy saved credentials

Passwords now use a trusted OS keychain or process memory in both Electron and
browser mode. Linux basic_text and unknown backends cannot persist new secrets.
Readable legacy passwords migrate to trusted encryption when it succeeds.
Otherwise, legacy saved fields are removed automatically by atomic replacement.
A readable password can remain in memory for its original origin/account until
restart. Unreadable legacy data requires re-entry. The obsolete removal checkbox
and input flag are removed. The connection form explains memory-only storage.

Trusted versioned keychain ciphertext stays intact when locked. Retained secure
copies and memory passwords keep their own identity. A failed replacement leaves
old file data and committed memory unchanged. Settings reads/writes repair 0644
permissions to 0600. Browser environment values remain startup snapshots and never
persist their passwords. Merged binding, HTTPS/redirect and browser API policies
remain intact.

Validation: 322 tests with --test-concurrency=4, fresh type checks, desktop and
browser builds; four real Linux basic_text processes; paired native cleanup/
reload/restart videos, actual file snapshots and cleanup-failure screenshots;
merged browser API, credential and transport UI regressions in both themes.
See docs/screenshots/secret-storage/README.md for inspected evidence and limits.
Secure keychain success uses a simulated provider. Live secure keychains,
macOS/Windows and Windows ACLs were not tested. Field removal does not erase
filesystem blocks or backups. All fixtures use dummy credentials and isolated
settings. No live user settings were accessed.
