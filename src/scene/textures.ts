import * as THREE from 'three';

/**
 * Draws a crisp 7-segment digit at (x, y) with width w and height h.
 */
function drawSevenSegmentDigit(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  w: number,
  h: number,
  activeColor: string,
  dimColor: string,
) {
  const segMap: Record<string, number[]> = {
    '0': [1, 1, 1, 1, 1, 1, 0],
    '1': [0, 1, 1, 0, 0, 0, 0],
    '2': [1, 1, 0, 1, 1, 0, 1],
    '3': [1, 1, 1, 1, 0, 0, 1],
    '4': [0, 1, 1, 0, 0, 1, 1],
    '5': [1, 0, 1, 1, 0, 1, 1],
    '6': [1, 0, 1, 1, 1, 1, 1],
    '7': [1, 1, 1, 0, 0, 0, 0],
    '8': [1, 1, 1, 1, 1, 1, 1],
    '9': [1, 1, 1, 1, 0, 1, 1],
    '-': [0, 0, 0, 0, 0, 0, 1],
    ' ': [0, 0, 0, 0, 0, 0, 0],
  };

  const mask = segMap[char] ?? segMap[' '];
  const t = Math.max(3, w * 0.17);
  const halfH = h * 0.5;
  const skew = -0.07; // Subtle authentic 7-segment forward slant

  ctx.save();
  ctx.translate(x, y);
  ctx.transform(1, 0, skew, 1, 0, 0);

  const drawHSeg = (sx: number, sy: number, sw: number, on: boolean) => {
    ctx.fillStyle = on ? activeColor : dimColor;
    ctx.beginPath();
    ctx.moveTo(sx + t * 0.45, sy);
    ctx.lineTo(sx + sw - t * 0.45, sy);
    ctx.lineTo(sx + sw, sy + t * 0.5);
    ctx.lineTo(sx + sw - t * 0.45, sy + t);
    ctx.lineTo(sx + t * 0.45, sy + t);
    ctx.lineTo(sx, sy + t * 0.5);
    ctx.closePath();
    ctx.fill();
  };

  const drawVSeg = (sx: number, sy: number, sh: number, on: boolean) => {
    ctx.fillStyle = on ? activeColor : dimColor;
    ctx.beginPath();
    ctx.moveTo(sx + t * 0.5, sy);
    ctx.lineTo(sx + t, sy + t * 0.45);
    ctx.lineTo(sx + t, sy + sh - t * 0.45);
    ctx.lineTo(sx + t * 0.5, sy + sh);
    ctx.lineTo(sx, sy + sh - t * 0.45);
    ctx.lineTo(sx, sy + t * 0.45);
    ctx.closePath();
    ctx.fill();
  };

  // a (top), b (top-right), c (bottom-right), d (bottom), e (bottom-left), f (top-left), g (middle)
  drawHSeg(t * 0.3, 0, w - t * 0.6, mask[0] === 1);
  drawVSeg(w - t, t * 0.4, halfH - t * 0.6, mask[1] === 1);
  drawVSeg(w - t, halfH + t * 0.2, halfH - t * 0.6, mask[2] === 1);
  drawHSeg(t * 0.3, h - t, w - t * 0.6, mask[3] === 1);
  drawVSeg(0, halfH + t * 0.2, halfH - t * 0.6, mask[4] === 1);
  drawVSeg(0, t * 0.4, halfH - t * 0.6, mask[5] === 1);
  drawHSeg(t * 0.3, halfH - t * 0.5, w - t * 0.6, mask[6] === 1);

  ctx.restore();
}

export interface DualLedDisplayUpdater {
  texture: THREE.CanvasTexture;
  emissiveTexture: THREE.CanvasTexture;
  updateValues: (
    powerW: number,
    energyWh: number,
    isRunning: boolean,
    unit?: 'Wh' | 'kJ',
    isHold?: boolean,
  ) => void;
  dispose: () => void;
}

/**
 * Creates a dynamic dual red 7-segment LED display CanvasTexture pair (albedo + emissive)
 * showing instantaneous Power (W) on the left and accumulated Energy (Wh or kJ) on the right.
 */
