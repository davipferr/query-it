---
name: repro-bug
description: Reproduce a QueryIt bug before fixing it. Use when given a bug report, an error message, a screenshot of the app misbehaving, or a vague "X doesn't work". It covers locating the feature, reproducing it, proving it with a failing test, then fixing and verifying.
---

# Reproduce, then fix

Never fix a bug you haven't seen fail. Never name a cause you haven't traced in the code.

## 1. Locate

1. Read `docs/feature-map.md`. Match the report to a feature section, using the **Messages** lists (reports usually quote Portuguese UI text) or the DOM ids and selectors.
2. Open the files listed for that section, and follow the code path from the user's action to the symptom. Write down the chain as `file:line` references.
3. If the map doesn't cover what you found, note it. Fixing the map is part of the job (step 5).

## 2. Reproduce

Pick the cheapest level that shows the bug:

| Bug lives in | Reproduce with |
|---|---|
| Proxy guards or drivers | a test in `proxy/test/` (unit test, or `callHandler` + `npm run db:up` and `npm run db:seed`) |
| Pure frontend logic (`js/sql-guard.js`, …) | a test in `test/js/` |
| DOM, rendering, browser interaction | the browser pane: the setup in `docs/feature-map.md`, then drive the UI, or use `javascript_tool` to call the module and inspect the DOM |

For a DOM bug, record the **exact** steps and what you observed (DOM state, console output, screenshot). There's no DOM test harness yet, so this browser script is the reproduction, and it goes in your report.

**If you can't reproduce it:** say so, list exactly what you tried, and ask for the missing detail (database type, the exact SQL, the browser). Don't fix something you only suspect.

## 3. Prove it fails

- Write the test **before** the fix and run it. It must fail, and fail for the reason in the report, not because of a typo in the test.
- For browser-only bugs, run the reproduction script and capture the bad state.

## 4. Fix

- Make the smallest change that fixes the cause, not the symptom. If the cause is a pattern (for example, unescaped `innerHTML`), search for the other places with the same pattern and list them.
- Respect the invariants in `CLAUDE.md`. If the fix seems to need one relaxed, stop and ask.

## 5. Verify and close

1. The test from step 3 passes. If you fixed a `{ todo }` test, remove the `todo`.
2. Re-run the browser reproduction; it must now behave correctly.
3. Run the `verify` skill (full `npm run check`, plus the browser smoke path for UI changes).
4. Update `docs/feature-map.md`: remove the bug from **Known bugs**, and add any messages, selectors or behavior you discovered.

## Report

- **Cause:** the `file:line` chain.
- **Reproduction:** the test name, or the browser steps with what you observed before the fix.
- **Fix:** what changed, and other places with the same pattern (fixed or listed).
- **Verification:** the commands and their counts; what the browser showed after the fix.
