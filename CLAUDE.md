# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Horns of Dominion** — a real-time-with-pause strategy game for the js13kgames budget. Twenty cities on a procedural node graph, five realms, total-conquest victory. No assets: every pixel is generated, the art is emoji plus flat canvas geometry.

The defining constraint is **13,312 bytes zipped**, enforced at build time (`build.mjs` exits non-zero over it). Every design decision is downstream of that.

## Commands

    npm install
    npm run dev      # esbuild watch + static server on :8080, rebuilds on save
    npm run build    # dist/index.html + dist/game.zip; FAILS if over 13312 B
    npm run size     # one line: "<zipped> / 13312 (<pct>%)"
    node build.mjs --raw   # skip roadroller, to A/B against the unpacked pipeline

**Only `npm run build` / `npm run size` report a real number.** `--dev` skips minification and the packing stages below, so its figure is meaningless and always over budget. Reading a dev number as if it were real has wasted time here repeatedly.

**A stale `dist/` fails `dist-test` for no reason.** Anything that rebuilds with modified or stubbed sources — a measurement script, a running dev server — leaves `dist/` behind. Rebuild before believing a `dist-test` failure.

### The build pipeline

Four stages. The last three were worth ~2,200 B when added, more than everything ever cut from the game:

1. **esbuild** bundles and minifies to an IIFE.
2. **Roadroller** re-encodes the bundle as a self-extracting payload (`optimize(1)`; level 2 buys ~10 B for 25 s, not worth it).
3. **The stylesheet is folded into that payload** rather than left in the HTML shell, so Roadroller's model sees it too. Only `body{background:#0b0a12}` stays behind — without it the page flashes white for as long as decompression takes.
4. **The zip is assembled by hand** with `@gfx/zopfli`: one entry, no extra fields. `zip -9` wrote 170 B of container where 118 suffices, and Info-ZIP's own deflate ran 224 B behind plain zlib before zopfli improved on that again. The DOS timestamp is pinned so builds are reproducible.

**The build is not byte-deterministic** — Roadroller's search varies output by roughly ±20 B run to run. Never chase a saving smaller than that, and leave margin rather than landing exactly on the limit.

Historical warning: `advzip`/`ect` used to be shelled out to inside a bare `catch {}`, and neither was installed, so every size figure before phase 13 was plain `zip -9`. Don't reintroduce a silent fallback; the build names the compressor it actually used.

## Tests

There is no test runner. Each harness is a standalone `.mjs` that imports the real `src/` modules, prints `ok`/`FAIL` lines, and exits non-zero. Run one directly:

    node cmd-test.mjs     # flee cost, pathing, splitting, muster, engagement bookkeeping, loyalty
    node road-test.mjs    # road engagements, deterministic army placements, no AI
    node dom-test.mjs     # drives the real modules against a stub browser
    node dist-test.mjs    # boots the shipped, packed dist/index.html

Two more that inspect rather than assert:

    node shot.mjs [seed] [frames] [out.svg]   # render one frame to SVG — see "Visual work" below
    node geo.mjs  [seeds]                     # every city on the island? feature counts? forest cover?

**Run each separately and check `$?`.** Chaining with `&&` and piping to `tail` has masked a non-zero exit here before.

Balance harnesses (slow, minutes):

    node sim-test.mjs [seedBase] [rung] [count]   # default 1000 2 400 — headless games
    node sim-test.mjs 5000 2 200                  # a second seed range, to tell bias from noise
    node diff-test.mjs [gamesPerRung]             # is the difficulty ladder monotonic?
    node bias.mjs                                 # starting-position parity across realm slots
    node dbg.mjs <n> / node worst.mjs             # single-game trace / worst-tail hunt

## Architecture

### The tick, and what scales with what

`src/state.js` opens with `const P = 0.1` — the global pace knob. It multiplies every **rate** (gold, growth, march speed, attrition, siege, mending, loyalty drift, AI cadence) and leaves every **quantity** alone (costs, warriors, wall points). Tick-denominated thresholds are written `x / P`. Change `P` and the whole game speeds up or slows down without a single balance ratio shifting.

`T` in `state.js` is the single balance surface — every tunable lives there, nowhere else. `D` is the four-rung difficulty table; its multipliers apply to AI factions only, the player is always `D[1]`.

The loop is fixed-timestep: `main.js` accumulates real time, runs `tick()` + `ai()` at 0.5 s per tick scaled by `S.speed`, and renders every frame with `S.alpha` interpolation. `src/sim.js` `tick()` is one ordered pass — income, road battles and movement, stack merging, node battles, sieges and capture, loyalty, repairs, crumbling realms, notifications, victory. Order matters; the numbered comments in `tick()` are load-bearing.

### Derived state, not stored state

Three things are deliberately **pure functions of the current board**, with nothing to persist, reset or keep in sync. Reintroducing a stored flag for any of them is a regression:

- **Fog of war** (`seeCity` / `seeRoad` / `seeArmy` in `sim.js`). Reveals last only while a host is present. The fog hides intel *and* battle effects and capture flashes — but never geography, which greys out instead; fogged roads go dotted rather than dim. The AI plays with full information.
- **Command** (`active()` in `sim.js`). Selecting one of your own warbands *is* what puts it under command; there is no separate targeting flag.
- **Terrain** (`src/terrain.js`). The island silhouette is derived from the current map's city positions.

