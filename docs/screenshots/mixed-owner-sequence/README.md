# Mixed-owner sequence reproduction

These captures use the real browser app with synthetic dashboard API responses.
Carol is reviewing a commit chain on `demo/main`:

| Change | Owner | Parent |
| --- | --- | --- |
| #101 | Alice | Branch tip |
| #102 | Alice | #101 |
| #103 | Bob | #102 |
| #104 | Bob | #103 |

All four changes have the `sequence` and `reviewer:carol` hashtags and a
review request for patch set 1.

Before the fix, the board combines all four into one sequence labeled Alice.
After the fix, Alice's #101 and #102 form one sequence, and Bob's #103 and
#104 form another. The review tab and section counts change from 1 to 2.

Each capture uses the Needs Review tab, a 1600 × 900 viewport, and scroll
position 0, 0. Both light and dark versions were inspected for readability
and layout. `before.json` and `after.json` record the identical dashboard
fixture, visible sequence headers, viewport, scroll position, and browser
errors. Neither capture reported browser errors.

The two new regression tests failed before the fix and passed afterward.
All 167 unit tests and both TypeScript checks passed after the fix.
