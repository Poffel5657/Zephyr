// Angel-Mini-Spiel mit der Maus, fast wie echtes Angeln. Die Maus ist gesperrt (Pointer Lock) und unsichtbar, der
// Schwimmer ist der Zeiger: Er macht jede Mausbewegung mit, aber beim Drillen zieht der Fisch ihn wirklich mit.
// 1. Warten: Der Schwimmer muss auf dem Wasserfeld bleiben. Wer ihn herausbewegt, verscheucht den Fisch.
// 2. Biss: In biteSeconds den Schwimmer kräftig nach oben oder zur Seite wegziehen (Anschlag, strikeDistance weit).
// 3. Drillen: Der Fisch schwimmt nach links oder rechts (Pfeil am Schwimmer) und dreht immer wieder um. Gegen seine
//    Richtung ziehen kostet ihn Ausdauer (fishStamina), mit ihm ziehen gibt sie ihm zurück. Ausdauer leer = gefangen,
//    wieder voll oder Schwimmer zurück im Wasserfeld = entkommen. Weiter als lineLength geht die Schnur nicht.
// Alle Abstände zählen in Feld-Breiten auf dem Bildschirm, damit es bei jedem Zoom gleich schwer ist.
// Meldet pro Runde genau einmal "fishingResult" mit { caught, reason } (reason: "scared", "late", "escaped", "cancelled"
// oder null). Esc (gibt die Maus frei) bricht ab.
import "./ui.css";
import "./fishingGame.css";
import * as THREE from "three";
import { emit } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { gridToWorld, TILE_SIZE } from "../world/grid.js";
import { toScreen } from "./screenPosition.js";

// So weit wackelt der Schwimmer höchstens (Pixel), kurz bevor der Fisch weg ist oder die Schnur reißt
const MAX_SHAKE = 4;
// Ab hier (Anteil von 0 bis 1) gilt es als knapp: Schnur wird rot
const STRAIN_WARNING = 0.5;
// Ab so viel übriger Ausdauer (Anteil) wird es knapp, weil der Fisch fast wieder bei Kräften ist
const STRAIN_FROM_STAMINA = 0.7;
// So lange bleibt der Balken nach dem Mitziehen rot (Sekunden, damit er nicht flackert)
const RECOVER_SHOW_SECONDS = 0.2;
// Anschlag: Der Schwimmer darf beim Wegziehen höchstens so weit nach unten gehen (in Feld-Breiten)
const STRIKE_MAX_DOWN = 0.2;
// So weit sitzt der Richtungs-Pfeil neben dem Schwimmer (Pixel)
const ARROW_OFFSET = 18;
// So hoch über dem Spieler sitzt die Rutenspitze (Welt-Einheiten)
const ROD_HEIGHT = 1.1;
// Klasse am body, die den echten Mauszeiger versteckt
const CURSOR_CLASS = "fishing-no-cursor";
const FEEDBACK_MS = 600;
const HIDDEN_CLASS = "fishing-hidden";
const PHASE_CLASSES = ["fishing-waiting", "fishing-bite", "fishing-reeling"];
const RESULT_CLASSES = ["fishing-caught", "fishing-lost"];

// Status-Panel unten in der Mitte
const panel = document.createElement("div");
panel.className = "ui-panel fishing-game " + HIDDEN_CLASS;
const status = document.createElement("div");
status.className = "fishing-status";
const progressBar = document.createElement("div");
progressBar.className = "fishing-progress";
const progressFill = document.createElement("div");
progressFill.className = "fishing-progress-fill";
progressBar.appendChild(progressFill);
const hint = document.createElement("div");
hint.className = "fishing-hint";
hint.textContent = "Click to grab the rod · Esc to stop";
hint.hidden = true;
panel.append(status, progressBar, hint);

