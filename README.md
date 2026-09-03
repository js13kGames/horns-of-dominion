# 🦄 Horns of Dominion

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

**Three kinds of warband.** Every city raises footmen — the dependable middle, and
what the game was built on. Ten cities raise something else as well: each realm's capital and
its next biggest city breed that realm's own beast, and because it belongs to the place rather
than the owner, taking an enemy capital is how you come by their dragons. Unicorns cost nearly twice a footman and are
worth it: almost twice as fast, and murderous in the open. Dragons cost twice a footman, crawl at
half the pace, and chew through walls. Every
warband musters the same forty bodies whatever it is, so the number under a host is always a
headcount and the glyph tells you what they are. A warband is all one kind and kinds will not
pool, so a mixed force is several warbands standing together rather than one stack.


**Where you fight decides who wins.** On a road, a host fights at the pace it marches: whoever
is faster has caught the other strung out in the open, and the gap between their speeds is the
bonus. Behind walls it counts for nothing — nobody outruns masonry. So the order reverses
depending on the ground. In the open, unicorns break footmen and footmen break dragons, and unicorns
maul dragons worst of all, the slowest thing on the map. At a city it is exactly the other way
round: dragons breach in a third of the time footmen need, and unicorns are no siege engine at all.
Catching a dragon column between cities is the single best thing a unicorn does.

One rule underpins all of it: **numbers are health here.** Damage comes off bodies, while a
kind's strength only multiplies what it deals — so fifty dragons lose to a hundred footmen for
the same gold. Weight of numbers is real.

**Civil unrest.** Every city remembers the realm it was drafted into as *native*, however
often it changes hands, and carries one number — how badly its people want that realm
back. It starts at nothing and stays there while the native realm holds the place. The
moment anyone else takes the city it jumps to 70%, and from there it climbs on a slow
clock, ten ticks between checks. Whoever holds it puts that down only in proportion to
the crowd being sat on: holding a city takes about a quarter of a warrior per head of
populace, so a big rich city is harder to keep than a small one, and a single warrior
split off a host pacifies nobody. A city 40% restless will not conscript for whoever
holds it and flies ✊ on the map; past 90% it may simply throw its occupier out on any
check and go home — no mob, no siege, walls untouched. A realm ground down to a
crumbling rump rallies nobody: its lost cities stop stirring and settle under their new
owner, which is what lets a conquest finish.

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
and run on under the roads and cities, mountains stand out of the trees with a tree line
crowding their feet, cloud drifts past behind the land, and bare rock falls away
underneath in a broad cone. The whole backdrop bakes once per map into an
offscreen canvas and costs one drawImage a frame.

The map is procedural and seeded — the seed lives in the URL hash, so `#12345`
replays the exact same kingdom.

## Layout

| file | role |
|---|---|
| `src/state.js` | shared state and the `T` table of every balance constant |
| `src/map.js` | seeded 20-node planar graph, city stats, realm draft |
| `src/sim.js` | one tick: income, movement, battle, siege, capture, unrest, victory |
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
    node cmd-test.mjs    # flee cost, pathing, splitting, muster, roster, unrest, unit kinds
    node diff-test.mjs   # is the difficulty ladder monotonic? one rung vs four Duelists
    node bias.mjs        # starting-position parity across the five realm slots
    node dom-test.mjs    # drives the real modules against a stub browser
    node dist-test.mjs   # boots the shipped, minified dist/index.html

`src/state.js` opens with `const P = 0.1` — the global pace. It scales every *rate*
(gold, growth, marching, attrition, siege, mending, and the AI's turn cadence) while
leaving quantities alone, so the whole game speeds up or slows down without any
balance ratio shifting. Set it to 1 for the original tempo.
