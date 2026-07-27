import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { NOISE, LIGHTING } from './glsl.js';
import { WORLD, PALETTE, terrainHeight } from './config.js';

/* Vier Arten, jede als eigenes InstancedMesh. Die Blütenblätter tragen
   dieselbe Durchleuchtung wie die Halme – im Gegenlicht glüht besonders
   der Mohn, er ist der einzige gesättigte Akzent im Bild. */

function tag(geo, color, trans, height) {
  geo.deleteAttribute('uv');
  const n = geo.attributes.position.count;
  const pos = geo.attributes.position;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  const sway = new Float32Array(n);
  const tr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    sway[i] = THREE.MathUtils.clamp(pos.getY(i) / height, 0, 1);
    tr[i] = trans;
  }
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1));
  geo.setAttribute('aTrans', new THREE.BufferAttribute(tr, 1));
  return geo;
}

/* Ein Blütenblatt: nach hinten gebogen, quer gemuldet, an der Basis schmal. */
function petal(len, wid, curve, cup, segs = 5) {
  const g = new THREE.PlaneGeometry(wid, len, 3, segs);
  g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = THREE.MathUtils.clamp(y / len, 0, 1);
    const taper = 0.3 + 0.95 * Math.sin(Math.PI * Math.min(t * 1.02, 1));
    p.setX(i, x * taper);
    p.setZ(i, -curve * t * t * len + cup * (x * x) / wid);
  }
  g.computeVertexNormals();
  return g;
}

function ring(count, build, radius, tiltDeg, y, jitter = 0) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const g = build(i);
    g.rotateX(THREE.MathUtils.degToRad(90 - tiltDeg) + (Math.random() - 0.5) * jitter);
    g.translate(0, 0, radius);
    g.rotateY((i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.18);
    g.translate(0, y, 0);
    parts.push(g);
  }
  return parts;
}

function stem(height, rTop, rBot) {
  const g = new THREE.CylinderGeometry(rTop, rBot, height, 5, 1);
  g.translate(0, height / 2, 0);
  return g;
}

function leaves(height, len, wid) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const g = petal(len, wid, 0.35, -0.15, 4);
    g.rotateX(THREE.MathUtils.degToRad(58));
    g.rotateY(i * Math.PI + Math.random());
    g.translate(0, height * (0.1 + Math.random() * 0.14), 0);
    out.push(g);
  }
  return out;
}

/* ── Arten ──────────────────────────────────────────────────── */

/* Maße nach der Natur, in cm: Margerite ~5 cm Blüte, Mohn ~9 cm,
   Kornblume ~4,5 cm, Löwenzahn ~4 cm. */

function margerite() {
  const h = 40;
  const parts = [
    tag(stem(h, 0.16, 0.24), 0x476E2A, 0.35, h),
    ...leaves(h, 4.5, 1.0).map(g => tag(g, 0x476E2A, 0.5, h)),
    ...ring(18, () => petal(2.4, 0.72, 0.14, -0.45), 0.55, 16, h)
      .map(g => tag(g, PALETTE.daisy, 1.0, h)),
    tag(new THREE.SphereGeometry(0.72, 12, 8).scale(1, 0.55, 1).translate(0, h + 0.12, 0), 0xE8B12C, 0.25, h),
  ];
  return { geo: mergeGeometries(parts), height: h + 0.5 };
}

function mohn() {
  const h = 54;
  const parts = [
    tag(stem(h, 0.17, 0.26), 0x516428, 0.35, h),
    ...leaves(h, 5.0, 0.9).map(g => tag(g, 0x516428, 0.5, h)),
    ...ring(5, () => petal(4.3, 4.0, 0.3, -0.6, 6), 0.6, 33, h, 0.25)
      .map(g => tag(g, PALETTE.poppy, 1.7, h)),
    ...ring(4, () => petal(3.5, 3.4, 0.34, -0.55, 6), 0.42, 50, h + 0.5, 0.25)
      .map(g => tag(g, PALETTE.poppy, 1.7, h)),
    tag(new THREE.SphereGeometry(0.8, 12, 8).scale(1, 0.7, 1).translate(0, h + 0.25, 0), 0x1A1410, 0.05, h),
  ];
  return { geo: mergeGeometries(parts), height: h + 1 };
}

function kornblume() {
  const h = 38;
  const parts = [
    tag(stem(h, 0.14, 0.2), 0x687C4C, 0.35, h),
    ...ring(14, () => petal(2.2, 0.66, 0.1, -0.9, 4), 0.5, 52, h, 0.35)
      .map(g => tag(g, PALETTE.corn, 1.3, h)),
    ...ring(8, () => petal(1.3, 0.5, 0.1, -0.8, 3), 0.26, 26, h + 0.16, 0.4)
      .map(g => tag(g, 0x2C4795, 0.9, h)),
    tag(new THREE.SphereGeometry(0.55, 10, 8).scale(1, 0.9, 1).translate(0, h, 0), 0x24336B, 0.2, h),
  ];
  return { geo: mergeGeometries(parts), height: h + 0.5 };
}

