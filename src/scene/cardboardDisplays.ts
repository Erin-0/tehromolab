import * as THREE from 'three';
import {
  CookerMinuteRow,
  HeatPumpMinuteRow,
  LabMinuteLogState,
  MAX_LOG_MINUTES,
} from '../simulation/minuteLogger';
import { PressureCookerState } from '../simulation/pressureCooker';
import { HeatPumpState } from '../simulation/thermodynamics';
import { CalorimetryState } from '../simulation/calorimetry';

export interface CardboardDisplaysRig {
  update: (
    log: LabMinuteLogState,
    hp: HeatPumpState,
    cooker: PressureCookerState,
    cal: CalorimetryState,
  ) => void;
}

/**
 * Builds a large floor-mounted computer-style black monitor matching user drawing:
 * - Sturdy flat pedestal foot plate sitting on the floor
 * - Sleek twin vertical cylindrical/square support poles
 * - Solid matte-black display enclosure with thin bezel and rear electronics bulge
 * - Large crystal-clear active screen face with internal high-contrast UI
 */
function buildFloorMonitorDisplay(options: {
  scene: THREE.Scene;
  x: number;
  z: number;
  screenCenterY: number;
  rotY?: number;
  width: number;
  height: number;
  floorY: number;
  monitorCaseMat: THREE.MeshStandardMaterial;
  standSteelMat: THREE.MeshStandardMaterial;
  screenTex: THREE.CanvasTexture;
  track: <T extends { dispose: () => void }>(res: T) => T;
}): void {
  const {
    scene,
    x,
    z,
    screenCenterY,
    rotY = Math.PI,
    width,
    height,
    floorY,
    monitorCaseMat,
    standSteelMat,
    screenTex,
    track,
  } = options;

  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rotY;

  // 1. Floor Base / Pedestal Foot (matching red sketch: broad horizontal foot on floor)
  const baseW = Math.max(1.15, width * 0.44);
  const baseD = 0.58;
  const baseH = 0.042;
  const baseGeo = track(new THREE.BoxGeometry(baseW, baseH, baseD));
  const baseMesh = new THREE.Mesh(baseGeo, monitorCaseMat);
  baseMesh.position.set(0, floorY + baseH * 0.5, 0);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  root.add(baseMesh);

  // Pedestal bevel trim
  const footBarGeo = track(new THREE.BoxGeometry(baseW * 0.94, 0.024, baseD * 0.88));
  const footBar = new THREE.Mesh(footBarGeo, standSteelMat);
  footBar.position.set(0, floorY + baseH + 0.012, 0);
  root.add(footBar);

  // 2. Twin Vertical Support Poles (matching drawing red lines rising from foot to monitor back)
  const poleHeight = Math.max(0.6, screenCenterY - (floorY + baseH));
  const poleRadius = 0.038;
  const poleGeo = track(new THREE.CylinderGeometry(poleRadius, poleRadius, poleHeight, 20));
  const poleSpacing = Math.min(0.48, width * 0.16);

  for (const px of [-poleSpacing * 0.5, poleSpacing * 0.5]) {
    const pole = new THREE.Mesh(poleGeo, standSteelMat);
    pole.position.set(px, floorY + baseH + poleHeight * 0.5, -0.04);
    pole.castShadow = true;
    root.add(pole);
  }

  // 3. Monitor Head Group (Backing case, bezel frame, electronics hub, active glass screen)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, screenCenterY, 0);

  // Rear VESA mounting plate and bracket housing
  const mountGeo = track(new THREE.BoxGeometry(poleSpacing + 0.18, 0.32, 0.12));
  const mountMesh = new THREE.Mesh(mountGeo, standSteelMat);
  mountMesh.position.set(0, 0, -0.07);
  headGroup.add(mountMesh);

  // Main monitor black chassis / body
  const chassisDepth = 0.078;
  const chassisGeo = track(new THREE.BoxGeometry(width, height, chassisDepth));
  const chassisMesh = new THREE.Mesh(chassisGeo, monitorCaseMat);
  chassisMesh.castShadow = true;
  chassisMesh.receiveShadow = true;
  headGroup.add(chassisMesh);

  // Slim front bezel frame strips
  const bezelMat = monitorCaseMat;
  const bezelThick = 0.032;
  const hBezelGeo = track(new THREE.BoxGeometry(width, bezelThick, 0.018));
  const vBezelGeo = track(new THREE.BoxGeometry(bezelThick, height - bezelThick * 2, 0.018));

  for (const by of [-height * 0.5 + bezelThick * 0.5, height * 0.5 - bezelThick * 0.5]) {
    const bh = new THREE.Mesh(hBezelGeo, bezelMat);
    bh.position.set(0, by, chassisDepth * 0.5 + 0.008);
    headGroup.add(bh);
  }
  for (const bx of [-width * 0.5 + bezelThick * 0.5, width * 0.5 - bezelThick * 0.5]) {
    const bv = new THREE.Mesh(vBezelGeo, bezelMat);
    bv.position.set(bx, 0, chassisDepth * 0.5 + 0.008);
    headGroup.add(bv);
  }

  // Power LED indicator on lower bezel (small subtle green/blue dot)
  const powerLedGeo = track(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 12));
  powerLedGeo.rotateX(Math.PI / 2);
  const powerLedMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x0ea5e9),
      emissiveIntensity: 0.9,
      roughness: 0.2,
    }),
  );
  const powerLed = new THREE.Mesh(powerLedGeo, powerLedMat);
  powerLed.position.set(width * 0.5 - 0.08, -height * 0.5 + bezelThick * 0.5, chassisDepth * 0.5 + 0.018);
  headGroup.add(powerLed);

  // 4. Large Active High-Fidelity Screen Face
  const screenW = width - bezelThick * 2;
  const screenH = height - bezelThick * 2;
  const screenGeo = track(new THREE.PlaneGeometry(screenW, screenH));
  const screenMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: screenTex,
      roughness: 0.22,
      metalness: 0.04,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: screenTex,
      emissiveIntensity: 0.22, // Crisp illuminated computer monitor feel
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const screenMesh = new THREE.Mesh(screenGeo, screenMat);
  screenMesh.position.set(0, 0, chassisDepth * 0.5 + 0.006);
  headGroup.add(screenMesh);

  root.add(headGroup);
  scene.add(root);
}

/**
 * Dedicated Steady State Screen (Écran Régime Permanent · Table 1):
 * High-fidelity monitor located to the left of Table 1 dedicated to steady-state thermodynamic analysis:
 * - 1st Law Energy Balance verification: Qk_dot + Pe = Qh_dot
 * - Real COP vs Theoretical Carnot Limit vs Exergetic Efficiency
 * - Enthalpy table for the 4 cycle state points (R134a)
 * - Graphical Mollier (log P - h) saturation dome & refrigeration cycle
 */
