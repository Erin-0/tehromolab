/**
 * High-fidelity 3D engineered TARS robot from Interstellar.
 * Features:
 * - 4 articulated monolithic brushed-silver titanium columns scaled to match natural player height
 *   (feet rest at floor y = -2.29m, top reaches y = +1.80m, standing head-to-head with the player at eye height 1.62m)
 * - Three iconic locomotion kinematics:
 *   1. Type 1: 2-2 Rotary Walk (dual-pair crutch stride with rotating upper axis)
 *   2. Type 2: 1-2-1 Crawl (outer legs alternate, center pair locked as support chassis)
 *   3. Type 3: Pinwheel Star-Spin (high-speed tumbling cartwheel rolling sprint from Miller's planet)
 * - Intelligent perimeter concourse circuit navigation (never points toward or hits laboratory tables)
 * - Completely removed top and bottom braces (pure monolithic slabs)
 * - Animated retro green CRT terminal with live kinematics telemetry
 */

import * as THREE from 'three';
import {
  TARSStateData,
  TARSLocomotionMode,
  createInitialTARSState,
  stepTARSAI,
  mechSin,
  cycleTARSLocomotionMode,
  setTARSLocomotionMode,
  activateOrCycleTARS,
} from '../simulation/tarsNavigation';

export interface TARSBarRig {
  group: THREE.Group;
  pivot: THREE.Group;
  slider: THREE.Group;
  baseX: number;
  upperMesh: THREE.Mesh;
  lowerMesh: THREE.Mesh;
  pistonTube: THREE.Mesh;
}

export interface TARSRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  bars: TARSBarRig[];
  clickProxyMesh: THREE.Mesh;
  displayTex: THREE.CanvasTexture;
  displayCanvas: HTMLCanvasElement;
  displayCtx: CanvasRenderingContext2D;
  displayMat: THREE.MeshStandardMaterial;
  indicatorMat: THREE.MeshStandardMaterial;
  stateData: TARSStateData;
  update: (dtSeconds: number, elapsedTime: number) => void;
  cycleMode: () => TARSLocomotionMode;
  setMode: (mode: TARSLocomotionMode) => void;
  dispose: () => void;
}