function loewenzahn() {
  const h = 23;
  const parts = [
    tag(stem(h, 0.18, 0.22), 0x577230, 0.35, h),
    ...ring(20, () => petal(1.55, 0.44, 0.05, -0.3, 3), 0.8, 12, h, 0.5)
      .map(g => tag(g, PALETTE.dandel, 1.4, h)),
    ...ring(12, () => petal(1.1, 0.4, 0.05, -0.3, 3), 0.42, 34, h + 0.14, 0.5)
      .map(g => tag(g, 0xF5C948, 1.4, h)),
    tag(new THREE.SphereGeometry(0.7, 10, 8).scale(1, 0.5, 1).translate(0, h, 0), 0xE0A424, 0.4, h),
  ];
  return { geo: mergeGeometries(parts), height: h + 0.4 };
}

/* ── Material ───────────────────────────────────────────────── */

function flowerMaterial(shared) {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...shared },
    vertexShader: /* glsl */`
      ${NOISE}
      attribute vec3  aColor;
      attribute float aSway;
      attribute float aTrans;
      uniform float uTime;
      uniform vec2  uWindDir;
      uniform float uWind;
      varying vec3  vWorld;
      varying vec3  vNormal;
      varying vec3  vColor;
      varying float vTrans;
      varying float vSway;

      void main(){
        mat4 im = modelMatrix * instanceMatrix;
        vec2 basePos = im[3].xz;
        float rnd = hash12(basePos * 1.117 + 5.9);

        vec3 wp = (im * vec4(position, 1.0)).xyz;
        float stalk = length(im[1].xyz);

        // Blüten sind steifer als Gras, schwingen aber nach.
        float gust    = fbm(basePos * 0.0032 - uWindDir * uTime * 0.10);
        float flutter = sin(uTime * 2.2 + rnd * 30.0);
        float amp = uWind * (0.22 + gust * 0.72 + 0.18 * flutter) * 0.6;
        float bend = amp * aSway * aSway;

        wp.xz += uWindDir * bend * stalk * 40.0;
        wp.y  -= bend * bend * stalk * 24.0;

        vNormal = normalize(mat3(im) * normal);
        vWorld  = wp;
        vColor  = aColor;
        vTrans  = aTrans;
        vSway   = aSway;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${LIGHTING}
      varying vec3  vWorld;
      varying vec3  vNormal;
      varying vec3  vColor;
      varying float vTrans;
      varying float vSway;

      void main(){
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        vec3 L = uSunDir;

        float sh = cloudShadow(vWorld.xz);
        float ao = mix(0.28, 1.0, pow(vSway, 0.7));

        float wrap = 0.35;
        float diff = clamp((dot(N, L) + wrap) / (1.0 + wrap), 0.0, 1.0);

        vec3 col = vColor * uSunColor * diff * sh * ao;
        col += vColor * hemiLight(N) * ao;

        // Durchleuchtete Blütenblätter
        float back = pow(clamp(dot(V, -L), 0.0, 1.0), 2.2);
        col += vColor * uSunColor * back * vTrans * sh * 0.9;

        vec3 H = normalize(L + V);
        col += uSunColor * pow(clamp(dot(N, H), 0.0, 1.0), 26.0) * 0.12 * sh;

        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }
    `,
  });
}

/* ── Aussaat ────────────────────────────────────────────────── */

function scatter(count, radius, clumps) {
  const pts = [];
  const centers = [];
  for (let i = 0; i < clumps; i++) {
    const r = Math.sqrt(Math.random()) * radius;
    const a = Math.random() * Math.PI * 2;
    centers.push([Math.cos(a) * r, Math.sin(a) * r, 14 + Math.random() * 34]);
  }
  for (let i = 0; i < count; i++) {
    if (clumps > 0 && Math.random() < 0.75) {
      const c = centers[(Math.random() * centers.length) | 0];
      const a = Math.random() * Math.PI * 2;
      const d = Math.abs(Math.random() + Math.random() - 1) * c[2];
      pts.push([c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d]);
    } else {
      const r = Math.sqrt(Math.random()) * radius;
      const a = Math.random() * Math.PI * 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  return pts;
}

const SPECIES = [
  { build: margerite,  count: 520, clumps: 16, radius: 1.0 },
  { build: mohn,       count: 165, clumps: 8,  radius: 0.9 },
  { build: kornblume,  count: 290, clumps: 11, radius: 0.95 },
  { build: loewenzahn, count: 430, clumps: 20, radius: 1.0 },
];

export function createFlowers(shared, densityScale) {
  const group = new THREE.Group();
  const material = flowerMaterial(shared);
  const heads = [];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  for (const spec of SPECIES) {
    const { geo, height } = spec.build();
    const count = Math.max(12, Math.round(spec.count * densityScale));
    const mesh = new THREE.InstancedMesh(geo, material, count);
    const pts = scatter(count, WORLD.flowerRadius * spec.radius, spec.clumps);

    for (let i = 0; i < count; i++) {
      const [x, z] = pts[i];
      const scale = 0.72 + Math.random() * 0.6;
      p.set(x, terrainHeight(x, z) - 1, z);
      e.set((Math.random() - 0.5) * 0.22, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.22);
      q.setFromEuler(e);
      s.setScalar(scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);

      // Anflugpunkt für die Biene: knapp über der Blüte
      heads.push(new THREE.Vector3(x, p.y + height * scale + 2.5, z));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    group.add(mesh);
  }

  return { group, heads };
}
