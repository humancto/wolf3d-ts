/**
 * Wolfenstein 3D TypeScript Port - HUD (Status Bar) and Weapon Sprite Rendering
 *
 * Draws the bottom status bar (40px tall) and the weapon sprite into a
 * 320x200 pixel buffer (Uint32Array in ABGR format for ImageData).
 */

import {
  GameState,
  WeaponType,
  SCREENWIDTH,
  SCREENHEIGHT,
  VIEWWIDTH,
  VIEWHEIGHT,
  STATUSLINES,
} from "../core/types";

// ============================================================
// Color Constants (ABGR format for ImageData on little-endian)
// ============================================================

function rgba(r: number, g: number, b: number, a: number = 255): number {
  return (a << 24) | (b << 16) | (g << 8) | r;
}

const COL_HUD_BG = rgba(43, 43, 43); // dark gray background
const COL_HUD_BORDER = rgba(100, 100, 100); // lighter gray border
const COL_TEXT_WHITE = rgba(255, 255, 255);
const COL_TEXT_YELLOW = rgba(255, 255, 0);
const COL_TEXT_RED = rgba(255, 60, 60);
const COL_TEXT_GREEN = rgba(60, 255, 60);
const COL_TEXT_ORANGE = rgba(255, 160, 0);
const COL_KEY_GOLD = rgba(255, 215, 0);
const COL_KEY_SILVER = rgba(192, 192, 192);
const COL_FACE_SKIN = rgba(220, 180, 140);
const COL_FACE_EYE = rgba(40, 40, 40);
const COL_FACE_MOUTH = rgba(180, 60, 60);
const COL_FACE_HURT = rgba(200, 100, 100);
const COL_FACE_DEAD = rgba(140, 120, 100);
const COL_TRANSPARENT = 0;

// ============================================================
// Tiny Bitmap Font (4x6 pixels per glyph)
// ============================================================

/**
 * Each glyph is defined as 6 rows of 4-bit wide bitmaps.
 * Bit 3 = leftmost pixel, bit 0 = rightmost pixel.
 * Supports 0-9, A-Z, and a few symbols.
 */
