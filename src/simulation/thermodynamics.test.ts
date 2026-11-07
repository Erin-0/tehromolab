import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  computeOperatingPoint,
  createInitialState,
  pressureToNeedleAngleRad,
  r134aGaugePressureBar,
  stepHeatPumpState,
} from './thermodynamics';

test('R134a saturation gauge pressure increases monotonically with temperature', () => {
  const p0 = r134aGaugePressureBar(0);
  const p20 = r134aGaugePressureBar(20);
  const p40 = r134aGaugePressureBar(40);

  assert.ok(p0 > 1.0 && p0 < 3.5, `Expected ~1.9 barg at 0C, got ${p0}`);
  assert.ok(p20 > p0 && p20 < 6.5, `Expected ~4.7 barg at 20C, got ${p20}`);
  assert.ok(p40 > p20 && p40 < 12.0, `Expected ~9.1 barg at 40C, got ${p40}`);
});

test('Running heat pump cools Qk bath, heats Qh bath, and accumulates Wh energy', () => {
  const initial = createInitialState(false);
  assert.equal(initial.energyWh, 0);
  assert.equal(initial.tempColdC, DEFAULT_CONFIG.ambientTempC);
  assert.equal(initial.tempHotC, DEFAULT_CONFIG.ambientTempC);

  const after60s = stepHeatPumpState(initial, 60);
  assert.ok(after60s.tempColdC < initial.tempColdC, 'Left Qk bath must cool down');
  assert.ok(after60s.tempHotC > initial.tempHotC, 'Right Qh bath must heat up');
  assert.ok(after60s.energyWh > 1.5, 'Energy meter in Wh must accumulate');
  assert.ok(after60s.highPressureBar > after60s.lowPressureBar, 'Condenser pressure must exceed evaporator pressure');
  assert.ok(after60s.copHeating > 2.0 && after60s.copHeating < 5.5, 'COP must be in realistic lab range');
});

test('Stopped compressor draws 0 W and equalizes pressures without advancing Wh', () => {
  const running = createInitialState(true);
  const pausedState = {
    ...running,
    ...computeOperatingPoint(running.tempColdC, running.tempHotC, running.valveOpening, false),
  };

  assert.equal(pausedState.electricalPowerW, 0);
  assert.equal(pausedState.lowPressureBar, pausedState.highPressureBar);

  const stepped = stepHeatPumpState(pausedState, 30);
  assert.equal(stepped.energyWh, running.energyWh);
});

test('Pressure gauge needle angle sweeps clockwise across 270 degrees', () => {
  const zeroAngle = pressureToNeedleAngleRad(0, 16, 0, false);
  const midAngle = pressureToNeedleAngleRad(8, 16, 0, false);
  const maxAngle = pressureToNeedleAngleRad(16, 16, 0, false);

  assert.ok(Math.abs(zeroAngle - (5 * Math.PI) / 4) < 1e-6);
  assert.ok(Math.abs(midAngle - Math.PI / 2) < 1e-6);
  assert.ok(Math.abs(maxAngle - -Math.PI / 4) < 1e-6);
});

test('Operating point defines 3 distinct input (T, P) pairs, 1 output (T, P) pair, and generator V/I', () => {
  const st = createInitialState(true);
  assert.ok(st.generatorVoltageV > 220 && st.generatorVoltageV <= 230.5);
  assert.ok(st.generatorCurrentA > 0.4 && st.generatorCurrentA < 1.2);
  assert.ok(st.inlet1TempC < st.inlet2TempC, 'Evaporator post-throttle entry is colder than bath Qk');
  assert.ok(st.inlet1PressBar > st.inlet3PressBar, 'Coil inlet pressure slightly exceeds compressor suction');
  assert.ok(st.outletTempC > st.tempHotC, 'Compressor discharge temperature exceeds warm bath Th');
  assert.ok(st.outletPressBar > st.inlet1PressBar, 'Output pressure exceeds all 3 input pressures');
});

test('Water exchanger temperatures Tee, Tse, Tec, Tsc and COP accurately reflect physical water circuit', () => {
  const st = createInitialState(true);

  // Evaporator water circuit: water enters at Tee and exits cooled at Tse
  assert.ok(st.tempWaterInletEvapC > st.tempWaterOutletEvapC, 'Evaporator water outlet Tse must be colder than inlet Tee');
  const deltaTe = st.tempWaterInletEvapC - st.tempWaterOutletEvapC;
  assert.ok(deltaTe >= 1.0 && deltaTe <= 3.0, `Expected deltaTe ~1.8C, got ${deltaTe}`);
  assert.ok(st.waterPowerEvapW > 200 && st.waterPowerEvapW < 500, `Expected waterPowerEvapW ~340W, got ${st.waterPowerEvapW}`);

  // Condenser water circuit: water enters at Tec and exits heated at Tsc
  assert.ok(st.tempWaterOutletCondC > st.tempWaterInletCondC, 'Condenser water outlet Tsc must be warmer than inlet Tec');
  const deltaTc = st.tempWaterOutletCondC - st.tempWaterInletCondC;
  assert.ok(deltaTc >= 1.5 && deltaTc <= 4.5, `Expected deltaTc ~2.9C, got ${deltaTc}`);
  assert.ok(st.waterPowerCondW > 350 && st.waterPowerCondW < 700, `Expected waterPowerCondW ~480W, got ${st.waterPowerCondW}`);

  // Water-side COP
  assert.ok(st.copWaterHeating > 2.0 && st.copWaterHeating < 5.0, `Expected COP_eau ~3.3, got ${st.copWaterHeating}`);

  // Stopped condition: temperatures equalize to bath temperatures
  const stopped = computeOperatingPoint(st.tempColdC, st.tempHotC, st.valveOpening, false);
  assert.equal(stopped.tempWaterInletEvapC, st.tempColdC);
  assert.equal(stopped.tempWaterOutletEvapC, st.tempColdC);
  assert.equal(stopped.tempWaterInletCondC, st.tempHotC);
  assert.equal(stopped.tempWaterOutletCondC, st.tempHotC);
  assert.equal(stopped.waterPowerEvapW, 0);
  assert.equal(stopped.waterPowerCondW, 0);
});

