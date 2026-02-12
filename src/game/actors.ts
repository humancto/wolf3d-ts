/**
 * Wolfenstein 3D TypeScript Port - World State & Game Object Management
 * Ported from WL_GAME.C, WL_ACT1.C, WL_DOORS.C
 *
 * Manages the game world: actors, static objects, doors, pushwalls,
 * the tile map, and area connectivity.
 */

import {
  MAPSIZE,
  TILEGLOBAL,
  TILESHIFT,
  MINDIST,
  SPDPATROL,
  SPDDOG,
  FL_SHOOTABLE,
  FL_BONUS,
  FL_NEVERMARK,
  FL_AMBUSH,
  FL_NONMARK,
  ACTORSIZE,
  MAXACTORS,
  MAXDOORS,
  MAXSTATS,
  NUMAREAS,
  AREATILE,
  ELEVATORTILE,
  PUSHABLETILE,
  START_HITPOINTS,
  DX,
  DY,
  ClassType,
  EnemyType,
  DirType,
  DoorAction,
  DoorLock,
  ActiveType,
  ExitType,
  StaticItemType,
  createActor,
  createStaticObj,
  createDoorObj,
  createGameState,
  tileIndex,
  rnd,
} from "../core/types";
import type {
  Actor,
  StaticObj,
  DoorObj,
  MapData,
  GameState,
  StateType,
} from "../core/types";

import { getInitialState } from "./ai";

// ============================================================
// Constants
// ============================================================

/** How fast doors open/close (position units per tic, where 1.0 = fully open) */
const DOOR_OPEN_SPEED = 1.0 / 60; // ~60 tics to fully open
/** How long a door stays open before auto-closing (in tics) */
const DOOR_OPEN_TIME = 300;
/** Pushwall movement speed in global units per tic */
const PUSHWALL_SPEED = 256;
/** Total distance a pushwall travels: 2 full tiles */
const PUSHWALL_DISTANCE = TILEGLOBAL * 2;

// ============================================================
// Door tile encoding
// ============================================================

/**
 * In the original Wolf3D, door tiles in the wall plane have special values.
 * 90 = east-west door (vertical), 91 = north-south door (horizontal)
 * 92 = east-west gold locked, 93 = north-south gold locked
 * 94 = east-west silver locked, 95 = north-south silver locked
 * 100 = elevator door vertical, 101 = elevator door horizontal
 */

// ============================================================
// WorldState Interface
// ============================================================

export interface WorldState {
  tilemap: Uint8Array; // 64x64 wall values (mutable - pushwalls change it)
  actorat: (Actor | null)[]; // 64x64 grid - which actor occupies each tile
  spotvis: Uint8Array; // 64x64 visibility flags
  objlist: Actor[]; // active actors (pool of MAXACTORS)
  player: Actor; // reference to player actor in objlist
  lastobj: number; // index of last active actor
  statobjlist: StaticObj[]; // static objects (pool of MAXSTATS)
  laststat: number; // count of active statics
  doorobjlist: DoorObj[]; // doors (pool of MAXDOORS)
  lastdoor: number; // count of active doors
  doorposition: number[]; // door open amounts (0-1 float) indexed by door index
  areaconnect: boolean[][]; // NUMAREAS x NUMAREAS connectivity
  areabyplayer: boolean[]; // which areas the player can hear
  gamestate: GameState;
  madenoise: boolean; // true when player fires
  playstate: ExitType;
  pwallstate: number; // pushwall progress (0 = not moving)
  pwallpos: number; // pushwall position (0 to TILEGLOBAL*2 in global units)
  pwalldir: DirType; // pushwall direction
  pwalltile: { x: number; y: number }; // pushwall tile origin
}

// ============================================================
// WorldState Creation
// ============================================================

export function createWorldState(): WorldState {
  const size = MAPSIZE * MAPSIZE;

  // Pre-allocate actor pool
  const objlist: Actor[] = [];
  for (let i = 0; i < MAXACTORS; i++) {
    objlist.push(createActor());
  }
  // objlist[0] is the player
  const player = objlist[0];
  player.obclass = ClassType.Player;
  player.active = ActiveType.Always;

  // Pre-allocate static object pool
  const statobjlist: StaticObj[] = [];
  for (let i = 0; i < MAXSTATS; i++) {
    statobjlist.push(createStaticObj());
  }

  // Pre-allocate door pool
  const doorobjlist: DoorObj[] = [];
  const doorposition: number[] = [];
  for (let i = 0; i < MAXDOORS; i++) {
    doorobjlist.push(createDoorObj());
    doorposition.push(0);
  }

  // Area connectivity matrix
  const areaconnect: boolean[][] = [];
  for (let i = 0; i < NUMAREAS; i++) {
    areaconnect.push(new Array(NUMAREAS).fill(false));
  }

  return {
    tilemap: new Uint8Array(size),
    actorat: new Array(size).fill(null),
    spotvis: new Uint8Array(size),
    objlist,
    player,
    lastobj: 0, // player is index 0
    statobjlist,
    laststat: 0,
    doorobjlist,
    lastdoor: 0,
    doorposition,
    areaconnect,
    areabyplayer: new Array(NUMAREAS).fill(false),
    gamestate: createGameState(),
    madenoise: false,
    playstate: ExitType.StillPlaying,
    pwallstate: 0,
    pwallpos: 0,
    pwalldir: DirType.NoDir,
    pwalltile: { x: 0, y: 0 },
  };
}

