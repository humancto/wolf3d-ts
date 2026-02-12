/**
 * Wolfenstein 3D TypeScript Port - Core Types & Constants
 * Ported from WL_DEF.H, WL_ACT2.C, WL_AGENT.C
 */

// ============================================================
// Map & World Constants
// ============================================================

export const MAPSIZE = 64;
export const TILESHIFT = 16;
export const TILEGLOBAL = 1 << TILESHIFT; // 0x10000 = 65536
export const GLOBAL1 = TILEGLOBAL;
export const MINDIST = 0x5800;
export const ANGLES = 360;
export const FINEANGLES = 3600;
export const ANG90 = FINEANGLES / 4; // 900
export const ANG180 = FINEANGLES / 2; // 1800
export const ANG270 = (FINEANGLES * 3) / 4; // 2700
export const ANG360 = FINEANGLES; // 3600

// ============================================================
// Limits
// ============================================================

export const MAXACTORS = 150;
export const MAXSTATS = 400;
export const MAXDOORS = 64;
export const MAXWALLTILES = 64;
export const NUMAREAS = 37;

// ============================================================
// Special tile values
// ============================================================

export const AREATILE = 107;
export const PUSHABLETILE = 98;
export const EXITTILE = 99;
export const ELEVATORTILE = 21;

// ============================================================
// Screen / View Constants
// ============================================================

export const STATUSLINES = 40;
export const SCREENWIDTH = 320;
export const SCREENHEIGHT = 200;
export const VIEWWIDTH = 320;
export const VIEWHEIGHT = 160; // SCREENHEIGHT - STATUSLINES

// ============================================================
// Player Constants
// ============================================================

export const STARTAMMO = 8;
export const PLAYERSPEED = 3000;
export const RUNSPEED = 6000;
export const FOCALLENGTH = 0x5700;
export const MOVESCALE = 150;
export const BACKMOVESCALE = 100;
export const ANGLESCALE = 20;

// ============================================================
// Actor / Projectile Constants
// ============================================================

export const ACTORSIZE = 0x4000;
export const PROJECTILESIZE = 0xc000;
export const SPDPATROL = 512;
export const SPDDOG = 1500;
export const NUMENEMIES = 22;

// ============================================================
// Object Flags (FL_*)
// ============================================================

export const FL_SHOOTABLE = 1;
export const FL_BONUS = 2;
export const FL_NEVERMARK = 4;
export const FL_VISABLE = 8;
export const FL_ATTACKMODE = 16;
export const FL_FIRSTATTACK = 32;
export const FL_AMBUSH = 64;
export const FL_NONMARK = 128;

// ============================================================
// Enums
// ============================================================

export enum ClassType {
  Nothing,
  Player,
  Inert,
  Guard,
  Officer,
  SS,
  Dog,
  Boss,
  Schabbs,
  Fake,
  MechaHitler,
  Mutant,
  Needle,
  Fire,
  BJ,
  Ghost,
  RealHitler,
  Gretel,
  Gift,
  Fat,
  Rocket,
  Spectre,
  Angel,
  Trans,
  Uber,
  Will,
  Death,
  HRocket,
  Spark,
}

export enum EnemyType {
  Guard,
  Officer,
  SS,
  Dog,
  Boss,
  Schabbs,
  Fake,
  Hitler,
  Mutant,
  Blinky,
  Clyde,
  Pinky,
  Inky,
  Gretel,
  Gift,
  Fat,
  Spectre,
  Angel,
  Trans,
  Uber,
  Will,
  Death,
}

export enum WeaponType {
  Knife,
  Pistol,
  MachineGun,
  ChainGun,
}

export enum DirType {
  East,
  NorthEast,
  North,
  NorthWest,
  West,
  SouthWest,
  South,
  SouthEast,
  NoDir,
}

export enum DoorAction {
  Open,
  Closed,
  Opening,
  Closing,
}

export enum DoorLock {
  Normal,
  Lock1,
  Lock2,
  Lock3,
  Lock4,
}

export enum ActiveType {
  No,
  Yes,
  Always,
}

export enum ExitType {
  StillPlaying,
  Completed,
  Died,
  Warped,
  ResetGame,
  LoadedGame,
  Victorious,
  Abort,
  DemoDone,
  SecretLevel,
}

export enum ButtonType {
  Attack,
  Strafe,
  Use,
  Run,
  ReadyKnife,
  ReadyPistol,
  ReadyMachineGun,
  ReadyChainGun,
  NoButton,
}

