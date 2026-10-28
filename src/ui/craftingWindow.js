// Herstellungs-Fenster an einer Station (Lagerfeuer, Amboss): pro Rezept eine Zeile mit Ergebnis, Zutaten und Knopf.
// Das Fenster kennt die Regeln nicht: cooking.js / smithing.js geben Titel, Knopf-Text und Zeilen vor und bekommen den Klick zurück.
import "./ui.css";
import "./crafting.css";

const HIDDEN_CLASS = "crafting-hidden";

let panel = null;
let title = null;
let list = null;
// Offenes Fenster (null = zu): { owner, actionLabel, onMake, onClose }
let current = null;

// Öffnet das Fenster. owner = wer es geöffnet hat (z. B. "cooking"), options: { title, actionLabel },
// rows: [{ id, name, needs, color, canMake }], onMake(id) beim Klick, onClose beim Schließen.
// Ein schon offenes Fenster (andere Station) wird vorher geschlossen.
export function openCraftingWindow(owner, options, rows, onMake, onClose) {
  if (panel === null) {
    buildPanel();
  }
  closeCraftingWindow();
  current = { owner, actionLabel: options.actionLabel, onMake, onClose };
  title.textContent = options.title;
  panel.classList.remove(HIDDEN_CLASS);
  updateCraftingWindow(owner, rows);
}

// Zeichnet die Zeilen neu (z. B. nach dem Kochen, wenn eine Zutat aufgebraucht ist). busy = gerade wird hergestellt.
// Gehört das offene Fenster jemand anderem, passiert nichts.
export function updateCraftingWindow(owner, rows, busy = false) {
  if (current === null || current.owner !== owner) {
    return;
  }
  list.replaceChildren();
  for (const row of rows) {
    list.appendChild(createRow(row, busy));
  }
}

// Schließt das Fenster (auch von außen, z. B. beim Weglaufen).
export function closeCraftingWindow() {
  if (current === null) {
    return;
  }
  const { onClose } = current;
  current = null;
  panel.classList.add(HIDDEN_CLASS);
  onClose();
}

// Ist das Fenster gerade offen (und gehört diesem owner)?
export function isCraftingWindowOpen(owner) {
  return current !== null && current.owner === owner;
}

// Baut das Fenster einmal: Titel, Liste, "Close".
function buildPanel() {
  panel = document.createElement("div");
  panel.className = "ui-panel crafting-panel " + HIDDEN_CLASS;

  title = document.createElement("div");
  title.className = "crafting-title";
  panel.appendChild(title);

  list = document.createElement("div");
  list.className = "crafting-list";
  panel.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "crafting-actions";
  const close = document.createElement("button");
  close.className = "crafting-button";
  close.textContent = "Close";
  close.addEventListener("click", closeCraftingWindow);
  actions.appendChild(close);
  panel.appendChild(actions);

  document.body.appendChild(panel);
}

// Eine Zeile: Farbfeld, Name + Zutaten, Knopf (gesperrt ohne Zutaten oder während hergestellt wird).
function createRow(row, busy) {
  const element = document.createElement("div");
  element.className = "crafting-row";
  const swatch = document.createElement("span");
  swatch.className = "crafting-swatch";
  swatch.style.backgroundColor = row.color;
  element.appendChild(swatch);

  const label = document.createElement("span");
  label.className = "crafting-label";
  const name = document.createElement("span");
  name.textContent = row.name;
  const needs = document.createElement("span");
  needs.className = "crafting-needs";
  needs.textContent = row.needs;
  label.append(name, needs);
  element.appendChild(label);

  const make = document.createElement("button");
  make.className = "crafting-button";
  make.textContent = current.actionLabel;
  make.disabled = busy || !row.canMake;
  make.title = row.canMake ? "" : "Missing ingredients";
  make.addEventListener("click", () => current?.onMake(row.id));
  element.appendChild(make);
  return element;
}