const FONT_GLYPHS: Record<string, number[]> = {
  "0": [0b0110, 0b1001, 0b1011, 0b1101, 0b1001, 0b0110],
  "1": [0b0010, 0b0110, 0b0010, 0b0010, 0b0010, 0b0111],
  "2": [0b0110, 0b1001, 0b0001, 0b0110, 0b1000, 0b1111],
  "3": [0b0110, 0b1001, 0b0010, 0b0001, 0b1001, 0b0110],
  "4": [0b1010, 0b1010, 0b1010, 0b1111, 0b0010, 0b0010],
  "5": [0b1111, 0b1000, 0b1110, 0b0001, 0b1001, 0b0110],
  "6": [0b0110, 0b1000, 0b1110, 0b1001, 0b1001, 0b0110],
  "7": [0b1111, 0b0001, 0b0010, 0b0100, 0b0100, 0b0100],
  "8": [0b0110, 0b1001, 0b0110, 0b1001, 0b1001, 0b0110],
  "9": [0b0110, 0b1001, 0b0111, 0b0001, 0b0001, 0b0110],
  A: [0b0110, 0b1001, 0b1001, 0b1111, 0b1001, 0b1001],
  B: [0b1110, 0b1001, 0b1110, 0b1001, 0b1001, 0b1110],
  C: [0b0110, 0b1001, 0b1000, 0b1000, 0b1001, 0b0110],
  D: [0b1110, 0b1001, 0b1001, 0b1001, 0b1001, 0b1110],
  E: [0b1111, 0b1000, 0b1110, 0b1000, 0b1000, 0b1111],
  F: [0b1111, 0b1000, 0b1110, 0b1000, 0b1000, 0b1000],
  G: [0b0110, 0b1001, 0b1000, 0b1011, 0b1001, 0b0110],
  H: [0b1001, 0b1001, 0b1111, 0b1001, 0b1001, 0b1001],
  I: [0b0111, 0b0010, 0b0010, 0b0010, 0b0010, 0b0111],
  J: [0b0001, 0b0001, 0b0001, 0b0001, 0b1001, 0b0110],
  K: [0b1001, 0b1010, 0b1100, 0b1010, 0b1001, 0b1001],
  L: [0b1000, 0b1000, 0b1000, 0b1000, 0b1000, 0b1111],
  M: [0b1001, 0b1111, 0b1111, 0b1001, 0b1001, 0b1001],
  N: [0b1001, 0b1101, 0b1111, 0b1011, 0b1001, 0b1001],
  O: [0b0110, 0b1001, 0b1001, 0b1001, 0b1001, 0b0110],
  P: [0b1110, 0b1001, 0b1001, 0b1110, 0b1000, 0b1000],
  Q: [0b0110, 0b1001, 0b1001, 0b1001, 0b1011, 0b0111],
  R: [0b1110, 0b1001, 0b1001, 0b1110, 0b1010, 0b1001],
  S: [0b0111, 0b1000, 0b0110, 0b0001, 0b0001, 0b1110],
  T: [0b1111, 0b0010, 0b0010, 0b0010, 0b0010, 0b0010],
  U: [0b1001, 0b1001, 0b1001, 0b1001, 0b1001, 0b0110],
  V: [0b1001, 0b1001, 0b1001, 0b1001, 0b0110, 0b0110],
  W: [0b1001, 0b1001, 0b1001, 0b1111, 0b1111, 0b1001],
  X: [0b1001, 0b1001, 0b0110, 0b0110, 0b1001, 0b1001],
  Y: [0b1001, 0b1001, 0b0110, 0b0010, 0b0010, 0b0010],
  Z: [0b1111, 0b0001, 0b0010, 0b0100, 0b1000, 0b1111],
  "%": [0b1001, 0b0001, 0b0010, 0b0100, 0b1000, 0b1001],
  ":": [0b0000, 0b0010, 0b0000, 0b0000, 0b0010, 0b0000],
  "#": [0b0101, 0b1111, 0b0101, 0b1111, 0b0101, 0b0000],
  " ": [0b0000, 0b0000, 0b0000, 0b0000, 0b0000, 0b0000],
  ".": [0b0000, 0b0000, 0b0000, 0b0000, 0b0000, 0b0010],
  "-": [0b0000, 0b0000, 0b0000, 0b1111, 0b0000, 0b0000],
  "/": [0b0001, 0b0001, 0b0010, 0b0100, 0b1000, 0b1000],
  "!": [0b0010, 0b0010, 0b0010, 0b0010, 0b0000, 0b0010],
};

/**
 * Draw a single glyph at (px, py) into the pixel buffer.
 * Glyph is 4 pixels wide, 6 pixels tall.
 */
function drawGlyph(
  pixels: Uint32Array,
  ch: string,
  px: number,
  py: number,
  color: number,
  scale: number = 1,
): number {
  const glyph = FONT_GLYPHS[ch.toUpperCase()];
  if (!glyph) return px + 4 * scale + scale; // skip unknown chars

  for (let row = 0; row < 6; row++) {
    const bits = glyph[row];
    for (let col = 0; col < 4; col++) {
      if (bits & (8 >> col)) {
        // Draw a scale x scale block
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const dx = px + col * scale + sx;
            const dy = py + row * scale + sy;
            if (dx >= 0 && dx < SCREENWIDTH && dy >= 0 && dy < SCREENHEIGHT) {
              pixels[dy * SCREENWIDTH + dx] = color;
            }
          }
        }
      }
    }
  }
  return px + 4 * scale + scale; // return x position after glyph
}

/**
 * Draw a string at (px, py) with the given color and scale.
 */
function drawText(
  pixels: Uint32Array,
  text: string,
  px: number,
  py: number,
  color: number,
  scale: number = 1,
): void {
  let x = px;
  for (let i = 0; i < text.length; i++) {
    x = drawGlyph(pixels, text[i], x, py, color, scale);
  }
}

/**
 * Draw a filled rectangle.
 */
function fillRect(
  pixels: Uint32Array,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  for (let row = y; row < y + h; row++) {
    if (row < 0 || row >= SCREENHEIGHT) continue;
    for (let col = x; col < x + w; col++) {
      if (col < 0 || col >= SCREENWIDTH) continue;
      pixels[row * SCREENWIDTH + col] = color;
    }
  }
}

