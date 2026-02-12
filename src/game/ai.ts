/**
 * Wolfenstein 3D TypeScript Port - Enemy AI
 * Ported from WL_STATE.C and WL_ACT2.C
 *
 * Implements the enemy state machine, AI think functions,
 * pathfinding, line-of-sight checks, and combat.
 */

import {
  MAPSIZE,
  TILEGLOBAL,
  TILESHIFT,
  MINDIST,
  SPDPATROL,
  SPDDOG,
  FL_SHOOTABLE,
  FL_VISABLE,
  FL_ATTACKMODE,
  FL_FIRSTATTACK,
  FL_AMBUSH,
  ACTORSIZE,
  DX,
  DY,
  DIR_ANGLE,
  DIR_TABLE,
  ClassType,
  EnemyType,
  ExitType,
  DirType,
  ActiveType,
  tileIndex,
  rnd,
  rndT,
} from "../core/types";
import type { Actor, StateType } from "../core/types";
import { sintable, costable, fixedByFrac } from "../core/math";
import type { WorldState } from "./actors";
import { isTileWalkable, isTileSolid, killActor } from "./actors";

// ============================================================
// Forward declarations for think/action functions
// (Needed because states reference functions defined below)
// ============================================================

// These are the actual implementations, declared as functions below.
// We use wrapper closures in the state definitions so the functions
// can reference each other and the states without forward-declaration issues.

// ============================================================
// Guard States
// ============================================================

export const s_guard_stand: StateType = {
  rotate: true,
  shapenum: 50,
  tictime: 0, // wait forever
  think: (ob) => T_Stand(_worldRef!, ob),
  action: null,
  next: null!, // self-referencing, set below
};
s_guard_stand.next = s_guard_stand;