export function buildTARS(
  scene: THREE.Scene,
  track: <T extends { dispose: () => void }>(res: T) => T,
  maxAnisotropy = 4,
): TARSRig {
  const root = new THREE.Group();
  root.position.set(3.5, -2.29, 14.5); // Floor at -2.29m

  // Advanced PBR Materials: Brilliant Brushed Silver Metallic Alloy
  const mainMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xc8ced6, // Brilliant brushed silver stainless steel
      metalness: 0.94,
      roughness: 0.22,
    }),
  );

  const darkMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x47505e, // Precision laser-cut joint lines & recessed seams
      metalness: 0.86,
      roughness: 0.38,
    }),
  );

  const pivotMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xa4acb8, // Machined silver steel rotary bearings
      metalness: 0.96,
      roughness: 0.16,
    }),
  );

  const chromeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf4f7fa, // Polished high-specular chrome telescoping pistons
      metalness: 0.98,
      roughness: 0.06,
    }),
  );

  const accentMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xb8c0cc, // Precision machined silver edge bevels
      metalness: 0.92,
      roughness: 0.26,
    }),
  );

  // Animated green CRT terminal screen on Bar 1
  const displayCanvas = document.createElement('canvas');
  displayCanvas.width = 256;
  displayCanvas.height = 160;
  const displayCtx = displayCanvas.getContext('2d')!;
  const displayTex = track(new THREE.CanvasTexture(displayCanvas));
  displayTex.colorSpace = THREE.SRGBColorSpace;
  displayTex.anisotropy = maxAnisotropy;

  const displayMat = track(
    new THREE.MeshStandardMaterial({
      map: displayTex,
      emissive: new THREE.Color(0x34d399),
      emissiveMap: displayTex,
      emissiveIntensity: 0.82,
      roughness: 0.2,
      metalness: 0.3,
    }),
  );

  const indicatorMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1a0a00,
      emissive: new THREE.Color(0xf97316),
      emissiveIntensity: 0.65,
      roughness: 0.3,
      metalness: 0.4,
    }),
  );

  // Dimensions: Scaled to full natural human standing stature in the laboratory
  // Feet rest on floor at y = -2.29m, top reaches y = +1.80m (total height = 4.09m)
  // Perfectly matches player camera eye level at y = 1.62m
  const BW = 0.44; // Column width (m)
  const BD = 0.88; // Column depth (m)
  const UH = 2.02; // Upper segment height (m)
  const LH = 2.02; // Lower segment height (m)
  const PIVOT_Y = 2.05; // Central articulation axis height above floor
  const barX = [-0.70, -0.23, 0.23, 0.70]; // Total 4-column span = 1.84m

  const bodyGroup = new THREE.Group();
  const bars: TARSBarRig[] = [];

  for (let i = 0; i < 4; i++) {
    const barGroup = new THREE.Group();
    barGroup.position.x = barX[i];

    const pivot = new THREE.Group();
    pivot.position.y = PIVOT_Y;

    // Upper segment (monolithic silver column)
    const uGeo = track(new THREE.BoxGeometry(BW, UH, BD));
    const uMesh = new THREE.Mesh(uGeo, mainMat);
    uMesh.position.y = UH * 0.5 + 0.03;
    uMesh.castShadow = true;
    uMesh.receiveShadow = true;
    pivot.add(uMesh);

    // Lower segment (monolithic silver column)
    const lGeo = track(new THREE.BoxGeometry(BW, LH, BD));
    const lMesh = new THREE.Mesh(lGeo, mainMat);
    lMesh.position.y = -(LH * 0.5 + 0.03);
    lMesh.castShadow = true;
    lMesh.receiveShadow = true;
    pivot.add(lMesh);

    // Upper protective cap
    const ucGeo = track(new THREE.BoxGeometry(BW + 0.016, 0.05, BD + 0.016));
    const ucMesh = new THREE.Mesh(ucGeo, accentMat);
    ucMesh.position.y = UH + 0.03;
    pivot.add(ucMesh);

    // Lower foot on a pneumatic/electric prismatic slider (telescopic shank)
    const slider = new THREE.Group();
    slider.position.y = -(LH + 0.03);

    // Heavy foot plate with beveled grip
    const lfGeo = track(new THREE.BoxGeometry(BW + 0.02, 0.05, BD + 0.02));
    const lfMesh = new THREE.Mesh(lfGeo, accentMat);
    lfMesh.castShadow = true;
    slider.add(lfMesh);

    // Telescoping inner chrome piston rod (emerges when slider extends)
    const tubeGeo = track(new THREE.BoxGeometry(BW * 0.58, 0.28, BD * 0.58));
    const tubeMesh = new THREE.Mesh(tubeGeo, chromeMat);
    tubeMesh.position.y = 0.14;
    slider.add(tubeMesh);
    pivot.add(slider);

    // Laser-cut panel grooves (upper)
    for (let j = 0; j < 4; j++) {
      const gGeo = track(new THREE.BoxGeometry(BW + 0.008, 0.014, BD + 0.008));
      const gMesh = new THREE.Mesh(gGeo, darkMat);
      gMesh.position.y = 0.30 + j * 0.44;
      pivot.add(gMesh);
    }
    // Laser-cut panel grooves (lower)
    for (let j = 0; j < 4; j++) {
      const gGeo = track(new THREE.BoxGeometry(BW + 0.008, 0.014, BD + 0.008));
      const gMesh = new THREE.Mesh(gGeo, darkMat);
      gMesh.position.y = -(0.30 + j * 0.44);
      pivot.add(gMesh);
    }

    // Front face detail bevel strips
    const stripGeo = track(new THREE.BoxGeometry(0.012, UH * 0.72, 0.012));
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(stripGeo, darkMat);
      strip.position.set(side * (BW * 0.5 - 0.032), UH * 0.5 + 0.03, BD * 0.5 + 0.008);
      pivot.add(strip);
      const strip2 = new THREE.Mesh(stripGeo, darkMat);
      strip2.position.set(side * (BW * 0.5 - 0.032), -(LH * 0.5 + 0.03), BD * 0.5 + 0.008);
      pivot.add(strip2);
    }

    // Middle heavy articulation pivot housing
    const phGeo = track(new THREE.CylinderGeometry(0.075, 0.075, BD + 0.16, 16));
    phGeo.rotateX(Math.PI / 2);
    const phMesh = new THREE.Mesh(phGeo, pivotMat);
    phMesh.castShadow = true;
    pivot.add(phMesh);

    // End-cap hex bolts on pivot
    const boltGeo = track(new THREE.CylinderGeometry(0.028, 0.028, 0.024, 8));
    boltGeo.rotateX(Math.PI / 2);
    for (const bz of [-(BD * 0.5 + 0.084), BD * 0.5 + 0.084]) {
      const bolt = new THREE.Mesh(boltGeo, darkMat);
      bolt.position.set(0, 0, bz);
      pivot.add(bolt);
    }

    // Upper and lower joint indicators
    const upGeo = track(new THREE.CylinderGeometry(0.045, 0.045, BD + 0.08, 12));
    upGeo.rotateX(Math.PI / 2);
    const upMesh = new THREE.Mesh(upGeo, pivotMat);
    upMesh.position.y = UH * 0.82;
    pivot.add(upMesh);

    const lpGeo = track(new THREE.CylinderGeometry(0.045, 0.045, BD + 0.08, 12));
    lpGeo.rotateX(Math.PI / 2);
    const lpMesh = new THREE.Mesh(lpGeo, pivotMat);
    lpMesh.position.y = -LH * 0.82;
    pivot.add(lpMesh);

    // Display Screen mounted on Bar 1 (Inner Left) - right at comfortable eye viewing level
    if (i === 1) {
      const scrW = 0.28;
      const scrH = 0.18;
      const scrGeo = track(new THREE.BoxGeometry(scrW, scrH, 0.016));
      const scrMesh = new THREE.Mesh(scrGeo, displayMat);
      scrMesh.position.set(0, 0.88, BD * 0.5 + 0.01);
      pivot.add(scrMesh);

      const brdGeo = track(new THREE.BoxGeometry(scrW + 0.036, scrH + 0.036, 0.008));
      const brdMesh = new THREE.Mesh(brdGeo, darkMat);
      brdMesh.position.set(0, 0.88, BD * 0.5 + 0.005);
      pivot.add(brdMesh);
    }

    // Warning / Beacon light mounted on Bar 2 (Inner Right)
    if (i === 2) {
      const indGeo = track(new THREE.BoxGeometry(0.045, 0.045, 0.016));
      const indMesh = new THREE.Mesh(indGeo, indicatorMat);
      indMesh.position.set(0.10, 1.25, BD * 0.5 + 0.01);
      pivot.add(indMesh);
    }

    barGroup.add(pivot);
    bodyGroup.add(barGroup);
    bars.push({
      group: barGroup,
      pivot,
      slider,
      baseX: barX[i],
      upperMesh: uMesh,
      lowerMesh: lMesh,
      pistonTube: tubeMesh,
    });
  }

  // Full-body invisible raycast click proxy (makes clicking anywhere on TARS effortless)
  const proxyGeo = track(new THREE.BoxGeometry(2.1, 4.3, 1.3));
  const proxyMat = track(
    new THREE.MeshBasicMaterial({
      visible: false,
    }),
  );
  const clickProxyMesh = new THREE.Mesh(proxyGeo, proxyMat);
  clickProxyMesh.position.y = PIVOT_Y;
  bodyGroup.add(clickProxyMesh);

  root.add(bodyGroup);
  scene.add(root);

  const stateData = createInitialTARSState();

  // Draw initial CRT screen text
  renderTARSDisplay(displayCtx, stateData);
  displayTex.needsUpdate = true;

  let lastScreenUpdate = 0;

  const cycleMode = (): TARSLocomotionMode => {
    const res = activateOrCycleTARS(stateData);
    renderTARSDisplay(displayCtx, stateData);
    displayTex.needsUpdate = true;
    return res.mode;
  };

  const setMode = (mode: TARSLocomotionMode): void => {
    setTARSLocomotionMode(stateData, mode);
    renderTARSDisplay(displayCtx, stateData);
    displayTex.needsUpdate = true;
  };

  const update = (dtSeconds: number, elapsedTime: number) => {
    // 1. Advance AI State & Navigation (smooth curved steering around concourse perimeter)
    const nextState = stepTARSAI(stateData, dtSeconds);
    Object.assign(stateData, nextState);

    // 2. Position & Yaw
    root.position.x = stateData.x;
    root.position.z = stateData.z;
    root.rotation.y = stateData.rotation;

    // 3. Screen & LED Animation
    const pulse = 0.55 + 0.25 * Math.sin(elapsedTime * 3.0);
    indicatorMat.emissiveIntensity = stateData.state === 'WALKING' ? pulse : 0.3;

    if (elapsedTime - lastScreenUpdate > 0.25) {
      lastScreenUpdate = elapsedTime;
      renderTARSDisplay(displayCtx, stateData);
      displayTex.needsUpdate = true;
    }

    // 4. Locomotion Kinematics Execution based on Active Gait Mode
    const gaitMode = stateData.gait;

    if (stateData.state === 'WALKING') {
      if (gaitMode === 'SPIN_WHEEL') {
        // =========================================================================
        // MODE 3: SPIN (High-speed 4-spoke cartwheel tumbling star-sprint from video)
        // =========================================================================
        const roll = stateData.spinAngle;

        // 4 legs deployed at distinct 90-degree spoke angles around transverse axis
        bars[0].pivot.rotation.x = roll;
        bars[1].pivot.rotation.x = roll + Math.PI * 0.5;
        bars[2].pivot.rotation.x = roll + Math.PI;
        bars[3].pivot.rotation.x = roll + Math.PI * 1.5;

        // Reset yaw splays for coaxial rolling star wheel
        bars[0].group.rotation.y = -0.03;
        bars[3].group.rotation.y = 0.03;
        bars[1].group.rotation.y = 0;
        bars[2].group.rotation.y = 0;

        for (let i = 0; i < 4; i++) {
          bars[i].pivot.position.y = PIVOT_Y;
          bars[i].slider.position.y = -(LH + 0.03);
        }

        // Rolling wheel ground contact wave
        const spokeWave = (roll * 4) % (Math.PI * 2);
        const bob = (Math.cos(spokeWave * 0.5) - 0.707) * 0.24;
        bodyGroup.rotation.x = 0;
        bodyGroup.rotation.z = 0;
        bodyGroup.position.y = bob;
      } else if (gaitMode === 'CRAWL_1_2_1') {
        // =========================================================================
        // MODE 2: 1-2-1 CRAWL (Left & Right legs move alternately, center pair locked)
        // =========================================================================
        const pLeft = stateData.walkPhase;
        const pRight = (stateData.walkPhase + 0.5) % 1;
        const swingL = 0.54 * mechSin(pLeft);
        const swingR = 0.54 * mechSin(pRight);
        const centerStroke = -0.25 * Math.sin(2 * Math.PI * stateData.walkPhase);

        // Bar 0: Left leg (1)
        bars[0].pivot.rotation.x = swingL;
        bars[0].group.rotation.y = -0.12 * Math.abs(mechSin(pLeft)); // Splay outwards for wide crawl
        bars[0].pivot.position.y = PIVOT_Y + Math.max(0, mechSin(pLeft)) * 0.09;
        bars[0].slider.position.y = -(LH + 0.03 + 0.05 * Math.max(0, -mechSin(pLeft)));

        // Bar 3: Right leg (1)
        bars[3].pivot.rotation.x = swingR;
        bars[3].group.rotation.y = 0.12 * Math.abs(mechSin(pRight));
        bars[3].pivot.position.y = PIVOT_Y + Math.max(0, mechSin(pRight)) * 0.09;
        bars[3].slider.position.y = -(LH + 0.03 + 0.05 * Math.max(0, -mechSin(pRight)));

        // Bars 1 & 2: Center pair (2) locked together as central pushing support
        bars[1].pivot.rotation.x = centerStroke;
        bars[2].pivot.rotation.x = centerStroke;
        bars[1].group.rotation.y = 0;
        bars[2].group.rotation.y = 0;
        bars[1].pivot.position.y = PIVOT_Y + Math.max(0, -centerStroke) * 0.05;
        bars[2].pivot.position.y = PIVOT_Y + Math.max(0, -centerStroke) * 0.05;
        bars[1].slider.position.y = -(LH + 0.03 + 0.05 * Math.max(0, centerStroke));
        bars[2].slider.position.y = -(LH + 0.03 + 0.05 * Math.max(0, centerStroke));

        // Low crawl posture
        bodyGroup.rotation.x = 0.14 + 0.02 * Math.sin(2 * Math.PI * stateData.walkPhase);
        bodyGroup.rotation.z = 0.03 * mechSin(pLeft);
        bodyGroup.position.y = -0.08 + 0.04 * Math.abs(Math.sin(2 * Math.PI * stateData.walkPhase));
      } else {
        // =========================================================================
        // MODE 1: 2-2 ROTARY WALK (Paired legs with rotating axis integrated into upper body)
        // =========================================================================
        // Outer pair: Bar 0 & Bar 3
        // Inner pair: Bar 1 & Bar 2 (integrated into upper torso core)
        const swing = 0.58 * mechSin(stateData.walkPhase);

        bars[0].pivot.rotation.x = swing;
        bars[3].pivot.rotation.x = swing;
        bars[1].pivot.rotation.x = -swing * 0.85;
        bars[2].pivot.rotation.x = -swing * 0.85;

        // Ground clearance
        const outerLift = Math.max(0, mechSin(stateData.walkPhase)) * 0.08;
        const innerLift = Math.max(0, -mechSin(stateData.walkPhase)) * 0.08;
        bars[0].pivot.position.y = PIVOT_Y + outerLift;
        bars[3].pivot.position.y = PIVOT_Y + outerLift;
        bars[1].pivot.position.y = PIVOT_Y + innerLift;
        bars[2].pivot.position.y = PIVOT_Y + innerLift;

        // Foot piston extension on stance
        const outerStance = Math.max(0, -Math.sin(2 * Math.PI * stateData.walkPhase));
        const innerStance = Math.max(0, Math.sin(2 * Math.PI * stateData.walkPhase));
        bars[0].slider.position.y = -(LH + 0.03 + 0.05 * outerStance);
        bars[3].slider.position.y = -(LH + 0.03 + 0.05 * outerStance);
        bars[1].slider.position.y = -(LH + 0.03 + 0.05 * innerStance);
        bars[2].slider.position.y = -(LH + 0.03 + 0.05 * innerStance);

        // Dynamic forward lean and roll bob
        bodyGroup.rotation.x = 0.06 + 0.016 * Math.sin(stateData.walkPhase * Math.PI * 2);
        bodyGroup.rotation.z = 0.026 * mechSin(stateData.walkPhase);
        bodyGroup.position.y = 0.036 * Math.abs(mechSin(stateData.walkPhase * 2));
      }
    } else {
      // IDLE: Clean silver monolith standing posture
      const breathe = 0.005 * Math.sin(elapsedTime * 1.2);
      const look = 0.008 * Math.sin(elapsedTime * 0.4);

      bodyGroup.rotation.x = breathe;
      bodyGroup.rotation.z = look;
      bodyGroup.position.y *= 0.92;

      for (let i = 0; i < 4; i++) {
        bars[i].pivot.rotation.x *= 0.92;
        bars[i].group.rotation.y *= 0.92;
        bars[i].pivot.position.y += (PIVOT_Y - bars[i].pivot.position.y) * 0.1;
        bars[i].slider.position.y += (-(LH + 0.03) - bars[i].slider.position.y) * 0.1;
      }
    }
  };

  const dispose = () => {
    scene.remove(root);
  };

  return {
    root,
    bodyGroup,
    bars,
    clickProxyMesh,
    displayTex,
    displayCanvas,
    displayCtx,
    displayMat,
    indicatorMat,
    stateData,
    update,
    cycleMode,
    setMode,
    dispose,
  };
}

