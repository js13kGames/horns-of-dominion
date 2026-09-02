import { S, T } from './src/state.js'
import { genMap } from './src/map.js'
const N = 1200
const acc = Array.from({ length: 5 }, () => ({ n: 0, e: 0, p: 0, m: 0, d: 0, deg: 0, front: 0, sp: 0 }))
for (let g = 0; g < N; g++) {
  genMap(1000 + g)
  for (const c of S.C) {
    const a = acc[c.o]
    a.n++; a.e += c.e; a.p += c.p; a.m += c.m; a.d += c.d; a.deg += c.n.length; a.sp += !!c.sp
    a.front += c.n.filter(j => S.C[j].o !== c.o).length
  }
}
const f = x => (x / N).toFixed(2)
console.log('per game, per faction index:')
console.log('idx  cities  econ   pop     walls   def    degree  frontier-edges  breeds ' +
  T.sp.map((k, i) => i + ':' + T.K[k][5]).join(' '))
acc.forEach((a, i) => console.log(
  ` ${i}   ${f(a.n)}    ${f(a.e)}  ${f(a.p)}  ${f(a.m)}  ${f(a.d)}   ${f(a.deg)}    ${f(a.front)}         ${f(a.sp)}`))
