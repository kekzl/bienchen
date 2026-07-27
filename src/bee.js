import * as THREE from 'three';
import { NOISE } from './glsl.js';

/* Die Biene, komplett aus Geometrie gebaut – kein externes Modell.
   Blickrichtung ist +Z. Maßstab: 1 Einheit = 1 cm, Körperlänge ~1,4.

   Zwei Dinge tragen den Eindruck: der additive Flaum-Saum, der im Gegenlicht
   als Behaarung liest, und die Flügel, die als drei phasenversetzte Kopien
   den Schlagbogen andeuten statt zu stroboskopieren. */

const FLAP_HZ = 17.5;

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  const amber = '#E9A63A', dark = '#1B1410', brown = '#3A2A18';
  const stops = [
    [0.00, brown], [0.08, brown], [0.13, amber], [0.26, amber],
    [0.31, dark], [0.42, dark], [0.47, amber], [0.58, amber],
    [0.63, dark], [0.74, dark], [0.79, amber], [0.88, amber],
    [0.94, dark], [1.00, dark],
  ];
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function limb(mat, a, b, rA, rB) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rB, rA, len, 5, 1);
  g.translate(0, len / 2, 0);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function wingGeometry(len, wid) {
  const g = new THREE.PlaneGeometry(1, 1, 14, 4);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5;          // 0 Wurzel .. 1 Spitze
    const v = p.getZ(i);                // Sehne
    const outline = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.5)), 0.7);
    p.setX(i, u * len);
    p.setZ(i, v * wid * outline + 0.16 * u * u * wid);
    p.setY(i, Math.sin(u * Math.PI) * 0.035 * len);
  }
  g.computeVertexNormals();
  return g;
}

function wingMaterial(shared, alpha) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uAlpha: { value: alpha },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform float uAlpha;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormal;

      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vNormal);
        if (dot(N, V) < 0.0) N = -N;

        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.2);
        float back = pow(clamp(dot(V, -uSunDir), 0.0, 1.0), 2.0);

        // Dünnschichtfarben der Flügelhaut – angedeutet, nicht ausgestellt
        float f = fres * 3.1 + vUv.x * 0.9 + vUv.y * 0.5;
        vec3 irid = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + f));
        irid = mix(vec3(1.0), irid, 0.4);

        // Adern
        float veins = 0.0;
        veins += smoothstep(0.035, 0.0, abs(vUv.y - 0.30 - 0.10 * sin(vUv.x * 6.0)));
        veins += smoothstep(0.030, 0.0, abs(vUv.y - 0.62 + 0.09 * sin(vUv.x * 4.0)));
        veins += smoothstep(0.026, 0.0, abs(vUv.y - 0.88 + 0.06 * vUv.x));
        veins += smoothstep(0.020, 0.0, abs(vUv.x - 0.98));
        veins = clamp(veins, 0.0, 1.0);

        vec3 col = irid * (0.28 + fres * 1.2) * uSunColor * 0.12;
        col += uSunColor * back * 0.55;
        col = mix(col, vec3(0.05, 0.04, 0.03), veins * 0.7);

        float a = (0.13 + fres * 0.42 + back * 0.28 + veins * 0.40) * uAlpha;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }
    `,
  });
}

function fuzzMaterial(shared, color, amount) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uColor: { value: new THREE.Color(color) },
      uAmount: { value: amount },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vLocal;
      void main(){
        vLocal = normalize(position);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE}
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform vec3  uColor;
      uniform float uAmount;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vLocal;

      void main(){
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vNormal);
        float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 1.5);
        float back = pow(clamp(dot(V, -uSunDir), 0.0, 1.0), 1.5);

        /* Ohne Struktur wäre das ein sauberer Lichtring statt Behaarung –
           deshalb büschelweise Rauschen über die Oberfläche. */
        float tuft = fbm(vec2(atan(vLocal.z, vLocal.x) * 11.0, vLocal.y * 19.0));
        tuft *= fbm(vec2(vLocal.x * 26.0, vLocal.z * 26.0)) + 0.35;
        tuft = 0.18 + 1.5 * tuft;

        float a = fres * tuft * (0.16 + back * 0.9) * uAmount;
        vec3 col = uColor * uSunColor * (0.35 + back * 1.6);
        gl_FragColor = vec4(col * a, a);
      }
    `,
  });
}

