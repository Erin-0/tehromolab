/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { BottomControlDock } from './components/BottomControlDock';
import {
  ActiveStation,
  HeatPumpSceneController,
  QualityLevel,
  SceneInteractiveAction,
} from './scene/HeatPumpScene';
import {
  BalanceWeighTarget,
  CalorimetryMode,
  CalorimetryState,
  HEATER_RESISTANCE_OHM,
  SupplyVoltageSetting,
  computeBalanceMassG,
  createInitialCalorimetryState,
  stepCalorimetryState,
} from './simulation/calorimetry';
import {
  LabMinuteLogState,
  createInitialMinuteLogState,
  stepMinuteLogState,
} from './simulation/minuteLogger';
import {
  HeaterDialLevel,
  PressureCookerStage,
  PressureCookerState,
  computeHeaterPowerW,
  createInitialCookerState,
  nextCookerStage,
  nextHeaterDialLevel,
  stepPressureCookerState,
} from './simulation/pressureCooker';
import {
  HeatPumpState,
  computeOperatingPoint,
  createInitialState,
  stepHeatPumpState,
} from './simulation/thermodynamics';

const VALVE_STEPS = [0.45, 0.65, 0.8, 1.0];

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneControllerRef = useRef<HeatPumpSceneController | null>(null);

  // Mutable simulation states inside refs so 60Hz loop never tears down the WebGL canvas
  const simStateRef = useRef<HeatPumpState>(createInitialState(true));
  const cookerStateRef = useRef<PressureCookerState>(createInitialCookerState(true));
  const calStateRef = useRef<CalorimetryState>(createInitialCalorimetryState(true));
  const minuteLogRef = useRef<LabMinuteLogState>(
    createInitialMinuteLogState(simStateRef.current, cookerStateRef.current),
  );
  const timeScaleRef = useRef<1 | 10>(1);
  const hudSyncAccumulatorRef = useRef<number>(0);

  // Throttled state for the optional bottom dock (hidden on launch; appears only when clicking a table)
  const [hudState, setHudState] = useState<HeatPumpState>(() => simStateRef.current);
  const [cookerHudState, setCookerHudState] = useState<PressureCookerState>(
    () => cookerStateRef.current,
  );
  const [calHudState, setCalHudState] = useState<CalorimetryState>(() => calStateRef.current);
  const [timeScale, setTimeScale] = useState<1 | 10>(1);
  const [openStation, setOpenStation] = useState<ActiveStation | null>(null);
  const [hoverKind, setHoverKind] = useState<'control' | 'table' | null>(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [qualityLevel, setQualityLevel] = useState<QualityLevel>('high');

  const handleSelectQuality = useCallback((level: QualityLevel) => {
    setQualityLevel(level);
    sceneControllerRef.current?.setQualityLevel(level);
  }, []);

  useEffect(() => {
    document.body.dataset.state = openStation ? `dock-${openStation}` : 'exploring';
  }, [openStation]);

  // --- Table 1: Heat Pump Handlers ---
  const syncHeatPump = useCallback((updated: HeatPumpState) => {
    simStateRef.current = updated;
    sceneControllerRef.current?.syncExternalState(updated);
    setHudState(updated);
  }, []);

  const handleToggleRun = useCallback(() => {
    const cur = simStateRef.current;
    const nextRunning = !cur.isRunning;
    syncHeatPump({
      ...cur,
      ...computeOperatingPoint(cur.tempColdC, cur.tempHotC, cur.valveOpening, nextRunning),
    });
  }, [syncHeatPump]);

  const handleResetHeatPumpEnergy = useCallback(() => {
    const cur = simStateRef.current;
    syncHeatPump({
      ...cur,
      energyWh: 0,
      heldEnergyWh: 0,
    });
  }, [syncHeatPump]);

  const handleToggleMeterHold = useCallback(() => {
    const cur = simStateRef.current;
    const nextHold = !cur.meterHold;
    syncHeatPump({
      ...cur,
      meterHold: nextHold,
      heldPowerW: cur.electricalPowerW,
      heldEnergyWh: cur.energyWh,
    });
  }, [syncHeatPump]);

  const handleToggleMeterUnit = useCallback(() => {
    const cur = simStateRef.current;
    syncHeatPump({
      ...cur,
      meterUnit: cur.meterUnit === 'Wh' ? 'kJ' : 'Wh',
    });
  }, [syncHeatPump]);

  const handleCycleMeterRange = useCallback(() => {
    const cur = simStateRef.current;
    const nextRange = (((cur.meterRangeIndex + 1) % 3) as 0 | 1 | 2);
    syncHeatPump({
      ...cur,
      meterRangeIndex: nextRange,
    });
  }, [syncHeatPump]);

  const handleResetBaths = useCallback(() => {
    const fresh = createInitialState(false);
    const updated: HeatPumpState = {
      ...fresh,
      ...computeOperatingPoint(
        fresh.tempColdC,
        fresh.tempHotC,
        simStateRef.current.valveOpening,
        simStateRef.current.isRunning,
      ),
    };
    const freshLog = createInitialMinuteLogState(updated, cookerStateRef.current);
    minuteLogRef.current = freshLog;
    sceneControllerRef.current?.syncExternalMinuteLog(freshLog);
    syncHeatPump(updated);
  }, [syncHeatPump]);

  const handleChangeValveOpening = useCallback(
    (val: number) => {
      const cur = simStateRef.current;
      syncHeatPump({
        ...cur,
        ...computeOperatingPoint(cur.tempColdC, cur.tempHotC, val, cur.isRunning),
      });
    },
    [syncHeatPump],
  );

  const handleCycleValveOpening = useCallback(() => {
    const cur = simStateRef.current;
    const idx = VALVE_STEPS.findIndex((v) => Math.abs(v - cur.valveOpening) < 0.08);
    const nextValve = VALVE_STEPS[(idx + 1) % VALVE_STEPS.length];
    handleChangeValveOpening(nextValve);
  }, [handleChangeValveOpening]);

  // --- Table 2: Pressure Cooker Handlers ---
  const syncCooker = useCallback((updated: PressureCookerState) => {
    cookerStateRef.current = updated;
    sceneControllerRef.current?.syncExternalCookerState(updated);
    setCookerHudState(updated);
  }, []);

  const handleToggleCookerPlug = useCallback(() => {
    const cur = cookerStateRef.current;
    const nextPlugged = !cur.pluggedIn;
    const nextCutout = nextPlugged ? false : cur.pressureCutoutTripped;
    syncCooker({
      ...cur,
      pluggedIn: nextPlugged,
      pressureCutoutTripped: nextCutout,
      heaterPowerW: computeHeaterPowerW(
        cur.heaterOn,
        cur.heaterLevel,
        undefined,
        nextPlugged,
        nextCutout,
      ),
    });
  }, [syncCooker]);

  const handleToggleHeaterOn = useCallback(() => {
    const cur = cookerStateRef.current;
    const nextOn = !cur.heaterOn;
    syncCooker({
      ...cur,
      heaterOn: nextOn,
      heaterPowerW: computeHeaterPowerW(
        nextOn,
        cur.heaterLevel,
        undefined,
        cur.pluggedIn,
        cur.pressureCutoutTripped,
      ),
    });
  }, [syncCooker]);

  const handleChangeHeaterLevel = useCallback(
    (level: HeaterDialLevel) => {
      const cur = cookerStateRef.current;
      syncCooker({
        ...cur,
        heaterLevel: level,
        heaterPowerW: computeHeaterPowerW(
          cur.heaterOn,
          level,
          undefined,
          cur.pluggedIn,
          cur.pressureCutoutTripped,
        ),
      });
    },
    [syncCooker],
  );

  const handleCycleCookerDRing = useCallback(() => {
    handleChangeHeaterLevel(nextHeaterDialLevel(cookerStateRef.current.heaterLevel));
  }, [handleChangeHeaterLevel]);

  const handleChangeCookerStage = useCallback(
    (stage: PressureCookerStage) => {
      const cur = cookerStateRef.current;
      sceneControllerRef.current?.triggerCookerStageBounce();
      syncCooker(stepPressureCookerState({ ...cur, stage }, 0.05));
    },
    [syncCooker],
  );

  const handleCycleCookerStage = useCallback(() => {
    const cur = cookerStateRef.current;
    const nextStg = nextCookerStage(cur.stage);
    syncCooker(stepPressureCookerState({ ...cur, stage: nextStg }, 0.05));
  }, [syncCooker]);

  const handleResetCooker = useCallback(() => {
    const cur = cookerStateRef.current;
    const fresh = createInitialCookerState(false);
    const updated: PressureCookerState = {
      ...fresh,
      pluggedIn: cur.pluggedIn,
      stage: cur.stage,
      heaterOn: cur.heaterOn,
      heaterLevel: cur.heaterLevel,
      heaterPowerW: computeHeaterPowerW(
        cur.heaterOn,
        cur.heaterLevel,
        undefined,
        cur.pluggedIn,
        false,
      ),
    };
    const freshLog = createInitialMinuteLogState(simStateRef.current, updated);
    minuteLogRef.current = freshLog;
    sceneControllerRef.current?.syncExternalMinuteLog(freshLog);
    syncCooker(updated);
  }, [syncCooker]);

  // --- Table 3: TP2 Calorimetry Handlers (Station preserved untouched) ---
  const syncCalState = useCallback((updated: CalorimetryState) => {
    calStateRef.current = updated;
    sceneControllerRef.current?.syncExternalCalorimetryState(updated);
    setCalHudState(updated);
  }, []);

  const handleChangeCalMode = useCallback(
    (mode: CalorimetryMode) => {
      const fresh = createInitialCalorimetryState(false);
      const updated: CalorimetryState =
        mode === 'electrical'
          ? {
              ...fresh,
              mode: 'electrical',
              switchClosed: true,
              chronoRunning: true,
              measuredVoltageV: fresh.supplyVoltageV,
              measuredCurrentA: fresh.supplyVoltageV / HEATER_RESISTANCE_OHM,
            }
          : {
              ...fresh,
              mode: 'mixture',
              switchClosed: false,
              chronoRunning: false,
              mixtureStarted: false,
              balanceTarget: 'copper',
              balanceMassG: computeBalanceMassG('copper'),
            };
      syncCalState(updated);
    },
    [syncCalState],
  );

  const handleToggleCalSwitch = useCallback(() => {
    const cur = calStateRef.current;
    const nextClosed = !cur.switchClosed;
    syncCalState({
      ...cur,
      switchClosed: nextClosed,
      chronoRunning: nextClosed,
      measuredVoltageV: nextClosed ? cur.supplyVoltageV : 0,
      measuredCurrentA: nextClosed ? cur.supplyVoltageV / HEATER_RESISTANCE_OHM : 0,
    });
  }, [syncCalState]);

  const handleChangeCalVoltage = useCallback(
    (v: SupplyVoltageSetting) => {
      const cur = calStateRef.current;
      syncCalState({
        ...cur,
        supplyVoltageV: v,
        measuredVoltageV: cur.switchClosed ? v : 0,
        measuredCurrentA: cur.switchClosed ? v / HEATER_RESISTANCE_OHM : 0,
      });
    },
    [syncCalState],
  );

  const handleStartCalMixture = useCallback(() => {
    const cur = calStateRef.current;
    syncCalState({
      ...cur,
      mode: 'mixture',
      mixtureStarted: true,
      stirrerActive: true,
      chronoRunning: true,
      balanceTarget: 'vessel_after_mix',
      balanceMassG: computeBalanceMassG('vessel_after_mix'),
    });
  }, [syncCalState]);

  const handleToggleCalStirrer = useCallback(() => {
    const cur = calStateRef.current;
    syncCalState({ ...cur, stirrerActive: !cur.stirrerActive });
  }, [syncCalState]);

  const handleChangeCalBalanceTarget = useCallback(
    (target: BalanceWeighTarget) => {
      const cur = calStateRef.current;
      syncCalState({
        ...cur,
        balanceTarget: target,
        balanceMassG: computeBalanceMassG(target),
      });
    },
    [syncCalState],
  );

  const handleResetCalorimetry = useCallback(() => {
    const cur = calStateRef.current;
    const fresh = createInitialCalorimetryState(false);
    syncCalState({
      ...fresh,
      mode: cur.mode,
      supplyVoltageV: cur.supplyVoltageV,
      switchClosed: false,
      chronoRunning: false,
      measuredVoltageV: 0,
      measuredCurrentA: 0,
    });
  }, [syncCalState]);

  const handleChangeTimeScale = useCallback((scale: 1 | 10) => {
    timeScaleRef.current = scale;
    setTimeScale(scale);
  }, []);

  // Store 3D interaction dispatcher in a ref so scene mounts strictly once
  const interactDispatcherRef = useRef<(action: SceneInteractiveAction) => void>(() => {});
  interactDispatcherRef.current = (action: SceneInteractiveAction) => {
    switch (action.type) {
      case 'clickTable':
        setOpenStation((prev) => {
          const next = prev === action.station ? null : action.station;
          if (next !== null) {
            sceneControllerRef.current?.exitPointerLockIfActive();
          }
          return next;
        });
        break;
      case 'toggleHeatPumpPower':
        handleToggleRun();
        break;
      case 'resetHeatPumpEnergy':
        handleResetHeatPumpEnergy();
        break;
      case 'toggleMeterHold':
        handleToggleMeterHold();
        break;
      case 'toggleMeterUnit':
        handleToggleMeterUnit();
        break;
      case 'cycleMeterRange':
        handleCycleMeterRange();
        break;
      case 'cycleValveOpening':
        handleCycleValveOpening();
        break;
      case 'toggleCookerPlug':
        handleToggleCookerPlug();
        break;
      case 'toggleCookerRedSwitch':
        handleToggleHeaterOn();
        break;
      case 'cycleCookerDRing':
        handleCycleCookerDRing();
        break;
      case 'cycleCookerStage':
        handleCycleCookerStage();
        break;
      case 'cycleTARSMode':
        sceneControllerRef.current?.cycleTARSMode();
        break;
    }
  };

  // Mount WebGLRenderer and 3D laboratory room once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const controller = new HeatPumpSceneController({
      container,
      initialState: simStateRef.current,
      initialCookerState: cookerStateRef.current,
      initialCalorimetryState: calStateRef.current,
      initialMinuteLog: minuteLogRef.current,
      onStepSimulation: (dtRealSec: number) => {
        const scaledDt = dtRealSec * timeScaleRef.current;
        const nextHp = stepHeatPumpState(simStateRef.current, scaledDt);
        const nextCooker = stepPressureCookerState(cookerStateRef.current, scaledDt);
        const nextCal = stepCalorimetryState(calStateRef.current, scaledDt);
        const nextLog = stepMinuteLogState(minuteLogRef.current, scaledDt, nextHp, nextCooker);

        simStateRef.current = nextHp;
        cookerStateRef.current = nextCooker;
        calStateRef.current = nextCal;
        minuteLogRef.current = nextLog;

        hudSyncAccumulatorRef.current += dtRealSec;
        if (hudSyncAccumulatorRef.current >= 0.16) {
          hudSyncAccumulatorRef.current = 0;
          setHudState(nextHp);
          setCookerHudState(nextCooker);
          setCalHudState(nextCal);
        }
        return {
          heatPump: nextHp,
          cooker: nextCooker,
          calorimetry: nextCal,
          minuteLog: nextLog,
        };
      },
      onInteractAction: (action) => interactDispatcherRef.current(action),
      onHoverChange: (kind) => setHoverKind(kind),
      onPointerLockChange: (locked) => setIsPointerLocked(locked),
    });

    sceneControllerRef.current = controller;
    (window as unknown as { __sceneController?: HeatPumpSceneController }).__sceneController = controller;

    return () => {
      (window as unknown as { __sceneController?: HeatPumpSceneController }).__sceneController = undefined;
      sceneControllerRef.current = null;
      controller.dispose();
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#dce8f4]">
      {/* Isolated full-screen 3D virtual laboratory viewport */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Laboratoire virtuel 3D de thermodynamique"
      />

      {/* Small static dot at the exact center of the screen ("Un petit point au centre de l'écran") */}
      <div
        data-testid="center-screen-dot"
        aria-hidden="true"
        className={`pointer-events-none fixed top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 ${
          hoverKind === 'control'
            ? 'h-2.5 w-2.5 scale-110 bg-emerald-400 ring-2 ring-slate-900/80'
            : hoverKind === 'table'
              ? 'h-2 w-2 bg-sky-300 ring-2 ring-slate-900/75'
              : 'h-1.5 w-1.5 bg-white ring-1 ring-slate-900/80'
        }`}
      />

      {/* Floating TARS Locomotion Guide Badge */}
      <div className="pointer-events-none fixed top-4 left-4 z-20 flex flex-col gap-1.5 text-xs text-slate-300">
        <div className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/80 px-3 py-1.5 shadow-lg backdrop-blur-xs">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-sm shadow-cyan-400/50" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-slate-100">TARS Robot</strong> · Appuyez sur <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-white">G</kbd> ou cliquez sur le robot pour changer de mode (2-2, 1-2-1, Spin)
          </span>
        </div>
      </div>

      {/* Floating Header Controls: Quality Switcher & Pointer Lock Indicator */}
      <div className="fixed top-4 right-4 z-20 flex flex-col items-end gap-2">
        {/* Quality Control Selector (3 levels: Basse, Moyenne, Haute) */}
        <div
          role="group"
          aria-label="Contrôle de la qualité graphique"
          data-testid="quality-control-group"
          className="flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-900/85 p-1 text-xs text-slate-300 shadow-lg backdrop-blur-xs"
        >
          <span className="px-2 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
            Qualité
          </span>
          {(
            [
              { id: 'low', label: 'Basse' },
              { id: 'medium', label: 'Moyenne' },
              { id: 'high', label: 'Haute' },
            ] as const
          ).map(({ id, label }) => {
            const isActive = qualityLevel === id;
            return (
              <button
                key={id}
                type="button"
                data-testid={`quality-btn-${id}`}
                onClick={() => handleSelectQuality(id)}
                aria-pressed={isActive}
                className={`cursor-pointer rounded px-2.5 py-1 text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Floating ESC / Mouse Capture Indicator (Valorant style) */}
        <div
          aria-live="polite"
          className="pointer-events-none flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur-xs"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isPointerLocked ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-400'
            }`}
            aria-hidden="true"
          />
          <span>
            {isPointerLocked ? (
              <>
                Caméra active · Appuyez sur <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-white">Échap</kbd> pour libérer la souris
              </>
            ) : (
              <>
                Cliquez pour activer la caméra (Souris libre)
              </>
            )}
          </span>
        </div>
      </div>

      {/* Bottom container ONLY appears when clicking a table, and disappears on clicking that table again */}
      {openStation !== null && (
        <BottomControlDock
          activeStation={openStation}
          onClose={() => setOpenStation(null)}
          isRunning={hudState.isRunning}
          onToggleRun={handleToggleRun}
          onResetBaths={handleResetBaths}
          valveOpening={hudState.valveOpening}
          onChangeValveOpening={handleChangeValveOpening}
          meterHold={hudState.meterHold}
          onToggleMeterHold={handleToggleMeterHold}
          meterUnit={hudState.meterUnit}
          onToggleMeterUnit={handleToggleMeterUnit}
          pluggedIn={cookerHudState.pluggedIn}
          onTogglePluggedIn={handleToggleCookerPlug}
          heaterOn={cookerHudState.heaterOn}
          onToggleHeaterOn={handleToggleHeaterOn}
          heaterLevel={cookerHudState.heaterLevel}
          onChangeHeaterLevel={handleChangeHeaterLevel}
          cookerStage={cookerHudState.stage}
          onChangeCookerStage={handleChangeCookerStage}
          onResetCooker={handleResetCooker}
          calMode={calHudState.mode}
          onChangeCalMode={handleChangeCalMode}
          calSwitchClosed={calHudState.switchClosed}
          onToggleCalSwitch={handleToggleCalSwitch}
          calSupplyVoltage={calHudState.supplyVoltageV}
          onChangeCalVoltage={handleChangeCalVoltage}
          calMixtureStarted={calHudState.mixtureStarted}
          onStartCalMixture={handleStartCalMixture}
          calStirrerActive={calHudState.stirrerActive}
          onToggleCalStirrer={handleToggleCalStirrer}
          calBalanceTarget={calHudState.balanceTarget}
          onChangeCalBalanceTarget={handleChangeCalBalanceTarget}
          onResetCalorimetry={handleResetCalorimetry}
          timeScale={timeScale}
          onChangeTimeScale={handleChangeTimeScale}
        />
      )}
    </main>
  );
}

