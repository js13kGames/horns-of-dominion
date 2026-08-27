// verifies the shipped, minified dist/index.html actually boots. Not shipped.
import { readFileSync } from 'fs'
const html = readFileSync('dist/index.html', 'utf8')
const els = {}
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = () => {})), set: (t, k, v) => (t[k] = v, true) })
for (const id of ['cv', 'hud', 'pan', 'log', 'ov']) {
  els[id] = { id, dataset: {}, style: {}, innerHTML: '', addEventListener (t, f) { (this.h ||= {})[t] = f }, getContext: () => ctx }
}
const win = { h: {} }
globalThis.document = { getElementById: id => els[id] }
globalThis.location = { _h: '', get hash () { return this._h }, set hash (v) { this._h = '#' + v } }
globalThis.devicePixelRatio = 1
globalThis.innerWidth = 1200; globalThis.innerHeight = 800
globalThis.addEventListener = (t, f) => { win.h[t] = f }
let rafq = []
globalThis.requestAnimationFrame = f => rafq.push(f)

let fail = 0
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail = 1 }

ok(/<style>\*\{/.test(html), 'css inlined and minified')
ok(!/\n\s\s/.test(html), 'html collapsed')
ok(!html.includes('/*JS*/') && !html.includes('/*CSS*/'), 'no placeholders left behind')

const js = html.split('<script>')[1].split('</script>')[0]
new Function(js)()

ok(/Unicorn Overlord/.test(els.ov.innerHTML), 'minified bundle boots to the title screen')
const el = { dataset: { a: 's', i: '1' }, closest: () => el }
win.h.click({ target: el })
ok(els.ov.innerHTML === '', 'realm pick starts the game')
let t = 0
for (let i = 0; i < 200; i++) { const q = rafq; rafq = []; t += 100; q.forEach(f => f(t)) }
ok(/💎/.test(els.hud.innerHTML), 'hud alive in the minified build')
ok(/🔴|🟠|🟢|🔵|🟣/.test(els.hud.innerHTML), 'standings render')
console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
