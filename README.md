# Ember Isle

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/skynurul/gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/skynurul/gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Ember Isle** is a 3D open-world crime game set on an invented volcanic island. Juno Reyes, a street racer, comes home to take the island: win the Coastal Ring Sprint and the Volcano Climb Circuit, take the docks of Port Ash from a rival crew, and run the summit job on Mount Cinder itself. Recruit a crew — Mara the driver, Dario the gunner, Ilya the lookout — earn standing in five districts (Port Ash, Caldera Vieja, Palma Sands, Mount Cinder, Slagworks), and stay one step ahead of the Isle PD as your wanted level rises from zero to five stars.

The island is fully 3D (Three.js, vendored, no network): a smoking volcano with lava flows and black-sand beaches, five districts joined by roads, traffic and pedestrians, drifting arcade car physics, street races with rival drivers, staged story missions with waypoints, district standing that changes police response and race access, and a synthesized WebAudio soundtrack. Includes a HUD with cash, health, wanted stars, a live minimap, district standing bars, a crew panel, and save support so you can pick up where you left off.

## Run it

```sh
python3 -m http.server --directory game
```

Then open http://localhost:8000 in desktop Chrome (or serve the `game/` directory with any static server, e.g. `npx serve game`). No build step, no network needed — the game runs fully offline.

---

<sub>Entered on [make.fun](https://make.fun/?ref=c5vhyhc2&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
