import * as THREE from 'three';
import { NOISE, LIGHTING } from './glsl.js';
import { WORLD, PALETTE, terrainHeight } from './config.js';

/* Das Herzstück: Halme als InstancedMesh, gebogen und im Wind bewegt im
   Vertex-Shader, im Fragment-Shader von der tiefstehenden Sonne durchleuchtet.
   Die Durchleuchtung (uTrans) ist das, was die Wiese leuchten lässt. */

function bladeGeometry(segments) {
  const position = [];
  const aSway = [];
  const aSide = [];
  const index = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w = 0.5 * Math.pow(1 - t, 0.5);
    position.push(-w, t, 0); aSway.push(t); aSide.push(-1);
    position.push(w, t, 0); aSway.push(t); aSide.push(1);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    index.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute('aSway', new THREE.Float32BufferAttribute(aSway, 1));
  geo.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

function grassMaterial(shared, { trans, bend }) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...shared,
      uColBase:  { value: new THREE.Color(PALETTE.grassBase) },
      uColTip:   { value: new THREE.Color(PALETTE.grassTip) },
      uColDry:   { value: new THREE.Color(PALETTE.grassDry) },
      uTransCol: { value: new THREE.Color(0x8FD24A) },
      uTrans:    { value: trans },
      uBendScale:{ value: bend },
    },
    vertexShader: /* glsl */`
      ${NOISE}
      attribute float aSway;
      attribute float aSide;
      uniform float uTime;
      uniform vec2  uWindDir;
      uniform float uWind;
      uniform float uBendScale;
      varying float vSway;
      varying float vRnd;
      varying vec3  vWorld;
      varying vec3  vNormal;

      void main(){
        mat4 im = modelMatrix * instanceMatrix;
        vec2 basePos = im[3].xz;
        float rnd  = hash12(basePos * 0.7317 + 3.1);
        float rnd2 = hash12(basePos * 1.9130 - 7.7);

        float t = aSway;
        float bladeH = length(im[1].xyz);
        vec3 right   = normalize(im[0].xyz);
        vec3 forward = normalize(im[2].xyz);

        // Eigenbogen jedes Halms – Wiesengras steht nicht senkrecht, es überhängt.
        // Die lokale Z-Achse wird nicht mit der Höhe skaliert, also hier von Hand.
        float arc = (0.30 + rnd * 0.55) * uBendScale;
        vec3 lp = position;
        lp.z += arc * t * t * bladeH;
        lp.y -= arc * arc * t * t * 0.42;

        vec3 wp = (im * vec4(lp, 1.0)).xyz;

        // Wind: wandernde Böen plus schnelles Flattern
        float gust    = fbm(basePos * 0.0032 - uWindDir * uTime * 0.10);
        float flutter = sin(uTime * 3.6 + rnd2 * 40.0 + dot(basePos, vec2(0.055, 0.041)));
        float amp  = uWind * (0.30 + gust * 1.25 + 0.22 * flutter);
        float bend = amp * t * t;

        wp.xz += uWindDir * bend * bladeH;
        wp.y  -= bend * bend * bladeH * 0.5;

        // Halmfläche kippt beim Biegen auf, quer ist sie gerundet
        float theta = (arc + amp) * 1.5 * t;
        vec3 nLocal = normalize(vec3(aSide * 0.5, sin(theta), cos(theta)));
        vNormal = normalize(nLocal.x * right + nLocal.y * vec3(0.0, 1.0, 0.0) + nLocal.z * forward);

        vSway  = t;
        vRnd   = rnd;
        vWorld = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${LIGHTING}
      uniform vec3  uColBase;
      uniform vec3  uColTip;
      uniform vec3  uColDry;
      uniform vec3  uTransCol;
      uniform float uTrans;
      varying float vSway;
      varying float vRnd;
      varying vec3  vWorld;
      varying vec3  vNormal;

      void main(){
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        vec3 L = uSunDir;

        float sh = cloudShadow(vWorld.xz);
        float ao = mix(0.13, 1.0, pow(vSway, 0.8));

        vec3 base = mix(uColBase, uColTip, pow(vSway, 1.35));
        base = mix(base, uColDry, smoothstep(0.74, 1.0, vRnd) * 0.5 * vSway);
        base *= 0.84 + 0.34 * hash12(vec2(vRnd * 91.7, 4.3));

        float wrap = 0.34;
        float diff = clamp((dot(N, L) + wrap) / (1.0 + wrap), 0.0, 1.0);

        vec3 col = base * uSunColor * diff * sh * ao;
        col += base * hemiLight(N) * ao;

        // Gegenlicht durch das Blatt
        float back = pow(clamp(dot(V, -L), 0.0, 1.0), 3.0);
        col += uTransCol * uSunColor * back * pow(vSway, 1.5) * sh * uTrans;

        // schmaler Glanz auf der Halmfläche
        vec3 H = normalize(L + V);
        col += uSunColor * pow(clamp(dot(N, H), 0.0, 1.0), 30.0) * 0.10 * sh * vSway;

        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }
    `,
  });
}

function fillField(mesh, count, rMin, rMax, height, width) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const span = rMax * rMax - rMin * rMin;

  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(rMin * rMin + Math.random() * span);
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    // Büschelbildung: etwas Rauschen auf die Höhe, sonst wirkt es gemäht
    const clump = 0.86 + 0.28 * Math.abs(Math.sin(x * 0.021) * Math.cos(z * 0.017) + Math.sin((x + z) * 0.009));
    const h = height * (0.72 + Math.random() * 0.56) * clump;
    const w = width * (0.75 + Math.random() * 0.55);

    p.set(x, terrainHeight(x, z) - 0.5, z);
    q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
    s.set(w, h, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export function createNearGrass(shared, count) {
  const mesh = new THREE.InstancedMesh(bladeGeometry(5), grassMaterial(shared, { trans: 1.0, bend: 1.0 }), count);
  fillField(mesh, count, 0, WORLD.grassNear, 34, 1.9);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}

export function createFarGrass(shared, count) {
  const mesh = new THREE.InstancedMesh(bladeGeometry(3), grassMaterial(shared, { trans: 0.85, bend: 0.9 }), count);
  fillField(mesh, count, WORLD.grassNear * 0.9, WORLD.grassFar, 48, 5.5);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return mesh;
}
