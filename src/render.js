import { S, W, H } from './state.js'
import { getArmy } from './sim.js'

export const cv = document.getElementById('cv')
const x = cv.getContext('2d')
export const V = { s: 1, ox: 0, oy: 0 }

export function resize () {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const w = innerWidth, h = innerHeight
  cv.width = w * dpr; cv.height = h * dpr
  x.setTransform(dpr, 0, 0, dpr, 0, 0)
  V.s = Math.min(w / W, h / H)
  V.ox = (w - W * V.s) / 2
  V.oy = (h - H * V.s) / 2
}
export const toWorld = (px, py) => ({ x: (px - V.ox) / V.s, y: (py - V.oy) / V.s })

export const cityR = c => 13 + Math.min(c.p, 260) / 20
const col = o => o < 0 ? '#6b6482' : S.F[o].c

// where an army sits: lerped along its edge, or fanned around its node by owner
export function armyPos (a) {
  const c = S.C[a.a]
  if (a.t >= 0) {
    const d = S.C[a.t]
    return { x: c.x + (d.x - c.x) * a.pr, y: c.y + (d.y - c.y) * a.pr }
  }
  const ang = a.o * 1.2566 - 1.9
  const r = cityR(c) + 15
  return { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r }
}

function ring (cx, cy, r, frac, c, w) {
  x.beginPath(); x.arc(cx, cy, r, -1.5708, -1.5708 + 6.2832 * frac)
  x.strokeStyle = c; x.lineWidth = w; x.stroke()
}

function label (t, cx, cy, size, c, weight) {
  x.font = (weight || '') + size + 'px ui-sans-serif,system-ui,sans-serif'
  x.fillStyle = c; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillText(t, cx, cy)
}

export function draw (dt) {
  const w = cv.width, h = cv.height
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0)
  x.fillStyle = '#0b0a12'; x.fillRect(0, 0, w, h); x.restore()
  x.save(); x.translate(V.ox, V.oy); x.scale(V.s, V.s)

  // edges
  x.lineWidth = 2; x.strokeStyle = '#26213c'
  for (const [i, j] of S.E) {
    const a = S.C[i], b = S.C[j]
    x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke()
  }

  // march highlight: neighbours of a selected army's node
  const sel = S.sel
  if (sel && sel.k === 'a') {
    const a = getArmy(sel.i)
    if (a && a.t < 0) {
      for (const j of S.C[a.a].n) {
        const c = S.C[j]
        x.beginPath(); x.arc(c.x, c.y, cityR(c) + 9, 0, 6.2832)
        x.fillStyle = '#ffffff12'; x.fill()
      }
    }
  }

  // cities
  for (let i = 0; i < S.C.length; i++) {
    const c = S.C[i], r = cityR(c), k = col(c.o)
    x.beginPath(); x.arc(c.x, c.y, r, 0, 6.2832)
    x.fillStyle = '#171426'; x.fill()
    x.strokeStyle = k; x.lineWidth = 2.5; x.stroke()
    ring(c.x, c.y, r + 5, Math.max(0, c.s) / c.m, k + '99', 3)
    label(c.cap ? '👑' : '🏰', c.x, c.y + 1, r * 1.1)
    label(c.nm, c.x, c.y + r + 16, 11, '#e8e4f5cc')
    label('👥' + (c.p | 0) + '  🛡' + (c.s | 0), c.x, c.y + r + 28, 10, '#e8e4f588')
    if (sel && sel.k === 'c' && sel.i === i) {
      x.setLineDash([4, 4]); x.beginPath(); x.arc(c.x, c.y, r + 11, 0, 6.2832)
      x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); x.setLineDash([])
    }
  }

  // armies
  for (let i = 0; i < S.A.length; i++) {
    const a = S.A[i], p = armyPos(a), k = col(a.o)
    x.beginPath(); x.arc(p.x, p.y, 12, 0, 6.2832)
    x.fillStyle = '#0f0d18'; x.fill()
    x.strokeStyle = k; x.lineWidth = 2; x.stroke()
    label('🦄', p.x, p.y + 1, 13)
    label(a.w | 0, p.x, p.y + 18, 11, k, 'bold ')
    if (sel && sel.k === 'a' && sel.i === a.id) {
      x.setLineDash([3, 3]); x.beginPath(); x.arc(p.x, p.y, 17, 0, 6.2832)
      x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); x.setLineDash([])
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
