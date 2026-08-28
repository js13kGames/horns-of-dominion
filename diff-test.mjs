// is the difficulty ladder actually a ladder? one realm on rung X, four on rung 1.
import { S, WIN, D } from './src/state.js'
import { genMap } from './src/map.js'
import { tick, cnt } from './src/sim.js'
import { ai } from './src/ai.js'

const N = +process.argv[2] || 200
console.log(`${N} games per rung — one realm on the rung, the other four on Duelist\n`)
console.log('rung        inc acts cap   wins   share   p50 ticks')
for (let r = 0; r < D.length; r++) {
  let wins = 0, lens = []
  for (let g = 0; g < N; g++) {
    genMap(3000 + g)
    S.me = 0
    S.F.forEach((f, i) => { f.ai = 1; f.dm = D[i === 0 ? r : 1] })
    let t = 0
    for (; t < 120000; t++) {
      tick(); ai(); S.over = 0
      if (S.F.some((f, i) => cnt(i) >= WIN)) break
    }
    const c = S.F.map((f, i) => cnt(i))
    if (c[0] >= WIN) wins++
    lens.push(t)
  }
  lens.sort((a, b) => a - b)
  const d = D[r]
  console.log(`${d.nm.padEnd(10)} ${String(d.inc).padStart(4)} ${String(d.acts).padStart(4)} ` +
    `${String(d.cap).padStart(4)}  ${String(wins).padStart(5)}  ${(wins / N * 100).toFixed(1).padStart(5)}%  ` +
    `${String(lens[N >> 1]).padStart(8)}`)
}
console.log('\n(a fair rung against four Duelists should sit near 20%)')
