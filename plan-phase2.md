# Unicorn Overlord — playtest feedback round

## Context

The game is built and playable (`/Users/slashie/git/unicornHospital`, 7,255 B zipped of 13,312). Playtesting surfaced four items. Three are about how the game *feels* moment to moment — it runs too fast, armies teleport between ticks, and two hosts can march straight past each other on the same road without fighting. The fourth, an onboarding scenario, the user has explicitly asked to hold until the rest is fixed.

Decisions settled with the user: the 10% slowdown applies to the **whole simulation** (balance ratios preserved), and the speed ladder grows to **1× 2× 4× 8×**.

Everything here is comfortably inside the byte budget — an estimated +550 B zipped against 6,057 B of headroom.

---

## 1. Pace — one knob, balance untouched

`src/state.js` already funnels every balance number through the `T` table. Add a single `P = 0.1` factor applied at definition time, so there is no runtime cost and no `* T.pace` sprinkled through the sim:

```js
const P = 0.1                    // global pace: 1 = original speed
export const T = {
  inc: 0.05 * P, grow: 0.004 * P, speed: 26 * P,
  atk: 0.06 * P, sgLoss: 0.15 * P, sgDmg: P / 12, mend: 0.15 * P,
  bold: 4000 / P, escal: 5000 / P,
  ...unchanged quantities...
}
```

The split matters: **rates** scale with `P`, **quantities** do not. `raiseG`, `raiseP`, `raiseW`, `minPop`, `repair`, `repairStep`, `garrison`, `sack`, `rout`, `aiHoard`, `aiCap` are all quantities and stay put — an army still costs 25 gold, it just takes ten times as long to afford. `bold` and `escal` are tick-denominated thresholds, so they divide by `P` to stay at the same point in the *game's* arc rather than firing ten times too early.

Because every rate moves together, all the ratios the 400-game harness validated are preserved exactly; only the tick count stretches ~10×.

Speed ladder in `src/ui.js` gains an 8× gear, and `src/main.js` gains key `4` alongside `1` `2` `3`. `TICK` stays at 0.5 s — the tick is the simulation quantum, and smoothness is the renderer's job, not the tick rate's.

## 2. Smooth movement — fixed timestep, interpolated render

Right now `armyPos` in `src/render.js` reads `a.pr`, which only changes on a tick, so an army jumps one step every 500 ms. The user's instinct is right: this is the classic fixed-timestep-plus-interpolation split.

**Sub-tick interpolation.** `src/main.js` already tracks `acc`, the leftover time toward the next tick. Publish `S.alpha = acc / TICK` each frame, and have `armyPos` advance a marching army by `alpha` of one step:

```js
const step = T.speed / dist(S.C[a.a], S.C[a.t])
const pr = Math.min(1, a.pr + S.alpha * step)
```

Movement then reads as continuous at any speed setting, because `alpha` sweeps 0→1 between ticks regardless of how many ticks a second are running.

**Absorbing the discontinuities.** Interpolation alone does not cover arrival: an army reaching a node snaps from the edge to its fanned parking slot (`cityR + 15` away, by owner angle), and merging or re-slotting jumps too. Give each army a render position `a.rx, a.ry` that eases toward the logical position every frame with an exponential factor (`~1 - Math.pow(0.001, dt)`, framerate-independent), seeded to the logical position when the army is created so new warbands do not fly in from the origin.

**Hit-testing must follow.** `src/main.js` hit-tests clicks against `armyPos`. If drawing uses `rx, ry` and clicking uses the logical position, clicking a moving army feels broken. Hit-test against `a.rx, a.ry` — the same numbers the player sees.

The army panel's `${(a.pr * 100) | 0}%` in `src/ui.js` should read the interpolated progress too, so the readout does not visibly stutter.

## 3. Battles on the road

Today combat only happens at nodes (`sim.js` step 4), so two hosts can slide through each other mid-edge. Three changes, all in `src/sim.js`.

**A shared resolver.** Extract the attrition math into one `melee(group, garrison, gf)` used by both node and edge fights. Per the feedback, each army picks a **random** enemy army at the site and deals `T.atk * a.w * rf(0.8, 1.2)` to it; damage is accumulated into a map and applied simultaneously, so resolution order does not matter. A defending city's garrison adds `c.d * 0.5` against one randomly chosen attacker.

