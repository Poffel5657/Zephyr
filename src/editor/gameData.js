// Spieldaten für den Game-Editor: holt alle Dateien aus src/data/ über den Dev-Server und speichert sie zurück.
// Absichtlich kein import der JSON-Dateien, sonst würde Vite den Editor nach jedem Speichern neu laden.

// Alle Dateien als Objekte: data["items.json"], data["maps/start-island.json"], …
export const data = {};
// Dateien mit ungespeicherten Änderungen
const dirtyFiles = new Set();
const listeners = [];

// Lädt alle Dateien (einmal beim Start).
export async function loadGameData() {
  const response = await fetch("/__editor/data");
  if (!response.ok) {
    throw new Error("Der Game-Editor geht nur mit dem Dev-Server (npm run dev).");
  }
  const files = await response.json();
  for (const [file, text] of Object.entries(files)) {
    data[file] = JSON.parse(text);
  }
}

// Markiert eine Datei als geändert und sagt allen Bescheid (z. B. Stern im Reiter, Prüfung neu).
export function markDirty(file) {
  dirtyFiles.add(file);
  listeners.forEach((listener) => listener());
}

export function isDirty(file) {
  return dirtyFiles.has(file);
}

export function getDirtyFiles() {
  return [...dirtyFiles];
}

// Ruft listener nach jeder Änderung auf.
export function onDataChanged(listener) {
  listeners.push(listener);
}

// Speichert alle geänderten Dateien. formatFile(file) liefert den Text (z. B. Karten mit eigener Formatierung).
export async function saveDirtyFiles(formatFile) {
  const saved = [];
  for (const file of getDirtyFiles()) {
    const response = await fetch("/__editor/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file, text: formatFile(file) }),
    });
    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(`${file}: ${error}`);
    }
    dirtyFiles.delete(file);
    saved.push(file);
  }
  listeners.forEach((listener) => listener());
  return saved;
}

// JSON lesbar formatieren: kleine Objekte und Listen in einer Zeile, große mit Einrückung.
export function formatJson(value, indent = "") {
  const inline = inlineJson(value);
  if (inline.length + indent.length <= 90 && !containsBigObject(value)) {
    return inline;
  }
  const inner = indent + "  ";
  if (Array.isArray(value)) {
    return "[\n" + value.map((item) => inner + formatJson(item, inner)).join(",\n") + "\n" + indent + "]";
  }
  const entries = Object.entries(value).map(([key, item]) => inner + JSON.stringify(key) + ": " + formatJson(item, inner));
  return "{\n" + entries.join(",\n") + "\n" + indent + "}";
}

// Eine Zeile mit Leerzeichen wie { "key": 1, "after": 0.6 }
function inlineJson(value) {
  if (Array.isArray(value)) {
    return "[" + value.map(inlineJson).join(", ") + "]";
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([key, item]) => JSON.stringify(key) + ": " + inlineJson(item));
    return entries.length === 0 ? "{}" : "{ " + entries.join(", ") + " }";
  }
  return JSON.stringify(value);
}

// Ein Eintrag mit Unter-Objekten (z. B. ein ganzer Gegner) bekommt immer eigene Zeilen
function containsBigObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }
  return Object.values(value).some((item) => item !== null && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length > 4);
}
