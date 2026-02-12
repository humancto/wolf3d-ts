/**
 * Wolfenstein 3D TypeScript Port - Math Tables
 * Ported from WL_MAIN.C and WL_DRAW.C table-building routines.
 *
 * Call buildTables() once at startup before any game logic runs.
 */

import { ANGLES, FINEANGLES, GLOBAL1, TILEGLOBAL, VIEWWIDTH } from "./types";

// ============================================================
// Pre-computed lookup tables
// ============================================================

/**
 * Sine table: ANGLES + ANGLES/4 = 450 entries.
 * Fixed-point values (multiplied by GLOBAL1 = 65536).
 * The extra quarter-turn lets costable be a simple offset view.
 */
export const sintable: number[] = [];

/**
 * Cosine table: simply an offset into sintable at +90 degrees.
 * After buildTables(), costable[i] === sintable[i + 90].
 */
export const costable: number[] = [];

/**
 * Fine tangent table: FINEANGLES/4 = 900 entries for the first quadrant.
 * Fixed-point values (multiplied by GLOBAL1).
 * finetangent[i] = tan(i * 2PI / FINEANGLES) * GLOBAL1
 */
export const tantable: number[] = [];

/**
 * Per-column angle offset from the view center.
 * pixelangle[x] gives the fine-angle offset for screen column x.
 * VIEWWIDTH entries total.
 */
export const pixelangle: number[] = [];

// ============================================================
// Table building
// ============================================================

let _tablesBuilt = false;

/**
 * Build all lookup tables. Safe to call multiple times -- only runs once.
 */
export function buildTables(): void {
  if (_tablesBuilt) return;
  _tablesBuilt = true;

  // ---- sintable: ANGLES + ANGLES/4 entries ----
  // Index by degree (0-449), value = sin(deg) * GLOBAL1
  const sinLen = ANGLES + (ANGLES >> 2); // 450
  sintable.length = 0;
  for (let i = 0; i < sinLen; i++) {
    const rad = (i * Math.PI * 2) / ANGLES;
    sintable.push(Math.round(Math.sin(rad) * GLOBAL1));
  }

  // ---- costable: offset view into sintable at +90 ----
  // costable[i] = sintable[i + 90]
  costable.length = 0;
  for (let i = 0; i < ANGLES; i++) {
    costable.push(sintable[i + 90]);
  }

  // ---- tantable: fine tangent for first quadrant (900 entries) ----
  const tanLen = FINEANGLES >> 2; // 900
  tantable.length = 0;
  for (let i = 0; i < tanLen; i++) {
    const rad = (i * Math.PI * 2) / FINEANGLES;
    // Clamp extreme values to avoid Infinity
    const t = Math.tan(rad);
    if (!isFinite(t)) {
      tantable.push(t > 0 ? 0x7fffffff : -0x7fffffff);
    } else {
      tantable.push(Math.round(t * GLOBAL1));
    }
  }

  // ---- pixelangle: angle offset for each screen column ----
  // For each column x, compute the angle offset from the view center.
  // Wolf3D has ~74° horizontal FOV. Focal length in pixel-space:
  //   focal = (VIEWWIDTH/2) / tan(37°) ≈ 212
  // pixelangle values are in ANGLES (0-359 degrees) scale to match viewangle.
  pixelangle.length = 0;
  const halfWidth = VIEWWIDTH / 2;
  const focalPixels = halfWidth / Math.tan((37 * Math.PI) / 180); // ≈212
  for (let x = 0; x < VIEWWIDTH; x++) {
    const dx = halfWidth - x;
    const rad = Math.atan2(dx, focalPixels);
    const degAngle = Math.round((rad * ANGLES) / (Math.PI * 2));
    pixelangle.push(degAngle);
  }
}

// ============================================================
// Fixed-point arithmetic helpers
// ============================================================

/**
 * Fixed-point multiply: (a * b) >> 16
 * Both a and b are 16.16 fixed-point numbers.
 */
export function fixedMul(a: number, b: number): number {
  // Use intermediate double to avoid 32-bit overflow
  return Math.trunc((a * b) / TILEGLOBAL);
}

/**
 * Fixed-point divide: (a << 16) / b
 * Returns 16.16 fixed-point result.
 */
export function fixedDiv(a: number, b: number): number {
  if (b === 0) return a >= 0 ? 0x7fffffff : -0x7fffffff;
  return Math.trunc((a * TILEGLOBAL) / b);
}

/**
 * Fixed-point fractional multiply: (a * b) >> 16
 * Identical to fixedMul but named for clarity -- matches
 * the FixedByFrac macro in the original source.
 */
export function fixedByFrac(a: number, b: number): number {
  return Math.trunc((a * b) / TILEGLOBAL);
}

// ============================================================
// Angle utilities
// ============================================================

/**
 * Returns the shortest signed difference from angle `a` to angle `b`
 * in fine-angle units. Result is in [-FINEANGLES/2, FINEANGLES/2].
 */
export function angleDiff(a: number, b: number): number {
  let d = b - a;
  // Wrap into [-FINEANGLES/2, FINEANGLES/2]
  while (d > FINEANGLES / 2) d -= FINEANGLES;
  while (d < -FINEANGLES / 2) d += FINEANGLES;
  return d;
}

/**
 * Normalize an angle to the range [0, FINEANGLES-1].
 */
export function normalizeAngle(a: number): number {
  let v = a % FINEANGLES;
  if (v < 0) v += FINEANGLES;
  return v;
}