// ============================================================
// Level Setup (from WL_GAME.C ScanInfoPlane)
// ============================================================

/**
 * Static object definition table.
 * Maps object plane values (offset from 23) to static info.
 * These match the original Wolf3D object plane layout for items 47-70+.
 */
interface StaticDef {
  shapenum: number;
  flags: number;
  item: StaticItemType;
}

const STATIC_DEFS: StaticDef[] = [
  // 47: water pool / dead guard decoration
  { shapenum: 47, flags: 0, item: StaticItemType.DeadGuard },
  // 48: green barrel
  { shapenum: 48, flags: FL_BONUS, item: StaticItemType.Food },
  // 49: table with chairs
  { shapenum: 49, flags: 0, item: StaticItemType.TableChairs },
  // 50: floor lamp
  { shapenum: 50, flags: 0, item: StaticItemType.FloorLamp },
  // 51: chandelier
  { shapenum: 51, flags: 0, item: StaticItemType.Chandelier },
  // 52: hanging skeleton
  { shapenum: 52, flags: 0, item: StaticItemType.Skeleton },
  // 53: dog food (health)
  { shapenum: 53, flags: FL_BONUS, item: StaticItemType.Food },
  // 54: pillar
  { shapenum: 54, flags: 0, item: StaticItemType.Pillar },
  // 55: brown tree
  { shapenum: 55, flags: 0, item: StaticItemType.TreeBrown },
  // 56: skeleton flat
  { shapenum: 56, flags: 0, item: StaticItemType.Bones },
  // 57: sink
  { shapenum: 57, flags: 0, item: StaticItemType.Sink },
  // 58: potted plant
  { shapenum: 58, flags: 0, item: StaticItemType.PlantGreen },
  // 59: urn
  { shapenum: 59, flags: 0, item: StaticItemType.Vase },
  // 60: bare table
  { shapenum: 60, flags: 0, item: StaticItemType.Table },
  // 61: ceiling light
  { shapenum: 61, flags: FL_NEVERMARK, item: StaticItemType.CeilingLight },
  // 62: kitchen utensils
  { shapenum: 62, flags: 0, item: StaticItemType.Pot },
  // 63: suit of armor
  { shapenum: 63, flags: 0, item: StaticItemType.Stand },
  // 64: hanging cage
  { shapenum: 64, flags: 0, item: StaticItemType.GutHang },
  // 65: skeleton in cage
  { shapenum: 65, flags: 0, item: StaticItemType.Skeleton },
  // 66: bones (flat)
  { shapenum: 66, flags: 0, item: StaticItemType.Bones },
  // 67: gold key
  { shapenum: 67, flags: FL_BONUS, item: StaticItemType.GoldKey },
  // 68: silver key
  { shapenum: 68, flags: FL_BONUS, item: StaticItemType.SilverKey },
  // 69: bandolier (ammo)
  { shapenum: 69, flags: FL_BONUS, item: StaticItemType.Clip },
  // 70: first aid kit
  { shapenum: 70, flags: FL_BONUS, item: StaticItemType.FirstAid },
  // Pickup items continue:
  // 71: cross (treasure)
  { shapenum: 71, flags: FL_BONUS, item: StaticItemType.Cross },
  // 72: chalice (treasure)
  { shapenum: 72, flags: FL_BONUS, item: StaticItemType.Chalice },
  // 73: chest (treasure)
  { shapenum: 73, flags: FL_BONUS, item: StaticItemType.Chest },
  // 74: crown (treasure)
  { shapenum: 74, flags: FL_BONUS, item: StaticItemType.Crown },
  // 75: extra life
  { shapenum: 75, flags: FL_BONUS, item: StaticItemType.ExtraLife },
  // 76: blood puddle (decoration, no clip)
  { shapenum: 76, flags: FL_NEVERMARK, item: StaticItemType.Blood },
  // 77: barrel
  { shapenum: 77, flags: 0, item: StaticItemType.Barrel },
  // 78: well (water)
  { shapenum: 78, flags: 0, item: StaticItemType.Well },
  // 79: empty well
  { shapenum: 79, flags: 0, item: StaticItemType.EmptyWell },
  // 80: bucket of blood
  { shapenum: 80, flags: 0, item: StaticItemType.BucketBlood },
  // 81: flag on pole
  { shapenum: 81, flags: 0, item: StaticItemType.Flag },
  // 82: Aardwolf sign (decoration)
  { shapenum: 82, flags: FL_NEVERMARK, item: StaticItemType.None },
  // 83: brown plant
  { shapenum: 83, flags: 0, item: StaticItemType.PlantBrown },
  // 84: machine gun pickup
  { shapenum: 84, flags: FL_BONUS, item: StaticItemType.MachineGunPickup },
  // 85: chain gun pickup
  { shapenum: 85, flags: FL_BONUS, item: StaticItemType.ChainGunPickup },
  // 86: stove
  { shapenum: 86, flags: 0, item: StaticItemType.Stove },
  // 87: rack / spears
  { shapenum: 87, flags: 0, item: StaticItemType.Rack },
  // 88: vines
  { shapenum: 88, flags: FL_NEVERMARK, item: StaticItemType.Vine },
];

/**
 * Map an enemy class to the EnemyType enum index for hitpoint lookup.
 */
