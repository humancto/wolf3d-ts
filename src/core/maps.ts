/**
 * Wolfenstein 3D TypeScript Port - Procedural Map Generator
 *
 * Generates 10 deterministic levels using a seedable RNG.
 * Maps are 64x64 tiles and feature rooms, corridors, doors,
 * enemies, pickups, keys, secrets, and an exit elevator.
 */

import {
  MAPSIZE,
  AREATILE,
  PUSHABLETILE,
  EXITTILE,
  ELEVATORTILE,
  MapData,
  createMapData,
  setSeed,
  rnd,
  tileIndex,
} from "./types";

// ============================================================
// Internal helpers and room descriptor
// ============================================================

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Room {
  rect: Rect;
  areaNumber: number;
  connected: boolean;
}

/** Difficulty ramp per level: controls enemy counts, pickups, etc. */
interface LevelParams {
  name: string;
  minRooms: number;
  maxRooms: number;
  minRoomSize: number;
  maxRoomSize: number;
  enemyDensity: number; // approximate enemies per room
  pickupDensity: number; // approximate pickups per room
  corridorWidth: number;
  hasGoldKeyDoor: boolean;
  hasSilverKeyDoor: boolean;
  secretRooms: number;
}

const LEVEL_PARAMS: LevelParams[] = [
  {
    name: "Escape!",
    minRooms: 5,
    maxRooms: 7,
    minRoomSize: 5,
    maxRoomSize: 10,
    enemyDensity: 1.0,
    pickupDensity: 1.2,
    corridorWidth: 2,
    hasGoldKeyDoor: false,
    hasSilverKeyDoor: false,
    secretRooms: 0,
  },
  {
    name: "The Dungeons",
    minRooms: 6,
    maxRooms: 9,
    minRoomSize: 4,
    maxRoomSize: 10,
    enemyDensity: 1.5,
    pickupDensity: 1.0,
    corridorWidth: 2,
    hasGoldKeyDoor: true,
    hasSilverKeyDoor: false,
    secretRooms: 1,
  },
  {
    name: "Castle Hollehammer",
    minRooms: 7,
    maxRooms: 10,
    minRoomSize: 4,
    maxRoomSize: 11,
    enemyDensity: 2.0,
    pickupDensity: 1.0,
    corridorWidth: 2,
    hasGoldKeyDoor: true,
    hasSilverKeyDoor: false,
    secretRooms: 1,
  },
  {
    name: "Tomb of the Dead",
    minRooms: 7,
    maxRooms: 11,
    minRoomSize: 4,
    maxRoomSize: 12,
    enemyDensity: 2.5,
    pickupDensity: 1.0,
    corridorWidth: 2,
    hasGoldKeyDoor: true,
    hasSilverKeyDoor: true,
    secretRooms: 1,
  },
  {
    name: "Tunnels",
    minRooms: 8,
    maxRooms: 12,
    minRoomSize: 4,
    maxRoomSize: 10,
    enemyDensity: 3.0,
    pickupDensity: 1.2,
    corridorWidth: 2,
    hasGoldKeyDoor: true,
    hasSilverKeyDoor: true,
    secretRooms: 1,
  },
  {
    name: "Command Center",
    minRooms: 8,
    maxRooms: 13,
    minRoomSize: 4,
    maxRoomSize: 12,
    enemyDensity: 3.0,
    pickupDensity: 1.0,
    corridorWidth: 2,
    hasGoldKeyDoor: true,
    hasSilverKeyDoor: true,
    secretRooms: 2,
  },
  {
    name: "The Arsenal",
    minRooms: 9,
    maxRooms: 14,
    minRoomSize: 4,
    maxRoomSize: 12,
    enemyDensity: 3.5,
    pickupDensity: 1.5,
    corridorWidth: 2,
    hasGoldKeyDoor: true,
    hasSilverKeyDoor: true,
    secretRooms: 2,
  },
  {
    name: "Barracks",
    minRooms: 9,
    maxRooms: 14,
    minRoomSize: 4,
    maxRoomSize: 12,
    enemyDensity: 4.0,
    pickupDensity: 1.0,
    corridorWidth: 2,
    hasGoldKeyDoor: true,
    hasSilverKeyDoor: true,
    secretRooms: 2,
  },
  {
    name: "The Gauntlet",
    minRooms: 10,
    maxRooms: 15,
    minRoomSize: 4,
    maxRoomSize: 12,
    enemyDensity: 4.5,
    pickupDensity: 1.0,
    corridorWidth: 2,
    hasGoldKeyDoor: true,
    hasSilverKeyDoor: true,
    secretRooms: 2,
  },
  {
    name: "Castle Wolfenstein",
    minRooms: 10,
    maxRooms: 16,
    minRoomSize: 4,
    maxRoomSize: 12,
    enemyDensity: 5.0,
    pickupDensity: 1.2,
    corridorWidth: 2,
    hasGoldKeyDoor: true,
    hasSilverKeyDoor: true,
    secretRooms: 3,
  },
];

