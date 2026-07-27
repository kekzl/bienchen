import * as THREE from 'three';
import { terrainHeight, sunDirection } from './config.js';

/* Kameraführung wie bei einer Tieraufnahme: feste Einstellungen, harte
   Schnitte, ein leichtes Zittern aus der Hand. Kein weiches Herüberfahren –
   das würde die Kamera zum Thema machen statt der Biene.

   Wichtigste Regel: die meisten Einstellungen stellen sich so, dass die
   Sonne hinter dem Motiv steht. Nur im Gegenlicht leuchtet die Wiese. */

const UP = new THREE.Vector3(0, 1, 0);

// Winkel, unter dem die Kamera vom Motiv aus in die Sonne blickt
const sun = sunDirection();
// Kamerastandort relativ zum Motiv: entgegen der Sonne. Winkel in (x, z).
const INTO_SUN = Math.atan2(-sun.z, -sun.x);

/** Zufälliger Azimut, mit `spread` Radiant Streuung um die Gegenlichtrichtung. */
function backlitAngle(spread) {
  return INTO_SUN + (Math.random() - 0.5) * 2 * spread;
}

const SHOTS = [
  {
    key: 'verfolgung', label: 'Verfolgung', fov: 40, aperture: 0.00028, follow: 3.4, shake: 1.0, attached: true,
    min: 9, max: 14,
    cut(s) { s.side = Math.random() < 0.5 ? -1 : 1; },
    place(s, c, out) {
      out.pos.copy(c.beePos)
        .addScaledVector(c.forward, -7.5)
        .addScaledVector(c.right, s.side * 2.4)
        .addScaledVector(UP, 1.9);
      out.look.copy(c.beePos).addScaledVector(c.forward, 3.2);
    },
  },
  {
    key: 'flanke', label: 'Flanke', fov: 38, aperture: 0.00042, follow: 4.2, shake: 0.8, attached: true,
    min: 8, max: 12,
    // Die Seite wird nicht gewürfelt, sondern so gewählt, dass die Sonne gegenüber steht.
    cut(s, c) { s.side = (c.right.x * -sun.x + c.right.z * -sun.z) >= 0 ? 1 : -1; },
    place(s, c, out) {
      out.pos.copy(c.beePos)
        .addScaledVector(c.right, s.side * 6.2)
        .addScaledVector(c.forward, 1.0)
        .addScaledVector(UP, 0.6);
      out.look.copy(c.beePos);
    },
  },
  {
    key: 'halmspitzen', label: 'Halmspitzen', fov: 40, aperture: 0.00046, follow: 0.9, shake: 1.4,
    min: 8, max: 12,
    /* Ein fester Standpunkt knapp über dem höchsten Halm. Tiefer geht nicht:
       im Bestand steht bei dieser Dichte immer ein Halm direkt vor dem Objektiv. */
    cut(s, c) {
      const a = backlitAngle(0.75);
      const y = terrainHeight(c.beePos.x, c.beePos.z) + 52 + Math.random() * 6;
      const dy = c.beePos.y - y;
      const d = THREE.MathUtils.clamp(Math.abs(dy) / Math.tan(0.36), 26, 70);
      s.anchor.set(c.beePos.x + Math.cos(a) * d, 0, c.beePos.z + Math.sin(a) * d);
      s.anchor.y = terrainHeight(s.anchor.x, s.anchor.z) + 52 + Math.random() * 6;
      s.drift = (Math.random() - 0.5) * 2.4;
    },
    place(s, c, out) {
      s.anchor.addScaledVector(c.right, s.drift * c.dt);
      out.pos.copy(s.anchor);
      // Der Blick zielt nicht starr auf die Biene: sie rückt aus der Bildmitte,
      // dafür kommt Halmteppich bzw. Himmel mit ins Bild.
      out.look.copy(c.beePos);
      out.look.y -= (c.beePos.y - s.anchor.y) * 0.38;
    },
    stale(s, c) { return c.beePos.distanceTo(s.anchor) > 85; },
  },
  {
    key: 'makro', label: 'Makro', fov: 34, aperture: 0.00090, follow: 13, shake: 0.45, attached: true,
    min: 6, max: 9,
    cut(s) { s.angle = backlitAngle(1.15); s.spin = (Math.random() < 0.5 ? -1 : 1) * 0.30; },
    place(s, c, out) {
      s.angle += s.spin * c.dt;
      out.pos.copy(c.beePos).add(
        s.tmp.set(Math.cos(s.angle) * 4.3, 0.8 + Math.sin(s.angle * 0.7) * 0.5, Math.sin(s.angle) * 4.3),
      );
      out.look.copy(c.beePos);
    },
  },
  {
    key: 'weite', label: 'Weite', fov: 46, aperture: 0.00009, follow: 0.65, shake: 1.6, attached: true,
    min: 10, max: 15,
    cut(s) { s.dir = backlitAngle(1.0); },
    place(s, c, out) {
      out.pos.copy(c.beePos).add(
        s.tmp.set(Math.cos(s.dir) * 62, 3, Math.sin(s.dir) * 62),
      );
      out.look.copy(c.beePos);
    },
  },
];