export function createDualLedDisplay(maxAnisotropy: number): DualLedDisplayUpdater {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = 512;
  emissiveCanvas.height = 192;
  const eCtx = emissiveCanvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;

  const emissiveTexture = new THREE.CanvasTexture(emissiveCanvas);
  emissiveTexture.colorSpace = THREE.SRGBColorSpace;
  emissiveTexture.anisotropy = maxAnisotropy;

  let lastKey = '';

  const renderPanel = (
    targetCtx: CanvasRenderingContext2D,
    wStr: string,
    eStr: string,
    emissiveOnly: boolean,
    isRunning: boolean,
    unit: 'Wh' | 'kJ',
    isHold: boolean,
  ) => {
    targetCtx.clearRect(0, 0, 512, 192);
    targetCtx.fillStyle = emissiveOnly ? '#000000' : '#120508';
    targetCtx.fillRect(0, 0, 512, 192);

    // Two side-by-side recessed 7-segment filter windows
    const drawWindow = (wx: number, wy: number, ww: number, wh: number, unitLbl: string, valStr: string) => {
      if (!emissiveOnly) {
        targetCtx.fillStyle = '#240509';
        targetCtx.fillRect(wx, wy, ww, wh);
        targetCtx.strokeStyle = '#3d141a';
        targetCtx.lineWidth = 3;
        targetCtx.strokeRect(wx, wy, ww, wh);

        // Crisp instrument unit legend above window
        targetCtx.fillStyle = '#d8dee8';
        targetCtx.font = '700 18px "Plus Jakarta Sans", sans-serif';
        targetCtx.textAlign = 'right';
        targetCtx.fillText(unitLbl, wx + ww - 6, wy - 10);
      }

      const activeCol = isRunning
        ? emissiveOnly
          ? '#ff2e2e'
          : '#ff3b3b'
        : emissiveOnly
          ? '#aa1818'
          : '#d92626';
      const dimCol = emissiveOnly ? '#000000' : '#3a0a10';

      // Render 4 digits + decimal point
      const digitsOnly = valStr.replace('.', '');
      const dotIndex = valStr.indexOf('.'); // dot appears after digit (dotIndex - 1)
      const digitW = 34;
      const digitH = 68;
      const spacing = 12;
      const startX = wx + 20;
      const startY = wy + 18;

      for (let i = 0; i < 4; i++) {
        const ch = digitsOnly[i] ?? ' ';
        const dx = startX + i * (digitW + spacing);
        drawSevenSegmentDigit(targetCtx, ch, dx, startY, digitW, digitH, activeCol, dimCol);

        if (dotIndex - 1 === i) {
          targetCtx.fillStyle = activeCol;
          targetCtx.beginPath();
          targetCtx.arc(dx + digitW + 5, startY + digitH - 4, 4.2, 0, Math.PI * 2);
          targetCtx.fill();
        }
      }
    };

    if (!emissiveOnly) {
      targetCtx.fillStyle = '#9aa5b4';
      targetCtx.font = '600 15px "Plus Jakarta Sans", sans-serif';
      targetCtx.textAlign = 'left';
      targetCtx.fillText(isHold ? 'POWER [HOLD]' : 'POWER', 24, 34);
      targetCtx.fillText('ENERGY', 272, 34);
    }

    if (isHold) {
      targetCtx.fillStyle = emissiveOnly ? '#f59e0b' : '#fbbf24';
      targetCtx.beginPath();
      targetCtx.arc(152, 29, 5, 0, Math.PI * 2);
      targetCtx.fill();
    }

    drawWindow(22, 46, 218, 106, 'W', wStr);
    drawWindow(270, 46, 218, 106, unit, eStr);
  };

  const updateValues = (
    powerW: number,
    energyWh: number,
    isRunning: boolean,
    unit: 'Wh' | 'kJ' = 'Wh',
    isHold = false,
  ) => {
    const energyVal = unit === 'kJ' ? energyWh * 3.6 : energyWh;
    const clampedW = Math.max(0, Math.min(999.9, powerW));
    const clampedE = Math.max(0, Math.min(999.9, energyVal));
    const wFormatted = clampedW.toFixed(1).padStart(5, ' ');
    const eFormatted = clampedE.toFixed(1).padStart(5, '0');
    const key = `${wFormatted}|${eFormatted}|${isRunning ? 1 : 0}|${unit}|${isHold ? 1 : 0}`;
    if (key === lastKey) return;
    lastKey = key;

    renderPanel(ctx, wFormatted, eFormatted, false, isRunning, unit, isHold);
    renderPanel(eCtx, wFormatted, eFormatted, true, isRunning, unit, isHold);
    texture.needsUpdate = true;
    emissiveTexture.needsUpdate = true;
  };

  updateValues(124.0, 18.4, true, 'Wh', false);

  return {
    texture,
    emissiveTexture,
    updateValues,
    dispose: () => {
      texture.dispose();
      emissiveTexture.dispose();
    },
  };
}

