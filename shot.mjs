// Boots the real game against a recording 2D context and re-emits one frame as
// SVG, so the composed picture can actually be looked at. There is no headless
// browser here; this is the substitute. Not shipped.
//
//   node shot.mjs [seed] [frames] [out.svg]      default: 7 240 /tmp/shot.svg
//   qlmanage -t -s 1400 -o <dir> out.svg         # rasterise, then read the png
//
// The SVG is padded to a square because qlmanage fits the short side and crops;
// the thin rectangle drawn on it marks the real 16:9 window. Frames are stepped
// at 8x, so ~2600 gets you a mid-war board. Much past that and the recorder
// runs out of memory holding every op.
const SEED = +process.argv[2] || 7
const TICKS = +process.argv[3] || 240

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
let gid = 0
const defs = []

function mkCtx (name) {
  const out = []
  let d = '', m = [1, 0, 0, 1, 0, 0], stack = [], clipId = null, clipStack = []
  const st = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', dash: null }
  const comp = (p, q) => [
    p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
    p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
    p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5]]
  const g = () => `<g transform="matrix(${m.map(v => +v.toFixed(4)).join(' ')})"${clipId ? ` clip-path="url(#${clipId})"` : ''}>`
  const paint = (kind) => {
    if (!d) return
    const s = kind === 'fill'
      ? `fill="${st.fillStyle}" fill-opacity="${st.globalAlpha}"`
      : `fill="none" stroke="${st.strokeStyle}" stroke-width="${st.lineWidth}" stroke-opacity="${st.globalAlpha}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''}`
    out.push(`${g()}<path d="${d}" ${s}/></g>`)
  }
  const c = {
    _out: out, _name: name,
    get _m () { return m },
    save () { stack.push([m.slice(), { ...st }, clipId]) },
    restore () { const p = stack.pop(); if (p) { m = p[0]; Object.assign(st, p[1]); clipId = p[2] } },
    setTransform (a, b, cc, dd, e, f) { m = [a, b, cc, dd, e, f] },
    translate (x, y) { m = comp(m, [1, 0, 0, 1, x, y]) },
    scale (x, y) { m = comp(m, [x, 0, 0, y, 0, 0]) },
    beginPath () { d = '' },
    closePath () { d += 'Z' },
    moveTo (x, y) { d += `M${x.toFixed(2)} ${y.toFixed(2)}` },
    lineTo (x, y) { d += `L${x.toFixed(2)} ${y.toFixed(2)}` },
    quadraticCurveTo (a, b, x, y) { d += `Q${a.toFixed(2)} ${b.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}` },
    arc (cx, cy, r, a0, a1) {
      const span = a1 - a0
      if (span >= 6.28) { d += `M${(cx + r).toFixed(2)} ${cy.toFixed(2)}A${r} ${r} 0 1 1 ${(cx - r).toFixed(2)} ${cy.toFixed(2)}A${r} ${r} 0 1 1 ${(cx + r).toFixed(2)} ${cy.toFixed(2)}`; return }
      const x0 = cx + Math.cos(a0) * r, y0 = cy + Math.sin(a0) * r
      const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r
      d += `${d ? 'L' : 'M'}${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
    },
    ellipse (cx, cy, rx, ry, rot) {
      const co = Math.cos(rot), si = Math.sin(rot)
      const p = (t) => [cx + rx * Math.cos(t) * co - ry * Math.sin(t) * si, cy + rx * Math.cos(t) * si + ry * Math.sin(t) * co]
      const [ax, ay] = p(0), [bx, by] = p(Math.PI)
      const deg = rot * 180 / Math.PI
      d += `M${ax.toFixed(2)} ${ay.toFixed(2)}A${rx} ${ry} ${deg.toFixed(2)} 1 1 ${bx.toFixed(2)} ${by.toFixed(2)}A${rx} ${ry} ${deg.toFixed(2)} 1 1 ${ax.toFixed(2)} ${ay.toFixed(2)}`
    },
    rect (x, y, w, h) { d += `M${x} ${y}h${w}v${h}h${-w}Z` },
    fill () { paint('fill') },
    stroke () { paint('stroke') },
    fillRect (x, y, w, h) { out.push(`${g()}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${st.fillStyle}" fill-opacity="${st.globalAlpha}"/></g>`) },
    clip () { const id = 'c' + (++gid); defs.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${d}"/></clipPath>`); clipId = id },
    setLineDash (a) { st.dash = a && a.length ? a.join(' ') : null },
    createLinearGradient (x0, y0, x1, y1) {
      const id = 'g' + (++gid), stops = []
      defs.push({ id, x0, y0, x1, y1, stops })
      return { addColorStop (o, col) { stops.push([o, col]) }, toString: () => `url(#${id})` }
    },
    measureText: () => ({ width: 10 }),
    drawImage (img, dx, dy, dw, dh) {
      const q = img._ctx
      const inner = comp(m, [dw / img.width, 0, 0, dh / img.height, dx, dy])
      out.push(`<g transform="matrix(${inner.map(v => +v.toFixed(4)).join(' ')})">${q._out.join('')}</g>`)
    },
    strokeText (t, x, y) { this._text(t, x, y, `fill="none" stroke="${st.strokeStyle}" stroke-width="${st.lineWidth}" stroke-linejoin="round"`) },
    fillText (t, x, y) { this._text(t, x, y, `fill="${st.fillStyle}" fill-opacity="${st.globalAlpha}"`) },
    _text (t, x, y, paint) {
      const size = parseFloat(/(\d+(\.\d+)?)px/.exec(st.font)?.[1] || 10)
      const anch = st.textAlign === 'center' ? 'middle' : st.textAlign === 'right' ? 'end' : 'start'
      const base = st.textBaseline === 'middle' ? 'central' : 'alphabetic'
      const bold = /bold/.test(st.font) ? ' font-weight="700"' : ''
      const T = p => `${g()}<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${size}" font-family="Helvetica,Apple Color Emoji,sans-serif" text-anchor="${anch}" dominant-baseline="${base}" ${p}${bold}>${esc(t)}</text></g>`
      if (+st.shadowBlur) out.push(T(`fill="${st.shadowColor}" filter="url(#blur)"`))   // the canvas shadow
      out.push(T(paint))
    }
  }
  for (const k of ['fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'font', 'textAlign', 'textBaseline', 'shadowColor', 'shadowBlur']) {
    Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = String(v) === '[object Object]' ? v : v } })
  }
  return c
}

