import { S } from './state.js'
import { REALMS, segDist } from './map.js'

// The backdrop is baked once per map into an offscreen canvas, so detail here
// costs nothing per frame — the live layer pays a single drawImage.
const BX = -280, BY = -170, BW = 1560, BH = 1090, Q = 1.5
const bg = document.createElement('canvas')
export const blit = x => x.drawImage(bg, BX, BY, BW, BH)

// terrain runs its own stream: borrowing state.js's rnd() would drift the
// browser's simulation away from the headless harnesses
let t0 = 1
const rn = () => (t0 = (Math.imul(t0, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff
const rf = (a, b) => a + rn() * (b - a)

const N = 30                 // coastline samples
const R = []                 // radius per sample, around the city centroid
let cx = 0, cy = 0, lakes = []
export const stars = []      // drawn live in screen space, so no window is ever starless

const radAt = a => R[((((a / 6.2832 * N) | 0) % N) + N) % N]
const inside = (px, py, m) => Math.hypot(px - cx, py - cy) + m < radAt(Math.atan2(py - cy, px - cx))

const pt = k => {
  const a = k / N * 6.2832, r = R[(k % N + N) % N]
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
}

// closed curve through the ring, quadratics hinged on the midpoints
function coast (g) {
  g.beginPath()
  const [ax, ay] = pt(-1), [bx, by] = pt(0)
  g.moveTo((ax + bx) / 2, (ay + by) / 2)
  for (let k = 0; k < N; k++) {
    const [px, py] = pt(k), [qx, qy] = pt(k + 1)
    g.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2)
  }
  g.closePath()
}

// the island is the map's own convex spread, pushed out by a wandering margin
function shape () {
  cx = cy = 0
  for (const c of S.C) { cx += c.x; cy += c.y }
  cx /= S.C.length; cy /= S.C.length
  const m = []
  for (let k = 0; k < N; k++) {
    const a = k / N * 6.2832, co = Math.cos(a), si = Math.sin(a)
    let s = 0
    for (const c of S.C) s = Math.max(s, (c.x - cx) * co + (c.y - cy) * si)
    R[k] = s                       // convex support: contains every city by construction
    m[k] = rf(24, 70)
  }
  for (let p = 0; p < 3; p++)      // smooth it, so the coast undulates instead of jitters
    for (let k = 0; k < N; k++) m[k] = (m[(k + N - 1) % N] + 2 * m[k] + m[(k + 1) % N]) / 4
  // the support of a rectangular city cloud dips on the axes, which would give
  // every island the same rounded-square outline — pad the dips back out
  let mx = 0
  for (let k = 0; k < N; k++) mx = Math.max(mx, R[k])
  for (let k = 0; k < N; k++) R[k] += (mx - R[k]) * 0.3 + m[k]
}

const grad = (g, y0, y1, c0, c1) => {
  const q = g.createLinearGradient(0, y0, 0, y1)
  q.addColorStop(0, c0); q.addColorStop(1, c1)
  return q
}

export function paint () {
  t0 = ((S.seed | 0) ^ 0x5f3759df) & 0x7fffffff || 1
  shape()

  stars.length = 0
  for (let k = 0; k < 46; k++) stars.push(rn(), rn(), rf(0.12, 0.46))

  bg.width = BW * Q; bg.height = BH * Q
  const g = bg.getContext('2d')
  g.setTransform(Q, 0, 0, Q, -BX * Q, -BY * Q)

  // rainbow first, arcing through the sky above the island — the realm palette
  // is already ROYGB-ish, so the sky is coloured by the factions themselves
  g.globalAlpha = 0.28; g.lineWidth = 16
  REALMS.forEach(([, c], i) => {
    g.strokeStyle = grad(g, cy - 200, cy + 160, c, c + '00')   // legs fade, no hard ends
    g.beginPath(); g.arc(cx, cy + 300, 760 - i * 18, 3.1416, 6.2832); g.stroke()
  })
  g.globalAlpha = 1

  // the underside: a jagged keel hanging off the southern rim
  const k0 = Math.round(0.55 / 6.2832 * N), k1 = Math.round(2.6 / 6.2832 * N)
  const tx = cx + rf(-60, 60), ty = cy + radAt(1.5708) + 210
  const [sx, sy] = pt(k0), [ex, ey] = pt(k1)
  g.beginPath(); g.moveTo(sx, sy)
  for (let k = k0 + 1; k <= k1; k++) { const [px, py] = pt(k); g.lineTo(px, py) }
  g.lineTo(ex + (tx - ex) * 0.45 - 30, ey + (ty - ey) * 0.5)
  g.lineTo(tx, ty)
  g.lineTo(sx + (tx - sx) * 0.5 + 34, sy + (ty - sy) * 0.46)
  g.closePath()
  g.fillStyle = grad(g, cy + 150, ty, '#332b4e', '#0b0a1200')
  g.fill()

  for (let k = 0; k < 3; k++) {    // rubble adrift below it
    g.globalAlpha = rf(0.25, 0.55); g.fillStyle = '#2a2440'
    g.beginPath(); g.ellipse(tx + rf(-160, 160), ty + rf(-40, 90), rf(6, 15), rf(4, 8), rf(-0.4, 0.4), 0, 6.2832)
    g.fill()
  }
  g.globalAlpha = 1

  // cliff band: stroke the coast wide, then fill over it — the half of the
  // stroke left outside the fill is the rock face
  coast(g); g.strokeStyle = '#2a2438'; g.lineWidth = 14; g.stroke()
  g.fillStyle = grad(g, cy - 320, cy + 340, '#1d2c26', '#151f2b')
  g.fill()

  g.save(); coast(g); g.clip()      // a thin shoreline just inside the rim
  coast(g); g.strokeStyle = '#3c5a48'; g.lineWidth = 3; g.stroke()
  g.restore()

  // peaks and lakes take the ground no road or city is using. Clearance is
  // sized to the feature, or a wide mountain placed by its base point still
  // spills its flank across a road.
  lakes = []
  const put = []
  const free = (px, py, ext) => {
    if (!inside(px, py, 70)) return 0
    for (const c of S.C) if (Math.hypot(c.x - px, c.y - py) < 54 + ext) return 0
    for (const [i, j] of S.E) if (segDist({ x: px, y: py }, S.C[i], S.C[j]) < 24 + ext * 0.42) return 0
    for (const q of put) if (Math.hypot(q[0] - px, q[1] - py) < 78) return 0
    return 1
  }
  let n = 0
  // alternate the two kinds, so a cramped map still gets some of each rather
  // than spending every attempt on mountains
  for (let k = 0; k < 420 && (n < 5 || lakes.length < 4); k++) {
    const px = rf(cx - 470, cx + 470), py = rf(cy - 340, cy + 340)
    if (n < 5 && ((k & 1) || lakes.length > 3)) {
      const h = rf(24, 42), w = h * rf(0.85, 1.2), d = w * rf(0.7, 1.1) * (rn() < 0.5 ? -1 : 1)
      if (!free(px, py, Math.max(w, Math.abs(d) + w * 0.7))) continue
      put.push([px, py]); n++
      peak(g, px, py, h, w, d)
    } else if (lakes.length < 4) {
      const rx = rf(26, 46), ry = rf(13, 22)
      if (!free(px, py, rx)) continue
      put.push([px, py])
      lakes.push({ x: px, y: py, rx, ry, ph: rf(0, 6.3) })
    }
  }
  for (const L of lakes) {
    g.beginPath(); g.ellipse(L.x, L.y, L.rx, L.ry, 0, 0, 6.2832)
    g.fillStyle = '#1b3350'; g.fill()
    g.strokeStyle = '#2a4d72'; g.lineWidth = 2; g.stroke()
    g.globalAlpha = 0.35; g.fillStyle = '#3c6d9c'
    g.beginPath(); g.ellipse(L.x - L.rx * 0.15, L.y - L.ry * 0.3, L.rx * 0.6, L.ry * 0.4, 0, 0, 6.2832)
    g.fill(); g.globalAlpha = 1
  }
}

const tri = (g, px, py, w, h, c) => {
  g.fillStyle = c
  g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - h); g.lineTo(px + w, py)
  g.closePath(); g.fill()
}

function peak (g, px, py, h, w, d) {
  tri(g, px + d, py, w * 0.7, h * rf(0.5, 0.72), '#262238')   // shoulder, behind
  tri(g, px, py, w, h, '#2b2740')
  g.fillStyle = '#3a3556'                                     // the lit face
  g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - h); g.lineTo(px - w * 0.12, py)
  g.closePath(); g.fill()
  const s = h * 0.26
  g.fillStyle = '#7d84a8'          // snow, kept dim: a road has to stay legible over it
  g.beginPath(); g.moveTo(px - s * 0.6, py - h + s); g.lineTo(px, py - h); g.lineTo(px + s * 0.6, py - h + s)
  g.closePath(); g.fill()
}

// the one live part of the backdrop: slow highlight bands drifting on the water.
// Capped at 0.15 alpha so it can never compete with a red siege pulse.
export function shimmer (x) {
  for (const L of lakes) {
    const t = S.elapsed * 0.35 + L.ph
    x.globalAlpha = 0.1 + 0.05 * Math.sin(t * 1.7)
    x.strokeStyle = '#9fd8ff'; x.lineWidth = 2
    for (let k = 0; k < 2; k++) {
      const o = (k - 0.5) * L.ry * 0.9
      const w = L.rx * 0.62 * Math.sqrt(1 - (o / L.ry) ** 2)
      const d = Math.sin(t + k * 2.2) * L.rx * 0.14
      x.beginPath(); x.moveTo(L.x + d - w, L.y + o); x.lineTo(L.x + d + w, L.y + o); x.stroke()
    }
  }
  x.globalAlpha = 1
}
