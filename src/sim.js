import { S, T, WIN, NC, rnd, rf, dist, note, boom } from './state.js'
import { horn } from './audio.js'

let nextId = 1
export const getArmy = id => S.A.find(a => a.id === id)
// the host under command: selecting one of your own is what arms it, so there
// is no separate targeting flag to set, clear, or keep in sync
export const active = () => {
  const a = S.sel && S.sel.k === 'a' && getArmy(S.sel.i)
  return a && a.o === S.me ? a : null
}
export const cnt = f => S.C.reduce((n, c) => n + (c.o === f), 0)
const at = i => S.A.filter(a => a.t < 0 && a.a === i)

// the road an army is on, as an order-independent key, and how far along it sits
// (always measured from the lower-index endpoint, so head-on marchers compare)
const road = a => a.a < a.t ? a.a * NC + a.t : a.t * NC + a.a
const span = a => dist(S.C[a.a], S.C[a.t])
const along = (a, pr) => a.a < a.t ? pr * span(a) : (1 - pr) * span(a)

// a warband's weight in a field fight. `w` counts bodies everywhere — the number
// under the host, the split slider, the garrison that puts unrest down — and this
// is the only place a kind makes those bodies count for more or less
export const pw = a => a.w * T.K[a.k][0]
// a fight between cities is decided at the pace you march. A host's own speed is
// its weight in the open — no matchup table needed, the counter falls out of the
// movement rules: a behemoth is slow, so it spends its life on roads being caught.
// At a city speed buys nothing — walls do not manoeuvre — and home ground takes
// its place: a host fighting at a city of its own realm swings T.home harder,
// knowing the streets and the wells. That is an attack term, not a garrison one;
// the city itself still never joins in, and being at home buys no durability.
// `g[0].t >= 0` separates the two — a road cluster is all marchers, a node all rest
const afield = g => g[0].t >= 0
const might = (a, o) => pw(a) *
  (o ? (1 + T.K[a.k][2]) / 2 : S.C[a.a].o === a.o ? T.home : 1)
// the ambush. `melee` already aims each host at one particular enemy, so the
// matchup can be read off the two march rates: outpace what you land on and you
// caught it strung out on the road. Behind walls nobody gets outrun, so it is 1.
const strike = (a, b, o) => might(a, o) *
  (o ? Math.max(0.2, 1 + (T.K[a.k][2] - T.K[b.k][2]) * T.amb) : 1)
// stamina. Fatigue is the one number a host carries that the board cannot say —
// it is history, not position — and it is spent walking, spent far faster
// fighting, and shed standing still. Winded, a host marches at half pace: that
// is what stops a warband skipping from city to city forever, and it hands the
// defender the one thing standing still is good for.
export const tired = a => a.fg >= T.wind
export const rate = a => T.speed * T.K[a.k][2] * (tired(a) ? 0.5 : 1)
// march progress including the current frame's fraction of a tick, so the
// renderer and the panel read out continuous motion between ticks
export const prog = a => a.t < 0 ? 1
  : Math.min(1, a.pr + (a.st ? 0 : S.alpha * rate(a) / span(a)))

// --- what the player can see -----------------------------------------------
// purely derived: a reveal lasts only while a host is there, so there is no
// discovered-state to store, reset, or keep in sync. geography always draws.
const myAt = i => at(i).some(a => a.o === S.me)
export const besieged = i => at(i).some(a => a.o !== S.C[i].o)
// the din of battle, derived like the fog: a clash marker on screen, or a siege
// in sight. a siege has nobody to fight, so it draws no ⚔️ of its own
export const fighting = () => S.fx.some(f => f.k === 1) ||
  S.C.some((c, i) => besieged(i) && seeCity(i))
export const seeCity = i => {
  const c = S.C[i]
  return c.o === S.me || myAt(i) || c.n.some(j => S.C[j].o === S.me)
}
export const seeRoad = (i, j) =>
  S.C[i].o === S.me || S.C[j].o === S.me ||        // touches my territory
  myAt(i) || myAt(j) ||                            // a host of mine holds an end
  S.A.some(a => a.o === S.me && a.t >= 0 &&        // or is marching it right now
    ((a.a === i && a.t === j) || (a.a === j && a.t === i)))
