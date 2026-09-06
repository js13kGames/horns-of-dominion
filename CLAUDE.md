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

`T.K` is the whole unit system: one row per kind, `[field power, wall power, march speed, gold, pop, glyph]`, indexed by `a.k`. Positional on purpose — esbuild does not mangle property names, so `K[k][0]` ships one character at each read site where `K[k].pow` would ship four. Footmen are row 0, all `1.0`, priced as an army always was.

**That makes the identity invariant the strongest test available**: with `T.sp` stubbed to all-zero, `sim-test` must return *numerically identical* results to the round-14 baseline. Use it before tuning anything — it is what proves the weighting was threaded everywhere rather than mostly.

`pw(a) = a.w * T.K[a.k][0]` is the field weight, and every place strength is summed goes through it: `melee`, `odds`, and all four AI comparisons. Walls take a second sum (`ram`) against `T.K[a.k][1]`, while besieger blood is still shared by raw bodies. **`garrison()` in `sim.js` is deliberately unweighted** — sitting on a populace is done with boots, a dragon is not worth two footmen at it, and weighting it would move round 14's balance. There is a test that fails if someone "fixes" it.

`w` counts bodies everywhere else too — the number under a host, the split slider, `T.raiseW`. Only speed, price and combat weight differ by kind.

Specialists belong to the *place*: `c.sp` is set once in `genMap` on each realm's capital and its next biggest city, and survives conquest like `na`. Chosen **without `rnd()`** on purpose — spending randomness there would shift the whole game's stream and invalidate every balance number.

**The AI must not raise flyers.** It scores targets purely by adjacency and never reads `T.speed`, so it cannot cash in a unicorn's speed, while the `/ T.K[a.k][1]` wall term makes even an undefended city look impossible to one. Letting it raise them stalled 36 of the first 40 games in a 400-game run, every one at 19 cities against 1: flyers that will not siege still drift between friendly cities, burning the single march order a turn buys. The gate is `T.K[c.sp][1] >= 1` — dragons yes, unicorns never. This is the same class of fact as "the AI never splits hosts": measured, and not a bug to fix without evidence.

**The AI reads march time, and its army ceiling is priced in gold.** `eta(a, j)` is the only place it looks at a road length; `soon()` discounts every target score by `T.muster / (T.muster + eta)`, so a prize is worth what it costs to reach, and siege relief picks whoever arrives first rather than whoever comes first in `S.A`. The standing-army cap counts **gold spent in footman-equivalents** (`a.w * T.K[a.k][3] / T.K[0][3]`), which is the only measure that does not inflate the board: counting bodies let a dragon realm field 2.2x the power for one cap, and counting fighting strength let a cheap flyer realm field 1.67x the bodies. Both made wars drag.

**Because the AI's targeting itself changed, the round-14 identity invariant no longer holds** and should not be expected to. It served its purpose in round 15; from here the baseline is round 16's own numbers.

**Speed is a combat stat in the open, and nowhere else.** Two layers, both derived from `T.K[k][2]`, so there is no matchup table and no new column. `might(a, open)` scales `pw` by `(1 + speed) / 2` on a road — that is the aggregate weight `odds()` reads. `strike(a, b, open)` then adds the **ambush**: `melee` already aims each host at one *particular* enemy, so the matchup can be read off the two march rates as `1 + (speedA - speedB) * T.amb`, floored at 0.2. Outpace what you land on and you caught it strung out; behind walls both layers are 1, because nothing outruns masonry. `afield(g)` separates the cases by `g[0].t >= 0`, which is exact — a road cluster is all marchers, a node fight all resters.

The triangle **inverts with the ground**. On a road, unicorns break footmen, footmen break dragons, and unicorns maul dragons worst of all. At a wall it is the exact reverse. That means footmen now beat dragons in the open, which is the point: a dragon is a siege engine, not a strong generalist.

**Body count is hit points.** Damage in `melee` comes off `a.w`, while `T.K[k][0]` only multiplies output. So for equal gold a half-sized host of double-strength warriors trades evenly on damage and dies twice as fast: 50 dragons lose to 100 footmen in any straight fight. Dragons are a siege arm, not a field arm — their edge is that `T.sgLoss * c.d` is charged per tick regardless of what you are, so breaching faster simply costs fewer lives. Do not read `T.K[k][0]` as general strength.

**A flyer's lethality does not convert into victory, and this is now measured three ways.** Cheap flyers, elite flyers, and elite flyers the AI actively hunts columns with — all the same answer. The cleanest run is the `T.wing` sweep at 150 games a rung: with unicorn realms at **0%** commitment they sit at exact parity (30 wins against the dragon realms' 30); at **30%** they fall to 24 against 38. Monotonic. **Every coin spent on flyers is a coin not spent taking a city**, and lethality never entered into it — the ambush build made unicorns maul everything on a road and moved that curve not at all.

