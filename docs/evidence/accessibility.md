# Accessibility evidence (NFR-07 WCAG 2.1 AA, NFR-08 768 px)

- **Date:** 2026-11-22 · **Tool:** axe-core 4.10 through `@axe-core/playwright`, tags `wcag2a`, `wcag2aa`, `wcag21a`,
  `wcag21aa` · **Test:** `e2e/tests/quality.spec.ts` (runs in CI on every pull request)

## Result: 0 violations of any severity on 21 page states

| Role       | Pages checked                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------- |
| Visitor    | landing, login, sign-up, forgot password                                                      |
| Learner    | dashboard, catalogue, brief, progress, profile & settings                                     |
| Instructor | dashboard (with a class and an assignment), classes, reports, results, builder, assign dialog |
| Admin      | publish scenarios, users & roles, sandbox health                                              |
| Learner    | workspace with the 3D map, workspace with the 2D map, debrief                                 |

The test fails on any `serious` or `critical` violation. The full axe output for each page is written to
`e2e/test-results/axe/` when the test runs.

## What the first run found, and the fixes

| Finding (axe rule)                                     | Where                                    | Fix                                                                    |
| ------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------- |
| `color-contrast`: grey text on the navy sidebar        | sidebar role label and email (all pages) | `slate-500` → `slate-400` (4.6:1 → 7:1)                                |
| `color-contrast`: muted text on the dark workspace     | file explorer, terminal, tests panel     | `slate-500` → `slate-400`                                              |
| `color-contrast`: editor line numbers and comments     | code editor theme                        | line numbers `#475569` → `#7C8BA1`, comments `#64748B` → `#8B9BB4`     |
| `color-contrast`: unselected "I am a…" option          | sign-up                                  | muted → body text colour                                               |
| `aria-input-field-name`: the editable code area        | workspace                                | the CodeMirror content element gets `aria-label="Code editor: <file>"` |
| `aria-required-children`: extra items in a tablist     | workspace System panel                   | the live-status dot moved out of the tablist                           |
| `aria-prohibited-attr`: `aria-label` on plain elements | live dot, incident counter, metric tiles | given `role="img"` / `role="group"`                                    |
| `link-in-text-block`: link told apart by colour only   | workspace "Full brief"                   | underlined                                                             |

## Keyboard-only use

The same spec drives the app with the keyboard only:

1. Tab from the landing page to "Log in", log in with keys, Tab to Scenarios, open a brief. Every focus stop is
   checked for a visible focus indicator (outline or ring).
2. Dialogs: focus moves into the dialog, Tab stays inside it, Escape closes it, and focus returns to the
   button that opened it (fixed in `components/instructor/dialogs.tsx`).

## Narrow screens (NFR-08)

Every page above is also loaded at **768 px** wide and must not scroll sideways. The first run found the
instructor dashboard (1,052 px wide) and admin users (789 px) overflowing because of wide tables; tables now
scroll inside their card instead of the whole page.
