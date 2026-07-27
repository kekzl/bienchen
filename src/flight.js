import * as THREE from 'three';
import { WORLD, terrainHeight } from './config.js';

/* Flugverhalten. Eine Biene fliegt nicht auf Kurven, sie stakst durch die Luft:
   kurze gerade Stücke, harte Richtungswechsel, Halt über einer Blüte, weiter.
   Genau das bildet die kleine Zustandsmaschine ab. */

const UP = new THREE.Vector3(0, 1, 0);

export class Flight {
  constructor(heads) {
    this.heads = heads.filter(h => Math.hypot(h.x, h.z) < WORLD.flightRadius);
    this.pos = new THREE.Vector3(0, 70, 0);
    this.vel = new THREE.Vector3(0, 0, 60);
    this.target = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.state = 'reise';
    this.timer = 0;
    this.hoverAngle = 0;
    this.seed = Math.random() * 100;
    this.roll = 0;
    this.pitch = 0;
    this.speed = 0;
    this._prevVel = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._qPitch = new THREE.Quaternion();
    this._up = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._xAxis = new THREE.Vector3(1, 0, 0);
    this.pickTarget(true);
  }

  get stateLabel() {
    return { reise: 'Streckenflug', anflug: 'Anflug', schweben: 'Schweben' }[this.state];
  }

  reset() {
    this.pos.set((Math.random() - 0.5) * 120, 70, (Math.random() - 0.5) * 120);
    this.vel.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(60);
    this.seed = Math.random() * 100;
    this.state = 'reise';
    this.pickTarget(true);
  }

  pickTarget(force = false) {
    const wantFlower = this.heads.length > 0 && (force ? Math.random() < 0.7 : Math.random() < 0.62);
    if (wantFlower) {
      // Nahe Blüten bevorzugen, damit der Flug nicht ständig quer über das Feld geht
      let best = null, bestD = Infinity;
      for (let i = 0; i < 8; i++) {
        const h = this.heads[(Math.random() * this.heads.length) | 0];
        const d = h.distanceToSquared(this.pos);
        if (d < bestD) { bestD = d; best = h; }
      }
      this.target.copy(best);
      this.state = 'anflug';
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * WORLD.flightRadius;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      this.target.set(x, terrainHeight(x, z) + WORLD.altMin + Math.random() * (WORLD.altMax - WORLD.altMin), z);
      this.state = 'reise';
    }
  }

  update(dt, t) {
    const maxSpeed = this.state === 'reise' ? 105 : this.state === 'anflug' ? 58 : 16;
    const accel = this.state === 'schweben' ? 5.0 : 3.2;

    const to = this._to.copy(this.target).sub(this.pos);
    const dist = to.length();

    if (this.state === 'schweben') {
      this.timer -= dt;
      this.hoverAngle += dt * 1.15;
      // Enge Kreise über der Blüte, mit Höhenschwankung
      this.target.x += Math.cos(this.hoverAngle) * dt * 9;
      this.target.z += Math.sin(this.hoverAngle) * dt * 9;
      this.target.y += Math.sin(this.hoverAngle * 2.3) * dt * 5;
      if (this.timer <= 0) this.pickTarget();
    } else if (dist < (this.state === 'anflug' ? 4.5 : 9)) {
      if (this.state === 'anflug') {
        this.state = 'schweben';
        this.timer = 1.7 + Math.random() * 2.2;
        this.hoverAngle = Math.random() * 6.28;
      } else {
        this.pickTarget();
      }
    }

    const want = to.normalize().multiplyScalar(Math.min(maxSpeed, dist * 2.0 + 6));

    // Ziellosigkeit: die Biene hält nie exakt Kurs
    const s = this.seed;
    want.x += Math.sin(t * 1.13 + s) * 26 + Math.sin(t * 3.7 + s * 2.1) * 9;
    want.y += Math.sin(t * 0.91 + s * 1.7) * 14 + Math.sin(t * 4.3 + s) * 5;
    want.z += Math.cos(t * 1.27 + s * 0.6) * 26 + Math.cos(t * 3.1 + s * 1.4) * 9;

    this._prevVel.copy(this.vel);
    const f = 1 - Math.exp(-accel * dt);
    this.vel.lerp(want, f);
    this.pos.addScaledVector(this.vel, dt);

    // Nie in die Halme sinken, nie zu hoch steigen
    const ground = terrainHeight(this.pos.x, this.pos.z);
    const minY = ground + 22, maxY = ground + WORLD.altMax + 16;
    if (this.pos.y < minY) { this.pos.y += (minY - this.pos.y) * Math.min(1, dt * 7); this.vel.y = Math.max(this.vel.y, 0); }
    if (this.pos.y > maxY) { this.pos.y += (maxY - this.pos.y) * Math.min(1, dt * 7); this.vel.y = Math.min(this.vel.y, 0); }

    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > WORLD.flightRadius * 1.15) this.pickTarget(true);

    this.speed = this.vel.length();

    // Ausrichtung: Nase in Flugrichtung, Rollen in die Kurve, Nase hoch beim Bremsen
    if (this.speed > 2) this.forward.copy(this.vel).normalize();
    this._right.crossVectors(this.forward, UP).normalize();
    // Querbeschleunigung → Schräglage in die Kurve
    const lateralAcc = this.vel.clone().sub(this._prevVel).dot(this._right) / Math.max(dt, 1e-3);
    const targetRoll = THREE.MathUtils.clamp(lateralAcc * 0.006, -0.85, 0.85);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 4);

    const targetPitch = THREE.MathUtils.clamp((maxSpeed - this.speed) / maxSpeed * 0.35 - 0.12, -0.35, 0.4);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 3);

    this._up.copy(UP).applyAxisAngle(this.forward, this.roll);
    this._look.copy(this.pos).sub(this.forward);
    this._m.lookAt(this.pos, this._look, this._up);
    this._q.setFromRotationMatrix(this._m);
    this._q.multiply(this._qPitch.setFromAxisAngle(this._xAxis, this.pitch));
    this.quat.slerp(this._q, Math.min(1, dt * 9));
  }

  /** Körperzittern des Flügelschlags – nur auf die Darstellung, nicht auf die Bahn. */
  applyTo(object, t) {
    object.position.copy(this.pos);
    object.position.y += Math.sin(t * 17.5 * Math.PI * 2) * 0.035;
    object.quaternion.copy(this.quat);
  }
}
