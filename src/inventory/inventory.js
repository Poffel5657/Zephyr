// Verwaltet das Inventar eines Charakters: eine Liste mit festen Plätzen (Slots).
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";

// 6 Reihen mit je 5 Plätzen, wie das Inventar in OSRS
export const SLOT_COUNT = 30;

// Erstellt ein neues, leeres Inventar (alle Plätze null).
export function createInventory() {
  return {
    slots: new Array(SLOT_COUNT).fill(null),
  };
}

// Gibt zurück, wie viele von diesem Item auf einen Platz passen (1 bei nicht stapelbaren Items).
function getMaxStack(itemId) {
  const item = ITEMS[itemId];
  return item.stackable ? item.maxStack : 1;
}

// Zählt, wie viele von diesem Item noch ins Inventar passen (auf vorhandene Stapel + freie Plätze).
function countFreeSpace(inventory, itemId) {
  const maxStack = getMaxStack(itemId);
  let space = 0;

  for (const slot of inventory.slots) {
    if (slot === null) {
      space += maxStack;
    } else if (slot.item === itemId) {
      space += maxStack - slot.amount;
    }
  }

  return space;
}

// Legt die Menge ins Inventar, alles oder nichts (false bei zu wenig Platz oder unbekannter ID).
export function addItem(inventory, itemId, amount = 1) {
  if (ITEMS[itemId] === undefined) {
    console.warn(`Unbekanntes Item: "${itemId}"`);
    return false;
  }

  if (countFreeSpace(inventory, itemId) < amount) {
    emit("inventoryFull", { inventory, item: itemId, amount });
    return false;
  }

  const maxStack = getMaxStack(itemId);
  let remaining = amount;

  // Zuerst vorhandene Stapel auffüllen (nicht stapelbare Items sind schon bei 1 voll)
  for (const slot of inventory.slots) {
    if (remaining === 0) {
      break;
    }
    if (slot !== null && slot.item === itemId && slot.amount < maxStack) {
      const added = Math.min(remaining, maxStack - slot.amount);
      slot.amount += added;
      remaining -= added;
    }
  }

  // Den Rest auf freie Plätze verteilen
  for (let i = 0; i < inventory.slots.length && remaining > 0; i++) {
    if (inventory.slots[i] === null) {
      const added = Math.min(remaining, maxStack);
      inventory.slots[i] = { item: itemId, amount: added };
      remaining -= added;
    }
  }

  emit("inventoryChanged", { inventory });
  return true;
}

// Prüft, ob insgesamt (über alle Plätze) mindestens so viele von diesem Item da sind.
export function hasItem(inventory, itemId, amount = 1) {
  let total = 0;
  for (const slot of inventory.slots) {
    if (slot !== null && slot.item === itemId) {
      total += slot.amount;
    }
  }
  return total >= amount;
}

// Nimmt die Menge heraus, alles oder nichts, vom letzten Platz an (false, wenn nicht genug da ist).
export function removeItem(inventory, itemId, amount = 1) {
  if (!hasItem(inventory, itemId, amount)) {
    return false;
  }

  let remaining = amount;
  for (let i = inventory.slots.length - 1; i >= 0 && remaining > 0; i--) {
    const slot = inventory.slots[i];
    if (slot === null || slot.item !== itemId) {
      continue;
    }

    if (slot.amount <= remaining) {
      remaining -= slot.amount;
      inventory.slots[i] = null;
    } else {
      slot.amount -= remaining;
      remaining = 0;
    }
  }

  emit("inventoryChanged", { inventory });
  return true;
}

// Leert genau diesen Platz samt Stapel (false, wenn er schon leer ist).
export function clearSlot(inventory, slotIndex) {
  if (inventory.slots[slotIndex] === null) {
    return false;
  }

  inventory.slots[slotIndex] = null;
  emit("inventoryChanged", { inventory });
  return true;
}

// Tauscht die Inhalte zweier Plätze (einer darf leer sein).
export function moveSlot(inventory, fromIndex, toIndex) {
  if (fromIndex === toIndex) {
    return;
  }

  const moved = inventory.slots[fromIndex];
  inventory.slots[fromIndex] = inventory.slots[toIndex];
  inventory.slots[toIndex] = moved;
  emit("inventoryChanged", { inventory });
}

// Gibt die Liste aller Plätze zurück.
export function getSlots(inventory) {
  return inventory.slots;
}

// Hört auf "itemGained" und legt das Item in dieses Inventar (später mit Angabe, welcher Charakter es bekommt).
export function setupInventoryEvents(inventory) {
  on("itemGained", ({ item, amount = 1 }) => {
    addItem(inventory, item, amount);
  });
}
