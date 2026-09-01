// Music: a Voxby track played by SoundBox's player-small (Marcus Geelnard,
// zlib licence — see src/player.js). SoundBox renders the whole song up front,
// about 330 ms of work, so it is ground out one instrument per frame while the
// title screen is up rather than stalling the boot.
import { CPlayer } from './player.js'
import song from './song.js'

const can = typeof Audio !== 'undefined'   // headless harnesses have no audio
let gen = null, tune = null, want = 0
export let muted = 0

const play = () => { if (tune) want && !muted ? tune.play().catch(() => {}) : tune.pause() }

export function grind () {
  if (!can || tune) return
  if (!gen) { gen = new CPlayer(); gen.init(song) }
  if (gen.generate() < 1) return           // one instrument, 30–120 ms
  tune = new Audio(URL.createObjectURL(new Blob([gen.createWave()], { type: 'audio/wav' })))
  tune.loop = true
  gen = null
  play()
}

export const music = on => { want = on; play() }
export const mute = () => { muted = muted ? 0 : 1; play(); return muted }
