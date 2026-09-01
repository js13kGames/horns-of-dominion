// Records every path op paint() makes and checks the map is habitable: every
// city on the island, a full set of peaks and woods, and forest cover in range.
// Not shipped.
//
//   node geo.mjs [seeds]        default 200; <= 12 prints per-seed detail
//
// Exits non-zero only if a city ends up off the island. Woods deliberately
// overlap roads and cities, so terrain-to-road distance is not a failure.
const rec = []
const grd = { addColorStop () {} }
const ctx = new Proxy({}, {
  get: (t, k) => k === 'createLinearGradient' ? (() => grd) : ((...a) => { rec.push([k, ...a]) }),
  set: () => true
})
globalThis.document = { createElement: () => ({ getContext: () => ctx }), getElementById: () => ({ getContext: () => ctx, addEventListener () {}, style: {}, dataset: {} }) }
const B = './src/'
const { S } = await import(B + 'state.js')
const { genMap, segDist } = await import(B + 'map.js')
const { paint } = await import(B + 'terrain.js')

const inPoly = (p, poly) => {
  let c = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi) c ^= 1
  }
  return c
}

const N = +process.argv[2] || 200
let worstC = 1e9, worstR = 1e9, bad = 0
const short = [], covers = []
const cxOf = (poly, i) => poly.reduce((s, p) => s + p[i], 0) / poly.length
for (let sd = 1; sd <= N; sd++) {
  rec.length = 0
  genMap(sd); paint()
  // split the op stream into closed shapes; the coast is simply the biggest
  const groups = []
  let cur = []
  for (const [op, ...a] of rec) {
    if (op === 'beginPath') cur = []
    else if (op === 'moveTo' || op === 'lineTo') cur.push([a[0], a[1], 0])
    else if (op === 'arc') cur.push([a[0], a[1], a[2]])
    else if (op === 'ellipse') cur.push([a[0], a[1], Math.max(a[2], a[3])])
    else if (op === 'closePath' || op === 'fill') { if (cur.length) groups.push(cur); cur = [] }
  }
  let poly = groups[0], pi = 0
  groups.forEach((g, i) => { if (g.length > poly.length) { poly = g; pi = i } })
  let ink = [], tris = 0, blobs = 0
  for (let i = pi + 1; i < groups.length; i++) {      // everything drawn on the land
    const g = groups[i]
    if (g.length === 3) tris++; else blobs += g.length
    for (const v of g) ink.push(v)
  }
  // forest coverage: every arc drawn on the land is a canopy blob
  const tree = []
  for (const [op, ...a] of rec) if (op === 'arc') tree.push([a[0], a[1], a[2]])
  let hit = 0, tot = 0
  for (let q = 0; q < 4000; q++) {
    const px = cxOf(poly, 0) + (q * 7919 % 2003) / 2003 * 1100 - 550
    const py = cxOf(poly, 1) + (q * 6271 % 1999) / 1999 * 800 - 400
    if (!inPoly({ x: px, y: py }, poly)) continue
    tot++
    if (tree.some(t => (t[0] - px) ** 2 + (t[1] - py) ** 2 < t[2] * t[2])) hit++
  }
  const cover = tot ? hit / tot * 100 : 0
  ink = ink.filter(v => inPoly({ x: v[0], y: v[1] }, poly))
  let mc = 1e9, mr = 1e9
  for (const [vx, vy, pad] of ink) {
    for (const c of S.C) mc = Math.min(mc, Math.hypot(c.x - vx, c.y - vy) - pad)
    for (const [i, j] of S.E) mr = Math.min(mr, segDist({ x: vx, y: vy }, S.C[i], S.C[j]) - pad)
  }
  worstC = Math.min(worstC, mc); worstR = Math.min(worstR, mr)
  const off = S.C.filter(c => !inPoly(c, poly)).length
  if (off) bad = 1
  covers.push(cover)
  if (N <= 12) console.log(`seed ${String(sd).padEnd(6)} off-island ${off}  tris ${tris} blobs ${blobs}  forest ${cover.toFixed(0).padStart(3)}%`)
  if (off || tris < 8 || blobs < 2000) short.push(`${sd}:off${off}/peaks${tris / 4 | 0}/blobs${blobs}`)
}
covers.sort((a, b) => a - b)
console.log(`${N} seeds — forest cover p10 ${covers[N / 10 | 0].toFixed(0)}% median ${covers[N >> 1].toFixed(0)}% p90 ${covers[N * 9 / 10 | 0].toFixed(0)}%`)

console.log(short.length ? 'short or tight: ' + short.join(' ') : 'every seed: all cities on the island, a full set of features, clear margins')
process.exit(bad)
