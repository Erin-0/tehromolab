/**
 * Pure first-person desktop camera navigation, bounded laboratory zone clamping,
 * 2D circle-vs-AABB obstacle sliding, and bounded FOV zoom math.
 * Desktop keyboard (WASD / ZQSD / Arrow keys) + mouse look only — no avatar body or hands.
 */

export interface BoxObstacle2D {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RoomBounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlayerCameraState {
  x: number;
  y: number;
  z: number;
  /** Horizontal yaw angle in radians (0 = looking toward -Z laboratory benches) */
  yaw: number;
  /** Vertical pitch angle in radians (positive = looking up, negative = looking down) */
  pitch: number;
  /** Current camera vertical field of view in degrees */
  fov: number;
  /** Target camera vertical field of view in degrees (for smooth wheel zoom) */
  targetFov: number;
}

export interface MovementKeyInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint?: boolean;
}

export const LAB_FLOOR_Y = -2.29;
export const EYE_HEIGHT_Y = 1.62; // Natural human eye level (1.62m above bench level, 3.91m above subfloor)
export const PLAYER_COLLISION_RADIUS = 0.36;

export const DEFAULT_FOV_DEG = 46;
export const MIN_ZOOM_FOV_DEG = 18;
export const MAX_ZOOM_FOV_DEG = 52;
export const MAX_PITCH_RAD = 0.65;

export const LAB_WALKABLE_BOUNDS: RoomBounds2D = {
  minX: -16.5,
  maxX: 24.5,
  minZ: -10.5,
  maxZ: 26.5,
};

/**
 * Physical footprints of Tables 1, 2, 3 and the floor-standing black monitors
 * so the first-person camera walks cleanly through the corridor between them.
 */
export const LAB_OBSTACLES: BoxObstacle2D[] = [
  // Screen 0: Dedicated Steady State monitor to the left of Table 1
  { id: 'board0', minX: -6.00, maxX: -3.80, minZ: 0.50, maxZ: 1.70 },
  // Table 1 (Heat Pump benchtop)
  { id: 'table1', minX: -3.82, maxX: 2.72, minZ: -1.58, maxZ: 1.88 },
  // Table 2 (Pressure Cooker benchtop)
  { id: 'table2', minX: 3.28, maxX: 7.62, minZ: -1.58, maxZ: 1.88 },
  // Table 3 (TP2 Calorimetry benchtop — untouched station)
  { id: 'table3', minX: 8.53, maxX: 15.77, minZ: -1.62, maxZ: 2.02 },
  // Screen 1: Large black monitor facing Table 1 across the wide aisle (at z = 6.40)
  { id: 'board1', minX: -2.40, maxX: 1.30, minZ: 6.05, maxZ: 6.75 },
  // Screen 2: Large black monitor facing Table 2 across the wide aisle (at z = 6.40)
  { id: 'board2', minX: 3.60, maxX: 7.30, minZ: 6.05, maxZ: 6.75 },
  // Screen 3: Large black monitor facing Table 3 across the wide aisle (at z = 6.40)
  { id: 'board3', minX: 10.30, maxX: 14.00, minZ: 6.05, maxZ: 6.75 },
];

export function createInitialPlayerCameraState(): PlayerCameraState {
  // Spawn in the wide promenade corridor (z = 3.80) angled along the aisle (yaw = -1.25 rad)
  // so the player immediately sees the walkway, Table 1/2 on the left, and the large monitors on the right
  return {
    x: -1.60,
    y: EYE_HEIGHT_Y,
    z: 3.80,
    yaw: -1.25,
    pitch: -0.06,
    fov: DEFAULT_FOV_DEG,
    targetFov: DEFAULT_FOV_DEG,
  };
}

export function clampZoomFov(fovDeg: number): number {
  return Math.max(MIN_ZOOM_FOV_DEG, Math.min(MAX_ZOOM_FOV_DEG, fovDeg));
}

export function applyWheelZoom(state: PlayerCameraState, deltaY: number): PlayerCameraState {
  // Scroll up (deltaY < 0) zooms in (smaller FOV); scroll down zooms out up to MAX_ZOOM_FOV_DEG
  const step = Math.sign(deltaY) * Math.min(6.0, Math.max(1.8, Math.abs(deltaY) * 0.03));
  return {
    ...state,
    targetFov: clampZoomFov(state.targetFov + step),
  };
}

