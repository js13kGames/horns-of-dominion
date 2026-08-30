import { S, T, WIN, NC, D } from './state.js'
import { REALMS } from './map.js'
import { raise, fix, split, order, canRaise, canFix, canSplit, cnt, getArmy, prog, seeCity } from './sim.js'

const $ = id => document.getElementById(id)
const hud = $('hud'), pan = $('pan'), lg = $('log'), ov = $('ov'), ts = $('toast')
export const hooks = {}
const set = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h } }
const btn = (a, i, on, txt) => `<button data-a=${a} data-i=${i}${on ? '' : ' disabled'}>${txt}</button>`

export function ui () {
  if (S.over || !S.F.length) return
  const F = S.F[S.me], n = cnt(S.me)
  set(hud, `<span style=color:${F.c}>${F.em} <b>${F.nm}</b></span>` +
    `<span>💎 <b>${F.g | 0}</b></span>` +
    `<span>🏰 <b>${n}</b>/${NC}</span>` +
    `<div class=bar><i style=width:${Math.min(100, n / WIN * 100)}%></i></div>` +
    `<span style=opacity:.55>${S.F.map((f, i) => f.alive ? `<span style=color:${f.c}>${f.em}${cnt(i)}</span>` : '').join(' ')}</span>` +
    `<div class=sp>${[[0, '⏸'], [1, '1×'], [2, '2×'], [4, '4×'], [8, '8×']]
      .map(([v, t]) => `<button data-a=v data-i=${v} class="${S.speed === v ? 'on' : ''}">${t}</button>`).join('')}</div>`)

  set(lg, S.log.map(l => `<div>${l}</div>`).join(''))
  set(ts, S.toast ? `<div>${S.toast}</div>` : '')

  const s = S.sel
  if (!s) return set(pan, '')
  if (s.k === 'c') {
    const c = S.C[s.i], own = c.o === S.me, lit = seeCity(s.i)
    const q = '<span style=opacity:.45>???</span>'
    set(pan, `<h3>${lit && c.cap ? '👑' : '🏰'} ${c.nm}</h3>` +
      row('Ruler', lit ? S.F[c.o].em + ' ' + S.F[c.o].nm : '🌫️ unknown') +
      row('👥 Populace', lit ? c.p | 0 : q) +
      row('🛡 Defenses', lit ? (c.s | 0) + ' / ' + c.m : q) +
      row('⚔️ Defense', lit ? c.d : q) +
      row('💎 Economy', lit ? c.e : q) +
      row('✊ Loyalty', lit ? (c.L[c.o] | 0) + '% · native ' + S.F[c.na].em : q) +
      (own
        ? `<div class=acts>${btn('r', s.i, canRaise(s.i, S.me), c.oc
            ? `🔒 Cowed — ${(c.oc / T.muster).toFixed(1)} musters`
            : c.L[S.me] <= T.loyMin
              ? `✊ Restless ${c.L[S.me] | 0}% — garrison ${Math.ceil(c.p * T.hold)}`
              : c.mu
              ? `⏳ Mustering ${(100 - c.mu / T.muster * 100) | 0}%`
                : `🦄 Raise ${T.raiseW} — 💎${T.raiseG} 👥${T.raiseP}`)}` +
          `${btn('f', s.i, canFix(s.i, S.me), c.rp
            ? `🧱 Rebuilding — ${Math.ceil(c.rp)} to go`
            : `🧱 Mend +${T.repairStep} — 💎${T.repair * T.repairStep}`)}</div>`
        : `<div class=hint>${lit ? 'March a warband here to lay siege.' : '🌫️ Beyond your reach. Scout it with a warband.'}</div>`))
    return
  }

  const a = getArmy(s.i)
  if (!a) { S.sel = null; S.aim = 0; return set(pan, '') }
  const mine = a.o === S.me
  set(pan, '<h3>🦄 Warband</h3>' +
    row('Banner', S.F[a.o].em + ' ' + S.F[a.o].nm) +
    row('Warriors', a.w | 0) +
    row('Status', a.t >= 0
      ? `${a.st ? '⚔️' : '→'} ${S.C[a.t].nm} ${(prog(a) * 100) | 0}%`
      : `at ${S.C[a.a].nm}`) +
    (a.dst >= 0 && a.dst !== a.t ? row('Bound for', S.C[a.dst].nm) : '') +
    (mine
      ? `<div class=acts>` +
        (S.aim === a.id ? btn('k', 0, 1, '✖ Cancel') : btn('m', 0, 1, '🎯 Mobilize')) +
        (a.t >= 0
          ? btn('b', 0, 1, `↩ Turn back${a.st ? ` — ⚠️ ${T.flee * 100 | 0}% lost` : ''}`)
          : '') +
        (canSplit(a)
          ? `<div class=sr><input type=range id=sl><b id=slv></b></div>${btn('x', 0, 1, '✂️ Split off')}`
          : '') +
        `</div><div class=hint>${S.aim === a.id
          ? '🎯 Choose a destination on the map.'
          : 'Mobilize to march anywhere on the map.'}</div>`
      : '') +
    roster(a))
  sync(a)
}

