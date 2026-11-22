# Performance evidence (NFR-01, NFR-05)

- **Date:** 2026-11-22 · **Build:** production (`next build` + `next start`, API `node dist/main.js`) on the demo laptop

## Lighthouse (desktop preset, median of 3 runs)

`pnpm quality:lighthouse`; reports in `docs/evidence/lighthouse/` (open the HTML files).

| Page      | Performance | Accessibility | Best practices | SEO | LCP    | CLS | Total blocking time |
| --------- | ----------- | ------------- | -------------- | --- | ------ | --- | ------------------- |
| `/`       | 100         | 100           | 96             | 100 | 0.54 s | 0   | 0 ms                |
| `/login`  | 100         | 100           | 96             | 100 | 0.58 s | 0   | 0 ms                |
| `/signup` | 100         | 100           | 96             | 100 | 0.59 s | 0   | 0 ms                |

Best practices is 96 rather than 100 because the local build is served over plain HTTP (`next start`); behind Caddy
it is HTTPS with HSTS.

## Largest contentful paint on signed-in pages

Measured in the browser by `e2e/tests/quality.spec.ts` (PerformanceObserver, production build), and enforced in
CI: every value must stay under **2.5 s**.

| Page                 | LCP    |
| -------------------- | ------ |
| Landing              | 0.69 s |
| Login                | 0.07 s |
| Learner dashboard    | 0.13 s |
| Catalogue            | 0.10 s |
| Scenario brief       | 0.24 s |
| Instructor dashboard | 0.29 s |
| Workspace            | 0.42 s |
| Debrief              | 0.16 s |

## JavaScript sent on first load (`next build`)

| Route                      | First load JS |
| -------------------------- | ------------- |
| Shared by every page       | 103 kB        |
| Landing, catalogue, brief  | 106–108 kB    |
| Dashboard, login, settings | 128 kB        |
| Workspace `/attempts/[id]` | **150 kB**    |

- The workspace used to load 364 kB up front. The code editor (CodeMirror) is now loaded in its own chunk
  (`next/dynamic` in `components/workspace/Workspace.tsx`), so the page shows immediately and the editor follows.
- The 3D map (three.js, about 330 kB) has always been a separate chunk, loaded only when the System Map is shown.

## 3D map frame rate (NFR-05: 30+ FPS)

- `quality.spec.ts` counts animation frames for 3 seconds with the 3D map open: **59 fps** in headless Chrome on the
  demo laptop (software WebGL), so the real GPU will be at least as fast.
- The 2D map stays available as a fallback and is chosen automatically when WebGL is missing.