/**
 * Draw a horizontal line.
 */
function hline(
  pixels: Uint32Array,
  x: number,
  y: number,
  w: number,
  color: number,
): void {
  if (y < 0 || y >= SCREENHEIGHT) return;
  for (let col = x; col < x + w; col++) {
    if (col >= 0 && col < SCREENWIDTH) {
      pixels[y * SCREENWIDTH + col] = color;
    }
  }
}

// ============================================================
// Face Drawing (simple 16x16 pixel face)
// ============================================================

/**
 * Draw the BJ face at (fx, fy). faceframe: 0=happy, 1=hurt, 2=dead, 3=grin
 */
function drawFace(
  pixels: Uint32Array,
  fx: number,
  fy: number,
  faceframe: number,
  health: number,
): void {
  const size = 16;

  // Background (skin)
  let skinCol = COL_FACE_SKIN;
  if (faceframe === 1) skinCol = COL_FACE_HURT;
  if (faceframe === 2) skinCol = COL_FACE_DEAD;

  fillRect(pixels, fx, fy, size, size, skinCol);

  // Hair (top 3 rows)
  const hairColor = rgba(120, 80, 20);
  fillRect(pixels, fx + 2, fy, size - 4, 3, hairColor);

  if (faceframe === 2) {
    // Dead face: X eyes, flat mouth
    // Left X eye
    setPixel(pixels, fx + 4, fy + 5, COL_FACE_EYE);
    setPixel(pixels, fx + 6, fy + 5, COL_FACE_EYE);
    setPixel(pixels, fx + 5, fy + 6, COL_FACE_EYE);
    setPixel(pixels, fx + 4, fy + 7, COL_FACE_EYE);
    setPixel(pixels, fx + 6, fy + 7, COL_FACE_EYE);

    // Right X eye
    setPixel(pixels, fx + 9, fy + 5, COL_FACE_EYE);
    setPixel(pixels, fx + 11, fy + 5, COL_FACE_EYE);
    setPixel(pixels, fx + 10, fy + 6, COL_FACE_EYE);
    setPixel(pixels, fx + 9, fy + 7, COL_FACE_EYE);
    setPixel(pixels, fx + 11, fy + 7, COL_FACE_EYE);

    // Flat mouth
    hline(pixels, fx + 5, fy + 12, 6, COL_FACE_MOUTH);
  } else if (faceframe === 1) {
    // Hurt face: squinted eyes, open mouth
    hline(pixels, fx + 3, fy + 6, 4, COL_FACE_EYE);
    hline(pixels, fx + 9, fy + 6, 4, COL_FACE_EYE);

    // Open mouth (oval)
    fillRect(pixels, fx + 6, fy + 10, 4, 4, COL_FACE_MOUTH);
  } else {
    // Happy face (or grin): round eyes, smile
    // Adjust expression based on health
    const eyeY = health > 25 ? fy + 5 : fy + 6;

    // Left eye
    fillRect(pixels, fx + 4, eyeY, 2, 2, COL_FACE_EYE);
    // Right eye
    fillRect(pixels, fx + 10, eyeY, 2, 2, COL_FACE_EYE);

    // Smile / neutral mouth
    if (faceframe === 3 || health > 75) {
      // Big grin
      hline(pixels, fx + 5, fy + 11, 6, COL_FACE_MOUTH);
      setPixel(pixels, fx + 4, fy + 10, COL_FACE_MOUTH);
      setPixel(pixels, fx + 11, fy + 10, COL_FACE_MOUTH);
    } else if (health > 25) {
      // Neutral
      hline(pixels, fx + 5, fy + 11, 6, COL_FACE_MOUTH);
    } else {
      // Worried
      hline(pixels, fx + 5, fy + 12, 6, COL_FACE_MOUTH);
      setPixel(pixels, fx + 4, fy + 11, COL_FACE_MOUTH);
      setPixel(pixels, fx + 11, fy + 11, COL_FACE_MOUTH);
    }
  }

  // Border
  for (let i = 0; i < size; i++) {
    setPixel(pixels, fx + i, fy, COL_HUD_BORDER);
    setPixel(pixels, fx + i, fy + size - 1, COL_HUD_BORDER);
    setPixel(pixels, fx, fy + i, COL_HUD_BORDER);
    setPixel(pixels, fx + size - 1, fy + i, COL_HUD_BORDER);
  }
}

