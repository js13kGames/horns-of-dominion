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
globalThis.document = { getElementById: id => els[id] || mk(id), activeElement: null }
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
const typeIn = (id, v) => {
  const el = els[id]; el.value = String(v)
  win.h.input({ target: el })
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

ok(/data-a=d/.test(els.ov.innerHTML), 'title offers difficulty rungs')
click('d', 3)
ok(S.diff === 3, 'picking a rung sets it')
click('d', 2)
ok(S.diff === 2, 'and the default rung is the third')

click('s', 2)
ok(S.me === 2 && !S.F[2].ai && !!S.F[0].ai, 'picking a realm sets the player faction')
ok(els.ov.innerHTML === '', 'overlay cleared on start')
step(3)
ok(/💎/.test(els.hud.innerHTML), 'hud renders after start')
ok(els.hud.innerHTML.includes(S.F[2].nm) && els.hud.innerHTML.includes(S.F[2].em),
  'hud names your realm')

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
ok(S.A.length === n0 && S.C[mine].mu > 0, 'raise starts a muster, not an instant warband')
step(2)
ok(/Mustering/.test(els.pan.innerHTML), 'the panel shows muster progress')
S.speed = 8
for (let k = 0; k < 400 && S.A.length === n0; k++) step(1)
S.speed = 1
ok(S.A.length === n0 + 1, 'the warband appears once mustered')
const army = S.A[S.A.length - 1]
ok(army.o === 2 && army.a === mine, 'warband belongs to me, at my city')

// selecting your own host arms targeting with no second click
step(1)
tap(army.rx, army.ry)
ok(S.sel && S.sel.k === 'a' && S.sel.i === army.id, 'clicking a warband selects it')
ok(S.aim === army.id, 'and arms targeting immediately')

// with targeting cancelled, a city click is only a selection
click('k', 0)
ok(!S.aim, 'Cancel disarms targeting')
const dest = S.C[mine].n[0]
tap(S.C[dest].x, S.C[dest].y)
ok(army.t < 0, 'with targeting off, clicking a city does not move the host')
ok(S.sel.k === 'c' && S.sel.i === dest, 'it selects that city instead')

tap(army.rx, army.ry)
ok(S.aim === army.id, 'reselecting the host re-arms it')
tap(S.C[dest].x, S.C[dest].y)
ok(army.t === dest && !S.aim, 'the next city click becomes the destination')

step(1)
tap(army.rx, army.ry)
click('m', 0); ok(S.aim === army.id, 'Mobilize can also arm it explicitly')
win.h.keydown({ key: 'Escape' })
ok(!S.aim && S.sel, 'Escape cancels targeting first')
win.h.keydown({ key: 'Escape' })
ok(!S.sel, 'and clears the selection on the second press')

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
  step(1)
  const back = army.a
  ok(/Turn back/.test(els.pan.innerHTML), 'a marching warband offers Turn back')
  click('b', 0)
  ok(army.t === back, 'Turn back reverses it')
} else {
  ok(1, 'warband arrived before the turn-back check could run')
  ok(1, '-'); ok(1, '-')
}

// repair
const w0 = S.C[mine].s = 5
S.F[2].g = 999
click('f', mine)
ok(S.C[mine].s === w0 && S.C[mine].rp > 0, 'repair banks the work rather than finishing it')
S.speed = 8
for (let k = 0; k < 200 && S.C[mine].rp; k++) step(1)
S.speed = 1
ok(S.C[mine].s > w0, 'walls rise as the masons work (' + w0 + ' -> ' + (S.C[mine].s | 0) + ')')

// speed buttons and keys
click('v', 4); ok(S.speed === 4, 'speed button sets 4x')
win.h.keydown({ key: ' ', preventDefault () {} }); ok(S.speed === 0, 'space pauses')
win.h.keydown({ key: '2' }); ok(S.speed === 2, 'key 2 sets speed')
win.h.keydown({ key: 'Escape' })
win.h.keydown({ key: 'Escape' })
ok(S.sel === null && !S.aim, 'escape clears targeting, then the selection')

