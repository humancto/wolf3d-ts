/**
 * Wolfenstein 3D TypeScript Port - Player Controls, Input System, Weapons
 * Ported from WL_AGENT.C
 *
 * Handles: input capture, player movement, collision detection, weapon fire,
 * item pickup, damage, and all player interaction with the world.
 */

import {
  ClassType,
  WeaponType,
  DirType,
  ExitType,
  ButtonType,
  StaticItemType,
  DoorAction,
  DoorLock,
  MAPSIZE,
  TILEGLOBAL,
  TILESHIFT,
  MINDIST,
  ANGLES,
  MOVESCALE,
  BACKMOVESCALE,
  ANGLESCALE,
  PLAYERSPEED,
  RUNSPEED,
  ACTORSIZE,
  FL_SHOOTABLE,
  FL_BONUS,
  FL_ATTACKMODE,
  PUSHABLETILE,
  EXITTILE,
  ELEVATORTILE,
  tileIndex,
  rnd,
  ATTACK_INFO,
} from "../core/types";
import type { Actor, StaticObj } from "../core/types";

import { sintable, costable, fixedByFrac } from "../core/math";

import type { WorldState } from "./actors";

// ============================================================
// Input State
// ============================================================

export interface InputState {
  /** Raw key states (KeyboardEvent.code values) */
  keys: Set<string>;

  /** Processed controls: turn/strafe (-100 to 100) */
  controlx: number;
  /** Processed controls: forward/back (-100 to 100) */
  controly: number;
  /** ButtonType-indexed button states for this frame */
  buttonstate: boolean[];

  /** Accumulated mouse X delta since last poll */
  mouseDx: number;
  /** Accumulated mouse Y delta since last poll */
  mouseDy: number;
  /** Bitmask of mouse buttons currently held */
  mouseButtons: number;

  /** Whether pointer lock is active */
  pointerLocked: boolean;
}

export function createInputState(): InputState {
  return {
    keys: new Set<string>(),
    controlx: 0,
    controly: 0,
    buttonstate: new Array(9).fill(false),
    mouseDx: 0,
    mouseDy: 0,
    mouseButtons: 0,
    pointerLocked: false,
  };
}

/**
 * Bind all keyboard, mouse, and pointer-lock listeners to the given canvas.
 * Call once during initialization.
 */
export function setupInput(canvas: HTMLCanvasElement, input: InputState): void {
  // --- Keyboard ---
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    input.keys.add(e.code);
    // Prevent browser defaults for game keys
    if (
      e.code === "Space" ||
      e.code === "ArrowUp" ||
      e.code === "ArrowDown" ||
      e.code === "ArrowLeft" ||
      e.code === "ArrowRight" ||
      e.code === "Tab"
    ) {
      e.preventDefault();
    }
  });

  document.addEventListener("keyup", (e: KeyboardEvent) => {
    input.keys.delete(e.code);
  });

  // --- Pointer Lock (FPS mouse look) ---
  canvas.addEventListener("click", () => {
    if (!input.pointerLocked) {
      canvas.requestPointerLock();
    }
  });

  document.addEventListener("pointerlockchange", () => {
    input.pointerLocked = document.pointerLockElement === canvas;
  });

  // --- Mouse ---
  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (input.pointerLocked) {
      input.mouseDx += e.movementX;
      input.mouseDy += e.movementY;
    }
  });

  document.addEventListener("mousedown", (e: MouseEvent) => {
    if (input.pointerLocked) {
      input.mouseButtons |= 1 << e.button;
    }
  });

  document.addEventListener("mouseup", (e: MouseEvent) => {
    input.mouseButtons &= ~(1 << e.button);
  });

  // Lose focus -> release all keys to prevent stuck keys
  window.addEventListener("blur", () => {
    input.keys.clear();
    input.mouseButtons = 0;
  });
}

/**
 * Convert raw key/mouse state into processed controlx/controly/buttonstate.
 * Called once per frame before updatePlayer.
 */
