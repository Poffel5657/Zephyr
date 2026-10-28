// Schmiede-Mini-Spiel „Heiß hämmern“: Das Metall glüht und kühlt dabei ab (Hitze-Leiste). Auf der Klinge ist eine Stelle
// markiert, die man anklickt, solange das Metall heiß ist. Jeder Treffer setzt die Markierung woanders hin.
// Daneben klicken oder auf kaltes Metall schlagen = Fehler. "Reheat" (oder Leertaste) legt das Metall zurück in die Esse,
// das kostet reheatSeconds. Genug Treffer = fertig (ohne Fehler "good"), mehr als maxMistakes Fehler = verdorben.
// Meldet pro Runde genau einmal "smithingResult" mit { result } ("good", "done" oder "ruined").
import "./ui.css";
import "./smithingGame.css";
import { emit } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";

const FEEDBACK_MS = 600;
const SHAKE_MS = 200;
// Die Markierung bleibt so weit von den Enden der Klinge weg (Anteil)
const EDGE_MARGIN = 0.1;
const REHEAT_KEY = "Space";
const HIDDEN_CLASS = "smithing-hidden";
const RESULT_CLASSES = { good: "smithing-good", done: "smithing-done", ruined: "smithing-ruined" };
const RESULT_TEXT = { good: "Perfect work!", done: "Done", ruined: "The metal cracked…" };

const panel = document.createElement("div");
panel.className = "ui-panel smithing-game " + HIDDEN_CLASS;
const status = document.createElement("div");
status.className = "smithing-status";
const heatBar = document.createElement("div");
heatBar.className = "smithing-heat";
const heatFill = document.createElement("div");
heatFill.className = "smithing-heat-fill";
heatBar.appendChild(heatFill);
const blade = document.createElement("div");
blade.className = "smithing-blade";
const mark = document.createElement("div");
mark.className = "smithing-mark";
blade.appendChild(mark);
const footer = document.createElement("div");
footer.className = "smithing-footer";
const counter = document.createElement("span");
counter.className = "smithing-counter";
const reheatButton = document.createElement("button");
reheatButton.className = "smithing-button";
reheatButton.textContent = "Reheat (Space)";
footer.append(counter, reheatButton);
panel.append(status, heatBar, blade, footer);

// Laufende Runde (null = keine): { options, heat, hits, mistakes, reheatLeft }
let round = null;
let feedbackTimer = null;

// Hängt das Panel in die Seite und meldet Spiel-Loop, Klicks und Leertaste an (einmal beim Start aufrufen).
export function setupSmithingGame() {
  document.body.appendChild(panel);
  addUpdate(updateSmithingGame);

  mark.addEventListener("pointerdown", (event) => {
    event.stopPropagation?.();
    event.preventDefault?.();
    strike(true);
  });
  blade.addEventListener("pointerdown", (event) => {
    event.preventDefault?.();
    strike(false);
  });
  reheatButton.addEventListener("click", reheat);
  addEventListener("keydown", (event) => {
    if (round !== null && event.code === REHEAT_KEY && !event.repeat) {
      event.preventDefault();
      reheat();
    }
  });
}

// Startet eine Runde. options: hits (so viele Treffer braucht man), heatSeconds (so lange bleibt das Metall heiß genug,
// von voll bis kalt), coldHeat (darunter ist es zu kalt, 0 bis 1), reheatSeconds, maxMistakes.
export function startSmithingGame(options) {
  clearTimeout(feedbackTimer);
  panel.classList.remove(HIDDEN_CLASS, ...Object.values(RESULT_CLASSES));
  round = { options: options, heat: 1, hits: 0, mistakes: 0, reheatLeft: 0 };
  status.textContent = "Strike while it's hot!";
  moveMark();
  update();
}

// Bricht die Runde ohne Ergebnis ab und versteckt das Panel sofort.
export function stopSmithingGame() {
  round = null;
  clearTimeout(feedbackTimer);
  panel.classList.remove(...Object.values(RESULT_CLASSES));
  panel.classList.add(HIDDEN_CLASS);
}

// Läuft jedes Bild: Metall kühlt ab, in der Esse heizt es wieder auf.
function updateSmithingGame(deltaTime) {
  if (round === null) {
    return;
  }
  const { options } = round;
  if (round.reheatLeft > 0) {
    round.reheatLeft -= deltaTime;
    round.heat = Math.min(1, round.heat + deltaTime / options.reheatSeconds);
    if (round.reheatLeft <= 0) {
      round.heat = 1;
      status.textContent = "Strike while it's hot!";
    }
  } else {
    // Von voll (1) bis zur Kälte-Grenze dauert es heatSeconds
    round.heat = Math.max(0, round.heat - ((1 - options.coldHeat) / options.heatSeconds) * deltaTime);
    if (round.heat < options.coldHeat) {
      status.textContent = "Too cold! Reheat it";
    }
  }
  update();
}

// Ein Schlag: auf die Markierung (onMark) bei heißem Metall = Treffer, sonst Fehler. In der Esse zählt kein Schlag.
function strike(onMark) {
  if (round === null || round.reheatLeft > 0) {
    return;
  }
  if (onMark && round.heat >= round.options.coldHeat) {
    round.hits += 1;
    if (round.hits >= round.options.hits) {
      finishRound(round.mistakes === 0 ? "good" : "done");
      return;
    }
    moveMark();
  } else {
    round.mistakes += 1;
    panel.classList.add("smithing-shake");
    setTimeout(() => panel.classList.remove("smithing-shake"), SHAKE_MS);
    if (round.mistakes > round.options.maxMistakes) {
      finishRound("ruined");
      return;
    }
  }
  update();
}

// Zurück in die Esse: für reheatSeconds keine Schläge, danach ist das Metall wieder voll heiß.
function reheat() {
  if (round === null || round.reheatLeft > 0 || round.heat >= 1) {
    return;
  }
  round.reheatLeft = round.options.reheatSeconds;
  status.textContent = "Heating…";
  update();
}

// Setzt die Markierung an eine neue zufällige Stelle der Klinge.
function moveMark() {
  mark.style.left = (EDGE_MARGIN + Math.random() * (1 - 2 * EDGE_MARGIN)) * 100 + "%";
}

// Zeichnet Hitze-Leiste, Klingen-Farbe, Zähler und Knopf neu.
function update() {
  const cold = round.heat < round.options.coldHeat;
  heatFill.style.width = round.heat * 100 + "%";
  panel.classList.toggle("smithing-cold", cold);
  panel.classList.toggle("smithing-heating", round.reheatLeft > 0);
  mark.hidden = round.reheatLeft > 0;
  reheatButton.disabled = round.reheatLeft > 0 || round.heat >= 1;
  const { hits } = round.options;
  counter.textContent =
    "●".repeat(round.hits) + "○".repeat(Math.max(0, hits - round.hits)) + (round.mistakes > 0 ? "  " + "✗".repeat(round.mistakes) : "");
}

// Meldet das Ergebnis, färbt das Panel kurz und versteckt es danach.
function finishRound(result) {
  round = null;
  emit("smithingResult", { result });
  status.textContent = RESULT_TEXT[result];
  panel.classList.remove("smithing-cold", "smithing-heating");
  panel.classList.add(RESULT_CLASSES[result]);
  feedbackTimer = setTimeout(() => {
    panel.classList.remove(...Object.values(RESULT_CLASSES));
    panel.classList.add(HIDDEN_CLASS);
  }, FEEDBACK_MS);
}
