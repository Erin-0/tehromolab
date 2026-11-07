/**
 * Pure 0..30 minute automatic data logger for the two cardboard laboratory display boards:
 * - Table 1 Cardboard Smart Display: diverse generator values (W, V, A, Wh, COP),
 *   3 input (T, P) pairs (Entrée 1, Entrée 2, Entrée 3), and 1 output (T, P) pair (Sortie),
 *   starting at Minute 0 (initial values) and appending one row per minute up to Minute 30.
 * - Table 2 Cardboard Variations Display + 2D Water Level/Quantity History:
 *   records Minute 0..30 variations of plug/heater state, stage (0/1/2), D-ring (0..6),
 *   temperature (°C), pressure (bar), water volume (mL), water level (%), and steam rate.
 */

import { PressureCookerStage, PressureCookerState, HeaterDialLevel } from './pressureCooker';
import { HeatPumpState } from './thermodynamics';

export const MAX_LOG_MINUTES = 30;

export interface HeatPumpMinuteRow {
  minute: number;
  powerW: number;
  voltageV: number;
  currentA: number;
  energyWh: number;
  cop: number;
  in1TempC: number;
  in1PressBar: number;
  in2TempC: number;
  in2PressBar: number;
  in3TempC: number;
  in3PressBar: number;
  outTempC: number;
  outPressBar: number;
  /** Mesures de l'échange thermique avec l'eau (Cahier de laboratoire): */
  tEE: number; // Température Entrée Eau Évaporateur (°C)
  tSE: number; // Température Sortie Eau Évaporateur (°C)
  tEC: number; // Température Entrée Eau Condenseur (°C)
  tSC: number; // Température Sortie Eau Condenseur (°C)
  copWater: number; // COP thermique calculé côté eau
}

export interface CookerMinuteRow {
  minute: number;
  pluggedIn: boolean;
  heaterOn: boolean;
  heaterLevel: HeaterDialLevel;
  powerW: number;
  stage: PressureCookerStage;
  waterTempC: number;
  pressureBar: number;
  waterVolumeMl: number;
  waterLevelPercent: number;
  steamPercent: number;
}

export interface WaterHistorySample {
  timeMin: number;
  waterVolumeMl: number;
  waterLevelPercent: number;
}

export interface LabMinuteLogState {
  elapsedLogSeconds: number;
  heatPumpRows: HeatPumpMinuteRow[];
  cookerRows: CookerMinuteRow[];
  waterHistory: WaterHistorySample[];
  version: number;
}

export function snapshotHeatPumpRow(minute: number, hp: HeatPumpState): HeatPumpMinuteRow {
  return {
    minute,
    powerW: hp.electricalPowerW,
    voltageV: hp.generatorVoltageV,
    currentA: hp.generatorCurrentA,
    energyWh: hp.energyWh,
    cop: hp.copHeating,
    in1TempC: hp.inlet1TempC,
    in1PressBar: hp.inlet1PressBar,
    in2TempC: hp.inlet2TempC,
    in2PressBar: hp.inlet2PressBar,
    in3TempC: hp.inlet3TempC,
    in3PressBar: hp.inlet3PressBar,
    outTempC: hp.outletTempC,
    outPressBar: hp.outletPressBar,
    tEE: hp.tempWaterInletEvapC,
    tSE: hp.tempWaterOutletEvapC,
    tEC: hp.tempWaterInletCondC,
    tSC: hp.tempWaterOutletCondC,
    copWater: hp.copWaterHeating,
  };
}

export function snapshotCookerRow(minute: number, ck: PressureCookerState): CookerMinuteRow {
  return {
    minute,
    pluggedIn: ck.pluggedIn,
    heaterOn: ck.heaterOn,
    heaterLevel: ck.heaterLevel,
    powerW: ck.heaterPowerW,
    stage: ck.stage,
    waterTempC: ck.waterTempC,
    pressureBar: ck.pressureBar,
    waterVolumeMl: ck.waterVolumeMl,
    waterLevelPercent: ck.waterLevelPercent,
    steamPercent: Math.round(ck.steamVentRate * 100),
  };
}

/**
 * Initializes the laboratory minute logger with Minute 0 immediately populated.
 */
export function createInitialMinuteLogState(
  hp: HeatPumpState,
  ck: PressureCookerState,
): LabMinuteLogState {
  return {
    elapsedLogSeconds: 0,
    heatPumpRows: [snapshotHeatPumpRow(0, hp)],
    cookerRows: [snapshotCookerRow(0, ck)],
    waterHistory: [
      {
        timeMin: 0,
        waterVolumeMl: ck.waterVolumeMl,
        waterLevelPercent: ck.waterLevelPercent,
      },
    ],
    version: 1,
  };
}

/**
 * Advances the logger clock by `dtSimSeconds` (scaled experiment seconds).
 * Appends a new row at each whole minute boundary (60s, 120s, ..., 1800s) up to Minute 30,
 * and samples fine-grained water level history every 10 simulated seconds for smooth 2D graphing.
 */
export function stepMinuteLogState(
  prev: LabMinuteLogState,
  dtSimSeconds: number,
  hp: HeatPumpState,
  ck: PressureCookerState,
): LabMinuteLogState {
  if (dtSimSeconds <= 0) return prev;

  const nextElapsed = prev.elapsedLogSeconds + dtSimSeconds;
  let hpRows = prev.heatPumpRows;
  let ckRows = prev.cookerRows;
  let waterHist = prev.waterHistory;
  let changed = false;

  // Record smooth 2D water graph samples every ~10s up to 30 minutes
  const lastSampleMin = waterHist[waterHist.length - 1]?.timeMin ?? 0;
  const curMinFloat = Math.min(MAX_LOG_MINUTES, nextElapsed / 60);
  if (curMinFloat - lastSampleMin >= 10 / 60 && curMinFloat <= MAX_LOG_MINUTES) {
    waterHist = [
      ...waterHist,
      {
        timeMin: curMinFloat,
        waterVolumeMl: ck.waterVolumeMl,
        waterLevelPercent: ck.waterLevelPercent,
      },
    ];
    if (waterHist.length > 185) {
      waterHist = waterHist.slice(waterHist.length - 185);
    }
    changed = true;
  }

  // Append whole-minute table rows from Minute 1 up to Minute 30
  let nextMinuteToRecord = hpRows.length; // Since Minute 0 is index 0, length === next minute
  while (
    nextMinuteToRecord <= MAX_LOG_MINUTES &&
    nextElapsed >= nextMinuteToRecord * 60 - 1e-6
  ) {
    hpRows = [...hpRows, snapshotHeatPumpRow(nextMinuteToRecord, hp)];
    ckRows = [...ckRows, snapshotCookerRow(nextMinuteToRecord, ck)];
    nextMinuteToRecord = hpRows.length;
    changed = true;
  }

  if (!changed) {
    return {
      ...prev,
      elapsedLogSeconds: nextElapsed,
    };
  }

  return {
    elapsedLogSeconds: nextElapsed,
    heatPumpRows: hpRows,
    cookerRows: ckRows,
    waterHistory: waterHist,
    version: prev.version + 1,
  };
}
