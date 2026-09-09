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
const drew = [], drewAt = []                      // canvas text, so the map can be read
let path = []                                     // and its strokes, so lines can be too
const strokes = []
const ctx = new Proxy({
  fillText: (t, px, py) => (drew.push(String(t)), drewAt.push([String(t), px, py]), ctx),
  beginPath: () => (path = [], ctx),
  moveTo: (px, py) => (path.push([px, py]), ctx),
  lineTo: (px, py) => (path.push([px, py]), ctx),
  stroke: () => (strokes.push([ctx.strokeStyle, path.slice()]), ctx)
}, {
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

// audio: Node has Blob and URL.createObjectURL already, so only the element is
// stubbed. The tracks are ground for real, which is the point — a broken effect
// throws here rather than in the browser. made[] is creation order, which
// audio.js fixes: 0 song · 1 horn · 2 chime · 3 fanfare · 4 clash
const SONG = 0, HORN = 1, CHIME = 2, FANFARE = 3, CLASH = 4
const made = [], played = []
globalThis.Audio = class {
  constructor (src) {
    this.i = made.length; this.src = src
    this.loop = false; this.volume = 1; this.paused = true; this.currentTime = 0
    made.push(this)
  }
  play () { this.paused = false; played.push(this.i); return Promise.resolve() }
  pause () { this.paused = true }
}

const { S, T } = await import('./src/state.js')
const { active } = await import('./src/sim.js')
const { cityR, V } = await import('./src/render.js')
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
// world coords -> screen, off the live view rather than a second copy of the
// projection: this used to restate the scale and offsets and went stale the
// day they changed
const tap = (wx, wy) =>
  els.cv.h.pointerdown({ clientX: wx * V.s + V.ox, clientY: wy * V.s + V.oy })

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

// the calendar is S.tick over T.day and nothing else, so it can be read off a
// tick count set by hand. Ticks are stopped and the count put back afterwards,
// or every escal- and bold-scaled number below would move with it
const tickWas = S.tick, speedWas = S.speed
S.speed = 0
const on = (t, d) => {
  S.tick = t * T.day; step(1)
  ok(els.hud.innerHTML.includes('<b>' + d + ' of the Mazurian Age</b>'), d)
}
on(0, 'Auriel 1st, year 13312')
on(1, 'Auriel 2nd, year 13312')
on(2, 'Auriel 3rd, year 13312')
on(10, 'Auriel 11th, year 13312')          // not 11st, which is what % 10 would give
on(20, 'Auriel 21st, year 13312')
on(27, 'Auriel 28th, year 13312')
on(28, 'Florin 1st, year 13312')
on(363, 'Lunaris 28th, year 13312')
on(364, 'Auriel 1st, year 13313')
// and it rides on the right, by the speed buttons: .dt takes the slack, so the
// gold stays left and the date lands next to the controls
const hudH = els.hud.innerHTML
ok(/class=dt><b>/.test(hudH), 'the date carries the class that pushes it right')
ok(hudH.indexOf('💎') < hudH.indexOf('Mazurian') && hudH.indexOf('Mazurian') < hudH.indexOf('data-a=q'),
  'and sits after the gold and before the buttons')
S.tick = tickWas; S.speed = speedWas; step(1)

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
played.length = 0
tap(S.C[mine].x, S.C[mine].y)
ok(S.sel && S.sel.k === 'c' && S.sel.i === mine, 'clicking a city selects it')

// --- audio ------------------------------------------------------------------
ok(made.length === 5, 'the song and all four effects render (' + made.length + ' of 5)')
ok(made.every(a => a.src.startsWith('blob:')), 'each as its own wav blob')
ok(made[SONG].loop && made[CLASH].loop, 'the song and the din of battle loop')
ok(!made[HORN].loop && !made[CHIME].loop && !made[FANFARE].loop, 'the one-shots do not')
ok(made[CLASH].volume < made[SONG].volume, 'the din sits under the song')
ok(!made[SONG].paused, 'the song plays once a realm is picked')
ok(played.includes(CHIME), 'inspecting a town chimes')
win.h.keydown({ key: 'm' })
played.length = 0
tap(S.C[mine].x, S.C[mine].y)
ok(!played.length, 'and muting silences it')
ok(made[SONG].paused, 'along with the song')
win.h.keydown({ key: 'm' })
ok(!made[SONG].paused, 'unmuting brings the song back')
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
played.length = 0
tap(army.rx, army.ry)
ok(S.sel && S.sel.k === 'a' && S.sel.i === army.id, 'clicking a warband selects it')
ok(played.includes(CHIME), 'and picking it up chimes')
ok(active() === army, 'and that alone puts it under command')
// the warband card is back, and it carries the two things the map cannot say in
// numbers: how many bodies are left and how spent they are. The march is still
// the map's to tell — a dashed path to a lit destination — so it stays out
ok(els.pan.innerHTML.includes(T.K[army.k][6]), 'a selected warband names its kind')
ok(els.pan.innerHTML.includes('⚔️ Warriors</span><span>' + (army.w | 0)), 'and counts its warriors')
ok(/💤 Stamina/.test(els.pan.innerHTML), 'and carries a stamina row')
ok(els.st.textContent === 100 - (army.fg | 0) + '%',
  `whose number is written live, out of the diffed string (${els.st.textContent})`)
ok(!/Banner|Status|Bound for/.test(els.pan.innerHTML),
  'but no banner and no march readout — the map says both')
ok(army.k === 0 && !/×/.test(els.pan.innerHTML),
  'and a footman host prints no multiplier at all: it is the baseline')

// the multipliers are read off T.K rather than spelled out per kind, so a kind
// that is better at something says so and one that is worse says that too
army.k = 2; step(1)
ok(els.pan.innerHTML.includes('🧱 Siege</span><span>×' + T.K[2][1]), 'a behemoth advertises its siege weight')
ok(els.pan.innerHTML.includes('🐾 March</span><span>×' + T.K[2][2]), 'and the march that pays for it')
ok(/🏹 Ambush<\/span><span>×0\.73/.test(els.pan.innerHTML),
  'and the ambush penalty a slow host takes on a road')
army.k = 0; step(1)

const dest = S.C[mine].n[0]
played.length = 0
tap(S.C[dest].x, S.C[dest].y)
ok(army.t === dest, 'clicking a city marches it there')
ok(played.includes(CHIME), 'and naming a destination chimes')
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
played.length = 0
click('v', 4); ok(S.speed === 4, 'speed button sets 4x')
ok(played.includes(CHIME), 'and chimes')
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
// and they are held apart on the map too: same owner, same kind, same node, so
// without a fan inside the owner's slot the new host lands exactly under the old
S.speed = 0; step(30); S.speed = 1     // paused frames: the ease runs, the board does not
const [u, v] = S.A, hc = S.C[home]
ok(Math.hypot(u.rx - v.rx, u.ry - v.ry) > 20, 'the two halves take separate places around the city')
ok([u, v].every(a => Math.abs(Math.hypot(a.rx - hc.x, a.ry - hc.y) - (cityR(hc) + 17)) < 4),
  'both still ride the ring of their own city')
// node slots and road slots come out of one map, so their keys must not collide:
// city 0 held by realm 1 is not the road 0-1. no edge is needed for this — the
// grouping reads a host's own endpoints, never S.E
const stash = S.A
S.A = [{ id: 5101, o: 1, w: 20, k: 0, a: 0, t: -1, pr: 0, st: 0, dst: -1, hold: 0 },
  { id: 5102, o: 3, w: 20, k: 0, a: 0, t: 1, pr: 0.5, st: 0, dst: -1, hold: 0 }]
step(1, 0)                             // a fresh host is placed outright, no easing
const c0 = S.C[0], ra = 1 * 1.2566 - 1.9, rr = cityR(c0) + 17
ok(Math.hypot(S.A[0].rx - (c0.x + Math.cos(ra) * rr), S.A[0].ry - (c0.y + Math.sin(ra) * rr)) < 4,
  'a lone host keeps its own slot whatever marches the road of the same name')
S.A = stash

tap(h.rx, h.ry)
tap(S.C[far].x, S.C[far].y)
ok(h.dst === far && h.t >= 0 && h.t !== far, 'mobilizing to a far city sets a multi-hop march')
// the dashed path rides beside the road, not down the middle of it: laid straight
// on the road it was lost in it. 6px to the left of the march, leg by leg
strokes.length = 0; step(1, 0)
const march = strokes.find(([c]) => c === '#e8e4f5aa')
ok(march && march[1].length >= 2, 'the march draws a path of its own')
// measured square to the road, which is the only offset that survives a road of
// any angle — a plain vertical nudge collapses to nothing on a north-south leg
const fr = S.C[h.a], to = S.C[h.t], [px, py] = march[1][1]
const L = Math.hypot(to.x - fr.x, to.y - fr.y)
const off = Math.abs((to.x - fr.x) * (fr.y - py) - (fr.x - px) * (to.y - fr.y)) / L
ok(Math.abs(off - 6) < 0.5, `and it clears the road it follows by 6px (${off.toFixed(1)})`)
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
// a host in a fight still reports itself — it just cannot be split. This is the
// case that used to answer with a blank panel and read as a bug
ok(/⚔️ Warriors/.test(els.pan.innerHTML), 'a host in a fight still reports itself')
ok(/Split/.test(els.pan.innerHTML), 'and a fight at a city does not stop you dividing it')
// the road lock is what does. Ticks are stopped for this so the sim cannot clear
// the flag between the write and the render
S.speed = 0
S.A.find(a => a.id === 5002).st = 1; step(1)
ok(!/Split/.test(els.pan.innerHTML), 'but a host locked in a road melee cannot be split')
S.A.find(a => a.id === 5002).st = 0; step(1); S.speed = 4
S.sel = { k: 'a', i: 5003 }; step(1)
ok(/⚔️ Warriors/.test(els.pan.innerHTML) && !/Split/.test(els.pan.innerHTML),
  'an enemy host reports the same numbers its disc already draws, and no Split')
S.sel = { k: 'a', i: 5002 }; step(1)
const eng = S.A.find(a => a.id === 5002)
ok(eng && eng.eg && eng.eg.length >= 2, 'and the engagement is recorded, so the map can ring it')

// --- the raise badge -------------------------------------------------------
// the map says which of your cities could raise something this instant, so the
// answer does not cost a click on each one. it is your own cities only, and
// canRaise already checks the owner, so there is nothing to leak
const pc = S.C[plain], keep = [S.F[S.me].g, pc.p, pc.mu, pc.oc, pc.u]
S.F[S.me].g = 999; pc.p = 200; pc.mu = pc.oc = pc.u = 0
// badges hang off the disc, so match on where the text landed, not just that it did
const badgeOn = (t, c) => drewAt.some(d =>
  d[0] === t && Math.abs(d[1] - c.x) < 40 && Math.abs(d[2] - c.y) < 40)
const sample = () => { drew.length = drewAt.length = 0; step(1, 0) }   // no elapsed time: no tick runs
sample()
ok(badgeOn('⬆️', pc), 'a city that can raise says so on the map')
S.F[S.me].g = 0
sample()
ok(drew.length > 0 && !drew.includes('⬆️'),
  'with nothing of mine affordable the badge is nowhere — enemy cities never wear it')
S.F[S.me].g = 999; pc.mu = T.muster
sample()
ok(badgeOn('⏳', pc) && !badgeOn('⬆️', pc), 'a city mid-muster wears the hourglass instead')
;[S.F[S.me].g, pc.p, pc.mu, pc.oc, pc.u] = keep

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

// populace and walls are the panel's to report — the map used to carry them
// under every city and carries nothing there now
const nc = S.C[near]
ok(els.pan.innerHTML.includes('👥 Populace</span><span>' + (nc.p | 0)),
  'the panel reports the populace')
ok(els.pan.innerHTML.includes('🛡️ Walls</span><span>' + (nc.s | 0) + ' / ' + nc.m),
  'and what is left of the walls, against what they were')
drew.length = 0; step(1)
ok(drew.length > 0 && !drew.some(t => t.includes('👥') || t.includes('🛡') || t.includes('🌫️')),
  'while the map draws nothing at all under the city name')

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

// the din of battle rides on that marker, so it follows what the player can
// see rather than what the board is doing. sampled while the fight is still
// alive: at 8x a 120-v-120 melee is decided inside the twenty frames above
S.A = []; S.fx = []; step(2)
ok(made[CLASH].paused, 'with no fight on screen the din is quiet')
S.A = [host(7007, 3, near), host(7008, 4, near)]
S.speed = 8; step(2, 100)
ok(!made[CLASH].paused, 'a battle in sight starts it')
// pausing is a still picture — no ticks run, so the fight the marker records is
// not happening either. paused frames cost the board nothing, so this samples
// the same fight rather than staging a second one
S.speed = 0; step(2)
ok(S.fx.some(f => f.k === 1), 'pausing leaves the clash marker on screen')
ok(made[CLASH].paused, 'but the din stops while the game is paused')
S.speed = 8; step(1, 0)   // a frame of no elapsed time: the sim is untouched
ok(!made[CLASH].paused, 'and comes back when the board runs again')
S.A = [host(7009, 3, dark), host(7010, 4, dark)]
S.fx = []; step(2, 100)
ok(made[CLASH].paused, 'the same battle in the fog does not')

// --- being attacked is announced ------------------------------------------
const town = S.C.findIndex(c => c.o === S.me)
S.fx = []; S.toast = ''
S.A = [host(7005, 3, town)]
played.length = 0
ticks(4)
ok(/under attack/.test(S.toast), 'an attack on your city raises a notification')
ok(played.filter(i => i === HORN).length === 1,
  'the horn sounds once for it, not once a tick')
ok(!S.fx.some(f => f.k === 1), 'a siege draws no clash marker — there is nobody to fight')
ok(!made[CLASH].paused, 'but the din runs for it all the same')
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
played.length = 0
for (let i = 0; i < 2200 && !S.over; i++) step(20, 100)
ok(S.over !== 0, 'the game reaches an ending (' + (S.over > 0 ? 'win' : 'loss') + ')')
ok(played.includes(FANFARE) === (S.over > 0), 'the fanfare sounds on a win and only on a win')
ok(made[CLASH].paused, 'and the din stops with the game')
ok(/New story/.test(els.ov.innerHTML), 'end screen renders')
ok(/largest host/.test(els.ov.innerHTML), 'end screen shows the campaign tally')
ok(!/cities held/.test(els.ov.innerHTML), 'and no longer counts cities held')
ok(/📅 days/.test(els.ov.innerHTML) &&
  els.ov.innerHTML.includes('<b>' + (S.tick / T.day | 0) + '</b><span>📅 days</span>'),
  `and scores the campaign in days (${S.tick / T.day | 0})`)
const seedWas = S.seed
click('n')
ok(S.over === 0 && S.C.length === 20 && els.ov.innerHTML.includes('Horns of Dominion'), 'restart returns to the title')
ok(S.seed !== seedWas && location.hash === '#' + S.seed, 'restart rerolls the map and publishes the seed')

// --- the other ending, forced ----------------------------------------------
// a natural run reaches exactly one of the two, so the fanfare check above is
// only ever half a test. take the whole board and the other half runs too
played.length = 0
click('s', S.me)
ok(!played.includes(CHIME) && played.includes(SONG),
  'picking a realm brings the song up and does not chime under it')
step(2)
S.C.forEach(c => { c.o = S.me })
S.fx = [{ x: S.C[0].x, y: S.C[0].y, k: 1, l: 1 }]   // and a fight still on screen
played.length = 0
S.speed = 8
step(4, 100)
ok(S.over > 0, 'holding every city wins')
ok(played.includes(FANFARE), 'and the fanfare sounds for it')
ok(made[CLASH].paused, 'while the din stops even with a clash still drawn')

console.log(fail ? '\nFAILURES' : '\nall good')
process.exit(fail)