// Über der Welt: Umriss des Wasserfelds, Schnur und Schwimmer
const overlay = document.createElement("div");
overlay.className = "fishing-overlay " + HIDDEN_CLASS;
const edges = Array.from({ length: 4 }, () => createLine("fishing-edge"));
const line = createLine("fishing-line");
const bobber = document.createElement("div");
bobber.className = "fishing-bobber";
// Pfeil neben dem Schwimmer: in diese Richtung schwimmt der Fisch
const arrow = document.createElement("div");
arrow.className = "fishing-arrow";
overlay.append(...edges, line, bobber, arrow);

let camera = null;
// Letzte echte Mausposition in Pixeln (null = noch nicht bewegt)
let mouse = null;
// Mausbewegung seit dem letzten Bild (Pixel), wird jedes Bild auf den Schwimmer angewendet
const pending = { x: 0, y: 0 };
// Laufende Runde (null = keine):
// { phase, options, x, z, rod, timeLeft, wasInside, bobber, direction, turnLeft, turning, runLeft, runTime, stamina,
//   recoverTime, strain, locked }
let round = null;
let feedbackTimer = null;

// Hängt Panel und Overlay in die Seite und meldet Spiel-Loop und Maus an (einmal beim Start aufrufen).
export function setupFishingGame(gameCamera) {
  camera = gameCamera;
  document.body.appendChild(panel);
  document.body.appendChild(overlay);
  addUpdate(updateFishingGame);
  addEventListener("pointermove", (event) => {
    // Gesperrte Maus: Die Position bleibt stehen, es gibt nur die Bewegung
    if (isLocked()) {
      pending.x += event.movementX;
      pending.y += event.movementY;
      return;
    }
    if (mouse !== null) {
      pending.x += event.clientX - mouse.x;
      pending.y += event.clientY - mouse.y;
    }
    mouse = { x: event.clientX, y: event.clientY };
  });

  // Ohne Sperre: Klick auf die Welt sperrt die Maus (das Overlay fängt den Klick, damit man nicht losläuft)
  overlay.addEventListener("pointerdown", (event) => {
    event.preventDefault?.();
    lockMouse();
  });
  // Esc gibt die Maus frei: Angeln abbrechen
  document.addEventListener("pointerlockchange", () => {
    if (round !== null && round.locked && !isLocked()) {
      finishRound(false, "cancelled");
    }
    if (round !== null) {
      round.locked = isLocked();
      updateLockHint();
    }
  });
}

// Startet eine Runde an der Angelstelle x / z. rod = Position des Spielers (für die Schnur).
// options: waitMin, waitMax, biteSeconds, strikeDistance, lineLength, fishStamina, pullPower, recoverFactor,
// restPerSecond, swimSpeed, turnMin, turnMax, turnWarning, runSpeed, runSeconds, runInterval.
export function startFishingGame(x, z, options, rod) {
  clearTimeout(feedbackTimer);
  panel.classList.remove(HIDDEN_CLASS, "fishing-recovering", ...RESULT_CLASSES);
  overlay.classList.remove(HIDDEN_CLASS);
  document.body.classList.add(CURSOR_CLASS);
  pending.x = 0;
  pending.y = 0;
  // Der Schwimmer startet da, wo die Maus gerade ist (meistens auf der angeklickten Angelstelle)
  const start = mouse ?? getSpotOnScreen(x, z)?.center ?? { x: 0, y: 0 };
  round = {
    phase: "waiting",
    options: options,
    x: x,
    z: z,
    rod: rod,
    timeLeft: options.waitMin + Math.random() * (options.waitMax - options.waitMin),
    wasInside: false,
    bobber: { x: start.x, y: start.y },
    // -1 = links, 1 = rechts
    direction: Math.random() < 0.5 ? -1 : 1,
    turnLeft: nextTurn(options),
    turning: false,
    // Die erste Flucht kommt schon nach der halben Pause
    runLeft: options.runInterval / 2,
    runTime: 0,
    stamina: options.fishStamina,
    recoverTime: 0,
    strain: 0,
    locked: false,
  };
  showPhase("waiting", "Keep the bobber on the water…");
  progressFill.style.width = "0%";
  lockMouse();
}

