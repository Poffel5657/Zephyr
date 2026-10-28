// Der Spiel-Loop: ruft bei jedem Bild alle angemeldeten Funktionen mit deltaTime auf.
// Pause (z. B. Loot-Fenster offen): Die Welt steht, nur Funktionen mit whilePaused laufen weiter (Kamera, Bild, UI).

const updateFunctions = [];
// Gründe, warum das Spiel gerade pausiert (leer = läuft)
const pauseReasons = new Set();
let lastTime = null;
const MAX_DELTA_TIME = 0.1;

// Meldet eine Funktion an, die ab jetzt jedes Bild mit deltaTime aufgerufen wird.
// whilePaused: läuft auch in der Pause weiter.
export function addUpdate(updateFunction, { whilePaused = false } = {}) {
  updateFunctions.push({ updateFunction, whilePaused });
}

// Hält das Spiel an, bis resumeGame mit demselben Grund kommt (mehrere Gründe gleichzeitig gehen).
export function pauseGame(reason) {
  pauseReasons.add(reason);
}

// Hebt eine Pause wieder auf.
export function resumeGame(reason) {
  pauseReasons.delete(reason);
}

// Ist das Spiel gerade pausiert?
export function isPaused() {
  return pauseReasons.size > 0;
}

// Startet den Loop (nur einmal aufrufen).
export function startLoop() {
  requestAnimationFrame(tick);
}

// Ein Bild: deltaTime ausrechnen, alle Funktionen aufrufen, nächstes Bild anfordern.
function tick(currentTime) {
  let deltaTime = 0;
  if (lastTime !== null) {
    deltaTime = (currentTime - lastTime) / 1000;
  }
  lastTime = currentTime;

  if (deltaTime > MAX_DELTA_TIME) {
    deltaTime = MAX_DELTA_TIME;
  }

  const paused = isPaused();
  for (const { updateFunction, whilePaused } of updateFunctions) {
    if (whilePaused || !paused) {
      updateFunction(deltaTime);
    }
  }

  requestAnimationFrame(tick);
}
