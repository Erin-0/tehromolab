import React from 'react';
import {
  FlaskConical,
  Pause,
  Play,
  Plug,
  Power,
  RotateCcw,
  X,
  Zap,
} from 'lucide-react';
import { ActiveStation } from '../scene/HeatPumpScene';
import {
  BalanceWeighTarget,
  CalorimetryMode,
  SupplyVoltageSetting,
} from '../simulation/calorimetry';
import { HeaterDialLevel, PressureCookerStage } from '../simulation/pressureCooker';

interface BottomControlDockProps {
  activeStation: ActiveStation;
  onClose: () => void;
  // Table 1: Heat Pump Controls
  isRunning: boolean;
  onToggleRun: () => void;
  onResetBaths: () => void;
  valveOpening: number;
  onChangeValveOpening: (val: number) => void;
  meterHold: boolean;
  onToggleMeterHold: () => void;
  meterUnit: 'Wh' | 'kJ';
  onToggleMeterUnit: () => void;
  // Table 2: Pressure Cooker Controls
  pluggedIn: boolean;
  onTogglePluggedIn: () => void;
  heaterOn: boolean;
  onToggleHeaterOn: () => void;
  heaterLevel: HeaterDialLevel;
  onChangeHeaterLevel: (level: HeaterDialLevel) => void;
  cookerStage: PressureCookerStage;
  onChangeCookerStage: (stage: PressureCookerStage) => void;
  onResetCooker: () => void;
  // Table 3: TP2 Calorimetry Controls
  calMode: CalorimetryMode;
  onChangeCalMode: (mode: CalorimetryMode) => void;
  calSwitchClosed: boolean;
  onToggleCalSwitch: () => void;
  calSupplyVoltage: SupplyVoltageSetting;
  onChangeCalVoltage: (v: SupplyVoltageSetting) => void;
  calMixtureStarted: boolean;
  onStartCalMixture: () => void;
  calStirrerActive: boolean;
  onToggleCalStirrer: () => void;
  calBalanceTarget: BalanceWeighTarget;
  onChangeCalBalanceTarget: (t: BalanceWeighTarget) => void;
  onResetCalorimetry: () => void;
  // Shared Speed Multiplier
  timeScale: 1 | 10;
  onChangeTimeScale: (scale: 1 | 10) => void;
}

const HEATER_LEVELS: HeaterDialLevel[] = [0, 1, 2, 3, 4, 5, 6];
const COOKER_STAGES: PressureCookerStage[] = [0, 1, 2];
const SUPPLY_VOLTAGES: SupplyVoltageSetting[] = [6, 9, 12];