**Winning fights is not the same as taking cities.** Light cavalry works in Age of Empires because killing villagers is itself a path to victory; here nothing but holding cities is. **This is a victory-condition problem, not a unit problem** — a raider needs a way to hurt an economy (pillaging `c.p` or gold, cutting a road) before it can be worth raising. No amount of pricing or lethality substitutes for it. That is the open design question.

`T.wing` is the compromise that ships: the AI keeps at most that share of its war chest in flyers and spends the rest on something that can knock a wall down, and flyer hosts get first refusal on any enemy column walking a road they touch. At 0.15 it holds — 0 stalemates, 0 games over 24k, win spread 35–50 — and the player actually meets flyers in the world. **Doctrine, not randomness**: a realm raises what its cities breed, so win rates stay attributable instead of dissolving into variance.

**Both of the old known gaps closed when the city stopped fighting** (see "Fights at a city" below), and the note is kept because the *reason* is worth having. Frozen borders and a soft difficulty ladder were the same bug wearing two hats: the garrison term let a token host hold a city against anything, so evenly matched realms deadlocked, and slow dragon realms — which cannot cash a defensive edge they only get by standing still — were the ones it punished. `diff-test` measured immediately before and after: Duelist **18.0% → 20.5%** against a fair 20%, and the whole ladder steepened — 0 / 18 / 54 / 70.5 became 0 / 20.5 / 59.5 / 77.5. Stalemates went 1-in-400 to 0 on seed 1000, and that range's 34k-tick tail with it.

The ~10% and the per-slot 10 / 25.5 / 14.5 / 18 / 32 % this note used to quote were **already stale** by the time they were cited — a re-measure on the code immediately before this change read 18.0%. Something between round 14 and round 18 had mostly fixed it and nobody re-ran the harness. Treat every number in this file as of its round, and re-measure before building on one.

Kinds refuse to merge, so a node can hold three of your hosts. Two consequences: `spot()` in `render.js` fans by owner *and* kind — sideways across the faction slot, never outward along the spoke, because a host's strength number hangs 18px under its disc and would land on the disc behind it — and the hit test in `main.js` collects every host in range and cycles rather than taking the first.

### Fights at a city, and sieges

**A city never joins a fight between hosts.** `melee` takes one argument now; the garrison term it used to take (`c.d * 0.5` per tick, aimed at a random enemy of the owner) is gone. Two hosts standing on a city trade exactly as they would on the road outside it, less the two speed layers — `afield(g)` is `g[0].t >= 0` and `at(i)` only returns resters, so `might` and `strike` are already 1 at a node. That part needed no code; the garrison term was the whole of it.

The old term was not a small thumb on the scale. With `T.atk = 0.06 * P` and `c.d` drawn `ri(2, 10)` in `genMap`, 40 footmen at a Defense-5 city put out 0.24 bodies a tick and the city put out **2.50** — the walls were doing 91% of the killing, and the defender's *kind* barely registered: 40 unicorns (0.6 field power) held a city exactly as well as 40 dragons (2.2), both to about 120 attacking dragons. Kind matters at a city now, which is the point of the change.

**A siege is what happens when there is nobody left to fight**, and it is the only thing `c.d` still powers — across its whole `ri(2, 10)` range it costs a besieging host 4% to 20% of its bodies, while wall points set the clock (40% walls fall in 40 ticks, full walls in 104). Defense is an attrition tax; `c.s` is the gate. The node branch runs a melee and `continue`s while two owners have hosts present, so walls take nothing until one side is gone; then `T.sgLoss * c.d` is charged per tick against the besiegers and `ram * T.sgDmg` against the wall. `cmd-test` section 10 pins all three rules — Defense-2 and Defense-10 leave a *byte-identical* node fight, a stouter city bleeds besiegers harder, and a defended city takes no wall damage — and all three are mutation-checked.

**What it bought, measured** (400 games, two seed ranges; and `diff-test` run either side). p50 barely moved (4161→4304, 4049→4195) but the tail collapsed: seed 1000 went p99 20455→10187, max 34159→22283, 3 games over 24k → **0**, and its one stalemate → **0**. Seed 5000's win spread tightened to 75–89 against 80 expected. It also freed **79 B**, because the garrison branch and its `foesOf` helper went with it.

**Why the tail was there.** A defended city was nearly unkillable, so two evenly matched realms could hold a border forever. Every frozen-border artifact this repo has recorded traces back to that one term.

