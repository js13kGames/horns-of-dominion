# Unicorn Overlord — 13KB Rainbow Kingdom strategy game

## Context

`/Users/slashie/git/unicornHospital` is empty. We are building a from-scratch browser strategy game: you are a unicorn overlord conquering the Rainbow Kingdom, in a Crusader-Kings-inspired real-time-with-pause model. Twenty cities form a node graph; you raise armies from city population using currency earned from economic value, march them along edges, fight enemy armies in the field, then grind down standing defenses to take cities. Rival AI factions do the same. First faction to hold 70% of the map (14/20 cities) wins.

The hard constraint is **13312 bytes zipped** (js13kgames rules), with **no assets** — everything drawn from flat geometry and emoji. That constraint drives every decision below: one HTML file, canvas rendering, procedural map, no framework, no fonts, no images, no audio files.

Decisions already settled with the user: real-time with pause, js13k build toolchain, Canvas 2D, procedurally generated map.

## Architecture

Source is readable ES modules bundled by esbuild into one inlined `index.html`. Golfing happens at the end (Milestone 7), not while writing.

```
index.html        shell: <canvas>, HUD overlay divs, inline CSS  (template for build)
src/main.js       boot, rAF loop, speed/pause, input routing
src/map.js        procedural 20-node graph + stat/realm assignment
src/sim.js        tick: income, movement, field battle, siege, capture, victory
src/ai.js         per-faction AI controller
src/render.js     canvas draw: edges, cities, armies, effects
src/ui.js         HUD, city/army panel, event log, title + end screens
build.mjs         esbuild → inline → minify html → zip → size gate
package.json      scripts: dev, build, size
```

Bundle target: single IIFE, `format:'iife'`, no polyfills, `--target=es2020`.

### State shape

