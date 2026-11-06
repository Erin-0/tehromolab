import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMMETER_CALIBRE_A,
  CalorimetryState,
  TRUE_COPPER_SPECIFIC_HEAT_CAL_G_C,
  VOLTMETER_CALIBRE_V,
  computeBalanceMassG,
  computeMixtureEquilibriumTempC,
  createInitialCalorimetryState,
  labMeterValueToAngleRad,
  stepCalorimetryState,
} from './calorimetry';

test('Electrical Joule method heats calorimeter water and yields J ≈ 4.19 J/cal', () => {
  let st: CalorimetryState = createInitialCalorimetryState(false);
  st = { ...st, mode: 'electrical', supplyVoltageV: 12, switchClosed: true, chronoRunning: true };

  for (let i = 0; i < 180; i++) {
    st = stepCalorimetryState(st, 1.0);
  }

  assert.equal(st.measuredVoltageV, 12);
  assert.equal(st.measuredCurrentA, 3);
  assert.equal(st.chronoSec, 180);
  assert.ok(st.calorimeterTempC > 26.5 && st.calorimeterTempC < 27.2);
  assert.ok(st.jouleCoefficientJPerCal > 4.18 && st.jouleCoefficientJPerCal < 4.25);
});

test('Opening circuit switch K cuts U and I to zero immediately', () => {
  let st: CalorimetryState = createInitialCalorimetryState(true);
  st = { ...st, switchClosed: false, chronoRunning: false };
  const next = stepCalorimetryState(st, 1.0);

  assert.equal(next.measuredVoltageV, 0);
  assert.equal(next.measuredCurrentA, 0);
  assert.equal(next.chronoSec, st.chronoSec);
});

test('Method of mixtures equilibrates to adiabatic balance temperature and deduces copper c_cu ≈ 0.093 cal/(g·°C)', () => {
  let st: CalorimetryState = {
    ...createInitialCalorimetryState(false),
    mode: 'mixture',
    switchClosed: false,
    mixtureStarted: true,
    stirrerActive: true,
    chronoRunning: true,
    balanceTarget: 'vessel_after_mix',
  };

  for (let i = 0; i < 60; i++) {
    st = stepCalorimetryState(st, 1.0);
  }

  const expectedEq = computeMixtureEquilibriumTempC();
  assert.ok(Math.abs(st.calorimeterTempC - expectedEq) < 0.05);
  assert.ok(Math.abs(st.deducedCopperSpecificHeatCalG - TRUE_COPPER_SPECIFIC_HEAT_CAL_G_C) < 0.003);
  assert.equal(st.balanceMassG, 462.0);
});

test('Electronic balance weighs empty vessel, cold water + vessel, copper sample, and final vessel accurately', () => {
  assert.equal(computeBalanceMassG('empty_vessel'), 142.0);
  assert.equal(computeBalanceMassG('vessel_cold_water'), 342.0);
  assert.equal(computeBalanceMassG('copper'), 85.0);
  assert.equal(computeBalanceMassG('vessel_after_mix'), 462.0);
});

test('Analog lab meter pointer sweeps monotonically from left (+0.84 rad) to right (-0.84 rad)', () => {
  const aZero = labMeterValueToAngleRad(0, VOLTMETER_CALIBRE_V);
  const aMid = labMeterValueToAngleRad(7.5, VOLTMETER_CALIBRE_V);
  const aFull = labMeterValueToAngleRad(AMMETER_CALIBRE_A, AMMETER_CALIBRE_A);

  assert.ok(Math.abs(aZero - 0.84) < 1e-6);
  assert.ok(Math.abs(aMid) < 1e-6);
  assert.ok(Math.abs(aFull + 0.84) < 1e-6);
});