/**
 * Creates the lower front control strip decal for the Digital Power/Energy Meter.
 */
export function createMeterControlStripTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e5e9ef';
  ctx.fillRect(0, 0, 512, 160);

  // Top hairline divider
  ctx.strokeStyle = '#b8c1cc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, 8);
  ctx.lineTo(496, 8);
  ctx.stroke();

  // Dial scale markings around the two rotary knob positions (x=115, x=245)
  const drawKnobScale = (cx: number, cy: number, title: string, ticks: string[]) => {
    ctx.fillStyle = '#334155';
    ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, cx, 28);

    const r = 38;
    for (let i = 0; i < ticks.length; i++) {
      const a = Math.PI * 1.15 - (i / (ticks.length - 1)) * Math.PI * 1.3;
      const x1 = cx + Math.cos(a) * (r - 5);
      const y1 = cy - Math.sin(a) * (r - 5);
      const x2 = cx + Math.cos(a) * (r + 3);
      const y2 = cy - Math.sin(a) * (r + 3);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  };

  drawKnobScale(105, 88, 'RANGE W', ['20', '200', '2k']);
  drawKnobScale(235, 88, 'GATE / Wh', ['s', 'Wh', 'kJ']);

  // Button labels on right side
  ctx.fillStyle = '#334155';
  ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('START', 350, 48);
  ctx.fillText('RESET', 408, 48);
  ctx.fillText('HOLD', 464, 48);

  ctx.fillStyle = '#64748b';
  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('230V~ 50Hz  CAT II', 492, 146);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Creates the realistic manufacturer specification plate/sticker on the front of the black compressor.
 */
