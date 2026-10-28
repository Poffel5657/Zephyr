// Kochen: Lagerfeuer erreicht → Rezept-Fenster → Rezept wählen → Würz-Mini-Spiel → Essen + XP.
// Die Zutat wird immer verbraucht, heraus kommt je nach Ergebnis gekochtes, perfektes oder verbranntes Essen.
// Alle Werte pro Rezept stehen in skills.json unter cooking.recipes.
import SKILL_DATA from "../data/skills.json";
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";
import { getLevel } from "./skills.js";
import { addItem, canAddItem, hasItem, removeItem } from "../inventory/inventory.js";
import { openCraftingWindow, updateCraftingWindow, closeCraftingWindow, isCraftingWindowOpen } from "../ui/craftingWindow.js";
import { startCookingGame, stopCookingGame } from "../ui/cookingGame.js";
import { showMessage } from "../ui/messages.js";
import { logMessage } from "../ui/chatLog.js";

const COOKING = SKILL_DATA.skills.cooking;

// So heißt das Herstellungs-Fenster am Lagerfeuer
const WINDOW = { title: "Campfire", actionLabel: "Cook" };
const OWNER = "cooking";

// Welches Item kommt bei welchem Ergebnis heraus (Schlüssel im Rezept)
const RESULT_ITEM = { done: "result", perfect: "perfect", burnt: "burnt" };

// Das Rezept, das gerade auf dem Feuer liegt (null = gerade nicht)
let currentRecipe = null;

// Meldet das Kochen für diesen Charakter an.
export function setupCooking(character) {
  on("objectReached", (data) => {
    if (data.character !== character || !COOKING.stations.includes(data.object)) {
      return;
    }
    openCraftingWindow(OWNER, WINDOW, getRows(character), (recipeId) => startCooking(character, recipeId), () => {
      stopCookingGame();
      currentRecipe = null;
    });
  });

  on("cookingResult", ({ result }) => {
    if (currentRecipe === null) {
      return;
    }
    const recipe = currentRecipe;
    currentRecipe = null;
    finishCooking(character, recipe, result);
    updateCraftingWindow(OWNER, getRows(character));
  });

  // Ändert sich das Inventar (z. B. Fisch gegessen oder weggeworfen), Knöpfe im offenen Fenster anpassen
  on("inventoryChanged", ({ inventory }) => {
    if (inventory === character.inventory && isCraftingWindowOpen(OWNER)) {
      updateCraftingWindow(OWNER, getRows(character), currentRecipe !== null);
    }
  });

  // Weglaufen oder ein Kampf schließt das Fenster (und bricht laufendes Kochen ohne Ergebnis ab)
  on("actionCancelled", (data) => {
    if (data.character === character && isCraftingWindowOpen(OWNER)) {
      closeCraftingWindow();
    }
  });
  on("combatStarted", () => closeCraftingWindow());
}

// Legt die Zutat aufs Feuer und startet das Mini-Spiel. Mit höherem Level hat man mehr Zeit für die Folge.
function startCooking(character, recipeId) {
  const recipe = COOKING.recipes[recipeId];
  if (currentRecipe !== null || !hasItem(character.inventory, recipe.ingredient)) {
    return;
  }
  const level = getLevel(character.skills.cooking);
  const totalSeconds = Math.min(recipe.maxTotalSeconds, recipe.totalSeconds + recipe.secondsPerLevel * (level - 1));
  currentRecipe = recipe;
  updateCraftingWindow(OWNER, getRows(character), true);
  startCookingGame({ steps: recipe.steps, totalSeconds: totalSeconds, fastSeconds: recipe.fastSeconds, maxMistakes: recipe.maxMistakes });
}

// Wertet das Ergebnis aus: Zutat weg, Ergebnis-Item und XP dazu.
function finishCooking(character, recipe, result) {
  const itemId = recipe[RESULT_ITEM[result]];
  // Erst die Zutat nehmen (macht evtl. einen Platz frei), passt das Ergebnis trotzdem nicht, kommt sie zurück
  removeItem(character.inventory, recipe.ingredient, 1);
  if (!canAddItem(character.inventory, itemId, 1)) {
    addItem(character.inventory, recipe.ingredient, 1);
    showMessage("Your inventory is full", "warning");
    return;
  }
  emit("itemGained", { item: itemId, amount: 1 });

  const xp = { done: recipe.xp, perfect: recipe.xp + recipe.perfectBonusXp, burnt: recipe.burntXp }[result];
  emit("xpGained", { character: character, skill: "cooking", amount: xp });
  emit("foodCooked", { character, item: itemId, result });

  if (result === "perfect") {
    showMessage(`Perfect! You cook a ${ITEMS[itemId].name}`, "loot");
  } else if (result === "burnt") {
    showMessage(`You burnt the ${ITEMS[recipe.ingredient].name}`, "warning");
  } else {
    logMessage(`You cook a ${ITEMS[itemId].name}`, "loot");
  }
}

// Die Zeilen fürs Rezept-Fenster: Ergebnis, was man braucht, ob man es gerade kochen kann.
function getRows(character) {
  return Object.entries(COOKING.recipes).map(([id, recipe]) => ({
    id: id,
    name: ITEMS[recipe.result].name,
    needs: `Needs ${ITEMS[recipe.ingredient].name}`,
    color: ITEMS[recipe.result].color,
    canMake: hasItem(character.inventory, recipe.ingredient),
  }));
}
