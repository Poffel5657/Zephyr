# Zephyr

A 3D browser RPG on floating islands. Skills grow by using them and unlock combat techniques. Combat is turn-based and happens right in the world.

🌬️ **Play online:** https://poffel5657.github.io/Zephyr/

> 🚧 Early development. Right now you can look around a small floating island. A playable prototype is the next goal.

---

## The Idea

- **World:** Floating islands in the sky. Magical winds are the world's life essence, and you travel on them with wind ships, wind shoes and a wind board.
- **Skills, not combat levels:** Like in *Old School RuneScape* and *The Elder Scrolls*, you improve by doing. Every world skill unlocks combat techniques: chop wood, learn to fight with an axe.
- **Turn-based combat in the world:** No battle screen. The world freezes and everyone takes turns on the same grid, similar to *Baldur's Gate*.
- **Party:** Each character can only specialize in two skills, so you need a team.
- **Style:** 3D low-poly on a grid with height levels.

---

## Current State

What works right now:

- Island built from a JSON map, with height levels, ground types, trees and rocks
- Sky, fog, sunlight and shadows
- Camera that rotates around the island and zooms
- Map editor to build islands from a top view

**Controls**

| Action | Mouse | Touch |
|---|---|---|
| Rotate camera | Right or middle mouse + drag | 1 finger |
| Zoom | Mouse wheel | 2 fingers |
| Walk to a tile | Left click | Tap |

The tile under the mouse is highlighted (red if you can't walk there). The player finds the shortest way around trees, rocks and water.

---

## Roadmap

| Phase | What | Status |
|---|---|---|
| 0 | Project setup: Vite, Three.js, GitHub Pages | ✅ |
| 1 | Game loop and event bus | ✅ |
| 2 | Grid and 3D island: map from JSON, light, camera | ✅ |
| 3 | Player and click-to-walk (raycasting + A*) | ✅ |
| 4 | Inventory | |
| 5 | Skill system + Woodcutting | |
| 6 | Stats, character level and skill points | |
| 7 | Save / load | |
| 8 | Turn-based combat | |
| 9 | Techniques: skill level unlocks combat abilities | |
| 10 | Enemies and loot | |
| 11 | *(Bonus)* Wind shoes and double jump | |
| 12 | Polish and testing | |

The goal is a prototype called **"A Small Piece of Zephyr"**: one island, one skill, one enemy.

---

## Run Locally

Requires [Node.js](https://nodejs.org/).

```bash
npm install     # first time only
npm run dev     # start the dev server
```

- Game: `http://localhost:5173`
- Map editor: `http://localhost:5173/editor.html`

---

## Project Structure

```
src/
├── main.js     entry point, connects all modules
├── core/       game loop, event bus, mouse input
├── world/      grid, island, objects, lighting, camera, pathfinding (A*)
├── player/     player and movement
├── ui/         tile marker
├── editor/     map editor (dev tool, not part of the game)
└── data/       maps and tile types as JSON
```

More folders (skills, inventory, combat) are ready for the coming phases.

Every system lives in its own module, and modules talk through the event bus instead of calling each other directly. Content like maps and tile types is stored as JSON in `data/`, not in the code.

---

## Tech

JavaScript · [Three.js](https://threejs.org/) · [Vite](https://vite.dev/) · GitHub Pages · models made in Blender (glTF)
