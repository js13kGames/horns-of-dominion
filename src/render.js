import { S, W, H, T } from './state.js'
import { getArmy, prog, hop, seeCity, seeRoad, seeArmy, besieged, unrest, active, canRaise, tired } from './sim.js'
import { blit, GROUND } from './terrain.js'

export const cv = document.getElementById('cv')
const x = cv.getContext('2d')
export const V = { s: 1, ox: 0, oy: 0 }

export function resize () {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const w = innerWidth, h = innerHeight
  cv.width = w * dpr; cv.height = h * dpr
  x.setTransform(dpr, 0, 0, dpr, 0, 0)
  // the land fills the frame, so the map wants the frame: no sky to leave and
  // nothing below to make room for, only a margin so no city sits on the edge
  V.s = Math.min(w / W, h / H) * 0.92
  V.ox = (w - W * V.s) / 2
  V.oy = (h - H * V.s) / 2
}
export const toWorld = (px, py) => ({ x: (px - V.ox) / V.s, y: (py - V.oy) / V.s })

export const cityR = c => 13 + Math.min(c.p, 260) / 20
const col = o => o < 0 ? '#6b6482' : S.F[o].c

// where an army logically sits: lerped along its road with sub-tick progress,
// or fanned around its node inside its owner's slot. `sp` is the host's place
// in its group, counted from the middle, and means px on a road and slots at a
// node.
function spot (a, sp) {
  const c = S.C[a.a]
  if (a.t >= 0) {
    const d = S.C[a.t], L = Math.hypot(d.x - c.x, d.y - c.y) || 1, pr = prog(a), o = sp * 13
    return {
      x: c.x + (d.x - c.x) * pr - (d.y - c.y) / L * o,
      y: c.y + (d.y - c.y) * pr + (d.x - c.x) / L * o
    }
  }
  // fan by owner around the city, then across that slot by whoever else of
  // theirs is resting here — three kinds that will not merge, or the halves of
  // a split. sideways, not outward: the strength number hangs 18px under its
  // own disc, so stacking along the spoke drops each label onto the disc behind
  const r = cityR(c) + 17, ang = a.o * 1.2566 - 1.9 + sp * 26 / r
  return { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r }
}

// render position eases toward the logical one, which absorbs every jump the
// simulation makes: arriving at a node, re-slotting a fan, merging a stack
export function place (dt) {
  const grp = {}
  for (const a of S.A) {
    // 'n' keeps a node key off a road key: city 5 of realm 2 is not the road 5-2
    const k = a.t < 0 ? 'n' + a.a + ':' + a.o                    // resting: by owner
      : a.a < a.t ? a.a + ':' + a.t : a.t + ':' + a.a            // marching: by road
    ;(grp[k] || (grp[k] = [])).push(a)
  }
  const sp = new Map()
  for (const k in grp) {
    const g = grp[k].sort((x, y) => x.id - y.id)
    g.forEach((a, i) => sp.set(a, i - (g.length - 1) / 2))
  }
  const e = 1 - Math.pow(0.0015, dt)
  for (const a of S.A) {
    const p = spot(a, sp.get(a) || 0)
    if (a.rx === undefined) { a.rx = p.x; a.ry = p.y }
    else { a.rx += (p.x - a.rx) * e; a.ry += (p.y - a.ry) * e }
  }
}

function ring (cx, cy, r, frac, c, w) {
  x.beginPath(); x.arc(cx, cy, r, -1.5708, -1.5708 + 6.2832 * frac)
  x.strokeStyle = c; x.lineWidth = w; x.stroke()
}

function label (t, cx, cy, size, c, weight) {
  x.font = (weight || '') + size + 'px ui-sans-serif,system-ui,sans-serif'
  x.textAlign = 'center'; x.textBaseline = 'middle'
  x.shadowColor = '#100a04'; x.shadowBlur = 4    // a halo, or none of this reads on grass
  x.fillStyle = c; x.fillText(t, cx, cy)
  x.shadowBlur = 0
}

