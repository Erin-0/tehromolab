/**
 * Pure thermodynamic & electrical calorimetry model for Table 3 (TP2: Calorimétrie):
 *  - Mode 1 ('electrical'): Joule heating via immersion resistor R, DC power supply U,
 *    series Ammeter I, parallel Voltmeter U, circuit switch K, stopwatch t, and J = We / Q.
 *  - Mode 2 ('mixture'): Method of mixtures with empty/filled calorimetric vessel (m_v, mu_0),
 *    cold water (m_0 at theta_0), copper sample (m_cu, c_cu), and pre-heated water (m_1 at theta_1).
 */

export type CalorimetryMode = 'electrical' | 'mixture';
export type SupplyVoltageSetting = 6 | 9 | 12;
export type BalanceWeighTarget = 'copper' | 'empty_vessel' | 'vessel_cold_water' | 'vessel_after_mix';

export interface CalorimetryState {
  mode: CalorimetryMode;
  // Electrical Joule mode state
  supplyVoltageV: SupplyVoltageSetting;
  switchClosed: boolean;
  measuredVoltageV: number;
  measuredCurrentA: number;
  electricalWorkJ: number;
  heatRecoveredCal: number;
  jouleCoefficientJPerCal: number;
  // Mixture mode state (c_cu of copper)
  mixtureStarted: boolean;
  deducedCopperSpecificHeatCalG: number;
  // Shared calorimeter & instrument telemetry
  stirrerActive: boolean;
  chronoRunning: boolean;
  chronoSec: number;
  calorimeterTempC: number;
  initialTempC: number;
  hotWaterBeakerTempC: number;
  balanceTarget: BalanceWeighTarget;
  balanceMassG: number;
}

// Physical & TP2 laboratory constants
export const WATER_SPECIFIC_HEAT_CAL_G_C = 1.0; // c_o = 1 cal·g^-1·°C^-1
export const TRUE_JOULE_COEFF_J_PER_CAL = 4.1855; // J = 4.1855 J/cal
export const TRUE_COPPER_SPECIFIC_HEAT_CAL_G_C = 0.093; // c_cu ≈ 0.093 cal·g^-1·°C^-1 (table ~0.1)

export const EMPTY_VESSEL_MASS_G = 142.0; // m_v (g)
export const CALORIMETER_WATER_EQUIV_G = 24.0; // mu_0 (g)
export const COLD_WATER_MASS_G = 200.0; // m_0 (g)
export const COPPER_SAMPLE_MASS_G = 85.0; // m_cu (g)
export const HOT_WATER_MASS_G = 120.0; // m_1 (g)
export const INITIAL_AMBIENT_TEMP_C = 20.0; // theta_0 (°C)
export const PREHEATED_WATER_TEMP_C = 70.0; // theta_1 (°C)
export const HEATER_RESISTANCE_OHM = 4.0; // Immersion resistor R = 4.0 Ohm

// Analog Voltmeter (Calibre 15 V, 100 div, Classe 1.5) & Ammeter (Calibre 5 A, 100 div, Classe 1.5)
export const VOLTMETER_CALIBRE_V = 15;
export const AMMETER_CALIBRE_A = 5;

/**
 * Returns the mass displayed on the electronic balance (in grams) for the selected weighing step.
 */
export function computeBalanceMassG(target: BalanceWeighTarget): number {
  switch (target) {
    case 'empty_vessel':
      return EMPTY_VESSEL_MASS_G; // m_v = 142.0 g
    case 'vessel_cold_water':
      return EMPTY_VESSEL_MASS_G + COLD_WATER_MASS_G; // m_v + m_0 = 342.0 g
    case 'vessel_after_mix':
      return EMPTY_VESSEL_MASS_G + COLD_WATER_MASS_G + HOT_WATER_MASS_G; // 462.0 g
    case 'copper':
    default:
      return COPPER_SAMPLE_MASS_G; // m_cu = 85.0 g
  }
}

/**
 * Exact adiabatic equilibrium temperature theta_f for TP2 §1.1 Method of Mixtures:
 * (m_0 + mu_0)*c_0*(theta_f - theta_0) + m_cu*c_cu*(theta_f - theta_0) + m_1*c_0*(theta_f - theta_1) = 0
 */