export function pollControls(input: InputState): void {
  const keys = input.keys;

  // Reset processed values
  input.controlx = 0;
  input.controly = 0;
  input.buttonstate = new Array(9).fill(false);

  // ---- Forward / backward (WASD + arrows) ----
  if (keys.has("KeyW") || keys.has("ArrowUp")) {
    input.controly = -100; // forward is negative
  }
  if (keys.has("KeyS") || keys.has("ArrowDown")) {
    input.controly = 100; // backward is positive
  }

  // ---- Strafe with A/D ----
  // Arrow left/right handled separately for turning
  let strafeInput = 0;
  if (keys.has("KeyA")) strafeInput -= 100;
  if (keys.has("KeyD")) strafeInput += 100;

  // ---- Turn with arrow keys ----
  let turnInput = 0;
  if (keys.has("ArrowLeft")) turnInput -= 100;
  if (keys.has("ArrowRight")) turnInput += 100;

  // Mouse turning (high sensitivity for FPS feel)
  turnInput += input.mouseDx * 3;

  // Clamp turn
  turnInput = Math.max(-100, Math.min(100, turnInput));

  // controlx stores turn amount (arrows + mouse), strafe is applied directly in movement
  input.controlx = turnInput;

  // Store strafe in temp -- we'll read keys directly in controlMovement for strafe
  // Reset mouse deltas
  input.mouseDx = 0;
  input.mouseDy = 0;

  // ---- Buttons ----
  if (keys.has("Space") || keys.has("KeyE")) {
    input.buttonstate[ButtonType.Use] = true;
  }
  if (
    keys.has("ControlLeft") ||
    keys.has("ControlRight") ||
    input.mouseButtons & 1
  ) {
    input.buttonstate[ButtonType.Attack] = true;
  }
  if (keys.has("ShiftLeft") || keys.has("ShiftRight")) {
    input.buttonstate[ButtonType.Run] = true;
  }

  // Strafe button (for arrow key strafing -- Alt key)
  if (keys.has("AltLeft") || keys.has("AltRight")) {
    input.buttonstate[ButtonType.Strafe] = true;
  }

  // Weapon select
  if (keys.has("Digit1")) input.buttonstate[ButtonType.ReadyKnife] = true;
  if (keys.has("Digit2")) input.buttonstate[ButtonType.ReadyPistol] = true;
  if (keys.has("Digit3")) input.buttonstate[ButtonType.ReadyMachineGun] = true;
  if (keys.has("Digit4")) input.buttonstate[ButtonType.ReadyChainGun] = true;
}

// ============================================================
// Player Update (called each game frame)
// ============================================================

/**
 * Main player update -- handles movement, weapon select, use, attack, pickups.
 */
export function updatePlayer(
  world: WorldState,
  input: InputState,
  tics: number,
): void {
  const gs = world.gamestate;

  if (gs.health <= 0) {
    // Player is dead -- set exit state
    world.playstate = ExitType.Died;
    return;
  }

  // Movement
  controlMovement(world, input, tics);

  // Weapon switching (only when not currently attacking)
  if (gs.attackframe === 0 || gs.attackcount === 0) {
    if (input.buttonstate[ButtonType.ReadyKnife]) {
      gs.weapon = WeaponType.Knife;
      gs.chosenweapon = WeaponType.Knife;
    } else if (input.buttonstate[ButtonType.ReadyPistol]) {
      gs.weapon = WeaponType.Pistol;
      gs.chosenweapon = WeaponType.Pistol;
    } else if (
      input.buttonstate[ButtonType.ReadyMachineGun] &&
      gs.bestweapon >= WeaponType.MachineGun
    ) {
      gs.weapon = WeaponType.MachineGun;
      gs.chosenweapon = WeaponType.MachineGun;
    } else if (
      input.buttonstate[ButtonType.ReadyChainGun] &&
      gs.bestweapon >= WeaponType.ChainGun
    ) {
      gs.weapon = WeaponType.ChainGun;
      gs.chosenweapon = WeaponType.ChainGun;
    }
  }

  // Use/Interact
  if (input.buttonstate[ButtonType.Use]) {
    playerUse(world);
  }

  // Attack initiation (only if not already attacking)
  if (input.buttonstate[ButtonType.Attack] && gs.attackframe === 0) {
    playerAttack(world, input);
  }

  // Check for item pickups
  checkPickups(world);

  // Update time
  gs.TimeCount += tics;

  // Extra life check
  if (gs.score >= gs.nextextra) {
    gs.lives++;
    gs.nextextra += 40000;
  }
}

