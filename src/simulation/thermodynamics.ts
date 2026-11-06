/**
 * Pure thermodynamic & calorimetric model for a laboratory R134a compression heat pump
 * with dual water baths (Qk evaporator side, Qh condenser side) and expansion throttle (Qe).
 */

export interface HeatPumpConfig {
  /** Water mass in each calorimeter vessel (kg) */
  waterMassKg: number;
  /** Specific heat capacity of water (J / (kg * K)) */
  waterSpecificHeatJPerKgK: number;
  /** Ambient room temperature (°C) */
  ambientTempC: number;
  /** Nominal compressor electrical power at 1.0 throttle/load (W) */
  nominalPowerW: number;
}

export interface HeatPumpState {
  /** Elapsed experiment time (seconds) */
  elapsedSeconds: number;
  /** Cooling water bath temperature Tk (°C) */
  tempColdC: number;
  /** Heating water bath temperature Th (°C) */
  tempHotC: number;
  /** Instantaneous electrical power draw (W) */
  electricalPowerW: number;
  /** Generator / mains RMS supply voltage (V) */
  generatorVoltageV: number;
  /** Generator / compressor RMS current draw (A) */
  generatorCurrentA: number;
  /** Accumulated electrical energy consumed (Wh) */
  energyWh: number;
  /** Cooling capacity Qk_dot absorbed at evaporator (W) */
  coolingPowerQkW: number;
  /** Heating capacity Qh_dot rejected at condenser (W) */
  heatingPowerQhW: number;
  /** Evaporator / low-side gauge pressure (bar, relative) */
  lowPressureBar: number;
  /** Condenser / high-side gauge pressure (bar, relative) */
  highPressureBar: number;
  /** Coefficient of Performance (heating): Qh_dot / P_el */
  copHeating: number;
  /** Entrée 1: Post-expansion evaporator coil inlet temperature (°C) & pressure (bar) */
  inlet1TempC: number;
  inlet1PressBar: number;
  /** Entrée 2: Evaporator bath Qk / mid-coil temperature (°C) & pressure (bar) */
  inlet2TempC: number;
  inlet2PressBar: number;
  /** Entrée 3: Compressor suction vapor inlet temperature (°C) & pressure (bar) */
  inlet3TempC: number;
  inlet3PressBar: number;
  /** Sortie: Compressor / condenser high-pressure outlet temperature (°C) & pressure (bar) */
  outletTempC: number;
  outletPressBar: number;
  /** Liquid refrigerant subcooled outlet leaving Qh coil (°C) */
  condenserLiquidTempC: number;
  /** Expansion valve opening setting (0.4 = throttled, 1.0 = open) */
  valveOpening: number;
  /** Whether the compressor is actively running */
  isRunning: boolean;
  /** Digital power/energy meter interactive state */
  meterHold: boolean;
  heldPowerW: number;
  heldEnergyWh: number;
  meterUnit: 'Wh' | 'kJ';
  meterRangeIndex: 0 | 1 | 2;
}

export const DEFAULT_CONFIG: HeatPumpConfig = {
  waterMassKg: 4.0,
  waterSpecificHeatJPerKgK: 4184,
  ambientTempC: 20.5,
  nominalPowerW: 124.0,
};

/**
 * Approximate R134a saturation gauge pressure (bar) from temperature (°C)
 * using Antoine-like correlation valid in [-15°C, +65°C], minus 1.013 bar atmospheric.
 */
export function r134aGaugePressureBar(saturationTempC: number): number {
  const clampedT = Math.max(-20, Math.min(70, saturationTempC));
  const tK = clampedT + 273.15;
  // Antoine constants for R134a (P_abs in bar): log10(P_bar) = A - B / (T_K + C)
  const log10P = 4.305 - 935.0 / (tK - 26.0);
  const pAbsBar = Math.pow(10, log10P);
  return Math.max(0.2, pAbsBar - 1.013);
}

type ComputedOperatingFields = Omit<
  HeatPumpState,
  | 'elapsedSeconds'
  | 'energyWh'
  | 'meterHold'
  | 'heldPowerW'
  | 'heldEnergyWh'
  | 'meterUnit'
  | 'meterRangeIndex'
>;

/**
 * Computes instantaneous thermodynamic powers, pressures, 3 inlet (T,P) pairs, 1 outlet (T,P) pair,
 * and COP from current bath temperatures and expansion valve opening.
 */
