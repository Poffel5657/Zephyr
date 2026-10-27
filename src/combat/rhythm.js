// Rhythmus-Combos: Ringe ziehen sich am Ziel zusammen, im Takt die richtige Taste drücken.
// Kennt den Kampf nicht, es spielt nur ein Muster ab und meldet "rhythmBeat" und "rhythmEnded".
// Zeitfenster, Tasten und Farben stehen in rhythm.json, die Muster in techniques.json / enemies.json.
import "../ui/ui.css";
import * as THREE from "three";
import RHYTHM from "../data/rhythm.json";
import { emit } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";

// Größe der Ringe in Pixeln: Start und innerer Kreis (= jetzt drücken)
const RING_START_SIZE = 130;
const RING_TARGET_SIZE = 40;
const FEEDBACK_MS = 600;
// So hoch über dem Mesh-Mittelpunkt sitzen die Ringe
const TARGET_LIFT = 0.3;
const FEEDBACK_TEXT = { perfect: "Perfect!", good: "Good", miss: "Miss" };

let camera = null;
let layer = null;
let targetCircle = null;
let dpad = null;
const screenPosition = new THREE.Vector3();
// Die laufende Combo (null = keine): { beats, target, stopAtMiss, onBeat, startTime, nextIndex, results, resolve }
let current = null;

// Baut die Anzeige (Ringe, innerer Kreis, Steuerkreuz) und hört auf die Tasten. Einmal beim Start aufrufen.
export function setupRhythm(activeCamera) {
  camera = activeCamera;

  layer = document.createElement("div");
  layer.className = "rhythm-layer rhythm-hidden";
  targetCircle = document.createElement("div");
  targetCircle.className = "rhythm-target";
  layer.appendChild(targetCircle);
  document.body.appendChild(layer);

  // Steuerkreuz fürs Handy: vier farbige Knöpfe, nur während einer Combo und nur bei Touch-Bildschirmen
  dpad = document.createElement("div");
  dpad.className = "rhythm-dpad rhythm-hidden";
  for (const [key, data] of Object.entries(RHYTHM.keys)) {
    const button = document.createElement("button");
    button.className = "rhythm-dpad-button rhythm-dpad-" + key;
    button.textContent = data.label;
    button.style.backgroundColor = data.color;
    // pointerdown statt click: reagiert sofort, wichtig fürs Timing
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      pressKey(key);
    });
    dpad.appendChild(button);
  }
  document.body.appendChild(dpad);

  addEventListener("keydown", (event) => {
    const key = findKey(event.code);
    if (key === null || current === null) {
      return;
    }
    // Pfeiltasten sollen die Seite nicht scrollen
    event.preventDefault();
    if (!event.repeat) {
      pressKey(key);
    }
  });

  addUpdate(updateRhythm);
}

// Gibt zurück, ob gerade eine Combo läuft.
export function isRhythmActive() {
  return current !== null;
}

// Spielt ein Muster am Ziel-Mesh ab. pattern: [{ key, after }], after = Sekunden seit dem vorigen Takt.
// stopAtMiss: true = beim ersten Fehler aufhören (eigene Combo), false = alle Takte spielen (Block).
// onBeat(index, result) wird bei jedem gewerteten Takt sofort aufgerufen (z. B. für den Schaden).
// Gibt ein Promise mit den Ergebnissen zurück: ["perfect" | "good" | "miss", …].
export function startRhythm({ pattern, target, stopAtMiss, onBeat = () => {} }) {
  if (current !== null) {
    stopRhythm();
  }

  let time = 0;
  const beats = pattern.map((beat) => {
    time += beat.after;
    const ring = document.createElement("div");
    ring.className = "rhythm-ring rhythm-hidden";
    ring.style.borderColor = RHYTHM.keys[beat.key].color;
    layer.appendChild(ring);
    return { key: beat.key, time: time, ring: ring };
  });

  layer.classList.remove("rhythm-hidden");
  if (isTouchScreen()) {
    dpad.classList.remove("rhythm-hidden");
  }

  return new Promise((resolve) => {
    current = { beats, target, stopAtMiss, onBeat, startTime: now(), nextIndex: 0, results: [], resolve };
    updateRhythm();
  });
}

// Bricht die laufende Combo ab (z. B. wenn der Kampf endet). Das Promise bekommt die Ergebnisse bis hierhin.
export function stopRhythm() {
  if (current !== null) {
    finish();
  }
}

