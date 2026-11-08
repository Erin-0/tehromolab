/**
 * Pure thermodynamic model for the Laboratory Pressure Cooker apparatus on Table 2.
 * Models liquid-vapor saturation equilibrium of water (Antoine correlation),
 * 3-stage pressure regulator valve (Stage 0, Stage 1, Stage 2), steam venting,
 * and the 6-level electric hotplate heating element with illuminated red power switch.
 */

export type PressureCookerStage = 0 | 1 | 2;
export type HeaterDialLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PressureCookerConfig {
  /** Effective water mass inside the laboratory pressure vessel (kg) */
  waterMassKg: number;
  /** Specific heat capacity of water (J / (kg * K)) */
  waterSpecificHeatJPerKgK: number;
  /** Stainless steel pot & lid heat capacity (J / K) */
  vesselHeatCapacityJPerK: number;
  /** Ambient laboratory room temperature (°C) */
  ambientTempC: number;
  /** Maximum hotplate electrical power at numerical dial setting 6 (W) */
  maxHeaterPowerW: number;
  /** Standard atmospheric pressure (bar) */
  atmosphericPressureBar: number;
}

export interface PressureCookerState {
  /** Elapsed active heating time (seconds) */
  elapsedSeconds: number;
  /** Internal water/steam temperature measured by Eye 1 (°C, 0..160 scale) */
  waterTempC: number;
  /** Internal relative gauge pressure measured by Eye 2 (bar, 0..2.5 scale) */
  pressureBar: number;
  /** Selected regulator stage on the single handle 3-position push-button (0, 1, or 2) */
  stage: PressureCookerStage;
  /** Whether the pressure-sensitive electrical plug connector is seated & energized */
  pluggedIn: boolean;
  /** Whether over-pressure safety cutout on the electrical connector has tripped */
  pressureCutoutTripped: boolean;
  /** Whether the hotplate red activation switch is turned ON */
  heaterOn: boolean;
  /** Numerical thermostat/power D-ring setting on the hotplate (0..6) */
  heaterLevel: HeaterDialLevel;
  /** Instantaneous electrical heating element power draw (W) */
  heaterPowerW: number;
  /** Normalized steam discharge rate from the lid steam vent (0 = none, 1 = vigorous) */
  steamVentRate: number;
  /** Current liquid water volume inside the vessel (mL) */
  waterVolumeMl: number;
  /** Nominal maximum reference water fill of the vessel for level graph (mL) */
  waterCapacityMl: number;
  /** Current liquid water level percentage (0..100%) */
  waterLevelPercent: number;
}

export const DEFAULT_COOKER_CONFIG: PressureCookerConfig = {
  waterMassKg: 0.45,
  waterSpecificHeatJPerKgK: 4184,
  vesselHeatCapacityJPerK: 350,
  ambientTempC: 20.5,
  maxHeaterPowerW: 1500,
  atmosphericPressureBar: 1.01325,
};

/**
 * Cycles the 3-position push-button on the pressure cooker handle: 0 -> 1 -> 2 -> 0.
 */
export function nextCookerStage(stage: PressureCookerStage): PressureCookerStage {
  if (stage === 0) return 1;
  if (stage === 1) return 2;
  return 0;
}

/**
 * Cycles the rotary D-ring on the lower heating element: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 0.
 */
export function nextHeaterDialLevel(level: HeaterDialLevel): HeaterDialLevel {
  return (((level + 1) % 7) as HeaterDialLevel);
}

/**
 * Computes pure water absolute saturation vapor pressure (bar) from temperature (°C)
 * via the Antoine equation (smooth across 15 °C .. 165 °C, matching NIST steam tables within <0.8%).
 */
export function waterSaturationPressureBar(tempC: number): number {
  const clampedT = Math.max(5, Math.min(170, tempC));
  const log10MmHg = 8.07131 - 1730.63 / (233.426 + clampedT);
  const mmHg = Math.pow(10, log10MmHg);
  return mmHg / 750.062;
}

/**
 * Inverse Antoine relation: saturation boiling temperature (°C) for a given absolute pressure (bar).
 */
export function waterBoilingTempC(absPressureBar: number): number {
  const clampedBar = Math.max(0.05, Math.min(8.0, absPressureBar));
  const mmHg = clampedBar * 750.062;
  const log10MmHg = Math.log10(mmHg);
  return 1730.63 / (8.07131 - log10MmHg) - 233.426;
}

/**
 * Maximum regulated gauge pressure (bar) for each stage on the handle switch:
 * - Stage 0: 0.00 bar gauge (unpressurized boiling / steam release at ~100.0 °C)
 * - Stage 1: 0.55 bar gauge (gentle cooking stage, ~112.6 °C)
 * - Stage 2: 1.10 bar gauge (high-pressure cooking stage, ~121.8 °C)
 */
