import * as THREE from 'three';

/* Pollen und Staub. Sie sind fast unsichtbar – bis sie zwischen Kamera und
   Sonne geraten. Genau dann funkeln sie, und nur deshalb sind sie da.
   Die Wolke wird jedes Bild um die Kamera gewickelt, damit man sie nie verlässt. */

const BOX = 460;

export function createMotes(count, shared) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * BOX;
    pos[i * 3 + 1] = Math.random() * BOX * 0.5 - BOX * 0.25;
    pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    seed[i] = Math.random();
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: shared.uTime,
      uSunDir: shared.uSunDir,
      uSunColor: shared.uSunColor,
      uWindDir: shared.uWindDir,
      uCam: { value: new THREE.Vector3() },
      uScale: { value: 600 },
      uBox: { value: BOX },
    },
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime;
      uniform vec3  uSunDir;
      uniform vec3  uCam;
      uniform vec2  uWindDir;
      uniform float uScale;
      uniform float uBox;
      varying float vGlow;

      void main(){
        vec3 p = position;
        float s = aSeed * 61.7;

        // Trift mit dem Wind, dazu eine langsame Eigenbewegung
        p.xz += uWindDir * uTime * (5.0 + aSeed * 9.0);
        p.x += sin(uTime * 0.31 + s) * 7.0;
        p.y += sin(uTime * 0.24 + s * 1.7) * 5.0 + uTime * (0.6 + aSeed * 0.9);
        p.z += cos(uTime * 0.27 + s * 0.6) * 7.0;

        // Wolke um die Kamera wickeln
        vec3 rel = p - uCam;
        rel.xz = mod(rel.xz + uBox * 0.5, uBox) - uBox * 0.5;
        rel.y  = mod(rel.y + uBox * 0.25, uBox * 0.5) - uBox * 0.25;
        vec3 wp = uCam + rel;

        vec3 V = normalize(uCam - wp);
        float back = pow(clamp(dot(V, -uSunDir), 0.0, 1.0), 5.0);
        float flick = 0.55 + 0.45 * sin(uTime * (2.0 + aSeed * 6.0) + s);
        vGlow = (0.035 + 0.965 * back) * flick;

        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((0.9 + aSeed * 1.9) * uScale / -mv.z, 1.0, 34.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSunColor;
      varying float vGlow;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c);
        float a = smoothstep(0.25, 0.005, d);
        gl_FragColor = vec4(uSunColor * vGlow * a * 0.42, a);
      }
    `,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 5;

  points.userData.sync = (camera, height) => {
    material.uniforms.uCam.value.copy(camera.position);
    material.uniforms.uScale.value = height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
  };

  return points;
}
