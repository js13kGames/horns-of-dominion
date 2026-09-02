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

    node cmd-test.mjs     # flee cost, pathing, splitting, muster, engagement bookkeeping, civil unrest, unit kinds
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

`src/state.js` opens with `const P = 0.1` — the global pace knob. It multiplies every **rate** (gold, growth, march speed, attrition, siege, mending, unrest, AI cadence) and leaves every **quantity** alone (costs, warriors, wall points). Tick-denominated thresholds are written `x / P`. Change `P` and the whole game speeds up or slows down without a single balance ratio shifting.

`T` in `state.js` is the single balance surface — every tunable lives there, nowhere else, `T.K` and `T.sp` included. `D` is the four-rung difficulty table; its multipliers apply to AI factions only, the player is always `D[1]`.

The loop is fixed-timestep: `main.js` accumulates real time, runs `tick()` + `ai()` at 0.5 s per tick scaled by `S.speed`, and renders every frame with `S.alpha` interpolation. `src/sim.js` `tick()` is one ordered pass — income, road battles and movement, stack merging, node battles, sieges and capture, civil unrest, repairs, crumbling realms, notifications, victory. Order matters; the numbered comments in `tick()` are load-bearing.

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

### Three kinds of warband

`T.K` is the whole unit system: one row per kind, `[field power, wall power, march speed, gold, pop, glyph]`, indexed by `a.k`. Positional on purpose — esbuild does not mangle property names, so `K[k][0]` ships one character at each read site where `K[k].pow` would ship four. Riders are row 0, all `1.0`, priced as an army always was.

**That makes the identity invariant the strongest test available**: with `T.sp` stubbed to all-zero, `sim-test` must return *numerically identical* results to the round-14 baseline. Use it before tuning anything — it is what proves the weighting was threaded everywhere rather than mostly.

`pw(a) = a.w * T.K[a.k][0]` is the field weight, and every place strength is summed goes through it: `melee`, `odds`, and all four AI comparisons. Walls take a second sum (`ram`) against `T.K[a.k][1]`, while besieger blood is still shared by raw bodies. **`garrison()` in `sim.js` is deliberately unweighted** — sitting on a populace is done with boots, a dragon is not worth two riders at it, and weighting it would move round 14's balance. There is a test that fails if someone "fixes" it.

`w` counts bodies everywhere else too — the number under a host, the split slider, `T.raiseW`. Only speed, price and combat weight differ by kind.

Specialists belong to the *place*: `c.sp` is set once in `genMap` on each realm's capital and its next biggest city, and survives conquest like `na`. Chosen **without `rnd()`** on purpose — spending randomness there would shift the whole game's stream and invalidate every balance number.

**The AI must not raise flyers.** It scores targets purely by adjacency and never reads `T.speed`, so it cannot cash in a pegasus's speed, while the `/ T.K[a.k][1]` wall term makes even an undefended city look impossible to one. Letting it raise them stalled 36 of the first 40 games in a 400-game run, every one at 19 cities against 1: flyers that will not siege still drift between friendly cities, burning the single march order a turn buys. The gate is `T.K[c.sp][1] >= 1` — dragons yes, pegasi never. This is the same class of fact as "the AI never splits hosts": measured, and not a bug to fix without evidence.

**Two known gaps, measured and accepted** (do not rediscover them): two dragon realms can deadlock — 1 stalemate in 1200 all-AI games, seed 9180, realms 0 and 2 frozen at ten cities each — plus one decided-but-44k-tick game. Both are all-AI artifacts; a real game has a human in one of the five seats, which is the thing that breaks a frozen border. And `diff-test` reads Duelist at ~10% rather than 20% because it tests realm 0, which breeds dragons: slow units cost the AI most when it only gets one action a turn. Putting the rung on each slot in turn gives 10 / 25.5 / 14.5 / 18 / 32 %, so the effect is real and rung-dependent, not a measurement artifact. At Warlord — the default, and where `sim-test` runs — parity is 155/158/157/159/171 against 160 expected. Retuning dragons to fix the easy rungs would break the parity that already holds at the default one.

Kinds refuse to merge, so a node can hold three of your hosts. Two consequences: `spot()` in `render.js` fans by owner *and* kind — sideways across the faction slot, never outward along the spoke, because a host's strength number hangs 18px under its disc and would land on the disc behind it — and the hit test in `main.js` collects every host in range and cycles rather than taking the first.

### Civil unrest

Each city carries one number, `u` (0–100), plus `na`, the realm it was drafted into. `u` is nothing at all while `na` holds the city; the moment anyone else takes it, `u` jumps to `T.seize` (never downward — a second captor inherits whatever the first earned). It then moves on its own slow clock, `T.slow` ticks apart, which is the only place in `tick()` that is not per-tick.

Per check, a conquered city gathers `T.stir` and its occupier puts down `T.pace` *scaled by strength against population* (`min(1, warriors / (pop × T.hold))` — without that scaling one warrior held a city as well as two hundred, and splitting one off cost nothing). Past `T.calm` the city will not conscript and flies ✊; past `T.riot` it may `revolt()` on any check, which simply hands the city back to `na` at full walls — no mob, no siege, no army spawned.

The sign of `T.stir` is load-bearing: a native realm down to `T.dying` cities or fewer *rallies nobody*, so its lost cities calm instead of stirring and no revolt fires for it. Without that, revolts keep handing a crumbling rump fresh cities, it never falls below `T.dying`, and the game will not end — that showed up as a single 57k-tick game in a 400-game run while the p50 barely moved.

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