export class Director {
  constructor(camera, calm = false) {
    this.camera = camera;
    this.calm = calm;
    this.index = 0;
    this.timer = 0;
    this.locked = false;
    this.aperture = 0.0003;
    this.focus = 12;

    this.state = SHOTS.map(() => ({
      anchor: new THREE.Vector3(), tmp: new THREE.Vector3(),
      side: 1, angle: 0, spin: 0, dir: 0, drift: 0,
    }));

    this.ctx = {
      beePos: new THREE.Vector3(), forward: new THREE.Vector3(), right: new THREE.Vector3(),
      vel: new THREE.Vector3(), dt: 0,
    };
    this.out = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.lookAt = new THREE.Vector3();
    this._shake = new THREE.Vector3();
    this._off = new THREE.Vector3();
    this._started = false;
  }

  get shot() { return SHOTS[this.index]; }

  /** Einstellung per Name; unbekannt oder leer → erste Einstellung. */
  indexOf(key) {
    const i = SHOTS.findIndex(s => s.key === key);
    return i < 0 ? 0 : i;
  }

  cut(to = null) {
    const next = to !== null ? to
      : (this.index + 1 + Math.floor(Math.random() * (SHOTS.length - 1))) % SHOTS.length;
    this.index = next;
    const shot = SHOTS[next];
    shot.cut?.(this.state[next], this.ctx);
    this.timer = (shot.min + Math.random() * (shot.max - shot.min)) * (this.calm ? 1.6 : 1);
    this.camera.fov = shot.fov;
    this.camera.updateProjectionMatrix();
    this._started = false;
  }

  update(dt, t, flight) {
    const c = this.ctx;
    c.beePos.copy(flight.pos);
    c.forward.copy(flight.forward);
    c.vel.copy(flight.vel);
    c.right.crossVectors(c.forward, UP).normalize();
    c.dt = dt;

    this.timer -= dt;
    const s = this.state[this.index];
    const shot = this.shot;
    if (this.locked) {
      if (shot.stale?.(s, c)) shot.cut?.(s, c);   // Anker nachziehen, Einstellung behalten
    } else if (this.timer <= 0 || shot.stale?.(s, c)) {
      this.cut();
    }

    SHOTS[this.index].place(this.state[this.index], c, this.out);

    /* Eine gedämpfte Verfolgung bleibt dauerhaft um v/follow zurück – bei
       105 cm/s ist das mehr als der Sollabstand. Der Vorhalt gleicht das aus,
       wird aber auf 60 % des Sollabstands begrenzt: ohne Deckel schiebt er die
       Kamera durch die Biene hindurch. */
    if (shot.attached) {
      const speed = c.vel.length();
      if (speed > 1e-3) {
        const nominal = this._off.subVectors(this.out.pos, c.beePos).length();
        const lead = Math.min(speed / this.shot.follow, nominal * 0.6) / speed;
        // Nur waagerecht vorhalten – senkrecht würde die Kamera über die Biene kippen.
        this.out.pos.x += c.vel.x * lead;
        this.out.pos.z += c.vel.z * lead;
      }
    }

    // Hartes Anschneiden: die erste Position der Einstellung wird übernommen,
    // danach folgt die Kamera gedämpft.
    const first = !this._started;
    this._started = true;
    this.camera.position.lerp(this.out.pos, first ? 1 : 1 - Math.exp(-this.shot.follow * dt));
    this.lookAt.lerp(this.out.look, first ? 1 : Math.min(1, dt * (this.shot.follow * 2 + 4)));

    if (!this.calm) {
      const amp = this.shot.shake * 0.09;
      this._shake.set(
        (Math.sin(t * 2.31) * 0.6 + Math.sin(t * 5.77 + 1.7) * 0.25) * amp,
        (Math.sin(t * 1.93 + 2.1) * 0.5 + Math.sin(t * 6.31 + 0.4) * 0.2) * amp,
        (Math.cos(t * 2.67 + 4.2) * 0.6 + Math.cos(t * 4.99 + 2.9) * 0.22) * amp,
      );
      this.camera.position.add(this._shake);
      this.lookAt.addScaledVector(this._shake, 0.35);
    }

    this.camera.lookAt(this.lookAt);
    this.focus = this.camera.position.distanceTo(flight.pos);
    this.aperture = this.shot.aperture;
  }
}
