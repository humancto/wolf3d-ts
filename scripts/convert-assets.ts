/**
 * Convert Wolf3D BMP assets to PNG for web use.
 *
 * Usage:  npx tsx scripts/convert-assets.ts
 *
 * Reads from /tmp/wolf3d-assets/ and writes to public/assets/
 */

import sharp from "sharp";
import { existsSync, mkdirSync, copyFileSync } from "fs";
import { join, resolve } from "path";

const SRC = "/tmp/wolf3d-assets";
const DST = resolve(import.meta.dirname!, "..", "public", "assets");

// ============================================================
// Wall textures: 8 carefully selected + 2 doors
// ============================================================

const WALL_MAP: Record<string, string> = {
  "greybrick1.bmp": "wall_0.png", // gray stone bricks
  "bluestone1.BMP": "wall_1.png", // blue stone bricks
  "wood1.BMP": "wall_2.png", // brown wood panels
  "stone1.BMP": "wall_3.png", // stone with banner
  "bluestone3.BMP": "wall_4.png", // blue stone variant
  "wood3.BMP": "wall_5.png", // wood with eagle
  "greybrick5.bmp": "wall_6.png", // gray concrete
  "brick1.BMP": "wall_7.png", // red brick
  "door1.BMP": "door_0.png", // standard door
  "elevator1.BMP": "door_1.png", // elevator door
};

// ============================================================
// Enemy sprites: front-facing (rotation 1) for all frames
// Naming: GARDA1.bmp = Guard, frame A, rotation 1
// Frames A-E: walking (8 rotations each), F+: action (rotation 0)
// ============================================================

interface EnemyDef {
  prefix: string;
  dir: string;
  frames: string[]; // frame letters
}

const ENEMIES: EnemyDef[] = [
  {
    prefix: "GARD",
    dir: "guard",
    frames: [
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
    ],
  },
  {
    prefix: "OFFI",
    dir: "officer",
    frames: [
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
    ],
  },
  {
    prefix: "NZSS",
    dir: "ss",
    frames: [
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
    ],
  },
  {
    prefix: "MTNT",
    dir: "mutant",
    frames: [
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
    ],
  },
];

// ============================================================
// Weapon PNGs: already RGBA, just copy and rename
// ============================================================

const WEAPON_MAP: Record<string, string> = {
  "KNIFA0.png": "knife_0.png",
  "KNIFB0.png": "knife_1.png",
  "KNIFC0.png": "knife_2.png",
  "KNIFD0.png": "knife_3.png",
  "KNIFE0.png": "knife_4.png",
  "PISGA0.png": "pistol_0.png",
  "PISGB0.png": "pistol_1.png",
  "PISGC0.png": "pistol_2.png",
  "PISGD0.png": "pistol_3.png",
  "PISGE0.png": "pistol_4.png",
  "MCHGA0.png": "machinegun_0.png",
  "MCHGB0.png": "machinegun_1.png",
  "MCHGC0.png": "machinegun_2.png",
  "MCHGD0.png": "machinegun_3.png",
  "MCHGE0.png": "machinegun_4.png",
  "CHGGA0.png": "chaingun_0.png",
  "CHGGB0.png": "chaingun_1.png",
  "CHGGC0.png": "chaingun_2.png",
  "CHGGD0.png": "chaingun_3.png",
  "CHGGE0.png": "chaingun_4.png",
};

// ============================================================
// Helpers
// ============================================================

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function convertBmpToPng(
  src: string,
  dst: string,
  removeBackground = false,
): Promise<boolean> {
  if (!existsSync(src)) {
    console.warn(`  SKIP (not found): ${src}`);
    return false;
  }

  try {
    if (removeBackground) {
      // Read raw pixels, find background color from top-left pixel, make transparent
      const { data, info } = await sharp(src)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const pixels = new Uint8Array(data);
      // Background color = pixel at (0,0)
      const bgR = pixels[0];
      const bgG = pixels[1];
      const bgB = pixels[2];

      // Set matching pixels to transparent
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          pixels[i] === bgR &&
          pixels[i + 1] === bgG &&
          pixels[i + 2] === bgB
        ) {
          pixels[i + 3] = 0; // alpha = 0
        }
      }

      await sharp(pixels, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .png()
        .toFile(dst);
    } else {
      await sharp(src).png().toFile(dst);
    }
    return true;
  } catch (err) {
    console.warn(`  ERROR converting ${src}: ${err}`);
    return false;
  }
}

// ============================================================
// Main
// ============================================================

async function main(): Promise<void> {
  console.log("=== Wolf3D Asset Converter ===\n");

  // --- Walls ---
  console.log("Converting wall textures...");
  const wallDir = join(DST, "walls");
  ensureDir(wallDir);
  let wallCount = 0;

  for (const [srcFile, dstFile] of Object.entries(WALL_MAP)) {
    const srcPath = join(SRC, "w3d_textures_fix", srcFile);
    const dstPath = join(wallDir, dstFile);
    if (await convertBmpToPng(srcPath, dstPath)) {
      wallCount++;
      console.log(`  ✓ ${srcFile} → ${dstFile}`);
    }
  }
  console.log(`  ${wallCount} wall textures converted.\n`);

  // --- Enemies ---
  console.log("Converting enemy sprites...");
  let enemyCount = 0;

  for (const enemy of ENEMIES) {
    const outDir = join(DST, "enemies", enemy.dir);
    ensureDir(outDir);

    for (const frame of enemy.frames) {
      // Walking frames (A-E) have 8 rotations, use rotation 1 (front-facing)
      // Action frames (F+) have rotation 0 (no rotations)
      const isWalking = frame <= "E";
      const rotation = isWalking ? "1" : "0";
      const srcFile = `${enemy.prefix}${frame}${rotation}.bmp`;
      const dstFile = `${frame.toLowerCase()}.png`;

      const srcPath = join(SRC, "w3d_enemies_fix", srcFile);
      const dstPath = join(outDir, dstFile);

      if (await convertBmpToPng(srcPath, dstPath, true)) {
        enemyCount++;
      }
    }
    console.log(
      `  ✓ ${enemy.prefix}: ${enemy.frames.length} frames → ${enemy.dir}/`,
    );
  }
  console.log(`  ${enemyCount} enemy sprites converted.\n`);

  // --- Weapons ---
  console.log("Copying weapon sprites...");
  const weaponDir = join(DST, "weapons");
  ensureDir(weaponDir);
  let weaponCount = 0;

  for (const [srcFile, dstFile] of Object.entries(WEAPON_MAP)) {
    const srcPath = join(SRC, "Jaguear_Weapons", "ECWolf", srcFile);
    const dstPath = join(weaponDir, dstFile);

    if (existsSync(srcPath)) {
      // Copy PNG directly (already RGBA)
      copyFileSync(srcPath, dstPath);
      weaponCount++;
      console.log(`  ✓ ${srcFile} → ${dstFile}`);
    } else {
      console.warn(`  SKIP (not found): ${srcPath}`);
    }
  }
  console.log(`  ${weaponCount} weapon sprites copied.\n`);

  console.log("=== Done! ===");
  console.log(
    `Total: ${wallCount} walls, ${enemyCount} enemies, ${weaponCount} weapons`,
  );
}

main().catch(console.error);
