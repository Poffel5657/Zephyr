// Timing-Mini-Spiel: Ein Zeiger pendelt über eine Leiste, Leertaste oder Klick auf die Leiste im grünen Bereich = Treffer.
// Meldet pro Runde genau einmal "timingResult" mit { hit }.
import "./ui.css";
import "./timingBar.css";
import { emit } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";

// Nach so vielen Durchläufen (2× hin und zurück) ohne Drücken zählt es als daneben
const MAX_PASSES = 4;
// Der grüne Bereich fängt frühestens hier an, sonst wäre Sofort-Drücken ein sicherer Treffer
const MIN_ZONE_START = 0.15;
const FEEDBACK_MS = 400;
const HIDDEN_CLASS = "timing-hidden";
const HIT_CLASS = "timing-hit";
const MISS_CLASS = "timing-miss";

const bar = document.createElement("div");
bar.className = "timing-bar " + HIDDEN_CLASS;
const zone = document.createElement("div");
zone.className = "timing-zone";
bar.appendChild(zone);
const pointer = document.createElement("div");
pointer.className = "timing-pointer";
bar.appendChild(pointer);

let running = false;
let position = 0;
let direction = 1;
let passes = 0;
let speed = 1;
let zoneStart = 0;
let zoneSize = 0;
let feedbackTimer = null;

// Hängt die Leiste in die Seite und meldet Spiel-Loop, Leertaste und Klick an (einmal beim Start aufrufen).
export function setupTimingBar() {
  document.body.appendChild(bar);
  addUpdate(updateTimingBar);

  addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat && running) {
      event.preventDefault();
      checkHit();
    }
  });
  bar.addEventListener("pointerdown", () => {
    if (running) {
      checkHit();
    }
  });
}

// Startet eine Runde: zoneSize = Breite des grünen Bereichs (0 bis 1), speed = Durchläufe pro Sekunde.
export function startTimingBar(options) {
  clearTimeout(feedbackTimer);
  bar.classList.remove(HIT_CLASS, MISS_CLASS, HIDDEN_CLASS);

  zoneSize = Math.min(options.zoneSize, 1 - MIN_ZONE_START);
  zoneStart = MIN_ZONE_START + Math.random() * (1 - MIN_ZONE_START - zoneSize);
  zone.style.left = zoneStart * 100 + "%";
  zone.style.width = zoneSize * 100 + "%";

  speed = options.speed;
  position = 0;
  direction = 1;
  passes = 0;
  pointer.style.left = "0%";
  running = true;
}

// Bricht die Runde ohne Ergebnis ab und versteckt die Leiste sofort.
export function stopTimingBar() {
  running = false;
  clearTimeout(feedbackTimer);
  bar.classList.remove(HIT_CLASS, MISS_CLASS);
  bar.classList.add(HIDDEN_CLASS);
}

// Bewegt den Zeiger jedes Bild weiter und lässt ihn an den Enden abprallen.
function updateTimingBar(deltaTime) {
  if (!running) {
    return;
  }

  position += direction * speed * deltaTime;
  if (position > 1 || position < 0) {
    passes++;
    if (passes >= MAX_PASSES) {
      finishRound(false);
      return;
    }
    position = position > 1 ? 2 - position : -position;
    direction = -direction;
  }

  pointer.style.left = position * 100 + "%";
}

// Prüft beim Drücken, ob der Zeiger gerade im grünen Bereich ist.
function checkHit() {
  finishRound(position >= zoneStart && position <= zoneStart + zoneSize);
}

// Meldet das Ergebnis, färbt die Leiste kurz grün oder rot und versteckt sie danach.
function finishRound(hit) {
  running = false;
  emit("timingResult", { hit });

  bar.classList.add(hit ? HIT_CLASS : MISS_CLASS);
  feedbackTimer = setTimeout(() => {
    bar.classList.remove(HIT_CLASS, MISS_CLASS);
    bar.classList.add(HIDDEN_CLASS);
  }, FEEDBACK_MS);
}