// Wall plane special values
const WALL_EMPTY = 0;
const DOOR_HORIZ = 90;
const DOOR_VERT = 91;
const DOOR_GOLD_LOCK = 92;
const DOOR_SILVER_LOCK = 93;

// ============================================================
// Map tile read/write helpers (operate on MapData arrays)
// ============================================================

function wallAt(map: MapData, x: number, y: number): number {
  if (x < 0 || x >= MAPSIZE || y < 0 || y >= MAPSIZE) return 1;
  return map.walls[tileIndex(x, y)];
}

function setWall(map: MapData, x: number, y: number, val: number): void {
  if (x < 0 || x >= MAPSIZE || y < 0 || y >= MAPSIZE) return;
  map.walls[tileIndex(x, y)] = val;
}

function objAt(map: MapData, x: number, y: number): number {
  if (x < 0 || x >= MAPSIZE || y < 0 || y >= MAPSIZE) return 0;
  return map.objects[tileIndex(x, y)];
}

function setObj(map: MapData, x: number, y: number, val: number): void {
  if (x < 0 || x >= MAPSIZE || y < 0 || y >= MAPSIZE) return;
  map.objects[tileIndex(x, y)] = val;
}

function setArea(map: MapData, x: number, y: number, areaNum: number): void {
  if (x < 0 || x >= MAPSIZE || y < 0 || y >= MAPSIZE) return;
  map.areas[tileIndex(x, y)] = AREATILE + areaNum;
}

function isTileFree(map: MapData, x: number, y: number): boolean {
  return wallAt(map, x, y) === WALL_EMPTY && objAt(map, x, y) === 0;
}

// ============================================================
// Room generation
// ============================================================