// ============================================================
// Movement
// ============================================================

/**
 * Handle player movement: turning (arrows + mouse), forward/back (W/S/arrows),
 * and strafing (A/D). Modern FPS-style controls.
 */
export function controlMovement(
  world: WorldState,
  input: InputState,
  tics: number,
): void {
  const player = world.player;
  const keys = input.keys;

  // ---- Turning ----
  // Arrow keys contribute to turning; if Strafe button held, arrows strafe instead
  const strafing = input.buttonstate[ButtonType.Strafe];

  let turnAmount = 0;

  if (!strafing) {
    // Arrow left/right = turn
    if (keys.has("ArrowLeft")) turnAmount -= ANGLESCALE * tics;
    if (keys.has("ArrowRight")) turnAmount += ANGLESCALE * tics;
  }

  // Mouse always turns (accumulated in mouseDx, but we already processed it into controlx)
  // controlx has the combined arrow + mouse turn value scaled to [-100, 100]
  // Map controlx to angle change
  turnAmount += (input.controlx * tics * ANGLESCALE) / 100;

  // Apply rotation
  player.angle -= turnAmount;
  // Normalize to 0..ANGLES-1
  while (player.angle < 0) player.angle += ANGLES;
  while (player.angle >= ANGLES) player.angle -= ANGLES;
  player.angle = Math.floor(player.angle) % ANGLES;
  if (player.angle < 0) player.angle += ANGLES;

  // ---- Speed ----
  const running = input.buttonstate[ButtonType.Run];
  const speed = running ? RUNSPEED : PLAYERSPEED;

  // ---- Forward / Backward (W/S or Up/Down) ----
  if (keys.has("KeyW") || keys.has("ArrowUp")) {
    // Forward
    const moveSpeed = speed * tics;
    thrust(world, player, player.angle, moveSpeed);
  }
  if (keys.has("KeyS") || keys.has("ArrowDown")) {
    // Backward (slower)
    const moveSpeed = (speed * tics * BACKMOVESCALE) / MOVESCALE;
    thrust(world, player, (player.angle + ANGLES / 2) % ANGLES, moveSpeed);
  }

  // ---- Strafe (A/D always strafe; arrows strafe if Strafe button held) ----
  let strafeLeft = keys.has("KeyA");
  let strafeRight = keys.has("KeyD");
  if (strafing) {
    if (keys.has("ArrowLeft")) strafeLeft = true;
    if (keys.has("ArrowRight")) strafeRight = true;
  }

  if (strafeLeft) {
    const moveSpeed = speed * tics;
    // Strafe left = move at angle + 90 degrees
    thrust(world, player, (player.angle + 90) % ANGLES, moveSpeed);
  }
  if (strafeRight) {
    const moveSpeed = speed * tics;
    // Strafe right = move at angle - 90 degrees (= +270)
    thrust(world, player, (player.angle + 270) % ANGLES, moveSpeed);
  }
}

/**
 * Apply velocity in a given direction, then clip against world geometry.
 */
function thrust(
  world: WorldState,
  player: Actor,
  angle: number,
  speed: number,
): void {
  // Ensure angle is valid
  const a = ((angle % ANGLES) + ANGLES) % ANGLES;
  const xmove = fixedByFrac(speed, costable[a]);
  const ymove = -fixedByFrac(speed, sintable[a]);
  clipMove(world, player, xmove, ymove);
}

/**
 * Move the player by (xmove, ymove), clipping against walls, doors, and actors.
 * Tries X and Y independently so the player slides along walls.
 */