export function stageMaxGaugePressureBar(stage: PressureCookerStage): number {
  if (stage === 0) return 0.0;
  if (stage === 1) return 0.55;
  return 1.1;
}

/**
 * Computes electrical heating power (W) from the red switch state, 0..6 D-ring dial,
 * and pressure-sensitive electrical connector state.
 */
export function computeHeaterPowerW(
  heaterOn: boolean,
  heaterLevel: HeaterDialLevel,
  config: PressureCookerConfig = DEFAULT_COOKER_CONFIG,
  pluggedIn = true,
  pressureCutoutTripped = false,
): number {
  if (!pluggedIn || pressureCutoutTripped || !heaterOn || heaterLevel <= 0) return 0;
  const clampedLevel = Math.max(0, Math.min(6, heaterLevel));
  return (clampedLevel / 6) * config.maxHeaterPowerW;
}

/**
 * Computes equilibrium gauge pressure (bar) inside the vessel for a given water temperature and stage.
 */
export function computeVesselGaugePressureBar(
  waterTempC: number,
  stage: PressureCookerStage,
  config: PressureCookerConfig = DEFAULT_COOKER_CONFIG,
): number {
  const satGauge = Math.max(0, waterSaturationPressureBar(waterTempC) - config.atmosphericPressureBar);
  if (stage === 0 && satGauge <= 0.01) {
    return 0;
  }
  // Subtle sealed-headspace air expansion bump just before 100 °C when stage 1 or 2 is closed
  const preBoilAirBump =
    stage > 0 && waterTempC > config.ambientTempC && waterTempC < 100
      ? ((waterTempC - config.ambientTempC) / (100 - config.ambientTempC)) * 0.04
      : 0;
  return Math.min(2.5, Math.max(satGauge, preBoilAirBump));
}

/**
 * Creates the initial laboratory pressure cooker state.
 * When `prewarmed` is true, starts mid-experiment on Stage 2 with Plug connected, Red Switch ON,
 * and D-ring Dial at 5, at ~118.4 °C and ~0.88 bar gauge with 1140 mL of water.
 */
export function createInitialCookerState(
  prewarmed = false,
  config: PressureCookerConfig = DEFAULT_COOKER_CONFIG,
): PressureCookerState {
  const capacityMl = 1500;
  if (!prewarmed) {
    const initWaterMl = 1200;
    return {
      elapsedSeconds: 0,
      waterTempC: config.ambientTempC,
      pressureBar: 0,
      stage: 2,
      pluggedIn: false, // Cord unplugged by default; user connects cord to start heating
      pressureCutoutTripped: false,
      heaterOn: true,
      heaterLevel: 5,
      heaterPowerW: 0, // 0 W because disconnected from outlet
      steamVentRate: 0,
      waterVolumeMl: initWaterMl,
      waterCapacityMl: capacityMl,
      waterLevelPercent: (initWaterMl / capacityMl) * 100,
    };
  }

  const initTempC = 118.4;
  const stage: PressureCookerStage = 2;
  const heaterOn = true;
  const heaterLevel: HeaterDialLevel = 5;
  const initWaterMl = 1140;
  return {
    elapsedSeconds: 340,
    waterTempC: initTempC,
    pressureBar: computeVesselGaugePressureBar(initTempC, stage, config),
    stage,
    pluggedIn: true,
    pressureCutoutTripped: false,
    heaterOn,
    heaterLevel,
    heaterPowerW: computeHeaterPowerW(heaterOn, heaterLevel, config, true, false),
    steamVentRate: 0.12,
    waterVolumeMl: initWaterMl,
    waterCapacityMl: capacityMl,
    waterLevelPercent: (initWaterMl / capacityMl) * 100,
  };
}

/**
 * Advances the laboratory pressure cooker thermodynamic state by dtSeconds.
 */