function setPixel(
  pixels: Uint32Array,
  x: number,
  y: number,
  color: number,
): void {
  if (x >= 0 && x < SCREENWIDTH && y >= 0 && y < SCREENHEIGHT) {
    pixels[y * SCREENWIDTH + x] = color;
  }
}

// ============================================================
// Weapon Sprite Drawing
// ============================================================

/**
 * Draw the weapon sprite in the lower-center of the 3D viewport (above the HUD bar).
 * weaponFrame: 0=idle, 1-4=firing sequence
 */
function drawWeaponSprite(
  pixels: Uint32Array,
  weapon: WeaponType,
  weaponFrame: number,
): void {
  // Weapon is drawn centered horizontally, anchored at bottom of the view area
  const centerX = VIEWWIDTH / 2;
  const baseY = VIEWHEIGHT - 2; // bottom of the 3D view, just above HUD

  // Firing animation: bob the weapon up
  const bobY = weaponFrame > 0 && weaponFrame < 4 ? -4 - weaponFrame * 2 : 0;

  switch (weapon) {
    case WeaponType.Knife:
      drawKnife(pixels, centerX, baseY + bobY, weaponFrame);
      break;
    case WeaponType.Pistol:
      drawPistol(pixels, centerX, baseY + bobY, weaponFrame);
      break;
    case WeaponType.MachineGun:
      drawMachineGun(pixels, centerX, baseY + bobY, weaponFrame);
      break;
    case WeaponType.ChainGun:
      drawChainGun(pixels, centerX, baseY + bobY, weaponFrame);
      break;
  }

  // Muzzle flash for firing frames
  if (weaponFrame === 2 && weapon !== WeaponType.Knife) {
    drawMuzzleFlash(pixels, centerX, baseY + bobY - 30);
  }
}

function drawKnife(
  pixels: Uint32Array,
  cx: number,
  by: number,
  frame: number,
): void {
  const bladeColor = rgba(200, 200, 210);
  const handleColor = rgba(120, 70, 30);
  const edgeColor = rgba(230, 230, 240);

  // Slash animation offset
  const slashX = frame === 2 ? 10 : frame === 3 ? -10 : 0;

  // Handle (bottom center)
  fillRect(pixels, cx - 3 + slashX, by - 12, 6, 12, handleColor);

  // Blade (extending upward)
  fillRect(pixels, cx - 2 + slashX, by - 30, 4, 20, bladeColor);

  // Edge highlight
  for (let i = 0; i < 18; i++) {
    setPixel(pixels, cx - 2 + slashX, by - 28 + i, edgeColor);
  }

  // Blade tip (triangle)
  fillRect(pixels, cx - 1 + slashX, by - 34, 2, 4, bladeColor);
  setPixel(pixels, cx + slashX, by - 36, bladeColor);
}

function drawPistol(
  pixels: Uint32Array,
  cx: number,
  by: number,
  frame: number,
): void {
  const metalColor = rgba(80, 80, 90);
  const darkMetal = rgba(50, 50, 60);
  const gripColor = rgba(100, 60, 30);

  // Grip
  fillRect(pixels, cx - 4, by - 14, 8, 14, gripColor);

  // Barrel
  fillRect(pixels, cx - 3, by - 28, 6, 16, metalColor);
  fillRect(pixels, cx - 2, by - 30, 4, 4, darkMetal);

  // Trigger guard
  setPixel(pixels, cx - 5, by - 8, metalColor);
  setPixel(pixels, cx - 5, by - 7, metalColor);
  setPixel(pixels, cx - 5, by - 6, metalColor);
  hline(pixels, cx - 5, by - 5, 4, metalColor);

  // Sight
  fillRect(pixels, cx - 1, by - 33, 2, 3, darkMetal);

  // Slide detail
  hline(pixels, cx - 3, by - 22, 6, darkMetal);
}

