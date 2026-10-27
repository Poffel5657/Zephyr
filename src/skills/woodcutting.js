// Holzfällen: Baum erreicht → Axt prüfen → Timing-Mini-Spiel → Logs + XP → Stumpf → wächst nach.
// Alle Werte pro Baum stehen in skills.json unter woodcutting.trees.
import SKILL_DATA from "../data/skills.json";
import { emit, on } from "../core/eventBus.js";
import { addUpdate } from "../core/loop.js";
import { getLevel } from "./skills.js";
import { isInside, getTile } from "../world/grid.js";
import { canAddItem, hasToolFor } from "../inventory/inventory.js";
import { startTimingBar, stopTimingBar } from "../ui/timingBar.js";
import { showMessage } from "../ui/messages.js";

const TREES = SKILL_DATA.skills.woodcutting.trees;

// Gefällte Bäume: "x,z" → { x, z, timeLeft } (Sekunden bis zum Nachwachsen)
const felledTrees = new Map();
// Der Baum, der gerade gefällt wird (null = gerade nicht)
let currentTree = null;
// Im Kampf ist die Welt eingefroren: Bäume wachsen nicht nach
let worldFrozen = false;

// Meldet das Holzfällen für diesen Charakter an.
export function setupWoodcutting(character) {
  on("objectReached", (data) => {
    const tree = TREES[data.object];
    if (data.character !== character || tree === undefined) {
      return;
    }

    if (felledTrees.has(treeKey(data.x, data.z))) {
      showMessage("This tree has been cut down");
      return;
    }
    if (!hasToolFor(character.inventory, "woodcutting")) {
      showMessage("You need an axe to chop this tree");
      return;
    }
    if (!canAddItem(character.inventory, tree.log, 1)) {
      showMessage("Your inventory is full", "warning");
      return;
    }

    // Mit höherem Level wird der grüne Bereich breiter, also das Mini-Spiel leichter
    const level = getLevel(character.skills.woodcutting);
    const zoneSize = Math.min(tree.maxZoneSize, tree.zoneSize + tree.zonePerLevel * (level - 1));
    currentTree = { x: data.x, z: data.z, tree: tree };
    startTimingBar({ zoneSize: zoneSize, speed: tree.speed });
  });

  on("timingResult", ({ hit }) => {
    if (currentTree === null) {
      return;
    }

    const { x, z, tree } = currentTree;
    currentTree = null;

    // Bonus-Log getrennt, damit der Grund-Log nicht verloren geht, wenn der Bonus nicht mehr reinpasst
    emit("itemGained", { item: tree.log, amount: 1 });
    if (hit) {
      emit("itemGained", { item: tree.log, amount: tree.bonusLogs });
    }
    emit("xpGained", { character: character, skill: "woodcutting", amount: tree.xp + (hit ? tree.bonusXp : 0) });

    felledTrees.set(treeKey(x, z), { x: x, z: z, timeLeft: tree.respawnSeconds });
    emit("treeFelled", { x, z });
  });

  on("actionCancelled", (data) => {
    if (data.character === character && currentTree !== null) {
      stopTimingBar();
      currentTree = null;
    }
  });

  on("combatStarted", () => (worldFrozen = true));
  on("combatEnded", () => (worldFrozen = false));
  addUpdate(updateFelledTrees);
}

// Gibt die gefällten Bäume mit Restzeit zurück (für den Spielstand).
export function getFelledTrees() {
  return [...felledTrees.values()].map(({ x, z, timeLeft }) => ({ x, z, timeLeft }));
}

// Macht diese Bäume wieder zu Stümpfen mit Restzeit (beim Laden; erst nach buildIsland aufrufen).
// Einträge, auf deren Feld kein Baum mehr steht (z. B. Karte geändert), werden übersprungen.
export function setFelledTrees(list) {
  for (const { x, z, timeLeft } of list) {
    if (!isInside(x, z) || TREES[getTile(x, z).object] === undefined || !(timeLeft > 0)) {
      continue;
    }
    felledTrees.set(treeKey(x, z), { x, z, timeLeft });
    emit("treeFelled", { x, z });
  }
}

// Zählt bei gefällten Bäumen die Zeit herunter und lässt sie nachwachsen.
function updateFelledTrees(deltaTime) {
  if (worldFrozen) {
    return;
  }
  for (const [key, felled] of felledTrees) {
    felled.timeLeft -= deltaTime;
    if (felled.timeLeft <= 0) {
      felledTrees.delete(key);
      emit("treeGrown", { x: felled.x, z: felled.z });
    }
  }
}

// Macht aus x / z einen Schlüssel für die Map.
function treeKey(x, z) {
  return x + "," + z;
}
