// Debug-Tasten zum Testen (nur bis Woodcutting da ist): G gibt ein zufälliges Item, Inventar-Events landen in der Konsole.
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";

const ITEM_IDS = Object.keys(ITEMS);

// Richtet die Taste G und das Mitschreiben der Inventar-Events in der Konsole ein.
export function setupDebugKeys() {
  addEventListener("keydown", (event) => {
    if (event.code !== "KeyG" || event.repeat) {
      return;
    }

    const itemId = ITEM_IDS[Math.floor(Math.random() * ITEM_IDS.length)];
    emit("itemGained", { item: itemId, amount: 1 });
  });

  on("itemGained", (data) => {
    console.log("itemGained:", data);
  });

  on("inventoryChanged", ({ inventory }) => {
    console.log("inventoryChanged:", inventory.slots.filter((slot) => slot !== null));
  });

  on("inventoryFull", ({ item, amount }) => {
    console.log("inventoryFull:", item, amount);
  });
}