function drawMachineGun(
  pixels: Uint32Array,
  cx: number,
  by: number,
  frame: number,
): void {
  const metalColor = rgba(80, 80, 90);
  const darkMetal = rgba(50, 50, 60);
  const gripColor = rgba(100, 60, 30);
  const stockColor = rgba(80, 50, 20);

  // Stock (extends down-right)
  fillRect(pixels, cx + 3, by - 10, 12, 6, stockColor);
  fillRect(pixels, cx + 12, by - 8, 6, 8, stockColor);

  // Grip
  fillRect(pixels, cx - 4, by - 14, 8, 14, gripColor);

  // Body
  fillRect(pixels, cx - 5, by - 28, 10, 18, metalColor);

  // Barrel (longer than pistol)
  fillRect(pixels, cx - 2, by - 40, 4, 14, darkMetal);

  // Magazine
  fillRect(pixels, cx - 7, by - 22, 3, 10, darkMetal);

  // Sight
  fillRect(pixels, cx - 1, by - 43, 2, 3, metalColor);

  // Details
  hline(pixels, cx - 5, by - 25, 10, darkMetal);
  hline(pixels, cx - 5, by - 20, 10, darkMetal);
}

function drawChainGun(
  pixels: Uint32Array,
  cx: number,
  by: number,
  frame: number,
): void {
  const metalColor = rgba(80, 80, 90);
  const darkMetal = rgba(50, 50, 60);
  const gripColor = rgba(100, 60, 30);
  const barrelColor = rgba(70, 70, 80);

  // Grip
  fillRect(pixels, cx - 4, by - 14, 8, 14, gripColor);

  // Body (wider)
  fillRect(pixels, cx - 7, by - 30, 14, 20, metalColor);

  // Double barrels
  fillRect(pixels, cx - 4, by - 44, 3, 16, barrelColor);
  fillRect(pixels, cx + 1, by - 44, 3, 16, barrelColor);

  // Barrel tips
  fillRect(pixels, cx - 4, by - 46, 3, 2, darkMetal);
  fillRect(pixels, cx + 1, by - 46, 3, 2, darkMetal);

  // Handle/stock
  fillRect(pixels, cx + 5, by - 12, 10, 6, gripColor);

  // Ammo belt detail
  for (let i = 0; i < 5; i++) {
    fillRect(pixels, cx - 10, by - 24 + i * 3, 3, 2, rgba(160, 140, 40));
  }

  // Details
  hline(pixels, cx - 7, by - 25, 14, darkMetal);
  hline(pixels, cx - 7, by - 18, 14, darkMetal);
}

function drawMuzzleFlash(pixels: Uint32Array, cx: number, cy: number): void {
  const flashWhite = rgba(255, 255, 220);
  const flashYellow = rgba(255, 200, 50);
  const flashOrange = rgba(255, 130, 20);

  // Center bright spot
  fillRect(pixels, cx - 3, cy - 3, 6, 6, flashWhite);

  // Yellow ring
  for (let a = 0; a < 8; a++) {
    const angle = (a * Math.PI * 2) / 8;
    const dx = Math.round(Math.cos(angle) * 5);
    const dy = Math.round(Math.sin(angle) * 5);
    fillRect(pixels, cx + dx - 1, cy + dy - 1, 2, 2, flashYellow);
  }

  // Orange outer ring
  for (let a = 0; a < 12; a++) {
    const angle = (a * Math.PI * 2) / 12;
    const dx = Math.round(Math.cos(angle) * 8);
    const dy = Math.round(Math.sin(angle) * 8);
    setPixel(pixels, cx + dx, cy + dy, flashOrange);
  }
}

// ============================================================
// Health Bar
// ============================================================

function drawHealthBar(
  pixels: Uint32Array,
  x: number,
  y: number,
  w: number,
  h: number,
  health: number,
): void {
  // Background
  fillRect(pixels, x, y, w, h, rgba(40, 0, 0));

  // Fill amount
  const fillW = Math.max(0, Math.floor((health / 100) * (w - 2)));
  let barColor: number;
  if (health > 66) barColor = COL_TEXT_GREEN;
  else if (health > 33) barColor = COL_TEXT_ORANGE;
  else barColor = COL_TEXT_RED;

  fillRect(pixels, x + 1, y + 1, fillW, h - 2, barColor);

  // Border
  hline(pixels, x, y, w, COL_HUD_BORDER);
  hline(pixels, x, y + h - 1, w, COL_HUD_BORDER);
  for (let row = y; row < y + h; row++) {
    setPixel(pixels, x, row, COL_HUD_BORDER);
    setPixel(pixels, x + w - 1, row, COL_HUD_BORDER);
  }
}

