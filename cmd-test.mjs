// command-layer tests: flee, pathing, splitting, muster, battle roster. Not shipped.
import { S, T, dist } from './src/state.js'
import { genMap } from './src/map.js'
import { tick, order, split, raise, canRaise, hop, getArmy } from './src/sim.js'

let fail = 0
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail = 1 }
const fresh = (ai = 0) => { genMap(7); S.me = 0; S.F.forEach(f => { f.ai = ai }); S.A = [] }
const put = (id, o, w, a, t, k = 0) => ({ id, o, w, k, a, t, pr: 0, st: 0, dst: -1, hold: 0 })
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

// --- 9. three kinds of warband ---------------------------------------------
// the map hands out specialists by realm, at the capital and one other city
fresh()
ok(S.C.filter(c => c.sp).length === 10, 'ten of the twenty cities breed a specialist')
ok(S.C.filter(c => c.cap && c.sp).length === 5, 'every capital among them')
ok(S.C.every(c => !c.sp || c.sp === T.sp[c.na]), 'and each breeds what its own realm rides')
ok(new Set(S.C.filter(c => c.sp).map(c => c.na)).size === 5, 'two apiece, one realm each')

// speed: the table says 1.9x and 0.55x, and the road agrees
const crossing = k => {
  fresh()
  const [u, v] = longRoad()
  S.A = [put(1101, 0, 40, u, v, k)]
  let z = 0
  for (; z < 4000 && S.A[0].t >= 0; z++) tick()
  return z
}
const cR = crossing(0), cP = crossing(1), cD = crossing(2)
ok(cP < cR && cR < cD, `unicorns outpace footmen outpace behemoths (${cP}/${cR}/${cD} ticks)`)
ok(Math.abs(cR / cP - T.K[1][2]) < 0.15, `the gap tracks the table (${(cR / cP).toFixed(2)}x vs ${T.K[1][2]}x)`)
ok(Math.abs(cD / cR - 1 / T.K[2][2]) < 0.15, `at both ends (${(cD / cR).toFixed(2)}x vs ${(1 / T.K[2][2]).toFixed(2)}x)`)

// the ambush triangle, body for body, on a road: whoever is faster caught the
// other strung out, and that beats raw strength
const road = (ka, kb) => {
  fresh()
  const [u, v] = longRoad()
  S.A = [put(1111, 0, 100, u, v, ka), put(1112, 1, 100, v, u, kb)]
  for (let z = 0; z < 9000 && S.A.length === 2; z++) tick()
  return S.A.length === 1 ? S.A[0].o : -1
}
ok(road(1, 0) === 0, 'on a road unicorns break footmen')
ok(road(0, 2) === 0, 'footmen break behemoths')
ok(road(1, 2) === 0, 'and unicorns maul behemoths worst of all — the slowest thing there is')
ok(road(2, 1) === 1, 'a behemoth never wins that one by turning it around')

// wall power: the same hundred warriors, three very different sieges
const breach = k => {
  fresh()
  const c = S.C.findIndex(x => x.o !== 0)
  S.C[c].s = S.C[c].m
  S.A = [put(1121, 0, 100, c, -1, k)]
  let z = 0
  for (; z < 20000 && S.C[c].o !== 0; z++) tick()
  return z
}
const bD = breach(2), bR = breach(0), bP = breach(1)
ok(bD < bR && bR < bP, `behemoths breach fastest, unicorns slowest (${bD}/${bR}/${bP} ticks)`)
ok(bP > bR * 2, 'unicorns are no siege engine at all')

// kinds keep their own company
fresh()
k = S.C.findIndex(c => c.o === 0)
S.A = [put(1131, 0, 50, k, -1, 0), put(1132, 0, 50, k, -1, 2)]
tick()
ok(S.A.length === 2, 'footmen and behemoths sharing a city do not pool')
S.A = [put(1133, 0, 50, k, -1, 2), put(1134, 0, 50, k, -1, 2)]
tick()
ok(S.A.length === 1 && S.A[0].w === 100, 'two behemoth warbands do')
S.A = [put(1135, 0, 90, k, -1, 2)]
split(S.A[0], 30)
ok(S.A.length === 2 && S.A.every(a => a.k === 2), 'and splitting behemoths yields behemoths')

