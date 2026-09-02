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
  get: (t, k) => (k in t ? t[k] : (t[k] = () => ctx)),   // gradients chain
  set: (t, k, v) => (t[k] = v, true)
})
;['cv', 'hud', 'pan', 'ov'].forEach(mk)

const win = { h: {} }
globalThis.document = { getElementById: id => els[id] || mk(id), createElement: () => mk('_c'), activeElement: null }
globalThis.location = { _h: '', get hash () { return this._h }, set hash (v) { this._h = '#' + v } }
globalThis.devicePixelRatio = 2
globalThis.innerWidth = 1280
globalThis.innerHeight = 800
globalThis.addEventListener = (t, f) => { win.h[t] = f }
let rafq = []
globalThis.requestAnimationFrame = f => rafq.push(f)

const { S, T } = await import('./src/state.js')
const { active } = await import('./src/sim.js')
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
  const s = Math.min(1280 / 1000, 800 / 700) * 0.72
  const oy = -70 * s
  els.cv.h.pointerdown({ clientX: wx * s + (1280 - 1000 * s) / 2, clientY: wy * s + (800 - 700 * s) / 2 + oy })
}

let fail = 0
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail = 1 }

ok(/Horns of Dominion/.test(els.ov.innerHTML), 'title screen renders')
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

// --- the specialist button ---------------------------------------------------
// a plain city offers riders only; a city that breeds something offers both
const plain = S.C.findIndex(c => c.o === 2 && !c.sp)
S.sel = { k: 'c', i: plain }; step(1)
ok(!/data-a=g/.test(els.pan.innerHTML), 'a plain city offers no specialist')
const bred = S.C.findIndex(c => c.o === 2 && c.sp)
const kind = S.C[bred].sp
S.C[bred].p = 200; S.C[bred].oc = 0; S.C[bred].u = 0; S.C[bred].mu = 0
S.sel = { k: 'c', i: bred }; step(1)
ok(/data-a=g/.test(els.pan.innerHTML), 'a breeding city offers a second Raise')
ok(els.pan.innerHTML.includes(T.K[kind][5]), `labelled with its own glyph (${T.K[kind][5]})`)
ok(els.pan.innerHTML.includes('💎' + T.K[kind][3]), `and its own price (💎${T.K[kind][3]})`)
const seen = S.A.map(a => a.id)
click('g', bred)
ok(S.C[bred].mu > 0 && S.C[bred].mk === kind, 'clicking it musters that kind')
// other realms are mustering too, so look for *my* new host at *that* city
const born = () => S.A.find(a => !seen.includes(a.id) && a.o === S.me && a.a === bred)
S.speed = 8
for (let k = 0; k < 400 && !born(); k++) step(1)
S.speed = 1
const got = born()
ok(!!got, 'and the warband arrives')
ok(got && got.k === kind, 'as the kind the city breeds')
S.A = S.A.filter(a => seen.includes(a.id)); S.sel = null

// picking a host up is what puts it under command — the map is its order sheet
step(1)
tap(army.rx, army.ry)
ok(S.sel && S.sel.k === 'a' && S.sel.i === army.id, 'clicking a warband selects it')
ok(active() === army, 'and that alone puts it under command')
ok(!/Banner|Warriors|Status|Bound for/.test(els.pan.innerHTML),
  'the panel carries no readout — banner, strength and march are all on the map')

const dest = S.C[mine].n[0]
tap(S.C[dest].x, S.C[dest].y)
ok(army.t === dest, 'clicking a city marches it there')
ok(active() === army, 'and it stays under command, so the order can be redirected')

// a city always wins the hit test over a host standing on it, or a march could
// never be turned around: at pr 0 the host sits exactly on the city it left
tap(S.C[mine].x, S.C[mine].y)
ok(army.t === mine && army.a === dest, 'clicking the city it left turns the march around')

tap(6, 6)                                  // empty sky
ok(!active() && !S.sel, 'clicking anywhere else stands the warband down')