export enum StaticItemType {
  None,
  // Decorations
  DeadGuard,
  Chandelier,
  FloorLamp,
  Bones,
  EmptyBowl,
  PlantGreen,
  Skeleton,
  Lamp,
  BucketBlood,
  PlantBrown,
  Vase,
  Table,
  CeilingLight,
  GutHang,
  Flag,
  CeilingLight2,
  Vine,
  Barrel,
  Well,
  EmptyWell,
  Blood,
  FlagDown,
  Pot,
  Stove,
  Rack,
  Pillar,
  TreeBrown,
  TreeGreen,
  WellRed,
  Urinal,
  Stand,
  Sink,
  TableChairs,
  CeilingLamp,
  // Pickups (FL_BONUS items)
  Food,
  FirstAid,
  Clip,
  MachineGunPickup,
  ChainGunPickup,
  Cross,
  Chalice,
  Chest,
  Crown,
  ExtraLife,
  GoldKey,
  SilverKey,
}

// ============================================================
// Interfaces
// ============================================================

/** Forward declaration -- Actor is defined below */
export interface StateType {
  rotate: boolean;
  shapenum: number;
  tictime: number;
  think: ((ob: Actor) => void) | null;
  action: ((ob: Actor) => void) | null;
  next: StateType | null;
}

export interface Actor {
  active: ActiveType;
  ticcount: number;
  obclass: ClassType;
  state: StateType | null;
  flags: number;
  distance: number;
  dir: DirType;
  x: number; // fixed-point global coordinate
  y: number; // fixed-point global coordinate
  tilex: number; // tile coordinate
  tiley: number; // tile coordinate
  areanumber: number;
  viewx: number; // screen x after projection
  viewheight: number; // screen height after perspective
  transx: number; // transformed x
  transy: number; // transformed y
  angle: number; // 0-359
  hitpoints: number;
  speed: number;
  temp1: number;
  temp2: number;
  temp3: number;
}

export interface StaticObj {
  tilex: number;
  tiley: number;
  shapenum: number; // sprite number (-1 = free)
  flags: number;
  itemnumber: StaticItemType;
  visspot: boolean;
}

export interface DoorObj {
  tilex: number;
  tiley: number;
  vertical: boolean;
  lock: DoorLock;
  action: DoorAction;
  ticcount: number;
  position: number; // 0 = closed, 1.0 = fully open (float)
}

export interface GameState {
  difficulty: number; // 0-3
  mapon: number;
  oldscore: number;
  score: number;
  nextextra: number;
  lives: number;
  health: number;
  ammo: number;
  keys: number; // bitmask: 1=gold, 2=silver
  bestweapon: WeaponType;
  weapon: WeaponType;
  chosenweapon: WeaponType;
  faceframe: number;
  attackframe: number;
  attackcount: number;
  weaponframe: number;
  episode: number;
  secretcount: number;
  treasurecount: number;
  killcount: number;
  secrettotal: number;
  treasuretotal: number;
  killtotal: number;
  TimeCount: number;
  victoryflag: boolean;
}

export interface MapData {
  walls: Uint16Array; // 64x64 wall plane
  objects: Uint16Array; // 64x64 object plane
  areas: Uint16Array; // 64x64 area plane
  width: number;
  height: number;
  name: string;
}

// ============================================================
// Seedable RNG
// ============================================================

let _seed = 0;
let _initialSeed = 0;

export function setSeed(s: number): void {
  _seed = s >>> 0;
  _initialSeed = _seed;
}

export function getSeed(): number {
  return _initialSeed;
}

