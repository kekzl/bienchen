# Bienchen

Eine Honigbiene fliegt in Echtzeit durch eine Sommerwiese im Gegenlicht der
tiefstehenden Sonne. Läuft im Browser, WebGL 2, ohne Build-Schritt und ohne
Netzverbindung zur Laufzeit.

## Starten

```bash
docker compose up -d
```

Dann <http://localhost:8099> öffnen. Beenden mit `docker compose down`.

Der Container ist nur ein nginx, der das Verzeichnis ausliefert — es wird nichts
kompiliert und zur Laufzeit nichts nachgeladen. Three.js r185 liegt fertig in
`vendor/three/` (7,7 MB, auf das Gebrauchte zusammengestrichen). Neu holen ginge
so, ohne Node auf dem Host:

```bash
docker run --rm --user $(id -u):$(id -g) -v "$PWD":/w -w /w -e npm_config_cache=/tmp/c \
  node:22-alpine sh -c "npm i three --no-save --prefix /tmp/x && cp -r /tmp/x/node_modules/three vendor/three"
```

## Bedienung

| Taste | Wirkung |
|---|---|
| `Leertaste` / Klick | nächste Kameraeinstellung |
| `O` | Kamera selbst führen (Maus/Touch) |
| `R` | neue Flugroute |
| `1` `2` `3` | Qualität niedrig / mittel / hoch |
| `H` | Einblendungen aus- und einschalten |

Die Qualität wird beim Start geschätzt und automatisch gesenkt, wenn die
Bildrate unter 38 fällt. `?q=niedrig|mittel|hoch` erzwingt eine Stufe,
`?shot=verfolgung|flanke|halmspitzen|makro|weite` eine Einstellung.
`?fast=1` überspringt die Pausen der Ladeanzeige (für Screenshots).

## Wie das Bild zustande kommt

**Gegenlicht ist das ganze Konzept.** Die Sonne steht 4,2° über dem Horizont.
Jeder Halm bekommt im Fragment-Shader einen Transmissionsterm — je weiter oben
am Halm und je genauer die Kamera in die Sonne blickt, desto stärker leuchtet
das Blatt von hinten durch. Dasselbe gilt für Blütenblätter; beim Mohn am
stärksten, er ist der einzige gesättigte Akzent im Bild. Vier der fünf
Kameraeinstellungen stellen sich deshalb bewusst gegen die Sonne
(`backlitAngle()` in `src/director.js`).

**Maßstab.** Eine Welteinheit ist ein Zentimeter. Biene 1,4 · Halme 25–50 ·
Margerite 5 cm Blütendurchmesser · Mohn 9 cm. Die Größenverhältnisse stammen
aus der Natur, nicht aus dem Gefühl — das trägt mehr zum Eindruck bei als jeder
Shader.

**Gras.** Zwei `InstancedMesh` (nah dicht und fein, fern grob und größer),
zusammen bis 233 000 Halme. Biegung, Wind und Böen laufen im Vertex-Shader;
pro Halm werden Zufallswerte aus der Weltposition gehasht, es gibt also keine
zusätzlichen Attribute. Die Instanzmatrix skaliert nur Y, deshalb muss der
Eigenbogen von Hand mit der Halmhöhe multipliziert werden — ohne das stehen die
Halme wie Nadeln.

**Biene.** Vollständig aus Geometrie gebaut, kein externes Modell. Zwei Details
tragen den Eindruck: ein additiver Flaum-Saum, der im Gegenlicht als Behaarung
liest, und Flügel, die als drei phasenversetzte Kopien den Schlagbogen
zeichnen, statt bei 17 Hz zu stroboskopieren.

**Flug.** Kleine Zustandsmaschine: Streckenflug → Anflug einer Blüte →
Schweben → weiter. Schräglage aus der Querbeschleunigung, Nase hoch beim
Bremsen. Blütenpositionen kommen aus dem Blüten-Modul, die Biene fliegt also
tatsächlich Blüten an, die im Bild stehen.

**Kamera.** Feste Einstellungen mit harten Schnitten wie in einer
Tieraufnahme — kein weiches Herüberfahren, das würde die Kamera zum Thema
machen. Mitgeführte Einstellungen bekommen einen Geschwindigkeits-Vorhalt,
sonst bleibt eine gedämpfte Verfolgung dauerhaft um `v/follow` zurück.

**Bildkette.** Szene → Schärfentiefe → Lichtblüte → Tonwert und Farbraum →
Kantenglättung → Bildlook (Vignette, Korn, Farbsaum, S-Kurve). Der Himmel nach
Rayleigh/Mie wird zusätzlich einmal in eine Cubemap gerendert und dient der
Biene als Umgebungslicht.

## Aufbau

```
index.html          Gerüst und Einblendungen
src/style.css       Overlay
src/main.js         Aufbau, Bedienung, Bildschleife
src/config.js       Maßstab, Palette, Qualitätsstufen, Geländefunktion
src/glsl.js         gemeinsame Shader-Bausteine (Rauschen, Licht, Dunst)
src/atmosphere.js   Himmel, Wolken, Umgebungslicht
src/terrain.js      Boden
src/grass.js        Halme
src/flowers.js      Margerite, Mohn, Kornblume, Löwenzahn
src/motes.js        Pollen
src/bee.js          Biene
src/flight.js       Flugverhalten
src/director.js     Kameraführung
src/post.js         Bildkette
```

## Barrierefreiheit

`prefers-reduced-motion` wird beachtet: kein Kamerazittern, längere
Einstellungen. Die Einblendungen lassen sich mit `H` abschalten.