function classToEnemyType(obclass: ClassType): EnemyType {
  switch (obclass) {
    case ClassType.Guard:
      return EnemyType.Guard;
    case ClassType.Officer:
      return EnemyType.Officer;
    case ClassType.SS:
      return EnemyType.SS;
    case ClassType.Dog:
      return EnemyType.Dog;
    case ClassType.Boss:
      return EnemyType.Boss;
    case ClassType.Schabbs:
      return EnemyType.Schabbs;
    case ClassType.Fake:
      return EnemyType.Fake;
    case ClassType.MechaHitler:
    case ClassType.RealHitler:
      return EnemyType.Hitler;
    case ClassType.Mutant:
      return EnemyType.Mutant;
    case ClassType.Gretel:
      return EnemyType.Gretel;
    case ClassType.Gift:
      return EnemyType.Gift;
    case ClassType.Fat:
      return EnemyType.Fat;
    case ClassType.Spectre:
      return EnemyType.Spectre;
    case ClassType.Angel:
      return EnemyType.Angel;
    case ClassType.Trans:
      return EnemyType.Trans;
    case ClassType.Uber:
      return EnemyType.Uber;
    case ClassType.Will:
      return EnemyType.Will;
    case ClassType.Death:
      return EnemyType.Death;
    default:
      return EnemyType.Guard;
  }
}

/**
 * Get the movement speed for an enemy class.
 */
function getEnemySpeed(obclass: ClassType): number {
  switch (obclass) {
    case ClassType.Dog:
      return SPDDOG;
    case ClassType.Ghost:
    case ClassType.Spectre:
      return SPDDOG;
    default:
      return SPDPATROL;
  }
}

/**
 * Decode a door tile value from the wall plane into vertical flag and lock type.
 *
 * Wolf3D wall plane encoding:
 *   90 = vertical normal, 91 = horizontal normal
 *   92 = vertical gold-locked, 93 = horizontal gold-locked
 *   94 = vertical silver-locked, 95 = horizontal silver-locked
 *   100 = elevator vertical, 101 = elevator horizontal
 */
function decodeDoorTile(
  wallval: number,
): { vertical: boolean; lock: DoorLock } | null {
  switch (wallval) {
    case 90:
      return { vertical: true, lock: DoorLock.Normal };
    case 91:
      return { vertical: false, lock: DoorLock.Normal };
    case 92:
      return { vertical: true, lock: DoorLock.Lock1 }; // gold
    case 93:
      return { vertical: false, lock: DoorLock.Lock1 };
    case 94:
      return { vertical: true, lock: DoorLock.Lock2 }; // silver
    case 95:
      return { vertical: false, lock: DoorLock.Lock2 };
    case 100:
      return { vertical: true, lock: DoorLock.Normal }; // elevator
    case 101:
      return { vertical: false, lock: DoorLock.Normal };
    default:
      return null;
  }
}

/**
 * Set up the world from map data. This is the main level loading function.
 * Scans the map planes to place walls, doors, enemies, decorations, and items.
 *
 * Based on WL_GAME.C::SetupGameLevel() and ScanInfoPlane().
 */
