import * as THREE from 'three';
import {
  AMMETER_CALIBRE_A,
  CalorimetryState,
  VOLTMETER_CALIBRE_V,
  labMeterValueToAngleRad,
} from '../simulation/calorimetry';
import {
  createAnalogLabMeterTexture,
  createBalanceLcdUpdater,
  createGraduatedCupTexture,
  createPowerSupplyFrontTexture,
  createStopwatchLcdUpdater,
  createTp2NotebookSpreadTexture,
  createWaterBottleLabelTexture,
} from './calorimetryTextures';
import { createLabTableTexture } from './textures';

export interface CalorimetryRig {
  anchors: {
    Calorimeter: THREE.Vector3;
    Balance: THREE.Vector3;
    Meters: THREE.Vector3;
    CupsBottle: THREE.Vector3;
  };
  update: (state: CalorimetryState, elapsedSec: number, dt: number) => void;
}

/**
 * Builds the Third Large Laboratory Table (Table 3, cleanly separated to the right of Table 2)
 * and equips it with the complete TP2 Calorimétrie experimental setup from the lab notebook:
 *  1. Adiabatic Calorimeter with removable inner vessel, immersion heating resistor R,
 *     oscillating manual stirrer ('agitateur'), and 0–110 °C (1/10 °C) precision thermometer
 *  2. Electronic Precision Balance ('balance électronique') with live gram LCD + spare empty vessel (m_v)
 *  3. Copper sample cylinder ('masse de cuivre' m_cu) + laboratory tongs
 *  4. Digital Benchtop Stopwatch ('chronomètre') with live mm:ss.d LCD
 *  5. Regulated DC Power Supply ('alimentation continue') + blade circuit switch K ('interrupteur')
 *  6. Analog Benchtop Voltmeter (U) & Ammeter (I) with calibre knobs & 4mm banana leads (Figure 1)
 *  7. Empty graduated cups/beakers AND water-filled cups/beakers (cold m_0 & heated m_1)
 *     plus a clear 1.5 L Water Bottle & laboratory distilled squeeze wash bottle + open TP2 notebook
 */
