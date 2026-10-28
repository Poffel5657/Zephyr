// Bergbau-Mini-Spiel „Schwachstellen“: Auf der Felswand leuchtet nacheinander kurz ein Riss auf, den man anklickt,
// bevor er wieder verschwindet. Treffer = ein Brocken bricht ab. Daneben klicken oder einen Riss verpassen = Fehler.
// Genug Treffer = Erz, mehr als maxMistakes Fehler = der Fels hält.
// Meldet pro Runde genau einmal "miningResult" mit { mined, reason } (reason: "missed", "cancelled" oder null).
import "./ui.css";
import "./miningGame.css";
import { emit } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";

const FEEDBACK_MS = 600;
// So lange wackelt das Panel nach einem Fehler
const SHAKE_MS = 200;
// Kurze Pause zwischen zwei Rissen (Sekunden)
const CRACK_PAUSE = 0.25;
// Risse bleiben so weit vom Rand weg (Anteil der Felswand)
const EDGE_MARGIN = 0.08;
const HIDDEN_CLASS = "mining-hidden";
const RESULT_CLASSES = ["mining-success", "mining-fail"];

const panel = document.createElement("div");
panel.className = "ui-panel mining-game " + HIDDEN_CLASS;
const status = document.createElement("div");
status.className = "mining-status";
const wall = document.createElement("div");
wall.className = "mining-wall";
const crack = document.createElement("div");
crack.className = "mining-crack";
crack.hidden = true;
wall.appendChild(crack);
const counter = document.createElement("div");
counter.className = "mining-counter";
panel.append(status, wall, counter);

// Laufende Runde (null = keine): { options, hits, mistakes, timeLeft, showing }
let round = null;
let feedbackTimer = null;

// Hängt das Panel in die Seite und meldet Spiel-Loop und Klicks an (einmal beim Start aufrufen).
export function setupMiningGame() {
  document.body.appendChild(panel);
  addUpdate(updateMiningGame);

  // Klick auf den Riss = Treffer, Klick daneben auf die Wand = Fehler
  crack.addEventListener("pointerdown", (event) => {
    event.stopPropagation?.();
    event.preventDefault?.();
    if (round !== null && round.showing) {
      hitCrack();
    }
  });
  wall.addEventListener("pointerdown", (event) => {
    event.preventDefault?.();
    if (round !== null) {
      addMistake();
    }
  });
}

// Startet eine Runde. options: cracks (so viele Treffer braucht man), crackSeconds (so lange bleibt ein Riss),
// crackSize (Größe des Risses als Anteil der Wand), maxMistakes.
export function startMiningGame(options) {
  clearTimeout(feedbackTimer);
  panel.classList.remove(HIDDEN_CLASS, ...RESULT_CLASSES);
  round = { options: options, hits: 0, mistakes: 0, timeLeft: CRACK_PAUSE, showing: false };
  crack.hidden = true;
  crack.style.width = options.crackSize * 100 + "%";
  crack.style.height = options.crackSize * 100 + "%";
  status.textContent = "Click the cracks!";
  updateCounter();
}

// Bricht die Runde ohne Ergebnis ab und versteckt das Panel sofort.
export function stopMiningGame() {
  round = null;
  clearTimeout(feedbackTimer);
  panel.classList.remove(...RESULT_CLASSES);
  panel.classList.add(HIDDEN_CLASS);
}

// Läuft jedes Bild: Riss zeigen, Zeit ablaufen lassen, verpasste Risse zählen.
function updateMiningGame(deltaTime) {
  if (round === null) {
    return;
  }
  round.timeLeft -= deltaTime;
  if (round.timeLeft > 0) {
    return;
  }
  if (round.showing) {
    // Riss verpasst
    addMistake();
    if (round !== null) {
      hideCrack();
    }
    return;
  }
  showCrack();
}

// Zeigt einen neuen Riss an einer zufälligen Stelle der Wand.
function showCrack() {
  const free = 1 - round.options.crackSize - 2 * EDGE_MARGIN;
  crack.style.left = (EDGE_MARGIN + Math.random() * free) * 100 + "%";
  crack.style.top = (EDGE_MARGIN + Math.random() * free) * 100 + "%";
  crack.hidden = false;
  round.showing = true;
  round.timeLeft = round.options.crackSeconds;
}

// Versteckt den Riss und wartet kurz bis zum nächsten.
function hideCrack() {
  crack.hidden = true;
  round.showing = false;
  round.timeLeft = CRACK_PAUSE;
}

// Riss getroffen: ein Brocken bricht ab, bei genug Treffern ist das Erz frei.
function hitCrack() {
  round.hits += 1;
  hideCrack();
  updateCounter();
  if (round.hits >= round.options.cracks) {
    finishRound(true, null);
  }
}

// Fehler (daneben oder verpasst), bei zu vielen hält der Fels.
function addMistake() {
  round.mistakes += 1;
  updateCounter();
  panel.classList.add("mining-shake");
  setTimeout(() => panel.classList.remove("mining-shake"), SHAKE_MS);
  if (round.mistakes > round.options.maxMistakes) {
    finishRound(false, "missed");
  }
}

// Schreibt Treffer und Fehler unter die Wand, z. B. "●●○○○  ✗".
function updateCounter() {
  const { cracks } = round.options;
  const hits = "●".repeat(round.hits) + "○".repeat(Math.max(0, cracks - round.hits));
  counter.textContent = hits + (round.mistakes > 0 ? "  " + "✗".repeat(round.mistakes) : "");
}

// Meldet das Ergebnis, färbt das Panel kurz grün oder rot und versteckt es danach.
function finishRound(mined, reason) {
  round = null;
  crack.hidden = true;
  emit("miningResult", { mined, reason });
  status.textContent = mined ? "The rock breaks!" : "The rock holds";
  panel.classList.add(mined ? "mining-success" : "mining-fail");
  feedbackTimer = setTimeout(() => {
    panel.classList.remove(...RESULT_CLASSES);
    panel.classList.add(HIDDEN_CLASS);
  }, FEEDBACK_MS);
}