export const seeArmy = a =>
  a.o === S.me || (a.t >= 0 ? seeRoad(a.a, a.t) : seeCity(a.a))

// next step on a shortest path from -> to, by hop count. 20 nodes: BFS is plenty.
export function hop (from, to) {
  if (from === to) return -1
  const prev = new Array(NC).fill(-2)
  prev[from] = -1
  const q = [from]
  for (let h = 0; h < q.length; h++) {
    for (const v of S.C[q[h]].n) {
      if (prev[v] !== -2) continue
      prev[v] = q[h]
      if (v === to) { let x = v; while (prev[x] !== from) x = prev[x]; return x }
      q.push(v)
    }
  }
  return -1
}

// ---- civil unrest ---------------------------------------------------------
// One number per city: how badly its people want their own realm back. It only
// moves while someone else holds the place, and a garrison is what holds it
// down — in proportion to the size of the crowd being sat on. Deliberately
// bodies, not `pw`: sitting on a populace is done with boots, and a behemoth is
// not worth two footmen at it. Weighting this would move round 14's balance.
export const garrison = (i, f) => at(i).reduce((n, a) => n + (a.o === f ? a.w : 0), 0)
export const unrest = i => S.C[i].u >= T.calm

// when it boils over the city simply goes home; no mob, no siege
function revolt (i) {
  const c = S.C[i], old = c.o
  c.o = c.na
  c.u = 0
  c.mu = 0                                         // the half-raised host scatters
  if (old === S.me || c.na === S.me) note('✊ ' + c.nm + ' throws out ' + S.F[old].em)
  if (seeCity(i)) boom(c.x, c.y, 2, S.F[c.na].c)
}

// ---- player / AI actions -------------------------------------------------
// every city fields footmen; only the ten that breed a specialist field anything else.
// The populace the panel shows is the populace you can conscript: the only floor is
// the muster's own price, so a city can be drafted down to almost nobody
export const canRaise = (i, f, k = 0) => {
  const c = S.C[i]
  return c.o === f && !c.mu && !c.oc && c.u < T.calm && (!k || k === c.sp) &&
    c.p >= T.K[k][4] && S.F[f].g >= T.K[k][3]
}
// gold and populace are spent now; the warriors take T.muster ticks to gather
export function raise (i, f, k = 0) {
  if (!canRaise(i, f, k)) return 0
  const c = S.C[i]
  S.F[f].g -= T.K[k][3]
  c.p -= T.K[k][4]
  c.mu = T.muster
  c.mk = k                                   // the muster remembers what it is raising
  return 1
}
function mustered (i) {
  const c = S.C[i]
  const ex = at(i).find(a => a.o === c.o && a.k === c.mk && !a.hold)
  if (ex) ex.w += T.raiseW
  else S.A.push({ id: nextId++, o: c.o, w: T.raiseW, k: c.mk, a: i, t: -1, pr: 0, st: 0, dst: -1 })
}

const turn = a => { const b = a.a; a.a = a.t; a.t = b; a.pr = 1 - a.pr; a.st = 0 }
// Breaking contact is paid for in warriors — once. `ep` is where the enemy is:
// if they are still ahead, turning away is a real disengagement and costs T.flee.
// If they are already behind, this host is mid-retreat and simply keeps walking.
// Charging it again every tick used to `turn()` it back round each time, pinning
// it in place while it bled a quarter of itself per tick until it died — 95 units
// from an enemy it never reached.
const flee = (a, ep) => {
  const dir = a.a < a.t ? 1 : -1
  if (ep === undefined || dir * (ep - along(a, a.pr)) > 0) { a.w *= 1 - T.flee; turn(a) }
  else a.st = 0                                  // already running; let it run
}
// strength on each side of a fight, so a host can judge whether staying is madness
const odds = g => {
  const pow = {}, o = afield(g)
  for (const a of g) pow[a.o] = (pow[a.o] || 0) + might(a, o)
  const all = Object.values(pow).reduce((x, y) => x + y, 0)
  return a => pow[a.o] < (all - pow[a.o]) * T.odds
}

