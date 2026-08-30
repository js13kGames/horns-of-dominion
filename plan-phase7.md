# Unicorn Overlord — round 7: the Rainbow Kingdom as terrain

## Context

The board is currently 20 nodes and their roads floating on a flat `#0b0a12` void. It reads as a graph, not a kingdom. This round gives it a place: a mostly-flat **floating island** carrying every city, a **rainbow** in the sky behind it, and **mountains and lakes** filling the empty ground between roads.

The whole thing is procedural and seeded from the map's own seed, so each kingdom gets a silhouette that follows the shape of its own city cloud — the island *is* the map's convex spread, not a generic blob pasted underneath.

Settled with the user:
- **Muted dusk palette** — deep green-teal land on the existing near-black sky. Faction colours and city rings stay the brightest marks on screen; readability is unchanged and the rainbow supplies the colour.
- **Zoom the board out ~12%** so there is sky on every side. Without it the cities reach all four edges and nothing reads as *floating*.
- **Static land plus shimmering lakes** — the terrain bakes once per map, and lakes get a slow live highlight on top.

Budget: **2,582 B zipped** of headroom (currently 10,730 B of 13,312 B). Estimated spend ≈ 1,050 B.

Two hard invariants carried over from round 5: the simulation must not move (`sim-test` and `diff-test` numerically identical), and **geography is never hidden** — the fog greys roads, it does not remove them, so fogged roads must stay visible against the new land.

---

## The framing change

One number, in `resize()` in `src/render.js`:

```js
V.s = Math.min(w / W, h / H) * 0.88
```

The existing centering maths already divides by `W * V.s`, so it stays centred for free, and `toWorld` reads `V.s`, so hit-testing follows automatically. On 1920×1080 this opens ~48 world units of sky above and below the 1000×700 board, on top of the ~52 units that already sit between the lowest city (y≈630) and the board edge — about 100 units under the southern rim for the island's underside, and ~145 above the northern rim for the rainbow.

Cost: city name labels go from ~15 px to ~13 px on a 1080p screen. Verify by eye; 0.86–0.90 is the tuning range.

**`dom-test.mjs` hardcodes the fit formula** in its `tap()` helper (line 43) and 11 assertions depend on it. It must gain the same `* 0.88`, or every world→screen click lands in the wrong place. This is the highest-risk edit in the round — land it first, on its own, and confirm `dom-test` still passes before touching anything else.

---

## `src/terrain.js` — a new module

Everything below bakes into one offscreen canvas at 2× supersample, painted once per map. The live frame pays a single `drawImage`, which means detail in `paint()` is free and can be as fussy as it wants to be.

State stays **module-local** — no additions to `S`, nothing for `genMap` to reset.

### Its own RNG

`sim.js` draws from the shared `rnd()` stream for combat targeting. If `paint()` called `setSeed`, the browser's simulation would diverge from the headless harnesses, and the "sim-test is unchanged" proof would quietly stop meaning anything. So terrain carries its own three-line LCG seeded off `S.seed`, and never touches `state.js`'s stream.

### The silhouette

Convex support function around the city centroid, then broken up so it doesn't read as a potato:

1. centroid `(cx, cy)` = mean of the 20 city positions
2. `N = 30` angular samples; `sup[k] = max over cities of ((c.x-cx)*cosθ + (c.y-cy)*sinθ)` — the convex support in direction θ, which by construction contains every city
3. `r[k] = sup[k] + 55 + wobble[k]`, wobble being seeded noise at ±10%, run through two circular 1‑2‑1 smoothing passes so the coastline undulates instead of jitters
4. draw as a closed curve with `quadraticCurveTo` through the midpoints between consecutive ring points — the standard smooth-polygon trick, five lines

Convexity guarantees no degenerate spikes for any seed. If the result looks too regular in play, the tuning knob is to blend in a per-sector max radius (`0.65 * sup + 0.35 * sectorMax`, floored at `0.55 * meanR`) which produces concave bays.

Store `r[]`, `cx`, `cy` and a nearest-sample `inside(p, margin)` lookup — the feature placer needs it.

