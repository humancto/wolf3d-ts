# Wolf3D-TS

A faithful TypeScript port of [Wolfenstein 3D](https://github.com/id-Software/wolf3d) by id Software, playable entirely in the browser.

**[Play Now](https://humancto.github.io/wolf3d-ts/)**

## About

Wolf3D-TS is a from-scratch TypeScript implementation of the classic 1992 first-person shooter. The raycasting engine, enemy AI state machines, door mechanics, pushwalls, and weapon systems are all ported from the original C source code. All textures and sprites are procedurally generated — no copyrighted assets are used.

### Features

- **Full raycasting engine** — DDA ray-wall intersection, textured walls with side shading, fish-eye correction
- **6 enemy types** — Guard, Officer, SS, Dog, Mutant, Boss — each with full state-machine AI (patrol, chase, attack, pain, death)
- **4 weapons** — Knife, Pistol, Machine Gun, Chain Gun with hitscan combat
- **Door & pushwall mechanics** — Sliding doors with locked variants (gold/silver keys), secret pushwalls
- **10 procedurally generated levels** — Deterministic layouts with rooms, corridors, doors, enemies, and pickups
- **Seedable RNG** — Reproducible runs via URL hash (`#seed=12345`, `#daily`)
- **Full HUD** — Floor number, score, lives, BJ face (health-reactive), health bar, ammo, keys, weapon slots
- **Title, death, level-complete, and victory screens**

### C → TypeScript Architecture

| Original C                              | TypeScript Port          |     Lines |
| --------------------------------------- | ------------------------ | --------: |
| `WL_DEF.H` — types, constants, flags    | `src/core/types.ts`      |       593 |
| `ID_US_A.ASM`, `TABLES.C` — math tables | `src/core/math.ts`       |       160 |
| `MAPDATA` + level loader                | `src/core/maps.ts`       |     1,002 |
| `WL_DRAW.C` — raycaster, sprites        | `src/engine/renderer.ts` |     2,021 |
| `WL_ACT1.C` — world state, doors        | `src/game/actors.ts`     |     1,351 |
| `WL_ACT2.C`, `WL_AGENT.C` — AI          | `src/game/ai.ts`         |     2,210 |
| `WL_PLAY.C`, `WL_STATE.C` — player      | `src/game/player.ts`     |     1,135 |
| HUD drawing routines                    | `src/ui/hud.ts`          |       817 |
| `WL_MAIN.C`, `WL_GAME.C` — game loop    | `src/main.ts`            |       388 |
| **Total**                               | **9 files**              | **9,677** |

## Controls

| Key                      | Action                       |
| ------------------------ | ---------------------------- |
| `W` / `↑`                | Move forward                 |
| `S` / `↓`                | Move backward                |
| `A` / `←`                | Turn left                    |
| `D` / `→`                | Turn right                   |
| `Q`                      | Strafe left                  |
| `E`                      | Strafe right                 |
| `Space` / `Ctrl` / Click | Fire weapon                  |
| `F`                      | Use (open doors, push walls) |
| `1`–`4`                  | Select weapon                |
| Mouse                    | Turn (with pointer lock)     |

## Seeded Runs

Append a hash to the URL to set the random seed:

```
https://humancto.github.io/wolf3d-ts/#seed=42
https://humancto.github.io/wolf3d-ts/#daily
https://humancto.github.io/wolf3d-ts/#daily=2026-02-13
```

- `#seed=N` — Use seed N for map generation and RNG
- `#daily` — Today's date as seed (daily challenge)
- `#daily=YYYY-MM-DD` — Specific date as seed

## Tech Stack

- **TypeScript** — Strict mode, ES2020 target
- **HTML5 Canvas** — 320x200 internal buffer with `Uint32Array` for fast pixel manipulation
- **Vite** — Dev server and production bundler
- **Vitest** — Unit testing
- **Zero runtime dependencies**

## Development

```bash
git clone https://github.com/humancto/wolf3d-ts.git
cd wolf3d-ts
npm install
npm run dev        # Start dev server on port 3001
npm run build      # Production build to dist/
npm run typecheck   # TypeScript type checking
npm test           # Run tests
```

## How the Raycasting Works

The renderer casts one ray per screen column (320 rays total) using Digital Differential Analysis (DDA):

1. Each ray steps through a 64x64 tile grid, checking for wall intersections
2. Wall distance determines the height of the vertical strip drawn for that column
3. Fish-eye correction uses `cos(ray_angle - player_angle)` for perpendicular distance
4. Vertical-hit walls are darkened 25% to create the classic Wolf3D depth illusion
5. Sprites are projected and clipped against the wall z-buffer
6. The 320x200 pixel buffer is scaled to fill the browser window

## Credits

- Original game: [Wolfenstein 3D](https://github.com/id-Software/wolf3d) by id Software (John Carmack, John Romero, et al.)
- This port: AI-assisted TypeScript reimplementation

## License

The original Wolfenstein 3D source code is [GPL-2.0](https://github.com/id-Software/wolf3d/blob/master/license-gpl.txt). This TypeScript port contains no original assets — all textures and sprites are procedurally generated.
