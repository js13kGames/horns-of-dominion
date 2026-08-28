# Unicorn Overlord — feedback round 5: fog of war

## Context

The game is feature-complete and balanced (`/Users/slashie/git/unicornHospital`, 10,104 B zipped of 13,312, p50 3,610 ticks, zero stalemates in 1,200 games). This round is about what the player is allowed to *see*: right now the whole map is legible at a glance, which removes any reason to scout. Plus three smaller corrections — Mobilize costing a click too many, no indication of which realm you are, and progress rings showing on cities that are not yours.

Settled with the user: fog hides the **intel as well as the colour**; reveals are **live, not remembered** — the fog closes behind a host as it moves on; and **geography is never hidden** — every city and road is always drawn, just greyed when fogged.

Budget: ~450 B of the 3,208 B headroom.

**Already applied before planning began** (small, self-contained, verified by grep):
- `src/main.js` — selecting one of your own warbands sets `S.aim` immediately, so Mobilize no longer needs a second click.
- `src/ui.js` — the HUD now opens with your banner emoji and realm name in its own colour, top-left.

---

## Fog of war — derived, never stored

The key decision the user's answer unlocks: because reveals last only while a host is present, **fog needs no persistent state at all**. No `seen` flags, no discovered-road set, nothing to reset in `genMap` and nothing to keep in sync. It is a pure function of the current board, recomputed as it is read.

That has a valuable consequence for verification: the simulation is not touched, so `sim-test.mjs` and `diff-test.mjs` must return *numerically identical* results. Any drift means fog leaked into the sim.

Three helpers in `src/sim.js`, beside the existing `getArmy` / `prog` accessors:

```js
const myAt = i => S.A.some(a => a.o === S.me && a.t < 0 && a.a === i)

seeCity(i)    // mine, or neighbouring one of mine, or one of my hosts stands there
seeRoad(i,j)  // either end is mine, or one of my hosts is marching it,
              // or one of my hosts stands at either end
seeArmy(a)    // always mine; otherwise the road it marches or the node it holds must be seen
```

`seeRoad`'s "host at either end" clause is what the user pointed out: once a host commits and arrives at an enemy city, rule 3 keeps that city *and its connected roads* lit, so an assault does not go dark at the moment it lands.

### What changes where

**`src/render.js`** — geography always draws; only its treatment changes.
- Roads: lit ones brighten from the current `#26213c`, fogged ones drop to a very dim grey. Both stay visible, so the map's shape is never lost.
- Cities: a fogged city takes a neutral grey instead of its owner's colour, and loses its wall ring and its populace/walls readout — those are intel, not geography. Its name stays.
- A fogged city also draws the plain 🏰, never 👑: capital status is intel too, and the crown would leak it.
- Enemy warbands are skipped entirely unless `seeArmy` passes. Your own always draw.
- The muster ⏳ and its progress ring render only for `c.o === S.me` — the round's fourth item, and it falls out here naturally since it is the same "whose work is this" question.

**`src/ui.js`** — the city panel reports `🌫️ unknown` / `???` for ruler, populace, walls, defence and economy on a fogged city. This is the half of the user's "hide the intel too" answer that actually gives scouting a purpose.

**`src/main.js`** — the click hit-test skips enemy warbands that fail `seeArmy`, so you cannot select what you cannot see.

The AI continues to play with full information. For a game this size that is the right trade, but it is worth saying plainly rather than implying the fog is mutual.

---

## Verification

**`sim-test.mjs` and `diff-test.mjs` must be unchanged, to the digit** — the strongest available proof that fog stayed out of the simulation. Current baselines: p50 3,620 / p90 5,635 / p99 10,557 at base 1000 rung 2, and a ladder of 0.0 / 19.0 / 47.0 / 66.0.

**`dom-test.mjs`** gains fog assertions, which need care: the stub player starts owning four cities, so the test must find a genuinely distant city to assert *is* fogged, and a neighbour of an owned city to assert *is not*. Worth covering:
- a city two or more hops from anything I own reports unknown intel in its panel
- a city adjacent to one of mine reports its real owner
- planting one of my hosts on a distant enemy city lights it, and removing the host re-fogs it — the live-reveal behaviour the user specifically chose
- an enemy warband on a fogged road cannot be clicked
- clicking my own warband arms targeting with no second click (item 1)
- the HUD carries my realm name (item 2)
- a mustering enemy city shows no progress ring (item 4)

**`cmd-test.mjs`, `road-test.mjs`** — must pass untouched.

**`npm run build`** — the 13,312 B gate.

**By hand in the browser** — whether a greyed map still reads clearly, and, more importantly, whether auto-arming Mobilize brings back the accidental-move problem that started round four. It is a one-line revert if it does; the difference from before is that targeting is now visible and cancellable rather than silent.

## Order of work

1. The three `see*` helpers in `src/sim.js`.
2. Render: greying, hidden enemy hosts, muster ring restricted to my cities.
3. Panel intel masking and the hit-test guard.
4. Re-run `sim-test` and `diff-test` and confirm the numbers are identical, then extend `dom-test`.
5. Build, then hand-play.
