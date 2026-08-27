import { S, T, WIN, NC } from './state.js'
import { REALMS } from './map.js'
import { raise, fix, canRaise, canFix, cnt, getArmy } from './sim.js'

const $ = id => document.getElementById(id)
const hud = $('hud'), pan = $('pan'), lg = $('log'), ov = $('ov')
export const hooks = {}
const set = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h } }
const btn = (a, i, on, txt) => `<button data-a=${a} data-i=${i}${on ? '' : ' disabled'}>${txt}</button>`

export function ui () {
  if (S.over || !S.F.length) return
  const F = S.F[S.me], n = cnt(S.me)
  set(hud, `<span>💎 <b>${F.g | 0}</b></span>` +
    `<span>🏰 <b>${n}</b>/${NC}</span>` +
    `<div class=bar><i style=width:${Math.min(100, n / WIN * 100)}%></i></div>` +
    `<span style=opacity:.55>${S.F.map((f, i) => f.alive ? `<span style=color:${f.c}>${f.em}${cnt(i)}</span>` : '').join(' ')}</span>` +
    `<div class=sp>${[[0, '⏸'], [1, '1×'], [2, '2×'], [4, '4×']]
      .map(([v, t]) => `<button data-a=v data-i=${v} class="${S.speed === v ? 'on' : ''}">${t}</button>`).join('')}</div>`)

  set(lg, S.log.map(l => `<div>${l}</div>`).join(''))

  const s = S.sel
  if (!s) return set(pan, '')
  if (s.k === 'c') {
    const c = S.C[s.i], own = c.o === S.me
    set(pan, `<h3>${c.cap ? '👑' : '🏰'} ${c.nm}</h3>` +
      row('Ruler', S.F[c.o].em + ' ' + S.F[c.o].nm) +
      row('👥 Populace', c.p | 0) +
      row('🛡 Defenses', (c.s | 0) + ' / ' + c.m) +
      row('⚔️ Defense', c.d) +
      row('💎 Economy', c.e) +
      (own
        ? `<div class=acts>${btn('r', s.i, canRaise(s.i, S.me), `🦄 Raise ${T.raiseW} — 💎${T.raiseG} 👥${T.raiseP}`)}` +
          `${btn('f', s.i, canFix(s.i, S.me), `🧱 Mend +${T.repairStep} — 💎${T.repair * T.repairStep}`)}</div>`
        : '<div class=hint>March a warband here to lay siege.</div>'))
  } else {
    const a = getArmy(s.i)
    if (!a) { S.sel = null; return set(pan, '') }
    set(pan, `<h3>🦄 Warband</h3>` +
      row('Banner', S.F[a.o].em + ' ' + S.F[a.o].nm) +
      row('Warriors', a.w | 0) +
      row('Status', a.t >= 0 ? `→ ${S.C[a.t].nm} ${(a.pr * 100) | 0}%` : `at ${S.C[a.a].nm}`) +
      (a.o === S.me && a.t < 0 ? '<div class=hint>Click a glowing neighbour to march.</div>' : ''))
  }
}
const row = (k, v) => `<div class=r><span>${k}</span><span>${v}</span></div>`

export function title () {
  ov.innerHTML = `<h1>🌈 Unicorn Overlord</h1>` +
    `<p>The Rainbow Kingdom has ${NC} cities and no rightful ruler. Raise warbands, break walls, and hold ${WIN} of them.</p>` +
    `<div class=realms>${REALMS.map(([nm, c, em], i) =>
      `<div class=realm data-a=s data-i=${i} style=color:${c}><div class=e>${em}</div><div class=n style=color:${c}>${nm}</div><div class=c>realm ${i + 1}</div></div>`).join('')}</div>` +
    `<p style=opacity:.4>space pauses · 1 2 3 set speed</p>`
}

export function ending () {
  const n = cnt(S.me), win = S.over > 0
  ov.innerHTML = `<h1>${win ? '👑 The Kingdom is yours' : '💀 Your banner falls'}</h1>` +
    `<p>${S.F[S.me].em} ${S.F[S.me].nm} held ${n} of ${NC} cities after ${(S.elapsed / 60) | 0}m ${(S.elapsed | 0) % 60}s.</p>` +
    `<button data-a=n>🌈 New kingdom</button>`
}
export const clearOv = () => { ov.innerHTML = '' }

addEventListener('click', e => {
  const el = e.target.closest('[data-a]')
  if (!el) return
  const a = el.dataset.a, i = +el.dataset.i
  if (a === 'r') raise(i, S.me)
  else if (a === 'f') fix(i, S.me)
  else if (a === 'v') S.speed = i
  else if (a === 's') hooks.start(i)
  else if (a === 'n') hooks.again()
  ui()
})