// the raise gate: footmen anywhere, the specialist only where it is bred
fresh()
S.F[0].g = 999
const plain = S.C.findIndex(c => c.o === 0 && !c.sp && c.p >= T.minPop)
ok(canRaise(plain, 0), 'a plain city raises footmen')
ok(!canRaise(plain, 0, 2) && !canRaise(plain, 0, 1), 'and nothing else')
const seat = S.C.findIndex(c => c.o === 0 && c.cap)
const mine2 = S.C[seat].sp
ok(canRaise(seat, 0, mine2), 'my capital raises what my realm breeds')
ok(!canRaise(seat, 0, mine2 === 1 ? 2 : 1), 'but not the other realms\' beast')

// each kind is charged at its own price, and arrives as itself
const g0 = S.F[0].g, p0 = S.C[seat].p
ok(raise(seat, 0, mine2), 'the order is taken')
ok(S.F[0].g === g0 - T.K[mine2][3] && S.C[seat].p === p0 - T.K[mine2][4],
  `at its own price (💎${T.K[mine2][3]} 👥${T.K[mine2][4]})`)
ok(S.C[seat].mk === mine2, 'and the muster remembers what it is raising')
for (n = 0; n < T.muster + 2 && !S.A.length; n++) tick()
ok(S.A.length === 1 && S.A[0].k === mine2 && S.A[0].w === T.raiseW,
  'the warband that gathers is that kind, at the usual strength')

// a muster will not pour itself into the wrong kind standing on the same city
fresh()
S.F[0].g = 999
const seat2 = S.C.findIndex(c => c.o === 0 && c.cap)
S.A = [put(1141, 0, 40, seat2, -1, 0)]
raise(seat2, 0, S.C[seat2].sp)
for (n = 0; n < T.muster + 2 && S.A.length < 2; n++) tick()
ok(S.A.length === 2, 'a specialist muster forms its own warband')
ok(S.A[0].w === T.raiseW && S.A[1].k === S.C[seat2].sp, 'and leaves the footmen alone')

// the open field: a host fights at the pace it marches, so the counter comes out
// of the movement rules rather than a matchup table
const clash = (k, road) => {
  fresh()
  const [u, v] = longRoad()
  const n = Math.round(100 * T.K[0][3] / T.K[k][3])   // the same gold, either way
  S.A = road
    ? [put(1171, 0, n, u, v, k), put(1172, 1, 100, v, u, 0)]
    : [put(1171, 0, n, u, -1, k), put(1172, 1, 100, u, -1, 0)]
  for (let z = 0; z < 9000 && S.A.length === 2; z++) tick()
  return S.A.length === 1 ? S.A[0].o : -1
}
// and now for the same 💎 rather than the same bodies. A unicorn is priced as an
// elite, so it buys few: it must earn its place by matchup, not by weight of numbers
const forSameGold = k => Math.round(100 * T.K[0][3] / T.K[k][3])
ok(forSameGold(1) < 100 && forSameGold(2) < 100,
  `💎 for 100 footmen buys only ${forSameGold(1)} unicorns or ${forSameGold(2)} behemoths`)
ok(clash(1, 0) === 1, 'so few unicorns lose to footmen at a city')
ok(clash(2, 1) === 1, 'and so few behemoths lose to them on the road')
// because damage comes off `w`, body count IS hit points here: a half-sized host
// of double-strength warriors trades evenly on output and dies twice as fast. The
// behemoth's edge is the siege, where losses are T.sgLoss * c.d whatever you are
const raze = k => {
  fresh()
  const c = S.C.findIndex(x => x.o !== 0)
  S.C[c].s = S.C[c].m
  S.A = [put(1181, 0, Math.round(100 * T.K[0][3] / T.K[k][3]), c, -1, k)]
  let z = 0
  for (; z < 20000 && S.C[c].o !== 0; z++) tick()
  return z
}
const rzR = raze(0), rzD = raze(2), rzP = raze(1)
ok(rzD < rzR && rzR < rzP, `for the same 💎, behemoths breach fastest (${rzD}/${rzR}/${rzP} ticks)`)
ok(rzP > rzR, 'and flyers slowest — the road is theirs, the wall is not')
const openMult = k => (1 + T.K[k][2]) / 2
ok(openMult(1) > 1 && openMult(0) === 1 && openMult(2) < 1,
  'speed is the open-field multiplier — flyers gain, footmen neutral, behemoths pay')

// pacification is boots on a populace — weighting it would move round 14's balance
const pacify = k => {
  fresh()
  const c = S.C.findIndex(x => x.o !== 0)
  S.C[c].na = S.C[c].o; S.C[c].o = 0; S.C[c].p = 120; S.C[c].u = T.seize
  S.A = [put(1161, 0, 30, c, -1, k)]
  for (let z = 0; z < 400; z++) tick()
  return S.C[c].u
}
ok(pacify(0) === pacify(2) && pacify(0) < T.seize, 'a garrison puts unrest down by boots, not by kind')