### Painting order

1. **sky** — a barely-there vertical gradient over `#0b0a12`, plus ~40 one-pixel stars at low alpha
2. **rainbow** — 5 arcs using the `REALMS` palette, which is already red/orange/green/blue/violet, so no new colour array is needed and the sky ties back to the factions. Centred well below the island, radius ~470→400, `lineWidth` 10, alpha ~0.16. Drawn *before* the island so the land occludes its feet — that occlusion is what makes it read as sky rather than decoration.
3. **underside** — from the lower rim, a tapering jagged keel down to a point ~190 units below, filled with a gradient fading to transparent at the tip, plus two or three small drifting rock ellipses below it. On a 16:9 window the tip is clipped by the viewport; the taper is designed to still read as "the land ends here."
4. **cliff rim** — stroke the outline at `lineWidth` 10 in `#2a2438`, *then* fill the same path in the land gradient. The stroke that survives outside the fill becomes the cliff band, for two lines of code.
5. **land** — vertical gradient `#1b2a24` → `#16202c`, with a thin lighter highlight along the northern rim.
6. **mountains and lakes** — below.

### Mountains and lakes go where nothing else is

Rejection sampling, ~140 candidates, keeping up to 5 peaks and 4 lakes. A point is free when it is:

- `inside(p, 70)` — well clear of the coastline
- more than 66 units from every city (a flat clearance; deliberately **not** importing `cityR` from `render.js`, since `render.js` imports this module and the cycle is not worth the risk)
- more than 34 units from every road, via `segDist` in `src/map.js:20` — currently module-private, so **export it**
- more than 90 units from an already-placed feature

Each mountain is a main triangle plus a shorter shoulder in `#2b2740`, a lighter left face `#3a3556`, and a small `#cfd3e8` snow cap; 22–40 units tall. Each lake is an **axis-aligned** ellipse (no rotation — horizontal water lines are what the shimmer wants anyway) filled `#1b3350` with a `#2a4d72` rim and an offset inner highlight.

Lake geometry is kept in the module so the live layer can find it again.

### The live shimmer

`export function shimmer (x)` — for each lake, two horizontal highlight strokes whose x-offset drifts on `Math.sin(S.elapsed * 0.35 + phase)` and whose alpha breathes between **0.10 and 0.15**. Half-widths are derived from the ellipse equation at each band's y-offset, so no clipping path is needed and the bands never escape the water.

That alpha ceiling is deliberate: the siege pulse runs 0.25–0.80 in bright red, so the water stays an order of magnitude quieter and cannot compete for attention with a city under attack — the risk the user flagged when choosing this option.

---

## Everything else that changes

**`src/render.js`** — import `bg` and `shimmer`; immediately after `x.translate/scale` into world space, `x.drawImage(bg, 0, 0, W, H)` then `shimmer(x)`, both before the edge loop. Plus the `0.88` in `resize()` and the road colours below.

**`src/main.js`** — call `paint()` in `fresh()`, right after `genMap(...)`. `hooks.again` already routes through `fresh()`, so a new kingdom repaints for free.

**`src/map.js`** — export `segDist`.

**Road contrast — a required fix, not a polish item.** The fogged road at `#191628` is currently distinguished from the void by luminance alone, and the new land sits at nearly the same luminance. On the island a fogged road would vanish, which breaks the round‑5 promise that geography is only ever greyed. Both stops need re-seating over the land, keeping *two* separations intact: lit vs fogged, and fogged vs ground. Starting candidates `#4a4270` lit / `#2b2740` fogged, tuned by eye.

**Test stubs.** `dom-test.mjs` and `dist-test.mjs` both stub the canvas context with a Proxy that auto-vivifies missing methods as `() => {}`. That returns `undefined` from `createLinearGradient`, and the next `.addColorStop` throws. Two small changes to each:

- the proxy's generated function returns the ctx itself, so gradient objects chain
- `document.createElement` returns a stub element (their existing `mk()` already provides `getContext`)