function clipMove(
  world: WorldState,
  player: Actor,
  xmove: number,
  ymove: number,
): void {
  const playerRadius = MINDIST;

  // Try X movement
  const newx = player.x + xmove;
  const checkx1 =
    (newx + (xmove > 0 ? playerRadius : -playerRadius)) >> TILESHIFT;
  const checky = player.tiley;

  if (
    checkx1 >= 0 &&
    checkx1 < MAPSIZE &&
    !isTileBlocked(world, checkx1, checky)
  ) {
    // Also check diagonal tiles to avoid corner-cutting
    const topTile = (player.y - playerRadius) >> TILESHIFT;
    const botTile = (player.y + playerRadius) >> TILESHIFT;
    let blocked = false;
    if (topTile !== checky && isTileBlocked(world, checkx1, topTile))
      blocked = true;
    if (botTile !== checky && isTileBlocked(world, checkx1, botTile))
      blocked = true;

    if (!blocked && !isActorBlocking(world, newx, player.y, player)) {
      player.x = newx;
      player.tilex = newx >> TILESHIFT;
    }
  }

  // Try Y movement
  const newy = player.y + ymove;
  const checkx = player.tilex;
  const checky1 =
    (newy + (ymove > 0 ? playerRadius : -playerRadius)) >> TILESHIFT;

  if (
    checky1 >= 0 &&
    checky1 < MAPSIZE &&
    !isTileBlocked(world, checkx, checky1)
  ) {
    // Check diagonal tiles
    const leftTile = (player.x - playerRadius) >> TILESHIFT;
    const rightTile = (player.x + playerRadius) >> TILESHIFT;
    let blocked = false;
    if (leftTile !== checkx && isTileBlocked(world, leftTile, checky1))
      blocked = true;
    if (rightTile !== checkx && isTileBlocked(world, rightTile, checky1))
      blocked = true;

    if (!blocked && !isActorBlocking(world, player.x, newy, player)) {
      player.y = newy;
      player.tiley = newy >> TILESHIFT;
    }
  }

  // Update area number: the tilemap stores area info for open tiles.
  // In Wolf3D, open tiles (value 0 in wall plane) have area info stored
  // elsewhere. Here we simply keep the player's current area number
  // unless the actorat grid or tilemap indicates a different area.
  // Area tracking is handled by the main game loop via actors.ts.
}

/**
 * Check if a tile is blocked (wall, closed door, or pushwall).
 */
function isTileBlocked(world: WorldState, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= MAPSIZE || ty < 0 || ty >= MAPSIZE) return true;

  const wallVal = world.tilemap[tileIndex(tx, ty)];

  // Solid wall tiles (1-63 are wall textures, 0 is empty)
  if (wallVal > 0 && wallVal < 64) return true;

  // Check pushwall tile marker
  if (wallVal === PUSHABLETILE) return true;

  // Check doors
  const doorNum = getDoorAt(world, tx, ty);
  if (doorNum >= 0) {
    const door = world.doorobjlist[doorNum];
    // Door is blocked unless it's fully open
    if (door.action !== DoorAction.Open && door.position < 0.99) {
      return true;
    }
  }

  return false;
}

/**
 * Find a door at the given tile. Returns door index or -1 if none.
 */
function getDoorAt(world: WorldState, tx: number, ty: number): number {
  for (let i = 0; i <= world.lastdoor; i++) {
    const d = world.doorobjlist[i];
    if (d.tilex === tx && d.tiley === ty) return i;
  }
  return -1;
}

/**
 * Check if any actor (enemy) is blocking movement to a position.
 */
