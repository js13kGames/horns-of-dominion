// command-layer tests: flee, pathing, splitting, muster, battle roster. Not shipped.
import { S, T, dist } from './src/state.js'
import { genMap } from './src/map.js'
import { tick, order, split, raise, canRaise, hop, getArmy } from './src/sim.js'

let fail = 0
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail = 1 }
const fresh = (ai = 0) => { genMap(7); S.me = 0; S.F.forEach(f => { f.ai = ai }); S.A = [] }
const put = (id, o, w, a, t) => ({ id, o, w, a, t, pr: 0, st: 0, dst: -1, hold: 0 })
const longRoad = () => S.E.slice().sort((a, b) =>
  dist(S.C[b[0]], S.C[b[1]]) - dist(S.C[a[0]], S.C[a[1]]))[0]
const hopsAway = (from, n) => {          // a node exactly n hops from `from`
  const d = new Array(20).fill(-1); d[from] = 0
  const q = [from]
  for (let h = 0; h < q.length; h++) for (const v of S.C[q[h]].n) if (d[v] < 0) { d[v] = d[q[h]] + 1; q.push(v) }
  return d.findIndex(x => x === n)
}

// --- 1. breaking contact costs blood; walking an empty road does not -------
fresh()
let [i, j] = longRoad()
S.A = [put(901, 0, 100, i, j), put(902, 1, 100, j, i)]
for (let n = 0; n < 2000 && !S.A[0].st; n++) tick()
const before = S.A[0].w
ok(S.A[0].st, 'hosts are locked in a road melee')
order(S.A[0], i)
ok(Math.abs(S.A[0].w - before * (1 - T.flee)) < 0.01,
  `fleeing costs ${T.flee * 100}% (${before.toFixed(1)} -> ${S.A[0].w.toFixed(1)})`)
ok(S.A[0].a === j && S.A[0].t === i, 'and reverses the host')

fresh()
;[i, j] = longRoad()
S.A = [put(911, 0, 100, i, j)]
tick()
const w = S.A[0].w
order(S.A[0], i)
ok(S.A[0].w === w, 'turning back on an empty road is free')

// --- 2. the AI flees when outmatched, holds when winning -------------------
fresh(1)
;[i, j] = longRoad()
S.A = [put(921, 0, 20, i, j), put(922, 1, 400, j, i)]
let n = 0
for (; n < 2000 && S.A[0].a === i; n++) tick()
ok(S.A.length && S.A[0].a === j, 'an outmatched AI host breaks off and reverses')

fresh(1)
;[i, j] = longRoad()
S.A = [put(931, 0, 400, i, j), put(932, 1, 20, j, i)]
let reversed = 0
for (n = 0; n < 400; n++) {
  tick()
  const big = S.A.find(x => x.id === 931)
  if (big && big.t === i) reversed = 1          // it turned around = it fled
}
ok(!reversed, 'a winning AI host stands its ground instead of fleeing')
ok(S.A.find(x => x.id === 931).w > 300, 'and keeps most of its strength')

// --- 3. marching several nodes across the map ------------------------------
fresh()
const start = S.C.findIndex(c => c.o === 0)
const far = hopsAway(start, 3)
ok(far >= 0, 'found a city three hops away')
S.A = [put(941, 0, 400, start, -1)]
const host = S.A[0]
ok(order(host, far) && host.t >= 0 && host.t !== far, 'ordering a far city takes the first hop')
const legs = new Set()
for (n = 0; n < 4000 && host.a !== far; n++) { tick(); if (host.t >= 0) legs.add(host.t) }
ok(host.a === far, 'the host arrives at the far city after ' + n + ' ticks')
ok(legs.size >= 3, 'having marched three separate legs (' + legs.size + ')')
ok(host.dst === -1, 'and clears its destination on arrival')

// --- 4. re-routing mid-march finishes the current leg first ----------------
fresh()
S.A = [put(951, 0, 400, start, -1)]
const h2 = S.A[0]
order(h2, far)
const leg = h2.t
tick()
const other = hopsAway(start, 2)
order(h2, other)
ok(h2.t === leg, 'a re-route does not teleport the host off its current road')
ok(h2.dst === other, 'but the destination is updated')
for (n = 0; n < 4000 && h2.a !== other; n++) tick()
ok(h2.a === other, 're-routed host reaches the new destination')

