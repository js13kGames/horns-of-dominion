// DOM smoke test — drives the real modules against a stub browser. Not shipped.
const els = {}
const mk = id => {
  const e = {
    id, _html: '', dataset: {}, style: {},
    get innerHTML () { return this._html },
    set innerHTML (v) { this._html = v },
    addEventListener (t, f) { (this.h ||= {})[t] = f },
    getContext: () => ctx
  }
  return (els[id] = e)
}
const ctx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (t[k] = () => {})),
  set: (t, k, v) => (t[k] = v, true)
})
;['cv', 'hud', 'pan', 'log', 'ov'].forEach(mk)

const win = { h: {} }
globalThis.document = { getElementById: id => els[id] }
globalThis.location = { _h: '', get hash () { return this._h }, set hash (v) { this._h = '#' + v } }
globalThis.devicePixelRatio = 2
globalThis.innerWidth = 1280
globalThis.innerHeight = 800
globalThis.addEventListener = (t, f) => { win.h[t] = f }
let rafq = []
globalThis.requestAnimationFrame = f => rafq.push(f)

const { S } = await import('./src/state.js')
await import('./src/main.js')

const step = (n, ms = 16.7) => {
  let t = step.t || 0
  for (let i = 0; i < n; i++) {
    const q = rafq; rafq = []
    t += ms
    q.forEach(f => f(t))
  }
  step.t = t
}
const click = (a, i) => {
  const el = { dataset: { a, i: String(i) }, closest: () => el }
  win.h.click({ target: el })
}
const tap = (wx, wy) => {  // world coords -> screen
  const s = Math.min(1280 / 1000, 800 / 700)
  els.cv.h.pointerdown({ clientX: wx * s + (1280 - 1000 * s) / 2, clientY: wy * s + (800 - 700 * s) / 2 })
}

let fail = 0
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail = 1 }

ok(/Unicorn Overlord/.test(els.ov.innerHTML), 'title screen renders')
ok(els.ov.innerHTML.split('class=realm ').length === 6, 'five realm cards offered')

click('s', 2)
ok(S.me === 2 && !S.F[2].ai && !!S.F[0].ai, 'picking a realm sets the player faction')
ok(els.ov.innerHTML === '', 'overlay cleared on start')
step(3)
ok(/💎/.test(els.hud.innerHTML), 'hud renders after start')

const g0 = S.F[2].g
step(120)                              // ~2s -> 4 ticks
ok(S.tick > 0, 'ticks advance: ' + S.tick)
ok(S.F[2].g > g0, 'gold accrues (' + (g0 | 0) + ' -> ' + (S.F[2].g | 0) + ')')

S.speed = 0
const t0 = S.tick
step(120)
ok(S.tick === t0, 'pause freezes the simulation')
S.speed = 1

// select one of my cities and raise an army
const mine = S.C.findIndex(c => c.o === 2)
tap(S.C[mine].x, S.C[mine].y)
ok(S.sel && S.sel.k === 'c' && S.sel.i === mine, 'clicking a city selects it')
step(1)
ok(/Raise/.test(els.pan.innerHTML), 'city panel offers Raise')
S.F[2].g = 999; S.C[mine].p = 200
const n0 = S.A.length
click('r', mine)
ok(S.A.length === n0 + 1, 'raise creates a warband')
const army = S.A[S.A.length - 1]
ok(army.o === 2 && army.a === mine, 'warband belongs to me, at my city')

// select it and march to a neighbour
step(1)
tap(army.rx, army.ry)
ok(S.sel && S.sel.k === 'a' && S.sel.i === army.id, 'clicking a warband selects it')
const dest = S.C[mine].n[0]
tap(S.C[dest].x, S.C[dest].y)
ok(army.t === dest, 'clicking a neighbour issues a march order')

// interpolation: the drawn position must advance between ticks, not only on them
step(1)
const rxWas = army.rx, prWas = army.pr
step(2)
ok(army.pr === prWas && army.rx !== rxWas,
  'the render position advances between ticks, with no tick in between')
step(40)
ok(army.t < 0 || army.pr > 0, 'the warband is moving / arrived')

// a moving warband must be clickable where it is drawn, not where it logically is
if (army.t >= 0) {
  S.sel = null
  tap(army.rx, army.ry)
  ok(S.sel && S.sel.k === 'a' && S.sel.i === army.id, 'a marching warband is clickable at its drawn spot')
  const back = army.a
  tap(S.C[back].x, S.C[back].y)
  ok(army.t === back, 'clicking the node behind turns a marching warband around')
} else {
  ok(1, 'warband arrived before the turn-back check could run')
  ok(1, '-')
}

// repair
const w0 = S.C[mine].s = 5
S.F[2].g = 999
click('f', mine)
ok(S.C[mine].s > w0, 'repair restores walls')

// speed buttons and keys
click('v', 4); ok(S.speed === 4, 'speed button sets 4x')
win.h.keydown({ key: ' ', preventDefault () {} }); ok(S.speed === 0, 'space pauses')
win.h.keydown({ key: '2' }); ok(S.speed === 2, 'key 2 sets speed')
win.h.keydown({ key: 'Escape' }); ok(S.sel === null, 'escape clears selection')

// run to a conclusion
S.speed = 8
for (let i = 0; i < 2200 && !S.over; i++) step(20, 100)
ok(S.over !== 0, 'the game reaches an ending (' + (S.over > 0 ? 'win' : 'loss') + ')')
ok(/New kingdom/.test(els.ov.innerHTML), 'end screen renders')
const seedWas = S.seed
click('n')
ok(S.over === 0 && S.C.length === 20 && els.ov.innerHTML.includes('Unicorn Overlord'), 'restart returns to the title')
ok(S.seed !== seedWas && location.hash === '#' + S.seed, 'restart rerolls the map and publishes the seed')

console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