// ============================================================
// Key Icons
// ============================================================

function drawKeyIcon(
  pixels: Uint32Array,
  x: number,
  y: number,
  color: number,
  hasKey: boolean,
): void {
  if (!hasKey) {
    // Draw dimmed outline
    fillRect(pixels, x, y, 8, 10, rgba(30, 30, 30));
    for (let i = 0; i < 8; i++) {
      setPixel(pixels, x + i, y, COL_HUD_BORDER);
      setPixel(pixels, x + i, y + 9, COL_HUD_BORDER);
    }
    for (let i = 0; i < 10; i++) {
      setPixel(pixels, x, y + i, COL_HUD_BORDER);
      setPixel(pixels, x + 7, y + i, COL_HUD_BORDER);
    }
    return;
  }

  // Key shape
  // Head (circle)
  fillRect(pixels, x + 1, y, 6, 4, color);
  fillRect(pixels, x + 2, y + 1, 4, 2, rgba(0, 0, 0)); // hole

  // Shaft
  fillRect(pixels, x + 3, y + 4, 2, 4, color);

  // Teeth
  fillRect(pixels, x + 5, y + 6, 2, 1, color);
  fillRect(pixels, x + 5, y + 8, 2, 1, color);
}

// ============================================================
// Main HUD Draw Function
// ============================================================

/**
 * Draw the full HUD into the pixel buffer.
 *
 * Layout (320 wide, rows 160-199):
 * [Floor ##] [Score: ######] [Lives: #] [FACE] [Health: ###%] [Ammo: ##] [Keys] [Weapon name]
 *
 * Also draws the weapon sprite in the 3D view area above the HUD.
 */