This is the same total attrition as the current model — an army dealing `T.atk × its own strength` sums, across a side, to exactly the `T.atk × side total` the code deals today. Only the *distribution* changes, from spread-proportionally to concentrated-randomly, which is what makes a multi-army brawl read as a brawl. Node fights inherit it for free, and since same-faction stacks already merge at nodes, node behaviour is unchanged in expectation.

**Engagement clusters.** Armies in transit on the same edge (the unordered `{a.a, a.t}` pair, so head-on counts) are projected to a scalar distance along that edge and grouped by single-linkage within `T.reach` (~18 world units). Any cluster holding more than one faction is a battle: `melee` it, drop a ⚔️ at the cluster's midpoint via the existing `boom`, and hold every member in place. This is what makes reinforcement work with no extra machinery — a third warband marching up the same road stops on contact and is inside the cluster on the next tick, whichever colour it is.

**Movement gating.** An army advances only if its *tentative* next position would not land within `T.reach` of another army on the same edge — checked against start-of-tick positions so simultaneous movement stays order-independent. Blocking on friendlies too is deliberate: it stops a warband tunnelling through its own melee. The check only blocks movement that *closes* on the nearest enemy, so retreating is always legal.

Same-faction armies deliberately **do not merge** on edges. Merging would collapse "pick randomly if there's more than one" into a per-colour pick, and it would destroy direction information when an advancing host meets a retreating one on the same road. They stay distinct and fan out perpendicular to the edge when drawn.

**Retreat, for both sides.** The existing AI rout check gets an edge case: reverse in place (`swap a and t`, `pr = 1 - pr`, reset `w0`). The player needs the same escape, or a road fight is a trap only the AI can leave — so `order()` gains one allowance: a selected army that is marching or engaged may be sent back to the node it came from, which the click handler already expresses naturally as "click the node behind it."

## 4. Onboarding scenario — deferred, by request

Not being built this round. Recording the intended shape so the code above does not paint it into a corner:

A hand-built 5-or-6-node line-and-branch map replacing `genMap`, one player city and one enemy capital several hops away, an enemy that only acts on scripted beats. A step list gates progress — *muster a warband → march it one node → take the neutral city → survive the counter-attack → take the capital* — with a prompt in the existing `#pan` panel and the map dimmed except the node the step concerns.

The one thing to preserve in this round's work: keep `genMap` the only source of the map, so a scripted scenario can swap in wholesale rather than fighting a generator. It already is.

---

## Re-validation

The harnesses are the reason the last round's three real bugs were caught, and all three of these changes can break them.

- **`sim-test.mjs`** — the 12,000-tick cap must scale to 120,000, since games now take ~10× more ticks. Re-run 400 games and confirm what held before still holds: zero stalemates, and a win distribution flat across the five factions. Runtime goes from ~3 s to ~30 s.
- **New stalemate check** — edge locking is a fresh deadlock risk. Assert that no army sits with `t >= 0` and unchanged `pr` for thousands of ticks while no enemy shares its edge.
- **New edge-battle test** — place two enemy armies head-on on one edge deterministically; assert both stop short, both lose warriors, and neither passes through. Add a third of one colour behind; assert it stops on contact and joins the cluster.
- **`dom-test.mjs`** — the run-to-conclusion loop needs `S.speed = 8` and more iterations, or it will time out before a winner emerges. The interpolation change also needs a click-a-moving-army assertion, since that is exactly what the `rx/ry` hit-test split could silently break.
- **`dist-test.mjs`** — unchanged, still the gate that the shipped minified file boots.
- **`npm run build`** — must stay under 13,312 B; expected to land near 7.8 KB.
- **By hand, in the browser** — the part no harness covers: whether marching now reads as smooth, whether 1× feels right or wants a nudge, and whether a three-way road fight is legible.

## Order of work

1. Pace knob + 8× gear — smallest change, and it makes everything after it easier to watch.
2. Interpolation + render easing + hit-test follow-through.
3. Shared `melee` resolver, swapped into node fights first and verified against the harness before edges exist.
4. Edge clusters, movement gating, retreat-in-place.
5. Re-run all three harnesses; hand-play at 1× and 8×.
6. Onboarding — a later round, on the user's say-so.