// Bricht die Runde ohne Ergebnis ab und versteckt alles sofort.
export function stopFishingGame() {
  round = null;
  clearTimeout(feedbackTimer);
  panel.classList.remove(...RESULT_CLASSES);
  panel.classList.add(HIDDEN_CLASS);
  hideOverlay();
}

// Gibt die Richtung zurück, in die der Fisch gerade schwimmt (-1 links, 1 rechts), 0 außerhalb vom Drillen (für Tests).
export function getFishDirection() {
  return round?.phase === "reeling" ? round.direction : 0;
}

// Gibt den Schwimmer auf dem Bildschirm zurück (Pixel), null ohne laufende Runde (für Tests).
export function getBobberOnScreen() {
  return round === null ? null : { ...round.bobber };
}

// Gibt das Wasserfeld auf dem Bildschirm zurück: { center, corners, size } (size = Feld-Breite in Pixeln).
export function getSpotOnScreen(x, z) {
  const middle = gridToWorld(x, z);
  const half = TILE_SIZE / 2;
  const corners = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([dx, dz]) =>
    toScreen(new THREE.Vector3(middle.x + dx, middle.y, middle.z + dz), camera),
  );
  const center = toScreen(middle, camera);
  if (center === null || corners.includes(null)) {
    return null;
  }
  const size = Math.max(distance(corners[0], corners[1]), distance(corners[1], corners[2]));
  return { center, corners, size };
}

// Läuft jedes Bild: je nach Phase warten, auf den Anschlag warten oder drillen.
function updateFishingGame(deltaTime) {
  if (round === null) {
    return;
  }
  const spot = getSpotOnScreen(round.x, round.z);
  if (spot === null) {
    return;
  }
  const move = { x: pending.x, y: pending.y };
  pending.x = 0;
  pending.y = 0;

  if (round.phase === "reeling") {
    updateReeling(deltaTime, spot, move);
  } else {
    // Warten und Biss: Der Schwimmer macht die Mausbewegung genau mit
    round.bobber.x += move.x;
    round.bobber.y += move.y;
    updateWaiting(deltaTime, spot);
  }
  if (round !== null) {
    draw(spot);
  }
}

// Warten auf den Biss und Anschlag.
function updateWaiting(deltaTime, spot) {
  const inside = isInside(round.bobber, spot.corners);

  if (round.phase === "waiting") {
    // Die Wartezeit läuft erst, wenn der Schwimmer einmal auf dem Wasser war
    if (inside) {
      round.wasInside = true;
    } else if (round.wasInside) {
      finishRound(false, "scared");
      return;
    }
    if (round.wasInside) {
      round.timeLeft -= deltaTime;
    }
    if (round.timeLeft <= 0) {
      round.phase = "bite";
      round.timeLeft = round.options.biteSeconds;
      showPhase("bite", "Bite! Pull up!");
    }
    return;
  }

  // Anschlag: kräftig weg vom Wasser, aber nicht nach unten. Nur knapp aus dem Feld reicht nicht
  if (round.bobber.y - spot.center.y > STRIKE_MAX_DOWN * spot.size && !inside) {
    finishRound(false, "scared");
    return;
  }
  const away = distance(round.bobber, spot.center) / spot.size;
  if (away >= round.options.strikeDistance) {
    round.phase = "reeling";
    // Der Anschlag zählt schon als erster Zug
    round.stamina -= away * round.options.pullPower;
    clampToLine(spot);
    showPhase("reeling", "Pull against the fish!");
    return;
  }
  round.timeLeft -= deltaTime;
  if (round.timeLeft <= 0) {
    finishRound(false, "late");
  }
}