export function applyMouseLookDelta(
  state: PlayerCameraState,
  deltaX: number,
  deltaY: number,
  sensitivity = 0.0022,
): PlayerCameraState {
  // Scale sensitivity down slightly when zoomed in so fine aiming with the center dot feels crisp
  const zoomScale = state.fov / DEFAULT_FOV_DEG;
  const effSens = sensitivity * Math.max(0.38, zoomScale);
  const nextYaw = state.yaw - deltaX * effSens;
  const nextPitch = Math.max(
    -MAX_PITCH_RAD,
    Math.min(MAX_PITCH_RAD, state.pitch - deltaY * effSens),
  );
  return {
    ...state,
    yaw: nextYaw,
    pitch: nextPitch,
  };
}

/**
 * Resolves 2D circle-vs-AABB collisions and clamps within the bounded laboratory zone.
 */
export function resolveLabCollisions(
  x: number,
  z: number,
  radius = PLAYER_COLLISION_RADIUS,
  bounds: RoomBounds2D = LAB_WALKABLE_BOUNDS,
  obstacles: BoxObstacle2D[] = LAB_OBSTACLES,
): { x: number; z: number } {
  let rx = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, x));
  let rz = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, z));

  for (let pass = 0; pass < 2; pass++) {
    for (const box of obstacles) {
      const closestX = Math.max(box.minX, Math.min(box.maxX, rx));
      const closestZ = Math.max(box.minZ, Math.min(box.maxZ, rz));
      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          // Center inside AABB: push out along shallowest penetration axis
          const penLeft = Math.abs(rx - box.minX);
          const penRight = Math.abs(box.maxX - rx);
          const penBack = Math.abs(rz - box.minZ);
          const penFront = Math.abs(box.maxZ - rz);
          const minPen = Math.min(penLeft, penRight, penBack, penFront);
          if (minPen === penFront) rz = box.maxZ + radius;
          else if (minPen === penBack) rz = box.minZ - radius;
          else if (minPen === penLeft) rx = box.minX - radius;
          else rx = box.maxX + radius;
        }
      }
    }
    rx = Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, rx));
    rz = Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, rz));
  }

  return { x: rx, z: rz };
}

/**
 * Steps first-person horizontal movement & smooth FOV zoom damping.
 */
export function stepPlayerCameraState(
  prev: PlayerCameraState,
  input: MovementKeyInput,
  dtSeconds: number,
  bounds: RoomBounds2D = LAB_WALKABLE_BOUNDS,
  obstacles: BoxObstacle2D[] = LAB_OBSTACLES,
): PlayerCameraState {
  if (dtSeconds <= 0) return prev;

  const moveForwardAxis = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  const moveStrafeAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  let nextX = prev.x;
  let nextZ = prev.z;

  if (moveForwardAxis !== 0 || moveStrafeAxis !== 0) {
    const len = Math.hypot(moveForwardAxis, moveStrafeAxis);
    const fNorm = moveForwardAxis / len;
    const sNorm = moveStrafeAxis / len;

    // Camera forward horizontal vector for YXZ Euler with yaw around Y:
    // forward = (-sin(yaw), 0, -cos(yaw)), right = (cos(yaw), 0, -sin(yaw))
    const sinY = Math.sin(prev.yaw);
    const cosY = Math.cos(prev.yaw);
    const forwardX = -sinY;
    const forwardZ = -cosY;
    const rightX = cosY;
    const rightZ = -sinY;

    const speed = input.sprint ? 5.6 : 3.5;
    const candidateX = prev.x + (forwardX * fNorm + rightX * sNorm) * speed * dtSeconds;
    const candidateZ = prev.z + (forwardZ * fNorm + rightZ * sNorm) * speed * dtSeconds;

    const resolved = resolveLabCollisions(
      candidateX,
      candidateZ,
      PLAYER_COLLISION_RADIUS,
      bounds,
      obstacles,
    );
    nextX = resolved.x;
    nextZ = resolved.z;
  }

  const fovAlpha = 1 - Math.exp(-12 * dtSeconds);
  const nextFov =
    Math.abs(prev.fov - prev.targetFov) < 0.02
      ? prev.targetFov
      : prev.fov + (prev.targetFov - prev.fov) * fovAlpha;

  return {
    ...prev,
    x: nextX,
    y: EYE_HEIGHT_Y,
    z: nextZ,
    fov: nextFov,
  };
}

/**
 * Maps desktop keyboard `event.code` (supporting both QWERTY WASD, French AZERTY ZQSD, and Arrows)
 * to movement axes.
 */
export function mapKeyCodeToMovementAction(
  code: string,
): keyof MovementKeyInput | null {
  switch (code) {
    case 'KeyW':
    case 'KeyZ':
    case 'ArrowUp':
      return 'forward';
    case 'KeyS':
    case 'ArrowDown':
      return 'backward';
    case 'KeyA':
    case 'KeyQ':
    case 'ArrowLeft':
      return 'left';
    case 'KeyD':
    case 'ArrowRight':
      return 'right';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'sprint';
    default:
      return null;
  }
}