export const s_guard_path1: StateType = {
  rotate: true,
  shapenum: 50,
  tictime: 20,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_guard_path2: StateType = {
  rotate: true,
  shapenum: 54,
  tictime: 15,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_guard_path3: StateType = {
  rotate: true,
  shapenum: 50,
  tictime: 20,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_guard_path4: StateType = {
  rotate: true,
  shapenum: 58,
  tictime: 15,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

// Link patrol cycle
s_guard_path1.next = s_guard_path2;
s_guard_path2.next = s_guard_path3;
s_guard_path3.next = s_guard_path4;
s_guard_path4.next = s_guard_path1;

export const s_guard_chase1: StateType = {
  rotate: true,
  shapenum: 50,
  tictime: 10,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_guard_chase2: StateType = {
  rotate: true,
  shapenum: 54,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_guard_chase3: StateType = {
  rotate: true,
  shapenum: 50,
  tictime: 10,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_guard_chase4: StateType = {
  rotate: true,
  shapenum: 58,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

// Link chase cycle
s_guard_chase1.next = s_guard_chase2;
s_guard_chase2.next = s_guard_chase3;
s_guard_chase3.next = s_guard_chase4;
s_guard_chase4.next = s_guard_chase1;

export const s_guard_shoot: StateType = {
  rotate: false,
  shapenum: 62,
  tictime: 20,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};

export const s_guard_pain: StateType = {
  rotate: false,
  shapenum: 66,
  tictime: 10,
  think: null,
  action: null,
  next: null!,
};
s_guard_pain.next = s_guard_chase1;
s_guard_shoot.next = s_guard_chase1;

export const s_guard_die1: StateType = {
  rotate: false,
  shapenum: 67,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_guard_die2: StateType = {
  rotate: false,
  shapenum: 68,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_guard_die3: StateType = {
  rotate: false,
  shapenum: 69,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_guard_dead: StateType = {
  rotate: false,
  shapenum: 70,
  tictime: 0,
  think: null,
  action: null,
  next: null!,
};
s_guard_dead.next = s_guard_dead;

// Link death chain
s_guard_die1.next = s_guard_die2;
s_guard_die2.next = s_guard_die3;
s_guard_die3.next = s_guard_dead;

// ============================================================
// Officer States
// ============================================================

export const s_officer_stand: StateType = {
  rotate: true,
  shapenum: 150,
  tictime: 0,
  think: (ob) => T_Stand(_worldRef!, ob),
  action: null,
  next: null!,
};
s_officer_stand.next = s_officer_stand;

export const s_officer_path1: StateType = {
  rotate: true,
  shapenum: 150,
  tictime: 15,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_officer_path2: StateType = {
  rotate: true,
  shapenum: 154,
  tictime: 10,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_officer_path3: StateType = {
  rotate: true,
  shapenum: 150,
  tictime: 15,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_officer_path4: StateType = {
  rotate: true,
  shapenum: 158,
  tictime: 10,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

s_officer_path1.next = s_officer_path2;
s_officer_path2.next = s_officer_path3;
s_officer_path3.next = s_officer_path4;
s_officer_path4.next = s_officer_path1;

export const s_officer_chase1: StateType = {
  rotate: true,
  shapenum: 150,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_officer_chase2: StateType = {
  rotate: true,
  shapenum: 154,
  tictime: 6,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_officer_chase3: StateType = {
  rotate: true,
  shapenum: 150,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_officer_chase4: StateType = {
  rotate: true,
  shapenum: 158,
  tictime: 6,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

s_officer_chase1.next = s_officer_chase2;
s_officer_chase2.next = s_officer_chase3;
s_officer_chase3.next = s_officer_chase4;
s_officer_chase4.next = s_officer_chase1;

export const s_officer_shoot: StateType = {
  rotate: false,
  shapenum: 162,
  tictime: 18,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};
s_officer_shoot.next = s_officer_chase1;

export const s_officer_pain: StateType = {
  rotate: false,
  shapenum: 166,
  tictime: 10,
  think: null,
  action: null,
  next: null!,
};
s_officer_pain.next = s_officer_chase1;

export const s_officer_die1: StateType = {
  rotate: false,
  shapenum: 167,
  tictime: 11,
  think: null,
  action: null,
  next: null!,
};

export const s_officer_die2: StateType = {
  rotate: false,
  shapenum: 168,
  tictime: 11,
  think: null,
  action: null,
  next: null!,
};

export const s_officer_die3: StateType = {
  rotate: false,
  shapenum: 169,
  tictime: 11,
  think: null,
  action: null,
  next: null!,
};

export const s_officer_dead: StateType = {
  rotate: false,
  shapenum: 170,
  tictime: 0,
  think: null,
  action: null,
  next: null!,
};
s_officer_dead.next = s_officer_dead;

s_officer_die1.next = s_officer_die2;
s_officer_die2.next = s_officer_die3;
s_officer_die3.next = s_officer_dead;

// ============================================================
// SS States
// ============================================================

export const s_ss_stand: StateType = {
  rotate: true,
  shapenum: 200,
  tictime: 0,
  think: (ob) => T_Stand(_worldRef!, ob),
  action: null,
  next: null!,
};
s_ss_stand.next = s_ss_stand;

export const s_ss_path1: StateType = {
  rotate: true,
  shapenum: 200,
  tictime: 20,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_ss_path2: StateType = {
  rotate: true,
  shapenum: 204,
  tictime: 15,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_ss_path3: StateType = {
  rotate: true,
  shapenum: 200,
  tictime: 20,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_ss_path4: StateType = {
  rotate: true,
  shapenum: 208,
  tictime: 15,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

s_ss_path1.next = s_ss_path2;
s_ss_path2.next = s_ss_path3;
s_ss_path3.next = s_ss_path4;
s_ss_path4.next = s_ss_path1;

export const s_ss_chase1: StateType = {
  rotate: true,
  shapenum: 200,
  tictime: 10,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_ss_chase2: StateType = {
  rotate: true,
  shapenum: 204,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_ss_chase3: StateType = {
  rotate: true,
  shapenum: 200,
  tictime: 10,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_ss_chase4: StateType = {
  rotate: true,
  shapenum: 208,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

s_ss_chase1.next = s_ss_chase2;
s_ss_chase2.next = s_ss_chase3;
s_ss_chase3.next = s_ss_chase4;
s_ss_chase4.next = s_ss_chase1;

export const s_ss_shoot1: StateType = {
  rotate: false,
  shapenum: 212,
  tictime: 10,
  think: null,
  action: null,
  next: null!,
};

export const s_ss_shoot2: StateType = {
  rotate: false,
  shapenum: 213,
  tictime: 10,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};

export const s_ss_shoot3: StateType = {
  rotate: false,
  shapenum: 214,
  tictime: 10,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};

export const s_ss_shoot4: StateType = {
  rotate: false,
  shapenum: 215,
  tictime: 10,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};

s_ss_shoot1.next = s_ss_shoot2;
s_ss_shoot2.next = s_ss_shoot3;
s_ss_shoot3.next = s_ss_shoot4;
s_ss_shoot4.next = s_ss_chase1;

export const s_ss_pain: StateType = {
  rotate: false,
  shapenum: 216,
  tictime: 10,
  think: null,
  action: null,
  next: null!,
};
s_ss_pain.next = s_ss_chase1;

export const s_ss_die1: StateType = {
  rotate: false,
  shapenum: 217,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_ss_die2: StateType = {
  rotate: false,
  shapenum: 218,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_ss_die3: StateType = {
  rotate: false,
  shapenum: 219,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_ss_dead: StateType = {
  rotate: false,
  shapenum: 220,
  tictime: 0,
  think: null,
  action: null,
  next: null!,
};
s_ss_dead.next = s_ss_dead;

s_ss_die1.next = s_ss_die2;
s_ss_die2.next = s_ss_die3;
s_ss_die3.next = s_ss_dead;

// ============================================================
// Dog States
// ============================================================

export const s_dog_stand: StateType = {
  rotate: true,
  shapenum: 250,
  tictime: 0,
  think: (ob) => T_Stand(_worldRef!, ob),
  action: null,
  next: null!,
};
s_dog_stand.next = s_dog_stand;

export const s_dog_path1: StateType = {
  rotate: true,
  shapenum: 250,
  tictime: 20,
  think: (ob) => T_DogChase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_dog_path2: StateType = {
  rotate: true,
  shapenum: 254,
  tictime: 15,
  think: (ob) => T_DogChase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_dog_path3: StateType = {
  rotate: true,
  shapenum: 250,
  tictime: 20,
  think: (ob) => T_DogChase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_dog_path4: StateType = {
  rotate: true,
  shapenum: 258,
  tictime: 15,
  think: (ob) => T_DogChase(_worldRef!, ob),
  action: null,
  next: null!,
};

s_dog_path1.next = s_dog_path2;
s_dog_path2.next = s_dog_path3;
s_dog_path3.next = s_dog_path4;
s_dog_path4.next = s_dog_path1;

export const s_dog_chase1: StateType = {
  rotate: true,
  shapenum: 250,
  tictime: 8,
  think: (ob) => T_DogChase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_dog_chase2: StateType = {
  rotate: true,
  shapenum: 254,
  tictime: 8,
  think: (ob) => T_DogChase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_dog_chase3: StateType = {
  rotate: true,
  shapenum: 250,
  tictime: 8,
  think: (ob) => T_DogChase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_dog_chase4: StateType = {
  rotate: true,
  shapenum: 258,
  tictime: 8,
  think: (ob) => T_DogChase(_worldRef!, ob),
  action: null,
  next: null!,
};

s_dog_chase1.next = s_dog_chase2;
s_dog_chase2.next = s_dog_chase3;
s_dog_chase3.next = s_dog_chase4;
s_dog_chase4.next = s_dog_chase1;

export const s_dog_bite1: StateType = {
  rotate: false,
  shapenum: 262,
  tictime: 10,
  think: null,
  action: null,
  next: null!,
};

export const s_dog_bite2: StateType = {
  rotate: false,
  shapenum: 263,
  tictime: 10,
  think: null,
  action: (ob) => T_Bite(_worldRef!, ob),
  next: null!,
};

export const s_dog_bite3: StateType = {
  rotate: false,
  shapenum: 264,
  tictime: 10,
  think: null,
  action: null,
  next: null!,
};

s_dog_bite1.next = s_dog_bite2;
s_dog_bite2.next = s_dog_bite3;
s_dog_bite3.next = s_dog_chase1;

export const s_dog_die1: StateType = {
  rotate: false,
  shapenum: 265,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_dog_die2: StateType = {
  rotate: false,
  shapenum: 266,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_dog_die3: StateType = {
  rotate: false,
  shapenum: 267,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_dog_dead: StateType = {
  rotate: false,
  shapenum: 268,
  tictime: 0,
  think: null,
  action: null,
  next: null!,
};
s_dog_dead.next = s_dog_dead;

s_dog_die1.next = s_dog_die2;
s_dog_die2.next = s_dog_die3;
s_dog_die3.next = s_dog_dead;

// ============================================================
// Mutant States
// ============================================================

export const s_mutant_stand: StateType = {
  rotate: true,
  shapenum: 300,
  tictime: 0,
  think: (ob) => T_Stand(_worldRef!, ob),
  action: null,
  next: null!,
};
s_mutant_stand.next = s_mutant_stand;

export const s_mutant_path1: StateType = {
  rotate: true,
  shapenum: 300,
  tictime: 20,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_mutant_path2: StateType = {
  rotate: true,
  shapenum: 304,
  tictime: 15,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_mutant_path3: StateType = {
  rotate: true,
  shapenum: 300,
  tictime: 20,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_mutant_path4: StateType = {
  rotate: true,
  shapenum: 308,
  tictime: 15,
  think: (ob) => T_Path(_worldRef!, ob),
  action: null,
  next: null!,
};

s_mutant_path1.next = s_mutant_path2;
s_mutant_path2.next = s_mutant_path3;
s_mutant_path3.next = s_mutant_path4;
s_mutant_path4.next = s_mutant_path1;

export const s_mutant_chase1: StateType = {
  rotate: true,
  shapenum: 300,
  tictime: 10,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_mutant_chase2: StateType = {
  rotate: true,
  shapenum: 304,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_mutant_chase3: StateType = {
  rotate: true,
  shapenum: 300,
  tictime: 10,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_mutant_chase4: StateType = {
  rotate: true,
  shapenum: 308,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

s_mutant_chase1.next = s_mutant_chase2;
s_mutant_chase2.next = s_mutant_chase3;
s_mutant_chase3.next = s_mutant_chase4;
s_mutant_chase4.next = s_mutant_chase1;

export const s_mutant_shoot1: StateType = {
  rotate: false,
  shapenum: 312,
  tictime: 6,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};

export const s_mutant_shoot2: StateType = {
  rotate: false,
  shapenum: 313,
  tictime: 20,
  think: null,
  action: null,
  next: null!,
};

export const s_mutant_shoot3: StateType = {
  rotate: false,
  shapenum: 314,
  tictime: 10,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};

export const s_mutant_shoot4: StateType = {
  rotate: false,
  shapenum: 315,
  tictime: 20,
  think: null,
  action: null,
  next: null!,
};

s_mutant_shoot1.next = s_mutant_shoot2;
s_mutant_shoot2.next = s_mutant_shoot3;
s_mutant_shoot3.next = s_mutant_shoot4;
s_mutant_shoot4.next = s_mutant_chase1;

export const s_mutant_pain: StateType = {
  rotate: false,
  shapenum: 316,
  tictime: 10,
  think: null,
  action: null,
  next: null!,
};
s_mutant_pain.next = s_mutant_chase1;

export const s_mutant_die1: StateType = {
  rotate: false,
  shapenum: 317,
  tictime: 7,
  think: null,
  action: null,
  next: null!,
};

export const s_mutant_die2: StateType = {
  rotate: false,
  shapenum: 318,
  tictime: 7,
  think: null,
  action: null,
  next: null!,
};

export const s_mutant_die3: StateType = {
  rotate: false,
  shapenum: 319,
  tictime: 7,
  think: null,
  action: null,
  next: null!,
};

export const s_mutant_die4: StateType = {
  rotate: false,
  shapenum: 320,
  tictime: 7,
  think: null,
  action: null,
  next: null!,
};

export const s_mutant_dead: StateType = {
  rotate: false,
  shapenum: 321,
  tictime: 0,
  think: null,
  action: null,
  next: null!,
};
s_mutant_dead.next = s_mutant_dead;

s_mutant_die1.next = s_mutant_die2;
s_mutant_die2.next = s_mutant_die3;
s_mutant_die3.next = s_mutant_die4;
s_mutant_die4.next = s_mutant_dead;

// ============================================================
// Boss States (Hans Grosse)
// ============================================================

export const s_boss_stand: StateType = {
  rotate: true,
  shapenum: 400,
  tictime: 0,
  think: (ob) => T_Stand(_worldRef!, ob),
  action: null,
  next: null!,
};
s_boss_stand.next = s_boss_stand;

export const s_boss_chase1: StateType = {
  rotate: true,
  shapenum: 400,
  tictime: 10,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_boss_chase2: StateType = {
  rotate: true,
  shapenum: 404,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_boss_chase3: StateType = {
  rotate: true,
  shapenum: 400,
  tictime: 10,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

export const s_boss_chase4: StateType = {
  rotate: true,
  shapenum: 408,
  tictime: 8,
  think: (ob) => T_Chase(_worldRef!, ob),
  action: null,
  next: null!,
};

s_boss_chase1.next = s_boss_chase2;
s_boss_chase2.next = s_boss_chase3;
s_boss_chase3.next = s_boss_chase4;
s_boss_chase4.next = s_boss_chase1;

export const s_boss_shoot1: StateType = {
  rotate: false,
  shapenum: 412,
  tictime: 30,
  think: null,
  action: null,
  next: null!,
};

export const s_boss_shoot2: StateType = {
  rotate: false,
  shapenum: 413,
  tictime: 10,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};

export const s_boss_shoot3: StateType = {
  rotate: false,
  shapenum: 414,
  tictime: 10,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};

export const s_boss_shoot4: StateType = {
  rotate: false,
  shapenum: 415,
  tictime: 10,
  think: null,
  action: (ob) => T_Shoot(_worldRef!, ob),
  next: null!,
};

s_boss_shoot1.next = s_boss_shoot2;
s_boss_shoot2.next = s_boss_shoot3;
s_boss_shoot3.next = s_boss_shoot4;
s_boss_shoot4.next = s_boss_chase1;

export const s_boss_die1: StateType = {
  rotate: false,
  shapenum: 416,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_boss_die2: StateType = {
  rotate: false,
  shapenum: 417,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_boss_die3: StateType = {
  rotate: false,
  shapenum: 418,
  tictime: 15,
  think: null,
  action: null,
  next: null!,
};

export const s_boss_dead: StateType = {
  rotate: false,
  shapenum: 419,
  tictime: 0,
  think: null,
  action: null,
  next: null!,
};
s_boss_dead.next = s_boss_dead;

s_boss_die1.next = s_boss_die2;
s_boss_die2.next = s_boss_die3;
s_boss_die3.next = s_boss_dead;

// ============================================================
// World Reference (set by updateActor for think/action closures)
// ============================================================

/**
 * Module-level reference to the current world state.
 * This is set at the start of each updateActor call so that the
 * state machine think/action closures can access the world without
 * storing it in each state definition. This avoids circular reference
 * issues in the state constant definitions.
 */
let _worldRef: WorldState | null = null;

// ============================================================
// Lookup Tables
// ============================================================

/** Opposite direction for each DirType */
const OPPOSITE: DirType[] = [
  DirType.West, // East -> West
  DirType.SouthWest, // NorthEast -> SouthWest
  DirType.South, // North -> South
  DirType.SouthEast, // NorthWest -> SouthEast
  DirType.East, // West -> East
  DirType.NorthEast, // SouthWest -> NorthEast
  DirType.North, // South -> North
  DirType.NorthWest, // SouthEast -> NorthWest
  DirType.NoDir, // NoDir
];

/** Diagonal directions */
const DIAG_DIRS: DirType[] = [
  DirType.NorthEast,
  DirType.NorthWest,
  DirType.SouthEast,
  DirType.SouthWest,
];

/** Cardinal directions */
const CARD_DIRS: DirType[] = [
  DirType.North,
  DirType.South,
  DirType.East,
  DirType.West,
];

// ============================================================
// State lookup by enemy type
// ============================================================

interface EnemyStateSet {
  stand: StateType;
  path: StateType;
  chase: StateType;
  shoot: StateType;
  pain: StateType;
  die: StateType;
}

const ENEMY_STATES: Record<number, EnemyStateSet> = {
  [EnemyType.Guard]: {
    stand: s_guard_stand,
    path: s_guard_path1,
    chase: s_guard_chase1,
    shoot: s_guard_shoot,
    pain: s_guard_pain,
    die: s_guard_die1,
  },
  [EnemyType.Officer]: {
    stand: s_officer_stand,
    path: s_officer_path1,
    chase: s_officer_chase1,
    shoot: s_officer_shoot,
    pain: s_officer_pain,
    die: s_officer_die1,
  },
  [EnemyType.SS]: {
    stand: s_ss_stand,
    path: s_ss_path1,
    chase: s_ss_chase1,
    shoot: s_ss_shoot1,
    pain: s_ss_pain,
    die: s_ss_die1,
  },
  [EnemyType.Dog]: {
    stand: s_dog_stand,
    path: s_dog_path1,
    chase: s_dog_chase1,
    shoot: s_dog_bite1, // dogs "shoot" with bites
    pain: s_dog_die1, // dogs have no pain state, go straight to death
    die: s_dog_die1,
  },
  [EnemyType.Mutant]: {
    stand: s_mutant_stand,
    path: s_mutant_path1,
    chase: s_mutant_chase1,
    shoot: s_mutant_shoot1,
    pain: s_mutant_pain,
    die: s_mutant_die1,
  },
  [EnemyType.Boss]: {
    stand: s_boss_stand,
    path: s_boss_chase1, // bosses don't patrol
    chase: s_boss_chase1,
    shoot: s_boss_shoot1,
    pain: s_boss_chase1, // bosses don't show pain
    die: s_boss_die1,
  },
};

// Map ClassType to EnemyType for state lookups
function classToEnemy(obclass: ClassType): EnemyType {
  switch (obclass) {
    case ClassType.Guard:
      return EnemyType.Guard;
    case ClassType.Officer:
      return EnemyType.Officer;
    case ClassType.SS:
      return EnemyType.SS;
    case ClassType.Dog:
      return EnemyType.Dog;
    case ClassType.Mutant:
      return EnemyType.Mutant;
    case ClassType.Boss:
    case ClassType.Schabbs:
    case ClassType.Fake:
    case ClassType.MechaHitler:
    case ClassType.RealHitler:
    case ClassType.Gretel:
    case ClassType.Gift:
    case ClassType.Fat:
    case ClassType.Angel:
    case ClassType.Trans:
    case ClassType.Uber:
    case ClassType.Will:
    case ClassType.Death:
      return EnemyType.Boss;
    default:
      return EnemyType.Guard;
  }
}

/**
 * Get the initial state for an enemy type.
 * Called by actors.ts when spawning enemies.
 */
export function getInitialState(
  enemyType: EnemyType,
  patrolling: boolean,
): StateType {
  const states = ENEMY_STATES[enemyType];
  if (!states) return s_guard_stand;
  return patrolling ? states.path : states.stand;
}

/**
 * Get the death state for an actor's class.
 */
function getDeathState(obclass: ClassType): StateType {
  const enemyType = classToEnemy(obclass);
  const states = ENEMY_STATES[enemyType];
  return states ? states.die : s_guard_die1;
}

/**
 * Get the pain state for an actor's class.
 */
function getPainState(obclass: ClassType): StateType {
  const enemyType = classToEnemy(obclass);
  const states = ENEMY_STATES[enemyType];
  return states ? states.pain : s_guard_pain;
}

/**
 * Get the chase state for an actor's class.
 */
function getChaseState(obclass: ClassType): StateType {
  const enemyType = classToEnemy(obclass);
  const states = ENEMY_STATES[enemyType];
  return states ? states.chase : s_guard_chase1;
}

/**
 * Get the shoot state for an actor's class.
 */
function getShootState(obclass: ClassType): StateType {
  const enemyType = classToEnemy(obclass);
  const states = ENEMY_STATES[enemyType];
  return states ? states.shoot : s_guard_shoot;
}

// ============================================================
// Main Actor Update (called each frame for each actor)
// ============================================================

/**
 * Update a single actor for this frame. Processes the state machine,
 * calling think functions and advancing animation states.
 *
 * @param world - The world state
 * @param actor - The actor to update
 * @param tics - Number of tics elapsed this frame
 * @param playerAngle - The player's current facing angle (degrees)
 */
export function updateActor(
  world: WorldState,
  actor: Actor,
  tics: number,
  playerAngle: number,
): void {
  if (actor.obclass === ClassType.Nothing || actor.obclass === ClassType.Player)
    return;
  if (!actor.state) return;

  // Store world reference for think/action closures
  _worldRef = world;

  // Decrement tic counter
  if (actor.state.tictime > 0) {
    actor.ticcount -= tics;

    while (actor.ticcount <= 0) {
      // Time to advance to next state
      if (!actor.state) break;
      const nextState: StateType | null = actor.state.next;
      if (!nextState) {
        // No next state -- actor is done (dead, etc.)
        break;
      }

      // Call action on entering new state
      if (nextState.action) {
        nextState.action(actor);
      }

      actor.state = nextState;
      actor.ticcount += nextState.tictime;

      // If tictime is 0, this is a wait-forever state (like stand)
      // Break out so think function gets called
      if (nextState.tictime === 0) {
        actor.ticcount = 0;
        break;
      }
    }
  }

  // Call think function every frame
  if (actor.state && actor.state.think) {
    actor.state.think(actor);
  }

  _worldRef = null;
}

// ============================================================
// AI Think Functions (from WL_STATE.C)
// ============================================================

/**
 * T_Stand: Enemy is idle, watching for the player.
 * Checks line of sight each tic. If the player is spotted, switches to chase.
 */
export function T_Stand(world: WorldState, actor: Actor): void {
  if (checkSight(world, actor)) {
    firstSighting(world, actor);
    return;
  }

  // Ambush enemies don't move until they see the player
  if (actor.flags & FL_AMBUSH) return;

  // Check if player has made noise and is in a connected area
  if (world.madenoise && world.areabyplayer[actor.areanumber]) {
    firstSighting(world, actor);
    return;
  }
}

/**
 * T_Path: Enemy follows a patrol path.
 * Moves in the current direction, checking for player sight.
 * When reaching the center of the next tile, looks for the next direction to go.
 */
export function T_Path(world: WorldState, actor: Actor): void {
  // Check for player
  if (checkSight(world, actor)) {
    firstSighting(world, actor);
    return;
  }

  if (world.madenoise && world.areabyplayer[actor.areanumber]) {
    firstSighting(world, actor);
    return;
  }

  if (actor.dir === DirType.NoDir) {
    selectPathDir(world, actor);
    if (actor.dir === DirType.NoDir) return;
  }

  // Move in current direction
  if (!tryMove(world, actor)) {
    // Can't move -- try to pick a new direction
    selectPathDir(world, actor);
  }
}

/**
 * T_Chase: Enemy actively hunts the player.
 * Moves toward the player using chase direction selection.
 * If close enough and facing the player, switches to shooting.
 */
export function T_Chase(world: WorldState, actor: Actor): void {
  // Check if we can shoot at the player
  const dx = Math.abs(actor.tilex - world.player.tilex);
  const dy = Math.abs(actor.tiley - world.player.tiley);

  if (dx <= 1 && dy <= 1) {
    // Adjacent to player -- always try to shoot
    if (checkSight(world, actor)) {
      const shootState = getShootState(actor.obclass);
      actor.state = shootState;
      actor.ticcount = shootState.tictime;
      if (shootState.action) shootState.action(actor);
      return;
    }
  }

  // Ranged shooting chance based on distance
  const dist = Math.max(dx, dy);
  if (dist > 0 && dist <= 8) {
    // Random chance to shoot based on distance
    // Closer = more likely to shoot
    const shootChance = 256 / dist;
    if (rnd(256) < shootChance && checkSight(world, actor)) {
      const shootState = getShootState(actor.obclass);
      actor.state = shootState;
      actor.ticcount = shootState.tictime;
      if (shootState.action) shootState.action(actor);
      return;
    }
  }

  // Select direction toward player and move
  selectChaseDir(world, actor);

  if (actor.dir !== DirType.NoDir) {
    tryMove(world, actor);
  }
}

/**
 * T_Shoot: Enemy fires at the player.
 * Calculates hit chance based on distance and deals damage.
 */
export function T_Shoot(world: WorldState, actor: Actor): void {
  // Calculate distance to player in tiles
  const dx = Math.abs(actor.tilex - world.player.tilex);
  const dy = Math.abs(actor.tiley - world.player.tiley);
  const dist = Math.max(dx, dy);

  if (dist === 0) return;

  // Verify line of sight (walls might have changed since we decided to shoot)
  if (!checkLine(world, actor.x, actor.y, world.player.x, world.player.y)) {
    return;
  }

  // Calculate hit chance based on distance
  // Close: ~93% hit chance, Far (>8 tiles): ~20%
  let hitchance: number;
  if (dist <= 1) {
    hitchance = 240; // ~93%
  } else if (dist <= 2) {
    hitchance = 200; // ~78%
  } else if (dist <= 3) {
    hitchance = 160; // ~62%
  } else if (dist <= 4) {
    hitchance = 120; // ~47%
  } else if (dist <= 8) {
    hitchance = 80; // ~31%
  } else {
    hitchance = 50; // ~20%
  }

  // Officers and SS are more accurate
  if (actor.obclass === ClassType.Officer || actor.obclass === ClassType.SS) {
    hitchance = Math.min(hitchance + 30, 250);
  }

  // Boss enemies have high accuracy
  if (actor.obclass === ClassType.Boss) {
    hitchance = Math.min(hitchance + 50, 250);
  }

  // Roll to hit
  if (rnd(256) >= hitchance) {
    return; // Miss
  }

  // Calculate damage based on enemy type and distance
  let damage: number;
  switch (actor.obclass) {
    case ClassType.Guard:
      damage = rndT(8);
      break;
    case ClassType.Officer:
      damage = rndT(12);
      break;
    case ClassType.SS:
      damage = rndT(15);
      break;
    case ClassType.Mutant:
      damage = rndT(10);
      break;
    case ClassType.Boss:
      damage = rndT(20);
      break;
    default:
      damage = rndT(8);
      break;
  }

  // Distance reduces damage slightly
  if (dist > 2) {
    damage = Math.max(1, damage - Math.floor(dist / 2));
  }

  // Apply damage to player
  world.gamestate.health -= damage;
  if (world.gamestate.health <= 0) {
    world.gamestate.health = 0;
    world.playstate = ExitType.Died;
  }
}

/**
 * T_Bite: Dog melee attack.
 * Must be adjacent to the player to deal damage.
 */
export function T_Bite(world: WorldState, actor: Actor): void {
  const dx = Math.abs(actor.tilex - world.player.tilex);
  const dy = Math.abs(actor.tiley - world.player.tiley);

  // Must be adjacent
  if (dx > 1 || dy > 1) return;

  // Check actual distance in global coordinates for more precision
  const gdx = Math.abs(actor.x - world.player.x);
  const gdy = Math.abs(actor.y - world.player.y);

  if (
    gdx > TILEGLOBAL + (TILEGLOBAL >> 1) ||
    gdy > TILEGLOBAL + (TILEGLOBAL >> 1)
  ) {
    return;
  }

  // Random chance to hit (dogs are less reliable than guns)
  if (rnd(256) < 180) {
    // Hit - deal 1-8 damage
    const damage = rndT(8);
    world.gamestate.health -= damage;
    if (world.gamestate.health <= 0) {
      world.gamestate.health = 0;
      world.playstate = ExitType.Died;
    }
  }
}

/**
 * T_DogChase: Dog-specific chase behavior.
 * Dogs are faster and use a different attack (bite) instead of shooting.
 */
export function T_DogChase(world: WorldState, actor: Actor): void {
  // Check if close enough to bite
  const dx = Math.abs(actor.tilex - world.player.tilex);
  const dy = Math.abs(actor.tiley - world.player.tiley);

  if (dx <= 1 && dy <= 1) {
    // Try to bite
    actor.state = s_dog_bite1;
    actor.ticcount = s_dog_bite1.tictime;
    if (s_dog_bite1.action) s_dog_bite1.action(actor);
    return;
  }

  // Chase the player
  selectChaseDir(world, actor);

  if (actor.dir !== DirType.NoDir) {
    tryMove(world, actor);
  }
}

/**
 * T_Projectile: Move a projectile (needle, fireball, rocket).
 * Projectiles move in a straight line and check for collisions.
 */
export function T_Projectile(world: WorldState, actor: Actor): void {
  // Move projectile
  const speed = actor.speed;
  const dirAngle = DIR_ANGLE[actor.dir] % 360;

  // Ensure tables are available
  if (costable.length === 0 || sintable.length === 0) return;

  const xmove = fixedByFrac(speed, costable[dirAngle % costable.length]);
  const ymove = -fixedByFrac(speed, sintable[dirAngle % sintable.length]);

  actor.x += xmove;
  actor.y += ymove;

  // Update tile position
  actor.tilex = actor.x >> TILESHIFT;
  actor.tiley = actor.y >> TILESHIFT;

  // Check for wall collision
  const idx = tileIndex(actor.tilex, actor.tiley);
  if (
    actor.tilex < 0 ||
    actor.tilex >= MAPSIZE ||
    actor.tiley < 0 ||
    actor.tiley >= MAPSIZE
  ) {
    // Out of bounds
    actor.obclass = ClassType.Nothing;
    actor.state = null;
    return;
  }

  if (world.tilemap[idx] > 0 && world.tilemap[idx] < 128) {
    // Hit a wall - remove projectile
    actor.obclass = ClassType.Nothing;
    actor.state = null;
    return;
  }

  // Check for player collision
  const pdx = Math.abs(actor.x - world.player.x);
  const pdy = Math.abs(actor.y - world.player.y);

  if (pdx < MINDIST && pdy < MINDIST) {
    // Hit the player
    const damage = rndT(15);
    world.gamestate.health -= damage;
    if (world.gamestate.health <= 0) {
      world.gamestate.health = 0;
      world.playstate = ExitType.Died;
    }
    // Remove projectile
    actor.obclass = ClassType.Nothing;
    actor.state = null;
  }
}

// ============================================================
// Pathfinding (from WL_STATE.C)
// ============================================================

/**
 * Select a direction that moves toward the player.
 * Tries the ideal direction first, then alternatives.
 *
 * Based on WL_STATE.C::SelectChaseDir()
 */
export function selectChaseDir(world: WorldState, actor: Actor): void {
  const player = world.player;
  const deltax = player.tilex - actor.tilex;
  const deltay = player.tiley - actor.tiley;

  // Determine desired X and Y directions
  let xdir: DirType;
  let ydir: DirType;

  if (deltax > 0) {
    xdir = DirType.East;
  } else if (deltax < 0) {
    xdir = DirType.West;
  } else {
    xdir = DirType.NoDir;
  }

  if (deltay > 0) {
    ydir = DirType.South;
  } else if (deltay < 0) {
    ydir = DirType.North;
  } else {
    ydir = DirType.NoDir;
  }

  // Avoid going back the way we came
  const olddir = actor.dir;
  const turnaround = OPPOSITE[olddir];

  // Try the primary directions (prefer the axis with more distance)
  let tdir1: DirType;
  let tdir2: DirType;

  if (Math.abs(deltay) > Math.abs(deltax)) {
    tdir1 = ydir;
    tdir2 = xdir;
  } else {
    tdir1 = xdir;
    tdir2 = ydir;
  }

  // Don't try turnaround as a first option
  if (tdir1 === turnaround) tdir1 = DirType.NoDir;
  if (tdir2 === turnaround) tdir2 = DirType.NoDir;

  // Try diagonal (combination of both axes)
  if (tdir1 !== DirType.NoDir && tdir2 !== DirType.NoDir) {
    // Compute diagonal direction
    const diagIdx =
      ((deltay < 0 ? -1 : deltay > 0 ? 1 : 0) + 1) * 3 +
      ((deltax < 0 ? -1 : deltax > 0 ? 1 : 0) + 1);
    const diagDir = DIR_TABLE[diagIdx];
    if (diagDir !== turnaround && canMoveDir(world, actor, diagDir)) {
      actor.dir = diagDir;
      return;
    }
  }

  // Try the primary directions individually
  // Randomize which one to try first if both are valid
  if (rnd(2) === 0) {
    const temp = tdir1;
    tdir1 = tdir2;
    tdir2 = temp;
  }

  if (tdir1 !== DirType.NoDir && canMoveDir(world, actor, tdir1)) {
    actor.dir = tdir1;
    return;
  }

  if (tdir2 !== DirType.NoDir && canMoveDir(world, actor, tdir2)) {
    actor.dir = tdir2;
    return;
  }

  // If the original direction is available, keep going
  if (olddir !== DirType.NoDir && canMoveDir(world, actor, olddir)) {
    actor.dir = olddir;
    return;
  }

  // Try all cardinal directions
  // Start from a random direction to add variety
  const start = rnd(4);
  for (let i = 0; i < 4; i++) {
    const testDir = CARD_DIRS[(start + i) % 4];
    if (testDir !== turnaround && canMoveDir(world, actor, testDir)) {
      actor.dir = testDir;
      return;
    }
  }

  // Last resort: turnaround
  if (turnaround !== DirType.NoDir && canMoveDir(world, actor, turnaround)) {
    actor.dir = turnaround;
    return;
  }

  actor.dir = DirType.NoDir; // Stuck
}

/**
 * Select a direction to run AWAY from the player.
 * Used when an enemy is retreating.
 */
export function selectRunDir(world: WorldState, actor: Actor): void {
  const player = world.player;
  const deltax = player.tilex - actor.tilex;
  const deltay = player.tiley - actor.tiley;

  // Run in the opposite direction of the player
  let xdir: DirType;
  let ydir: DirType;

  if (deltax > 0) {
    xdir = DirType.West; // Run away from player
  } else if (deltax < 0) {
    xdir = DirType.East;
  } else {
    xdir = DirType.NoDir;
  }

  if (deltay > 0) {
    ydir = DirType.North; // Run away from player
  } else if (deltay < 0) {
    ydir = DirType.South;
  } else {
    ydir = DirType.NoDir;
  }

  const turnaround = OPPOSITE[actor.dir];

  // Try diagonal away from player first
  if (xdir !== DirType.NoDir && ydir !== DirType.NoDir) {
    const dxSign = deltax > 0 ? -1 : deltax < 0 ? 1 : 0;
    const dySign = deltay > 0 ? -1 : deltay < 0 ? 1 : 0;
    const diagIdx = (dySign + 1) * 3 + (dxSign + 1);
    const diagDir = DIR_TABLE[diagIdx];
    if (diagDir !== turnaround && canMoveDir(world, actor, diagDir)) {
      actor.dir = diagDir;
      return;
    }
  }

  // Try individual run-away directions
  if (xdir !== DirType.NoDir && canMoveDir(world, actor, xdir)) {
    actor.dir = xdir;
    return;
  }

  if (ydir !== DirType.NoDir && canMoveDir(world, actor, ydir)) {
    actor.dir = ydir;
    return;
  }

  // Try any available direction
  for (let i = 0; i < 4; i++) {
    const testDir = CARD_DIRS[i];
    if (canMoveDir(world, actor, testDir)) {
      actor.dir = testDir;
      return;
    }
  }

  actor.dir = DirType.NoDir;
}

/**
 * Select the next direction for a patrolling enemy.
 * In the original game, patrol directions are embedded in the map data.
 * Here, we use a simple approach: continue in the current direction,
 * turn right if blocked, then try other directions.
 */
export function selectPathDir(world: WorldState, actor: Actor): void {
  const olddir = actor.dir;

  // If current direction is valid, keep going
  if (olddir !== DirType.NoDir && canMoveDir(world, actor, olddir)) {
    return;
  }

  // Try turning right (clockwise in DirType enum)
  // Cardinal: East(0), North(2), West(4), South(6)
  const rightTurns: Record<number, DirType> = {
    [DirType.East]: DirType.South,
    [DirType.South]: DirType.West,
    [DirType.West]: DirType.North,
    [DirType.North]: DirType.East,
    [DirType.NorthEast]: DirType.SouthEast,
    [DirType.SouthEast]: DirType.SouthWest,
    [DirType.SouthWest]: DirType.NorthWest,
    [DirType.NorthWest]: DirType.NorthEast,
  };

  const leftTurns: Record<number, DirType> = {
    [DirType.East]: DirType.North,
    [DirType.North]: DirType.West,
    [DirType.West]: DirType.South,
    [DirType.South]: DirType.East,
    [DirType.NorthEast]: DirType.NorthWest,
    [DirType.NorthWest]: DirType.SouthWest,
    [DirType.SouthWest]: DirType.SouthEast,
    [DirType.SouthEast]: DirType.NorthEast,
  };

  // Try right turn
  const rightDir = rightTurns[olddir];
  if (rightDir !== undefined && canMoveDir(world, actor, rightDir)) {
    actor.dir = rightDir;
    return;
  }

  // Try left turn
  const leftDir = leftTurns[olddir];
  if (leftDir !== undefined && canMoveDir(world, actor, leftDir)) {
    actor.dir = leftDir;
    return;
  }

  // Try reverse
  const reverse = OPPOSITE[olddir];
  if (reverse !== DirType.NoDir && canMoveDir(world, actor, reverse)) {
    actor.dir = reverse;
    return;
  }

  // No valid direction found
  actor.dir = DirType.NoDir;
}

// ============================================================
// Movement Helpers
// ============================================================

/**
 * Check if an actor can move in a given direction.
 * The target tile must be walkable and within bounds.
 */
function canMoveDir(world: WorldState, actor: Actor, dir: DirType): boolean {
  if (dir === DirType.NoDir) return false;

  const nx = actor.tilex + DX[dir];
  const ny = actor.tiley + DY[dir];

  // Bounds check
  if (nx < 0 || nx >= MAPSIZE || ny < 0 || ny >= MAPSIZE) return false;

  // Check if destination tile is walkable
  if (!isTileWalkable(world, nx, ny)) return false;

  // For diagonal movement, also check that both adjacent cardinal tiles are clear
  // (can't cut through wall corners)
  if (
    dir === DirType.NorthEast ||
    dir === DirType.NorthWest ||
    dir === DirType.SouthEast ||
    dir === DirType.SouthWest
  ) {
    // Check the two cardinal tiles that form this diagonal
    const cx = actor.tilex + DX[dir];
    const cy = actor.tiley;
    const dx = actor.tilex;
    const dy = actor.tiley + DY[dir];

    if (isTileSolid(world, cx, cy) || isTileSolid(world, dx, dy)) {
      return false;
    }
  }

  return true;
}

/**
 * Try to move the actor in its current direction.
 * Updates position and tile coordinates.
 * Returns true if the move was successful.
 */
function tryMove(world: WorldState, actor: Actor): boolean {
  if (actor.dir === DirType.NoDir) return false;

  const speed = actor.speed;
  if (speed <= 0) return false;

  const dirAngle = DIR_ANGLE[actor.dir] % 360;

  // Safety check for table bounds
  if (dirAngle >= costable.length || dirAngle >= sintable.length) return false;

  const xmove = fixedByFrac(speed, costable[dirAngle]);
  const ymove = -fixedByFrac(speed, sintable[dirAngle]);

  const newx = actor.x + xmove;
  const newy = actor.y + ymove;

  const newtilex = newx >> TILESHIFT;
  const newtiley = newy >> TILESHIFT;

  // Check if we're entering a new tile
  if (newtilex !== actor.tilex || newtiley !== actor.tiley) {
    // Verify the new tile is walkable
    if (!isTileWalkable(world, newtilex, newtiley)) {
      return false;
    }

    // Update actorat grid
    const oldIdx = tileIndex(actor.tilex, actor.tiley);
    const newIdx = tileIndex(newtilex, newtiley);

    if (world.actorat[oldIdx] === actor) {
      world.actorat[oldIdx] = null;
    }
    world.actorat[newIdx] = actor;

    actor.tilex = newtilex;
    actor.tiley = newtiley;
  }

  actor.x = newx;
  actor.y = newy;

  return true;
}

// ============================================================
// Line of Sight (from WL_STATE.C)
// ============================================================

/**
 * Check if an actor can see the player.
 * Considers the actor's facing direction, line of sight through tiles,
 * and area connectivity.
 */
export function checkSight(world: WorldState, actor: Actor): boolean {
  const player = world.player;

  // Check area connectivity first (cheap check)
  if (!world.areabyplayer[actor.areanumber]) {
    return false;
  }

  // Check if actor is in the player's area or a connected area
  // (This was already handled by areabyplayer, but double-check)

  // Check facing direction
  // The actor should be roughly facing toward the player
  const deltax = player.tilex - actor.tilex;
  const deltay = player.tiley - actor.tiley;

  // Skip directional check for actors in attack mode (they always see)
  if (!(actor.flags & FL_ATTACKMODE)) {
    // Verify the player is in the actor's forward arc (roughly 180 degrees)
    switch (actor.dir) {
      case DirType.North:
        if (deltay > 0) return false; // Player is south of us, we face north
        break;
      case DirType.East:
        if (deltax < 0) return false;
        break;
      case DirType.South:
        if (deltay < 0) return false;
        break;
      case DirType.West:
        if (deltax > 0) return false;
        break;
      case DirType.NorthEast:
        if (deltay > 0 && deltax < 0) return false;
        break;
      case DirType.NorthWest:
        if (deltay > 0 && deltax > 0) return false;
        break;
      case DirType.SouthEast:
        if (deltay < 0 && deltax < 0) return false;
        break;
      case DirType.SouthWest:
        if (deltay < 0 && deltax > 0) return false;
        break;
      default:
        break;
    }
  }

  // Trace a line from actor to player, checking for walls
  return checkLine(world, actor.x, actor.y, player.x, player.y);
}

/**
 * Check if a line from (x1,y1) to (x2,y2) in global coordinates
 * is clear of walls. Uses a tile-stepping algorithm similar to
 * Bresenham's but in tile space.
 *
 * Returns true if the line is clear (no wall blocks it).
 */
export function checkLine(
  world: WorldState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  // Convert to tile coordinates
  let tx1 = x1 >> TILESHIFT;
  let ty1 = y1 >> TILESHIFT;
  const tx2 = x2 >> TILESHIFT;
  const ty2 = y2 >> TILESHIFT;

  // If both are in the same tile, sight is clear
  if (tx1 === tx2 && ty1 === ty2) return true;

  const dx = tx2 - tx1;
  const dy = ty2 - ty1;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;

  // Use a Bresenham-style stepping through tiles
  let err: number;

  if (adx >= ady) {
    // X-major
    err = adx >> 1;
    for (let i = 0; i < adx; i++) {
      tx1 += sx;
      err -= ady;
      if (err < 0) {
        ty1 += sy;
        err += adx;
      }

      // Reached the target tile
      if (tx1 === tx2 && ty1 === ty2) return true;

      // Check this tile for walls
      if (isTileSolid(world, tx1, ty1)) return false;
    }
  } else {
    // Y-major
    err = ady >> 1;
    for (let i = 0; i < ady; i++) {
      ty1 += sy;
      err -= adx;
      if (err < 0) {
        tx1 += sx;
        err += ady;
      }

      // Reached the target tile
      if (tx1 === tx2 && ty1 === ty2) return true;

      // Check this tile for walls
      if (isTileSolid(world, tx1, ty1)) return false;
    }
  }

  return true;
}

// ============================================================
// First Sighting (from WL_STATE.C)
// ============================================================

/**
 * Called when an enemy first spots the player.
 * Switches the enemy to chase/attack mode and alerts nearby enemies.
 */
export function firstSighting(world: WorldState, actor: Actor): void {
  // Switch to attack mode
  actor.flags |= FL_ATTACKMODE | FL_FIRSTATTACK;
  actor.flags &= ~FL_AMBUSH; // No longer ambushing

  // Switch to chase state
  const chaseState = getChaseState(actor.obclass);
  actor.state = chaseState;
  actor.ticcount = chaseState.tictime > 0 ? rnd(chaseState.tictime) + 1 : 1;

  // Activate the actor (it now wakes up)
  actor.active = ActiveType.Yes;

  // Set speed based on enemy type
  switch (actor.obclass) {
    case ClassType.Dog:
      actor.speed = SPDDOG;
      break;
    case ClassType.Boss:
    case ClassType.Schabbs:
    case ClassType.Fake:
    case ClassType.MechaHitler:
    case ClassType.RealHitler:
      actor.speed = SPDPATROL * 3; // Bosses are faster
      break;
    default:
      actor.speed = SPDPATROL * 3; // Chasing is faster than patrolling
      break;
  }

  // Alert nearby enemies in the same area
  // (sound propagation through connected areas)
  if (world.madenoise || !(actor.flags & FL_AMBUSH)) {
    alertNearbyEnemies(world, actor);
  }
}

/**
 * Alert enemies in connected areas that the player has been spotted.
 * This simulates the "alert cascade" from the original game where
 * one enemy spotting the player causes others to wake up.
 */
function alertNearbyEnemies(world: WorldState, spotter: Actor): void {
  for (let i = 1; i <= world.lastobj; i++) {
    const other = world.objlist[i];

    // Skip inactive, dead, or already attacking enemies
    if (other.obclass === ClassType.Nothing) continue;
    if (other.obclass === ClassType.Player) continue;
    if (other === spotter) continue;
    if (other.flags & FL_ATTACKMODE) continue;
    if (!(other.flags & FL_SHOOTABLE)) continue;

    // Must be in a connected area
    if (!world.areabyplayer[other.areanumber]) continue;

    // Check distance (only alert nearby enemies, within ~5 tiles)
    const dx = Math.abs(other.tilex - spotter.tilex);
    const dy = Math.abs(other.tiley - spotter.tiley);
    if (dx > 10 || dy > 10) continue;

    // Alert this enemy
    other.flags |= FL_ATTACKMODE;
    other.active = ActiveType.Yes;

    const chaseState = getChaseState(other.obclass);
    other.state = chaseState;
    other.ticcount = chaseState.tictime > 0 ? rnd(chaseState.tictime) + 1 : 1;

    // Set chase speed
    if (other.obclass === ClassType.Dog) {
      other.speed = SPDDOG;
    } else {
      other.speed = SPDPATROL * 3;
    }
  }
}

// ============================================================
// Damage / Pain handling
// ============================================================

/**
 * Called when an actor takes damage.
 * Reduces hitpoints and switches to pain/death state if needed.
 * This is called from outside (e.g., the player attack system).
 */
export function damageActor(
  world: WorldState,
  actor: Actor,
  damage: number,
): void {
  if (!(actor.flags & FL_SHOOTABLE)) return;

  actor.hitpoints -= damage;

  if (actor.hitpoints <= 0) {
    // Kill the actor
    actor.hitpoints = 0;
    killActor(world, actor);

    // Switch to death state
    const deathState = getDeathState(actor.obclass);
    actor.state = deathState;
    actor.ticcount = deathState.tictime;
    if (deathState.action) deathState.action(actor);
    return;
  }

  // Actor is still alive -- switch to pain state and become active
  if (!(actor.flags & FL_ATTACKMODE)) {
    firstSighting(world, actor);
  } else {
    // Brief pain state
    const painState = getPainState(actor.obclass);
    actor.state = painState;
    actor.ticcount = painState.tictime;
    if (painState.action) painState.action(actor);
  }
}
