import * as THREE from 'three';

export interface DynamicThermometerUpdater {
  texture: THREE.CanvasTexture;
  updateTemperature: (tempC: number) => void;
  dispose: () => void;
}

/**
 * Creates a crisp, readable laboratory °C thermometer scale plate + live variable liquid column
 * CanvasTexture (256 x 512) for Table 1's 6 thermometers so their graduations and live readings
 * are legible without colliding with the PHYWE cabinet above.
 */
export function createDynamicThermometerDisplay(options: {
  sensorTag: string;
  minC: number;
  maxC: number;
  liquidColor: 'blue' | 'red';
  maxAnisotropy: number;
  initialTempC: number;
}): DynamicThermometerUpdater {
  const { sensorTag, minC, maxC, liquidColor, maxAnisotropy, initialTempC } = options;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;

  let lastKey = '';
  let lastDrawTime = 0;
  let lastTemp = initialTempC;

  const draw = (tempC: number) => {
    const now = performance.now();
    const clamped = Math.max(minC, Math.min(maxC, tempC));
    const delta = Math.abs(clamped - lastTemp);
    // Throttle redrawing: at most 4 times/sec unless large temperature step
    if (now - lastDrawTime < 250 && delta < 0.25) {
      return;
    }
    const key = clamped.toFixed(1);
    if (key === lastKey && now - lastDrawTime < 1000) return;
    lastKey = key;
    lastDrawTime = now;
    lastTemp = clamped;

    ctx.clearRect(0, 0, 256, 512);

    // Brushed white-enamel laboratory scale plate with subtle metallic edge
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(4, 4, 248, 504);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 244, 500);

    // Top high-contrast header badge showing sensor ID + live variable °C reading
    ctx.fillStyle = liquidColor === 'blue' ? '#0f3a5d' : '#5c161e';
    ctx.fillRect(10, 10, 236, 78);

    ctx.fillStyle = '#bae6fd';
    if (liquidColor === 'red') ctx.fillStyle = '#fecdd3';
    ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(sensorTag, 20, 32);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 34px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${key}°C`, 238, 56);

    // Scale vertical geometry: yTop = 116 (maxC), yBottom = 468 (minC)
    const yTop = 116;
    const yBottom = 468;
    const spanPx = yBottom - yTop;

    // Glass capillary tube groove along x = 66..92
    const tubeX = 64;
    const tubeW = 28;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(tubeX, yTop - 10, tubeW, spanPx + 24);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(tubeX, yTop - 10, tubeW, spanPx + 24);

    // Live thermometric liquid column height proportional to real variable temperature
    const frac = (clamped - minC) / (maxC - minC);
    const fillH = Math.max(8, frac * spanPx);
    const fillY = yBottom - fillH;

    const mainCol = liquidColor === 'blue' ? '#0284c7' : '#dc2626';
    const hiCol = liquidColor === 'blue' ? '#7dd3fc' : '#fca5a5';

    ctx.fillStyle = mainCol;
    ctx.fillRect(tubeX + 4, fillY, tubeW - 8, yBottom - fillY + 14);

    // Specular glass highlight along capillary
    ctx.fillStyle = hiCol;
    ctx.fillRect(tubeX + 7, fillY, 5, yBottom - fillY + 12);

    // Realistic graduation ticks every 2 °C, bold numbered major ticks every 10 °C
    const stepDeg = 2;
    for (let deg = minC; deg <= maxC; deg += stepDeg) {
      const f = (deg - minC) / (maxC - minC);
      const y = yBottom - f * spanPx;
      const isMajor = deg % 10 === 0;
      const isMid = !isMajor && deg % 5 === 0;

      ctx.strokeStyle = deg === 0 ? '#0369a1' : '#0f172a';
      ctx.lineWidth = isMajor ? 4.2 : isMid ? 3.0 : 1.8;
      const tickStart = tubeX + tubeW + 4;
      const tickEnd = tickStart + (isMajor ? 34 : isMid ? 22 : 13);

      ctx.beginPath();
      ctx.moveTo(tickStart, y);
      ctx.lineTo(tickEnd, y);
      ctx.stroke();

      // Mirror short tick on left of capillary for authentic DIN stem look
      ctx.beginPath();
      ctx.moveTo(tubeX - (isMajor ? 14 : 7), y);
      ctx.lineTo(tubeX - 2, y);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = '#0f172a';
        ctx.font = '800 25px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${deg}°`, tickEnd + 8, y + 1);
      }
    }

    // Current meniscus pointer triangle on right edge of capillary
    ctx.fillStyle = mainCol;
    ctx.beginPath();
    ctx.moveTo(tubeX + tubeW + 2, fillY);
    ctx.lineTo(tubeX + tubeW + 16, fillY - 7);
    ctx.lineTo(tubeX + tubeW + 16, fillY + 7);
    ctx.closePath();
    ctx.fill();

    texture.needsUpdate = true;
  };

  draw(initialTempC);

  return {
    texture,
    updateTemperature: draw,
    dispose: () => {
      texture.dispose();
    },
  };
}
