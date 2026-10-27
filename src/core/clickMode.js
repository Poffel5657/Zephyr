// Klick-Modus: Normal laufen Klicks auf Felder den Spieler dorthin. In einem besonderen Modus
// (z. B. "jump" = Sprungziel wählen) gehören die Klicks diesem Modus, Laufen und Kampf ignorieren sie.
import { emit } from "./eventBus.js";

let mode = null;

// Gibt den aktuellen Modus zurück (null = normal).
export function getClickMode() {
  return mode;
}

// Setzt den Modus (null = zurück auf normal) und meldet "clickModeChanged".
export function setClickMode(newMode) {
  if (newMode === mode) {
    return;
  }
  mode = newMode;
  emit("clickModeChanged", { mode });
}