export function draw (dt) {
  place(dt)
  const w = cv.width, h = cv.height
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0)
  x.fillStyle = GROUND; x.fillRect(0, 0, w, h)   // more of the same field, past the bake
  x.restore()
  x.save(); x.translate(V.ox, V.oy); x.scale(V.s, V.s)
  blit(x)

  // edges
  x.lineWidth = 2; x.strokeStyle = '#d3b083'
  for (const [i, j] of S.E) {
    const a = S.C[i], b = S.C[j]
    x.setLineDash(seeRoad(i, j) ? [] : [3, 5])   // fogged roads go dotted, never dim
    x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke()
  }
  x.setLineDash([])

  // march highlight: neighbours of a selected army's node
  const sel = S.sel
  if (sel && sel.k === 'a') {
    const a = getArmy(sel.i)
    if (a) {
      if (a.t >= 0) {                                  // the way back
        const c = S.C[a.a]
        x.beginPath(); x.arc(c.x, c.y, cityR(c) + 9, 0, 6.2832)
        x.fillStyle = '#ffffff12'; x.fill()
      }
      if (a.dst >= 0) {                                // the road still to walk
        let at = a.t >= 0 ? a.t : a.a, n = 0, p = { x: a.rx, y: a.ry }
        // each leg rides 6px off its own road, on the left of the march: dashes
        // laid straight on the road were lost in it, and a plain vertical offset
        // would put a north-south leg right back on top of the one road it hides
        const leg = q => {
          const L = Math.hypot(q.x - p.x, q.y - p.y) || 1
          const ox = (p.y - q.y) / L * 6, oy = (q.x - p.x) / L * 6
          x.moveTo(p.x + ox, p.y + oy); x.lineTo(q.x + ox, q.y + oy); p = q
        }
        x.setLineDash([2, 6]); x.lineWidth = 2; x.strokeStyle = '#e8e4f5aa'
        x.beginPath(); leg(S.C[at])
        while (at !== a.dst && n++ < 20) {
          const h = hop(at, a.dst)
          if (h < 0) break
          leg(S.C[h]); at = h
        }
        x.stroke(); x.setLineDash([])
        const d = S.C[a.dst]
        x.beginPath(); x.arc(d.x, d.y, cityR(d) + 9, 0, 6.2832)
        x.fillStyle = '#ffffff18'; x.fill()
      }
    }
  }

  // while mobilizing, every city is a legal destination — say so
  if (active()) {
    x.setLineDash([3, 3]); x.lineWidth = 1.5; x.strokeStyle = '#ffffff55'
    for (const c of S.C) { x.beginPath(); x.arc(c.x, c.y, cityR(c) + 7, 0, 6.2832); x.stroke() }
    x.setLineDash([])
  }

  // cities
  for (let i = 0; i < S.C.length; i++) {
    const c = S.C[i], r = cityR(c), lit = seeCity(i), k = lit ? col(c.o) : '#4a4560'
    x.beginPath(); x.arc(c.x, c.y, r, 0, 6.2832)
    x.fillStyle = '#171426'; x.fill()
    x.strokeStyle = k; x.lineWidth = 2.5; x.stroke()
    if (lit) ring(c.x, c.y, r + 5, Math.max(0, c.s) / c.m, k + '99', 3)
    label(lit && c.cap ? '👑' : '🏰', c.x, c.y + 1, r * 1.1)   // a crown would leak intel
    if (c.mu && c.o === S.me) {
      ring(c.x, c.y, r + 9, 1 - c.mu / T.muster, '#ffd76a', 2)
      label('⏳', c.x + r + 6, c.y - r - 2, 12)
    }
    if (lit && unrest(i)) label('✊', c.x - r - 6, c.y - r - 2, 12)   // still being pacified
    if (lit && c.sp) label(T.K[c.sp][5], c.x + r + 6, c.y + r + 1, 12)   // breeds these
    // mirrors the specialist badge: this one can raise something right now
    if (canRaise(i, S.me) || (c.sp && canRaise(i, S.me, c.sp))) label('⬆️', c.x - r - 6, c.y + r + 1, 12)
    if (lit && besieged(i)) {                  // a city under attack keeps pulsing
      const q = 0.5 + 0.5 * Math.sin(S.elapsed * 6)
      x.globalAlpha = 0.25 + q * 0.55
      x.beginPath(); x.arc(c.x, c.y, r + 11 + q * 5, 0, 6.2832)
      x.strokeStyle = '#ff5a5a'; x.lineWidth = 2.5; x.stroke()
      x.globalAlpha = 1
    }
    label(c.nm, c.x, c.y + r + 16, 11, lit ? '#fff' : '#e8e4f5aa')
    if (sel && sel.k === 'c' && sel.i === i) {
      x.setLineDash([4, 4]); x.beginPath(); x.arc(c.x, c.y, r + 11, 0, 6.2832)
      x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); x.setLineDash([])
    }
  }

  // armies
  for (let i = 0; i < S.A.length; i++) {
    const a = S.A[i]
    if (!seeArmy(a)) continue                      // hidden hosts are not drawn
    const p = { x: a.rx, y: a.ry }, k = col(a.o)
    x.beginPath(); x.arc(p.x, p.y, 12, 0, 6.2832)
    x.fillStyle = '#0f0d18'; x.fill()
    x.strokeStyle = k; x.lineWidth = 2; x.stroke()
    label(T.K[a.k][5], p.x, p.y + 1, 13)
    label(a.w | 0, p.x, p.y + 18, 11, k, 'bold ')
    // fatigue, in the same amber a muster wears: an arc that fills as the host
    // tires and closes on the tick it is winded. A fresh host draws nothing, so
    // the board only carries the ring where it is telling you something
    if (a.fg) ring(p.x, p.y, 15, a.fg / 100, tired(a) ? '#ff9a3c' : '#ffd76a99', 2)
    if (sel && sel.k === 'a' && sel.i === a.id) {
      x.setLineDash([3, 3]); x.beginPath(); x.arc(p.x, p.y, 17, 0, 6.2832)
      x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); x.setLineDash([])
    }
  }

  // whoever is locked in the selected host's fight
  if (sel && sel.k === 'a') {
    const a = getArmy(sel.i)
    if (a && a.eg) {
      x.setLineDash([3, 3]); x.lineWidth = 2; x.strokeStyle = '#ff5a5a'
      for (const id of a.eg) {
        const b = getArmy(id)
        if (b && seeArmy(b)) { x.beginPath(); x.arc(b.rx, b.ry, 16, 0, 6.2832); x.stroke() }
      }
      if (a.sg >= 0) {
        const c = S.C[a.sg]
        x.beginPath(); x.arc(c.x, c.y, cityR(c) + 7, 0, 6.2832); x.stroke()
      }
      x.setLineDash([])
    }
  }

  // transient effects
  for (const f of S.fx) {
    f.l -= dt * 1.6
    if (f.l <= 0) continue
    const t = 1 - f.l
    if (f.k === 1) { // battle
      label('⚔️', f.x, f.y - 26 - t * 10, 18 + f.l * 6)
    } else {         // capture shockwave
      x.beginPath(); x.arc(f.x, f.y, 12 + t * 70, 0, 6.2832)
      x.strokeStyle = f.c + Math.max(0, (f.l * 255) | 0).toString(16).padStart(2, '0')
      x.lineWidth = 3; x.stroke()
    }
  }
  S.fx = S.fx.filter(f => f.l > 0)

  x.restore()
}
