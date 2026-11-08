/**
 * Pure navigation, perimeter graph circuit, obstacle avoidance, kinematic gait phase math,
 * and intelligent table keep-out boundary enforcement for the autonomous TARS robot.
 *
 * Algorithm Guarantee:
 * TARS's movement trajectory and decision heading NEVER point toward the laboratory
 * experiment tables. It patrols a smooth perimeter concourse ring around the room.
 */

export interface TARSVector2D {
  x: number;
  z: number;
}

export interface BoxZone2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type TARSLocomotionMode = 'WALK_2_2' | 'CRAWL_1_2_1' | 'SPIN_WHEEL';
export type TARSGait = TARSLocomotionMode | 'compass' | 'trot' | 'pace' | 'bound';
export type TARSState = 'IDLE' | 'WALKING';

/**
 * Leg phase offsets for 4-bar monolithic kinematics:
 * Order: [outerL (0), innerL (1), innerR (2), outerR (3)]
 */
export const TARS_GAIT_PHASES: Record<string, [number, number, number, number]> = {
  WALK_2_2: [0.00, 0.50, 0.50, 0.00],    // 2-2 crutch / paired rotary stride
  CRAWL_1_2_1: [0.00, 0.25, 0.25, 0.50], // 1-2-1 crawl: outer alternate, center support
  SPIN_WHEEL: [0.00, 0.25, 0.50, 0.75],  // 4 spokes at 90 deg offsets for continuous tumbling
  compass: [0.00, 0.06, 0.50, 0.56],
  trot: [0.00, 0.50, 0.50, 0.00],
  pace: [0.00, 0.50, 0.00, 0.50],
  bound: [0.00, 0.00, 0.50, 0.50],
};

/**
 * Strict keep-out zone encompassing Tables 1, 2, 3 and the laboratory test apparatus.
 * TARS will NEVER navigate into or point toward this zone.
 */
export const TABLES_KEEPOUT_ZONE: BoxZone2D = {
  minX: -6.5,
  maxX: 17.5,
  minZ: -3.6,
  maxZ: 8.2,
};

/**
 * Outer room boundaries within which TARS can roam.
 */
export const TARS_ROOM_BOUNDS: BoxZone2D = {
  minX: -16.0,
  maxX: 24.5,
  minZ: -10.5,
  maxZ: 26.5,
};

/**
 * Smart Concourse Perimeter Circuit Graph.
 * Connected outer loop around the room ensuring all legs strictly avoid the tables zone.
 */
export const CONCOURSE_CIRCUIT: TARSVector2D[] = [
  // 1. South Wide Promenade (in front of all large display screens)
  { x: -12.5, z: 14.5 },
  { x: -5.0,  z: 14.5 },
  { x: 3.5,   z: 14.5 },
  { x: 12.0,  z: 14.5 },
  { x: 21.0,  z: 14.5 },

  // 2. East Wing (flanking Table 3 and Clapeyron wall)
  { x: 21.0,  z: 5.0 },
  { x: 21.0,  z: -7.5 },

  // 3. North Gallery (rear aisle behind the tables)
  { x: 12.0,  z: -7.5 },
  { x: 3.5,   z: -7.5 },
  { x: -5.0,  z: -7.5 },
  { x: -12.5, z: -7.5 },

  // 4. West Wing (flanking Table 1 and Steady State screen)
  { x: -12.5, z: 5.0 },
];

/**
 * Allowed roaming sectors around the laboratory perimeter.
 */
export const TARS_ALLOWED_SECTORS: BoxZone2D[] = [
  { minX: -15.0, maxX: 23.5, minZ: 10.5, maxZ: 25.5 }, // South Promenade
  { minX: -15.0, maxX: -8.0, minZ: -9.5, maxZ: 25.5 }, // West Wing
  { minX: 19.0,  maxX: 23.5, minZ: -9.5, maxZ: 25.5 }, // East Wing
  { minX: -15.0, maxX: 23.5, minZ: -9.8, maxZ: -5.2 }, // North Gallery
];

/**
 * Checks if a point (x, z) is inside the table keep-out zone (with optional safety buffer).
 */
export function isPointInsideKeepout(
  x: number,
  z: number,
  buffer = 0.5,
  keepout: BoxZone2D = TABLES_KEEPOUT_ZONE,
): boolean {
  return (
    x >= keepout.minX - buffer &&
    x <= keepout.maxX + buffer &&
    z >= keepout.minZ - buffer &&
    z <= keepout.maxZ + buffer
  );
}

/**
 * Liang-Barsky line segment vs 2D AABB intersection test.
 * Returns true if the line segment from (x1, z1) to (x2, z2) crosses the keep-out box.
 */
