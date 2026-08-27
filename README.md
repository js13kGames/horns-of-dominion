# 🦄 Unicorn Overlord

A real-time-with-pause strategy game for the 13KB budget. Conquer 14 of the Rainbow
Kingdom's 20 cities as a unicorn overlord: raise warbands from your cities' populace,
march them across the node map, break enemy field armies, and grind down walls.

    npm install
    npm run dev      # http://localhost:8080, rebuilds on save
    npm run build    # writes dist/index.html + dist/game.zip, fails over 13312 B

Controls: click a city to inspect or muster · click your warband, then a glowing
neighbour, to march · `space` pause · `1` `2` `3` speed · `esc` deselect.

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
    node dom-test.mjs    # drives the real modules against a stub browser
    node dist-test.mjs   # boots the shipped, minified dist/index.html
