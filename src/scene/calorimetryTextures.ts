import * as THREE from 'three';

export interface DynamicLcdTexture {
  texture: THREE.CanvasTexture;
  update: (value: number, active?: boolean) => void;
  dispose: () => void;
}

/**
 * Generates a classic sloped-benchtop laboratory moving-coil analog meter dial
 * ('V' Voltmeter 0..15 V or 'A' Ammeter 0..5 A, Classe 1.5, anti-parallax mirror arc).
 */
export function createAnalogLabMeterTexture(
  unit: 'V' | 'A',
  maxScale: number,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;

  // Crisp laboratory ivory-white scale card
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 512, 384);

  // Subtle top border shadow
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 376);

  const cx = 256;
  const cy = 336; // Pivot near bottom center
  const startAng = -Math.PI / 2 - 0.84;
  const endAng = -Math.PI / 2 + 0.84;

  // Anti-parallax silver mirror arc band beneath ticks
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, 214, startAng, endAng);
  ctx.stroke();

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 214, startAng, endAng);
  ctx.stroke();

  // Main black graduation arc
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 236, startAng, endAng);
  ctx.stroke();

  const totalTicks = unit === 'V' ? 30 : 25;
  const majorEvery = 5;

  for (let i = 0; i <= totalTicks; i++) {
    const frac = i / totalTicks;
    const ang = startAng + frac * (endAng - startAng);
    const isMajor = i % majorEvery === 0;

    const rInner = 236;
    const rOuter = isMajor ? 264 : 251;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = isMajor ? 4.5 : 2.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * rInner, cy + Math.sin(ang) * rInner);
    ctx.lineTo(cx + Math.cos(ang) * rOuter, cy + Math.sin(ang) * rOuter);
    ctx.stroke();

    if (isMajor) {
      const val = (frac * maxScale).toFixed(maxScale <= 5 && i % 10 !== 0 ? 1 : 0);
      const rText = 290;
      ctx.fillStyle = '#0f172a';
      ctx.font = '800 28px "Outfit", "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val, cx + Math.cos(ang) * rText, cy + Math.sin(ang) * rText);
    }
  }

  // Prominent unit symbol ('V' or 'A' with DC horizontal bar underneath)
  ctx.fillStyle = unit === 'V' ? '#1d4ed8' : '#b91c1c';
  ctx.font = '800 54px "Outfit", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(unit, cx, 198);

  // DC continuous current symbol (solid line + 3 dashes)
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 26, 232);
  ctx.lineTo(cx + 26, 232);
  ctx.stroke();
  for (const dx of [-20, 0, 20]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx - 5, 241);
    ctx.lineTo(cx + dx + 5, 241);
    ctx.stroke();
  }

  // Precision class & 100-division legend (matching TP2 page 34 uncertainty equations)
  ctx.fillStyle = '#475569';
  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('CL. 1.5 · 100 DIV', 28, 352);
  ctx.textAlign = 'right';
  ctx.fillText(`CAL. ${maxScale} ${unit}`, 484, 352);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Dynamic backlit LCD readout for the Electronic Precision Balance (in grams).
 */
export function createBalanceLcdUpdater(maxAnisotropy: number): DynamicLcdTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;

  let lastKey = '';

  const update = (grams: number) => {
    const key = grams.toFixed(1);
    if (key === lastKey) return;
    lastKey = key;

    // Backlit laboratory mint-green LCD bezel & screen
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 384, 128);
    ctx.fillStyle = '#bbf7d0';
    ctx.fillRect(10, 10, 364, 108);

    ctx.fillStyle = '#14532d';
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PRECISA 0.1g', 22, 34);
    ctx.fillText('STABLE  NET', 22, 102);

    ctx.fillStyle = '#052e16';
    ctx.font = '800 58px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${key} g`, 358, 84);

    texture.needsUpdate = true;
  };

  update(85.0);

  return {
    texture,
    update,
    dispose: () => texture.dispose(),
  };
}

/**
 * Dynamic digital LCD readout for the Laboratory Stopwatch (mm:ss.d).
 */