export function computeOperatingPoint(
  tempColdC: number,
  tempHotC: number,
  valveOpening: number,
  isRunning: boolean,
  config: HeatPumpConfig = DEFAULT_CONFIG,
): ComputedOperatingFields {
  const clampedValve = Math.max(0.4, Math.min(1.0, valveOpening));

  if (!isRunning) {
    // Equalizing pressures when compressor is switched off
    const eqTemp = (tempColdC + tempHotC) * 0.5;
    const eqPressure = r134aGaugePressureBar(eqTemp);
    return {
      tempColdC,
      tempHotC,
      electricalPowerW: 0,
      generatorVoltageV: 230.0,
      generatorCurrentA: 0,
      coolingPowerQkW: 0,
      heatingPowerQhW: 0,
      lowPressureBar: eqPressure,
      highPressureBar: eqPressure,
      copHeating: 0,
      inlet1TempC: tempColdC,
      inlet1PressBar: eqPressure,
      inlet2TempC: tempColdC,
      inlet2PressBar: eqPressure,
      inlet3TempC: tempColdC + 0.4,
      inlet3PressBar: eqPressure,
      outletTempC: tempHotC,
      outletPressBar: eqPressure,
      condenserLiquidTempC: tempHotC,
      valveOpening: clampedValve,
      isRunning: false,
    };
  }

  // Approach temperature differences across copper coils & throttle effect
  const evapApproachK = 5.5 + (1.0 - clampedValve) * 5.0;
  const condApproachK = 6.5 + (1.0 - clampedValve) * 4.5;

  const evapSatC = tempColdC - evapApproachK;
  const condSatC = tempHotC + condApproachK;

  const tEvapK = evapSatC + 273.15;
  const tCondK = condSatC + 273.15;
  const liftK = Math.max(8.0, tCondK - tEvapK);

  // Realistic compressor load rises with temperature lift and tighter throttling
  const electricalPowerW =
    config.nominalPowerW *
    (0.88 + 0.0065 * (liftK - 18.0) + 0.18 * (1.0 - clampedValve));

  const generatorVoltageV = 230.0 - (electricalPowerW / 150.0) * 1.6;
  const powerFactor = 0.84;
  const generatorCurrentA = electricalPowerW / (generatorVoltageV * powerFactor);

  // Second-law efficiency (~0.42 of ideal Carnot COP for small hermetic lab R134a unit)
  const carnotCop = tCondK / liftK;
  const realCop = Math.max(1.65, Math.min(5.2, carnotCop * 0.39 * (0.88 + 0.12 * clampedValve)));

  // Thermal losses from compressor shell to room (~8% of electrical input)
  const shellLossW = electricalPowerW * 0.08;
  const heatingPowerQhW = electricalPowerW * realCop;
  const coolingPowerQkW = Math.max(15.0, heatingPowerQhW - (electricalPowerW - shellLossW));

  const lowPressureBar = r134aGaugePressureBar(evapSatC);
  const highPressureBar = Math.max(
    lowPressureBar + 1.5,
    r134aGaugePressureBar(condSatC),
  );

  // Three distinct physical inlet states along the low-pressure / evaporator feed:
  // 1) Post-throttle two-phase evaporator coil entry
  const inlet1TempC = evapSatC;
  const inlet1PressBar = lowPressureBar + 0.14;
  // 2) Cold water bath Qk / mid-evaporator exchange
  const inlet2TempC = tempColdC;
  const inlet2PressBar = lowPressureBar + 0.06;
  // 3) Superheated suction vapor entering compressor
  const superheatK = 3.2 + clampedValve * 1.6;
  const inlet3TempC = Math.min(tempColdC - 0.6, evapSatC + superheatK);
  const inlet3PressBar = Math.max(0.2, lowPressureBar - 0.05);

  // High-pressure compressor/condenser discharge output state
  const dischargeSuperheatK = 6.4 + (1.0 - clampedValve) * 3.8;
  const outletTempC = condSatC + dischargeSuperheatK;
  const outletPressBar = highPressureBar;
  const condenserLiquidTempC = tempHotC + 2.3;

  return {
    tempColdC,
    tempHotC,
    electricalPowerW,
    generatorVoltageV,
    generatorCurrentA,
    coolingPowerQkW,
    heatingPowerQhW,
    lowPressureBar,
    highPressureBar,
    copHeating: heatingPowerQhW / electricalPowerW,
    inlet1TempC,
    inlet1PressBar,
    inlet2TempC,
    inlet2PressBar,
    inlet3TempC,
    inlet3PressBar,
    outletTempC,
    outletPressBar,
    condenserLiquidTempC,
    valveOpening: clampedValve,
    isRunning: true,
  };
}

