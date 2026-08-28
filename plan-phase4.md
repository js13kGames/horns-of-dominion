# Unicorn Overlord — feedback round 4: control, climax, challenge

## Context

The game is complete and balanced (`/Users/slashie/git/unicornHospital`, 9,481 B zipped of 13,312, p50 3,820 ticks, zero stalemates in 1,200 games). Three problems are left, and they are about the experience rather than the machinery: clicking a city while a warband is selected marches it by accident, so inspecting the map fights you; winning at 70% of the map ends the game while it still feels unfinished; and the AI is too soft.

Settled with the user: victory becomes **holding all 20 cities**; difficulty scales **AI economy, reflexes and army ceiling** with the player untouched; **four rungs, starting on the third**.

Budget: ~960 B of the 3,831 B headroom, landing near 10.4 KB.

---

## 1. Orders come from buttons, not from clicking the map

The root of the problem is that a map click means two different things depending on what is selected. Fix it by making it mean exactly one thing: **clicking the map always selects, never orders.**

Marching moves into an explicit targeting mode. `S.aim` holds the id of the warband awaiting a destination:

- The warband panel gains **🎯 Mobilize**, which sets `S.aim`.
- While aiming, the panel swaps it for **✖ Cancel** and a "choose a destination" line, and `src/render.js` rings every city faintly so it is obvious the whole map is a valid target.
- Clicking a city while aiming calls the existing `order()` in `src/sim.js` and clears `S.aim`. Clicking empty ground cancels. `Escape` cancels aiming first, and only clears the selection on a second press.
- `S.aim` also clears when the host dies, the selection changes, or the game ends or restarts.

The node-behind-click for retreating goes away with everything else, so it is replaced by a proper **↩ Turn back** button, shown only while marching and labelled with the flee cost when the host is engaged. That is strictly more discoverable than the click it replaces — nothing currently tells you that trick exists.

`order()` itself is untouched; only the routing in `src/main.js` and the panel in `src/ui.js` change. This keeps `cmd-test.mjs` and `road-test.mjs` valid as-is.

## 2. Victory by total conquest

`WIN` in `src/state.js` goes from 14 to all 20. The HUD's progress bar and its "conquer N to rule" line follow it; the defeat condition (no cities, no hosts) is already total and stays.

**This is the item with real pacing risk.** A realm cornered behind one heavily walled capital is precisely the shape that produced the stalemates of round two, and the mop-up phase is new ground the harness has never measured. The plan is to change the constant, re-run 400 games across three seed ranges, and read the tail — p99, the max, and the stalemate count — rather than assume.

If the tail does reappear, the remedy is already thematically set up by the existing `escal` mechanism: a realm reduced to a last holding or two should not be able to hold its walls at full strength. A morale-collapse term that decays `c.m` for a faction below a small share of the map converts a doomed siege into a closing one. I would rather add that than weaken sieges globally, because it only touches the endgame.

## 3. Four difficulty rungs

Give each faction a multiplier bundle, `f.dm`, assigned at game start — the neutral rung for the player, the chosen rung for every AI. Storing it **per faction** rather than reading a global costs nothing and makes the ladder directly measurable: the harness can pit one rung against another in the same game.

Three knobs, per the user's choice:

| knob | effect |
|---|---|
| `inc` | multiplier on AI gold income in `tick()` step 1 |
| `acts` | decisions the faction takes on its turn in `src/ai.js` — below 1 means it acts only every other cycle |
| `cap` | multiplier on the AI standing-army ceiling (`T.aiCap`) |

`acts` is the interesting one and replaces any per-faction turn cadence: the round-robin slot rotation stays exactly as it is (it was fixed last round to stop the same realm always acting last), and a tougher realm simply makes more decisions when its turn comes. That means restructuring `ai()`'s body — which currently `return`s after issuing one march order — into a `step(f)` called `acts` times.

Rungs start at roughly `inc/acts/cap` of 0.75/0.5/0.8, 1/1/1, 1.4/2/1.3, 2/3/1.7, with the middle rung being today's AI. **These are starting guesses, not the answer** — the numbers come out of the measurement below.

Selection lives on the title screen as a row above the realm cards; picking a realm still starts the game. The end screen names the rung played.

## 4. A less flat ending

Total conquest addresses the "it ended too early" half. The other half is that the end screen says almost nothing. Track a few counters in `S.stat` — cities taken, cities lost, enemy hosts destroyed, largest host fielded — incremented where those events already happen in `src/sim.js` (the capture branch, the `shattered` helper, `mustered`). The end screen then reports the campaign rather than just the result: banner, rung, duration, and those four numbers.

---

## Verification

**New `diff-test.mjs`** — the ladder has to be shown to be a ladder. Run games with one faction on rung X and the other four on rung 1, 200 games per rung, and report the odd faction's win rate. A working ladder is monotonic and well spread; if rung 3 wins 25% of games it is not hard, it is differently flavoured, and the numbers get retuned until it is.

**`sim-test.mjs`** — re-run at 400 games across three seed ranges after the `WIN` change specifically, watching p50/p90/p99, max and stalemates against the current baseline (p50 3,820, p99 9,149, max 11,473, 0 stalemates). Then again at each rung, since a stronger AI changes pacing too.

**`dom-test.mjs`** — the existing "clicking a neighbour issues a march order" and "clicking the node behind turns it around" assertions now describe behaviour that is deliberately gone; they get rewritten to drive Mobilize and Turn back. Add the assertion that matters most: with a warband selected and not aiming, **clicking a city selects that city and does not move the host** — that is the actual bug being fixed. Plus Cancel, Escape's two-stage behaviour, the difficulty buttons, and the end-screen summary.

**`cmd-test.mjs`, `road-test.mjs`** — must pass untouched, since `order()` and the combat model are not changing.

**`npm run build`** — the hard 13,312 B gate.

**By hand in the browser** — whether Mobilize feels like one click too many in practice, whether the mop-up phase drags, and whether the default rung is actually a fight.

## Order of work

1. Mobilize / Turn back / click-to-select — pure input and UI, no balance effect.
2. `WIN` to 20, then measure immediately; add the morale-collapse forcing function only if the tail demands it.
3. Difficulty bundles and the `ai()` restructure; build `diff-test.mjs` and tune the rungs against it.
4. Campaign counters and the end screen.
5. Full re-validation, then hand-play.