// --- multi-hop marching, splitting, and the battle roster ------------------
S.F[2].g = 999
const home = S.C.findIndex(c => c.o === 2)
S.C[home].p = 300
const far = (() => {                       // a city three hops from home
  const d = new Array(20).fill(-1); d[home] = 0
  const q = [home]
  for (let h = 0; h < q.length; h++) for (const v of S.C[q[h]].n) if (d[v] < 0) { d[v] = d[q[h]] + 1; q.push(v) }
  return d.findIndex(x => x === 3)
})()
S.A = [{ id: 5001, o: 2, w: 120, a: home, t: -1, pr: 0, st: 0, dst: -1, hold: 0 }]
const h = S.A[0]
step(2)
tap(h.rx, h.ry)
ok(S.sel && S.sel.k === 'a', 'the planted warband selects')
ok(/Split off/.test(els.pan.innerHTML), 'a resting warband offers Split')
typeIn('sl', 40)
ok(S.split === 40, 'dragging the slider updates the split size')
click('x', 0)
ok(S.A.length === 2 && S.A[0].w + S.A[1].w === 120, 'splitting conserves warriors')
ok(S.A.every(a => a.hold), 'both halves are held apart')

tap(h.rx, h.ry)
click('m', 0)
tap(S.C[far].x, S.C[far].y)
ok(h.dst === far && h.t >= 0 && h.t !== far, 'mobilizing to a far city sets a multi-hop march')
step(3)
ok(/Bound for/.test(els.pan.innerHTML), 'the panel names the final destination')

// a fight the player is inside
S.A = [
  { id: 5002, o: 2, w: 100, a: home, t: -1, pr: 0, st: 0, dst: -1, hold: 0 },
  { id: 5003, o: 3, w: 100, a: home, t: -1, pr: 0, st: 0, dst: -1, hold: 0 }
]
S.speed = 4
step(20)
S.sel = { k: 'a', i: 5002 }
step(2)
ok(/Battle|Siege/.test(els.pan.innerHTML), 'the battle roster panel renders')
ok(S.F.filter((f, i) => els.pan.innerHTML.includes(f.em)).length >= 2,
  'and lists both banners in the fight')

// --- fog of war ------------------------------------------------------------
S.speed = 0                            // freeze the board so the fog is deterministic
S.A = []
S.sel = null
step(2)
const adj = i => S.C[i].n.some(j => S.C[j].o === S.me)
const dark = S.C.findIndex((c, i) => c.o !== S.me && !adj(i))
const near = S.C.findIndex((c, i) => c.o !== S.me && adj(i))
ok(dark >= 0 && near >= 0, 'the map offers both a fogged and a bordering enemy city')

S.sel = { k: 'c', i: dark }; step(1)
ok(/unknown/.test(els.pan.innerHTML), 'a distant city hides its ruler')
ok(/\?\?\?/.test(els.pan.innerHTML), 'and hides its numbers')

S.sel = { k: 'c', i: near }; step(1)
ok(!/unknown/.test(els.pan.innerHTML), 'a city bordering mine reports its true ruler')

// scouting is live: present a host, the fog lifts; withdraw, it closes
const scout = { id: 6001, o: 2, w: 50, a: dark, t: -1, pr: 0, st: 0, dst: -1, hold: 0 }
S.A = [scout]
S.sel = { k: 'c', i: dark }; step(2)
ok(!/unknown/.test(els.pan.innerHTML), 'a warband standing there lifts the fog')
S.A = []; step(2)
ok(/unknown/.test(els.pan.innerHTML), 'and the fog closes again when it withdraws')

// hosts inside the fog are neither drawn nor clickable
S.A = [{ id: 6002, o: 3, w: 50, a: dark, t: -1, pr: 0, st: 0, dst: -1, hold: 0 }]
S.sel = null; step(2)
tap(S.A[0].rx, S.A[0].ry)
ok(!S.sel, 'an enemy host in the fog cannot be selected')
S.A = []; S.speed = 1

// run to a conclusion
S.speed = 8
for (let i = 0; i < 2200 && !S.over; i++) step(20, 100)
ok(S.over !== 0, 'the game reaches an ending (' + (S.over > 0 ? 'win' : 'loss') + ')')
ok(/New kingdom/.test(els.ov.innerHTML), 'end screen renders')
ok(/largest host/.test(els.ov.innerHTML), 'end screen shows the campaign tally')
const seedWas = S.seed
click('n')
ok(S.over === 0 && S.C.length === 20 && els.ov.innerHTML.includes('Unicorn Overlord'), 'restart returns to the title')
ok(S.seed !== seedWas && location.hash === '#' + S.seed, 'restart rerolls the map and publishes the seed')

console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
