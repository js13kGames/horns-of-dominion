// Four sound effects from the same Voxby tracker as the song, rendered by the
// same CPlayer (src/player.js). This is the transcription of the tracker's own
// exports and the only copy of them — to change a sound, re-export it from the
// tracker and fold the new instrument row and note columns in here.
//
// Each effect is one instrument over one 32-row pattern,
// so the song wrapper the tracker repeats around every export is written once
// here. The three tonal voices are near-identical rows and were briefly folded
// into a shared instrument plus patches — that cost 20 B rather than saving
// them, because Roadroller models the repetition better than the patch loop
// compresses. Leave them spelled out.
const trk = (i, n, f) => ({
  songData: [{ i, p: [1], c: [{ n, f }] }],
  rowLen: 4725, patternLen: 32, endPattern: 0, numChannels: 1
})

// note columns are flat: row + col * 32, so a chord is one row across columns
export const SFX = [
  // 1 — a battle horn, two rising thirds. under attack
  trk([3, 146, 140, 0, 1, 224, 128, 3, 0, 70, 39, 0, 38, 0, 0, 0, 3, 91, 1, 1, 2, 82, 97, 11, 32, 150, 3, 67, 2],
    [123, , 130, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 135, , 142, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 147, , 154],
    [13, , 13, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 38, , 91]),
  // 2 — one short chime. a button, a realm, a city
  trk([3, 112, 140, 0, 1, 179, 128, 3, 0, 70, 24, 0, 18, 0, 0, 0, 3, 91, 1, 1, 2, 82, 97, 11, 32, 150, 3, 117, 2],
    [147, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 142, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 139],
    []),
  // 3 — a fanfare. the player takes the kingdom
  trk([3, 112, 140, 0, 1, 179, 128, 3, 0, 70, 32, 0, 93, 0, 0, 0, 3, 91, 1, 1, 2, 82, 97, 11, 32, 150, 3, 67, 2],
    [142, , , 142, , 147, , , , , , , 154, , , , 157, , , , 156, 154, 152, , 154, , , , , , , , 130, , , 130, , 135, , , , , , , 142, , , , 145, , , , 144, 142, 140, , 142, , , , , , , , 111, , , 111, , 130, , , , , , , 127, , , , 128, , , , 128, 127, 125, , 127, , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , , 111],
    [13, , , , , 13, , , , , , , 13, , , , , , , , 13, , 13, , 13, , , , , , , , 31, , , , , 68, , , , , , , 45, , , , , , , , 28, , 41, , 93]),
  // 4 — steel on steel, loudest at the front. loops while a battle is on
  trk([2, 87, 140, 0, 0, 0, 140, 0, 0, 151, 5, 0, 113, 193, 1, 7, 0, 0, 0, 0, 3, 160, 90, 10, 121, 0, 0, 52, 1],
    [, , 159, , , , 159, 161, , , , 159, , 159, , , , 161, 159, , , 161, , 135, 147, , 161, , 159, 161],
    [13, 10, 22, , 13, , 22, 22, 13, , 13, 22, 13, 22, , , , 22, 13, , , 22, , 10, 10, 10, 22, , 22, , , , 141, 192, 152, , 120, , 100, 120, 168, , 83, 136, 130, 158, , , , 129, 113, , , 143, , 151, 99, 216, 131, , 160])
]