export function createBee(shared) {
  const bee = new THREE.Group();

  const chitin = new THREE.MeshStandardMaterial({ color: 0x241A12, roughness: 0.62, metalness: 0.05 });
  const thoraxMat = new THREE.MeshStandardMaterial({ color: 0x8A6229, roughness: 0.94, metalness: 0.0 });
  const abdomenMat = new THREE.MeshStandardMaterial({ map: stripeTexture(), roughness: 0.5, metalness: 0.04 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x2C2118, roughness: 0.22, metalness: 0.15 });
  const pollenMat = new THREE.MeshStandardMaterial({ color: 0xE9B22C, roughness: 0.95 });

  // Hinterleib: Pole zeigen nach ±Z, damit die Binden quer zum Körper laufen
  const abdGeo = new THREE.SphereGeometry(1, 30, 22);
  abdGeo.rotateX(Math.PI / 2);
  abdGeo.scale(0.30, 0.29, 0.50);
  const abdomen = new THREE.Mesh(abdGeo, abdomenMat);
  abdomen.position.set(0, -0.02, -0.44);
  abdomen.rotation.x = -0.16;
  bee.add(abdomen);

  const thoraxGeo = new THREE.SphereGeometry(1, 26, 18).scale(0.31, 0.30, 0.33);
  const thorax = new THREE.Mesh(thoraxGeo, thoraxMat);
  thorax.position.set(0, 0.02, 0.14);
  bee.add(thorax);

  const headGeo = new THREE.SphereGeometry(1, 22, 16).scale(0.23, 0.22, 0.19);
  const head = new THREE.Mesh(headGeo, chitin);
  head.position.set(0, 0.0, 0.55);
  bee.add(head);

  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12).scale(0.085, 0.145, 0.10), eyeMat);
    eye.position.set(s * 0.165, 0.03, 0.58);
    eye.rotation.z = s * 0.22;
    bee.add(eye);

    // Fühler
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 0.07, 0.09, 0.68),
      new THREE.Vector3(s * 0.16, 0.20, 0.82),
      new THREE.Vector3(s * 0.27, 0.20, 0.96),
      new THREE.Vector3(s * 0.34, 0.13, 1.02),
    ]);
    bee.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.014, 5, false), chitin));
  }

  // Beine, im Flug angezogen; das hintere Paar trägt Pollenhöschen
  const legPlan = [
    { z: 0.34, out: 0.20, drop: 0.22, back: 0.16 },
    { z: 0.14, out: 0.24, drop: 0.26, back: 0.24 },
    { z: -0.06, out: 0.26, drop: 0.28, back: 0.34 },
  ];
  const legs = new THREE.Group();
  legPlan.forEach((plan, i) => {
    for (const s of [-1, 1]) {
      const root = new THREE.Vector3(s * 0.13, -0.14, plan.z);
      const knee = new THREE.Vector3(s * (0.13 + plan.out), -0.14 - plan.drop * 0.55, plan.z - plan.back * 0.4);
      const foot = new THREE.Vector3(s * (0.13 + plan.out * 0.75), -0.14 - plan.drop, plan.z - plan.back);
      const leg = new THREE.Group();
      leg.add(limb(chitin, root, knee, 0.035, 0.024));
      leg.add(limb(chitin, knee, foot, 0.024, 0.013));
      if (i === 2) {
        const basket = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10).scale(0.055, 0.075, 0.055), pollenMat);
        basket.position.copy(knee).lerp(foot, 0.42);
        leg.add(basket);
      }
      leg.userData.phase = i * 1.1 + (s > 0 ? 0.5 : 0);
      legs.add(leg);
    }
  });
  bee.add(legs);

  // Flaum
  const fuzz = new THREE.Group();
  const thoraxFuzz = new THREE.Mesh(thoraxGeo.clone().scale(1.17, 1.19, 1.14), fuzzMaterial(shared, 0xFFD08A, 0.75));
  thoraxFuzz.position.copy(thorax.position);
  fuzz.add(thoraxFuzz);
  const abdFuzz = new THREE.Mesh(abdGeo.clone().scale(1.09, 1.10, 1.05), fuzzMaterial(shared, 0xFFC070, 0.40));
  abdFuzz.position.copy(abdomen.position);
  abdFuzz.rotation.copy(abdomen.rotation);
  fuzz.add(abdFuzz);
  const headFuzz = new THREE.Mesh(headGeo.clone().scale(1.13, 1.15, 1.13), fuzzMaterial(shared, 0xFFC98A, 0.45));
  headFuzz.position.copy(head.position);
  fuzz.add(headFuzz);
  fuzz.renderOrder = 4;
  bee.add(fuzz);

  /* Flügel: zwei Paare, je drei phasenversetzte Kopien für den Schlagbogen. */
  const foreGeo = wingGeometry(1.22, 0.44);
  const hindGeo = wingGeometry(0.78, 0.34);
  // Nachzügler im Schlagzyklus: sie zeichnen den Bogen, statt zu stroboskopieren
  const GHOSTS = [
    { lag: 0.0, alpha: 1.0 },
    { lag: 0.70, alpha: 0.36 },
    { lag: 1.35, alpha: 0.19 },
  ];

  const wings = [];
  for (const s of [-1, 1]) {
    for (const kind of ['fore', 'hind']) {
      const slot = new THREE.Group();
      const fore = kind === 'fore';
      slot.position.set(s * 0.12, fore ? 0.24 : 0.19, fore ? 0.20 : 0.02);
      slot.rotation.y = s < 0 ? Math.PI : 0;
      bee.add(slot);

      const arms = GHOSTS.map(g => {
        const arm = new THREE.Group();
        const mesh = new THREE.Mesh(fore ? foreGeo : hindGeo, wingMaterial(shared, g.alpha));
        mesh.renderOrder = 6;
        arm.add(mesh);
        slot.add(arm);
        return { arm, lag: g.lag };
      });
      wings.push({ arms, fore, side: s });
    }
  }

  bee.userData.update = (t) => {
    for (const w of wings) {
      for (const { arm, lag } of w.arms) {
        const ph = (t - lag / (FLAP_HZ * 2 * Math.PI)) * FLAP_HZ * Math.PI * 2;
        const flap = Math.sin(ph);
        arm.rotation.z = (w.fore ? 0.10 : 0.02) + flap * (w.fore ? 1.02 : 0.86);
        arm.rotation.y = (w.fore ? -0.18 : -0.34) + Math.cos(ph) * 0.30;
        arm.rotation.x = Math.sin(ph + 1.25) * (w.fore ? 0.55 : 0.42);
      }
    }
    legs.children.forEach((leg) => {
      leg.rotation.x = Math.sin(t * 1.7 + leg.userData.phase) * 0.06;
      leg.rotation.z = Math.sin(t * 1.2 + leg.userData.phase * 1.7) * 0.05;
    });
    abdomen.rotation.x = -0.16 + Math.sin(t * FLAP_HZ * 0.5) * 0.02;
  };

  bee.userData.radius = 0.9;
  return bee;
}
