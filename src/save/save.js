// Speichert den Spielstand im Browser (localStorage) und lädt ihn beim Start wieder.
// Zwei Spielstände: der Autosave (überschreibt sich ständig) und der eigene Save (nur über "Save" im Menü).
// Gespeichert werden nur Daten (keine three.js-Objekte): Spieler und gefällte Bäume.
import { emit, on } from "../core/eventBus.js";
import { gridToWorld, isWalkable } from "../world/grid.js";
import { getSlots, setSlots } from "../inventory/inventory.js";
import { getFelledTrees, setFelledTrees } from "../skills/woodcutting.js";
import { getMaxHp } from "../character/character.js";
import { showMessage } from "../ui/messages.js";

const STORAGE_KEY = "zephyr-save";
const MANUAL_KEY = "zephyr-save-manual";
// Hierhin kommt ein Spielstand, der nicht geladen werden konnte, damit er nicht überschrieben wird
const BROKEN_KEY = "zephyr-save-broken";
// Bei neuen Daten in späteren Phasen hochzählen und in applySaveData alte Stände auffüllen
// Version 2: aktuelle HP (Phase 8)
const SAVE_VERSION = 2;

// Automatisch speichern: nach Änderungen höchstens einmal pro Sekunde, sonst alle 10 Sekunden
const CHANGE_DELAY_MS = 1000;
const INTERVAL_MS = 10000;

// Nach "New Game" oder "Import" nicht mehr speichern, sonst schreibt das Verlassen der Seite den alten Stand zurück
let savingStopped = false;
// Im Kampf wird nicht gespeichert: Der Stand von vor dem Kampf bleibt der Autosave
let savingPaused = false;
// So lange steht "You were defeated" da, bevor neu geladen wird
const DEFEAT_RELOAD_MS = 2000;

// Baut den Spielstand als einfaches Objekt.
export function createSaveData(player) {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    player: {
      x: player.x,
      z: player.z,
      inventory: getSlots(player.inventory).map((slot) => (slot === null ? null : { ...slot })),
      skills: { ...player.skills },
      stats: { ...player.stats },
      level: player.level,
      skillLevelUps: player.skillLevelUps,
      unspentPoints: player.unspentPoints,
      hp: player.hp,
    },
    world: {
      felledTrees: getFelledTrees(),
    },
  };
}

// Speichert den aktuellen Stand als Autosave und meldet "gameSaved" (false, wenn es nicht geklappt hat).
export function saveGame(player) {
  return writeSave(player, [STORAGE_KEY]);
}

// Speichert den aktuellen Stand als eigenen Save (und als Autosave, damit beide gleich sind).
export function saveManual(player) {
  return writeSave(player, [STORAGE_KEY, MANUAL_KEY]);
}

// Schreibt den Stand unter alle diese Schlüssel.
function writeSave(player, keys) {
  if (savingStopped || savingPaused) {
    return false;
  }
  try {
    const text = JSON.stringify(createSaveData(player));
    for (const key of keys) {
      localStorage.setItem(key, text);
    }
  } catch (error) {
    // z. B. privates Fenster oder Speicher voll
    console.warn("Speichern fehlgeschlagen:", error);
    return false;
  }
  emit("gameSaved", {});
  return true;
}

// Lädt den Autosave, falls einer da ist (erst aufrufen, wenn Insel und Fenster gebaut sind).
// Fehlt er oder ist er kaputt, wird der eigene Save versucht. Gibt true zurück, wenn etwas geladen wurde.
export function loadGame(player) {
  const text = readStorage(STORAGE_KEY);
  const data = text === null ? null : parseSaveText(text);
  const fallback = data === null ? parseSaveText(readStorage(MANUAL_KEY) ?? "") : null;

  if (data === null && text !== null) {
    // Kaputten Stand aufheben, damit man ihn notfalls von Hand retten kann
    try {
      localStorage.setItem(BROKEN_KEY, text);
    } catch (error) {
      console.warn(error);
    }
    showMessage(fallback === null ? "Save could not be loaded" : "Autosave broken, loaded your last save");
  }

  const loaded = data ?? fallback;
  if (loaded === null) {
    return false;
  }
  applySaveData(player, loaded);
  return true;
}

// Gibt die Zeit des eigenen Saves zurück (null, wenn es keinen gültigen gibt).
export function getManualSaveTime() {
  const data = parseSaveText(readStorage(MANUAL_KEY) ?? "");
  return data === null ? null : new Date(data.savedAt);
}

// Macht den eigenen Save zum aktuellen Stand (für "Load"). Danach die Seite neu laden;
// bis dahin wird nicht mehr gespeichert, sonst überschreibt der Autosave ihn wieder.
export function loadManualSave() {
  const text = readStorage(MANUAL_KEY);
  if (text === null || parseSaveText(text) === null) {
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch (error) {
    console.warn(error);
    return false;
  }
  savingStopped = true;
  return true;
}

// Löscht beide Spielstände und speichert bis zum Neuladen der Seite nicht mehr (für "New Game").
export function deleteSave() {
  savingStopped = true;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(MANUAL_KEY);
  } catch (error) {
    console.warn(error);
  }
}

