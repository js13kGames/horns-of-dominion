import { S, T, WIN, NC, rnd, rf, dist, say, note, boom } from './state.js'

let nextId = 1
export const getArmy = id => S.A.find(a => a.id === id)
export const cnt = f => S.C.reduce((n, c) => n + (c.o === f), 0)
const at = i => S.A.filter(a => a.t < 0 && a.a === i)

// the road an army is on, as an order-independent key, and how far along it sits
// (always measured from the lower-index endpoint, so head-on marchers compare)
const road = a => a.a < a.t ? a.a * NC + a.t : a.t * NC + a.a
const span = a => dist(S.C[a.a], S.C[a.t])
const along = (a, pr) => a.a < a.t ? pr * span(a) : (1 - pr) * span(a)

// march progress including the current frame's fraction of a tick, so the
// renderer and the panel read out continuous motion between ticks
export const prog = a => a.t < 0 ? 1
  : Math.min(1, a.pr + (a.st ? 0 : S.alpha * T.speed / span(a)))

// --- what the player can see -----------------------------------------------
// purely derived: a reveal lasts only while a host is there, so there is no
// discovered-state to store, reset, or keep in sync. geography always draws.
const myAt = i => at(i).some(a => a.o === S.me)
export const besieged = i => at(i).some(a => a.o !== S.C[i].o)
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

// ---- player / AI actions -------------------------------------------------
export const canRaise = (i, f) => {
  const c = S.C[i]
  return c.o === f && !c.mu && !c.oc && c.p >= T.minPop && S.F[f].g >= T.raiseG
}
// gold and populace are spent now; the warriors take T.muster ticks to gather
export function raise (i, f) {
  if (!canRaise(i, f)) return 0
  const c = S.C[i]
  S.F[f].g -= T.raiseG
  c.p -= T.raiseP
  c.mu = T.muster
  return 1
}
function mustered (i) {
  const c = S.C[i]
  const ex = at(i).find(a => a.o === c.o && !a.hold)
  if (ex) ex.w += T.raiseW
  else S.A.push({ id: nextId++, o: c.o, w: T.raiseW, a: i, t: -1, pr: 0, st: 0, dst: -1 })
}

export const canFix = (i, f) => {
  const c = S.C[i]
  return c.o === f && c.s + c.rp < c.m && S.F[f].g >= T.repair * T.repairStep
}
// masons are paid now; the stone goes up at T.fixRate a tick
export function fix (i, f) {
  if (!canFix(i, f)) return 0
  S.F[f].g -= T.repair * T.repairStep
  S.C[i].rp += T.repairStep
  return 1
}

