import { S, WIN } from './src/state.js'
import { genMap } from './src/map.js'
import { tick, cnt } from './src/sim.js'
import { ai } from './src/ai.js'
const out = []
for (let g = 0; g < 400; g++) {
  genMap(5000 + g); S.me = 0; S.F.forEach(f => { f.ai = 1 })
  let t = 0
  for (; t < 120000; t++) { tick(); ai(); S.over = 0; if (S.F.some((f, i) => cnt(i) >= WIN)) break }
  out.push([t, g, S.F.map((f, i) => cnt(i)).join('/')])
}
out.sort((a, b) => b[0] - a[0])
console.log('slowest games (ticks, seed offset, final cities):')
for (const [t, g, c] of out.slice(0, 6)) console.log(`  ${String(t).padStart(6)}  g${g}  ${c}`)
