# 🦄 Unicorn Overlord

A real-time-with-pause strategy game for the 13KB budget. Take **every one** of the
Rainbow Kingdom's 20 cities as a unicorn overlord: raise warbands from your cities'
populace, march them across the node map, break enemy field armies, and grind down
walls. Four AI difficulty rungs, starting on the third.

    npm install
    npm run dev      # http://localhost:8080, rebuilds on save
    npm run build    # writes dist/index.html + dist/game.zip, fails over 13312 B

Controls: click one of your warbands and it is ready to move — click any city and it
paths there across the map · ↩ Turn back reverses a march · ✂️ Split divides a resting
warband · ✖ Cancel (or `esc`) disarms targeting, so you can inspect cities freely ·
`space` pause · `1`–`4` speed (1× 2× 4× 8×) · `esc` again clears the selection.

**Fog of war.** You see a city only while you hold it, border it, or stand a warband on
it; you see a road only while it touches your land or one of your hosts is on it. Roads
and city positions are always drawn — a fogged road goes dotted rather than solid, and a
fogged city goes grey along with the banner and every number behind it. The fog closes again the moment a host withdraws, and enemy warbands
in the dark are not drawn at all — and neither are battles fought there: no clash
markers, no capture flashes, no log entries for events beyond your reach. The AI plays
with full information.

Hosts that meet on the same road stop and fight where they stand, and anyone else
arriving on that road joins the melee. Sieges only start once the road is clear.
Breaking off a fight costs a quarter of the host, so committing means something.
Mustering warriors and rebuilding walls are paid for up front but take time, and a
freshly sacked city loses most of its populace and is too cowed to conscript for a
while. Cities under attack pulse red, and you are notified when one of yours is hit.
A realm reduced to its last two cities starts to crumble — walls shed, hosts melt —
and fortification upkeep decays as a war drags on, so no siege lasts forever.

**The Rainbow Kingdom itself** is a floating island, drawn from the map it carries:
the coastline traces the convex hull of that seed's own 20 cities across 300 samples,
leaning slightly outward and roughened at three scales, so every kingdom gets its own
ragged silhouette and none of them waste a band of empty grass. The sun is setting
behind it: grassland catches the light, woods cover about seventy percent of the ground
and run on under the roads and cities, mountains keep their distance, and bare rock
falls away underneath in a broad cone. The whole backdrop bakes once per map into an
offscreen canvas and costs one drawImage a frame.

The map is procedural and seeded — the seed lives in the URL hash, so `#12345`
replays the exact same kingdom.

## Layout

| file | role |
|---|---|
| `src/state.js` | shared state and the `T` table of every balance constant |
| `src/map.js` | seeded 20-node planar graph, city stats, realm draft |
| `src/sim.js` | one tick: income, movement, field battle, siege, capture, victory |
| `src/ai.js` | rule-based faction controller, one faction per tick |
| `src/terrain.js` | the floating island: coastline, peaks, woods, keel — baked once |
| `src/render.js` | canvas: backdrop, edges, cities, warbands, effects |
| `src/ui.js` | HUD, panels, log, title and end screens |
| `build.mjs` | esbuild → inline → minify → zip → size gate |

## Checks

    node sim-test.mjs    # 400 headless games: fairness, pacing, stalemate hunt
    node sim-test.mjs 5000     # ...on another seed range, to tell bias from noise
    node sim-test.mjs 1000 3   # ...with every realm on a given difficulty rung
    node road-test.mjs   # road-engagement mechanics, deterministic placements
    node cmd-test.mjs    # flee cost, pathing, splitting, muster, battle roster
    node diff-test.mjs   # is the difficulty ladder monotonic? one rung vs four Duelists
    node bias.mjs        # starting-position parity across the five realm slots
    node dom-test.mjs    # drives the real modules against a stub browser
    node dist-test.mjs   # boots the shipped, minified dist/index.html

`src/state.js` opens with `const P = 0.1` — the global pace. It scales every *rate*
(gold, growth, marching, attrition, siege, mending, and the AI's turn cadence) while
leaving quantities alone, so the whole game speeds up or slows down without any
balance ratio shifting. Set it to 1 for the original tempo.
