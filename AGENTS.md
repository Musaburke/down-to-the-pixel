# AGENTS.md

"Down to the pixel": a scroll-driven Three.js walkthrough that follows one key press from the fingertip to a lit pixel. Static site: Astro 7, TypeScript (strict), Three.js 0.186.1. Node 22+.

## Commands

| Command | What it does |
| --- | --- |
| `npx astro dev` | Dev server. One instance only. |
| `npm run check` | `astro check` then `astro build`. Must show 0 errors before work is called done. |
| `npm run preview` | Serve the built `dist/`. Check the port is free first (`lsof -i :<port>`). |
| `node tools/check.mjs <url>` | Console errors in normal, debug, reduced-motion, no-WebGL and offscreen runs. |
| `node tools/idle.mjs <url>`, `node tools/entrance.mjs <url>` | Idle draw count; the opening text entrance. |

Screenshots: `node ~/Projects/portfolio/tools/screenshot.mjs "<url>?p=<progress>" <label> --size 1440x900 --out .tmp/shots`. `?p=` pins the progress; `?debug` shows the HUD.

## Where things live

- `src/scripts/choreo/timeline.ts`: pure data, no imports. Every camera shot (`Shot`), part window (`PARTS`) and text switch. Change the motion here.
- `src/scripts/walk.js`: the scene, the rig and the frame loop, ported as is from the approved look sample (v3.3). Plain JS for now; each stop moves into its own typed module (`src/scripts/three/stops/`) as it is built.
- `src/pages/index.astro`: the markup. `src/styles/global.css`: tokens and layout. `src/layouts/Base.astro`: head.
- `public/assets/`: textures. `public/_headers`: Cloudflare Pages headers with an enforced CSP (`script-src 'self'`; Astro emits the script as a file because `assetsInlineLimit` is 0).
- `docs/sources.md`: the source for every figure shown on the page. `CREDITS.md`: asset licences.
- The plans live outside the repo: `~/.claude/plans/build-day-plan-nov-2026.md` (look and status) and `~/.claude/plans/im-not-sure-the-declarative-tide.md` (gates, shot list, performance rules).

## Approved, do not change without asking Musa

- Look: warm carbon `#0c0c0b`, ink `#f9f5ef`, gold `#ae9357`; Instrument Serif headings with one italic phrase, Schibsted Grotesk body. Calm coffee, gold and cream.
- The opening: the full keyboard on an oak desk, one warm lamp off frame, everything else falls to dark. No room.
- Words sit on a soft shade (`.scrim`), never on a box.
- Motion must flow like water: the camera reads one monotone cubic through every shot (no speed jumps), and scroll follows a critically damped spring (`SMOOTH` 0.34 s). Nothing snappy.
- The approved shots and their scroll distance (200vh of pinned travel from `hero` on).

## Rules

- Never invent facts. Every number on the page has a source in `docs/sources.md`; anything unknown is `TODO(musa)` and not shown.
- Ask Musa before downloading assets; record licence, author and URL in `docs/sources.md` and `CREDITS.md`.
- Every heavy effect has a reduced-motion path, pauses offscreen and when the tab is hidden, and keeps the words readable without WebGL or JS.
- No AI attribution in commits, PRs or files. Commit, push, create the GitHub repo or go public only when Musa says so.
