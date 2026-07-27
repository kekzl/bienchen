import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { WORLD, QUALITY, guessQuality, sunDirection, SUN, WIND } from './config.js';
import { createSharedUniforms } from './glsl.js';
import { createAtmosphere } from './atmosphere.js';
import { createTerrain } from './terrain.js';
import { createNearGrass, createFarGrass } from './grass.js';
import { createFlowers } from './flowers.js';
import { createMotes } from './motes.js';
import { createBee } from './bee.js';
import { Flight } from './flight.js';
import { Director } from './director.js';
import { createPipeline } from './post.js';

const $ = (id) => document.getElementById(id);
const frame = () => new Promise(requestAnimationFrame);
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = $('stage');
const statusEl = $('loader-status');
const loader = $('loader');

/* ── Ladeanzeige: sieben Waben, eine je Aufbauschritt ────────── */

const STEPS = [
  'Renderer und Himmel',
  'Gelände',
  'Gras, nah',
  'Gras, fern',
  'Blüten',
  'Biene und Pollen',
  'Licht und Optik',
];

const comb = $('comb');
const HEX = [[0, 0], [1, 0], [-1, 0], [0.5, -1], [-0.5, -1], [0.5, 1], [-0.5, 1]];
const hexes = HEX.map(([hx, hy]) => {
  const el = document.createElement('i');
  el.style.left = `${30.5 + hx * 26}px`;
  el.style.top = `${31.7 + hy * 22.5}px`;
  comb.appendChild(el);
  return el;
});

let stepIndex = 0;
async function step(label, fn) {
  statusEl.textContent = label;
  // Zwei Bilder Pause, damit der Schritt sichtbar wird, bevor er den Faden blockiert.
  if (!new URLSearchParams(location.search).has('fast')) { await frame(); await frame(); }
  const result = await fn();
  hexes[stepIndex++].dataset.filled = '';
  return result;
}

function fail(message) {
  loader.dataset.done = '';
  const crash = $('crash');
  crash.hidden = false;
  $('crash-body').textContent = message;
  document.title = `Fehler — ${message}`;
}

addEventListener('error', (e) => fail(String(e.message || e.error)));
addEventListener('unhandledrejection', (e) => fail(String(e.reason?.message || e.reason)));

/* ── Aufbau ─────────────────────────────────────────────────── */

let renderer, scene, camera, pipeline, controls;
let flight, director, bee, terrain, sky;
let meadow = null;

/* ?q=niedrig|mittel|hoch und ?shot=verfolgung|flanke|halmspitzen|makro|weite
   erzwingen Qualität bzw. Einstellung – praktisch zum Vergleichen. */
const params = new URLSearchParams(location.search);
let quality = QUALITY[params.get('q')] ?? guessQuality();
let qualityLocked = params.has('q');
const shared = createSharedUniforms(sunDirection());

/* Die Wiese entsteht in vier Portionen – genau den vier Waben, die die
   Ladeanzeige dafür füllt. */
function newMeadow() {
  const group = new THREE.Group();
  scene.add(group);
  return { group, motes: null, heads: [], blades: 0 };
}

const MEADOW_PARTS = [
  (m) => { m.group.add(createNearGrass(shared, quality.near)); m.blades += quality.near; },
  (m) => { m.group.add(createFarGrass(shared, quality.far)); m.blades += quality.far; },
  (m) => { const { group, heads } = createFlowers(shared, quality.flowers); m.group.add(group); m.heads = heads; },
  (m) => { m.motes = createMotes(quality.motes, shared); m.group.add(m.motes); },
];

function buildMeadow() {
  const m = newMeadow();
  for (const part of MEADOW_PARTS) part(m);
  return m;
}

function disposeMeadow(m) {
  m.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mat => mat.dispose());
  });
  scene.remove(m.group);
}

function buildPipeline() {
  pipeline?.dispose();
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
  pipeline = createPipeline(renderer, scene, camera, quality);
  pipeline.setSize(innerWidth, innerHeight);
}

async function boot() {
  await step(STEPS[0], async () => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    if (!renderer.capabilities.isWebGL2) throw new Error('WebGL 2 fehlt');
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.25, 4000);
    camera.position.set(0, 80, 30);

    ({ sky } = createAtmosphere(renderer, scene, shared.uSunDir.value));
  });

  await step(STEPS[1], () => { terrain = createTerrain(shared); scene.add(terrain); });

  meadow = newMeadow();
  await step(STEPS[2], () => MEADOW_PARTS[0](meadow));
  await step(STEPS[3], () => MEADOW_PARTS[1](meadow));
  await step(STEPS[4], () => MEADOW_PARTS[2](meadow));

  await step(STEPS[5], () => {
    MEADOW_PARTS[3](meadow);
    bee = createBee(shared);
    scene.add(bee);
    flight = new Flight(meadow.heads);
  });

  await step(STEPS[6], () => {
    director = new Director(camera, calm);
    flight.update(1 / 60, 0);
    director.cut(director.indexOf(params.get('shot')));
    director.locked = params.has('shot');
    buildPipeline();

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.5;
    controls.maxDistance = 400;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.enabled = false;
  });

  loader.dataset.done = '';
  setTimeout(() => { loader.remove(); }, 1200);
  for (const el of [$('plate'), $('log'), $('keys')]) el.hidden = false;

  addEventListener('resize', onResize);
  addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onPointer);
  renderer.setAnimationLoop(tick);
}