function rectsOverlap(a: Rect, b: Rect, pad: number): boolean {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

function carveRoom(map: MapData, room: Room): void {
  const { x, y, w, h } = room.rect;
  for (let ry = y; ry < y + h; ry++) {
    for (let rx = x; rx < x + w; rx++) {
      setWall(map, rx, ry, WALL_EMPTY);
      setArea(map, rx, ry, room.areaNumber);
    }
  }
}

function generateRooms(map: MapData, params: LevelParams): Room[] {
  const rooms: Room[] = [];
  const targetCount =
    params.minRooms + rnd(params.maxRooms - params.minRooms + 1);
  let attempts = 0;
  let areaCounter = 1;

  while (rooms.length < targetCount && attempts < 500) {
    attempts++;
    const w =
      params.minRoomSize + rnd(params.maxRoomSize - params.minRoomSize + 1);
    const h =
      params.minRoomSize + rnd(params.maxRoomSize - params.minRoomSize + 1);
    // Keep rooms away from map border (leave 1-tile border of solid walls)
    const x = 2 + rnd(MAPSIZE - w - 4);
    const y = 2 + rnd(MAPSIZE - h - 4);

    const rect: Rect = { x, y, w, h };

    // Check for overlap with existing rooms (require 2-tile gap for walls + corridor space)
    let overlaps = false;
    for (const existing of rooms) {
      if (rectsOverlap(rect, existing.rect, 2)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    const room: Room = { rect, areaNumber: areaCounter++, connected: false };
    rooms.push(room);
    carveRoom(map, room);
  }

  return rooms;
}

// ============================================================
// Corridor carving & door placement
// ============================================================

function carveCorridor(
  map: MapData,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  areaNum: number,
): void {
  // Carve an L-shaped corridor: first horizontal, then vertical
  const xDir = x1 > x0 ? 1 : -1;
  const yDir = y1 > y0 ? 1 : -1;

  // Horizontal segment
  let cx = x0;
  while (cx !== x1) {
    for (let d = 0; d < width; d++) {
      const ty = y0 + d - Math.floor(width / 2);
      if (ty > 0 && ty < MAPSIZE - 1 && cx > 0 && cx < MAPSIZE - 1) {
        setWall(map, cx, ty, WALL_EMPTY);
        setArea(map, cx, ty, areaNum);
      }
    }
    cx += xDir;
  }

  // Vertical segment
  let cy = y0;
  while (cy !== y1) {
    for (let d = 0; d < width; d++) {
      const tx = x1 + d - Math.floor(width / 2);
      if (tx > 0 && tx < MAPSIZE - 1 && cy > 0 && cy < MAPSIZE - 1) {
        setWall(map, tx, cy, WALL_EMPTY);
        setArea(map, tx, cy, areaNum);
      }
    }
    cy += yDir;
  }
}

function roomCenter(room: Room): { cx: number; cy: number } {
  return {
    cx: Math.floor(room.rect.x + room.rect.w / 2),
    cy: Math.floor(room.rect.y + room.rect.h / 2),
  };
}

function connectRooms(map: MapData, rooms: Room[], params: LevelParams): void {
  if (rooms.length < 2) return;

  // Connect each room to the next in order (linear path guarantees reachability)
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = roomCenter(rooms[i]);
    const b = roomCenter(rooms[i + 1]);
    // Use the area number of the corridor's destination room
    carveCorridor(
      map,
      a.cx,
      a.cy,
      b.cx,
      b.cy,
      params.corridorWidth,
      rooms[i + 1].areaNumber,
    );
    rooms[i].connected = true;
    rooms[i + 1].connected = true;
  }

  // Add a few extra random connections for loops (makes maps more interesting)
  const extraConnections = 1 + rnd(Math.max(1, Math.floor(rooms.length / 4)));
  for (let i = 0; i < extraConnections; i++) {
    const ai = rnd(rooms.length);
    const bi = rnd(rooms.length);
    if (ai === bi) continue;
    const a = roomCenter(rooms[ai]);
    const b = roomCenter(rooms[bi]);
    carveCorridor(
      map,
      a.cx,
      a.cy,
      b.cx,
      b.cy,
      params.corridorWidth,
      rooms[bi].areaNumber,
    );
  }
}

function placeDoors(map: MapData, rooms: Room[]): void {
  // Walk every floor tile and check if it sits at a room/corridor boundary.
  // A door candidate is a floor tile flanked by walls on two opposite sides
  // and open on the other two sides (a doorway shape).
  const candidates: { x: number; y: number; vertical: boolean }[] = [];

  for (let y = 2; y < MAPSIZE - 2; y++) {
    for (let x = 2; x < MAPSIZE - 2; x++) {
      if (wallAt(map, x, y) !== WALL_EMPTY) continue;

      const n = wallAt(map, x, y - 1);
      const s = wallAt(map, x, y + 1);
      const e = wallAt(map, x + 1, y);
      const w = wallAt(map, x - 1, y);

      // Horizontal door: walls to north & south, open east & west
      if (
        n > 0 &&
        n < 90 &&
        s > 0 &&
        s < 90 &&
        e === WALL_EMPTY &&
        w === WALL_EMPTY
      ) {
        candidates.push({ x, y, vertical: false });
      }
      // Vertical door: walls to east & west, open north & south
      else if (
        e > 0 &&
        e < 90 &&
        w > 0 &&
        w < 90 &&
        n === WALL_EMPTY &&
        s === WALL_EMPTY
      ) {
        candidates.push({ x, y, vertical: true });
      }
    }
  }

  // Place doors at a subset of candidates (not too many)
  const maxDoors = Math.min(candidates.length, 20 + rnd(10));
  // Shuffle candidates
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  let placed = 0;
  for (const c of candidates) {
    if (placed >= maxDoors) break;
    // Don't place doors adjacent to each other
    const adj = [
      wallAt(map, c.x - 1, c.y),
      wallAt(map, c.x + 1, c.y),
      wallAt(map, c.x, c.y - 1),
      wallAt(map, c.x, c.y + 1),
    ];
    if (adj.some((v) => v >= DOOR_HORIZ && v <= DOOR_SILVER_LOCK)) continue;

    setWall(map, c.x, c.y, c.vertical ? DOOR_VERT : DOOR_HORIZ);
    placed++;
  }
}

// ============================================================
// Locked doors & keys
// ============================================================

function placeLockedDoors(
  map: MapData,
  rooms: Room[],
  params: LevelParams,
): void {
  if (rooms.length < 4) return;

  // Place gold key + gold locked door
  if (params.hasGoldKeyDoor && rooms.length >= 4) {
    const keyRoom = rooms[Math.floor(rooms.length / 3)];
    placeKeyInRoom(map, keyRoom, 56); // 56 = gold key object

    // Find a door between the key room and the exit half of the map
    // and upgrade it to a gold lock door
    upgradeDoorToLocked(
      map,
      rooms,
      Math.floor(rooms.length / 2),
      DOOR_GOLD_LOCK,
    );
  }

  // Place silver key + silver locked door
  if (params.hasSilverKeyDoor && rooms.length >= 5) {
    const keyRoom = rooms[Math.floor((rooms.length * 2) / 3)];
    placeKeyInRoom(map, keyRoom, 57); // 57 = silver key object

    upgradeDoorToLocked(
      map,
      rooms,
      Math.floor((rooms.length * 3) / 4),
      DOOR_SILVER_LOCK,
    );
  }
}

function placeKeyInRoom(map: MapData, room: Room, keyObj: number): void {
  const { x, y, w, h } = room.rect;
  for (let attempt = 0; attempt < 50; attempt++) {
    const kx = x + 1 + rnd(Math.max(1, w - 2));
    const ky = y + 1 + rnd(Math.max(1, h - 2));
    if (isTileFree(map, kx, ky)) {
      setObj(map, kx, ky, keyObj);
      return;
    }
  }
}

function upgradeDoorToLocked(
  map: MapData,
  rooms: Room[],
  nearRoomIdx: number,
  lockType: number,
): void {
  // Find the nearest existing door to the target room and upgrade it
  const target = roomCenter(rooms[Math.min(nearRoomIdx, rooms.length - 1)]);
  let bestDist = Infinity;
  let bestX = -1;
  let bestY = -1;

  for (let y = 2; y < MAPSIZE - 2; y++) {
    for (let x = 2; x < MAPSIZE - 2; x++) {
      const v = wallAt(map, x, y);
      if (v === DOOR_HORIZ || v === DOOR_VERT) {
        const dist = Math.abs(x - target.cx) + Math.abs(y - target.cy);
        if (dist < bestDist) {
          bestDist = dist;
          bestX = x;
          bestY = y;
        }
      }
    }
  }

  if (bestX >= 0) {
    setWall(map, bestX, bestY, lockType);
  }
}

// ============================================================
// Secret rooms (pushwalls)
// ============================================================

function placeSecretRooms(map: MapData, rooms: Room[], count: number): void {
  for (let s = 0; s < count; s++) {
    // Pick a random room and try to carve a secret room adjacent to it
    const roomIdx = 1 + rnd(Math.max(1, rooms.length - 2));
    const room = rooms[roomIdx];
    const { x, y, w, h } = room.rect;

    // Try each wall side
    const sides = [
      { dx: -2, dy: 0, wx: x - 1, wy: y + Math.floor(h / 2) }, // west wall
      { dx: w + 1, dy: 0, wx: x + w, wy: y + Math.floor(h / 2) }, // east wall
      { dx: 0, dy: -2, wx: x + Math.floor(w / 2), wy: y - 1 }, // north wall
      { dx: 0, dy: h + 1, wx: x + Math.floor(w / 2), wy: y + h }, // south wall
    ];

    for (const side of sides) {
      const sx = room.rect.x + side.dx;
      const sy = room.rect.y + side.dy;

      // Check if we can carve a 3x3 secret room here
      if (sx < 2 || sx + 3 >= MAPSIZE - 1 || sy < 2 || sy + 3 >= MAPSIZE - 1)
        continue;

      let canCarve = true;
      for (let ry = sy; ry < sy + 3; ry++) {
        for (let rx = sx; rx < sx + 3; rx++) {
          if (wallAt(map, rx, ry) === WALL_EMPTY) {
            canCarve = false;
            break;
          }
        }
        if (!canCarve) break;
      }

      if (canCarve) {
        // Carve the secret room
        const secretArea = room.areaNumber; // share area for simplicity
        for (let ry = sy; ry < sy + 3; ry++) {
          for (let rx = sx; rx < sx + 3; rx++) {
            setWall(map, rx, ry, WALL_EMPTY);
            setArea(map, rx, ry, secretArea);
          }
        }

        // Place a pushwall at the entrance
        if (
          side.wx > 0 &&
          side.wx < MAPSIZE - 1 &&
          side.wy > 0 &&
          side.wy < MAPSIZE - 1
        ) {
          setWall(map, side.wx, side.wy, PUSHABLETILE);
        }

        // Place treasure in the secret room
        const treasure = 58 + rnd(4); // cross, chalice, chest, crown
        setObj(map, sx + 1, sy + 1, treasure);
        break; // one secret per attempt
      }
    }
  }
}

// ============================================================
// Exit elevator
// ============================================================

function placeExit(map: MapData, rooms: Room[]): void {
  // Place the exit in the last room
  const lastRoom = rooms[rooms.length - 1];
  const { x, y, w, h } = lastRoom.rect;

  // Find a wall tile adjacent to the room interior for the elevator
  // Try the far corner of the last room
  const ex = x + w - 2;
  const ey = y + h - 2;

  // Carve a small 2x2 elevator alcove
  if (ex + 2 < MAPSIZE - 1 && ey >= 1) {
    // Place elevator tiles and exit trigger
    setWall(map, ex, ey, ELEVATORTILE);
    setWall(map, ex + 1, ey, ELEVATORTILE);

    // The exit trigger tile is what the player walks onto
    setWall(map, ex, ey - 1, WALL_EMPTY);
    setArea(map, ex, ey - 1, lastRoom.areaNumber);

    // Place the EXITTILE on the wall behind the elevator switch
    setWall(map, ex + 1, ey - 1, EXITTILE);
  }
}

// ============================================================
// Player start
// ============================================================

function placePlayerStart(map: MapData, rooms: Room[]): void {
  const firstRoom = rooms[0];
  const cx = Math.floor(firstRoom.rect.x + firstRoom.rect.w / 2);
  const cy = Math.floor(firstRoom.rect.y + firstRoom.rect.h / 2);

  // Player start facing north = 19, east = 20, south = 21, west = 22
  // Start facing east
  setObj(map, cx, cy, 20);
}

// ============================================================
// Enemy placement
// ============================================================

/**
 * Enemy object codes:
 *  23-26: Guard standing N/E/S/W
 *  27-30: Guard patrolling N/E/S/W
 *  31-34: Officer standing N/E/S/W
 *  35-38: SS standing N/E/S/W
 *  39-42: Dog N/E/S/W
 *  43-46: Mutant N/E/S/W
 */
function placeEnemies(
  map: MapData,
  rooms: Room[],
  params: LevelParams,
  level: number,
): void {
  // Skip the first room (player start) and the last room (exit)
  for (let i = 1; i < rooms.length - 1; i++) {
    const room = rooms[i];
    const { x, y, w, h } = room.rect;
    const count = Math.max(1, Math.round(params.enemyDensity + rnd(2) - 1));

    for (let e = 0; e < count; e++) {
      // Pick a random free tile in the room
      let placed = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const ex = x + 1 + rnd(Math.max(1, w - 2));
        const ey = y + 1 + rnd(Math.max(1, h - 2));
        if (!isTileFree(map, ex, ey)) continue;

        // Pick enemy type based on level progression
        const dir = rnd(4); // N/E/S/W
        let enemyBase: number;

        const roll = rnd(100);
        if (level < 2) {
          // Early levels: mostly guards
          if (roll < 70) {
            enemyBase = rnd(2) === 0 ? 23 : 27; // standing or patrolling guard
          } else if (roll < 90) {
            enemyBase = 39; // dog
          } else {
            enemyBase = 31; // officer
          }
        } else if (level < 5) {
          // Mid levels: mix of guards, officers, SS
          if (roll < 40) {
            enemyBase = rnd(2) === 0 ? 23 : 27;
          } else if (roll < 60) {
            enemyBase = 31; // officer
          } else if (roll < 80) {
            enemyBase = 35; // SS
          } else if (roll < 90) {
            enemyBase = 39; // dog
          } else {
            enemyBase = 43; // mutant
          }
        } else {
          // Late levels: more SS, mutants, officers
          if (roll < 20) {
            enemyBase = rnd(2) === 0 ? 23 : 27;
          } else if (roll < 40) {
            enemyBase = 31;
          } else if (roll < 60) {
            enemyBase = 35;
          } else if (roll < 75) {
            enemyBase = 43;
          } else if (roll < 90) {
            enemyBase = 39;
          } else {
            // Patrolling officer or SS for variety
            enemyBase = rnd(2) === 0 ? 31 : 35;
          }
        }

        setObj(map, ex, ey, enemyBase + dir);
        placed = true;
        break;
      }
    }
  }
}

// ============================================================
// Pickup / decoration placement
// ============================================================

/**
 * Object plane pickup codes:
 *  47: Dead guard (decoration)
 *  48: Chandelier (decoration)
 *  49: Dog food (small health)
 *  50: Table with food (health)
 *  51: Floor lamp (decoration)
 *  52: Skeleton (decoration)
 *  53: Plant (decoration)
 *  54: Bones (decoration)
 *  55: Empty bowl (decoration)
 *  56: Gold key
 *  57: Silver key
 *  58: Cross (treasure, 100pts)
 *  59: Chalice (treasure, 500pts)
 *  60: Chest (treasure, 1000pts)
 *  61: Crown (treasure, 5000pts)
 *  62: Extra life
 *  63: First aid (25hp)
 *  64: Clip (8 ammo)
 *  65: Machine gun pickup
 *  66: Chain gun pickup
 *  67-70: Barrels, wells, etc. (decoration)
 */
function placePickups(
  map: MapData,
  rooms: Room[],
  params: LevelParams,
  level: number,
): void {
  // Decorations - scatter in all rooms
  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    const { x, y, w, h } = room.rect;
    const decoCount = 1 + rnd(3);

    for (let d = 0; d < decoCount; d++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const dx = x + 1 + rnd(Math.max(1, w - 2));
        const dy = y + 1 + rnd(Math.max(1, h - 2));
        if (!isTileFree(map, dx, dy)) continue;

        // Pick a decoration
        const decoTypes = [47, 48, 51, 52, 53, 54, 55, 67, 68];
        setObj(map, dx, dy, decoTypes[rnd(decoTypes.length)]);
        break;
      }
    }
  }

  // Gameplay pickups - skip first room (player start) and last (exit)
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    const { x, y, w, h } = room.rect;
    const pickCount = Math.max(
      1,
      Math.round(params.pickupDensity + rnd(2) - 1),
    );

    for (let p = 0; p < pickCount; p++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const px = x + 1 + rnd(Math.max(1, w - 2));
        const py = y + 1 + rnd(Math.max(1, h - 2));
        if (!isTileFree(map, px, py)) continue;

        // Pick a gameplay item
        const roll = rnd(100);
        let item: number;
        if (roll < 20) {
          item = 49; // dog food (small health)
        } else if (roll < 35) {
          item = 64; // ammo clip
        } else if (roll < 45) {
          item = 63; // first aid
        } else if (roll < 55) {
          item = 58; // cross (treasure)
        } else if (roll < 65) {
          item = 59; // chalice (treasure)
        } else if (roll < 72) {
          item = 60; // chest (treasure)
        } else if (roll < 78) {
          item = 50; // table with food
        } else if (roll < 83) {
          item = 61; // crown (treasure)
        } else if (roll < 88) {
          item = 64; // ammo clip (extra)
        } else if (roll < 93 && level >= 3) {
          item = 65; // machine gun
        } else if (roll < 97 && level >= 6) {
          item = 66; // chain gun
        } else if (roll < 99) {
          item = 62; // extra life (rare)
        } else {
          item = 63; // first aid
        }

        setObj(map, px, py, item);
        break;
      }
    }
  }
}