// --- 10. a fight at a city is a fight; a siege is what happens after --------
// the city's Defense is spent on the siege and nowhere else, so two hosts
// standing on it trade exactly as they would on the road outside
const nodeFight = d => {
  fresh()
  const i = S.C.findIndex(c => c.o === 0)
  S.C[i].d = d; S.C[i].s = S.C[i].m
  S.A = [put(1201, 0, 100, i, -1), put(1202, 1, 100, i, -1)]
  for (let z = 0; z < 40; z++) tick()
  return S.A.filter(a => a.id > 1200).map(a => a.id + ':' + a.w.toFixed(6)).join(' ')
}
const weak = nodeFight(2), strong = nodeFight(10)
ok(/1201:\d/.test(weak) && /1202:\d/.test(weak), 'both hosts are still standing after 40 ticks')
ok(weak === strong,
  `Defense 2 and Defense 10 leave the identical fight (${weak})`)

// but it is exactly what a siege is fought against
const blood = d => {
  fresh()
  const i = S.C.findIndex(c => c.o !== 0)
  S.C[i].d = d; S.C[i].s = S.C[i].m
  S.A = [put(1203, 0, 200, i, -1)]
  for (let z = 0; z < 20; z++) tick()
  const a = getArmy(1203)
  return a ? a.w : 0
}
const b2 = blood(2), b10 = blood(10)
ok(b10 < b2, `a stouter city bleeds its besiegers harder (${b2.toFixed(1)} left v ${b10.toFixed(1)})`)

// and no wall is touched while there is still somebody to fight
fresh()
const keep = S.C.findIndex(c => c.o !== 0)
S.C[keep].s = S.C[keep].m
const wall0 = S.C[keep].s
S.A = [put(1204, 0, 200, keep, -1), put(1205, S.C[keep].o, 200, keep, -1)]
for (let z = 0; z < 5; z++) tick()
ok(S.C[keep].s === wall0, 'a defended city takes no wall damage at all')
ok(getArmy(1204) && getArmy(1205), 'while both hosts are still there')
S.A = S.A.filter(a => a.id !== 1205)
for (let z = 0; z < 5; z++) tick()
ok(S.C[keep].s < wall0, 'the siege starts only once there is nobody left to fight')

// --- 11. home ground: a host fights harder at a city of its own realm ------
// the city still swings nothing itself; the men standing on it swing T.home
// harder. Same seed, same rolls, same kinds — the ownership of the ground is
// the only thing that differs between these two runs.
const groundFight = owner => {
  fresh()
  const i = S.C.findIndex(c => c.o === 0)
  S.C[i].o = S.C[i].na = owner            // set `na` too, or unrest would revolt it
  S.C[i].s = S.C[i].m
  S.A = [put(1206, 0, 100, i, -1), put(1207, 1, 100, i, -1)]
  for (let z = 0; z < 40; z++) tick()
  const a = getArmy(1206), b = getArmy(1207)
  return [a ? a.w : 0, b ? b.w : 0]
}
const [hostAtHome, foeAtHome] = groundFight(0)   // the ground belongs to host 1206
const [hostAway, foeAway] = groundFight(2)       // the ground belongs to nobody present
ok(foeAtHome < foeAway,
  `a host at home cuts its enemy down faster (${foeAtHome.toFixed(1)} left v ${foeAway.toFixed(1)})`)
ok(hostAtHome > hostAway,
  `and so takes less in return (${hostAtHome.toFixed(1)} left v ${hostAway.toFixed(1)})`)
ok(Math.abs(hostAway - foeAway) < 6,
  `on ground belonging to neither, the same fight is even (${hostAway.toFixed(1)} v ${foeAway.toFixed(1)})`)

// and the bonus is a city's, not a road's: the road out of a city is nobody's home
const roadFight = owner => {
  fresh()
  const [p, q] = longRoad()
  S.C[p].o = S.C[p].na = S.C[q].o = S.C[q].na = owner
  S.A = [put(1208, 0, 100, p, q), put(1209, 1, 100, q, p)]
  for (let z = 0; z < 400; z++) tick()
  const a = getArmy(1208), b = getArmy(1209)
  return (a ? a.w : 0).toFixed(6) + ' ' + (b ? b.w : 0).toFixed(6)
}
ok(roadFight(0) === roadFight(2),
  `a road fight is the same whoever owns the cities at its ends (${roadFight(0)})`)

console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
