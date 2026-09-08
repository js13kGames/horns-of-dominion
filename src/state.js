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
  raiseW: 40,       // warriors produced — every kind musters the same bodies
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
  sack: 0.45,       // pop multiplier on capture — a sacking hurts
  occupy: 18 / P,   // ticks a taken city is too cowed to conscript
  mend: 0.15 * P,   // passive wall regen per tick
  flee: 0.25,       // share of a host lost when it breaks contact
  odds: 0.7,        // a host disengages below this share of the enemy's strength
  aiHoard: 1.5,     // AI raises once gold > a footman's price * aiHoard
  aiEvery: 1 / P,   // ticks between AI turns — scales with pace, or the AI
                    // would get ten times as many decisions per unit of war
  aiCap: 55,        // AI stops mustering above this many warriors per city held
  bold: 4000 / P,   // AI aggression doubles every this many ticks
  dying: 2,         // a realm down to this many cities starts to crumble
  rot: 0.5 * P,     // wall points its holdings shed per tick while crumbling
  starve: 0.02 * P, // share of its hosts that melts away per tick while crumbling
  escal: 5000 / P,  // sieges grind faster every this many ticks
  slow: 10,         // ticks between unrest checks — it is a slow-burning thing
  stir: 4.4 * P,    // unrest a conquered city gathers per check, at full strength
  pace: 8 * P,      // unrest a garrison puts down per check — it must beat `stir`,
                    // which now takes 55% of a full-weight garrison, not 27%
  hold: 0.25,       // warriors per head of populace for a garrison at full weight
  seize: 70,        // unrest the moment a city falls to anyone but its own realm
  calm: 75,         // above this a city will not conscript for whoever holds it —
                    // a fresh conquest gets one draft in before it stews past this
  riot: 90,         // above this the city may throw its occupier out
  rise: 0.05,       // chance of it doing so, per check
  // the three kinds of warband. positional, not named: esbuild does not mangle
  // property names, so `K[k][0]` ships one character where `K[k].pow` ships four
  // at every read site. footman is all 1.0 and priced as an army always was, so a
  // board with no specialist cities behaves numerically exactly like the old game.
  //   [field power, wall power, march speed, gold, pop, glyph]
  //   0 footmen, raised anywhere · 1 unicorns, the flyer · 2 behemoths, the ram.
  // Glyphs must be *light*: a host is drawn on a near-black disc, so 🦅 and 🐎
  // came out as dark smudges at 13px and were rejected on looking at them.
  // behemoths are priced *below* footmen per point of field power (1.76 to 1.60).
  // that pays for a drawback the AI cannot manage: it scores targets by adjacency
  // and never reads T.speed, so a slow host is pure cost to it. At footman parity
  // its two behemoth realms won 202 of 1200 games against the unicorn realms' 265.
  K: [[1, 1, 1, 25, 40, '🔱'], [0.6, 0.5, 1.9, 45, 35, '🦄'], [2.2, 2.5, 0.55, 50, 45, '🐘']],
  amb: 0.6,          // how hard a speed advantage bites in an open-field fight
  home: 1.2,         // attack bonus for a host fighting at a city of its own realm
  wing: 0.15,       // share of a realm's war chest it will keep in flyers, no more
  sp: [2, 1, 2, 1, 1] // the specialist each realm breeds, at its capital and one other city
}

// --- difficulty: AI-only multipliers on economy, decisions, army cap, occupation ---
export const D = [
  { nm: 'Dreamer', inc: 0.5, acts: 1, cap: 0.5, pac: 0.6 },
  { nm: 'Duelist', inc: 1, acts: 1, cap: 1, pac: 1 },
  { nm: 'Warlord', inc: 1.6, acts: 2, cap: 1.45, pac: 1.15 },
  { nm: 'Tyrant', inc: 2.3, acts: 3, cap: 1.9, pac: 1.62 }
]
export const applyDiff = () => S.F.forEach(f => { f.dm = f.ai ? D[S.diff] : D[1] })

// --- game state -----------------------------------------------------------
export const S = {
  C: [],      // cities  {x,y,nm,o,p,d,e,s,m,n[]}
  A: [],      // armies  {o,w,a,t,pr,st}
  F: [],      // factions{g,c,em,nm,ai,alive}
  E: [],      // edges   [i,j]
  fx: [],     // transient effects {x,y,k,l,c}
  me: 0, sel: null, speed: 1, tick: 0, over: 0, seed: 1, elapsed: 0, alpha: 0, toast: '', toastT: 0, split: 1, diff: 2,
  stat: { took: 0, lost: 0, slain: 0, most: 0 }
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
export const owned = f => S.C.filter(c => c.o === f)
// something the player must not miss: a toast across the top
export function note (msg) { S.toast = msg; S.toastT = 4 }
export function boom (x, y, k, c) { S.fx.push({ x, y, k, c, l: 1 }) }
