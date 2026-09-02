# Round 15 — three unit kinds

## Context

Every warband in the game is identical: `mustered()` produces `T.raiseW` warriors, `T.speed`
moves them, `T.atk` decides what they do in a fight, and `a.w` is the only thing that
distinguishes one host from another. There is no reason to field two warbands rather than one
big one, and no decision at the moment of raising beyond *whether*.

This round adds two specialist kinds alongside the existing warband:

| | glyph | field power | wall power | march speed | gold | pop |
|---|---|---|---|---|---|---|
| rider (base) | 🦄 | 1.0 | 1.0 | 1.0 | 25 | 40 |
| pegasus | 🕊 | 0.6 | 0.2 | 1.9 | 35 | 30 |
| dragon | 🐉 | 2.2 | 2.5 | 0.55 | 60 | 55 |

Every warband musters the same `T.raiseW` bodies; only price, speed and combat weight differ, so
`split()`, the split slider and the strength number under a host are untouched. The number keeps
counting **bodies** — the glyph says what they are.

**Every city can raise riders.** Ten cities can *also* raise one specialist, fixed at map
generation: each realm's capital plus one other of its drafted cities, with the kind decided by
the realm. Like `na`, it is a property of the place and survives conquest — taking an enemy
capital is how you acquire their unit.

The whole feature has to fit in **1,209 B zipped** of headroom (12,103 / 13,312). Estimated cost
is ~1,250 raw bytes → **400–600 B zipped**, leaving 600 B of margin.

## The one invariant that proves non-interference

Rider stats are all `1.0` and its costs are today's `T.raiseG`/`T.raiseP`. So **with no
specialist cities on the map, every existing number must come out numerically identical** —
`sim-test.mjs` p50/p90/p99/max, `diff-test.mjs`, and every assertion in the four fast harnesses.

This is the same style of proof CLAUDE.md relies on for fog of war, and it is the strongest
available evidence that the weighting was threaded correctly. Verify it explicitly by stubbing
the realm→specialist table to all-zero and re-running seed 1000, *before* tuning anything.

## Design

### `src/state.js` — the stat table

Add to `T` (CLAUDE.md: "every tunable lives there, nowhere else"), as an **array of arrays**, not
objects. esbuild does not mangle property names, so named keys would ship at every read site;
positional indices cost one character. This is the `REALMS` idiom (`map.js:6-12`), not the `D`
idiom.

    // kind: [field power, wall power, march speed, gold, pop, glyph]
    K: [[1, 1, 1, 25, 40, '🦄'], [.6, .2, 1.9, 35, 30, '🕊'], [2.2, 2.5, .55, 60, 55, '🐉']],
    sp: [2, 1, 2, 1, 1],   // which specialist each realm breeds

`T.raiseG`/`T.raiseP` stay — the AI's gold gates (`ai.js:29`, `ai.js:71`) read them, and rider
cost is the sensible baseline for both.

### `src/map.js` — specialist cities

After the `c.na = c.o` pass at `map.js:159`, flag each realm's capital plus one other drafted
city with `c.sp = T.sp[c.o]`; everything else gets `c.sp = 0`. Fold it into the existing
`c.mu = c.rp = c.oc = 0` initialisation at `map.js:106` to avoid a second pass.

### `src/sim.js` — the weighting

One exported helper, used everywhere strength is summed:

    export const pw = a => a.w * T.K[a.k][0]

Sites to change (from the code map):

- `melee()` `sim.js:158` — `T.atk * pw(a) * rf(0.8, 1.2)`
- `odds()` `sim.js:118` — `pow[a.o] += pw(a)`
- movement `sim.js:214` and `prog()` `sim.js:23` — `T.speed * T.K[a.k][2]`. **Both, identically**,
  or the renderer's interpolation drifts from the sim.
- siege `sim.js:289-294` — keep `force` (raw `w`) for the pro-rata loss split, add a second sum
  `wf = Σ a.w * T.K[a.k][1]` for `c.s -= wf * T.sgDmg * (…)`