function isActorBlocking(
  world: WorldState,
  px: number,
  py: number,
  self: Actor,
): boolean {
  for (let i = 0; i <= world.lastobj; i++) {
    const ob = world.objlist[i];
    if (!ob || ob === self || ob.obclass === ClassType.Nothing) continue;
    if (ob.obclass === ClassType.Inert) continue;
    if (ob.flags & FL_SHOOTABLE) {
      // Check bounding box overlap (ACTORSIZE is the half-width)
      const dx = Math.abs(px - ob.x);
      const dy = Math.abs(py - ob.y);
      if (dx < ACTORSIZE && dy < ACTORSIZE) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================
// Use / Interact
// ============================================================

/** Tracks whether the use button was already held last frame to prevent repeat. */
let _useHeld = false;

/**
 * Player pressed Use: check the tile in front for doors, pushwalls, elevator.
 */
export function playerUse(world: WorldState): void {
  // Debounce: only activate on initial press
  if (_useHeld) return;
  _useHeld = true;
  // We'll reset _useHeld when key is released -- handled in updatePlayer wrapper
  setTimeout(() => {
    _useHeld = false;
  }, 200);

  const player = world.player;
  const gs = world.gamestate;

  // Determine the tile in front of the player
  const angle = player.angle;
  let checkTx = player.tilex;
  let checkTy = player.tiley;

  // Use cardinal direction based on angle quadrant
  if (angle >= 315 || angle < 45) {
    // Facing East
    checkTx += 1;
  } else if (angle >= 45 && angle < 135) {
    // Facing North
    checkTy -= 1;
  } else if (angle >= 135 && angle < 225) {
    // Facing West
    checkTx -= 1;
  } else {
    // Facing South
    checkTy += 1;
  }

  if (checkTx < 0 || checkTx >= MAPSIZE || checkTy < 0 || checkTy >= MAPSIZE)
    return;

  // Check for door
  const doorIdx = getDoorAt(world, checkTx, checkTy);
  if (doorIdx >= 0) {
    const door = world.doorobjlist[doorIdx];
    // Check if locked
    if (door.lock === DoorLock.Lock1 && !(gs.keys & 1)) {
      // Need gold key
      return;
    }
    if (door.lock === DoorLock.Lock2 && !(gs.keys & 2)) {
      // Need silver key
      return;
    }
    // Open the door (import openDoor dynamically to avoid circular deps)
    if (
      door.action === DoorAction.Closed ||
      door.action === DoorAction.Closing
    ) {
      door.action = DoorAction.Opening;
      door.ticcount = 0;
    }
    return;
  }

  // Check for elevator tile
  const wallVal = world.tilemap[tileIndex(checkTx, checkTy)];
  if (wallVal === ELEVATORTILE || wallVal === EXITTILE) {
    // Level complete!
    world.playstate = ExitType.Completed;
    return;
  }

  // Check for pushwall
  if (wallVal === PUSHABLETILE) {
    // Determine push direction
    const dx = checkTx - player.tilex;
    const dy = checkTy - player.tiley;
    let pushDir = DirType.NoDir;
    if (dx === 1 && dy === 0) pushDir = DirType.East;
    else if (dx === -1 && dy === 0) pushDir = DirType.West;
    else if (dx === 0 && dy === -1) pushDir = DirType.North;
    else if (dx === 0 && dy === 1) pushDir = DirType.South;

    if (pushDir !== DirType.NoDir) {
      // Check that the tile behind the pushwall is empty
      let behindTx = checkTx;
      let behindTy = checkTy;
      if (pushDir === DirType.East) behindTx++;
      else if (pushDir === DirType.West) behindTx--;
      else if (pushDir === DirType.North) behindTy--;
      else if (pushDir === DirType.South) behindTy++;

      if (
        behindTx >= 0 &&
        behindTx < MAPSIZE &&
        behindTy >= 0 &&
        behindTy < MAPSIZE
      ) {
        const behindWall = world.tilemap[tileIndex(behindTx, behindTy)];
        if (behindWall === 0) {
          // Start pushwall
          world.pwallstate = 1; // 1 = just started
          world.pwalltile = { x: checkTx, y: checkTy };
          world.pwalldir = pushDir;
          world.pwallpos = 0;

          // Count secret
          gs.secretcount++;
        }
      }
    }
    return;
  }
}

// ============================================================
// Attack / Weapons
// ============================================================

/**
 * Initiate an attack sequence.
 */
export function playerAttack(world: WorldState, input: InputState): void {
  const gs = world.gamestate;

  // Cannot attack if already in attack animation
  if (gs.attackframe > 0) return;

  // For non-knife weapons, need ammo
  if (gs.weapon !== WeaponType.Knife && gs.ammo <= 0) {
    // Switch to knife if out of ammo
    gs.weapon = WeaponType.Knife;
  }

  // Start attack sequence
  gs.attackframe = 1;
  gs.attackcount = 0;
  gs.weaponframe = 1;
}

/**
 * Update the weapon attack animation. Called each frame.
 * Steps through ATTACK_INFO frames for the current weapon.
 */
export function updateAttack(world: WorldState, tics: number): void {
  const gs = world.gamestate;

  if (gs.attackframe === 0) {
    gs.weaponframe = 0;
    return;
  }

  gs.attackcount -= tics;
  if (gs.attackcount > 0) return;

  const weaponInfo = ATTACK_INFO[gs.weapon];
  if (!weaponInfo) {
    gs.attackframe = 0;
    gs.weaponframe = 0;
    return;
  }

  const frameIdx = gs.attackframe - 1;
  if (frameIdx >= weaponInfo.length) {
    gs.attackframe = 0;
    gs.weaponframe = 0;
    return;
  }

  const info = weaponInfo[frameIdx];
  gs.attackcount = info.tics;
  gs.weaponframe = info.frame;

  // Process attack action
  switch (info.attack) {
    case 1: // Gun shot
      if (gs.weapon !== WeaponType.Knife) {
        gs.ammo--;
        if (gs.ammo < 0) gs.ammo = 0;
      }
      gunAttack(world);
      break;
    case 2: // Knife slash
      knifeAttack(world);
      break;
    case 3: // Machine gun burst
      if (gs.ammo > 0) {
        gs.ammo--;
        gunAttack(world);
      }
      break;
    case 4: // Chain gun burst
      if (gs.ammo > 0) {
        gs.ammo--;
        gunAttack(world);
      }
      break;
    case -1: // Attack finished
      gs.attackframe = 0;
      gs.weaponframe = 0;

      // For auto weapons (MG / CG), restart if fire button still held
      // This is handled by the caller checking buttonstate
      return;
    default:
      break;
  }

  gs.attackframe++;
}

/**
 * Trace a bullet from the player's position in the player's facing direction.
 * Hits the first FL_SHOOTABLE actor in the line of fire.
 */
export function gunAttack(world: WorldState): void {
  const player = world.player;
  const gs = world.gamestate;

  // Add slight random inaccuracy based on weapon
  let angleSpread = 0;
  if (gs.weapon === WeaponType.MachineGun) angleSpread = rnd(11) - 5;
  else if (gs.weapon === WeaponType.ChainGun) angleSpread = rnd(13) - 6;
  else if (gs.weapon === WeaponType.Pistol) angleSpread = rnd(5) - 2;

  const shotAngle = (((player.angle + angleSpread) % ANGLES) + ANGLES) % ANGLES;

  // Step along the ray in fixed increments, checking for actors
  const stepDist = TILEGLOBAL / 2;
  const maxDist = TILEGLOBAL * 20; // max range = 20 tiles

  const cosA = costable[shotAngle];
  const sinA = sintable[shotAngle];

  let closestActor: Actor | null = null;
  let closestDist = maxDist;

  // Check every shootable actor to see if they're in the line of fire
  for (let i = 0; i <= world.lastobj; i++) {
    const ob = world.objlist[i];
    if (!ob || !(ob.flags & FL_SHOOTABLE)) continue;
    if (ob.hitpoints <= 0) continue;

    // Distance to actor
    const dx = ob.x - player.x;
    const dy = ob.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= closestDist) continue;
    if (dist < MINDIST) continue; // too close

    // Check if actor is within the shot cone
    // Compute the angle from player to actor
    let actorAngle = (Math.atan2(-dy, dx) * ANGLES) / (2 * Math.PI);
    actorAngle = ((actorAngle % ANGLES) + ANGLES) % ANGLES;

    // Angle difference
    let angleDiff = actorAngle - shotAngle;
    while (angleDiff > ANGLES / 2) angleDiff -= ANGLES;
    while (angleDiff < -ANGLES / 2) angleDiff += ANGLES;

    // Hit cone: wider at close range, narrower at distance
    const hitCone = Math.max(
      2,
      ((ACTORSIZE * ANGLES) / (dist * 2 * Math.PI)) * 4,
    );

    if (Math.abs(angleDiff) < hitCone) {
      // Check that there's no wall between player and actor
      if (!isWallBetween(world, player.x, player.y, ob.x, ob.y)) {
        closestActor = ob;
        closestDist = dist;
      }
    }
  }

  if (closestActor) {
    // Calculate damage based on distance and weapon
    let damage = 0;
    const distTiles = closestDist / TILEGLOBAL;

    switch (gs.weapon) {
      case WeaponType.Pistol:
        damage = rnd(15) + 10;
        // Damage falloff with distance
        damage = Math.max(1, Math.floor(damage / (1 + distTiles * 0.3)));
        break;
      case WeaponType.MachineGun:
        damage = rnd(15) + 10;
        damage = Math.max(1, Math.floor(damage / (1 + distTiles * 0.2)));
        break;
      case WeaponType.ChainGun:
        damage = rnd(15) + 10;
        damage = Math.max(1, Math.floor(damage / (1 + distTiles * 0.15)));
        break;
      default:
        damage = rnd(10) + 5;
        break;
    }

    damageActor(world, closestActor, damage);
  }
}

/**
 * Knife melee attack - check nearby actors in facing direction.
 */
export function knifeAttack(world: WorldState): void {
  const player = world.player;
  const maxKnifeRange = TILEGLOBAL + ACTORSIZE; // about 1.25 tiles

  let closestActor: Actor | null = null;
  let closestDist = maxKnifeRange;

  for (let i = 0; i <= world.lastobj; i++) {
    const ob = world.objlist[i];
    if (!ob || !(ob.flags & FL_SHOOTABLE)) continue;
    if (ob.hitpoints <= 0) continue;

    const dx = ob.x - player.x;
    const dy = ob.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= closestDist) continue;

    // Check angle - must be roughly facing the actor
    let actorAngle = (Math.atan2(-dy, dx) * ANGLES) / (2 * Math.PI);
    actorAngle = ((actorAngle % ANGLES) + ANGLES) % ANGLES;

    let angleDiff = actorAngle - player.angle;
    while (angleDiff > ANGLES / 2) angleDiff -= ANGLES;
    while (angleDiff < -ANGLES / 2) angleDiff += ANGLES;

    // Wider cone for knife (90 degree arc)
    if (Math.abs(angleDiff) < ANGLES / 8) {
      closestActor = ob;
      closestDist = dist;
    }
  }

  if (closestActor) {
    const damage = rnd(20) + 15; // knife does decent damage up close
    damageActor(world, closestActor, damage);
  }
}

/**
 * Check if there's a solid wall between two points (simple ray check).
 */
function isWallBetween(
  world: WorldState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dy + dy * dy);
  const steps = Math.ceil(dist / (TILEGLOBAL / 2));
  if (steps <= 0) return false;

  const sx = dx / steps;
  const sy = dy / steps;

  for (let i = 1; i < steps; i++) {
    const cx = Math.floor(x1 + sx * i) >> TILESHIFT;
    const cy = Math.floor(y1 + sy * i) >> TILESHIFT;

    if (cx < 0 || cx >= MAPSIZE || cy < 0 || cy >= MAPSIZE) return true;

    const wallVal = world.tilemap[tileIndex(cx, cy)];
    if (wallVal > 0 && wallVal < 64) return true;

    // Check doors (closed doors block line of sight)
    const doorIdx = getDoorAt(world, cx, cy);
    if (doorIdx >= 0) {
      const door = world.doorobjlist[doorIdx];
      if (door.position < 0.5) return true;
    }
  }

  return false;
}