const turn = a => { const b = a.a; a.a = a.t; a.t = b; a.pr = 1 - a.pr; a.st = 0 }
// breaking contact is paid for in warriors; walking away from an empty road is free
const flee = a => { a.w *= 1 - T.flee; turn(a) }
// strength on each side of a fight, so a host can judge whether staying is madness
const odds = g => {
  const pow = {}
  for (const a of g) pow[a.o] = (pow[a.o] || 0) + a.w
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
  S.A.push({ id: nextId++, o: a.o, w: n, a: a.a, t: -1, pr: 0, st: 0, dst: -1, hold: 1 })
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
// host; damage is banked and applied together, so resolution order never matters
function melee (g, gd, gf) {
  const hit = new Map()
  const hurt = (x, d) => hit.set(x, (hit.get(x) || 0) + d)
  const foesOf = f => g.filter(b => b.o !== f)
  for (const a of g) {
    const foes = foesOf(a.o)
    if (foes.length) hurt(foes[(rnd() * foes.length) | 0], T.atk * a.w * rf(0.8, 1.2))
  }
  if (gd) {                                    // the city garrison joins in
    const foes = foesOf(gf)
    if (foes.length) hurt(foes[(rnd() * foes.length) | 0], gd)
  }
  for (const [a, d] of hit) a.w -= d
}

const shattered = (g, vis) => {
  for (const a of g) {
    if (a.w > 0.5) continue
    if (a.o !== S.me) S.stat.slain++
    if (vis && S.F[a.o].ai) say('💀 ' + S.F[a.o].em + ' host is shattered')
  }
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
      const cl = g.slice(i, j + 1)
      if (new Set(cl.map(a => a.o)).size > 1) {
        melee(cl, 0, -1)
        const ids = cl.map(z => z.id)
        for (const a of cl) { a.st = 1; a.eg = ids }
        const li = Math.min(cl[0].a, cl[0].t), hj = Math.max(cl[0].a, cl[0].t)
        const lo = S.C[li], hi = S.C[hj], vis = seeRoad(li, hj)
        const f = (pos[i] + pos[j]) / 2 / dist(lo, hi)
        if (vis) boom(lo.x + (hi.x - lo.x) * f, lo.y + (hi.y - lo.y) * f, 1)
        shattered(cl, vis)
        const losing = odds(cl)                // an outmatched AI host turns and runs
        for (const a of cl) if (S.F[a.o].ai && a.w > 0.5 && losing(a)) flee(a)
      }
      i = j + 1
    }
  }
  S.A = S.A.filter(a => a.w > 0.5)

  const l = lanes()
  for (const a of S.A) {
    if (a.t < 0 || a.st) continue
    const L = span(a), was = along(a, a.pr)
    let my = along(a, a.pr + T.speed / L)
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
        if (here[u].o !== here[v].o || here[v].w <= 0 || here[u].hold || here[v].hold) continue
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
      melee(here, sides.includes(c.o) ? c.d * 0.5 : 0, c.o)
      const ids = here.map(z => z.id)
      for (const a of here) { a.eg = ids; a.sg = sides.includes(c.o) ? i : -1 }
      const vis = seeCity(i)
      if (vis) boom(c.x, c.y, 1)
      shattered(here, vis)
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
    const force = here.reduce((n, a) => n + a.w, 0)
    const sids = here.map(z => z.id)
    for (const a of here) { a.eg = sids; a.sg = i }
    const loss = T.sgLoss * c.d
    for (const a of here) a.w -= loss * (a.w / force)
    c.s -= force * T.sgDmg * (1 + S.tick / T.escal)   // long wars grind walls faster
    if (c.s <= 0) {
      const old = c.o
      if (f === S.me) S.stat.took++
      if (old === S.me) S.stat.lost++
      c.o = f
      c.p *= T.sack
      c.s = c.m * T.garrison
      c.mu = c.rp = 0                            // the half-raised host scatters
      c.oc = T.occupy                            // a cowed city conscripts nobody
      if (seeCity(i)) {
        boom(c.x, c.y, 2, S.F[f].c)
        say(S.F[f].em + ' ' + c.nm + ' falls' + (old >= 0 ? ' from ' + S.F[old].em : ''))
      }
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

  // 6. paid repairs and passive mending, both halted while enemies are at the gates
  for (let i = 0; i < NC; i++) {
    const c = S.C[i]
    if (c.s >= c.m || at(i).some(a => a.o !== c.o)) continue
    // masonry loses the race as the war drags on: a long siege eventually tells
    const up = 1 / (1 + S.tick / T.escal)
    if (c.rp) {
      const d = Math.min(c.rp, T.fixRate * up)
      c.s = Math.min(c.m, c.s + d); c.rp -= d
    }
    c.s = Math.min(c.m, c.s + T.mend * up)
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
    if (hit && !c.wn) note('⚠️ ' + c.nm + ' is under attack!')
    c.wn = hit ? 1 : 0
  }
  for (const a of S.A) {
    if (a.o !== S.me) continue
    const hit = !!a.eg && a.eg.some(id => { const b = getArmy(id); return b && b.o !== a.o })
    if (hit && !a.wn) note('⚠️ Your warband is under attack!')
    a.wn = hit ? 1 : 0
  }

  // 7. victory
  for (const a of S.A) if (a.o === S.me && a.w > S.stat.most) S.stat.most = a.w
  for (let f = 0; f < S.F.length; f++) {
    const n = cnt(f)
    if (S.F[f].alive && !n && !S.A.some(a => a.o === f)) {
      S.F[f].alive = 0
      say('☠️ ' + S.F[f].em + ' ' + S.F[f].nm + ' is undone')
    }
    if (n >= WIN) S.over = f === S.me ? 1 : -1
  }
  if (!S.F[S.me].alive) S.over = -1
}
