import * as THREE from 'three';

/* Weltmaßstab: 1 Einheit = 1 cm.
   Biene ~1,3 · Halme 30–55 · Blüten 40–75 · Feldradius 700. */

export const WORLD = {
  fieldRadius: 700,      // Gelände
  grassNear: 200,        // dichtes Gras um den Ursprung (~12 000 Halme/m²)
  grassFar: 720,         // grobes Gras bis zum Dunst
  flowerRadius: 210,
  flightRadius: 140,     // Bewegungsraum der Biene
  altMin: 26,
  altMax: 48,
};

/* Palette der goldenen Stunde. Warmes Sonnenlicht gegen kühlen Himmelsschatten;
   der Mohn ist der einzige gesättigte Farbakzent im Bild. */
export const PALETTE = {
  sun:       0xFFC96B,  // Sonnenlicht
  haze:      0xE8B77A,  // Dunst am Horizont
  skyFill:   0x6E93B4,  // kühles Himmelslicht im Schatten
  bounce:    0x44521F,  // Rückwurf vom Boden
  grassTip:  0xA6CC46,  // durchleuchtete Halmspitze
  grassBase: 0x12301C,  // Halmgrund
  grassDry:  0xC2A150,  // vertrocknete Halme
  soil:      0x2A2A18,
  poppy:     0xE2452B,  // einziger gesättigter Akzent
  daisy:     0xF6EEDC,
  corn:      0x4A6FC4,
  dandel:    0xF2B62E,
};

export const SUN = {
  elevation: 4.2,   // Grad über dem Horizont
  azimuth: 168,     // Grad
};

export function sunDirection(elevationDeg = SUN.elevation, azimuthDeg = SUN.azimuth) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

export const QUALITY = {
  hoch:   { key: 'hoch',   label: 'hoch',   near: 155000, far: 78000, motes: 2200, dof: true,  bloom: true,  smaa: true,  pixelRatio: 2,   flowers: 1.0 },
  mittel: { key: 'mittel', label: 'mittel', near: 82000,  far: 42000, motes: 1300, dof: true,  bloom: true,  smaa: true,  pixelRatio: 1.5, flowers: 0.7 },
  niedrig:{ key: 'niedrig',label: 'niedrig',near: 38000,  far: 20000, motes: 600,  dof: false, bloom: true,  smaa: false, pixelRatio: 1,   flowers: 0.45 },
};

export function guessQuality() {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (mobile || mem <= 4 || cores <= 4) return QUALITY.niedrig;
  if (mem <= 8 && cores <= 8) return QUALITY.mittel;
  return QUALITY.hoch;
}

/* Geländehöhe — identisch in JS und GLSL (siehe glsl.js). */
export function terrainHeight(x, z) {
  return 9.0 * Math.sin(x * 0.0062) * Math.cos(z * 0.0054)
       + 4.5 * Math.sin(x * 0.0131 + 1.7) * Math.cos(z * 0.0112 - 0.4)
       + 2.0 * Math.sin((x + z) * 0.021);
}

export const WIND = {
  direction: new THREE.Vector2(0.86, 0.51).normalize(),
  strength: 0.38,
};