// Gibt den aktuellen Stand als JSON-Text zurück (für "Export").
export function exportSaveText(player) {
  return JSON.stringify(createSaveData(player), null, 2);
}

// Prüft einen Text aus einer Datei und legt ihn als Autosave und eigenen Save ab (für "Import").
// Danach wird bis zum Neuladen nicht mehr gespeichert. false = keine gültige Datei, nichts geändert.
export function importSaveText(text) {
  if (parseSaveText(text) === null) {
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, text);
    localStorage.setItem(MANUAL_KEY, text);
  } catch (error) {
    console.warn(error);
    return false;
  }
  savingStopped = true;
  return true;
}

// Speichert automatisch: nach Änderungen, alle paar Sekunden und beim Verlassen der Seite.
export function setupAutoSave(player) {
  let changeTimer = null;
  const saveSoon = () => {
    if (changeTimer === null) {
      changeTimer = setTimeout(() => {
        changeTimer = null;
        saveGame(player);
      }, CHANGE_DELAY_MS);
    }
  };

  for (const eventName of ["inventoryChanged", "skillsChanged", "statsChanged", "hpChanged"]) {
    on(eventName, saveSoon);
  }

  // Kampfstart: noch einmal speichern, dann bis zum Ende pausieren (Neuladen im Kampf = Stand von vor dem Kampf)
  on("combatStarted", () => {
    saveGame(player);
    savingPaused = true;
  });
  on("combatEnded", ({ result }) => {
    if (result !== "defeat") {
      savingPaused = false;
      saveGame(player);
      return;
    }
    // Niederlage: zum eigenen Save, ohne eigenen Save zum Stand von vor dem Kampf (der Autosave)
    setTimeout(() => {
      if (!loadManualSave()) {
        savingStopped = true;
      }
      location.reload();
    }, DEFEAT_RELOAD_MS);
  });
  // Position und Baum-Restzeiten ändern sich ohne Event
  setInterval(() => saveGame(player), INTERVAL_MS);

  // Am Handy feuert beim Schließen oft nur "visibilitychange", am PC "pagehide"
  addEventListener("pagehide", () => saveGame(player));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      saveGame(player);
    }
  });
}

// Liest einen Eintrag aus dem localStorage (null, wenn er fehlt oder nicht lesbar ist).
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn("Spielstand nicht lesbar:", error);
    return null;
  }
}

// Liest einen Spielstand-Text. Gibt null zurück, wenn es kein gültiger Zephyr-Spielstand ist.
function parseSaveText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  const valid =
    data !== null &&
    typeof data === "object" &&
    Number.isInteger(data.version) &&
    data.version >= 1 &&
    data.version <= SAVE_VERSION &&
    data.player !== null &&
    typeof data.player === "object";
  return valid ? data : null;
}

// Setzt den geladenen Stand auf den Spieler und die Welt. Fehlendes oder Ungültiges behält den Startwert.
function applySaveData(player, data) {
  const saved = data.player;

  // Position nur, wenn das Feld noch begehbar ist (die Karte könnte sich geändert haben)
  if (Number.isInteger(saved.x) && Number.isInteger(saved.z) && isWalkable(saved.x, saved.z)) {
    const standOffset = player.mesh.position.y - gridToWorld(player.x, player.z).y;
    player.x = saved.x;
    player.z = saved.z;
    player.mesh.position.copy(gridToWorld(saved.x, saved.z));
    player.mesh.position.y += standOffset;
  }

  if (Array.isArray(saved.inventory)) {
    setSlots(player.inventory, saved.inventory);
  }

  // Nur Skills, die es noch gibt; neue Skills bleiben bei 0
  for (const skillId of Object.keys(player.skills)) {
    const xp = saved.skills?.[skillId];
    if (Number.isFinite(xp) && xp >= 0) {
      player.skills[skillId] = xp;
    }
  }
  emit("skillsChanged", { character: player });

  for (const stat of Object.keys(player.stats)) {
    const value = saved.stats?.[stat];
    if (Number.isInteger(value) && value >= 0) {
      player.stats[stat] = value;
    }
  }
  if (Number.isInteger(saved.level) && saved.level >= 1) {
    player.level = saved.level;
  }
  if (Number.isInteger(saved.skillLevelUps) && saved.skillLevelUps >= 0) {
    player.skillLevelUps = saved.skillLevelUps;
  }
  if (Number.isInteger(saved.unspentPoints) && saved.unspentPoints >= 0) {
    player.unspentPoints = saved.unspentPoints;
  }
  // Ältere Stände ohne HP starten mit vollen HP
  const maxHp = getMaxHp(player);
  player.hp = Number.isInteger(saved.hp) && saved.hp >= 1 ? Math.min(saved.hp, maxHp) : maxHp;
  emit("statsChanged", { character: player });
  emit("hpChanged", { character: player });

  if (Array.isArray(data.world?.felledTrees)) {
    setFelledTrees(data.world.felledTrees);
  }
}
