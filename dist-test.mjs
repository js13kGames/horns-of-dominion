// verifies the shipped, minified dist/index.html actually boots. Not shipped.
import { readFileSync } from 'fs'
const html = readFileSync('dist/index.html', 'utf8')
const els = {}
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = () => ctx)), set: (t, k, v) => (t[k] = v, true) })
// created on demand, so adding an element to index.html cannot silently break this
const mk = id => (els[id] = {
  id, dataset: {}, style: {}, innerHTML: '',
  addEventListener (t, f) { (this.h ||= {})[t] = f },
  getContext: () => ctx
})
const win = { h: {} }
const head = { appendChild: n => n }
globalThis.document = { getElementById: id => els[id] || mk(id), createElement: () => mk('_c'), head, activeElement: null }
globalThis.location = { _h: '', get hash () { return this._h }, set hash (v) { this._h = '#' + v } }
globalThis.devicePixelRatio = 1
globalThis.innerWidth = 1200; globalThis.innerHeight = 800
globalThis.addEventListener = (t, f) => { win.h[t] = f }
let rafq = []
globalThis.requestAnimationFrame = f => rafq.push(f)

let fail = 0
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail = 1 }

ok(/<style>body\{background:#0b0a12\}<\/style>/.test(html), 'critical css left in the shell')
ok(/appendChild\(document\.createElement|<style>\*\{/.test(html) || html.length < 25000, 'the rest rides in the payload')
ok(!/\n\s\s/.test(html), 'html collapsed')
ok(!html.includes('/*JS*/') && !html.includes('/*CSS*/'), 'no placeholders left behind')

const js = html.split('<script>')[1].split('</script>')[0]
new Function(js)()

ok(/Horns of Dominion/.test(els.ov.innerHTML), 'minified bundle boots to the title screen')
const el = { dataset: { a: 's', i: '1' }, closest: () => el }
win.h.click({ target: el })
ok(els.ov.innerHTML === '', 'realm pick starts the game')
let t = 0
for (let i = 0; i < 200; i++) { const q = rafq; rafq = []; t += 100; q.forEach(f => f(t)) }
ok(/💎/.test(els.hud.innerHTML), 'hud alive in the minified build')
ok(/🔴|🟠|🟢|🔵|🟣/.test(els.hud.innerHTML), 'standings render')
console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