/**
 * Apply damage to an enemy actor, killing it if HP goes to zero.
 */
function damageActor(world: WorldState, actor: Actor, damage: number): void {
  actor.hitpoints -= damage;

  if (actor.hitpoints <= 0) {
    actor.hitpoints = 0;
    // Kill the actor
    actor.flags &= ~FL_SHOOTABLE;
    actor.flags &= ~FL_ATTACKMODE;

    // Increment kill count
    world.gamestate.killcount++;

    // Give score based on enemy type
    switch (actor.obclass) {
      case ClassType.Guard:
        givePoints(world, 100);
        break;
      case ClassType.Officer:
        givePoints(world, 400);
        break;
      case ClassType.SS:
        givePoints(world, 500);
        break;
      case ClassType.Dog:
        givePoints(world, 200);
        break;
      case ClassType.Mutant:
        givePoints(world, 700);
        break;
      case ClassType.Boss:
      case ClassType.Schabbs:
      case ClassType.MechaHitler:
      case ClassType.RealHitler:
      case ClassType.Gretel:
      case ClassType.Gift:
      case ClassType.Fat:
        givePoints(world, 5000);
        break;
      default:
        givePoints(world, 100);
        break;
    }
  } else {
    // Enemy becomes aggressive when shot
    actor.flags |= FL_ATTACKMODE;
  }
}