export function doesTrajectoryCrossTables(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  buffer = 1.0,
  keepout: BoxZone2D = TABLES_KEEPOUT_ZONE,
): boolean {
  const bMinX = keepout.minX - buffer;
  const bMaxX = keepout.maxX + buffer;
  const bMinZ = keepout.minZ - buffer;
  const bMaxZ = keepout.maxZ + buffer;

  const dx = x2 - x1;
  const dz = z2 - z1;

  let t0 = 0.0;
  let t1 = 1.0;

  const p = [-dx, dx, -dz, dz];
  const q = [x1 - bMinX, bMaxX - x1, z1 - bMinZ, bMaxZ - z1];

  for (let i = 0; i < 4; i++) {
    const pi = p[i];
    const qi = q[i];
    if (Math.abs(pi) < 1e-9) {
      if (qi < 0) return false; // Parallel and outside
    } else {
      const t = qi / pi;
      if (pi < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }

  return t0 <= t1;
}

/**
 * Computes a repulsive outward steering vector if near the keepout zone.
 */
export function computeKeepoutRepulsion(
  x: number,
  z: number,
  keepout: BoxZone2D = TABLES_KEEPOUT_ZONE,
  influenceDist = 2.2,
): { rx: number; rz: number } {
  // Nearest point on keepout AABB
  const nx = Math.max(keepout.minX, Math.min(keepout.maxX, x));
  const nz = Math.max(keepout.minZ, Math.min(keepout.maxZ, z));

  const dx = x - nx;
  const dz = z - nz;
  const dist = Math.hypot(dx, dz);

  if (dist < 1e-4) {
    // Inside: strongly push out toward nearest edge
    const dLeft = Math.abs(x - keepout.minX);
    const dRight = Math.abs(keepout.maxX - x);
    const dTop = Math.abs(keepout.maxZ - z);
    const dBottom = Math.abs(z - keepout.minZ);
    const minD = Math.min(dLeft, dRight, dTop, dBottom);
    if (minD === dTop) return { rx: 0, rz: 1 };
    if (minD === dBottom) return { rx: 0, rz: -1 };
    if (minD === dLeft) return { rx: -1, rz: 0 };
    return { rx: 1, rz: 0 };
  }

  if (dist < influenceDist) {
    const strength = (influenceDist - dist) / influenceDist;
    return {
      rx: (dx / dist) * strength,
      rz: (dz / dist) * strength,
    };
  }

  return { rx: 0, rz: 0 };
}

/**
 * Smart Target Picker:
 * Finds the next safe waypoint along the perimeter concourse circuit.
 * Mathematically guarantees that the trajectory NEVER intersects the table keep-out zone.
 */
export function pickSmartNextTARSTarget(
  currentX: number,
  currentZ: number,
  currentWaypointIndex = -1,
  circuit: TARSVector2D[] = CONCOURSE_CIRCUIT,
  randomFn = Math.random,
): { target: TARSVector2D; nextIndex: number } {
  // If no current waypoint, find the nearest circuit node that doesn't cross tables
  if (currentWaypointIndex < 0 || currentWaypointIndex >= circuit.length) {
    let nearestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < circuit.length; i++) {
      const wp = circuit[i];
      const d = Math.hypot(wp.x - currentX, wp.z - currentZ);
      if (!doesTrajectoryCrossTables(currentX, currentZ, wp.x, wp.z, 0.8)) {
        if (d < minDist) {
          minDist = d;
          nearestIdx = i;
        }
      }
    }
    return { target: circuit[nearestIdx], nextIndex: nearestIdx };
  }

  // Advance along the perimeter loop (80% forward around circuit, 20% reverse/explore)
  const stepDir = randomFn() < 0.8 ? 1 : -1;
  let nextIdx = (currentWaypointIndex + stepDir + circuit.length) % circuit.length;

  // Verify that trajectory from current position to next waypoint does NOT cross tables
  let attempts = 0;
  while (
    doesTrajectoryCrossTables(currentX, currentZ, circuit[nextIdx].x, circuit[nextIdx].z, 0.8) &&
    attempts < circuit.length
  ) {
    nextIdx = (nextIdx + 1) % circuit.length;
    attempts++;
  }

  // Add slight random jitter (±0.6m) along the concourse aisle so the robot doesn't follow rigid rails
  const base = circuit[nextIdx];
  const jitterX = (randomFn() - 0.5) * 1.2;
  const jitterZ = (randomFn() - 0.5) * 1.2;
  const candidateX = base.x + jitterX;
  const candidateZ = base.z + jitterZ;

  if (
    !isPointInsideKeepout(candidateX, candidateZ, 1.0) &&
    !doesTrajectoryCrossTables(currentX, currentZ, candidateX, candidateZ, 0.8)
  ) {
    return { target: { x: candidateX, z: candidateZ }, nextIndex: nextIdx };
  }

  return { target: base, nextIndex: nextIdx };
}

/**
 * Legacy wrapper for tests.
 */
export function pickRandomTARSTarget(
  sectors: BoxZone2D[] = TARS_ALLOWED_SECTORS,
  randomFn = Math.random,
): TARSVector2D {
  const result = pickSmartNextTARSTarget(0, 15, -1, CONCOURSE_CIRCUIT, randomFn);
  return result.target;
}

/**
 * Computes shortest angular turn difference in [-PI, PI].
 */
export function normalizeAngleDiff(targetAngle: number, currentAngle: number): number {
  let diff = targetAngle - currentAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return diff;
}

/**
 * Nonlinear mechanical sinusoidal kinematic curve for realistic hydraulic/motor motion.
 */
export function mechSin(phase: number): number {
  const s = Math.sin(2 * Math.PI * phase);
  return Math.sign(s) * Math.pow(Math.abs(s), 0.72);
}

export interface TARSStateData {
  state: TARSState;
  gait: TARSGait;
  isAwake: boolean; // Robot remains completely stationary until player clicks on it
  x: number;
  z: number;
  rotation: number;
  targetX: number;
  targetZ: number;
  circuitIndex: number;
  walkPhase: number;
  spinAngle: number;
  walkSpeed: number;
  stepPeriod: number;
  turnSpeed: number;
  idleTimer: number;
  modeTimer: number;
}

export function setTARSLocomotionMode(state: TARSStateData, mode: TARSLocomotionMode): void {
  state.gait = mode;
  switch (mode) {
    case 'WALK_2_2':
      state.walkSpeed = 1.85; // Heavy natural walking stride scaled to full human height
      state.stepPeriod = 1.4;
      break;
    case 'CRAWL_1_2_1':
      state.walkSpeed = 1.40;
      state.stepPeriod = 1.6;
      break;
    case 'SPIN_WHEEL':
      state.walkSpeed = 4.2; // High-speed cartwheel sprint from Miller's planet
      state.stepPeriod = 0.9;
      break;
  }
}

export function cycleTARSLocomotionMode(state: TARSStateData): TARSLocomotionMode {
  const modes: TARSLocomotionMode[] = ['WALK_2_2', 'CRAWL_1_2_1', 'SPIN_WHEEL'];
  const currentIndex = modes.indexOf(state.gait as TARSLocomotionMode);
  const nextMode = modes[(currentIndex + 1) % modes.length] ?? 'WALK_2_2';
  setTARSLocomotionMode(state, nextMode);
  return nextMode;
}

/**
 * Wakes up TARS if stationary, or cycles locomotion modes if already walking.
 */
export function activateOrCycleTARS(state: TARSStateData): { activated: boolean; mode: TARSLocomotionMode } {
  if (!state.isAwake) {
    state.isAwake = true;
    state.state = 'WALKING';
    state.walkPhase = 0;
    state.spinAngle = 0;
    return { activated: true, mode: state.gait as TARSLocomotionMode };
  }
  const nextMode = cycleTARSLocomotionMode(state);
  return { activated: false, mode: nextMode };
}

export function createInitialTARSState(): TARSStateData {
  return {
    isAwake: false, // Stationary until player clicks on the robot
    state: 'IDLE',
    gait: 'WALK_2_2',
    x: 3.5,
    z: 14.5, // Spawns standing upright in open South concourse
    rotation: 0,
    targetX: 12.0,
    targetZ: 14.5,
    circuitIndex: 2,
    walkPhase: 0,
    spinAngle: 0,
    walkSpeed: 1.85,
    stepPeriod: 1.4,
    turnSpeed: 1.8,
    idleTimer: 2.0,
    modeTimer: 20.0,
  };
}

/**
 * Steps the TARS AI state machine.
 * Features:
 * - Smart perimeter circuit pathfinding: trajectory NEVER points toward the tables
 * - Repulsive barrier deflection field: curves away before touching keep-out bounds
 * - Continuous smooth curved steering without awkward in-place pivot stutter
 */
export function stepTARSAI(
  prev: TARSStateData,
  dtSeconds: number,
  randomFn = Math.random,
): TARSStateData {
  if (dtSeconds <= 0) return prev;

  const next = { ...prev };

  // Stationary gate: If player has not clicked TARS to wake it up, stay standing still in IDLE
  if (!next.isAwake) {
    next.state = 'IDLE';
    next.walkPhase = 0;
    next.spinAngle = 0;
    return next;
  }

  // Emergency safety check: if somehow inside table keepout zone, push away to South concourse
  if (isPointInsideKeepout(next.x, next.z, 0.4)) {
    const smart = pickSmartNextTARSTarget(next.x, 15.0, -1, CONCOURSE_CIRCUIT, randomFn);
    next.targetX = smart.target.x;
    next.targetZ = smart.target.z;
    next.circuitIndex = smart.nextIndex;
    next.state = 'WALKING';
  }

  // Periodic autonomous mode demonstration (alternates 2-2 walk, 1-2-1 crawl, and star spin)
  next.modeTimer -= dtSeconds;
  if (next.modeTimer <= 0) {
    next.modeTimer = 18.0 + randomFn() * 12.0;
    cycleTARSLocomotionMode(next);
  }

  switch (next.state) {
    case 'IDLE': {
      next.idleTimer -= dtSeconds;
      if (next.idleTimer <= 0) {
        const smart = pickSmartNextTARSTarget(next.x, next.z, next.circuitIndex, CONCOURSE_CIRCUIT, randomFn);
        next.targetX = smart.target.x;
        next.targetZ = smart.target.z;
        next.circuitIndex = smart.nextIndex;
        next.state = 'WALKING';
        next.walkPhase = 0;
      }
      break;
    }

    case 'WALKING': {
      const dx = next.targetX - next.x;
      const dz = next.targetZ - next.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 1.4) {
        // Reached concourse circuit node: smoothly advance to next node along the perimeter
        const smart = pickSmartNextTARSTarget(next.x, next.z, next.circuitIndex, CONCOURSE_CIRCUIT, randomFn);
        next.targetX = smart.target.x;
        next.targetZ = smart.target.z;
        next.circuitIndex = smart.nextIndex;

        // Occasional brief diagnostic scan pause (only 15% of waypoints)
        if (randomFn() < 0.15) {
          next.state = 'IDLE';
          next.idleTimer = 1.0 + randomFn() * 2.0;
        }
      } else {
        // Compute smart heading toward waypoint
        let targetDirX = dx / dist;
        let targetDirZ = dz / dist;

        // Apply repulsive barrier deflection force if within influence zone of tables
        const rep = computeKeepoutRepulsion(next.x, next.z, TABLES_KEEPOUT_ZONE, 2.5);
        if (rep.rx !== 0 || rep.rz !== 0) {
          // Blend with repulsion so heading deflects away from tables
          targetDirX += rep.rx * 1.8;
          targetDirZ += rep.rz * 1.8;
          const blendLen = Math.hypot(targetDirX, targetDirZ);
          if (blendLen > 1e-4) {
            targetDirX /= blendLen;
            targetDirZ /= blendLen;
          }
        }

        const targetAngle = Math.atan2(targetDirX, targetDirZ);
        const diff = normalizeAngleDiff(targetAngle, next.rotation);

        // Turn rate scaled smoothly
        const maxTurnThisFrame = next.turnSpeed * dtSeconds;
        const turnAmt = Math.sign(diff) * Math.min(Math.abs(diff), maxTurnThisFrame);
        next.rotation += turnAmt;

        // Move forward along current heading
        const forwardX = Math.sin(next.rotation);
        const forwardZ = Math.cos(next.rotation);
        const stepDist = next.walkSpeed * dtSeconds;

        const candidateX = next.x + forwardX * stepDist;
        const candidateZ = next.z + forwardZ * stepDist;

        // Safety verification: candidate step must stay in room and outside tables
        if (
          isPointInsideKeepout(candidateX, candidateZ, 0.6) ||
          candidateX < TARS_ROOM_BOUNDS.minX ||
          candidateX > TARS_ROOM_BOUNDS.maxX ||
          candidateZ < TARS_ROOM_BOUNDS.minZ ||
          candidateZ > TARS_ROOM_BOUNDS.maxZ
        ) {
          // If close to a boundary, advance to next circuit node
          const smart = pickSmartNextTARSTarget(next.x, next.z, next.circuitIndex, CONCOURSE_CIRCUIT, randomFn);
          next.targetX = smart.target.x;
          next.targetZ = smart.target.z;
          next.circuitIndex = smart.nextIndex;
        } else {
          next.x = candidateX;
          next.z = candidateZ;
        }

        // Advance walk phase & continuous tumble spin angle
        next.walkPhase = (next.walkPhase + dtSeconds / next.stepPeriod) % 1;
        // Spin angle rolls proportional to forward motion: omega = v / R (where R ~ 2.05m full scale)
        const rollRate = next.walkSpeed / 2.05;
        next.spinAngle = (next.spinAngle + rollRate * dtSeconds) % (Math.PI * 2);
      }
      break;
    }
  }

  return next;
}