/* ── Bedienung ──────────────────────────────────────────────── */

let orbit = false;
let hudVisible = true;
let idleTimer = 0;

function setOrbit(on) {
  orbit = on;
  controls.enabled = on;
  if (on) {
    controls.target.copy(flight.pos);
    controls.update();
  } else {
    director.cut(director.index);
  }
  note(on ? 'Kamera folgt der Maus' : director.shot.label);
}

function setQuality(next) {
  if (next.key === quality.key) return;
  quality = next;
  qualityLocked = true;
  disposeMeadow(meadow);
  meadow = buildMeadow();
  scene.add(meadow.group);
  flight.heads = meadow.heads.filter(h => Math.hypot(h.x, h.z) < WORLD.flightRadius);
  buildPipeline();
  note(`Qualität ${next.label}`);
}

function onKey(e) {
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); if (!orbit) director.cut(); note(director.shot.label); }
  else if (k === 'o') setOrbit(!orbit);
  else if (k === 'r') { flight.reset(); note('Neue Flugroute'); }
  else if (k === 'h') { hudVisible = !hudVisible; for (const el of [$('plate'), $('log'), $('keys')]) el.hidden = !hudVisible; }
  else if (k === '1') setQuality(QUALITY.niedrig);
  else if (k === '2') setQuality(QUALITY.mittel);
  else if (k === '3') setQuality(QUALITY.hoch);
  else return;
  wake();
}

function onPointer() {
  wake();
  if (!orbit) { director.cut(); note(director.shot.label); }
}

function wake() { idleTimer = 0; $('keys').removeAttribute('data-idle'); }

let noteUntil = 0, noteText = '';
function note(text) { noteText = text; noteUntil = performance.now() + 2200; }

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  pipeline.setSize(innerWidth, innerHeight);
}

/* ── Bildschleife ───────────────────────────────────────────── */

const clock = new THREE.Clock();
let hudAt = 0, fpsAvg = 60, frames = 0, fpsSince = 0, downgradeAt = 4;

const compass = ['N', 'NNO', 'NO', 'ONO', 'O', 'OSO', 'SO', 'SSO', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const windFrom = compass[Math.round((((Math.atan2(WIND.direction.x, -WIND.direction.y) * 180 / Math.PI) + 180 + 360) % 360) / 22.5) % 16];
const windLabel = `aus ${windFrom} · frisch`;

function tick() {
  const dt = THREE.MathUtils.clamp(clock.getDelta(), 1 / 240, 0.05);
  const t = clock.elapsedTime;

  shared.uTime.value = t;
  sky.material.uniforms.time.value = t;
  // Böen kommen und gehen
  shared.uWind.value = WIND.strength * (0.72 + 0.42 * Math.sin(t * 0.19) * Math.sin(t * 0.071 + 1.3));

  flight.update(dt, t);
  flight.applyTo(bee, t);
  bee.userData.update(t);

  if (orbit) {
    controls.target.lerp(flight.pos, Math.min(1, dt * 4));
    controls.update();
    if (pipeline.bokeh) {
      pipeline.bokeh.uniforms.focus.value = camera.position.distanceTo(flight.pos);
      pipeline.bokeh.uniforms.aperture.value = 0.00035;
    }
  } else {
    director.update(dt, t, flight);
    if (pipeline.bokeh) {
      pipeline.bokeh.uniforms.focus.value = director.focus;
      pipeline.bokeh.uniforms.aperture.value = director.aperture;
    }
  }

  meadow.motes.userData.sync(camera, renderer.domElement.height);
  pipeline.grade.uniforms.uTime.value = t;
  pipeline.composer.render();

  /* Messwerte, Einblendungen, Notbremse */
  frames++;
  if (t - fpsSince > 0.5) {
    fpsAvg = fpsAvg * 0.5 + (frames / (t - fpsSince)) * 0.5;
    frames = 0; fpsSince = t;
  }
  if (!qualityLocked && t > downgradeAt && fpsAvg < 38) {
    downgradeAt = t + 6;
    const next = quality.key === 'hoch' ? QUALITY.mittel : quality.key === 'mittel' ? QUALITY.niedrig : null;
    if (next) { const locked = qualityLocked; setQuality(next); qualityLocked = locked; }
  }

  idleTimer += dt;
  if (idleTimer > 7) $('keys').dataset.idle = '';

  if (hudVisible && t - hudAt > 0.25) {
    hudAt = t;
    const shotLabel = performance.now() < noteUntil ? noteText : (orbit ? 'Kamera folgt der Maus' : `${director.shot.label} · ${flight.stateLabel}`);
    $('log-shot').textContent = shotLabel;
    $('log-sun').textContent = `${SUN.elevation.toFixed(1).replace('.', ',')}° über dem Horizont`;
    $('log-wind').textContent = windLabel;
    $('log-blades').textContent = meadow.blades.toLocaleString('de-DE');
    $('log-fps').textContent = Math.round(fpsAvg);
  }
}

boot().catch((err) => {
  console.error(err);
  fail(`${err.message}. Diese Szene braucht WebGL 2 mit aktivierter Hardwarebeschleunigung.`);
});
