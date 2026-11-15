# AGENTS.md

"Down to the pixel": a scroll-driven Three.js walkthrough that follows one key press from the fingertip to a lit pixel. Static site: Astro 7, TypeScript (strict), Three.js 0.186.1. Node 22+.

## Commands

| Command | What it does |
| --- | --- |
| `npx astro dev` | Dev server. One instance only. |
| `npm run check` | `astro check`, `astro build`, then `npm test`. Must show 0 errors before work is called done. |
| `npm test` | Unit tests in `tests/` (Node's runner, TypeScript stripped). |
| `node tools/scroll-perf.mjs / --headed` | Frame times on the built site with a real GPU (run `npm run preview -- --port 4351` first). |
| `npm run preview` | Serve the built `dist/`. Check the port is free first (`lsof -i :<port>`). |
| `node tools/check.mjs <url>` | Console errors in normal, debug, reduced-motion, no-WebGL and offscreen runs. |
| `node tools/idle.mjs <url>`, `node tools/entrance.mjs <url>` | Idle draw count; the opening text entrance. |
| `node tools/stops.mjs <url> <out> [--only 0.5,0.9] [--desktop] [--hd]` | Pinned captures at 1440 and 390; `tools/sheet.sh` makes a contact sheet. |
| `node tools/hitch.mjs <url>` | Slow scroll, every frame over 40 ms with its progress and shader-program count. |
| `node --experimental-strip-types tools/frame.mjs <p> [W H] [x y z ...]` | Where the camera is at `p`, and where world points land on screen. |
| `npm run deploy` | Build and upload to Cloudflare Pages project `down-to-the-pixel` (needs `npx wrangler login`). |

Screenshots: `node ~/Projects/portfolio/tools/screenshot.mjs "<url>?p=<progress>" <label> --size 1440x900 --out .tmp/shots`. `?p=` pins the progress; `?debug` shows the HUD.

## Where things live

- `src/scripts/choreo/timeline.ts`: pure data, no imports. Every camera shot, part window and text switch. Change the motion here. Pinned travel is shared out in vh by `TRAVEL` (opening and approved shots 250, cable, processor, graphics, pixel 150 each, ending 100); `pre()`, `after()`, `inCpu()`, `inGfx()`, `inPx()`, `inEnd()` map 0..1 within a share onto full progress, so a new share never changes the pacing of the others (update `--walk` in `global.css` to match). `STOP_AT` is where each stop in the list jumps to; `BEATS` are the 18 moments the keyboard steps between.
- `src/scripts/choreo/seg.ts` (number helpers, `part()`), `choreo/flow.ts` (the monotone cubic that maps progress onto the camera curves; tested in `tests/flow.test.ts`).
- `src/scripts/three/textures.ts` (canvas textures; `rand` is seeded, keep the call order), `three/geometry.ts` (`roundBox`, `slab`, `strip`), `src/scripts/text.ts` (the masked line rise).
- `src/scripts/walk.js`: the scene, the rig and the frame loop, the bead, the labels and their definitions, the stop jumps (`jumpTo`) and keyboard momentum. Still plain JS and not type-checked. Imports use `.ts` extensions so Node's test runner can load them.
- `src/scripts/three/stops/`: typed modules, one per part of the walk: `board.ts` (walnut keyboard), `corner.ts` (lamp, candle, mug), `cable.ts`, `cpu.ts` (board, package, lid, die), `gfx.ts` (the drawing, the screen and its three lights, the ending's cursor).
- Performance: groups for later stops are hidden until needed, so after load they are compiled (`compileAsync`), drawn once with culling off (ANGLE on Metal builds pipelines at first draw) and their textures uploaded one a frame (`initTexture`). Anything hidden until late (e.g. `gfx.late`) must join those passes, or its first appearance stalls. Judge frame times from a normal-vsync headed run on mains power; an uncapped run invents stalls, and Low Power Mode or a low battery caps Chrome at 30 fps.
- Labels: a block of `.notes` per stop, positioned by `labels()`; a label shows only when all of it is in frame, takes pointer and focus only while shown, and is a button opening a `.def` popover (the definitions sit in `.defs` at the end of `main`).
- `src/pages/index.astro`: the markup. `src/styles/global.css`: tokens and layout. `src/layouts/Base.astro`: head.
- `public/assets/`: textures. `public/_headers`: Cloudflare Pages headers with an enforced CSP (`script-src 'self'`; Astro emits the script as a file because `assetsInlineLimit` is 0).
- `docs/sources.md`: the source for every figure shown on the page. `CREDITS.md`: asset licences.
- `wrangler.jsonc`: the Pages project (plain files from `dist/`). `public/og.jpg`: the share image (the opening at 1200x630); `site` in `astro.config.mjs` makes its URL absolute.

## Approved, do not change without asking Musa

- Look: warm carbon `#0c0c0b`, ink `#f9f5ef`, gold `#ae9357`; Instrument Serif headings with one italic phrase, Schibsted Grotesk body, both self-hosted in `public/fonts/`. Calm coffee, gold and cream.
- The opening: the walnut keyboard on an oak desk corner, a brass lamp, a candle and a mug, everything else falls to dark. No room, no window, no monitor.
- The six stops in order (key, switch, cable, processor, graphics, pixel), the camera always moving with the scroll (down the page is down or forward in the scene), and the ending on the whole M with a blinking cursor and the "Press it again" keycap.
- Labels: whole label in frame, haloed leader lines, a dotted underline, a definition on a soft shade beside it. Go deeper: three titled points, understanding over numbers.
- Keyboard: a tap glides one beat, a hold cruises at a capped speed, a release slows gently onto the next beat. The wheel and touch are never hijacked.
- Words sit on a soft shade (`.scrim`), never on a box.
- Motion must flow like water: the camera reads one monotone cubic through every shot (no speed jumps), and scroll follows a critically damped spring (`SMOOTH` 0.34 s). Nothing snappy.
- The approved shots and their scroll distance (the opening and approved shots keep 250vh of the pinned travel).

## Rules

- Never invent facts. Every number on the page has a source in `docs/sources.md`; anything unknown is `TODO(musa)` and not shown.
- Ask Musa before downloading assets; record licence, author and URL in `docs/sources.md` and `CREDITS.md`.
- Every heavy effect has a reduced-motion path, pauses offscreen and when the tab is hidden, and keeps the words readable without WebGL or JS.
- No AI attribution in commits, PRs or files. Push or deploy only when Musa says so. The repo is public: no personal data, keys or tokens.
