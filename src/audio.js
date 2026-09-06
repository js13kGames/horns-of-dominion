// Music: a Voxby track played by SoundBox's player-small (Marcus Geelnard,
// zlib licence — see src/player.js). SoundBox renders a whole track up front,
// about 330 ms of work for the song alone, so every track — the song first,
// then the four sound effects — is ground out one instrument per frame from
// the render loop rather than stalling the boot.
import { CPlayer } from './player.js'
import song from './song.js'
import { SFX } from './sfx.js'

const can = typeof Audio !== 'undefined'   // headless harnesses have no audio
const TRK = [song, ...SFX]                 // 0 song · 1 horn · 2 chime · 3 fanfare · 4 clash
const bank = []
let gen = null, at = 0, want = 0, fight = 0
export let muted = 0

// the two looping tracks are the only ones with state to reconcile; the
// one-shots are fired, not held
const play = () => {
  const t = bank[0], w = bank[4]
  if (t) want && !muted ? t.play().catch(() => {}) : t.pause()
  if (w) fight && !muted ? w.play().catch(() => {}) : w.pause()
}

export function grind () {
  if (!can || at >= TRK.length) return
  if (!gen) { gen = new CPlayer(); gen.init(TRK[at]) }
  if (gen.generate() < 1) return           // one instrument, 30–120 ms
  const a = bank[at] = new Audio(URL.createObjectURL(
    new Blob([gen.createWave()], { type: 'audio/wav' })))
  a.loop = !at || at === 4                // the song and the din of battle
  if (at === 4) a.volume = 0.4           // ambience sits under the song, not on it
  gen = null; at++
  play()
}

const shot = i => {
  const a = bank[i]
  // the rewind is skipped on a never-played element, which reads 0 anyway and
  // whose currentTime setter older WebKit refused before metadata arrived
  if (a && !muted) { if (a.currentTime) a.currentTime = 0; a.play().catch(() => {}) }
}
export const horn = () => shot(1)         // something of yours is under attack
export const chime = () => shot(2)        // a button did what it said
export const fanfare = () => shot(3)      // the kingdom is yours

export const clash = on => { if (!fight !== !on) { fight = on; play() } }
export const music = on => { want = on; play() }
export const mute = () => { muted = muted ? 0 : 1; play(); return muted }