export function buildCalorimetryStation(options: {
  scene: THREE.Scene;
  maxAniso: number;
  shadowTex: THREE.CanvasTexture;
  thermStemTex: THREE.CanvasTexture;
  track: <T extends { dispose: () => void }>(res: T) => T;
  addContactShadow: (
    shadowTex: THREE.CanvasTexture,
    x: number,
    z: number,
    scaleX: number,
    scaleZ: number,
    opacity?: number,
    rotY?: number,
  ) => void;
}): CalorimetryRig {
  const { scene, maxAniso, shadowTex, thermStemTex, track, addContactShadow } = options;

  // Table 2 ends at x = +7.60. Place Table 3 starting at x = +8.55 (0.95 m clear floor aisle!)
  const table3X = 12.15;
  const table3Z = 0.20;
  const table3W = 7.20; // spans x = +8.55 .. +15.75 (large 3rd benchtop)
  const table3D = 3.60; // spans z = -1.60 .. +2.00

  // --- 1. THIRD LARGE LABORATORY TABLE (SEPARATE FROM TABLES 1 & 2) ---
  const tableGroup = new THREE.Group();
  const tableTex = track(createLabTableTexture(maxAniso));
  tableTex.repeat.set(7, 5);

  const topGeo = track(new THREE.BoxGeometry(table3W, 0.09, table3D));
  const topMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tableTex,
      roughness: 0.62,
      metalness: 0.04,
    }),
  );
  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.position.set(table3X, -0.045, table3Z);
  topMesh.receiveShadow = true;
  tableGroup.add(topMesh);

  const edgeGeo = track(new THREE.BoxGeometry(table3W + 0.02, 0.092, 0.03));
  const edgeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b424c,
      roughness: 0.45,
      metalness: 0.12,
    }),
  );
  const frontEdge = new THREE.Mesh(edgeGeo, edgeMat);
  frontEdge.position.set(table3X, -0.045, table3Z + table3D * 0.5);
  tableGroup.add(frontEdge);

  const frameMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x67707c,
      roughness: 0.45,
      metalness: 0.65,
    }),
  );
  const apronGeo = track(new THREE.BoxGeometry(table3W - 0.6, 0.12, 0.08));
  const frontApron = new THREE.Mesh(apronGeo, frameMat);
  frontApron.position.set(table3X, -0.15, table3Z + table3D * 0.5 - 0.22);
  tableGroup.add(frontApron);

  const legGeo = track(new THREE.BoxGeometry(0.11, 2.2, 0.11));
  for (const lx of [table3X - 3.25, table3X, table3X + 3.25]) {
    for (const lz of [-1.25, 1.72]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(lx, -1.19, lz);
      tableGroup.add(leg);
    }
  }
  scene.add(tableGroup);

  // --- SHARED PBR MATERIALS FOR TABLE 3 ---
  const brushedAlumMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdbe2ec,
      roughness: 0.26,
      metalness: 0.88,
    }),
  );
  const chromeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf4f7fb,
      roughness: 0.1,
      metalness: 0.95,
    }),
  );
  const copperMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd46f3b,
      roughness: 0.2,
      metalness: 0.9,
    }),
  );
  const brassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd4a63f,
      roughness: 0.24,
      metalness: 0.87,
    }),
  );
  const darkPhenolicMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x171b24,
      roughness: 0.34,
      metalness: 0.08,
    }),
  );
  const whiteHousingMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.34,
      metalness: 0.08,
    }),
  );
  const slateCaseMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.42,
      metalness: 0.28,
    }),
  );
  const redTerminalMat = track(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.28, metalness: 0.12 }),
  );
  const blackTerminalMat = track(
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.38, metalness: 0.1 }),
  );
  const blueCapMat = track(
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.26, metalness: 0.08 }),
  );

  // Glass & clear water materials (calibrated so empty cups & filled cups are both unmistakably crisp)
  const clearGlassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xe8f4fd,
      transparent: true,
      opacity: 0.32,
      roughness: 0.08,
      metalness: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const glassRimMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.78,
      roughness: 0.14,
      metalness: 0.16,
    }),
  );
  const clearWaterMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.66,
      roughness: 0.08,
      metalness: 0.05,
      depthWrite: false,
    }),
  );
  const warmWaterMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.64,
      roughness: 0.08,
      metalness: 0.05,
      depthWrite: false,
    }),
  );
  const meniscusMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.88,
      roughness: 0.06,
      metalness: 0.1,
    }),
  );

  // Helper to build a precision laboratory glass thermometer (0–110 °C)
  const buildLabThermometer = (length: number): THREE.Group => {
    const tg = new THREE.Group();
    const stemGeo = track(new THREE.CylinderGeometry(0.0105, 0.0105, length, 16));
    const stemMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: thermStemTex,
        roughness: 0.14,
        metalness: 0.06,
      }),
    );
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.castShadow = true;
    tg.add(stem);

    const bulbMat = track(
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.18, metalness: 0.2 }),
    );
    const bulbGeo = track(new THREE.SphereGeometry(0.015, 16, 12));
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.y = -length * 0.5 - 0.008;
    tg.add(bulb);

    const topCapGeo = track(new THREE.SphereGeometry(0.011, 14, 10));
    const topCap = new THREE.Mesh(topCapGeo, whiteHousingMat);
    topCap.position.y = length * 0.5;
    tg.add(topCap);
    return tg;
  };

  // --- 2. ELECTRONIC PRECISION BALANCE + COPPER SAMPLE + SPARE EMPTY CALORIMETRIC VESSEL ---
  const balX = 9.48;
  const balZ = 0.42;
  const balanceGroup = new THREE.Group();
  balanceGroup.position.set(balX, 0, balZ);
  balanceGroup.rotation.y = 0.22;

  const balBaseGeo = track(new THREE.BoxGeometry(0.48, 0.105, 0.54));
  const balBase = new THREE.Mesh(balBaseGeo, whiteHousingMat);
  balBase.position.y = 0.055;
  balBase.castShadow = true;
  balBase.receiveShadow = true;
  balanceGroup.add(balBase);

  // Sloped front digital LCD console on Electronic Balance
  const balConsoleGeo = track(new THREE.BoxGeometry(0.44, 0.065, 0.13));
  const balConsole = new THREE.Mesh(balConsoleGeo, slateCaseMat);
  balConsole.position.set(0, 0.072, 0.25);
  balConsole.rotation.x = -0.52;
  balanceGroup.add(balConsole);

  const balanceLcd = createBalanceLcdUpdater(maxAniso);
  track(balanceLcd);
  const balLcdGeo = track(new THREE.PlaneGeometry(0.28, 0.078));
  const balLcdMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: balanceLcd.texture,
      emissive: new THREE.Color(0x86efac),
      emissiveMap: balanceLcd.texture,
      emissiveIntensity: 0.24,
      roughness: 0.28,
    }),
  );
  const balLcdMesh = new THREE.Mesh(balLcdGeo, balLcdMat);
  balLcdMesh.position.set(-0.04, 0.088, 0.312);
  balLcdMesh.rotation.x = -0.52;
  balanceGroup.add(balLcdMesh);

  // Tare & On/Off tactile buttons on right of LCD
  for (const [bx, btnHex] of [
    [0.14, 0x0284c7],
    [0.18, 0xdc2626],
  ] as const) {
    const bGeo = track(new THREE.CylinderGeometry(0.013, 0.013, 0.016, 16));
    const bMat = track(new THREE.MeshStandardMaterial({ color: btnHex, roughness: 0.3 }));
    const btn = new THREE.Mesh(bGeo, bMat);
    btn.position.set(bx, 0.088, 0.31);
    btn.rotation.x = Math.PI / 2 - 0.52;
    balanceGroup.add(btn);
  }

  // Circular Stainless Weighing Pan + Clear Acrylic Draft Ring
  const panStemGeo = track(new THREE.CylinderGeometry(0.032, 0.038, 0.028, 24));
  const panStem = new THREE.Mesh(panStemGeo, chromeMat);
  panStem.position.set(0, 0.12, -0.03);
  balanceGroup.add(panStem);

  const panDiscGeo = track(new THREE.CylinderGeometry(0.165, 0.16, 0.016, 40));
  const panDisc = new THREE.Mesh(panDiscGeo, chromeMat);
  panDisc.position.set(0, 0.14, -0.03);
  panDisc.castShadow = true;
  panDisc.receiveShadow = true;
  balanceGroup.add(panDisc);

  const draftShieldGeo = track(new THREE.CylinderGeometry(0.195, 0.195, 0.095, 40, 1, true));
  const draftShield = new THREE.Mesh(draftShieldGeo, clearGlassMat);
  draftShield.position.set(0, 0.162, -0.03);
  draftShield.renderOrder = 4;
  balanceGroup.add(draftShield);

  scene.add(balanceGroup);
  addContactShadow(shadowTex, balX, balZ, 0.72, 0.78, 0.52, 0.22);

  // Polished Copper Sample Cylinder (m_cu = 85.0 g) — sits on Balance Pan initially, moves to Calorimeter in Mixture mode!
  const copperSampleGroup = new THREE.Group();
  const cuBodyGeo = track(new THREE.CylinderGeometry(0.034, 0.034, 0.092, 32));
  const cuBody = new THREE.Mesh(cuBodyGeo, copperMat);
  cuBody.position.y = 0.046;
  cuBody.castShadow = true;
  cuBody.receiveShadow = true;
  copperSampleGroup.add(cuBody);

  const cuHookGeo = track(new THREE.TorusGeometry(0.014, 0.0035, 10, 24));
  const cuHook = new THREE.Mesh(cuHookGeo, brassMat);
  cuHook.position.y = 0.102;
  copperSampleGroup.add(cuHook);

  const copperRestPos = new THREE.Vector3(balX - 0.006, 0.148, balZ - 0.028);
  copperSampleGroup.position.copy(copperRestPos);
  scene.add(copperSampleGroup);

  // Spare Empty Inner Calorimetric Aluminum Cup ('Vase calorimétrique vide' m_v = 142 g) + Crucible Tongs
  const emptyVesselX = 10.22;
  const emptyVesselZ = 0.68;
  const emptyAlumPts = [
    new THREE.Vector2(0.0, 0.002),
    new THREE.Vector2(0.095, 0.002),
    new THREE.Vector2(0.098, 0.215),
    new THREE.Vector2(0.106, 0.222),
    new THREE.Vector2(0.092, 0.222),
    new THREE.Vector2(0.090, 0.012),
    new THREE.Vector2(0.0, 0.012),
  ];
  const emptyAlumGeo = track(new THREE.LatheGeometry(emptyAlumPts, 40));
  const emptyAlumCup = new THREE.Mesh(emptyAlumGeo, brushedAlumMat);
  emptyAlumCup.position.set(emptyVesselX, 0, emptyVesselZ);
  emptyAlumCup.castShadow = true;
  emptyAlumCup.receiveShadow = true;
  scene.add(emptyAlumCup);
  addContactShadow(shadowTex, emptyVesselX, emptyVesselZ, 0.34, 0.34, 0.45);

  // Gunmetal steel specimen tongs resting on benchtop beside balance
  const tongsMat = track(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.28, metalness: 0.82 }),
  );
  const tongsGroup = new THREE.Group();
  tongsGroup.position.set(9.62, 0.014, 0.94);
  tongsGroup.rotation.y = 0.32;
  const tongArmGeo = track(new THREE.CylinderGeometry(0.0055, 0.0055, 0.32, 10));
  tongArmGeo.rotateZ(Math.PI / 2);
  for (const sign of [-1, 1]) {
    const arm = new THREE.Mesh(tongArmGeo, tongsMat);
    arm.position.z = sign * 0.018;
    arm.rotation.y = sign * 0.07;
    tongsGroup.add(arm);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(0.024, 0.005, 8, 20)), tongsMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-0.175, 0, sign * 0.032);
    tongsGroup.add(ring);
  }
  scene.add(tongsGroup);

  // --- 3. REGULATED DC POWER SUPPLY + SWITCH K + ANALOG VOLTMETER (U) & AMMETER (I) ---
  const psuX = 10.82;
  const psuZ = -0.52;
  const psuGroup = new THREE.Group();
  psuGroup.position.set(psuX, 0, psuZ);
  psuGroup.rotation.y = 0.14;

  const psuFrontTex = track(createPowerSupplyFrontTexture(maxAniso));
  const psuFrontMat = track(
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: psuFrontTex, roughness: 0.34 }),
  );
  const psuBoxGeo = track(new THREE.BoxGeometry(0.56, 0.38, 0.42));
  const psuBox = new THREE.Mesh(psuBoxGeo, [
    slateCaseMat,
    slateCaseMat,
    slateCaseMat,
    slateCaseMat,
    psuFrontMat,
    slateCaseMat,
  ]);
  psuBox.position.y = 0.2;
  psuBox.castShadow = true;
  psuBox.receiveShadow = true;
  psuGroup.add(psuBox);

  // 2 rotary knobs + + / - 4mm banana terminals on DC supply front face
  const knobGeo = track(new THREE.CylinderGeometry(0.024, 0.027, 0.026, 22));
  knobGeo.rotateX(Math.PI / 2);
  for (const kx of [0.08, 0.195]) {
    const kn = new THREE.Mesh(knobGeo, darkPhenolicMat);
    kn.position.set(kx, 0.245, 0.22);
    psuGroup.add(kn);
  }
  const termGeo = track(new THREE.CylinderGeometry(0.013, 0.013, 0.028, 16));
  termGeo.rotateX(Math.PI / 2);
  const psuPlusTerm = new THREE.Mesh(termGeo, redTerminalMat);
  psuPlusTerm.position.set(0.06, 0.088, 0.22);
  psuGroup.add(psuPlusTerm);
  const psuMinusTerm = new THREE.Mesh(termGeo, blackTerminalMat);
  psuMinusTerm.position.set(0.18, 0.088, 0.22);
  psuGroup.add(psuMinusTerm);

  scene.add(psuGroup);
  addContactShadow(shadowTex, psuX, psuZ, 0.78, 0.62, 0.54, 0.14);

  // Helper to build sloped-face Benchtop Analog Meter (Voltmeter U & Ammeter I)
  const buildBenchtopAnalogMeter = (
    mx: number,
    mz: number,
    rotY: number,
    unit: 'V' | 'A',
    maxScale: number,
  ): THREE.Group => {
    const mg = new THREE.Group();
    mg.position.set(mx, 0, mz);
    mg.rotation.y = rotY;

    // Wedge-sloped instrument body via ExtrudeGeometry
    const sideProfile = new THREE.Shape();
    sideProfile.moveTo(-0.15, 0);
    sideProfile.lineTo(0.15, 0);
    sideProfile.lineTo(0.15, 0.095);
    sideProfile.lineTo(-0.04, 0.295);
    sideProfile.lineTo(-0.15, 0.295);
    sideProfile.closePath();

    const wedgeGeo = track(
      new THREE.ExtrudeGeometry(sideProfile, {
        depth: 0.36,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.008,
        bevelSegments: 2,
      }),
    );
    wedgeGeo.rotateY(-Math.PI / 2);
    wedgeGeo.translate(0.18, 0.008, 0);
    const wedgeMesh = new THREE.Mesh(wedgeGeo, whiteHousingMat);
    wedgeMesh.castShadow = true;
    wedgeMesh.receiveShadow = true;
    mg.add(wedgeMesh);

    // Sloped dial face group (slope angle = atan2(0.19, 0.20) ≈ 0.76 rad from vertical -> -0.76 rad X tilt)
    const slopeTilt = -Math.atan2(0.19, 0.20);
    const faceGroup = new THREE.Group();
    faceGroup.position.set(0, 0.206, 0.068);
    faceGroup.rotation.x = slopeTilt;

    const bezelGeo = track(new THREE.BoxGeometry(0.32, 0.22, 0.012));
    faceGroup.add(new THREE.Mesh(bezelGeo, darkPhenolicMat));

    const dialTex = track(createAnalogLabMeterTexture(unit, maxScale, maxAniso));
    const dialGeo = track(new THREE.PlaneGeometry(0.296, 0.198));
    const dialMat = track(
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: dialTex, roughness: 0.28 }),
    );
    const dialMesh = new THREE.Mesh(dialGeo, dialMat);
    dialMesh.position.z = 0.008;
    faceGroup.add(dialMesh);

    // Moving-coil needle pivoted near bottom of dial
    const needlePivot = new THREE.Group();
    needlePivot.position.set(0, -0.072, 0.012);
    const ptrShape = new THREE.Shape();
    ptrShape.moveTo(-0.004, -0.012);
    ptrShape.lineTo(0.004, -0.012);
    ptrShape.lineTo(0.0014, 0.145);
    ptrShape.lineTo(-0.0014, 0.145);
    ptrShape.closePath();
    const ptrMat = track(
      new THREE.MeshStandardMaterial({
        color: unit === 'V' ? 0x1e3a8a : 0x991b1b,
        roughness: 0.3,
      }),
    );
    needlePivot.add(new THREE.Mesh(track(new THREE.ShapeGeometry(ptrShape)), ptrMat));
    const hub = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 16)),
      darkPhenolicMat,
    );
    hub.rotation.x = Math.PI / 2;
    needlePivot.add(hub);
    faceGroup.add(needlePivot);

    // Clear protective meter window
    const winGeo = track(new THREE.PlaneGeometry(0.3, 0.2));
    const winMesh = new THREE.Mesh(winGeo, clearGlassMat);
    winMesh.position.z = 0.016;
    winMesh.renderOrder = 5;
    faceGroup.add(winMesh);

    mg.add(faceGroup);

    // Front lower strip: Calibre selector rotary knob + Red/Black 4mm jacks
    const calKnob = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.018, 0.02, 0.02, 18)),
      darkPhenolicMat,
    );
    calKnob.rotation.x = Math.PI / 2;
    calKnob.position.set(0, 0.052, 0.158);
    mg.add(calKnob);

    const plusJack = new THREE.Mesh(termGeo, redTerminalMat);
    plusJack.position.set(-0.11, 0.052, 0.158);
    mg.add(plusJack);
    const minusJack = new THREE.Mesh(termGeo, blackTerminalMat);
    minusJack.position.set(0.11, 0.052, 0.158);
    mg.add(minusJack);

    scene.add(mg);
    addContactShadow(shadowTex, mx, mz, 0.5, 0.44, 0.5, rotY);
    return needlePivot;
  };

  // Voltmeter (U) & Ammeter (I) side-by-side behind the Calorimeter
  const voltmeterNeedle = buildBenchtopAnalogMeter(11.66, -0.48, 0.05, 'V', VOLTMETER_CALIBRE_V);
  const ammeterNeedle = buildBenchtopAnalogMeter(12.24, -0.48, -0.05, 'A', AMMETER_CALIBRE_A);

  // Benchtop Circuit Blade Switch K ('Interrupteur' from Figure 1)
  const swX = 11.38;
  const swZ = 0.34;
  const switchGroup = new THREE.Group();
  switchGroup.position.set(swX, 0, swZ);
  switchGroup.rotation.y = 0.18;

  const swBase = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.24, 0.032, 0.14)),
    darkPhenolicMat,
  );
  swBase.position.y = 0.016;
  swBase.castShadow = true;
  switchGroup.add(swBase);

  for (const sx of [-0.065, 0.065]) {
    const jaw = new THREE.Mesh(track(new THREE.BoxGeometry(0.022, 0.038, 0.026)), brassMat);
    jaw.position.set(sx, 0.048, 0);
    switchGroup.add(jaw);
    const post = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.011, 0.011, 0.024, 14)),
      redTerminalMat,
    );
    post.position.set(sx * 1.38, 0.042, 0);
    switchGroup.add(post);
  }

  // Pivoting brass switch blade + insulated red handle
  const switchBladePivot = new THREE.Group();
  switchBladePivot.position.set(-0.065, 0.056, 0);
  const bladeBar = new THREE.Mesh(track(new THREE.BoxGeometry(0.145, 0.008, 0.014)), brassMat);
  bladeBar.position.set(0.072, 0, 0);
  switchBladePivot.add(bladeBar);
  const bladeKnob = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.013, 0.011, 0.052, 16)),
    redTerminalMat,
  );
  bladeKnob.rotation.z = -Math.PI / 2;
  bladeKnob.position.set(0.162, 0.004, 0);
  switchBladePivot.add(bladeKnob);
  switchGroup.add(switchBladePivot);

  scene.add(switchGroup);
  addContactShadow(shadowTex, swX, swZ, 0.34, 0.24, 0.46, 0.18);

  // --- 4. ADIABATIC CALORIMETER + IMMERSION RESISTOR R + STIRRER + THERMOMETER + STOPWATCH ---
  const calX = 12.36;
  const calZ = 0.38;
  const calGroup = new THREE.Group();
  calGroup.position.set(calX, 0, calZ);

  // Outer double-walled adiabatic aluminum Dewar jacket
  const outerJacketGeo = track(new THREE.CylinderGeometry(0.245, 0.245, 0.45, 48));
  const outerJacket = new THREE.Mesh(outerJacketGeo, brushedAlumMat);
  outerJacket.position.y = 0.23;
  outerJacket.castShadow = true;
  outerJacket.receiveShadow = true;
  calGroup.add(outerJacket);

  const baseFootRing = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.254, 0.258, 0.032, 44)),
    darkPhenolicMat,
  );
  baseFootRing.position.y = 0.016;
  calGroup.add(baseFootRing);

  // Thermal insulating black collar + removable dark phenolic lid ('couvercle')
  const insulCollar = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.242, 0.016, 14, 48)),
    darkPhenolicMat,
  );
  insulCollar.rotation.x = Math.PI / 2;
  insulCollar.position.y = 0.455;
  calGroup.add(insulCollar);

  const lidDisc = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.248, 0.252, 0.036, 48)),
    slateCaseMat,
  );
  lidDisc.position.y = 0.478;
  lidDisc.castShadow = true;
  calGroup.add(lidDisc);

  // Heater R+ (red) and R- (black) 4mm binding posts on calorimeter lid
  const calPlusPost = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.015, 0.015, 0.038, 18)),
    redTerminalMat,
  );
  calPlusPost.position.set(-0.11, 0.512, -0.06);
  calGroup.add(calPlusPost);

  const calMinusPost = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.015, 0.015, 0.038, 18)),
    blackTerminalMat,
  );
  calMinusPost.position.set(0.04, 0.512, -0.09);
  calGroup.add(calMinusPost);

  // Manual vertical ring stirrer ('agitateur') passing through brass guide bushing on lid
  const stirrerBushing = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.018, 0.02, 0.028, 18)),
    brassMat,
  );
  stirrerBushing.position.set(0.115, 0.506, 0.055);
  calGroup.add(stirrerBushing);

  const stirrerRodGroup = new THREE.Group();
  stirrerRodGroup.position.set(0.115, 0.52, 0.055);
  const sRod = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.0055, 0.0055, 0.24, 14)),
    chromeMat,
  );
  sRod.position.y = 0.1;
  sRod.castShadow = true;
  stirrerRodGroup.add(sRod);
  const sHandle = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.016, 0.013, 0.042, 18)),
    darkPhenolicMat,
  );
  sHandle.position.y = 0.225;
  stirrerRodGroup.add(sHandle);
  calGroup.add(stirrerRodGroup);

  // Precision 0–110 °C (1/10 °C) Glass Thermometer inserted through central rubber stopper
  const thermStopper = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.024, 0.02, 0.034, 20)),
    darkPhenolicMat,
  );
  thermStopper.position.set(-0.02, 0.508, 0.04);
  calGroup.add(thermStopper);

  const calThermometer = buildLabThermometer(0.56);
  calThermometer.position.set(-0.02, 0.77, 0.04);
  calGroup.add(calThermometer);

  scene.add(calGroup);
  addContactShadow(shadowTex, calX, calZ, 0.68, 0.68, 0.58);

  // 4mm Laboratory Banana Leads connecting Figure 1 Joule Circuit!
  const addBananaWire = (pts: THREE.Vector3[], hex: number) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const wGeo = track(new THREE.TubeGeometry(curve, 28, 0.0075, 8, false));
    const wMat = track(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.48 }));
    const wMesh = new THREE.Mesh(wGeo, wMat);
    wMesh.castShadow = true;
    scene.add(wMesh);
  };

  // 1) Red series wire: DC Supply (+) -> Switch K (left)
  addBananaWire(
    [
      new THREE.Vector3(psuX + 0.08, 0.088, psuZ + 0.21),
      new THREE.Vector3(11.06, 0.016, -0.05),
      new THREE.Vector3(swX - 0.09, 0.048, swZ - 0.01),
    ],
    0xdc2626,
  );
  // 2) Red series wire: Switch K (right) -> Ammeter (+)
  addBananaWire(
    [
      new THREE.Vector3(swX + 0.09, 0.048, swZ + 0.01),
      new THREE.Vector3(11.86, 0.016, 0.08),
      new THREE.Vector3(12.13, 0.052, -0.32),
    ],
    0xdc2626,
  );
  // 3) Red series wire: Ammeter (-) -> Calorimeter Heater (R+)
  addBananaWire(
    [
      new THREE.Vector3(12.35, 0.052, -0.32),
      new THREE.Vector3(12.32, 0.22, -0.02),
      new THREE.Vector3(calX - 0.11, 0.525, calZ - 0.06),
    ],
    0xdc2626,
  );
  // 4) Black return wire: Calorimeter Heater (R-) -> DC Supply (-)
  addBananaWire(
    [
      new THREE.Vector3(calX + 0.04, 0.525, calZ - 0.09),
      new THREE.Vector3(12.02, 0.14, -0.14),
      new THREE.Vector3(11.35, 0.016, -0.18),
      new THREE.Vector3(psuX + 0.2, 0.088, psuZ + 0.19),
    ],
    0x1e293b,
  );
  // 5) Parallel Voltmeter (U) sense leads across Calorimeter R+ and R-
  addBananaWire(
    [
      new THREE.Vector3(11.55, 0.052, -0.32),
      new THREE.Vector3(11.82, 0.24, 0.02),
      new THREE.Vector3(calX - 0.11, 0.522, calZ - 0.06),
    ],
    0x2563eb,
  );
  addBananaWire(
    [
      new THREE.Vector3(11.77, 0.052, -0.32),
      new THREE.Vector3(12.05, 0.24, -0.02),
      new THREE.Vector3(calX + 0.04, 0.522, calZ - 0.09),
    ],
    0x0f172a,
  );

  // Digital Laboratory Stopwatch ('Chronomètre') angled toward viewer
  const swTimerX = 13.08;
  const swTimerZ = 0.68;
  const chronoGroup = new THREE.Group();
  chronoGroup.position.set(swTimerX, 0, swTimerZ);
  chronoGroup.rotation.y = -0.24;

  const chronoBodyGeo = track(new THREE.BoxGeometry(0.28, 0.16, 0.14));
  const chronoBody = new THREE.Mesh(chronoBodyGeo, slateCaseMat);
  chronoBody.position.y = 0.085;
  chronoBody.rotation.x = -0.32;
  chronoBody.castShadow = true;
  chronoGroup.add(chronoBody);

  const stopwatchLcd = createStopwatchLcdUpdater(maxAniso);
  track(stopwatchLcd);
  const swLcdMesh = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.23, 0.098)),
    track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: stopwatchLcd.texture,
        emissive: new THREE.Color(0xbfdbfe),
        emissiveMap: stopwatchLcd.texture,
        emissiveIntensity: 0.2,
        roughness: 0.26,
      }),
    ),
  );
  swLcdMesh.position.set(0, 0.092, 0.072);
  swLcdMesh.rotation.x = -0.32;
  chronoGroup.add(swLcdMesh);

  // Start/Stop (green) & Reset (amber) top pushbuttons on stopwatch
  for (const [bx, col] of [
    [-0.065, 0x16a34a],
    [0.065, 0xeab308],
  ] as const) {
    const pb = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.018, 0.018, 0.026, 16)),
      track(new THREE.MeshStandardMaterial({ color: col, roughness: 0.3 })),
    );
    pb.position.set(bx, 0.172, 0.02);
    pb.rotation.x = -0.32;
    chronoGroup.add(pb);
  }
  scene.add(chronoGroup);
  addContactShadow(shadowTex, swTimerX, swTimerZ, 0.38, 0.28, 0.48, -0.24);

  // --- 5. EMPTY CUPS, WATER-FILLED CUPS, CLEAR WATER BOTTLE & WASH BOTTLE + TP2 NOTEBOOK ---
  const buildGraduatedGlassCup = (
    cx: number,
    cz: number,
    baseY: number,
    radius: number,
    height: number,
    capacityMl: 250 | 400,
    subtitle: string,
    fillFraction: number, // 0 = empty cup, >0 = water-filled cup
    isWarmWater = false,
  ): { waterMesh?: THREE.Mesh; meniscusMesh?: THREE.Mesh } => {
    const cg = new THREE.Group();
    cg.position.set(cx, baseY, cz);

    // Thick clear glass base disc so empty cups have unmistakable grounding
    const baseDisc = new THREE.Mesh(
      track(new THREE.CylinderGeometry(radius * 0.98, radius * 0.98, 0.014, 36)),
      glassRimMat,
    );
    baseDisc.position.y = 0.007;
    cg.add(baseDisc);

    // Transparent borosilicate cylindrical glass wall
    const wallGeo = track(new THREE.CylinderGeometry(radius, radius * 0.97, height, 40, 1, true));
    const wallMesh = new THREE.Mesh(wallGeo, clearGlassMat);
    wallMesh.position.y = height * 0.5 + 0.008;
    wallMesh.renderOrder = 4;
    cg.add(wallMesh);

    // Silk-screened white mL graduations on outer wall
    const gradTex = track(createGraduatedCupTexture(capacityMl, subtitle, maxAniso));
    const gradMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: gradTex,
        transparent: true,
        roughness: 0.2,
        depthWrite: false,
      }),
    );
    const gradGeo = track(
      new THREE.CylinderGeometry(radius + 0.0015, radius * 0.97 + 0.0015, height * 0.88, 36, 1, true),
    );
    const gradMesh = new THREE.Mesh(gradGeo, gradMat);
    gradMesh.position.y = height * 0.5 + 0.008;
    gradMesh.rotation.y = Math.PI; // Orient u = 0.5 (canvas center) forward toward +Z viewer
    gradMesh.renderOrder = 5;
    cg.add(gradMesh);

    // Rolled glass top rim lip
    const rimTorus = new THREE.Mesh(
      track(new THREE.TorusGeometry(radius, 0.0065, 12, 40)),
      glassRimMat,
    );
    rimTorus.rotation.x = Math.PI / 2;
    rimTorus.position.y = height + 0.008;
    cg.add(rimTorus);

    let waterMesh: THREE.Mesh | undefined;
    let meniscusMesh: THREE.Mesh | undefined;

    if (fillFraction > 0.02) {
      const wH = height * fillFraction;
      const wGeo = track(new THREE.CylinderGeometry(radius * 0.94, radius * 0.92, wH, 36));
      wGeo.translate(0, wH * 0.5, 0); // Pivot at bottom so scaling Y adjusts liquid level smoothly!
      waterMesh = new THREE.Mesh(wGeo, isWarmWater ? warmWaterMat : clearWaterMat);
      waterMesh.position.y = 0.015;
      waterMesh.renderOrder = 2;
      cg.add(waterMesh);

      meniscusMesh = new THREE.Mesh(
        track(new THREE.TorusGeometry(radius * 0.93, 0.0045, 10, 36)),
        meniscusMat,
      );
      meniscusMesh.rotation.x = Math.PI / 2;
      meniscusMesh.position.y = 0.015 + wH;
      meniscusMesh.renderOrder = 3;
      cg.add(meniscusMesh);
    }

    scene.add(cg);
    if (baseY === 0) {
      addContactShadow(shadowTex, cx, cz, radius * 3.1, radius * 3.1, 0.42);
    }
    return { waterMesh, meniscusMesh };
  };

  // A) Two Empty Graduated Cups/Beakers (clearly empty & ready for weighing/transfer)
  buildGraduatedGlassCup(13.68, 0.28, 0, 0.088, 0.21, 250, 'VIDE 1', 0.0);
  buildGraduatedGlassCup(14.08, 0.52, 0, 0.105, 0.25, 400, 'VIDE 2', 0.0);

  // B) Water-Filled Cups (1 filled from water bottle, 1 cold m_0 = 200 g, 1 pre-heated m_1 = 120 g on warming coaster)
  buildGraduatedGlassCup(14.52, 0.48, 0, 0.09, 0.21, 250, 'H₂O', 0.66, false);
  buildGraduatedGlassCup(14.66, 0.02, 0, 0.106, 0.25, 400, 'm₀ 20°C', 0.74, false);

  // Compact laboratory warming coaster under pre-heated water cup m_1 (theta_1 = 70 °C)
  const coasterX = 15.08;
  const coasterZ = -0.28;
  const coasterGroup = new THREE.Group();
  coasterGroup.position.set(coasterX, 0, coasterZ);
  const coasterBase = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.155, 0.165, 0.042, 36)),
    whiteHousingMat,
  );
  coasterBase.position.y = 0.021;
  coasterBase.castShadow = true;
  coasterGroup.add(coasterBase);
  const coasterPlate = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.125, 0.128, 0.012, 36)),
    track(
      new THREE.MeshStandardMaterial({
        color: 0x272a33,
        emissive: new THREE.Color(0xd9260f),
        emissiveIntensity: 0.25,
        roughness: 0.55,
      }),
    ),
  );
  coasterPlate.position.y = 0.046;
  coasterGroup.add(coasterPlate);
  scene.add(coasterGroup);
  addContactShadow(shadowTex, coasterX, coasterZ, 0.44, 0.44, 0.48);

  const warmCup = buildGraduatedGlassCup(
    coasterX,
    coasterZ,
    0.052,
    0.104,
    0.245,
    400,
    'm₁ 70°C',
    0.68,
    true,
  );
  // Angled thermometer resting inside pre-heated water cup m_1 to monitor theta_1 = 70 °C
  const warmCupTherm = buildLabThermometer(0.38);
  warmCupTherm.position.set(coasterX + 0.025, 0.24, coasterZ);
  warmCupTherm.rotation.z = -0.19;
  scene.add(warmCupTherm);

  // C) Tall Clear 1.5 L Water Bottle ('Bouteille d'eau') standing beside the empty & filled cups!
  const botX = 14.22;
  const botZ = -0.44;
  const bottleGroup = new THREE.Group();
  bottleGroup.position.set(botX, 0, botZ);

  // Wound bottom-to-top so LatheGeometry outer normals point outward (+Z/+X)
  const bottlePts = [
    new THREE.Vector2(0.0, 0.004),
    new THREE.Vector2(0.104, 0.004),
    new THREE.Vector2(0.108, 0.04),
    new THREE.Vector2(0.106, 0.19),
    new THREE.Vector2(0.096, 0.23), // Ergonomic grip waist indentation
    new THREE.Vector2(0.106, 0.27),
    new THREE.Vector2(0.105, 0.39),
    new THREE.Vector2(0.072, 0.47),
    new THREE.Vector2(0.035, 0.525),
    new THREE.Vector2(0.035, 0.565),
  ];
  const bottleShellGeo = track(new THREE.LatheGeometry(bottlePts, 44));
  const bottleShell = new THREE.Mesh(bottleShellGeo, clearGlassMat);
  bottleShell.renderOrder = 4;
  bottleGroup.add(bottleShell);

  // Clear blue water inside the 1.5 L water bottle (~76% full up to shoulder y = 0.39)
  const bottleWaterPts = [
    new THREE.Vector2(0.0, 0.012),
    new THREE.Vector2(0.098, 0.012),
    new THREE.Vector2(0.099, 0.19),
    new THREE.Vector2(0.090, 0.23),
    new THREE.Vector2(0.099, 0.27),
    new THREE.Vector2(0.098, 0.385),
    new THREE.Vector2(0.0, 0.385),
  ];
  const bottleWaterGeo = track(new THREE.LatheGeometry(bottleWaterPts, 40));
  const bottleWater = new THREE.Mesh(bottleWaterGeo, clearWaterMat);
  bottleWater.renderOrder = 2;
  bottleGroup.add(bottleWater);

  const bottleMeniscus = new THREE.Mesh(
    track(new THREE.TorusGeometry(0.096, 0.0045, 10, 36)),
    meniscusMat,
  );
  bottleMeniscus.rotation.x = Math.PI / 2;
  bottleMeniscus.position.y = 0.385;
  bottleMeniscus.renderOrder = 3;
  bottleGroup.add(bottleMeniscus);

  // Wrap-around 'EAU PURE · H₂O · 1.5 L' label band
  const bottleLblTex = track(createWaterBottleLabelTexture(maxAniso));
  const bottleLblGeo = track(new THREE.CylinderGeometry(0.1075, 0.1075, 0.105, 44, 1, true));
  const bottleLblMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: bottleLblTex,
      roughness: 0.28,
      side: THREE.DoubleSide,
    }),
  );
  const bottleLbl = new THREE.Mesh(bottleLblGeo, bottleLblMat);
  bottleLbl.position.y = 0.325;
  bottleLbl.rotation.y = Math.PI - 0.18; // Orient 'EAU PURE · H₂O' forward toward +Z viewer
  bottleGroup.add(bottleLbl);

  // Ribbed Royal-Blue Screw Cap on top of the water bottle
  const bottleCap = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.039, 0.039, 0.038, 28)),
    blueCapMat,
  );
  bottleCap.position.y = 0.575;
  bottleCap.castShadow = true;
  bottleGroup.add(bottleCap);

  scene.add(bottleGroup);
  addContactShadow(shadowTex, botX, botZ, 0.34, 0.34, 0.48);

  // D) Laboratory Squeeze Wash Bottle ('Pisette d'eau distillée') beside the water bottle
  const washX = 13.72;
  const washZ = -0.34;
  const washGroup = new THREE.Group();
  washGroup.position.set(washX, 0, washZ);

  const ldpeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      transparent: true,
      opacity: 0.82,
      roughness: 0.36,
    }),
  );
  const washBody = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.068, 0.068, 0.24, 32)),
    ldpeMat,
  );
  washBody.position.y = 0.12;
  washBody.castShadow = true;
  washGroup.add(washBody);

  const washCap = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.028, 0.034, 0.036, 24)),
    blueCapMat,
  );
  washCap.position.y = 0.256;
  washGroup.add(washCap);

  const spoutCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.27, 0),
    new THREE.Vector3(0.01, 0.34, 0.02),
    new THREE.Vector3(0.055, 0.365, 0.055),
    new THREE.Vector3(0.095, 0.335, 0.085),
  ]);
  const spoutTube = new THREE.Mesh(
    track(new THREE.TubeGeometry(spoutCurve, 18, 0.0055, 8, false)),
    blueCapMat,
  );
  washGroup.add(spoutTube);
  scene.add(washGroup);
  addContactShadow(shadowTex, washX, washZ, 0.24, 0.24, 0.44);

  // E) Open Two-Page TP2 Calorimétrie Laboratory Notebook + Blue Pen on Front-Right of Table 3
  const nbX = 14.34;
  const nbZ = 0.96;
  const nbGroup = new THREE.Group();
  nbGroup.position.set(nbX, 0, nbZ);
  nbGroup.rotation.y = -0.14;

  const coverMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.68, 0.014, 0.46)),
    track(new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 })),
  );
  coverMesh.position.y = 0.007;
  coverMesh.castShadow = true;
  coverMesh.receiveShadow = true;
  nbGroup.add(coverMesh);

  const nbSpreadTex = track(createTp2NotebookSpreadTexture(maxAniso));
  const pagesMesh = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.65, 0.012, 0.435)),
    [
      whiteHousingMat,
      whiteHousingMat,
      track(new THREE.MeshStandardMaterial({ color: 0xffffff, map: nbSpreadTex, roughness: 0.65 })),
      whiteHousingMat,
      whiteHousingMat,
      whiteHousingMat,
    ],
  );
  pagesMesh.position.y = 0.018;
  pagesMesh.receiveShadow = true;
  nbGroup.add(pagesMesh);

  // Lab pen resting diagonally beside notebook
  const penMesh = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.006, 0.005, 0.22, 12)),
    blueCapMat,
  );
  penMesh.rotation.x = Math.PI / 2;
  penMesh.rotation.z = 0.28;
  penMesh.position.set(0.41, 0.008, 0.04);
  nbGroup.add(penMesh);

  scene.add(nbGroup);

  // --- 6. WORLD-SPACE 3D FLOATING LABEL ANCHORS FOR TABLE 3 ---
  const anchors = {
    Calorimeter: new THREE.Vector3(calX, 1.16, calZ),
    Balance: new THREE.Vector3(balX - 0.12, 0.48, balZ + 0.08),
    Meters: new THREE.Vector3(11.95, 0.58, -0.48),
    CupsBottle: new THREE.Vector3(14.32, 0.74, -0.12),
  };

  // --- 7. PER-FRAME KINEMATIC & INSTRUMENTATION UPDATE ---
  const copperInsideCalPos = new THREE.Vector3(calX + 0.04, 0.16, calZ + 0.02);

  const update = (st: CalorimetryState, elapsedSec: number, dt: number) => {
    // 1. Electronic Balance LCD & Stopwatch LCD
    balanceLcd.update(st.balanceMassG);
    stopwatchLcd.update(st.chronoSec, st.chronoRunning);

    // 2. Analog Voltmeter (U) & Ammeter (I) moving-coil pointer needles
    const flutter = st.switchClosed && st.mode === 'electrical' ? Math.sin(elapsedSec * 5.2) * 0.03 : 0;
    const targetVAng = labMeterValueToAngleRad(
      st.measuredVoltageV + flutter,
      VOLTMETER_CALIBRE_V,
    );
    const targetAAng = labMeterValueToAngleRad(
      st.measuredCurrentA + flutter * 0.3,
      AMMETER_CALIBRE_A,
    );
    voltmeterNeedle.rotation.z = THREE.MathUtils.damp(voltmeterNeedle.rotation.z, targetVAng, 9, dt);
    ammeterNeedle.rotation.z = THREE.MathUtils.damp(ammeterNeedle.rotation.z, targetAAng, 9, dt);

    // 3. Circuit Blade Switch K lever (closed = horizontal 0.02 rad, open = raised +0.58 rad)
    const isCircuitClosed = st.mode === 'electrical' && st.switchClosed;
    const targetBladeAngle = isCircuitClosed ? 0.02 : 0.58;
    switchBladePivot.rotation.z = THREE.MathUtils.damp(
      switchBladePivot.rotation.z,
      targetBladeAngle,
      11,
      dt,
    );

    // 4. Adiabatic Calorimeter Manual Ring Stirrer ('agitateur') gentle vertical oscillation
    const targetStirY = st.stirrerActive
      ? 0.52 + (Math.sin(elapsedSec * 4.2) * 0.5 + 0.5) * 0.065
      : 0.52;
    stirrerRodGroup.position.y = THREE.MathUtils.damp(
      stirrerRodGroup.position.y,
      targetStirY,
      10,
      dt,
    );

    // 5. Method of Mixtures visual choreography: Copper sample moves into Calorimeter & warm cup m_1 pours!
    const inMixture = st.mode === 'mixture' && st.mixtureStarted;
    const targetCuPos = inMixture ? copperInsideCalPos : copperRestPos;
    copperSampleGroup.position.lerp(targetCuPos, 1 - Math.exp(-7 * dt));
    copperSampleGroup.visible = !inMixture || copperSampleGroup.position.distanceTo(copperInsideCalPos) > 0.12;

    if (warmCup.waterMesh && warmCup.meniscusMesh) {
      const targetScaleY = inMixture ? 0.22 : 1.0;
      warmCup.waterMesh.scale.y = THREE.MathUtils.damp(warmCup.waterMesh.scale.y, targetScaleY, 6, dt);
      warmCup.meniscusMesh.position.y = 0.015 + 0.245 * 0.68 * warmCup.waterMesh.scale.y;
    }
  };

  return { anchors, update };
}