// ============================================================
// Damage / Health / Items
// ============================================================

/**
 * Apply damage to the player.
 */
export function takeDamage(
  world: WorldState,
  points: number,
  attacker: Actor | null,
): void {
  const gs = world.gamestate;

  if (gs.health <= 0) return; // already dead

  // Scale damage by difficulty
  const difficultyScale = [0.5, 0.75, 1.0, 1.5];
  const scaled = Math.ceil(points * (difficultyScale[gs.difficulty] || 1.0));

  gs.health -= scaled;

  // Update face frame to show pain
  gs.faceframe = 1; // hurt face

  if (gs.health <= 0) {
    gs.health = 0;
    gs.faceframe = 2; // dead face
    world.playstate = ExitType.Died;
  }
}

/**
 * Heal the player. Health caps at 100 (or 150 for medikit).
 */
export function healPlayer(world: WorldState, points: number): void {
  const gs = world.gamestate;
  gs.health += points;
  if (gs.health > 100) gs.health = 100;
}

/**
 * Give the player ammo. Capped at 99.
 */
export function giveAmmo(world: WorldState, amount: number): void {
  const gs = world.gamestate;
  gs.ammo += amount;
  if (gs.ammo > 99) gs.ammo = 99;
}

/**
 * Give the player a weapon. Also sets best weapon if this is better.
 */
