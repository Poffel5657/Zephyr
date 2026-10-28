// Bergbau: Fels erreicht → Spitzhacke prüfen → Mini-Spiel „Schwachstellen“ → Erz + XP. Nach ein paar Erzen ist der Fels
// abgebaut und kommt nach einer Weile wieder. Alle Werte pro Fels stehen in skills.json unter mining.rocks.
// Eine bessere Spitzhacke ("toolBonus" in items.json) lässt die Risse länger leuchten, genau wie ein höheres Level.
import SKILL_DATA from "../data/skills.json";
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { getLevel } from "./skills.js";
import { isInside, getTile } from "../world/grid.js";
import { canAddItem, getSlots, hasToolFor } from "../inventory/inventory.js";
import { startMiningGame, stopMiningGame } from "../ui/miningGame.js";
import { showMessage } from "../ui/messages.js";
import { logMessage } from "../ui/chatLog.js";

const ROCKS = SKILL_DATA.skills.mining.rocks;

// Übrige Erze pro Fels: "x,z" → Anzahl (fehlt = noch voll)
const oresLeft = new Map();
// Abgebaute Felsen: "x,z" → { x, z, timeLeft } (Sekunden bis sie wieder da sind)
const depletedRocks = new Map();
// Der Fels, an dem gerade gearbeitet wird (null = gerade nicht)
let currentRock = null;
// Im Kampf ist die Welt eingefroren: Felsen kommen nicht wieder
let worldFrozen = false;

// Meldet den Bergbau für diesen Charakter an.
export function setupMining(character) {
  on("objectReached", (data) => {
    const rock = ROCKS[data.object];
    if (data.character !== character || rock === undefined) {
      return;
    }

    if (depletedRocks.has(rockKey(data.x, data.z))) {
      showMessage("There is no ore left in this rock");
      return;
    }
    if (!hasToolFor(character.inventory, "mining")) {
      showMessage("You need a pickaxe to mine this rock");
      return;
    }
    if (!canAddItem(character.inventory, rock.ore, 1)) {
      showMessage("Your inventory is full", "warning");
      return;
    }

    const level = getLevel(character.skills.mining);
    const crackSeconds = Math.min(rock.maxCrackSeconds, rock.crackSeconds + rock.crackPerLevel * (level - 1)) + getToolBonus(character);
    currentRock = { x: data.x, z: data.z, rock: rock };
    startMiningGame({ cracks: rock.cracks, crackSeconds: crackSeconds, crackSize: rock.crackSize, maxMistakes: rock.maxMistakes });
  });

  on("miningResult", ({ mined }) => {
    if (currentRock === null) {
      return;
    }
    const { x, z, rock } = currentRock;
    currentRock = null;
    if (!mined) {
      showMessage("The rock holds, try again");
      return;
    }

    emit("itemGained", { item: rock.ore, amount: 1 });
    emit("xpGained", { character: character, skill: "mining", amount: rock.xp });
    emit("oreMined", { character, x, z, item: rock.ore });
    logMessage(`You mine some ${ITEMS[rock.ore].name}`, "loot");

    const key = rockKey(x, z);
    const left = (oresLeft.get(key) ?? rock.ores) - 1;
    if (left > 0) {
      oresLeft.set(key, left);
      return;
    }
    oresLeft.delete(key);
    depletedRocks.set(key, { x: x, z: z, timeLeft: rock.respawnSeconds });
    emit("rockDepleted", { x, z });
  });

  on("actionCancelled", (data) => {
    if (data.character === character && currentRock !== null) {
      stopMiningGame();
      currentRock = null;
    }
  });

  on("combatStarted", () => (worldFrozen = true));
  on("combatEnded", () => (worldFrozen = false));
  addUpdate(updateDepletedRocks);
}

// Gibt die abgebauten Felsen mit Restzeit zurück (für den Spielstand).
export function getDepletedRocks() {
  return [...depletedRocks.values()].map(({ x, z, timeLeft }) => ({ x, z, timeLeft }));
}

// Macht diese Felsen wieder abgebaut (beim Laden; erst nach buildIsland aufrufen).
// Einträge, auf deren Feld kein Fels mehr ist (z. B. Karte geändert), werden übersprungen.
export function setDepletedRocks(list) {
  for (const { x, z, timeLeft } of list) {
    if (!isInside(x, z) || ROCKS[getTile(x, z)?.object] === undefined || !(timeLeft > 0)) {
      continue;
    }
    depletedRocks.set(rockKey(x, z), { x, z, timeLeft });
    emit("rockDepleted", { x, z });
  }
}

// Bonus der besten Spitzhacke im Inventar (Sekunden, die ein Riss länger leuchtet).
function getToolBonus(character) {
  let best = 0;
  for (const slot of getSlots(character.inventory)) {
    const item = slot === null ? null : ITEMS[slot.item];
    if (item?.skill === "mining" && item.tags.includes("tool")) {
      best = Math.max(best, item.toolBonus ?? 0);
    }
  }
  return best;
}

// Zählt bei abgebauten Felsen die Zeit herunter.
function updateDepletedRocks(deltaTime) {
  if (worldFrozen) {
    return;
  }
  for (const [key, depleted] of depletedRocks) {
    depleted.timeLeft -= deltaTime;
    if (depleted.timeLeft <= 0) {
      depletedRocks.delete(key);
      emit("rockRestored", { x: depleted.x, z: depleted.z });
    }
  }
}

// Macht aus x / z einen Schlüssel für die Map.
function rockKey(x, z) {
  return x + "," + z;
}