This is the same shape of breakage as the `#toast` crash last round — where `&&` chaining with `| tail -2` masked a non-zero exit. Run each harness on its own and read its exit code.

---

## Order of work, with a measurement after each step

| # | Step | Est. |
|---|---|---|
| 1 | `V.s * 0.88` + `dom-test` `tap()` fix + road recolour | ~30 B |
| 2 | `terrain.js`: offscreen, RNG, outline, cliff+land fill, blit from `render.js` | ~350 B |
| 3 | Sky, stars, rainbow, keel | ~300 B |
| 4 | Mountains, lakes, `segDist` export, stub fixes | ~250 B |
| 5 | Live lake shimmer | ~120 B |
| 6 | Contrast tuning by hand, full harness sweep | — |

`npm run size` after each step. If step 5 would breach the gate, cut in this order: stars → the drifting rocks under the keel → snow caps → peaks from 5 down to 3.

## Verification

- **`sim-test.mjs` and `diff-test.mjs` must be identical to the digit** — p50 ~3,900 / p99 ~10,500 at base 1000 rung 2, ladder 0/19/40/61. Terrain has its own RNG and writes no shared state, so any drift means it leaked into the simulation. This is the same proof the fog layer had to pass.
- **`cmd-test`, `road-test`** — pass untouched.
- **`dom-test`** — passes with the corrected `tap()`; that it still clicks the right cities is the real assertion that the zoom-out is wired through `toWorld` correctly. Add one check that `paint()` runs without throwing against the stub.
- **`dist-test`** — passes; run standalone and check `$?` rather than piping.
- **`npm run build`** — under 13,312 B.
- **By hand in the browser**, in this order: does a fogged road stay visible where it crosses land; do city rings and warband counts still pop against the ground; do mountains or lakes ever sit under a road or a city label; does the island read as *floating* on a 16:9 window; does the lake shimmer ever pull the eye away from a red siege pulse. Reroll several seeds — the silhouette is different every map, and the failure cases will be the lopsided ones.

## Not in this round

The onboarding scenario is still on hold at the user's instruction from round 2 ("let's hold from implementing it until we have more of the game fixed").

---

## What actually shipped (recorded after execution)

Five decisions changed once the result could be looked at. The round was verified by
recording the real canvas call stream into SVG and rasterising it (`qlmanage`), rather
than by eye in a browser — the scripts for that live in the session scratchpad.

1. **Zoom went to 0.72, not 0.88.** At 0.88 the island still overflowed the frame top
   and bottom, so nothing read as floating and there was no sky for the rainbow.
2. **The rainbow was hidden.** Centred on the island at radius 470 it sat entirely
   behind the land, showing only as a stray red sliver at one edge. It now arcs at
   radius 760 through the sky *above* the island, spanning a full half-circle.
3. **The fade veil was replaced by gradient strokes.** A translucent rect over the bake
   area left a visible rectangle edge against the star layer. Each band now strokes with
   its own colour→transparent gradient, so the legs fade with no veil and no hard edge.
4. **Feature clearance had to be size-aware, and the snow dimmed.** Placing by base point
   with a flat 34-unit road clearance let mountain flanks cross roads (measured: ink
   reaching 7 units inside a city disc, and up to 7 units *past* a road centre line).
   Clearance is now scaled by the feature's own extent, and the snow cap dropped from
   `#cfd3e8` to `#7d84a8` so a road stays legible over it. Measured across 200 seeds:
   worst city clearance 54 units, worst road −2.
5. **The convex support needed its axis dips padded.** A rectangular city cloud has
   minimum support straight up, down, left and right, so *every* island came out the
   same rounded square — with a notch at top centre that exposed the rainbow through it.
   `R[k] += (max - R[k]) * 0.3` fills those dips before the random margin is added.

Final: **12,439 B zipped of 13,312** (873 B headroom). `sim-test` digit-identical to the
pre-round baseline (p50 4138 / p90 5950 / p99 9427 / max 16141, winners 90/80/70/68/92),
ladder 0 / 20.0 / 42.5 / 61.0, all six harnesses green.