export function computeMixtureEquilibriumTempC(
  theta0C = INITIAL_AMBIENT_TEMP_C,
  theta1C = PREHEATED_WATER_TEMP_C,
): number {
  const coldCap =
    (COLD_WATER_MASS_G + CALORIMETER_WATER_EQUIV_G) * WATER_SPECIFIC_HEAT_CAL_G_C +
    COPPER_SAMPLE_MASS_G * TRUE_COPPER_SPECIFIC_HEAT_CAL_G_C;
  const hotCap = HOT_WATER_MASS_G * WATER_SPECIFIC_HEAT_CAL_G_C;
  return (coldCap * theta0C + hotCap * theta1C) / (coldCap + hotCap);
}

/**
 * Deduces experimental copper specific heat c_cu (cal·g^-1·°C^-1) from current mixture temperature theta_f.
 */
export function deduceCopperSpecificHeat(
  thetaFC: number,
  theta0C = INITIAL_AMBIENT_TEMP_C,
  theta1C = PREHEATED_WATER_TEMP_C,
): number {
  const dThetaCold = thetaFC - theta0C;
  if (dThetaCold <= 0.5) return 0;
  const heatFromHotWater = HOT_WATER_MASS_G * WATER_SPECIFIC_HEAT_CAL_G_C * (theta1C - thetaFC);
  const heatToColdWaterAndCal =
    (COLD_WATER_MASS_G + CALORIMETER_WATER_EQUIV_G) * WATER_SPECIFIC_HEAT_CAL_G_C * dThetaCold;
  const cCu = (heatFromHotWater - heatToColdWaterAndCal) / (COPPER_SAMPLE_MASS_G * dThetaCold);
  return Math.max(0, cCu);
}

/**
 * Creates the initial Table 3 TP2 Calorimetry station state.
 * When prewarmed is true, starts with the circuit switch closed and ~24 s of Joule heating elapsed
 * so the voltmeter, ammeter, stopwatch, stirrer, and thermometer show active live readings on load.
 */
export function createInitialCalorimetryState(prewarmed = true): CalorimetryState {
  const supplyVoltageV: SupplyVoltageSetting = 12;
  const switchClosed = prewarmed;
  const measuredVoltageV = switchClosed ? supplyVoltageV : 0;
  const measuredCurrentA = switchClosed ? supplyVoltageV / HEATER_RESISTANCE_OHM : 0;

  const chronoSec = prewarmed ? 35.0 : 0.0;
  const powerW = supplyVoltageV * (supplyVoltageV / HEATER_RESISTANCE_OHM); // 36 W
  const electricalWorkJ = prewarmed ? powerW * chronoSec : 0.0;
  const totalWaterCapCalPerC =
    (COLD_WATER_MASS_G + CALORIMETER_WATER_EQUIV_G) * WATER_SPECIFIC_HEAT_CAL_G_C;
  const deltaTC = electricalWorkJ / (TRUE_JOULE_COEFF_J_PER_CAL * totalWaterCapCalPerC);
  const calorimeterTempC = INITIAL_AMBIENT_TEMP_C + deltaTC;
  const heatRecoveredCal = totalWaterCapCalPerC * deltaTC;

  return {
    mode: 'electrical',
    supplyVoltageV,
    switchClosed,
    measuredVoltageV,
    measuredCurrentA,
    electricalWorkJ,
    heatRecoveredCal,
    jouleCoefficientJPerCal: heatRecoveredCal > 10 ? electricalWorkJ / heatRecoveredCal : 0,
    mixtureStarted: false,
    deducedCopperSpecificHeatCalG: 0,
    stirrerActive: true,
    chronoRunning: prewarmed,
    chronoSec,
    calorimeterTempC,
    initialTempC: INITIAL_AMBIENT_TEMP_C,
    hotWaterBeakerTempC: PREHEATED_WATER_TEMP_C,
    balanceTarget: 'copper',
    balanceMassG: computeBalanceMassG('copper'),
  };
}

