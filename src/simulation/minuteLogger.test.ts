import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LOG_MINUTES,
  createInitialMinuteLogState,
  stepMinuteLogState,
} from './minuteLogger';
import { createInitialCookerState, stepPressureCookerState } from './pressureCooker';
import { createInitialState, stepHeatPumpState } from './thermodynamics';

test('Minute logger starts with Minute 0 initial values and appends 1 row per minute up to 30 minutes', () => {
  let hp = createInitialState(true);
  let ck = createInitialCookerState(true);
  let log = createInitialMinuteLogState(hp, ck);

  assert.equal(log.heatPumpRows.length, 1);
  assert.equal(log.heatPumpRows[0].minute, 0);
  assert.equal(log.cookerRows.length, 1);
  assert.equal(log.cookerRows[0].minute, 0);

  // Step 35 simulated minutes in 30-second increments
  for (let halfMin = 1; halfMin <= 70; halfMin++) {
    hp = stepHeatPumpState(hp, 30);
    ck = stepPressureCookerState(ck, 30);
    log = stepMinuteLogState(log, 30, hp, ck);
  }

  // Must cap at Minute 0 .. Minute 30 = 31 rows total
  assert.equal(log.heatPumpRows.length, MAX_LOG_MINUTES + 1);
  assert.equal(log.cookerRows.length, MAX_LOG_MINUTES + 1);
  assert.equal(log.heatPumpRows[0].minute, 0);
  assert.equal(log.heatPumpRows[MAX_LOG_MINUTES].minute, 30);
  assert.ok(log.waterHistory.length > 10, '2D water graph history should accumulate samples');
});