export function stepPressureCookerState(
  prev: PressureCookerState,
  dtSeconds: number,
  config: PressureCookerConfig = DEFAULT_COOKER_CONFIG,
): PressureCookerState {
  const pluggedIn = prev.pluggedIn ?? true;
  const cutoutTripped = prev.pressureBar > 1.45 ? true : prev.pressureBar < 1.18 ? false : (prev.pressureCutoutTripped ?? false);
  const heaterPowerW = computeHeaterPowerW(
    prev.heaterOn,
    prev.heaterLevel,
    config,
    pluggedIn,
    cutoutTripped,
  );
  if (dtSeconds <= 0) {
    return {
      ...prev,
      pluggedIn,
      pressureCutoutTripped: cutoutTripped,
      heaterPowerW,
    };
  }

  // Effective thermal mass scales with current water volume inside the vessel
  const currentWaterMassKg = Math.max(0.18, (prev.waterVolumeMl ?? 1140) / 1000) * 0.4;
  const totalHeatCapJPerK =
    currentWaterMassKg * config.waterSpecificHeatJPerKgK + config.vesselHeatCapacityJPerK;

  const maxGaugeBar = stageMaxGaugePressureBar(prev.stage);
  const ceilingTempC = waterBoilingTempC(config.atmosphericPressureBar + maxGaugeBar);

  // Convective + radiative losses from brushed stainless pot to 20.5 °C lab room
  const ambientLossW = 2.8 * (prev.waterTempC - config.ambientTempC);
  const netThermalInputW = heaterPowerW * 0.88 - ambientLossW;

  let nextTempC = prev.waterTempC;
  let steamVentRate = 0;

  if (prev.waterTempC > ceilingTempC + 0.06) {
    // Active depressurization blowdown (e.g., switched from Stage 2 -> Stage 1 or Stage 0)
    const excessK = prev.waterTempC - ceilingTempC;
    const blowdownAlpha = 1 - Math.exp(-dtSeconds / 4.2);
    nextTempC = prev.waterTempC - excessK * blowdownAlpha;
    steamVentRate = Math.min(1.0, 0.38 + excessK * 0.085);
  } else {
    const candidateTempC = prev.waterTempC + (netThermalInputW * dtSeconds) / totalHeatCapJPerK;
    if (candidateTempC >= ceilingTempC && netThermalInputW > 0) {
      // Regulated boiling at the selected stage ceiling: excess heat vaporizes steam out the vent
      nextTempC = ceilingTempC;
      steamVentRate = Math.min(1.0, Math.max(0.18, netThermalInputW / 1350));
    } else {
      nextTempC = Math.max(config.ambientTempC, Math.min(160, candidateTempC));
      // Subtle pre-boil wisp right as temperature approaches within 1.8 °C of regulator threshold
      const nearThreshold = ceilingTempC - nextTempC;
      if (netThermalInputW > 0 && nearThreshold >= 0 && nearThreshold < 1.8) {
        steamVentRate = ((1.8 - nearThreshold) / 1.8) * 0.16;
      } else {
        steamVentRate = 0;
      }
    }
  }

  // Physical evaporation of liquid water mass into vented steam (latent heat h_fg ≈ 2257 J/g)
  const capacityMl = prev.waterCapacityMl ?? 1500;
  const evapMlPerSec = steamVentRate > 0 ? steamVentRate * 0.58 : 0;
  const nextWaterMl = Math.max(150, Math.min(capacityMl, (prev.waterVolumeMl ?? 1140) - evapMlPerSec * dtSeconds));
  const nextWaterLevelPct = (nextWaterMl / capacityMl) * 100;

  // If water boils down to safety reserve (150 mL), steam tapers
  if (nextWaterMl <= 150.1) {
    steamVentRate *= 0.15;
  }

  const nextPressureBar = computeVesselGaugePressureBar(nextTempC, prev.stage, config);

  return {
    elapsedSeconds: prev.elapsedSeconds + (heaterPowerW > 0 ? dtSeconds : 0),
    waterTempC: nextTempC,
    pressureBar: nextPressureBar,
    stage: prev.stage,
    pluggedIn,
    pressureCutoutTripped: cutoutTripped,
    heaterOn: prev.heaterOn,
    heaterLevel: prev.heaterLevel,
    heaterPowerW,
    steamVentRate,
    waterVolumeMl: nextWaterMl,
    waterCapacityMl: capacityMl,
    waterLevelPercent: nextWaterLevelPct,
  };
}

/**
 * Converts a scalar gauge reading (temperature 0..160 °C or pressure 0..2.5 bar) to its 3D needle Z rotation.
 * Matches standard 270-degree DIN dial sweep (+225 deg bottom-left -> +90 deg top -> -45 deg bottom-right).
 */
export function cookerDialValueToNeedleAngleRad(
  value: number,
  maxScale: number,
  oscillationTimeSec = 0,
  flutterAmplitude = 0,
): number {
  const flutter =
    flutterAmplitude > 0
      ? (Math.sin(oscillationTimeSec * 5.8) * 0.65 +
          Math.sin(oscillationTimeSec * 12.3 + 0.8) * 0.35) *
        flutterAmplitude
      : 0;
  const clamped = Math.max(0, Math.min(maxScale, value + flutter));
  const fraction = clamped / maxScale;
  const startAngle = (5 * Math.PI) / 4;
  const totalSweep = (3 * Math.PI) / 2;
  return startAngle - fraction * totalSweep;
}