export function createStopwatchLcdUpdater(maxAnisotropy: number): DynamicLcdTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;

  let lastKey = '';

  const update = (sec: number, running = true) => {
    const clamped = Math.max(0, sec);
    const mins = Math.floor(clamped / 60);
    const remSec = Math.floor(clamped % 60);
    const tenths = Math.floor((clamped * 10) % 10);
    const formatted = `${String(mins).padStart(2, '0')}:${String(remSec).padStart(2, '0')}.${tenths}`;
    const key = `${formatted}_${running ? 1 : 0}`;
    if (key === lastKey) return;
    lastKey = key;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 384, 160);
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(12, 12, 360, 136);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = '700 17px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CHRONOMÈTRE TP2', 24, 38);
    ctx.textAlign = 'right';
    ctx.fillStyle = running ? '#15803d' : '#b45309';
    ctx.fillText(running ? 'RUN' : 'HOLD', 358, 38);

    ctx.fillStyle = '#0f172a';
    ctx.font = '800 62px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(formatted, 192, 114);

    texture.needsUpdate = true;
  };

  update(35.0, true);

  return {
    texture,
    update,
    dispose: () => texture.dispose(),
  };
}

/**
 * Silk-screened faceplate texture for the Regulated DC Power Supply ('Alimentation continue').
 */
export function createPowerSupplyFrontTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, 512, 384);

  // Dark header bar
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 512, 68);
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ALIMENTATION CONTINUE DC', 22, 34);
  ctx.fillStyle = '#93c5fd';
  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillText('0 – 15 V  ·  0 – 5 A  ·  STABILISÉE', 22, 56);

  // Digital output readout window
  ctx.fillStyle = '#090d16';
  ctx.fillRect(26, 92, 236, 96);
  ctx.fillStyle = '#ef4444';
  ctx.font = '800 36px "JetBrains Mono", monospace';
  ctx.fillText('12.0V 3.0A', 40, 152);

  // Knob dial rings on right half
  for (const [kx, label] of [
    [332, 'TENSION (U)'],
    [438, 'COURANT (I)'],
  ] as const) {
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(kx, 146, 36, 0.75 * Math.PI, 2.25 * Math.PI);
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, kx, 204);
  }

  // Lower output terminal markings
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(22, 244);
  ctx.lineTo(490, 244);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('MARCHE', 42, 282);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#dc2626';
  ctx.font = '800 24px "Outfit", sans-serif';
  ctx.fillText('+  SORTIE DC', 310, 280);
  ctx.fillStyle = '#0f172a';
  ctx.fillText('−', 426, 280);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Transparent wrap-around white enamel graduation markings for clear glass laboratory cups/beakers.
 */
