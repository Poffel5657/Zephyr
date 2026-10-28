// Rezept-Fenster am Lagerfeuer: pro Rezept eine Zeile mit Ergebnis, Zutat und "Cook".
// Das Fenster kennt die Regeln nicht: cooking.js gibt die Zeilen vor und bekommt den Klick zurück.
import "./ui.css";
import "./cooking.css";

const HIDDEN_CLASS = "cooking-hidden";

let panel = null;
let list = null;
// Offenes Fenster (null = zu): { onCook, onClose }
let current = null;

// Öffnet das Fenster. rows: [{ id, name, needs, color, canCook }], onCook(id) beim Klick, onClose beim Schließen.
export function openCookingWindow(rows, onCook, onClose) {
  if (panel === null) {
    buildPanel();
  }
  current = { onCook, onClose };
  panel.classList.remove(HIDDEN_CLASS);
  updateCookingWindow(rows);
}

// Zeichnet die Zeilen neu (z. B. nach dem Kochen, wenn eine Zutat aufgebraucht ist). busy = gerade wird gekocht.
export function updateCookingWindow(rows, busy = false) {
  if (current === null) {
    return;
  }
  list.replaceChildren();
  for (const row of rows) {
    list.appendChild(createRow(row, busy));
  }
}

// Schließt das Fenster (auch von außen, z. B. beim Weglaufen).
export function closeCookingWindow() {
  if (current === null) {
    return;
  }
  const { onClose } = current;
  current = null;
  panel.classList.add(HIDDEN_CLASS);
  onClose();
}

// Ist das Fenster gerade offen?
export function isCookingWindowOpen() {
  return current !== null;
}

// Baut das Fenster einmal: Titel, Liste, "Close".
function buildPanel() {
  panel = document.createElement("div");
  panel.className = "ui-panel cooking-panel " + HIDDEN_CLASS;

  const title = document.createElement("div");
  title.className = "cooking-title";
  title.textContent = "Campfire";
  panel.appendChild(title);

  list = document.createElement("div");
  list.className = "cooking-list";
  panel.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "cooking-actions";
  const close = document.createElement("button");
  close.className = "cooking-button";
  close.textContent = "Close";
  close.addEventListener("click", closeCookingWindow);
  actions.appendChild(close);
  panel.appendChild(actions);

  document.body.appendChild(panel);
}

// Eine Zeile: Farbfeld, Name + Zutat, Knopf "Cook" (gesperrt ohne Zutat oder während gekocht wird).
function createRow(row, busy) {
  const element = document.createElement("div");
  element.className = "cooking-row";
  const swatch = document.createElement("span");
  swatch.className = "cooking-swatch";
  swatch.style.backgroundColor = row.color;
  element.appendChild(swatch);

  const label = document.createElement("span");
  label.className = "cooking-label";
  const name = document.createElement("span");
  name.textContent = row.name;
  const needs = document.createElement("span");
  needs.className = "cooking-needs";
  needs.textContent = row.needs;
  label.append(name, needs);
  element.appendChild(label);

  const cook = document.createElement("button");
  cook.className = "cooking-button";
  cook.textContent = "Cook";
  cook.disabled = busy || !row.canCook;
  cook.title = row.canCook ? "" : "Missing ingredients";
  cook.addEventListener("click", () => current?.onCook(row.id));
  element.appendChild(cook);
  return element;
}
