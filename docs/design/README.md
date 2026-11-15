# Design reference (Assignment 2)

The approved visual design. Build every page to match it.

| File                                  | What it is                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prototype/index.html`                | Clickable high-fidelity prototype (8 pages). Open in a browser. `workspace.html` simulates the full flow: fix, test, deploy, incident, rollback, debrief. |
| `prototype/assets/styles.css`         | Original design tokens. Ported to `packages/ui/tailwind-preset.js`.                                                                                       |
| `wireframes.html` + `wireframes-png/` | Six annotated low-fidelity wireframes (WF-01..06) with the purpose of every section and where each link leads                                             |
| `navigation-flow.png`                 | How the pages connect                                                                                                                                     |
| `inspiration-board.html` / `.png`     | Palette with contrast ratios, typography, components, tone, reference products                                                                            |

## The four A2 refinements (in scope for the build)

1. **Guest demo scenario:** try a short scenario without signing up (Phase 4).
2. **2D map toggle:** the 2D view is a user choice, not only a WebGL fallback (Phase 3).
3. **Hints with a score penalty:** −5 points per hint (Phase 4).
4. **Three-zone workspace:** Code (explorer + editor), Terminal / Test results, System (Map, Pipeline, Incidents tabs) (Phase 2–3).