// ============================================================
// Wall texture variation
// ============================================================

function applyWallTextures(map: MapData, level: number): void {
  // Different levels use different texture palettes
  // Texture IDs 1-8 represent different wall appearances
  const palettes: number[][] = [
    [1, 2], // Level 0: gray stone, blue stone
    [1, 2, 3], // Level 1: + wood
    [2, 3, 4], // Level 2: blue, wood, gray brick
    [1, 3, 4, 5], // Level 3: stone, wood, brick, blue brick
    [3, 4, 5], // Level 4: wood, brick variations
    [1, 4, 5, 6], // Level 5: stone, brick, mossy
    [2, 5, 6, 7], // Level 6: blue, brick, mossy, red
    [1, 3, 6, 7], // Level 7: stone, wood, mossy, red
    [4, 5, 7, 8], // Level 8: brick, mossy, red, metal
    [1, 2, 3, 4, 5, 6, 7, 8], // Level 9: all textures
  ];

  const pal = palettes[Math.min(level, palettes.length - 1)];

  for (let y = 0; y < MAPSIZE; y++) {
    for (let x = 0; x < MAPSIZE; x++) {
      const idx = tileIndex(x, y);
      const v = map.walls[idx];
      // Only modify solid wall tiles (value 1, the default fill)
      if (v === 1) {
        // Use position-based deterministic texture selection with some variation
        const hash = (x * 7919 + y * 6271 + level * 1013) & 0xffff;
        map.walls[idx] = pal[hash % pal.length];
      }
    }
  }
}

