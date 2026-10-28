// Angeln: Angelstelle erreicht → Angel prüfen → Mini-Spiel → Fisch + XP. Nach ein paar Fängen ist die Stelle
// erschöpft und erholt sich nach einer Weile. Alle Werte pro Angelstelle stehen in skills.json unter fishing.spots.
import SKILL_DATA from "../data/skills.json";
import ITEMS from "../data/items.json";
import { emit, on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { getLevel } from "./skills.js";
import { isInside, getTile } from "../world/grid.js";
import { canAddItem, hasToolFor } from "../inventory/inventory.js";
import { startFishingGame, stopFishingGame } from "../ui/fishingGame.js";
import { showMessage } from "../ui/messages.js";
import { logMessage } from "../ui/chatLog.js";

const SPOTS = SKILL_DATA.skills.fishing.spots;

const FAIL_MESSAGES = {
  scared: "You moved the line and scared the fish away",
  late: "Too slow, the fish took the bait",
  escaped: "The fish got away",
  cancelled: "You stop fishing",
};

// Übrige Fänge pro Angelstelle: "x,z" → Anzahl (fehlt = noch voll)
const catchesLeft = new Map();
// Erschöpfte Angelstellen: "x,z" → { x, z, timeLeft } (Sekunden bis sie sich erholt haben)
const depletedSpots = new Map();
// Die Angelstelle, an der gerade geangelt wird (null = gerade nicht)
let currentSpot = null;
// Im Kampf ist die Welt eingefroren: Angelstellen erholen sich nicht
let worldFrozen = false;

// Meldet das Angeln für diesen Charakter an.
export function setupFishing(character) {
  on("objectReached", (data) => {
    const spot = SPOTS[data.object];
    if (data.character !== character || spot === undefined) {
      return;
    }

    const key = spotKey(data.x, data.z);
    if (depletedSpots.has(key)) {
      showMessage("No fish are biting here right now");
      return;
    }
    if (!hasToolFor(character.inventory, "fishing")) {
      showMessage("You need a fishing pole to fish here");
      return;
    }
    if (!canAddItem(character.inventory, spot.fish, 1)) {
      showMessage("Your inventory is full", "warning");
      return;
    }

    // Mit höherem Level kostet jeder Zug den Fisch mehr Ausdauer, er gibt also schneller auf
    const level = getLevel(character.skills.fishing);
    const pullPower = Math.min(spot.maxPullPower, spot.pullPower + spot.pullPerLevel * (level - 1));
    currentSpot = { x: data.x, z: data.z, spot: spot };
    startFishingGame(data.x, data.z, { ...spot, pullPower: pullPower }, character.mesh.position);
  });

  on("fishingResult", ({ caught, reason }) => {
    if (currentSpot === null) {
      return;
    }

    const { x, z, spot } = currentSpot;
    currentSpot = null;
    if (!caught) {
      showMessage(FAIL_MESSAGES[reason]);
      return;
    }

    emit("itemGained", { item: spot.fish, amount: 1 });
    emit("xpGained", { character: character, skill: "fishing", amount: spot.xp });
    emit("fishCaught", { character, x, z, item: spot.fish });
    logMessage(`You catch a ${ITEMS[spot.fish].name}`, "loot");

    const key = spotKey(x, z);
    const left = (catchesLeft.get(key) ?? spot.catches) - 1;
    if (left > 0) {
      catchesLeft.set(key, left);
      return;
    }
    catchesLeft.delete(key);
    depletedSpots.set(key, { x: x, z: z, timeLeft: spot.respawnSeconds });
    emit("fishingSpotDepleted", { x, z });
  });

  on("actionCancelled", (data) => {
    if (data.character === character && currentSpot !== null) {
      stopFishingGame();
      currentSpot = null;
    }
  });

  on("combatStarted", () => (worldFrozen = true));
  on("combatEnded", () => (worldFrozen = false));
  addUpdate(updateDepletedSpots);
}

// Gibt die erschöpften Angelstellen mit Restzeit zurück (für den Spielstand).
export function getDepletedSpots() {
  return [...depletedSpots.values()].map(({ x, z, timeLeft }) => ({ x, z, timeLeft }));
}

// Macht diese Angelstellen wieder erschöpft (beim Laden; erst nach buildIsland aufrufen).
// Einträge, auf deren Feld keine Angelstelle mehr ist (z. B. Karte geändert), werden übersprungen.
export function setDepletedSpots(list) {
  for (const { x, z, timeLeft } of list) {
    if (!isInside(x, z) || SPOTS[getTile(x, z)?.object] === undefined || !(timeLeft > 0)) {
      continue;
    }
    depletedSpots.set(spotKey(x, z), { x, z, timeLeft });
    emit("fishingSpotDepleted", { x, z });
  }
}

// Zählt bei erschöpften Angelstellen die Zeit herunter.
function updateDepletedSpots(deltaTime) {
  if (worldFrozen) {
    return;
  }
  for (const [key, depleted] of depletedSpots) {
    depleted.timeLeft -= deltaTime;
    if (depleted.timeLeft <= 0) {
      depletedSpots.delete(key);
      emit("fishingSpotRestored", { x: depleted.x, z: depleted.z });
    }
  }
}

// Macht aus x / z einen Schlüssel für die Map.
function spotKey(x, z) {
  return x + "," + z;
}
