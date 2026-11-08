import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PressureCookerState,
  computeHeaterPowerW,
  cookerDialValueToNeedleAngleRad,
  createInitialCookerState,
  nextCookerStage,
  nextHeaterDialLevel,
  stageMaxGaugePressureBar,
  stepPressureCookerState,
  waterSaturationPressureBar,
} from './pressureCooker';

test('waterSaturationPressureBar matches atmospheric boiling at 100 °C and rises monotonically', () => {
  const p20 = waterSaturationPressureBar(20);
  const p100 = waterSaturationPressureBar(100);
  const p120 = waterSaturationPressureBar(120);
  const p140 = waterSaturationPressureBar(140);

  assert.ok(Math.abs(p100 - 1.013) < 0.015, `expected ~1.013 bar at 100 °C, got ${p100}`);
  assert.ok(p20 < p100 && p100 < p120 && p120 < p140);
});

test('heating on Stage 0, Stage 1, and Stage 2 regulates gauge pressure at each stage threshold', () => {
  for (const stage of [0, 1, 2] as const) {
    let st: PressureCookerState = {
      ...createInitialCookerState(false),
      stage,
      pluggedIn: true,
      heaterOn: true,
      heaterLevel: 6,
      heaterPowerW: computeHeaterPowerW(true, 6),
    };

    for (let i = 0; i < 400; i++) {
      st = stepPressureCookerState(st, 1.0);
    }

    const expectedMaxBar = stageMaxGaugePressureBar(stage);
    assert.ok(
      Math.abs(st.pressureBar - expectedMaxBar) < 0.025,
      `Stage ${stage}: expected pressure ~${expectedMaxBar} bar, got ${st.pressureBar}`,
    );
    assert.ok(st.steamVentRate > 0.15, `Stage ${stage}: expected active steam venting at ceiling`);
  }
});

test('turning red switch OFF or setting numerical dial to 0 cuts heating power to 0 W and cools', () => {
  assert.equal(computeHeaterPowerW(false, 6), 0);
  assert.equal(computeHeaterPowerW(true, 0), 0);
  assert.equal(computeHeaterPowerW(true, 3), 750);
  assert.equal(computeHeaterPowerW(true, 6), 1500);

  const hotState = {
    ...createInitialCookerState(true),
    heaterOn: false,
  };
  const next = stepPressureCookerState(hotState, 10.0);
  assert.equal(next.heaterPowerW, 0);
  assert.ok(next.waterTempC < hotState.waterTempC);
});

test('switching from Stage 2 down to Stage 0 while pressurized vents steam and lowers pressure', () => {
  const pressurizedStage2 = {
    ...createInitialCookerState(true),
    waterTempC: 121.5,
    pressureBar: 1.08,
    stage: 0 as const,
  };

  const afterStep = stepPressureCookerState(pressurizedStage2, 2.0);
  assert.ok(afterStep.steamVentRate > 0.4, 'expected vigorous steam release on stage drop');
  assert.ok(afterStep.pressureBar < pressurizedStage2.pressureBar);
  assert.ok(afterStep.waterTempC < pressurizedStage2.waterTempC);
});

test('cookerDialValueToNeedleAngleRad maps 0, half, and full scale accurately across 270 degrees', () => {
  const angZero = cookerDialValueToNeedleAngleRad(0, 160);
  const angHalf = cookerDialValueToNeedleAngleRad(80, 160);
  const angFull = cookerDialValueToNeedleAngleRad(160, 160);

  assert.ok(Math.abs(angZero - (5 * Math.PI) / 4) < 1e-6);
  assert.ok(Math.abs(angHalf - Math.PI / 2) < 1e-6);
  assert.ok(Math.abs(angFull - -Math.PI / 4) < 1e-6);
});

test('unplugging electrical connector cuts power to 0 W, and push-button / D-ring cycle properly', () => {
  assert.equal(computeHeaterPowerW(true, 6, undefined, false, false), 0);
  assert.equal(computeHeaterPowerW(true, 6, undefined, true, true), 0);

  assert.equal(nextCookerStage(0), 1);
  assert.equal(nextCookerStage(1), 2);
  assert.equal(nextCookerStage(2), 0);

  assert.equal(nextHeaterDialLevel(0), 1);
  assert.equal(nextHeaterDialLevel(5), 6);
  assert.equal(nextHeaterDialLevel(6), 0);
});

test('active steam venting decreases water quantity (mL) and water level (%)', () => {
  let st: PressureCookerState = {
    ...createInitialCookerState(true),
    stage: 0,
    waterTempC: 100.5,
    pluggedIn: true,
    heaterOn: true,
    heaterLevel: 6,
  };
  const initialMl = st.waterVolumeMl;
  for (let i = 0; i < 60; i++) {
    st = stepPressureCookerState(st, 1.0);
  }
  assert.ok(st.waterVolumeMl < initialMl, 'Boiling steam loss must lower water quantity in mL');
  assert.ok(st.waterLevelPercent < (initialMl / st.waterCapacityMl) * 100);
});