/**
 * Creates the initial apparatus state pre-warmed to a realistic mid-experiment point
 * (so gauges and 7-segment power/energy displays show realistic lab values immediately).
 */
export function createInitialState(
  prewarmed = true,
  config: HeatPumpConfig = DEFAULT_CONFIG,
): HeatPumpState {
  if (!prewarmed) {
    const op = computeOperatingPoint(
      config.ambientTempC,
      config.ambientTempC,
      0.75,
      true,
      config,
    );
    return {
      ...op,
      elapsedSeconds: 0,
      energyWh: 0,
      meterHold: false,
      heldPowerW: op.electricalPowerW,
      heldEnergyWh: 0,
      meterUnit: 'Wh',
      meterRangeIndex: 1,
    };
  }

  // Start ~8.8 minutes into a calorimetry run: Tk = 14.2 °C, Th = 28.6 °C, Energy = 18.4 Wh
  const initCold = 14.2;
  const initHot = 28.6;
  const op = computeOperatingPoint(initCold, initHot, 0.75, true, config);
  return {
    ...op,
    elapsedSeconds: 528,
    energyWh: 18.4,
    meterHold: false,
    heldPowerW: op.electricalPowerW,
    heldEnergyWh: 18.4,
    meterUnit: 'Wh',
    meterRangeIndex: 1,
  };
}

/**
 * Advances the heat pump calorimetry simulation by dtSeconds.
 */
export function stepHeatPumpState(
  prev: HeatPumpState,
  dtSeconds: number,
  config: HeatPumpConfig = DEFAULT_CONFIG,
): HeatPumpState {
  if (dtSeconds <= 0) return prev;

  const heatCapacityJPerK = config.waterMassKg * config.waterSpecificHeatJPerKgK;
  // Ambient heat leak conductance into insulated white plastic vessels (W/K)
  const vesselLeakWK = 0.85;

  const op = computeOperatingPoint(
    prev.tempColdC,
    prev.tempHotC,
    prev.valveOpening,
    prev.isRunning,
    config,
  );

  const netColdFluxW =
    -op.coolingPowerQkW + vesselLeakWK * (config.ambientTempC - prev.tempColdC);
  const netHotFluxW =
    op.heatingPowerQhW - vesselLeakWK * (prev.tempHotC - config.ambientTempC);

  // Clamp bath temperatures within physical lab safety cutout limits [1.5 °C, 58.0 °C]
  const nextColdC = Math.max(
    1.5,
    Math.min(45.0, prev.tempColdC + (netColdFluxW * dtSeconds) / heatCapacityJPerK),
  );
  const nextHotC = Math.max(
    10.0,
    Math.min(58.0, prev.tempHotC + (netHotFluxW * dtSeconds) / heatCapacityJPerK),
  );

  const nextEnergyWh = prev.energyWh + (op.electricalPowerW * dtSeconds) / 3600;
  const nextElapsed = prev.elapsedSeconds + (prev.isRunning ? dtSeconds : 0);

  const nextOp = computeOperatingPoint(
    nextColdC,
    nextHotC,
    prev.valveOpening,
    prev.isRunning,
    config,
  );

  return {
    ...prev,
    ...nextOp,
    elapsedSeconds: nextElapsed,
    energyWh: nextEnergyWh,
  };
}

/**
 * Computes smooth analog gauge needle angle in radians for a given pressure (bar).
 * Standard 270-degree Bourdon manometer sweep:
 * 0 bar -> +3*PI/4 (bottom-left), maxBar -> -3*PI/4 (bottom-right) clockwise.
 */
export function pressureToNeedleAngleRad(
  pressureBar: number,
  maxScaleBar: number,
  oscillationTimeSec = 0,
  isRunning = true,
): number {
  const flutter = isRunning
    ? Math.sin(oscillationTimeSec * 4.2) * 0.045 +
      Math.sin(oscillationTimeSec * 9.7 + 1.3) * 0.018
    : 0;
  const effectiveBar = Math.max(0, Math.min(maxScaleBar, pressureBar + flutter));
  const fraction = effectiveBar / maxScaleBar;
  const startAngle = (5 * Math.PI) / 4; // +225 deg (bottom-left 0 mark in +Y-up 3D space)
  const totalSweep = (3 * Math.PI) / 2; // 270 deg clockwise through +90 deg (top) to -45 deg (bottom-right)
  return startAngle - fraction * totalSweep;
}