// --- 5. splitting ----------------------------------------------------------
fresh()
S.A = [put(961, 0, 100, start, -1)]
ok(split(S.A[0], 30), 'a resting host can be split')
ok(S.A.length === 2 && S.A[0].w === 70 && S.A[1].w === 30, 'warriors are conserved 70/30')
for (n = 0; n < 50; n++) tick()
ok(S.A.length === 2, 'the halves stay apart while parked')
ok(!split(put(962, 0, 1, start, -1), 1), 'a single warrior cannot be split')
order(S.A[1], S.C[start].n[0])
ok(!S.A[1].hold, 'marching clears the hold')

// --- 6. mustering takes time and can be lost ------------------------------
fresh()
const town = S.C.findIndex(c => c.o === 0 && c.p >= T.minPop)
S.F[0].g = 999
const gold = S.F[0].g, pop = S.C[town].p
ok(raise(town, 0), 'raise is accepted')
ok(S.F[0].g < gold && S.C[town].p < pop, 'gold and populace are spent up front')
ok(!S.A.length && S.C[town].mu > 0, 'but no warband exists yet')
ok(!canRaise(town, 0), 'and the city cannot muster twice at once')
for (n = 0; n < T.muster - 1; n++) tick()
ok(!S.A.length, `still mustering after ${T.muster - 1} ticks`)
tick()
ok(S.A.length === 1 && S.A[0].w === T.raiseW, 'the warband appears on schedule')

fresh()
S.F[0].g = 999
raise(town, 0)
S.C[town].s = 0.5
S.A = [put(971, 1, 400, town, -1)]
for (n = 0; n < 200 && S.C[town].o === 0; n++) tick()
ok(S.C[town].o === 1, 'the city falls mid-muster')
ok(!S.C[town].mu, 'and the half-raised host is lost')

// --- 7. the roster the panel reads ----------------------------------------
fresh()
;[i, j] = longRoad()
S.A = [put(981, 0, 100, i, j), put(982, 1, 100, j, i)]
for (n = 0; n < 2000 && !S.A[0].st; n++) tick()
ok(S.A[0].eg && S.A[0].eg.length === 2, 'a road melee records both participants')
ok(S.A[0].eg.every(id => getArmy(id)), 'roster ids resolve to live hosts')
ok(S.A[0].sg === -1, 'a road melee has no city defender')

fresh()
const foe = S.C.findIndex(c => c.o !== 0)
S.A = [put(991, 0, 300, foe, -1)]
tick()
ok(S.A[0].sg === foe && S.A[0].eg.length === 1, 'a siege records the city as the defender')

// --- 8. civil unrest: the seize, the climb, the garrison, the revolt -------
fresh()
const mine = S.C.findIndex(c => c.o === 0)
ok(S.C[mine].u === 0, 'a city starts with no unrest')
ok(S.C[mine].na === S.C[mine].o, 'a city starts native to the realm that drafted it')

// taking a city that is not yours seizes it at T.seize, and a later captor
// never talks it down from something worse
fresh()
let k = S.C.findIndex(c => c.o !== 0)
S.C[k].s = 0.01; S.C[k].p = 200
S.A = [put(1001, 0, 300, k, -1)]
for (n = 0; n < 5 && S.C[k].o !== 0; n++) tick()
ok(S.C[k].o === 0, 'the city falls')
ok(S.C[k].u === T.seize, `and a foreign captor inherits ${T.seize}% unrest`)
S.C[k].u = 95; S.C[k].s = 0.01; S.tick = 1
const third = S.C[k].na === 3 ? 4 : 3
S.A = [put(1002, third, 300, k, -1)]
for (n = 0; n < 5 && S.C[k].o !== third; n++) tick()
ok(S.C[k].o === third, 'a third realm takes it in turn')
ok(S.C[k].u === 95, 'and a capture never talks unrest back down to the seize')

