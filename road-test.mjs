// road-engagement unit tests — deterministic army placements, no AI. Not shipped.
import { S, T, dist } from './src/state.js'
import { genMap } from './src/map.js'
import { tick } from './src/sim.js'

let fail = 0
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail = 1 }

// longest road on the map, for room to manoeuvre
function longest () {
  genMap(7); S.me = 0; S.F.forEach(f => { f.ai = 0 })
  return S.E.slice().sort((a, b) => dist(S.C[b[0]], S.C[b[1]]) - dist(S.C[a[0]], S.C[a[1]]))[0]
}
const put = (id, o, w, a, t) => ({ id, o, w, a, t, pr: 0, w0: w, st: 0 })
const gap = (u, v, L) => (1 - u.pr - v.pr) * L    // clear road between two head-on hosts

// --- head-on: two hosts meet, stop, and fight ------------------------------
let [i, j] = longest()
let L = dist(S.C[i], S.C[j])
S.A = [put(901, 0, 100, i, j), put(902, 1, 100, j, i)]
let crossed = 0, n = 0
for (; n < 2000 && !(S.A[0].st && S.A[1].st); n++) {
  tick()
  if (S.A.length === 2 && gap(S.A[0], S.A[1], L) < 0) crossed = 1
}
const [x, y] = S.A
ok(!crossed, 'head-on hosts never pass through each other')
ok(x.st && y.st, 'both lock on contact after ' + n + ' ticks')
ok(gap(x, y, L) > 0 && gap(x, y, L) <= T.reach, 'they halt within contact range (' + gap(x, y, L).toFixed(1) + ' <= ' + T.reach + ')')
ok(x.w < 100 && y.w < 100, 'both are taking losses (' + (x.w | 0) + ' vs ' + (y.w | 0) + ')')

// --- reinforcement: a third host of one colour walks up and joins ----------
const w1before = y.w
S.A.push(put(903, 0, 100, i, j))
for (n = 0; n < 2000 && !S.A[2]?.st; n++) tick()
ok(S.A.some(a => a.id === 903 && a.st), 'a following host halts on the melee and joins it')
ok(y.w < w1before, 'the outnumbered host is now losing ground')
for (n = 0; n < 4000 && S.A.some(a => a.o === 1); n++) tick()
ok(!S.A.some(a => a.o === 1), 'two against one resolves')
const froze = S.A.filter(a => a.t >= 0).map(a => a.pr)
for (n = 0; n < 20; n++) tick()
ok(S.A.every(a => a.t < 0 || !a.st), 'survivors are unlocked once the enemy is gone')
ok(S.A.filter(a => a.t >= 0).every((a, k) => froze[k] === undefined || a.pr > froze[k]),
  'and they have resumed marching')

// --- friendlies do not gridlock on the same road ---------------------------
;[i, j] = longest()
L = dist(S.C[i], S.C[j])
S.A = [put(911, 0, 50, i, j), put(912, 0, 50, j, i)]   // same colour, head-on
for (n = 0; n < 4000 && S.A.length === 2 && S.A[0].t >= 0 && S.A[1].t >= 0; n++) tick()
ok(S.A.every(a => a.t < 0 || a.pr > 0.9) || S.A.length < 2,
  'same-colour hosts pass each other instead of deadlocking')

// --- the enemy pins you: a lone host cannot slip past a blockade -----------
;[i, j] = longest()
L = dist(S.C[i], S.C[j])
S.A = [put(921, 0, 30, i, j), put(922, 1, 300, j, i)]
for (n = 0; n < 4000 && S.A.some(a => a.id === 921); n++) tick()
ok(!S.A.some(a => a.id === 921), 'a small host is destroyed by a blockade, not waved through')
ok(S.A.some(a => a.id === 922 && a.w > 250), 'the blockading host survives largely intact')

console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
