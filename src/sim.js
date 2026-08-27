import { S, T, WIN, NC, rf, dist, say, boom } from './state.js'

let nextId = 1
export const getArmy = id => S.A.find(a => a.id === id)
export const cnt = f => S.C.reduce((n, c) => n + (c.o === f), 0)
const at = i => S.A.filter(a => a.t < 0 && a.a === i)

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
  else S.A.push({ id: nextId++, o: f, w: T.raiseW, a: i, t: -1, pr: 0, w0: T.raiseW })
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

export function order (a, j) {
  if (!a || a.t >= 0 || !S.C[a.a].n.includes(j)) return 0
  a.t = j; a.pr = 0
  return 1
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

  // 2. movement
  for (const a of S.A) {
    if (a.t < 0) continue
    a.pr += T.speed / dist(S.C[a.a], S.C[a.t])
    if (a.pr >= 1) { a.a = a.t; a.t = -1; a.pr = 0 }
  }

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
      const pow = {}
      for (const a of here) pow[a.o] = (pow[a.o] || 0) + a.w
      const total = Object.values(pow).reduce((x, y) => x + y, 0)
      for (const a of here) {
        const enemy = total - pow[a.o]
        let dmg = T.atk * enemy * rf(0.8, 1.2)
        if (c.o !== a.o && sides.includes(c.o)) dmg += c.d * 0.5   // garrison joins in
        a.w -= dmg * (a.w / pow[a.o])
      }
      boom(c.x, c.y, 1)
      for (const a of here) {
        if (a.w > 0.5 || !S.F[a.o].ai) continue
        say('💀 ' + S.F[a.o].em + ' host shattered at ' + c.nm)
      }
      // AI routs when its stack is spent
      for (const a of here) {
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
    c.s -= force * T.sgDmg * (1 + S.tick / T.escal)   // long wars grind walls faster, no eternal deadlock
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