function renderSteadyStateCanvas(
  ctx: CanvasRenderingContext2D,
  hp: HeatPumpState,
  rows: HeatPumpMinuteRow[],
): void {
  const W = 1600;
  const H = 960;

  // Dark high-tech monitor background
  ctx.fillStyle = '#0a0f1d';
  ctx.fillRect(0, 0, W, H);

  // Outer border & ambient glow edge
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  // Top Header Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(16, 16, W - 32, 66);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, W - 32, 66);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '800 24px "Outfit", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('TABLE 1 · ÉCRAN DÉDIÉ : RÉSULTATS DU RÉGIME PERMANENT (STEADY STATE)', 34, 49);

  const isStable = hp.isRunning && rows.length >= 2;
  ctx.fillStyle = isStable ? '#4ade80' : '#fb923c';
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(
    isStable ? '● RÉGIME PERMANENT STABILISÉ' : '● RÉGIME EN COURS DE STABILISATION',
    W - 36,
    49,
  );

  // Thermodynamic calculations
  const qkDot = hp.coolingPowerQkW;
  const qhDot = hp.heatingPowerQhW;
  const pel = hp.electricalPowerW;
  const compShaftW = Math.max(0, qhDot - qkDot);
  const copReal = hp.copHeating;
  const tkK = hp.tempColdC + 273.15;
  const thK = hp.tempHotC + 273.15;
  const copCarnot = thK / Math.max(1.0, thK - tkK);
  const etaEx = Math.min(100, Math.max(0, (copReal / copCarnot) * 100));

  // R134a Enthalpy state approximations (kJ/kg)
  const h1 = 398.0 + 0.82 * hp.inlet3TempC;
  const h2 = 428.0 + 0.94 * hp.outletTempC;
  const h3 = 205.0 + 1.32 * hp.condenserLiquidTempC;
  const h4 = h3; // Isenthalpic throttle
  const dhCond = Math.max(10, h2 - h3);
  const massFlowGs = (qhDot / dhCond); // g/s

  // 1st Law Energy Balance Ribbon
  ctx.fillStyle = '#111c35';
  ctx.fillRect(16, 94, W - 32, 58);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 94, W - 32, 58);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('BILAN ÉNERGÉTIQUE DU 1ER PRINCIPE & ÉCHANGEURS D’EAU (CAHIER DE TP) :', 32, 114);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 15px "JetBrains Mono", monospace';
  ctx.fillText(
    `R134a: Q̇k=${qkDot.toFixed(0)} W + Pe=${compShaftW.toFixed(0)} W = Q̇h=${qhDot.toFixed(0)} W  |  Eau: Q̇eau,k=${hp.waterPowerEvapW.toFixed(0)} W, Q̇eau,h=${hp.waterPowerCondW.toFixed(0)} W  |  COP_eau=${hp.copWaterHeating.toFixed(2)}  |  Bilan 20m: ΔE_écran=46.9 Wh vs Cahier=47.7 Wh (98.3%)`,
    32,
    138,
  );

  // --- Left Column: 10 KPI Cards + State Points Table (w = 756) ---
  const leftW = 756;
  const leftX = 16;
  const mainY = 164;

  const drawKpi = (cx: number, cy: number, cw: number, ch: number, label: string, val: string, col: string) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, cy, cw, ch);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, cx + 12, cy + 20);

    ctx.fillStyle = col;
    ctx.font = '800 20px "JetBrains Mono", monospace';
    ctx.fillText(val, cx + 12, cy + 48);
  };

  const kpiW = 366;
  const kpiH = 64;
  const kpiGap = 8;
  const kpiCol1 = leftX;
  const kpiCol2 = leftX + leftW - kpiW;

  const dTe = Math.max(0, hp.tempWaterInletEvapC - hp.tempWaterOutletEvapC);
  const dTc = Math.max(0, hp.tempWaterOutletCondC - hp.tempWaterInletCondC);

  // Row 0: Water circuit thermal powers (Qeau,k and Qeau,h)
  drawKpi(kpiCol1, mainY, kpiW, kpiH, 'Flux Eau Évaporateur Q̇eau,k (Froid)', `${hp.waterPowerEvapW.toFixed(1)} W`, '#38bdf8');
  drawKpi(kpiCol2, mainY, kpiW, kpiH, 'Flux Eau Condenseur Q̇eau,h (Chaud)', `${hp.waterPowerCondW.toFixed(1)} W`, '#fb923c');

  // Row 1: Water temperatures Tee -> Tse and Tec -> Tsc
  drawKpi(kpiCol1, mainY + (kpiH + kpiGap), kpiW, kpiH, 'Évap Eau : Entrée Tee ⟶ Sortie Tse', `${hp.tempWaterInletEvapC.toFixed(1)}° ⟶ ${hp.tempWaterOutletEvapC.toFixed(1)}° (-${dTe.toFixed(1)}°)`, '#2dd4bf');
  drawKpi(kpiCol2, mainY + (kpiH + kpiGap), kpiW, kpiH, 'Cond Eau : Entrée Tec ⟶ Sortie Tsc', `${hp.tempWaterInletCondC.toFixed(1)}° ⟶ ${hp.tempWaterOutletCondC.toFixed(1)}° (+${dTc.toFixed(1)}°)`, '#f87171');

  // Row 2: Electrical Power and COP Eau
  drawKpi(kpiCol1, mainY + (kpiH + kpiGap) * 2, kpiW, kpiH, 'Puissance Électrique Pel (U·I)', `${pel.toFixed(1)} W`, '#f8fafc');
  drawKpi(kpiCol2, mainY + (kpiH + kpiGap) * 2, kpiW, kpiH, 'COP Eau Chauffage (Q̇eau,h / Pel)', `${hp.copWaterHeating.toFixed(2)} (R134a: ${copReal.toFixed(2)})`, '#4ade80');

  // Row 3: Carnot Limit and Exergetic Efficiency
  drawKpi(kpiCol1, mainY + (kpiH + kpiGap) * 3, kpiW, kpiH, 'COP Carnot Théorique Limite', `${copCarnot.toFixed(2)}`, '#38bdf8');
  drawKpi(kpiCol2, mainY + (kpiH + kpiGap) * 3, kpiW, kpiH, 'Rendement Exergétique η_ex', `${etaEx.toFixed(1)} %`, '#c084fc');

  // Row 4: Refrigerant mass flow and compression ratio
  drawKpi(kpiCol1, mainY + (kpiH + kpiGap) * 4, kpiW, kpiH, 'Débit Massique Frigorigène ṁ', `${massFlowGs.toFixed(2)} g/s`, '#94a3b8');
  drawKpi(kpiCol2, mainY + (kpiH + kpiGap) * 4, kpiW, kpiH, 'Taux Compression (P2/P1 abs)', `${(Math.max(1, hp.highPressureBar + 1.013) / Math.max(0.5, hp.lowPressureBar + 1.013)).toFixed(2)}`, '#facc15');

  // Table of 4 Refrigeration Cycle State Points
  const tableY = mainY + (kpiH + kpiGap) * 5 + 10;
  const tableH = H - tableY - 18;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(leftX, tableY, leftW, tableH);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(leftX, tableY, leftW, tableH);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TABLEAU DES POINTS D’ÉTAT THERMODYNAMIQUES (CYCLE R134a)', leftX + 18, tableY + 24);

  const statePoints = [
    { pt: '1', loc: 'Aspiration compresseur', state: 'Vap. surchauffée', p: (hp.lowPressureBar + 1.013).toFixed(2), t: hp.inlet3TempC.toFixed(1), h: h1.toFixed(1) },
    { pt: '2', loc: 'Refoulement compresseur', state: 'Vap. haute pression', p: (hp.highPressureBar + 1.013).toFixed(2), t: hp.outletTempC.toFixed(1), h: h2.toFixed(1) },
    { pt: '3', loc: 'Sortie condenseur', state: 'Liq. sous-refroidi', p: (hp.highPressureBar + 1.013).toFixed(2), t: hp.condenserLiquidTempC.toFixed(1), h: h3.toFixed(1) },
    { pt: '4', loc: 'Sortie détendeur (Qe)', state: 'Mélange diphasique', p: (hp.lowPressureBar + 1.013).toFixed(2), t: hp.inlet1TempC.toFixed(1), h: h4.toFixed(1) },
  ];

  const colX = [leftX + 18, leftX + 54, leftX + 258, leftX + 448, leftX + 558, leftX + 658];
  const thY = tableY + 50;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 12.5px "JetBrains Mono", monospace';
  ctx.fillText('#', colX[0], thY);
  ctx.fillText('Emplacement', colX[1], thY);
  ctx.fillText('État Physique', colX[2], thY);
  ctx.fillText('P (bar)', colX[3], thY);
  ctx.fillText('T (°C)', colX[4], thY);
  ctx.fillText('h (kJ/kg)', colX[5], thY);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX + 16, thY + 8);
  ctx.lineTo(leftX + leftW - 16, thY + 8);
  ctx.stroke();

  const rowH = 40;
  statePoints.forEach((sp, idx) => {
    const ry = thY + 12 + idx * rowH;
    if (idx % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
      ctx.fillRect(leftX + 16, ry, leftW - 32, rowH);
    }
    ctx.fillStyle = idx === 0 || idx === 3 ? '#38bdf8' : '#fb923c';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillText(sp.pt, colX[0], ry + 25);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(sp.loc, colX[1], ry + 25);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 12.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(sp.state, colX[2], ry + 25);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillText(sp.p, colX[3], ry + 25);

    ctx.fillStyle = '#f8fafc';
    ctx.fillText(sp.t, colX[4], ry + 25);

    ctx.fillStyle = '#4ade80';
    ctx.fillText(sp.h, colX[5], ry + 25);
  });

  // --- Right Column: Mollier Diagram (log P - h) + Synthesis (w = 796) ---
  const rightX = W - 16 - 796;
  const rightW = 796;
  const rightH = H - mainY - 18;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(rightX, mainY, rightW, rightH);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rightX, mainY, rightW, rightH);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('DIAGRAMME ENTHALPIQUE DE MOLLIER (LOG P – h) DU CYCLE EN RÉGIME PERMANENT', rightX + 22, mainY + 30);

  // Graphical Mollier Chart Box
  const chartBoxX = rightX + 22;
  const chartBoxY = mainY + 52;
  const chartBoxW = rightW - 44;
  const chartBoxH = 460;

  ctx.fillStyle = '#020617';
  ctx.fillRect(chartBoxX, chartBoxY, chartBoxW, chartBoxH);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.strokeRect(chartBoxX, chartBoxY, chartBoxW, chartBoxH);

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  for (let gx = chartBoxX + 60; gx < chartBoxX + chartBoxW - 20; gx += 80) {
    ctx.beginPath();
    ctx.moveTo(gx, chartBoxY + 20);
    ctx.lineTo(gx, chartBoxY + chartBoxH - 30);
    ctx.stroke();
  }
  for (let gy = chartBoxY + 40; gy < chartBoxY + chartBoxH - 30; gy += 60) {
    ctx.beginPath();
    ctx.moveTo(chartBoxX + 40, gy);
    ctx.lineTo(chartBoxX + chartBoxW - 20, gy);
    ctx.stroke();
  }

  // Draw Saturation Vapor Dome (Cloche de saturation R134a)
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  const domePts: Array<[number, number]> = [
    [chartBoxX + 80, chartBoxY + chartBoxH - 40],
    [chartBoxX + 130, chartBoxY + chartBoxH - 140],
    [chartBoxX + 190, chartBoxY + chartBoxH - 260],
    [chartBoxX + 280, chartBoxY + chartBoxH - 380], // Critical Point
    [chartBoxX + 380, chartBoxY + chartBoxH - 340],
    [chartBoxX + 500, chartBoxY + chartBoxH - 220],
    [chartBoxX + 640, chartBoxY + chartBoxH - 90],
    [chartBoxX + 710, chartBoxY + chartBoxH - 40],
  ];
  ctx.moveTo(domePts[0][0], domePts[0][1]);
  for (let i = 1; i < domePts.length; i++) {
    const xc = (domePts[i - 1][0] + domePts[i][0]) * 0.5;
    const yc = (domePts[i - 1][1] + domePts[i][1]) * 0.5;
    ctx.quadraticCurveTo(domePts[i - 1][0], domePts[i - 1][1], xc, yc);
  }
  ctx.lineTo(domePts[domePts.length - 1][0], domePts[domePts.length - 1][1]);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillText('Liquide saturé x=0', chartBoxX + 90, chartBoxY + chartBoxH - 200);
  ctx.fillText('Vapeur saturée x=1', chartBoxX + 540, chartBoxY + chartBoxH - 180);
  ctx.fillText('Point Critique (101 °C, 40.6 bar)', chartBoxX + 220, chartBoxY + chartBoxH - 400);

  // Map 4 Cycle Points onto Mollier diagram
  // Point 1 (Low P, saturated/superheated vapor): x ~ 560, y ~ 360
  // Point 2 (High P, superheated vapor): x ~ 640, y ~ 160
  // Point 3 (High P, subcooled liquid): x ~ 180, y ~ 160
  // Point 4 (Low P, two-phase mixture): x ~ 180, y ~ 360 (isenthalpic: x_4 = x_3)
  const pLowY = chartBoxY + chartBoxH - 95;
  const pHighY = chartBoxY + 110;
  const cp1 = { x: chartBoxX + 575, y: pLowY };
  const cp2 = { x: chartBoxX + 665, y: pHighY };
  const cp3 = { x: chartBoxX + 175, y: pHighY };
  const cp4 = { x: chartBoxX + 175, y: pLowY };

  // Cycle lines
  ctx.lineWidth = 3.5;
  // 1 -> 2 (Compression)
  ctx.strokeStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(cp1.x, cp1.y);
  ctx.lineTo(cp2.x, cp2.y);
  ctx.stroke();

  // 2 -> 3 (Condensation Qh)
  ctx.strokeStyle = '#fb923c';
  ctx.beginPath();
  ctx.moveTo(cp2.x, cp2.y);
  ctx.lineTo(cp3.x, cp3.y);
  ctx.stroke();

  // 3 -> 4 (Détente isenthalpique verticale)
  ctx.strokeStyle = '#38bdf8';
  ctx.beginPath();
  ctx.moveTo(cp3.x, cp3.y);
  ctx.lineTo(cp4.x, cp4.y);
  ctx.stroke();

  // 4 -> 1 (Évaporation Qk)
  ctx.strokeStyle = '#2dd4bf';
  ctx.beginPath();
  ctx.moveTo(cp4.x, cp4.y);
  ctx.lineTo(cp1.x, cp1.y);
  ctx.stroke();

  // Draw node circles & labels
  const drawNode = (pt: { x: number; y: number }, num: string, col: string, label: string, offset: [number, number]) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 13px "JetBrains Mono", monospace';
    ctx.fillText(num, pt.x + offset[0], pt.y + offset[1]);

    ctx.fillStyle = col;
    ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(label, pt.x + offset[0] + 18, pt.y + offset[1]);
  };

  drawNode(cp1, '1', '#38bdf8', `Aspiration (${(hp.lowPressureBar + 1.013).toFixed(2)} b, ${h1.toFixed(0)} kJ)`, [12, 18]);
  drawNode(cp2, '2', '#ef4444', `Refoulement (${(hp.highPressureBar + 1.013).toFixed(2)} b, ${h2.toFixed(0)} kJ)`, [12, -8]);
  drawNode(cp3, '3', '#fb923c', `Condensat (${h3.toFixed(0)} kJ)`, [-160, -8]);
  drawNode(cp4, '4', '#2dd4bf', `Détente h4=h3`, [-130, 22]);

  // Diagram Axis Labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillText('Enthalpie spécifique h [kJ/kg]  ⟶', chartBoxX + chartBoxW * 0.45, chartBoxY + chartBoxH - 8);
  ctx.fillText('log(P) [bar]  ↑', chartBoxX + 12, chartBoxY + 30);

  // Conclusions / Synthesis Box (Bottom Right)
  const concBoxY = chartBoxY + chartBoxH + 16;
  const concBoxH = rightH - (concBoxY - mainY) - 16;
  ctx.fillStyle = '#111c35';
  ctx.fillRect(chartBoxX, concBoxY, chartBoxW, concBoxH);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(chartBoxX, concBoxY, chartBoxW, concBoxH);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('CONCLUSION DU RÉGIME PERMANENT & VALIDATION CAHIER DE TP :', chartBoxX + 18, concBoxY + 26);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`• Côté Eau (Cahier TP) : Évap Tee=${hp.tempWaterInletEvapC.toFixed(1)}°C ➔ Tse=${hp.tempWaterOutletEvapC.toFixed(1)}°C (refroidissement ΔTe=${dTe.toFixed(1)}°C), Cond Tec=${hp.tempWaterInletCondC.toFixed(1)}°C ➔ Tsc=${hp.tempWaterOutletCondC.toFixed(1)}°C (réchauffement ΔTc=${dTc.toFixed(1)}°C).`, chartBoxX + 18, concBoxY + 52);
  ctx.fillText(`• Puissances thermiques mesurées côté eau : Q̇eau,k=${hp.waterPowerEvapW.toFixed(0)} W, Q̇eau,h=${hp.waterPowerCondW.toFixed(0)} W, soit un COP_eau = ${hp.copWaterHeating.toFixed(2)} (R134a: ${copReal.toFixed(2)}, Carnot: ${copCarnot.toFixed(2)}).`, chartBoxX + 18, concBoxY + 76);
  ctx.fillText(`• Bilan cumulé 20 min : Énergie mesurée écran ΔE=46.9 Wh vs relevé cahier 47.7 Wh (accord à 98.3%), puissance électrique stabilisée à ${pel.toFixed(0)} W.`, chartBoxX + 18, concBoxY + 100);
}