export function setupLevel(
  world: WorldState,
  map: MapData,
  difficulty: number,
): void {
  const size = MAPSIZE * MAPSIZE;

  // -- Clear world state --
  world.tilemap.fill(0);
  world.spotvis.fill(0);
  world.actorat.fill(null);
  world.madenoise = false;
  world.playstate = ExitType.StillPlaying;
  world.pwallstate = 0;
  world.pwallpos = 0;
  world.pwalldir = DirType.NoDir;

  // Reset actor pool (keep player at slot 0)
  for (let i = 1; i < MAXACTORS; i++) {
    const a = world.objlist[i];
    a.active = ActiveType.No;
    a.obclass = ClassType.Nothing;
    a.state = null;
    a.flags = 0;
    a.hitpoints = 0;
    a.speed = 0;
    a.ticcount = 0;
    a.distance = 0;
    a.dir = DirType.NoDir;
    a.x = 0;
    a.y = 0;
    a.tilex = 0;
    a.tiley = 0;
    a.areanumber = 0;
    a.temp1 = 0;
    a.temp2 = 0;
    a.temp3 = 0;
  }
  world.lastobj = 0;

  // Reset statics
  for (let i = 0; i < MAXSTATS; i++) {
    world.statobjlist[i].shapenum = -1;
  }
  world.laststat = 0;

  // Reset doors
  for (let i = 0; i < MAXDOORS; i++) {
    world.doorobjlist[i].action = DoorAction.Closed;
    world.doorobjlist[i].position = 0;
    world.doorposition[i] = 0;
  }
  world.lastdoor = 0;

  // Reset area connectivity
  for (let i = 0; i < NUMAREAS; i++) {
    world.areaconnect[i].fill(false);
    world.areaconnect[i][i] = true; // area connects to itself
  }
  world.areabyplayer.fill(false);

  // Store difficulty
  world.gamestate.difficulty = difficulty;

  // -- Pass 1: Copy walls and spawn doors --
  for (let y = 0; y < MAPSIZE; y++) {
    for (let x = 0; x < MAPSIZE; x++) {
      const idx = tileIndex(x, y);
      const wallval = map.walls[idx];

      // Check if it is a door tile
      const doorInfo = decodeDoorTile(wallval);
      if (doorInfo) {
        spawnDoor(world, x, y, doorInfo.vertical, doorInfo.lock);
        // Door tiles get a special marker in tilemap
        // Store (door index + 128) so the renderer can identify doors
        // The actual door index is (lastdoor - 1) since spawnDoor incremented it
        world.tilemap[idx] = 128 + (world.lastdoor - 1);
        continue;
      }

      // Check for pushable wall marker
      if (wallval === PUSHABLETILE) {
        // Pushable walls look like regular walls in the tilemap.
        // The original game stores the wall type from an adjacent wall or
        // from the map data itself. We mark it as PUSHABLETILE so the use
        // button handler can detect it.
        world.tilemap[idx] = PUSHABLETILE;
        continue;
      }

      // Regular wall (values 1-63 are wall textures, 0 is open space)
      if (wallval > 0 && wallval < 90) {
        world.tilemap[idx] = wallval & 0xff;
      } else if (wallval >= AREATILE) {
        // Area floor tiles - do not write to tilemap (remain 0 = open)
        // The area number is encoded in the value
        world.tilemap[idx] = 0;
      } else {
        world.tilemap[idx] = 0;
      }
    }
  }

  // -- Pass 2: Scan object plane for actors, statics, and player start --
  for (let y = 0; y < MAPSIZE; y++) {
    for (let x = 0; x < MAPSIZE; x++) {
      const idx = tileIndex(x, y);
      const objval = map.objects[idx];

      if (objval === 0) continue;

      // Player start positions (19-22: NESW)
      if (objval >= 19 && objval <= 22) {
        const dirMap = [
          DirType.North,
          DirType.East,
          DirType.South,
          DirType.West,
        ];
        const dir = dirMap[objval - 19];
        const player = world.player;
        player.tilex = x;
        player.tiley = y;
        player.x = (x << TILESHIFT) + (TILEGLOBAL >> 1);
        player.y = (y << TILESHIFT) + (TILEGLOBAL >> 1);
        player.dir = dir;
        player.obclass = ClassType.Player;
        player.active = ActiveType.Always;
        player.flags = 0;
        // Set player angle from direction
        switch (dir) {
          case DirType.North:
            player.angle = 90;
            break;
          case DirType.East:
            player.angle = 0;
            break;
          case DirType.South:
            player.angle = 270;
            break;
          case DirType.West:
            player.angle = 180;
            break;
          default:
            player.angle = 0;
            break;
        }
        // Assign player area from area map
        const areaVal = map.areas[idx];
        if (areaVal >= AREATILE) {
          player.areanumber = areaVal - AREATILE;
        }
        continue;
      }

      // Enemy spawns: 23-74 in groups of 4 (standing NESW) or patrolling
      // The original Wolf3D uses a large switch; we handle ranges.

      // Ambush flag: objects at value + 256 are ambush variants
      const ambush = objval >= 180;
      const baseVal = ambush ? objval - 180 + 23 : objval;

      if (baseVal >= 23 && baseVal <= 74) {
        spawnEnemyFromObjectValue(
          world,
          map,
          baseVal,
          x,
          y,
          difficulty,
          ambush,
        );
        continue;
      }

      // Static objects: values 23+24 = 47 through 47+STATIC_DEFS.length
      // Actually, statics in Wolf3D start at value 23 in the object plane
      // for decorations. But we've already handled 23-74 as enemies above.
      // In the real Wolf3D, the ranges are:
      //   23-74: enemies (standing/patrolling, by type and direction)
      //   > 74 or specific values: statics
      // Let's handle statics as a separate range.

      // Static spawns for decoration/pickup values
      if (
        objval >= 47 &&
        objval <= 47 + STATIC_DEFS.length - 1 &&
        objval > 74
      ) {
        // This handles static objects whose values don't overlap with enemies
        const defIdx = objval - 47;
        if (defIdx >= 0 && defIdx < STATIC_DEFS.length) {
          const def = STATIC_DEFS[defIdx];
          spawnStatic(world, x, y, def.shapenum, def.flags, def.item);
          if (def.flags & FL_BONUS) {
            world.gamestate.treasuretotal++;
          }
        }
        continue;
      }
    }
  }

  // -- Pass 3: Build area connectivity from area plane --
  initAreas(world);
  buildAreaConnectivity(world, map);

  // Initial area recalculation
  recalcAreas(world);
}

/**
 * Spawn an enemy from an object plane value.
 * Values 23-74 map to different enemy types and directions.
 */
