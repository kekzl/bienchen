import * as THREE from 'three';
import { PALETTE, WIND } from './config.js';

/* Gemeinsame GLSL-Bausteine für Gelände, Gras und Blüten.
   Alle Materialien rechnen linear und geben HDR aus – Tonemapping und
   Farbraum erledigt der OutputPass am Ende der Kette. */

export const NOISE = /* glsl */`
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i),               hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0,1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
`;

export const TERRAIN = /* glsl */`
float terrainH(vec2 p){
  return 9.0 * sin(p.x * 0.0062) * cos(p.y * 0.0054)
       + 4.5 * sin(p.x * 0.0131 + 1.7) * cos(p.y * 0.0112 - 0.4)
       + 2.0 * sin((p.x + p.y) * 0.021);
}
`;

/* Beleuchtung: eine Sonne, ein Himmelshalbraum, ziehende Wolkenschatten,
   Dunst der zur Sonne hin aufglüht. */
export const LIGHTING = /* glsl */`
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyColor;
uniform vec3  uBounceColor;
uniform vec3  uFogColor;
uniform float uFogDensity;
uniform float uTime;

float cloudShadow(vec2 wp){
  vec2 q = wp * 0.00085 + vec2(uTime * 0.0075, uTime * 0.0031);
  float n = fbm(q);
  return 0.42 + 0.58 * smoothstep(0.28, 0.66, n);
}

vec3 hemiLight(vec3 n){
  return mix(uBounceColor, uSkyColor, n.y * 0.5 + 0.5);
}

vec3 applyFog(vec3 col, vec3 worldPos){
  vec3 toCam = cameraPosition - worldPos;
  float dist = length(toCam);
  vec3 viewDir = -toCam / max(dist, 1e-4);
  float f = 1.0 - exp(-pow(dist * uFogDensity, 1.7));
  // Zur Sonne hin glüht der Dunst auf – aber dosiert, sonst frisst er das Bild.
  float glow = pow(clamp(dot(viewDir, uSunDir), 0.0, 1.0), 9.0);
  vec3 fogCol = mix(uFogColor, uSunColor * 0.22, glow * 0.45);
  return mix(col, fogCol, clamp(f, 0.0, 1.0));
}
`;

/* Ein einziges Uniform-Objekt, das sich alle Wiesenmaterialien teilen –
   eine Änderung wirkt sofort überall. */
export function createSharedUniforms(sunDir) {
  return {
    uTime:        { value: 0 },
    uSunDir:      { value: sunDir.clone() },
    uSunColor:    { value: new THREE.Color(PALETTE.sun).multiplyScalar(3.1) },
    uSkyColor:    { value: new THREE.Color(PALETTE.skyFill).multiplyScalar(0.50) },
    uBounceColor: { value: new THREE.Color(PALETTE.bounce).multiplyScalar(0.30) },
    uFogColor:    { value: new THREE.Color(PALETTE.haze).multiplyScalar(0.85) },
    uFogDensity:  { value: 0.0012 },
    uWindDir:     { value: WIND.direction.clone() },
    uWind:        { value: WIND.strength },
  };
}