// left alone a conquered city boils; a garrison in proportion to the crowd
// puts it back down, and a token warrior split off a host does not
const boil = (w, pop, from = T.seize, ticks = 400) => {
  fresh()
  const c = S.C.findIndex(x => x.o !== 0)
  S.C[c].na = S.C[c].o; S.C[c].o = 0; S.C[c].p = pop; S.C[c].u = from
  S.A = w ? [put(1000, 0, w, c, -1)] : []
  for (let z = 0; z < ticks; z++) tick()
  return S.C[c].u
}
const alone = boil(0, 120), token = boil(1, 120), proper = boil(120 * T.hold, 120)
ok(alone > T.seize, `unheld, a conquered city stirs itself up (${alone | 0}%)`)
ok(token > T.seize, `a single warrior cannot hold a city of 120 down (${token | 0}%)`)
ok(proper < T.seize, `${120 * T.hold} warriors can (${proper | 0}%)`)
ok(boil(30, 400) > boil(30, 100), 'the same garrison does less in a bigger city')
ok(boil(200, 120, 5) === 0, 'and unrest never goes below nothing')

// and it only moves on the slow clock, not every tick
fresh()
k = S.C.findIndex(c => c.o !== 0)
S.C[k].na = S.C[k].o; S.C[k].o = 0; S.C[k].u = T.seize
S.A = []
S.tick = 0
for (n = 0; n < T.slow - 1; n++) tick()
ok(S.C[k].u === T.seize, `unrest sits still between checks, ${T.slow} ticks apart`)
tick()
ok(S.C[k].u > T.seize, 'and moves on the check itself')

// a city held by the realm it was drafted into carries no unrest at all
fresh()
k = S.C.findIndex(c => c.o === 0)
S.C[k].u = 90
S.A = []
for (n = 0; n <= T.slow; n++) tick()
ok(S.C[k].u === 0, 'a city at home has nothing to resent')

// the raise gate
fresh()
S.F[0].g = 999
const home = S.C.findIndex(c => c.o === 0)
ok(canRaise(home, 0), 'a settled city conscripts')
S.C[home].u = T.calm
ok(!canRaise(home, 0), `a city ${T.calm}% restless refuses`)
ok(!raise(home, 0), 'and the order is rejected outright')

// the revolt: past T.riot the city simply goes home, walls and all
fresh()
const held = S.C.findIndex(c => c.o !== 0)
const owner = S.C[held].o
S.C[held].o = 0                                  // I hold it, its people want out
S.C[held].u = T.riot + 5
S.C[held].p = 200; S.C[held].s = S.C[held].m; S.C[held].mu = 1e5
S.A = []
for (n = 0; n < 4000 && S.C[held].o === 0; n++) tick()
ok(S.C[held].o === owner, `a city past ${T.riot}% throws its occupier out`)
ok(!S.A.length, 'no mob is raised — the city simply changes hands')
ok(S.C[held].s === S.C[held].m, 'and its walls are never breached')
ok(!S.C[held].u && !S.C[held].mu, 'it settles, and the half-raised host scatters')

// a revolt needs a realm worth rallying to: a crumbling rump inspires nobody,
// or revolts would keep handing it cities and no conquest could ever finish
const rump = left => {
  fresh()
  const c = S.C.findIndex(x => x.o !== 0)
  const realm = S.C[c].o
  S.C[c].o = 0; S.C[c].u = 100                     // I hold one of its cities
  let n = 0
  S.C.forEach(x => { if (x.o === realm && ++n > left) x.o = 0 })
  S.A = []
  for (let z = 0; z < 1200; z++) tick()
  return S.C[c]
}
const gone = rump(0), rest = rump(T.dying), live = rump(T.dying + 1)
ok(gone.o === 0 && gone.u < 100, 'a city whose realm holds nothing settles instead')
ok(rest.o === 0 && rest.u < 100, `a realm down to ${T.dying} cities rallies nobody either`)
ok(live.o === live.na, `one still holding ${T.dying + 1} takes its city back`)

console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