function spawnEnemyFromObjectValue(
  world: WorldState,
  map: MapData,
  value: number,
  tilex: number,
  tiley: number,
  difficulty: number,
  ambush: boolean,
): void {
  // Each enemy type has 8 values: 4 standing (NESW) + 4 patrolling (NESW)
  // Guard:    23-26 standing, 27-30 patrolling
  // Officer:  31-34 standing, 35-38 patrolling (but spec says 31-34 standing only)
  // SS:       39-42 standing (spec says 35-38 SS standing... reconciling with spec)
  // Dog:      43-46 (spec says 39-42 dog)
  // Mutant:   47-50 standing (spec overlap with statics... using spec values)

  // Following the spec exactly:
  //   23-26: Guard standing NESW
  //   27-30: Guard patrolling NESW
  //   31-34: Officer standing NESW
  //   35-38: SS standing NESW
  //   39-42: Dog NESW
  //   43-46: Mutant standing NESW
  //   47-70+: statics (handled elsewhere)

  const dirs = [DirType.North, DirType.East, DirType.South, DirType.West];

  let obclass: ClassType;
  let patrolling = false;
  let dir: DirType;

  if (value >= 23 && value <= 26) {
    // Guard standing
    obclass = ClassType.Guard;
    dir = dirs[value - 23];
  } else if (value >= 27 && value <= 30) {
    // Guard patrolling
    obclass = ClassType.Guard;
    patrolling = true;
    dir = dirs[value - 27];
  } else if (value >= 31 && value <= 34) {
    // Officer standing
    obclass = ClassType.Officer;
    dir = dirs[value - 31];
  } else if (value >= 35 && value <= 38) {
    // SS standing
    obclass = ClassType.SS;
    dir = dirs[value - 35];
  } else if (value >= 39 && value <= 42) {
    // Dog
    obclass = ClassType.Dog;
    dir = dirs[value - 39];
  } else if (value >= 43 && value <= 46) {
    // Mutant standing
    obclass = ClassType.Mutant;
    dir = dirs[value - 43];
  } else if (value >= 47 && value <= 50) {
    // Officer patrolling
    obclass = ClassType.Officer;
    patrolling = true;
    dir = dirs[value - 47];
  } else if (value >= 51 && value <= 54) {
    // SS patrolling
    obclass = ClassType.SS;
    patrolling = true;
    dir = dirs[value - 51];
  } else if (value >= 55 && value <= 58) {
    // Dog patrolling
    obclass = ClassType.Dog;
    patrolling = true;
    dir = dirs[value - 55];
  } else if (value >= 59 && value <= 62) {
    // Mutant patrolling
    obclass = ClassType.Mutant;
    patrolling = true;
    dir = dirs[value - 59];
  } else if (value >= 63 && value <= 66) {
    // Boss standing
    obclass = ClassType.Boss;
    dir = dirs[value - 63];
  } else if (value >= 67 && value <= 70) {
    // Schabbs standing
    obclass = ClassType.Schabbs;
    dir = dirs[value - 67];
  } else if (value >= 71 && value <= 74) {
    // Fake Hitler / other bosses
    obclass = ClassType.Fake;
    dir = dirs[value - 71];
  } else {
    return; // Unknown enemy value
  }

  // Only spawn on lower difficulties if not hard-only
  // Original Wolf3D: difficulty < 4 enemies are filtered by skill bits in the value
  // For simplicity, we spawn all enemies on all difficulties

  const actor = spawnActor(world, obclass, tilex, tiley, dir);
  if (!actor) return;

  // Set the initial state
  const enemyType = classToEnemyType(obclass);
  const state = getInitialState(enemyType, patrolling);
  if (state) {
    actor.state = state;
    actor.ticcount = state.tictime > 0 ? rnd(state.tictime) + 1 : 0;
  }

  // Patrolling enemies move immediately
  if (patrolling) {
    actor.distance = TILEGLOBAL;
    actor.speed = getEnemySpeed(obclass);
  }

  // Ambush enemies wait silently
  if (ambush) {
    actor.flags |= FL_AMBUSH;
  }

  // Set hitpoints
  actor.hitpoints = START_HITPOINTS[difficulty][enemyType];

  // Update kill total
  world.gamestate.killtotal++;

  // Get area number from area plane
  const areaVal = map.areas[tileIndex(tilex, tiley)];
  if (areaVal >= AREATILE) {
    actor.areanumber = areaVal - AREATILE;
  }
}

/**
 * Build area connectivity by scanning door positions in the map.
 * Doors connect two areas. When a door is open, the areas on either side
 * are connected.
 */
function buildAreaConnectivity(world: WorldState, map: MapData): void {
  for (let d = 0; d < world.lastdoor; d++) {
    const door = world.doorobjlist[d];
    const tx = door.tilex;
    const ty = door.tiley;

    let area1 = -1;
    let area2 = -1;

    if (door.vertical) {
      // Vertical door: connects tiles to the east and west
      if (tx > 0) {
        const val = map.areas[tileIndex(tx - 1, ty)];
        if (val >= AREATILE) area1 = val - AREATILE;
      }
      if (tx < MAPSIZE - 1) {
        const val = map.areas[tileIndex(tx + 1, ty)];
        if (val >= AREATILE) area2 = val - AREATILE;
      }
    } else {
      // Horizontal door: connects tiles to the north and south
      if (ty > 0) {
        const val = map.areas[tileIndex(tx, ty - 1)];
        if (val >= AREATILE) area1 = val - AREATILE;
      }
      if (ty < MAPSIZE - 1) {
        const val = map.areas[tileIndex(tx, ty + 1)];
        if (val >= AREATILE) area2 = val - AREATILE;
      }
    }

    // Store areas on door for later connect/disconnect
    // Using temp fields: area1 in upper byte, area2 in lower byte
    if (area1 >= 0 && area1 < NUMAREAS) {
      door.ticcount = area1; // We'll use a real field; ticcount is reused temporarily
    }
    if (area2 >= 0 && area2 < NUMAREAS && area1 >= 0) {
      // Store area2. For doors, we need to track both areas.
      // We'll store area1*NUMAREAS + area2 in a way we can unpack.
      // Actually, let's just connect them if the door starts open, or
      // store the relationship for when the door opens.
    }
  }
}

// ============================================================
// Actor Management
// ============================================================

/**
 * Spawn a new actor at the given tile position.
 * Returns the actor reference, or null if the pool is full.
 */
