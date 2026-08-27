import { S, T, WIN, NC, rnd, rf, dist, say, boom } from './state.js'

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

// ---- player / AI actions -------------------------------------------------
export const canRaise = (i, f) => {
  const c = S.C[i]
  return c.o === f && c.p >= T.minPop && S.F[f].g >= T.raiseG
}
export function raise (i, f) {
  if (!canRaise(i, f)) return 0
  const c = S.C[i]
  S.F[f].g -= T.raiseG
  c.p -= T.raiseP
  const ex = at(i).find(a => a.o === f)
  if (ex) ex.w += T.raiseW
  else S.A.push({ id: nextId++, o: f, w: T.raiseW, a: i, t: -1, pr: 0, w0: T.raiseW, st: 0 })
  return 1
}

export const canFix = (i, f) => {
  const c = S.C[i]
  return c.o === f && c.s < c.m && S.F[f].g >= T.repair * T.repairStep
}
export function fix (i, f) {
  if (!canFix(i, f)) return 0
  S.F[f].g -= T.repair * T.repairStep
  S.C[i].s = Math.min(S.C[i].m, S.C[i].s + T.repairStep)
  return 1
}

const turn = a => { const b = a.a; a.a = a.t; a.t = b; a.pr = 1 - a.pr; a.w0 = a.w; a.st = 0 }

export function order (a, j) {
  if (!a) return 0
  if (a.t >= 0) { if (j !== a.a) return 0; turn(a); return 1 }   // marching: only turning back
  if (!S.C[a.a].n.includes(j)) return 0
  a.t = j; a.pr = 0; a.st = 0
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

const shattered = g => {
  for (const a of g) {
    if (a.w > 0.5 || !S.F[a.o].ai) continue
    say('💀 ' + S.F[a.o].em + ' host is shattered')
  }
}

// ---- roads: engagements between nodes, then movement ---------------------
function lanes () {
  const l = {}
  for (const a of S.A) if (a.t >= 0) (l[road(a)] || (l[road(a)] = [])).push(a)
  return l
}

function roads () {
  for (const a of S.A) a.st = 0

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
        for (const a of cl) a.st = 1
        const lo = S.C[Math.min(cl[0].a, cl[0].t)], hi = S.C[Math.max(cl[0].a, cl[0].t)]
        const f = (pos[i] + pos[j]) / 2 / dist(lo, hi)
        boom(lo.x + (hi.x - lo.x) * f, lo.y + (hi.y - lo.y) * f, 1)
        shattered(cl)
        for (const a of cl) {                  // a broken AI host turns and runs
          if (S.F[a.o].ai && a.w > 0.5 && a.w <= a.w0 * T.rout) turn(a)
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
    S.F[f].g += e * T.inc
  }
  for (const c of S.C) {
    const cap = 100 + c.e * 10
    if (c.p < cap) c.p += (cap - c.p) * T.grow
  }

  // 2. road battles, then movement
  roads()

  // 3. merge friendly stacks that share a node
  for (let i = 0; i < NC; i++) {
    const here = at(i)
    for (let u = 0; u < here.length; u++) {
      for (let v = u + 1; v < here.length; v++) {
        if (here[u].o !== here[v].o || here[v].w <= 0) continue
        here[u].w += here[v].w; here[u].w0 += here[v].w0; here[v].w = 0
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
      boom(c.x, c.y, 1)
      shattered(here)
      for (const a of here) {                  // AI routs to a quiet neighbour
        if (!S.F[a.o].ai || a.w <= 0.5 || a.w > a.w0 * T.rout) continue
        const safe = c.n.find(j => S.C[j].o === a.o && !at(j).some(b => b.o !== a.o))
        if (safe !== undefined) { a.t = safe; a.pr = 0; a.w0 = a.w }
      }
      S.A = S.A.filter(a => a.w > 0.5)
      continue
    }

    const f = sides[0]
    if (c.o === f) continue

    // 5. siege
    const force = here.reduce((n, a) => n + a.w, 0)
    const loss = T.sgLoss * c.d
    for (const a of here) a.w -= loss * (a.w / force)
    c.s -= force * T.sgDmg * (1 + S.tick / T.escal)   // long wars grind walls faster
    if (c.s <= 0) {
      const old = c.o
      c.o = f
      c.p *= T.sack
      c.s = c.m * T.garrison
      for (const a of at(i)) a.w0 = a.w
      boom(c.x, c.y, 2, S.F[f].c)
      say(S.F[f].em + ' ' + c.nm + ' falls' + (old >= 0 ? ' from ' + S.F[old].em : ''))
    }
    S.A = S.A.filter(a => a.w > 0.5)
  }

  // 6. walls slowly mend where nobody is besieging
  for (let i = 0; i < NC; i++) {
    const c = S.C[i]
    if (c.s < c.m && !at(i).some(a => a.o !== c.o)) c.s = Math.min(c.m, c.s + T.mend)
  }

  // 7. victory
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