export function drawHUD(
  pixels: Uint32Array,
  gamestate: GameState,
  weaponFrame: number,
): void {
  const hudY = VIEWHEIGHT; // row 160
  const hudH = STATUSLINES; // 40 pixels tall

  // --- Fill HUD background ---
  fillRect(pixels, 0, hudY, SCREENWIDTH, hudH, COL_HUD_BG);

  // --- Top border line ---
  hline(pixels, 0, hudY, SCREENWIDTH, COL_HUD_BORDER);
  hline(pixels, 0, hudY + 1, SCREENWIDTH, COL_HUD_BORDER);

  // --- Layout sections (y-offset from hudY) ---
  const textY1 = hudY + 5; // first text row
  const textY2 = hudY + 15; // second text row
  const textY3 = hudY + 25; // third text row

  // ---- Section 1: Floor / Level ----
  drawText(pixels, "FLOOR", 4, textY1, COL_TEXT_YELLOW);
  drawText(pixels, String(gamestate.mapon + 1), 4, textY2, COL_TEXT_WHITE, 2);

  // ---- Section 2: Score ----
  drawText(pixels, "SCORE", 38, textY1, COL_TEXT_YELLOW);
  const scoreStr = String(gamestate.score).padStart(7, "0");
  drawText(pixels, scoreStr, 38, textY2, COL_TEXT_WHITE);

  // ---- Section 3: Lives ----
  drawText(pixels, "LIVES", 82, textY1, COL_TEXT_YELLOW);
  drawText(pixels, String(gamestate.lives), 82, textY2, COL_TEXT_WHITE, 2);

  // ---- Section 4: Face (centered) ----
  const faceX = 108;
  const faceY = hudY + 5;
  drawFace(pixels, faceX, faceY, gamestate.faceframe, gamestate.health);

  // ---- Section 5: Health ----
  drawText(pixels, "HEALTH", 130, textY1, COL_TEXT_YELLOW);

  // Health number
  const healthStr = String(Math.max(0, gamestate.health)) + "%";
  let healthColor = COL_TEXT_GREEN;
  if (gamestate.health <= 25) healthColor = COL_TEXT_RED;
  else if (gamestate.health <= 50) healthColor = COL_TEXT_ORANGE;
  drawText(pixels, healthStr, 130, textY2, healthColor, 2);

  // Health bar
  drawHealthBar(pixels, 130, textY3, 40, 6, gamestate.health);

  // ---- Section 6: Ammo ----
  drawText(pixels, "AMMO", 185, textY1, COL_TEXT_YELLOW);
  const ammoStr = String(gamestate.ammo);
  const ammoColor =
    gamestate.ammo === 0
      ? COL_TEXT_RED
      : gamestate.ammo < 10
        ? COL_TEXT_ORANGE
        : COL_TEXT_WHITE;
  drawText(pixels, ammoStr, 185, textY2, ammoColor, 2);

  // ---- Section 7: Keys ----
  drawText(pixels, "KEYS", 226, textY1, COL_TEXT_YELLOW);
  drawKeyIcon(pixels, 226, textY2, COL_KEY_GOLD, !!(gamestate.keys & 1));
  drawKeyIcon(pixels, 238, textY2, COL_KEY_SILVER, !!(gamestate.keys & 2));

  // ---- Section 8: Weapon name ----
  drawText(pixels, "ARMS", 260, textY1, COL_TEXT_YELLOW);
  const weaponNames = ["KNIFE", "PISTOL", "M.GUN", "CHAIN"];
  const wname = weaponNames[gamestate.weapon] || "KNIFE";
  drawText(pixels, wname, 260, textY2, COL_TEXT_WHITE);

  // Draw weapon slots (highlight owned weapons)
  for (let w = 0; w <= 3; w++) {
    const owned = w <= gamestate.bestweapon;
    const selected = w === gamestate.weapon;
    const slotX = 260 + w * 14;
    const slotY = textY3;
    const slotColor = selected
      ? COL_TEXT_YELLOW
      : owned
        ? COL_TEXT_WHITE
        : rgba(60, 60, 60);
    drawText(pixels, String(w + 1), slotX, slotY, slotColor);
  }

  // ---- Draw weapon sprite in the 3D view area ----
  drawWeaponSprite(pixels, gamestate.weapon, weaponFrame);
}

/**
 * Draw a simple title screen into the pixel buffer.
 */
export function drawTitleScreen(pixels: Uint32Array, seed: number): void {
  // Black background
  pixels.fill(rgba(0, 0, 0));

  // Title: "WOLFENSTEIN 3D" in large red text
  const titleY = 30;
  drawText(pixels, "WOLFENSTEIN", 60, titleY, rgba(200, 0, 0), 3);
  drawText(pixels, "3D", 130, titleY + 24, rgba(200, 0, 0), 3);

  // Subtitle
  drawText(pixels, "TYPESCRIPT EDITION", 75, 70, rgba(150, 150, 150), 1);

  // Controls
  const ctrlY = 90;
  const ctrlColor = rgba(180, 180, 180);
  drawText(pixels, "CONTROLS:", 20, ctrlY, COL_TEXT_YELLOW);
  drawText(pixels, "WASD - MOVE", 20, ctrlY + 12, ctrlColor);
  drawText(pixels, "MOUSE - LOOK", 20, ctrlY + 22, ctrlColor);
  drawText(pixels, "CLICK - SHOOT", 20, ctrlY + 32, ctrlColor);
  drawText(pixels, "SPACE/E - USE", 20, ctrlY + 42, ctrlColor);
  drawText(pixels, "SHIFT - RUN", 20, ctrlY + 52, ctrlColor);
  drawText(pixels, "1-4 - WEAPONS", 20, ctrlY + 62, ctrlColor);

  // Start prompt
  drawText(pixels, "CLICK TO START", 80, 170, COL_TEXT_YELLOW, 2);

  // Seed display
  drawText(pixels, "SEED: " + String(seed), 100, 190, rgba(80, 80, 80));
}

/**
 * Draw the death screen overlay.
 */