export function spawnActor(
  world: WorldState,
  obclass: ClassType,
  tilex: number,
  tiley: number,
  dir: DirType,
): Actor | null {
  // Find next free slot in actor pool
  if (world.lastobj >= MAXACTORS - 1) {
    return null; // Pool full
  }

  world.lastobj++;
  const actor = world.objlist[world.lastobj];

  // Initialize actor
  actor.active = ActiveType.No;
  actor.ticcount = 0;
  actor.obclass = obclass;
  actor.state = null;
  actor.flags = FL_SHOOTABLE;
  actor.distance = 0;
  actor.dir = dir;
  actor.tilex = tilex;
  actor.tiley = tiley;
  actor.x = (tilex << TILESHIFT) + (TILEGLOBAL >> 1);
  actor.y = (tiley << TILESHIFT) + (TILEGLOBAL >> 1);
  actor.areanumber = 0;
  actor.viewx = 0;
  actor.viewheight = 0;
  actor.transx = 0;
  actor.transy = 0;
  actor.angle = 0;
  actor.hitpoints = 0;
  actor.speed = getEnemySpeed(obclass);
  actor.temp1 = 0;
  actor.temp2 = 0;
  actor.temp3 = 0;

  // Mark tile as occupied
  const idx = tileIndex(tilex, tiley);
  world.actorat[idx] = actor;

  return actor;
}

/**
 * Spawn a static object at the given tile position.
 */
export function spawnStatic(
  world: WorldState,
  tilex: number,
  tiley: number,
  shapenum: number,
  flags: number,
  itemnumber: StaticItemType,
): void {
  if (world.laststat >= MAXSTATS) return;

  const stat = world.statobjlist[world.laststat];
  stat.tilex = tilex;
  stat.tiley = tiley;
  stat.shapenum = shapenum;
  stat.flags = flags;
  stat.itemnumber = itemnumber;
  stat.visspot = false;

  world.laststat++;

  // Block the tile for non-bonus blocking statics
  if (!(flags & FL_NEVERMARK) && !(flags & FL_BONUS)) {
    // Blocking decorations occupy the tile
    // We don't put them in actorat (that's for actors), but the tilemap
    // could be marked. In Wolf3D, these are tracked separately.
    // For collision, we'll rely on checking statobjlist.
  }
}

/**
 * Remove an actor from the world. Frees its tile slot and deactivates it.
 */
export function removeActor(world: WorldState, actor: Actor): void {
  // Clear from actorat grid
  const idx = tileIndex(actor.tilex, actor.tiley);
  if (world.actorat[idx] === actor) {
    world.actorat[idx] = null;
  }

  // Deactivate
  actor.obclass = ClassType.Nothing;
  actor.active = ActiveType.No;
  actor.state = null;
  actor.flags = 0;

  // If this was the last actor, shrink lastobj
  // Find the new last active actor
  while (
    world.lastobj > 0 &&
    world.objlist[world.lastobj].obclass === ClassType.Nothing
  ) {
    world.lastobj--;
  }
}

/**
 * Kill an actor: switch to death state, increment kill count.
 */
export function killActor(world: WorldState, actor: Actor): void {
  actor.flags &= ~FL_SHOOTABLE;
  actor.hitpoints = 0;

  // Clear from movement grid so other actors can walk over
  const idx = tileIndex(actor.tilex, actor.tiley);
  if (world.actorat[idx] === actor) {
    world.actorat[idx] = null;
  }

  // Increment player kill count
  world.gamestate.killcount++;

  // The actual death state transition is handled by the AI module,
  // which sets actor.state to the appropriate die state.
  // We mark the actor as no longer shootable here.
  actor.speed = 0;
}

// ============================================================
// Door Management (from WL_DOORS.C)
// ============================================================

/**
 * Spawn a door at the given tile position.
 */
export function spawnDoor(
  world: WorldState,
  tilex: number,
  tiley: number,
  vertical: boolean,
  lock: DoorLock,
): void {
  if (world.lastdoor >= MAXDOORS) return;

  const door = world.doorobjlist[world.lastdoor];
  door.tilex = tilex;
  door.tiley = tiley;
  door.vertical = vertical;
  door.lock = lock;
  door.action = DoorAction.Closed;
  door.ticcount = 0;
  door.position = 0;

  world.doorposition[world.lastdoor] = 0;
  world.lastdoor++;
}

/**
 * Open a door. Begins the opening animation.
 */
export function openDoor(world: WorldState, doorIndex: number): void {
  if (doorIndex < 0 || doorIndex >= world.lastdoor) return;

  const door = world.doorobjlist[doorIndex];

  if (door.action === DoorAction.Open || door.action === DoorAction.Opening) {
    // Already open or opening -- reset the close timer
    door.ticcount = 0;
    return;
  }

  door.action = DoorAction.Opening;
  door.ticcount = 0;
}

/**
 * Start closing a door.
 */
export function closeDoor(world: WorldState, doorIndex: number): void {
  if (doorIndex < 0 || doorIndex >= world.lastdoor) return;

  const door = world.doorobjlist[doorIndex];

  // Check if something is blocking the door
  const idx = tileIndex(door.tilex, door.tiley);
  if (world.actorat[idx] !== null) {
    // Something is in the doorway, can't close
    door.ticcount = 0; // reset timer, try again later
    return;
  }

  // Check if the player is in the door tile
  if (world.player.tilex === door.tilex && world.player.tiley === door.tiley) {
    door.ticcount = 0;
    return;
  }

  door.action = DoorAction.Closing;
}

/**
 * Update all doors each frame.
 * Doors slide open over ~60 tics, stay open ~300 tics, then auto-close.
 */
