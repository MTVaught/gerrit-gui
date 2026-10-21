# Design

## Context

`ReviewComments.tsx` renders replacement controls only for selected revision ranges and drafts with stored suggestions. Its composer also carries suggestion data through autosave, Save, and Cancel. Published suggestion display and preview use separate rendering and state. See proposal.md for motivation.

## Goals / Non-Goals

Remove replacement authoring controls with a small renderer change. Keep the existing draft data path and published suggestion workflow. No API migration is needed.

## Decisions

- Remove the replacement button and fieldset JSX. Keep composer suggestion state and save payloads so text edits cannot erase existing data. Removing suggestion state would risk data loss.
- Update the existing comment UI test to check the simplified selected-range editor. Seed an existing suggestion through the simulated Gerrit fixture to exercise preservation and the retained preview workflow without using the removed authoring controls.
- Capture the built Electron editor at the same selected range, viewport, and scroll position in both themes. Use real mouse and keyboard input to open and save the draft. Screenshots demonstrate the static control layout.

## Risks / Trade-offs

- Existing drafts can contain suggestions that the editor cannot modify. Keep their saved comment display and preserve the payload during edits and Cancel.
- The existing broad UI test creates suggestions through the removed button. Replace that setup with fixture data and retain preview and apply coverage.