export function giveWeapon(world: WorldState, weapon: WeaponType): void {
  const gs = world.gamestate;
  if (weapon > gs.bestweapon) {
    gs.bestweapon = weapon;
  }
  gs.weapon = weapon;
  gs.chosenweapon = weapon;
}

/**
 * Give the player a key. key=0 for gold (bit 0), key=1 for silver (bit 1).
 */
export function giveKey(world: WorldState, key: number): void {
  world.gamestate.keys |= 1 << key;
}

/**
 * Add points to the player's score.
 */
export function givePoints(world: WorldState, points: number): void {
  world.gamestate.score += points;
}

// ============================================================
// Item Pickup
// ============================================================

/**
 * Attempt to pick up a static item. Returns true if the item was picked up.
 */
export function pickupItem(world: WorldState, item: StaticObj): boolean {
  const gs = world.gamestate;

  switch (item.itemnumber) {
    // --- Health pickups ---
    case StaticItemType.Food:
      if (gs.health >= 100) return false;
      healPlayer(world, 10);
      break;

    case StaticItemType.FirstAid:
      if (gs.health >= 100) return false;
      healPlayer(world, 25);
      break;

    // --- Ammo ---
    case StaticItemType.Clip:
      if (gs.ammo >= 99) return false;
      giveAmmo(world, 8);
      break;

    // --- Weapons (also give ammo) ---
    case StaticItemType.MachineGunPickup:
      giveAmmo(world, 6);
      giveWeapon(world, WeaponType.MachineGun);
      break;

    case StaticItemType.ChainGunPickup:
      giveAmmo(world, 6);
      giveWeapon(world, WeaponType.ChainGun);
      break;

    // --- Treasure ---
    case StaticItemType.Cross:
      givePoints(world, 100);
      gs.treasurecount++;
      break;

    case StaticItemType.Chalice:
      givePoints(world, 500);
      gs.treasurecount++;
      break;

    case StaticItemType.Chest:
      givePoints(world, 1000);
      gs.treasurecount++;
      break;

    case StaticItemType.Crown:
      givePoints(world, 5000);
      gs.treasurecount++;
      break;

    // --- Extra life ---
    case StaticItemType.ExtraLife:
      gs.lives++;
      gs.health = 100;
      giveAmmo(world, 25);
      break;

    // --- Keys ---
    case StaticItemType.GoldKey:
      giveKey(world, 0); // bit 0
      break;

    case StaticItemType.SilverKey:
      giveKey(world, 1); // bit 1
      break;

    default:
      return false; // not a pickup item
  }

  // Remove the item from the world
  item.shapenum = -1; // mark as removed
  item.itemnumber = StaticItemType.None;
  item.flags = 0;

  return true;
}

/**
 * Check if the player is standing on any bonus items and pick them up.
 */
function checkPickups(world: WorldState): void {
  const player = world.player;
  const px = player.tilex;
  const py = player.tiley;

  for (let i = 0; i <= world.laststat; i++) {
    const stat = world.statobjlist[i];
    if (stat.shapenum === -1) continue; // removed
    if (!(stat.flags & FL_BONUS)) continue; // not a pickup

    if (stat.tilex === px && stat.tiley === py) {
      pickupItem(world, stat);
    }
  }
}