/**
 * Advances Table 3 TP2 Calorimetry thermodynamics and instrumentation by dtSec seconds.
 */
export function stepCalorimetryState(prev: CalorimetryState, dtSec: number): CalorimetryState {
  if (dtSec <= 0) return prev;
  const dt = Math.min(dtSec, 2.0);

  const nextChronoSec = prev.chronoRunning ? prev.chronoSec + dt : prev.chronoSec;

  if (prev.mode === 'electrical') {
    const measuredVoltageV = prev.switchClosed ? prev.supplyVoltageV : 0;
    const measuredCurrentA = prev.switchClosed ? prev.supplyVoltageV / HEATER_RESISTANCE_OHM : 0;
    const powerW = measuredVoltageV * measuredCurrentA;

    const dWorkJ = powerW * dt;
    const electricalWorkJ = prev.electricalWorkJ + dWorkJ;

    const totalWaterCapCalPerC =
      (COLD_WATER_MASS_G + CALORIMETER_WATER_EQUIV_G) * WATER_SPECIFIC_HEAT_CAL_G_C;
    // Slight realistic quasi-adiabatic jacket loss (~0.00018 s^-1) so J stays realistically ~4.19-4.21 J/cal
    const ambientLossC = (prev.calorimeterTempC - INITIAL_AMBIENT_TEMP_C) * 0.00012 * dt;
    const dTempJouleC = dWorkJ / (TRUE_JOULE_COEFF_J_PER_CAL * totalWaterCapCalPerC);
    const calorimeterTempC = Math.min(
      98.0,
      Math.max(INITIAL_AMBIENT_TEMP_C, prev.calorimeterTempC + dTempJouleC - ambientLossC),
    );

    const heatRecoveredCal = Math.max(
      0,
      totalWaterCapCalPerC * (calorimeterTempC - prev.initialTempC),
    );
    const jouleCoefficientJPerCal =
      heatRecoveredCal > 15 ? electricalWorkJ / heatRecoveredCal : prev.jouleCoefficientJPerCal;

    return {
      ...prev,
      measuredVoltageV,
      measuredCurrentA,
      electricalWorkJ,
      heatRecoveredCal,
      jouleCoefficientJPerCal,
      calorimeterTempC,
      chronoSec: nextChronoSec,
      balanceMassG: computeBalanceMassG(prev.balanceTarget),
    };
  }

  // Mode 2: 'mixture' (Method of Mixtures for c_cu of Copper)
  let calorimeterTempC = prev.calorimeterTempC;
  let deducedCopperSpecificHeatCalG = prev.deducedCopperSpecificHeatCalG;
  if (prev.mixtureStarted) {
    const eqTemp = computeMixtureEquilibriumTempC(prev.initialTempC, prev.hotWaterBeakerTempC);
    // Stirring accelerates thermal equilibration between hot water m_1, cold water m_0, and copper m_cu
    const rate = prev.stirrerActive ? 0.28 : 0.09;
    const alpha = 1 - Math.exp(-rate * dt);
    calorimeterTempC = prev.calorimeterTempC + (eqTemp - prev.calorimeterTempC) * alpha;
    deducedCopperSpecificHeatCalG = deduceCopperSpecificHeat(
      calorimeterTempC,
      prev.initialTempC,
      prev.hotWaterBeakerTempC,
    );
  }

  return {
    ...prev,
    measuredVoltageV: 0,
    measuredCurrentA: 0,
    calorimeterTempC,
    deducedCopperSpecificHeatCalG,
    chronoSec: nextChronoSec,
    balanceMassG: computeBalanceMassG(prev.balanceTarget),
  };
}

/**
 * Converts an analog laboratory meter reading (0..maxScale) to pointer angle across a 96-degree upper arc.
 * Zero is on the left (+0.84 rad), full scale is on the right (-0.84 rad).
 */
export function labMeterValueToAngleRad(value: number, maxScale: number): number {
  const clamped = Math.max(0, Math.min(maxScale, value));
  const frac = clamped / maxScale;
  const halfSpan = 0.84; // ~48 deg each side = 96 deg total moving-coil arc
  return halfSpan - frac * (2 * halfSpan);
}
