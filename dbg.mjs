import { S, WIN, T } from './src/state.js'
import { genMap } from './src/map.js'
import { tick, cnt } from './src/sim.js'
import { ai } from './src/ai.js'
const g = +process.argv[2]
genMap(1000 + g); S.me = 0; S.F.forEach(f => { f.ai = 1 })
let orders = 0
for (let t = 0; t < 12000; t++) {
  const before = S.A.map(a => a.t).join()
  tick(); ai(); S.over = 0
  if (S.A.map(a => a.t).join() !== before) orders++
  if (S.F.some((f, i) => cnt(i) >= WIN)) { console.log('decided at', t); process.exit(0) }
}
console.log('TIMEOUT cities', S.F.map((f, i) => cnt(i)), 'orders issued', orders)
console.log('gold', S.F.map(f => f.g | 0))
console.log('armies', S.A.map(a => `${a.o}:${a.w | 0}@${S.C[a.a].nm}${a.t >= 0 ? '->' + S.C[a.t].nm : ''}`).join('  '))
const live = S.F.map((f, i) => i).filter(i => cnt(i) > 0)
for (const i of live) {
  const front = S.C.filter(c => c.o === i && c.n.some(j => S.C[j].o !== i))
  console.log('faction', i, 'frontier:', front.map(c => `${c.nm} s${c.s | 0}/${c.m} d${c.d} p${c.p | 0}`).join(' | '))
}
