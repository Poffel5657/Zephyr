// Ausrüsten: Items mit "slot" in items.json (Waffe, Rüstung) kommen aus dem Inventar auf ihren Platz.
// Die Boni ("damage", "maxHp") rechnet character.js mit ein. Im Kampf wird nicht umgezogen.
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";
import { addItem, canAddItem, getSlots, removeItem } from "../inventory/inventory.js";
import { getMaxHp, addMaxHpGrowth } from "./character.js";
import { showMessage } from "../ui/messages.js";
import { logMessage } from "../ui/chatLog.js";

// Gibt zurück, auf welchen Platz das Item gehört (null = kann man nicht anlegen).
export function getEquipSlot(itemId) {
  return ITEMS[itemId]?.slot ?? null;
}

// Hört auf "equipRequested" (Knopf im Inventar) und "unequipRequested" (Knopf im Character-Reiter).
// isInCombat() sperrt das Umziehen im Kampf.
export function setupEquipment(character, isInCombat = () => false) {
  on("equipRequested", ({ inventory, slotIndex }) => {
    if (inventory !== character.inventory) {
      return;
    }
    const content = getSlots(inventory)[slotIndex];
    const slot = content === null ? null : getEquipSlot(content.item);
    if (slot === null) {
      return;
    }
    if (isInCombat()) {
      showMessage("You can't change equipment in combat");
      return;
    }
    equipItem(character, content.item);
  });

  on("unequipRequested", ({ character: target, slot }) => {
    if (target !== character || character.equipment[slot] === null) {
      return;
    }
    if (isInCombat()) {
      showMessage("You can't change equipment in combat");
      return;
    }
    unequipItem(character, slot);
  });
}

// Legt ein Item aus dem Inventar an. Was vorher auf dem Platz war, kommt ins Inventar (auf den frei gewordenen Platz).
export function equipItem(character, itemId) {
  const slot = getEquipSlot(itemId);
  const oldMaxHp = getMaxHp(character);
  removeItem(character.inventory, itemId, 1);
  const previous = character.equipment[slot];
  character.equipment[slot] = itemId;
  if (previous !== null) {
    addItem(character.inventory, previous, 1);
  }
  addMaxHpGrowth(character, oldMaxHp);
  logMessage(`You equip the ${ITEMS[itemId].name}`);
  emitChanged(character);
}

// Legt das Item auf diesem Platz ab (zurück ins Inventar). Gibt false zurück, wenn kein Platz frei ist.
export function unequipItem(character, slot) {
  const itemId = character.equipment[slot];
  if (!canAddItem(character.inventory, itemId, 1)) {
    showMessage("Your inventory is full", "warning");
    return false;
  }
  const oldMaxHp = getMaxHp(character);
  character.equipment[slot] = null;
  addItem(character.inventory, itemId, 1);
  addMaxHpGrowth(character, oldMaxHp);
  logMessage(`You take off the ${ITEMS[itemId].name}`);
  emitChanged(character);
  return true;
}

// Meldet geänderte Ausrüstung (Character-Reiter, Statusleiste, Speichern).
function emitChanged(character) {
  emit("equipmentChanged", { character });
  emit("statsChanged", { character });
}
