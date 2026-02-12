// ============================================================================
// renderer.ts - Wolfenstein 3D Raycasting Renderer
// Port of WL_DRAW.C raycasting logic to TypeScript
// ============================================================================

import {
  MAPSIZE,
  TILEGLOBAL,
  TILESHIFT,
  GLOBAL1,
  MINDIST,
  ANGLES,
  SCREENWIDTH,
  SCREENHEIGHT,
  VIEWWIDTH,
  VIEWHEIGHT,
  FL_VISABLE,
  ACTORSIZE,
  tileIndex,
} from "../core/types";
import type { Actor, StaticObj, DoorObj } from "../core/types";
import { sintable, costable, pixelangle } from "../core/math";

// ============================================================================
// Constants
// ============================================================================

const TEX_SIZE = 64; // wall texture size (64x64)
const SPRITE_SIZE = 64; // sprite texture height
const NUM_WALL_TEXTURES = 8; // procedural wall textures
const NUM_SPRITE_TEXTURES = 20; // procedural sprite textures

// Ceiling and floor colors packed as 0xAABBGGRR (little-endian ABGR for Uint32Array)
const CEILING_COLOR = 0xff383838; // dark gray
const FLOOR_COLOR = 0xff707070; // medium gray

// Door tile value range
const DOOR_TILE_MIN = 90;
const DOOR_TILE_MAX = 93;

// Maximum ray distance before we give up
const MAX_RAY_DISTANCE = 0x7fff0000;

// Angle constants in ANGLES (360-degree) scale for raycasting
const DEG90 = 90;
const DEG180 = 180;
const DEG270 = 270;

// Sprite texture indices
const SPR_GUARD = 0;
const SPR_DOG = 1;
const SPR_SS = 2;
const SPR_OFFICER = 3;
const SPR_BARREL = 4;
const SPR_TABLE = 5;
const SPR_FLOORLAMP = 6;
const SPR_CHANDELIER = 7;
const SPR_HEALTH = 8;
const SPR_AMMO = 9;
const SPR_KEY_GOLD = 10;
const SPR_KEY_SILVER = 11;
const SPR_CROSS = 12;
const SPR_CHALICE = 13;
const SPR_CHEST = 14;
const SPR_CROWN = 15;
const SPR_DEAD_GUARD = 16;
const SPR_WEAPON_KNIFE = 17;
const SPR_WEAPON_PISTOL = 18;
const SPR_WEAPON_MACHINEGUN = 19;

// ============================================================================
// RenderState - passed in each frame by the game logic
// ============================================================================

export interface RenderState {
  viewx: number; // player x in fixed-point
  viewy: number; // player y in fixed-point
  viewangle: number; // player angle (0-359 mapped to 0..ANGLES-1)
  viewsin: number; // precomputed sin
  viewcos: number; // precomputed cos
}

// ============================================================================
// Internal sprite sorting structure
// ============================================================================

interface VisSprite {
  screenX: number; // screen center column
  screenHeight: number; // projected height in pixels
  distance: number; // distance for sorting/clipping
  texIndex: number; // which sprite texture
  texWidth: number; // width of the sprite texture
  texHeight: number; // height of the sprite texture
}