export function createGraduatedCupTexture(
  capacityMl: 250 | 400,
  subtitle: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 256);

  // Subtle vertical glass sheen bands so empty cups read crisply
  ctx.fillStyle = 'rgba(186, 230, 253, 0.22)';
  ctx.fillRect(72, 0, 22, 256);
  ctx.fillRect(390, 0, 14, 256);

  // High-contrast laboratory cobalt/slate enamel graduation scale centered on front face (px = 256)
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.lineWidth = 3.5;

  const steps = capacityMl === 400 ? [100, 200, 300, 400] : [50, 100, 150, 200, 250];
  for (let i = 0; i < steps.length; i++) {
    const ml = steps[i];
    const frac = ml / (capacityMl * 1.18);
    const y = 236 - frac * 195;

    ctx.beginPath();
    ctx.moveTo(220, y);
    ctx.lineTo(258, y);
    ctx.stroke();

    ctx.font = '800 19px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${ml}`, 265, y);
  }

  // Frosted white laboratory enamel label patch on left-front so VIDE / H₂O / m₀ / m₁ reads crisply
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.fillRect(104, 54, 106, 62);
  ctx.strokeStyle = 'rgba(3, 105, 161, 0.75)';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(104, 54, 106, 62);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${capacityMl} mL`, 157, 75);
  ctx.font = '800 17px "JetBrains Mono", monospace';
  ctx.fillStyle = subtitle.includes('70') ? '#b91c1c' : '#0369a1';
  ctx.fillText(subtitle, 157, 101);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Wrap-around label band for the clear 1.5 L Water Bottle on Table 3.
 */
export function createWaterBottleLabelTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(0.5, '#0ea5e9');
  grad.addColorStop(1, '#0284c7');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 192);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 10, 512, 8);
  ctx.fillRect(0, 174, 512, 8);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 38px "Outfit", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EAU PURE · H₂O', 256, 86);

  ctx.fillStyle = '#e0f2fe';
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillText('RÉSERVE TP2 · 1.5 L', 256, 134);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Open two-page TP2 Calorimétrie laboratory notebook spread lying flat on Table 3.
 */
export function createTp2NotebookSpreadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 700;
  const ctx = canvas.getContext('2d')!;

  // Warm ivory notebook paper so pages & ink stand out against white tabletop
  ctx.fillStyle = '#f6f2e6';
  ctx.fillRect(0, 0, 1024, 700);

  // Crisp graph/ruled notebook lines
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  for (let y = 80; y < 660; y += 28) {
    ctx.beginPath();
    ctx.moveTo(32, y);
    ctx.lineTo(486, y);
    ctx.moveTo(538, y);
    ctx.lineTo(992, y);
    ctx.stroke();
  }

  // Center spine crease
  const spineGrad = ctx.createLinearGradient(492, 0, 532, 0);
  spineGrad.addColorStop(0, 'rgba(15,23,42,0)');
  spineGrad.addColorStop(0.5, 'rgba(15,23,42,0.22)');
  spineGrad.addColorStop(1, 'rgba(15,23,42,0)');
  ctx.fillStyle = spineGrad;
  ctx.fillRect(492, 0, 40, 700);

  // Left Page: TP2 Calorimétrie — Méthode du mélange (Cuivre c_cu)
  ctx.fillStyle = '#1e3a8a';
  ctx.font = '800 32px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('TP2 — Calorimétrie', 48, 68);

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 21px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('1.1 Méthode du mélange (Cuivre)', 48, 122);

  ctx.font = '600 18px "JetBrains Mono", monospace';
  ctx.fillStyle = '#334155';
  ctx.fillText('δQ = (m₀+μ₀)c₀(θf−θ₀) + m_cu·c_cu(θf−θ₀)', 48, 168);
  ctx.fillText('     + m₁·c₀(θf−θ₁) = 0', 48, 198);
  ctx.fillText('• Vase calorimétrique : m_v = 142 g', 48, 254);
  ctx.fillText('• Valeur en eau : μ₀ = 24 g', 48, 286);
  ctx.fillText('• Eau froide : m₀ = 200 g (θ₀ = 20 °C)', 48, 318);
  ctx.fillText('• Échantillon Cu : m_cu = 85 g', 48, 350);
  ctx.fillText('• Eau chauffée : m₁ = 120 g (θ₁ = 70 °C)', 48, 382);
  ctx.fillStyle = '#b45309';
  ctx.fillText('c_cu(table) ≈ 0.1 cal·g⁻¹·°C⁻¹', 48, 438);

  // Right Page: 1.2 Méthode électrique (Coefficient de Joule J = We / Q) + Figure 1
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 21px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('1.2 Méthode électrique · Coeff. de Joule', 554, 68);

  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillStyle = '#1d4ed8';
  ctx.fillText('We = U·I·t      Q = (m₀+μ₀)c₀(θf−θ₀)', 554, 118);
  ctx.fillStyle = '#b91c1c';
  ctx.fillText('J = We / Q  ≈  4.185 J/cal', 554, 156);

  // Mini Figure 1 schematic box
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.strokeRect(560, 190, 410, 190);
  ctx.font = '700 17px "JetBrains Mono", monospace';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('Fig. 1 : Générateur DC — Interrupteur K', 578, 224);
  ctx.fillText('Ampèremètre (A) série · Voltmètre (V) // R', 578, 256);
  ctx.fillText('Calorimètre adiabatique + Agitateur + θ', 578, 288);
  ctx.fillText('Durée : t = 3 min (180 s) · Agiter continu', 578, 326);

  // Measurement table grid from page 34
  ctx.strokeRect(560, 412, 410, 180);
  ctx.beginPath();
  ctx.moveTo(560, 468);
  ctx.lineTo(970, 468);
  ctx.moveTo(560, 528);
  ctx.lineTo(970, 528);
  ctx.stroke();
  ctx.fillText('U(V) | Calibre | I(A) | t(s) | θ₀ | θf', 576, 446);
  ctx.fillText('We (J)  |  Q (cal)  |  J ± ΔJ (J/cal)', 576, 504);
  ctx.fillStyle = '#475569';
  ctx.fillText('Matériel : Balance, Chrono, Gobelets, H₂O', 576, 566);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}