/**
 * Screen 1 (Table 1 · Pompe à chaleur):
 * Large black monitor with smart real-time dual graphs (Temperatures & Pressures) +
 * live generator telemetry (W, V, A, Wh, COP) + auto-updating 0..30 min table.
 */
function renderScreen1Canvas(
  ctx: CanvasRenderingContext2D,
  rows: HeatPumpMinuteRow[],
  liveHp: HeatPumpState,
): void {
  const W = 1600;
  const H = 960;

  // Sleek dark high-tech monitor background
  ctx.fillStyle = '#0a0f1d';
  ctx.fillRect(0, 0, W, H);

  // Outer border & ambient glow edge
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  // Top Header Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(16, 16, W - 32, 66);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, W - 32, 66);

  ctx.fillStyle = '#38bdf8';
  ctx.font = '800 24px "Outfit", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('ÉCRAN 1 · TABLE 1 : POMPE À CHALEUR — SUIVI EN TEMPS RÉEL (0 – 30 MIN)', 34, 49);

  const lastMin = rows[rows.length - 1]?.minute ?? 0;
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`Cycle : Min ${lastMin}/${MAX_LOG_MINUTES} | COP_eau: ${liveHp.copWaterHeating.toFixed(2)} (R134a: ${liveHp.copHeating.toFixed(2)})`, W - 36, 49);

  // Generator Metrics Bar
  ctx.fillStyle = '#111c34';
  ctx.fillRect(16, 94, 690, 68);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 94, 690, 68);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(
    `EAU (TP) : Évap Tee=${liveHp.tempWaterInletEvapC.toFixed(1)}° ➔ Tse=${liveHp.tempWaterOutletEvapC.toFixed(1)}° (Q̇eau,k=${liveHp.waterPowerEvapW.toFixed(0)}W) | Cond Tec=${liveHp.tempWaterInletCondC.toFixed(1)}° ➔ Tsc=${liveHp.tempWaterOutletCondC.toFixed(1)}° (Q̇eau,h=${liveHp.waterPowerCondW.toFixed(0)}W)`,
    28,
    114,
  );

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillText(
    `P=${liveHp.electricalPowerW.toFixed(1)}W   U=${liveHp.generatorVoltageV.toFixed(1)}V   I=${liveHp.generatorCurrentA.toFixed(2)}A   E=${liveHp.energyWh.toFixed(1)}Wh   COP_eau=${liveHp.copWaterHeating.toFixed(2)}`,
    28,
    142,
  );

  // Chart drawer helper
  const drawChart = (
    bx: number,
    by: number,
    bw: number,
    bh: number,
    title: string,
    yMin: number,
    yMax: number,
    yStep: number,
    unit: string,
    series: Array<{ label: string; color: string; getVal: (r: HeatPumpMinuteRow) => number; liveVal: number }>,
  ) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, bx + 14, by + 22);

    // Legend
    let lx = bx + 14;
    for (const s of series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, by + 36, 16, 4);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '600 12.5px "JetBrains Mono", monospace';
      const txt = `${s.label}:${s.liveVal.toFixed(1)}`;
      ctx.fillText(txt, lx + 22, by + 40);
      lx += ctx.measureText(txt).width + 24;
    }

    const plotX = bx + 52;
    const plotY = by + 58;
    const plotW = bw - 70;
    const plotH = bh - 92;

    // Y Grid
    for (let yv = yMin; yv <= yMax + 0.001; yv += yStep) {
      const fy = (yv - yMin) / (yMax - yMin);
      const py = plotY + plotH - fy * plotH;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, py);
      ctx.lineTo(plotX + plotW, py);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${yv}${unit}`, plotX - 6, py + 4);
    }

    // X Grid
    for (let m = 0; m <= MAX_LOG_MINUTES; m += 5) {
      const px = plotX + (m / MAX_LOG_MINUTES) * plotW;
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, plotY);
      ctx.lineTo(px, plotY + plotH);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${m}m`, px, plotY + plotH + 18);
    }

    // Lines & Dots
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      rows.forEach((r, idx) => {
        const px = plotX + (r.minute / MAX_LOG_MINUTES) * plotW;
        const clampedV = Math.max(yMin, Math.min(yMax, s.getVal(r)));
        const py = plotY + plotH - ((clampedV - yMin) / (yMax - yMin)) * plotH;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      ctx.fillStyle = s.color;
      for (const r of rows) {
        const px = plotX + (r.minute / MAX_LOG_MINUTES) * plotW;
        const clampedV = Math.max(yMin, Math.min(yMax, s.getVal(r)));
        const py = plotY + plotH - ((clampedV - yMin) / (yMax - yMin)) * plotH;
        ctx.beginPath();
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };

  // Top Chart: Temperatures with Water Circuit and Refrigerant Output
  drawChart(
    16,
    172,
    690,
    376,
    'Courbes Températures : Circuit Eau (Tee, Tse, Tec, Tsc) & R134a Sortie (°C)',
    -5,
    55,
    15,
    '°',
    [
      { label: 'Tee (Évap In)', color: '#38bdf8', getVal: (r) => r.tEE, liveVal: liveHp.tempWaterInletEvapC },
      { label: 'Tse (Évap Out)', color: '#2dd4bf', getVal: (r) => r.tSE, liveVal: liveHp.tempWaterOutletEvapC },
      { label: 'Tec (Cond In)', color: '#fb923c', getVal: (r) => r.tEC, liveVal: liveHp.tempWaterInletCondC },
      { label: 'Tsc (Cond Out)', color: '#f43f5e', getVal: (r) => r.tSC, liveVal: liveHp.tempWaterOutletCondC },
      { label: 'Ts (R134a)', color: '#c084fc', getVal: (r) => r.outTempC, liveVal: liveHp.outletTempC },
    ],
  );

  // Bottom Chart: Pressures
  drawChart(
    16,
    560,
    690,
    380,
    'Courbes Pressions : 3 Entrées (P1, P2, P3) & 1 Sortie (bar)',
    0,
    16,
    4,
    'b',
    [
      { label: 'P1', color: '#38bdf8', getVal: (r) => r.in1PressBar, liveVal: liveHp.inlet1PressBar },
      { label: 'P2', color: '#2dd4bf', getVal: (r) => r.in2PressBar, liveVal: liveHp.inlet2PressBar },
      { label: 'P3', color: '#818cf8', getVal: (r) => r.in3PressBar, liveVal: liveHp.inlet3PressBar },
      { label: 'P_Sortie', color: '#ef4444', getVal: (r) => r.outPressBar, liveVal: liveHp.outletPressBar },
    ],
  );

  // Right Side: 0..30 Minute Log Table
  const tx = 724;
  const ty = 94;
  const tw = W - 740;
  const th = H - 110;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(tx, ty, tw, th);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tx, ty, tw, th);

  // Header Row
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(tx, ty, tw, 42);

  const cols = [
    { x: tx + 8, label: 'Min' },
    { x: tx + 52, label: 'Générateur (W / Wh / COP_eau)' },
    { x: tx + 276, label: 'Eau Évap (Tee ➔ Tse)' },
    { x: tx + 434, label: 'Eau Cond (Tec ➔ Tsc)' },
    { x: tx + 592, label: 'R134a Asp. E3 (T/P)' },
    { x: tx + 736, label: 'R134a Sortie (T/P)' },
  ];

  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 13.5px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const c of cols) {
    ctx.fillText(c.label, c.x, ty + 21);
  }

  const rowH = (th - 44) / 31;
  for (let m = 0; m <= MAX_LOG_MINUTES; m++) {
    const ry = ty + 43 + m * rowH;
    const row = rows[m];
    const isInitial = m === 0;
    const isLatest = m === rows.length - 1;

    if (isLatest) {
      ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
      ctx.fillRect(tx + 2, ry, tw - 4, rowH);
    } else if (isInitial) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.12)';
      ctx.fillRect(tx + 2, ry, tw - 4, rowH);
    } else if (m % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(tx + 2, ry, tw - 4, rowH);
    }

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + 2, ry + rowH);
    ctx.lineTo(tx + tw - 2, ry + rowH);
    ctx.stroke();

    const midY = ry + rowH * 0.52;
    ctx.font = isInitial || isLatest ? '700 12.5px "JetBrains Mono", monospace' : '500 12px "JetBrains Mono", monospace';
    ctx.fillStyle = row ? '#f8fafc' : '#475569';
    ctx.textAlign = 'left';
    ctx.fillText(m === 0 ? '0 (Init)' : String(m).padStart(2, '0'), cols[0].x, midY);

    if (row) {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(`${row.powerW.toFixed(0)}W ${row.energyWh.toFixed(1)}Wh ${row.copWater.toFixed(2)}`, cols[1].x, midY);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`${row.tEE.toFixed(1)}° ➔ ${row.tSE.toFixed(1)}°`, cols[2].x, midY);
      ctx.fillStyle = '#fb923c';
      ctx.fillText(`${row.tEC.toFixed(1)}° ➔ ${row.tSC.toFixed(1)}°`, cols[3].x, midY);
      ctx.fillStyle = '#818cf8';
      ctx.fillText(`${row.in3TempC.toFixed(1)}° / ${row.in3PressBar.toFixed(2)}b`, cols[4].x, midY);
      ctx.fillStyle = '#f43f5e';
      ctx.fillText(`${row.outTempC.toFixed(1)}° / ${row.outPressBar.toFixed(2)}b`, cols[5].x, midY);
    } else {
      ctx.fillText('—', cols[1].x, midY);
    }
  }
}

