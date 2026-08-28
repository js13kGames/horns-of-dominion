// headless balance harness — not shipped
import { S, NC, WIN } from './src/state.js'
import { genMap } from './src/map.js'
import { tick, cnt } from './src/sim.js'
import { ai } from './src/ai.js'

let wins = {}, lens = [], stuck = 0
for (let g = 0; g < 400; g++) {
  genMap((+process.argv[2] || 1000) + g)
  S.me = 0
  S.F.forEach(f => { f.ai = 1 })   // all-AI: does anyone ever win?
  // sanity on generation
  const deg = S.C.map(c => c.n.length)
  if (Math.min(...deg) < 1) console.log('game', g, 'ISOLATED NODE')
  if (S.C.some(c => c.o < 0)) console.log('game', g, 'UNOWNED CITY')
  const sizes = [0, 0, 0, 0, 0]; S.C.forEach(c => sizes[c.o]++)
  let t = 0
  for (; t < 120000; t++) {
    tick(); ai()
    S.over = 0                       // harness: ignore player-death ending
    for (const a of S.A) {           // road-lock watchdog
      if (a.t < 0) { a.stall = 0; continue }
      a.stall = a.pr === a.lastpr ? (a.stall || 0) + 1 : 0
      a.lastpr = a.pr
      if (a.stall === 5000) {
        const foe = S.A.some(b => b !== a && b.o !== a.o && (b.a === a.a || b.a === a.t) && b.t >= 0)
        console.log('game', g, 'ROAD LOCK', a.o, (a.w | 0) + 'w', 'enemy on road:', foe)
      }
    }
    if (S.F.some((f, i) => cnt(i) >= WIN)) break
  }
  const w = S.F.map((f, i) => cnt(i))
  const champ = w.indexOf(Math.max(...w))
  if (Math.max(...w) >= WIN) { wins[champ] = (wins[champ] || 0) + 1; lens.push(t) }
  else { stuck++; console.log('game', g, 'TIMEOUT', w) }
  if (g < 4) console.log(`g${g} deg[${Math.min(...deg)}-${Math.max(...deg)}] edges${S.E.length} start[${sizes}] end[${w}] armies${S.A.length} ticks${t}`)
}
lens.sort((a, b) => a - b)
const q = p => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))]
const mins = t => (t * 0.5 / 60).toFixed(0)
console.log('decided', lens.length, 'stalemate', stuck)
if (lens.length) {
  console.log(`ticks  p50 ${q(.5)}  p90 ${q(.9)}  p99 ${q(.99)}  max ${lens[lens.length - 1]}`)
  console.log(`min@1x p50 ${mins(q(.5))}  p90 ${mins(q(.9))}   |   min@8x p50 ${(mins(q(.5)) / 8).toFixed(1)}  p90 ${(mins(q(.9)) / 8).toFixed(1)}`)
  const slow = lens.filter(t => t > 24000).length + stuck
  console.log(`over 24k ticks (>25 min even at 8x): ${slow}/${lens.length + stuck} = ${(slow / (lens.length + stuck) * 100).toFixed(1)}%`)
}
console.log('winners', wins)