Because fog touches nothing in the simulation, `sim-test.mjs` must return **numerically identical** results before and after any fog change. That invariant is the strongest available proof of non-interference — use it.

### Commanding warbands

Click one of your hosts and it is under command (the canvas cursor becomes a crosshair). Click a city and it marches there, staying under command so the order can be redirected. Click anywhere else and it stands down. There are no movement buttons.

**A city must win the hit test over a host standing on it** — `to = hc >= 0 ? hc : …` in `main.js`. At progress 0 a marching host sits exactly on the city it left, so if the host won, a march could never be turned around. There is a test for this; keep it.

### The backdrop is baked

`terrain.js` renders the whole floating island — coastline, cliffs, the rock underside, mountains, woods — once per map into an offscreen canvas at `paint()`, called from `fresh()` in `main.js`. The live frame pays one `drawImage` and nothing else, so detail inside `paint()` is free.

Terrain runs **its own RNG**, seeded off `S.seed`. It must never draw from `state.js`'s `rnd()`, or the browser's simulation would drift away from the headless harnesses and every balance number would stop meaning anything.

The coastline traces the convex hull of the cities (a ray hits the hull at `min(support(φ)/cos(θ−φ))` over the sampled supporting lines), leaning partway back toward the raw support so it doesn't come out a rectangle. The skirt on top is floored — cities sit *on* the hull, so a negative margin would leave one standing in the sea. The rock underside is seven copies of that same coastline, scaled about the centroid and stacked downward; the jagged coast is what makes them read as strata.

### Loyalty

Each city carries `L` — 5 loyalty values summing to 100 — plus `na`, the native realm from the initial draft. One helper (`shift`) moves points onto a faction proportionally from the others, so the ledger never needs renormalising. Per tick: the garrison pulls toward its owner *scaled by strength against population* (`min(1, warriors / (pop × T.hold))` — without that scaling one warrior held a city as well as two hundred, and splitting one off costs nothing), the native realm pulls back *scaled by how much of the map it still holds* (without that, a rising hands a dead realm an army, the army keeps it flagged alive, and its cities rise forever), high loyalty flips `na` to the owner, and low loyalty triggers a rising whose host is flagged `rb` to walk in without a siege.

### Audio

`src/player.js` is SoundBox's `player-small.js`, altered in exactly two ways — `CPlayer` exported as a module binding, and the unused `getData()` deleted. zlib licence: keep the copyright header, and if you alter it further, say so in the ALTERED SOURCE notice at the top. Arpeggio is dead code for the current song but deliberately kept: it costs 16 B, and sound effects are the thing likely to want it.

`src/audio.js` grinds one instrument per frame from the render loop (~330 ms total, worst call ~117 ms) so the boot doesn't stall, and starts playback on realm selection, which is also the user gesture browsers require for autoplay. A `typeof Audio` guard keeps the headless harnesses out of it. The player's noise oscillator uses `Math.random()`, so **generated audio differs every run** — don't try to assert byte-identical output.

### The UI is deliberately thin

Almost everything a panel might report is already on the map: ownership is the ring colour, a host's strength is the number under it, `👥pop 🛡walls` is drawn under every city, and a march is its dashed path to a lit destination. The city panel carries only what the map cannot, and selecting a warband shows nothing but the split slider. Before adding a readout, check the map does not already say it.

## Working here

**Measure, don't assume.** The balance is tuned against 400-game runs across independent seed ranges, reading p50/p90/p99/max, stalemate count and win distribution. A change is not done until those numbers are back. Two recurring traps: p99 and the tail move long before p50 does, and a single seed range cannot distinguish faction bias from noise.

**Tests here have a habit of passing without testing anything.** Three separate cases turned up in one round: assertions inside an `if` that was never true, with dummy `ok(1)`s in the `else`; and two `!/unknown/` checks that went vacuous when the string they keyed on was deleted. When removing a feature, work out what its tests were *actually* asserting before rewriting them, and prefer assertions that fail loudly if the thing they guard disappears.

**Verify string replacements.** Silent no-op `sed`/`replace` edits have shipped bugs here more than once. Assert the match count, or use a tool that errors on no-match, and `grep` the result.

**AI movement is the highest-risk code in the repo.** Past regressions include 13,000-warrior frozen stacks with 400/400 timeouts, and total gridlock from a movement gate. Change `ai.js` only with a full balance re-run. The AI never splits hosts and never garrisons deliberately — both were measured, and neither is a bug to fix without evidence.

**Visual work has no browser.** There is no headless browser available, so `shot.mjs` is how you actually look at a change: it drives the real game against a recording 2D context and re-emits a frame as SVG, which `qlmanage -t` rasterises into something readable. Rendering blind has repeatedly shipped mistakes that were obvious the moment the frame was looked at — a rainbow entirely hidden behind the island, mountains swallowed by their own tree line, labels invisible on bright grass.

`prompts.txt` is the running log of feature requests; `plan*.md` are per-round plans. Both keep the game's former name, *Unicorn Overlord*, on purpose — they record what was asked at the time, not living documentation. `README.md` is player-facing but currently lags the code: it still describes the event log, the Turn back button and the battle roster, all removed.
