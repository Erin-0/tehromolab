import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialTARSState,
  isPointInsideKeepout,
  pickRandomTARSTarget,
  stepTARSAI,
  normalizeAngleDiff,
  mechSin,
  TABLES_KEEPOUT_ZONE,
  TARS_ALLOWED_SECTORS,
  CONCOURSE_CIRCUIT,
  cycleTARSLocomotionMode,
  setTARSLocomotionMode,
  doesTrajectoryCrossTables,
  pickSmartNextTARSTarget,
  computeKeepoutRepulsion,
} from './tarsNavigation';

test('Initial TARS state spawns safely outside table keep-out zone', () => {
  const tars = createInitialTARSState();
  assert.equal(isPointInsideKeepout(tars.x, tars.z, 0.2), false);
  assert.equal(tars.state, 'WALKING');
  assert.equal(tars.gait, 'WALK_2_2');
});

test('TARS locomotion modes cycle cleanly between 2-2 Walk, 1-2-1 Crawl, and Pinwheel Spin', () => {
  const tars = createInitialTARSState();
  assert.equal(tars.gait, 'WALK_2_2');

  const m1 = cycleTARSLocomotionMode(tars);
  assert.equal(m1, 'CRAWL_1_2_1');
  assert.equal(tars.walkSpeed, 1.40);

  const m2 = cycleTARSLocomotionMode(tars);
  assert.equal(m2, 'SPIN_WHEEL');
  assert.equal(tars.walkSpeed, 4.2);

  const m3 = cycleTARSLocomotionMode(tars);
  assert.equal(m3, 'WALK_2_2');
  assert.equal(tars.walkSpeed, 1.85);
});

test('pickRandomTARSTarget always yields coordinates outside the table keep-out zone', () => {
  // Test across multiple random seeds
  for (let i = 0; i < 50; i++) {
    const target = pickRandomTARSTarget(TARS_ALLOWED_SECTORS);
    const inside = isPointInsideKeepout(target.x, target.z, 0.0);
    assert.equal(inside, false, `Target (${target.x}, ${target.z}) must not be inside keep-out zone`);
  }
});

test('normalizeAngleDiff properly wraps angles within [-PI, PI]', () => {
  assert.equal(Math.abs(normalizeAngleDiff(Math.PI, -Math.PI)) < 0.001, true);
  assert.equal(Math.abs(normalizeAngleDiff(0.5, 0.2) - 0.3) < 0.001, true);
  const wrap = normalizeAngleDiff(0, 3 * Math.PI);
  assert.equal(Math.abs(Math.abs(wrap) - Math.PI) < 0.001, true);
});

test('mechSin produces smooth symmetric cyclic oscillation with peak |1|', () => {
  assert.equal(Math.abs(mechSin(0)) < 0.001, true);
  assert.equal(Math.abs(mechSin(0.25) - 1.0) < 0.001, true);
  assert.equal(Math.abs(mechSin(0.5)) < 0.001, true);
  assert.equal(Math.abs(mechSin(0.75) + 1.0) < 0.001, true);
});

test('stepTARSAI navigates and prevents wandering into table keep-out zone', () => {
  let state = createInitialTARSState();
  // Simulate 30 seconds of autonomous wandering
  for (let step = 0; step < 600; step++) {
    state = stepTARSAI(state, 0.05);
    const inside = isPointInsideKeepout(state.x, state.z, 0.1);
    assert.equal(inside, false, `TARS position (${state.x.toFixed(2)}, ${state.z.toFixed(2)}) must NEVER enter table keep-out zone`);
  }
});

test('doesTrajectoryCrossTables accurately detects intersecting and clear line segments', () => {
  // A path right through the middle of the tables (x: 0, z: -10 to x: 0, z: 15) must be flagged
  const cutsAcross = doesTrajectoryCrossTables(0, -10, 0, 15, 0.5);
  assert.equal(cutsAcross, true, 'Trajectory directly slicing through tables must return true');

  // A path entirely within the South Promenade (x: -10, z: 15 to x: 10, z: 15) must be clear
  const southClear = doesTrajectoryCrossTables(-10, 15, 10, 15, 0.5);
  assert.equal(southClear, false, 'South concourse path must not intersect tables');

  // A path entirely in the North Gallery (x: -10, z: -8 to x: 10, z: -8) must be clear
  const northClear = doesTrajectoryCrossTables(-10, -8, 10, -8, 0.5);
  assert.equal(northClear, false, 'North concourse path must not intersect tables');
});

test('All nodes in CONCOURSE_CIRCUIT remain safely outside table keepout zone', () => {
  for (let i = 0; i < CONCOURSE_CIRCUIT.length; i++) {
    const node = CONCOURSE_CIRCUIT[i];
    const inside = isPointInsideKeepout(node.x, node.z, 0.5);
    assert.equal(inside, false, `Circuit node ${i} at (${node.x}, ${node.z}) must not be inside keep-out zone`);

    // Verify consecutive segment does not cross tables
    const nextNode = CONCOURSE_CIRCUIT[(i + 1) % CONCOURSE_CIRCUIT.length];
    const crosses = doesTrajectoryCrossTables(node.x, node.z, nextNode.x, nextNode.z, 0.5);
    assert.equal(crosses, false, `Circuit edge from node ${i} to ${(i + 1) % CONCOURSE_CIRCUIT.length} must not cross tables`);
  }
});

test('pickSmartNextTARSTarget produces non-intersecting perimeter targets', () => {
  for (let i = 0; i < CONCOURSE_CIRCUIT.length; i++) {
    const cur = CONCOURSE_CIRCUIT[i];
    const { target, nextIndex } = pickSmartNextTARSTarget(cur.x, cur.z, i);
    assert.equal(isPointInsideKeepout(target.x, target.z, 0.5), false);
    assert.equal(doesTrajectoryCrossTables(cur.x, cur.z, target.x, target.z, 0.5), false);
    assert.equal(nextIndex >= 0 && nextIndex < CONCOURSE_CIRCUIT.length, true);
  }
});

test('computeKeepoutRepulsion generates outward pointing vectors away from the table bounding box', () => {
  // Point near south face of keepout (z = 9.0, just outside maxZ = 8.2)
  const repSouth = computeKeepoutRepulsion(5.0, 9.0);
  assert.equal(repSouth.rz > 0, true, 'Repulsion vector near south face must push southward (+z)');

  // Point far away in concourse (z = 18.0)
  const repFar = computeKeepoutRepulsion(5.0, 18.0);
  assert.equal(repFar.rx === 0 && repFar.rz === 0, true, 'Far away point has zero repulsion');
});