// Drillen: Der Fisch schwimmt nach links oder rechts und zieht den Schwimmer mit. Wer dagegen zieht, kostet ihn
// Ausdauer, wer mitzieht, gibt ihm Ausdauer zurück. Ab und zu dreht er um (kurz vorher blinkt der Pfeil) oder flüchtet.
// Danach Aufgeben oder Entkommen prüfen.
function updateReeling(deltaTime, spot, move) {
  const { options } = round;
  const unit = spot.size;
  const position = round.bobber;

  // Umdrehen: turnWarning Sekunden vorher blinkt der Pfeil
  round.turnLeft -= deltaTime;
  if (round.turnLeft <= 0) {
    round.direction = -round.direction;
    round.turnLeft = nextTurn(options);
  }
  round.turning = round.turnLeft <= options.turnWarning;

  // Flucht: für runSeconds schwimmt der Fisch mit runSpeed statt swimSpeed
  if (round.runTime > 0) {
    round.runTime -= deltaTime;
  } else {
    round.runLeft -= deltaTime;
    if (round.runLeft <= 0) {
      round.runLeft = options.runInterval * (0.75 + Math.random() / 2);
      round.runTime = options.runSeconds;
    }
  }
  const speed = round.runTime > 0 ? options.runSpeed : options.swimSpeed;
  status.textContent = round.runTime > 0 ? "It's fighting back!" : round.direction < 0 ? "It swims left, pull right!" : "It swims right, pull left!";

  // Der Fisch zieht den Schwimmer in seine Richtung
  position.x += round.direction * speed * unit * deltaTime;
  clampToLine(spot);

  // Mausbewegung: Was quer gegen den Fisch geht, kostet ihn Ausdauer, mitziehen gibt sie ihm zurück
  const beforeX = position.x;
  position.x += move.x;
  position.y += move.y;
  clampToLine(spot);
  const against = (-round.direction * (position.x - beforeX)) / unit;
  if (against > 0) {
    round.stamina -= against * options.pullPower;
  } else {
    round.stamina -= against * options.recoverFactor;
    // Wer nicht dagegen hält, lässt den Fisch verschnaufen
    round.stamina += options.restPerSecond * deltaTime;
  }
  if (against < 0) {
    round.recoverTime = RECOVER_SHOW_SECONDS;
  } else {
    round.recoverTime -= deltaTime;
  }
  panel.classList.toggle("fishing-recovering", round.recoverTime > 0);

  // Knapp ist es, wenn der Schwimmer nah am Wasser ist oder der Fisch fast wieder bei Kräften
  const landed = distance(position, spot.center) / unit;
  const fresh = (round.stamina / options.fishStamina - STRAIN_FROM_STAMINA) / (1 - STRAIN_FROM_STAMINA);
  round.strain = Math.max(1 - Math.min(1, Math.max(0, landed - 0.5)), Math.min(1, Math.max(0, fresh)));
  progressFill.style.width = Math.max(0, Math.min(1, 1 - round.stamina / options.fishStamina)) * 100 + "%";

  if (isInside(position, spot.corners) || round.stamina >= options.fishStamina) {
    finishRound(false, "escaped");
  } else if (round.stamina <= 0) {
    finishRound(true, null);
  }
}

// Zufällige Zeit bis zum nächsten Umdrehen (Sekunden).
function nextTurn(options) {
  return options.turnMin + Math.random() * (options.turnMax - options.turnMin);
}

// Länger als lineLength ist die Schnur nicht: Schwimmer höchstens so weit vom Wasser weg.
function clampToLine(spot) {
  const maxDistance = round.options.lineLength * spot.size;
  const current = distance(round.bobber, spot.center);
  if (current > maxDistance) {
    round.bobber.x = spot.center.x + ((round.bobber.x - spot.center.x) / current) * maxDistance;
    round.bobber.y = spot.center.y + ((round.bobber.y - spot.center.y) / current) * maxDistance;
  }
}

// Sperrt die Maus (geht nur nach einem Klick, sonst bleibt der Hinweis stehen).
function lockMouse() {
  if (isLocked()) {
    return;
  }
  const request = document.body.requestPointerLock?.();
  // Neuere Browser geben ein Promise zurück, das ohne vorherigen Klick abgelehnt wird
  request?.catch?.(() => {});
  updateLockHint();
}

