import { S } from './state.js'
import { segDist } from './map.js'

// The backdrop is baked once per map into an offscreen canvas, so detail here
// costs nothing per frame — the live layer pays a single drawImage. The rect
// runs well outside the map on every side: the land is meant to leave the
// screen rather than end somewhere the eye can find.
const BX = -500, BY = -430, BW = 2000, BH = 1560, Q = 1.3
const bg = document.createElement('canvas')
export const blit = x => x.drawImage(bg, BX, BY, BW, BH)
// the field, and what the frame is cleared to, so a viewport too tall or too
// wide for the bake runs out into more of the same ground and shows no seam
export const GROUND = '#3f5a35'

// terrain runs its own stream: borrowing state.js's rnd() would drift the
// browser's simulation away from the headless harnesses
let t0 = 1
const rn = () => (t0 = (Math.imul(t0, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff
const rf = (a, b) => a + rn() * (b - a)

let TR = []

export function paint () {
  t0 = ((S.seed | 0) ^ 0x5f3759df) & 0x7fffffff || 1

  bg.width = BW * Q; bg.height = BH * Q
  const g = bg.getContext('2d')
  g.setTransform(Q, 0, 0, Q, -BX * Q, -BY * Q)

  g.fillStyle = GROUND
  g.fillRect(BX, BY, BW, BH)

  // mottle: broad soft patches of lighter and darker grass, so an open stretch
  // of field reads as ground rather than as flat colour
  for (let k = 0; k < 70; k++) {
    g.globalAlpha = rf(0.05, 0.15)
    g.fillStyle = rn() < 0.5 ? '#2b4226' : '#536f3c'
    g.beginPath()
    g.ellipse(rf(BX, BX + BW), rf(BY, BY + BH), rf(70, 240), rf(45, 140), rf(0, 3), 0, 6.2832)
    g.fill()
  }
  g.globalAlpha = 1

  // Woods go down first and freely — they run under the roads and cities, which
  // are drawn over the backdrop anyway.
  TR = []
  for (let k = 0; k < 165; k++) {
    wood(g, rf(BX, BX + BW), rf(BY, BY + BH), rf(30, 80))
  }

  // peaks are silhouettes, so they do keep their distance. Clearance is sized
  // to the feature, or a wide mountain placed by its base point still spills
  // its flank across a road.
  const put = []
  let n = 0
  for (let k = 0; k < 900 && n < 13; k++) {
    const px = rf(BX + 40, BX + BW - 40), py = rf(BY + 60, BY + BH - 40)
    const h = rf(38, 58), w = h * rf(0.75, 1), d = w * rf(0.5, 0.85) * (rn() < 0.5 ? -1 : 1)
    const ext = Math.max(w, Math.abs(d) + w * 0.7)
    if (!TR.some(t => Math.hypot(t[0] - px, t[1] - py) < 44)) continue   // stand it in a wood
    if (S.C.some(c => Math.hypot(c.x - px, c.y - py) < 44 + ext)) continue
    if (S.E.some(([i, j]) => segDist({ x: px, y: py }, S.C[i], S.C[j]) < 20 + ext * 0.35)) continue
    if (put.some(q => Math.hypot(q[0] - px, q[1] - py) < 74)) continue
    put.push([px, py]); n++
    peak(g, px, py, h, w, d)
  }
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

// a stand of trees
function wood (g, px, py, sp) {
  const b = []
  for (let k = 10 + (rn() * 41 | 0); k--;) {
    b.push([px + rf(-sp, sp), py + rf(-sp * 0.6, sp * 0.6), rf(15, 28)])
  }
  TR.push(...b)
  puff(g, b)
}