// the slider is kept OUT of the diffed string on purpose — writing its value
// imperatively means dragging never rewrites the panel underneath the drag
function sync (a) {
  const sl = $('sl')
  if (!sl) return
  const max = Math.floor(a.w) - 1
  sl.min = 1; sl.max = max
  if (!(S.split >= 1) || S.split > max) S.split = Math.max(1, Math.round(max / 2))
  if (document.activeElement !== sl) sl.value = S.split
  const v = $('slv')
  if (v) v.textContent = S.split + ' of ' + (a.w | 0)
}

// who else is in this fight, and what they are defending
function roster (a) {
  if (!a.eg) return ''
  const pow = {}
  for (const id of a.eg) {
    const b = getArmy(id)
    if (b) pow[b.o] = (pow[b.o] || 0) + b.w
  }
  const rows = Object.keys(pow)
    .sort((p, q) => (+q === a.o) - (+p === a.o))
    .map(o => row(S.F[o].em + ' ' + S.F[o].nm, ((pow[o] | 0) || 1) + ' 🦄'))
  let def = ''
  if (a.sg >= 0) {
    const c = S.C[a.sg]
    def = row('🏰 ' + c.nm + ' ' + S.F[c.o].em, (c.s | 0) + '/' + c.m + ' 🛡 · ' + c.d + ' ⚔️')
  }
  return `<h3 class=bt>${a.sg >= 0 ? '🏰 Siege' : '⚔️ Battle'}</h3>` + rows.join('') + def
}

const row = (k, v) => `<div class=r><span>${k}</span><span>${v}</span></div>`

export function title () {
  ov.innerHTML = `<h1>🌈 Unicorn Overlord</h1>` +
    `<p>The Rainbow Kingdom has ${NC} cities and no rightful ruler. Raise warbands, break walls, and take every last one.</p>` +
    `<div class=diff>${D.map((d, i) =>
      `<button data-a=d data-i=${i} class="${S.diff === i ? 'on' : ''}">${d.nm}</button>`).join('')}</div>` +
    `<div class=realms>${REALMS.map(([nm, c, em], i) =>
      `<div class=realm data-a=s data-i=${i} style=color:${c}><div class=e>${em}</div><div class=n style=color:${c}>${nm}</div><div class=c>realm ${i + 1}</div></div>`).join('')}</div>` +
    `<p style=opacity:.4>space pauses · 1 2 3 set speed</p>`
}

export function ending () {
  const win = S.over > 0, t = S.stat
  ov.innerHTML = `<h1>${win ? '👑 The Rainbow Kingdom is yours' : '💀 Your banner falls'}</h1>` +
    `<p>${S.F[S.me].em} ${S.F[S.me].nm} · ${D[S.diff].nm} · ${(S.elapsed / 60) | 0}m ${(S.elapsed | 0) % 60}s</p>` +
    `<div class=tally>` +
    `<div><b>${t.took}</b><span>🏰 taken</span></div>` +
    `<div><b>${t.lost}</b><span>💔 lost</span></div>` +
    `<div><b>${t.slain}</b><span>⚔️ hosts broken</span></div>` +
    `<div><b>${t.most | 0}</b><span>🦄 largest host</span></div>` +
    `</div><button data-a=n>🌈 New kingdom</button>`
}
export const clearOv = () => { ov.innerHTML = '' }

addEventListener('input', e => {
  if (!e.target || e.target.id !== 'sl') return
  S.split = +e.target.value
  const v = $('slv')
  if (v) v.textContent = S.split
})

addEventListener('click', e => {
  const el = e.target.closest('[data-a]')
  if (!el) return
  const a = el.dataset.a, i = +el.dataset.i
  if (a === 'r') raise(i, S.me)
  else if (a === 'x') split(getArmy(S.sel && S.sel.i), S.split)
  else if (a === 'm') S.aim = S.sel && S.sel.i
  else if (a === 'k') S.aim = 0
  else if (a === 'b') { const h = getArmy(S.sel && S.sel.i); if (h) order(h, h.a) }
  else if (a === 'f') fix(i, S.me)
  else if (a === 'v') S.speed = i
  else if (a === 'd') { S.diff = i; title() }
  else if (a === 's') hooks.start(i)
  else if (a === 'n') hooks.again()
  ui()
})
