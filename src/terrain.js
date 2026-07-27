import * as THREE from 'three';
import { NOISE, TERRAIN, LIGHTING } from './glsl.js';
import { WORLD, PALETTE, terrainHeight } from './config.js';

/* Der Boden ist zu 95 % von Halmen verdeckt. Er muss nur zwei Dinge leisten:
   den Grund zwischen den Halmen abdunkeln und am Horizont sauber in den
   Dunst laufen. Darum dieselbe Farbfamilie wie das Gras, nur tiefer. */

export function createTerrain(shared) {
  const size = WORLD.fieldRadius * 2;
  const geo = new THREE.PlaneGeometry(size, size, 190, 190);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      uSoil:  { value: new THREE.Color(PALETTE.soil) },
      uUnder: { value: new THREE.Color(PALETTE.grassBase) },
      uTop:   { value: new THREE.Color(PALETTE.grassTip) },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE}
      ${TERRAIN}
      ${LIGHTING}
      uniform vec3 uSoil;
      uniform vec3 uUnder;
      uniform vec3 uTop;
      varying vec3 vWorld;
      varying vec3 vNormal;

      void main(){
        vec3 N = normalize(vNormal);
        vec3 L = uSunDir;

        float patch = fbm(vWorld.xz * 0.012);
        float grit  = vnoise(vWorld.xz * 0.19);
        vec3 base = mix(uSoil, uUnder, smoothstep(0.28, 0.72, patch));
        base = mix(base, uUnder * 1.5, grit * 0.28);

        // Aus der Ferne verschmilzt der Boden mit den Halmspitzen darüber,
        // sonst entstünde ein dunkler Ring vor dem Dunst.
        float far = smoothstep(120.0, 520.0, length(vWorld.xz - cameraPosition.xz));
        base = mix(base, mix(uUnder, uTop, 0.42), far * 0.85);

        float sh = cloudShadow(vWorld.xz);
        float diff = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
        // Zwischen den Halmen kommt kaum direktes Licht an.
        float occ = mix(0.16, 0.62, far);

        vec3 col = base * uSunColor * diff * sh * occ;
        col += base * hemiLight(N) * mix(0.35, 1.0, far);

        gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return mesh;
}
