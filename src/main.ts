/**
 * Wolfenstein 3D TypeScript Port - Main Entry Point
 *
 * Initializes the game, manages the screen state machine (title, game, death,
 * level-complete, victory), runs the main requestAnimationFrame loop, and
 * coordinates all subsystems: renderer, player, AI, doors, HUD.
 */

import { buildTables, sintable, costable } from "./core/math";
import {
  setSeed,
  getSeed,
  createGameState,
  SCREENWIDTH,
  SCREENHEIGHT,
  VIEWWIDTH,
  VIEWHEIGHT,
  STARTAMMO,
  WeaponType,
  ExitType,
  ActiveType,
  ClassType,
} from "./core/types";
import { Renderer, RenderState } from "./engine/renderer";
import { loadAllAssets } from "./engine/assetLoader";
import {
  createWorldState,
  setupLevel,
  moveDoors,
  movePushWall,
} from "./game/actors";
import type { WorldState } from "./game/actors";
import { updateActor } from "./game/ai";
import {
  createInputState,
  setupInput,
  pollControls,
  updatePlayer,
  updateAttack,
} from "./game/player";
import type { InputState } from "./game/player";
import {
  drawHUD,
  drawTitleScreen,
  drawDeathScreen,
  drawLevelCompleteScreen,
  drawVictoryScreen,
} from "./ui/hud";
import { generateMap, getMapCount } from "./core/maps";

// ============================================================
// Screen States
// ============================================================

enum Screen {
  Title,
  Game,
  Death,
  LevelComplete,
  Victory,
}

// ============================================================
// Module-level state
// ============================================================

let currentScreen: Screen = Screen.Title;
let world: WorldState;
let input: InputState;
let renderer: Renderer;
let lastTime = 0;
let tics = 0;
let gameSeed = 0;

// Death screen timer (in tics)
let deathTimer = 0;
// Level complete timer (in tics)
let levelCompleteTimer = 0;

// ============================================================
// Seed Handling (same approach as rogue-ts)
// ============================================================

function parseSeedFromHash(): number {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith("seed=")) {
    const parsed = parseInt(hash.slice(5), 10);
    return isNaN(parsed) ? Date.now() : parsed;
  }
  if (hash === "daily") return hashString(todayString());
  if (hash.startsWith("daily=")) return hashString(hash.slice(6));
  return Date.now();
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ============================================================
// Game Flow
// ============================================================

function startNewGame(difficulty: number = 1): void {
  gameSeed = parseSeedFromHash();
  setSeed(gameSeed);
  window.location.hash = `seed=${gameSeed}`;

  world = createWorldState();
  world.gamestate = createGameState();
  world.gamestate.difficulty = difficulty;
  world.gamestate.mapon = 0;

  loadLevel(0);
  currentScreen = Screen.Game;
}

function loadLevel(levelNum: number): void {
  const map = generateMap(levelNum, gameSeed + levelNum);
  setupLevel(world, map, world.gamestate.difficulty);
}

function nextLevel(): void {
  world.gamestate.mapon++;
  if (world.gamestate.mapon >= getMapCount()) {
    currentScreen = Screen.Victory;
    return;
  }
  loadLevel(world.gamestate.mapon);
  world.playstate = ExitType.StillPlaying;
}

// ============================================================
// Screen Update Functions
// ============================================================

function updateTitleScreen(): void {
  // Draw title screen into the renderer's pixel buffer
  const pixels = renderer.getScreenPixels();
  drawTitleScreen(pixels, gameSeed || parseSeedFromHash());

  // Check for any input to start
  if (input.keys.size > 0 || input.mouseButtons > 0) {
    input.keys.clear();
    input.mouseButtons = 0;
    startNewGame(1); // medium difficulty
  }
}

function updateGame(): void {
  // 1. Poll input
  pollControls(input);

  // 2. Update player
  updatePlayer(world, input, tics);

  // 3. Update weapon animation
  updateAttack(world, tics);

  // 4. Update enemies
  for (let i = 1; i <= world.lastobj; i++) {
    const actor = world.objlist[i];
    if (actor && actor.active !== ActiveType.No) {
      updateActor(world, actor, tics, world.player.angle);
    }
  }

  // 5. Update doors
  moveDoors(world, tics);

  // 6. Update pushwalls
  movePushWall(world, tics);

  // 7. Face frame reset timer (simplified: revert hurt face after a short delay)
  // Real Wolf3D uses a dedicated timer; here we just let it show for one frame.
  // The face frame is set to 1 (hurt) by takeDamage and reset here.
  if (world.gamestate.faceframe === 1 && world.gamestate.health > 0) {
    // Will revert on next frame -- gives a brief flash of the hurt face
    world.gamestate.faceframe = 0;
  }

  // 8. Check game state
  if (world.playstate === ExitType.Died) {
    currentScreen = Screen.Death;
    deathTimer = 180; // ~2.5 seconds at 70 tics/sec
    return;
  }
  if (
    world.playstate === ExitType.Completed ||
    world.playstate === ExitType.SecretLevel
  ) {
    currentScreen = Screen.LevelComplete;
    levelCompleteTimer = 200;
    return;
  }

  // 9. Render the 3D view
  const renderState: RenderState = {
    viewx: world.player.x,
    viewy: world.player.y,
    viewangle: world.player.angle,
    viewsin: sintable[world.player.angle] || 0,
    viewcos: costable[world.player.angle] || 0,
  };

  renderer.render(
    renderState,
    world.tilemap,
    world.doorobjlist,
    world.lastdoor,
    world.objlist,
    world.statobjlist,
    world.laststat,
    world.spotvis,
  );

  // 10. Draw HUD overlay into the renderer's pixel buffer
  const pixels = renderer.getScreenPixels();
  const weaponTex = renderer.getWeaponFrame(
    world.gamestate.weapon,
    world.gamestate.weaponframe,
  );
  drawHUD(pixels, world.gamestate, world.gamestate.weaponframe, weaponTex);
  renderer.present();
}