// --- DOM stub ------------------------------------------------------------
const els = {}
const mk = id => {
  const ctx = mkCtx(id)
  const e = { id, _ctx: ctx, width: 0, height: 0, dataset: {}, style: {}, innerHTML: '', value: '',
    addEventListener (t, f) { (this.h ||= {})[t] = f }, getContext: () => ctx }
  return (els[id] = e)
}
globalThis.document = { getElementById: id => els[id] || mk(id), createElement: () => mk('bg' + (++gid)), activeElement: null }
globalThis.location = { _h: '', get hash () { return this._h }, set hash (v) { this._h = '#' + v } }
globalThis.devicePixelRatio = 1
globalThis.innerWidth = 1600
globalThis.innerHeight = 900
const win = { h: {} }
globalThis.addEventListener = (t, f) => { win.h[t] = f }
let rafq = []
globalThis.requestAnimationFrame = f => rafq.push(f)
globalThis.Math.random = () => 0.5

const B = './src/'
const { S } = await import(B + 'state.js')
globalThis.location._h = '#' + SEED
await import(B + 'main.js')

const step = (n, ms = 16.7) => {
  let t = step.t || 0
  for (let i = 0; i < n; i++) { const q = rafq; rafq = []; t += ms; q.forEach(f => f(t)) }
  step.t = t
}
const click = (a, i) => { const el = { dataset: { a, i: String(i) }, closest: () => el }; win.h.click({ target: el }) }

step(1)
click('s', 0)               // take the first realm
S.speed = 8
step(TICKS)
S.speed = 1
els.cv._ctx._out.length = 0 // keep only the final frame
step(1)

const grads = defs.filter(d => typeof d === 'object' && d.stops)
  .map(d => `<linearGradient id="${d.id}" gradientUnits="userSpaceOnUse" x1="${d.x0}" y1="${d.y0}" x2="${d.x1}" y2="${d.y1}">` +
    d.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c.length === 9 ? c.slice(0, 7) : c}" stop-opacity="${c.length === 9 ? (parseInt(c.slice(7), 16) / 255).toFixed(3) : 1}"/>`).join('') + '</linearGradient>').join('')
const clips = defs.filter(d => typeof d === 'string').join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1600" viewBox="0 -350 1600 1600">` +
  `<defs><filter id="blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2"/></filter>${grads}${clips}</defs><rect x="0" y="-350" width="1600" height="1600" fill="#05040a"/>` +
  `<rect width="1600" height="900" fill="#0b0a12"/>` +
  els.cv._ctx._out.join('') +
  `<rect width="1600" height="900" fill="none" stroke="#ffffff30" stroke-width="3"/></svg>`
const { writeFileSync } = await import('fs')
writeFileSync(process.argv[4] || '/tmp/shot.svg', svg)
console.log('seed', S.seed, '· armies', S.A.length, '· ops', els.cv._ctx._out.length)
