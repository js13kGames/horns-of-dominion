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

console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
