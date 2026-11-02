# Tasks

## 1. Save explicit unreviewed state

- [x] 1.1 Save the internal marker before each unreview delete and filter it from reviewed-list responses. Verify stateful client tests cover inheritance, a fresh client, the last individual clear, normal marking, scope, and marker-save failure.
- [x] 1.2 Update the existing desktop checks and recording runners to distinguish internal metadata from file flags. Verify `test/reset-reviewed-files-ui.cjs` and `test/reviewed-files-ui.cjs` pass against the production desktop.

## 2. Verify the real server workflow

- [x] 2.1 Add and document the real Gerrit 3.11.2 desktop regression. Verify the old failure is reproduced, a filtered reset survives reopening, other users and older patch sets remain unchanged, and inspected light/dark videos and server observations are saved.
- [x] 2.2 Verify the complete unit suite, type checks, production build, OpenSpec validation, and whitespace checks pass. Record the commands, results, evidence, and platform limits in verification.md.

## Workflow follow-up

- Sync the reviewed-files delta and validate the main specs.
- Archive the completed change and verify its artifacts remain intact.
- Commit and push the fix, then create and link the pull request.
