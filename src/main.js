import { S, applyDiff } from './state.js'
import { genMap } from './map.js'
import { tick, getArmy, order, seeArmy } from './sim.js'
import { ai } from './ai.js'
import { resize, draw, toWorld, cityR, cv } from './render.js'
import { ui, title, ending, clearOv, hooks } from './ui.js'

const TICK = 0.5          // seconds of real time per tick at 1×
let acc = 0, last = 0, playing = 0

let boot = 1
function fresh () {
  const h = boot ? parseInt(location.hash.slice(1)) : 0   // honour a shared seed once, then reroll
  boot = 0
  genMap(h > 0 ? h : (Math.random() * 1e9) | 0)
  location.hash = S.seed
}
hooks.start = f => {
  S.me = f
  S.F.forEach((x, i) => { x.ai = i !== f })
  applyDiff()
  clearOv(); playing = 1; ui()
}
hooks.again = () => { fresh(); title(); playing = 0 }

function frame (ts) {
  requestAnimationFrame(frame)
  const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0
  last = ts
  if (playing && !S.over) {
    S.elapsed += dt
    acc += dt * S.speed
    let guard = 0
    while (acc >= TICK && guard++ < 8) { acc -= TICK; tick(); ai() }
    S.alpha = Math.min(1, acc / TICK)
    if (S.over) ending()
  }
  draw(dt)
  ui()
}

cv.addEventListener('pointerdown', e => {
  if (!playing || S.over) return
  const p = toWorld(e.clientX, e.clientY)
  let ha = null                       // hit-test what the player sees, not the logical spot
  for (const a of S.A) {
    if (!seeArmy(a)) continue                     // cannot click what you cannot see
    if (Math.hypot(a.rx - p.x, a.ry - p.y) < 15) { ha = a; break }
  }
  let hc = -1
  for (let i = 0; i < S.C.length; i++) {
    const c = S.C[i]
    if (Math.hypot(c.x - p.x, c.y - p.y) < cityR(c) + 6) { hc = i; break }
  }
  if (S.aim) {                          // targeting: the next city is a destination
    const a = getArmy(S.aim)
    const to = hc >= 0 ? hc : ha && ha.t < 0 ? ha.a : -1
    if (a && to >= 0) order(a, to)
    S.aim = 0
    return ui()
  }
  // a click selects; picking up one of your own hosts arms targeting straight away
  S.sel = ha ? { k: 'a', i: ha.id } : hc >= 0 ? { k: 'c', i: hc } : null
  S.aim = ha && ha.o === S.me ? ha.id : 0
  ui()
})

addEventListener('keydown', e => {
  const k = e.key
  if (k === ' ') { e.preventDefault(); S.speed = S.speed ? 0 : 1 }
  else if (k === '1') S.speed = 1
  else if (k === '2') S.speed = 2
  else if (k === '3') S.speed = 4
  else if (k === '4') S.speed = 8
  else if (k === 'Escape') { if (S.aim) S.aim = 0; else S.sel = null }
  ui()
})

addEventListener('resize', resize)
resize()
fresh()
title()
requestAnimationFrame(frame)