export function drawDeathScreen(
  pixels: Uint32Array,
  score: number,
  lives: number,
): void {
  // Red tint over the screen
  for (let i = 0; i < SCREENWIDTH * VIEWHEIGHT; i++) {
    const c = pixels[i];
    const r = Math.min(255, (c & 0xff) + 80);
    const g = Math.max(0, ((c >> 8) & 0xff) - 40);
    const b = Math.max(0, ((c >> 16) & 0xff) - 40);
    const a = (c >> 24) & 0xff;
    pixels[i] = (a << 24) | (b << 16) | (g << 8) | r;
  }

  // "YOU DIED" text
  drawText(pixels, "YOU DIED", 95, 60, rgba(255, 40, 40), 3);

  if (lives > 0) {
    drawText(
      pixels,
      "LIVES REMAINING: " + String(lives),
      70,
      100,
      COL_TEXT_WHITE,
    );
    drawText(pixels, "RESTARTING LEVEL...", 70, 115, rgba(180, 180, 180));
  } else {
    drawText(pixels, "GAME OVER", 100, 100, rgba(255, 60, 60), 2);
    drawText(pixels, "FINAL SCORE: " + String(score), 70, 125, COL_TEXT_WHITE);
    drawText(pixels, "CLICK TO RESTART", 80, 150, COL_TEXT_YELLOW);
  }
}

/**
 * Draw the level-complete screen.
 */
export function drawLevelCompleteScreen(
  pixels: Uint32Array,
  gamestate: GameState,
): void {
  pixels.fill(rgba(0, 0, 40));

  drawText(pixels, "FLOOR COMPLETED!", 60, 20, COL_TEXT_YELLOW, 2);

  const y0 = 55;
  const lineH = 14;
  drawText(
    pixels,
    "FLOOR: " + String(gamestate.mapon + 1),
    60,
    y0,
    COL_TEXT_WHITE,
  );

  // Kill ratio
  const killPct =
    gamestate.killtotal > 0
      ? Math.floor((gamestate.killcount / gamestate.killtotal) * 100)
      : 100;
  drawText(
    pixels,
    "KILL RATIO: " + String(killPct) + "%",
    60,
    y0 + lineH,
    killPct === 100 ? COL_TEXT_GREEN : COL_TEXT_WHITE,
  );

  // Secret ratio
  const secretPct =
    gamestate.secrettotal > 0
      ? Math.floor((gamestate.secretcount / gamestate.secrettotal) * 100)
      : 100;
  drawText(
    pixels,
    "SECRET RATIO: " + String(secretPct) + "%",
    60,
    y0 + lineH * 2,
    secretPct === 100 ? COL_TEXT_GREEN : COL_TEXT_WHITE,
  );

  // Treasure ratio
  const treasurePct =
    gamestate.treasuretotal > 0
      ? Math.floor((gamestate.treasurecount / gamestate.treasuretotal) * 100)
      : 100;
  drawText(
    pixels,
    "TREASURE: " + String(treasurePct) + "%",
    60,
    y0 + lineH * 3,
    treasurePct === 100 ? COL_TEXT_GREEN : COL_TEXT_WHITE,
  );

  // Score
  drawText(
    pixels,
    "SCORE: " + String(gamestate.score),
    60,
    y0 + lineH * 5,
    COL_TEXT_YELLOW,
  );

  drawText(pixels, "LOADING NEXT FLOOR...", 60, 160, rgba(150, 150, 150));
}

/**
 * Draw the victory screen.
 */
export function drawVictoryScreen(pixels: Uint32Array, score: number): void {
  pixels.fill(rgba(0, 0, 0));

  drawText(pixels, "CONGRATULATIONS!", 40, 30, COL_TEXT_YELLOW, 2);
  drawText(pixels, "YOU HAVE DEFEATED", 60, 60, COL_TEXT_WHITE);
  drawText(pixels, "THE NAZI MENACE!", 65, 75, COL_TEXT_WHITE);

  // Score
  drawText(pixels, "FINAL SCORE", 85, 110, COL_TEXT_YELLOW, 2);
  const scoreStr = String(score).padStart(7, "0");
  drawText(pixels, scoreStr, 105, 135, COL_TEXT_WHITE, 2);

  drawText(pixels, "CLICK TO PLAY AGAIN", 70, 175, COL_TEXT_YELLOW);
}