export function createCompressorPlateTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Brushed silver/white industrial polyester label
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(0, 0, 512, 256);

  // Outer dark industrial border
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 492, 236);

  // Top blue-teal industrial header band
  ctx.fillStyle = '#0f4c81';
  ctx.fillRect(14, 14, 484, 58);

  ctx.fillStyle = '#ffffff';
  ctx.font = '700 30px "Outfit", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THERMOLAB  TL4F', 28, 53);

  ctx.fillStyle = '#bae6fd';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('NO. 389-521', 482, 51);

  // Spec grid
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('220-240V ~ 50Hz', 28, 108);
  ctx.fillText('REFRIGERANT: R134a', 28, 142);
  ctx.fillText('P_N = 120 W   I = 0.85 A', 28, 176);

  // Green R134a eco badge on right
  ctx.fillStyle = '#0d9488';
  ctx.fillRect(354, 86, 128, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 24px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('R134a', 418, 117);

  // Barcode strips at bottom
  ctx.fillStyle = '#1e293b';
  for (let bx = 28; bx < 310; bx += 7) {
    const bw = (bx * 13) % 5 === 0 ? 4 : 2;
    ctx.fillRect(bx, 196, bw, 34);
  }

  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('CE', 448, 222);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export interface ManometerDialUpdater {
  texture: THREE.CanvasTexture;
  updatePressure: (pressureBar: number) => void;
  dispose: () => void;
}

/**
 * Creates a crisp, readable dynamic Bourdon pressure gauge dial texture (512 x 512)
 * with realistic outer `bar` graduations, inner R134a `°C` saturation scale, and live reading window.
 */
export function createDynamicManometerDial(
  type: 'low' | 'high',
  maxAnisotropy: number,
  initialBar = 2.5,
): ManometerDialUpdater {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;

  let lastKey = '';

  const draw = (pressureBar: number) => {
    const key = pressureBar.toFixed(2);
    if (key === lastKey) return;
    lastKey = key;

    const cx = 256;
    const cy = 256;

    ctx.clearRect(0, 0, 512, 512);
    ctx.fillStyle = '#fcfdff';
    ctx.beginPath();
    ctx.arc(cx, cy, 250, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 242, 0, Math.PI * 2);
    ctx.stroke();

    const maxBar = type === 'low' ? 10 : 25;
    const majorStep = type === 'low' ? 2 : 5;
    const minorDivs = 5;
    const totalTicks = (maxBar / majorStep) * minorDivs;

    const startAngle = (3 * Math.PI) / 4;
    const sweepAngle = (3 * Math.PI) / 2;

    for (let i = 0; i <= totalTicks; i++) {
      const frac = i / totalTicks;
      const ang = startAngle + frac * sweepAngle;
      const isMajor = i % minorDivs === 0;

      const rOuter = 214;
      const rInner = isMajor ? 178 : 194;

      ctx.strokeStyle = type === 'high' && frac >= 0.76 ? '#dc2626' : '#111827';
      ctx.lineWidth = isMajor ? 5.8 : 2.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
      ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
      ctx.stroke();

      if (isMajor) {
        const val = Math.round(frac * maxBar);
        const rText = 144;
        ctx.fillStyle = type === 'high' && val >= 20 ? '#dc2626' : '#111827';
        ctx.font = '800 34px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(val), cx + Math.cos(ang) * rText, cy + Math.sin(ang) * rText);
      }
    }

    // Inner realistic R134a saturation temperature scale (°C)
    const tempMarks =
      type === 'low'
        ? [
            { bar: 1.0, deg: '-10°' },
            { bar: 1.9, deg: '0°' },
            { bar: 3.1, deg: '10°' },
            { bar: 4.7, deg: '20°' },
            { bar: 6.7, deg: '30°' },
            { bar: 9.1, deg: '40°' },
          ]
        : [
            { bar: 1.9, deg: '0°' },
            { bar: 4.7, deg: '20°' },
            { bar: 9.1, deg: '40°' },
            { bar: 15.8, deg: '60°' },
            { bar: 22.6, deg: '75°' },
          ];

    ctx.strokeStyle = type === 'low' ? '#0284c7' : '#c2410c';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(cx, cy, 98, startAngle + 0.08, startAngle + sweepAngle - 0.08);
    ctx.stroke();

    for (const tm of tempMarks) {
      const f = tm.bar / maxBar;
      const ang = startAngle + f * sweepAngle;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 90, cy + Math.sin(ang) * 90);
      ctx.lineTo(cx + Math.cos(ang) * 104, cy + Math.sin(ang) * 104);
      ctx.stroke();

      ctx.fillStyle = type === 'low' ? '#0369a1' : '#9a3412';
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tm.deg, cx + Math.cos(ang) * 70, cy + Math.sin(ang) * 70);
    }

    // Crisp live digital sub-window at bottom of dial showing exact variable bar reading
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 76, cy + 106, 152, 48);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cx - 76, cy + 106, 152, 48);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 26px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${key} bar`, cx, cy + 131);

    ctx.fillStyle = '#334155';
    ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(type === 'low' ? 'BASSE P (R134a)' : 'HAUTE P (R134a)', cx, cy + 178);

    texture.needsUpdate = true;
  };

  draw(initialBar);

  return {
    texture,
    updatePressure: draw,
    dispose: () => texture.dispose(),
  };
}

/**
 * Creates a crisp analog Bourdon pressure gauge dial texture matching the PHYWE manometers.
 */
export function createManometerDialTexture(
  type: 'low' | 'high',
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const cx = 256;
  const cy = 256;

  // Crisp white enamel dial face
  ctx.fillStyle = '#fcfdff';
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.fill();

  // Subtle inner metallic shadow ring
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, 242, 0, Math.PI * 2);
  ctx.stroke();

  const maxBar = type === 'low' ? 10 : 25;
  const majorStep = type === 'low' ? 2 : 5;
  const minorDivs = 5;
  const totalTicks = (maxBar / majorStep) * minorDivs;

  const startAngle = (3 * Math.PI) / 4;
  const sweepAngle = (3 * Math.PI) / 2;

  // Outer pressure ticks (bar)
  for (let i = 0; i <= totalTicks; i++) {
    const frac = i / totalTicks;
    const ang = startAngle + frac * sweepAngle;
    const isMajor = i % minorDivs === 0;

    const rOuter = 206;
    const rInner = isMajor ? 172 : 188;

    ctx.strokeStyle = type === 'high' && frac >= 0.76 ? '#dc2626' : '#111827';
    ctx.lineWidth = isMajor ? 5.5 : 2.8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
    ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
    ctx.stroke();

    if (isMajor) {
      const val = Math.round(frac * maxBar);
      const rText = 136;
      ctx.fillStyle = type === 'high' && val >= 20 ? '#dc2626' : '#111827';
      ctx.font = '700 34px "Outfit", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(val), cx + Math.cos(ang) * rText, cy + Math.sin(ang) * rText);
    }
  }

  // Inner subtle temperature scale ticks
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 92, startAngle + 0.1, startAngle + sweepAngle - 0.1);
  ctx.stroke();

  // Unit & markings matching photo
  ctx.fillStyle = '#111827';
  ctx.font = '700 34px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('bar', cx, cy + 118);

  ctx.fillStyle = '#334155';
  ctx.font = '600 22px "JetBrains Mono", monospace';
  ctx.fillText('°C', cx, cy + 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Creates the horizontal PHYWE Wärmepumpe White Enclosure Front Schematic Texture (2048 x 600, aspect ~3.43:1)
 * matching reference photo image_e25d96bb.png in line colors, stippled bands, symbols, and labels.
 */
export function createWhiteControlPanelTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;

  // Clean PHYWE matte white powder-coated sheet metal
  ctx.fillStyle = '#f4f6f9';
  ctx.fillRect(0, 0, 2048, 600);

  // Subtle top bevel highlight
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 2048, 6);

  // Coordinate mapping to 3D enclosure front (panelW = 3.50, panelH = 1.025):
  // px = 1024 + (localX / 3.50) * 2048
  // py = 300 - (localY / 1.025) * 600
  //
  // Key 3D / 2D landmarks:
  // - Top-left label "Wärmepumpe":      px = 92,   py = 66
  // - Top-right logo "PHYWE":           px = 1965, py = 58
  // - Left Expansion Valve (bowtie):    px = 206 (localX = -1.40), py = 405..500
  // - Left Manometer:                   px = 404 (localX = -1.06), py = 282 (localY = +0.03)
  // - Left Sight Glass:                 px = 585 (localX = -0.75), py = 415 (localY = -0.196)
  // - Central Compressor Circle + "Qe": px = 1044 (localX = +0.034), py = 366 (localY = -0.11)
  // - Right Vapor Drop + "↓ Qw":        px = 1510 (localX = +0.83), py = 362..600
  // - Right Manometer:                  px = 1690 (localX = +1.14), py = 270 (localY = +0.05)
  // - Right Orange Line + Sight Glass:  px = 1858 (localX = +1.425), sight glass py = 398 (localY = -0.167)

  const orange = '#ee8b1b';
  const darkBlue = '#1d3b8b';
  const ink = '#151921';

  // Helper to fill a stippled / hatched schematic pipe band (matching photo's blue & peach vapor bands)
  const drawStippledBand = (
    points: Array<[number, number]>,
    bandWidth: number,
    baseColor: string,
    dotColor: string,
    borderColor: string,
  ) => {
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    // Outer subtle border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = bandWidth + 2.5;
    ctx.beginPath();
    points.forEach(([x, y], idx) => (idx === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();

    // Soft pastel base fill
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = bandWidth;
    ctx.stroke();

    // Stippled pattern overlay clipped to stroke
    const patCanvas = document.createElement('canvas');
    patCanvas.width = 12;
    patCanvas.height = 12;
    const pCtx = patCanvas.getContext('2d')!;
    pCtx.fillStyle = baseColor;
    pCtx.fillRect(0, 0, 12, 12);
    pCtx.fillStyle = dotColor;
    pCtx.fillRect(2, 2, 2.2, 2.2);
    pCtx.fillRect(8, 5, 2.2, 2.2);
    pCtx.fillRect(4, 9, 2.2, 2.2);
    pCtx.fillRect(10, 10, 2.0, 2.0);

    const pat = ctx.createPattern(patCanvas, 'repeat');
    if (pat) {
      ctx.strokeStyle = pat;
      ctx.lineWidth = bandWidth;
      ctx.stroke();
    }
    ctx.restore();
  };

  // 1. Top-left "Wärmepumpe" & Top-right "PHYWE" branding
  ctx.fillStyle = '#262b35';
  ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Wärmepumpe', 92, 68);

  ctx.fillStyle = '#11151c';
  ctx.font = '800 30px "Outfit", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('PHYWE', 1978, 58);

  // 2. Left Low-Pressure Stippled Light-Blue Pipe Band (from bottom Qk up to central Compressor)
  drawStippledBand(
    [
      [585, 600],
      [585, 368],
      [932, 368],
    ],
    15,
    '#c6daf7',
    '#4d73ba',
    '#7c9cd4',
  );
  // Thin low-pressure T-branch to Left Manometer
  drawStippledBand(
    [
      [585, 368],
      [404, 368],
      [404, 290],
    ],
    9,
    '#c6daf7',
    '#4d73ba',
    '#7c9cd4',
  );

  // 3. Right High-Pressure Vapor Stippled Peach/Salmon Pipe Band (from central Compressor right & down to Qw)
  drawStippledBand(
    [
      [1156, 364],
      [1510, 364],
      [1510, 600],
    ],
    16,
    '#f3d1bd',
    '#c2693c',
    '#d49473',
  );

  // 4. Main Solid Orange High-Pressure Liquid Line (up from expansion valve -> across top -> down right side)
  ctx.strokeStyle = orange;
  ctx.lineWidth = 11;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(206, 405);
  ctx.lineTo(206, 134);
  ctx.lineTo(1858, 122); // Very slight authentic PHYWE upward slope left-to-right or crisp horizontal
  ctx.lineTo(1858, 600);
  ctx.stroke();

  // Small dark green indicator dot on top-left of orange line (visible in photo)
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.arc(250, 124, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Thin orange T-branch from right vertical orange line to Right Manometer
  ctx.strokeStyle = orange;
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.moveTo(1858, 352);
  ctx.lineTo(1690, 352);
  ctx.lineTo(1690, 275);
  ctx.stroke();

  // 5. Bottom-Left Dark-Blue Liquid/Two-Phase Drop Line below Expansion Valve
  ctx.strokeStyle = darkBlue;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(206, 502);
  ctx.lineTo(206, 600);
  ctx.stroke();

  // 6. Bottom-Left Black Bowtie Expansion Valve Symbol (at px = 206, py = 405..502)
  ctx.fillStyle = '#f4f6f9';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5.5;
  ctx.lineJoin = 'round';

  // Upper inverted triangle
  ctx.beginPath();
  ctx.moveTo(176, 405);
  ctx.lineTo(236, 405);
  ctx.lineTo(206, 453);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Lower upright triangle
  ctx.beginPath();
  ctx.moveTo(206, 454);
  ctx.lineTo(238, 502);
  ctx.lineTo(174, 502);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Central black throttle node dot
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(206, 453.5, 9, 0, Math.PI * 2);
  ctx.fill();

  // 7. Central Black Compressor Circle Symbol + "Qe" underneath (px = 1044, py = 366)
  const compX = 1044;
  const compY = 366;
  const compR = 112;

  ctx.fillStyle = '#f4f6f9';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.arc(compX, compY, compR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Converging compressor chord lines inside circle (left wider, right narrower, matching photo)
  ctx.beginPath();
  ctx.moveTo(compX - compR * 0.76, compY - compR * 0.65);
  ctx.lineTo(compX + compR * 0.85, compY - compR * 0.51);
  ctx.moveTo(compX - compR * 0.76, compY + compR * 0.65);
  ctx.lineTo(compX + compR * 0.85, compY + compR * 0.51);
  ctx.stroke();

  // "Qe" directly under central compressor circle
  ctx.fillStyle = ink;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.font = '600 58px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Q', compX - 12, 536);
  ctx.font = '600 38px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('e', compX + 26, 545);

  // 8. Bottom-Left "Qk ↑" Label & Sharp Upward Arrow (left of blue pipe px=585)
  ctx.fillStyle = ink;
  ctx.font = '600 56px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Q', 482, 566);
  ctx.font = '600 38px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('k', 518, 575);

  // Sharp vertical upward arrow at px = 552
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(552, 578);
  ctx.lineTo(552, 514);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(552, 498);
  ctx.lineTo(544, 522);
  ctx.lineTo(560, 522);
  ctx.closePath();
  ctx.fill();

  // 9. Bottom-Right "↓ Qw" Sharp Downward Arrow & Label (right of peach pipe px=1510)
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(1542, 494);
  ctx.lineTo(1542, 558);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(1542, 574);
  ctx.lineTo(1534, 550);
  ctx.lineTo(1550, 550);
  ctx.closePath();
  ctx.fill();

  ctx.font = '600 56px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('Q', 1592, 558);
  ctx.font = '600 38px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('w', 1634, 567);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates a realistic laboratory glass stem thermometer graduation texture
 * (white enamel backing, fine horizontal degree ticks, and red thermometric liquid column).
 */
export function createThermometerStemTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Translucent milk-glass thermometer backing
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, 64, 512);

  // Subtle glass cylinder shading on edges
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, 8, 512);
  ctx.fillRect(56, 0, 8, 512);

  // Red alcohol/mercury capillary line in lower-middle stem
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(29, 230, 6, 282);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(30, 24, 4, 206);

  // Fine black horizontal degree graduation ticks along stem
  ctx.fillStyle = '#1e293b';
  for (let y = 44; y <= 468; y += 7) {
    const isMajor = ((y - 44) / 7) % 5 === 0;
    const w = isMajor ? 22 : 12;
    ctx.fillRect(16, y, w, isMajor ? 2.5 : 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates a subtle tileable laboratory benchtop micro-speckle roughness/albedo texture.
 */
export function createLabTableTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#dce1e7';
  ctx.fillRect(0, 0, 256, 256);

  //Deterministic fine melamine speckle so no noisy flicker
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  for (let i = 0; i < 2400; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const v = 208 + Math.floor(rand() * 26);
    ctx.fillStyle = `rgb(${v}, ${v + 3}, ${v + 7})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 5);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates a soft radial contact shadow CanvasTexture for grounding apparatus on the benchtop.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.46)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.20)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates the Left "Robot Eye" Temperature Gauge Dial Texture (0 .. 160 °C)
 * matching reference photo images_f7314921.jpg.
 */
