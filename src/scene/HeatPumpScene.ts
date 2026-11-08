import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { HeatPumpState, pressureToNeedleAngleRad } from '../simulation/thermodynamics';
import { PressureCookerState } from '../simulation/pressureCooker';
import { CalorimetryState } from '../simulation/calorimetry';
import { LabMinuteLogState } from '../simulation/minuteLogger';
import {
  MovementKeyInput,
  PlayerCameraState,
  applyMouseLookDelta,
  applyWheelZoom,
  createInitialPlayerCameraState,
  mapKeyCodeToMovementAction,
  stepPlayerCameraState,
} from '../simulation/playerMovement';
import { PressureCookerRig, buildPressureCookerStation } from './buildPressureCooker';
import { CalorimetryRig, buildCalorimetryStation } from './buildCalorimetryStation';
import { CardboardDisplaysRig, buildLaboratoryCardboardDisplays } from './cardboardDisplays';
import { TARSRig, buildTARS } from './TARSController';
import {
  DynamicThermometerUpdater,
  createDynamicThermometerDisplay,
} from './thermometerDisplay';
import {
  DualLedDisplayUpdater,
  ManometerDialUpdater,
  createCompressorPlateTexture,
  createContactShadowTexture,
  createDualLedDisplay,
  createDynamicManometerDial,
  createLabTableTexture,
  createMeterControlStripTexture,
  createThermometerStemTexture,
  createWhiteControlPanelTexture,
} from './textures';

export type ActiveStation = 'heatpump' | 'cooker' | 'calorimetry';
export type QualityLevel = 'low' | 'medium' | 'high';

export type SceneInteractiveAction =
  | { type: 'clickTable'; station: ActiveStation }
  | { type: 'toggleHeatPumpPower' }
  | { type: 'resetHeatPumpEnergy' }
  | { type: 'toggleMeterHold' }
  | { type: 'toggleMeterUnit' }
  | { type: 'cycleMeterRange' }
  | { type: 'cycleValveOpening' }
  | { type: 'toggleCookerPlug' }
  | { type: 'toggleCookerRedSwitch' }
  | { type: 'cycleCookerDRing' }
  | { type: 'cycleCookerStage' }
  | { type: 'cycleTARSMode' };

interface WaterSurfaceMeshData {
  mesh: THREE.Mesh;
  basePositions: Float32Array;
  phaseOffset: number;
}

const LAB_FLOOR_Y = -2.29;
const _ndcMouse = new THREE.Vector2(0, 0);
const _centerNdc = new THREE.Vector2(0, 0);

/**
 * Generates a clean ceramic laboratory floor tile texture (512 x 512).
 */
function createLabFloorTileTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#dde4ec';
  ctx.fillRect(0, 0, 512, 512);

  const half = 256;
  const tiles: Array<[number, number, string]> = [
    [0, 0, '#e3e9f0'],
    [half, 0, '#dde4ec'],
    [0, half, '#dbe2ea'],
    [half, half, '#e4eaf1'],
  ];
  for (const [tx, ty, col] of tiles) {
    ctx.fillStyle = col;
    ctx.fillRect(tx + 3, ty + 3, half - 6, half - 6);
  }

  // Subtle grout lines
  ctx.strokeStyle = '#b9c4d0';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(512, 2);
  ctx.moveTo(0, half);
  ctx.lineTo(512, half);
  ctx.moveTo(2, 0);
  ctx.lineTo(2, 512);
  ctx.moveTo(half, 0);
  ctx.lineTo(half, 512);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 14);
  tex.anisotropy = maxAniso;
  return tex;
}

/**
 * Detects CPU/software WebGL (SwiftShader, llvmpipe, Basic Render) strictly from the GPU renderer string.
 */
