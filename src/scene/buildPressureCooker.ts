import * as THREE from 'three';
import {
  PressureCookerState,
  cookerDialValueToNeedleAngleRad,
} from '../simulation/pressureCooker';
import {
  createBrushedStainlessPotTexture,
  createCookerPressureDialTexture,
  createCookerTemperatureDialTexture,
  createHandleStageScaleTexture,
  createHotplateDialScaleTexture,
  createLabTableTexture,
} from './textures';

export interface SteamPuffParticle {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  phase: number;
}

export interface PressureCookerRig {
  /** World-space 3D anchors for optional floating labels on Table 2 */
  anchors: {
    T_eye: THREE.Vector3;
    P_eye: THREE.Vector3;
    Cooker: THREE.Vector3;
  };
  /** Clickable 3D meshes on Table 2 for direct raycaster interaction */
  interactables: {
    tableTop: THREE.Object3D;
    plugConnector: THREE.Object3D;
    redSwitch: THREE.Object3D;
    rotaryDRing: THREE.Object3D;
    stagePushButton: THREE.Object3D;
  };
  triggerStageButtonPress: () => void;
  update: (state: PressureCookerState, elapsedSec: number, dt: number) => void;
}

/**
 * Builds Table 2 and the complete Laboratory Pressure Cooker thermodynamic station:
 * - Second light-gray laboratory benchtop positioned beside Table 1
 * - Grounded laboratory electrical outlet pedestal + plugged-in black power plug & cord
 * - Electric heating element (hotplate) with glowing red activation switch and 0..6 numerical knob
 * - Brushed stainless-steel single-handle pressure cooker with 0/1/2 stage toggle switch & steam vent
 * - Two side-by-side "robot eye" analog gauges on brass stems above the lid (Eye 1 = Temp °C, Eye 2 = Pressure bar)
 */
