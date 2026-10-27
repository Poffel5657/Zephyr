// Loot-Fenster in der Bildschirmmitte: Gold und Items einzeln ("Take") oder alles ("Take all") nehmen.
// Was nicht ins Inventar passt, bleibt stehen. Beim Schließen bekommt onClose den Rest (für den Beutel am Boden).
import "./ui.css";
import "./lootWindow.css";
import ITEMS from "../data/items.json";
import { addItem, addGold, canAddItem } from "../inventory/inventory.js";
import { showMessage } from "./messages.js";
import { logMessage } from "./chatLog.js";

const HIDDEN_CLASS = "loot-hidden";

let panel = null;
let list = null;
let current = null;

// Öffnet das Fenster mit diesem Loot ({ gold, items: [{ item, amount }] }). Ein offenes Fenster wird vorher geschlossen.
export function openLootWindow(inventory, loot, onClose) {
  if (panel === null) {
    buildPanel();
  }
  if (current !== null) {
    closeLootWindow();
  }
  current = { inventory, loot: { gold: loot.gold, items: loot.items.map((entry) => ({ ...entry })) }, onClose };
  panel.classList.remove(HIDDEN_CLASS);
  render();
}

// Schließt das Fenster und gibt den Rest an onClose weiter.
function closeLootWindow() {
  if (current === null) {
    return;
  }
  const { loot, onClose } = current;
  current = null;
  panel.classList.add(HIDDEN_CLASS);
  onClose(loot);
}

// Baut das Fenster einmal: Titel, Liste, "Take all" und "Close".
function buildPanel() {
  panel = document.createElement("div");
  panel.className = "ui-panel loot-panel " + HIDDEN_CLASS;

  const title = document.createElement("div");
  title.className = "loot-title";
  title.textContent = "Loot";
  panel.appendChild(title);

  list = document.createElement("div");
  list.className = "loot-list";
  panel.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "loot-actions";
  const takeAll = document.createElement("button");
  takeAll.className = "loot-button";
  takeAll.textContent = "Take all";
  takeAll.addEventListener("click", () => {
    takeGold();
    for (const entry of [...current.loot.items]) {
      takeItem(entry);
    }
    finishIfEmpty();
  });
  actions.appendChild(takeAll);
  const close = document.createElement("button");
  close.className = "loot-button";
  close.textContent = "Close";
  close.addEventListener("click", closeLootWindow);
  actions.appendChild(close);
  panel.appendChild(actions);

  document.body.appendChild(panel);
}

// Zeichnet die Liste neu: erst Gold, dann jedes Item mit eigenem "Take".
function render() {
  list.replaceChildren();
  if (current.loot.gold > 0) {
    list.appendChild(createRow(`Gold x${current.loot.gold}`, "#ffd84a", () => takeGold()));
  }
  for (const entry of current.loot.items) {
    list.appendChild(createRow(`${ITEMS[entry.item].name} x${entry.amount}`, ITEMS[entry.item].color, () => takeItem(entry)));
  }
}

// Eine Zeile: Farbfeld, Text, Knopf "Take".
function createRow(text, color, onTake) {
  const row = document.createElement("div");
  row.className = "loot-row";
  const swatch = document.createElement("span");
  swatch.className = "loot-swatch";
  swatch.style.backgroundColor = color;
  row.appendChild(swatch);
  const label = document.createElement("span");
  label.className = "loot-label";
  label.textContent = text;
  row.appendChild(label);
  const take = document.createElement("button");
  take.className = "loot-button";
  take.textContent = "Take";
  take.addEventListener("click", () => {
    onTake();
    finishIfEmpty();
  });
  row.appendChild(take);
  return row;
}

// Gold geht immer (braucht keinen Platz).
function takeGold() {
  if (current.loot.gold > 0) {
    addGold(current.inventory, current.loot.gold);
    logMessage(`You take ${current.loot.gold} gold`, "loot");
    current.loot.gold = 0;
  }
}

// Nimmt so viel von dem Item, wie ins Inventar passt. Der Rest bleibt im Fenster.
function takeItem(entry) {
  let taken = 0;
  while (taken < entry.amount && canAddItem(current.inventory, entry.item, 1)) {
    addItem(current.inventory, entry.item, 1);
    taken += 1;
  }
  entry.amount -= taken;
  if (taken > 0) {
    logMessage(`You take ${ITEMS[entry.item].name} x${taken}`, "loot");
  }
  if (entry.amount > 0) {
    showMessage("Your inventory is full", "warning");
  } else {
    current.loot.items.splice(current.loot.items.indexOf(entry), 1);
  }
}

// Alles genommen → Fenster zu, sonst neu zeichnen.
function finishIfEmpty() {
  if (current.loot.gold === 0 && current.loot.items.length === 0) {
    closeLootWindow();
  } else {
    render();
  }
}
