# Tasks

## 1. Flag state and controls

- [x] 1.1 Add revision-scoped optimistic flag state with per-file pending saves, stale-read protection, and isolated rollback. Verify deferred-promise unit tests for concurrent files, stale reads, failures, retry, and independent revisions.
- [x] 1.2 Integrate the state into LocalReview and ReviewFileList, including header, shortcuts, automatic marking, filter, errors, and close protection. Verify desktop regression checks with delayed Gerrit responses and update the reviewed-flag behavior in README.md.

## 2. Integration and visual evidence

- [x] 2.1 Run typecheck, unit tests, production build, and relevant desktop checks. Verify rapid clicks save all files, status refresh does not flash, failed writes recover, revision changes stay isolated, and confirmed flags reach a second window.
- [x] 2.2 Record and inspect matching light and dark videos of the corrected five-file workflow using real input. Preserve the original reproduction evidence, save paired fix artifacts, and record the simulated service delays and tested platform.