tap(S.C[dest].x, S.C[dest].y)
ok(S.sel.k === 'c' && S.sel.i === dest, 'with nothing under command a city click only selects')

tap(army.rx, army.ry)
win.h.keydown({ key: 'Escape' })
ok(!S.sel && !active(), 'escape stands it down')

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
} else {
  ok(1, 'warband arrived before the drawn-spot check could run')
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

// --- multi-hop marching, splitting, and engagement bookkeeping -------------
S.F[2].g = 999
const home = S.C.findIndex(c => c.o === 2)
S.C[home].p = 300
const far = (() => {                       // a city three hops from home
  const d = new Array(20).fill(-1); d[home] = 0
  const q = [home]
  for (let h = 0; h < q.length; h++) for (const v of S.C[q[h]].n) if (d[v] < 0) { d[v] = d[q[h]] + 1; q.push(v) }
  return d.findIndex(x => x === 3)
})()
S.A = [{ id: 5001, o: 2, w: 120, k: 0, a: home, t: -1, pr: 0, st: 0, dst: -1, hold: 0 }]
const h = S.A[0]
step(2)
tap(h.rx, h.ry)
ok(S.sel && S.sel.k === 'a', 'the planted warband selects')
ok(/Split/.test(els.pan.innerHTML), 'a resting warband offers Split')
typeIn('sl', 40)
ok(S.split === 40, 'dragging the slider updates the split size')
click('x', 0)
ok(S.A.length === 2 && S.A[0].w + S.A[1].w === 120, 'splitting conserves warriors')
ok(S.A.every(a => a.hold), 'both halves are held apart')

tap(h.rx, h.ry)
tap(S.C[far].x, S.C[far].y)
ok(h.dst === far && h.t >= 0 && h.t !== far, 'mobilizing to a far city sets a multi-hop march')
step(3)
ok(h.dst === far && h.t >= 0, 'and keeps heading for it leg by leg')

// a fight the player is inside
S.A = [
  { id: 5002, o: 2, w: 100, k: 0, a: home, t: -1, pr: 0, st: 0, dst: -1, hold: 0 },
  { id: 5003, o: 3, w: 100, k: 0, a: home, t: -1, pr: 0, st: 0, dst: -1, hold: 0 }
]
S.speed = 4
step(20)
S.sel = { k: 'a', i: 5002 }
step(2)
ok(!/Banner|Warriors|Status/.test(els.pan.innerHTML), 'nor for a host in a fight')
S.sel = { k: 'a', i: 5003 }; step(1)
ok(els.pan.innerHTML === '', 'and an enemy host gets no panel at all')
S.sel = { k: 'a', i: 5002 }; step(1)
const eng = S.A.find(a => a.id === 5002)
ok(eng && eng.eg && eng.eg.length >= 2, 'and the engagement is recorded, so the map can ring it')

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
ok(/\?\?\?/.test(els.pan.innerHTML), 'a distant city hides its numbers')

S.sel = { k: 'c', i: near }; step(1)
ok(!/\?\?\?/.test(els.pan.innerHTML), 'a city bordering mine reports its numbers')

// scouting is live: present a host, the fog lifts; withdraw, it closes
const scout = { id: 6001, o: 2, w: 50, k: 0, a: dark, t: -1, pr: 0, st: 0, dst: -1, hold: 0 }
S.A = [scout]
S.sel = { k: 'c', i: dark }; step(2)
ok(!/\?\?\?/.test(els.pan.innerHTML), 'a warband standing there lifts the fog')
S.A = []; step(2)
ok(/\?\?\?/.test(els.pan.innerHTML), 'and the fog closes again when it withdraws')

// hosts inside the fog are neither drawn nor clickable
S.A = [{ id: 6002, o: 3, w: 50, k: 0, a: dark, t: -1, pr: 0, st: 0, dst: -1, hold: 0 }]
S.sel = null; step(2)
tap(S.A[0].rx, S.A[0].ry)
ok(!S.sel, 'an enemy host in the fog cannot be selected')
S.A = []; S.speed = 1

// --- fog hides events, not just terrain -----------------------------------
const ticks = n => { S.speed = 8; for (let k = 0; k < n; k++) step(1, 100); S.speed = 1 }
const host = (id, o, at, k = 0) => ({ id, o, w: 120, k, a: at, t: -1, pr: 0, st: 0, dst: -1, hold: 0 })

// effects decay within a few frames, so sample every frame rather than at the end
const watch = (at, n) => {
  let hit = 0
  S.speed = 8
  for (let k = 0; k < n; k++) {
    step(1, 100)
    if (S.fx.some(f => Math.hypot(f.x - S.C[at].x, f.y - S.C[at].y) < 45)) hit = 1
  }
  S.speed = 1
  return hit
}

S.fx = []; S.toast = ''
S.A = [host(7001, 3, dark), host(7002, 4, dark)]
ok(!watch(dark, 20), 'a battle in the fog draws no clash marker')
ok(!S.toast, 'and raises nothing else the player could read')

S.fx = []
S.A = [host(7003, 3, near), host(7004, 4, near)]
ok(watch(near, 20), 'the same battle in sight does draw one')

// --- being attacked is announced ------------------------------------------
const town = S.C.findIndex(c => c.o === S.me)
S.fx = []; S.toast = ''
S.A = [host(7005, 3, town)]
ticks(4)
ok(/under attack/.test(S.toast), 'an attack on your city raises a notification')
ok(/under attack/.test(els.toast.innerHTML), 'and the toast renders')
ok(S.C[town].wn === 1, 'the city is flagged so it is not announced twice')

// --- taking a city cows it -------------------------------------------------
const prey = S.C.findIndex((c, i) => c.o !== S.me)
S.C[prey].s = 0.4
S.A = [host(7006, S.me, prey)]
S.C[prey].p = 300
const popWas = S.C[prey].p
ticks(20)
ok(S.C[prey].o === S.me, 'the city is taken')
ok(S.C[prey].p < popWas * 0.6, `the sacking guts its populace (${popWas | 0} -> ${S.C[prey].p | 0})`)
ok(S.C[prey].oc > 0, 'and it is left too cowed to conscript')
S.F[S.me].g = 999
S.sel = { k: 'c', i: prey }; step(1)
ok(/Cowed/.test(els.pan.innerHTML), 'the panel says so')
const before7 = S.A.length
click('r', prey)
ok(S.A.length === before7 && !S.C[prey].mu, 'and raising is refused there')
S.A = []; S.fx = []; S.toast = ''

// --- the panel reports unrest, and only unrest ------------------------------
ok(S.C[prey].u > 0 && els.pan.innerHTML.includes('✊ Unrest</span><span>' + (S.C[prey].u | 0) + '%'),
  `the panel reports the seized city's unrest (${S.C[prey].u | 0}%)`)
ok(!/Loyalty|native|Ionian|Restless/.test(els.pan.innerHTML),
  'and no per-realm loyalty ledger')
S.C[prey].oc = 0; S.C[prey].u = 95; step(1)
ok(/Restless 95%/.test(els.pan.innerHTML), 'a restless city says so instead of offering Raise')
S.C[prey].u = 0

// run to a conclusion
S.speed = 8
for (let i = 0; i < 2200 && !S.over; i++) step(20, 100)
ok(S.over !== 0, 'the game reaches an ending (' + (S.over > 0 ? 'win' : 'loss') + ')')
ok(/New story/.test(els.ov.innerHTML), 'end screen renders')
ok(/largest host/.test(els.ov.innerHTML), 'end screen shows the campaign tally')
ok(!/cities held/.test(els.ov.innerHTML), 'and no longer counts cities held')
const seedWas = S.seed
click('n')
ok(S.over === 0 && S.C.length === 20 && els.ov.innerHTML.includes('Horns of Dominion'), 'restart returns to the title')
ok(S.seed !== seedWas && location.hash === '#' + S.seed, 'restart rerolls the map and publishes the seed')

console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