// ============================================================================
// Renderer class
// ============================================================================

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private screenBuffer: ImageData;
  private screenPixels: Uint32Array;
  private wallTextures: Uint32Array[];
  private spriteTextures: Uint32Array[];
  private spriteWidths: number[];
  private spriteHeights: number[];
  private wallHeight: number[];
  private zbuffer: number[];

  // Reusable sprite list to avoid allocations each frame
  private visSpritePool: VisSprite[];
  private visSpriteCount: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      throw new Error("Failed to get 2D rendering context");
    }
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;

    // Create the 320x200 off-screen buffer
    this.screenBuffer = this.ctx.createImageData(SCREENWIDTH, SCREENHEIGHT);
    this.screenPixels = new Uint32Array(this.screenBuffer.data.buffer);

    // Per-column arrays
    this.wallHeight = new Array(VIEWWIDTH).fill(0);
    this.zbuffer = new Array(VIEWWIDTH).fill(0);

    // Texture storage
    this.wallTextures = [];
    this.spriteTextures = [];
    this.spriteWidths = [];
    this.spriteHeights = [];

    // Sprite pool
    this.visSpritePool = [];
    for (let i = 0; i < 256; i++) {
      this.visSpritePool.push({
        screenX: 0,
        screenHeight: 0,
        distance: 0,
        texIndex: 0,
        texWidth: 0,
        texHeight: 0,
      });
    }
    this.visSpriteCount = 0;

    this.resize();
  }

  // ==========================================================================
  // Resize handler - fit canvas maintaining 16:10 aspect ratio
  // ==========================================================================

  resize(): void {
    // Keep the canvas logical resolution fixed at 320x200.
    // Use CSS to scale it to fill the viewport while preserving aspect ratio.
    this.canvas.width = SCREENWIDTH;
    this.canvas.height = SCREENHEIGHT;

    const pw = window.innerWidth;
    const ph = window.innerHeight;
    const targetAspect = SCREENWIDTH / SCREENHEIGHT; // 320/200 = 1.6

    let w: number, h: number;
    if (pw / ph > targetAspect) {
      h = ph;
      w = Math.floor(h * targetAspect);
    } else {
      w = pw;
      h = Math.floor(w / targetAspect);
    }

    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.imageSmoothingEnabled = false;
  }

  // ==========================================================================
  // Procedural Texture Generation
  // ==========================================================================

  generateTextures(): void {
    this.wallTextures = [];
    for (let i = 0; i < NUM_WALL_TEXTURES; i++) {
      this.wallTextures.push(new Uint32Array(TEX_SIZE * TEX_SIZE));
    }

    this.generateGrayStoneBricks(0);
    this.generateBlueStoneBricks(1);
    this.generateBrownWoodPanels(2);
    this.generateGrayStoneWithBanner(3);
    this.generateBlueStoneWithCell(4);
    this.generateBrownWoodWithEagle(5);
    this.generateGrayConcrete(6);
    this.generateRedBrick(7);

    this.generateAllSprites();
  }

  // --------------------------------------------------------------------------
  // Helper: pack RGBA into Uint32 (ABGR byte order for little-endian)
  // --------------------------------------------------------------------------
  private static packColor(
    r: number,
    g: number,
    b: number,
    a: number = 255,
  ): number {
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  // --------------------------------------------------------------------------
  // Simple seeded pseudo-random for deterministic texture generation
  // --------------------------------------------------------------------------
  private static seedRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return (s >> 16) / 32768;
    };
  }

  // --------------------------------------------------------------------------
  // Texture 0: Gray stone bricks
  // --------------------------------------------------------------------------
  private generateGrayStoneBricks(idx: number): void {
    const tex = this.wallTextures[idx];
    const rand = Renderer.seedRandom(42);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        // Mortar lines
        const isMortarH = y % 16 === 0;
        const brickRow = Math.floor(y / 16);
        const offset = brickRow % 2 === 0 ? 0 : 32;
        const isMortarV = (x + offset) % 32 === 0;

        if (isMortarH || isMortarV) {
          const mv = 60 + Math.floor(rand() * 20);
          tex[y * TEX_SIZE + x] = Renderer.packColor(mv, mv, mv);
        } else {
          const base = 130 + Math.floor(rand() * 30) - 15;
          tex[y * TEX_SIZE + x] = Renderer.packColor(base, base, base);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Texture 1: Blue stone bricks
  // --------------------------------------------------------------------------
  private generateBlueStoneBricks(idx: number): void {
    const tex = this.wallTextures[idx];
    const rand = Renderer.seedRandom(101);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const isMortarH = y % 16 === 0;
        const brickRow = Math.floor(y / 16);
        const offset = brickRow % 2 === 0 ? 0 : 32;
        const isMortarV = (x + offset) % 32 === 0;

        if (isMortarH || isMortarV) {
          const mv = 40 + Math.floor(rand() * 20);
          tex[y * TEX_SIZE + x] = Renderer.packColor(mv, mv, mv + 10);
        } else {
          const noise = Math.floor(rand() * 20) - 10;
          const r = 60 + noise;
          const g = 70 + noise;
          const b = 140 + noise;
          tex[y * TEX_SIZE + x] = Renderer.packColor(r, g, b);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Texture 2: Brown wood panels
  // --------------------------------------------------------------------------
  private generateBrownWoodPanels(idx: number): void {
    const tex = this.wallTextures[idx];
    const rand = Renderer.seedRandom(200);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        // Vertical wood grain
        const grain = Math.sin(x * 0.5 + Math.sin(y * 0.1) * 3) * 15;
        const noise = Math.floor(rand() * 10) - 5;
        const base = 100 + Math.floor(grain) + noise;
        const r = Math.min(255, Math.max(0, base + 30));
        const g = Math.min(255, Math.max(0, base));
        const b = Math.min(255, Math.max(0, base - 30));

        // Panel border
        if (x === 0 || x === 63 || y === 0 || y === 63) {
          tex[y * TEX_SIZE + x] = Renderer.packColor(50, 30, 10);
        } else {
          tex[y * TEX_SIZE + x] = Renderer.packColor(r, g, b);
        }
      }
    }
    // Add a knot
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy <= 9) {
          const px = 32 + dx;
          const py = 40 + dy;
          if (px >= 0 && px < 64 && py >= 0 && py < 64) {
            tex[py * TEX_SIZE + px] = Renderer.packColor(70, 45, 15);
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Texture 3: Gray stone with banner/insignia
  // --------------------------------------------------------------------------
  private generateGrayStoneWithBanner(idx: number): void {
    const tex = this.wallTextures[idx];
    const rand = Renderer.seedRandom(303);
    // Base: gray stone
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const base = 120 + Math.floor(rand() * 25) - 12;
        tex[y * TEX_SIZE + x] = Renderer.packColor(base, base, base);
      }
    }
    // Red banner rectangle in center
    for (let y = 12; y < 52; y++) {
      for (let x = 18; x < 46; x++) {
        tex[y * TEX_SIZE + x] = Renderer.packColor(160, 20, 20);
      }
    }
    // White circle insignia
    const cx = 32,
      cy = 32,
      radius = 10;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const px = cx + dx;
          const py = cy + dy;
          tex[py * TEX_SIZE + px] = Renderer.packColor(220, 220, 220);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Texture 4: Blue stone with cell door
  // --------------------------------------------------------------------------
  private generateBlueStoneWithCell(idx: number): void {
    const tex = this.wallTextures[idx];
    const rand = Renderer.seedRandom(404);
    // Base: blue stone
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const noise = Math.floor(rand() * 15) - 7;
        tex[y * TEX_SIZE + x] = Renderer.packColor(
          55 + noise,
          65 + noise,
          130 + noise,
        );
      }
    }
    // Cell door bars
    for (let bx = 16; bx <= 48; bx += 8) {
      for (let y = 8; y < 56; y++) {
        tex[y * TEX_SIZE + bx] = Renderer.packColor(80, 80, 80);
        if (bx + 1 < 64) {
          tex[y * TEX_SIZE + bx + 1] = Renderer.packColor(60, 60, 60);
        }
      }
    }
    // Horizontal bar
    for (let x = 16; x <= 48; x++) {
      tex[8 * TEX_SIZE + x] = Renderer.packColor(80, 80, 80);
      tex[32 * TEX_SIZE + x] = Renderer.packColor(80, 80, 80);
    }
  }

  // --------------------------------------------------------------------------
  // Texture 5: Brown wood with eagle
  // --------------------------------------------------------------------------
  private generateBrownWoodWithEagle(idx: number): void {
    const tex = this.wallTextures[idx];
    const rand = Renderer.seedRandom(505);
    // Base: wood
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const grain = Math.sin(x * 0.4 + Math.sin(y * 0.08) * 2) * 12;
        const noise = Math.floor(rand() * 8) - 4;
        const base = 95 + Math.floor(grain) + noise;
        tex[y * TEX_SIZE + x] = Renderer.packColor(
          Math.min(255, Math.max(0, base + 25)),
          Math.min(255, Math.max(0, base - 5)),
          Math.min(255, Math.max(0, base - 35)),
        );
      }
    }
    // Simple eagle shape: a diamond/cross shape in gold
    const eagle = [
      [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
      [0, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0],
      [0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0],
    ];
    const ex = 25,
      ey = 24;
    for (let dy = 0; dy < eagle.length; dy++) {
      for (let dx = 0; dx < eagle[dy].length; dx++) {
        if (eagle[dy][dx]) {
          const px = ex + dx;
          const py = ey + dy;
          if (px >= 0 && px < 64 && py >= 0 && py < 64) {
            tex[py * TEX_SIZE + px] = Renderer.packColor(200, 170, 40);
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Texture 6: Gray concrete
  // --------------------------------------------------------------------------
  private generateGrayConcrete(idx: number): void {
    const tex = this.wallTextures[idx];
    const rand = Renderer.seedRandom(606);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const noise = Math.floor(rand() * 30) - 15;
        const base = 150 + noise;
        const v = Math.min(255, Math.max(0, base));
        tex[y * TEX_SIZE + x] = Renderer.packColor(v, v, v - 5);
      }
    }
    // Some cracks
    for (let i = 0; i < 3; i++) {
      let cx = Math.floor(rand() * 50) + 7;
      let cy = Math.floor(rand() * 50) + 7;
      for (let s = 0; s < 20; s++) {
        if (cx >= 0 && cx < 64 && cy >= 0 && cy < 64) {
          tex[cy * TEX_SIZE + cx] = Renderer.packColor(80, 80, 75);
        }
        cx += Math.floor(rand() * 3) - 1;
        cy += 1;
        if (cy >= 64) break;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Texture 7: Red brick
  // --------------------------------------------------------------------------
  private generateRedBrick(idx: number): void {
    const tex = this.wallTextures[idx];
    const rand = Renderer.seedRandom(707);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const isMortarH = y % 8 < 1;
        const brickRow = Math.floor(y / 8);
        const offset = brickRow % 2 === 0 ? 0 : 16;
        const isMortarV = (x + offset) % 32 < 1;

        if (isMortarH || isMortarV) {
          const mv = 170 + Math.floor(rand() * 20);
          tex[y * TEX_SIZE + x] = Renderer.packColor(mv, mv, mv - 10);
        } else {
          const noise = Math.floor(rand() * 20) - 10;
          const r = Math.min(255, Math.max(0, 160 + noise));
          const g = Math.min(255, Math.max(0, 50 + noise));
          const b = Math.min(255, Math.max(0, 40 + noise));
          tex[y * TEX_SIZE + x] = Renderer.packColor(r, g, b);
        }
      }
    }
  }

  // ==========================================================================
  // Procedural Sprite Generation
  // ==========================================================================

  private generateAllSprites(): void {
    this.spriteTextures = [];
    this.spriteWidths = [];
    this.spriteHeights = [];

    // Helper to add a sprite
    const addSprite = (
      w: number,
      h: number,
      generator: (tex: Uint32Array, w: number, h: number) => void,
    ): void => {
      const tex = new Uint32Array(w * h);
      generator(tex, w, h);
      this.spriteTextures.push(tex);
      this.spriteWidths.push(w);
      this.spriteHeights.push(h);
    };

    // 0: Guard (green uniform humanoid)
    addSprite(32, 64, (tex, w, h) =>
      this.generateHumanoid(tex, w, h, 60, 120, 60, 180, 140, 100),
    );
    // 1: Dog (brown quadruped)
    addSprite(48, 32, (tex, w, h) => this.generateDog(tex, w, h));
    // 2: SS (blue uniform humanoid)
    addSprite(32, 64, (tex, w, h) =>
      this.generateHumanoid(tex, w, h, 40, 60, 160, 180, 140, 100),
    );
    // 3: Officer (white uniform humanoid)
    addSprite(32, 64, (tex, w, h) =>
      this.generateHumanoid(tex, w, h, 200, 200, 200, 180, 140, 100),
    );
    // 4: Barrel
    addSprite(24, 32, (tex, w, h) => this.generateBarrel(tex, w, h));
    // 5: Table
    addSprite(32, 24, (tex, w, h) => this.generateTable(tex, w, h));
    // 6: Floor lamp
    addSprite(16, 48, (tex, w, h) => this.generateFloorLamp(tex, w, h));
    // 7: Chandelier
    addSprite(32, 32, (tex, w, h) => this.generateChandelier(tex, w, h));
    // 8: Health pickup (white cross on green)
    addSprite(16, 16, (tex, w, h) =>
      this.generatePickup(tex, w, h, 40, 180, 40, "cross"),
    );
    // 9: Ammo pickup (yellow rectangle)
    addSprite(16, 16, (tex, w, h) =>
      this.generatePickup(tex, w, h, 200, 200, 40, "rect"),
    );
    // 10: Key gold
    addSprite(16, 16, (tex, w, h) => this.generateKey(tex, w, h, 220, 180, 30));
    // 11: Key silver
    addSprite(16, 16, (tex, w, h) =>
      this.generateKey(tex, w, h, 180, 180, 190),
    );
    // 12: Cross treasure
    addSprite(16, 16, (tex, w, h) => this.generateTreasure(tex, w, h, "cross"));
    // 13: Chalice treasure
    addSprite(16, 16, (tex, w, h) =>
      this.generateTreasure(tex, w, h, "chalice"),
    );
    // 14: Chest treasure
    addSprite(16, 16, (tex, w, h) => this.generateTreasure(tex, w, h, "chest"));
    // 15: Crown treasure
    addSprite(16, 16, (tex, w, h) => this.generateTreasure(tex, w, h, "crown"));
    // 16: Dead guard
    addSprite(32, 16, (tex, w, h) => this.generateDeadGuard(tex, w, h));
    // 17: Weapon - Knife (player HUD weapon)
    addSprite(64, 64, (tex, w, h) => this.generateWeaponKnife(tex, w, h));
    // 18: Weapon - Pistol
    addSprite(64, 64, (tex, w, h) => this.generateWeaponPistol(tex, w, h));
    // 19: Weapon - Machine Gun
    addSprite(64, 64, (tex, w, h) => this.generateWeaponMachinegun(tex, w, h));
  }

  // Humanoid shape (guard, SS, officer)
  private generateHumanoid(
    tex: Uint32Array,
    w: number,
    h: number,
    bodyR: number,
    bodyG: number,
    bodyB: number,
    skinR: number,
    skinG: number,
    skinB: number,
  ): void {
    const body = Renderer.packColor(bodyR, bodyG, bodyB);
    const skin = Renderer.packColor(skinR, skinG, skinB);
    const dark = Renderer.packColor(
      Math.floor(bodyR * 0.6),
      Math.floor(bodyG * 0.6),
      Math.floor(bodyB * 0.6),
    );
    const boot = Renderer.packColor(40, 30, 20);
    const cx = w >> 1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        // Head (y: 2-14)
        if (y >= 2 && y < 14) {
          const headR = 6;
          if (dx * dx + (y - 8) * (y - 8) <= headR * headR) {
            tex[y * w + x] = skin;
            continue;
          }
        }
        // Torso (y: 14-38)
        if (y >= 14 && y < 38) {
          const halfW = 8 - Math.floor((y - 14) * 0.1);
          if (Math.abs(dx) <= halfW) {
            tex[y * w + x] = dx < 0 ? dark : body;
            continue;
          }
          // Arms
          if (y >= 16 && y < 32) {
            if (
              (dx >= halfW && dx <= halfW + 4) ||
              (dx <= -halfW && dx >= -halfW - 4)
            ) {
              tex[y * w + x] = body;
              continue;
            }
          }
        }
        // Legs (y: 38-56)
        if (y >= 38 && y < 56) {
          if ((dx >= -6 && dx <= -1) || (dx >= 1 && dx <= 6)) {
            tex[y * w + x] = dark;
            continue;
          }
        }
        // Boots (y: 56-63)
        if (y >= 56 && y < h) {
          if ((dx >= -7 && dx <= -1) || (dx >= 1 && dx <= 7)) {
            tex[y * w + x] = boot;
            continue;
          }
        }
        // Transparent
        tex[y * w + x] = 0;
      }
    }
  }

  // Dog shape
  private generateDog(tex: Uint32Array, w: number, h: number): void {
    const brown = Renderer.packColor(130, 85, 40);
    const darkBrown = Renderer.packColor(90, 55, 25);
    const eye = Renderer.packColor(255, 20, 20);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0; // transparent
        // Body ellipse
        const bx = (x - 24) / 14;
        const by = (y - 16) / 8;
        if (bx * bx + by * by <= 1) {
          tex[y * w + x] = brown;
        }
        // Head
        const hx = (x - 40) / 6;
        const hy = (y - 10) / 5;
        if (hx * hx + hy * hy <= 1) {
          tex[y * w + x] = darkBrown;
        }
        // Legs
        if (y >= 20 && y < 31) {
          if (
            (x >= 12 && x <= 15) ||
            (x >= 18 && x <= 21) ||
            (x >= 30 && x <= 33) ||
            (x >= 36 && x <= 39)
          ) {
            tex[y * w + x] = darkBrown;
          }
        }
        // Eyes
        if (x === 43 && y === 9) {
          tex[y * w + x] = eye;
        }
      }
    }
  }

  // Barrel
  private generateBarrel(tex: Uint32Array, w: number, h: number): void {
    const barrel = Renderer.packColor(140, 90, 30);
    const band = Renderer.packColor(80, 80, 80);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        const cx = w >> 1;
        const halfW = Math.floor(10 * Math.sin(((y + 1) / h) * Math.PI));
        if (Math.abs(x - cx) <= halfW && y >= 2 && y < h - 2) {
          if (y === 4 || y === h - 5 || y === h >> 1) {
            tex[y * w + x] = band;
          } else {
            tex[y * w + x] = barrel;
          }
        }
      }
    }
  }

  // Table
  private generateTable(tex: Uint32Array, w: number, h: number): void {
    const wood = Renderer.packColor(120, 80, 30);
    const dark = Renderer.packColor(80, 50, 20);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        // Tabletop
        if (y >= 4 && y < 10 && x >= 2 && x < w - 2) {
          tex[y * w + x] = wood;
        }
        // Legs
        if (y >= 10 && y < h - 1) {
          if ((x >= 4 && x <= 6) || (x >= w - 7 && x <= w - 5)) {
            tex[y * w + x] = dark;
          }
        }
      }
    }
  }

  // Floor lamp
  private generateFloorLamp(tex: Uint32Array, w: number, h: number): void {
    const pole = Renderer.packColor(160, 160, 80);
    const light = Renderer.packColor(255, 255, 180);
    const glow = Renderer.packColor(255, 255, 100);
    const cx = w >> 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        // Light bulb at top
        if (y < 10) {
          const dx = x - cx;
          const dy = y - 5;
          if (dx * dx + dy * dy <= 25) {
            tex[y * w + x] = dx * dx + dy * dy <= 9 ? glow : light;
          }
        }
        // Pole
        if (y >= 10 && y < h - 4 && Math.abs(x - cx) <= 1) {
          tex[y * w + x] = pole;
        }
        // Base
        if (y >= h - 4 && Math.abs(x - cx) <= 4) {
          tex[y * w + x] = pole;
        }
      }
    }
  }

  // Chandelier
  private generateChandelier(tex: Uint32Array, w: number, h: number): void {
    const chain = Renderer.packColor(140, 140, 60);
    const light = Renderer.packColor(255, 255, 180);
    const glow = Renderer.packColor(255, 255, 100);
    const cx = w >> 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        // Chain from top
        if (y < 10 && Math.abs(x - cx) <= 1) {
          tex[y * w + x] = chain;
        }
        // Cross bar
        if (y >= 10 && y < 13 && x >= 6 && x < w - 6) {
          tex[y * w + x] = chain;
        }
        // Lights hanging
        if (y >= 13 && y < 22) {
          for (const lx of [10, cx, w - 11]) {
            const dx = x - lx;
            const dy = y - 17;
            if (dx * dx + dy * dy <= 12) {
              tex[y * w + x] = dx * dx + dy * dy <= 4 ? glow : light;
            }
          }
        }
      }
    }
  }

  // Pickup items
  private generatePickup(
    tex: Uint32Array,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
    shape: string,
  ): void {
    const col = Renderer.packColor(r, g, b);
    const white = Renderer.packColor(255, 255, 255);
    const cx = w >> 1;
    const cy = h >> 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        if (shape === "cross") {
          // Green background circle
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= 49) {
            tex[y * w + x] = col;
          }
          // White cross
          if (
            (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 4) ||
            (Math.abs(y - cy) <= 1 && Math.abs(x - cx) <= 4)
          ) {
            if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= 49) {
              tex[y * w + x] = white;
            }
          }
        } else if (shape === "rect") {
          if (x >= 3 && x < w - 3 && y >= 4 && y < h - 4) {
            tex[y * w + x] = col;
          }
        }
      }
    }
  }

  // Key
  private generateKey(
    tex: Uint32Array,
    w: number,
    h: number,
    r: number,
    g: number,
    b: number,
  ): void {
    const col = Renderer.packColor(r, g, b);
    const dark = Renderer.packColor(
      Math.floor(r * 0.6),
      Math.floor(g * 0.6),
      Math.floor(b * 0.6),
    );
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        // Ring part (top)
        const dx = x - 8;
        const dy = y - 5;
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= 16 && dist2 >= 4) {
          tex[y * w + x] = col;
        }
        // Shaft
        if (y >= 8 && y < 14 && x >= 7 && x <= 9) {
          tex[y * w + x] = dark;
        }
        // Teeth
        if (y >= 12 && y < 14 && x >= 9 && x <= 12) {
          tex[y * w + x] = dark;
        }
      }
    }
  }

  // Treasure items
  private generateTreasure(
    tex: Uint32Array,
    w: number,
    h: number,
    shape: string,
  ): void {
    const gold = Renderer.packColor(220, 180, 30);
    const silver = Renderer.packColor(200, 200, 210);
    const gem = Renderer.packColor(200, 30, 30);
    const cx = w >> 1;
    const cy = h >> 1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        if (shape === "cross") {
          // Golden cross
          if (
            (Math.abs(x - cx) <= 2 && y >= 2 && y < 14) ||
            (Math.abs(y - 5) <= 2 && x >= 3 && x < 13)
          ) {
            tex[y * w + x] = gold;
          }
          // Gem in center
          if (Math.abs(x - cx) <= 1 && Math.abs(y - 5) <= 1) {
            tex[y * w + x] = gem;
          }
        } else if (shape === "chalice") {
          // Cup
          if (y >= 2 && y < 8) {
            const hw = 2 + Math.floor((y - 2) * 0.5);
            if (Math.abs(x - cx) <= hw) {
              tex[y * w + x] = gold;
            }
          }
          // Stem
          if (y >= 8 && y < 12 && Math.abs(x - cx) <= 1) {
            tex[y * w + x] = gold;
          }
          // Base
          if (y >= 12 && y < 14 && Math.abs(x - cx) <= 3) {
            tex[y * w + x] = gold;
          }
        } else if (shape === "chest") {
          // Chest rectangle
          if (x >= 2 && x < w - 2 && y >= 5 && y < 13) {
            if (y === 5 || y === 12 || x === 2 || x === w - 3) {
              tex[y * w + x] = Renderer.packColor(100, 60, 20);
            } else {
              tex[y * w + x] = Renderer.packColor(140, 90, 30);
            }
          }
          // Gold lock
          if (Math.abs(x - cx) <= 1 && y >= 7 && y < 10) {
            tex[y * w + x] = gold;
          }
        } else if (shape === "crown") {
          // Crown base
          if (y >= 8 && y < 13 && x >= 3 && x < w - 3) {
            tex[y * w + x] = gold;
          }
          // Crown points
          for (const px of [4, 8, 12]) {
            if (y >= 3 && y < 8 && Math.abs(x - px) <= 1) {
              tex[y * w + x] = gold;
            }
          }
          // Gems
          if (y === 10 && (x === 5 || x === 8 || x === 11)) {
            tex[y * w + x] = gem;
          }
        }
      }
    }
  }

  // Dead guard (lying down)
  private generateDeadGuard(tex: Uint32Array, w: number, h: number): void {
    const green = Renderer.packColor(50, 100, 50);
    const skin = Renderer.packColor(180, 140, 100);
    const red = Renderer.packColor(150, 20, 20);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        // Body (horizontal ellipse)
        const bx = (x - 16) / 12;
        const by = (y - 8) / 5;
        if (bx * bx + by * by <= 1) {
          tex[y * w + x] = green;
        }
        // Head
        const hx = (x - 3) / 3;
        const hy = (y - 7) / 3;
        if (hx * hx + hy * hy <= 1) {
          tex[y * w + x] = skin;
        }
        // Blood pool
        if (y >= 10 && y < 14) {
          const px = (x - 16) / 8;
          const py = (y - 12) / 2;
          if (px * px + py * py <= 1) {
            tex[y * w + x] = red;
          }
        }
      }
    }
  }

  // Weapon: Knife (hand-held view)
  private generateWeaponKnife(tex: Uint32Array, w: number, h: number): void {
    const blade = Renderer.packColor(200, 200, 210);
    const handle = Renderer.packColor(100, 60, 20);
    const skin = Renderer.packColor(200, 160, 120);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        // Blade (angled line from top-center going up-right)
        if (y >= 5 && y < 35) {
          const bx = 32 + Math.floor((35 - y) * 0.3);
          if (Math.abs(x - bx) <= 2) {
            tex[y * w + x] = blade;
          }
        }
        // Handle
        if (y >= 35 && y < 48 && x >= 28 && x <= 36) {
          tex[y * w + x] = handle;
        }
        // Hand
        if (y >= 45 && y < 60 && x >= 22 && x <= 42) {
          const dx = (x - 32) / 10;
          const dy = (y - 52) / 7;
          if (dx * dx + dy * dy <= 1) {
            tex[y * w + x] = skin;
          }
        }
      }
    }
  }

  // Weapon: Pistol
  private generateWeaponPistol(tex: Uint32Array, w: number, h: number): void {
    const metal = Renderer.packColor(60, 60, 70);
    const darkMetal = Renderer.packColor(40, 40, 50);
    const skin = Renderer.packColor(200, 160, 120);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        // Barrel
        if (y >= 15 && y < 22 && x >= 29 && x <= 35) {
          tex[y * w + x] = metal;
        }
        // Slide
        if (y >= 18 && y < 32 && x >= 27 && x <= 37) {
          tex[y * w + x] = darkMetal;
        }
        // Grip
        if (y >= 32 && y < 46) {
          const gx = 32 + Math.floor((y - 32) * 0.2);
          if (x >= gx - 4 && x <= gx + 4) {
            tex[y * w + x] = Renderer.packColor(80, 50, 20);
          }
        }
        // Hand
        if (y >= 42 && y < 58) {
          const dx = (x - 34) / 11;
          const dy = (y - 50) / 8;
          if (dx * dx + dy * dy <= 1) {
            tex[y * w + x] = skin;
          }
        }
      }
    }
  }

  // Weapon: Machine gun
  private generateWeaponMachinegun(
    tex: Uint32Array,
    w: number,
    h: number,
  ): void {
    const metal = Renderer.packColor(70, 70, 80);
    const darkMetal = Renderer.packColor(45, 45, 55);
    const skin = Renderer.packColor(200, 160, 120);
    const wood = Renderer.packColor(100, 65, 25);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        tex[y * w + x] = 0;
        // Long barrel
        if (y >= 10 && y < 18 && x >= 22 && x <= 42) {
          tex[y * w + x] = metal;
        }
        // Receiver
        if (y >= 16 && y < 30 && x >= 24 && x <= 40) {
          tex[y * w + x] = darkMetal;
        }
        // Magazine
        if (y >= 26 && y < 38 && x >= 28 && x <= 33) {
          tex[y * w + x] = metal;
        }
        // Stock
        if (y >= 22 && y < 28 && x >= 40 && x <= 52) {
          tex[y * w + x] = wood;
        }
        // Hand
        if (y >= 38 && y < 56) {
          const dx = (x - 32) / 12;
          const dy = (y - 48) / 8;
          if (dx * dx + dy * dy <= 1) {
            tex[y * w + x] = skin;
          }
        }
      }
    }
  }

  // ==========================================================================
  // Main Render Entry Point
  // ==========================================================================

  render(
    state: RenderState,
    tilemap: Uint8Array,
    doors: DoorObj[],
    doorCount: number,
    actors: Actor[],
    statics: StaticObj[],
    staticCount: number,
    spotvis: Uint8Array,
  ): void {
    // Clear screen buffer
    this.screenPixels.fill(0xff000000);

    // Cast all wall rays
    this.castRays(state, tilemap, doors);

    // Draw sprites on top
    this.drawSprites(state, actors, statics, staticCount, spotvis);

    // Present to canvas
    this.present();
  }

  // ==========================================================================
  // Raycasting Core - port of WL_DRAW.C AsmRefresh
  // ==========================================================================

  private castRays(
    state: RenderState,
    tilemap: Uint8Array,
    doors: DoorObj[],
  ): void {
    const { viewx, viewy, viewangle } = state;
    const halfView = VIEWHEIGHT >> 1;

    // Player tile
    const focaltx = viewx >> TILESHIFT;
    const focalty = viewy >> TILESHIFT;

    // Partial distances within the current tile
    const xpartialup = (focaltx << TILESHIFT) + TILEGLOBAL - viewx;
    const xpartialdown = viewx - (focaltx << TILESHIFT);
    const ypartialup = (focalty << TILESHIFT) + TILEGLOBAL - viewy;
    const ypartialdown = viewy - (focalty << TILESHIFT);

    for (let pixx = 0; pixx < VIEWWIDTH; pixx++) {
      // Calculate ray angle
      let angle = viewangle + pixelangle[pixx];
      if (angle < 0) angle += ANGLES;
      if (angle >= ANGLES) angle -= ANGLES;

      // Determine quadrant
      const quadrant = Math.floor(angle / DEG90);

      // ---- Set up horizontal (Y-step) and vertical (X-step) intercepts ----

      // xstep / ystep: how far in global coords we move per tile boundary crossed
      // We trace two independent DDA rays: one along horizontal grid lines and
      // one along vertical grid lines, then pick whichever hit is closer.

      let xintercept: number;
      let yintercept: number;
      let xstep: number;
      let ystep: number;
      let xtile: number;
      let ytile: number;
      let xtilestep: number;
      let ytilestep: number;

      // Horizontal intercept setup (ray crosses horizontal tile boundaries => stepping in Y)
      let horizXintercept: number;
      let horizYtile: number;
      let horizXstep: number;
      let horizYtilestep: number;

      // Vertical intercept setup (ray crosses vertical tile boundaries => stepping in X)
      let vertYintercept: number;
      let vertXtile: number;
      let vertYstep: number;
      let vertXtilestep: number;

      const angleRad = (angle / ANGLES) * 2 * Math.PI;
      const sinA = Math.sin(angleRad);
      const cosA = Math.cos(angleRad);

      // Avoid division by zero
      const safeSinA =
        Math.abs(sinA) < 0.0001 ? 0.0001 * Math.sign(sinA || 1) : sinA;
      const safeCosA =
        Math.abs(cosA) < 0.0001 ? 0.0001 * Math.sign(cosA || 1) : cosA;

      // ---- Horizontal intersection setup (crossing Y grid lines) ----
      // If ray goes up (sinA > 0 in our coord system where Y increases upward)
      // In Wolf3D, Y increases downward on the map, and angle 0 = east, 90 = north
      // We need to figure out direction:
      // angle 0 = east (+x), angle 90 = north (-y in screen / +y in math)
      // Wolf3D map: 0=east, 90=south (y increases down)
      // Let's use Wolf3D convention: angle 0 = east, 90 = south

      // For horizontal intersections (ray crossing horizontal grid lines = Y boundaries):
      if (angle < DEG180) {
        // Ray going south (Y increasing)
        horizYtile = focalty + 1;
        horizYtilestep = 1;
        const partialY = ypartialup;
        horizXintercept = viewx + Math.floor((partialY * cosA) / safeSinA);
        horizXstep = Math.floor((TILEGLOBAL * cosA) / safeSinA);
      } else {
        // Ray going north (Y decreasing)
        horizYtile = focalty - 1;
        horizYtilestep = -1;
        const partialY = ypartialdown;
        horizXintercept = viewx - Math.floor((partialY * cosA) / safeSinA);
        horizXstep = -Math.floor((TILEGLOBAL * cosA) / safeSinA);
      }

      // For vertical intersections (ray crossing vertical grid lines = X boundaries):
      if (angle < DEG90 || angle > DEG270) {
        // Ray going east (X increasing)
        vertXtile = focaltx + 1;
        vertXtilestep = 1;
        const partialX = xpartialup;
        vertYintercept = viewy + Math.floor((partialX * sinA) / safeCosA);
        vertYstep = Math.floor((TILEGLOBAL * sinA) / safeCosA);
      } else {
        // Ray going west (X decreasing)
        vertXtile = focaltx - 1;
        vertXtilestep = -1;
        const partialX = xpartialdown;
        vertYintercept = viewy - Math.floor((partialX * sinA) / safeCosA);
        vertYstep = -Math.floor((TILEGLOBAL * sinA) / safeCosA);
      }

      // ---- DDA loop ----
      // Step both rays independently and find which hits a wall first

      let hitHoriz = false;
      let hitVert = false;
      let horizDist = MAX_RAY_DISTANCE;
      let vertDist = MAX_RAY_DISTANCE;
      let horizHitX = 0;
      let horizHitY = 0;
      let vertHitX = 0;
      let vertHitY = 0;
      let horizWallTile = 0;
      let vertWallTile = 0;
      let horizDoorOffset = -1;
      let vertDoorOffset = -1;

      // Trace horizontal intersections (stepping through Y grid lines)
      {
        let hx = horizXintercept;
        let hy = horizYtile;
        for (let step = 0; step < 64; step++) {
          const tx = hx >> TILESHIFT;
          if (tx < 0 || tx >= MAPSIZE || hy < 0 || hy >= MAPSIZE) break;

          const mapVal = tilemap[hy * MAPSIZE + tx];
          if (mapVal > 0) {
            // Check if it's a door
            if (mapVal >= DOOR_TILE_MIN && mapVal <= DOOR_TILE_MAX) {
              // For doors, check if the ray passes through the half-tile
              const doorIdx = this.findDoor(doors, tx, hy);
              if (doorIdx >= 0) {
                const door = doors[doorIdx];
                // Door is at the midpoint of the tile
                const doorX = hx + (horizXstep >> 1);
                const doorTex = (doorX >> (TILESHIFT - 6)) & 63;
                const doorPos = Math.floor(door.position * 64);
                if (doorTex >= doorPos) {
                  horizDist = this.rayDistance(
                    viewx,
                    viewy,
                    doorX,
                    (hy << TILESHIFT) + (TILEGLOBAL >> 1),
                    cosA,
                    sinA,
                  );
                  horizHitX = doorX;
                  horizHitY = (hy << TILESHIFT) + (TILEGLOBAL >> 1);
                  horizWallTile = mapVal;
                  horizDoorOffset = doorPos;
                  hitHoriz = true;
                  break;
                }
              }
            } else {
              // Solid wall
              horizDist = this.rayDistance(
                viewx,
                viewy,
                hx,
                hy << TILESHIFT,
                cosA,
                sinA,
              );
              horizHitX = hx;
              horizHitY = hy << TILESHIFT;
              horizWallTile = mapVal;
              hitHoriz = true;
              break;
            }
          }
          hx += horizXstep;
          hy += horizYtilestep;
        }
      }

      // Trace vertical intersections (stepping through X grid lines)
      {
        let vx = vertXtile;
        let vy = vertYintercept;
        for (let step = 0; step < 64; step++) {
          const ty = vy >> TILESHIFT;
          if (vx < 0 || vx >= MAPSIZE || ty < 0 || ty >= MAPSIZE) break;

          const mapVal = tilemap[ty * MAPSIZE + vx];
          if (mapVal > 0) {
            if (mapVal >= DOOR_TILE_MIN && mapVal <= DOOR_TILE_MAX) {
              const doorIdx = this.findDoor(doors, vx, ty);
              if (doorIdx >= 0) {
                const door = doors[doorIdx];
                const doorY = vy + (vertYstep >> 1);
                const doorTex = (doorY >> (TILESHIFT - 6)) & 63;
                const doorPos = Math.floor(door.position * 64);
                if (doorTex >= doorPos) {
                  vertDist = this.rayDistance(
                    viewx,
                    viewy,
                    (vx << TILESHIFT) + (TILEGLOBAL >> 1),
                    doorY,
                    cosA,
                    sinA,
                  );
                  vertHitX = (vx << TILESHIFT) + (TILEGLOBAL >> 1);
                  vertHitY = doorY;
                  vertWallTile = mapVal;
                  vertDoorOffset = doorPos;
                  hitVert = true;
                  break;
                }
              }
            } else {
              vertDist = this.rayDistance(
                viewx,
                viewy,
                vx << TILESHIFT,
                vy,
                cosA,
                sinA,
              );
              vertHitX = vx << TILESHIFT;
              vertHitY = vy;
              vertWallTile = mapVal;
              hitVert = true;
              break;
            }
          }
          vx += vertXtilestep;
          vy += vertYstep;
        }
      }

      // Determine which hit was closer
      let distance: number;
      let wallTile: number;
      let texColumn: number;
      let isVertHit: boolean;

      if (hitHoriz && (!hitVert || horizDist <= vertDist)) {
        distance = horizDist;
        wallTile = horizWallTile;
        isVertHit = false;
        if (horizDoorOffset >= 0) {
          texColumn = ((horizHitX >> (TILESHIFT - 6)) & 63) - horizDoorOffset;
          if (texColumn < 0) texColumn += 64;
        } else {
          texColumn = (horizHitX >> (TILESHIFT - 6)) & 63;
        }
      } else if (hitVert) {
        distance = vertDist;
        wallTile = vertWallTile;
        isVertHit = true;
        if (vertDoorOffset >= 0) {
          texColumn = ((vertHitY >> (TILESHIFT - 6)) & 63) - vertDoorOffset;
          if (texColumn < 0) texColumn += 64;
        } else {
          texColumn = (vertHitY >> (TILESHIFT - 6)) & 63;
        }
      } else {
        // No hit - draw ceiling and floor only
        this.zbuffer[pixx] = MAX_RAY_DISTANCE;
        this.wallHeight[pixx] = 0;
        this.drawColumnFlat(pixx, halfView);
        continue;
      }

      // Perpendicular distance (fish-eye correction)
      // We need the distance along the view direction, not the actual ray distance
      const perpAngle = pixelangle[pixx];
      const perpAngleRad = (perpAngle / ANGLES) * 2 * Math.PI;
      const perpDist = Math.max(distance * Math.cos(perpAngleRad), MINDIST);

      // Store in z-buffer
      this.zbuffer[pixx] = perpDist;

      // Calculate projected wall height
      // Wall is TILEGLOBAL units tall; focal length in pixels ≈ 212.
      // projHeight = TILEGLOBAL * focalPixels / perpDist
      const focalPixels = VIEWWIDTH / 2 / Math.tan((37 * Math.PI) / 180);
      let projHeight = Math.floor((TILEGLOBAL * focalPixels) / perpDist);
      if (projHeight > VIEWHEIGHT * 4) projHeight = VIEWHEIGHT * 4;
      if (projHeight < 1) projHeight = 1;
      this.wallHeight[pixx] = projHeight;

      // Determine which texture to use
      let texIdx = 0;
      if (wallTile >= DOOR_TILE_MIN && wallTile <= DOOR_TILE_MAX) {
        texIdx = 2; // Use wood texture for doors
      } else {
        texIdx = (wallTile - 1) % NUM_WALL_TEXTURES;
        if (texIdx < 0) texIdx = 0;
      }

      // Draw the column
      this.drawWallColumn(
        pixx,
        projHeight,
        halfView,
        texIdx,
        texColumn,
        isVertHit,
      );
    }
  }

  // ==========================================================================
  // Ray distance calculation (Euclidean)
  // ==========================================================================

  private rayDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    _cosA: number,
    _sinA: number,
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ==========================================================================
  // Find door by tile coordinates
  // ==========================================================================

  private findDoor(doors: DoorObj[], tilex: number, tiley: number): number {
    for (let i = 0; i < doors.length; i++) {
      if (doors[i].tilex === tilex && doors[i].tiley === tiley) {
        return i;
      }
    }
    return -1;
  }

  // ==========================================================================
  // Draw a wall column with texturing
  // ==========================================================================

  private drawWallColumn(
    pixx: number,
    projHeight: number,
    halfView: number,
    texIdx: number,
    texColumn: number,
    isVertHit: boolean,
  ): void {
    const wallTop = halfView - (projHeight >> 1);
    const wallBottom = wallTop + projHeight;

    const screenTop = Math.max(0, wallTop);
    const screenBottom = Math.min(VIEWHEIGHT, wallBottom);

    const tex = this.wallTextures[texIdx];
    const tcx = texColumn & 63;

    // Draw ceiling (dark gray)
    for (let y = 0; y < screenTop; y++) {
      this.screenPixels[y * SCREENWIDTH + pixx] = CEILING_COLOR;
    }

    // Draw textured wall column
    if (tex) {
      const texStep = TEX_SIZE / projHeight;
      let texY = (screenTop - wallTop) * texStep;

      for (let y = screenTop; y < screenBottom; y++) {
        const ty = Math.floor(texY) & 63;
        let color = tex[ty * TEX_SIZE + tcx];

        // Darken vertical-hit walls for depth perception (Y-axis walls)
        if (isVertHit) {
          color = this.darkenColor(color);
        }

        this.screenPixels[y * SCREENWIDTH + pixx] = color;
        texY += texStep;
      }
    }

    // Draw floor (medium gray)
    for (let y = screenBottom; y < VIEWHEIGHT; y++) {
      this.screenPixels[y * SCREENWIDTH + pixx] = FLOOR_COLOR;
    }
  }

  // ==========================================================================
  // Draw a flat column (no wall hit) - ceiling + floor only
  // ==========================================================================

  private drawColumnFlat(pixx: number, halfView: number): void {
    for (let y = 0; y < halfView; y++) {
      this.screenPixels[y * SCREENWIDTH + pixx] = CEILING_COLOR;
    }
    for (let y = halfView; y < VIEWHEIGHT; y++) {
      this.screenPixels[y * SCREENWIDTH + pixx] = FLOOR_COLOR;
    }
  }

  // ==========================================================================
  // Darken a packed color (for wall side shading)
  // Multiplies RGB by ~0.75 while preserving alpha
  // ==========================================================================

  private darkenColor(color: number): number {
    // ABGR byte order
    const r = color & 0xff;
    const g = (color >> 8) & 0xff;
    const b = (color >> 16) & 0xff;
    const a = (color >> 24) & 0xff;
    // Multiply by 3/4 using bit shift: (x * 3) >> 2
    const dr = (r * 3) >> 2;
    const dg = (g * 3) >> 2;
    const db = (b * 3) >> 2;
    return ((a << 24) | (db << 16) | (dg << 8) | dr) >>> 0;
  }

  // ==========================================================================
  // Sprite Drawing
  // ==========================================================================

  private drawSprites(
    state: RenderState,
    actors: Actor[],
    statics: StaticObj[],
    staticCount: number,
    spotvis: Uint8Array,
  ): void {
    const { viewx, viewy, viewangle } = state;

    // Precompute view transform
    const viewAngleRad = (viewangle / ANGLES) * 2 * Math.PI;
    const viewSin = Math.sin(viewAngleRad);
    const viewCos = Math.cos(viewAngleRad);

    this.visSpriteCount = 0;

    // Collect visible actors
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      if (!(actor.flags & FL_VISABLE)) continue;

      // Check if actor is within the spotvis grid
      const tx = actor.x >> TILESHIFT;
      const ty = actor.y >> TILESHIFT;
      if (tx < 0 || tx >= MAPSIZE || ty < 0 || ty >= MAPSIZE) continue;
      if (!spotvis[ty * MAPSIZE + tx]) continue;

      const sprite = this.transformSprite(
        actor.x,
        actor.y,
        viewx,
        viewy,
        viewSin,
        viewCos,
        actor.state ? actor.state.shapenum : 0,
      );
      if (sprite) {
        if (this.visSpriteCount < this.visSpritePool.length) {
          const vs = this.visSpritePool[this.visSpriteCount];
          vs.screenX = sprite.screenX;
          vs.screenHeight = sprite.screenHeight;
          vs.distance = sprite.distance;
          vs.texIndex = sprite.texIndex;
          vs.texWidth = sprite.texWidth;
          vs.texHeight = sprite.texHeight;
          this.visSpriteCount++;
        }
      }
    }

    // Collect visible static objects
    for (let i = 0; i < staticCount; i++) {
      const stat = statics[i];
      if (!(stat.flags & FL_VISABLE)) continue;

      const tx = stat.tilex;
      const ty = stat.tiley;
      if (tx < 0 || tx >= MAPSIZE || ty < 0 || ty >= MAPSIZE) continue;
      if (!spotvis[ty * MAPSIZE + tx]) continue;

      // Static objects are positioned at tile center
      const sx = (tx << TILESHIFT) + (TILEGLOBAL >> 1);
      const sy = (ty << TILESHIFT) + (TILEGLOBAL >> 1);

      const sprite = this.transformSprite(
        sx,
        sy,
        viewx,
        viewy,
        viewSin,
        viewCos,
        stat.shapenum,
      );
      if (sprite) {
        if (this.visSpriteCount < this.visSpritePool.length) {
          const vs = this.visSpritePool[this.visSpriteCount];
          vs.screenX = sprite.screenX;
          vs.screenHeight = sprite.screenHeight;
          vs.distance = sprite.distance;
          vs.texIndex = sprite.texIndex;
          vs.texWidth = sprite.texWidth;
          vs.texHeight = sprite.texHeight;
          this.visSpriteCount++;
        }
      }
    }

    // Sort by distance (farthest first for painter's algorithm)
    const sprites = this.visSpritePool;
    const count = this.visSpriteCount;

    // Simple insertion sort (fast for small N)
    for (let i = 1; i < count; i++) {
      const key = sprites[i];
      const keyDist = key.distance;
      let j = i - 1;
      while (j >= 0 && sprites[j].distance < keyDist) {
        // Swap
        const tmp = sprites[j + 1];
        sprites[j + 1] = sprites[j];
        sprites[j] = tmp;
        j--;
      }
    }

    // Draw each sprite
    for (let i = 0; i < count; i++) {
      this.drawSingleSprite(sprites[i]);
    }
  }

  // ==========================================================================
  // Transform a world-space sprite to screen-space
  // ==========================================================================

  private transformSprite(
    objx: number,
    objy: number,
    viewx: number,
    viewy: number,
    viewSin: number,
    viewCos: number,
    spriteIdx: number,
  ): {
    screenX: number;
    screenHeight: number;
    distance: number;
    texIndex: number;
    texWidth: number;
    texHeight: number;
  } | null {
    // Translate relative to viewer
    const dx = objx - viewx;
    const dy = objy - viewy;

    // Rotate into view space (viewSin/viewCos are fixed-point * GLOBAL1)
    // tz = forward distance, tx = lateral position
    const tz = (dx * viewCos + dy * viewSin) / GLOBAL1;
    const tx = (-dx * viewSin + dy * viewCos) / GLOBAL1;

    // Behind the viewer
    if (tz < MINDIST) return null;

    // Project to screen using pixel-space focal length
    const focalPixels = VIEWWIDTH / 2 / Math.tan((37 * Math.PI) / 180);
    const screenX = Math.floor(VIEWWIDTH / 2 + (tx * focalPixels) / tz);
    const screenHeight = Math.floor((TILEGLOBAL * focalPixels * 0.8) / tz);

    // Off-screen check
    const halfW = screenHeight >> 1;
    if (screenX + halfW < 0 || screenX - halfW >= VIEWWIDTH) return null;

    // Clamp sprite index
    const texIndex = Math.min(
      Math.max(spriteIdx, 0),
      this.spriteTextures.length - 1,
    );
    const texWidth = this.spriteWidths[texIndex] || 64;
    const texHeight = this.spriteHeights[texIndex] || 64;

    return {
      screenX,
      screenHeight,
      distance: tz,
      texIndex,
      texWidth,
      texHeight,
    };
  }

  // ==========================================================================
  // Draw a single sprite to the screen buffer
  // ==========================================================================

  private drawSingleSprite(sprite: VisSprite): void {
    const { screenX, screenHeight, distance, texIndex, texWidth, texHeight } =
      sprite;

    if (texIndex < 0 || texIndex >= this.spriteTextures.length) return;
    const tex = this.spriteTextures[texIndex];
    if (!tex) return;

    const halfView = VIEWHEIGHT >> 1;

    // The sprite's aspect ratio determines its screen width
    const screenWidth = Math.floor(screenHeight * (texWidth / texHeight));

    const startX = screenX - (screenWidth >> 1);
    const endX = startX + screenWidth;
    const startY = halfView - (screenHeight >> 1);
    const endY = startY + screenHeight;

    const texStepX = texWidth / screenWidth;
    const texStepY = texHeight / screenHeight;

    for (let sx = Math.max(0, startX); sx < Math.min(VIEWWIDTH, endX); sx++) {
      // Z-buffer clipping: skip this column if a wall is in front
      if (distance > this.zbuffer[sx]) continue;

      const texX = Math.floor((sx - startX) * texStepX);
      if (texX < 0 || texX >= texWidth) continue;

      for (
        let sy = Math.max(0, startY);
        sy < Math.min(VIEWHEIGHT, endY);
        sy++
      ) {
        const texY = Math.floor((sy - startY) * texStepY);
        if (texY < 0 || texY >= texHeight) continue;

        const pixel = tex[texY * texWidth + texX];

        // Skip transparent pixels (alpha = 0)
        if (pixel >>> 24 === 0) continue;

        this.screenPixels[sy * SCREENWIDTH + sx] = pixel;
      }
    }
  }

  // ==========================================================================
  // Present - scale the 320x200 buffer to the canvas
  // ==========================================================================

  present(): void {
    // Canvas is 320x200 (same as our buffer), so just putImageData directly.
    // CSS scaling handles display sizing with image-rendering: pixelated.
    this.ctx.putImageData(this.screenBuffer, 0, 0);
  }

  // ==========================================================================
  // Draw a player weapon sprite overlaid on the view
  // ==========================================================================

  drawWeapon(weaponSpriteIndex: number): void {
    if (
      weaponSpriteIndex < 0 ||
      weaponSpriteIndex >= this.spriteTextures.length
    )
      return;
    const tex = this.spriteTextures[weaponSpriteIndex];
    const tw = this.spriteWidths[weaponSpriteIndex];
    const th = this.spriteHeights[weaponSpriteIndex];

    // Weapon is drawn at the bottom center of the view
    const scale = 3;
    const sw = tw * scale;
    const sh = th * scale;
    const startX = (VIEWWIDTH - sw) >> 1;
    const startY = VIEWHEIGHT - sh;

    for (let sy = Math.max(0, startY); sy < VIEWHEIGHT; sy++) {
      const texY = Math.floor((sy - startY) / scale);
      if (texY < 0 || texY >= th) continue;
      for (
        let sx = Math.max(0, startX);
        sx < Math.min(VIEWWIDTH, startX + sw);
        sx++
      ) {
        const texX = Math.floor((sx - startX) / scale);
        if (texX < 0 || texX >= tw) continue;
        const pixel = tex[texY * tw + texX];
        if (pixel >>> 24 === 0) continue;
        this.screenPixels[sy * SCREENWIDTH + sx] = pixel;
      }
    }
  }

  // ==========================================================================
  // Draw a solid-color bar for the status area (bottom of screen)
  // ==========================================================================

  drawStatusBar(): void {
    const statusColor = Renderer.packColor(80, 80, 80);
    const startY = VIEWHEIGHT;
    for (let y = startY; y < SCREENHEIGHT; y++) {
      for (let x = 0; x < SCREENWIDTH; x++) {
        this.screenPixels[y * SCREENWIDTH + x] = statusColor;
      }
    }
  }

  // ==========================================================================
  // Draw text onto the screen buffer (simple 5x7 bitmap font)
  // ==========================================================================

  drawText(
    x: number,
    y: number,
    text: string,
    color: number = 0xffffffff,
  ): void {
    // Minimal 3x5 pixel font for digits and some letters
    const glyphs: Record<string, number[]> = {
      "0": [0b111, 0b101, 0b101, 0b101, 0b111],
      "1": [0b010, 0b110, 0b010, 0b010, 0b111],
      "2": [0b111, 0b001, 0b111, 0b100, 0b111],
      "3": [0b111, 0b001, 0b111, 0b001, 0b111],
      "4": [0b101, 0b101, 0b111, 0b001, 0b001],
      "5": [0b111, 0b100, 0b111, 0b001, 0b111],
      "6": [0b111, 0b100, 0b111, 0b101, 0b111],
      "7": [0b111, 0b001, 0b010, 0b010, 0b010],
      "8": [0b111, 0b101, 0b111, 0b101, 0b111],
      "9": [0b111, 0b101, 0b111, 0b001, 0b111],
      "%": [0b101, 0b001, 0b010, 0b100, 0b101],
      ":": [0b000, 0b010, 0b000, 0b010, 0b000],
      " ": [0b000, 0b000, 0b000, 0b000, 0b000],
      "-": [0b000, 0b000, 0b111, 0b000, 0b000],
      "/": [0b001, 0b001, 0b010, 0b100, 0b100],
    };
    // Add A-Z
    const letters: string[] = [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
    ];
    const letterGlyphs: number[][] = [
      [0b010, 0b101, 0b111, 0b101, 0b101], // A
      [0b110, 0b101, 0b110, 0b101, 0b110], // B
      [0b011, 0b100, 0b100, 0b100, 0b011], // C
      [0b110, 0b101, 0b101, 0b101, 0b110], // D
      [0b111, 0b100, 0b110, 0b100, 0b111], // E
      [0b111, 0b100, 0b110, 0b100, 0b100], // F
      [0b011, 0b100, 0b101, 0b101, 0b011], // G
      [0b101, 0b101, 0b111, 0b101, 0b101], // H
      [0b111, 0b010, 0b010, 0b010, 0b111], // I
      [0b001, 0b001, 0b001, 0b101, 0b010], // J
      [0b101, 0b110, 0b100, 0b110, 0b101], // K
      [0b100, 0b100, 0b100, 0b100, 0b111], // L
      [0b101, 0b111, 0b111, 0b101, 0b101], // M
      [0b101, 0b111, 0b111, 0b111, 0b101], // N
      [0b010, 0b101, 0b101, 0b101, 0b010], // O
      [0b110, 0b101, 0b110, 0b100, 0b100], // P
      [0b010, 0b101, 0b101, 0b110, 0b011], // Q
      [0b110, 0b101, 0b110, 0b101, 0b101], // R
      [0b011, 0b100, 0b010, 0b001, 0b110], // S
      [0b111, 0b010, 0b010, 0b010, 0b010], // T
      [0b101, 0b101, 0b101, 0b101, 0b010], // U
      [0b101, 0b101, 0b101, 0b010, 0b010], // V
      [0b101, 0b101, 0b111, 0b111, 0b101], // W
      [0b101, 0b101, 0b010, 0b101, 0b101], // X
      [0b101, 0b101, 0b010, 0b010, 0b010], // Y
      [0b111, 0b001, 0b010, 0b100, 0b111], // Z
    ];
    for (let i = 0; i < letters.length; i++) {
      glyphs[letters[i]] = letterGlyphs[i];
    }

    let cx = x;
    for (const ch of text.toUpperCase()) {
      const glyph = glyphs[ch];
      if (glyph) {
        for (let gy = 0; gy < 5; gy++) {
          for (let gx = 0; gx < 3; gx++) {
            if (glyph[gy] & (0b100 >> gx)) {
              const px = cx + gx;
              const py = y + gy;
              if (px >= 0 && px < SCREENWIDTH && py >= 0 && py < SCREENHEIGHT) {
                this.screenPixels[py * SCREENWIDTH + px] = color;
              }
            }
          }
        }
      }
      cx += 4;
    }
  }

  // ==========================================================================
  // Accessor for wall height data (used by game logic)
  // ==========================================================================

  getWallHeight(): number[] {
    return this.wallHeight;
  }

  getZBuffer(): number[] {
    return this.zbuffer;
  }

  getScreenPixels(): Uint32Array {
    return this.screenPixels;
  }

  getScreenBuffer(): ImageData {
    return this.screenBuffer;
  }

  // ==========================================================================
  // Get sprite texture info for external use (e.g., weapon rendering)
  // ==========================================================================

  getSpriteTexture(
    index: number,
  ): { data: Uint32Array; width: number; height: number } | null {
    if (index < 0 || index >= this.spriteTextures.length) return null;
    return {
      data: this.spriteTextures[index],
      width: this.spriteWidths[index],
      height: this.spriteHeights[index],
    };
  }

  getWallTexture(index: number): Uint32Array | null {
    if (index < 0 || index >= this.wallTextures.length) return null;
    return this.wallTextures[index];
  }

  // ==========================================================================
  // Fill screen with a solid color (for fade effects etc.)
  // ==========================================================================

  fillScreen(color: number): void {
    this.screenPixels.fill(color);
  }

  // ==========================================================================
  // Draw a filled rectangle on the screen buffer
  // ==========================================================================

  fillRect(x: number, y: number, w: number, h: number, color: number): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(SCREENWIDTH, x + w);
    const y1 = Math.min(SCREENHEIGHT, y + h);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.screenPixels[py * SCREENWIDTH + px] = color;
      }
    }
  }
}