// Ist die Maus gerade gesperrt?
function isLocked() {
  return document.pointerLockElement != null;
}

// Zeigt "Click to grab the rod", solange die Maus nicht gesperrt ist (das Overlay fängt dann den Klick).
function updateLockHint() {
  const needsClick = round !== null && !isLocked() && document.body.requestPointerLock !== undefined;
  overlay.classList.toggle("fishing-needs-click", needsClick);
  hint.hidden = !needsClick;
}

// Zeichnet Wasserfeld-Umriss, Schnur (Rutenspitze → Schwimmer) und Schwimmer, mit Wackeln und rot, wenn es knapp wird.
function draw(spot) {
  spot.corners.forEach((corner, i) => placeLine(edges[i], corner, spot.corners[(i + 1) % 4]));

  const shake = round.phase === "reeling" ? round.strain * MAX_SHAKE : 0;
  const jitter = () => (Math.random() - 0.5) * 2 * shake;
  const end = { x: round.bobber.x + jitter(), y: round.bobber.y + jitter() };
  bobber.style.left = end.x + "px";
  bobber.style.top = end.y + "px";
  const reeling = round.phase === "reeling";
  arrow.hidden = !reeling;
  if (reeling) {
    arrow.textContent = round.direction < 0 ? "◀" : "▶";
    arrow.style.left = end.x + round.direction * ARROW_OFFSET + "px";
    arrow.style.top = end.y + "px";
    arrow.classList.toggle("fishing-turning", round.turning);
  }

  const rod = toScreen(new THREE.Vector3(round.rod.x, round.rod.y + ROD_HEIGHT, round.rod.z), camera);
  if (rod !== null) {
    placeLine(line, rod, end);
  }
  overlay.classList.toggle("fishing-strain", round.phase === "reeling" && round.strain > STRAIN_WARNING);
}

// Setzt Klasse und Text für die aktuelle Phase.
function showPhase(phase, text) {
  panel.classList.remove(...PHASE_CLASSES);
  overlay.classList.remove(...PHASE_CLASSES, "fishing-strain");
  panel.classList.add("fishing-" + phase);
  overlay.classList.add("fishing-" + phase);
  status.textContent = text;
}

// Meldet das Ergebnis, färbt das Panel kurz grün oder rot und versteckt danach alles.
function finishRound(caught, reason) {
  round = null;
  emit("fishingResult", { caught, reason });
  hideOverlay();
  panel.classList.add(caught ? "fishing-caught" : "fishing-lost");
  feedbackTimer = setTimeout(() => {
    panel.classList.remove(...RESULT_CLASSES);
    panel.classList.add(HIDDEN_CLASS);
  }, FEEDBACK_MS);
}

// Versteckt Schnur und Schwimmer, gibt die Maus frei und zeigt den echten Mauszeiger wieder.
function hideOverlay() {
  overlay.classList.add(HIDDEN_CLASS);
  overlay.classList.remove("fishing-needs-click");
  hint.hidden = true;
  document.body.classList.remove(CURSOR_CLASS);
  if (isLocked()) {
    document.exitPointerLock?.();
  }
}

// Eine Linie als gedrehtes div (Länge = Breite, Drehpunkt links).
function createLine(className) {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

// Legt eine Linie von a nach b (Bildschirm-Pixel).
function placeLine(element, a, b) {
  element.style.left = a.x + "px";
  element.style.top = a.y + "px";
  element.style.width = distance(a, b) + "px";
  element.style.transform = `rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
}

// Liegt der Punkt im Viereck (Ecken der Reihe nach)? Gleiche Seite aller vier Kanten.
function isInside(point, corners) {
  let sign = 0;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (cross !== 0) {
      if (sign !== 0 && Math.sign(cross) !== sign) {
        return false;
      }
      sign = Math.sign(cross);
    }
  }
  return true;
}

// Abstand zweier Bildschirm-Punkte.
function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
