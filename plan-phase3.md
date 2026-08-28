# Unicorn Overlord — feedback round 3: command depth

## Context

The game plays end to end (`/Users/slashie/git/unicornHospital`, 8,130 B zipped of 13,312). What it lacks is *command*: you can only send a host one node at a time, an army is an indivisible lump, retreat is free, buildings appear instantly, and when a fight starts you cannot see who is in it. These five changes are all about giving the player — and the AI — real decisions to make.

Three of them touch the simulation's balance (flee cost, muster delay, multi-hop marching), so the 400-game pacing harness has to be re-run and re-read after each, not once at the end. That harness is what caught every real bug in the last two rounds.

Settled with the user: conflict rings show **only the selected battle**; splitting is allowed **only for a host resting at a city**; fleeing costs **25%** of the host; mustering takes **about one road crossing**.

Budget: ~1,300 B of the 5,182 B headroom, landing near 9.4 KB.

---

## 1. Fleeing costs blood — and the AI weighs it

`turn(a)` in `src/sim.js` currently reverses a host for free, and is used for two different things: the player redirecting a host that is merely marching, and a host breaking contact in a melee. Only the second should cost anything.

Add `T.flee = 0.25` and a `flee(a)` wrapper that takes the cut before calling `turn(a)`. Charge it wherever a host disengages while `a.st` is set — the road-cluster rout, the node-battle rout, and the player clicking the node behind an *engaged* host. Redirecting a host on an empty road stays free.

The AI's current rule — rout below `T.rout` (35%) of starting size — ignores the enemy entirely, so it flees fights it is winning and stands in fights it cannot win. Replace it with the odds at the site: flee when own strength at that site is below `T.odds` (0.7) × the enemy's. That is a genuinely better decision *and* it is what makes the flee cost meaningful, since a host now bails while it still has something worth saving. `T.rout` retires.

The panel hint for an engaged host must say what turning back will cost, or the player is being charged without warning.

## 2. March across the map, not one node at a time

Give each host `a.dst`, its final destination, and re-path on every arrival. The graph is 20 nodes, so a plain BFS over `S.C[].n` returning the first hop is more than enough — no need for weights.

`order(a, j)` in `src/sim.js` grows three cases:
- **j is where the host stands, and it is engaged** → flee (see above).
- **j is the node behind a marching host** → turn back, free if it is not fighting.
- **anything else** → set `a.dst = j` and, if the host is idle, take the first hop now. A host already marching keeps its current leg and re-paths when it lands, which is the right behaviour and needs no special case.

On arrival, `a.dst` either points onward (take the next hop) or equals the node reached (clear it). The AI keeps its deliberate one-neighbour-at-a-time scoring — `order()` handles its calls unchanged — so this is a player capability, not an AI rewrite.

`src/render.js` draws the remaining path for the selected host as a dotted polyline, which is the whole point of the feature being visible.

## 3. Splitting a warband

Offered in the army panel when the host is mine, idle at a node, and not fighting. `split(a, n)` peels `n` warriors into a new host beside it, conserving the total.

The catch is step 3 of `tick()`, which merges friendly stacks sharing a node — it would re-fuse the halves on the very next tick. Add `a.hold`, set on both halves and cleared when a host next starts moving; held hosts do not auto-merge. Two stacks you deliberately parked stay two stacks; anything that marches in later merges as before.

The slider needs care against the panel's HTML-diffing in `src/ui.js`: `set()` only rewrites when the generated string changes, so a `value=` baked into that string would rebuild the input mid-drag and break the drag. Keep the slider and its readout **out** of the diffed string entirely — render `<input type=range id=sl>` and an empty `<b id=slv>`, then write `.value` and the readout imperatively after each rebuild and on `input`. The string never changes while dragging, so nothing gets clobbered.

## 4. Seeing the battle you are in

Nothing currently survives a tick to say who fought whom. Have the resolvers record it: when `roads()` resolves a cluster, stamp every member with `a.eg` = the participant ids; the node battle does the same; a siege additionally stamps `a.sg` = the city index. Cleared each tick alongside `a.st`, so it is always this tick's truth.

`src/ui.js` then renders a second block beneath the army panel when the selected host has `eg`: participants grouped by faction — emoji, realm name, total warriors, your side first — or, when `sg` is set, the city as defender with its walls and defence value. `src/render.js` rings every participant of *that* battle in dotted red.

## 5. Mustering and rebuilding take time

Two new city fields: `c.mu`, ticks left mustering, and `c.rp`, wall points still owed.

`raise()` keeps validating and charging gold and population **up front**, then sets `c.mu = T.muster` (~60 ticks, about one road crossing) instead of spawning. The tick counts it down and spawns the warband at zero. One muster at a time per city, so `canRaise()` must also return false while `c.mu` is set — otherwise the AI will happily buy the same army ten times.

`fix()` charges up front and banks `T.repairStep` points into `c.rp`, drained at `T.fixRate` (⅓ point per tick, so ~3 ticks per point). Paid repair pauses while an enemy is at the gates — the points stay banked, they just do not apply. This is deliberate: last round the AI repairing under siege was exactly what ground the game to a halt, and it should not come back through a new door.

A city captured mid-muster loses it: `c.mu = 0`, gold and population gone. `src/render.js` shows an hourglass and progress on a mustering city; the panel's Raise button shows progress instead of a price while it runs.

---

## Verification

Every sim-affecting change gets its own pacing measurement, because two of the three previous rounds' worst bugs were balance regressions that only showed up in aggregate.

**New `cmd-test.mjs`**, deterministic placements, no AI — the same shape as the existing `road-test.mjs`:
- fleeing a melee arrives home with 75% of the host, and costs nothing when the road was empty
- an outmatched AI host disengages; a winning one does not
- a host ordered three hops away arrives, having actually passed through the intermediate nodes
- re-targeting mid-march finishes the current leg, then re-paths
- split conserves warriors, and the halves do not re-merge while parked
- `raise()` charges immediately, spawns after `T.muster`, and a capture mid-muster voids it
- `eg` is populated for a road melee and `sg` for a siege

**Existing harnesses:** `sim-test.mjs` re-run at 400 games after *each* of items 1, 2 and 5, watching p50/p90/p99, the stalemate count and the flatness of the win distribution — current baseline is p50 6,470 ticks, 1 stalemate in 400, 78/67/77/86/91. `road-test.mjs` must still pass unchanged. `dom-test.mjs` gains slider drag, a split, a multi-hop order, and a click on a host in battle to prove the roster panel renders. `dist-test.mjs` unchanged.

**`npm run build`** stays the hard gate at 13,312 B.

**By hand in the browser** — the parts no harness covers: whether the dotted path reads clearly across a busy map, whether the battle roster is legible under the army panel, and whether a 60-tick muster feels like planning or like waiting.

## Order of work

1. Flee cost + odds-based rout — pure sim, measure immediately.
2. Muster and repair timers — pure sim, measure immediately.
3. Multi-hop pathing + dotted path rendering — measure again.
4. Split, with the `hold` flag and the imperative slider.
5. Battle roster panel and dotted red rings.
6. Full re-validation, then hand-play.
