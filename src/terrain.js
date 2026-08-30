import { S } from './state.js'
import { segDist } from './map.js'

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

const N = 54                 // coastline samples — enough for a broken edge
const R = []                 // radius per sample, around the city centroid
let cx = 0, cy = 0
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
    m[k] = rf(44, 92)
  }
  for (let p = 0; p < 3; p++)      // smooth the margin into headlands and bays
    for (let k = 0; k < N; k++) m[k] = (m[(k + N - 1) % N] + 2 * m[k] + m[(k + 1) % N]) / 4
  // the support of a rectangular city cloud dips on the axes, which would give
  // every island the same rounded-square outline — pad the dips back out. The
  // jitter goes on last and unsmoothed: that is what makes the edge ragged.
  let mx = 0
  for (let k = 0; k < N; k++) mx = Math.max(mx, R[k])
  for (let k = 0; k < N; k++) R[k] += (mx - R[k]) * 0.3 + m[k] + rf(-16, 16)
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

  // the underside: bare rock torn off the southern rim
  const k0 = Math.round(0.55 / 6.2832 * N), k1 = Math.round(2.6 / 6.2832 * N)
  const tx = cx + rf(-60, 60), ty = cy + radAt(1.5708) + 210
  const [sx, sy] = pt(k0), [ex, ey] = pt(k1)
  g.beginPath(); g.moveTo(sx, sy)
  for (let k = k0 + 1; k <= k1; k++) { const [px, py] = pt(k); g.lineTo(px, py) }
  for (let j = 1; j < 4; j++) {            // down the far side in rough steps,
    const u = j / 4                        // squared so the shoulder rolls off
    g.lineTo(ex + (tx - ex) * u - (1 - u) * rf(12, 54), ey + (ty - ey) * u * u + rf(-13, 13))
  }
  g.lineTo(tx, ty)
  for (let j = 3; j > 0; j--) {            // and back up the near one
    const u = j / 4
    g.lineTo(sx + (tx - sx) * u + (1 - u) * rf(12, 54), sy + (ty - sy) * u * u + rf(-13, 13))
  }
  g.closePath()
  g.fillStyle = grad(g, cy + 240, ty, '#7d5133', '#2a170f00')
  g.fill()

  for (let k = 0; k < 3; k++) {    // rubble adrift below it
    g.globalAlpha = rf(0.3, 0.6); g.fillStyle = '#6b4530'
    g.beginPath(); g.ellipse(tx + rf(-160, 160), ty + rf(-40, 90), rf(6, 15), rf(4, 8), rf(-0.4, 0.4), 0, 6.2832)
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

  // peaks and woods take the ground no road or city is using. Clearance is
  // sized to the feature, or a wide mountain placed by its base point still
  // spills its flank across a road.
  const put = []
  const free = (px, py, ext) => {
    if (!inside(px, py, 70)) return 0
    for (const c of S.C) if (Math.hypot(c.x - px, c.y - py) < 54 + ext) return 0
    for (const [i, j] of S.E) if (segDist({ x: px, y: py }, S.C[i], S.C[j]) < 24 + ext * 0.42) return 0
    for (const q of put) if (Math.hypot(q[0] - px, q[1] - py) < 78) return 0
    return 1
  }
  let n = 0, f = 0
  // alternate the two kinds, so a cramped map still gets some of each rather
  // than spending every attempt on mountains
  for (let k = 0; k < 420 && (n < 5 || f < 4); k++) {
    const px = rf(cx - 470, cx + 470), py = rf(cy - 340, cy + 340)
    if (n < 5 && ((k & 1) || f > 3)) {
      const h = rf(24, 42), w = h * rf(0.85, 1.2), d = w * rf(0.7, 1.1) * (rn() < 0.5 ? -1 : 1)
      if (!free(px, py, Math.max(w, Math.abs(d) + w * 0.7))) continue
      put.push([px, py]); n++
      peak(g, px, py, h, w, d)
    } else if (f < 4) {
      const sp = rf(26, 44)
      if (!free(px, py, sp + 16)) continue
      put.push([px, py]); f++
      wood(g, px, py, sp)
    }
  }
}

const tri = (g, px, py, w, h, c) => {
  g.fillStyle = c
  g.beginPath(); g.moveTo(px - w, py); g.lineTo(px, py - h); g.lineTo(px + w, py)
  g.closePath(); g.fill()
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
}

// a stand of trees: overlapping canopy blobs, each with its west side lit
function wood (g, px, py, sp) {
  const b = []
  for (let k = 6 + (rn() * 4 | 0); k--;) b.push([px + rf(-sp, sp), py + rf(-sp * 0.5, sp * 0.5), rf(11, 19)])
  g.fillStyle = '#1e3a20'
  for (const [ax, ay, r] of b) { g.beginPath(); g.arc(ax, ay, r, 0, 6.2832); g.fill() }
  g.fillStyle = '#3a6330'
  for (const [ax, ay, r] of b) { g.beginPath(); g.arc(ax - r * 0.22, ay - r * 0.26, r * 0.7, 0, 6.2832); g.fill() }
}
