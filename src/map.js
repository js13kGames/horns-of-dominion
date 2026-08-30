import { S, W, H, NC, T, applyDiff, setSeed, rnd, ri, rf, pick, dist } from './state.js'

const PRE = 'Prism Glim Star Moon Cloud Dew Sil Aur Lume Nim Sable Frost Ember Whis Thistle Bram Cinder Halo Zeph Opal Mir Vesp'.split(' ')
const SUF = 'hold fell gate spire mere reach crest vale wick hallow'.split(' ')

export const REALMS = [
  ['Crimson Mane', '#ff5f6d', '🔴'],
  ['Sunmane Reach', '#ffb03a', '🟠'],
  ['Verdant Glade', '#57d98a', '🟢'],
  ['Azure Spire', '#4fb8ff', '🔵'],
  ['Violet Veil', '#b57bff', '🟣']
]

const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x)
const crosses = (a, b, c, d) => ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d)

// distance from point p to segment ab
export function segDist (p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y
  const l = dx * dx + dy * dy || 1
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

function legal (i, j) {
  const C = S.C, a = C[i], b = C[j]
  for (const [u, v] of S.E) {
    if (u === i || u === j || v === i || v === j) continue
    if (crosses(a, b, C[u], C[v])) return 0
  }
  for (let k = 0; k < NC; k++) {
    if (k !== i && k !== j && segDist(C[k], a, b) < 30) return 0
  }
  return 1
}

function link (i, j) {
  S.C[i].n.push(j)
  S.C[j].n.push(i)
  S.E.push([i, j])
}

export function genMap (sd) {
  setSeed(sd)
  S.seed = sd
  const C = S.C = []
  S.E = []
  S.A = []
  S.fx = []
  S.log = []
  S.over = 0; S.sel = null; S.aim = 0; S.tick = 0; S.elapsed = 0; S.speed = 1

  // best-candidate sampling: even spread without min-distance failures
  for (let i = 0; i < NC; i++) {
    let bx = 0, by = 0, bd = -1
    for (let k = 0; k < 24; k++) {
      const x = rf(80, W - 80), y = rf(96, H - 70)
      let d = 1e9
      for (const c of C) d = Math.min(d, (c.x - x) ** 2 + (c.y - y) ** 2)
      if (d > bd) { bd = d; bx = x; by = y }
    }
    C.push({ x: bx, y: by, o: -1, n: [] })
  }

  // names: unique prefix per city
  const pre = PRE.slice()
  for (let i = pre.length - 1; i > 0; i--) { const j = ri(0, i);[pre[i], pre[j]] = [pre[j], pre[i]] }
  C.forEach((c, i) => { c.nm = pre[i] + pick(SUF) })

  // planar-ish edges: up to 3 nearest neighbours each, no crossings
  for (let i = 0; i < NC; i++) {
    const near = C.map((c, j) => j).filter(j => j !== i).sort((a, b) => dist(C[i], C[a]) - dist(C[i], C[b]))
    for (const j of near) {
      if (C[i].n.length >= 3) break
      if (C[i].n.includes(j) || C[j].n.length >= 4) continue
      if (legal(i, j)) link(i, j)
    }
  }

  // connect stragglers into one component
  const root = new Array(NC).fill(0).map((_, i) => i)
  const find = i => root[i] === i ? i : (root[i] = find(root[i]))
  const join = (i, j) => { root[find(i)] = find(j) }
  for (const [i, j] of S.E) join(i, j)
  for (;;) {
    const comps = new Set(C.map((_, i) => find(i)))
    if (comps.size < 2) break
    let bi = -1, bj = -1, bd = 1e9
    for (let i = 0; i < NC; i++) {
      for (let j = i + 1; j < NC; j++) {
        if (find(i) === find(j)) continue
        const d = dist(C[i], C[j])
        if (d < bd) { bd = d; bi = i; bj = j }
      }
    }
    link(bi, bj); join(bi, bj)
  }

  // stats
  for (const c of C) {
    c.p = ri(40, 200)
    c.d = ri(2, 10)
    c.e = ri(3, 12)
    c.m = ri(20, 80)
    c.s = c.m
    c.mu = c.rp = c.oc = 0   // mustering, walls owed, occupation
  }

  // five capitals, as far apart as the graph allows
  const caps = [ri(0, NC - 1)]
  while (caps.length < 5) {
    let bi = 0, bd = -1
    for (let i = 0; i < NC; i++) {
      if (caps.includes(i)) continue
      const d = Math.min(...caps.map(k => dist(C[i], C[k])))
      if (d > bd) { bd = d; bi = i }
    }
    caps.push(bi)
  }
  for (let i = 4; i > 0; i--) { const j = ri(0, i);[caps[i], caps[j]] = [caps[j], caps[i]] }
  caps.forEach((k, f) => {
    const c = C[k]
    c.o = f; c.cap = 1; c.e += 4; c.m += 20; c.s = c.m; c.d += 2; c.p += 40
  })

  // grow realms outward along the graph, one city per faction per pass
  let left = NC - 5
  const ord = [0, 1, 2, 3, 4]
  while (left > 0) {
    let claimed = 0
    for (let i = 4; i > 0; i--) { const j = ri(0, i);[ord[i], ord[j]] = [ord[j], ord[i]] }
    for (let k = 0; k < 5 && left > 0; k++) {
      const f = ord[k]                  // reshuffle draft order each pass, so nobody is favoured
      let best = -1, bd = 1e9
      for (const c of C) {
        if (c.o !== f) continue
        for (const j of c.n) {
          if (C[j].o >= 0) continue
          const d = dist(C[j], C[caps[f]])
          if (d < bd) { bd = d; best = j }
        }
      }
      if (best < 0) continue
      C[best].o = f; left--; claimed++
    }
    if (!claimed) { // disconnected leftovers: nearest capital wins
      for (const c of C) {
        if (c.o >= 0) continue
        let bf = 0, bd = 1e9
        caps.forEach((k, f) => { const d = dist(c, C[k]); if (d < bd) { bd = d; bf = f } })
        c.o = bf
      }
      break
    }
  }

  S.F = REALMS.map(([nm, c, em], i) => ({ nm, c, em, ai: i !== S.me, g: 60, alive: 1 }))
  S.stat = { took: 0, lost: 0, slain: 0, most: 0 }
  applyDiff()
  return S
}
