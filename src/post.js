import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* Bildkette: Szene → Schärfentiefe → Lichtblüte → Tonwert/Farbraum →
   Kantenglättung → Bildlook. Der Bildlook läuft bewusst zuletzt, im
   Anzeigefarbraum: Vignette, Korn und Randfarbsaum gehören auf das fertige Bild. */

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uVignette: { value: 0.40 },
    uGrain: { value: 0.020 },
    uAberration: { value: 0.30 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2  uResolution;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    varying vec2 vUv;

    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);

      // Farbsaum nimmt zum Bildrand zu, wie bei einem offenen Objektiv
      float amt = uAberration * r2 * 0.02;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - d * amt).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + d * amt).b;

      // Tiefen kühl, Lichter warm
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col * vec3(0.93, 0.99, 1.08), col * vec3(1.06, 1.00, 0.92), smoothstep(0.12, 0.78, lum));

      // Sanfte S-Kurve gegen das Milchglas des Gegenlichts
      col = clamp(col, 0.0, 1.0);
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.28);

      col *= 1.0 - uVignette * pow(clamp(r2 * 1.85, 0.0, 1.0), 1.3);

      float n = fract(sin(dot(vUv * uResolution + uTime * 91.3, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPipeline(renderer, scene, camera, quality) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let bokeh = null;
  if (quality.dof) {
    bokeh = new BokehPass(scene, camera, { focus: 12, aperture: 0.0003, maxblur: 0.011 });
    composer.addPass(bokeh);
  }

  if (quality.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, 0.24, 0.62, 0.95));
  }

  composer.addPass(new OutputPass());
  if (quality.smaa) composer.addPass(new SMAAPass());

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  return {
    composer,
    bokeh,
    grade,
    setSize(w, h) {
      composer.setSize(w, h);
      grade.uniforms.uResolution.value.set(w, h);
    },
    dispose() { composer.dispose(); },
  };
}