/** Mulberry32 PRNG -- produces a float in [0, 1) */
function mulberry32(): number {
  _seed = (_seed + 0x6d2b79f5) >>> 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Returns a random integer in [0, max-1] */
export function rnd(max: number): number {
  if (max <= 0) return 0;
  return Math.floor(mulberry32() * max);
}

/** Returns a random integer in [1, max] */
export function rndT(max: number): number {
  if (max <= 0) return 1;
  return Math.floor(mulberry32() * max) + 1;
}

// ============================================================
// Factory Functions
// ============================================================

export function createActor(): Actor {
  return {
    active: ActiveType.No,
    ticcount: 0,
    obclass: ClassType.Nothing,
    state: null,
    flags: 0,
    distance: 0,
    dir: DirType.NoDir,
    x: 0,
    y: 0,
    tilex: 0,
    tiley: 0,
    areanumber: 0,
    viewx: 0,
    viewheight: 0,
    transx: 0,
    transy: 0,
    angle: 0,
    hitpoints: 0,
    speed: 0,
    temp1: 0,
    temp2: 0,
    temp3: 0,
  };
}

export function createStaticObj(): StaticObj {
  return {
    tilex: 0,
    tiley: 0,
    shapenum: -1,
    flags: 0,
    itemnumber: StaticItemType.None,
    visspot: false,
  };
}

export function createDoorObj(): DoorObj {
  return {
    tilex: 0,
    tiley: 0,
    vertical: false,
    lock: DoorLock.Normal,
    action: DoorAction.Closed,
    ticcount: 0,
    position: 0,
  };
}

export function createGameState(): GameState {
  return {
    difficulty: 1,
    mapon: 0,
    oldscore: 0,
    score: 0,
    nextextra: 40000,
    lives: 3,
    health: 100,
    ammo: STARTAMMO,
    keys: 0,
    bestweapon: WeaponType.Pistol,
    weapon: WeaponType.Pistol,
    chosenweapon: WeaponType.Pistol,
    faceframe: 0,
    attackframe: 0,
    attackcount: 0,
    weaponframe: 0,
    episode: 0,
    secretcount: 0,
    treasurecount: 0,
    killcount: 0,
    secrettotal: 0,
    treasuretotal: 0,
    killtotal: 0,
    TimeCount: 0,
    victoryflag: false,
  };
}

export function createMapData(): MapData {
  const size = MAPSIZE * MAPSIZE;
  return {
    walls: new Uint16Array(size),
    objects: new Uint16Array(size),
    areas: new Uint16Array(size),
    width: MAPSIZE,
    height: MAPSIZE,
    name: "",
  };
}

/** Convert (x, y) tile coordinate to flat array index */
export function tileIndex(x: number, y: number): number {
  return y * MAPSIZE + x;
}

// ============================================================
// Hit Point Tables (from WL_ACT2.C starthitpoints)
// Indexed as START_HITPOINTS[difficulty][enemyType]
// Enemy ordering matches EnemyType enum:
//   Guard, Officer, SS, Dog, Boss, Schabbs, Fake, Hitler, Mutant,
//   Blinky, Clyde, Pinky, Inky, Gretel, Gift, Fat,
//   Spectre, Angel, Trans, Uber, Will, Death
// ============================================================

export const START_HITPOINTS: number[][] = [
  // Baby (difficulty 0)
  [
    25, 50, 100, 1, 850, 850, 200, 800, 45, 25, 25, 25, 25, 850, 850, 850, 5,
    1450, 850, 1050, 950, 1250,
  ],
  // Easy (difficulty 1)
  [
    25, 50, 100, 1, 950, 950, 300, 950, 55, 25, 25, 25, 25, 950, 950, 950, 10,
    1550, 950, 1150, 1050, 1350,
  ],
  // Medium (difficulty 2)
  [
    25, 50, 100, 1, 1050, 1050, 400, 1050, 55, 25, 25, 25, 25, 1050, 1050, 1050,
    15, 1650, 1050, 1250, 1150, 1450,
  ],
  // Hard (difficulty 3)
  [
    25, 50, 100, 1, 1200, 1200, 500, 1200, 65, 25, 25, 25, 25, 1200, 1200, 1200,
    25, 2000, 1200, 1400, 1300, 1600,
  ],
];

// ============================================================
// Attack Info (from WL_AGENT.C)
// Indexed as ATTACK_INFO[weapon][frame]
// attack values: 0=none, 1=gun, 2=knife, 3=machinegun burst, 4=chaingun burst, -1=done
// ============================================================

export const ATTACK_INFO: { tics: number; attack: number; frame: number }[][] =
  [
    // Knife
    [
      { tics: 6, attack: 0, frame: 1 },
      { tics: 6, attack: 2, frame: 2 },
      { tics: 6, attack: 0, frame: 3 },
      { tics: 6, attack: -1, frame: 4 },
    ],
    // Pistol
    [
      { tics: 6, attack: 0, frame: 1 },
      { tics: 6, attack: 1, frame: 2 },
      { tics: 6, attack: 0, frame: 3 },
      { tics: 6, attack: -1, frame: 4 },
    ],
    // Machine Gun
    [
      { tics: 6, attack: 0, frame: 1 },
      { tics: 6, attack: 1, frame: 2 },
      { tics: 6, attack: 3, frame: 3 },
      { tics: 6, attack: -1, frame: 4 },
    ],
    // Chain Gun
    [
      { tics: 6, attack: 0, frame: 1 },
      { tics: 6, attack: 1, frame: 2 },
      { tics: 6, attack: 4, frame: 3 },
      { tics: 6, attack: -1, frame: 4 },
    ],
  ];

// ============================================================
// Direction Tables
// ============================================================

/** Angle (in degrees) for each DirType value */
export const DIR_ANGLE: number[] = [0, 45, 90, 135, 180, 225, 270, 315, 0];

/** Maps a 3x3 grid offset to a DirType.
 *  Index = (dy+1)*3 + (dx+1)   where dx,dy in {-1,0,1}
 *  Row-major: NW N NE / W - E / SW S SE
 */
export const DIR_TABLE: DirType[] = [
  DirType.NorthWest,
  DirType.North,
  DirType.NorthEast,
  DirType.West,
  DirType.NoDir,
  DirType.East,
  DirType.SouthWest,
  DirType.South,
  DirType.SouthEast,
];

/** X movement delta for each DirType (East=+1, West=-1) */
export const DX: number[] = [1, 1, 0, -1, -1, -1, 0, 1, 0];

/** Y movement delta for each DirType (North=-1, South=+1 in tile space) */
export const DY: number[] = [0, -1, -1, -1, 0, 1, 1, 1, 0];