function updateDeathScreen(): void {
  deathTimer -= tics;

  // Draw death overlay on top of the last frame
  const pixels = renderer.getScreenPixels();
  drawDeathScreen(pixels, world.gamestate.score, world.gamestate.lives);

  if (deathTimer <= 0) {
    if (world.gamestate.lives > 0) {
      // Restart the level with one less life
      world.gamestate.lives--;
      world.gamestate.health = 100;
      world.gamestate.weapon = world.gamestate.bestweapon;
      world.gamestate.ammo = STARTAMMO;
      world.gamestate.keys = 0;
      world.gamestate.attackframe = 0;
      world.gamestate.weaponframe = 0;
      loadLevel(world.gamestate.mapon);
      currentScreen = Screen.Game;
    } else {
      // Game over -- wait for input to return to title
      if (input.keys.size > 0 || input.mouseButtons > 0) {
        input.keys.clear();
        input.mouseButtons = 0;
        currentScreen = Screen.Title;
      }
    }
  }
}

function updateLevelComplete(): void {
  levelCompleteTimer -= tics;

  const pixels = renderer.getScreenPixels();
  drawLevelCompleteScreen(pixels, world.gamestate);

  if (levelCompleteTimer <= 0) {
    nextLevel();
    if (currentScreen !== Screen.Victory) {
      currentScreen = Screen.Game;
    }
  }
}

function updateVictoryScreen(): void {
  const pixels = renderer.getScreenPixels();
  drawVictoryScreen(pixels, world.gamestate.score);

  if (input.keys.size > 0 || input.mouseButtons > 0) {
    input.keys.clear();
    input.mouseButtons = 0;
    currentScreen = Screen.Title;
  }
}

// ============================================================
// Main Game Loop
// ============================================================

function gameLoop(timestamp: number): void {
  // Calculate tics (target 70 tics/sec like Wolf3D, where 1 tic ~ 14.28ms)
  if (lastTime === 0) lastTime = timestamp;
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  // Clamp between 1 and 6 tics to prevent large jumps
  tics = Math.min(Math.max(1, Math.round(dt / 14.28)), 6);

  // Update the current screen state
  switch (currentScreen) {
    case Screen.Title:
      updateTitleScreen();
      break;
    case Screen.Game:
      updateGame();
      break;
    case Screen.Death:
      updateDeathScreen();
      break;
    case Screen.LevelComplete:
      updateLevelComplete();
      break;
    case Screen.Victory:
      updateVictoryScreen();
      break;
  }

  // For non-game screens, present the pixel buffer
  // (updateGame does its own present via Renderer)
  if (currentScreen !== Screen.Game) {
    renderer.present();
  }

  // Continue the loop
  requestAnimationFrame(gameLoop);
}

// ============================================================
// Initialization
// ============================================================

async function init(): Promise<void> {
  // Get the canvas element
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
  if (!canvas) {
    console.error("Canvas element #game-canvas not found");
    return;
  }

  // Set internal resolution
  canvas.width = SCREENWIDTH;
  canvas.height = SCREENHEIGHT;

  // Build math lookup tables (MUST be done before any game logic)
  buildTables();

  // Create the renderer (handles canvas sizing, texture generation)
  renderer = new Renderer(canvas);

  // Always generate procedural textures first (as fallback)
  renderer.generateTextures();

  // Try to load real assets, with progress bar
  const loadBar = document.getElementById("load-bar") as HTMLElement | null;
  try {
    const manifest = await loadAllAssets((loaded, total) => {
      if (loadBar) {
        loadBar.style.width = `${Math.floor((loaded / total) * 100)}%`;
      }
    });
    renderer.applyAssets(manifest);
    console.log("Real Wolf3D assets loaded successfully.");
  } catch (err) {
    console.warn("Failed to load assets, using procedural textures:", err);
  }

  // Create the input system
  input = createInputState();
  setupInput(canvas, input);

  // Handle window resize
  window.addEventListener("resize", () => {
    renderer.resize();
  });

  // Hide loading screen
  const loading = document.getElementById("loading");
  if (loading) loading.style.display = "none";

  // Initialize seed for title screen display
  gameSeed = parseSeedFromHash();

  // Show title screen
  currentScreen = Screen.Title;

  // Start the game loop
  lastTime = 0;
  requestAnimationFrame(gameLoop);

  console.log("Wolf3D-TS initialized. Click the canvas to start.");
}

// ============================================================
// Entry Point
// ============================================================

window.addEventListener("DOMContentLoaded", init);