export function createCookerTemperatureDialTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const cx = 256;
  const cy = 256;

  // Crisp white instrument dial face with subtle radial depth
  const bgGrad = ctx.createRadialGradient(cx, cy - 20, 30, cx, cy, 250);
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(0.86, '#f4f7fa');
  bgGrad.addColorStop(1, '#dbe2ea');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.fill();

  // Inner metallic bezel shadow ring
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, 241, 0, Math.PI * 2);
  ctx.stroke();

  const maxTemp = 160;
  const majorStep = 20;
  const minorPerMajor = 10; // 2 °C per minor division
  const totalTicks = (maxTemp / majorStep) * minorPerMajor;

  const startAngle = (3 * Math.PI) / 4; // Bottom-left (0 °C)
  const sweepAngle = (3 * Math.PI) / 2; // 270 deg clockwise to bottom-right (160 °C)

  // Thin inner scale arc matching bimetallic lab thermometer style
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(cx, cy, 206, startAngle, startAngle + sweepAngle);
  ctx.stroke();

  for (let i = 0; i <= totalTicks; i++) {
    const frac = i / totalTicks;
    const ang = startAngle + frac * sweepAngle;
    const isMajor = i % minorPerMajor === 0;
    const isMid = !isMajor && i % (minorPerMajor / 2) === 0;

    const rOuter = 206;
    const rInner = isMajor ? 168 : isMid ? 179 : 189;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = isMajor ? 5.8 : isMid ? 3.5 : 2.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
    ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
    ctx.stroke();

    if (isMajor) {
      const val = Math.round(frac * maxTemp);
      const rText = 131;
      ctx.fillStyle = '#0f172a';
      ctx.font = '800 34px "Outfit", "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(val), cx + Math.cos(ang) * rText, cy + Math.sin(ang) * rText);
    }
  }

  // Center-upper "°C" unit symbol matching images_f7314921.jpg
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 36px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('°C', cx, cy - 52);

  // Subtle DIN class legend at bottom
  ctx.fillStyle = '#475569';
  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillText('KL. 1', cx, cy + 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Creates the Right "Robot Eye" Pressure Manometer Dial Texture (0 .. 2.5 bar)
 * matching reference photo images_f7314921.jpg.
 */
export function createCookerPressureDialTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const cx = 256;
  const cy = 256;

  const bgGrad = ctx.createRadialGradient(cx, cy - 20, 30, cx, cy, 250);
  bgGrad.addColorStop(0, '#ffffff');
  bgGrad.addColorStop(0.86, '#f4f7fa');
  bgGrad.addColorStop(1, '#dbe2ea');
  ctx.fillStyle = bgGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 250, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, 241, 0, Math.PI * 2);
  ctx.stroke();

  const maxBar = 2.5;
  const totalTicks = 25; // 0.1 bar per minor division, major every 5 ticks (0.5 bar)
  const startAngle = (3 * Math.PI) / 4;
  const sweepAngle = (3 * Math.PI) / 2;

  for (let i = 0; i <= totalTicks; i++) {
    const frac = i / totalTicks;
    const ang = startAngle + frac * sweepAngle;
    const isMajor = i % 5 === 0;

    const rOuter = 208;
    const rInner = isMajor ? 168 : 186;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = isMajor ? 6.0 : 2.8;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
    ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
    ctx.stroke();

    if (isMajor) {
      const val = (i * 0.1).toFixed(i === 0 ? 0 : 1);
      const rText = 129;
      ctx.fillStyle = '#0f172a';
      ctx.font = '800 35px "Outfit", "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val, cx + Math.cos(ang) * rText, cy + Math.sin(ang) * rText);
    }
  }

  // Red safety mark at 1.2 bar (max Stage 2 relief zone)
  const redAng = startAngle + (1.15 / maxBar) * sweepAngle;
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(redAng) * 166, cy + Math.sin(redAng) * 166);
  ctx.lineTo(cx + Math.cos(redAng) * 212, cy + Math.sin(redAng) * 212);
  ctx.stroke();

  // Small technical Bourdon emblem above center matching images_f7314921.jpg
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.arc(cx, cy - 60, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#334155';
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EN837', cx, cy - 60);

  // "bar" unit at bottom + KL 1.6
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 35px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('bar', cx, cy + 102);

  ctx.fillStyle = '#475569';
  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillText('KL. 1.6', cx, cy + 138);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Creates a circumferential brushed stainless-steel albedo texture for the pressure cooker pot
 * including the three subtle horizontal satin bands and etched spec markings from image_1b7fb853.png.
 */
export function createBrushedStainlessPotTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e2e7ed';
  ctx.fillRect(0, 0, 1024, 512);

  // Fine horizontal lathe brushing lines
  let seed = 109;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < 512; y += 2) {
    const delta = Math.floor((rand() - 0.5) * 14);
    const v = 224 + delta;
    ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 9})`;
    ctx.fillRect(0, y, 1024, 2);
  }

  // Three horizontal satin matte bands around mid-body (matching image_1b7fb853.png)
  for (const bandY of [235, 275, 315]) {
    ctx.fillStyle = 'rgba(182, 191, 203, 0.52)';
    ctx.fillRect(0, bandY, 1024, 18);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, bandY - 2, 1024, 2);
  }

  // Subtle laser-etched laboratory vessel inscription on front-left flank
  ctx.fillStyle = 'rgba(51, 65, 85, 0.55)';
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('INOX 18/10 · LAB AUTOCLAVE', 430, 152);
  ctx.fillText('V = 6.0 L   P_MAX = 2.5 bar', 430, 172);
  ctx.fillText('DIN EN 12778 · INDUCTION', 430, 192);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Creates the silk-screened "0  1  2" stage selector scale decal on top of the black handle.
 */
export function createHandleStageScaleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#181b22';
  ctx.fillRect(0, 0, 256, 128);

  // Subtle recessed border
  ctx.strokeStyle = '#2d3340';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 244, 116);

  // White stage numerals 0, 1, 2 along X (matching 3-stage toggle switch positions)
  const positions = [
    { x: 52, label: '0' },
    { x: 128, label: '1' },
    { x: 204, label: '2' },
  ];

  for (const p of positions) {
    ctx.fillStyle = p.label === '0' ? '#7dd3fc' : '#f8fafc';
    ctx.font = '800 32px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.label, p.x, 34);

    // Tick mark pointing down toward slider track
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p.x, 54);
    ctx.lineTo(p.x, 66);
    ctx.stroke();
  }

  // Dark guide slot along lower half
  ctx.fillStyle = '#090b0f';
  ctx.fillRect(32, 74, 192, 30);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Creates the circular numerical thermostat scale ("0" up to maximum "6") on the electric hotplate front face.
 */
export function createHotplateDialScaleTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const cx = 128;
  const cy = 128;

  // High-contrast circular dial escutcheon around rotary knob
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(cx, cy, 124, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 120, 0, Math.PI * 2);
  ctx.stroke();

  // Numbers 0, 1, 2, 3, 4, 5, 6 arranged from top (-90 deg) clockwise 270 deg around the knob
  const startAngle = -Math.PI / 2; // Top = 0 (OFF)
  const sweepAngle = (3 * Math.PI) / 2; // Clockwise through right, bottom, left up to 6

  for (let step = 0; step <= 6; step++) {
    const frac = step / 6;
    const ang = startAngle + frac * sweepAngle;

    const rInner = 64;
    const rOuter = 80;
    ctx.strokeStyle = step === 6 ? '#dc2626' : '#0f172a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
    ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
    ctx.stroke();

    const rText = 100;
    ctx.fillStyle = step === 6 ? '#dc2626' : '#0f172a';
    ctx.font = '800 30px "Outfit", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(step), cx + Math.cos(ang) * rText, cy + Math.sin(ang) * rText);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