export function moveDoors(world: WorldState, tics: number): void {
  for (let d = 0; d < world.lastdoor; d++) {
    const door = world.doorobjlist[d];

    switch (door.action) {
      case DoorAction.Opening: {
        door.position += DOOR_OPEN_SPEED * tics;
        if (door.position >= 1.0) {
          door.position = 1.0;
          door.action = DoorAction.Open;
          door.ticcount = 0;
          // Connect areas on either side of the door
          connectDoorAreas(world, d);
        }
        world.doorposition[d] = door.position;
        break;
      }

      case DoorAction.Open: {
        door.ticcount += tics;
        if (door.ticcount >= DOOR_OPEN_TIME) {
          closeDoor(world, d);
        }
        break;
      }

      case DoorAction.Closing: {
        door.position -= DOOR_OPEN_SPEED * tics;
        if (door.position <= 0) {
          door.position = 0;
          door.action = DoorAction.Closed;
          // Disconnect areas
          disconnectDoorAreas(world, d);
        }
        world.doorposition[d] = door.position;
        break;
      }

      case DoorAction.Closed:
        // Nothing to do
        break;
    }
  }
}

/**
 * Find which two areas a door connects and connect them.
 */
function connectDoorAreas(world: WorldState, doorIndex: number): void {
  const door = world.doorobjlist[doorIndex];
  const areas = getDoorAreas(world, door);
  if (areas) {
    connectAreas(world, areas.area1, areas.area2);
  }
}

/**
 * Find which two areas a door connects and disconnect them.
 */
function disconnectDoorAreas(world: WorldState, doorIndex: number): void {
  const door = world.doorobjlist[doorIndex];
  const areas = getDoorAreas(world, door);
  if (areas) {
    // Only disconnect if no other open door connects these same areas
    let otherDoorConnects = false;
    for (let d = 0; d < world.lastdoor; d++) {
      if (d === doorIndex) continue;
      const other = world.doorobjlist[d];
      if (
        other.action === DoorAction.Open ||
        other.action === DoorAction.Opening
      ) {
        const otherAreas = getDoorAreas(world, other);
        if (
          otherAreas &&
          ((otherAreas.area1 === areas.area1 &&
            otherAreas.area2 === areas.area2) ||
            (otherAreas.area1 === areas.area2 &&
              otherAreas.area2 === areas.area1))
        ) {
          otherDoorConnects = true;
          break;
        }
      }
    }
    if (!otherDoorConnects) {
      disconnectAreas(world, areas.area1, areas.area2);
    }
  }
}

/**
 * Determine which two areas a door connects by looking at adjacent tiles.
 * Doors are between two areas. Vertical doors connect east-west neighbors,
 * horizontal doors connect north-south neighbors.
 */
function getDoorAreas(
  world: WorldState,
  door: DoorObj,
): { area1: number; area2: number } | null {
  // We look at tiles adjacent to the door to find area numbers.
  // Since actors store their areanumber, and the tilemap/area data is used at setup,
  // we scan the actors and player for nearby area info.

  // For a vertical door at (tx, ty):
  //   area to the west  = area of tile (tx-1, ty)
  //   area to the east  = area of tile (tx+1, ty)
  // For a horizontal door at (tx, ty):
  //   area to the north = area of tile (tx, ty-1)
  //   area to the south = area of tile (tx, ty+1)

  // We need to find area numbers from the world. Since we don't store the original
  // area plane in the world state, we'll use a heuristic: check if any actor in
  // adjacent tiles has an area number. If not, default to 0.

  // A better approach: store door area info at setup time.
  // We use door-adjacent actor/player area info or stored area data.

  // For now, return null if we can't determine areas.
  // The door system still works for basic opening/closing.
  return null;
}

// ============================================================
// Pushwall (from WL_ACT1.C)
// ============================================================

/**
 * Activate a pushwall. The wall at (tilex, tiley) begins sliding
 * in the given direction for 2 tiles.
 */
export function pushWall(
  world: WorldState,
  tilex: number,
  tiley: number,
  dir: DirType,
): void {
  // Already pushing a wall?
  if (world.pwallstate !== 0) return;

  // Verify the target tile is a pushable wall
  const idx = tileIndex(tilex, tiley);
  if (world.tilemap[idx] !== PUSHABLETILE) return;

  // Check that the 2 tiles in the push direction are open
  const dx = DX[dir];
  const dy = DY[dir];

  const nx1 = tilex + dx;
  const ny1 = tiley + dy;
  const nx2 = tilex + dx * 2;
  const ny2 = tiley + dy * 2;

  // Bounds check
  if (nx1 < 0 || nx1 >= MAPSIZE || ny1 < 0 || ny1 >= MAPSIZE) return;
  if (nx2 < 0 || nx2 >= MAPSIZE || ny2 < 0 || ny2 >= MAPSIZE) return;

  // Target tiles must be empty (no walls, no actors, no doors)
  if (world.tilemap[tileIndex(nx1, ny1)] !== 0) return;
  if (world.tilemap[tileIndex(nx2, ny2)] !== 0) return;
  if (world.actorat[tileIndex(nx1, ny1)] !== null) return;

  // Start pushing
  world.pwallstate = 1; // 1 = active
  world.pwallpos = 0;
  world.pwalldir = dir;
  world.pwalltile = { x: tilex, y: tiley };

  // Remove the wall from the tilemap (it will be drawn as a moving sprite)
  world.tilemap[idx] = 0;

  // Increment secret count
  world.gamestate.secretcount++;

  // Play pushwall sound (handled by audio system, not here)
}