// Jedes Bild: Ringe über dem Ziel schrumpfen lassen und verpasste Takte als "miss" werten.
function updateRhythm() {
  if (current === null) {
    return;
  }
  const elapsed = now() - current.startTime;

  // Nicht gedrückt und das Zeitfenster ist vorbei → daneben
  const beat = current.beats[current.nextIndex];
  if (beat !== undefined && elapsed > beat.time + RHYTHM.goodWindow) {
    judge("miss");
    return;
  }

  if (!placeOverTarget()) {
    return;
  }
  showNextKey(elapsed);
  for (let i = current.nextIndex; i < current.beats.length; i++) {
    const { ring, time } = current.beats[i];
    const timeLeft = time - elapsed;
    // Ein Ring erscheint erst approachTime vor seinem Takt
    if (timeLeft > RHYTHM.approachTime) {
      ring.classList.add("rhythm-hidden");
      continue;
    }
    const progress = Math.max(0, timeLeft / RHYTHM.approachTime);
    const size = RING_TARGET_SIZE + (RING_START_SIZE - RING_TARGET_SIZE) * progress;
    ring.style.width = size + "px";
    ring.style.height = size + "px";
    ring.classList.remove("rhythm-hidden");
  }
}

// Zeigt im inneren Kreis, welche Taste als Nächstes kommt (Pfeil in der Farbe der Taste), sobald ihr Ring zu sehen ist.
function showNextKey(elapsed) {
  const beat = current.beats[current.nextIndex];
  const visible = beat !== undefined && beat.time - elapsed <= RHYTHM.approachTime;
  const key = visible ? RHYTHM.keys[beat.key] : null;
  targetCircle.textContent = key === null ? "" : key.label;
  targetCircle.style.color = key === null ? "" : key.color;
}

// Eine Taste wurde gedrückt: gegen den nächsten offenen Takt werten.
function pressKey(key) {
  if (current === null) {
    return;
  }
  const beat = current.beats[current.nextIndex];
  if (beat === undefined) {
    return;
  }
  const offset = now() - current.startTime - beat.time;
  // Drücken, bevor der Ring überhaupt zu sehen ist, zählt nicht
  if (offset < -RHYTHM.approachTime) {
    return;
  }

  const distance = Math.abs(offset);
  if (key !== beat.key || distance > RHYTHM.goodWindow) {
    judge("miss");
  } else if (distance <= RHYTHM.perfectWindow) {
    judge("perfect");
  } else {
    judge("good");
  }
}

// Wertet den nächsten offenen Takt, zeigt das Feedback und beendet die Combo, wenn sie vorbei ist.
function judge(result) {
  const index = current.nextIndex;
  const beat = current.beats[index];
  current.results.push(result);
  current.nextIndex += 1;
  beat.ring.remove();
  showFeedback(result);
  emit("rhythmBeat", { index, result, key: beat.key });
  current.onBeat(index, result);
  // onBeat kann die Combo beenden (z. B. Gegner besiegt)
  if (current === null) {
    return;
  }

  const missedAndStop = result === "miss" && current.stopAtMiss;
  if (missedAndStop || current.nextIndex >= current.beats.length) {
    finish();
  }
}

// Räumt die Ringe weg, meldet "rhythmEnded" und gibt die Ergebnisse zurück.
function finish() {
  const { beats, results, resolve } = current;
  current = null;
  for (const beat of beats) {
    beat.ring.remove();
  }
  layer.classList.add("rhythm-hidden");
  dpad.classList.add("rhythm-hidden");
  targetCircle.textContent = "";
  emit("rhythmEnded", { results });
  resolve(results);
}

// Kurzer Text am Ziel: "Perfect!", "Good" oder "Miss" (bleibt kurz stehen, auch wenn die Combo vorbei ist).
function showFeedback(result) {
  const text = document.createElement("div");
  text.className = "rhythm-feedback rhythm-feedback-" + result;
  text.textContent = FEEDBACK_TEXT[result];
  text.style.left = layer.style.left;
  text.style.top = layer.style.top;
  document.body.appendChild(text);
  setTimeout(() => text.remove(), FEEDBACK_MS);
}

// Setzt die Ringe auf die Bildschirm-Position des Ziels. false, wenn das Ziel hinter der Kamera ist.
function placeOverTarget() {
  screenPosition.copy(current.target.position);
  screenPosition.y += TARGET_LIFT;
  screenPosition.project(camera);
  if (screenPosition.z > 1) {
    return false;
  }
  layer.style.left = ((screenPosition.x + 1) / 2) * innerWidth + "px";
  layer.style.top = ((1 - screenPosition.y) / 2) * innerHeight + "px";
  return true;
}

// Sucht die Combo-Taste zu einem Tastatur-Code (z. B. "ArrowUp" oder "KeyW" → "up").
function findKey(code) {
  for (const [key, data] of Object.entries(RHYTHM.keys)) {
    if (data.codes.includes(code)) {
      return key;
    }
  }
  return null;
}

// Handy oder Tablet (grober Zeiger, z. B. Finger) → Steuerkreuz zeigen.
function isTouchScreen() {
  return matchMedia("(pointer: coarse)").matches;
}

// Aktuelle Zeit in Sekunden (genauer als der Spiel-Loop, wichtig fürs Timing).
function now() {
  return performance.now() / 1000;
}
