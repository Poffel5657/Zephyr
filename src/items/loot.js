// Loot: Was ein besiegter Gegner fallen lässt. Tabellen in enemies.json ("loot" + "gold").
// Höhere Level geben mehr Gold (× Level) und eine etwas höhere Chance auf Items.
import ENEMY_TYPES from "../data/enemies.json";
import { hasItem } from "../inventory/inventory.js";

// So viel steigt die Chance pro Level über 1 (z. B. 80 % → 88 % auf Lv 2)
const CHANCE_BONUS_PER_LEVEL = 0.1;

// Würfelt das Loot eines Gegners aus: { gold, items: [{ item, amount }] }.
// Einträge mit "once" fallen nur, solange der Charakter das Item nicht hat und es noch nicht benutzt wurde.
export function rollLoot(enemy, character = null) {
  const type = ENEMY_TYPES[enemy.type];
  const level = enemy.level ?? 1;
  const items = [];

  for (const entry of type.loot ?? []) {
    if (entry.once && character !== null && alreadyHas(character, entry.item)) {
      continue;
    }
    const chance = Math.min(1, entry.chance * (1 + CHANCE_BONUS_PER_LEVEL * (level - 1)));
    if (Math.random() < chance) {
      items.push({ item: entry.item, amount: randomBetween(entry.min, entry.max) });
    }
  }

  const gold = type.gold === undefined ? 0 : randomBetween(type.gold.min, type.gold.max) * level;
  return { gold, items };
}

// Fasst mehrere Loot-Ergebnisse zusammen (z. B. nach einem Gruppen-Kampf), gleiche Items addiert.
export function mergeLoot(lootList) {
  const merged = { gold: 0, items: [] };
  for (const loot of lootList) {
    merged.gold += loot.gold;
    for (const { item, amount } of loot.items) {
      const existing = merged.items.find((entry) => entry.item === item);
      if (existing) {
        existing.amount += amount;
      } else {
        merged.items.push({ item, amount });
      }
    }
  }
  return merged;
}

// Hat der Charakter das Item schon (im Inventar) oder hat es schon benutzt (z. B. Schlüssel in der Truhe)?
function alreadyHas(character, itemId) {
  return hasItem(character.inventory, itemId) || character.progress.onceLoot.includes(itemId);
}

// Ganze Zufallszahl von min bis max (beide eingeschlossen).
function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}
