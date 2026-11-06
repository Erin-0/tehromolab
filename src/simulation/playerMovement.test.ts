import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LAB_WALKABLE_BOUNDS,
  MAX_ZOOM_FOV_DEG,
  MIN_ZOOM_FOV_DEG,
  applyMouseLookDelta,
  applyWheelZoom,
  createInitialPlayerCameraState,
  mapKeyCodeToMovementAction,
  resolveLabCollisions,
  stepPlayerCameraState,
} from './playerMovement';

test('Zoom wheel clamps camera FOV strictly within [MIN_ZOOM_FOV_DEG, MAX_ZOOM_FOV_DEG]', () => {
  let cam = createInitialPlayerCameraState();
  for (let i = 0; i < 30; i++) {
    cam = applyWheelZoom(cam, -120);
  }
  assert.equal(cam.targetFov, MIN_ZOOM_FOV_DEG);

  for (let i = 0; i < 40; i++) {
    cam = applyWheelZoom(cam, 120);
  }
  assert.equal(cam.targetFov, MAX_ZOOM_FOV_DEG);
});

test('Keyboard mapping supports QWERTY WASD, French AZERTY ZQSD, and Arrow keys', () => {
  assert.equal(mapKeyCodeToMovementAction('KeyW'), 'forward');
  assert.equal(mapKeyCodeToMovementAction('KeyZ'), 'forward');
  assert.equal(mapKeyCodeToMovementAction('ArrowUp'), 'forward');
  assert.equal(mapKeyCodeToMovementAction('KeyQ'), 'left');
  assert.equal(mapKeyCodeToMovementAction('KeyA'), 'left');
});

test('Player movement stays strictly inside bounded laboratory zone and slides outside tables', () => {
  let cam = createInitialPlayerCameraState();
  // Walk far forward toward Table 1 / Table 2
  for (let i = 0; i < 80; i++) {
    cam = stepPlayerCameraState(
      cam,
      { forward: true, backward: false, left: false, right: false },
      0.1,
    );
  }
  assert.ok(cam.x >= LAB_WALKABLE_BOUNDS.minX && cam.x <= LAB_WALKABLE_BOUNDS.maxX);
  assert.ok(cam.z >= LAB_WALKABLE_BOUNDS.minZ && cam.z <= LAB_WALKABLE_BOUNDS.maxZ);

  // Attempting to place inside Table 1 (-0.55, 0.15) pushes camera outside obstacle AABB
  const pushed = resolveLabCollisions(-0.55, 1.75);
  assert.ok(pushed.z > 1.88, `Expected collision push in front of table1, got z=${pushed.z}`);

  // Pitch clamps cleanly on steep vertical mouse movement
  const pitched = applyMouseLookDelta(cam, 0, -50000);
  assert.ok(pitched.pitch <= 1.29 && pitched.pitch >= -1.29);
});
