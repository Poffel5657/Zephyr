// Schmieden: Amboss erreicht → Herstellungs-Fenster → Rezept wählen → Mini-Spiel „Heiß hämmern“ → Item + XP.
// Die Zutaten werden immer verbraucht. Gute Arbeit (keine Fehler) gibt Bonus-XP, verdorbenes Metall nur wenig XP.
// Rezepte mit "simple" (Schleifstein) brauchen kein Mini-Spiel. Alle Werte stehen in skills.json unter smithing.recipes.
import SKILL_DATA from "../data/skills.json";
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";
import { getLevel } from "./skills.js";
import { addItem, canAddItem, hasItem, removeItem } from "../inventory/inventory.js";
import { openCraftingWindow, updateCraftingWindow, closeCraftingWindow, isCraftingWindowOpen } from "../ui/craftingWindow.js";
import { startSmithingGame, stopSmithingGame } from "../ui/smithingGame.js";
import { showMessage } from "../ui/messages.js";
import { logMessage } from "../ui/chatLog.js";

const SMITHING = SKILL_DATA.skills.smithing;
const WINDOW = { title: "Anvil", actionLabel: "Smith" };
const OWNER = "smithing";

// Das Rezept, das gerade auf dem Amboss liegt (null = gerade nicht)
let currentRecipe = null;

// Meldet das Schmieden für diesen Charakter an.
export function setupSmithing(character) {
  on("objectReached", (data) => {
    if (data.character !== character || !SMITHING.stations.includes(data.object)) {
      return;
    }
    openCraftingWindow(OWNER, WINDOW, getRows(character), (recipeId) => startSmithing(character, recipeId), () => {
      stopSmithingGame();
      currentRecipe = null;
    });
  });

  on("smithingResult", ({ result }) => {
    if (currentRecipe === null) {
      return;
    }
    const recipe = currentRecipe;
    currentRecipe = null;
    finishSmithing(character, recipe, result);
    updateCraftingWindow(OWNER, getRows(character));
  });

  on("inventoryChanged", ({ inventory }) => {
    if (inventory === character.inventory && isCraftingWindowOpen(OWNER)) {
      updateCraftingWindow(OWNER, getRows(character), currentRecipe !== null);
    }
  });

  // Weglaufen oder ein Kampf schließt das Fenster (und bricht laufendes Schmieden ohne Ergebnis ab)
  on("actionCancelled", (data) => {
    if (data.character === character && isCraftingWindowOpen(OWNER)) {
      closeCraftingWindow();
    }
  });
  on("combatStarted", () => closeCraftingWindow());
}

// Legt das Metall auf den Amboss und startet das Mini-Spiel. Mit höherem Level bleibt es länger heiß.
// Einfache Rezepte werden sofort fertig.
function startSmithing(character, recipeId) {
  const recipe = SMITHING.recipes[recipeId];
  if (currentRecipe !== null || !hasIngredients(character, recipe)) {
    return;
  }
  if (recipe.simple) {
    finishSmithing(character, recipe, "done");
    updateCraftingWindow(OWNER, getRows(character));
    return;
  }
  const level = getLevel(character.skills.smithing);
  const heatSeconds = Math.min(recipe.maxHeatSeconds, recipe.heatSeconds + recipe.heatPerLevel * (level - 1));
  currentRecipe = recipe;
  updateCraftingWindow(OWNER, getRows(character), true);
  startSmithingGame({ hits: recipe.hits, heatSeconds: heatSeconds, coldHeat: recipe.coldHeat, reheatSeconds: recipe.reheatSeconds, maxMistakes: recipe.maxMistakes });
}

// Wertet das Ergebnis aus: Zutaten weg, bei Erfolg das Item dazu, XP je nach Ergebnis.
function finishSmithing(character, recipe, result) {
  const ruined = result === "ruined";
  // Erst die Zutaten nehmen (macht evtl. Platz frei), passt das Ergebnis trotzdem nicht, kommen sie zurück
  for (const { item, amount } of recipe.ingredients) {
    removeItem(character.inventory, item, amount);
  }
  if (!ruined && !canAddItem(character.inventory, recipe.result, 1)) {
    for (const { item, amount } of recipe.ingredients) {
      addItem(character.inventory, item, amount);
    }
    showMessage("Your inventory is full", "warning");
    return;
  }

  const xp = { good: recipe.xp + (recipe.goodBonusXp ?? 0), done: recipe.xp, ruined: recipe.failXp ?? 0 }[result];
  emit("xpGained", { character: character, skill: "smithing", amount: xp });
  if (ruined) {
    showMessage(`The metal cracked, the ${ITEMS[recipe.result].name} is ruined`, "warning");
    return;
  }
  emit("itemGained", { item: recipe.result, amount: 1 });
  emit("itemSmithed", { character, item: recipe.result, result });
  if (result === "good") {
    showMessage(`Perfect work! You make a ${ITEMS[recipe.result].name}`, "loot");
  } else {
    logMessage(`You make a ${ITEMS[recipe.result].name}`, "loot");
  }
}

// Hat der Charakter alle Zutaten in der nötigen Menge?
function hasIngredients(character, recipe) {
  return recipe.ingredients.every(({ item, amount }) => hasItem(character.inventory, item, amount));
}

// Die Zeilen fürs Herstellungs-Fenster: Ergebnis, Zutaten, ob man es gerade machen kann.
function getRows(character) {
  return Object.entries(SMITHING.recipes).map(([id, recipe]) => ({
    id: id,
    name: ITEMS[recipe.result].name,
    needs: "Needs " + recipe.ingredients.map(({ item, amount }) => `${amount} ${ITEMS[item].name}`).join(", "),
    color: ITEMS[recipe.result].color,
    canMake: hasIngredients(character, recipe),
  }));
}