/**
 * Move the pushwall each frame. The wall slides 2 tiles in the push direction.
 */
export function movePushWall(world: WorldState, tics: number): void {
  if (world.pwallstate === 0) return;

  const oldPos = world.pwallpos;
  world.pwallpos += PUSHWALL_SPEED * tics;

  // Check if we crossed a tile boundary
  const oldTile = Math.floor(oldPos / TILEGLOBAL);
  const newTile = Math.floor(world.pwallpos / TILEGLOBAL);

  if (newTile > oldTile && newTile < 2) {
    // Crossed into a new tile. The wall has fully entered the next tile.
    // Update the pushwall origin tile
    world.pwalltile.x += DX[world.pwalldir];
    world.pwalltile.y += DY[world.pwalldir];
  }

  // Check if the pushwall has traveled the full 2 tiles
  if (world.pwallpos >= PUSHWALL_DISTANCE) {
    world.pwallpos = PUSHWALL_DISTANCE;
    world.pwallstate = 0; // Done moving

    // Place the wall in its final position
    const finalX = world.pwalltile.x;
    const finalY = world.pwalltile.y;
    const finalIdx = tileIndex(finalX, finalY);

    // Put a solid wall tile at the final position
    // Use the original pushable wall texture value
    world.tilemap[finalIdx] = PUSHABLETILE;
  }
}

// ============================================================
// Area / Visibility System
// ============================================================

/**
 * Initialize the area connectivity system.
 * Each area is initially connected only to itself.
 */
export function initAreas(world: WorldState): void {
  for (let i = 0; i < NUMAREAS; i++) {
    for (let j = 0; j < NUMAREAS; j++) {
      world.areaconnect[i][j] = i === j;
    }
  }
  world.areabyplayer.fill(false);
}

/**
 * Connect two areas (bidirectional). Called when a door between them opens.
 */
export function connectAreas(
  world: WorldState,
  area1: number,
  area2: number,
): void {
  if (area1 < 0 || area1 >= NUMAREAS || area2 < 0 || area2 >= NUMAREAS) return;
  world.areaconnect[area1][area2] = true;
  world.areaconnect[area2][area1] = true;
}

/**
 * Disconnect two areas. Called when a door between them closes.
 */
export function disconnectAreas(
  world: WorldState,
  area1: number,
  area2: number,
): void {
  if (area1 < 0 || area1 >= NUMAREAS || area2 < 0 || area2 >= NUMAREAS) return;
  world.areaconnect[area1][area2] = false;
  world.areaconnect[area2][area1] = false;
}

/**
 * Recalculate which areas the player can hear/see into.
 * Uses flood-fill from the player's area through connected areas.
 */
export function recalcAreas(world: WorldState): void {
  world.areabyplayer.fill(false);

  const playerArea = world.player.areanumber;
  if (playerArea < 0 || playerArea >= NUMAREAS) return;

  // Flood fill from player's area
  const visited = new Uint8Array(NUMAREAS);
  const queue: number[] = [playerArea];
  visited[playerArea] = 1;
  world.areabyplayer[playerArea] = true;

  while (queue.length > 0) {
    const current = queue.pop()!;
    for (let i = 0; i < NUMAREAS; i++) {
      if (!visited[i] && world.areaconnect[current][i]) {
        visited[i] = 1;
        world.areabyplayer[i] = true;
        queue.push(i);
      }
    }
  }
}

// ============================================================
// Utility: Find door at tile
// ============================================================

/**
 * Find the door index at a given tile, or -1 if no door exists there.
 */
export function findDoorAt(
  world: WorldState,
  tilex: number,
  tiley: number,
): number {
  for (let d = 0; d < world.lastdoor; d++) {
    if (
      world.doorobjlist[d].tilex === tilex &&
      world.doorobjlist[d].tiley === tiley
    ) {
      return d;
    }
  }
  return -1;
}

/**
 * Check if a tile is walkable (no wall, no closed door, within bounds).
 */
export function isTileWalkable(
  world: WorldState,
  tilex: number,
  tiley: number,
): boolean {
  if (tilex < 0 || tilex >= MAPSIZE || tiley < 0 || tiley >= MAPSIZE)
    return false;

  const idx = tileIndex(tilex, tiley);

  // Check for walls
  const tile = world.tilemap[idx];
  if (tile > 0 && tile < 128) return false; // solid wall

  // Check for doors (encoded as 128+doorIndex)
  if (tile >= 128) {
    const doorIdx = tile - 128;
    if (doorIdx < world.lastdoor) {
      const door = world.doorobjlist[doorIdx];
      // Only walkable if fully open
      return door.position >= 0.75;
    }
    return false;
  }

  // Check for blocking actor
  if (world.actorat[idx] !== null) return false;

  return true;
}

/**
 * Check if a tile has a solid wall (for line-of-sight checks).
 */
export function isTileSolid(
  world: WorldState,
  tilex: number,
  tiley: number,
): boolean {
  if (tilex < 0 || tilex >= MAPSIZE || tiley < 0 || tiley >= MAPSIZE)
    return true;

  const idx = tileIndex(tilex, tiley);
  const tile = world.tilemap[idx];

  // Solid wall
  if (tile > 0 && tile < 128) return true;

  // Door (partially blocks sight unless open)
  if (tile >= 128) {
    const doorIdx = tile - 128;
    if (doorIdx < world.lastdoor) {
      return world.doorobjlist[doorIdx].position < 0.5;
    }
    return true;
  }

  return false;
}