- merge `sim.js:255` — add `|| here[u].k !== here[v].k` to the skip condition
- `mustered()` `sim.js:95-97` — find `a.o === c.o && a.k === c.mk && !a.hold`; new host gets
  `k: c.mk`
- `canRaise(i, f, k)` / `raise(i, f, k)` `sim.js:79-91` — gate on `k === 0 || k === c.sp`, charge
  `T.K[k][3]`/`T.K[k][4]`, record `c.mk = k`
- `split()` `sim.js:131` — child inherits `k: a.k`

**`garrison()` at `sim.js:63` stays raw `w`.** Pacification is bodies per head of populace; leaving
it unweighted keeps round 14's balance and the `boil()` assertions in `cmd-test` §8 intact. Say so
in a comment, or someone will "fix" it.

### `src/ai.js` — minimal changes, because this is the risky file

CLAUDE.md: *"AI movement is the highest-risk code in the repo… Change `ai.js` only with a full
balance re-run."* Four expressions and one new line, nothing structural:

- `force`/`friend` `ai.js:4-5` — `pw(a)`
- army cap `ai.js:26` — weighted, so `T.aiCap` keeps meaning *military strength* per city rather
  than bodies. Raw would let a faction field 55 dragon-bodies per city at 2.2× power and break the
  difficulty ladder.
- relief `ai.js:42` — `pw(a) > force(hit, f) * 0.8`
- viability `ai.js:59` — `pw(a) * bold < e * 1.3 + 1.6 * Math.sqrt(…) / T.K[a.k][1]`, so the wall
  term scales with the kind's wall power
- raise choice `ai.js:31-34` — one binary: take the city's specialist if it offers one and the
  faction can afford it, else riders. Deliberately dumb. If the ladder moves, tune `T.K`, not this.

### `src/render.js` and `src/main.js` — drawing and clicking

- glyph `render.js:166` — `label(T.K[a.k][5], p.x, p.y + 1, 13)`. One literal swap; the `seeArmy`
  gate at `render.js:161` already covers it, so no new fog code.
- **fan by kind** — `spot()` at `render.js:30-41` currently fans resting hosts by *owner only*
  (`a.o * 1.2566 - 1.9`), so two same-faction hosts at a node overlap exactly. That is a latent bug
  today, unreachable only because they always merge; kinds that refuse to merge make it routine.
  Add a kind term, ~0.5 rad, giving ~21px separation at `cityR + 15`.
- **city badge** — draw `T.K[c.sp][5]` at a free city corner, gated on `lit` like ⏳ and ✊
  (`render.js:140`, `:142`), which occupy the two upper corners. Without this the feature is
  invisible until you click every city. Position needs checking with `shot.mjs` — the stat line at
  `c.y + r + 28` is close.
- **hit test** `main.js:52-56` — takes the first host within 15px and breaks. Three fanned discs
  cannot all be 15px-separable in the space available, so collect every host in range and pick the
  one *after* the current selection, cycling. Keep `main.js:64`'s `hc >= 0 ? hc : …` exactly as it
  is — CLAUDE.md flags that a city must win the hit test over a host standing on it, and there is
  a test for it.

### `src/ui.js` — one extra button

The city panel gains a second Raise button when `c.sp`, on a new action letter (`data-a=g`) —
one `else if` in the existing delegated listener at `ui.js:100-113`, no new element, no new CSS
(bare `button` and `:disabled` already style it).

The specialist button carries only glyph and cost; the existing button keeps the four-state
ladder (Cowed / Restless / Mustering / Raise). Duplicating that ladder would cost more than the
information is worth, and `#pan` is only 212px wide.

## Tests

Every harness builds armies as bare literals, never through `sim.js`, so all of them need `k: 0`
added: `cmd-test.mjs:9` (`put`), `road-test.mjs:14` (`put`), `dom-test.mjs:247` (`host`) plus the
inline literals at `dom-test.mjs:180`, `:199-202`, `:231`, `:239`, `:262`, `:267`, `:273`, `:282`.