**The one thing no harness here can see.** `sim-test` and `diff-test` are all-AI, and the AI never garrisons deliberately — so the garrison term was a tool only a *human* was using. Removing it takes away the player's "leave forty men and the city holds" move and takes nothing from the AI. Every number above is blind to that. If defending starts to feel hopeless, this is the change to look at, and the fix is a rung or a `T` knob, not putting the term back.

### Road contact, and the flee toll

Two bugs lived here together and fed each other. Both have regression tests in `road-test.mjs`, mutation-checked.

**The chain finds the brawl; it must not decide who is in it.** Clustering grows while *consecutive* gaps are `<= T.reach`, so six hosts spaced 18 apart chained into one cluster spanning **95 units** and the rearmost was locked into a melee 5.3x reach away from any enemy. Membership is now: within `T.reach` of an enemy, plus friends within `T.reach` of one of those. Arrivals still join, because the movement walk halts a host `T.reach * 0.9` behind its own front rank. Span is bounded at roughly `2 * T.reach` either side of contact instead of unbounded.

**`T.flee` is charged once, not once a tick.** The AI re-flees every tick it is losing, and `flee()` called `turn()` each time — so a host flipped orientation every tick, netted nearly zero displacement, and paid a quarter of itself per tick until it died. Measured: 20 warriors down to 4 in seven ticks, 95 units from an enemy it never touched, while that enemy lost 2 of 400. `flee(a, ep)` now takes where the enemy is: still ahead means a real disengagement and costs `T.flee`; already behind means the host is mid-retreat and just keeps walking (`st = 0`). The player's own retreat through `order()` passes no `ep` and always pays, which is right — it is one deliberate act, and `turn()` swaps the endpoints so a second click is a march order, not a second toll.

**What fixing it cost, measured.** The bug had been *inflating* the value of road combat: losing hosts dissolved on the spot instead of retreating, so every skirmish was decisive. With retreats surviving, 300 games a range gives p50 4233/4020 and p90 7152/6732 — the core is unmoved — but seed 1000 gained **1 stalemate and 2 games over 24k** (game 77, realms 0 and 1 frozen at 11 cities against 9), and that game was inside the previously-clean 200-game sample, so the fix caused it. Two evenly matched realms can now grind without either army ever breaking. The unicorn realms also lost ground (600 games: dragon realms 147/126, unicorn realms 100/104/122 against 120 expected) because an ambush that no longer annihilates its victim is worth less. Both are accepted: a host that retreats should not dissolve, and the alternative is a mechanic that lies to the player.

### Civil unrest

Each city carries one number, `u` (0–100), plus `na`, the realm it was drafted into. `u` is nothing at all while `na` holds the city; the moment anyone else takes it, `u` jumps to `T.seize` (never downward — a second captor inherits whatever the first earned). It then moves on its own slow clock, `T.slow` ticks apart, which is the only place in `tick()` that is not per-tick.

Per check, a conquered city gathers `T.stir` and its occupier puts down `T.pace` *scaled by strength against population* (`min(1, warriors / (pop × T.hold))` — without that scaling one warrior held a city as well as two hundred, and splitting one off cost nothing). Past `T.calm` the city will not conscript and flies ✊; past `T.riot` it may `revolt()` on any check, which simply hands the city back to `na` at full walls — no mob, no siege, no army spawned.

The sign of `T.stir` is load-bearing: a native realm down to `T.dying` cities or fewer *rallies nobody*, so its lost cities calm instead of stirring and no revolt fires for it. Without that, revolts keep handing a crumbling rump fresh cities, it never falls below `T.dying`, and the game will not end — that showed up as a single 57k-tick game in a 400-game run while the p50 barely moved.

### Audio

`src/player.js` is SoundBox's `player-small.js`, altered in exactly two ways — `CPlayer` exported as a module binding, and the unused `getData()` deleted. zlib licence: keep the copyright header, and if you alter it further, say so in the ALTERED SOURCE notice at the top. Arpeggio was dead code for a while and kept anyway on the bet that a sound effect would want it; the sword clash does (`ARP_CHORD 1`, `ARP_SPEED 7`), so it is live now.

`src/audio.js` grinds one instrument per frame from the render loop so the boot doesn't stall, and starts playback on realm selection, which is also the user gesture browsers require for autoplay. A `typeof Audio` guard keeps the headless harnesses out of it. The player's noise oscillator uses `Math.random()`, so **generated audio differs every run** — don't try to assert byte-identical output.