// a host resting at a city can be divided; both halves are `hold`, so they will
// not immediately re-merge into the stack they were just split out of
export const canSplit = a => !!a && a.t < 0 && !a.st && a.w >= 2
export function split (a, n) {
  if (!canSplit(a)) return 0
  n = Math.max(1, Math.min(Math.round(n), Math.floor(a.w) - 1))
  a.w -= n
  a.hold = 1
  S.A.push({ id: nextId++, o: a.o, w: n, k: a.k, a: a.a, t: -1, pr: 0, st: 0, dst: -1, hold: 1, fg: a.fg })
  return 1
}

export function order (a, j) {
  if (!a || j < 0) return 0
  if (a.t >= 0) {
    if (j === a.a) { a.st ? flee(a) : turn(a); a.dst = -1; return 1 }   // turn back
    a.dst = j                                    // re-paths when this leg lands
    return 1
  }
  if (j === a.a) return 0
  const h = S.C[a.a].n.includes(j) ? j : hop(a.a, j)
  if (h < 0) return 0
  a.dst = j; a.t = h; a.pr = 0; a.st = 0; a.hold = 0
  return 1
}

// ---- combat --------------------------------------------------------------
// one resolver for every fight. each host swings at a randomly chosen enemy
// host; damage is banked and applied together, so resolution order never matters.
// The city never joins in: a fight between hosts standing on it is the same fight
// it would be on the road outside, less the speed layers `afield` gates and plus
// the owner's home-ground bonus. A city spends its defence on the siege, and
// only once there is nobody left to fight.
function melee (g) {
  const hit = new Map(), o = afield(g)
  const hurt = (x, d) => hit.set(x, (hit.get(x) || 0) + d)
  for (const a of g) {
    const foes = g.filter(b => b.o !== a.o)
    if (!foes.length) continue
    const t = foes[(rnd() * foes.length) | 0]
    hurt(t, T.atk * strike(a, t, o) * rf(0.8, 1.2))
  }
  for (const [a, d] of hit) a.w -= d
}

// ---- roads: engagements between nodes, then movement ---------------------
function lanes () {
  const l = {}
  for (const a of S.A) if (a.t >= 0) (l[road(a)] || (l[road(a)] = [])).push(a)
  return l
}

function roads () {
  for (const a of S.A) { a.st = 0; a.eg = null; a.sg = -1 }

  // hosts that meet on the same road lock together and fight where they stand
  for (const g of Object.values(lanes())) {
    g.sort((x, y) => along(x, x.pr) - along(y, y.pr))
    const pos = g.map(a => along(a, a.pr))
    for (let i = 0; i < g.length;) {
      let j = i
      while (j + 1 < g.length && pos[j + 1] - pos[j] <= T.reach) j++
      // The chain above finds *where* a brawl is; it must not decide who is in it.
      // Growing it while consecutive gaps are <= T.reach let six hosts spaced 18
      // apart span 95 units, locking one 95 from the enemy into the melee. In the
      // fight = within reach of an enemy, plus friends within reach of those, so
      // arrivals still join (they halt T.reach * 0.9 behind their own front rank).
      const hot = []
      for (let u = i; u <= j; u++)
        if (g.some((b, v) => v >= i && v <= j && b.o !== g[u].o &&
          Math.abs(pos[u] - pos[v]) <= T.reach)) hot.push(g[u])
      const cl = hot.length
        ? g.slice(i, j + 1).filter(a => hot.includes(a) ||
            hot.some(b => b.o === a.o && Math.abs(along(a, a.pr) - along(b, b.pr)) <= T.reach))
        : []
      if (new Set(cl.map(a => a.o)).size > 1) {
        melee(cl)
        const ids = cl.map(z => z.id)
        for (const a of cl) { a.st = 1; a.eg = ids }
        const li = Math.min(cl[0].a, cl[0].t), hj = Math.max(cl[0].a, cl[0].t)
        const lo = S.C[li], hi = S.C[hj]
        const ap = cl.map(z => along(z, z.pr))
        const f = (Math.min(...ap) + Math.max(...ap)) / 2 / dist(lo, hi)
        if (seeRoad(li, hj)) boom(lo.x + (hi.x - lo.x) * f, lo.y + (hi.y - lo.y) * f, 1)
        const losing = odds(cl)                // an outmatched AI host turns and runs
        for (const a of cl) {
          if (!S.F[a.o].ai || a.w <= 0.5 || !losing(a)) continue
          const foes = cl.filter(b => b.o !== a.o)
          flee(a, foes.reduce((n, b) => n + along(b, b.pr), 0) / foes.length)
        }
      }
      i = j + 1
    }
  }
  S.A = S.A.filter(a => a.w > 0.5)

  const l = lanes()
  for (const a of S.A) {
    if (a.t < 0 || a.st) continue
    const L = span(a), was = along(a, a.pr)
    let my = along(a, a.pr + rate(a) / L)
    const dir = my > was ? 1 : -1
    // walk up to contact with anything in the way, never through it: an enemy,
    // or a friend already locked in a melee. free friends are passed by.
    for (const b of l[road(a)]) {
      if (b === a || b.t < 0 || (b.o === a.o && !b.st)) continue
      const bp = along(b, b.pr), stop = bp - dir * T.reach * 0.9
      if (dir * (bp - was) > 0 && dir * (my - stop) > 0) my = stop
    }
    if (dir * (my - was) <= 0) { a.st = 1; continue }          // nose to nose already
    a.pr = a.a < a.t ? my / L : 1 - my / L
    if (a.pr >= 1) { a.a = a.t; a.t = -1; a.pr = 0 }
  }
}

