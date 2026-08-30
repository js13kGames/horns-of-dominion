import { S } from './state.js'
import { segDist } from './map.js'

// The backdrop is baked once per map into an offscreen canvas, so detail here
// costs nothing per frame — the live layer pays a single drawImage.
const BX = -160, BY = -120, BW = 1320, BH = 1120, Q = 1.5
const bg = document.createElement('canvas')
export const blit = x => x.drawImage(bg, BX, BY, BW, BH)

// terrain runs its own stream: borrowing state.js's rnd() would drift the
// browser's simulation away from the headless harnesses
let t0 = 1
const rn = () => (t0 = (Math.imul(t0, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff
const rf = (a, b) => a + rn() * (b - a)

const N = 300                // coastline samples — a broken, rocky edge
const R = []                 // radius per sample, around the city centroid
let cx = 0, cy = 0, TR = [], CL = []
export const stars = []      // drawn live in screen space, so no window is ever starless

const radAt = a => R[((((a / 6.2832 * N) | 0) % N) + N) % N]
const inside = (px, py, m) => Math.hypot(px - cx, py - cy) + m < radAt(Math.atan2(py - cy, px - cx))

const pt = k => {
  const a = k / N * 6.2832, r = R[(k % N + N) % N]
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
}

// straight segments, not curves — the coast is meant to look broken off
function coast (g) {
  g.beginPath()
  const [ax, ay] = pt(0)
  g.moveTo(ax, ay)
  for (let k = 1; k < N; k++) { const [px, py] = pt(k); g.lineTo(px, py) }
  g.closePath()
}

// a ring of n random values, read back smoothly at any of the N samples —
// three of these at different n give the coast headlands, coves and grit
const ring = (n, lo, hi) => { const v = []; for (let k = 0; k < n; k++) v[k] = rf(lo, hi); return v }
const at = (v, k) => {
  const t = k / N * v.length, i = t | 0, u = (1 - Math.cos((t - i) * 3.1416)) / 2
  return v[i % v.length] * (1 - u) + v[(i + 1) % v.length] * u
}

// the island is the map's own convex spread, pushed out by a wandering margin
function shape () {
  cx = cy = 0
  for (const c of S.C) { cx += c.x; cy += c.y }
  cx /= S.C.length; cy /= S.C.length
  const o1 = ring(20, 26, 112), o2 = ring(70, -22, 22), o3 = ring(N, -5, 5)
  const co = [], sup = []
  for (let k = 0; k < N; k++) {
    const a = k / N * 6.2832
    co[k] = Math.cos(a)
    let s = 0
    for (const c of S.C) s = Math.max(s, (c.x - cx) * co[k] + (c.y - cy) * Math.sin(a))
    sup[k] = s                     // convex support in this direction
  }
  // The polar support curve bulges far past the cities between the axes, which
  // is where all the wasted space came from. The hull it envelopes does not:
  // a ray hits the hull at min(support(f) / cos(t - f)) over every supporting
  // line, so this hugs the cities on every side.
  const M = 60, cs = []
  for (let q = -M; q <= M; q++) cs[q + M] = Math.cos(q / N * 6.2832)
  for (let k = 0; k < N; k++) {
    let r = 1e9
    for (let q = -M; q <= M; q++) r = Math.min(r, sup[(k + q + N) % N] / cs[q + M])
    // all the way to the hull is a rectangle, since that is how the cities are
    // sown — leaning partway back toward the support rounds the corners off
    // without giving back the wasted band north and south
    const skirt = at(o1, k) * (0.34 + 0.66 * Math.abs(co[k])) + at(o2, k) + o3[k]
    R[k] = r + (sup[k] - r) * 0.45 + Math.max(38, skirt)
  }
}

const grad = (g, y0, y1, c0, c1) => {
  const q = g.createLinearGradient(0, y0, 0, y1)
  q.addColorStop(0, c0); q.addColorStop(1, c1)
  return q
}

export function paint () {
  t0 = ((S.seed | 0) ^ 0x5f3759df) & 0x7fffffff || 1
  shape()

  stars.length = 0               // only high up, where the sunset has not reached
  for (let k = 0; k < 40; k++) stars.push(rn(), rn() * 0.38, rf(0.08, 0.3))

  bg.width = BW * Q; bg.height = BH * Q
  const g = bg.getContext('2d')
  g.setTransform(Q, 0, 0, Q, -BX * Q, -BY * Q)

  // the underside: bare rock under the whole lower rim, tapering to a cone.
  // The flanks bow out (u squared) so the rock hugs the island's full width
  // before it narrows.
  const half = N / 2 | 0
  const tx = cx + rf(-40, 40), ty = cy + radAt(1.5708) + 215
  const [sx, sy] = pt(0), [ex, ey] = pt(half)
  g.beginPath(); g.moveTo(sx, sy)
  for (let k = 1; k <= half; k++) { const [px, py] = pt(k); g.lineTo(px, py) }
  for (let q = 1; q < 6; q++) {          // down the left flank in rough steps
    const u = q / 6
    g.lineTo(ex + (tx - ex) * u * u + rf(-16, 16), ey + (ty - ey) * u ** 0.6 + rf(-14, 14))
  }
  g.lineTo(tx, ty)
  for (let q = 5; q > 0; q--) {          // and back up the right one
    const u = q / 6
    g.lineTo(sx + (tx - sx) * u * u + rf(-16, 16), sy + (ty - sy) * u ** 0.6 + rf(-14, 14))
  }
  g.closePath()
  g.fillStyle = grad(g, cy + radAt(1.5708) - 30, ty + 150, '#4a2c1a', '#1c0e0800')
  g.fill()

  for (let k = 0; k < 3; k++) {    // rubble adrift below it
    g.globalAlpha = rf(0.35, 0.7); g.fillStyle = '#3b2318'
    g.beginPath(); g.ellipse(tx + rf(-170, 170), ty + rf(-30, 90), rf(6, 15), rf(4, 8), rf(-0.4, 0.4), 0, 6.2832)
    g.fill()
  }
  g.globalAlpha = 1

  // cliff band: stroke the coast wide in rock, then fill the grass over it —
  // the half of the stroke left outside the fill is the rock face
  coast(g); g.strokeStyle = '#6d4830'; g.lineWidth = 16; g.stroke()
  g.fillStyle = grad(g, cy - 340, cy + 340, '#5b7a3c', '#31473a')
  g.fill()

  g.save(); coast(g); g.clip()      // the low sun catching the clifftop
  coast(g); g.strokeStyle = '#c9975a'; g.lineWidth = 4; g.stroke()
  g.restore()

  // Woods go down first and freely — they run under the roads and cities, which
  // are drawn over the backdrop anyway. Blobs are dropped one by one rather than
  // clipped, so no canopy is ever sliced off flat along the cliff.
  TR = []
  for (let k = 0, f = 0; k < 620 && f < 72; k++) {
    const px = rf(cx - 540, cx + 540), py = rf(cy - 420, cy + 420)
    if (!inside(px, py, -30)) continue
    f++
    wood(g, px, py, rf(30, 80))
  }

  // peaks are silhouettes, so they do keep their distance. Clearance is sized
  // to the feature, or a wide mountain placed by its base point still spills
  // its flank across a road.
  const put = []
  let n = 0
  for (let k = 0; k < 700 && n < 5; k++) {
    const px = rf(cx - 470, cx + 470), py = rf(cy - 320, cy + 320)
    const h = rf(38, 58), w = h * rf(0.75, 1), d = w * rf(0.5, 0.85) * (rn() < 0.5 ? -1 : 1)
    const ext = Math.max(w, Math.abs(d) + w * 0.7)
    if (!inside(px, py, 70)) continue
    if (!TR.some(t => Math.hypot(t[0] - px, t[1] - py) < 44)) continue   // stand it in a wood
    if (S.C.some(c => Math.hypot(c.x - px, c.y - py) < 44 + ext)) continue
    if (S.E.some(([i, j]) => segDist({ x: px, y: py }, S.C[i], S.C[j]) < 20 + ext * 0.35)) continue
    if (put.some(q => Math.hypot(q[0] - px, q[1] - py) < 74)) continue
    put.push([px, py]); n++
    peak(g, px, py, h, w, d)
  }

  CL = []                          // sunset cloud, drifting; drawn live, behind the land
  for (let k = 0; k < 8; k++) {
    const p = []
    for (let q = 3 + (rn() * 3 | 0); q--;) p.push([rf(-95, 95), rf(-14, 14), rf(40, 82), rf(15, 27)])
    CL.push([rf(0, 2100), rf(-140, 780), rf(3, 9), p])
  }
}

// clouds ride in front of the sky and behind the island, so they slide out of
// sight behind the land and back into the open on the far side
export function clouds (x) {
  for (const [ox, cy2, v, p] of CL) {
    const px = (ox + S.elapsed * v) % 2100 - 550
    for (const [dx, dy, rx, ry] of p) {
      x.globalAlpha = 0.15; x.fillStyle = '#6b4a70'
      x.beginPath(); x.ellipse(px + dx, cy2 + dy, rx, ry, 0, 0, 6.2832); x.fill()
      x.globalAlpha = 0.12; x.fillStyle = '#ffc79a'
      x.beginPath(); x.ellipse(px + dx, cy2 + dy - ry * 0.4, rx * 0.78, ry * 0.66, 0, 0, 6.2832); x.fill()
    }
  }
  x.globalAlpha = 1
}

const tri = (g, px, py, w, h, c) => {
  g.fillStyle = c
  g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - h); g.lineTo(px + w, py)
  g.closePath(); g.fill()
}

// canopy: every base laid down first, then every lit crown, so the stand reads
// as one wood rather than a pile of separate discs
function puff (g, b) {
  g.fillStyle = '#1e3a20'
  for (const [ax, ay, r] of b) { g.beginPath(); g.arc(ax, ay, r, 0, 6.2832); g.fill() }
  g.fillStyle = '#3a6330'
  for (const [ax, ay, r] of b) { g.beginPath(); g.arc(ax - r * 0.22, ay - r * 0.26, r * 0.7, 0, 6.2832); g.fill() }
}

function peak (g, px, py, h, w, d) {
  tri(g, px + d, py, w * 0.7, h * rf(0.5, 0.72), '#3d3038')   // shoulder, behind
  tri(g, px, py, w, h, '#4c3c3c')
  g.fillStyle = '#8a6446'                                     // the face the sun still finds
  g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - h); g.lineTo(px - w * 0.12, py)
  g.closePath(); g.fill()
  const s = h * 0.26
  g.fillStyle = '#c39a71'          // lit cap, kept dim: a road has to stay legible over it
  g.beginPath(); g.moveTo(px - s * 0.6, py - h + s); g.lineTo(px, py - h); g.lineTo(px + s * 0.6, py - h + s)
  g.closePath(); g.fill()
  const b = []                     // trees crowding the foot, so it rises out of the wood
  for (let k = 12 + (rn() * 8 | 0); k--;) {
    b.push([px + d * 0.4 + rf(-w * 1.4, w * 1.4), py + rf(1, 13), rf(8, 14)])
  }
  puff(g, b)
}

// a stand of trees: blobs are dropped, not clipped, so none is ever cut in half
function wood (g, px, py, sp) {
  const b = []
  for (let k = 10 + (rn() * 41 | 0); k--;) {
    const ax = px + rf(-sp, sp), ay = py + rf(-sp * 0.6, sp * 0.6), r = rf(15, 28)
    if (inside(ax, ay, r + 8)) b.push([ax, ay, r])
  }
  TR.push(...b)
  puff(g, b)
}
