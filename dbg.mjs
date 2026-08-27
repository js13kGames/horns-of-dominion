import { S, WIN, T } from './src/state.js'
import { genMap } from './src/map.js'
import { tick, cnt } from './src/sim.js'
import { ai } from './src/ai.js'
const g = +process.argv[2]
genMap(1000 + g); S.me = 0; S.F.forEach(f => { f.ai = 1 })
let engagedTicks = 0, movingTicks = 0, sieges = 0, captures = 0, flips = 0
let ownerWas = S.C.map(c => c.o)
for (var t = 0; t < 120000; t++) {
  tick(); ai(); S.over = 0
  for (const a of S.A) { if (a.t >= 0) (a.st ? engagedTicks++ : movingTicks++) }
  for (let i = 0; i < 20; i++) {
    const c = S.C[i]
    if (S.A.some(a => a.t < 0 && a.a === i && a.o !== c.o)) sieges++
    if (c.o !== ownerWas[i]) { flips++; ownerWas[i] = c.o }
  }
  if (S.F.some((f, i) => cnt(i) >= WIN)) { console.log('decided at', t); process.exit(0) }
}
console.log('TIMEOUT cities', S.F.map((f, i) => cnt(i)))
console.log('army-ticks: engaged', engagedTicks, 'moving', movingTicks, '| siege-ticks', sieges, '| city flips', flips)
console.log('armies', S.A.map(a => `${a.o}:${a.w | 0}${a.t >= 0 ? (a.st ? '⚔' : '→') + S.C[a.t].nm : '@' + S.C[a.a].nm}`).join('  '))
console.log('gold', S.F.map(f => f.g | 0))