// ---- one simulation tick -------------------------------------------------
export function tick () {
  S.tick++

  // 1. income and population growth
  for (let f = 0; f < S.F.length; f++) {
    let e = 0
    for (const c of S.C) if (c.o === f) e += c.e
    S.F[f].g += e * T.inc * S.F[f].dm.inc
  }
  for (let i = 0; i < NC; i++) {
    const c = S.C[i]
    const cap = 100 + c.e * 10
    if (c.p < cap) c.p += (cap - c.p) * T.grow
    if (c.mu && !--c.mu) mustered(i)
    if (c.oc) c.oc--
  }

  // 2. road battles, then movement
  roads()

  // 3. merge friendly stacks that share a node
  for (let i = 0; i < NC; i++) {
    const here = at(i)
    for (let u = 0; u < here.length; u++) {
      for (let v = u + 1; v < here.length; v++) {
        if (here[u].o !== here[v].o || here[u].k !== here[v].k ||
            here[v].w <= 0 || here[u].hold || here[v].hold) continue
        here[u].w += here[v].w; here[v].w = 0
      }
    }
  }
  S.A = S.A.filter(a => a.w > 0.5)

  // 4. field battles and sieges, node by node
  for (let i = 0; i < NC; i++) {
    const c = S.C[i]
    const here = at(i)
    if (!here.length) continue
    const sides = [...new Set(here.map(a => a.o))]

    if (sides.length > 1) {
      melee(here)
      const ids = here.map(z => z.id)
      for (const a of here) { a.eg = ids; a.sg = sides.includes(c.o) ? i : -1 }
      if (seeCity(i)) boom(c.x, c.y, 1)
      const losing = odds(here)                // AI routs to a quiet neighbour
      for (const a of here) {
        if (!S.F[a.o].ai || a.w <= 0.5 || !losing(a)) continue
        const safe = c.n.find(j => S.C[j].o === a.o && !at(j).some(b => b.o !== a.o))
        if (safe !== undefined) { a.w *= 1 - T.flee; a.t = safe; a.pr = 0; a.hold = 0 }
      }
      S.A = S.A.filter(a => a.w > 0.5)
      continue
    }

    const f = sides[0]
    if (c.o === f) continue

    // 5. siege
    const force = here.reduce((n, a) => n + a.w, 0)          // bodies, for the blood
    const ram = here.reduce((n, a) => n + a.w * T.K[a.k][1], 0)   // weight, for the walls
    const sids = here.map(z => z.id)
    for (const a of here) { a.eg = sids; a.sg = i }
    const loss = T.sgLoss * c.d
    for (const a of here) a.w -= loss * (a.w / force)
    c.s -= ram * T.sgDmg * (1 + S.tick / T.escal)     // long wars grind walls faster
    if (c.s <= 0) {
      c.o = f
      c.p *= T.sack
      c.s = c.m * T.garrison
      c.mu = 0                                   // the half-raised host scatters
      c.oc = T.occupy                            // a cowed city conscripts nobody
      if (f !== c.na) c.u = Math.max(c.u, T.seize)   // an occupied city seethes
      if (seeCity(i)) boom(c.x, c.y, 2, S.F[f].c)
    }
    S.A = S.A.filter(a => a.w > 0.5)
  }

  // 5b. hosts with somewhere further to be march on — unless there is work here
  for (const a of S.A) {
    if (a.t >= 0 || a.dst < 0) continue
    if (a.dst === a.a) { a.dst = -1; continue }
    if (S.C[a.a].o !== a.o) continue                                   // finish the siege
    if (S.A.some(b => b !== a && b.t < 0 && b.a === a.a && b.o !== a.o)) continue
    const h = hop(a.a, a.dst)
    if (h < 0) { a.dst = -1; continue }
    a.t = h; a.pr = 0; a.hold = 0
  }

  // 5d. stamina. `a.eg` is already "fought this tick" — roads() clears it for
  // every host and every melee and siege sets it — so this needs no new flag,
  // and a besieger chewing a wall pays the fighting rate with nobody to fight.
  for (const a of S.A) a.fg = Math.max(0, Math.min(100,
    (a.fg || 0) + (a.eg ? T.brawl : a.t >= 0 ? T.tread : -T.rest)))

  // 5c. civil unrest, on its own slower clock. A conquered city chafes as long
  // as the realm it belongs to is still standing to rally to; once that realm is
  // down to a crumbling rump it inspires nobody, and the city settles by itself —
  // which is what keeps a revolt from feeding a dead realm cities forever.
  if (!(S.tick % T.slow)) for (let i = 0; i < NC; i++) {
    const c = S.C[i]
    if (c.o === c.na) { c.u = 0; continue }        // at home: nothing to resent
    const rally = cnt(c.na) > T.dying
    const sat = Math.min(1, garrison(i, c.o) / (c.p * T.hold)) * S.F[c.o].dm.pac
    c.u = Math.max(0, Math.min(100, c.u + (rally ? T.stir : -T.stir) - T.pace * sat))
    if (rally && c.u > T.riot && rnd() < T.rise) revolt(i)
  }

  // 6. mending, halted while enemies are at the gates. There is no repair order
  // any more: a city puts its own stone back, and nobody is billed for it
  for (let i = 0; i < NC; i++) {
    const c = S.C[i]
    if (c.s >= c.m || at(i).some(a => a.o !== c.o)) continue
    // masonry loses the race as the war drags on: a long siege eventually tells
    c.s = Math.min(c.m, c.s + T.mend / (1 + S.tick / T.escal))
  }

  // 6b. a realm down to its last holdings cannot keep its walls standing
  for (let f = 0; f < S.F.length; f++) {
    if (!S.F[f].alive || cnt(f) > T.dying) continue
    for (const c of S.C) if (c.o === f) c.s = Math.max(0.5, c.s - T.rot)
    for (const a of S.A) if (a.o === f) a.w -= a.w * T.starve   // no realm left to feed them
  }
  S.A = S.A.filter(a => a.w > 0.5)

  // 6c. tell the player when something of theirs comes under attack, once each
  for (let i = 0; i < NC; i++) {
    const c = S.C[i], hit = c.o === S.me && besieged(i)
    if (hit && !c.wn) { note('⚠️ ' + c.nm + ' is under attack!'); horn() }
    c.wn = hit ? 1 : 0
  }
  for (const a of S.A) {
    if (a.o !== S.me) continue
    const hit = !!a.eg && a.eg.some(id => { const b = getArmy(id); return b && b.o !== a.o })
    if (hit && !a.wn) { note('⚠️ Your warband is under attack!'); horn() }
    a.wn = hit ? 1 : 0
  }

  // 7. victory
  for (let f = 0; f < S.F.length; f++) {
    const n = cnt(f)
    if (S.F[f].alive && !n && !S.A.some(a => a.o === f)) {
      S.F[f].alive = 0
    }
    if (n >= WIN) S.over = f === S.me ? 1 : -1
  }
  if (!S.F[S.me].alive) S.over = -1
}