const STATION_TITLES: Record<ActiveStation, string> = {
  heatpump: 'Table 1 · Pompe à chaleur',
  cooker: 'Table 2 · Cocotte-minute',
  calorimetry: 'Table 3 · Calorimétrie TP2',
};

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  activeStation,
  onClose,
  isRunning,
  onToggleRun,
  onResetBaths,
  valveOpening,
  onChangeValveOpening,
  meterHold,
  onToggleMeterHold,
  meterUnit,
  onToggleMeterUnit,
  pluggedIn,
  onTogglePluggedIn,
  heaterOn,
  onToggleHeaterOn,
  heaterLevel,
  onChangeHeaterLevel,
  cookerStage,
  onChangeCookerStage,
  onResetCooker,
  calMode,
  onChangeCalMode,
  calSwitchClosed,
  onToggleCalSwitch,
  calSupplyVoltage,
  onChangeCalVoltage,
  calMixtureStarted,
  onStartCalMixture,
  calStirrerActive,
  onToggleCalStirrer,
  calBalanceTarget,
  onChangeCalBalanceTarget,
  onResetCalorimetry,
  timeScale,
  onChangeTimeScale,
}) => {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex flex-col items-center px-3">
      <section
        id="heat-pump-control-dock"
        aria-label={`Commandes ${STATION_TITLES[activeStation]}`}
        className="pointer-events-auto flex w-fit max-w-[96vw] flex-wrap items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-[#0f172a] px-4 py-2.5 text-xs text-slate-100 shadow-2xl"
      >
        <span className="font-semibold whitespace-nowrap text-slate-300">
          {STATION_TITLES[activeStation]}
        </span>
        <span aria-hidden="true" className="text-slate-600">
          ·
        </span>

        {activeStation === 'calorimetry' ? (
          <>
            <div
              role="group"
              aria-label="Mode de calorimétrie TP2"
              className="flex items-center gap-1 rounded-lg bg-slate-900 p-0.5"
            >
              <button
                type="button"
                onClick={() => onChangeCalMode('electrical')}
                aria-pressed={calMode === 'electrical'}
                className={`flex min-h-[32px] cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                  calMode === 'electrical'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Joule (J)</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeCalMode('mixture')}
                aria-pressed={calMode === 'mixture'}
                className={`flex min-h-[32px] cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                  calMode === 'mixture'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cuivre (c_cu)</span>
              </button>
            </div>

            {calMode === 'electrical' ? (
              <>
                <button
                  type="button"
                  onClick={onToggleCalSwitch}
                  aria-pressed={calSwitchClosed}
                  className={`flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                    calSwitchClosed
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'border border-white/15 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <Power className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{calSwitchClosed ? 'Interrupteur K : FERMÉ' : 'Interrupteur K : OUVERT'}</span>
                </button>

                <div
                  role="group"
                  aria-label="Tension alimentation CC"
                  className="flex items-center gap-1 rounded-lg bg-slate-900 px-1.5 py-0.5"
                >
                  <span className="px-1 font-medium whitespace-nowrap text-slate-400">U :</span>
                  {SUPPLY_VOLTAGES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => onChangeCalVoltage(v)}
                      aria-label={`Tension ${v}V`}
                      aria-pressed={calSupplyVoltage === v}
                      className={`min-h-[28px] cursor-pointer rounded-md px-2 py-0.5 font-mono tabular-nums font-semibold whitespace-nowrap transition-colors ${
                        calSupplyVoltage === v
                          ? 'bg-slate-700 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {v}V
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={onStartCalMixture}
                disabled={calMixtureStarted}
                className={`flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                  calMixtureStarted
                    ? 'bg-emerald-700/70 text-emerald-100'
                    : 'bg-amber-600 text-white hover:bg-amber-500'
                }`}
              >
                <span>{calMixtureStarted ? 'Mélange Cu + m₁ actif' : 'Mélanger Cu + m₁ (70°C)'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleCalStirrer}
              aria-pressed={calStirrerActive}
              className={`min-h-[32px] cursor-pointer rounded-lg border px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                calStirrerActive
                  ? 'border-emerald-400/40 bg-slate-800 text-emerald-200'
                  : 'border-white/10 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {calStirrerActive ? 'Agitateur : ON' : 'Agitateur : OFF'}
            </button>

            <div
              role="group"
              aria-label="Pesée balance électronique"
              className="hidden items-center gap-1 rounded-lg bg-slate-900 px-1.5 py-0.5 lg:flex"
            >
              <span className="px-1 font-medium whitespace-nowrap text-slate-400">Balance :</span>
              {(
                [
                  { id: 'copper', label: 'Cu 85g' },
                  { id: 'empty_vessel', label: 'm_v 142g' },
                  { id: 'vessel_cold_water', label: '+m₀ 342g' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeCalBalanceTarget(item.id)}
                  aria-pressed={calBalanceTarget === item.id}
                  className={`min-h-[28px] cursor-pointer rounded-md px-1.5 py-0.5 font-mono tabular-nums whitespace-nowrap transition-colors ${
                    calBalanceTarget === item.id
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onResetCalorimetry}
              aria-label="Réinitialiser la calorimétrie TP2"
              className="flex min-h-[32px] cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 font-medium whitespace-nowrap text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Réinitialiser</span>
            </button>
          </>
        ) : activeStation === 'cooker' ? (
          <>
            <button
              type="button"
              onClick={onTogglePluggedIn}
              aria-pressed={pluggedIn}
              className={`flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                pluggedIn
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border border-white/15 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Plug className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pluggedIn ? 'Connecteur : Branché' : 'Connecteur : Débranché'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleHeaterOn}
              aria-pressed={heaterOn}
              className={`flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                heaterOn
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'border border-white/15 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              <Power className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{heaterOn ? 'Inter. rouge : ON' : 'Inter. rouge : OFF'}</span>
            </button>

            <div
              role="group"
              aria-label="Bague en D rotative niveau 0 à 6"
              className="flex items-center gap-1 rounded-lg bg-slate-900 px-1.5 py-0.5"
            >
              <span className="px-1 font-medium whitespace-nowrap text-slate-400">Bague D :</span>
              {HEATER_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onChangeHeaterLevel(lvl)}
                  aria-label={`Bague D niveau ${lvl}`}
                  aria-pressed={heaterLevel === lvl}
                  className={`min-h-[30px] min-w-[24px] cursor-pointer rounded-md px-1.5 py-1 font-mono tabular-nums font-semibold whitespace-nowrap transition-colors ${
                    heaterLevel === lvl
                      ? lvl === 6
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <div
              role="group"
              aria-label="Bouton-poussoir à trois positions"
              className="flex items-center gap-1 rounded-lg bg-slate-900 px-1.5 py-0.5"
            >
              <span className="px-1 font-medium whitespace-nowrap text-slate-400">Position :</span>
              {COOKER_STAGES.map((stg) => (
                <button
                  key={stg}
                  type="button"
                  onClick={() => onChangeCookerStage(stg)}
                  aria-label={`Position ${stg}`}
                  aria-pressed={cookerStage === stg}
                  className={`min-h-[30px] cursor-pointer rounded-md px-2 py-1 font-mono tabular-nums font-semibold whitespace-nowrap transition-colors ${
                    cookerStage === stg
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {stg}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onResetCooker}
              aria-label="Réinitialiser la cocotte-minute"
              className="flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1.5 font-medium whitespace-nowrap text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Réinitialiser</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onToggleRun}
              aria-pressed={isRunning}
              className={`flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap transition-colors ${
                isRunning
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'border border-white/15 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Bouton vert : ON</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Bouton vert : OFF</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2">
              <label
                htmlFor="throttle-slider"
                className="font-medium whitespace-nowrap text-slate-300"
              >
                Détendeur (Qe) :{' '}
                <span className="font-mono tabular-nums font-semibold text-white">
                  {Math.round(valveOpening * 100)}%
                </span>
              </label>
              <input
                id="throttle-slider"
                type="range"
                min={40}
                max={100}
                step={2}
                value={Math.round(valveOpening * 100)}
                onChange={(e) => onChangeValveOpening(Number(e.target.value) / 100)}
                className="h-1.5 w-24 cursor-pointer accent-amber-400"
              />
            </div>

            <button
              type="button"
              onClick={onToggleMeterHold}
              aria-pressed={meterHold}
              className={`min-h-[34px] cursor-pointer rounded-lg border px-2.5 py-1 font-medium whitespace-nowrap transition-colors ${
                meterHold
                  ? 'border-amber-400/50 bg-amber-950/60 text-amber-200'
                  : 'border-white/10 bg-slate-900 text-slate-300 hover:text-white'
              }`}
            >
              {meterHold ? 'Wattmètre : HOLD' : 'Wattmètre : LIVE'}
            </button>

            <button
              type="button"
              onClick={onToggleMeterUnit}
              className="min-h-[34px] cursor-pointer rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 font-mono tabular-nums font-medium whitespace-nowrap text-slate-200 transition-colors hover:bg-slate-800"
            >
              Unité : {meterUnit}
            </button>

            <button
              type="button"
              onClick={onResetBaths}
              aria-label="Réinitialiser les bains et le compteur d'énergie"
              className="flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1.5 font-medium whitespace-nowrap text-slate-200 transition-colors hover:bg-slate-700 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Réinitialiser</span>
            </button>
          </>
        )}

        {/* Shared Time Speed Multiplier (1x / 10x for observing minute updates) */}
        <div
          role="group"
          aria-label="Vitesse de simulation"
          className="flex items-center rounded-lg bg-slate-900 p-0.5"
        >
          {([1, 10] as const).map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => onChangeTimeScale(spd)}
              aria-pressed={timeScale === spd}
              className={`min-h-[30px] cursor-pointer rounded-md px-2 py-1 font-mono tabular-nums font-medium whitespace-nowrap transition-colors ${
                timeScale === spd
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le panneau inférieur"
          className="flex min-h-[32px] cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-slate-800 px-2.5 py-1 font-medium whitespace-nowrap text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Fermer</span>
        </button>
      </section>
    </div>
  );
};

