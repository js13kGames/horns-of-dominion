import { S, T } from './state.js'
import { raise, fix, order, canRaise, canFix } from './sim.js'

const force = (i, f) => S.A.reduce((n, a) => n + (a.t < 0 && a.a === i && a.o !== f ? a.w : 0), 0)
const friend = (i, f) => S.A.reduce((n, a) => n + (a.t < 0 && a.a === i && a.o === f ? a.w : 0), 0)

// one faction acts per turn, round-robin. how many decisions it gets on that
// turn is what difficulty buys — along with gold and a bigger standing army.
export function ai () {
  if (S.tick % T.aiEvery) return
  // rotate who goes last each cycle: acting last means acting on the freshest
  // board, and a fixed order hands that advantage to the same realm every time
  const slot = (S.tick / T.aiEvery) | 0
  const f = (slot + ((slot / S.F.length) | 0)) % S.F.length
  const F = S.F[f]
  if (!F.ai || !F.alive) return
  let k = F.dm.acts
  while (k-- > 0) step(f, F)
}

function step (f, F) {
  const mine = S.C.map((c, i) => i).filter(i => S.C[i].o === f)
  if (!mine.length) return

  // muster — bounded, and never at the expense of marching
  const host = S.A.reduce((n, a) => n + (a.o === f ? a.w : 0), 0)
  // the cap lifts as the war drags on, so a faction that has won the economy can
  // eventually field a host big enough to actually finish — no eternal see-saw
  if (F.g > T.raiseG * T.aiHoard &&
      host < mine.length * T.aiCap * F.dm.cap * (1 + S.tick / T.escal)) {
    const safe = mine.filter(i => !S.C[i].n.some(j => force(j, f) > 0))
    const pool = (safe.length ? safe : mine)
      .sort((a, b) => S.C[b].p - S.C[a].p).find(i => canRaise(i, f))
    if (pool !== undefined) raise(pool, f)
  }

  const idle = S.A.filter(a => a.o === f && a.t < 0)

  // one march order per turn: relieve a siege first
  const hit = mine.find(i => force(i, f) > 0)
  if (hit !== undefined) {
    const help = idle.find(a => a.a !== hit && S.C[a.a].n.includes(hit) && a.w > force(hit, f) * 0.8)
    if (help) { order(help, hit); return }
  }

  // otherwise take ground. a long war makes everyone bolder, so borders never freeze
  const bold = 1 + S.tick / T.bold
  for (const a of idle) {
    let best = -1, bs = 0
    for (const j of S.C[a.a].n) {
      const c = S.C[j], e = force(j, f)
      let s
      if (c.o === f) {
        // reinforce a threatened neighbour, or drift toward the frontier
        s = c.n.some(k => S.C[k].o !== f) ? 1 + friend(j, f) / 100 : 0
        if (force(j, f) > 0) s += 6
      } else {
        // enough to beat the field force and crack the walls before bleeding out
        if (a.w * bold < e * 1.3 + 1.6 * Math.sqrt(c.d * Math.max(c.s, 1))) continue
        s = 4 + c.e * 0.5 + c.p / 60 - c.d * 0.3 - c.s / 25 - e / 30
        if (c.cap) s += 2
      }
      if (s > bs) { bs = s; best = j }
    }
    if (best >= 0) { order(a, best); return }
  }

  // nothing to do with the spare gold: shore up the weakest frontier wall
  const weak = mine
    .filter(i => S.C[i].s < S.C[i].m * 0.7 && S.C[i].n.some(j => S.C[j].o !== f))
    .sort((x, y) => S.C[x].s / S.C[x].m - S.C[y].s / S.C[y].m)[0]
  if (weak !== undefined && F.g > T.raiseG * 2 && canFix(weak, f)) fix(weak, f)
}
