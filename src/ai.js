import { S, T, dist } from './state.js'
import { raise, fix, order, canRaise, canFix, pw } from './sim.js'

// an enemy host walking the road between i and j — a flyer's whole reason to exist
const column = (i, j, f) => S.A.some(b => b.o !== f && b.t >= 0 &&
  ((b.a === i && b.t === j) || (b.a === j && b.t === i)))
const force = (i, f) => S.A.reduce((n, a) => n + (a.t < 0 && a.a === i && a.o !== f ? pw(a) : 0), 0)
const friend = (i, f) => S.A.reduce((n, a) => n + (a.t < 0 && a.a === i && a.o === f ? pw(a) : 0), 0)
// ticks for this host to walk to a neighbour, and the discount that puts on the
// prize. T.muster is the yardstick: a march longer than raising a fresh warband
// is worth about half as much. This is the only place the AI reads a road length
const eta = (a, j) => dist(S.C[a.a], S.C[j]) / (T.speed * T.K[a.k][2])
const soon = (a, j) => T.muster / (T.muster + eta(a, j))

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
  // the ceiling counts gold spent, in footman-equivalents, not bodies and not
  // fighting strength. bodies let a dragon realm field 2.2x the power for the
  // same cap; strength let a cheap flyer realm field 1.67x the bodies. either
  // way the board inflates and wars drag. price is the one measure that doesn't
  const host = S.A.reduce((n, a) => n + (a.o === f ? a.w * T.K[a.k][3] / T.K[0][3] : 0), 0)
  // the cap lifts as the war drags on, so a faction that has won the economy can
  // eventually field a host big enough to actually finish — no eternal see-saw
  if (F.g > T.K[0][3] * T.aiHoard &&
      host < mine.length * T.aiCap * F.dm.cap * (1 + S.tick / T.escal)) {
    const safe = mine.filter(i => !S.C[i].n.some(j => force(j, f) > 0))
    // a realm raises what its cities breed — but a flyer takes no cities, so it is
    // a wing, not an army. Cap it at a share of the war chest and the rest goes on
    // something that can knock a wall down. This is the doctrine, and the answer to
    // "when should it build them": always a few, never a host made of them
    const air = S.A.reduce((n, a) => n + (a.o === f && T.K[a.k][2] > 1
      ? a.w * T.K[a.k][3] / T.K[0][3] : 0), 0)
    const want = i => S.C[i].sp && (T.K[S.C[i].sp][2] <= 1 || air < host * T.wing) ? S.C[i].sp : 0
    const pool = (safe.length ? safe : mine).sort((a, b) => S.C[b].p - S.C[a].p)
      .find(i => canRaise(i, f, want(i)) || canRaise(i, f))
    if (pool !== undefined) raise(pool, f, canRaise(pool, f, want(pool)) ? want(pool) : 0)
  }

  const idle = S.A.filter(a => a.o === f && a.t < 0)

  // one march order per turn: relieve a siege first
  const hit = mine.find(i => force(i, f) > 0)
  if (hit !== undefined) {
    const help = idle.filter(a => a.a !== hit && S.C[a.a].n.includes(hit) && pw(a) > force(hit, f) * 0.8)
      .sort((x, y) => eta(x, hit) - eta(y, hit))[0]        // whoever gets there first
    if (help) { order(help, hit); return }
  }

  // a flyer hunts. Anything strung out on a road is worth more to it than any
  // city, because that is the one fight its speed actually wins
  for (const a of idle) {
    if (T.K[a.k][2] <= 1) continue
    const j = S.C[a.a].n.find(k => column(a.a, k, f))
    if (j !== undefined) { order(a, j); return }
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
        if (pw(a) * bold < e * 1.3 + 1.6 * Math.sqrt(c.d * Math.max(c.s, 1)) / T.K[a.k][1]) continue
        s = 4 + c.e * 0.5 + c.p / 60 - c.d * 0.3 - c.s / 25 - e / 30
        if (c.cap) s += 2
      }
      s *= soon(a, j)                        // a prize is worth what it costs to reach
      if (s > bs) { bs = s; best = j }
    }
    if (best >= 0) { order(a, best); return }
  }

  // nothing to do with the spare gold: shore up the weakest frontier wall
  const weak = mine
    .filter(i => S.C[i].s < S.C[i].m * 0.7 && S.C[i].n.some(j => S.C[j].o !== f))
    .sort((x, y) => S.C[x].s / S.C[x].m - S.C[y].s / S.C[y].m)[0]
  if (weak !== undefined && F.g > T.K[0][3] * 2 && canFix(weak, f)) fix(weak, f)
}