`TRK` is the grind queue in fixed order — **0 song · 1 horn · 2 chime · 3 fanfare · 4 clash** — and `bank[]` is the rendered result at the same indices. The song is first because the title screen is what waits on it; the four effects (`src/sfx.js`, one instrument over one 32-row pattern each) cost one extra frame apiece after it. Two tracks loop and are reconciled by `play()`: the song, and the din of battle. The rest are fired by `shot()`, which rewinds only an element that has actually played — the `currentTime` setter used to throw on a pre-metadata element in older WebKit.

The chime is on every button that commits to something (`'rgxfdv'.includes(a)` in `ui.js` — raise, specialist raise, split, mend, rung, speed) and on every map click that lands: a city, a host, or a destination for a host under command. **The realm card is the one deliberate exception** — `music(1)` fires on the same click and the song comes up over the chime, so it was inaudible and was removed. There is a test that fails if someone adds `s` back to that string.

**The din of battle is derived, like the fog.** `main.js` runs `clash(playing && !S.over && fighting())` every frame. `fighting()` in `sim.js` is two terms, and both are needed:

- `S.fx.some(f => f.k === 1)` — a clash marker on screen. This inherits the fog for free, because `sim.js` never pushed the marker for a fight the player cannot see.
- `S.C.some((c, i) => besieged(i) && seeCity(i))` — **a siege has nobody to fight, so it draws no ⚔️ of its own.** `melee` only fires when `sides.length > 1`; a lone besieger chewing a wall would otherwise be silent. The `seeCity` half is not decoration — drop it and a siege inside the fog starts making noise, which `dom-test` catches.

There is no "am I fighting" flag to keep in sync, and reintroducing one is the same regression as reintroducing a stored fog bit.

**The effects are the only audio the harnesses cover, and they are covered properly.** `dom-test` stubs `Audio` alone — Node has `Blob` and `URL.createObjectURL` — so all five tracks are ground for real and a broken instrument row throws there rather than in the browser. Every one of those assertions is mutation-checked. Note that a natural `dom-test` run reaches exactly one of the two endings, which made the fanfare check half vacuous; the forced win at the end of the file is what makes it a test.

`sfx.js` spells the three tonal instruments out in full even though they differ in four slots. Folding them into a shared array plus patches cost **20 B more**, because Roadroller models the near-identical rows better than the patch loop compresses. Measured; don't redo it.

### The UI is deliberately thin

Almost everything a panel might report is already on the map: ownership is the ring colour, a host's strength is the number under it, `👥pop 🛡walls` is drawn under every city, and a march is its dashed path to a lit destination. The city panel carries only what the map cannot, and selecting a warband shows nothing but the split slider. Before adding a readout, check the map does not already say it.

## Working here

**Read the source; don't delegate exploring it.** All of `src/` is ~20k tokens, and the game logic without the vendored audio is ~15k. Spawning exploration subagents to map this repo costs an order of magnitude more than reading every line of it — three of them once ran up 206k tokens to summarise files that fit comfortably in context. Grep and read directly.

**Measure, don't assume.** The balance is tuned against 400-game runs across independent seed ranges, reading p50/p90/p99/max, stalemate count and win distribution. A change is not done until those numbers are back. Two recurring traps: p99 and the tail move long before p50 does, and a single seed range cannot distinguish faction bias from noise.

**Tests here have a habit of passing without testing anything.** Three separate cases turned up in one round: assertions inside an `if` that was never true, with dummy `ok(1)`s in the `else`; and two `!/unknown/` checks that went vacuous when the string they keyed on was deleted. When removing a feature, work out what its tests were *actually* asserting before rewriting them, and prefer assertions that fail loudly if the thing they guard disappears.

**Verify string replacements.** Silent no-op `sed`/`replace` edits have shipped bugs here more than once. Assert the match count, or use a tool that errors on no-match, and `grep` the result.

**AI movement is the highest-risk code in the repo.** Past regressions include 13,000-warrior frozen stacks with 400/400 timeouts, and total gridlock from a movement gate. Change `ai.js` only with a full balance re-run. The AI never splits hosts and never garrisons deliberately — both were measured, and neither is a bug to fix without evidence.

**Visual work has no browser.** There is no headless browser available, so `shot.mjs` is how you actually look at a change: it drives the real game against a recording 2D context and re-emits a frame as SVG, which `qlmanage -t` rasterises into something readable. Rendering blind has repeatedly shipped mistakes that were obvious the moment the frame was looked at — a rainbow entirely hidden behind the island, mountains swallowed by their own tree line, labels invisible on bright grass.

`prompts.txt` is the running log of feature requests; `plan*.md` are per-round plans. Both keep the game's former name, *Unicorn Overlord*, on purpose — they record what was asked at the time, not living documentation. `README.md` is player-facing but currently lags the code: it still describes the event log, the Turn back button and the battle roster, all removed.
