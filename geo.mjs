// Records every path op paint() makes and checks the field is habitable: the
// land carries features right across the frame, a full set of peaks and woods,
// forest cover in range, and no peak standing on a city or a road.
// Not shipped.
//
//   node geo.mjs [seeds]        default 200; <= 12 prints per-seed detail
//
// Exits non-zero if a seed comes up bald — a cell of the frame with no canopy
// in it at all. Woods deliberately overlap roads and cities and peaks do not,
// so only the peaks are held to a clearance.
const rec = []
const ctx = new Proxy({}, {
  get: (t, k) => (...a) => { rec.push([k, ...a]) },
  set: () => true
})
globalThis.document = { createElement: () => ({ getContext: () => ctx }), getElementById: () => ({ getContext: () => ctx, addEventListener () {}, style: {}, dataset: {} }) }
const B = './src/'
const { S } = await import(B + 'state.js')
const { genMap, segDist } = await import(B + 'map.js')
const { paint } = await import(B + 'terrain.js')

// the window a 16:9 screen actually shows, in world units: the map rect plus
// the band of field either side of it. Everything below is measured in here,
// because terrain baked outside it is terrain nobody sees.
const VX = -200, VY = -80, VW = 1400, VH = 860
const GX = 4, GY = 3                       // bald-patch grid over that window

const N = +process.argv[2] || 200
let worstC = 1e9, worstR = 1e9, bad = 0
const short = [], covers = []
for (let sd = 1; sd <= N; sd++) {
  rec.length = 0
  genMap(sd); paint()

  // split the op stream into closed shapes; a peak is a three-point one, a
  // canopy blob is an arc
  const groups = []
  let cur = []
  for (const [op, ...a] of rec) {
    if (op === 'beginPath') cur = []
    else if (op === 'moveTo' || op === 'lineTo') cur.push([a[0], a[1], 0])
    else if (op === 'arc') cur.push([a[0], a[1], a[2]])
    else if (op === 'closePath' || op === 'fill') { if (cur.length) groups.push(cur); cur = [] }
  }
  let tris = 0, blobs = 0
  const rock = []
  for (const g of groups) {
    if (g.length === 3 && !g[0][2]) { tris++; rock.push(...g) } else blobs += g.length
  }

  const tree = []
  for (const [op, ...a] of rec) if (op === 'arc') tree.push([a[0], a[1], a[2]])

  // forest cover, and whether any cell of the frame came up bald
  const cells = new Array(GX * GY).fill(0)
  let hit = 0, tot = 0
  for (let q = 0; q < 4000; q++) {
    const px = VX + (q * 7919 % 2003) / 2003 * VW
    const py = VY + (q * 6271 % 1999) / 1999 * VH
    tot++
    if (tree.some(t => (t[0] - px) ** 2 + (t[1] - py) ** 2 < t[2] * t[2])) {
      hit++
      cells[((py - VY) / VH * GY | 0) * GX + ((px - VX) / VW * GX | 0)] = 1
    }
  }
  const cover = hit / tot * 100
  const bald = cells.filter(c => !c).length
  if (bald) bad = 1

  // peaks keep their distance; woods are not asked to
  let mc = 1e9, mr = 1e9
  for (const [vx, vy] of rock) {
    if (vx < VX || vx > VX + VW || vy < VY || vy > VY + VH) continue
    for (const c of S.C) mc = Math.min(mc, Math.hypot(c.x - vx, c.y - vy))
    for (const [i, j] of S.E) mr = Math.min(mr, segDist({ x: vx, y: vy }, S.C[i], S.C[j]))
  }
  worstC = Math.min(worstC, mc); worstR = Math.min(worstR, mr)
  covers.push(cover)
  if (N <= 12) console.log(`seed ${String(sd).padEnd(6)} bald cells ${bald}/${GX * GY}  peaks ${tris / 4 | 0} blobs ${blobs}  forest ${cover.toFixed(0).padStart(3)}%`)
  if (bald || tris < 8 || blobs < 2000) short.push(`${sd}:bald${bald}/peaks${tris / 4 | 0}/blobs${blobs}`)
}
covers.sort((a, b) => a - b)
console.log(`${N} seeds — forest cover p10 ${covers[N / 10 | 0].toFixed(0)}% median ${covers[N >> 1].toFixed(0)}% p90 ${covers[N * 9 / 10 | 0].toFixed(0)}%`)
console.log(`nearest peak vertex to a city ${worstC.toFixed(0)}, to a road ${worstR.toFixed(0)}`)
console.log(short.length ? 'short or bald: ' + short.join(' ') : 'every seed: features right across the frame, a full set of them, peaks clear')
process.exit(bad)