/**
 * Draws crisp retro-monochrome green phosphor CRT terminal output on TARS screen.
 */
function renderTARSDisplay(ctx: CanvasRenderingContext2D, data: TARSStateData): void {
  ctx.fillStyle = '#021208';
  ctx.fillRect(0, 0, 256, 160);

  // Scanline overlay
  ctx.fillStyle = 'rgba(52, 211, 153, 0.06)';
  for (let y = 0; y < 160; y += 4) {
    ctx.fillRect(0, y, 256, 1.5);
  }

  ctx.strokeStyle = data.isAwake ? '#10b981' : '#f59e0b';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 152);

  ctx.fillStyle = data.isAwake ? '#34d399' : '#fbbf24';
  ctx.font = '700 13px "Courier New", monospace';
  ctx.fillText('TARS // UNIT 02 [SILVER]', 12, 24);

  ctx.font = '600 11px "Courier New", monospace';
  ctx.fillStyle = '#a7f3d0';

  if (!data.isAwake) {
    ctx.fillStyle = '#fde68a';
    ctx.fillText('STATUS : STANDBY [IMMOBILE]', 12, 44);
    ctx.fillText('POWER  : DORMANT (WAITING)', 12, 62);
    ctx.fillText('HONESTY: 90% | HUMOR: 75%', 12, 80);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 11.5px "Courier New", monospace';
    ctx.fillText('>> TOUCH / CLICK ROBOT <<', 12, 102);
    ctx.fillText('>> TO START WALKING <<', 12, 118);
    ctx.fillStyle = '#f59e0b';
    ctx.font = '600 10px "Courier New", monospace';
    ctx.fillText('[CLIQUEZ SUR LE ROBOT POUR ACTIVER]', 12, 136);
    ctx.fillText('OR PRESS [G] ON KEYBOARD', 12, 149);
    return;
  }

  let modeLabel = '2-2 ROTARY WALK';
  if (data.gait === 'CRAWL_1_2_1') modeLabel = '1-2-1 CRAWL';
  else if (data.gait === 'SPIN_WHEEL') modeLabel = 'PINWHEEL STAR-SPIN';

  ctx.fillText(`STATUS : ${data.state}`, 12, 44);
  ctx.fillText(`MODE   : ${modeLabel}`, 12, 62);
  ctx.fillText(`SPEED  : ${data.walkSpeed.toFixed(1)} m/s [${(data.walkSpeed * 3.6).toFixed(0)} km/h]`, 12, 80);
  ctx.fillText(`COORDS : X:${data.x.toFixed(1)} Z:${data.z.toFixed(1)}`, 12, 98);
  ctx.fillText('HONESTY: 90% | HUMOR: 75%', 12, 116);

  ctx.fillStyle = '#6ee7b7';
  ctx.font = '500 10px "Courier New", monospace';
  ctx.fillText('KEEP-OUT: SMART CIRCUIT [OK]', 12, 134);
  ctx.fillText('PRESS [G] / CLICK TO CYCLE MODE', 12, 148);
}
