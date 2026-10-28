// Würz-Mini-Spiel: Nacheinander erscheinen ein paar Pfeiltasten (würzen, wenden, salzen …), die man in der richtigen
// Reihenfolge drückt. Für die ganze Folge gibt es eine feste Zeit. Falsche Taste = Fehler, dann geht es weiter.
// Läuft die Zeit ab, zählen alle übrigen Tasten als Fehler.
// Keine Fehler und schnell = "perfect", bis maxMistakes Fehler = "done", mehr = "burnt".
// Tasten wie bei den Kampf-Combos (rhythm.json: Pfeiltasten oder WASD). Meldet pro Runde einmal "cookingResult" mit { result }.
import "./ui.css";
import "./cooking.css";
import RHYTHM from "../data/rhythm.json";
import { emit } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";

const FEEDBACK_MS = 600;
const HIDDEN_CLASS = "cooking-game-hidden";
const RESULT_CLASSES = { perfect: "cooking-game-perfect", done: "cooking-game-done", burnt: "cooking-game-burnt" };
const RESULT_TEXT = { perfect: "Perfect!", done: "Cooked", burnt: "Burnt…" };
const KEYS = Object.keys(RHYTHM.keys);

const panel = document.createElement("div");
panel.className = "ui-panel cooking-game " + HIDDEN_CLASS;
const status = document.createElement("div");
status.className = "cooking-status";
const stepRow = document.createElement("div");
stepRow.className = "cooking-steps";
const timer = document.createElement("div");
timer.className = "cooking-timer";
const timerFill = document.createElement("div");
timerFill.className = "cooking-timer-fill";
timer.appendChild(timerFill);
panel.append(status, stepRow, timer);

// Laufende Runde (null = keine): { keys, cells, index, timeLeft, options, mistakes }
let round = null;
let feedbackTimer = null;

// Hängt das Panel in die Seite und meldet Spiel-Loop und Tasten an (einmal beim Start aufrufen).
export function setupCookingGame() {
  document.body.appendChild(panel);
  addUpdate(updateCookingGame);

  addEventListener("keydown", (event) => {
    if (round === null || event.repeat) {
      return;
    }
    const key = KEYS.find((name) => RHYTHM.keys[name].codes.includes(event.code));
    if (key !== undefined) {
      event.preventDefault();
      answerStep(key === round.keys[round.index]);
    }
  });
}

// Startet eine Runde. options: steps (Anzahl Tasten), totalSeconds (Zeit für die ganze Folge),
// fastSeconds (so schnell muss man fertig sein für Perfect), maxMistakes (so viele Fehler gehen noch als "done").
export function startCookingGame(options) {
  clearTimeout(feedbackTimer);
  panel.classList.remove(HIDDEN_CLASS, ...Object.values(RESULT_CLASSES));

  const keys = Array.from({ length: options.steps }, () => KEYS[Math.floor(Math.random() * KEYS.length)]);
  const cells = keys.map((key) => {
    const cell = document.createElement("span");
    cell.className = "cooking-step";
    cell.textContent = RHYTHM.keys[key].label;
    cell.style.color = RHYTHM.keys[key].color;
    return cell;
  });
  stepRow.replaceChildren(...cells);
  status.textContent = "Season it!";
  round = { keys, cells, index: 0, timeLeft: options.totalSeconds, options, mistakes: 0 };
  markCurrent();
}

// Bricht die Runde ohne Ergebnis ab und versteckt das Panel sofort.
export function stopCookingGame() {
  round = null;
  clearTimeout(feedbackTimer);
  panel.classList.add(HIDDEN_CLASS);
}

// Zählt die Zeit für die ganze Folge herunter. Abgelaufen = alle übrigen Tasten sind Fehler.
function updateCookingGame(deltaTime) {
  if (round === null) {
    return;
  }
  round.timeLeft -= deltaTime;
  timerFill.style.width = Math.max(0, round.timeLeft / round.options.totalSeconds) * 100 + "%";
  while (round !== null && round.timeLeft <= 0) {
    answerStep(false);
  }
}

// Wertet den aktuellen Schritt aus (richtig / falsch) und geht zum nächsten.
function answerStep(correct) {
  const cell = round.cells[round.index];
  cell.classList.remove("cooking-step-current");
  cell.classList.add(correct ? "cooking-step-hit" : "cooking-step-miss");
  if (!correct) {
    round.mistakes++;
  }

  round.index++;
  if (round.index < round.keys.length) {
    markCurrent();
    return;
  }

  // Langsamer als fastSeconds gebraucht: dann ist kein Perfect mehr drin
  const { mistakes, options } = round;
  const slow = options.totalSeconds - round.timeLeft > options.fastSeconds;
  if (mistakes === 0 && !slow) {
    finishRound("perfect");
  } else if (mistakes <= options.maxMistakes) {
    finishRound("done");
  } else {
    finishRound("burnt");
  }
}

// Hebt den aktuellen Schritt hervor.
function markCurrent() {
  round.cells[round.index].classList.add("cooking-step-current");
}

// Meldet das Ergebnis, zeigt es kurz an und versteckt das Panel danach.
function finishRound(result) {
  round = null;
  emit("cookingResult", { result });
  status.textContent = RESULT_TEXT[result];
  timerFill.style.width = "0%";
  panel.classList.add(RESULT_CLASSES[result]);
  feedbackTimer = setTimeout(() => {
    panel.classList.remove(...Object.values(RESULT_CLASSES));
    panel.classList.add(HIDDEN_CLASS);
  }, FEEDBACK_MS);
}