New coverage, in the repo's style — assertions that fail loudly if the mechanic disappears:

- a pegasus crosses a road in fewer ticks than a rider; a dragon in more
- equal-count dragons beat riders in a field melee, and the margin tracks `T.K[2][0]`
- dragons breach a wall faster than riders, riders faster than pegasi
- two kinds on one node do **not** merge, and both survive the tick
- a completed muster joins only a host of its own kind, and creates a new one otherwise
- `canRaise(i, f, 2)` is false where `c.sp !== 2`, true where it is
- the panel shows the specialist button only where `c.sp`, and clicking it raises that kind
- `dist-test.mjs` — assert 🕊 and 🐉 survive the packed build, alongside the existing 💎 check
- `bias.mjs` — add a specialist-city column, to confirm parity across realm slots

Mutation-check the new assertions the way round 14 did: break each mechanic in turn and confirm
something fails.

## Verification

Run each separately and check `$?` — CLAUDE.md warns that chaining with `&&` has masked a
non-zero exit here.

1. **The identity invariant first.** Stub `T.sp` to all-zero, run `node sim-test.mjs 1000 2 400`,
   and confirm p50/p90/p99/max match round 14 exactly (4163 / 6455 / 12410 / 16145). If they
   don't, the weighting is threaded wrong — fix that before tuning.
2. `node cmd-test.mjs`, `node road-test.mjs`, `node dom-test.mjs`, `node geo.mjs`.
3. `npm run build`, then `node dist-test.mjs`. A stale `dist/` fails this for no reason, and
   `dist/` is stale right now from the dev server.
4. `npm run size` — must be under 13,312 with margin, target ≤ 12,700. Never chase a saving under
   ±20 B; the build is not byte-deterministic.
5. **Visual check with `shot.mjs`.** There is no browser. Inject three hosts of different kinds at
   one node (the `dom-test.mjs:180` pattern; `shot.mjs` imports `S` and can mutate it before the
   final `step(1)`), render, and rasterise with `qlmanage -t`. Confirm the three glyphs are
   distinct, the fan does not overlap, and the city badge does not collide with the stat line.
   Rendering blind has repeatedly shipped mistakes here that were obvious once looked at.
6. **Full balance re-run**, mandatory because `ai.js` changed: `node sim-test.mjs` at 1000, 5000
   and 9000 × 400 games, plus `node diff-test.mjs`. Round 14 baselines:

   | seed | p50 | p90 | p99 | max |
   |---|---|---|---|---|
   | 1000 | 4163 | 6455 | 12410 | 16145 |
   | 5000 | 4176 | 6408 | 10792 | 18042 |
   | 9000 | 3917 | 6079 | 8764 | 13963 |

   Zero stalemates and zero games over 24k ticks in all three. Ladder 0 / 20.5 / 42 / 61 %.

## Two risks worth stating up front

**`sim-test` will undervalue pegasi.** `ai.js` never considers march time — its targeting is
hop-adjacency (`S.C[a.a].n`) and `T.speed` is not referenced in the file at all. A pegasus's 1.9×
speed is therefore worth almost nothing to the AI and a lot to a human redeploying between fronts.
Any dragon-realm win-share edge in the all-AI harness is partly an artifact, so do not tune the
pegasus into uselessness chasing an even win distribution.

**Realm bias.** Five realms map onto two specialists, so two realms breed dragons and three breed
pegasi — unit access now correlates with realm identity, which is close to the "per-realm traits"
idea `prompts.txt:23` records as deliberately left out. `bias.mjs` shows realm 4 already starts
slightly ahead on cities and economy, and round 14's win spread was 67–93 per seed range. If the
new spread exceeds that beyond noise, the one-line fallback is to give **every** realm both — the
capital breeds dragons, the second city pegasi — which zeroes the bias by construction at the cost
of the per-realm flavour.
