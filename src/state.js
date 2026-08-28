export const W = 1000, H = 700
export const NC = 20
export const WIN = NC          // total conquest: every city or nothing

// --- seeded rng -----------------------------------------------------------
let s0 = 1
export function setSeed (n) { s0 = n >>> 0 }
export function rnd () {
  s0 = (s0 + 0x6D2B79F5) | 0
  let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
export const rf = (a, b) => a + rnd() * (b - a)
export const ri = (a, b) => Math.floor(rf(a, b + 1))
export const pick = a => a[ri(0, a.length - 1)]

// --- tunables (every balance number lives here) ---------------------------
// P scales every *rate* — gold, growth, marching, attrition, siege, mending —
// so the whole game slows down without a single balance ratio shifting.
// Quantities (costs, warriors, wall points) are deliberately left alone.
const P = 0.1
export const T = {
  inc: 0.05 * P,    // gold per econ point per tick
  grow: 0.004 * P,  // pop regrowth rate toward cap
  raiseG: 25,       // gold to raise an army
  raiseP: 40,       // population consumed
  raiseW: 40,       // warriors produced
  minPop: 55,       // pop floor to allow raising
  repair: 2,        // gold per point of wall repaired
  repairStep: 10,   // points per repair order
  muster: 6 / P,    // ticks to raise a warband — about one road crossing
  fixRate: 10 / 3 * P, // wall points rebuilt per tick once paid for
  speed: 26 * P,    // world units an army covers per tick
  reach: 18,        // contact range: armies this close on a road engage
  atk: 0.06 * P,    // field-battle attrition coefficient
  sgLoss: 0.15 * P, // attacker losses per tick = sgLoss * city.d
  sgDmg: P / 12,    // wall damage per tick per warrior
  garrison: 0.35,   // wall fraction restored to the captor
  sack: 0.75,       // pop multiplier on capture
  mend: 0.15 * P,   // passive wall regen per tick
  flee: 0.25,       // share of a host lost when it breaks contact
  odds: 0.7,        // a host disengages below this share of the enemy's strength
  aiHoard: 1.5,     // AI raises once gold > raiseG * aiHoard
  aiEvery: 1 / P,   // ticks between AI turns — scales with pace, or the AI
                    // would get ten times as many decisions per unit of war
  aiCap: 55,        // AI stops mustering above this many warriors per city held
  bold: 4000 / P,   // AI aggression doubles every this many ticks
  dying: 2,         // a realm down to this many cities starts to crumble
  rot: 0.5 * P,     // wall points its holdings shed per tick while crumbling
  starve: 0.02 * P, // share of its hosts that melts away per tick while crumbling
  escal: 5000 / P   // sieges grind faster every this many ticks
}

// --- difficulty: AI-only multipliers on economy, decisions per turn, army cap ---
export const D = [
  { nm: 'Dreamer', inc: 0.5, acts: 1, cap: 0.5 },
  { nm: 'Duelist', inc: 1, acts: 1, cap: 1 },
  { nm: 'Warlord', inc: 1.4, acts: 2, cap: 1.3 },
  { nm: 'Tyrant', inc: 2, acts: 3, cap: 1.7 }
]
export const applyDiff = () => S.F.forEach(f => { f.dm = f.ai ? D[S.diff] : D[1] })

// --- game state -----------------------------------------------------------
export const S = {
  C: [],      // cities  {x,y,nm,o,p,d,e,s,m,n[]}
  A: [],      // armies  {o,w,a,t,pr,st}
  F: [],      // factions{g,c,em,nm,ai,alive}
  E: [],      // edges   [i,j]
  fx: [],     // transient effects {x,y,k,l,c}
  log: [],
  me: 0, sel: null, speed: 1, tick: 0, over: 0, seed: 1, elapsed: 0, alpha: 0, split: 1, aim: 0, diff: 2,
  stat: { took: 0, lost: 0, slain: 0, most: 0 }
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
export const owned = f => S.C.filter(c => c.o === f)
export function say (msg) { S.log.unshift(msg); S.log.length = Math.min(S.log.length, 4) }
export function boom (x, y, k, c) { S.fx.push({ x, y, k, c, l: 1 }) }
