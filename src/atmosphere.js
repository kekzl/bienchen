import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { PALETTE } from './config.js';

/* Himmel nach Rayleigh/Mie mit sehr tief stehender Sonne. Derselbe Himmel
   wird einmal in eine Cubemap gerendert und dient der Biene als Umgebungslicht –
   ohne das säßen ihre Augen und Flügel farblich nicht im Bild. */

/* Der Himmel liefert HDR-Werte, die rund um eine 4°-Sonne so groß werden,
   dass ACES sie nicht mehr rollt – das halbe Bild frisst aus. Deshalb ein
   Verstärkungsfaktor direkt am Shader-Ausgang. */
function tuneSky(sky, sunDir, gain = 0.42) {
  const u = sky.material.uniforms;
  u.turbidity.value = 4.2;
  u.rayleigh.value = 2.7;
  u.mieCoefficient.value = 0.0018;
  u.mieDirectionalG.value = 0.80;
  u.sunPosition.value.copy(sunDir);

  // Zarte Zirren in Sonnennähe
  u.cloudScale.value = 0.00026;
  u.cloudSpeed.value = 0.00007;
  u.cloudCoverage.value = 0.34;
  u.cloudDensity.value = 0.55;
  u.cloudElevation.value = 0.4;

  u.uGain = { value: gain };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main() {', 'uniform float uGain;\nvoid main() {')
    .replace('gl_FragColor = vec4( texColor, 1.0 );', 'gl_FragColor = vec4( texColor * uGain, 1.0 );');
  sky.material.needsUpdate = true;
  return sky;
}

export function createAtmosphere(renderer, scene, sunDir) {
  const sky = tuneSky(new Sky(), sunDir);
  sky.scale.setScalar(3000);
  sky.material.depthWrite = false;
  sky.material.depthTest = false;
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);

  // Umgebungslicht aus demselben Himmel
  const envScene = new THREE.Scene();
  const envSky = tuneSky(new Sky(), sunDir);
  envSky.scale.setScalar(100);
  envScene.add(envSky);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0, 0.1, 1000);
  scene.environment = target.texture;
  scene.environmentIntensity = 1.7;
  pmrem.dispose();
  envSky.geometry.dispose();
  envSky.material.dispose();

  scene.fog = new THREE.FogExp2(new THREE.Color(PALETTE.haze), 0.0016);

  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.sun), 3.6);
  key.position.copy(sunDir).multiplyScalar(500);
  scene.add(key);

  const fill = new THREE.HemisphereLight(new THREE.Color(PALETTE.skyFill), new THREE.Color(PALETTE.bounce), 0.55);
  scene.add(fill);

  return { sky, key, fill, envTarget: target };
}