export function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class HeatPumpSceneController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private qualityLevel: QualityLevel = 'low';
  private keyLight?: THREE.DirectionalLight;

  // First-person desktop-only camera state (no body, no hands)
  private playerCam: PlayerCameraState;
  private moveKeys: MovementKeyInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };
  private isMouseDragging = false;
  private dragButton = -1;
  private pointerDownClientX = 0;
  private pointerDownClientY = 0;
  private pointerMovedDistPx = 0;
  private lastHoverCheckMs = 0;
  private lastHoverKind: 'control' | 'table' | null = null;

  private raycaster = new THREE.Raycaster();
  private controlHitTargets: THREE.Object3D[] = [];
  private tableHitTargets: THREE.Object3D[] = [];
  private occluderMeshes: THREE.Object3D[] = [];

  private ledDisplay: DualLedDisplayUpdater;
  private leftManometerDial!: ManometerDialUpdater;
  private rightManometerDial!: ManometerDialUpdater;
  private leftGaugeNeedle!: THREE.Object3D;
  private rightGaugeNeedle!: THREE.Object3D;
  private powerRockerMesh!: THREE.Mesh;
  private powerRockerMat!: THREE.MeshStandardMaterial;
  private meterRangeKnob!: THREE.Object3D;
  private meterUnitKnob!: THREE.Object3D;
  private expansionValveKnob!: THREE.Object3D;
  private thermometerDisplays: Array<{
    updater: DynamicThermometerUpdater;
    getTempC: (st: HeatPumpState) => number;
  }> = [];

  private waterSurfaces: WaterSurfaceMeshData[] = [];
  private cookerRig!: PressureCookerRig;
  private calorimetryRig!: CalorimetryRig;
  private cardboardRig!: CardboardDisplaysRig;
  private tarsRig!: TARSRig;

  private frameId = 0;
  private clock = new THREE.Clock();
  private disposed = false;

  private currentSimState: HeatPumpState;
  private currentCookerState: PressureCookerState;
  private currentCalorimetryState: CalorimetryState;
  private currentMinuteLog: LabMinuteLogState;

  private onStepSimulation: (dtRealSec: number) => {
    heatPump: HeatPumpState;
    cooker: PressureCookerState;
    calorimetry: CalorimetryState;
    minuteLog: LabMinuteLogState;
  };
  private onInteractAction: (action: SceneInteractiveAction) => void;
  private onHoverChange?: (kind: 'control' | 'table' | null) => void;
  private onPointerLockChange?: (locked: boolean) => void;

  private disposables: Array<{ dispose: () => void }> = [];

  constructor(options: {
    container: HTMLElement;
    initialState: HeatPumpState;
    initialCookerState: PressureCookerState;
    initialCalorimetryState: CalorimetryState;
    initialMinuteLog: LabMinuteLogState;
    onStepSimulation: (dtRealSec: number) => {
      heatPump: HeatPumpState;
      cooker: PressureCookerState;
      calorimetry: CalorimetryState;
      minuteLog: LabMinuteLogState;
    };
    onInteractAction: (action: SceneInteractiveAction) => void;
    onHoverChange?: (kind: 'control' | 'table' | null) => void;
    onPointerLockChange?: (locked: boolean) => void;
    initialQualityLevel?: QualityLevel;
  }) {
    this.container = options.container;
    this.currentSimState = options.initialState;
    this.currentCookerState = options.initialCookerState;
    this.currentCalorimetryState = options.initialCalorimetryState;
    this.currentMinuteLog = options.initialMinuteLog;
    this.onStepSimulation = options.onStepSimulation;
    this.onInteractAction = options.onInteractAction;
    this.onHoverChange = options.onHoverChange;
    this.onPointerLockChange = options.onPointerLockChange;
    this.qualityLevel = options.initialQualityLevel ?? 'low';

    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('data-testid', 'heat-pump-canvas');
    this.renderer.domElement.style.cursor = 'crosshair';
    this.container.appendChild(this.renderer.domElement);

    const bgHex = 0xdce8f4;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(bgHex);
    this.scene.fog = new THREE.FogExp2(bgHex, 0.0042);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = 0.65;
    pmremGenerator.dispose();
    this.disposables.push(envRT);

    this.playerCam = createInitialPlayerCameraState();
    this.camera = new THREE.PerspectiveCamera(this.playerCam.fov, width / height, 0.08, 95);
    this.camera.rotation.order = 'YXZ';
    this.applyPlayerCameraTransform();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.ledDisplay = createDualLedDisplay(maxAniso);
    this.disposables.push(this.ledDisplay);

    this.setupLighting();
    this.buildLaboratoryScene(maxAniso);

    this.updateAnimatedElements(0, 1.0);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindDesktopControls();
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    this.startLoop();
  }

  private track<T extends { dispose: () => void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  private setupLighting(): void {
    // Cool sky / warm benchtop HemisphereLight fill
    const hemiLight = new THREE.HemisphereLight(0xdff1ff, 0xc8cfd8, 0.95);
    hemiLight.position.set(5.5, 9, 0);
    this.scene.add(hemiLight);

    // Warm overhead studio laboratory key light covering Table 1, Table 2, and Table 3
    this.keyLight = new THREE.DirectionalLight(0xfff8ed, 1.65);
    this.keyLight.position.set(8.2, 10.5, 9.5);
    this.keyLight.target.position.set(6.0, 0.4, 3.5);
    this.scene.add(this.keyLight.target);
    this.keyLight.castShadow = !this.isSoftwareGl && this.qualityLevel !== 'low';
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 1.0;
    this.keyLight.shadow.camera.far = 65.0;
    this.keyLight.shadow.camera.left = -22.0;
    this.keyLight.shadow.camera.right = 28.0;
    this.keyLight.shadow.camera.top = 24.0;
    this.keyLight.shadow.camera.bottom = -24.0;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    // Soft left fill light so digital power meter and Qk bath never fall into harsh shadow
    const fillLight = new THREE.DirectionalLight(0xdceeff, 0.62);
    fillLight.position.set(-5.0, 3.8, 3.8);
    this.scene.add(fillLight);

    // Specular fill across Table 2 & Table 3 glassware, copper, and brushed metals
    const rightFill = new THREE.DirectionalLight(0xf0f7ff, 0.52);
    rightFill.position.set(14.5, 4.2, 4.8);
    this.scene.add(rightFill);

    // Subtle rim light from upper-back to separate instruments & glass cups against blue backdrop
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.45);
    rimLight.position.set(6.0, 5.2, -5.0);
    this.scene.add(rimLight);
  }

  private addContactShadow(
    shadowTex: THREE.CanvasTexture,
    x: number,
    z: number,
    scaleX: number,
    scaleZ: number,
    opacity = 0.48,
    rotY = 0,
  ): void {
    const geo = this.track(new THREE.PlaneGeometry(scaleX, scaleZ));
    const mat = this.track(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotY;
    mesh.position.set(x, 0.003, z);
    this.scene.add(mesh);
  }

  private registerControlTarget(obj: THREE.Object3D, action: SceneInteractiveAction): void {
    obj.userData.interactiveAction = action;
    this.controlHitTargets.push(obj);
  }

  private registerTableTarget(obj: THREE.Object3D, station: ActiveStation): void {
    obj.userData.interactiveAction = { type: 'clickTable', station } as SceneInteractiveAction;
    this.tableHitTargets.push(obj);
  }

  /**
   * Commemorative museum-grade portrait of Benoît Paul Émile Clapeyron (1799-1864) on back laboratory wall.
   */
  private buildClapeyronPortrait(
    parent: THREE.Group,
    posX: number,
    wallZ: number,
    maxAniso: number,
  ): void {
    const portraitGroup = new THREE.Group();
    // Center portrait at height y = 2.85m on the wall
    portraitGroup.position.set(posX, 2.85, wallZ + 0.05);

    // 1. Carved Dark Mahogany Picture Frame
    const frameW = 2.40;
    const frameH = 2.80;
    const frameDepth = 0.09;
    const frameMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x24160e,
        roughness: 0.42,
        metalness: 0.12,
      }),
    );
    const goldTrimMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 0.32,
        metalness: 0.88,
      }),
    );

    // Outer frame box
    const frameGeo = this.track(new THREE.BoxGeometry(frameW, frameH, frameDepth));
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.castShadow = true;
    portraitGroup.add(frameMesh);

    // Inner gold bevel rim
    const goldRimGeo = this.track(new THREE.BoxGeometry(frameW - 0.16, frameH - 0.16, frameDepth + 0.01));
    const goldRimMesh = new THREE.Mesh(goldRimGeo, goldTrimMat);
    portraitGroup.add(goldRimMesh);

    // 2. High-resolution canvas portrait of Benoît Paul Émile Clapeyron
    const canvasW = 1.95;
    const canvasH = 2.35;
    const texLoader = new THREE.TextureLoader();
    const portraitTex = this.track(texLoader.load('/assets/aistudio/image_4ec126fc.png'));
    portraitTex.colorSpace = THREE.SRGBColorSpace;
    portraitTex.anisotropy = maxAniso;

    const canvasGeo = this.track(new THREE.PlaneGeometry(canvasW, canvasH));
    const canvasMat = this.track(
      new THREE.MeshStandardMaterial({
        map: portraitTex,
        roughness: 0.65,
        metalness: 0.04,
      }),
    );
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    canvasMesh.position.set(0, 0, frameDepth * 0.5 + 0.008);
    portraitGroup.add(canvasMesh);

    // 3. Cast Commemorative Brass Plaque mounted below frame
    const plaqueW = 1.85;
    const plaqueH = 0.44;
    const plaqueCanvas = document.createElement('canvas');
    plaqueCanvas.width = 1024;
    plaqueCanvas.height = 256;
    const pCtx = plaqueCanvas.getContext('2d')!;

    // Brushed brass background
    pCtx.fillStyle = '#b48a3c';
    pCtx.fillRect(0, 0, 1024, 256);
    pCtx.fillStyle = '#cfad5b';
    pCtx.fillRect(10, 10, 1004, 236);

    // Inner bevel border
    pCtx.strokeStyle = '#6e5118';
    pCtx.lineWidth = 4;
    pCtx.strokeRect(16, 16, 992, 224);

    pCtx.fillStyle = '#1c1508';
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';
    pCtx.font = '800 32px "Plus Jakarta Sans", sans-serif';
    pCtx.fillText('BENOÎT PAUL ÉMILE CLAPEYRON (1799 – 1864)', 512, 60);

    pCtx.font = '600 22px "Plus Jakarta Sans", sans-serif';
    pCtx.fillStyle = '#2d210d';
    pCtx.fillText('Pionnier et fondateur de la thermodynamique moderne', 512, 114);

    pCtx.font = '700 20px "JetBrains Mono", monospace';
    pCtx.fillStyle = '#3a2b10';
    pCtx.fillText('Formalisation du Cycle de Carnot (1834) · Relation de Clapeyron : dP/dT = L / (T·Δv)', 512, 165);

    pCtx.font = '500 17px "Plus Jakarta Sans", sans-serif';
    pCtx.fillStyle = '#4c3917';
    pCtx.fillText('Ingénieur en chef des Mines & Membre de l’Académie des Sciences', 512, 210);

    const plaqueTex = this.track(new THREE.CanvasTexture(plaqueCanvas));
    plaqueTex.colorSpace = THREE.SRGBColorSpace;
    plaqueTex.anisotropy = maxAniso;

    const plaqueGeo = this.track(new THREE.BoxGeometry(plaqueW, plaqueH, 0.03));
    const plaqueMat = this.track(
      new THREE.MeshStandardMaterial({
        map: plaqueTex,
        roughness: 0.35,
        metalness: 0.75,
      }),
    );
    const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
    plaqueMesh.position.set(0, -(frameH * 0.5 + plaqueH * 0.5 + 0.08), 0.015);
    portraitGroup.add(plaqueMesh);

    // 4. Overhead Brass Gallery Picture Lamp
    const lampArmGeo = this.track(new THREE.CylinderGeometry(0.014, 0.014, 0.38, 12));
    const lampArm = new THREE.Mesh(lampArmGeo, goldTrimMat);
    lampArm.rotation.x = Math.PI * 0.35;
    lampArm.position.set(0, frameH * 0.5 + 0.12, 0.18);
    portraitGroup.add(lampArm);

    const lampShadeGeo = this.track(new THREE.CylinderGeometry(0.045, 0.045, 0.85, 16));
    lampShadeGeo.rotateZ(Math.PI / 2);
    const lampShade = new THREE.Mesh(lampShadeGeo, goldTrimMat);
    lampShade.position.set(0, frameH * 0.5 + 0.22, 0.32);
    portraitGroup.add(lampShade);

    // Warm gallery spotlight illuminating portrait
    const spotLight = new THREE.SpotLight(0xfff1d6, 2.8, 8.0, Math.PI * 0.35, 0.45, 1.2);
    spotLight.position.set(posX, 2.85 + frameH * 0.5 + 0.22, wallZ + 0.45);
    spotLight.target.position.set(posX, 2.85, wallZ + 0.05);
    this.scene.add(spotLight.target);
    this.scene.add(spotLight);

    parent.add(portraitGroup);
  }

  /**
   * Builds the enclosed walkable 3D laboratory room (vastly expanded hall with tiled floor,
   * blue rear studio lab wall, Clapeyron portrait, perimeter baseboards, and ceiling LED troffer array).
   */
  private buildLaboratoryRoom(maxAniso: number): void {
    const roomGroup = new THREE.Group();
    const minX = -18.0;
    const maxX = 26.0;
    const minZ = -12.0;
    const maxZ = 28.0;
    const roomW = maxX - minX; // 44.0
    const roomD = maxZ - minZ; // 40.0
    const centerX = (minX + maxX) * 0.5; // 4.0
    const centerZ = (minZ + maxZ) * 0.5; // 8.0
    const ceilY = 6.6;
    const wallH = ceilY - LAB_FLOOR_Y; // 8.89
    const wallMidY = (LAB_FLOOR_Y + ceilY) * 0.5;

    // 1. Tiled Ceramic Laboratory Floor at y = -2.29 (flush with table legs & cardboard easel legs)
    const floorTex = this.track(createLabFloorTileTexture(maxAniso));
    floorTex.repeat.set(44, 40);
    const floorGeo = this.track(new THREE.PlaneGeometry(roomW, roomD));
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: floorTex,
        roughness: 0.56,
        metalness: 0.04,
      }),
    );
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(centerX, LAB_FLOOR_Y, centerZ);
    floorMesh.receiveShadow = true;
    roomGroup.add(floorMesh);

    // 2. Ceiling Plane + Recessed Studio LED Light Troffers Array
    const ceilGeo = this.track(new THREE.PlaneGeometry(roomW, roomD));
    ceilGeo.rotateX(Math.PI / 2);
    const ceilMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        roughness: 0.85,
        metalness: 0.02,
      }),
    );
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
    ceilMesh.position.set(centerX, ceilY, centerZ);
    roomGroup.add(ceilMesh);

    const trofferFrameMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4, metalness: 0.5 }),
    );
    const trofferGlowMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: new THREE.Color(0xf0f7ff),
        emissiveIntensity: 0.9,
        roughness: 0.2,
      }),
    );
    const trofferFrameGeo = this.track(new THREE.BoxGeometry(2.4, 0.05, 0.72));
    const trofferPanelGeo = this.track(new THREE.PlaneGeometry(2.26, 0.58));
    trofferPanelGeo.rotateX(Math.PI / 2);

    for (const tx of [-12.0, -6.0, 0.0, 6.0, 12.0, 18.0, 22.0]) {
      for (const tz of [-7.0, -1.0, 5.0, 11.0, 17.0, 23.0]) {
        const tf = new THREE.Mesh(trofferFrameGeo, trofferFrameMat);
        tf.position.set(tx, ceilY - 0.025, tz);
        roomGroup.add(tf);
        const tp = new THREE.Mesh(trofferPanelGeo, trofferGlowMat);
        tp.position.set(tx, ceilY - 0.052, tz);
        roomGroup.add(tp);
      }
    }

    // 3. Perimeter Walls (Back wall in iconic laboratory sky-blue matching reference photos; side & front walls in soft lab off-white)
    const backWallMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x67b4e4,
        roughness: 0.74,
        metalness: 0.02,
      }),
    );
    const sideWallMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xe5ecf3,
        roughness: 0.78,
        metalness: 0.02,
      }),
    );

    const fbWallGeo = this.track(new THREE.PlaneGeometry(roomW, wallH));
    const backWall = new THREE.Mesh(fbWallGeo, backWallMat);
    backWall.position.set(centerX, wallMidY, minZ);
    backWall.receiveShadow = true;
    roomGroup.add(backWall);

    const frontWall = new THREE.Mesh(fbWallGeo, sideWallMat);
    frontWall.position.set(centerX, wallMidY, maxZ);
    frontWall.rotation.y = Math.PI;
    roomGroup.add(frontWall);

    const lrWallGeo = this.track(new THREE.PlaneGeometry(roomD, wallH));
    const leftWall = new THREE.Mesh(lrWallGeo, sideWallMat);
    leftWall.position.set(minX, wallMidY, centerZ);
    leftWall.rotation.y = Math.PI / 2;
    roomGroup.add(leftWall);

    const rightWall = new THREE.Mesh(lrWallGeo, sideWallMat);
    rightWall.position.set(maxX, wallMidY, centerZ);
    rightWall.rotation.y = -Math.PI / 2;
    roomGroup.add(rightWall);

    // 4. Commemorative Gilded Portrait of Benoît Paul Émile Clapeyron (1799–1864) on Back Wall
    this.buildClapeyronPortrait(roomGroup, 5.45, minZ, maxAniso);

    // Dark slate PVC baseboard plinths around the perimeter
    const plinthMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, metalness: 0.12 }),
    );
    const plinthH = 0.16;
    const fbPlinthGeo = this.track(new THREE.BoxGeometry(roomW, plinthH, 0.04));
    const lrPlinthGeo = this.track(new THREE.BoxGeometry(0.04, plinthH, roomD));

    const bPlinth = new THREE.Mesh(fbPlinthGeo, plinthMat);
    bPlinth.position.set(centerX, LAB_FLOOR_Y + plinthH * 0.5, minZ + 0.02);
    roomGroup.add(bPlinth);

    const fPlinth = new THREE.Mesh(fbPlinthGeo, plinthMat);
    fPlinth.position.set(centerX, LAB_FLOOR_Y + plinthH * 0.5, maxZ - 0.02);
    roomGroup.add(fPlinth);

    const lPlinth = new THREE.Mesh(lrPlinthGeo, plinthMat);
    lPlinth.position.set(minX + 0.02, LAB_FLOOR_Y + plinthH * 0.5, centerZ);
    roomGroup.add(lPlinth);

    const rPlinth = new THREE.Mesh(lrPlinthGeo, plinthMat);
    rPlinth.position.set(maxX - 0.02, LAB_FLOOR_Y + plinthH * 0.5, centerZ);
    roomGroup.add(rPlinth);

    this.scene.add(roomGroup);
  }

  private buildLaboratoryScene(maxAniso: number): void {
    const shadowTex = this.track(createContactShadowTexture());
    const thermStemTex = this.track(createThermometerStemTexture(maxAniso));

    // 0. Walkable 3D Laboratory Room Envelope
    this.buildLaboratoryRoom(maxAniso);

    // 1. Light gray laboratory table benchtop (Table 1, top surface at y = 0)
    this.buildLaboratoryTable(maxAniso);

    // 2. Far-left Digital Power / Energy Meter (x = -2.36, z = 0.46, angled toward viewer)
    this.buildDigitalPowerMeter(maxAniso);
    this.addContactShadow(shadowTex, -2.36, 0.46, 1.16, 0.84, 0.52, -0.38);

    // 3. Left Water Bath (Qk - cooling side) at x = -1.06, z = 0.14
    this.buildWaterBath(-1.06, 0.14, 'cold', 0.0, thermStemTex, maxAniso);
    this.addContactShadow(shadowTex, -1.06, 0.14, 1.22, 1.22, 0.55);

    // 4. Central Horizontal Black Compressor at x = 0.02, z = 0.12
    this.buildCentralCompressor(maxAniso);
    this.addContactShadow(shadowTex, 0.02, 0.12, 1.18, 0.90, 0.62);

    // 5. Right Water Bath (Qh - heating side) at x = +1.11, z = 0.14
    this.buildWaterBath(1.11, 0.14, 'hot', 1.9, thermStemTex, maxAniso);
    this.addContactShadow(shadowTex, 1.11, 0.14, 1.22, 1.22, 0.55);

    // 6. Elevated PHYWE Rectangular White Enclosure on Two Vertical Gray Stands + Pipes
    this.buildControlPanelAndStands(maxAniso);
    this.addContactShadow(shadowTex, -0.55, -0.08, 0.48, 0.88, 0.45);
    this.addContactShadow(shadowTex, 0.58, -0.08, 0.48, 0.88, 0.45);

    // 7. Table 2 + Laboratory Pressure Cooker Station + 3D Interactive Targets
    this.cookerRig = buildPressureCookerStation({
      scene: this.scene,
      maxAniso,
      shadowTex,
      track: (res) => this.track(res),
      addContactShadow: (tex, cx, cz, sx, sz, op, ry) =>
        this.addContactShadow(tex, cx, cz, sx, sz, op, ry),
    });
    this.registerTableTarget(this.cookerRig.interactables.tableTop, 'cooker');
    this.registerControlTarget(this.cookerRig.interactables.plugConnector, {
      type: 'toggleCookerPlug',
    });
    this.registerControlTarget(this.cookerRig.interactables.redSwitch, {
      type: 'toggleCookerRedSwitch',
    });
    this.registerControlTarget(this.cookerRig.interactables.rotaryDRing, {
      type: 'cycleCookerDRing',
    });
    this.registerControlTarget(this.cookerRig.interactables.stagePushButton, {
      type: 'cycleCookerStage',
    });

    // 8. Table 3 (Large Separate Table — completely untouched station) + Invisible Tabletop Click Proxy
    this.calorimetryRig = buildCalorimetryStation({
      scene: this.scene,
      maxAniso,
      shadowTex,
      thermStemTex,
      track: (res) => this.track(res),
      addContactShadow: (tex, cx, cz, sx, sz, op, ry) =>
        this.addContactShadow(tex, cx, cz, sx, sz, op, ry),
    });
    const table3ProxyGroup = new THREE.Group();
    const table3ProxyMat = this.track(
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    const table3ProxyGeo = this.track(new THREE.BoxGeometry(7.2, 0.16, 3.6));
    const table3ProxyMesh = new THREE.Mesh(table3ProxyGeo, table3ProxyMat);
    table3ProxyMesh.position.set(12.15, -0.075, 0.20);
    table3ProxyGroup.add(table3ProxyMesh);

    const table3FrontApronGeo = this.track(new THREE.BoxGeometry(6.8, 0.18, 0.16));
    const table3FrontApron = new THREE.Mesh(table3FrontApronGeo, table3ProxyMat);
    table3FrontApron.position.set(12.15, -0.16, 1.82);
    table3ProxyGroup.add(table3FrontApron);

    this.scene.add(table3ProxyGroup);
    this.registerTableTarget(table3ProxyGroup, 'calorimetry');

    // 9. Four Large Floor-Mounted Black Monitors (Screens 0, 1, 2, 3)
    this.cardboardRig = buildLaboratoryCardboardDisplays({
      scene: this.scene,
      maxAniso,
      floorY: LAB_FLOOR_Y,
      initialLog: this.currentMinuteLog,
      initialHp: this.currentSimState,
      initialCooker: this.currentCookerState,
      initialCal: this.currentCalorimetryState,
      track: (res) => this.track(res),
    });

    // 10. Autonomous Interstellar TARS Robot (roaming outer concourses, avoiding tables)
    this.tarsRig = buildTARS(this.scene, (res) => this.track(res), maxAniso);
    if (this.tarsRig.clickProxyMesh) {
      this.registerControlTarget(this.tarsRig.clickProxyMesh, { type: 'cycleTARSMode' });
    }
    for (const bar of this.tarsRig.bars) {
      this.registerControlTarget(bar.upperMesh, { type: 'cycleTARSMode' });
      this.registerControlTarget(bar.lowerMesh, { type: 'cycleTARSMode' });
    }
  }

  private buildLaboratoryTable(maxAniso: number): void {
    const tableGroup = new THREE.Group();

    const tableTex = this.track(createLabTableTexture(maxAniso));
    tableTex.repeat.set(6, 5);
    const table1X = -0.55;
    const table1W = 6.5;
    const topGeo = this.track(new THREE.BoxGeometry(table1W, 0.09, 3.4));
    const topMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tableTex,
        roughness: 0.62,
        metalness: 0.04,
      }),
    );
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.set(table1X, -0.045, 0.15);
    topMesh.receiveShadow = true;
    tableGroup.add(topMesh);

    // Dark gray laboratory PVC front edge trim strip
    const edgeGeo = this.track(new THREE.BoxGeometry(table1W + 0.02, 0.092, 0.03));
    const edgeMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x3b424c,
        roughness: 0.45,
        metalness: 0.12,
      }),
    );
    const frontEdge = new THREE.Mesh(edgeGeo, edgeMat);
    frontEdge.position.set(table1X, -0.045, 1.85);
    tableGroup.add(frontEdge);

    // Under-frame steel apron & legs
    const frameMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x67707c,
        roughness: 0.45,
        metalness: 0.65,
      }),
    );
    const apronGeo = this.track(new THREE.BoxGeometry(table1W - 0.6, 0.12, 0.08));
    const frontApron = new THREE.Mesh(apronGeo, frameMat);
    frontApron.position.set(table1X, -0.15, 1.62);
    tableGroup.add(frontApron);

    const legGeo = this.track(new THREE.BoxGeometry(0.11, 2.2, 0.11));
    for (const lx of [table1X - 2.9, table1X + 2.9]) {
      for (const lz of [-1.2, 1.6]) {
        const leg = new THREE.Mesh(legGeo, frameMat);
        leg.position.set(lx, -1.19, lz);
        tableGroup.add(leg);
      }
    }

    this.registerTableTarget(tableGroup, 'heatpump');
    this.scene.add(tableGroup);
  }

  /**
   * 1. Digital power/energy meter (far left on the table, slightly angled toward viewer)
   * Interactive 3D rotary knobs (RANGE, Wh/kJ) and push buttons (START, RESET, HOLD).
   */
  private buildDigitalPowerMeter(maxAniso: number): void {
    const meterGroup = new THREE.Group();
    meterGroup.position.set(-2.36, 0.0, 0.46);
    meterGroup.rotation.y = 0.36;

    const caseMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xebeff4,
        roughness: 0.44,
        metalness: 0.05,
      }),
    );
    const darkTrimMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x2a3038,
        roughness: 0.68,
        metalness: 0.15,
      }),
    );
    const invisibleHitMat = this.track(
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );

    const profile = new THREE.Shape();
    profile.moveTo(-0.24, 0.02);
    profile.lineTo(0.24, 0.02);
    profile.lineTo(0.19, 0.52);
    profile.lineTo(-0.24, 0.56);
    profile.closePath();

    const bodyGeo = this.track(
      new THREE.ExtrudeGeometry(profile, {
        depth: 0.84,
        bevelEnabled: true,
        bevelThickness: 0.018,
        bevelSize: 0.015,
        bevelSegments: 3,
      }),
    );
    bodyGeo.translate(0, 0, -0.42);
    bodyGeo.rotateY(-Math.PI / 2);

    const bodyMesh = new THREE.Mesh(bodyGeo, caseMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    meterGroup.add(bodyMesh);
    this.occluderMeshes.push(bodyMesh);

    const footGeo = this.track(new THREE.CylinderGeometry(0.032, 0.036, 0.022, 16));
    for (const fx of [-0.35, 0.35]) {
      for (const fz of [-0.18, 0.18]) {
        const foot = new THREE.Mesh(footGeo, darkTrimMat);
        foot.position.set(fx, 0.011, fz);
        meterGroup.add(foot);
      }
    }

    const frontSlope = Math.atan2(0.05, 0.5);
    const facePanelGroup = new THREE.Group();
    facePanelGroup.position.set(0, 0.28, 0.226);
    facePanelGroup.rotation.x = -frontSlope;
    meterGroup.add(facePanelGroup);

    const bezelGeo = this.track(new THREE.BoxGeometry(0.78, 0.46, 0.016));
    const bezelMesh = new THREE.Mesh(bezelGeo, darkTrimMat);
    facePanelGroup.add(bezelMesh);

    const ledGeo = this.track(new THREE.PlaneGeometry(0.74, 0.25));
    const ledMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: this.ledDisplay.texture,
        emissive: new THREE.Color(0xffffff),
        emissiveMap: this.ledDisplay.emissiveTexture,
        emissiveIntensity: 1.35,
        roughness: 0.16,
        metalness: 0.08,
      }),
    );
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(0, 0.09, 0.01);
    facePanelGroup.add(ledMesh);

    const stripTex = this.track(createMeterControlStripTexture(maxAniso));
    const stripGeo = this.track(new THREE.PlaneGeometry(0.74, 0.18));
    const stripMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: stripTex,
        roughness: 0.5,
        metalness: 0.05,
      }),
    );
    const stripMesh = new THREE.Mesh(stripGeo, stripMat);
    stripMesh.position.set(0, -0.13, 0.01);
    facePanelGroup.add(stripMesh);

    // Two Interactive 3D Rotary Selector Knobs (RANGE W & GATE / Wh-kJ)
    const knobBaseGeo = this.track(new THREE.CylinderGeometry(0.036, 0.04, 0.028, 24));
    knobBaseGeo.rotateX(Math.PI / 2);
    const knobCapGeo = this.track(new THREE.CylinderGeometry(0.028, 0.032, 0.018, 24));
    knobCapGeo.rotateX(Math.PI / 2);
    const pointerGeo = this.track(new THREE.BoxGeometry(0.007, 0.026, 0.008));

    const knobMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x333942, roughness: 0.34, metalness: 0.25 }),
    );
    const whitePtrMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 }),
    );
    const knobHitGeo = this.track(new THREE.BoxGeometry(0.11, 0.12, 0.08));

    const knobSpecs: Array<{
      x: number;
      rot: number;
      action: SceneInteractiveAction;
      isRange: boolean;
    }> = [
      { x: -0.215, rot: 0.0, action: { type: 'cycleMeterRange' }, isRange: true },
      { x: -0.028, rot: -0.35, action: { type: 'toggleMeterUnit' }, isRange: false },
    ];
    for (const kp of knobSpecs) {
      const kGroup = new THREE.Group();
      kGroup.position.set(kp.x, -0.14, 0.022);
      kGroup.rotation.z = kp.rot;
      kGroup.add(new THREE.Mesh(knobBaseGeo, knobMat));
      const cap = new THREE.Mesh(knobCapGeo, darkTrimMat);
      cap.position.z = 0.018;
      kGroup.add(cap);
      const ptr = new THREE.Mesh(pointerGeo, whitePtrMat);
      ptr.position.set(0, 0.012, 0.027);
      kGroup.add(ptr);
      facePanelGroup.add(kGroup);

      if (kp.isRange) this.meterRangeKnob = kGroup;
      else this.meterUnitKnob = kGroup;

      const kHit = new THREE.Mesh(knobHitGeo, invisibleHitMat);
      kHit.position.set(kp.x, -0.14, 0.035);
      facePanelGroup.add(kHit);
      this.registerControlTarget(kHit, kp.action);
    }

    // Three Interactive Push Buttons below displays (START green, RESET red, HOLD gray)
    const btnGeo = this.track(new THREE.CylinderGeometry(0.018, 0.019, 0.024, 18));
    btnGeo.rotateX(Math.PI / 2);
    const btnHitGeo = this.track(new THREE.BoxGeometry(0.072, 0.095, 0.075));
    const btnSpecs: Array<{ x: number; color: number; action: SceneInteractiveAction }> = [
      { x: 0.138, color: 0x16a34a, action: { type: 'toggleHeatPumpPower' } },
      { x: 0.222, color: 0xdc2626, action: { type: 'resetHeatPumpEnergy' } },
      { x: 0.303, color: 0x64748b, action: { type: 'toggleMeterHold' } },
    ];
    for (const bs of btnSpecs) {
      const bMat = this.track(
        new THREE.MeshStandardMaterial({ color: bs.color, roughness: 0.32, metalness: 0.1 }),
      );
      const btn = new THREE.Mesh(btnGeo, bMat);
      btn.position.set(bs.x, -0.145, 0.018);
      facePanelGroup.add(btn);

      const bHit = new THREE.Mesh(btnHitGeo, invisibleHitMat);
      bHit.position.set(bs.x, -0.145, 0.032);
      facePanelGroup.add(bHit);
      this.registerControlTarget(bHit, bs.action);
    }

    const cordMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x6b7280,
        roughness: 0.58,
        metalness: 0.1,
      }),
    );
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.73, 1.57, -0.02),
      new THREE.Vector3(-1.92, 1.44, -0.04),
      new THREE.Vector3(-2.12, 0.86, 0.06),
      new THREE.Vector3(-2.22, 0.18, 0.22),
    ]);
    const cordGeo = this.track(new THREE.TubeGeometry(cordCurve, 28, 0.013, 8, false));
    const cordMesh = new THREE.Mesh(cordGeo, cordMat);
    cordMesh.castShadow = true;
    this.scene.add(cordMesh);

    const compCordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.06, 0.08, 0.24),
      new THREE.Vector3(-1.62, 0.02, -0.16),
      new THREE.Vector3(-0.85, 0.02, -0.22),
      new THREE.Vector3(-0.33, 0.22, -0.04),
    ]);
    const compCordGeo = this.track(new THREE.TubeGeometry(compCordCurve, 24, 0.012, 8, false));
    const compCordMesh = new THREE.Mesh(compCordGeo, darkTrimMat);
    this.scene.add(compCordMesh);

    this.scene.add(meterGroup);
  }

  /**
   * 2 & 4. Left Water Bath (Qk) and Right Water Bath (Qh)
   * Cream-white enameled cylindrical vessel with turquoise/teal interior lining & rolled upper rim,
   * clear rippling water surface, submerged coil, bottom-front black drain valve,
   * rear vertical slotted stainless-steel mounting bracket, two metal coil pipes descending from
   * the enclosure with brazed angled metal thermowell sleeves, and THREE graduated glass stem
   * thermometers (two outer thermometers seated in the metal sleeves NOT touching water, and one
   * central thermometer dipping into the water — matching reference image_f4dd3459.png).
   */
  private buildWaterBath(
    x: number,
    z: number,
    side: 'cold' | 'hot',
    wavePhase: number,
    thermStemTex: THREE.CanvasTexture,
    maxAniso: number,
  ): void {
    const bathGroup = new THREE.Group();
    bathGroup.position.set(x, 0.0, z);

    // 1a. Outer cream-white enameled cylindrical cup shell (y = 0 .. 0.94)
    const outerPts = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.435, 0.0),
      new THREE.Vector2(0.446, 0.035),
      new THREE.Vector2(0.438, 0.075),
      new THREE.Vector2(0.442, 0.94),
      new THREE.Vector2(0.422, 0.94),
    ];
    const outerGeo = this.track(new THREE.LatheGeometry(outerPts, 48));
    const outerMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xf1eee6, // Authentic warm laboratory enamel cream-white exterior
        roughness: 0.34,
        metalness: 0.04,
      }),
    );
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.castShadow = true;
    outerMesh.receiveShadow = true;
    bathGroup.add(outerMesh);

    // 1b. Turquoise / Teal Inner Enameled Lining & Rolled Upper Rim (matching image_f4dd3459.png)
    const innerRimPts = [
      new THREE.Vector2(0.0, 0.08),
      new THREE.Vector2(0.398, 0.08),
      new THREE.Vector2(0.404, 0.935),
      new THREE.Vector2(0.422, 0.972),
      new THREE.Vector2(0.456, 0.975),
      new THREE.Vector2(0.464, 0.948),
      new THREE.Vector2(0.442, 0.928),
    ];
    const innerRimGeo = this.track(new THREE.LatheGeometry(innerRimPts, 48));
    const turquoiseMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x17a5aa, // Signature PHYWE turquoise/teal interior & rolled lip
        roughness: 0.24,
        metalness: 0.08,
        side: THREE.DoubleSide,
      }),
    );
    const innerRimMesh = new THREE.Mesh(innerRimGeo, turquoiseMat);
    innerRimMesh.castShadow = true;
    innerRimMesh.receiveShadow = true;
    bathGroup.add(innerRimMesh);

    // Front turquoise bucket lug + thin stainless wire bail handle (visible on front of cup in image_f4dd3459.png)
    const lugGeo = this.track(new THREE.BoxGeometry(0.068, 0.074, 0.022));
    const frontLug = new THREE.Mesh(lugGeo, turquoiseMat);
    frontLug.position.set(0.03, 0.875, 0.446);
    bathGroup.add(frontLug);

    const silverMetalMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xd4dbe3,
        roughness: 0.20,
        metalness: 0.88,
      }),
    );

    const bailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.03, 0.875, 0.456),
      new THREE.Vector3(0.16, 0.78, 0.52),
      new THREE.Vector3(0.34, 0.65, 0.44),
      new THREE.Vector3(0.448, 0.875, 0.0),
    ]);
    const bailGeo = this.track(new THREE.TubeGeometry(bailCurve, 20, 0.0055, 8, false));
    bathGroup.add(new THREE.Mesh(bailGeo, silverMetalMat));

    // 2. Submerged Heat-Exchanger Coil inside the cup
    const coilPoints: THREE.Vector3[] = [];
    const turns = 4.5;
    const samples = 80;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const ang = t * turns * Math.PI * 2;
      const r = 0.295;
      coilPoints.push(new THREE.Vector3(Math.cos(ang) * r, 0.16 + t * 0.56, Math.sin(ang) * r));
    }
    const coilCurve = new THREE.CatmullRomCurve3(coilPoints);
    const coilGeo = this.track(new THREE.TubeGeometry(coilCurve, 80, 0.015, 10, false));
    bathGroup.add(new THREE.Mesh(coilGeo, silverMetalMat));

    // 3. Clear Water Surface inside the bath (at y = 0.82, well below the rim & pipe sleeves)
    const waterY = 0.82;
    const waterGeo = this.track(new THREE.PlaneGeometry(0.79, 0.79, 22, 22));
    waterGeo.rotateX(-Math.PI / 2);
    const posAttr = waterGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const dist = Math.hypot(vx, vz);
      if (dist > 0.396) {
        const scale = 0.396 / dist;
        posAttr.setX(i, vx * scale);
        posAttr.setZ(i, vz * scale);
      }
    }
    waterGeo.computeVertexNormals();

    const waterMat = this.track(
      new THREE.MeshPhysicalMaterial({
        color: side === 'cold' ? 0xd8f3fa : 0xe4f5f9,
        roughness: 0.07,
        metalness: 0.02,
        transmission: this.isSoftwareGl ? 0 : 0.86,
        transparent: true,
        opacity: this.isSoftwareGl ? 0.44 : 0.9,
        ior: 1.333,
        thickness: 0.6,
        attenuationColor: new THREE.Color(0xcff0f8),
        attenuationDistance: 1.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.06,
        depthWrite: false,
      }),
    );
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = waterY;
    waterMesh.renderOrder = 3;
    bathGroup.add(waterMesh);

    const meniscusGeo = this.track(new THREE.TorusGeometry(0.396, 0.0055, 10, 48));
    meniscusGeo.rotateX(Math.PI / 2);
    const meniscusMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xb6eaf4,
        roughness: 0.12,
        metalness: 0.05,
        transparent: true,
        opacity: 0.62,
      }),
    );
    const meniscus = new THREE.Mesh(meniscusGeo, meniscusMat);
    meniscus.position.y = waterY + 0.003;
    bathGroup.add(meniscus);

    this.waterSurfaces.push({
      mesh: waterMesh,
      basePositions: new Float32Array(posAttr.array as Float32Array),
      phaseOffset: wavePhase,
    });

    // 4. Small Black Drain Valve near the bottom front (z = +0.44, y = 0.14)
    const valveGroup = new THREE.Group();
    valveGroup.position.set(0, 0.14, 0.438);
    const blackPartMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x181b20,
        roughness: 0.38,
        metalness: 0.22,
      }),
    );
    const collarGeo = this.track(new THREE.CylinderGeometry(0.034, 0.034, 0.024, 6));
    collarGeo.rotateX(Math.PI / 2);
    valveGroup.add(new THREE.Mesh(collarGeo, blackPartMat));

    const stemGeo = this.track(new THREE.CylinderGeometry(0.019, 0.019, 0.072, 16));
    stemGeo.rotateX(Math.PI / 2);
    const stem = new THREE.Mesh(stemGeo, blackPartMat);
    stem.position.z = 0.036;
    valveGroup.add(stem);

    const spoutGeo = this.track(new THREE.CylinderGeometry(0.012, 0.009, 0.045, 14));
    const spout = new THREE.Mesh(spoutGeo, blackPartMat);
    spout.position.set(0, -0.02, 0.06);
    spout.rotation.x = 0.25;
    valveGroup.add(spout);

    const handleGeo = this.track(new THREE.BoxGeometry(0.064, 0.011, 0.016));
    const handle = new THREE.Mesh(handleGeo, blackPartMat);
    handle.position.set(0, 0.026, 0.042);
    valveGroup.add(handle);
    bathGroup.add(valveGroup);

    // 5. Rear Vertical Slotted Stainless-Steel Mounting Bracket & Black Hanger Block (matching image_f4dd3459.png)
    const hangerBlockGeo = this.track(new THREE.BoxGeometry(0.115, 0.34, 0.055));
    const hangerBlock = new THREE.Mesh(hangerBlockGeo, blackPartMat);
    hangerBlock.position.set(-0.02, 1.30, -0.22);
    bathGroup.add(hangerBlock);

    const brushedBracketMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xbec6cf,
        roughness: 0.32,
        metalness: 0.82,
      }),
    );
    const bracketBarGeo = this.track(new THREE.BoxGeometry(0.088, 0.56, 0.014));
    const bracketBar = new THREE.Mesh(bracketBarGeo, brushedBracketMat);
    bracketBar.position.set(-0.02, 1.08, -0.185);
    bracketBar.castShadow = true;
    bathGroup.add(bracketBar);

    // Two dark vertical adjustment slots + hex bolts on the stainless bracket
    const slotGeo = this.track(new THREE.BoxGeometry(0.018, 0.062, 0.016));
    const boltGeo = this.track(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 6));
    boltGeo.rotateX(Math.PI / 2);
    for (const by of [1.14, 1.27]) {
      const slot = new THREE.Mesh(slotGeo, blackPartMat);
      slot.position.set(-0.02, by - 0.012, -0.184);
      bathGroup.add(slot);

      const bolt = new THREE.Mesh(boltGeo, silverMetalMat);
      bolt.position.set(-0.02, by + 0.008, -0.175);
      bathGroup.add(bolt);
    }

    // 6. Two Nickel-Plated Metal Coil Pipes + Brazed Angled Metal Thermowell Sleeves + 3 Glass Stem Thermometers
    // Exact pipe X offsets so left & right pipes align vertically with the schematic lines above each cup:
    const leftPipeLocalX = side === 'cold' ? -0.314 : -0.292;
    const rightPipeLocalX = side === 'cold' ? 0.323 : 0.292;
    const pipeLocalZ = -0.02;

    const buildCoilRiserPipe = (px: number) => {
      const sign = Math.sign(px);
      const riserCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(px, 1.47, pipeLocalZ),
        new THREE.Vector3(px, 1.16, pipeLocalZ + 0.01),
        new THREE.Vector3(px + sign * 0.018, 1.02, pipeLocalZ + 0.02),
        new THREE.Vector3(px, 0.88, pipeLocalZ + 0.02),
        new THREE.Vector3(px * 0.92, 0.72, pipeLocalZ + 0.02),
      ]);
      const riserGeo = this.track(new THREE.TubeGeometry(riserCurve, 28, 0.0155, 10, false));
      const riserMesh = new THREE.Mesh(riserGeo, silverMetalMat);
      riserMesh.castShadow = true;
      bathGroup.add(riserMesh);
    };

    buildCoilRiserPipe(leftPipeLocalX);
    buildCoilRiserPipe(rightPipeLocalX);

    // Helper to build a non-interfering graduated laboratory thermometer with readable °C scale plate
    // and live variable liquid column (`createDynamicThermometerDisplay`).
    const thermGlassMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: thermStemTex,
        roughness: 0.14,
        metalness: 0.06,
      }),
    );
    const bulbMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.18,
        metalness: 0.85,
      }),
    );
    const liquidTipMat = this.track(
      new THREE.MeshStandardMaterial({
        color: side === 'cold' ? 0x0284c7 : 0xdc2626,
        roughness: 0.2,
        metalness: 0.1,
      }),
    );

    const createReadableThermometer = (
      stemLength: number,
      showLowerBulb: boolean,
      sensorTag: string,
      minC: number,
      maxC: number,
      getTempC: (st: HeatPumpState) => number,
    ): THREE.Group => {
      const tGroup = new THREE.Group();

      const dynScale = this.track(
        createDynamicThermometerDisplay({
          sensorTag,
          minC,
          maxC,
          liquidColor: side === 'cold' ? 'blue' : 'red',
          maxAnisotropy: maxAniso,
          initialTempC: getTempC(this.currentSimState),
        }),
      );
      this.thermometerDisplays.push({ updater: dynScale, getTempC });

      // Brushed metal scale backing plate + front readable °C scale face
      const scaleW = 0.132;
      const backPlateGeo = this.track(new THREE.BoxGeometry(scaleW + 0.006, stemLength, 0.005));
      const backPlate = new THREE.Mesh(backPlateGeo, brushedBracketMat);
      backPlate.position.set(0, stemLength * 0.5, 0.009);
      backPlate.castShadow = true;
      tGroup.add(backPlate);

      const scaleFaceGeo = this.track(new THREE.PlaneGeometry(scaleW, stemLength - 0.004));
      const scaleFaceMat = this.track(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: dynScale.texture,
          roughness: 0.28,
          metalness: 0.02,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      const scaleFace = new THREE.Mesh(scaleFaceGeo, scaleFaceMat);
      scaleFace.position.set(0, stemLength * 0.5, 0.0125);
      tGroup.add(scaleFace);

      // Glass capillary stem behind/integrated with scale housing
      const stemCylGeo = this.track(new THREE.CylinderGeometry(0.0085, 0.0085, stemLength + 0.016, 14));
      const stemCyl = new THREE.Mesh(stemCylGeo, thermGlassMat);
      stemCyl.position.set(0, stemLength * 0.5, 0.0);
      tGroup.add(stemCyl);

      const topCapGeo = this.track(new THREE.SphereGeometry(0.009, 12, 10));
      const topCap = new THREE.Mesh(topCapGeo, thermGlassMat);
      topCap.position.set(0, stemLength + 0.008, 0.0);
      tGroup.add(topCap);

      if (showLowerBulb) {
        const neckGeo = this.track(new THREE.CylinderGeometry(0.0065, 0.0065, 0.04, 12));
        const neck = new THREE.Mesh(neckGeo, bulbMat);
        neck.position.y = -0.02;
        tGroup.add(neck);

        const sensBulbGeo = this.track(new THREE.CylinderGeometry(0.0085, 0.0085, 0.045, 12));
        const sensBulb = new THREE.Mesh(sensBulbGeo, liquidTipMat);
        sensBulb.position.y = -0.055;
        tGroup.add(sensBulb);
      }

      return tGroup;
    };

    // Angled cylindrical metal thermowell sleeves attached to the metal pipes above cup rim (y = 0.985),
    // with shortened stems (0.29 m) and forward tilt so top sits at y ≈ 1.31 m (15 cm clear below cabinet y = 1.46!)
    const sleeveOuterGeo = this.track(new THREE.CylinderGeometry(0.020, 0.019, 0.125, 18));
    const sleeveLipGeo = this.track(new THREE.TorusGeometry(0.0195, 0.0032, 10, 20));
    sleeveLipGeo.rotateX(Math.PI / 2);

    const addPipeSleeveThermometer = (
      pipeX: number,
      tiltZRad: number,
      sensorTag: string,
      minC: number,
      maxC: number,
      getTempC: (st: HeatPumpState) => number,
    ) => {
      const mountPivot = new THREE.Group();
      mountPivot.position.set(pipeX + Math.sign(pipeX) * 0.022, 0.985, pipeLocalZ + 0.036);
      mountPivot.rotation.z = tiltZRad;
      mountPivot.rotation.x = 0.24;

      const sleeveMesh = new THREE.Mesh(sleeveOuterGeo, silverMetalMat);
      sleeveMesh.position.y = 0.062;
      sleeveMesh.castShadow = true;
      mountPivot.add(sleeveMesh);

      const sleeveLip = new THREE.Mesh(sleeveLipGeo, blackPartMat);
      sleeveLip.position.y = 0.125;
      mountPivot.add(sleeveLip);

      const weldBridgeGeo = this.track(new THREE.BoxGeometry(0.028, 0.042, 0.022));
      const weldBridge = new THREE.Mesh(weldBridgeGeo, silverMetalMat);
      weldBridge.position.set(-Math.sign(pipeX) * 0.014, 0.032, -0.012);
      mountPivot.add(weldBridge);

      const therm = createReadableThermometer(0.29, false, sensorTag, minC, maxC, getTempC);
      therm.position.y = 0.085;
      mountPivot.add(therm);

      bathGroup.add(mountPivot);
    };

    if (side === 'cold') {
      // Cold Circuit Water Measurements (Cahier de TP):
      // Left sleeve: Tee (Température d'Entrée d'Eau à l'évaporateur)
      addPipeSleeveThermometer(leftPipeLocalX, 0.39, 'Tee · Entrée', -5, 45, (s) => s.tempWaterInletEvapC);
      // Right sleeve: Tse (Température de Sortie d'Eau de l'évaporateur)
      addPipeSleeveThermometer(rightPipeLocalX, -0.39, 'Tse · Sortie', -5, 45, (s) => s.tempWaterOutletEvapC);

      const centerThermGroup = new THREE.Group();
      centerThermGroup.position.set(0.045, 0.62, 0.04);
      centerThermGroup.rotation.z = -0.045;
      centerThermGroup.add(
        createReadableThermometer(0.52, true, 'Tk · Bac Qk', -5, 45, (s) => s.tempColdC),
      );
      bathGroup.add(centerThermGroup);
    } else {
      // Hot Circuit Water Measurements (Cahier de TP):
      // Left sleeve: Tec (Température d'Entrée d'Eau au condenseur)
      addPipeSleeveThermometer(leftPipeLocalX, 0.39, 'Tec · Entrée', 0, 70, (s) => s.tempWaterInletCondC);
      // Right sleeve: Tsc (Température de Sortie d'Eau du condenseur)
      addPipeSleeveThermometer(
        rightPipeLocalX,
        -0.39,
        'Tsc · Sortie',
        0,
        70,
        (s) => s.tempWaterOutletCondC,
      );

      const centerThermGroup = new THREE.Group();
      centerThermGroup.position.set(0.045, 0.62, 0.04);
      centerThermGroup.rotation.z = -0.045;
      centerThermGroup.add(
        createReadableThermometer(0.52, true, 'Th · Bac Qh', 0, 70, (s) => s.tempHotC),
      );
      bathGroup.add(centerThermGroup);
    }

    const clipArmGeo = this.track(new THREE.BoxGeometry(0.075, 0.012, 0.195));
    const clipArm = new THREE.Mesh(clipArmGeo, brushedBracketMat);
    clipArm.position.set(0.012, 0.87, -0.085);
    bathGroup.add(clipArm);

    this.scene.add(bathGroup);
  }

  /**
   * 3. Central Black Compressor (horizontal black cylindrical unit on table between the two baths)
   * Composite 9-part THREE.Group with front brand/model plate and pipes rising to the panel above.
   */
  private buildCentralCompressor(maxAniso: number): void {
    const compGroup = new THREE.Group();
    compGroup.position.set(0.02, 0.0, 0.12);

    const blackEnamelMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x16191f,
        roughness: 0.26,
        metalness: 0.48,
      }),
    );
    const matteSteelMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x252a32,
        roughness: 0.58,
        metalness: 0.55,
      }),
    );
    const rubberMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x101215,
        roughness: 0.88,
        metalness: 0.05,
      }),
    );

    // 4 rubber vibration-damping feet + stamped steel base plate
    const footGeo = this.track(new THREE.CylinderGeometry(0.042, 0.048, 0.04, 16));
    for (const fx of [-0.28, 0.28]) {
      for (const fz of [-0.19, 0.19]) {
        const foot = new THREE.Mesh(footGeo, rubberMat);
        foot.position.set(fx, 0.02, fz);
        compGroup.add(foot);
      }
    }

    const basePlateGeo = this.track(new THREE.BoxGeometry(0.68, 0.028, 0.46));
    const basePlate = new THREE.Mesh(basePlateGeo, matteSteelMat);
    basePlate.position.y = 0.052;
    basePlate.castShadow = true;
    basePlate.receiveShadow = true;
    compGroup.add(basePlate);

    // Two curved saddle brackets cradling the horizontal cylinder
    const saddleGeo = this.track(new THREE.BoxGeometry(0.07, 0.14, 0.34));
    for (const sx of [-0.21, 0.21]) {
      const saddle = new THREE.Mesh(saddleGeo, matteSteelMat);
      saddle.position.set(sx, 0.12, 0);
      compGroup.add(saddle);
    }

    // Main horizontal black cylindrical compressor shell (along X axis)
    const cylRadius = 0.275;
    const cylLength = 0.58;
    const cylCenterY = 0.375;

    const shellGeo = this.track(new THREE.CylinderGeometry(cylRadius, cylRadius, cylLength, 40));
    shellGeo.rotateZ(Math.PI / 2);
    const shellMesh = new THREE.Mesh(shellGeo, blackEnamelMat);
    shellMesh.position.y = cylCenterY;
    shellMesh.castShadow = true;
    shellMesh.receiveShadow = true;
    compGroup.add(shellMesh);

    // Left and right rounded hermetic end domes
    const domeGeo = this.track(
      new THREE.SphereGeometry(cylRadius, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5),
    );
    const leftDome = new THREE.Mesh(domeGeo, blackEnamelMat);
    leftDome.rotation.z = Math.PI / 2;
    leftDome.scale.set(1, 0.45, 1);
    leftDome.position.set(-cylLength * 0.5, cylCenterY, 0);
    leftDome.castShadow = true;
    compGroup.add(leftDome);

    const rightDome = new THREE.Mesh(domeGeo, blackEnamelMat);
    rightDome.rotation.z = -Math.PI / 2;
    rightDome.scale.set(1, 0.45, 1);
    rightDome.position.set(cylLength * 0.5, cylCenterY, 0);
    rightDome.castShadow = true;
    compGroup.add(rightDome);

    // Circumferential hermetic weld seam ring
    const weldGeo = this.track(new THREE.TorusGeometry(cylRadius + 0.005, 0.011, 12, 40));
    weldGeo.rotateY(Math.PI / 2);
    const weldRing = new THREE.Mesh(weldGeo, matteSteelMat);
    weldRing.position.set(0.08, cylCenterY, 0);
    compGroup.add(weldRing);

    // Electrical starter terminal box on left shoulder
    const termGeo = this.track(new THREE.BoxGeometry(0.16, 0.16, 0.15));
    const termBox = new THREE.Mesh(termGeo, rubberMat);
    termBox.position.set(-0.34, cylCenterY + 0.02, -0.06);
    compGroup.add(termBox);

    // Front Brand / Model Plate Sticker bent cleanly around the horizontal cylinder (+Z front face)
    const plateTex = this.track(createCompressorPlateTexture(maxAniso));
    const plateW = 0.36;
    const plateArc = 0.66; // radians vertically around cylinder
    const plateGeo = this.track(new THREE.PlaneGeometry(plateW, cylRadius * plateArc, 1, 18));
    const pPos = plateGeo.attributes.position as THREE.BufferAttribute;
    const rSticker = cylRadius + 0.004;
    for (let i = 0; i < pPos.count; i++) {
      const origY = pPos.getY(i);
      const theta = origY / cylRadius; // +theta = upper shoulder, -theta = lower front
      pPos.setY(i, Math.sin(theta) * rSticker);
      pPos.setZ(i, Math.cos(theta) * rSticker);
    }
    plateGeo.computeVertexNormals();

    const plateMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: plateTex,
        roughness: 0.3,
        metalness: 0.14,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.set(0.0, cylCenterY + 0.02, 0);
    compGroup.add(plateMesh);

    this.scene.add(compGroup);
  }

  /**
   * 5. Elevated PHYWE Rectangular Sheet-Metal Enclosure on Two Vertical Gray Metal Stands
   * Matches reference image_e25d96bb.png: sleek horizontal cabinet proportions (3.44 x 0.98 x 0.42),
   * illuminated green power rocker switch + knurled thumbscrews on the left side wall,
   * authentic PHYWE Wärmepumpe schematic drawing, 8 perimeter silver screws, 2 machined brass
   * sight glasses, and 2 compact polished-chrome Bourdon manometers.
   */
  private buildControlPanelAndStands(maxAniso: number): void {
    const standMetalMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x6f7883,
        roughness: 0.36,
        metalness: 0.72,
      }),
    );
    const darkStandCapMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x22262e,
        roughness: 0.62,
        metalness: 0.2,
      }),
    );

    // Two Vertical Square Gray Metal Frame Columns supporting the underside of the white box (y = 0 .. 1.46)
    const footBaseGeo = this.track(new THREE.BoxGeometry(0.12, 0.045, 0.76));
    const footPadGeo = this.track(new THREE.BoxGeometry(0.125, 0.048, 0.035));
    const columnGeo = this.track(new THREE.BoxGeometry(0.068, 1.46, 0.068));

    for (const sx of [-0.55, 0.58]) {
      const standGroup = new THREE.Group();
      standGroup.position.set(sx, 0.0, -0.06);

      const footBase = new THREE.Mesh(footBaseGeo, standMetalMat);
      footBase.position.y = 0.0225;
      footBase.castShadow = true;
      footBase.receiveShadow = true;
      standGroup.add(footBase);

      for (const ez of [-0.38, 0.38]) {
        const cap = new THREE.Mesh(footPadGeo, darkStandCapMat);
        cap.position.set(0, 0.024, ez);
        standGroup.add(cap);
      }

      const col = new THREE.Mesh(columnGeo, standMetalMat);
      col.position.y = 0.73;
      col.castShadow = true;
      col.receiveShadow = true;
      standGroup.add(col);

      this.scene.add(standGroup);
    }

    // Sleek Rectangular 3D White Sheet-Metal Enclosure (W = 3.44, H = 0.98, D = 0.42)
    // Bottom at y = 1.46, Top at y = 2.44, Left side wall at x = -1.72, Front at z = +0.26
    const panelW = 3.44;
    const panelH = 0.98;
    const panelD = 0.42;
    const panelCenterY = 1.95;
    const panelCenterZ = 0.05;

    const panelGroup = new THREE.Group();
    panelGroup.position.set(0, panelCenterY, panelCenterZ);

    const whiteCabinetMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xf1f4f8,
        roughness: 0.34,
        metalness: 0.08,
      }),
    );
    const panelTex = this.track(createWhiteControlPanelTexture(maxAniso));
    const frontSchematicMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: panelTex,
        roughness: 0.3,
        metalness: 0.04,
      }),
    );

    // 6-sided BoxGeometry: [+X right, -X left, +Y top, -Y bottom, +Z front schematic, -Z back]
    const cabinetGeo = this.track(new THREE.BoxGeometry(panelW, panelH, panelD));
    const cabinetMesh = new THREE.Mesh(cabinetGeo, [
      whiteCabinetMat,
      whiteCabinetMat,
      whiteCabinetMat,
      whiteCabinetMat,
      frontSchematicMat,
      whiteCabinetMat,
    ]);
    cabinetMesh.castShadow = true;
    cabinetMesh.receiveShadow = true;
    panelGroup.add(cabinetMesh);
    this.occluderMeshes.push(cabinetMesh);

    const invisibleHitMat = this.track(
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );

    // Subtle folded sheet-metal lower lip along the left & right side walls
    const sideFlangeGeo = this.track(new THREE.BoxGeometry(0.012, 0.028, panelD * 0.96));
    const leftFlange = new THREE.Mesh(sideFlangeGeo, whiteCabinetMat);
    leftFlange.position.set(-panelW * 0.5 - 0.004, -panelH * 0.5 + 0.014, 0);
    panelGroup.add(leftFlange);

    // --- LEFT SIDE WALL HARDWARE (x = -panelW * 0.5 = -1.72, facing -X) ---
    // 1) Clickable Illuminated Green Power Rocker Switch on the left side wall
    const switchGroup = new THREE.Group();
    switchGroup.position.set(-panelW * 0.5, 0.11, 0.05);

    const switchBezelMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.35,
        metalness: 0.05,
      }),
    );
    const switchBezelGeo = this.track(new THREE.BoxGeometry(0.022, 0.155, 0.105));
    const switchBezel = new THREE.Mesh(switchBezelGeo, switchBezelMat);
    switchBezel.position.x = -0.011;
    switchGroup.add(switchBezel);

    const switchRecessGeo = this.track(new THREE.BoxGeometry(0.018, 0.125, 0.076));
    const switchRecess = new THREE.Mesh(switchRecessGeo, darkStandCapMat);
    switchRecess.position.x = -0.015;
    switchGroup.add(switchRecess);

    this.powerRockerMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x16a34a,
        emissive: new THREE.Color(0x12c952),
        emissiveIntensity: 0.95,
        roughness: 0.2,
        metalness: 0.06,
      }),
    );
    const rockerGeo = this.track(new THREE.BoxGeometry(0.044, 0.118, 0.072));
    this.powerRockerMesh = new THREE.Mesh(rockerGeo, this.powerRockerMat);
    this.powerRockerMesh.position.x = -0.026;
    this.powerRockerMesh.rotation.z = 0.18;
    switchGroup.add(this.powerRockerMesh);

    const greenSwitchHitGeo = this.track(new THREE.BoxGeometry(0.11, 0.22, 0.16));
    const greenSwitchHitMesh = new THREE.Mesh(greenSwitchHitGeo, invisibleHitMat);
    greenSwitchHitMesh.position.x = -0.035;
    switchGroup.add(greenSwitchHitMesh);
    this.registerControlTarget(greenSwitchHitMesh, { type: 'toggleHeatPumpPower' });

    panelGroup.add(switchGroup);

    // 2) Two Silver Knurled Side-Panel Thumbscrews on the left rear edge
    const chromeMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xe6edf5,
        roughness: 0.15,
        metalness: 0.92,
      }),
    );
    const thumbShaftGeo = this.track(new THREE.CylinderGeometry(0.012, 0.012, 0.026, 16));
    thumbShaftGeo.rotateZ(Math.PI / 2);
    const thumbHeadGeo = this.track(new THREE.CylinderGeometry(0.025, 0.025, 0.022, 20));
    thumbHeadGeo.rotateZ(Math.PI / 2);

    for (const ty of [0.31, -0.29]) {
      const tsGroup = new THREE.Group();
      tsGroup.position.set(-panelW * 0.5, ty, -0.11);
      const shaft = new THREE.Mesh(thumbShaftGeo, chromeMat);
      shaft.position.x = -0.013;
      tsGroup.add(shaft);
      const head = new THREE.Mesh(thumbHeadGeo, chromeMat);
      head.position.x = -0.032;
      tsGroup.add(head);
      panelGroup.add(tsGroup);
    }

    const grommetGeo = this.track(new THREE.CylinderGeometry(0.022, 0.026, 0.032, 16));
    grommetGeo.rotateZ(Math.PI / 2);
    const grommet = new THREE.Mesh(grommetGeo, darkStandCapMat);
    grommet.position.set(-panelW * 0.5 - 0.014, -0.38, -0.07);
    panelGroup.add(grommet);

    // --- FRONT FACE HARDWARE (z = +panelD * 0.5 = +0.21) ---
    const frontZ = panelD * 0.5;

    const screwGeo = this.track(
      new THREE.SphereGeometry(0.011, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    );
    screwGeo.rotateX(Math.PI / 2);
    const screwCoords: Array<[number, number]> = [
      [-1.56, 0.28],
      [-1.56, -0.39],
      [-0.36, 0.40],
      [-0.36, -0.40],
      [0.56, 0.40],
      [0.56, -0.40],
      [1.58, 0.30],
      [1.58, -0.39],
    ];
    for (const [sx, sy] of screwCoords) {
      const screw = new THREE.Mesh(screwGeo, chromeMat);
      screw.position.set(sx, sy, frontZ + 0.001);
      panelGroup.add(screw);
    }

    // Two Readable Dynamic Bourdon Manometers (with bar + R134a °C scales & live digital bar window)
    this.leftGaugeNeedle = this.createManometerAssembly(
      panelGroup,
      -1.041,
      0.029,
      frontZ,
      chromeMat,
      'low',
      maxAniso,
    );
    this.rightGaugeNeedle = this.createManometerAssembly(
      panelGroup,
      1.119,
      0.049,
      frontZ,
      chromeMat,
      'high',
      maxAniso,
    );

    const brassMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xd5ac46,
        roughness: 0.24,
        metalness: 0.86,
      }),
    );

    // Clickable Expansion Valve (Throttle) Handwheel Knob at the bowtie symbol on the front schematic
    const valveKnobGroup = new THREE.Group();
    valveKnobGroup.position.set(-1.375, -0.248, frontZ + 0.012);
    const vStemGeo = this.track(new THREE.CylinderGeometry(0.018, 0.020, 0.022, 20));
    vStemGeo.rotateX(Math.PI / 2);
    valveKnobGroup.add(new THREE.Mesh(vStemGeo, brassMat));
    const vWheelGeo = this.track(new THREE.CylinderGeometry(0.036, 0.036, 0.016, 24));
    vWheelGeo.rotateX(Math.PI / 2);
    const vWheel = new THREE.Mesh(vWheelGeo, darkStandCapMat);
    vWheel.position.z = 0.015;
    valveKnobGroup.add(vWheel);
    const vBarGeo = this.track(new THREE.BoxGeometry(0.056, 0.010, 0.008));
    const vBar = new THREE.Mesh(vBarGeo, chromeMat);
    vBar.position.z = 0.025;
    valveKnobGroup.add(vBar);
    this.expansionValveKnob = valveKnobGroup;
    panelGroup.add(valveKnobGroup);

    const valveHitGeo = this.track(new THREE.BoxGeometry(0.14, 0.16, 0.09));
    const valveHitMesh = new THREE.Mesh(valveHitGeo, invisibleHitMat);
    valveHitMesh.position.set(-1.375, -0.248, frontZ + 0.025);
    panelGroup.add(valveHitMesh);
    this.registerControlTarget(valveHitMesh, { type: 'cycleValveOpening' });

    // Two 3D Machined Brass Sight Glasses
    const sightGlassWindowMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xd9f2df,
        roughness: 0.08,
        metalness: 0.1,
      }),
    );
    const sightDotMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x22a854,
        roughness: 0.25,
      }),
    );

    const sightRimGeo = this.track(new THREE.CylinderGeometry(0.052, 0.055, 0.018, 28));
    sightRimGeo.rotateX(Math.PI / 2);
    const sightWinGeo = this.track(new THREE.CircleGeometry(0.032, 24));
    const sightDotGeo = this.track(new THREE.CircleGeometry(0.009, 16));

    const sightCoords: Array<[number, number]> = [
      [-0.737, -0.188],
      [1.401, -0.160],
    ];
    for (const [sgx, sgy] of sightCoords) {
      const sgGroup = new THREE.Group();
      sgGroup.position.set(sgx, sgy, frontZ);

      const brassBody = new THREE.Mesh(sightRimGeo, brassMat);
      brassBody.position.z = 0.009;
      brassBody.castShadow = true;
      sgGroup.add(brassBody);

      const win = new THREE.Mesh(sightWinGeo, sightGlassWindowMat);
      win.position.z = 0.019;
      sgGroup.add(win);

      const dot = new THREE.Mesh(sightDotGeo, sightDotMat);
      dot.position.z = 0.020;
      sgGroup.add(dot);

      panelGroup.add(sgGroup);
    }

    this.scene.add(panelGroup);
    this.buildRefrigerantPiping(brassMat);
  }

  private createManometerAssembly(
    parent: THREE.Group,
    localX: number,
    localY: number,
    frontZ: number,
    chromeMat: THREE.MeshStandardMaterial,
    type: 'low' | 'high',
    maxAniso: number,
  ): THREE.Object3D {
    const gaugeGroup = new THREE.Group();
    gaugeGroup.position.set(localX, localY, frontZ);

    const gaugeRadius = 0.148;

    const housingGeo = this.track(new THREE.CylinderGeometry(gaugeRadius, gaugeRadius, 0.042, 40));
    housingGeo.rotateX(Math.PI / 2);
    const housing = new THREE.Mesh(housingGeo, chromeMat);
    housing.position.z = 0.021;
    housing.castShadow = true;
    gaugeGroup.add(housing);

    const rimGeo = this.track(new THREE.TorusGeometry(gaugeRadius - 0.005, 0.012, 16, 44));
    const rim = new THREE.Mesh(rimGeo, chromeMat);
    rim.position.z = 0.042;
    gaugeGroup.add(rim);

    const initialBar =
      type === 'low' ? this.currentSimState.lowPressureBar : this.currentSimState.highPressureBar;
    const dynDial = this.track(createDynamicManometerDial(type, maxAniso, initialBar));
    if (type === 'low') this.leftManometerDial = dynDial;
    else this.rightManometerDial = dynDial;

    const dialGeo = this.track(new THREE.CircleGeometry(gaugeRadius - 0.011, 40));
    const dialMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: dynDial.texture,
        roughness: 0.3,
        metalness: 0.02,
      }),
    );
    const dial = new THREE.Mesh(dialGeo, dialMat);
    dial.position.z = 0.043;
    gaugeGroup.add(dial);

    const needlePivot = new THREE.Group();
    needlePivot.position.z = 0.047;

    const needleMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x111418,
        roughness: 0.3,
        metalness: 0.5,
      }),
    );
    const pointerShape = new THREE.Shape();
    pointerShape.moveTo(-0.028, -0.006);
    pointerShape.lineTo(0.106, -0.0018);
    pointerShape.lineTo(0.106, 0.0018);
    pointerShape.lineTo(-0.028, 0.006);
    pointerShape.closePath();

    const pointerGeo = this.track(new THREE.ShapeGeometry(pointerShape));
    const pointerMesh = new THREE.Mesh(pointerGeo, needleMat);
    needlePivot.add(pointerMesh);

    const pinGeo = this.track(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 16));
    pinGeo.rotateX(Math.PI / 2);
    needlePivot.add(new THREE.Mesh(pinGeo, needleMat));

    gaugeGroup.add(needlePivot);

    const glassGeo = this.track(new THREE.CircleGeometry(gaugeRadius - 0.008, 36));
    const glassMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.14,
        roughness: 0.05,
        metalness: 0.1,
        depthWrite: false,
      }),
    );
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.z = 0.053;
    glass.renderOrder = 4;
    gaugeGroup.add(glass);

    parent.add(gaugeGroup);
    return needlePivot;
  }

  private buildRefrigerantPiping(brassMat: THREE.MeshStandardMaterial): void {
    const copperMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xc87646,
        roughness: 0.24,
        metalness: 0.85,
      }),
    );
    const insulationMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x1e2229,
        roughness: 0.72,
        metalness: 0.08,
      }),
    );

    const addPipe = (
      pts: THREE.Vector3[],
      radius: number,
      mat: THREE.Material,
      withFittingAtStart = false,
    ) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = this.track(new THREE.TubeGeometry(curve, 28, radius, 10, false));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      this.scene.add(mesh);

      if (withFittingAtStart) {
        const nutGeo = this.track(
          new THREE.CylinderGeometry(radius * 1.75, radius * 1.75, 0.04, 6),
        );
        const nut = new THREE.Mesh(nutGeo, brassMat);
        nut.position.copy(pts[0]);
        this.scene.add(nut);
      }
    };

    addPipe(
      [
        new THREE.Vector3(-0.14, 0.65, 0.10),
        new THREE.Vector3(-0.20, 0.98, 0.06),
        new THREE.Vector3(-0.19, 1.28, 0.03),
        new THREE.Vector3(-0.19, 1.48, 0.02),
      ],
      0.019,
      insulationMat,
      true,
    );

    addPipe(
      [
        new THREE.Vector3(0.20, 0.65, 0.10),
        new THREE.Vector3(0.24, 0.98, 0.06),
        new THREE.Vector3(0.22, 1.28, 0.03),
        new THREE.Vector3(0.22, 1.48, 0.02),
      ],
      0.015,
      copperMat,
      true,
    );
  }

  public syncExternalState(state: HeatPumpState): void {
    this.currentSimState = state;
  }

  public syncExternalCookerState(state: PressureCookerState): void {
    this.currentCookerState = state;
  }

  public syncExternalCalorimetryState(state: CalorimetryState): void {
    this.currentCalorimetryState = state;
  }

  public syncExternalMinuteLog(log: LabMinuteLogState): void {
    this.currentMinuteLog = log;
  }

  public triggerCookerStageBounce(): void {
    this.cookerRig?.triggerStageButtonPress();
  }

  public exitPointerLockIfActive(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      try {
        document.exitPointerLock?.();
      } catch {
        // Ignore if pointer lock is inactive
      }
    }
  }

  private applyPlayerCameraTransform(): void {
    this.camera.position.set(this.playerCam.x, this.playerCam.y, this.playerCam.z);
    this.camera.rotation.y = this.playerCam.yaw;
    this.camera.rotation.x = this.playerCam.pitch;
    this.camera.rotation.z = 0;
    if (Math.abs(this.camera.fov - this.playerCam.fov) > 0.01) {
      this.camera.fov = this.playerCam.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private bindDesktopControls(): void {
    const canvas = this.renderer.domElement;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.handleContextMenu);
    (window as unknown as { __setCamera?: (x: number, y: number, z: number, yaw: number, pitch: number) => void }).__setCamera = (x, y, z, yaw, pitch) => {
      this.playerCam.x = x;
      this.playerCam.y = y;
      this.playerCam.z = z;
      this.playerCam.yaw = yaw;
      this.playerCam.pitch = pitch;
      this.applyPlayerCameraTransform();
    };
    (window as unknown as { __sceneController?: HeatPumpSceneController }).__sceneController = this;
  }

  private unbindDesktopControls(): void {
    const canvas = this.renderer.domElement;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    canvas.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    canvas.removeEventListener('wheel', this.handleWheel);
    canvas.removeEventListener('contextmenu', this.handleContextMenu);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'KeyG' || e.code === 'KeyT') {
      this.cycleTARSMode();
      return;
    }
    const action = mapKeyCodeToMovementAction(e.code);
    if (action) {
      this.moveKeys[action] = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const action = mapKeyCodeToMovementAction(e.code);
    if (action) {
      this.moveKeys[action] = false;
    }
  };

  private handleWindowBlur = (): void => {
    this.moveKeys.forward = false;
    this.moveKeys.backward = false;
    this.moveKeys.left = false;
    this.moveKeys.right = false;
    this.moveKeys.sprint = false;
    this.isMouseDragging = false;
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.playerCam = applyWheelZoom(this.playerCam, e.deltaY);
  };

  private updateMouseNdc(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _ndcMouse.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    _ndcMouse.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  }

  private resolveInteractiveAction(obj: THREE.Object3D | null): SceneInteractiveAction | undefined {
    let cur: THREE.Object3D | null = obj;
    while (cur) {
      if (cur.userData.interactiveAction) {
        return cur.userData.interactiveAction as SceneInteractiveAction;
      }
      cur = cur.parent;
    }
    return undefined;
  }

  private pickActionAt(ndc: THREE.Vector2): {
    kind: 'control' | 'table';
    action: SceneInteractiveAction;
  } | null {
    this.raycaster.setFromCamera(ndc, this.camera);

    const occHits = this.raycaster.intersectObjects(this.occluderMeshes, false);
    const nearestOccDist = occHits.length > 0 ? occHits[0].distance : Infinity;

    const ctrlHits = this.raycaster.intersectObjects(this.controlHitTargets, true);
    for (const hit of ctrlHits) {
      if (hit.distance < 12.5 && hit.distance <= nearestOccDist + 0.08) {
        const act = this.resolveInteractiveAction(hit.object);
        if (act) return { kind: 'control', action: act };
      }
    }

    const tblHits = this.raycaster.intersectObjects(this.tableHitTargets, true);
    if (tblHits.length > 0 && tblHits[0].distance < 16.5) {
      const act = this.resolveInteractiveAction(tblHits[0].object);
      if (act) return { kind: 'table', action: act };
    }

    return null;
  }

  public requestPointerLock(): void {
    const canvas = this.renderer.domElement;
    if (document.pointerLockElement === canvas) return;
    try {
      const maybePromise = canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
    } catch {
      // Ignore in restricted environments
    }
  }

  private handlePointerLockChange = (): void => {
    const isLocked = document.pointerLockElement === this.renderer.domElement;
    this.renderer.domElement.style.cursor = isLocked ? 'none' : 'crosshair';
    this.onPointerLockChange?.(isLocked);
    if (isLocked) {
      _ndcMouse.set(0, 0);
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    // Strictly desktop computer + mouse only (ignore phone/touch input)
    if (e.pointerType === 'touch') return;
    if (e.button !== 0 && e.button !== 2) return;

    const canvas = this.renderer.domElement;
    const isLocked = document.pointerLockElement === canvas;

    // Like Valorant / PC games: clicking the game view enters FPS mouse capture!
    this.isMouseDragging = true;
    this.dragButton = e.button;

    if (!isLocked) {
      this.updateMouseNdc(e.clientX, e.clientY);
      const clickedTarget = this.pickActionAt(_ndcMouse);
      if (clickedTarget) {
        if (clickedTarget.action.type === 'cycleCookerStage') {
          this.cookerRig.triggerStageButtonPress();
        }
        this.onInteractAction(clickedTarget.action);
        return;
      }
      this.requestPointerLock();
      return;
    }

    // When locked: left-click acts like weapon/interact key right at center dot!
    if (e.button === 0) {
      const picked = this.pickActionAt(_centerNdc);
      if (picked) {
        if (picked.action.type === 'cycleCookerStage') {
          this.cookerRig.triggerStageButtonPress();
        }
        if (picked.action.type === 'clickTable') {
          this.exitPointerLockIfActive();
        }
        this.onInteractAction(picked.action);
      }
    }
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    const canvas = this.renderer.domElement;
    const isLocked = document.pointerLockElement === canvas;

    if (isLocked || (this.isMouseDragging && (this.dragButton === 0 || this.dragButton === 2))) {
      // FPS Mouse Look: mouse movement directly controls camera smoothly (no need to hold any button)
      this.playerCam = applyMouseLookDelta(this.playerCam, e.movementX, e.movementY);
      _ndcMouse.set(0, 0);
    } else {
      this.updateMouseNdc(e.clientX, e.clientY);
    }

    // Throttled hover check (<= 20 Hz)
    const now = performance.now();
    if (now - this.lastHoverCheckMs >= 50) {
      this.lastHoverCheckMs = now;
      const rayCoords = isLocked ? _centerNdc : _ndcMouse;
      const picked = this.pickActionAt(rayCoords);
      const nextKind = picked ? picked.kind : null;
      if (!isLocked) {
        canvas.style.cursor = nextKind ? 'pointer' : 'crosshair';
      }
      if (nextKind !== this.lastHoverKind) {
        this.lastHoverKind = nextKind;
        this.onHoverChange?.(nextKind);
      }
    }
  };

  private handlePointerUp = (_e: PointerEvent): void => {
    this.isMouseDragging = false;
    this.dragButton = -1;
  };

  private updateAnimatedElements(elapsedSec: number, dt: number): void {
    const st = this.currentSimState;

    // 1. Update Dual Red 7-Segment LED Displays (W & Wh/kJ + HOLD state)
    const shownPower = st.meterHold ? st.heldPowerW : st.electricalPowerW;
    const shownEnergy = st.meterHold ? st.heldEnergyWh : st.energyWh;
    this.ledDisplay.updateValues(shownPower, shownEnergy, st.isRunning, st.meterUnit, st.meterHold);

    // Rotary knobs on Digital Power/Energy Meter + Qe Expansion Valve Handwheel
    const targetRangeRot = (1 - st.meterRangeIndex) * 0.52;
    this.meterRangeKnob.rotation.z = THREE.MathUtils.damp(
      this.meterRangeKnob.rotation.z,
      targetRangeRot,
      11,
      dt,
    );
    const targetUnitRot = st.meterUnit === 'Wh' ? -0.32 : -0.82;
    this.meterUnitKnob.rotation.z = THREE.MathUtils.damp(
      this.meterUnitKnob.rotation.z,
      targetUnitRot,
      11,
      dt,
    );
    const targetValveRot = (st.valveOpening - 0.7) * 3.2;
    this.expansionValveKnob.rotation.z = THREE.MathUtils.damp(
      this.expansionValveKnob.rotation.z,
      targetValveRot,
      10,
      dt,
    );

    // 2. Readable Live Dynamic Manometers + Oscillating Needles
    this.leftManometerDial.updatePressure(st.lowPressureBar);
    this.rightManometerDial.updatePressure(st.highPressureBar);

    const targetLeftAngle = pressureToNeedleAngleRad(
      st.lowPressureBar,
      10,
      elapsedSec,
      st.isRunning,
    );
    const targetRightAngle = pressureToNeedleAngleRad(
      st.highPressureBar,
      25,
      elapsedSec + 0.9,
      st.isRunning,
    );

    this.leftGaugeNeedle.rotation.z = THREE.MathUtils.damp(
      this.leftGaugeNeedle.rotation.z,
      targetLeftAngle,
      9,
      dt,
    );
    this.rightGaugeNeedle.rotation.z = THREE.MathUtils.damp(
      this.rightGaugeNeedle.rotation.z,
      targetRightAngle,
      9,
      dt,
    );

    // 3. All 6 Readable Live Thermometers on Table 1
    for (const td of this.thermometerDisplays) {
      td.updater.updateTemperature(td.getTempC(st));
    }

    // 4. Left-Side Illuminated Green Power Rocker Button State
    const targetRockerAngle = st.isRunning ? 0.18 : -0.18;
    this.powerRockerMesh.rotation.z = THREE.MathUtils.damp(
      this.powerRockerMesh.rotation.z,
      targetRockerAngle,
      10,
      dt,
    );
    this.powerRockerMat.emissiveIntensity = st.isRunning ? 0.95 : 0.12;

    // 5. Gentle Water Surface Ripples in Both Baths (Skipped on Low to eliminate CPU overhead)
    if (this.qualityLevel !== 'low') {
      const amp = st.isRunning ? 0.005 : 0.0016;
      for (const ws of this.waterSurfaces) {
        const pos = ws.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const base = ws.basePositions;
        const t = elapsedSec * 2.3 + ws.phaseOffset;

        for (let i = 0; i < pos.count; i++) {
          const bx = base[i * 3];
          const bz = base[i * 3 + 2];
          const r = Math.hypot(bx, bz);
          const edgeFade = Math.max(0, 1 - Math.pow(r / 0.396, 3));
          const ripple =
            (Math.sin(r * 19.0 - t * 1.6) * 0.6 +
              Math.cos(bx * 12.0 + bz * 10.0 + t * 1.15) * 0.4) *
            amp *
            edgeFade;
          pos.setY(i, ripple);
        }
        pos.needsUpdate = true;
      }
    }

    // 6. Update Table 2 Pressure Cooker, Table 3 Calorimetry, and 3 Black Floor Monitors
    this.cookerRig.update(this.currentCookerState, elapsedSec, dt);
    this.calorimetryRig.update(this.currentCalorimetryState, elapsedSec, dt);
    this.cardboardRig.update(this.currentMinuteLog, st, this.currentCookerState, this.currentCalorimetryState);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const rawDt = this.clock.getDelta();
      const moveDt = Math.min(rawDt, 0.1);
      const simDt = Math.min(rawDt, 0.5);
      const elapsed = this.clock.elapsedTime;

      this.playerCam = stepPlayerCameraState(this.playerCam, this.moveKeys, moveDt);
      this.applyPlayerCameraTransform();

      const stepped = this.onStepSimulation(simDt);
      this.currentSimState = stepped.heatPump;
      this.currentCookerState = stepped.cooker;
      this.currentCalorimetryState = stepped.calorimetry;
      this.currentMinuteLog = stepped.minuteLog;
      this.updateAnimatedElements(elapsed, moveDt);
      if (this.tarsRig) {
        this.tarsRig.update(moveDt, elapsed);
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = window.requestAnimationFrame(tick);
      }
    };

    tick();
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.setQualityLevel(this.qualityLevel);
    this.renderer.render(this.scene, this.camera);
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
  };

  public dispose(): void {
    this.disposed = true;
    window.cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.unbindDesktopControls();
    this.exitPointerLockIfActive();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    if (this.tarsRig) {
      this.tarsRig.dispose();
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  public cycleTARSMode(): void {
    if (this.tarsRig) {
      this.tarsRig.cycleMode();
    }
  }

  public isTARSAwake(): boolean {
    return this.tarsRig?.stateData?.isAwake ?? false;
  }

  public setQualityLevel(level: QualityLevel): void {
    this.qualityLevel = level;
    switch (level) {
      case 'low':
        // Lightweight performance mode: 0.75x DPR, shadows completely disabled (0 shadow pass)
        this.renderer.setPixelRatio(0.75);
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.autoUpdate = false;
        if (this.keyLight) {
          this.keyLight.castShadow = false;
        }
        break;
      case 'medium':
        // Balanced standard mode: 1.0x-1.15x DPR, 1024 PCF shadows
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio * 0.85, 1.15));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.shadowMap.autoUpdate = true;
        if (this.keyLight) {
          this.keyLight.castShadow = true;
          this.keyLight.shadow.mapSize.set(1024, 1024);
        }
        break;
      case 'high':
        // Crisp fidelity mode: capped at 1.4x DPR (eliminates 4K fillrate bottleneck on laptops)
        this.renderer.setPixelRatio(this.isSoftwareGl ? 1.0 : Math.min(window.devicePixelRatio, 1.4));
        this.renderer.shadowMap.enabled = !this.isSoftwareGl;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.shadowMap.autoUpdate = true;
        if (this.keyLight) {
          this.keyLight.castShadow = !this.isSoftwareGl;
          this.keyLight.shadow.mapSize.set(1536, 1536);
        }
        break;
    }
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height);
  }

  public getQualityLevel(): QualityLevel {
    return this.qualityLevel;
  }
}
