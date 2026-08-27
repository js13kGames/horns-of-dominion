// headless balance harness — not shipped
import { S, NC, WIN } from './src/state.js'
import { genMap } from './src/map.js'
import { tick, cnt } from './src/sim.js'
import { ai } from './src/ai.js'

let wins = {}, lens = [], stuck = 0
for (let g = 0; g < 400; g++) {
  genMap(1000 + g)
  S.me = 0
  S.F.forEach(f => { f.ai = 1 })   // all-AI: does anyone ever win?
  // sanity on generation
  const deg = S.C.map(c => c.n.length)
  if (Math.min(...deg) < 1) console.log('game', g, 'ISOLATED NODE')
  if (S.C.some(c => c.o < 0)) console.log('game', g, 'UNOWNED CITY')
  const sizes = [0, 0, 0, 0, 0]; S.C.forEach(c => sizes[c.o]++)
  let t = 0
  for (; t < 12000; t++) {
    tick(); ai()
    S.over = 0                       // harness: ignore player-death ending
    if (S.F.some((f, i) => cnt(i) >= WIN)) break
  }
  const w = S.F.map((f, i) => cnt(i))
  const champ = w.indexOf(Math.max(...w))
  if (Math.max(...w) >= WIN) { wins[champ] = (wins[champ] || 0) + 1; lens.push(t) }
  else { stuck++; console.log('game', g, 'TIMEOUT', w) }
  if (g < 4) console.log(`g${g} deg[${Math.min(...deg)}-${Math.max(...deg)}] edges${S.E.length} start[${sizes}] end[${w}] armies${S.A.length} ticks${t}`)
}
lens.sort((a, b) => a - b)
console.log('decided', lens.length, 'stalemate', stuck)
if (lens.length) console.log('ticks  min', lens[0], 'med', lens[lens.length >> 1], 'max', lens[lens.length - 1],
  '| minutes at 1x  med', (lens[lens.length >> 1] * 0.5 / 60).toFixed(1))
console.log('winners', wins)
