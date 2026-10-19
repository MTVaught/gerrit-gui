# Protect password persistence and clean legacy saved credentials

Passwords now use a trusted OS keychain or process memory in both Electron and
browser mode. Linux basic_text and unknown backends cannot persist new secrets.
Readable legacy passwords migrate to trusted encryption when it succeeds.
Otherwise, normal startup removes legacy saved fields by atomic replacement.
Desktop initializes before UI setup; browser initializes before listening or
printing readiness. No user must open Connection, save or test. Initialization
failure reports an error and exits without claiming readiness.
A readable password can remain in memory for its original origin/account until
restart. Unreadable legacy data requires re-entry. The obsolete removal checkbox
and input flag are removed. The connection form explains memory-only storage.

Trusted versioned keychain ciphertext stays intact when locked. Retained secure
copies and memory passwords keep their own identity. A failed replacement leaves
old file data and committed memory unchanged. On POSIX systems, settings reads/writes repair 0644
permissions to 0600. Browser environment values remain startup snapshots and never
persist their passwords. Merged binding, HTTPS/redirect and browser API policies
remain intact.

The first successful connection-form load populates saved fields, including after
an initial failure and focus retry. Later refreshes preserve unsaved drafts.

Validation: 329 tests with --test-concurrency=4, fresh type checks, desktop and
browser builds; four real Linux basic_text processes; paired native cleanup/
reload/restart regressions; current primary before/after startup videos/file
snapshots with zero saves; paired focus-recovery and draft-preservation videos;
merged browser API, credential and transport UI regressions in both themes.
Existing browser API, credential and transport captures remain from the reviewed
policy revision 0db20f9. They were not rerun only to change their commit stamp.
See docs/screenshots/secret-storage/README.md for inspected evidence and limits.
Secure keychain success uses a simulated provider. Live secure keychains,
macOS/Windows and Windows ACLs were not tested. Field removal does not erase
filesystem blocks or backups. All fixtures use dummy credentials and isolated
settings. No live user settings were accessed.

Primary evidence replaces the old PR video. Use startup-desktop-light/dark.mp4
and startup-browser-light/dark.mp4 from docs/screenshots/secret-storage. Their
before/after PNG pairs and startup-result.json show all four legacy fields
removed at startup with zero saves. cleanup-recovery-light/dark.mp4 demonstrates
the separate form recovery fix and includes a later connection test. It is not
the startup cleanup proof.

CI portability follow-up changes tests/fixtures only. The startup audit preload
uses file URLs and Windows path separators correctly. POSIX mode checks remain
on POSIX; Windows still runs cleanup/content/binding/restart checks and a portable
failed-replacement startup regression. The reviewed PRIMARY application evidence
at 19ddb8b remains valid and unchanged. See the evidence index for the paired
observed-file report and exact local validation.