// ============================================================
// Ensure map border is solid
// ============================================================

function sealBorder(map: MapData): void {
  for (let i = 0; i < MAPSIZE; i++) {
    // Top and bottom borders
    if (wallAt(map, i, 0) === WALL_EMPTY) setWall(map, i, 0, 1);
    if (wallAt(map, i, MAPSIZE - 1) === WALL_EMPTY)
      setWall(map, i, MAPSIZE - 1, 1);
    // Left and right borders
    if (wallAt(map, 0, i) === WALL_EMPTY) setWall(map, 0, i, 1);
    if (wallAt(map, MAPSIZE - 1, i) === WALL_EMPTY)
      setWall(map, MAPSIZE - 1, i, 1);
  }
}

// ============================================================
// Flood-fill area numbers for correctness
// ============================================================

function floodFillAreas(map: MapData, rooms: Room[]): void {
  // Already set during carving, but fill any corridor tiles that
  // might have been missed (area 0). Assign them to nearest room area.
  for (let y = 1; y < MAPSIZE - 1; y++) {
    for (let x = 1; x < MAPSIZE - 1; x++) {
      const idx = tileIndex(x, y);
      if (map.walls[idx] === WALL_EMPTY && map.areas[idx] === 0) {
        // Find nearest room
        let bestDist = Infinity;
        let bestArea = 1;
        for (const room of rooms) {
          const rc = roomCenter(room);
          const dist = Math.abs(x - rc.cx) + Math.abs(y - rc.cy);
          if (dist < bestDist) {
            bestDist = dist;
            bestArea = room.areaNumber;
          }
        }
        map.areas[idx] = AREATILE + bestArea;
      }
    }
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Generate a complete 64x64 map for the given level (0-9).
 * Uses the provided seed for deterministic output.
 */
export function generateMap(level: number, seed: number): MapData {
  // Clamp level
  const lvl = Math.max(0, Math.min(level, LEVEL_PARAMS.length - 1));
  const params = LEVEL_PARAMS[lvl];

  // Initialize RNG
  setSeed(seed + level * 65537);

  // Create empty map (all zeros)
  const map = createMapData();
  map.name = params.name;

  // Step 1: Fill entire map with solid walls (texture 1)
  for (let i = 0; i < MAPSIZE * MAPSIZE; i++) {
    map.walls[i] = 1;
  }

  // Step 2: Generate rooms
  const rooms = generateRooms(map, params);
  if (rooms.length < 2) {
    // Fallback: force at least 2 rooms
    const fallbackRoom: Room = {
      rect: { x: 10, y: 10, w: 8, h: 8 },
      areaNumber: rooms.length + 1,
      connected: false,
    };
    rooms.push(fallbackRoom);
    carveRoom(map, fallbackRoom);

    if (rooms.length < 2) {
      const fallbackRoom2: Room = {
        rect: { x: 30, y: 30, w: 8, h: 8 },
        areaNumber: rooms.length + 1,
        connected: false,
      };
      rooms.push(fallbackRoom2);
      carveRoom(map, fallbackRoom2);
    }
  }

  // Step 3: Connect rooms with corridors
  connectRooms(map, rooms, params);

  // Step 4: Place doors at doorways
  placeDoors(map, rooms);

  // Step 5: Locked doors and keys
  placeLockedDoors(map, rooms, params);

  // Step 6: Secret rooms with pushwalls
  if (params.secretRooms > 0) {
    placeSecretRooms(map, rooms, params.secretRooms);
  }

  // Step 7: Place player start in first room
  placePlayerStart(map, rooms);

  // Step 8: Place enemies
  placeEnemies(map, rooms, params, lvl);

  // Step 9: Place pickups and decorations
  placePickups(map, rooms, params, lvl);

  // Step 10: Place exit elevator in last room
  placeExit(map, rooms);

  // Step 11: Apply wall texture variation
  applyWallTextures(map, lvl);

  // Step 12: Ensure border is sealed
  sealBorder(map);

  // Step 13: Flood-fill area numbers for any gaps
  floodFillAreas(map, rooms);

  return map;
}

/**
 * Returns the total number of available maps.
 */
export function getMapCount(): number {
  return 10;
}