Flat arrays of plain objects, single-letter fields (minifier can't rename properties, so short names are written by hand from the start).

```js
C[]  cities  { x, y, o, p, d, e, s, m, n[] }
     // owner, pop, defenseValue, econValue, standingDef, maxDef, neighbour indices
A[]  armies  { o, w, a, t, pr }
     // owner, warriors, atNode, targetNode(-1 idle), progress 0..1
F[]  factions{ g, c, em, nm, ai }
     // gold, color, emoji, name, isAI
G    globals { sel, speed, tick, over, log[] }
```

Rendering derives everything from this; there is no separate view state beyond `sel` and camera-less fixed 1000×700 world scaled to the canvas.

### Map generation (`map.js`)

1. Seeded PRNG (mulberry32) so a run is reproducible from a seed shown in the corner.
2. Scatter 20 points in the play rect via rejection sampling with a minimum separation, then 2 passes of Lloyd-ish relaxation for even spread.
3. Build edges: connect each node to its 2–3 nearest neighbours, **rejecting any edge that crosses an existing one** (segment-intersection test) so the graph stays planar and readable.
4. Guarantee connectivity: union-find over the edges; join disjoint components by their closest pair.
5. Stats per city: `p` 40–200, `d` 2–10, `e` 3–12, `m` 20–80, `s = m`.
6. Realms: pick 5 seed cities that are mutually distant, flood-fill the remaining 15 to the nearest seed → 4 cities per realm, ±1. Each realm gets a color, emoji and name.

### Simulation (`sim.js`)

One `tick()` = 500 ms of game time at 1×. Speeds: paused / 1× / 2× / 4× (space toggles pause, 1-2-3 set speed). `main.js` accumulates real dt and calls `tick()` zero-or-more times per frame; rendering interpolates army `pr` between ticks so movement stays smooth at every speed.

Tick order — deliberately fixed, everything else depends on it:

1. **Income & growth** — per faction `g += 0.05 * Σ econ(owned)`. Each city regrows pop toward a soft cap.
2. **Movement** — `pr += speed/edgeLength`; on arrival set `a = t`, `t = -1`.
3. **Field battle** — for each node with armies of >1 faction: simultaneous attrition, each side losing `0.06 × enemyWarriors × rand(0.8,1.2)`. Armies at 0 are removed. AI armies retreat to an adjacent friendly node below ~35% of engagement strength.
4. **Siege** — node with exactly one faction present and a different owner: attacker loses `0.15 × city.d` warriors per tick, `city.s -= warriors/12`. At `s <= 0` the city flips: new owner, pop takes a hit, `s` resets to a small garrison value.
5. **Passive repair** — owned, unbesieged cities trickle `s` back up very slowly (paid repair is much faster).
6. **Victory check** — any faction at ≥14 cities wins; player with 0 cities and 0 armies loses.

Player actions (all cost gold, all validated in sim):
- **Raise army** at an owned city: costs gold + population, spawns/merges an army of unicorn warriors. Requires the city to be above a pop floor.
- **Repair defenses**: gold per point of `s`, capped at `m`.
- **Move army**: select army, click an adjacent node. Order is immediate; there is no queue.

These are numbers, not laws — a `T` tunables object at the top of `sim.js` holds every constant so balancing is one edit, and it costs nothing after minification.

### AI (`ai.js`)

Runs one faction per tick, round-robin, so cost stays flat regardless of faction count. Rule-based, in priority order:

1. If a frontier city is under siege and a nearby army is idle → send it to defend.
2. If gold > raise-cost × 1.5 and a safe interior city has pop → raise an army there.
3. For each idle army: score adjacent nodes as `value(econ + pop) − risk(defense + enemy armies)`, move to the best positive-scoring one; prefer weakly-held neutral/enemy cities and merging with a friendly stack when badly outnumbered.
4. Spare gold → repair the most-threatened owned city.

Deliberately not clever: it should feel like pressure and make mistakes, and it must stay under a few hundred bytes.

### Rendering (`render.js`)

Dark near-black background. Edges are thin translucent lines. Each city is a filled circle in its owner's color, ringed by an arc showing `s/m`, with a 🏰-family emoji sized by population and a small number label. Armies draw as a colored disc with 🦄 and warrior count, positioned by lerping along their edge. Combat pulses a ⚔️ and a shrinking ring at the node; capture flashes the new owner color outward. Selected army/city gets a dashed halo; valid move targets get a soft glow.

Everything is a single `draw(t)` pass over `C` then `A` then effects — no layers, no offscreen buffers.

### UI (`ui.js`)

HTML overlay, not canvas, so text stays crisp and clickable for near-zero bytes.

- **Title**: 🌈 name, five realm cards (emoji, color, name), Start.
- **HUD strip**: 💎 gold, 🏰 cities `n/20` with a progress bar to 14, speed buttons, pause state.
- **Side panel** on selection: city stats (👥 pop, 🛡️ def/max, ⚔️ defense value, 💎 econ) with Raise Army / Repair buttons showing live costs and disabled states; or army stats with a "click a neighbour to march" hint.
- **Log**: last 4 events, one line each ("⚔️ Prismhold falls to 🟣 Violet Reach").
- **End screen**: win/lose, cities held, elapsed time, Restart (new seed).

## Build & size gate (`build.mjs`)

```
esbuild bundle+minify src/main.js
  → inline JS + CSS into index.html template
  → collapse html whitespace
  → zip -9 (then `advzip -z -4` / `ect -9 -zip` if on PATH)
  → print bytes and remaining headroom; exit 1 if > 13312
```

`npm run dev` runs esbuild in watch mode with a static server. Every build prints the real zipped number, so the budget is visible from day one instead of a surprise at the end.

Rough expectation: ~35–40 KB of minified JS compresses into 13 KB, which is comfortable for this scope. If we do overrun, the escape hatches in order are: shrink the string tables (realm/city names → generated from syllable fragments), drop per-realm traits, then add Roadroller as a final packer stage.

## Milestones

| # | Deliverable | Done when |
|---|---|---|
| 0 | Repo, `package.json`, `build.mjs`, empty canvas | `npm run build` prints a zipped byte count |
| 1 | `map.js` + `render.js` | 20 cities and planar edges draw, colored by realm, reseeds on reload |
| 2 | Selection, economy, Raise Army, Repair | Clicking a city opens the panel; gold accrues; buttons work |
| 3 | rAF loop, pause, speed, army movement | Armies march between nodes smoothly at 1×/2×/4× and freeze on pause |
| 4 | Field battle, siege, capture | An army can take a neutral city and lose to a defended one |
| 5 | `ai.js` | Left alone, AI factions expand and eventually beat the player |
| 6 | Title screen, HUD, log, win/lose | A full game is playable start to finish |
| 7 | Balance pass + size squeeze | Under 13312 bytes zipped, a 10-minute game feels tense |

## Verification

- `npm run build` — hard gate on 13312 bytes; run it after every milestone, not just at the end.
- `npm run dev`, then a manual playtest checklist per milestone: raise an army, march it two nodes, watch a siege resolve, get counter-attacked, win and lose at least once.
- Determinism check: same seed in the URL hash reproduces the same map, which makes balance comparisons meaningful.
- Cross-check in Safari and Chrome — emoji metrics differ between platforms, so city/army labels need testing in both rather than eyeballing one.
- No test framework: at 13 KB the harness would cost more than it's worth, and the game is verified by playing it.

## Open items, deliberately deferred

- Per-realm traits (cheaper armies / stronger walls / faster income) — flavor, added in Milestone 6 only if bytes allow.
- Sound — WebAudio blips are cheap in bytes but easy to make annoying; decide after Milestone 6.
- Diplomacy / alliances — out of scope for this build.
