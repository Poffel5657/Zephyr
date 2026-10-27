// Essen: Items mit "heal" in items.json geben HP zurück (z. B. Fisch).
// Im Kampf kostet Essen die Aktion des Zuges, das prüft der Kampf über "canEat".
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";
import { getSlots, removeItem } from "../inventory/inventory.js";
import { getMaxHp, heal } from "../character/character.js";
import { showMessage } from "../ui/messages.js";

// Gibt zurück, ob man dieses Item essen kann.
export function isFood(itemId) {
  return ITEMS[itemId]?.heal !== undefined;
}

// Hört auf "eatRequested" (Knopf "Eat" im Inventar) für diesen Charakter.
// canEat(character) gibt null zurück, wenn Essen erlaubt ist, sonst den Grund als Meldung (z. B. im Kampf).
export function setupFood(character, canEat = () => null) {
  on("eatRequested", ({ inventory, slotIndex }) => {
    if (inventory !== character.inventory) {
      return;
    }
    const slot = getSlots(inventory)[slotIndex];
    if (slot === null || !isFood(slot.item)) {
      return;
    }
    if (character.hp >= getMaxHp(character)) {
      showMessage("You are not hungry");
      return;
    }
    const reason = canEat(character);
    if (reason !== null) {
      showMessage(reason);
      return;
    }

    removeItem(inventory, slot.item, 1);
    const healed = heal(character, ITEMS[slot.item].heal);
    emit("itemEaten", { character, item: slot.item, healed });
  });
}
