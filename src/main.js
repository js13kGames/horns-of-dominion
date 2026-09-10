import { S, applyDiff } from './state.js'
import { genMap, SCN } from './map.js'
import { tick, order, seeArmy, active, fighting } from './sim.js'
import { ai } from './ai.js'
import { resize, draw, toWorld, cityR, cv } from './render.js'
import { paint } from './terrain.js'
import { ui, title, ending, clearOv, hooks } from './ui.js'
import { grind, music, mute, chime, fanfare, clash } from './audio.js'

const TICK = 0.5          // seconds of real time per tick at 1×
let acc = 0, last = 0, playing = 0

let boot = 1
function fresh () {
  const h = boot ? parseInt(location.hash.slice(1)) : 0   // honour a shared seed once, then reroll
  boot = 0
  const c = SCN[S.scn]                       // a scenario is a fixed seed and a start date
  genMap(h > 0 ? h : c[1])                   // a seed in the URL still overrides it, once
  S.d0 = c[2]
  paint()
  location.hash = S.seed
}
hooks.start = f => {
  S.me = f
  S.F.forEach((x, i) => { x.ai = i !== f })
  applyDiff()
  clearOv(); playing = 1; music(1); ui()
}
hooks.again = () => { fresh(); title(); playing = 0 }

function frame (ts) {
  requestAnimationFrame(frame)
  grind()                   // renders the song a slice at a time, then stops costing anything
  const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0
  last = ts
  if (playing && !S.over) {
    S.elapsed += dt
    acc += dt * S.speed
    let guard = 0
    while (acc >= TICK && guard++ < 8) { acc -= TICK; tick(); ai() }
    S.alpha = Math.min(1, acc / TICK)
    if (S.toastT > 0 && (S.toastT -= dt) <= 0) S.toast = ''
    if (S.over) { ending(); if (S.over > 0) fanfare() }   // the din stops itself below
  }
  draw(dt)
  // the din is derived, like the fog — see fighting() in sim.js. a paused board
  // is a still picture, so the loop stops with it: S.speed is the whole pause
  clash(playing && !S.over && S.speed > 0 && fighting())
  const cur = active() ? 'crosshair' : ''   // the cursor says the map is armed
  if (cv.style.cursor !== cur) cv.style.cursor = cur
  ui()
}

cv.addEventListener('pointerdown', e => {
  if (!playing || S.over) return
  const p = toWorld(e.clientX, e.clientY)
  // hit-test what the player sees, not the logical spot. kinds refuse to merge,
  // so a node can hold three of your hosts closer together than they are wide —
  // clicking again walks to the next one rather than sticking on the first
  const near = S.A.filter(a => seeArmy(a) && Math.hypot(a.rx - p.x, a.ry - p.y) < 15)
  const cur = near.findIndex(a => S.sel && S.sel.k === 'a' && S.sel.i === a.id)
  const ha = near.length ? near[(cur + 1) % near.length] : null
  let hc = -1
  for (let i = 0; i < S.C.length; i++) {
    const c = S.C[i]
    if (Math.hypot(c.x - p.x, c.y - p.y) < cityR(c) + 6) { hc = i; break }
  }
  const act = active()
  if (act) {                            // a warband is up: the map is its order sheet
    const to = hc >= 0 ? hc : ha && ha.t < 0 ? ha.a : -1   // a city, or a host resting on one
    if (to >= 0) { order(act, to); chime() }
    else S.sel = null                   // anywhere else stands it down
    return ui()
  }
  S.sel = ha ? { k: 'a', i: ha.id } : hc >= 0 ? { k: 'c', i: hc } : null
  if (S.sel) chime()
  ui()
})

addEventListener('keydown', e => {
  const k = e.key
  if (k === ' ') { e.preventDefault(); S.speed = S.speed ? 0 : 1 }
  else if (k > '0' && k < '5') S.speed = [1, 2, 4, 8][k - 1]
  else if (k === 'm') mute()
  else if (k === 'Escape') S.sel = null
  ui()
})

addEventListener('resize', resize)
resize()
fresh()
title()
requestAnimationFrame(frame)