export function buildPressureCookerStation(options: {
  scene: THREE.Scene;
  maxAniso: number;
  shadowTex: THREE.CanvasTexture;
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
}): PressureCookerRig {
  const { scene, maxAniso, shadowTex, track, addContactShadow } = options;

  const table2X = 5.45;
  const table2Z = 0.15;

  // --- 1. SECOND LABORATORY TABLE (TABLE 2) ---
  const tableGroup = new THREE.Group();
  const tableTex = track(createLabTableTexture(maxAniso));
  tableTex.repeat.set(4, 5);

  const topGeo = track(new THREE.BoxGeometry(4.3, 0.09, 3.4));
  const topMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tableTex,
      roughness: 0.62,
      metalness: 0.04,
    }),
  );
  const topMesh = new THREE.Mesh(topGeo, topMat);
  topMesh.position.set(table2X, -0.045, table2Z);
  topMesh.receiveShadow = true;
  tableGroup.add(topMesh);

  const edgeGeo = track(new THREE.BoxGeometry(4.32, 0.092, 0.03));
  const edgeMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x3b424c,
      roughness: 0.45,
      metalness: 0.12,
    }),
  );
  const frontEdge = new THREE.Mesh(edgeGeo, edgeMat);
  frontEdge.position.set(table2X, -0.045, 1.85);
  tableGroup.add(frontEdge);

  const frameMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x67707c,
      roughness: 0.45,
      metalness: 0.65,
    }),
  );
  const apronGeo = track(new THREE.BoxGeometry(3.8, 0.12, 0.08));
  const frontApron = new THREE.Mesh(apronGeo, frameMat);
  frontApron.position.set(table2X, -0.15, 1.62);
  tableGroup.add(frontApron);

  const legGeo = track(new THREE.BoxGeometry(0.11, 2.2, 0.11));
  for (const lx of [table2X - 1.85, table2X + 1.85]) {
    for (const lz of [-1.2, 1.6]) {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(lx, -1.19, lz);
      tableGroup.add(leg);
    }
  }
  scene.add(tableGroup);

  // Shared PBR materials for Table 2 station
  const darkPhenolicMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x161920,
      roughness: 0.3,
      metalness: 0.08,
    }),
  );
  const matteRubberMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x12151a,
      roughness: 0.72,
      metalness: 0.06,
    }),
  );
  const chromeSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf2f6fa,
      roughness: 0.09,
      metalness: 0.96,
    }),
  );
  const brushedDrumMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd0d7e0,
      roughness: 0.28,
      metalness: 0.88,
    }),
  );
  const brassStemMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xc99c3a,
      roughness: 0.24,
      metalness: 0.87,
    }),
  );
  const whiteEnamelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xedeff4,
      roughness: 0.32,
      metalness: 0.14,
    }),
  );

  // --- 2. BENCHTOP ELECTRICAL OUTLET PEDESTAL + PLUGGED-IN CORD ---
  const outletX = 4.08;
  const outletZ = -0.06;
  const outletGroup = new THREE.Group();
  outletGroup.position.set(outletX, 0.0, outletZ);
  outletGroup.rotation.y = 0.42; // Angled cleanly toward viewer & cooker

  // Base flange bolted to tabletop
  const outletBaseGeo = track(new THREE.BoxGeometry(0.28, 0.022, 0.21));
  const outletBase = new THREE.Mesh(outletBaseGeo, frameMat);
  outletBase.position.y = 0.011;
  outletBase.castShadow = true;
  outletBase.receiveShadow = true;
  outletGroup.add(outletBase);

  // Vertical laboratory dual-socket power turret
  const outletBodyGeo = track(new THREE.BoxGeometry(0.23, 0.34, 0.15));
  const outletBody = new THREE.Mesh(outletBodyGeo, whiteEnamelMat);
  outletBody.position.y = 0.19;
  outletBody.castShadow = true;
  outletBody.receiveShadow = true;
  outletGroup.add(outletBody);

  // Top blue-gray laboratory circuit breaker / 230V header strip
  const headerBarGeo = track(new THREE.BoxGeometry(0.234, 0.036, 0.154));
  const headerBarMat = track(
    new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.4, metalness: 0.15 }),
  );
  const headerBar = new THREE.Mesh(headerBarGeo, headerBarMat);
  headerBar.position.y = 0.345;
  outletGroup.add(headerBar);

  // Helper to build recessed Schuko socket wells on the front (+Z) face of the outlet box
  const socketTrimGeo = track(new THREE.BoxGeometry(0.14, 0.125, 0.012));
  const socketWellGeo = track(new THREE.CylinderGeometry(0.044, 0.044, 0.016, 24));
  socketWellGeo.rotateX(Math.PI / 2);
  const pinHoleGeo = track(new THREE.CylinderGeometry(0.0065, 0.0065, 0.018, 12));
  pinHoleGeo.rotateX(Math.PI / 2);
  const groundClipGeo = track(new THREE.BoxGeometry(0.008, 0.014, 0.016));

  const socketWellMat = track(
    new THREE.MeshStandardMaterial({ color: 0xd8dee6, roughness: 0.45, metalness: 0.04 }),
  );

  for (const sy of [0.255, 0.115]) {
    const trim = new THREE.Mesh(socketTrimGeo, whiteEnamelMat);
    trim.position.set(0, sy, 0.076);
    outletGroup.add(trim);

    const well = new THREE.Mesh(socketWellGeo, socketWellMat);
    well.position.set(0, sy, 0.079);
    outletGroup.add(well);

    for (const px of [-0.018, 0.018]) {
      const hole = new THREE.Mesh(pinHoleGeo, matteRubberMat);
      hole.position.set(px, sy, 0.081);
      outletGroup.add(hole);
    }

    for (const gy of [-0.038, 0.038]) {
      const clip = new THREE.Mesh(groundClipGeo, brassStemMat);
      clip.position.set(0, sy + gy, 0.084);
      outletGroup.add(clip);
    }
  }

  // Molded black right-angle Schuko electrical plug + pressure-sensitive collar inserted into lower socket (y = 0.115)
  const plugGroup = new THREE.Group();
  plugGroup.position.set(0, 0.115, 0.088);
  const plugHeadGeo = track(new THREE.CylinderGeometry(0.044, 0.046, 0.048, 24));
  plugHeadGeo.rotateX(Math.PI / 2);
  const plugHead = new THREE.Mesh(plugHeadGeo, darkPhenolicMat);
  plugHead.position.z = 0.018;
  plugHead.castShadow = true;
  plugGroup.add(plugHead);

  // Metallic pressure-sensitive sensor ring + status LED on plug connector
  const sensorCollarGeo = track(new THREE.TorusGeometry(0.043, 0.006, 12, 24));
  const sensorCollar = new THREE.Mesh(sensorCollarGeo, chromeSteelMat);
  sensorCollar.position.z = 0.036;
  plugGroup.add(sensorCollar);

  const plugLedMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: new THREE.Color(0x16a34a),
      emissiveIntensity: 0.9,
      roughness: 0.25,
    }),
  );
  const plugLedGeo = track(new THREE.SphereGeometry(0.0085, 12, 10));
  const plugLedMesh = new THREE.Mesh(plugLedGeo, plugLedMat);
  plugLedMesh.position.set(0, 0.028, 0.044);
  plugGroup.add(plugLedMesh);

  const plugNeckGeo = track(new THREE.CylinderGeometry(0.018, 0.024, 0.055, 16));
  const plugNeck = new THREE.Mesh(plugNeckGeo, matteRubberMat);
  plugNeck.position.set(0.016, -0.034, 0.026);
  plugNeck.rotation.z = 0.48;
  plugGroup.add(plugNeck);

  // Invisible generous raycast hit box around the pressure-sensitive plug & socket
  const plugHitGeo = track(new THREE.BoxGeometry(0.20, 0.20, 0.18));
  const invisibleHitMat = track(
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  const plugHitMesh = new THREE.Mesh(plugHitGeo, invisibleHitMat);
  plugHitMesh.position.set(0, 0, 0.03);
  plugGroup.add(plugHitMesh);

  outletGroup.add(plugGroup);

  scene.add(outletGroup);
  addContactShadow(shadowTex, outletX, outletZ, 0.48, 0.42, 0.48, 0.42);

  // --- 3. ELECTRIC HEATING ELEMENT (HOTPLATE) ---
  const cookerX = 5.52;
  const cookerZ = 0.20;
  const hotplateGroup = new THREE.Group();
  hotplateGroup.position.set(cookerX, 0.0, cookerZ);

  // Sloped-front rectangular hotplate chassis via ExtrudeGeometry (1.06 wide, 0.205 tall)
  // Profile in YZ plane: rear at z = -0.46, top deck z = -0.46..+0.39, sloped front fascia z = +0.39..+0.52
  const hpShape = new THREE.Shape();
  hpShape.moveTo(-0.46, 0.022);
  hpShape.lineTo(0.52, 0.022);
  hpShape.lineTo(0.41, 0.205);
  hpShape.lineTo(-0.46, 0.205);
  hpShape.closePath();

  const hpGeo = track(
    new THREE.ExtrudeGeometry(hpShape, {
      depth: 1.04,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 3,
    }),
  );
  hpGeo.translate(0, 0, -0.52);
  hpGeo.rotateY(-Math.PI / 2); // Now X is width [-0.52..+0.52], Y is height, +Z faces viewer!

  const hpChassis = new THREE.Mesh(hpGeo, whiteEnamelMat);
  hpChassis.castShadow = true;
  hpChassis.receiveShadow = true;
  hotplateGroup.add(hpChassis);

  // 4 non-slip rubber feet under hotplate
  const hpFootGeo = track(new THREE.CylinderGeometry(0.038, 0.042, 0.024, 16));
  for (const fx of [-0.42, 0.42]) {
    for (const fz of [-0.36, 0.36]) {
      const foot = new THREE.Mesh(hpFootGeo, matteRubberMat);
      foot.position.set(fx, 0.012, fz);
      hotplateGroup.add(foot);
    }
  }

  // Left-side black strain-relief grommet where electrical cord enters hotplate
  const cordGrommetGeo = track(new THREE.CylinderGeometry(0.02, 0.025, 0.036, 16));
  cordGrommetGeo.rotateZ(Math.PI / 2);
  const cordGrommet = new THREE.Mesh(cordGrommetGeo, matteRubberMat);
  cordGrommet.position.set(-0.54, 0.085, 0.14);
  hotplateGroup.add(cordGrommet);

  // Curved black insulated power cord from outlet plug to hotplate left side!
  const powerCordCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(outletX + 0.06, 0.075, outletZ + 0.10),
    new THREE.Vector3(outletX + 0.24, 0.016, outletZ + 0.26),
    new THREE.Vector3(cookerX - 0.88, 0.015, cookerZ + 0.30),
    new THREE.Vector3(cookerX - 0.65, 0.048, cookerZ + 0.20),
    new THREE.Vector3(cookerX - 0.54, 0.085, cookerZ + 0.14),
  ]);
  const powerCordGeo = track(new THREE.TubeGeometry(powerCordCurve, 36, 0.0135, 10, false));
  const powerCordMesh = new THREE.Mesh(powerCordGeo, matteRubberMat);
  powerCordMesh.castShadow = true;
  scene.add(powerCordMesh);

  // Top Cast-Iron Heating Element Burner Plate (centered at z = -0.03, y = 0.218..0.254)
  const spillRingGeo = track(new THREE.TorusGeometry(0.408, 0.016, 14, 48));
  spillRingGeo.rotateX(Math.PI / 2);
  const spillRing = new THREE.Mesh(spillRingGeo, chromeSteelMat);
  spillRing.position.set(0, 0.222, -0.03);
  hotplateGroup.add(spillRing);

  const burnerGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x23262d,
      emissive: new THREE.Color(0xff3b0d),
      emissiveIntensity: 0.35,
      roughness: 0.68,
      metalness: 0.42,
    }),
  );
  const burnerPlateGeo = track(new THREE.CylinderGeometry(0.395, 0.402, 0.038, 48));
  const burnerPlate = new THREE.Mesh(burnerPlateGeo, burnerGlowMat);
  burnerPlate.position.set(0, 0.236, -0.03);
  burnerPlate.castShadow = true;
  burnerPlate.receiveShadow = true;
  hotplateGroup.add(burnerPlate);

  // Sloped Front Control Panel Group (facing upward & forward at tilt = atan2(0.11, 0.183) ≈ 0.541 rad)
  const fasciaSlope = Math.atan2(0.11, 0.183);
  const fasciaGroup = new THREE.Group();
  fasciaGroup.position.set(0, 0.114, 0.478);
  fasciaGroup.rotation.x = -fasciaSlope;
  hotplateGroup.add(fasciaGroup);

  // Dark metallic front control panel escutcheon strip
  const panelStripGeo = track(new THREE.BoxGeometry(0.92, 0.155, 0.008));
  const panelStripMat = track(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.42, metalness: 0.22 }),
  );
  fasciaGroup.add(new THREE.Mesh(panelStripGeo, panelStripMat));

  // 3a) Front-Left Switch That Turns RED When Activated (clickable in 3D!)
  const redSwitchHousingGeo = track(new THREE.BoxGeometry(0.128, 0.090, 0.022));
  const redSwitchHousing = new THREE.Mesh(redSwitchHousingGeo, darkPhenolicMat);
  redSwitchHousing.position.set(-0.27, 0.0, 0.01);
  fasciaGroup.add(redSwitchHousing);

  const heaterRockerMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: new THREE.Color(0xd90416),
      emissiveIntensity: 0.68,
      roughness: 0.24,
      metalness: 0.04,
    }),
  );
  const heaterRockerGeo = track(new THREE.BoxGeometry(0.092, 0.060, 0.028));
  const heaterRockerMesh = new THREE.Mesh(heaterRockerGeo, heaterRockerMat);
  heaterRockerMesh.position.set(-0.27, 0.0, 0.022);
  heaterRockerMesh.rotation.x = -0.18;
  fasciaGroup.add(heaterRockerMesh);

  const redSwitchHitGeo = track(new THREE.BoxGeometry(0.16, 0.12, 0.08));
  const redSwitchHitMesh = new THREE.Mesh(redSwitchHitGeo, invisibleHitMat);
  redSwitchHitMesh.position.set(-0.27, 0.0, 0.025);
  fasciaGroup.add(redSwitchHitMesh);

  // 3b) Front-Right Rotary D-Ring ("bague en D rotative") Selector (0 up to 6)
  const dialScaleTex = track(createHotplateDialScaleTexture(maxAniso));
  const dialScaleGeo = track(new THREE.CircleGeometry(0.088, 40));
  const dialScaleMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: dialScaleTex,
      roughness: 0.35,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const dialScaleMesh = new THREE.Mesh(dialScaleGeo, dialScaleMat);
  dialScaleMesh.position.set(0.26, 0.0, 0.006);
  fasciaGroup.add(dialScaleMesh);

  const heaterKnobGroup = new THREE.Group();
  heaterKnobGroup.position.set(0.26, 0.0, 0.022);
  const knobCylGeo = track(new THREE.CylinderGeometry(0.032, 0.035, 0.026, 28));
  knobCylGeo.rotateX(Math.PI / 2);
  const knobCyl = new THREE.Mesh(knobCylGeo, darkPhenolicMat);
  knobCyl.castShadow = true;
  heaterKnobGroup.add(knobCyl);

  // Sculpted Metallic & Phenolic D-Ring ("bague en D rotative") around the selector hub
  const dRingOuterShape = new THREE.Shape();
  dRingOuterShape.absarc(0, 0, 0.056, -Math.PI * 0.36, Math.PI * 1.36, false);
  dRingOuterShape.closePath();

  const dRingHole = new THREE.Path();
  dRingHole.absarc(0, 0, 0.037, -Math.PI * 0.33, Math.PI * 1.33, false);
  dRingHole.closePath();
  dRingOuterShape.holes.push(dRingHole);

  const dRingGeo = track(
    new THREE.ExtrudeGeometry(dRingOuterShape, {
      depth: 0.018,
      bevelEnabled: true,
      bevelThickness: 0.004,
      bevelSize: 0.003,
      bevelSegments: 2,
    }),
  );
  const dRingMesh = new THREE.Mesh(dRingGeo, chromeSteelMat);
  dRingMesh.position.z = 0.006;
  dRingMesh.castShadow = true;
  heaterKnobGroup.add(dRingMesh);

  const knobPointerGeo = track(new THREE.BoxGeometry(0.010, 0.038, 0.012));
  const knobPointerMat = track(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.25 }),
  );
  const knobPointer = new THREE.Mesh(knobPointerGeo, knobPointerMat);
  knobPointer.position.set(0, 0.038, 0.022); // Points straight up at '0' when rotation.z === 0
  heaterKnobGroup.add(knobPointer);
  fasciaGroup.add(heaterKnobGroup);

  const dRingHitGeo = track(new THREE.BoxGeometry(0.18, 0.18, 0.09));
  const dRingHitMesh = new THREE.Mesh(dRingHitGeo, invisibleHitMat);
  dRingHitMesh.position.set(0.26, 0.0, 0.028);
  fasciaGroup.add(dRingHitMesh);

  scene.add(hotplateGroup);
  addContactShadow(shadowTex, cookerX, cookerZ, 1.38, 1.28, 0.58);

  // --- 4. LABORATORY PRESSURE COOKER (SITTING ON TOP OF HEATING ELEMENT AT y = 0.254) ---
  const potBaseY = 0.254;
  const cookerGroup = new THREE.Group();
  cookerGroup.position.set(cookerX, potBaseY, cookerZ - 0.03);

  // 4a) Encapsulated thermal sandwich bottom disc
  const cladPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.345, 0.0),
    new THREE.Vector2(0.368, 0.032),
    new THREE.Vector2(0.376, 0.048),
  ];
  const cladGeo = track(new THREE.LatheGeometry(cladPts, 48));
  const cladMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x7e8794,
      roughness: 0.36,
      metalness: 0.84,
    }),
  );
  const cladMesh = new THREE.Mesh(cladGeo, cladMat);
  cladMesh.castShadow = true;
  cladMesh.receiveShadow = true;
  cookerGroup.add(cladMesh);

  // 4b) Brushed 18/10 Stainless-Steel Cylindrical Pot Body with satin horizontal bands
  const potTex = track(createBrushedStainlessPotTexture(maxAniso));
  const potPts = [
    new THREE.Vector2(0.368, 0.035),
    new THREE.Vector2(0.382, 0.085),
    new THREE.Vector2(0.384, 0.485),
    new THREE.Vector2(0.398, 0.502),
    new THREE.Vector2(0.378, 0.502),
  ];
  const potGeo = track(new THREE.LatheGeometry(potPts, 56));
  const potMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: potTex,
      roughness: 0.25,
      metalness: 0.89,
    }),
  );
  const potMesh = new THREE.Mesh(potGeo, potMat);
  potMesh.castShadow = true;
  potMesh.receiveShadow = true;
  cookerGroup.add(potMesh);

  // 4c) Mirror-Polished Stainless-Steel Lid with Bayonet Rim & Orange Gasket Tab (images_f7314921.jpg)
  // Wound from inner rim upward to center crown so LatheGeometry normals face +Y / +Z outward
  const lidPts = [
    new THREE.Vector2(0.390, 0.482),
    new THREE.Vector2(0.404, 0.482),
    new THREE.Vector2(0.404, 0.520),
    new THREE.Vector2(0.396, 0.532),
    new THREE.Vector2(0.355, 0.546),
    new THREE.Vector2(0.22, 0.558),
    new THREE.Vector2(0.0, 0.562),
  ];
  const lidGeo = track(new THREE.LatheGeometry(lidPts, 56));
  const lidMesh = new THREE.Mesh(lidGeo, chromeSteelMat);
  lidMesh.castShadow = true;
  lidMesh.receiveShadow = true;
  cookerGroup.add(lidMesh);

  // Bayonet rim flange tabs around perimeter + tiny orange silicone gasket tab on front-right
  const bayonetTabGeo = track(
    new THREE.CylinderGeometry(0.409, 0.409, 0.022, 24, 1, true, -0.35, 0.7),
  );
  for (const ang of [0.3, 1.85, 3.45, 5.0]) {
    const tab = new THREE.Mesh(bayonetTabGeo, chromeSteelMat);
    tab.position.y = 0.494;
    tab.rotation.y = ang;
    cookerGroup.add(tab);
  }

  const gasketTabGeo = track(new THREE.BoxGeometry(0.026, 0.012, 0.014));
  const gasketTabMat = track(
    new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4, metalness: 0.05 }),
  );
  const gasketTab = new THREE.Mesh(gasketTabGeo, gasketTabMat);
  gasketTab.position.set(0.26, 0.482, 0.305);
  gasketTab.rotation.y = 0.72;
  cookerGroup.add(gasketTab);

  // 4d) SINGLE ERGONOMIC BLACK HANDLE + 3-STAGE SELECTOR SWITCH (0 / 1 / 2)
  // Strictly ONE single handle extending front-right (no opposite helper handle, per user instructions!)
  const handleAssembly = new THREE.Group();
  handleAssembly.rotation.y = -0.42; // Extends toward right (+X) and slightly forward (+Z) like image_1b7fb853.png

  // Stainless pot-wall mounting bracket collar
  const collarBracketGeo = track(new THREE.BoxGeometry(0.075, 0.105, 0.11));
  const collarBracket = new THREE.Mesh(collarBracketGeo, chromeSteelMat);
  collarBracket.position.set(0.405, 0.405, 0);
  collarBracket.castShadow = true;
  handleAssembly.add(collarBracket);

  // Lower Pot Handle (sculpted ergonomic side profile via ExtrudeGeometry)
  const lowerHShape = new THREE.Shape();
  lowerHShape.moveTo(0.42, 0.355);
  lowerHShape.lineTo(0.50, 0.355);
  lowerHShape.lineTo(0.54, 0.382);
  lowerHShape.lineTo(0.86, 0.362);
  lowerHShape.lineTo(0.89, 0.385);
  lowerHShape.lineTo(0.88, 0.432);
  lowerHShape.lineTo(0.42, 0.452);
  lowerHShape.closePath();

  const lowerHGeo = track(
    new THREE.ExtrudeGeometry(lowerHShape, {
      depth: 0.088,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.01,
      bevelSegments: 3,
    }),
  );
  lowerHGeo.translate(0, 0, -0.044);
  const lowerHandleMesh = new THREE.Mesh(lowerHGeo, darkPhenolicMat);
  lowerHandleMesh.castShadow = true;
  lowerHandleMesh.receiveShadow = true;
  handleAssembly.add(lowerHandleMesh);

  // Upper Lid Handle Saddle + Grip (extends from r = 0.25 on lid top out to r = 0.90)
  const upperHShape = new THREE.Shape();
  upperHShape.moveTo(0.25, 0.548);
  upperHShape.lineTo(0.42, 0.462);
  upperHShape.lineTo(0.895, 0.438);
  upperHShape.lineTo(0.905, 0.478);
  upperHShape.lineTo(0.52, 0.574);
  upperHShape.lineTo(0.27, 0.584);
  upperHShape.closePath();

  const upperHGeo = track(
    new THREE.ExtrudeGeometry(upperHShape, {
      depth: 0.098,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 3,
    }),
  );
  upperHGeo.translate(0, 0, -0.049);
  const upperHandleMesh = new THREE.Mesh(upperHGeo, darkPhenolicMat);
  upperHandleMesh.castShadow = true;
  upperHandleMesh.receiveShadow = true;
  handleAssembly.add(upperHandleMesh);

  // 3-Stage Selector Switch ("0   1   2") on the flat upper handle collar saddle (r = 0.31..0.48, y = 0.592)
  const stageScaleGroup = new THREE.Group();
  stageScaleGroup.position.set(0.39, 0.591, 0);
  stageScaleGroup.rotation.z = -0.058; // Flush with gentle slope of upper handle crown

  const stageScaleTex = track(createHandleStageScaleTexture(maxAniso));
  const stagePlateGeo = track(new THREE.PlaneGeometry(0.165, 0.078));
  stagePlateGeo.rotateX(-Math.PI / 2);
  const stagePlateMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stageScaleTex,
      roughness: 0.35,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  stageScaleGroup.add(new THREE.Mesh(stagePlateGeo, stagePlateMat));

  // Tactile 3-Position Push-Button ("bouton-poussoir à trois positions" 0 -> 1 -> 2 -> 0) + stage index
  const stageSliderGroup = new THREE.Group();
  stageSliderGroup.position.set(0.048, 0.01, 0.014);
  const sliderBodyGeo = track(new THREE.BoxGeometry(0.034, 0.022, 0.030));
  const sliderBodyMat = track(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.32, metalness: 0.25 }),
  );
  const sliderBody = new THREE.Mesh(sliderBodyGeo, sliderBodyMat);
  sliderBody.castShadow = true;
  stageSliderGroup.add(sliderBody);

  const sliderIndexGeo = track(new THREE.BoxGeometry(0.008, 0.025, 0.032));
  const sliderIndexMat = track(
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.25 }),
  );
  stageSliderGroup.add(new THREE.Mesh(sliderIndexGeo, sliderIndexMat));
  stageScaleGroup.add(stageSliderGroup);

  // Raised cylindrical 3-position push-button actuator right next to the 0/1/2 scale
  const pushBtnCollarGeo = track(new THREE.CylinderGeometry(0.024, 0.026, 0.014, 20));
  const pushBtnCollar = new THREE.Mesh(pushBtnCollarGeo, chromeSteelMat);
  pushBtnCollar.position.set(0.0, 0.007, -0.028);
  stageScaleGroup.add(pushBtnCollar);

  const pushBtnCapGeo = track(new THREE.CylinderGeometry(0.019, 0.020, 0.026, 20));
  const pushBtnCapMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.26,
      metalness: 0.18,
    }),
  );
  const stagePushBtnCap = new THREE.Mesh(pushBtnCapGeo, pushBtnCapMat);
  stagePushBtnCap.position.set(0.0, 0.021, -0.028);
  stagePushBtnCap.castShadow = true;
  stageScaleGroup.add(stagePushBtnCap);

  const stageHitGeo = track(new THREE.BoxGeometry(0.22, 0.11, 0.14));
  const stageHitMesh = new THREE.Mesh(stageHitGeo, invisibleHitMat);
  stageHitMesh.position.set(0.0, 0.02, 0.0);
  stageScaleGroup.add(stageHitMesh);

  handleAssembly.add(stageScaleGroup);
  cookerGroup.add(handleAssembly);

  // 4e) CENTRAL STEAM VENT REGULATOR VALVE + SAFETY PIN ON LID (matching image_1b7fb853.png)
  const ventX = 0.01;
  const ventZ = 0.11;
  const ventGroup = new THREE.Group();
  ventGroup.position.set(ventX, 0.558, ventZ);

  const ventBaseWasherGeo = track(new THREE.CylinderGeometry(0.062, 0.066, 0.014, 28));
  ventGroup.add(new THREE.Mesh(ventBaseWasherGeo, chromeSteelMat));

  const ventCapGeo = track(new THREE.CylinderGeometry(0.052, 0.055, 0.076, 32));
  const ventCap = new THREE.Mesh(ventCapGeo, darkPhenolicMat);
  ventCap.position.y = 0.042;
  ventCap.castShadow = true;
  ventGroup.add(ventCap);

  const ventCrownRingGeo = track(new THREE.TorusGeometry(0.041, 0.008, 12, 28));
  ventCrownRingGeo.rotateX(Math.PI / 2);
  const ventCrownRing = new THREE.Mesh(ventCrownRingGeo, chromeSteelMat);
  ventCrownRing.position.y = 0.080;
  ventGroup.add(ventCrownRing);

  const ventNozzleHoleGeo = track(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 18));
  const ventNozzleHole = new THREE.Mesh(ventNozzleHoleGeo, matteRubberMat);
  ventNozzleHole.position.y = 0.076;
  ventGroup.add(ventNozzleHole);

  cookerGroup.add(ventGroup);

  // Small red/silver safety pressure lock pin nearby on lid
  const safetyPinGroup = new THREE.Group();
  safetyPinGroup.position.set(-0.15, 0.554, 0.12);
  const pinNutGeo = track(new THREE.CylinderGeometry(0.020, 0.022, 0.016, 6));
  safetyPinGroup.add(new THREE.Mesh(pinNutGeo, chromeSteelMat));
  const safetyPinPistonGeo = track(new THREE.CylinderGeometry(0.008, 0.008, 0.028, 14));
  const safetyPinMat = track(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.2 }),
  );
  const safetyPinPiston = new THREE.Mesh(safetyPinPistonGeo, safetyPinMat);
  safetyPinPiston.position.y = 0.016;
  safetyPinGroup.add(safetyPinPiston);
  cookerGroup.add(safetyPinGroup);

  // Procedural shaded laboratory steam/vapor puff texture (dense silver-white core + cool slate rim self-shadowing)
  const steamCanvas = document.createElement('canvas');
  steamCanvas.width = 128;
  steamCanvas.height = 128;
  const sCtx = steamCanvas.getContext('2d')!;
  const sGrad = sCtx.createRadialGradient(60, 58, 6, 64, 64, 60);
  sGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.96)');
  sGrad.addColorStop(0.32, 'rgba(241, 245, 249, 0.82)');
  sGrad.addColorStop(0.62, 'rgba(182, 196, 212, 0.44)');
  sGrad.addColorStop(0.84, 'rgba(136, 152, 172, 0.16)');
  sGrad.addColorStop(1.0, 'rgba(136, 152, 172, 0.0)');
  sCtx.fillStyle = sGrad;
  sCtx.fillRect(0, 0, 128, 128);
  const steamPuffTex = track(new THREE.CanvasTexture(steamCanvas));
  steamPuffTex.colorSpace = THREE.SRGBColorSpace;

  // Animated 3D Laboratory Steam Plume (28 camera-facing vapor sprites calibrated to physical density & jet speed)
  const steamPuffs: SteamPuffParticle[] = [];
  const puffCount = 28;
  for (let i = 0; i < puffCount; i++) {
    const pMat = track(
      new THREE.SpriteMaterial({
        map: steamPuffTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      }),
    );
    const pSprite = new THREE.Sprite(pMat);
    pSprite.visible = false;
    pSprite.renderOrder = 8;
    cookerGroup.add(pSprite);
    steamPuffs.push({
      sprite: pSprite,
      mat: pMat,
      phase: i / puffCount,
    });
  }

  // 4f) TWO "ROBOT EYES" MEASURING DEVICES ABOVE THE PRESSURE COOKER
  const tempDialTex = track(createCookerTemperatureDialTexture(maxAniso));
  const pressDialTex = track(createCookerPressureDialTexture(maxAniso));

  const needleMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x0f1319,
      roughness: 0.28,
      metalness: 0.45,
    }),
  );
  const lensGlassMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      roughness: 0.05,
      metalness: 0.12,
      depthWrite: false,
    }),
  );

  const buildRobotEyeGauge = (
    eyeX: number,
    eyeZ: number,
    dialTex: THREE.CanvasTexture,
    hasTopBlowoutPlug: boolean,
  ): THREE.Group => {
    const eyeRoot = new THREE.Group();
    eyeRoot.position.set(eyeX, 0.552, eyeZ);
    eyeRoot.rotation.y = eyeX < 0 ? 0.06 : -0.06;

    const baseFlangeGeo = track(new THREE.CylinderGeometry(0.036, 0.042, 0.018, 24));
    const baseFlange = new THREE.Mesh(baseFlangeGeo, brassStemMat);
    baseFlange.position.y = 0.009;
    eyeRoot.add(baseFlange);

    const lowerHexGeo = track(new THREE.CylinderGeometry(0.034, 0.034, 0.032, 6));
    const lowerHex = new THREE.Mesh(lowerHexGeo, brassStemMat);
    lowerHex.position.y = 0.034;
    lowerHex.castShadow = true;
    eyeRoot.add(lowerHex);

    const brassCollarGeo = track(new THREE.CylinderGeometry(0.025, 0.025, 0.022, 20));
    const brassCollar = new THREE.Mesh(brassCollarGeo, brassStemMat);
    brassCollar.position.y = 0.061;
    eyeRoot.add(brassCollar);

    const midHexGeo = track(new THREE.CylinderGeometry(0.036, 0.036, 0.026, 6));
    const midHex = new THREE.Mesh(midHexGeo, brassStemMat);
    midHex.position.y = 0.085;
    midHex.castShadow = true;
    eyeRoot.add(midHex);

    const upperSquareSpigotGeo = track(new THREE.BoxGeometry(0.048, 0.068, 0.048));
    const upperSpigot = new THREE.Mesh(upperSquareSpigotGeo, brushedDrumMat);
    upperSpigot.position.y = 0.132;
    upperSpigot.castShadow = true;
    eyeRoot.add(upperSpigot);

    const gaugeRadius = 0.152;
    const drumDepth = 0.114;
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.308, 0);

    const drumGeo = track(new THREE.CylinderGeometry(gaugeRadius, gaugeRadius, drumDepth, 44));
    drumGeo.rotateX(Math.PI / 2);
    const drumMesh = new THREE.Mesh(drumGeo, brushedDrumMat);
    drumMesh.castShadow = true;
    drumMesh.receiveShadow = true;
    headGroup.add(drumMesh);

    const bezelSleeveGeo = track(
      new THREE.CylinderGeometry(gaugeRadius + 0.005, gaugeRadius + 0.005, 0.028, 44),
    );
    bezelSleeveGeo.rotateX(Math.PI / 2);
    const bezelSleeve = new THREE.Mesh(bezelSleeveGeo, chromeSteelMat);
    bezelSleeve.position.z = drumDepth * 0.5 - 0.008;
    headGroup.add(bezelSleeve);

    const bezelLipGeo = track(new THREE.TorusGeometry(gaugeRadius - 0.004, 0.012, 16, 48));
    const bezelLip = new THREE.Mesh(bezelLipGeo, chromeSteelMat);
    bezelLip.position.z = drumDepth * 0.5 + 0.006;
    headGroup.add(bezelLip);

    const sideScrewGeo = track(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 14));
    sideScrewGeo.rotateZ(Math.PI / 2);
    const sideScrew = new THREE.Mesh(sideScrewGeo, chromeSteelMat);
    sideScrew.position.set(gaugeRadius + 0.002, -0.02, 0.01);
    headGroup.add(sideScrew);

    if (hasTopBlowoutPlug) {
      const plugBossGeo = track(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 16));
      const plugBoss = new THREE.Mesh(plugBossGeo, brassStemMat);
      plugBoss.position.set(0, gaugeRadius + 0.006, 0.005);
      headGroup.add(plugBoss);

      const plugCapGeo = track(new THREE.CylinderGeometry(0.020, 0.020, 0.009, 16));
      const plugCap = new THREE.Mesh(plugCapGeo, matteRubberMat);
      plugCap.position.set(0, gaugeRadius + 0.015, 0.005);
      headGroup.add(plugCap);
    }

    const dialZ = drumDepth * 0.5 + 0.007;
    const dialGeo = track(new THREE.CircleGeometry(gaugeRadius - 0.01, 44));
    const dialMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: dialTex,
        roughness: 0.3,
        metalness: 0.02,
      }),
    );
    const dialMesh = new THREE.Mesh(dialGeo, dialMat);
    dialMesh.position.z = dialZ;
    headGroup.add(dialMesh);

    const needlePivot = new THREE.Group();
    needlePivot.position.z = dialZ + 0.005;

    const ptrShape = new THREE.Shape();
    ptrShape.moveTo(-0.032, -0.0075);
    ptrShape.lineTo(0.112, -0.002);
    ptrShape.lineTo(0.112, 0.002);
    ptrShape.lineTo(-0.032, 0.0075);
    ptrShape.closePath();

    const ptrGeo = track(new THREE.ShapeGeometry(ptrShape));
    needlePivot.add(new THREE.Mesh(ptrGeo, needleMat));

    const hubGeo = track(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 20));
    hubGeo.rotateX(Math.PI / 2);
    needlePivot.add(new THREE.Mesh(hubGeo, needleMat));

    headGroup.add(needlePivot);

    const glassGeo = track(new THREE.CircleGeometry(gaugeRadius - 0.006, 40));
    const glassMesh = new THREE.Mesh(glassGeo, lensGlassMat);
    glassMesh.position.z = dialZ + 0.012;
    glassMesh.renderOrder = 5;
    headGroup.add(glassMesh);

    eyeRoot.add(headGroup);
    cookerGroup.add(eyeRoot);
    return needlePivot;
  };

  const tempNeedle = buildRobotEyeGauge(-0.182, -0.055, tempDialTex, false);
  const pressureNeedle = buildRobotEyeGauge(0.182, -0.055, pressDialTex, true);

  scene.add(cookerGroup);

  const anchors = {
    T_eye: new THREE.Vector3(cookerX - 0.56, potBaseY + 1.28, cookerZ - 0.05),
    P_eye: new THREE.Vector3(cookerX + 0.58, potBaseY + 1.02, cookerZ - 0.05),
    Cooker: new THREE.Vector3(cookerX + 0.82, potBaseY + 0.36, cookerZ + 0.35),
  };

  let stageBtnPressDecay = 0;

  const triggerStageButtonPress = () => {
    stageBtnPressDecay = 1.0;
  };

  const update = (st: PressureCookerState, elapsedSec: number, dt: number) => {
    const activeFlutter = st.heaterPowerW > 0 ? 1 : 0;
    const targetTempAngle = cookerDialValueToNeedleAngleRad(
      st.waterTempC,
      160,
      elapsedSec,
      activeFlutter * 0.45,
    );
    const targetPressAngle = cookerDialValueToNeedleAngleRad(
      st.pressureBar,
      2.5,
      elapsedSec + 1.1,
      st.steamVentRate > 0.05 ? 0.022 : activeFlutter * 0.008,
    );

    tempNeedle.rotation.z = THREE.MathUtils.damp(tempNeedle.rotation.z, targetTempAngle, 8, dt);
    pressureNeedle.rotation.z = THREE.MathUtils.damp(
      pressureNeedle.rotation.z,
      targetPressAngle,
      8,
      dt,
    );

    // Pressure-sensitive Electrical Plug Connector insertion travel & status LED
    const targetPlugZ = st.pluggedIn ? 0.088 : 0.145;
    plugGroup.position.z = THREE.MathUtils.damp(plugGroup.position.z, targetPlugZ, 12, dt);
    if (!st.pluggedIn) {
      plugLedMat.color.setHex(0x475569);
      plugLedMat.emissiveIntensity = 0.0;
    } else if (st.pressureCutoutTripped) {
      plugLedMat.color.setHex(0xef4444);
      plugLedMat.emissive.setHex(0xdc2626);
      plugLedMat.emissiveIntensity = 0.95;
    } else {
      plugLedMat.color.setHex(0x22c55e);
      plugLedMat.emissive.setHex(0x16a34a);
      plugLedMat.emissiveIntensity = 0.9;
    }

    // 3-Position Push-Button bounce + stage indicator position
    stageBtnPressDecay = Math.max(0, stageBtnPressDecay - dt * 5.5);
    stagePushBtnCap.position.y = 0.021 - Math.sin(stageBtnPressDecay * Math.PI) * 0.011;

    const targetSliderX = (st.stage - 1) * 0.048;
    stageSliderGroup.position.x = THREE.MathUtils.damp(
      stageSliderGroup.position.x,
      targetSliderX,
      12,
      dt,
    );

    const targetPinY = st.pressureBar > 0.08 ? 0.025 : 0.011;
    safetyPinPiston.position.y = THREE.MathUtils.damp(
      safetyPinPiston.position.y,
      targetPinY,
      10,
      dt,
    );

    // Hotplate Red Activation Switch (illuminated only when ON & plugged in!)
    const energizedSwitch = st.heaterOn && st.pluggedIn && !st.pressureCutoutTripped;
    const targetRockerTilt = st.heaterOn ? -0.18 : 0.18;
    heaterRockerMesh.rotation.x = THREE.MathUtils.damp(
      heaterRockerMesh.rotation.x,
      targetRockerTilt,
      12,
      dt,
    );
    heaterRockerMat.color.setHex(energizedSwitch ? 0xdc2626 : st.heaterOn ? 0x7f1d1d : 0x3b1216);
    heaterRockerMat.emissiveIntensity = energizedSwitch ? 0.68 : 0.0;

    // Rotary D-Ring (0 up to 6, 270 deg clockwise rotation)
    const targetKnobAngle = -(st.heaterLevel / 6) * ((3 * Math.PI) / 2);
    heaterKnobGroup.rotation.z = THREE.MathUtils.damp(
      heaterKnobGroup.rotation.z,
      targetKnobAngle,
      11,
      dt,
    );

    const targetBurnerGlow = st.heaterPowerW > 0 ? (st.heaterLevel / 6) * 0.48 : 0.0;
    burnerGlowMat.emissiveIntensity = THREE.MathUtils.damp(
      burnerGlowMat.emissiveIntensity,
      targetBurnerGlow,
      3.5,
      dt,
    );

    // Calibrated Laboratory Steam Plume (density, jet speed, and expansion matched to steamVentRate)
    const ventRate = st.steamVentRate;
    for (let i = 0; i < steamPuffs.length; i++) {
      const puff = steamPuffs[i];
      if (ventRate <= 0.012) {
        puff.sprite.visible = false;
        puff.mat.opacity = 0;
        continue;
      }

      puff.sprite.visible = true;
      const jetVelocity = 0.55 + ventRate * 1.55;
      const age = (elapsedSec * jetVelocity + puff.phase) % 1.0;

      // Narrow fast jet right out of the vent nozzle, rising above gauges & billowing wider aloft
      const plumeHeight = 0.52 + ventRate * 1.32;
      const riseY = 0.64 + age * plumeHeight;
      const lateralSpread = Math.pow(age, 1.32) * (0.036 + ventRate * 0.13);
      const swirlX = ventX + Math.sin(elapsedSec * (3.4 + ventRate * 2.6) + i * 1.9) * lateralSpread;
      const swirlZ =
        ventZ + 0.035 + Math.cos(elapsedSec * (2.8 + ventRate * 2.2) + i * 2.3) * lateralSpread;

      puff.sprite.position.set(swirlX, riseY, swirlZ);
      const puffSize = 0.065 + age * (0.24 + ventRate * 0.36);
      puff.sprite.scale.set(puffSize, puffSize * (1.08 - age * 0.14), 1);

      const envelope = Math.pow(Math.sin(age * Math.PI), 0.72);
      puff.mat.opacity = envelope * Math.min(0.84, 0.24 + ventRate * 0.62);
    }
  };

  return {
    anchors,
    interactables: {
      tableTop: tableGroup,
      plugConnector: plugHitMesh,
      redSwitch: redSwitchHitMesh,
      rotaryDRing: dRingHitMesh,
      stagePushButton: stageHitMesh,
    },
    triggerStageButtonPress,
    update,
  };
}
