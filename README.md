# 🦄 Unicorn Overlord

A real-time-with-pause strategy game for the 13KB budget. Conquer 14 of the Rainbow
Kingdom's 20 cities as a unicorn overlord: raise warbands from your cities' populace,
march them across the node map, break enemy field armies, and grind down walls.

    npm install
    npm run dev      # http://localhost:8080, rebuilds on save
    npm run build    # writes dist/index.html + dist/game.zip, fails over 13312 B

Controls: click a city to inspect, muster or mend · click your warband, then **any**
city, to march there — it paths across the map and re-routes if you change your mind ·
click the node *behind* a marching warband to turn it back · split a resting warband
with the slider · `space` pause · `1` `2` `3` `4` speed (1× 2× 4× 8×) · `esc` deselect.

Hosts that meet on the same road stop and fight where they stand, and anyone else
arriving on that road joins the melee. Sieges only start once the road is clear.
Breaking off a fight costs a quarter of the host, so committing means something.
Mustering warriors and rebuilding walls are paid for up front but take time.

The map is procedural and seeded — the seed lives in the URL hash, so `#12345`
replays the exact same kingdom.

## Layout

| file | role |
|---|---|
| `src/state.js` | shared state and the `T` table of every balance constant |
| `src/map.js` | seeded 20-node planar graph, city stats, realm draft |
| `src/sim.js` | one tick: income, movement, field battle, siege, capture, victory |
| `src/ai.js` | rule-based faction controller, one faction per tick |
| `src/render.js` | canvas: edges, cities, warbands, effects |
| `src/ui.js` | HUD, panels, log, title and end screens |
| `build.mjs` | esbuild → inline → minify → zip → size gate |

## Checks

    node sim-test.mjs    # 400 headless games: fairness, pacing, stalemate hunt
    node sim-test.mjs 5000   # ...on a different seed range, to tell bias from noise
    node road-test.mjs   # road-engagement mechanics, deterministic placements
    node cmd-test.mjs    # flee cost, pathing, splitting, muster, battle roster
    node bias.mjs        # starting-position parity across the five realm slots
    node dom-test.mjs    # drives the real modules against a stub browser
    node dist-test.mjs   # boots the shipped, minified dist/index.html

`src/state.js` opens with `const P = 0.1` — the global pace. It scales every *rate*
(gold, growth, marching, attrition, siege, mending, and the AI's turn cadence) while
leaving quantities alone, so the whole game speeds up or slows down without any
balance ratio shifting. Set it to 1 for the original tempo.
