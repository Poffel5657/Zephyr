// Zeigt das Inventar eines Charakters als HTML-Fenster über dem Spiel (öffnen/schließen mit I oder Knopf).
import "./ui.css";
import "./inventoryPanel.css";
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";
import { SLOT_COUNT, getSlots, clearSlot, moveSlot } from "../inventory/inventory.js";
import { isFood } from "../items/food.js";

const TOGGLE_KEY = "KeyI";
const HIDDEN_CLASS = "inventory-hidden";
const SELECTED_CLASS = "inventory-selected";
const DRAG_ORIGIN_CLASS = "inventory-drag-origin";
const DROP_TARGET_CLASS = "inventory-drop-target";

// Baut das Fenster mit allen Slots und zeichnet es neu, sobald sich dieses Inventar ändert.
export function createInventoryPanel(inventory) {
  let selectedIndex = null;
  let draggedIndex = null;

  const panel = document.createElement("div");
  panel.className = "inventory-panel " + HIDDEN_CLASS;

  const title = document.createElement("div");
  title.className = "inventory-title";
  title.textContent = "Inventory";
  panel.appendChild(title);

  // Gold belegt keinen Platz, deshalb eine eigene Zeile über dem Raster
  const gold = document.createElement("div");
  gold.className = "inventory-gold";
  panel.appendChild(gold);

  const grid = document.createElement("div");
  grid.className = "inventory-grid";
  panel.appendChild(grid);

  // Info-Zeile unter dem Raster: Name des Items und Wegwerfen-Knopf
  const info = document.createElement("div");
  info.className = "inventory-info";
  const infoName = document.createElement("span");
  infoName.className = "inventory-info-name";
  info.appendChild(infoName);
  // Essen-Knopf, nur sichtbar, wenn das ausgewählte Item heilt
  const eatButton = document.createElement("button");
  eatButton.className = "inventory-drop inventory-eat";
  eatButton.textContent = "Eat";
  info.appendChild(eatButton);
  const dropButton = document.createElement("button");
  dropButton.className = "inventory-drop";
  dropButton.textContent = "Drop";
  info.appendChild(dropButton);
  panel.appendChild(info);

  // Schreibt den Namen des Items auf diesem Platz in die Info-Zeile (leer bei null oder leerem Platz).
  const showName = (index) => {
    const content = index === null ? null : getSlots(inventory)[index];
    infoName.textContent = content === null ? "" : ITEMS[content.item].name;
  };

  // Hebt den ausgewählten Slot hervor und schaltet den Wegwerfen-Knopf passend an oder aus.
  const updateSelection = () => {
    if (selectedIndex !== null && getSlots(inventory)[selectedIndex] === null) {
      selectedIndex = null;
    }
    slotElements.forEach(({ slot }, i) => slot.classList.toggle(SELECTED_CLASS, i === selectedIndex));
    dropButton.disabled = selectedIndex === null;
    const selected = selectedIndex === null ? null : getSlots(inventory)[selectedIndex];
    eatButton.hidden = selected === null || !isFood(selected.item);
    showName(selectedIndex);
  };

  // Die Slot-Felder nur einmal bauen, danach werden sie nur noch aktualisiert
  const slotElements = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const slot = document.createElement("div");
    slot.className = "inventory-slot";

    const amount = document.createElement("span");
    amount.className = "inventory-amount";
    slot.appendChild(amount);

    // Beim Drüberfahren den Namen zeigen, danach wieder den des ausgewählten Slots
    slot.addEventListener("pointerenter", () => {
      if (getSlots(inventory)[i] !== null) {
        showName(i);
      }
    });
    slot.addEventListener("pointerleave", () => showName(selectedIndex));

    // Klick wählt aus, nochmal klicken (oder leerer Slot) hebt die Auswahl auf
    slot.addEventListener("click", () => {
      const isEmpty = getSlots(inventory)[i] === null;
      selectedIndex = isEmpty || selectedIndex === i ? null : i;
      updateSelection();
    });

    // Drag & Drop (nur Desktop): auf einen Slot = tauschen, auf "Wegwerfen" = wegwerfen
    slot.addEventListener("dragstart", (event) => {
      // Firefox startet das Ziehen nur, wenn Daten gesetzt werden
      event.dataTransfer.setData("text/plain", String(i));
      draggedIndex = i;
      selectedIndex = null;
      updateSelection();
      // Erst nach dem Start markieren, sonst sieht auch das gezogene Vorschaubild blass aus
      setTimeout(() => slot.classList.add(DRAG_ORIGIN_CLASS), 0);
      // Ein deaktivierter Knopf bekommt keine Drag-Events, deshalb während des Ziehens aktivieren
      dropButton.disabled = false;
    });
    slot.addEventListener("dragover", (event) => event.preventDefault());
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      if (draggedIndex !== null) {
        moveSlot(inventory, draggedIndex, i);
      }
    });
    // Läuft nach jedem Ziehen, auch wenn daneben losgelassen wurde
    slot.addEventListener("dragend", () => {
      slot.classList.remove(DRAG_ORIGIN_CLASS);
      dropButton.classList.remove(DROP_TARGET_CLASS);
      draggedIndex = null;
      updateSelection();
    });

    grid.appendChild(slot);
    slotElements.push({ slot, amount });
  }
  document.body.appendChild(panel);

  eatButton.addEventListener("click", () => {
    if (selectedIndex !== null) {
      emit("eatRequested", { inventory, slotIndex: selectedIndex });
    }
  });

  dropButton.addEventListener("click", () => {
    if (selectedIndex !== null) {
      clearSlot(inventory, selectedIndex);
    }
  });

  // Ein Item auf "Wegwerfen" ziehen wirft es weg
  dropButton.addEventListener("dragover", (event) => {
    if (draggedIndex !== null) {
      event.preventDefault();
      dropButton.classList.add(DROP_TARGET_CLASS);
    }
  });
  dropButton.addEventListener("dragleave", () => dropButton.classList.remove(DROP_TARGET_CLASS));
  dropButton.addEventListener("drop", (event) => {
    event.preventDefault();
    if (draggedIndex !== null) {
      clearSlot(inventory, draggedIndex);
    }
  });

  const button = document.createElement("button");
  button.className = "ui-button inventory-button";
  button.textContent = "Inventory";
  document.body.appendChild(button);

  const toggle = () => panel.classList.toggle(HIDDEN_CLASS);
  button.addEventListener("click", toggle);
  addEventListener("keydown", (event) => {
    if (event.code === TOGGLE_KEY && !event.repeat) {
      toggle();
    }
  });

  on("inventoryChanged", (data) => {
    if (data.inventory === inventory) {
      updateSlots(inventory, slotElements);
      gold.textContent = `Gold: ${inventory.gold}`;
      updateSelection();
    }
  });

  updateSlots(inventory, slotElements);
  gold.textContent = `Gold: ${inventory.gold}`;
  updateSelection();
}

// Färbt jeden Slot in der Farbe seines Items und schreibt die Anzahl dazu (nur bei Stapeln über 1).
function updateSlots(inventory, slotElements) {
  const slots = getSlots(inventory);
  for (let i = 0; i < SLOT_COUNT; i++) {
    const { slot, amount } = slotElements[i];
    const content = slots[i];

    if (content === null) {
      slot.style.backgroundColor = "";
      amount.textContent = "";
      slot.draggable = false;
    } else {
      slot.style.backgroundColor = ITEMS[content.item].color;
      amount.textContent = content.amount > 1 ? content.amount : "";
      slot.draggable = true;
    }
  }
}
