import { S, T, D } from './state.js'
import { REALMS } from './map.js'
import { mute, muted } from './audio.js'
import { raise, fix, split, canRaise, canFix, canSplit, getArmy, seeCity } from './sim.js'

const $ = id => document.getElementById(id)
const hud = $('hud'), pan = $('pan'), ov = $('ov'), ts = $('toast')
export const hooks = {}
const set = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h } }
const btn = (a, i, on, txt) => `<button data-a=${a} data-i=${i}${on ? '' : ' disabled'}>${txt}</button>`

export function ui () {
  if (S.over || !S.F.length) return
  const F = S.F[S.me]
  set(hud, `<span style=color:${F.c}>${F.em} <b>${F.nm}</b></span>` +
    `<span>💎 <b>${F.g | 0}</b></span>` +
    `<div class=sp><button data-a=q>${muted ? '🔇' : '🔊'}</button>` +
    `${[[0, '⏸'], [1, '1×'], [2, '2×'], [4, '4×'], [8, '8×']]
      .map(([v, t]) => `<button data-a=v data-i=${v} class="${S.speed === v ? 'on' : ''}">${t}</button>`).join('')}</div>`)

  set(ts, S.toast ? `<div>${S.toast}</div>` : '')

  const s = S.sel
  if (!s) return set(pan, '')
  if (s.k === 'c') {
    const c = S.C[s.i], own = c.o === S.me, lit = seeCity(s.i)
    const q = '<span style=opacity:.45>???</span>'
    set(pan, `<h3>${lit && c.cap ? '👑' : '🏰'} ${c.nm}</h3>` +
      row('⚔️ Defense', lit ? c.d : q) +
      row('💎 Economy', lit ? c.e : q) +
      row('✊ Unrest', lit ? (c.u | 0) + '%' : q) +
      (own
        ? `<div class=acts>${btn('r', s.i, canRaise(s.i, S.me), c.oc
            ? `🔒 Cowed — ${(c.oc / T.muster).toFixed(1)} musters`
            : c.u >= T.calm
              ? `✊ Restless ${c.u | 0}% — garrison ${Math.ceil(c.p * T.hold)}`
              : c.mu
              ? `⏳ Mustering ${(100 - c.mu / T.muster * 100) | 0}%`
                : `${T.K[0][5]} Raise ${T.raiseW} — 💎${T.K[0][3]} 👥${T.K[0][4]}`)}` +
          `${c.sp ? btn('g', s.i, canRaise(s.i, S.me, c.sp),
            `${T.K[c.sp][5]} Raise ${T.raiseW} — 💎${T.K[c.sp][3]} 👥${T.K[c.sp][4]}`) : ''}` +
          `${btn('f', s.i, canFix(s.i, S.me), c.rp
            ? `🧱 Rebuilding — ${Math.ceil(c.rp)} to go`
            : `🧱 Mend +${T.repairStep} — 💎${T.repair * T.repairStep}`)}</div>`
        : ''))
    return
  }

  const a = getArmy(s.i)
  if (!a) { S.sel = null; return set(pan, '') }
  if (a.o !== S.me || !canSplit(a)) return set(pan, '')
  set(pan, `<div class=acts><div class=sr><input type=range id=sl><b id=slv></b></div>` +
    `${btn('x', 0, 1, '✂️ Split')}</div>`)
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

const row = (k, v) => `<div class=r><span>${k}</span><span>${v}</span></div>`

export function title () {
  ov.innerHTML = `<h1>Horns of Dominion</h1>` +
    `<p>Raise unicorn warbands and conquer the Rainbow Kingdom.</p>` +
    `<div class=diff>${D.map((d, i) =>
      `<button data-a=d data-i=${i} class="${S.diff === i ? 'on' : ''}">${d.nm}</button>`).join('')}</div>` +
    `<div class=realms>${REALMS.map(([nm, c, em], i) =>
      `<div class=realm data-a=s data-i=${i} style=color:${c}><div class=e>${em}</div><div class=n style=color:${c}>${nm}</div></div>`).join('')}</div>` +
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
    `</div><button data-a=n>🌈 New story</button>`
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
  else if (a === 'g') raise(i, S.me, S.C[i].sp)
  else if (a === 'x') split(getArmy(S.sel && S.sel.i), S.split)
  else if (a === 'f') fix(i, S.me)
  else if (a === 'q') mute()
  else if (a === 'v') S.speed = i
  else if (a === 'd') { S.diff = i; title() }
  else if (a === 's') hooks.start(i)
  else if (a === 'n') hooks.again()
  ui()
})
