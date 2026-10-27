// Einstieg des Game-Editors: Daten vom Dev-Server holen, dann Karte und Formulare aufbauen.
// Oben die Reiter (Karte, Items, Gegner, …), "Speichern" prüft alles und schreibt die geänderten Dateien.
import "./editor.css";
import { data, loadGameData, getDirtyFiles, isDirty, onDataChanged, saveDirtyFiles, formatJson } from "./gameData.js";
import { validateGameData } from "./validate.js";
import { SECTIONS, showSection } from "./dataEditor.js";

const $ = (id) => document.getElementById(id);
const MAP_SECTION = { id: "map", file: "maps/start-island.json", label: "Karte" };

try {
  await loadGameData();
} catch (error) {
  document.body.textContent = error.message;
  throw error;
}
// Erst nach dem Laden: editor.js liest die Daten schon beim Start
const { mapFileText } = await import("./editor.js");

const tabs = [MAP_SECTION, ...SECTIONS];
let current = null;

// Reiter mit Stern bei ungespeicherten Änderungen
function renderTabs() {
  const box = $("tabs");
  box.replaceChildren();
  for (const section of tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = section.label + (isDirty(section.file) ? " ●" : "");
    button.setAttribute("aria-pressed", String(section === current));
    button.addEventListener("click", () => openSection(section));
    box.append(button);
  }
}

function openSection(section) {
  current = section;
  const isMap = section === MAP_SECTION;
  $("map-view").hidden = !isMap;
  $("data-view").hidden = isMap;
  if (!isMap) {
    showSection(section, $("entry-list"), $("entry-form"));
  }
  renderTabs();
  try {
    localStorage.setItem("zephyr-editor-tab", section.id);
  } catch {
    // Nur eine Bequemlichkeit, egal wenn es nicht geht
  }
}

// Fehlerliste unter den Reitern, Speichern nur ohne Fehler
function updateStatus() {
  const errors = validateGameData(data);
  const list = $("errors");
  list.replaceChildren(...errors.map((text) => Object.assign(document.createElement("li"), { textContent: text })));
  list.hidden = errors.length === 0;
  const dirty = getDirtyFiles();
  $("save-all").disabled = dirty.length === 0 || errors.length > 0;
  $("save-all").textContent = dirty.length === 0 ? "Gespeichert" : `Speichern (${dirty.length})`;
  renderTabs();
}

$("save-all").addEventListener("click", async () => {
  const status = $("save-status");
  try {
    const saved = await saveDirtyFiles((file) => (file === MAP_SECTION.file ? mapFileText() : formatJson(data[file]) + "\n"));
    status.textContent = `Gespeichert: ${saved.join(", ")}`;
  } catch (error) {
    status.textContent = "Fehler: " + error.message;
  }
});

// Nicht gespeichert und Tab schließen → Browser fragt nach
addEventListener("beforeunload", (event) => {
  if (getDirtyFiles().length > 0) {
    event.preventDefault();
  }
});

onDataChanged(updateStatus);
let startTab = null;
try {
  startTab = localStorage.getItem("zephyr-editor-tab");
} catch {
  startTab = null;
}
openSection(tabs.find((section) => section.id === startTab) ?? MAP_SECTION);
updateStatus();