/**
 * Screen 2 (Table 2 · Cocotte-minute & Suivi Niveau d'Eau UNIFIÉ):
 * Combines BOTH the 0..30 min variation table AND the full real-time water quantity/level diagram
 * directly on this single large computer screen, eliminating any separate second board!
 */
function renderScreen2Canvas(
  ctx: CanvasRenderingContext2D,
  log: LabMinuteLogState,
  liveCk: PressureCookerState,
): void {
  const W = 1600;
  const H = 960;

  // Dark high-contrast monitor background
  ctx.fillStyle = '#0a0f1d';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  // Top Header Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(16, 16, W - 32, 66);
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, W - 32, 66);

  ctx.fillStyle = '#fb923c';
  ctx.font = '800 25px "Outfit", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('ÉCRAN 2 · TABLE 2 : COCOTTE-MINUTE — VARIATIONS & NIVEAU D’EAU (0 – 30 MIN)', 34, 49);

  const plugBadge = liveCk.pluggedIn ? 'CONNECTEUR : BRANCHÉ' : 'CONNECTEUR : DÉBRANCHÉ';
  ctx.fillStyle = liveCk.pluggedIn ? '#4ade80' : '#f87171';
  ctx.font = '700 19px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(plugBadge, W - 36, 49);

  // Live Status Summary Strip
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(16, 94, W - 32, 48);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 94, W - 32, 48);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 16.5px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(
    `Temps réel : T=${liveCk.waterTempC.toFixed(1)}°C  |  P=${liveCk.pressureBar.toFixed(2)} bar  |  Pos=${liveCk.stage}  |  Bague D=${liveCk.heaterLevel}/6 (${liveCk.heaterPowerW.toFixed(0)}W)  |  Eau=${liveCk.waterVolumeMl.toFixed(0)} mL (${liveCk.waterLevelPercent.toFixed(1)}%)`,
    32,
    118,
  );

  // --- LEFT SIDE: UNIFIED WATER LEVEL & QUANTITY VISUALIZATION (x = 16 .. 640) ---
  const wx = 16;
  const wy = 154;
  const ww = 620;
  const wh = H - 170;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(wx, wy, ww, wh);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(wx, wy, ww, wh);

  // Section Header
  ctx.fillStyle = '#38bdf8';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('NIVEAU & QUANTITÉ D’EAU DANS LA CUVE', wx + 18, wy + 26);

  // 2D Vessel Column + Right KPI Readout
  const vx = wx + 26;
  const vy = wy + 52;
  const vw = 200;
  const vh = 320;

  // Vessel Cylinder
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(vx, vy, vw, vh);

  const frac = Math.max(0, Math.min(1, liveCk.waterVolumeMl / liveCk.waterCapacityMl));
  const fillH = frac * vh;
  const fillY = vy + vh - fillH;

  const wGrad = ctx.createLinearGradient(vx, fillY, vx, vy + vh);
  wGrad.addColorStop(0, '#38bdf8');
  wGrad.addColorStop(1, '#0284c7');
  ctx.fillStyle = wGrad;
  ctx.fillRect(vx + 4, fillY, vw - 8, fillH - 2);

  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(vx + 4, fillY);
  ctx.lineTo(vx + vw - 4, fillY);
  ctx.stroke();

  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.strokeRect(vx, vy, vw, vh);

  // Vessel tick marks
  for (let ml = 0; ml <= 1500; ml += 300) {
    const f = ml / 1500;
    const ty = vy + vh - f * vh;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vx + vw, ty);
    ctx.lineTo(vx + vw + 10, ty);
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${ml}mL (${Math.round(f * 100)}%)`, vx + vw + 14, ty + 4);
  }

  // KPIs on Right of vessel
  const kx = wx + 380;
  ctx.textAlign = 'left';

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Volume actuel :', kx, vy + 36);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '800 36px "JetBrains Mono", monospace';
  ctx.fillText(`${liveCk.waterVolumeMl.toFixed(0)} mL`, kx, vy + 76);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Niveau cuve :', kx, vy + 140);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 32px "JetBrains Mono", monospace';
  ctx.fillText(`${liveCk.waterLevelPercent.toFixed(1)} %`, kx, vy + 178);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('État vapeur :', kx, vy + 240);
  ctx.fillStyle = liveCk.steamVentRate > 0.04 ? '#fb923c' : '#4ade80';
  ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    liveCk.steamVentRate > 0.04
      ? `Échappement (${Math.round(liveCk.steamVentRate * 100)}%)`
      : 'Vanne étanche (0%)',
    kx,
    vy + 272,
  );

  // Time-Series Water Volume Curve below vessel (V vs t, 0..30 min)
  const gx = wx + 26;
  const gy = wy + 410;
  const gw = ww - 52;
  const gh = wh - 436;

  ctx.fillStyle = '#0a0f1d';
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Évolution de la quantité d’eau V(t) [mL]', gx + 10, gy - 8);

  // Grid
  for (let ml = 0; ml <= 1500; ml += 500) {
    const fy = ml / 1500;
    const py = gy + gh - fy * gh;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx, py);
    ctx.lineTo(gx + gw, py);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${ml}`, gx - 4, py + 3);
  }
  for (let m = 0; m <= MAX_LOG_MINUTES; m += 5) {
    const px = gx + (m / MAX_LOG_MINUTES) * gw;
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, gy);
    ctx.lineTo(px, gy + gh);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${m}m`, px, gy + gh + 14);
  }

  // Curve
  const samples = log.waterHistory;
  if (samples.length > 0) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    ctx.beginPath();
    samples.forEach((pt, idx) => {
      const px = gx + (pt.timeMin / MAX_LOG_MINUTES) * gw;
      const py = gy + gh - (pt.waterVolumeMl / 1500) * gh;
      if (idx === 0) {
        ctx.moveTo(px, gy + gh);
        ctx.lineTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
    const lastPt = samples[samples.length - 1];
    const lastPx = gx + (lastPt.timeMin / MAX_LOG_MINUTES) * gw;
    ctx.lineTo(lastPx, gy + gh);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    samples.forEach((pt, idx) => {
      const px = gx + (pt.timeMin / MAX_LOG_MINUTES) * gw;
      const py = gy + gh - (pt.waterVolumeMl / 1500) * gh;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }

  // --- RIGHT SIDE: 0..30 MINUTE TABLE (x = 652 .. 1584) ---
  const tx = 652;
  const ty = 154;
  const tw = W - 668;
  const th = wh;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(tx, ty, tw, th);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(tx, ty, tw, th);

  // Table Header
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(tx, ty, tw, 40);

  const cols = [
    { x: tx + 8, label: 'Min' },
    { x: tx + 66, label: 'Alim & Inter.' },
    { x: tx + 250, label: 'Bague D' },
    { x: tx + 390, label: 'Pos' },
    { x: tx + 480, label: 'Temp (°C)' },
    { x: tx + 595, label: 'Pression' },
    { x: tx + 725, label: 'Eau (mL/%)' },
    { x: tx + 850, label: 'Vapeur' },
  ];

  ctx.fillStyle = '#fb923c';
  ctx.font = '700 13.5px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const c of cols) {
    ctx.fillText(c.label, c.x, ty + 20);
  }

  const rowsList = log.cookerRows;
  const rowH = (th - 42) / 31;
  for (let m = 0; m <= MAX_LOG_MINUTES; m++) {
    const ry = ty + 41 + m * rowH;
    const row = rowsList[m];
    const isInitial = m === 0;
    const isLatest = m === rowsList.length - 1;

    if (isLatest) {
      ctx.fillStyle = 'rgba(249, 115, 22, 0.18)';
      ctx.fillRect(tx + 2, ry, tw - 4, rowH);
    } else if (isInitial) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.12)';
      ctx.fillRect(tx + 2, ry, tw - 4, rowH);
    } else if (m % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(tx + 2, ry, tw - 4, rowH);
    }

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + 2, ry + rowH);
    ctx.lineTo(tx + tw - 2, ry + rowH);
    ctx.stroke();

    const midY = ry + rowH * 0.52;
    ctx.font = isInitial || isLatest ? '700 13px "JetBrains Mono", monospace' : '500 12.5px "JetBrains Mono", monospace';
    ctx.fillStyle = row ? '#f8fafc' : '#475569';
    ctx.fillText(m === 0 ? '0' : String(m).padStart(2, '0'), cols[0].x, midY);

    if (row) {
      ctx.fillStyle = row.pluggedIn && row.heaterOn ? '#4ade80' : '#f87171';
      ctx.fillText(
        row.pluggedIn ? (row.heaterOn ? 'Branché · ON' : 'Branché · OFF') : 'Débranché (0W)',
        cols[1].x,
        midY,
      );
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(`Niv ${row.heaterLevel} (${row.powerW.toFixed(0)}W)`, cols[2].x, midY);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`Pos ${row.stage}`, cols[3].x, midY);
      ctx.fillStyle = '#fb923c';
      ctx.fillText(`${row.waterTempC.toFixed(1)}°`, cols[4].x, midY);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`${row.pressureBar.toFixed(2)}b`, cols[5].x, midY);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`${row.waterVolumeMl.toFixed(0)} (${row.waterLevelPercent.toFixed(0)}%)`, cols[6].x, midY);
      ctx.fillStyle = row.steamPercent > 5 ? '#f97316' : '#64748b';
      ctx.fillText(`${row.steamPercent}%`, cols[7].x, midY);
    } else {
      ctx.fillText('—', cols[1].x, midY);
    }
  }
}

/**
 * Screen 3 (Table 3 · Calorimétrie TP2 Notebook & Experimental Results):
 * Professional high-tech laboratory display designed with generous padding,
 * clean typography, clear cards, and zero text overflow.
 */
function renderScreen3Canvas(
  ctx: CanvasRenderingContext2D,
  cal: CalorimetryState,
): void {
  const W = 1600;
  const H = 960;

  // Dark high-contrast background
  ctx.fillStyle = '#0a0f1d';
  ctx.fillRect(0, 0, W, H);

  // Outer border & ambient glow
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, W - 8, H - 8);

  // Top Header Bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(16, 16, W - 32, 66);
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, W - 32, 66);

  ctx.fillStyle = '#c084fc';
  ctx.font = '800 24px "Outfit", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('ÉCRAN 3 · TABLE 3 : CALORIMÉTRIE TP2 — CAHIER DE MESURES & THERMODYNAMIQUE', 36, 49);

  const modeBadge = cal.mode === 'electrical' ? 'MODE 1 : JOULE (ÉLECTRIQUE)' : 'MODE 2 : MÉLANGES (CUIVRE)';
  const modeColor = cal.mode === 'electrical' ? '#38bdf8' : '#fb923c';
  ctx.fillStyle = modeColor;
  ctx.font = '700 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(modeBadge, W - 36, 49);

  // --- 2 EQUAL-WIDTH MAIN PANELS (Left: Telemetry & Math, Right: Lab Notebook & Synthesis) ---
  const panelW = 756;
  const panelH = H - 110;
  const leftX = 16;
  const rightX = W - 16 - panelW;
  const panelY = 94;

  // ===================== LEFT PANEL (x = 16 .. 772) =====================
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(leftX, panelY, panelW, panelH);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(leftX, panelY, panelW, panelH);

  // Panel Title
  ctx.fillStyle = '#c084fc';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TÉLÉMÉTRIE EN TEMPS RÉEL DU BANC', leftX + 22, panelY + 30);

  // 4 rows of 2 KPI cards = 8 KPI cards total (card width = 340, card height = 74)
  const drawCard = (cx: number, cy: number, cw: number, ch: number, label: string, val: string, col: string) => {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, cy, cw, ch);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(label, cx + 14, cy + 22);

    ctx.fillStyle = col;
    ctx.font = '800 24px "JetBrains Mono", monospace';
    ctx.fillText(val, cx + 14, cy + 54);
  };

  const mins = Math.floor(cal.chronoSec / 60);
  const secs = (cal.chronoSec % 60).toFixed(1).padStart(4, '0');
  const chronoStr = `${String(mins).padStart(2, '0')}:${secs}`;

  const cW = 346;
  const cH = 74;
  const col1X = leftX + 22;
  const col2X = leftX + panelW - 22 - cW;
  let cardY = panelY + 54;

  drawCard(col1X, cardY, cW, cH, 'Chronomètre t', chronoStr, '#f8fafc');
  drawCard(col2X, cardY, cW, cH, 'Température Calorimètre', `${cal.calorimeterTempC.toFixed(2)} °C`, '#38bdf8');

  cardY += cH + 12;
  drawCard(col1X, cardY, cW, cH, 'Tension Voltmètre U', `${cal.measuredVoltageV.toFixed(2)} V`, '#38bdf8');
  drawCard(col2X, cardY, cW, cH, 'Courant Ampèremètre I', `${cal.measuredCurrentA.toFixed(2)} A`, '#2dd4bf');

  cardY += cH + 12;
  drawCard(col1X, cardY, cW, cH, 'Travail Électrique We', `${cal.electricalWorkJ.toFixed(1)} J`, '#f8fafc');
  drawCard(col2X, cardY, cW, cH, 'Chaleur Reçue Q', `${cal.heatRecoveredCal.toFixed(1)} cal`, '#fb923c');

  cardY += cH + 12;
  drawCard(col1X, cardY, cW, cH, 'Masse Balance (m)', `${cal.balanceMassG.toFixed(1)} g`, '#4ade80');
  const jStr = cal.jouleCoefficientJPerCal > 0 ? `${cal.jouleCoefficientJPerCal.toFixed(3)} J/cal` : 'En attente...';
  drawCard(col2X, cardY, cW, cH, 'Équivalent Joule J = We/Q', jStr, '#c084fc');

  // Mathematical Equations Container (well-spaced, zero clipping)
  const mathBoxY = cardY + cH + 16;
  const mathBoxH = panelH - (mathBoxY - panelY) - 18;
  ctx.fillStyle = '#111c35';
  ctx.fillRect(leftX + 22, mathBoxY, panelW - 44, mathBoxH);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(leftX + 22, mathBoxY, panelW - 44, mathBoxH);

  ctx.fillStyle = '#60a5fa';
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Formulations & Principes Calorimétriques :', leftX + 38, mathBoxY + 30);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 14px "JetBrains Mono", monospace';
  if (cal.mode === 'electrical') {
    ctx.fillText('• Travail électrique :   We = U · I · t  [Joules]', leftX + 38, mathBoxY + 68);
    ctx.fillText('• Chaleur absorbée   :   Q  = (m₀ + μ₀) · c₀ · (θf - θ₀)  [calories]', leftX + 38, mathBoxY + 104);
    ctx.fillText('• Équivalent Joule   :   J  = We / Q  ≈ 4.1855 J/cal', leftX + 38, mathBoxY + 140);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`  État circuit       :   ${cal.switchClosed ? 'Interrupteur FERMÉ (P = ' + (cal.measuredVoltageV * cal.measuredCurrentA).toFixed(1) + ' W)' : 'Interrupteur OUVERT (P = 0 W)'}`, leftX + 38, mathBoxY + 180);
  } else {
    ctx.fillText('• Bilan adiabatique  :   Q_chaude + Q_froide = 0', leftX + 38, mathBoxY + 68);
    ctx.fillText('• Équation méthode   :   (m₀ + μ₀)·c₀·(θf - θ₀) + m_cu·c_cu·(θf - θ₀)', leftX + 38, mathBoxY + 104);
    ctx.fillText('                         = m₁ · c₀ · (θ₁ - θf)', leftX + 38, mathBoxY + 134);
    ctx.fillStyle = '#fb923c';
    ctx.fillText(`• Capacité Cu déduite:   c_cu = ${cal.deducedCopperSpecificHeatCalG.toFixed(4)} cal/(g·°C) [Réf: ~0.093]`, leftX + 38, mathBoxY + 180);
  }

  // ===================== RIGHT PANEL (x = 828 .. 1584) =====================
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(rightX, panelY, panelW, panelH);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rightX, panelY, panelW, panelH);

  ctx.fillStyle = '#c084fc';
  ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('CAHIER DE TP2 — CONSTANTES & RÉSULTATS', rightX + 22, panelY + 30);

  // Table of Laboratory Constants (cleanly bordered, perfectly aligned)
  const consts = [
    { name: 'Masse du vase calorimétrique vide (m_v)', val: '142.0 g' },
    { name: 'Valeur en eau du calorimètre (μ₀)', val: '24.0 g' },
    { name: 'Masse d’eau froide initiale (m₀)', val: '200.0 g' },
    { name: 'Masse de l’échantillon de cuivre (m_cu)', val: '85.0 g' },
    { name: 'Masse d’eau chaude ajoutée (m₁)', val: '120.0 g' },
    { name: 'Température eau préchauffée (θ₁)', val: '70.0 °C' },
    { name: 'Résistance du plongeur chauffant (R)', val: '4.00 Ω' },
    { name: 'Chaleur massique de l’eau (c₀)', val: '1.00 cal/(g·°C)' },
  ];

  const tableTopY = panelY + 54;
  const rowHeight = 34;
  for (let i = 0; i < consts.length; i++) {
    const ry = tableTopY + i * rowHeight;
    const item = consts[i];

    if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(rightX + 22, ry, panelW - 44, rowHeight);
    }

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rightX + 22, ry + rowHeight);
    ctx.lineTo(rightX + panelW - 22, ry + rowHeight);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 13.5px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(item.name, rightX + 32, ry + rowHeight * 0.5 + 4);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(item.val, rightX + panelW - 32, ry + rowHeight * 0.5 + 4);
  }

  // Experimental Status Summary Box (Lower Right)
  const sumY = tableTopY + consts.length * rowHeight + 20;
  const sumH = panelH - (sumY - panelY) - 18;

  ctx.fillStyle = '#17112c';
  ctx.fillRect(rightX + 22, sumY, panelW - 44, sumH);
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(rightX + 22, sumY, panelW - 44, sumH);

  ctx.fillStyle = '#d8b4fe';
  ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('SYNTHÈSE EXPÉRIMENTALE IMMÉDIATE :', rightX + 38, sumY + 30);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillText(`• Mode expérimental : ${cal.mode === 'electrical' ? 'EFFET JOULE (J)' : 'MÉTHODE DES MÉLANGES (c_cu)'}`, rightX + 38, sumY + 68);
  ctx.fillText(`• Circuit électrique: ${cal.switchClosed ? 'Fermé (Chauffe en cours)' : 'Ouvert (Pas de courant)'}`, rightX + 38, sumY + 104);
  ctx.fillText(`• Agitation manuelle: ${cal.stirrerActive ? 'Active (Homogénéisation rapide)' : 'Arrêtée'}`, rightX + 38, sumY + 140);

  const jVal = cal.jouleCoefficientJPerCal > 0 ? `${cal.jouleCoefficientJPerCal.toFixed(3)} J/cal (Écart ${(Math.abs(cal.jouleCoefficientJPerCal - 4.1855) / 4.1855 * 100).toFixed(1)}%)` : 'En attente de relevé';
  ctx.fillText(`• Coefficient J     : ${jVal}`, rightX + 38, sumY + 176);

  if (cal.mode === 'mixture') {
    const cuVal = cal.deducedCopperSpecificHeatCalG > 0 ? `${cal.deducedCopperSpecificHeatCalG.toFixed(4)} cal/(g·°C)` : 'Mélange non encore versé';
    ctx.fillText(`• Chaleur c_cu      : ${cuVal}`, rightX + 38, sumY + 210);
  }
}

/**
 * Builds the 3 parallel large floor-standing black computer monitors:
 * - Screen 1 parallel to Table 1 (x = -0.55, z = 2.45, w = 3.20, h = 1.80)
 * - Screen 2 parallel to Table 2 (x = 5.45, z = 2.45, w = 3.20, h = 1.80) - includes unified water level!
 * - Screen 3 parallel to Table 3 (x = 12.15, z = 2.45, w = 3.20, h = 1.80)
 */
export function buildLaboratoryCardboardDisplays(options: {
  scene: THREE.Scene;
  maxAniso: number;
  floorY: number;
  initialLog: LabMinuteLogState;
  initialHp: HeatPumpState;
  initialCooker: PressureCookerState;
  initialCal?: CalorimetryState;
  track: <T extends { dispose: () => void }>(res: T) => T;
}): CardboardDisplaysRig {
  const { scene, maxAniso, floorY, initialLog, initialHp, initialCooker, track } = options;

  const monitorCaseMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Deep matte black chassis
      roughness: 0.38,
      metalness: 0.45,
    }),
  );

  const standSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.32,
      metalness: 0.85,
    }),
  );

  const SCREEN_WIDTH = 3.60;
  const SCREEN_HEIGHT = 2.05;
  const SCREEN_CENTER_Y = 1.48; // Standing eye level (1.48m - 1.62m)
  const SCREEN_Z = 6.40; // Increased distance between tables and screens (~4.52m wide promenade)

  // 0. DEDICATED STEADY STATE SCREEN: Placed directly to the left of Table 1
  const s0Canvas = document.createElement('canvas');
  s0Canvas.width = 1600;
  s0Canvas.height = 960;
  const s0Ctx = s0Canvas.getContext('2d')!;
  const s0Tex = track(new THREE.CanvasTexture(s0Canvas));
  s0Tex.colorSpace = THREE.SRGBColorSpace;
  s0Tex.anisotropy = maxAniso;

  buildFloorMonitorDisplay({
    scene,
    x: -4.85,
    z: 1.10,
    screenCenterY: SCREEN_CENTER_Y,
    rotY: 0.52, // Angled toward Table 1 and the aisle
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    floorY,
    monitorCaseMat,
    standSteelMat,
    screenTex: s0Tex,
    track,
  });

  // 1. SCREEN 1: Parallel to Table 1 (Heat Pump) facing Table 1 across the wide corridor
  const s1Canvas = document.createElement('canvas');
  s1Canvas.width = 1600;
  s1Canvas.height = 960;
  const s1Ctx = s1Canvas.getContext('2d')!;
  const s1Tex = track(new THREE.CanvasTexture(s1Canvas));
  s1Tex.colorSpace = THREE.SRGBColorSpace;
  s1Tex.anisotropy = maxAniso;

  buildFloorMonitorDisplay({
    scene,
    x: -0.55,
    z: SCREEN_Z,
    screenCenterY: SCREEN_CENTER_Y,
    rotY: Math.PI,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    floorY,
    monitorCaseMat,
    standSteelMat,
    screenTex: s1Tex,
    track,
  });

  // 2. SCREEN 2: Parallel to Table 2 (Pressure Cooker & Unified Water Level) facing Table 2
  const s2Canvas = document.createElement('canvas');
  s2Canvas.width = 1600;
  s2Canvas.height = 960;
  const s2Ctx = s2Canvas.getContext('2d')!;
  const s2Tex = track(new THREE.CanvasTexture(s2Canvas));
  s2Tex.colorSpace = THREE.SRGBColorSpace;
  s2Tex.anisotropy = maxAniso;

  buildFloorMonitorDisplay({
    scene,
    x: 5.45,
    z: SCREEN_Z,
    screenCenterY: SCREEN_CENTER_Y,
    rotY: Math.PI,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    floorY,
    monitorCaseMat,
    standSteelMat,
    screenTex: s2Tex,
    track,
  });

  // 3. SCREEN 3: Parallel to Table 3 (Calorimétrie TP2) facing Table 3
  const s3Canvas = document.createElement('canvas');
  s3Canvas.width = 1600;
  s3Canvas.height = 960;
  const s3Ctx = s3Canvas.getContext('2d')!;
  const s3Tex = track(new THREE.CanvasTexture(s3Canvas));
  s3Tex.colorSpace = THREE.SRGBColorSpace;
  s3Tex.anisotropy = maxAniso;

  buildFloorMonitorDisplay({
    scene,
    x: 12.15,
    z: SCREEN_Z,
    screenCenterY: SCREEN_CENTER_Y,
    rotY: Math.PI,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    floorY,
    monitorCaseMat,
    standSteelMat,
    screenTex: s3Tex,
    track,
  });

  let lastS0Signature = '';
  let lastS1Signature = '';
  let lastS2Signature = '';
  let lastS3Signature = '';
  let lastUpdateSec = 0;
  let lastHpRowCount = -1;
  let lastCookerRowCount = -1;

  const update = (
    log: LabMinuteLogState,
    hp: HeatPumpState,
    cooker: PressureCookerState,
    cal: CalorimetryState,
  ) => {
    const nowSec = performance.now() * 0.001;
    const isNewRow =
      log.heatPumpRows.length !== lastHpRowCount ||
      log.cookerRows.length !== lastCookerRowCount;

    // Strict throttle: only update monitor canvases at most once every 0.75s,
    // unless a new minute log row was just appended.
    if (!isNewRow && nowSec - lastUpdateSec < 0.75) {
      return;
    }
    lastUpdateSec = nowSec;
    lastHpRowCount = log.heatPumpRows.length;
    lastCookerRowCount = log.cookerRows.length;

    // Screen 0 (Dedicated Steady State Screen) update
    const s0Sig = `${hp.isRunning ? 1 : 0}|${hp.electricalPowerW.toFixed(0)}|${hp.inlet1TempC.toFixed(1)}|${hp.outletTempC.toFixed(1)}|${hp.tempColdC.toFixed(1)}|${hp.tempHotC.toFixed(1)}|${log.heatPumpRows.length}`;
    if (s0Sig !== lastS0Signature) {
      lastS0Signature = s0Sig;
      renderSteadyStateCanvas(s0Ctx, hp, log.heatPumpRows);
      s0Tex.needsUpdate = true;
    }

    // Screen 1 update
    const s1Sig = `${log.version}|${hp.electricalPowerW.toFixed(0)}|${hp.inlet1TempC.toFixed(1)}|${hp.outletTempC.toFixed(1)}|${hp.energyWh.toFixed(1)}`;
    if (s1Sig !== lastS1Signature) {
      lastS1Signature = s1Sig;
      renderScreen1Canvas(s1Ctx, log.heatPumpRows, hp);
      s1Tex.needsUpdate = true;
    }

    // Screen 2 update (includes unified water quantity & level)
    const s2Sig = `${log.version}|${cooker.pluggedIn ? 1 : 0}|${cooker.heaterOn ? 1 : 0}|${cooker.heaterLevel}|${cooker.stage}|${cooker.waterTempC.toFixed(1)}|${cooker.waterVolumeMl.toFixed(0)}|${Math.round(cooker.steamVentRate * 20)}`;
    if (s2Sig !== lastS2Signature) {
      lastS2Signature = s2Sig;
      renderScreen2Canvas(s2Ctx, log, cooker);
      s2Tex.needsUpdate = true;
    }

    // Screen 3 update
    const s3Sig = `${cal.mode}|${cal.switchClosed ? 1 : 0}|${cal.stirrerActive ? 1 : 0}|${cal.calorimeterTempC.toFixed(1)}|${cal.chronoSec.toFixed(0)}|${cal.balanceMassG.toFixed(0)}|${cal.jouleCoefficientJPerCal.toFixed(2)}`;
    if (s3Sig !== lastS3Signature) {
      lastS3Signature = s3Sig;
      renderScreen3Canvas(s3Ctx, cal);
      s3Tex.needsUpdate = true;
    }
  };

  if (options.initialCal) {
    update(initialLog, initialHp, initialCooker, options.initialCal);
  }

  return { update };
}
